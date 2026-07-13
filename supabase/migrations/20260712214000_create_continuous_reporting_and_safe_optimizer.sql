create table if not exists public.meta_reporting_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  status text not null default 'enabled' check (status in ('enabled', 'paused', 'operator_required')),
  interval_minutes integer not null default 15 check (interval_minutes between 5 and 1440),
  maximum_age_minutes integer not null default 60 check (maximum_age_minutes between 15 and 10080),
  next_sync_at timestamptz not null default timezone('utc', now()),
  last_attempt_at timestamptz null,
  last_success_at timestamptz null,
  last_snapshot_id uuid null references public.campaign_sync_snapshots(id) on delete set null,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  freshness_status text not null default 'missing' check (freshness_status in ('current', 'delayed', 'stale', 'missing')),
  stale_alerted_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint meta_reporting_schedules_campaign_tenant_fk
    foreign key (campaign_id, organization_id, user_id)
    references public.campaign_plans(id, organization_id, user_id)
    on delete cascade,
  constraint meta_reporting_schedules_campaign_unique unique (organization_id, campaign_id)
);

create index if not exists meta_reporting_schedules_due_idx
  on public.meta_reporting_schedules(status, next_sync_at)
  where status = 'enabled';

create table if not exists public.meta_reporting_alerts (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.meta_reporting_schedules(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  alert_key text not null unique,
  alert_type text not null check (alert_type in ('reporting_delayed', 'reporting_stale', 'reporting_missing', 'reporting_operator_required')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  detail jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz null
);

create index if not exists meta_reporting_alerts_open_idx
  on public.meta_reporting_alerts(organization_id, status, opened_at desc)
  where status = 'open';

create table if not exists public.optimization_campaign_controls (
  campaign_id uuid primary key references public.campaign_plans(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_version text not null default 'dealflow-realtor-optimization-v2',
  execution_enabled boolean not null default false,
  global_kill_switch boolean not null default true,
  account_kill_switch boolean not null default false,
  campaign_kill_switch boolean not null default false,
  emergency_stop boolean not null default false,
  customer_daily_budget_ceiling numeric null check (customer_daily_budget_ceiling is null or customer_daily_budget_ceiling > 0),
  last_provider_mutation_at timestamptz null,
  scale_applied_last_24h_percent numeric not null default 0 check (scale_applied_last_24h_percent between 0 and 20),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint optimization_campaign_controls_tenant_fk
    foreign key (campaign_id, organization_id, user_id)
    references public.campaign_plans(id, organization_id, user_id)
    on delete cascade
);

create table if not exists public.meta_optimization_action_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  idempotency_key text not null unique,
  policy_version text not null,
  action_type text not null check (action_type in ('pause', 'budget')),
  before_state jsonb not null,
  intended_state jsonb not null,
  provider_receipt_id text not null,
  after_state jsonb null,
  reconciled boolean not null,
  rollback_state jsonb not null default '{"required":false,"succeeded":null,"reason":null}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.prevent_meta_optimization_receipt_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Meta optimization action receipts are append-only.';
end;
$$;

drop trigger if exists meta_optimization_action_receipts_append_only
  on public.meta_optimization_action_receipts;
create trigger meta_optimization_action_receipts_append_only
  before update or delete on public.meta_optimization_action_receipts
  for each row execute function public.prevent_meta_optimization_receipt_mutation();

alter table public.meta_reporting_schedules enable row level security;
alter table public.meta_reporting_schedules force row level security;
alter table public.meta_reporting_alerts enable row level security;
alter table public.meta_reporting_alerts force row level security;
alter table public.optimization_campaign_controls enable row level security;
alter table public.optimization_campaign_controls force row level security;
alter table public.meta_optimization_action_receipts enable row level security;
alter table public.meta_optimization_action_receipts force row level security;

create policy meta_reporting_schedules_member_select on public.meta_reporting_schedules
  for select to authenticated using (private.is_current_user_org_member(organization_id));
create policy meta_reporting_alerts_member_select on public.meta_reporting_alerts
  for select to authenticated using (private.is_current_user_org_member(organization_id));
create policy optimization_campaign_controls_member_select on public.optimization_campaign_controls
  for select to authenticated using (private.is_current_user_org_member(organization_id));
create policy meta_optimization_action_receipts_member_select on public.meta_optimization_action_receipts
  for select to authenticated using (private.is_current_user_org_member(organization_id));

revoke insert, update, delete, truncate on public.meta_reporting_schedules from anon, authenticated;
revoke insert, update, delete, truncate on public.meta_reporting_alerts from anon, authenticated;
revoke insert, update, delete, truncate on public.optimization_campaign_controls from anon, authenticated;
revoke insert, update, delete, truncate on public.meta_optimization_action_receipts from anon, authenticated;

create or replace function public.enqueue_due_meta_reporting_sync_jobs(p_limit integer default 25)
returns table(enqueued_count integer, enqueued_job_ids uuid[])
language plpgsql security definer set search_path = pg_catalog as $$
declare
  schedule public.meta_reporting_schedules%rowtype;
  inserted_job_id uuid;
  ids uuid[] := '{}'::uuid[];
  count_value integer := 0;
  run_key text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid_limit'; end if;

  insert into public.meta_reporting_schedules(organization_id, user_id, campaign_id)
  select distinct launch.organization_id, launch.user_id, launch.campaign_id
  from public.campaign_launch_records launch
  where launch.campaign_id is not null
    and launch.result_status = 'success'
    and launch.meta_campaign_id is not null
  on conflict (organization_id, campaign_id) do nothing;

  insert into public.optimization_campaign_controls(campaign_id, organization_id, user_id)
  select seeded_schedule.campaign_id, seeded_schedule.organization_id, seeded_schedule.user_id
  from public.meta_reporting_schedules seeded_schedule
  on conflict (campaign_id) do nothing;

  for schedule in
    select * from public.meta_reporting_schedules candidate
    where candidate.status = 'enabled' and candidate.next_sync_at <= timezone('utc', now())
    order by candidate.next_sync_at asc
    for update skip locked limit p_limit
  loop
    if exists (
      select 1 from public.system_jobs active_job
      where active_job.kind = 'meta_reporting_sync'
        and active_job.organization_id = schedule.organization_id
        and active_job.campaign_id = schedule.campaign_id
        and active_job.status in ('pending', 'processing')
        and active_job.dead_lettered_at is null
    ) then
      update public.meta_reporting_schedules
      set next_sync_at = timezone('utc', now()) + make_interval(mins => schedule.interval_minutes),
          updated_at = timezone('utc', now())
      where id = schedule.id;
      continue;
    end if;
    run_key := 'meta_reporting:' || schedule.id::text || ':' || extract(epoch from schedule.next_sync_at)::bigint::text;
    insert into public.system_jobs(
      organization_id, user_id, campaign_id, kind, status, payload,
      idempotency_key, max_attempts, next_run_at
    ) values (
      schedule.organization_id, schedule.user_id, schedule.campaign_id,
      'meta_reporting_sync', 'pending',
      jsonb_build_object('source', 'continuous_reporting_scheduler', 'reportingScheduleId', schedule.id, 'reportingRunKey', run_key),
      run_key, 5, timezone('utc', now())
    ) on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into inserted_job_id;

    update public.meta_reporting_schedules
    set next_sync_at = timezone('utc', now()) + make_interval(mins => schedule.interval_minutes),
        updated_at = timezone('utc', now())
    where id = schedule.id;

    if inserted_job_id is not null then
      ids := array_append(ids, inserted_job_id);
      count_value := count_value + 1;
    end if;
    inserted_job_id := null;
  end loop;
  return query select count_value, ids;
end;
$$;

create or replace function public.settle_meta_reporting_sync(
  p_schedule_id uuid, p_job_id uuid, p_worker_id text, p_lease_token uuid,
  p_lease_generation bigint, p_snapshot_id uuid
) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
declare updated_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  if not exists (
    select 1 from public.system_jobs job where job.id = p_job_id
      and job.kind = 'meta_reporting_sync' and job.status = 'processing'
      and job.locked_by = p_worker_id and job.lease_token = p_lease_token
      and job.lease_generation = p_lease_generation and job.locked_until > timezone('utc', now())
  ) then raise exception 'meta_reporting_lease_lost'; end if;
  update public.meta_reporting_schedules schedule
  set last_attempt_at = timezone('utc', now()), last_success_at = timezone('utc', now()),
      last_snapshot_id = p_snapshot_id, consecutive_failures = 0, freshness_status = 'current',
      stale_alerted_at = null, updated_at = timezone('utc', now())
  where schedule.id = p_schedule_id
    and schedule.organization_id = (select organization_id from public.system_jobs where id = p_job_id)
    and schedule.campaign_id = (select campaign_id from public.system_jobs where id = p_job_id);
  get diagnostics updated_count = row_count;
  update public.meta_reporting_alerts set status = 'resolved', resolved_at = timezone('utc', now())
  where schedule_id = p_schedule_id and status = 'open';
  return updated_count = 1;
end;
$$;

create or replace function public.record_meta_reporting_sync_failure(
  p_schedule_id uuid, p_job_id uuid, p_worker_id text, p_lease_token uuid,
  p_lease_generation bigint, p_error_code text
) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
declare updated_count integer; schedule public.meta_reporting_schedules%rowtype; alert_type text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  if not exists (
    select 1 from public.system_jobs job where job.id = p_job_id
      and job.kind = 'meta_reporting_sync' and job.status = 'processing'
      and job.locked_by = p_worker_id and job.lease_token = p_lease_token
      and job.lease_generation = p_lease_generation and job.locked_until > timezone('utc', now())
  ) then raise exception 'meta_reporting_lease_lost'; end if;
  update public.meta_reporting_schedules target
  set last_attempt_at = timezone('utc', now()), consecutive_failures = target.consecutive_failures + 1,
      freshness_status = case
        when target.last_success_at is null then 'missing'
        when target.last_success_at < timezone('utc', now()) - make_interval(mins => target.maximum_age_minutes) then 'stale'
        else 'delayed' end,
      updated_at = timezone('utc', now())
  where target.id = p_schedule_id
  returning * into schedule;
  get diagnostics updated_count = row_count;
  if updated_count = 1 and (
    schedule.consecutive_failures >= 3
    or schedule.freshness_status = 'stale'
    or (schedule.freshness_status = 'missing' and schedule.created_at < timezone('utc', now()) - make_interval(mins => schedule.maximum_age_minutes))
  ) then
    alert_type := case when schedule.freshness_status = 'missing' then 'reporting_missing' else 'reporting_stale' end;
    insert into public.meta_reporting_alerts(schedule_id, organization_id, campaign_id, alert_key, alert_type, detail)
    values (schedule.id, schedule.organization_id, schedule.campaign_id,
      'meta_reporting:' || schedule.id::text || ':' || alert_type,
      alert_type, jsonb_build_object('errorCode', left(coalesce(p_error_code, 'unknown'), 160), 'consecutiveFailures', schedule.consecutive_failures))
    on conflict (alert_key) do update set status = 'open', resolved_at = null,
      detail = excluded.detail, opened_at = timezone('utc', now());
    update public.meta_reporting_schedules set stale_alerted_at = timezone('utc', now()) where id = schedule.id;
  end if;
  return updated_count = 1;
end;
$$;

create or replace function public.refresh_meta_reporting_freshness_alerts()
returns integer language plpgsql security definer set search_path = pg_catalog as $$
declare changed integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  update public.meta_reporting_schedules schedule
  set freshness_status = case
      when schedule.last_success_at is null then 'missing'
      when schedule.last_success_at < timezone('utc', now()) - make_interval(mins => schedule.maximum_age_minutes) then 'stale'
      when schedule.last_success_at < timezone('utc', now()) - make_interval(mins => greatest(schedule.interval_minutes * 2, 15)) then 'delayed'
      else 'current' end,
    updated_at = timezone('utc', now())
  where schedule.status = 'enabled';
  get diagnostics changed = row_count;
  insert into public.meta_reporting_alerts(schedule_id, organization_id, campaign_id, alert_key, alert_type, detail)
  select schedule.id, schedule.organization_id, schedule.campaign_id,
    'meta_reporting:' || schedule.id::text || ':' || case when schedule.freshness_status = 'missing' then 'reporting_missing' else 'reporting_stale' end,
    case when schedule.freshness_status = 'missing' then 'reporting_missing' else 'reporting_stale' end,
    jsonb_build_object('freshnessStatus', schedule.freshness_status, 'lastSuccessAt', schedule.last_success_at)
  from public.meta_reporting_schedules schedule
  where schedule.status = 'enabled'
    and (
      schedule.freshness_status = 'stale'
      or (schedule.freshness_status = 'missing' and schedule.created_at < timezone('utc', now()) - make_interval(mins => schedule.maximum_age_minutes))
    )
  on conflict (alert_key) do update set status = 'open', resolved_at = null, detail = excluded.detail;
  return changed;
end;
$$;

-- Preserve the version-two hard-cutover and add only the resumable reporting job.
create or replace function public.claim_next_system_job_v2(
  p_worker_id text, p_lease_ms integer, p_protocol_version integer
) returns setof public.system_jobs
language plpgsql security definer set search_path = pg_catalog as $$
declare claimed_id uuid;
begin
  if p_protocol_version is distinct from 2 then
    raise exception using errcode = '22023', message = 'system_job_claim_protocol_unsupported';
  end if;
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then raise exception 'p_worker_id is required'; end if;

  update public.meta_leadgen_events event
  set status = 'operator_required', processing_token = null, locked_by = null, locked_until = null,
      last_error_code = 'meta_leadgen_max_attempts_exhausted',
      last_error_message = 'The reconciliation job exhausted its attempts before a fenced terminal result.',
      updated_at = timezone('utc', now())
  from public.system_jobs job
  where event.reconciliation_job_id = job.id
    and event.status in ('processing', 'pending_reconciliation')
    and job.kind = 'meta_leadgen_reconciliation' and job.dead_lettered_at is null
    and job.status in ('pending', 'processing') and job.attempt_count >= job.max_attempts
    and (job.status = 'pending' or job.locked_until is null or job.locked_until <= now());

  update public.meta_leadgen_effect_receipts effect
  set status = 'operator_required', reason = 'meta_leadgen_max_attempts_exhausted',
      updated_at = timezone('utc', now())
  from public.meta_leadgen_events event
  where effect.event_id = event.id and event.status = 'operator_required'
    and event.last_error_code = 'meta_leadgen_max_attempts_exhausted'
    and effect.effect_key in ('provider_lookup', 'lead_persistence');

  update public.system_jobs set status = 'failed', dead_lettered_at = coalesce(dead_lettered_at, now()),
    dead_letter_reason = coalesce(dead_letter_reason, 'Maximum job attempts reached before claim.'),
    locked_by = null, locked_until = null, lease_token = null, lease_heartbeat_at = null,
    completed_at = coalesce(completed_at, now()), error_message = coalesce(error_message, 'Maximum job attempts reached before claim.')
  where dead_lettered_at is null and status in ('pending', 'processing')
    and kind in ('static_creative_generation','video_generation','video_generation_status','lead_capture_retry','lead_side_effects','meta_leadgen_reconciliation','meta_reporting_sync')
    and attempt_count >= max_attempts
    and (status = 'pending' or locked_until is null or locked_until <= now());

  with candidate as (
    select id from public.system_jobs where
      (status = 'pending' or (status = 'processing' and locked_until is not null and locked_until <= now()))
      and (next_run_at is null or next_run_at <= now()) and dead_lettered_at is null
      and attempt_count < max_attempts
      and kind in ('static_creative_generation','video_generation','video_generation_status','lead_capture_retry','lead_side_effects','meta_leadgen_reconciliation','meta_reporting_sync')
    order by created_at asc for update skip locked limit 1
  )
  update public.system_jobs set status = 'processing', locked_by = p_worker_id,
    locked_until = now() + (least(greatest(p_lease_ms, 1000), 3600000)::text || ' milliseconds')::interval,
    lease_token = gen_random_uuid(), lease_generation = lease_generation + 1, lease_heartbeat_at = now(),
    started_at = coalesce(started_at, now()), completed_at = null, error_message = null,
    attempt_count = attempt_count + 1
  where id in (select id from candidate) returning id into claimed_id;
  if claimed_id is null then return; end if;
  return query select * from public.system_jobs where id = claimed_id;
end;
$$;

revoke execute on function public.enqueue_due_meta_reporting_sync_jobs(integer) from public, anon, authenticated;
revoke execute on function public.settle_meta_reporting_sync(uuid, uuid, text, uuid, bigint, uuid) from public, anon, authenticated;
revoke execute on function public.record_meta_reporting_sync_failure(uuid, uuid, text, uuid, bigint, text) from public, anon, authenticated;
revoke execute on function public.refresh_meta_reporting_freshness_alerts() from public, anon, authenticated;
revoke execute on function public.claim_next_system_job_v2(text, integer, integer) from public, anon, authenticated;
grant execute on function public.enqueue_due_meta_reporting_sync_jobs(integer) to service_role;
grant execute on function public.settle_meta_reporting_sync(uuid, uuid, text, uuid, bigint, uuid) to service_role;
grant execute on function public.record_meta_reporting_sync_failure(uuid, uuid, text, uuid, bigint, text) to service_role;
grant execute on function public.refresh_meta_reporting_freshness_alerts() to service_role;
grant execute on function public.claim_next_system_job_v2(text, integer, integer) to service_role;

insert into public.app_schema_metadata(key, value) values ('schema_version', '20260712214000')
on conflict (key) do update set value = excluded.value, updated_at = timezone('utc', now());
