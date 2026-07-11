alter table public.system_jobs
  add column if not exists lease_token uuid null,
  add column if not exists lease_generation bigint not null default 0,
  add column if not exists lease_heartbeat_at timestamptz null;

create index if not exists system_jobs_active_lease_idx
  on public.system_jobs (status, locked_until, lease_generation)
  where status = 'processing';

-- Remove the old signature entirely. An old application instance therefore
-- fails before it can claim work without understanding the v2 lease protocol.
drop function if exists public.claim_next_system_job(text, integer);

create or replace function public.claim_next_system_job_v2(
  p_worker_id text,
  p_lease_ms integer,
  p_protocol_version integer
)
returns setof public.system_jobs
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  claimed_id uuid;
begin
  if p_protocol_version is distinct from 2 then
    raise exception using
      errcode = '22023',
      message = 'system_job_claim_protocol_unsupported';
  end if;

  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'p_worker_id is required';
  end if;

  update public.system_jobs
  set status = 'failed',
      dead_lettered_at = coalesce(dead_lettered_at, now()),
      dead_letter_reason = coalesce(dead_letter_reason, 'Maximum job attempts reached before claim.'),
      locked_by = null,
      locked_until = null,
      lease_token = null,
      lease_heartbeat_at = null,
      completed_at = coalesce(completed_at, now()),
      error_message = coalesce(error_message, 'Maximum job attempts reached before claim.')
  where dead_lettered_at is null
    and status in ('pending', 'processing')
    and kind in (
      'static_creative_generation',
      'video_generation',
      'video_generation_status',
      'lead_capture_retry',
      'lead_side_effects'
    )
    and attempt_count >= max_attempts
    and (
      status = 'pending'
      or locked_until is null
      or locked_until <= now()
    );

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
      and attempt_count < max_attempts
      and kind in (
        'static_creative_generation',
        'video_generation',
        'video_generation_status',
        'lead_capture_retry',
        'lead_side_effects'
      )
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.system_jobs
  set status = 'processing',
      locked_by = p_worker_id,
      locked_until = now() +
        (least(greatest(p_lease_ms, 1000), 3600000)::text || ' milliseconds')::interval,
      lease_token = gen_random_uuid(),
      lease_generation = lease_generation + 1,
      lease_heartbeat_at = now(),
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

create or replace function public.renew_system_job_lease(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_lease_ms integer default 300000
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  renewed_count integer;
begin
  update public.system_jobs
  set locked_until = now() +
        (least(greatest(p_lease_ms, 1000), 3600000)::text || ' milliseconds')::interval,
      lease_heartbeat_at = now()
  where id = p_job_id
    and status = 'processing'
    and locked_by = p_worker_id
    and lease_token = p_lease_token
    and lease_generation = p_lease_generation
    and locked_until > now();

  get diagnostics renewed_count = row_count;
  return renewed_count = 1;
end;
$$;

revoke execute on function public.claim_next_system_job_v2(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_next_system_job_v2(text, integer, integer)
  to service_role;
revoke execute on function public.renew_system_job_lease(uuid, text, uuid, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.renew_system_job_lease(uuid, text, uuid, bigint, integer)
  to service_role;

comment on column public.system_jobs.lease_token is
  'Unpredictable per-claim fencing token. Terminal state writes must match this token.';
comment on column public.system_jobs.lease_generation is
  'Monotonic claim generation used with lease_token to fence superseded workers.';
comment on column public.system_jobs.lease_heartbeat_at is
  'Most recent successful renewable lease heartbeat.';
comment on function public.claim_next_system_job_v2(text, integer, integer) is
  'Claims a job with an unpredictable token, monotonic generation, bounded lease, and an explicit protocol-version fence.';
comment on function public.renew_system_job_lease(uuid, text, uuid, bigint, integer) is
  'Renews only a live lease with matching worker, token, and generation; expired leases cannot be revived.';

create table if not exists public.system_job_effects (
  id uuid primary key default gen_random_uuid(),
  system_job_id uuid not null references public.system_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  effect_key text not null,
  status text not null default 'pending',
  required boolean not null default true,
  correlation_id text not null,
  idempotency_key text not null,
  execution_token text not null,
  claim_worker_id text null,
  parent_lease_token uuid null,
  claim_expires_at timestamptz null,
  lease_generation bigint not null,
  attempt_count integer not null default 0,
  result jsonb null,
  retryable boolean not null default false,
  error_code text null,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_job_effects_key_check
    check (effect_key in ('agent_notification', 'meta_conversion')),
  constraint system_job_effects_status_check
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'operator_required')),
  constraint system_job_effects_attempt_count_check
    check (attempt_count >= 0),
  constraint system_job_effects_lease_generation_check
    check (lease_generation > 0),
  constraint system_job_effects_job_effect_unique
    unique (system_job_id, effect_key),
  constraint system_job_effects_idempotency_unique
    unique (idempotency_key)
);

alter table public.system_job_effects
  add column if not exists claim_worker_id text null,
  add column if not exists parent_lease_token uuid null,
  add column if not exists claim_expires_at timestamptz null;

alter table public.system_job_effects
  drop constraint if exists system_job_effects_status_check,
  add constraint system_job_effects_status_check
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'operator_required'));

update public.system_job_effects
set status = 'operator_required',
    retryable = false,
    error_code = coalesce(error_code, 'provider_effect_outcome_uncertain'),
    error_message = coalesce(
      error_message,
      'Legacy in-flight effect has no parent lease claim identity and requires reconciliation.'
    ),
    completed_at = coalesce(completed_at, clock_timestamp()),
    updated_at = clock_timestamp()
where status = 'processing'
  and (
    claim_worker_id is null
    or length(trim(claim_worker_id)) = 0
    or parent_lease_token is null
    or claim_expires_at is null
  );

alter table public.system_job_effects
  drop constraint if exists system_job_effects_processing_claim_check,
  add constraint system_job_effects_processing_claim_check check (
    status <> 'processing'
    or (
      claim_worker_id is not null
      and length(trim(claim_worker_id)) > 0
      and parent_lease_token is not null
      and claim_expires_at is not null
    )
  );

create unique index if not exists system_jobs_id_organization_unique
  on public.system_jobs (id, organization_id);

alter table public.system_job_effects
  drop constraint if exists system_job_effects_job_tenant_fk,
  add constraint system_job_effects_job_tenant_fk
    foreign key (system_job_id, organization_id)
    references public.system_jobs (id, organization_id)
    on delete cascade,
  drop constraint if exists system_job_effects_lead_tenant_fk,
  add constraint system_job_effects_lead_tenant_fk
    foreign key (lead_id, organization_id)
    references public.leads (id, organization_id)
    on delete cascade;

create index if not exists system_job_effects_lead_status_idx
  on public.system_job_effects (organization_id, lead_id, status, created_at desc);
create index if not exists system_job_effects_retryable_idx
  on public.system_job_effects (status, retryable, updated_at)
  where status = 'failed';

comment on table public.system_job_effects is
  'Durable per-child truth for required lead side effects; successful children are not replayed.';

alter table public.system_job_effects enable row level security;
alter table public.system_job_effects force row level security;
revoke all on table public.system_job_effects from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.system_job_effects from service_role;
grant select on table public.system_job_effects to service_role;

create or replace function public.claim_lead_system_job_effect(
  p_system_job_id uuid,
  p_organization_id uuid,
  p_lead_id uuid,
  p_effect_key text,
  p_required boolean,
  p_correlation_id text,
  p_worker_id text,
  p_parent_lease_token uuid,
  p_parent_lease_generation bigint
)
returns table (
  effect_id uuid,
  claim_disposition text,
  execution_token text,
  attempt_count integer,
  status text,
  result jsonb,
  retryable boolean,
  error_code text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  parent_record public.system_jobs%rowtype;
  effect_record public.system_job_effects%rowtype;
  claimed_at timestamptz := clock_timestamp();
begin
  if p_system_job_id is null
    or p_organization_id is null
    or p_lead_id is null
    or p_effect_key is null
    or p_effect_key not in ('agent_notification', 'meta_conversion')
    or p_required is null
    or p_correlation_id is null
    or length(trim(p_correlation_id)) = 0
    or p_worker_id is null
    or length(trim(p_worker_id)) = 0
    or p_parent_lease_token is null
    or p_parent_lease_generation is null
    or p_parent_lease_generation <= 0 then
    raise exception using
      errcode = '22023',
      message = 'invalid_lead_system_job_effect_claim';
  end if;

  select parent_job.*
  into parent_record
  from public.system_jobs parent_job
  where parent_job.id = p_system_job_id
  for update;

  if not found
    or parent_record.kind <> 'lead_side_effects'
    or parent_record.organization_id <> p_organization_id
    or parent_record.payload #>> '{lead,id}' is distinct from p_lead_id::text
    or parent_record.payload #>> '{lead,organization_id}' is distinct from p_organization_id::text
    or parent_record.payload ->> 'requestId' is distinct from p_correlation_id
    or parent_record.status <> 'processing'
    or parent_record.locked_by is distinct from p_worker_id
    or parent_record.lease_token is distinct from p_parent_lease_token
    or parent_record.lease_generation <> p_parent_lease_generation
    or parent_record.locked_until is null
    or parent_record.locked_until <= claimed_at then
    raise exception using
      errcode = 'P0001',
      message = 'system_job_effect_parent_lease_not_owned';
  end if;

  perform 1
  from public.leads lead_record
  where lead_record.id = p_lead_id
    and lead_record.organization_id = p_organization_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'system_job_effect_lead_tenant_scope_mismatch';
  end if;

  select child_effect.*
  into effect_record
  from public.system_job_effects child_effect
  where child_effect.system_job_id = p_system_job_id
    and child_effect.effect_key = p_effect_key
  for update;

  if not found then
    insert into public.system_job_effects (
      system_job_id,
      organization_id,
      lead_id,
      effect_key,
      status,
      required,
      correlation_id,
      idempotency_key,
      execution_token,
      claim_worker_id,
      parent_lease_token,
      claim_expires_at,
      lease_generation,
      attempt_count,
      result,
      retryable,
      error_code,
      error_message,
      started_at,
      completed_at,
      updated_at
    ) values (
      p_system_job_id,
      p_organization_id,
      p_lead_id,
      p_effect_key,
      'processing',
      p_required,
      p_correlation_id,
      'lead_side_effect:' || p_lead_id::text || ':' || p_effect_key,
      gen_random_uuid()::text,
      p_worker_id,
      p_parent_lease_token,
      parent_record.locked_until,
      p_parent_lease_generation,
      1,
      null,
      false,
      null,
      null,
      claimed_at,
      null,
      claimed_at
    )
    returning * into effect_record;

    return query select
      effect_record.id,
      'claimed'::text,
      effect_record.execution_token,
      effect_record.attempt_count,
      effect_record.status,
      effect_record.result,
      effect_record.retryable,
      effect_record.error_code;
    return;
  end if;

  if effect_record.organization_id <> p_organization_id
    or effect_record.lead_id <> p_lead_id then
    raise exception using
      errcode = '23503',
      message = 'system_job_effect_existing_tenant_scope_mismatch';
  end if;

  if effect_record.lease_generation > p_parent_lease_generation then
    raise exception using
      errcode = 'P0001',
      message = 'system_job_effect_newer_generation_exists';
  end if;

  if effect_record.status = 'succeeded' then
    return query select
      effect_record.id,
      'reused_succeeded'::text,
      effect_record.execution_token,
      effect_record.attempt_count,
      effect_record.status,
      effect_record.result,
      false,
      null::text;
    return;
  end if;

  if effect_record.status = 'processing' then
    update public.system_job_effects child_effect
    set status = 'operator_required',
        retryable = false,
        error_code = 'provider_effect_outcome_uncertain',
        error_message =
          'A prior in-flight provider effect lost or duplicated its execution claim; reconcile before replay.',
        completed_at = coalesce(child_effect.completed_at, claimed_at),
        updated_at = claimed_at
    where child_effect.id = effect_record.id
    returning * into effect_record;

    return query select
      effect_record.id,
      'operator_required'::text,
      effect_record.execution_token,
      effect_record.attempt_count,
      effect_record.status,
      effect_record.result,
      false,
      effect_record.error_code;
    return;
  end if;

  if effect_record.status = 'operator_required'
    or (effect_record.status = 'failed' and not effect_record.retryable) then
    return query select
      effect_record.id,
      case
        when effect_record.status = 'operator_required' then 'operator_required'::text
        else 'reused_failed'::text
      end,
      effect_record.execution_token,
      effect_record.attempt_count,
      effect_record.status,
      effect_record.result,
      false,
      effect_record.error_code;
    return;
  end if;

  if effect_record.status not in ('pending', 'failed') then
    raise exception using
      errcode = 'P0001',
      message = 'system_job_effect_invalid_claim_state';
  end if;

  update public.system_job_effects child_effect
  set status = 'processing',
      required = p_required,
      correlation_id = p_correlation_id,
      execution_token = gen_random_uuid()::text,
      claim_worker_id = p_worker_id,
      parent_lease_token = p_parent_lease_token,
      claim_expires_at = parent_record.locked_until,
      lease_generation = p_parent_lease_generation,
      attempt_count = child_effect.attempt_count + 1,
      result = null,
      retryable = false,
      error_code = null,
      error_message = null,
      started_at = claimed_at,
      completed_at = null,
      updated_at = claimed_at
  where child_effect.id = effect_record.id
  returning * into effect_record;

  return query select
    effect_record.id,
    'claimed'::text,
    effect_record.execution_token,
    effect_record.attempt_count,
    effect_record.status,
    effect_record.result,
    effect_record.retryable,
    effect_record.error_code;
end;
$$;

create or replace function public.settle_lead_system_job_effect(
  p_effect_id uuid,
  p_system_job_id uuid,
  p_worker_id text,
  p_parent_lease_token uuid,
  p_parent_lease_generation bigint,
  p_execution_token text,
  p_status text,
  p_result jsonb,
  p_retryable boolean,
  p_error_code text,
  p_error_message text
)
returns setof public.system_job_effects
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  parent_record public.system_jobs%rowtype;
  effect_record public.system_job_effects%rowtype;
  settled_at timestamptz := clock_timestamp();
begin
  if p_effect_id is null
    or p_system_job_id is null
    or p_worker_id is null
    or length(trim(p_worker_id)) = 0
    or p_parent_lease_token is null
    or p_parent_lease_generation is null
    or p_parent_lease_generation <= 0
    or p_execution_token is null
    or length(trim(p_execution_token)) = 0
    or p_status is null
    or p_status not in ('succeeded', 'failed', 'operator_required')
    or p_retryable is null
    or (p_status in ('succeeded', 'operator_required') and p_retryable) then
    raise exception using
      errcode = '22023',
      message = 'invalid_lead_system_job_effect_settlement';
  end if;

  select parent_job.*
  into parent_record
  from public.system_jobs parent_job
  where parent_job.id = p_system_job_id
  for update;

  if not found
    or parent_record.kind <> 'lead_side_effects'
    or parent_record.status <> 'processing'
    or parent_record.locked_by is distinct from p_worker_id
    or parent_record.lease_token is distinct from p_parent_lease_token
    or parent_record.lease_generation <> p_parent_lease_generation
    or parent_record.locked_until is null
    or parent_record.locked_until <= settled_at then
    raise exception using
      errcode = 'P0001',
      message = 'system_job_effect_parent_lease_not_owned';
  end if;

  update public.system_job_effects child_effect
  set status = p_status,
      result = p_result,
      retryable = case when p_status = 'failed' then p_retryable else false end,
      error_code = case when p_status = 'succeeded' then null else p_error_code end,
      error_message = case when p_status = 'succeeded' then null else p_error_message end,
      completed_at = settled_at,
      updated_at = settled_at
  where child_effect.id = p_effect_id
    and child_effect.system_job_id = p_system_job_id
    and child_effect.status = 'processing'
    and child_effect.claim_worker_id = p_worker_id
    and child_effect.parent_lease_token = p_parent_lease_token
    and child_effect.lease_generation = p_parent_lease_generation
    and child_effect.execution_token = p_execution_token
  returning * into effect_record;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'system_job_effect_claim_superseded';
  end if;

  return next effect_record;
  return;
end;
$$;

revoke execute on function public.claim_lead_system_job_effect(
  uuid, uuid, uuid, text, boolean, text, text, uuid, bigint
) from public, anon, authenticated;
grant execute on function public.claim_lead_system_job_effect(
  uuid, uuid, uuid, text, boolean, text, text, uuid, bigint
) to service_role;

revoke execute on function public.settle_lead_system_job_effect(
  uuid, uuid, text, uuid, bigint, text, text, jsonb, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.settle_lead_system_job_effect(
  uuid, uuid, text, uuid, bigint, text, text, jsonb, boolean, text, text
) to service_role;

comment on function public.claim_lead_system_job_effect(
  uuid, uuid, uuid, text, boolean, text, text, uuid, bigint
) is
  'Atomically claims a lead child effect only while the exact parent system-job worker, token, generation, and unexpired lease remain current. In-flight superseded claims become operator-required rather than replaying.';
comment on function public.settle_lead_system_job_effect(
  uuid, uuid, text, uuid, bigint, text, text, jsonb, boolean, text, text
) is
  'Settles a lead child effect only while both its execution token and exact current parent system-job lease match; stale generations cannot overwrite newer truth.';

create table if not exists public.meta_data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  request_hash text not null unique,
  confirmation_code text not null unique,
  user_id_hash text not null,
  user_id_encrypted text not null,
  issued_at timestamptz null,
  freshness_status text not null,
  responsibility_status text not null default 'operator_required',
  execution_enabled boolean not null default false,
  replay_count integer not null default 0,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  operator_required_at timestamptz not null default now(),
  completed_at timestamptz null,
  resolution_note text null,
  constraint meta_data_deletion_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint meta_data_deletion_user_hash_check
    check (user_id_hash ~ '^[0-9a-f]{64}$'),
  constraint meta_data_deletion_freshness_check
    check (freshness_status in ('fresh', 'missing')),
  constraint meta_data_deletion_status_check
    check (responsibility_status in ('operator_required', 'in_progress', 'completed', 'rejected')),
  constraint meta_data_deletion_replay_count_check
    check (replay_count >= 0)
);

create index if not exists meta_data_deletion_operator_queue_idx
  on public.meta_data_deletion_requests (responsibility_status, operator_required_at)
  where responsibility_status = 'operator_required';

comment on table public.meta_data_deletion_requests is
  'Durable, default-off responsibility ledger for signed Meta deletion callbacks. No deletion is executed automatically.';
comment on column public.meta_data_deletion_requests.execution_enabled is
  'Defaults false. A separately reviewed operator workflow is required before deletion or anonymization.';

alter table public.meta_data_deletion_requests enable row level security;
alter table public.meta_data_deletion_requests force row level security;
revoke all on table public.meta_data_deletion_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.meta_data_deletion_requests to service_role;

create or replace function public.accept_meta_data_deletion_request(
  p_request_hash text,
  p_confirmation_code text,
  p_user_id_hash text,
  p_user_id_encrypted text,
  p_issued_at timestamptz,
  p_freshness_status text
)
returns table (
  id uuid,
  confirmation_code text,
  responsibility_status text,
  replayed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  was_existing boolean;
begin
  if p_request_hash !~ '^[0-9a-f]{64}$'
    or p_user_id_hash !~ '^[0-9a-f]{64}$'
    or p_confirmation_code is null
    or length(trim(p_confirmation_code)) < 16
    or p_user_id_encrypted is null
    or length(p_user_id_encrypted) < 16
    or p_freshness_status not in ('fresh', 'missing') then
    raise exception 'invalid Meta data deletion responsibility input';
  end if;

  select exists (
    select 1
    from public.meta_data_deletion_requests request_record
    where request_record.request_hash = p_request_hash
  ) into was_existing;

  insert into public.meta_data_deletion_requests (
    request_hash,
    confirmation_code,
    user_id_hash,
    user_id_encrypted,
    issued_at,
    freshness_status,
    responsibility_status,
    execution_enabled
  ) values (
    p_request_hash,
    p_confirmation_code,
    p_user_id_hash,
    p_user_id_encrypted,
    p_issued_at,
    p_freshness_status,
    'operator_required',
    false
  )
  on conflict (request_hash) do update
  set last_received_at = now(),
      replay_count = meta_data_deletion_requests.replay_count + 1;

  return query
  select
    request_record.id,
    request_record.confirmation_code,
    request_record.responsibility_status,
    was_existing
  from public.meta_data_deletion_requests request_record
  where request_record.request_hash = p_request_hash;
end;
$$;

revoke execute on function public.accept_meta_data_deletion_request(text, text, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.accept_meta_data_deletion_request(text, text, text, text, timestamptz, text)
  to service_role;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260710234500')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc'::text, now());
