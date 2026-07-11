-- Native Meta leadgen ingestion is a signed, read-only provider flow. Provider
-- Page/Form/ad-account identity is mapped explicitly before a tenant can be
-- selected. The public webhook can only invoke the fenced SECURITY DEFINER
-- protocol; direct event/effect writes stay unavailable even to service_role.

create unique index if not exists marketing_accounts_id_organization_unique
  on public.marketing_accounts (id, organization_id);

create unique index if not exists leads_id_organization_user_campaign_unique
  on public.leads (id, organization_id, user_id, campaign_id);

create table if not exists public.meta_leadgen_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  campaign_id uuid not null,
  marketing_account_id uuid not null,
  provider_ad_account_id text not null,
  provider_page_id text not null,
  provider_form_id text not null,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint meta_leadgen_routes_campaign_tenant_fk
    foreign key (campaign_id, organization_id, user_id)
    references public.campaign_plans(id, organization_id, user_id)
    on update restrict on delete restrict,
  constraint meta_leadgen_routes_marketing_tenant_fk
    foreign key (marketing_account_id, organization_id)
    references public.marketing_accounts(id, organization_id)
    on update restrict on delete restrict,
  constraint meta_leadgen_routes_provider_identity_check check (
    provider_ad_account_id ~ '^(act_)?[0-9]{5,40}$'
    and provider_page_id ~ '^[0-9]{5,40}$'
    and provider_form_id ~ '^[0-9]{5,40}$'
  ),
  constraint meta_leadgen_routes_status_check
    check (status in ('active', 'disabled', 'operator_required')),
  constraint meta_leadgen_routes_id_scope_unique
    unique (id, organization_id, user_id, campaign_id)
);

create unique index if not exists meta_leadgen_routes_active_provider_identity_unique
  on public.meta_leadgen_routes (
    provider_page_id,
    provider_form_id,
    (replace(provider_ad_account_id, 'act_', ''))
  )
  where status = 'active';

create unique index if not exists meta_leadgen_routes_active_campaign_unique
  on public.meta_leadgen_routes (campaign_id)
  where status = 'active';

create index if not exists meta_leadgen_routes_page_form_lookup_idx
  on public.meta_leadgen_routes (provider_page_id, provider_form_id, status);

create table if not exists public.meta_leadgen_events (
  id uuid primary key default gen_random_uuid(),
  provider_leadgen_id text not null,
  provider_page_id text not null,
  provider_form_id text not null,
  provider_ad_id text null,
  provider_ad_account_id text null,
  provider_created_at timestamptz null,
  payload_digest text not null,
  route_id uuid null,
  organization_id uuid null,
  user_id uuid null,
  campaign_id uuid null,
  status text not null default 'received',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  processing_token uuid null,
  processing_generation bigint not null default 0,
  locked_by text null,
  locked_until timestamptz null,
  reconciliation_job_id uuid null references public.system_jobs(id) on delete set null,
  side_effect_job_id uuid null references public.system_jobs(id) on delete set null,
  lead_id uuid null,
  last_error_code text null,
  last_error_message text null,
  first_received_at timestamptz not null default timezone('utc', now()),
  last_received_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint meta_leadgen_events_provider_lead_unique unique (provider_leadgen_id),
  constraint meta_leadgen_events_provider_identity_check check (
    provider_leadgen_id ~ '^[0-9]{5,40}$'
    and provider_page_id ~ '^[0-9]{5,40}$'
    and provider_form_id ~ '^[0-9]{5,40}$'
    and (provider_ad_id is null or provider_ad_id ~ '^[0-9]{5,40}$')
    and (provider_ad_account_id is null or provider_ad_account_id ~ '^[0-9]{5,40}$')
    and payload_digest ~ '^[0-9a-f]{64}$'
  ),
  constraint meta_leadgen_events_route_scope_check check (
    (route_id is null and organization_id is null and user_id is null and campaign_id is null)
    or
    (route_id is not null and organization_id is not null and user_id is not null and campaign_id is not null)
  ),
  constraint meta_leadgen_events_route_scope_fk
    foreign key (route_id, organization_id, user_id, campaign_id)
    references public.meta_leadgen_routes(id, organization_id, user_id, campaign_id)
    on update restrict on delete restrict,
  constraint meta_leadgen_events_lead_scope_fk
    foreign key (lead_id, organization_id, user_id, campaign_id)
    references public.leads(id, organization_id, user_id, campaign_id)
    on update restrict on delete restrict,
  constraint meta_leadgen_events_status_check check (
    status in (
      'received',
      'processing',
      'pending_reconciliation',
      'persisted',
      'unknown_route',
      'ambiguous_route',
      'operator_required'
    )
  ),
  constraint meta_leadgen_events_attempt_check
    check (attempt_count >= 0 and max_attempts between 1 and 20 and attempt_count <= max_attempts),
  constraint meta_leadgen_events_processing_claim_check check (
    (
      status = 'processing'
      and processing_token is not null
      and locked_by is not null
      and length(trim(locked_by)) > 0
      and locked_until is not null
    )
    or
    (
      status <> 'processing'
      and processing_token is null
      and locked_by is null
      and locked_until is null
    )
  )
);

create index if not exists meta_leadgen_events_reconciliation_idx
  on public.meta_leadgen_events (status, updated_at)
  where status = 'pending_reconciliation';

create index if not exists meta_leadgen_events_tenant_created_idx
  on public.meta_leadgen_events (organization_id, campaign_id, created_at desc)
  where organization_id is not null;

create table if not exists public.meta_leadgen_effect_receipts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.meta_leadgen_events(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  effect_key text not null,
  status text not null,
  reason text null,
  system_job_id uuid null references public.system_jobs(id) on delete set null,
  lead_id uuid null references public.leads(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint meta_leadgen_effect_receipts_event_effect_unique unique (event_id, effect_key),
  constraint meta_leadgen_effect_receipts_key_check check (
    effect_key in (
      'provider_lookup',
      'lead_persistence',
      'agent_notification',
      'meta_conversion',
      'provider_mutation'
    )
  ),
  constraint meta_leadgen_effect_receipts_status_check check (
    status in ('queued', 'processing', 'succeeded', 'suppressed', 'operator_required')
  )
);

create index if not exists meta_leadgen_effect_receipts_event_idx
  on public.meta_leadgen_effect_receipts (event_id, status, effect_key);

alter table public.meta_leadgen_routes enable row level security;
alter table public.meta_leadgen_routes force row level security;
alter table public.meta_leadgen_events enable row level security;
alter table public.meta_leadgen_events force row level security;
alter table public.meta_leadgen_effect_receipts enable row level security;
alter table public.meta_leadgen_effect_receipts force row level security;

revoke all on table public.meta_leadgen_routes from public, anon, authenticated, service_role;
revoke all on table public.meta_leadgen_events from public, anon, authenticated, service_role;
revoke all on table public.meta_leadgen_effect_receipts from public, anon, authenticated, service_role;
grant select on table public.meta_leadgen_routes to service_role;
grant select on table public.meta_leadgen_events to service_role;
grant select on table public.meta_leadgen_effect_receipts to service_role;

create or replace function private.assert_meta_leadgen_service_role()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'meta_leadgen_service_role_required';
  end if;
end;
$$;

revoke all on function private.assert_meta_leadgen_service_role()
  from public, anon, authenticated, service_role;

-- The actor is distinct from the campaign owner because an existing workspace
-- admin may configure routing for an owner's campaign. Remove the earlier
-- actor-less overload so a partial-candidate replay cannot retain the broad
-- membership-only mutation path.
drop function if exists public.upsert_meta_leadgen_route(
  uuid, uuid, uuid, uuid, text, text, text, text
);

create or replace function public.upsert_meta_leadgen_route(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_marketing_account_id uuid,
  p_provider_ad_account_id text,
  p_provider_page_id text,
  p_provider_form_id text,
  p_status text default 'active'
)
returns setof public.meta_leadgen_routes
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  account_record public.marketing_accounts%rowtype;
  existing_route public.meta_leadgen_routes%rowtype;
  route_record public.meta_leadgen_routes%rowtype;
  organization_owner_user_id uuid;
  actor_membership_role text;
begin
  perform private.assert_meta_leadgen_service_role();

  if p_actor_user_id is null
    or p_provider_ad_account_id is null
    or replace(trim(p_provider_ad_account_id), 'act_', '') !~ '^[0-9]{5,40}$'
    or p_provider_page_id is null
    or trim(p_provider_page_id) !~ '^[0-9]{5,40}$'
    or p_provider_form_id is null
    or trim(p_provider_form_id) !~ '^[0-9]{5,40}$'
    or p_status not in ('active', 'disabled', 'operator_required') then
    raise exception using errcode = '22023', message = 'meta_leadgen_route_identity_invalid';
  end if;

  perform 1
  from public.campaign_plans campaign
  where campaign.id = p_campaign_id
    and campaign.organization_id = p_organization_id
    and campaign.user_id = p_user_id
    and campaign.launch_status = 'provider_paused'
  for key share;
  if not found then
    raise exception using errcode = '42501', message = 'meta_leadgen_campaign_scope_or_launch_mismatch';
  end if;

  select organization.owner_user_id
  into organization_owner_user_id
  from public.organizations organization
  where organization.id = p_organization_id
  for key share;
  if not found then
    raise exception using errcode = '42501', message = 'meta_leadgen_organization_scope_mismatch';
  end if;

  if organization_owner_user_id is distinct from p_actor_user_id then
    select lower(trim(membership.role::text))
    into actor_membership_role
    from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = p_actor_user_id
    for key share;
    if not found then
      raise exception using errcode = '42501', message = 'meta_leadgen_membership_required';
    end if;

    if p_actor_user_id is distinct from p_user_id
      and actor_membership_role is distinct from 'admin' then
      raise exception using errcode = '42501', message = 'meta_leadgen_route_role_required';
    end if;
  end if;

  perform 1
  from public.campaign_launch_records launch
  join public.campaign_tracking_contracts tracking
    on tracking.campaign_id = launch.campaign_id
    and tracking.organization_id = launch.organization_id
    and tracking.user_id = launch.user_id
  where launch.campaign_id = p_campaign_id
    and launch.organization_id = p_organization_id
    and launch.user_id = p_user_id
    and launch.result_status = 'success'
    and launch.launch_mode in ('provider_paused', 'scheduled_provider_paused')
    and nullif(trim(coalesce(launch.meta_campaign_id, '')), '') is not null
    and jsonb_typeof(launch.meta_ad_set_ids) = 'array'
    and jsonb_array_length(launch.meta_ad_set_ids) = 1
    and nullif(trim(coalesce(launch.meta_creative_id, '')), '') is not null
    and jsonb_typeof(launch.meta_ad_ids) = 'array'
    and jsonb_array_length(launch.meta_ad_ids) = 1
    and tracking.meta_campaign_id = launch.meta_campaign_id
    and tracking.meta_adset_id = launch.meta_ad_set_ids ->> 0
    and tracking.meta_ad_ids = array[launch.meta_ad_ids ->> 0]
  for key share;
  if not found then
    raise exception using errcode = '42501', message = 'meta_leadgen_launch_receipt_not_ready';
  end if;

  select account.* into account_record
  from public.marketing_accounts account
  where account.id = p_marketing_account_id
    and account.organization_id = p_organization_id
    and account.platform = 'meta_ads'
    and account.status = 'connected'
  for key share;
  if account_record.id is null
    or nullif(trim(coalesce(account_record.access_token_encrypted, '')), '') is null
    or replace(coalesce(account_record.external_account_id, ''), 'act_', '')
      <> replace(trim(p_provider_ad_account_id), 'act_', '')
    or coalesce(account_record.connection_metadata ->> 'selected_page_id', '')
      <> trim(p_provider_page_id) then
    raise exception using errcode = '42501', message = 'meta_leadgen_marketing_scope_mismatch';
  end if;

  select route.* into existing_route
  from public.meta_leadgen_routes route
  where route.provider_page_id = trim(p_provider_page_id)
    and route.provider_form_id = trim(p_provider_form_id)
    and replace(route.provider_ad_account_id, 'act_', '')
      = replace(trim(p_provider_ad_account_id), 'act_', '')
  for update;

  if existing_route.id is null then
    select route.* into existing_route
    from public.meta_leadgen_routes route
    where route.campaign_id = p_campaign_id
      and route.status = 'active'
    for update;
  end if;

  if existing_route.id is not null
    and (
      existing_route.organization_id <> p_organization_id
      or existing_route.user_id <> p_user_id
      or existing_route.campaign_id <> p_campaign_id
    ) then
    raise exception using errcode = '23505', message = 'meta_leadgen_route_identity_conflict';
  end if;

  if existing_route.id is null then
    insert into public.meta_leadgen_routes (
      organization_id,
      user_id,
      campaign_id,
      marketing_account_id,
      provider_ad_account_id,
      provider_page_id,
      provider_form_id,
      status
    ) values (
      p_organization_id,
      p_user_id,
      p_campaign_id,
      p_marketing_account_id,
      replace(trim(p_provider_ad_account_id), 'act_', ''),
      trim(p_provider_page_id),
      trim(p_provider_form_id),
      p_status
    ) returning * into route_record;
  else
    update public.meta_leadgen_routes route
    set marketing_account_id = p_marketing_account_id,
        provider_ad_account_id = replace(trim(p_provider_ad_account_id), 'act_', ''),
        provider_page_id = trim(p_provider_page_id),
        provider_form_id = trim(p_provider_form_id),
        status = p_status,
        updated_at = timezone('utc', now())
    where route.id = existing_route.id
    returning * into route_record;
  end if;

  update public.campaign_tracking_contracts tracking
  set tracking_mode = 'instant_form',
      expected_lead_destination = 'dealflow_dashboard',
      meta_page_id = trim(p_provider_page_id),
      expected_event_name = 'Lead',
      expected_action_source = 'system_generated',
      expected_attribution_params = '{}'::text[],
      status = case when p_status = 'active' then 'configured' else 'disabled' end,
      readiness = jsonb_build_object(
        'ready', p_status = 'active',
        'providerAcceptanceProven', false,
        'providerPageId', trim(p_provider_page_id),
        'providerFormId', trim(p_provider_form_id),
        'providerAdAccountId', replace(trim(p_provider_ad_account_id), 'act_', ''),
        'checked_at', timezone('utc', now())
      ),
      metadata = coalesce(tracking.metadata, '{}'::jsonb) || jsonb_build_object(
        'nativeLeadgenRouteId', route_record.id,
        'providerFormId', trim(p_provider_form_id),
        'providerAdAccountId', replace(trim(p_provider_ad_account_id), 'act_', ''),
        'nativeLeadgenCommunicationsSuppressed', true,
        'nativeLeadgenCapiSuppressed', true
      ),
      last_verified_at = null,
      updated_at = timezone('utc', now())
  where tracking.campaign_id = p_campaign_id
    and tracking.organization_id = p_organization_id
    and tracking.user_id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'meta_leadgen_tracking_contract_missing';
  end if;

  return next route_record;
end;
$$;

create or replace function private.seed_meta_leadgen_effect_truth(
  p_event public.meta_leadgen_events
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.meta_leadgen_effect_receipts (
    event_id, organization_id, effect_key, status, reason
  ) values
    (p_event.id, p_event.organization_id, 'provider_lookup', 'processing', null),
    (p_event.id, p_event.organization_id, 'lead_persistence', 'queued', null),
    (p_event.id, p_event.organization_id, 'agent_notification', 'suppressed', 'native_leadgen_no_communication_default'),
    (p_event.id, p_event.organization_id, 'meta_conversion', 'suppressed', 'native_leadgen_no_capi_default'),
    (p_event.id, p_event.organization_id, 'provider_mutation', 'suppressed', 'read_only_ingestion_contract')
  on conflict (event_id, effect_key) do update
  set status = case
        when excluded.effect_key in ('agent_notification', 'meta_conversion', 'provider_mutation')
          then 'suppressed'
        else excluded.status
      end,
      reason = excluded.reason,
      updated_at = timezone('utc', now());
end;
$$;

revoke all on function private.seed_meta_leadgen_effect_truth(public.meta_leadgen_events)
  from public, anon, authenticated, service_role;

create or replace function public.accept_meta_leadgen_webhook_event(
  p_provider_leadgen_id text,
  p_provider_page_id text,
  p_provider_form_id text,
  p_provider_ad_id text,
  p_provider_created_at timestamptz,
  p_payload_digest text,
  p_worker_id text,
  p_lease_ms integer default 60000
)
returns table (
  event_id uuid,
  disposition text,
  processing_token uuid,
  processing_generation bigint,
  route_id uuid,
  organization_id uuid,
  user_id uuid,
  campaign_id uuid,
  expected_ad_account_id text,
  reconciliation_job_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  event_record public.meta_leadgen_events%rowtype;
  route_record public.meta_leadgen_routes%rowtype;
  route_count integer;
  next_token uuid;
begin
  perform private.assert_meta_leadgen_service_role();

  if p_provider_leadgen_id is null or trim(p_provider_leadgen_id) !~ '^[0-9]{5,40}$'
    or p_provider_page_id is null or trim(p_provider_page_id) !~ '^[0-9]{5,40}$'
    or p_provider_form_id is null or trim(p_provider_form_id) !~ '^[0-9]{5,40}$'
    or (p_provider_ad_id is not null and trim(p_provider_ad_id) !~ '^[0-9]{5,40}$')
    or p_payload_digest is null or trim(p_payload_digest) !~ '^[0-9a-f]{64}$'
    or p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception using errcode = '22023', message = 'meta_leadgen_event_identity_invalid';
  end if;

  insert into public.meta_leadgen_events (
    provider_leadgen_id,
    provider_page_id,
    provider_form_id,
    provider_ad_id,
    provider_created_at,
    payload_digest
  ) values (
    trim(p_provider_leadgen_id),
    trim(p_provider_page_id),
    trim(p_provider_form_id),
    nullif(trim(p_provider_ad_id), ''),
    p_provider_created_at,
    trim(p_payload_digest)
  ) on conflict (provider_leadgen_id) do nothing;

  select candidate.* into event_record
  from public.meta_leadgen_events candidate
  where candidate.provider_leadgen_id = trim(p_provider_leadgen_id)
  for update;

  if event_record.provider_page_id <> trim(p_provider_page_id)
    or event_record.provider_form_id <> trim(p_provider_form_id)
    or event_record.provider_ad_id is distinct from nullif(trim(p_provider_ad_id), '')
    or event_record.payload_digest <> trim(p_payload_digest) then
    update public.meta_leadgen_events candidate
    set status = 'operator_required',
        processing_token = null,
        locked_by = null,
        locked_until = null,
        last_error_code = 'meta_leadgen_event_identity_collision',
        last_error_message = 'A replay used the same provider leadgen id with different immutable identity.',
        updated_at = timezone('utc', now())
    where candidate.id = event_record.id
    returning * into event_record;

    return query select
      event_record.id, 'identity_collision'::text, null::uuid,
      event_record.processing_generation, event_record.route_id,
      event_record.organization_id, event_record.user_id, event_record.campaign_id,
      null::text, event_record.reconciliation_job_id;
    return;
  end if;

  update public.meta_leadgen_events candidate
  set last_received_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where candidate.id = event_record.id;

  if event_record.status = 'persisted' then
    return query select
      event_record.id, 'duplicate_persisted'::text, null::uuid,
      event_record.processing_generation, event_record.route_id,
      event_record.organization_id, event_record.user_id, event_record.campaign_id,
      event_record.provider_ad_account_id, event_record.reconciliation_job_id;
    return;
  end if;

  if event_record.status = 'operator_required' then
    return query select
      event_record.id, 'operator_required'::text, null::uuid,
      event_record.processing_generation, event_record.route_id,
      event_record.organization_id, event_record.user_id, event_record.campaign_id,
      event_record.provider_ad_account_id, event_record.reconciliation_job_id;
    return;
  end if;

  if event_record.status = 'processing'
    and event_record.locked_until is not null
    and event_record.locked_until > timezone('utc', now()) then
    return query select
      event_record.id, 'busy'::text, null::uuid,
      event_record.processing_generation, event_record.route_id,
      event_record.organization_id, event_record.user_id, event_record.campaign_id,
      null::text, event_record.reconciliation_job_id;
    return;
  end if;

  select count(*)::integer into route_count
  from public.meta_leadgen_routes route
  where route.provider_page_id = event_record.provider_page_id
    and route.provider_form_id = event_record.provider_form_id
    and route.status = 'active';

  if route_count = 0 then
    update public.meta_leadgen_events candidate
    set route_id = null,
        organization_id = null,
        user_id = null,
        campaign_id = null,
        status = 'unknown_route',
        processing_token = null,
        locked_by = null,
        locked_until = null,
        last_error_code = 'meta_leadgen_route_unknown',
        last_error_message = 'No active Page/Form route exists.',
        updated_at = timezone('utc', now())
    where candidate.id = event_record.id
    returning * into event_record;

    return query select
      event_record.id, 'unknown_route'::text, null::uuid,
      event_record.processing_generation, null::uuid, null::uuid, null::uuid, null::uuid,
      null::text, event_record.reconciliation_job_id;
    return;
  end if;

  if route_count <> 1 then
    update public.meta_leadgen_events candidate
    set route_id = null,
        organization_id = null,
        user_id = null,
        campaign_id = null,
        status = 'ambiguous_route',
        processing_token = null,
        locked_by = null,
        locked_until = null,
        last_error_code = 'meta_leadgen_route_ambiguous',
        last_error_message = 'More than one active tenant route matches the Page/Form identity.',
        updated_at = timezone('utc', now())
    where candidate.id = event_record.id
    returning * into event_record;

    return query select
      event_record.id, 'ambiguous_route'::text, null::uuid,
      event_record.processing_generation, null::uuid, null::uuid, null::uuid, null::uuid,
      null::text, event_record.reconciliation_job_id;
    return;
  end if;

  select route.* into route_record
  from public.meta_leadgen_routes route
  where route.provider_page_id = event_record.provider_page_id
    and route.provider_form_id = event_record.provider_form_id
    and route.status = 'active'
  for key share;

  if event_record.attempt_count >= event_record.max_attempts then
    update public.meta_leadgen_events candidate
    set route_id = route_record.id,
        organization_id = route_record.organization_id,
        user_id = route_record.user_id,
        campaign_id = route_record.campaign_id,
        status = 'operator_required',
        processing_token = null,
        locked_by = null,
        locked_until = null,
        last_error_code = 'meta_leadgen_max_attempts_exhausted',
        last_error_message = 'Provider reconciliation attempts are exhausted.',
        updated_at = timezone('utc', now())
    where candidate.id = event_record.id
    returning * into event_record;
    perform private.seed_meta_leadgen_effect_truth(event_record);

    return query select
      event_record.id, 'operator_required'::text, null::uuid,
      event_record.processing_generation, event_record.route_id,
      event_record.organization_id, event_record.user_id, event_record.campaign_id,
      route_record.provider_ad_account_id, event_record.reconciliation_job_id;
    return;
  end if;

  next_token := gen_random_uuid();
  update public.meta_leadgen_events candidate
  set route_id = route_record.id,
      organization_id = route_record.organization_id,
      user_id = route_record.user_id,
      campaign_id = route_record.campaign_id,
      status = 'processing',
      attempt_count = candidate.attempt_count,
      processing_token = next_token,
      processing_generation = candidate.processing_generation + 1,
      locked_by = trim(p_worker_id),
      locked_until = timezone('utc', now())
        + (least(greatest(p_lease_ms, 1000), 300000)::text || ' milliseconds')::interval,
      last_error_code = null,
      last_error_message = null,
      updated_at = timezone('utc', now())
  where candidate.id = event_record.id
  returning * into event_record;

  perform private.seed_meta_leadgen_effect_truth(event_record);

  return query select
    event_record.id, 'claimed'::text, event_record.processing_token,
    event_record.processing_generation, event_record.route_id,
    event_record.organization_id, event_record.user_id, event_record.campaign_id,
    route_record.provider_ad_account_id, event_record.reconciliation_job_id;
end;
$$;

create or replace function public.claim_meta_leadgen_reconciliation(
  p_event_id uuid,
  p_worker_id text,
  p_lease_ms integer default 300000
)
returns table (
  event_id uuid,
  disposition text,
  processing_token uuid,
  processing_generation bigint,
  route_id uuid,
  organization_id uuid,
  user_id uuid,
  campaign_id uuid,
  expected_ad_account_id text,
  marketing_account_id uuid,
  provider_leadgen_id text,
  provider_page_id text,
  provider_form_id text,
  provider_ad_id text,
  payload_digest text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  event_record public.meta_leadgen_events%rowtype;
  route_record public.meta_leadgen_routes%rowtype;
begin
  perform private.assert_meta_leadgen_service_role();
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception using errcode = '22023', message = 'meta_leadgen_worker_required';
  end if;

  select candidate.* into event_record
  from public.meta_leadgen_events candidate
  where candidate.id = p_event_id
  for update;
  if event_record.id is null then
    raise exception using errcode = 'P0002', message = 'meta_leadgen_event_not_found';
  end if;

  if event_record.status = 'persisted' then
    return query select
      event_record.id, 'duplicate_persisted'::text, null::uuid,
      event_record.processing_generation, event_record.route_id,
      event_record.organization_id, event_record.user_id, event_record.campaign_id,
      event_record.provider_ad_account_id, null::uuid,
      event_record.provider_leadgen_id, event_record.provider_page_id,
      event_record.provider_form_id, event_record.provider_ad_id, event_record.payload_digest;
    return;
  end if;

  if event_record.status = 'operator_required' then
    return query select
      event_record.id, 'operator_required'::text, null::uuid,
      event_record.processing_generation, event_record.route_id,
      event_record.organization_id, event_record.user_id, event_record.campaign_id,
      event_record.provider_ad_account_id, null::uuid,
      event_record.provider_leadgen_id, event_record.provider_page_id,
      event_record.provider_form_id, event_record.provider_ad_id, event_record.payload_digest;
    return;
  end if;

  if event_record.status = 'processing'
    and event_record.locked_until is not null
    and event_record.locked_until > timezone('utc', now()) then
    return query select
      event_record.id, 'busy'::text, null::uuid,
      event_record.processing_generation, event_record.route_id,
      event_record.organization_id, event_record.user_id, event_record.campaign_id,
      null::text, null::uuid,
      event_record.provider_leadgen_id, event_record.provider_page_id,
      event_record.provider_form_id, event_record.provider_ad_id, event_record.payload_digest;
    return;
  end if;

  select route.* into route_record
  from public.meta_leadgen_routes route
  where route.id = event_record.route_id
    and route.organization_id = event_record.organization_id
    and route.user_id = event_record.user_id
    and route.campaign_id = event_record.campaign_id
    and route.provider_page_id = event_record.provider_page_id
    and route.provider_form_id = event_record.provider_form_id
    and route.status = 'active'
  for key share;

  if route_record.id is null or event_record.attempt_count >= event_record.max_attempts then
    update public.meta_leadgen_events candidate
    set status = 'operator_required',
        processing_token = null,
        locked_by = null,
        locked_until = null,
        last_error_code = case
          when route_record.id is null then 'meta_leadgen_route_changed'
          else 'meta_leadgen_max_attempts_exhausted'
        end,
        last_error_message = case
          when route_record.id is null then 'The exact tenant route changed before reconciliation.'
          else 'Provider reconciliation attempts are exhausted.'
        end,
        updated_at = timezone('utc', now())
    where candidate.id = event_record.id
    returning * into event_record;

    return query select
      event_record.id, 'operator_required'::text, null::uuid,
      event_record.processing_generation, event_record.route_id,
      event_record.organization_id, event_record.user_id, event_record.campaign_id,
      null::text, null::uuid,
      event_record.provider_leadgen_id, event_record.provider_page_id,
      event_record.provider_form_id, event_record.provider_ad_id, event_record.payload_digest;
    return;
  end if;

  update public.meta_leadgen_events candidate
  set status = 'processing',
      attempt_count = candidate.attempt_count + 1,
      processing_token = gen_random_uuid(),
      processing_generation = candidate.processing_generation + 1,
      locked_by = trim(p_worker_id),
      locked_until = timezone('utc', now())
        + (least(greatest(p_lease_ms, 1000), 600000)::text || ' milliseconds')::interval,
      last_error_code = null,
      last_error_message = null,
      updated_at = timezone('utc', now())
  where candidate.id = event_record.id
  returning * into event_record;

  update public.meta_leadgen_effect_receipts effect
  set status = 'processing', reason = null, updated_at = timezone('utc', now())
  where effect.event_id = event_record.id
    and effect.effect_key = 'provider_lookup';

  return query select
    event_record.id, 'claimed'::text, event_record.processing_token,
    event_record.processing_generation, event_record.route_id,
    event_record.organization_id, event_record.user_id, event_record.campaign_id,
    route_record.provider_ad_account_id, route_record.marketing_account_id,
    event_record.provider_leadgen_id, event_record.provider_page_id,
    event_record.provider_form_id, event_record.provider_ad_id, event_record.payload_digest;
end;
$$;

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
  if event_record.id is null then
    return false;
  end if;

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
    set status = 'pending_reconciliation',
        processing_token = null,
        locked_by = null,
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
    where effect.event_id = event_record.id
      and effect.effect_key = 'provider_lookup';
    return true;
  end if;

  if p_status = 'operator_required' then
    update public.meta_leadgen_events candidate
    set status = 'operator_required',
        processing_token = null,
        locked_by = null,
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

  perform 1
  from public.leads lead
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
  if coalesce(side_effect.payload -> 'enabledEffects', 'null'::jsonb) <> '[]'::jsonb
    or coalesce(side_effect.payload -> 'requiredEffects', 'null'::jsonb) <> '[]'::jsonb
    or side_effect.payload ? 'metaConversion'
    or side_effect.payload ? 'advertisingConsent' then
    raise exception using errcode = '42501', message = 'meta_leadgen_side_effect_policy_mismatch';
  end if;

  update public.meta_leadgen_events candidate
  set status = 'persisted',
      provider_ad_account_id = replace(trim(p_provider_ad_account_id), 'act_', ''),
      provider_ad_id = trim(p_provider_ad_id),
      lead_id = p_lead_id,
      side_effect_job_id = p_side_effect_job_id,
      processing_token = null,
      locked_by = null,
      locked_until = null,
      last_error_code = null,
      last_error_message = null,
      completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where candidate.id = event_record.id;

  update public.meta_leadgen_effect_receipts effect
  set status = 'succeeded',
      reason = null,
      lead_id = p_lead_id,
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

revoke all on function public.upsert_meta_leadgen_route(uuid, uuid, uuid, uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.accept_meta_leadgen_webhook_event(text, text, text, text, timestamptz, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.claim_meta_leadgen_reconciliation(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.settle_meta_leadgen_event(uuid, uuid, bigint, text, text, text, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.upsert_meta_leadgen_route(uuid, uuid, uuid, uuid, uuid, text, text, text, text)
  to service_role;
grant execute on function public.accept_meta_leadgen_webhook_event(text, text, text, text, timestamptz, text, text, integer)
  to service_role;
grant execute on function public.claim_meta_leadgen_reconciliation(uuid, text, integer)
  to service_role;
grant execute on function public.settle_meta_leadgen_event(uuid, uuid, bigint, text, text, text, uuid, uuid, uuid, text, text)
  to service_role;

comment on table public.meta_leadgen_routes is
  'Explicit provider Page/Form/ad-account to campaign tenant routes. No first-match or client-supplied organization resolution is allowed.';
comment on table public.meta_leadgen_events is
  'Signed Meta leadgen receipt and reconciliation outbox. Provider PII is never stored here; only immutable provider IDs and a payload digest are retained.';
comment on table public.meta_leadgen_effect_receipts is
  'Per-effect truth for native leadgen ingestion, including default suppression of communications, CAPI, and provider mutations.';

-- Add the reconciliation worker to the existing v2 hard-cutover claim protocol.
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
    raise exception using errcode = '22023', message = 'system_job_claim_protocol_unsupported';
  end if;
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'p_worker_id is required';
  end if;

  update public.meta_leadgen_events event
  set status = 'operator_required',
      processing_token = null,
      locked_by = null,
      locked_until = null,
      last_error_code = 'meta_leadgen_max_attempts_exhausted',
      last_error_message = 'The reconciliation job exhausted its attempts before a fenced terminal result.',
      updated_at = timezone('utc', now())
  from public.system_jobs job
  where event.reconciliation_job_id = job.id
    and event.status in ('processing', 'pending_reconciliation')
    and job.kind = 'meta_leadgen_reconciliation'
    and job.dead_lettered_at is null
    and job.status in ('pending', 'processing')
    and job.attempt_count >= job.max_attempts
    and (job.status = 'pending' or job.locked_until is null or job.locked_until <= now());

  update public.meta_leadgen_effect_receipts effect
  set status = 'operator_required',
      reason = 'meta_leadgen_max_attempts_exhausted',
      updated_at = timezone('utc', now())
  from public.meta_leadgen_events event
  where effect.event_id = event.id
    and event.status = 'operator_required'
    and event.last_error_code = 'meta_leadgen_max_attempts_exhausted'
    and effect.effect_key in ('provider_lookup', 'lead_persistence');

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
      'static_creative_generation', 'video_generation', 'video_generation_status',
      'lead_capture_retry', 'lead_side_effects', 'meta_leadgen_reconciliation'
    )
    and attempt_count >= max_attempts
    and (status = 'pending' or locked_until is null or locked_until <= now());

  with candidate as (
    select id
    from public.system_jobs
    where (
        status = 'pending'
        or (status = 'processing' and locked_until is not null and locked_until <= now())
      )
      and (next_run_at is null or next_run_at <= now())
      and dead_lettered_at is null
      and attempt_count < max_attempts
      and kind in (
        'static_creative_generation', 'video_generation', 'video_generation_status',
        'lead_capture_retry', 'lead_side_effects', 'meta_leadgen_reconciliation'
      )
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.system_jobs
  set status = 'processing',
      locked_by = p_worker_id,
      locked_until = now()
        + (least(greatest(p_lease_ms, 1000), 3600000)::text || ' milliseconds')::interval,
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
  return query select * from public.system_jobs where id = claimed_id;
end;
$$;

revoke execute on function public.claim_next_system_job_v2(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_next_system_job_v2(text, integer, integer)
  to service_role;

insert into public.app_schema_metadata(key, value)
values ('schema_version', '20260710235990')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
