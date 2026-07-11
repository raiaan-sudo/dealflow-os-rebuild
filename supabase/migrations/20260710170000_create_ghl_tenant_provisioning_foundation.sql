-- Local-only GHL foundation. Applying this migration to any shared or production
-- database remains a separate approval boundary.

create table if not exists public.ghl_workspace_tenants (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  tenant_kind text not null,
  partner_id uuid null references public.partners (id) on delete restrict,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_workspace_tenants_kind_check
    check (tenant_kind in ('direct_realtor', 'partner_child')),
  constraint ghl_workspace_tenants_partner_check
    check (
      (tenant_kind = 'direct_realtor' and partner_id is null)
      or (tenant_kind = 'partner_child' and partner_id is not null)
    ),
  constraint ghl_workspace_tenants_status_check
    check (status in ('active', 'inactive'))
);

comment on table public.ghl_workspace_tenants is
  'Internal DealFlow hierarchy binding. Ordinary realtor UI must not expose platform, partner, installation, or provider-location mechanics.';

create table if not exists public.ghl_installations (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  owner_kind text not null,
  partner_id uuid null references public.partners (id) on delete restrict,
  provider_agency_id text not null,
  encrypted_credential_ref text null,
  status text not null default 'inactive',
  capability_manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_installations_environment_check
    check (environment in ('production', 'sandbox', 'test')),
  constraint ghl_installations_owner_check
    check (
      (owner_kind = 'platform' and partner_id is null)
      or (owner_kind = 'partner' and partner_id is not null)
    ),
  constraint ghl_installations_status_check
    check (status in ('inactive', 'active', 'revoked')),
  constraint ghl_installations_id_environment_unique unique (id, environment)
);

create unique index if not exists ghl_installations_active_agency_environment_unique
  on public.ghl_installations (environment, provider_agency_id)
  where status = 'active';

comment on column public.ghl_installations.encrypted_credential_ref is
  'Reference to separately controlled encrypted credential material; never a plaintext access token.';

create table if not exists public.ghl_snapshot_manifests (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  snapshot_key text not null,
  snapshot_version text not null,
  provider_snapshot_id text not null,
  required_objects jsonb not null,
  status text not null default 'draft',
  approved_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_snapshot_manifests_environment_check
    check (environment in ('production', 'sandbox', 'test')),
  constraint ghl_snapshot_manifests_required_objects_check
    check (
      jsonb_typeof(required_objects) = 'array'
      and jsonb_array_length(required_objects) > 0
    ),
  constraint ghl_snapshot_manifests_status_check
    check (status in ('draft', 'approved', 'retired')),
  constraint ghl_snapshot_manifests_version_unique
    unique (environment, snapshot_key, snapshot_version),
  constraint ghl_snapshot_manifests_id_environment_unique
    unique (id, environment)
);

comment on table public.ghl_snapshot_manifests is
  'Versioned snapshot identity plus the required pipelines, stages, workflows, tags, calendars, and custom fields that must be verified before readiness.';

create table if not exists public.ghl_location_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants (organization_id) on delete restrict,
  partner_id uuid null references public.partners (id) on delete restrict,
  installation_id uuid not null,
  environment text not null,
  provider_location_id text not null,
  provisioning_owner text not null,
  snapshot_manifest_id uuid null,
  status text not null default 'provisioning',
  snapshot_verified_at timestamptz null,
  required_objects_verified_at timestamptz null,
  last_reconciled_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_location_mappings_environment_check
    check (environment in ('production', 'sandbox', 'test')),
  constraint ghl_location_mappings_owner_check
    check (provisioning_owner in ('platform', 'partner')),
  constraint ghl_location_mappings_status_check
    check (status in ('provisioning', 'active', 'inactive', 'operator_action_required')),
  constraint ghl_location_mappings_verification_check
    check (
      required_objects_verified_at is null
      or snapshot_verified_at is not null
    ),
  constraint ghl_location_mappings_active_ready_check
    check (
      status <> 'active'
      or (
        snapshot_manifest_id is not null
        and snapshot_verified_at is not null
        and required_objects_verified_at is not null
      )
    ),
  constraint ghl_location_mappings_installation_environment_fk
    foreign key (installation_id, environment)
    references public.ghl_installations (id, environment)
    on delete restrict,
  constraint ghl_location_mappings_snapshot_environment_fk
    foreign key (snapshot_manifest_id, environment)
    references public.ghl_snapshot_manifests (id, environment)
    on delete restrict,
  constraint ghl_location_mappings_id_organization_unique unique (id, organization_id)
);

-- A ready workspace has one and only one active location in an environment.
-- The first index provides the "at most one" side. The provisioning READY
-- trigger below provides the "at least one" side for a ready run.
create unique index if not exists ghl_location_mappings_active_workspace_environment_unique
  on public.ghl_location_mappings (organization_id, environment)
  where status = 'active';

-- Provider locations may never be actively routed to two DealFlow workspaces.
create unique index if not exists ghl_location_mappings_active_provider_location_unique
  on public.ghl_location_mappings (environment, provider_location_id)
  where status = 'active';

-- Provisioning and active mappings are both routable claims. These additional
-- indexes close the race before a provisional mapping reaches active status.
create unique index if not exists ghl_location_mappings_routable_workspace_environment_unique
  on public.ghl_location_mappings (organization_id, environment)
  where status in ('provisioning', 'active');

create unique index if not exists ghl_location_mappings_routable_provider_location_unique
  on public.ghl_location_mappings (environment, provider_location_id)
  where status in ('provisioning', 'active');

create table if not exists public.ghl_provisioning_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants (organization_id) on delete restrict,
  environment text not null,
  activation_event_id text not null,
  installation_id uuid not null,
  snapshot_manifest_id uuid not null,
  location_mapping_id uuid null,
  idempotency_key text not null,
  state text not null default 'requested',
  resume_state text null,
  reconcile_before_retry boolean not null default false,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  revision integer not null default 0,
  last_reconciled_at timestamptz null,
  next_retry_at timestamptz null,
  last_error_code text null,
  last_error_message text null,
  state_metadata jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default timezone('utc', now()),
  ready_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_provisioning_runs_environment_check
    check (environment in ('production', 'sandbox', 'test')),
  constraint ghl_provisioning_runs_state_check
    check (state in (
      'requested',
      'location_create_requested',
      'location_uncertain',
      'location_assigned',
      'snapshot_install_requested',
      'snapshot_installing',
      'snapshot_verifying',
      'required_objects_verifying',
      'ready',
      'retryable_failure',
      'operator_action_required',
      'canceled'
    )),
  constraint ghl_provisioning_runs_resume_state_check
    check (resume_state is null or resume_state in (
      'location_create_requested',
      'snapshot_install_requested',
      'snapshot_verifying',
      'required_objects_verifying'
    )),
  constraint ghl_provisioning_runs_attempt_check
    check (attempt_count >= 0 and max_attempts > 0 and attempt_count <= max_attempts),
  constraint ghl_provisioning_runs_idempotency_unique unique (idempotency_key),
  constraint ghl_provisioning_runs_id_organization_unique unique (id, organization_id),
  constraint ghl_provisioning_runs_installation_environment_fk
    foreign key (installation_id, environment)
    references public.ghl_installations (id, environment)
    on delete restrict,
  constraint ghl_provisioning_runs_snapshot_environment_fk
    foreign key (snapshot_manifest_id, environment)
    references public.ghl_snapshot_manifests (id, environment)
    on delete restrict,
  constraint ghl_provisioning_runs_location_tenant_fk
    foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings (id, organization_id)
    on delete restrict
);

create unique index if not exists ghl_provisioning_runs_one_inflight_per_workspace_environment
  on public.ghl_provisioning_runs (organization_id, environment)
  where state not in ('ready', 'operator_action_required', 'canceled');

create index if not exists ghl_provisioning_runs_due_idx
  on public.ghl_provisioning_runs (state, next_retry_at)
  where state = 'retryable_failure';

create table if not exists public.ghl_provider_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants (organization_id) on delete restrict,
  provisioning_run_id uuid null references public.ghl_provisioning_runs (id) on delete restrict,
  operation text not null,
  idempotency_key text not null,
  status text not null default 'pending',
  request_payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  available_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz null,
  locked_by text null,
  lease_token uuid null,
  lease_generation bigint not null default 0,
  lease_expires_at timestamptz null,
  completed_at timestamptz null,
  last_error_code text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_provider_outbox_operation_check
    check (operation in (
      'location_create',
      'location_reconcile',
      'snapshot_install',
      'snapshot_status',
      'required_objects_verify',
      'lead_contact_upsert',
      'lead_opportunity_upsert',
      'lead_tag_apply',
      'lead_workflow_enroll',
      'appointment_sync'
    )),
  constraint ghl_provider_outbox_status_check
    check (status in (
      'pending',
      'dispatching',
      'uncertain',
      'succeeded',
      'retryable_failure',
      'operator_action_required',
      'canceled'
    )),
  constraint ghl_provider_outbox_attempt_check check (attempt_count >= 0),
  constraint ghl_provider_outbox_lease_generation_check check (lease_generation >= 0),
  constraint ghl_provider_outbox_idempotency_unique unique (idempotency_key),
  constraint ghl_provider_outbox_id_organization_unique unique (id, organization_id),
  constraint ghl_provider_outbox_provisioning_tenant_fk
    foreign key (provisioning_run_id, organization_id)
    references public.ghl_provisioning_runs (id, organization_id)
    on delete restrict
);

comment on column public.ghl_provider_outbox.request_payload is
  'Sanitized provider request contract only. Do not persist credentials, tokens, raw lead PII, or full provider responses.';

create index if not exists ghl_provider_outbox_due_idx
  on public.ghl_provider_outbox (status, available_at)
  where status in ('pending', 'retryable_failure');

create index if not exists ghl_provider_outbox_active_lease_idx
  on public.ghl_provider_outbox (status, lease_expires_at, lease_generation)
  where status = 'dispatching';

create table if not exists public.ghl_provider_receipts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.ghl_provider_outbox (id) on delete restrict,
  attempt_number integer not null,
  outcome text not null,
  provider_request_id text null,
  provider_reference text null,
  http_status integer null,
  response_fingerprint text null,
  receipt_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default timezone('utc', now()),
  constraint ghl_provider_receipts_attempt_check check (attempt_number > 0),
  constraint ghl_provider_receipts_outcome_check
    check (outcome in ('accepted', 'succeeded', 'not_found', 'uncertain', 'retryable_failure', 'operator_action_required')),
  constraint ghl_provider_receipts_http_status_check
    check (http_status is null or (http_status >= 100 and http_status <= 599)),
  constraint ghl_provider_receipts_attempt_unique unique (outbox_id, attempt_number)
);

comment on table public.ghl_provider_receipts is
  'Append-only sanitized provider evidence. It records outcomes and durable references without credentials or raw customer payloads.';

create index if not exists ghl_provider_receipts_provider_request_idx
  on public.ghl_provider_receipts (provider_request_id)
  where provider_request_id is not null;

-- Existing lead rows become a same-tenant foreign-key target. This does not
-- rewrite lead data; id is already unique, so the index is additive.
create unique index if not exists leads_id_organization_unique
  on public.leads (id, organization_id);

create table if not exists public.ghl_lead_effect_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants (organization_id) on delete restrict,
  lead_id uuid not null,
  location_mapping_id uuid not null,
  effect_kind text not null,
  idempotency_key text not null,
  status text not null default 'pending',
  outbox_id uuid null,
  provider_contact_id text null,
  provider_opportunity_id text null,
  provider_object_id text null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  next_retry_at timestamptz null,
  last_error_code text null,
  last_error_message text null,
  replay_requested_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_lead_effect_events_tenant_lead_fk
    foreign key (lead_id, organization_id)
    references public.leads (id, organization_id)
    on delete cascade,
  constraint ghl_lead_effect_events_tenant_mapping_fk
    foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings (id, organization_id)
    on delete restrict,
  constraint ghl_lead_effect_events_tenant_outbox_fk
    foreign key (outbox_id, organization_id)
    references public.ghl_provider_outbox (id, organization_id)
    on delete restrict,
  constraint ghl_lead_effect_events_kind_check
    check (effect_kind in (
      'contact_upsert',
      'opportunity_upsert',
      'tag_apply',
      'workflow_enroll',
      'appointment_sync'
    )),
  constraint ghl_lead_effect_events_status_check
    check (status in (
      'pending',
      'replay_requested',
      'dispatching',
      'uncertain',
      'succeeded',
      'retryable_failure',
      'operator_action_required',
      'canceled'
    )),
  constraint ghl_lead_effect_events_attempt_check
    check (attempt_count >= 0 and max_attempts > 0 and attempt_count <= max_attempts),
  constraint ghl_lead_effect_events_idempotency_unique unique (idempotency_key),
  constraint ghl_lead_effect_events_id_organization_unique unique (id, organization_id)
);

create index if not exists ghl_lead_effect_events_lead_created_idx
  on public.ghl_lead_effect_events (lead_id, created_at desc);

create index if not exists ghl_lead_effect_events_due_idx
  on public.ghl_lead_effect_events (status, next_retry_at)
  where status in ('replay_requested', 'retryable_failure');

create unique index if not exists ghl_lead_effect_events_outbox_unique
  on public.ghl_lead_effect_events (outbox_id)
  where outbox_id is not null;

create table if not exists public.ghl_operator_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants (organization_id) on delete restrict,
  provisioning_run_id uuid null,
  lead_effect_event_id uuid null,
  request_kind text not null,
  blocker_code text not null,
  idempotency_key text not null,
  status text not null default 'open',
  details jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_operator_requests_kind_check
    check (request_kind in (
      'location_reconciliation',
      'snapshot_verification',
      'required_object_repair',
      'funnel_publication',
      'lead_effect_reconciliation'
    )),
  constraint ghl_operator_requests_status_check
    check (status in ('open', 'acknowledged', 'resolved', 'canceled')),
  constraint ghl_operator_requests_idempotency_unique unique (idempotency_key),
  constraint ghl_operator_requests_target_check
    check (provisioning_run_id is not null or lead_effect_event_id is not null),
  constraint ghl_operator_requests_provisioning_tenant_fk
    foreign key (provisioning_run_id, organization_id)
    references public.ghl_provisioning_runs (id, organization_id)
    on delete restrict,
  constraint ghl_operator_requests_lead_effect_tenant_fk
    foreign key (lead_effect_event_id, organization_id)
    references public.ghl_lead_effect_events (id, organization_id)
    on delete restrict
);

comment on table public.ghl_operator_requests is
  'Explicit operator work. Funnel publication uses blocker_code BLOCKED_EXTERNAL until a sanctioned provider capability is proven.';

create or replace function public.set_ghl_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.enforce_ghl_location_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tenant_record public.ghl_workspace_tenants%rowtype;
  installation_record public.ghl_installations%rowtype;
begin
  if tg_op = 'UPDATE' and (
    old.organization_id is distinct from new.organization_id
    or old.partner_id is distinct from new.partner_id
    or old.installation_id is distinct from new.installation_id
    or old.environment is distinct from new.environment
    or old.provider_location_id is distinct from new.provider_location_id
    or old.provisioning_owner is distinct from new.provisioning_owner
    or old.snapshot_manifest_id is distinct from new.snapshot_manifest_id
  ) then
    raise exception 'GHL mapping identity is immutable; retire it and create a reconciled replacement.';
  end if;

  select * into strict tenant_record
  from public.ghl_workspace_tenants
  where organization_id = new.organization_id;

  select * into strict installation_record
  from public.ghl_installations
  where id = new.installation_id
    and environment = new.environment;

  if tenant_record.tenant_kind = 'direct_realtor' and new.partner_id is not null then
    raise exception 'Direct realtor GHL mappings cannot carry a partner id.';
  end if;

  if tenant_record.tenant_kind = 'partner_child' and new.partner_id is distinct from tenant_record.partner_id then
    raise exception 'Partner-child GHL mapping does not match the workspace hierarchy.';
  end if;

  if installation_record.owner_kind = 'partner'
     and new.partner_id is distinct from installation_record.partner_id then
    raise exception 'Partner-owned GHL installation cannot be used outside its partner hierarchy.';
  end if;

  if new.provisioning_owner = 'partner' and new.partner_id is null then
    raise exception 'Partner provisioning requires a partner id.';
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'active'
     and new.status <> 'active'
     and exists (
       select 1
       from public.ghl_provisioning_runs run_record
       where run_record.location_mapping_id = old.id
         and run_record.state = 'ready'
     ) then
    raise exception 'An active GHL mapping cannot be retired while a provisioning run is READY.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_ghl_hierarchy_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    old.tenant_kind is distinct from new.tenant_kind
    or old.partner_id is distinct from new.partner_id
  ) and exists (
    select 1
    from public.ghl_location_mappings mapping_record
    where mapping_record.organization_id = old.organization_id
      and mapping_record.status in ('provisioning', 'active')
  ) then
    raise exception 'GHL workspace hierarchy cannot change while a routable location mapping exists.';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_ghl_installation_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    old.environment is distinct from new.environment
    or old.owner_kind is distinct from new.owner_kind
    or old.partner_id is distinct from new.partner_id
    or old.provider_agency_id is distinct from new.provider_agency_id
  ) and exists (
    select 1
    from public.ghl_location_mappings mapping_record
    where mapping_record.installation_id = old.id
      and mapping_record.status in ('provisioning', 'active')
  ) then
    raise exception 'GHL installation identity cannot change while a routable location mapping exists.';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_ghl_snapshot_manifest_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    old.environment is distinct from new.environment
    or old.snapshot_key is distinct from new.snapshot_key
    or old.snapshot_version is distinct from new.snapshot_version
    or old.provider_snapshot_id is distinct from new.provider_snapshot_id
    or old.required_objects is distinct from new.required_objects
  ) and exists (
    select 1
    from public.ghl_provisioning_runs run_record
    where run_record.snapshot_manifest_id = old.id
  ) then
    raise exception 'A referenced GHL snapshot manifest is immutable; create a new version.';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_ghl_provisioning_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  mapping_record public.ghl_location_mappings%rowtype;
  manifest_record public.ghl_snapshot_manifests%rowtype;
  transition_allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.state <> 'requested' then
      raise exception 'A GHL provisioning run must begin in requested state.';
    end if;
    return new;
  end if;

  if old.organization_id is distinct from new.organization_id
     or old.environment is distinct from new.environment
     or old.activation_event_id is distinct from new.activation_event_id
     or old.installation_id is distinct from new.installation_id
     or old.snapshot_manifest_id is distinct from new.snapshot_manifest_id
     or old.idempotency_key is distinct from new.idempotency_key then
    raise exception 'GHL provisioning identity is immutable.';
  end if;

  if old.location_mapping_id is not null
     and old.location_mapping_id is distinct from new.location_mapping_id then
    raise exception 'An assigned GHL location mapping cannot be replaced in-place.';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'GHL provisioning updates require exactly one optimistic revision increment.';
  end if;

  if new.state = old.state then
    if new.state = 'location_uncertain' and not new.reconcile_before_retry then
      raise exception 'An uncertain GHL location must retain its reconciliation gate.';
    end if;
    return new;
  end if;

  transition_allowed := case old.state
    when 'requested' then new.state in ('location_create_requested', 'operator_action_required', 'canceled')
    when 'location_create_requested' then new.state in ('location_uncertain', 'location_assigned', 'retryable_failure', 'operator_action_required', 'canceled')
    when 'location_uncertain' then new.state in ('location_assigned', 'retryable_failure', 'operator_action_required', 'canceled')
    when 'location_assigned' then new.state in ('snapshot_install_requested', 'operator_action_required', 'canceled')
    when 'snapshot_install_requested' then new.state in ('snapshot_installing', 'retryable_failure', 'operator_action_required', 'canceled')
    when 'snapshot_installing' then new.state in ('snapshot_verifying', 'retryable_failure', 'operator_action_required', 'canceled')
    when 'snapshot_verifying' then new.state in ('snapshot_installing', 'required_objects_verifying', 'retryable_failure', 'operator_action_required', 'canceled')
    when 'required_objects_verifying' then new.state in ('ready', 'retryable_failure', 'operator_action_required', 'canceled')
    when 'retryable_failure' then new.state in ('location_create_requested', 'snapshot_install_requested', 'snapshot_verifying', 'required_objects_verifying', 'operator_action_required', 'canceled')
    else false
  end;

  if not transition_allowed then
    raise exception 'Invalid GHL provisioning transition from % to %.', old.state, new.state;
  end if;

  if new.state = 'location_uncertain' then
    new.reconcile_before_retry = true;
  end if;

  if old.state = 'location_uncertain' and new.state = 'retryable_failure' then
    if new.last_reconciled_at is null or new.last_reconciled_at < old.updated_at then
      raise exception 'An uncertain GHL location result must be reconciled before retry.';
    end if;
    new.reconcile_before_retry = false;
  end if;

  if old.state = 'retryable_failure' then
    if old.resume_state is null or new.state <> old.resume_state then
      raise exception 'GHL replay must resume only the recorded retry state.';
    end if;
    new.resume_state = null;
    new.next_retry_at = null;
  end if;

  if new.state = 'ready' then
    if new.location_mapping_id is null then
      raise exception 'READY requires an active tenant/location mapping.';
    end if;

    select * into strict mapping_record
    from public.ghl_location_mappings
    where id = new.location_mapping_id
      and organization_id = new.organization_id
      and environment = new.environment
      and status = 'active';

    select * into strict manifest_record
    from public.ghl_snapshot_manifests
    where id = new.snapshot_manifest_id
      and environment = new.environment
      and status = 'approved';

    if mapping_record.snapshot_manifest_id is distinct from manifest_record.id
       or mapping_record.snapshot_verified_at is null
       or mapping_record.required_objects_verified_at is null then
      raise exception 'READY requires the approved snapshot and required-object verification.';
    end if;

    new.ready_at = coalesce(new.ready_at, timezone('utc', now()));
  end if;

  return new;
end;
$$;

create or replace function public.enforce_ghl_outbox_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  transition_allowed boolean := false;
begin
  if old.organization_id is distinct from new.organization_id
     or old.provisioning_run_id is distinct from new.provisioning_run_id
     or old.operation is distinct from new.operation
     or old.idempotency_key is distinct from new.idempotency_key
     or old.request_payload is distinct from new.request_payload then
    raise exception 'GHL provider outbox request identity is immutable.';
  end if;
  if new.attempt_count < old.attempt_count then
    raise exception 'GHL provider outbox attempt count cannot decrease.';
  end if;

  if new.status = 'dispatching' then
    if new.locked_at is null
       or new.locked_by is null
       or length(trim(new.locked_by)) = 0
       or new.lease_token is null
       or new.lease_expires_at is null
       or new.lease_expires_at <= new.locked_at then
      raise exception 'A dispatching GHL outbox row requires a complete live lease.';
    end if;

    if new.attempt_count <> old.attempt_count + 1
       or new.lease_generation <> old.lease_generation + 1 then
      raise exception 'Each GHL outbox claim must advance exactly one attempt and fencing generation.';
    end if;
  else
    if new.locked_at is not null
       or new.locked_by is not null
       or new.lease_token is not null
       or new.lease_expires_at is not null then
      raise exception 'A non-dispatching GHL outbox row cannot retain a worker lease.';
    end if;

    if new.attempt_count <> old.attempt_count
       or new.lease_generation <> old.lease_generation then
      raise exception 'GHL outbox attempts and fencing generations change only during claim.';
    end if;
  end if;

  if new.status = old.status then
    if new.status <> 'dispatching'
       and (
         new.locked_at is distinct from old.locked_at
         or new.locked_by is distinct from old.locked_by
         or new.lease_token is distinct from old.lease_token
         or new.lease_expires_at is distinct from old.lease_expires_at
       ) then
      raise exception 'GHL outbox lease fields cannot change outside a claim or settlement.';
    end if;
    return new;
  end if;

  transition_allowed := case old.status
    when 'pending' then new.status in ('dispatching', 'canceled')
    when 'retryable_failure' then new.status in ('pending', 'dispatching', 'operator_action_required', 'canceled')
    when 'dispatching' then new.status in (
      'pending',
      'uncertain',
      'succeeded',
      'retryable_failure',
      'operator_action_required',
      'canceled'
    )
    when 'uncertain' then new.status in ('dispatching', 'operator_action_required', 'canceled')
    when 'operator_action_required' then new.status = 'canceled'
    else false
  end;

  if not transition_allowed then
    raise exception 'Invalid GHL provider outbox transition from % to %.', old.status, new.status;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_ghl_lead_effect_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  transition_allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'operator_action_required') then
      raise exception 'A GHL lead effect must begin pending or explicitly operator-required.';
    end if;
    return new;
  end if;

  if old.organization_id is distinct from new.organization_id
     or old.lead_id is distinct from new.lead_id
     or old.location_mapping_id is distinct from new.location_mapping_id
     or old.effect_kind is distinct from new.effect_kind
     or old.idempotency_key is distinct from new.idempotency_key then
    raise exception 'GHL lead effect tenant and effect identity are immutable.';
  end if;

  if new.status = old.status then
    return new;
  end if;

  transition_allowed := case old.status
    when 'pending' then new.status in ('dispatching', 'canceled')
    when 'replay_requested' then new.status in ('dispatching', 'canceled')
    when 'dispatching' then new.status in ('uncertain', 'succeeded', 'retryable_failure', 'operator_action_required')
    when 'uncertain' then new.status in ('operator_action_required', 'canceled')
    when 'retryable_failure' then new.status in ('replay_requested', 'operator_action_required', 'canceled')
    when 'operator_action_required' then new.status in ('canceled')
    else false
  end;

  if not transition_allowed then
    raise exception 'Invalid GHL lead effect transition from % to %.', old.status, new.status;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_ghl_receipt_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'GHL provider receipts are append-only.';
end;
$$;

create or replace function public.claim_ghl_provider_outbox(
  p_outbox_id uuid,
  p_organization_id uuid,
  p_worker_id text,
  p_now timestamptz default timezone('utc', now()),
  p_lease_ms integer default 300000
)
returns setof public.ghl_provider_outbox
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
    select outbox.id
    from public.ghl_provider_outbox outbox
    left join public.ghl_provisioning_runs run
      on run.id = outbox.provisioning_run_id
     and run.organization_id = outbox.organization_id
    where outbox.id = p_outbox_id
      and outbox.organization_id = p_organization_id
      and outbox.provisioning_run_id is not null
      and (
        (
          outbox.status in ('pending', 'retryable_failure')
          and outbox.available_at <= p_now
        )
        or (
          outbox.status = 'dispatching'
          and outbox.lease_expires_at is not null
          and outbox.lease_expires_at <= p_now
        )
        or (
          outbox.status = 'uncertain'
          and outbox.operation = 'location_create'
          and outbox.available_at <= p_now
          and run.state = 'location_create_requested'
          and run.last_reconciled_at is not null
        )
      )
    for update of outbox skip locked
    limit 1
  )
  update public.ghl_provider_outbox outbox
  set status = 'dispatching',
      attempt_count = outbox.attempt_count + 1,
      locked_at = p_now,
      locked_by = trim(p_worker_id),
      lease_token = gen_random_uuid(),
      lease_generation = outbox.lease_generation + 1,
      lease_expires_at = p_now
        + (least(greatest(p_lease_ms, 1000), 3600000)::text || ' milliseconds')::interval,
      completed_at = null,
      last_error_code = null
  where outbox.id in (select id from candidate)
  returning outbox.id into claimed_id;

  if claimed_id is null then
    return;
  end if;

  return query
  select *
  from public.ghl_provider_outbox
  where id = claimed_id;
end;
$$;

create or replace function public.prepare_ghl_provider_outbox_replay(
  p_organization_id uuid,
  p_idempotency_key text,
  p_now timestamptz default timezone('utc', now())
)
returns setof public.ghl_provider_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  prepared_id uuid;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'p_idempotency_key is required';
  end if;

  update public.ghl_provider_outbox outbox
  set status = 'pending',
      available_at = p_now,
      completed_at = null,
      last_error_code = null
  where outbox.organization_id = p_organization_id
    and outbox.idempotency_key = trim(p_idempotency_key)
    and outbox.provisioning_run_id is not null
    and outbox.status = 'retryable_failure'
  returning outbox.id into prepared_id;

  if prepared_id is null then
    select outbox.id into prepared_id
    from public.ghl_provider_outbox outbox
    where outbox.organization_id = p_organization_id
      and outbox.idempotency_key = trim(p_idempotency_key)
      and outbox.provisioning_run_id is not null
      and outbox.status = 'pending';
  end if;

  if prepared_id is null then
    return;
  end if;

  return query
  select *
  from public.ghl_provider_outbox outbox
  where outbox.id = prepared_id
    and outbox.organization_id = p_organization_id;
end;
$$;

create or replace function public.enqueue_ghl_fake_lead_effects(
  p_organization_id uuid,
  p_lead_id uuid,
  p_environment text,
  p_now timestamptz default timezone('utc', now())
)
returns setof public.ghl_lead_effect_events
language plpgsql
security definer
set search_path = public
as $$
declare
  mapping_record public.ghl_location_mappings%rowtype;
  effect_kind_value text;
  operation_value text;
  outbox_key text;
  effect_key text;
  payload jsonb;
  outbox_record public.ghl_provider_outbox%rowtype;
  effect_record public.ghl_lead_effect_events%rowtype;
begin
  if p_environment <> 'test' then
    raise exception 'The GHL fake lead producer is restricted to the test environment.';
  end if;

  if not exists (
    select 1
    from public.leads
    where id = p_lead_id
      and organization_id = p_organization_id
  ) then
    raise exception 'GHL fake lead producer rejected a missing or cross-tenant lead.';
  end if;

  select * into mapping_record
  from public.ghl_location_mappings
  where organization_id = p_organization_id
    and environment = p_environment
    and status = 'active'
    and snapshot_verified_at is not null
    and required_objects_verified_at is not null
    and exists (
      select 1
      from public.ghl_workspace_tenants tenant
      where tenant.organization_id = p_organization_id
        and tenant.status = 'active'
    )
  order by updated_at desc
  limit 1;

  if not found then
    return;
  end if;

  foreach effect_kind_value in array array[
    'contact_upsert',
    'opportunity_upsert',
    'tag_apply',
    'workflow_enroll'
  ]
  loop
    operation_value := case effect_kind_value
      when 'contact_upsert' then 'lead_contact_upsert'
      when 'opportunity_upsert' then 'lead_opportunity_upsert'
      when 'tag_apply' then 'lead_tag_apply'
      when 'workflow_enroll' then 'lead_workflow_enroll'
    end;
    effect_key := concat(
      'ghl-fake-lead-effect-v1:',
      p_organization_id::text,
      ':',
      p_environment,
      ':',
      p_lead_id::text,
      ':',
      effect_kind_value
    );
    outbox_key := effect_key || ':outbox';
    payload := jsonb_build_object(
      'contract_version', 1,
      'fake_only', true,
      'organization_id', p_organization_id::text,
      'lead_id', p_lead_id::text,
      'location_mapping_id', mapping_record.id::text,
      'effect_kind', effect_kind_value
    );

    insert into public.ghl_provider_outbox (
      organization_id,
      provisioning_run_id,
      operation,
      idempotency_key,
      status,
      request_payload,
      available_at
    ) values (
      p_organization_id,
      null,
      operation_value,
      outbox_key,
      'pending',
      payload,
      p_now
    )
    on conflict (idempotency_key) do nothing
    returning * into outbox_record;

    if outbox_record.id is null then
      select * into strict outbox_record
      from public.ghl_provider_outbox
      where idempotency_key = outbox_key;

      if outbox_record.organization_id is distinct from p_organization_id
         or outbox_record.operation is distinct from operation_value
         or outbox_record.request_payload is distinct from payload then
        raise exception 'GHL fake lead outbox idempotency crossed an immutable boundary.';
      end if;
    end if;

    insert into public.ghl_lead_effect_events (
      organization_id,
      lead_id,
      location_mapping_id,
      effect_kind,
      idempotency_key,
      status,
      outbox_id,
      metadata
    ) values (
      p_organization_id,
      p_lead_id,
      mapping_record.id,
      effect_kind_value,
      effect_key,
      'pending',
      outbox_record.id,
      jsonb_build_object(
        'contract_version', 1,
        'fake_only', true,
        'provider_mutation_attempted', false
      )
    )
    on conflict (idempotency_key) do nothing
    returning * into effect_record;

    if effect_record.id is null then
      select * into strict effect_record
      from public.ghl_lead_effect_events
      where idempotency_key = effect_key;

      if effect_record.organization_id is distinct from p_organization_id
         or effect_record.lead_id is distinct from p_lead_id
         or effect_record.location_mapping_id is distinct from mapping_record.id
         or effect_record.effect_kind is distinct from effect_kind_value
         or effect_record.outbox_id is distinct from outbox_record.id then
        raise exception 'GHL fake lead effect idempotency crossed an immutable boundary.';
      end if;
    end if;

    return next effect_record;
    outbox_record := null;
    effect_record := null;
  end loop;
end;
$$;

create or replace function public.claim_next_ghl_fake_lead_outbox(
  p_worker_id text,
  p_now timestamptz default timezone('utc', now()),
  p_lease_ms integer default 300000
)
returns setof public.ghl_provider_outbox
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

  -- Terminalize every due fake-lead effect that has consumed its final attempt
  -- before selecting the next claim. Outbox and effect truth move together in
  -- this transaction, so exhausted work cannot remain silently stranded.
  with exhausted as (
    select outbox.id, effect.id as effect_id
    from public.ghl_provider_outbox outbox
    join public.ghl_lead_effect_events effect
      on effect.outbox_id = outbox.id
     and effect.organization_id = outbox.organization_id
    where outbox.operation in (
        'lead_contact_upsert',
        'lead_opportunity_upsert',
        'lead_tag_apply',
        'lead_workflow_enroll',
        'appointment_sync'
      )
      and outbox.request_payload @> '{"fake_only": true}'::jsonb
      and effect.attempt_count >= effect.max_attempts
      and (
        (
          outbox.status = 'dispatching'
          and outbox.lease_expires_at is not null
          and outbox.lease_expires_at <= p_now
          and effect.status = 'dispatching'
        )
        or (
          outbox.status = 'retryable_failure'
          and outbox.available_at <= p_now
          and effect.status = 'retryable_failure'
        )
      )
    for update of outbox, effect skip locked
  ), terminal_outbox as (
    update public.ghl_provider_outbox outbox
    set status = 'operator_action_required',
        available_at = p_now,
        locked_at = null,
        locked_by = null,
        lease_token = null,
        lease_expires_at = null,
        completed_at = p_now,
        last_error_code = 'ghl_lead_effect_attempts_exhausted'
    from exhausted
    where outbox.id = exhausted.id
    returning exhausted.effect_id
  )
  update public.ghl_lead_effect_events effect
  set status = 'operator_action_required',
      next_retry_at = null,
      last_error_code = 'ghl_lead_effect_attempts_exhausted',
      last_error_message = null,
      completed_at = p_now
  from terminal_outbox
  where effect.id = terminal_outbox.effect_id;

  with candidate as (
    select outbox.id, effect.id as effect_id
    from public.ghl_provider_outbox outbox
    join public.ghl_lead_effect_events effect
      on effect.outbox_id = outbox.id
     and effect.organization_id = outbox.organization_id
    join public.ghl_location_mappings mapping
      on mapping.id = effect.location_mapping_id
     and mapping.organization_id = effect.organization_id
    join public.ghl_workspace_tenants tenant
      on tenant.organization_id = effect.organization_id
     and tenant.status = 'active'
    where outbox.operation in (
        'lead_contact_upsert',
        'lead_opportunity_upsert',
        'lead_tag_apply',
        'lead_workflow_enroll',
        'appointment_sync'
      )
      and outbox.request_payload @> '{"fake_only": true}'::jsonb
      and mapping.environment = 'test'
      and mapping.status = 'active'
      and mapping.snapshot_verified_at is not null
      and mapping.required_objects_verified_at is not null
      and effect.attempt_count < effect.max_attempts
      and (
        (
          outbox.status in ('pending', 'retryable_failure')
          and outbox.available_at <= p_now
          and effect.status in ('pending', 'replay_requested')
        )
        or (
          outbox.status = 'dispatching'
          and outbox.lease_expires_at is not null
          and outbox.lease_expires_at <= p_now
          and effect.status = 'dispatching'
        )
      )
    order by outbox.available_at asc, outbox.created_at asc, outbox.id asc
    for update of outbox, effect skip locked
    limit 1
  ), claimed as (
    update public.ghl_provider_outbox outbox
    set status = 'dispatching',
        attempt_count = outbox.attempt_count + 1,
        locked_at = p_now,
        locked_by = trim(p_worker_id),
        lease_token = gen_random_uuid(),
        lease_generation = outbox.lease_generation + 1,
        lease_expires_at = p_now
          + (least(greatest(p_lease_ms, 1000), 3600000)::text || ' milliseconds')::interval,
        completed_at = null,
        last_error_code = null
    from candidate
    where outbox.id = candidate.id
    returning outbox.id, candidate.effect_id
  ), effect_claim as (
    update public.ghl_lead_effect_events effect
    set status = 'dispatching',
        attempt_count = effect.attempt_count + 1,
        next_retry_at = null,
        last_error_code = null,
        last_error_message = null
    from claimed
    where effect.id = claimed.effect_id
    returning claimed.id
  )
  select id into claimed_id
  from effect_claim;

  if claimed_id is null then
    return;
  end if;

  return query
  select *
  from public.ghl_provider_outbox
  where id = claimed_id;
end;
$$;

create or replace function public.request_ghl_lead_effect_replay(
  p_effect_id uuid,
  p_organization_id uuid,
  p_lead_id uuid,
  p_now timestamptz default timezone('utc', now())
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  replayed_id uuid;
begin
  update public.ghl_lead_effect_events effect
  set status = 'replay_requested',
      replay_requested_at = p_now,
      next_retry_at = p_now,
      last_error_code = null,
      last_error_message = null
  where effect.id = p_effect_id
    and effect.organization_id = p_organization_id
    and effect.lead_id = p_lead_id
    and effect.status = 'retryable_failure'
    and effect.attempt_count < effect.max_attempts
  returning effect.id into replayed_id;

  if replayed_id is not null then
    return true;
  end if;

  return exists (
    select 1
    from public.ghl_lead_effect_events effect
    where effect.id = p_effect_id
      and effect.organization_id = p_organization_id
      and effect.lead_id = p_lead_id
      and effect.status = 'replay_requested'
      and effect.attempt_count < effect.max_attempts
  );
end;
$$;

create or replace function public.settle_ghl_provider_outbox(
  p_outbox_id uuid,
  p_organization_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_received_at timestamptz,
  p_receipt_outcome text,
  p_provider_request_id text,
  p_provider_reference text,
  p_http_status integer,
  p_response_fingerprint text,
  p_receipt_metadata jsonb,
  p_outbox_status text,
  p_available_at timestamptz,
  p_last_error_code text
)
returns setof public.ghl_provider_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  current_record public.ghl_provider_outbox%rowtype;
  lead_effect_record public.ghl_lead_effect_events%rowtype;
begin
  if p_outbox_status not in (
    'pending',
    'uncertain',
    'succeeded',
    'retryable_failure',
    'operator_action_required',
    'canceled'
  ) then
    raise exception 'Invalid GHL outbox settlement status.';
  end if;

  select * into current_record
  from public.ghl_provider_outbox
  where id = p_outbox_id
    and organization_id = p_organization_id
    and status = 'dispatching'
    and locked_by = trim(p_worker_id)
    and lease_token = p_lease_token
    and lease_generation = p_lease_generation
    and lease_expires_at > timezone('utc', now())
  for update;

  if not found then
    raise exception 'GHL outbox lease expired or was superseded before settlement.';
  end if;

  insert into public.ghl_provider_receipts (
    outbox_id,
    attempt_number,
    outcome,
    provider_request_id,
    provider_reference,
    http_status,
    response_fingerprint,
    receipt_metadata,
    received_at
  ) values (
    current_record.id,
    current_record.attempt_count,
    p_receipt_outcome,
    p_provider_request_id,
    p_provider_reference,
    p_http_status,
    p_response_fingerprint,
    coalesce(p_receipt_metadata, '{}'::jsonb),
    p_received_at
  );

  select * into lead_effect_record
  from public.ghl_lead_effect_events
  where outbox_id = current_record.id
    and organization_id = current_record.organization_id
  for update;

  if found then
    if p_outbox_status not in (
      'uncertain',
      'succeeded',
      'retryable_failure',
      'operator_action_required'
    ) then
      raise exception 'Invalid GHL lead effect settlement status.';
    end if;

    update public.ghl_lead_effect_events
    set status = p_outbox_status,
        provider_contact_id = case
          when effect_kind = 'contact_upsert' and p_outbox_status = 'succeeded'
            then p_provider_reference
          else provider_contact_id
        end,
        provider_opportunity_id = case
          when effect_kind = 'opportunity_upsert' and p_outbox_status = 'succeeded'
            then p_provider_reference
          else provider_opportunity_id
        end,
        provider_object_id = case
          when effect_kind in ('tag_apply', 'workflow_enroll', 'appointment_sync')
               and p_outbox_status = 'succeeded'
            then p_provider_reference
          else provider_object_id
        end,
        next_retry_at = case
          when p_outbox_status = 'retryable_failure' then p_available_at
          else null
        end,
        last_error_code = p_last_error_code,
        last_error_message = null,
        metadata = metadata || jsonb_build_object(
          'fake_provider', coalesce(p_receipt_metadata ->> 'fake_provider', 'false') = 'true',
          'provider_network_access',
            coalesce(p_receipt_metadata ->> 'provider_network_access', 'none'),
          'provider_mutation_attempted',
            coalesce(p_receipt_metadata ->> 'provider_mutation_attempted', 'false') = 'true',
          'outbox_lease_generation', p_lease_generation
        ),
        completed_at = case
          when p_outbox_status = 'succeeded' then p_received_at
          else null
        end
    where id = lead_effect_record.id;
  end if;

  update public.ghl_provider_outbox
  set status = p_outbox_status,
      available_at = p_available_at,
      locked_at = null,
      locked_by = null,
      lease_token = null,
      lease_expires_at = null,
      completed_at = case
        when p_outbox_status = 'succeeded' then p_received_at
        else null
      end,
      last_error_code = p_last_error_code
  where id = current_record.id;

  return query
  select *
  from public.ghl_provider_outbox
  where id = current_record.id;
end;
$$;

drop trigger if exists ghl_location_mappings_hierarchy_guard on public.ghl_location_mappings;
create trigger ghl_location_mappings_hierarchy_guard
  before insert or update on public.ghl_location_mappings
  for each row execute function public.enforce_ghl_location_hierarchy();

drop trigger if exists ghl_workspace_tenants_hierarchy_guard on public.ghl_workspace_tenants;
create trigger ghl_workspace_tenants_hierarchy_guard
  before update on public.ghl_workspace_tenants
  for each row execute function public.enforce_ghl_hierarchy_identity();

drop trigger if exists ghl_installations_identity_guard on public.ghl_installations;
create trigger ghl_installations_identity_guard
  before update on public.ghl_installations
  for each row execute function public.enforce_ghl_installation_identity();

drop trigger if exists ghl_snapshot_manifests_identity_guard on public.ghl_snapshot_manifests;
create trigger ghl_snapshot_manifests_identity_guard
  before update on public.ghl_snapshot_manifests
  for each row execute function public.enforce_ghl_snapshot_manifest_identity();

drop trigger if exists ghl_provisioning_runs_transition_guard on public.ghl_provisioning_runs;
create trigger ghl_provisioning_runs_transition_guard
  before insert or update on public.ghl_provisioning_runs
  for each row execute function public.enforce_ghl_provisioning_transition();

drop trigger if exists ghl_provider_outbox_identity_guard on public.ghl_provider_outbox;
create trigger ghl_provider_outbox_identity_guard
  before update on public.ghl_provider_outbox
  for each row execute function public.enforce_ghl_outbox_identity();

drop trigger if exists ghl_lead_effect_events_transition_guard on public.ghl_lead_effect_events;
create trigger ghl_lead_effect_events_transition_guard
  before insert or update on public.ghl_lead_effect_events
  for each row execute function public.enforce_ghl_lead_effect_transition();

drop trigger if exists ghl_provider_receipts_append_only_guard on public.ghl_provider_receipts;
create trigger ghl_provider_receipts_append_only_guard
  before update or delete on public.ghl_provider_receipts
  for each row execute function public.prevent_ghl_receipt_mutation();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ghl_workspace_tenants',
    'ghl_installations',
    'ghl_snapshot_manifests',
    'ghl_location_mappings',
    'ghl_provisioning_runs',
    'ghl_provider_outbox',
    'ghl_lead_effect_events',
    'ghl_operator_requests'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_ghl_updated_at()',
      table_name || '_updated_at',
      table_name
    );
  end loop;
end;
$$;

alter table public.ghl_workspace_tenants enable row level security;
alter table public.ghl_workspace_tenants force row level security;
alter table public.ghl_installations enable row level security;
alter table public.ghl_installations force row level security;
alter table public.ghl_snapshot_manifests enable row level security;
alter table public.ghl_snapshot_manifests force row level security;
alter table public.ghl_location_mappings enable row level security;
alter table public.ghl_location_mappings force row level security;
alter table public.ghl_provisioning_runs enable row level security;
alter table public.ghl_provisioning_runs force row level security;
alter table public.ghl_provider_outbox enable row level security;
alter table public.ghl_provider_outbox force row level security;
alter table public.ghl_provider_receipts enable row level security;
alter table public.ghl_provider_receipts force row level security;
alter table public.ghl_lead_effect_events enable row level security;
alter table public.ghl_lead_effect_events force row level security;
alter table public.ghl_operator_requests enable row level security;
alter table public.ghl_operator_requests force row level security;

-- GHL tenant mechanics are intentionally hidden from ordinary authenticated
-- users. Only server-side service-role workflows may access these tables.
revoke all on table public.ghl_workspace_tenants from anon, authenticated;
revoke all on table public.ghl_installations from anon, authenticated;
revoke all on table public.ghl_snapshot_manifests from anon, authenticated;
revoke all on table public.ghl_location_mappings from anon, authenticated;
revoke all on table public.ghl_provisioning_runs from anon, authenticated;
revoke all on table public.ghl_provider_outbox from anon, authenticated;
revoke all on table public.ghl_provider_receipts from anon, authenticated;
revoke all on table public.ghl_lead_effect_events from anon, authenticated;
revoke all on table public.ghl_operator_requests from anon, authenticated;

grant all on table public.ghl_workspace_tenants to service_role;
grant all on table public.ghl_installations to service_role;
grant all on table public.ghl_snapshot_manifests to service_role;
grant all on table public.ghl_location_mappings to service_role;
grant all on table public.ghl_provisioning_runs to service_role;
revoke all on table public.ghl_provider_outbox from service_role;
grant select on table public.ghl_provider_outbox to service_role;
grant insert (
  organization_id,
  provisioning_run_id,
  operation,
  idempotency_key,
  request_payload,
  available_at
) on public.ghl_provider_outbox to service_role;
revoke all on table public.ghl_provider_receipts from service_role;
grant select on table public.ghl_provider_receipts to service_role;
revoke all on table public.ghl_lead_effect_events from service_role;
grant select on table public.ghl_lead_effect_events to service_role;
grant all on table public.ghl_operator_requests to service_role;

revoke execute on function public.set_ghl_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_ghl_location_hierarchy() from public, anon, authenticated;
revoke execute on function public.enforce_ghl_hierarchy_identity() from public, anon, authenticated;
revoke execute on function public.enforce_ghl_installation_identity() from public, anon, authenticated;
revoke execute on function public.enforce_ghl_snapshot_manifest_identity() from public, anon, authenticated;
revoke execute on function public.enforce_ghl_provisioning_transition() from public, anon, authenticated;
revoke execute on function public.enforce_ghl_outbox_identity() from public, anon, authenticated;
revoke execute on function public.enforce_ghl_lead_effect_transition() from public, anon, authenticated;
revoke execute on function public.prevent_ghl_receipt_mutation() from public, anon, authenticated;
revoke execute on function public.claim_ghl_provider_outbox(uuid, uuid, text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.claim_ghl_provider_outbox(uuid, uuid, text, timestamptz, integer)
  to service_role;
revoke execute on function public.prepare_ghl_provider_outbox_replay(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.prepare_ghl_provider_outbox_replay(uuid, text, timestamptz)
  to service_role;
revoke execute on function public.enqueue_ghl_fake_lead_effects(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.enqueue_ghl_fake_lead_effects(uuid, uuid, text, timestamptz)
  to service_role;
revoke execute on function public.claim_next_ghl_fake_lead_outbox(text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.claim_next_ghl_fake_lead_outbox(text, timestamptz, integer)
  to service_role;
revoke execute on function public.request_ghl_lead_effect_replay(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.request_ghl_lead_effect_replay(uuid, uuid, uuid, timestamptz)
  to service_role;
revoke execute on function public.settle_ghl_provider_outbox(
  uuid, uuid, text, uuid, bigint, timestamptz, text, text, text, integer, text, jsonb, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.settle_ghl_provider_outbox(
  uuid, uuid, text, uuid, bigint, timestamptz, text, text, text, integer, text, jsonb, text, timestamptz, text
) to service_role;

comment on function public.claim_ghl_provider_outbox(uuid, uuid, text, timestamptz, integer) is
  'Atomically claims one due GHL provider outbox row and installs a token plus monotonic generation fence.';
comment on function public.prepare_ghl_provider_outbox_replay(uuid, text, timestamptz) is
  'Prepares a retryable provisioning outbox row through an RPC because service-role callers have no direct UPDATE privilege.';
comment on function public.enqueue_ghl_fake_lead_effects(uuid, uuid, text, timestamptz) is
  'Idempotently emits PII-free GHL lead-effect contracts for a verified tenant mapping; it performs no provider call.';
comment on function public.claim_next_ghl_fake_lead_outbox(text, timestamptz, integer) is
  'Claims only modeled lead-effect operations for the explicit deterministic fake worker; it performs no network access.';
comment on function public.request_ghl_lead_effect_replay(uuid, uuid, uuid, timestamptz) is
  'Requests a bounded lead-effect replay through an RPC because service-role callers have no direct UPDATE privilege.';
comment on function public.settle_ghl_provider_outbox(
  uuid, uuid, text, uuid, bigint, timestamptz, text, text, text, integer, text, jsonb, text, timestamptz, text
) is
  'Atomically appends sanitized provider evidence and settles only the live matching GHL outbox lease.';

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260710170000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
