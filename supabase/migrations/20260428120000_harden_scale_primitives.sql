create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  request_count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint rate_limit_buckets_count_nonnegative check (request_count >= 0)
);

comment on table public.rate_limit_buckets is
  'Durable rate-limit buckets used by public and provider-sensitive routes across Vercel instances.';

drop function if exists public.consume_rate_limit_bucket(text, integer, integer);

create or replace function public.consume_rate_limit_bucket(
  p_bucket_key text,
  p_max_requests integer,
  p_window_ms integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket public.rate_limit_buckets%rowtype;
  now_at timestamptz := now();
  next_reset timestamptz := now() + (greatest(p_window_ms, 1000)::text || ' milliseconds')::interval;
begin
  if p_bucket_key is null or length(trim(p_bucket_key)) = 0 then
    raise exception 'bucket_key is required';
  end if;

  if p_max_requests <= 0 then
    raise exception 'max_requests must be positive';
  end if;

  insert into public.rate_limit_buckets (bucket_key, request_count, reset_at)
  values (p_bucket_key, 0, next_reset)
  on conflict (bucket_key) do nothing;

  select *
  into bucket
  from public.rate_limit_buckets
  where rate_limit_buckets.bucket_key = p_bucket_key
  for update;

  if bucket.reset_at <= now_at then
    update public.rate_limit_buckets
    set request_count = 1,
        reset_at = next_reset,
        updated_at = now_at
    where rate_limit_buckets.bucket_key = p_bucket_key;

    allowed := true;
    remaining := greatest(p_max_requests - 1, 0);
    reset_at := next_reset;
    return next;
    return;
  end if;

  if bucket.request_count >= p_max_requests then
    allowed := false;
    remaining := 0;
    reset_at := bucket.reset_at;
    return next;
    return;
  end if;

  update public.rate_limit_buckets
  set request_count = bucket.request_count + 1,
      updated_at = now_at
  where rate_limit_buckets.bucket_key = p_bucket_key;

  allowed := true;
  remaining := greatest(p_max_requests - bucket.request_count - 1, 0);
  reset_at := bucket.reset_at;
  return next;
end;
$$;

alter table public.provider_usage_limits
  drop constraint if exists provider_usage_limits_scope_unique;

create unique index if not exists provider_usage_limits_scope_unique_idx
  on public.provider_usage_limits (
    user_id,
    coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider,
    operation,
    usage_date
  );

create table if not exists public.provider_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid null references public.campaign_plans (id) on delete cascade,
  provider text not null,
  operation text not null,
  idempotency_key text null,
  usage_date date not null default current_date,
  estimated_cost numeric(12, 4) null,
  actual_cost numeric(12, 4) null,
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released', 'failed')),
  metadata jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.provider_usage_events is
  'Per-operation provider budget ledger for cost backpressure, idempotency, and operator audit.';

create unique index if not exists provider_usage_events_idempotency_unique
  on public.provider_usage_events (idempotency_key)
  where idempotency_key is not null;

create index if not exists provider_usage_events_scope_idx
  on public.provider_usage_events (organization_id, user_id, campaign_id, provider, operation, usage_date, status);

drop function if exists public.reserve_provider_usage(uuid, uuid, uuid, text, text, integer, text, numeric);

create or replace function public.reserve_provider_usage(
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_provider text,
  p_operation text,
  p_limit_count integer,
  p_idempotency_key text default null,
  p_estimated_cost numeric default null
)
returns table (
  allowed boolean,
  current_count integer,
  next_count integer,
  limit_count integer,
  usage_id uuid,
  event_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := current_date;
  usage_row public.provider_usage_limits%rowtype;
  existing_event public.provider_usage_events%rowtype;
  new_event public.provider_usage_events%rowtype;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_limit_count <= 0 then
    raise exception 'p_limit_count must be positive';
  end if;

  if p_idempotency_key is not null then
    select *
    into existing_event
    from public.provider_usage_events
    where idempotency_key = p_idempotency_key;

    if existing_event.id is not null then
      select *
      into usage_row
      from public.provider_usage_limits
      where user_id = existing_event.user_id
        and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
            coalesce(existing_event.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and provider = existing_event.provider
        and operation = existing_event.operation
        and usage_date = existing_event.usage_date;

      allowed := true;
      current_count := greatest(coalesce(usage_row.usage_count, 1) - 1, 0);
      next_count := coalesce(usage_row.usage_count, 1);
      limit_count := coalesce(usage_row.limit_count, p_limit_count);
      usage_id := usage_row.id;
      event_id := existing_event.id;
      return next;
      return;
    end if;
  end if;

  begin
    insert into public.provider_usage_limits (
      organization_id,
      user_id,
      campaign_id,
      provider,
      operation,
      usage_date,
      usage_count,
      limit_count
    )
    values (
      p_organization_id,
      p_user_id,
      p_campaign_id,
      p_provider,
      p_operation,
      today,
      0,
      p_limit_count
    );
  exception when unique_violation then
    update public.provider_usage_limits
    set limit_count = p_limit_count,
        updated_at = now()
    where user_id = p_user_id
      and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
          coalesce(p_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and provider = p_provider
      and operation = p_operation
      and usage_date = today;
  end;

  select *
  into usage_row
  from public.provider_usage_limits
  where user_id = p_user_id
    and coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) =
        coalesce(p_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and provider = p_provider
    and operation = p_operation
    and usage_date = today
  for update;

  if usage_row.usage_count >= p_limit_count then
    allowed := false;
    current_count := usage_row.usage_count;
    next_count := usage_row.usage_count;
    limit_count := p_limit_count;
    usage_id := usage_row.id;
    event_id := null;
    return next;
    return;
  end if;

  update public.provider_usage_limits
  set usage_count = usage_row.usage_count + 1,
      limit_count = p_limit_count,
      updated_at = now()
  where id = usage_row.id;

  insert into public.provider_usage_events (
    organization_id,
    user_id,
    campaign_id,
    provider,
    operation,
    idempotency_key,
    usage_date,
    estimated_cost,
    status
  )
  values (
    p_organization_id,
    p_user_id,
    p_campaign_id,
    p_provider,
    p_operation,
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    today,
    p_estimated_cost,
    'reserved'
  )
  returning * into new_event;

  allowed := true;
  current_count := usage_row.usage_count;
  next_count := usage_row.usage_count + 1;
  limit_count := p_limit_count;
  usage_id := usage_row.id;
  event_id := new_event.id;
  return next;
end;
$$;

alter table public.system_jobs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 2,
  add column if not exists dead_letter_reason text null;

create index if not exists system_jobs_org_status_kind_idx
  on public.system_jobs (organization_id, status, kind, created_at);

create index if not exists system_jobs_campaign_status_idx
  on public.system_jobs (campaign_id, status, created_at)
  where campaign_id is not null;

drop function if exists public.claim_next_system_job(text, integer);

create or replace function public.claim_next_system_job(
  p_worker_id text,
  p_lease_ms integer default 300000
)
returns setof public.system_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'p_worker_id is required';
  end if;

  with candidate as (
    select id
    from public.system_jobs
    where (
        status = 'pending'
        or (
          status = 'processing'
          and locked_until is not null
          and locked_until <= now()
        )
      )
      and (next_run_at is null or next_run_at <= now())
      and dead_lettered_at is null
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.system_jobs
  set status = 'processing',
      locked_by = p_worker_id,
      locked_until = now() + (greatest(p_lease_ms, 1000)::text || ' milliseconds')::interval,
      started_at = coalesce(started_at, now()),
      completed_at = null,
      error_message = null,
      attempt_count = attempt_count + 1
  where id in (select id from candidate)
  returning id into claimed_id;

  if claimed_id is null then
    return;
  end if;

  return query
  select *
  from public.system_jobs
  where id = claimed_id;
end;
$$;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260428120000')
on conflict (key) do update
set value = excluded.value;
