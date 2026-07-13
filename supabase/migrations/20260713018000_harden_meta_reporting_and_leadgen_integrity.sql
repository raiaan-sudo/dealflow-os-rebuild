-- BEGIN META LEADGEN GHL-ONLY SETTLEMENT
create or replace function public.settle_meta_leadgen_event(
  p_event_id uuid,
  p_processing_token uuid,
  p_processing_generation bigint,
  p_status text,
  p_provider_ad_account_id text default null,
  p_provider_ad_id text default null,
  p_lead_id uuid default null,
  p_reconciliation_job_id uuid default null,
  p_side_effect_job_id uuid default null,
  p_error_code text default null,
  p_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  event_record public.meta_leadgen_events%rowtype;
  route_record public.meta_leadgen_routes%rowtype;
  reconciler public.system_jobs%rowtype;
  side_effect public.system_jobs%rowtype;
begin
  perform private.assert_meta_leadgen_service_role();
  if p_status not in ('pending_reconciliation', 'persisted', 'operator_required') then
    raise exception using errcode = '22023', message = 'meta_leadgen_settlement_status_invalid';
  end if;

  select candidate.* into event_record
  from public.meta_leadgen_events candidate
  where candidate.id = p_event_id
    and candidate.status = 'processing'
    and candidate.processing_token = p_processing_token
    and candidate.processing_generation = p_processing_generation
    and candidate.locked_until > timezone('utc', now())
  for update;
  if event_record.id is null then return false; end if;

  select route.* into route_record
  from public.meta_leadgen_routes route
  where route.id = event_record.route_id
    and route.organization_id = event_record.organization_id
    and route.user_id = event_record.user_id
    and route.campaign_id = event_record.campaign_id
    and route.status = 'active'
  for key share;
  if route_record.id is null then
    raise exception using errcode = '42501', message = 'meta_leadgen_route_scope_lost';
  end if;

  if p_reconciliation_job_id is not null then
    select job.* into reconciler
    from public.system_jobs job
    where job.id = p_reconciliation_job_id
      and job.organization_id = event_record.organization_id
      and job.user_id = event_record.user_id
      and job.campaign_id = event_record.campaign_id
      and job.kind = 'meta_leadgen_reconciliation'
      and job.payload ->> 'eventId' = event_record.id::text
    for key share;
    if reconciler.id is null then
      raise exception using errcode = '42501', message = 'meta_leadgen_reconciliation_job_scope_mismatch';
    end if;
  end if;

  if p_status = 'pending_reconciliation' then
    if coalesce(p_reconciliation_job_id, event_record.reconciliation_job_id) is null then
      raise exception using errcode = '22023', message = 'meta_leadgen_reconciliation_job_required';
    end if;
    update public.meta_leadgen_events candidate
    set status = 'pending_reconciliation', processing_token = null, locked_by = null,
        locked_until = null,
        reconciliation_job_id = coalesce(p_reconciliation_job_id, candidate.reconciliation_job_id),
        last_error_code = nullif(trim(p_error_code), ''),
        last_error_message = left(nullif(trim(p_error_message), ''), 1000),
        updated_at = timezone('utc', now())
    where candidate.id = event_record.id;
    update public.meta_leadgen_effect_receipts effect
    set status = 'queued',
        reason = coalesce(nullif(trim(p_error_code), ''), 'provider_lookup_queued'),
        system_job_id = coalesce(p_reconciliation_job_id, event_record.reconciliation_job_id),
        updated_at = timezone('utc', now())
    where effect.event_id = event_record.id and effect.effect_key = 'provider_lookup';
    return true;
  end if;

  if p_status = 'operator_required' then
    update public.meta_leadgen_events candidate
    set status = 'operator_required', processing_token = null, locked_by = null,
        locked_until = null,
        last_error_code = coalesce(nullif(trim(p_error_code), ''), 'meta_leadgen_operator_required'),
        last_error_message = left(nullif(trim(p_error_message), ''), 1000),
        updated_at = timezone('utc', now())
    where candidate.id = event_record.id;
    update public.meta_leadgen_effect_receipts effect
    set status = 'operator_required',
        reason = coalesce(nullif(trim(p_error_code), ''), 'meta_leadgen_operator_required'),
        updated_at = timezone('utc', now())
    where effect.event_id = event_record.id
      and effect.effect_key in ('provider_lookup', 'lead_persistence');
    return true;
  end if;

  if p_provider_ad_account_id is null
    or replace(trim(p_provider_ad_account_id), 'act_', '')
      <> replace(route_record.provider_ad_account_id, 'act_', '')
    or p_provider_ad_id is null
    or trim(p_provider_ad_id) !~ '^[0-9]{5,40}$'
    or p_lead_id is null
    or p_side_effect_job_id is null then
    raise exception using errcode = '42501', message = 'meta_leadgen_persisted_identity_incomplete';
  end if;

  perform 1 from public.leads lead
  where lead.id = p_lead_id
    and lead.organization_id = event_record.organization_id
    and lead.user_id = event_record.user_id
    and lead.campaign_id = event_record.campaign_id
  for key share;
  if not found then
    raise exception using errcode = '42501', message = 'meta_leadgen_lead_scope_mismatch';
  end if;

  select job.* into side_effect
  from public.system_jobs job
  where job.id = p_side_effect_job_id
    and job.organization_id = event_record.organization_id
    and job.user_id = event_record.user_id
    and job.campaign_id = event_record.campaign_id
    and job.kind = 'lead_side_effects'
  for key share;
  if side_effect.id is null then
    raise exception using errcode = '42501', message = 'meta_leadgen_side_effect_job_scope_mismatch';
  end if;
  if coalesce(side_effect.payload -> 'enabledEffects', 'null'::jsonb)
      <> '["ghl_delivery"]'::jsonb
    or coalesce(side_effect.payload -> 'requiredEffects', 'null'::jsonb)
      <> '["ghl_delivery"]'::jsonb
    or side_effect.payload ? 'metaConversion'
    or not (side_effect.payload ? 'advertisingConsent')
    or jsonb_typeof(side_effect.payload -> 'advertisingConsent') is distinct from 'null'
    or nullif(trim(side_effect.payload ->> 'requestId'), '') is null
    or side_effect.payload -> 'lead' ->> 'id' is distinct from p_lead_id::text
    or side_effect.payload -> 'lead' ->> 'organization_id'
      is distinct from event_record.organization_id::text
    or side_effect.payload -> 'lead' ->> 'campaign_id'
      is distinct from event_record.campaign_id::text then
    raise exception using errcode = '42501', message = 'meta_leadgen_side_effect_policy_mismatch';
  end if;

  update public.meta_leadgen_events candidate
  set status = 'persisted',
      provider_ad_account_id = replace(trim(p_provider_ad_account_id), 'act_', ''),
      provider_ad_id = trim(p_provider_ad_id), lead_id = p_lead_id,
      side_effect_job_id = p_side_effect_job_id, processing_token = null,
      locked_by = null, locked_until = null, last_error_code = null,
      last_error_message = null, completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where candidate.id = event_record.id;

  update public.meta_leadgen_effect_receipts effect
  set status = 'succeeded', reason = null, lead_id = p_lead_id,
      system_job_id = case
        when effect.effect_key = 'lead_persistence' then p_side_effect_job_id
        else effect.system_job_id
      end,
      updated_at = timezone('utc', now())
  where effect.event_id = event_record.id
    and effect.effect_key in ('provider_lookup', 'lead_persistence');
  return true;
end;
$$;

revoke all on function public.settle_meta_leadgen_event(uuid, uuid, bigint, text, text, text, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_meta_leadgen_event(uuid, uuid, bigint, text, text, text, uuid, uuid, uuid, text, text)
  to service_role;
-- END META LEADGEN GHL-ONLY SETTLEMENT

-- BEGIN CAMPAIGN REPORTING AND CRM LINEAGE
alter table public.campaign_sync_snapshots
  add column if not exists campaign_id uuid;
alter table public.campaign_sync_snapshots
  add column if not exists delivery_metrics_confirmed boolean;

-- Historical rows predate an explicit delivery-proof bit. Only completely
-- successful rows are safe to adopt as confirmed; partial rows remain
-- available as diagnostic attempts but may not drive customer reporting or
-- autonomous optimization.
update public.campaign_sync_snapshots
set delivery_metrics_confirmed = (sync_result = 'success')
where delivery_metrics_confirmed is null;
alter table public.campaign_sync_snapshots
  alter column delivery_metrics_confirmed set default false;
alter table public.campaign_sync_snapshots
  alter column delivery_metrics_confirmed set not null;

with unambiguous_launch_lineage as (
  select
    launch.organization_id,
    launch.user_id,
    launch.meta_campaign_id,
    (array_agg(launch.campaign_id order by launch.campaign_id::text))[1] as campaign_id
  from public.campaign_launch_records launch
  where launch.result_status = 'success'
    and launch.campaign_id is not null
    and nullif(trim(launch.meta_campaign_id), '') is not null
  group by launch.organization_id, launch.user_id, launch.meta_campaign_id
  having count(distinct launch.campaign_id) = 1
)
update public.campaign_sync_snapshots snapshot
set campaign_id = lineage.campaign_id
from unambiguous_launch_lineage lineage
where snapshot.campaign_id is null
  and snapshot.organization_id = lineage.organization_id
  and snapshot.user_id = lineage.user_id
  and snapshot.meta_campaign_id = lineage.meta_campaign_id;

alter table public.appointments add column if not exists campaign_id uuid;
alter table public.deals add column if not exists campaign_id uuid;

update public.appointments appointment
set campaign_id = lead.campaign_id
from public.leads lead
where appointment.campaign_id is null
  and appointment.lead_id = lead.id
  and appointment.organization_id = lead.organization_id
  and lead.campaign_id is not null;

update public.deals deal
set campaign_id = lead.campaign_id
from public.leads lead
where deal.campaign_id is null
  and deal.lead_id = lead.id
  and deal.organization_id = lead.organization_id
  and lead.campaign_id is not null;

update public.deals deal
set campaign_id = appointment.campaign_id
from public.appointments appointment
where deal.campaign_id is null
  and deal.appointment_id = appointment.id
  and deal.organization_id = appointment.organization_id
  and appointment.campaign_id is not null;

do $$
begin
  if exists (
    select 1
    from public.deals deal
    join public.appointments appointment on appointment.id = deal.appointment_id
    where appointment.organization_id <> deal.organization_id
       or (
         deal.campaign_id is not null
         and appointment.campaign_id is not null
         and deal.campaign_id <> appointment.campaign_id
       )
  ) or exists (
    select 1
    from public.deals deal
    join public.leads lead on lead.id = deal.lead_id
    where lead.organization_id <> deal.organization_id
       or (
         deal.campaign_id is not null
         and lead.campaign_id is not null
         and deal.campaign_id <> lead.campaign_id
       )
  ) then
    raise exception using
      errcode = '55000',
      message = 'deal_campaign_lineage_conflict_requires_operator_review';
  end if;
end;
$$;

create unique index if not exists leads_id_organization_unique
  on public.leads(id, organization_id);
create unique index if not exists leads_id_organization_campaign_unique
  on public.leads(id, organization_id, campaign_id);
create unique index if not exists appointments_id_organization_unique
  on public.appointments(id, organization_id);
create unique index if not exists appointments_id_organization_campaign_unique
  on public.appointments(id, organization_id, campaign_id);
create index if not exists appointments_organization_campaign_scheduled_idx
  on public.appointments(organization_id, campaign_id, scheduled_at desc);
create index if not exists deals_organization_campaign_created_idx
  on public.deals(organization_id, campaign_id, created_at desc);
create index if not exists campaign_sync_snapshots_campaign_confirmed_idx
  on public.campaign_sync_snapshots(
    organization_id, user_id, campaign_id, synced_at desc
  ) where delivery_metrics_confirmed;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.campaign_sync_snapshots'::regclass
      and conname = 'campaign_sync_snapshots_campaign_scope_fkey'
  ) then
    alter table public.campaign_sync_snapshots
      add constraint campaign_sync_snapshots_campaign_scope_fkey
      foreign key (campaign_id, organization_id, user_id)
      references public.campaign_plans(id, organization_id, user_id)
      on delete cascade not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_lead_campaign_lineage_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_lead_campaign_lineage_fkey
      foreign key (lead_id, organization_id, campaign_id)
      references public.leads(id, organization_id, campaign_id)
      on update restrict on delete set null (lead_id) not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_lead_organization_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_lead_organization_fkey
      foreign key (lead_id, organization_id)
      references public.leads(id, organization_id)
      on delete set null (lead_id) not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.deals'::regclass
      and conname = 'deals_lead_campaign_lineage_fkey'
  ) then
    alter table public.deals
      add constraint deals_lead_campaign_lineage_fkey
      foreign key (lead_id, organization_id, campaign_id)
      references public.leads(id, organization_id, campaign_id)
      on update restrict on delete set null (lead_id) not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_campaign_organization_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_campaign_organization_fkey
      foreign key (campaign_id, organization_id)
      references public.campaign_plans(id, organization_id)
      on delete cascade not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.deals'::regclass
      and conname = 'deals_appointment_campaign_lineage_fkey'
  ) then
    alter table public.deals
      add constraint deals_appointment_campaign_lineage_fkey
      foreign key (appointment_id, organization_id, campaign_id)
      references public.appointments(id, organization_id, campaign_id)
      on update restrict on delete set null (appointment_id) not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.deals'::regclass
      and conname = 'deals_lead_organization_fkey'
  ) then
    alter table public.deals
      add constraint deals_lead_organization_fkey
      foreign key (lead_id, organization_id)
      references public.leads(id, organization_id)
      on delete set null (lead_id) not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.deals'::regclass
      and conname = 'deals_appointment_organization_fkey'
  ) then
    alter table public.deals
      add constraint deals_appointment_organization_fkey
      foreign key (appointment_id, organization_id)
      references public.appointments(id, organization_id)
      on delete set null (appointment_id) not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.deals'::regclass
      and conname = 'deals_campaign_organization_fkey'
  ) then
    alter table public.deals
      add constraint deals_campaign_organization_fkey
      foreign key (campaign_id, organization_id)
      references public.campaign_plans(id, organization_id)
      on delete cascade not valid;
  end if;
end;
$$;

alter table public.campaign_sync_snapshots
  validate constraint campaign_sync_snapshots_campaign_scope_fkey;
alter table public.appointments
  validate constraint appointments_lead_organization_fkey;
alter table public.appointments
  validate constraint appointments_lead_campaign_lineage_fkey;
alter table public.appointments
  validate constraint appointments_campaign_organization_fkey;
alter table public.deals
  validate constraint deals_lead_organization_fkey;
alter table public.deals
  validate constraint deals_lead_campaign_lineage_fkey;
alter table public.deals
  validate constraint deals_appointment_organization_fkey;
alter table public.deals
  validate constraint deals_appointment_campaign_lineage_fkey;
alter table public.deals
  validate constraint deals_campaign_organization_fkey;

create or replace function private.enforce_appointment_campaign_lineage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  lead_record record;
begin
  if new.lead_id is not null then
    select lead.organization_id, lead.campaign_id
      into lead_record
    from public.leads lead
    where lead.id = new.lead_id;
    if not found or lead_record.organization_id <> new.organization_id then
      raise exception using errcode = '42501', message = 'appointment_lead_scope_mismatch';
    end if;
    if new.campaign_id is null then
      new.campaign_id := lead_record.campaign_id;
    elsif lead_record.campaign_id is not null
      and new.campaign_id <> lead_record.campaign_id then
      raise exception using errcode = '42501', message = 'appointment_campaign_lineage_mismatch';
    end if;
  end if;
  if new.campaign_id is not null and not exists (
    select 1 from public.campaign_plans campaign
    where campaign.id = new.campaign_id
      and campaign.organization_id = new.organization_id
  ) then
    raise exception using errcode = '42501', message = 'appointment_campaign_scope_mismatch';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_deal_campaign_lineage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  lead_record record;
  appointment_record record;
begin
  if new.lead_id is not null then
    select lead.organization_id, lead.campaign_id
      into lead_record
    from public.leads lead
    where lead.id = new.lead_id;
    if not found or lead_record.organization_id <> new.organization_id then
      raise exception using errcode = '42501', message = 'deal_lead_scope_mismatch';
    end if;
    if new.campaign_id is null then
      new.campaign_id := lead_record.campaign_id;
    elsif lead_record.campaign_id is not null
      and new.campaign_id <> lead_record.campaign_id then
      raise exception using errcode = '42501', message = 'deal_lead_campaign_lineage_mismatch';
    end if;
  end if;
  if new.appointment_id is not null then
    select appointment.organization_id, appointment.campaign_id
      into appointment_record
    from public.appointments appointment
    where appointment.id = new.appointment_id;
    if not found or appointment_record.organization_id <> new.organization_id then
      raise exception using errcode = '42501', message = 'deal_appointment_scope_mismatch';
    end if;
    if new.campaign_id is null then
      new.campaign_id := appointment_record.campaign_id;
    elsif appointment_record.campaign_id is not null
      and new.campaign_id <> appointment_record.campaign_id then
      raise exception using errcode = '42501', message = 'deal_appointment_campaign_lineage_mismatch';
    end if;
  end if;
  if new.campaign_id is not null and not exists (
    select 1 from public.campaign_plans campaign
    where campaign.id = new.campaign_id
      and campaign.organization_id = new.organization_id
  ) then
    raise exception using errcode = '42501', message = 'deal_campaign_scope_mismatch';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_appointment_campaign_lineage()
  from public, anon, authenticated;
revoke all on function private.enforce_deal_campaign_lineage()
  from public, anon, authenticated;

drop trigger if exists enforce_appointment_campaign_lineage
  on public.appointments;
create trigger enforce_appointment_campaign_lineage
before insert or update of organization_id, lead_id, campaign_id
on public.appointments
for each row execute function private.enforce_appointment_campaign_lineage();

drop trigger if exists enforce_deal_campaign_lineage
  on public.deals;
create trigger enforce_deal_campaign_lineage
before insert or update of organization_id, lead_id, appointment_id, campaign_id
on public.deals
for each row execute function private.enforce_deal_campaign_lineage();

update public.performance_tracking tracking
set campaign_id = snapshot.campaign_id::text
from public.campaign_sync_snapshots snapshot
where tracking.source_snapshot_id = snapshot.id
  and snapshot.campaign_id is not null
  and tracking.campaign_id is distinct from snapshot.campaign_id::text;

create or replace function public.get_campaign_dashboard_aggregates_v1(
  p_organization_id uuid,
  p_campaign_id uuid default null
)
returns table (
  appointments_booked bigint,
  active_deals bigint,
  closed_deals bigint,
  total_deals bigint,
  pipeline_value numeric,
  closed_volume numeric,
  commission_revenue numeric
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select
    (
      select count(*)
      from public.appointments appointment
      where appointment.organization_id = p_organization_id
        and (p_campaign_id is null or appointment.campaign_id = p_campaign_id)
        -- A cancellation or no-show is still a real booked appointment for
        -- funnel conversion reporting. Invalid/deleted/operator-only rows are
        -- intentionally excluded.
        and lower(coalesce(appointment.status, '')) in (
          'scheduled', 'booked', 'new', 'confirmed', 'active',
          'completed', 'showed', 'cancelled', 'canceled', 'no_show', 'noshow'
        )
    )::bigint,
    (
      select count(*)
      from public.deals deal
      where deal.organization_id = p_organization_id
        and (p_campaign_id is null or deal.campaign_id = p_campaign_id)
        and lower(coalesce(deal.status, '')) in ('active', 'open')
    )::bigint,
    (
      select count(*)
      from public.deals deal
      where deal.organization_id = p_organization_id
        and (p_campaign_id is null or deal.campaign_id = p_campaign_id)
        and lower(coalesce(deal.status, '')) in ('closed_won', 'won')
    )::bigint,
    (
      select count(*)
      from public.deals deal
      where deal.organization_id = p_organization_id
        and (p_campaign_id is null or deal.campaign_id = p_campaign_id)
    )::bigint,
    coalesce((
      select sum(deal.estimated_value)
      from public.deals deal
      where deal.organization_id = p_organization_id
        and (p_campaign_id is null or deal.campaign_id = p_campaign_id)
        and lower(coalesce(deal.status, '')) in ('active', 'open')
    ), 0)::numeric,
    coalesce((
      select sum(deal.closed_value)
      from public.deals deal
      where deal.organization_id = p_organization_id
        and (p_campaign_id is null or deal.campaign_id = p_campaign_id)
        and lower(coalesce(deal.status, '')) in ('closed_won', 'won')
    ), 0)::numeric,
    coalesce((
      select sum(deal.commission_revenue)
      from public.deals deal
      where deal.organization_id = p_organization_id
        and (p_campaign_id is null or deal.campaign_id = p_campaign_id)
        and lower(coalesce(deal.status, '')) in ('closed_won', 'won')
    ), 0)::numeric;
$$;

revoke all on function public.get_campaign_dashboard_aggregates_v1(uuid, uuid)
  from public, anon;
grant execute on function public.get_campaign_dashboard_aggregates_v1(uuid, uuid)
  to authenticated, service_role;

comment on function public.get_campaign_dashboard_aggregates_v1(uuid, uuid) is
  'RLS-preserving exact dashboard aggregates; recent-row display limits never affect totals. Canceled and no-show appointments count as booked, while invalid/deleted states do not.';
-- END CAMPAIGN REPORTING AND CRM LINEAGE

-- BEGIN META REPORTING SETTLEMENT FENCING
create or replace function public.settle_meta_reporting_sync(
  p_schedule_id uuid, p_job_id uuid, p_worker_id text, p_lease_token uuid,
  p_lease_generation bigint, p_snapshot_id uuid
) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
declare
  job_record public.system_jobs%rowtype;
  schedule_record public.meta_reporting_schedules%rowtype;
  snapshot_record public.campaign_sync_snapshots%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  select job.* into job_record
  from public.system_jobs job
  where job.id = p_job_id and job.kind = 'meta_reporting_sync'
    and job.status = 'processing' and job.locked_by = p_worker_id
    and job.lease_token = p_lease_token
    and job.lease_generation = p_lease_generation
    and job.locked_until > timezone('utc', now())
  for key share;
  if job_record.id is null then raise exception 'meta_reporting_lease_lost'; end if;

  select schedule.* into schedule_record
  from public.meta_reporting_schedules schedule
  where schedule.id = p_schedule_id
  for update;
  if schedule_record.id is null
    or schedule_record.organization_id <> job_record.organization_id
    or schedule_record.user_id <> job_record.user_id
    or schedule_record.campaign_id is distinct from job_record.campaign_id
    or job_record.payload ->> 'reportingScheduleId' is distinct from schedule_record.id::text then
    raise exception using errcode = '42501', message = 'meta_reporting_schedule_job_scope_mismatch';
  end if;

  select snapshot.* into snapshot_record
  from public.campaign_sync_snapshots snapshot
  where snapshot.id = p_snapshot_id
  for key share;
  if snapshot_record.id is null
    or snapshot_record.organization_id <> schedule_record.organization_id
    or snapshot_record.user_id <> schedule_record.user_id then
    raise exception using errcode = '42501', message = 'meta_reporting_snapshot_tenant_scope_mismatch';
  end if;
  if snapshot_record.campaign_id is distinct from schedule_record.campaign_id then
    raise exception using errcode = '42501', message = 'meta_reporting_snapshot_campaign_scope_mismatch';
  end if;
  if snapshot_record.delivery_metrics_confirmed is distinct from true
    or snapshot_record.sync_result not in ('success', 'partial_success') then
    raise exception using errcode = '55000', message = 'meta_reporting_delivery_metrics_unconfirmed';
  end if;
  perform 1 from public.campaign_launch_records launch
  where launch.organization_id = schedule_record.organization_id
    and launch.user_id = schedule_record.user_id
    and launch.campaign_id = schedule_record.campaign_id
    and launch.result_status = 'success'
    and launch.meta_campaign_id = snapshot_record.meta_campaign_id
  for key share;
  if snapshot_record.meta_campaign_id is null or not found then
    raise exception using errcode = '42501', message = 'meta_reporting_snapshot_campaign_scope_mismatch';
  end if;

  update public.meta_reporting_schedules schedule
  set last_attempt_at = timezone('utc', now()), last_success_at = timezone('utc', now()),
      last_snapshot_id = snapshot_record.id, consecutive_failures = 0,
      freshness_status = 'current', stale_alerted_at = null,
      updated_at = timezone('utc', now())
  where schedule.id = schedule_record.id;
  update public.meta_reporting_alerts
  set status = 'resolved', resolved_at = timezone('utc', now())
  where schedule_id = schedule_record.id and status = 'open';
  return true;
end;
$$;

create or replace function public.record_meta_reporting_sync_failure(
  p_schedule_id uuid, p_job_id uuid, p_worker_id text, p_lease_token uuid,
  p_lease_generation bigint, p_error_code text
) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
declare
  job_record public.system_jobs%rowtype;
  schedule_record public.meta_reporting_schedules%rowtype;
  alert_type text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  select job.* into job_record
  from public.system_jobs job
  where job.id = p_job_id and job.kind = 'meta_reporting_sync'
    and job.status = 'processing' and job.locked_by = p_worker_id
    and job.lease_token = p_lease_token
    and job.lease_generation = p_lease_generation
    and job.locked_until > timezone('utc', now())
  for key share;
  if job_record.id is null then raise exception 'meta_reporting_lease_lost'; end if;

  select schedule.* into schedule_record
  from public.meta_reporting_schedules schedule
  where schedule.id = p_schedule_id
  for update;
  if schedule_record.id is null
    or schedule_record.organization_id <> job_record.organization_id
    or schedule_record.user_id <> job_record.user_id
    or schedule_record.campaign_id is distinct from job_record.campaign_id
    or job_record.payload ->> 'reportingScheduleId' is distinct from schedule_record.id::text then
    raise exception using errcode = '42501', message = 'meta_reporting_schedule_job_scope_mismatch';
  end if;

  update public.meta_reporting_schedules target
  set last_attempt_at = timezone('utc', now()),
      consecutive_failures = target.consecutive_failures + 1,
      freshness_status = case
        when target.last_success_at is null then 'missing'
        when target.last_success_at < timezone('utc', now())
          - make_interval(mins => target.maximum_age_minutes) then 'stale'
        else 'delayed' end,
      updated_at = timezone('utc', now())
  where target.id = schedule_record.id
  returning * into schedule_record;

  if schedule_record.consecutive_failures >= 3
    or schedule_record.freshness_status = 'stale'
    or (schedule_record.freshness_status = 'missing'
      and schedule_record.created_at < timezone('utc', now())
        - make_interval(mins => schedule_record.maximum_age_minutes)) then
    alert_type := case
      when schedule_record.freshness_status = 'missing' then 'reporting_missing'
      else 'reporting_stale' end;
    insert into public.meta_reporting_alerts(
      schedule_id, organization_id, campaign_id, alert_key, alert_type, detail
    ) values (
      schedule_record.id, schedule_record.organization_id, schedule_record.campaign_id,
      'meta_reporting:' || schedule_record.id::text || ':' || alert_type,
      alert_type,
      jsonb_build_object(
        'errorCode', left(coalesce(p_error_code, 'unknown'), 160),
        'consecutiveFailures', schedule_record.consecutive_failures
      )
    ) on conflict (alert_key) do update
      set status = 'open', resolved_at = null, detail = excluded.detail,
          opened_at = timezone('utc', now());
    update public.meta_reporting_schedules
    set stale_alerted_at = timezone('utc', now())
    where id = schedule_record.id;
  end if;
  return true;
end;
$$;

revoke execute on function public.settle_meta_reporting_sync(uuid, uuid, text, uuid, bigint, uuid)
  from public, anon, authenticated;
revoke execute on function public.record_meta_reporting_sync_failure(uuid, uuid, text, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.settle_meta_reporting_sync(uuid, uuid, text, uuid, bigint, uuid)
  to service_role;
grant execute on function public.record_meta_reporting_sync_failure(uuid, uuid, text, uuid, bigint, text)
  to service_role;
-- END META REPORTING SETTLEMENT FENCING

insert into public.app_schema_metadata(key, value)
values ('schema_version', '20260713018000')
on conflict (key) do update
set value = excluded.value, updated_at = timezone('utc', now());
