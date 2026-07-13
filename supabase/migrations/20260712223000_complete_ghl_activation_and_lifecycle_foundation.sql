-- DealFlow GHL activation, production fencing, supported personalization, and
-- lifecycle reconciliation. Provider writes remain disabled by default.

alter table public.ghl_provisioning_runs
  add column if not exists locked_by text null,
  add column if not exists locked_at timestamptz null,
  add column if not exists locked_until timestamptz null,
  add column if not exists lease_token uuid null,
  add column if not exists lease_generation bigint not null default 0;

create table if not exists public.ghl_runtime_controls (
  environment text primary key,
  provisioning_writes_enabled boolean not null default false,
  lead_writes_enabled boolean not null default false,
  lifecycle_webhook_enabled boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_runtime_controls_environment_check check (environment in ('production', 'sandbox', 'test'))
);

insert into public.ghl_runtime_controls (environment) values ('production'), ('sandbox'), ('test')
on conflict (environment) do nothing;

comment on table public.ghl_runtime_controls is
  'Database-side defense in depth. All GHL provider-effect controls default false and application exact-deployment gates must also pass.';

alter table public.ghl_snapshot_manifests
  add column if not exists installation_id uuid null,
  add column if not exists personalization_contract jsonb null;

alter table public.ghl_snapshot_manifests
  drop constraint if exists ghl_snapshot_manifests_installation_environment_fk,
  add constraint ghl_snapshot_manifests_installation_environment_fk
    foreign key (installation_id, environment)
    references public.ghl_installations(id, environment) on delete restrict;

comment on column public.ghl_snapshot_manifests.personalization_contract is
  'Owner-approved preinstalled-template contract: bounded customValues, exact requiredFormIds, and one verified HTTPS destinationUrl. Null is fail-closed and blocks activation.';
comment on column public.ghl_snapshot_manifests.installation_id is
  'Exact platform or partner installation that owns this approved snapshot contract. Null legacy manifests are never selected for new activation.';

create table if not exists public.ghl_billing_activation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  partner_id uuid null references public.partners(id) on delete restrict,
  tenant_kind text not null,
  environment text not null,
  commercial_activation_id uuid not null references public.commercial_activations(id) on delete restrict,
  activation_event_id text not null,
  stripe_subscription_id text not null,
  provisioning_run_id uuid null references public.ghl_provisioning_runs(id) on delete restrict,
  status text not null default 'received',
  blocker_code text null,
  requested_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_billing_activation_tenant_check check (
    (tenant_kind = 'direct_realtor' and partner_id is null)
    or (tenant_kind = 'partner_child' and partner_id is not null)
  ),
  constraint ghl_billing_activation_environment_check check (environment in ('production', 'sandbox', 'test')),
  constraint ghl_billing_activation_status_check check (status in ('received', 'provisioning_requested', 'blocked_configuration')),
  constraint ghl_billing_commercial_activation_unique unique (organization_id, environment, commercial_activation_id),
  constraint ghl_billing_activation_event_unique unique (organization_id, environment, activation_event_id)
);

create table if not exists public.ghl_location_personalizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  location_mapping_id uuid not null,
  environment text not null,
  custom_values jsonb not null default '{}'::jsonb,
  required_form_ids jsonb not null default '[]'::jsonb,
  destination_url text not null,
  status text not null default 'pending',
  current_step text not null default 'custom_values',
  values_fingerprint text not null,
  custom_value_receipt jsonb null,
  form_verification_receipt jsonb null,
  locked_by text null,
  locked_until timestamptz null,
  lease_token uuid null,
  lease_generation bigint not null default 0,
  next_retry_at timestamptz null,
  applied_at timestamptz null,
  verified_at timestamptz null,
  last_error_code text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_location_personalizations_mapping_tenant_fk foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings(id, organization_id) on delete restrict,
  constraint ghl_location_personalizations_environment_check check (environment in ('production', 'sandbox', 'test')),
  constraint ghl_location_personalizations_values_check check (jsonb_typeof(custom_values) = 'object'),
  constraint ghl_location_personalizations_forms_check check (jsonb_typeof(required_form_ids) = 'array'),
  constraint ghl_location_personalizations_destination_check check (destination_url ~ '^https://'),
  constraint ghl_location_personalizations_status_check check (status in ('pending', 'applying', 'ready', 'uncertain', 'operator_action_required')),
  constraint ghl_location_personalizations_step_check check (current_step in ('custom_values', 'forms', 'ready')),
  constraint ghl_location_personalizations_mapping_unique unique (location_mapping_id)
);

comment on table public.ghl_location_personalizations is
  'Supported GHL model: an owner-preinstalled template is personalized only through documented custom-value APIs and exact preinstalled form IDs. It never claims API funnel or form publication.';

-- Appointment lifecycle truth is projected into the existing canonical
-- appointments table. Legacy rows remain readable; every new GHL projection is
-- fenced to an exact workspace, lead, campaign, user, and location mapping.
alter table public.appointments
  add column if not exists user_id uuid null,
  add column if not exists campaign_id uuid null,
  add column if not exists ghl_location_mapping_id uuid null,
  add column if not exists ghl_appointment_id text null,
  add column if not exists ghl_contact_id text null,
  add column if not exists ghl_calendar_id text null,
  add column if not exists ghl_provider_updated_at timestamptz null,
  add column if not exists ghl_ends_at timestamptz null,
  add column if not exists ghl_deleted_at timestamptz null,
  add column if not exists ghl_last_event_id text null,
  add column if not exists ghl_last_payload_fingerprint text null;

create unique index if not exists appointments_id_organization_unique
  on public.appointments (id, organization_id);

create unique index if not exists appointments_ghl_provider_identity_unique
  on public.appointments (ghl_location_mapping_id, ghl_appointment_id)
  where ghl_location_mapping_id is not null and ghl_appointment_id is not null;

do $dealflow_ghl_appointment_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_ghl_mapping_tenant_fk'
  ) then
    alter table public.appointments
      add constraint appointments_ghl_mapping_tenant_fk
      foreign key (ghl_location_mapping_id, organization_id)
      references public.ghl_location_mappings(id, organization_id)
      on update restrict on delete restrict not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_lead_tenant_fk'
  ) then
    alter table public.appointments
      add constraint appointments_lead_tenant_fk
      foreign key (lead_id, organization_id)
      references public.leads(id, organization_id)
      on update restrict on delete restrict not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_campaign_tenant_user_fk'
  ) then
    alter table public.appointments
      add constraint appointments_campaign_tenant_user_fk
      foreign key (campaign_id, organization_id, user_id)
      references public.campaign_plans(id, organization_id, user_id)
      on update restrict on delete restrict not valid;
  end if;
end;
$dealflow_ghl_appointment_constraints$;

create table if not exists public.ghl_lifecycle_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  location_mapping_id uuid not null,
  provider_event_id text not null,
  event_type text not null,
  provider_object_id text not null,
  provider_contact_id text null,
  provider_calendar_id text null,
  appointment_status text null,
  starts_at timestamptz null,
  ends_at timestamptz null,
  provider_updated_at timestamptz null,
  signature_algorithm text not null,
  payload_fingerprint text not null,
  projection_status text not null default 'received',
  projection_code text null,
  resolved_lead_id uuid null,
  canonical_appointment_id uuid null,
  projected_at timestamptz null,
  received_at timestamptz not null default timezone('utc', now()),
  constraint ghl_lifecycle_webhook_mapping_tenant_fk foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings(id, organization_id) on delete restrict,
  constraint ghl_lifecycle_webhook_type_check check (event_type in (
    'AppointmentCreate', 'AppointmentUpdate', 'AppointmentDelete', 'ContactUpdate',
    'OpportunityStatusUpdate', 'OutboundMessage'
  )),
  constraint ghl_lifecycle_webhook_signature_check check (signature_algorithm = 'ed25519'),
  constraint ghl_lifecycle_webhook_projection_check check (
    projection_status in ('received', 'reconciled', 'operator_action_required')
  ),
  constraint ghl_lifecycle_webhook_event_unique unique (location_mapping_id, provider_event_id),
  constraint ghl_lifecycle_webhook_id_organization_unique unique (id, organization_id),
  constraint ghl_lifecycle_webhook_lead_tenant_fk
    foreign key (resolved_lead_id, organization_id)
    references public.leads(id, organization_id) on update restrict on delete restrict,
  constraint ghl_lifecycle_webhook_appointment_tenant_fk
    foreign key (canonical_appointment_id, organization_id)
    references public.appointments(id, organization_id) on update restrict on delete restrict
);

-- One tenant-fenced current-state row per provider object. This is the
-- canonical DealFlow binding for contacts, opportunities, appointments, and
-- outbound-message outcomes; raw webhook bodies and provider credentials are
-- intentionally never stored here.
create table if not exists public.ghl_lifecycle_object_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  location_mapping_id uuid not null,
  lead_id uuid not null,
  object_kind text not null,
  provider_object_id text not null,
  provider_contact_id text null,
  provider_status text null,
  canonical_appointment_id uuid null,
  last_event_id text not null,
  last_event_type text not null,
  last_provider_updated_at timestamptz not null,
  last_received_at timestamptz not null,
  last_payload_fingerprint text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_lifecycle_object_states_kind_check check (
    object_kind in ('appointment', 'contact', 'opportunity', 'outbound_message')
  ),
  constraint ghl_lifecycle_object_states_mapping_tenant_fk
    foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings(id, organization_id) on update restrict on delete restrict,
  constraint ghl_lifecycle_object_states_lead_tenant_fk
    foreign key (lead_id, organization_id)
    references public.leads(id, organization_id) on update restrict on delete restrict,
  constraint ghl_lifecycle_object_states_appointment_tenant_fk
    foreign key (canonical_appointment_id, organization_id)
    references public.appointments(id, organization_id) on update restrict on delete restrict,
  constraint ghl_lifecycle_object_states_provider_unique
    unique (location_mapping_id, object_kind, provider_object_id),
  constraint ghl_lifecycle_object_states_id_organization_unique
    unique (id, organization_id)
);

create index if not exists ghl_lifecycle_object_states_lead_idx
  on public.ghl_lifecycle_object_states (organization_id, lead_id, object_kind, updated_at desc);

-- Existing operator work can now point at an exact immutable lifecycle receipt.
alter table public.ghl_operator_requests
  add column if not exists lifecycle_event_id uuid null;

alter table public.ghl_operator_requests
  drop constraint if exists ghl_operator_requests_kind_check,
  add constraint ghl_operator_requests_kind_check
    check (request_kind in (
      'location_reconciliation',
      'snapshot_verification',
      'required_object_repair',
      'funnel_publication',
      'lead_effect_reconciliation',
      'lifecycle_reconciliation'
    )),
  drop constraint if exists ghl_operator_requests_target_check,
  add constraint ghl_operator_requests_target_check
    check (
      provisioning_run_id is not null
      or lead_effect_event_id is not null
      or lifecycle_event_id is not null
    );

do $dealflow_ghl_lifecycle_operator_fk$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ghl_operator_requests'::regclass
      and conname = 'ghl_operator_requests_lifecycle_tenant_fk'
  ) then
    alter table public.ghl_operator_requests
      add constraint ghl_operator_requests_lifecycle_tenant_fk
      foreign key (lifecycle_event_id, organization_id)
      references public.ghl_lifecycle_webhook_events(id, organization_id)
      on update restrict on delete restrict;
  end if;
end;
$dealflow_ghl_lifecycle_operator_fk$;

alter table public.ghl_runtime_controls enable row level security;
alter table public.ghl_runtime_controls force row level security;
alter table public.ghl_billing_activation_requests enable row level security;
alter table public.ghl_billing_activation_requests force row level security;
alter table public.ghl_location_personalizations enable row level security;
alter table public.ghl_location_personalizations force row level security;
alter table public.ghl_lifecycle_webhook_events enable row level security;
alter table public.ghl_lifecycle_webhook_events force row level security;
alter table public.ghl_lifecycle_object_states enable row level security;
alter table public.ghl_lifecycle_object_states force row level security;

drop trigger if exists set_ghl_lifecycle_object_states_updated_at on public.ghl_lifecycle_object_states;
create trigger set_ghl_lifecycle_object_states_updated_at
before update on public.ghl_lifecycle_object_states
for each row execute function public.set_ghl_updated_at();

create or replace function public.request_ghl_provisioning_from_billing_activation_v1(
  p_organization_id uuid,
  p_user_id uuid,
  p_environment text,
  p_commercial_activation_id uuid,
  p_stripe_subscription_id text,
  p_now timestamptz default timezone('utc', now())
)
returns table(request_id uuid, request_status text, provisioning_run_id uuid, blocker_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_record public.organizations%rowtype;
  activation_record public.commercial_activations%rowtype;
  installation_record public.ghl_installations%rowtype;
  manifest_record public.ghl_snapshot_manifests%rowtype;
  request_record public.ghl_billing_activation_requests%rowtype;
  run_record public.ghl_provisioning_runs%rowtype;
  tenant_kind_value text;
  country_value text;
  timezone_value text;
  idempotency_value text;
  blocker_value text;
begin
  if p_environment not in ('production', 'sandbox', 'test') or p_commercial_activation_id is null then
    raise exception 'Invalid GHL billing activation identity.';
  end if;
  select * into strict organization_record from public.organizations where id = p_organization_id;
  if organization_record.owner_user_id is distinct from p_user_id or not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = p_user_id and role in ('owner', 'admin')
  ) then
    raise exception 'GHL billing activation user is not the exact workspace owner.';
  end if;
  select * into strict activation_record
  from public.commercial_activations activation
  where activation.id = p_commercial_activation_id
    and activation.organization_id = p_organization_id
    and activation.user_id = p_user_id
    and activation.source_provider = 'stripe'
    and activation.source_event_type in ('checkout.session.completed', 'invoice.payment_succeeded')
    and activation.amount_paid_cents > 0;
  if activation_record.source_subscription_id is distinct from p_stripe_subscription_id then
    raise exception 'GHL provisioning subscription does not match the immutable commercial activation.';
  end if;

  tenant_kind_value := case when organization_record.partner_id is null then 'direct_realtor' else 'partner_child' end;
  insert into public.ghl_workspace_tenants (organization_id, tenant_kind, partner_id, status)
  values (p_organization_id, tenant_kind_value, organization_record.partner_id, 'active')
  on conflict (organization_id) do update set
    tenant_kind = excluded.tenant_kind,
    partner_id = excluded.partner_id,
    status = 'active',
    updated_at = p_now
  where public.ghl_workspace_tenants.tenant_kind = excluded.tenant_kind
    and public.ghl_workspace_tenants.partner_id is not distinct from excluded.partner_id;
  if not found then raise exception 'GHL tenant ownership changed across an immutable activation boundary.'; end if;

  insert into public.ghl_billing_activation_requests (
    organization_id, user_id, partner_id, tenant_kind, environment,
    commercial_activation_id, activation_event_id, stripe_subscription_id, status, requested_at, updated_at
  ) values (
    p_organization_id, p_user_id, organization_record.partner_id, tenant_kind_value, p_environment,
    activation_record.id, activation_record.source_event_id, p_stripe_subscription_id, 'received', p_now, p_now
  ) on conflict (organization_id, environment, commercial_activation_id) do nothing;
  select * into strict request_record from public.ghl_billing_activation_requests
    where organization_id = p_organization_id and environment = p_environment and commercial_activation_id = activation_record.id;
  if request_record.user_id is distinct from p_user_id
     or request_record.stripe_subscription_id is distinct from p_stripe_subscription_id
     or request_record.partner_id is distinct from organization_record.partner_id then
    raise exception 'GHL billing activation idempotency crossed tenant or payment identity.';
  end if;
  if request_record.provisioning_run_id is not null then
    return query select request_record.id, request_record.status, request_record.provisioning_run_id, request_record.blocker_code;
    return;
  end if;

  -- Renewal, recovery, and duplicate-active Stripe events must never create a
  -- second provider location. They attach to the existing non-canceled saga.
  select * into run_record from public.ghl_provisioning_runs
  where organization_id = p_organization_id and environment = p_environment and state <> 'canceled'
  order by requested_at asc, id asc limit 1;
  if found then
    update public.ghl_billing_activation_requests set
      provisioning_run_id = run_record.id,
      status = 'provisioning_requested',
      blocker_code = case when run_record.state = 'operator_action_required' then coalesce(run_record.last_error_code, 'ghl_existing_run_operator_action_required') else null end,
      updated_at = p_now
    where id = request_record.id returning * into request_record;
    return query select request_record.id, request_record.status, request_record.provisioning_run_id, request_record.blocker_code;
    return;
  end if;

  select * into installation_record from public.ghl_installations installation
  where installation.environment = p_environment and installation.status = 'active'
    and installation.encrypted_credential_ref is not null
    and ((organization_record.partner_id is null and installation.owner_kind = 'platform' and installation.partner_id is null)
      or (organization_record.partner_id is not null and installation.owner_kind = 'partner' and installation.partner_id = organization_record.partner_id))
  order by installation.created_at asc limit 1;
  if not found then blocker_value := 'ghl_activation_installation_missing'; end if;

  if blocker_value is null then
  select * into manifest_record from public.ghl_snapshot_manifests manifest
    where manifest.environment = p_environment and manifest.installation_id = installation_record.id
      and manifest.status = 'approved' and manifest.installation_mode = 'preinstalled'
      and jsonb_typeof(manifest.personalization_contract) = 'object'
      and jsonb_typeof(manifest.personalization_contract -> 'customValues') = 'object'
      and jsonb_typeof(manifest.personalization_contract -> 'requiredFormIds') = 'array'
      and jsonb_array_length(manifest.personalization_contract -> 'requiredFormIds') > 0
      and nullif(trim(manifest.personalization_contract ->> 'destinationUrl'), '') ~ '^https://'
    order by manifest.approved_at desc nulls last, manifest.created_at desc limit 1;
    if not found then blocker_value := 'ghl_activation_personalized_preinstalled_manifest_missing'; end if;
  end if;

  if blocker_value is null then
    country_value := nullif(trim(installation_record.capability_manifest ->> 'defaultCountry'), '');
    timezone_value := nullif(trim(installation_record.capability_manifest ->> 'defaultTimezone'), '');
    if country_value !~ '^[A-Z]{2}$' or timezone_value is null then
      blocker_value := 'ghl_activation_location_profile_missing';
    end if;
  end if;

  if blocker_value is not null then
    update public.ghl_billing_activation_requests set status = 'blocked_configuration', blocker_code = blocker_value, updated_at = p_now
    where id = request_record.id returning * into request_record;
    return query select request_record.id, request_record.status, request_record.provisioning_run_id, request_record.blocker_code;
    return;
  end if;

  idempotency_value := concat('ghl-commercial-activation-v1:', p_environment, ':', p_organization_id, ':', activation_record.id, ':', manifest_record.id);
  insert into public.ghl_provisioning_runs (
    organization_id, environment, activation_event_id, installation_id, snapshot_manifest_id,
    idempotency_key, state, state_metadata, requested_at, created_at, updated_at
  ) values (
    p_organization_id, p_environment, activation_record.source_event_id, installation_record.id, manifest_record.id,
    idempotency_value, 'requested', jsonb_build_object('location_profile', jsonb_build_object(
      'display_name', organization_record.name, 'country', country_value, 'timezone', timezone_value
    ), 'billing_user_id', p_user_id::text, 'billing_subscription_id', p_stripe_subscription_id), p_now, p_now, p_now
  ) on conflict (idempotency_key) do nothing;
  select * into strict run_record from public.ghl_provisioning_runs where idempotency_key = idempotency_value;
  if run_record.organization_id is distinct from p_organization_id or run_record.installation_id is distinct from installation_record.id then
    raise exception 'GHL provisioning idempotency crossed tenant or installation authority.';
  end if;
  update public.ghl_billing_activation_requests set
    provisioning_run_id = run_record.id, status = 'provisioning_requested', blocker_code = null, updated_at = p_now
  where id = request_record.id returning * into request_record;
  return query select request_record.id, request_record.status, request_record.provisioning_run_id, request_record.blocker_code;
end;
$$;

create or replace function public.claim_next_ghl_provisioning_run_v1(
  p_environment text,
  p_worker_id text,
  p_now timestamptz default timezone('utc', now()),
  p_lease_ms integer default 300000
)
returns setof public.ghl_provisioning_runs
language plpgsql
security definer
set search_path = public
as $$
declare claimed_id uuid;
begin
  if p_environment not in ('production', 'sandbox') or nullif(trim(p_worker_id), '') is null then
    raise exception 'Invalid GHL provisioning worker authority.';
  end if;
  if not exists (
    select 1 from public.ghl_runtime_controls
    where environment = p_environment and provisioning_writes_enabled
  ) then
    raise exception 'GHL provisioning database kill switch is closed.';
  end if;
  with candidate as (
    select run.id
    from public.ghl_provisioning_runs run
    where run.environment = p_environment
      and run.state not in ('ready', 'operator_action_required', 'canceled')
      and (run.next_retry_at is null or run.next_retry_at <= p_now)
      and (run.locked_until is null or run.locked_until <= p_now)
    order by run.requested_at, run.id
    for update skip locked
    limit 1
  )
  update public.ghl_provisioning_runs run set
    locked_by = trim(p_worker_id), locked_at = p_now,
    locked_until = p_now + (least(greatest(p_lease_ms, 1000), 3600000)::text || ' milliseconds')::interval,
    lease_token = gen_random_uuid(), lease_generation = run.lease_generation + 1
  from candidate where run.id = candidate.id returning run.id into claimed_id;
  if claimed_id is null then return; end if;
  return query select * from public.ghl_provisioning_runs where id = claimed_id;
end;
$$;

create or replace function public.release_ghl_provisioning_run_claim_v1(
  p_run_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_now timestamptz default timezone('utc', now())
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ghl_provisioning_runs set
    locked_by = null, locked_at = null, locked_until = null, lease_token = null, updated_at = greatest(updated_at, p_now)
  where id = p_run_id and locked_by = p_worker_id and lease_token = p_lease_token
    and lease_generation = p_lease_generation and locked_until > p_now;
  return found;
end;
$$;

create or replace function public.prepare_ghl_location_personalization_v1(
  p_provisioning_run_id uuid,
  p_now timestamptz default timezone('utc', now())
)
returns public.ghl_location_personalizations
language plpgsql
security definer
set search_path = public
as $$
declare
  run_record public.ghl_provisioning_runs%rowtype;
  mapping_record public.ghl_location_mappings%rowtype;
  manifest_record public.ghl_snapshot_manifests%rowtype;
  organization_record public.organizations%rowtype;
  result_record public.ghl_location_personalizations%rowtype;
  custom_values_value jsonb;
  required_form_ids_value jsonb;
  destination_url_value text;
begin
  select * into strict run_record from public.ghl_provisioning_runs where id = p_provisioning_run_id;
  if run_record.state <> 'ready' or run_record.location_mapping_id is null then
    raise exception 'GHL personalization requires a ready fenced provisioning run.';
  end if;
  select * into strict mapping_record from public.ghl_location_mappings
  where id = run_record.location_mapping_id and organization_id = run_record.organization_id
    and environment = run_record.environment and status = 'active';
  select * into strict manifest_record from public.ghl_snapshot_manifests
  where id = run_record.snapshot_manifest_id and environment = run_record.environment
    and status = 'approved' and installation_mode = 'preinstalled';
  select * into strict organization_record from public.organizations where id = run_record.organization_id;

  custom_values_value := manifest_record.personalization_contract -> 'customValues';
  required_form_ids_value := manifest_record.personalization_contract -> 'requiredFormIds';
  destination_url_value := trim(manifest_record.personalization_contract ->> 'destinationUrl');
  if jsonb_typeof(custom_values_value) <> 'object'
     or jsonb_typeof(required_form_ids_value) <> 'array'
     or jsonb_array_length(required_form_ids_value) = 0
     or destination_url_value !~ '^https://'
     or exists (
       select 1 from jsonb_each(custom_values_value) entry
       where jsonb_typeof(entry.value) <> 'string'
          or length(trim(entry.key)) = 0
          or length(entry.key) > 120
          or length(entry.value #>> '{}') > 5000
     )
     or exists (
       select 1 from jsonb_array_elements(required_form_ids_value) item
       where jsonb_typeof(item) <> 'string' or (item #>> '{}') !~ '^[A-Za-z0-9_-]{3,180}$'
     ) then
    raise exception 'Approved GHL personalization contract is structurally invalid.';
  end if;

  custom_values_value := custom_values_value || jsonb_build_object(
    'DealFlow Organization Name', organization_record.name
  );
  insert into public.ghl_location_personalizations (
    organization_id, location_mapping_id, environment, custom_values,
    required_form_ids, destination_url, status, current_step,
    values_fingerprint, created_at, updated_at
  ) values (
    run_record.organization_id, mapping_record.id, run_record.environment, custom_values_value,
    required_form_ids_value, destination_url_value, 'pending', 'custom_values',
    encode(extensions.digest(convert_to(custom_values_value::text || '|' || required_form_ids_value::text || '|' || destination_url_value, 'utf8'), 'sha256'), 'hex'),
    p_now, p_now
  ) on conflict (location_mapping_id) do nothing;
  select * into strict result_record from public.ghl_location_personalizations
  where location_mapping_id = mapping_record.id;
  if result_record.organization_id is distinct from run_record.organization_id
     or result_record.environment is distinct from run_record.environment
     or result_record.values_fingerprint is distinct from encode(extensions.digest(convert_to(custom_values_value::text || '|' || required_form_ids_value::text || '|' || destination_url_value, 'utf8'), 'sha256'), 'hex') then
    raise exception 'GHL personalization idempotency crossed tenant or approved contract identity.';
  end if;
  return result_record;
end;
$$;

create or replace function public.claim_next_ghl_location_personalization_v1(
  p_environment text,
  p_worker_id text,
  p_now timestamptz default timezone('utc', now()),
  p_lease_ms integer default 300000
)
returns setof public.ghl_location_personalizations
language plpgsql
security definer
set search_path = public
as $$
declare claimed_id uuid;
begin
  if p_environment not in ('production', 'sandbox') or nullif(trim(p_worker_id), '') is null then
    raise exception 'Invalid GHL personalization worker authority.';
  end if;
  if not exists (
    select 1 from public.ghl_runtime_controls
    where environment = p_environment and provisioning_writes_enabled
  ) then
    raise exception 'GHL personalization database kill switch is closed.';
  end if;
  with candidate as (
    select personalization.id
    from public.ghl_location_personalizations personalization
    where personalization.environment = p_environment
      and personalization.status = 'pending'
      and (personalization.next_retry_at is null or personalization.next_retry_at <= p_now)
      and (personalization.locked_until is null or personalization.locked_until <= p_now)
    order by personalization.created_at, personalization.id
    for update skip locked
    limit 1
  )
  update public.ghl_location_personalizations personalization set
    status = 'applying', locked_by = trim(p_worker_id),
    locked_until = p_now + (least(greatest(p_lease_ms, 1000), 3600000)::text || ' milliseconds')::interval,
    lease_token = gen_random_uuid(), lease_generation = personalization.lease_generation + 1,
    updated_at = p_now
  from candidate where personalization.id = candidate.id returning personalization.id into claimed_id;
  if claimed_id is null then return; end if;
  return query select * from public.ghl_location_personalizations where id = claimed_id;
end;
$$;

create or replace function public.settle_ghl_location_personalization_v1(
  p_personalization_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_outcome text,
  p_receipt jsonb,
  p_error_code text,
  p_next_retry_at timestamptz,
  p_now timestamptz default timezone('utc', now())
)
returns public.ghl_location_personalizations
language plpgsql
security definer
set search_path = public
as $$
declare current_record public.ghl_location_personalizations%rowtype;
declare result_record public.ghl_location_personalizations%rowtype;
begin
  if p_outcome not in ('succeeded', 'retryable_failure', 'uncertain', 'operator_action_required')
     or jsonb_typeof(coalesce(p_receipt, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid GHL personalization settlement.';
  end if;
  select * into strict current_record from public.ghl_location_personalizations
  where id = p_personalization_id for update;
  if current_record.status <> 'applying'
     or current_record.locked_by is distinct from p_worker_id
     or current_record.lease_token is distinct from p_lease_token
     or current_record.lease_generation is distinct from p_lease_generation
     or current_record.locked_until <= p_now then
    raise exception 'GHL personalization lease expired or was superseded.';
  end if;

  update public.ghl_location_personalizations set
    custom_value_receipt = case when current_record.current_step = 'custom_values' then p_receipt else custom_value_receipt end,
    form_verification_receipt = case when current_record.current_step = 'forms' then p_receipt else form_verification_receipt end,
    current_step = case
      when p_outcome = 'succeeded' and current_record.current_step = 'custom_values' then 'forms'
      when p_outcome = 'succeeded' and current_record.current_step = 'forms' then 'ready'
      else current_record.current_step
    end,
    status = case
      when p_outcome = 'succeeded' and current_record.current_step = 'forms' then 'ready'
      when p_outcome = 'succeeded' then 'pending'
      when p_outcome = 'retryable_failure' then 'pending'
      else p_outcome
    end,
    applied_at = case when p_outcome = 'succeeded' and current_record.current_step = 'custom_values' then p_now else applied_at end,
    verified_at = case when p_outcome = 'succeeded' and current_record.current_step = 'forms' then p_now else verified_at end,
    last_error_code = case when p_outcome = 'succeeded' then null else p_error_code end,
    next_retry_at = case when p_outcome = 'retryable_failure' then p_next_retry_at else null end,
    locked_by = null, locked_until = null, lease_token = null, updated_at = p_now
  where id = current_record.id returning * into strict result_record;
  return result_record;
end;
$$;

create or replace function public.resolve_ghl_ready_destination_v1(
  p_organization_id uuid,
  p_environment text
)
returns table(personalization_id uuid, location_mapping_id uuid, destination_url text)
language sql
security definer
set search_path = public
stable
as $$
  select personalization.id, personalization.location_mapping_id, personalization.destination_url
  from public.ghl_location_personalizations personalization
  join public.ghl_location_mappings mapping
    on mapping.id = personalization.location_mapping_id
   and mapping.organization_id = personalization.organization_id
  where personalization.organization_id = p_organization_id
    and personalization.environment = p_environment
    and personalization.status = 'ready'
    and personalization.current_step = 'ready'
    and personalization.verified_at is not null
    and mapping.status = 'active'
  limit 1
$$;

create schema if not exists private;
revoke all on schema private from public, anon;

create or replace function private.record_ghl_lifecycle_operator_action_v1(
  p_event_id uuid,
  p_blocker_code text,
  p_object_kind text,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare event_record public.ghl_lifecycle_webhook_events%rowtype;
begin
  if nullif(trim(p_blocker_code), '') is null
     or p_object_kind not in ('appointment', 'contact', 'opportunity', 'outbound_message') then
    raise exception 'Invalid GHL lifecycle operator-action identity.';
  end if;

  select * into strict event_record
  from public.ghl_lifecycle_webhook_events
  where id = p_event_id
  for update;

  update public.ghl_lifecycle_webhook_events
  set projection_status = 'operator_action_required',
      projection_code = trim(p_blocker_code),
      projected_at = p_now
  where id = event_record.id;

  insert into public.ghl_operator_requests (
    organization_id,
    lifecycle_event_id,
    request_kind,
    blocker_code,
    idempotency_key,
    status,
    details,
    requested_at,
    updated_at
  ) values (
    event_record.organization_id,
    event_record.id,
    'lifecycle_reconciliation',
    trim(p_blocker_code),
    'ghl-lifecycle:' || event_record.id::text || ':' || trim(p_blocker_code),
    'open',
    jsonb_build_object(
      'lifecycle_event_id', event_record.id,
      'event_type', event_record.event_type,
      'object_kind', p_object_kind,
      'location_mapping_id', event_record.location_mapping_id
    ),
    p_now,
    p_now
  ) on conflict (idempotency_key) do nothing;
end;
$$;

create or replace function public.ingest_ghl_lifecycle_webhook_v1(
  p_provider_location_id text,
  p_provider_event_id text,
  p_event_type text,
  p_provider_object_id text,
  p_provider_contact_id text,
  p_provider_calendar_id text,
  p_appointment_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_provider_updated_at timestamptz,
  p_payload_fingerprint text,
  p_received_at timestamptz default timezone('utc', now())
)
returns public.ghl_lifecycle_webhook_events
language plpgsql
security definer
set search_path = public
as $$
declare
  mapping_record public.ghl_location_mappings%rowtype;
  result_record public.ghl_lifecycle_webhook_events%rowtype;
  state_record public.ghl_lifecycle_object_states%rowtype;
  appointment_record public.appointments%rowtype;
  lead_record public.leads%rowtype;
  candidate_lead_ids uuid[];
  candidate_count integer := 0;
  resolved_lead_id_value uuid;
  object_kind_value text;
  provider_contact_value text;
  provider_status_value text;
  provider_time_value timestamptz;
  canonical_status_value text;
  canonical_appointment_id_value uuid;
  state_found boolean := false;
  appointment_found boolean := false;
begin
  if p_event_type not in (
    'AppointmentCreate', 'AppointmentUpdate', 'AppointmentDelete', 'ContactUpdate',
    'OpportunityStatusUpdate', 'OutboundMessage'
  ) then
    raise exception 'Unsupported GHL lifecycle event.';
  end if;
  if nullif(trim(p_provider_location_id), '') is null
     or length(trim(p_provider_location_id)) > 180
     or nullif(trim(p_provider_event_id), '') is null
     or length(trim(p_provider_event_id)) > 240
     or nullif(trim(p_provider_object_id), '') is null
     or length(trim(p_provider_object_id)) > 180
     or p_payload_fingerprint !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_provider_contact_id, '')) > 180
     or length(coalesce(p_provider_calendar_id, '')) > 180
     or length(coalesce(p_appointment_status, '')) > 180 then
    raise exception 'Invalid GHL lifecycle webhook identity.';
  end if;
  if not exists (
    select 1 from public.ghl_runtime_controls
    where environment = 'production' and lifecycle_webhook_enabled
  ) then
    raise exception 'GHL lifecycle webhook database kill switch is closed.';
  end if;
  select * into strict mapping_record from public.ghl_location_mappings
  where environment = 'production'
    and provider_location_id = trim(p_provider_location_id)
    and status = 'active';
  insert into public.ghl_lifecycle_webhook_events (
    organization_id, location_mapping_id, provider_event_id, event_type, provider_object_id,
    provider_contact_id, provider_calendar_id, appointment_status, starts_at, ends_at,
    provider_updated_at, signature_algorithm, payload_fingerprint, received_at
  ) values (
    mapping_record.organization_id, mapping_record.id, trim(p_provider_event_id), p_event_type, trim(p_provider_object_id),
    nullif(trim(p_provider_contact_id), ''), nullif(trim(p_provider_calendar_id), ''), nullif(trim(p_appointment_status), ''), p_starts_at, p_ends_at,
    p_provider_updated_at, 'ed25519', p_payload_fingerprint, p_received_at
  ) on conflict (location_mapping_id, provider_event_id) do nothing;
  select * into strict result_record from public.ghl_lifecycle_webhook_events
  where location_mapping_id = mapping_record.id and provider_event_id = trim(p_provider_event_id)
  for update;
  if result_record.payload_fingerprint is distinct from p_payload_fingerprint
     or result_record.event_type is distinct from p_event_type
     or result_record.provider_object_id is distinct from trim(p_provider_object_id)
     or result_record.provider_contact_id is distinct from nullif(trim(p_provider_contact_id), '')
     or result_record.provider_calendar_id is distinct from nullif(trim(p_provider_calendar_id), '')
     or result_record.appointment_status is distinct from nullif(trim(p_appointment_status), '')
     or result_record.starts_at is distinct from p_starts_at
     or result_record.ends_at is distinct from p_ends_at
     or result_record.provider_updated_at is distinct from p_provider_updated_at then
    raise exception 'GHL lifecycle webhook idempotency conflict.';
  end if;

  -- A duplicate provider delivery observes the exact durable result and cannot
  -- re-run application transitions or create a second operator request.
  if result_record.projection_status <> 'received' then
    return result_record;
  end if;

  object_kind_value := case
    when p_event_type like 'Appointment%' then 'appointment'
    when p_event_type = 'ContactUpdate' then 'contact'
    when p_event_type = 'OpportunityStatusUpdate' then 'opportunity'
    else 'outbound_message'
  end;
  provider_contact_value := case
    when p_event_type = 'ContactUpdate' then trim(p_provider_object_id)
    else nullif(trim(p_provider_contact_id), '')
  end;
  provider_status_value := nullif(lower(trim(p_appointment_status)), '');
  provider_time_value := coalesce(p_provider_updated_at, p_received_at);

  -- Serialize all events for one exact provider object before inspecting its
  -- current version. This closes concurrent create/update/delete races.
  perform pg_advisory_xact_lock(hashtextextended(
    mapping_record.id::text || ':' || object_kind_value || ':' || trim(p_provider_object_id),
    0
  ));

  select * into state_record
  from public.ghl_lifecycle_object_states
  where location_mapping_id = mapping_record.id
    and object_kind = object_kind_value
    and provider_object_id = trim(p_provider_object_id)
  for update;
  state_found := found;

  if state_found and p_provider_updated_at is null
     and state_record.last_payload_fingerprint is distinct from p_payload_fingerprint then
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id, 'ghl_lifecycle_provider_timestamp_missing', object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  end if;
  if state_found and provider_time_value < state_record.last_provider_updated_at then
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id, 'ghl_lifecycle_out_of_order_event', object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  end if;
  if state_found and provider_time_value = state_record.last_provider_updated_at
     and state_record.last_payload_fingerprint is distinct from p_payload_fingerprint then
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id, 'ghl_lifecycle_same_version_conflict', object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  end if;
  if state_found and state_record.last_payload_fingerprint = p_payload_fingerprint then
    update public.ghl_lifecycle_webhook_events
    set projection_status = 'reconciled',
        projection_code = 'idempotent_provider_object_delivery',
        resolved_lead_id = state_record.lead_id,
        canonical_appointment_id = state_record.canonical_appointment_id,
        projected_at = p_received_at
    where id = result_record.id
    returning * into strict result_record;
    return result_record;
  end if;

  select array_agg(distinct effect.lead_id order by effect.lead_id),
         count(distinct effect.lead_id)::integer
  into candidate_lead_ids, candidate_count
  from public.ghl_lead_effect_events effect
  where effect.organization_id = mapping_record.organization_id
    and effect.location_mapping_id = mapping_record.id
    and effect.status = 'succeeded'
    and (
      (provider_contact_value is not null and effect.provider_contact_id = provider_contact_value)
      or (
        object_kind_value = 'opportunity'
        and effect.provider_opportunity_id = trim(p_provider_object_id)
      )
    );
  candidate_count := coalesce(candidate_count, 0);

  if state_found then
    if candidate_count > 1
       or (candidate_count = 1 and candidate_lead_ids[1] is distinct from state_record.lead_id) then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_ambiguous_lead_binding', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;
    resolved_lead_id_value := state_record.lead_id;
  elsif candidate_count = 0 then
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id, 'ghl_lifecycle_unknown_lead_binding', object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  elsif candidate_count > 1 then
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id, 'ghl_lifecycle_ambiguous_lead_binding', object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  else
    resolved_lead_id_value := candidate_lead_ids[1];
  end if;

  select * into lead_record
  from public.leads
  where id = resolved_lead_id_value
    and organization_id = mapping_record.organization_id
  for update;
  if not found then
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id, 'ghl_lifecycle_lead_tenant_conflict', object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  end if;

  if object_kind_value = 'appointment' then
    select * into appointment_record
    from public.appointments
    where ghl_location_mapping_id = mapping_record.id
      and ghl_appointment_id = trim(p_provider_object_id)
    for update;
    appointment_found := found;

    if appointment_found and (
      appointment_record.organization_id is distinct from mapping_record.organization_id
      or appointment_record.lead_id is distinct from resolved_lead_id_value
    ) then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_appointment_binding_conflict', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;
    if p_event_type = 'AppointmentDelete' and not appointment_found then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_appointment_delete_without_binding', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;
    if p_event_type <> 'AppointmentDelete' and p_starts_at is null then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_appointment_start_missing', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;
    if p_event_type <> 'AppointmentDelete'
       and (lead_record.user_id is null or lead_record.campaign_id is null) then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_lead_campaign_identity_missing', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;

    if p_event_type <> 'AppointmentDelete'
       and (
         provider_status_value is null
         or provider_status_value not in (
           'new', 'confirmed', 'active', 'showed', 'completed', 'cancelled', 'noshow'
         )
       ) then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_appointment_status_unknown', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;

    canonical_status_value := case
      when p_event_type = 'AppointmentDelete' or provider_status_value = 'cancelled' then 'canceled'
      when provider_status_value = 'noshow' then 'no_show'
      when provider_status_value in ('completed', 'showed') then 'completed'
      when provider_status_value in ('new', 'confirmed', 'active') then 'booked'
    end;

    if appointment_found then
      update public.appointments
      set user_id = coalesce(user_id, lead_record.user_id),
          campaign_id = coalesce(campaign_id, lead_record.campaign_id),
          scheduled_at = coalesce(p_starts_at, scheduled_at),
          status = canonical_status_value,
          appointment_type = coalesce(appointment_type, 'ghl'),
          ghl_contact_id = coalesce(provider_contact_value, ghl_contact_id),
          ghl_calendar_id = coalesce(nullif(trim(p_provider_calendar_id), ''), ghl_calendar_id),
          ghl_provider_updated_at = provider_time_value,
          ghl_ends_at = coalesce(p_ends_at, ghl_ends_at),
          ghl_deleted_at = case when p_event_type = 'AppointmentDelete' then p_received_at else null end,
          ghl_last_event_id = trim(p_provider_event_id),
          ghl_last_payload_fingerprint = p_payload_fingerprint,
          updated_at = p_received_at
      where id = appointment_record.id
      returning id into strict canonical_appointment_id_value;
    else
      insert into public.appointments (
        organization_id, user_id, campaign_id, lead_id, scheduled_at, status,
        appointment_type, ghl_location_mapping_id, ghl_appointment_id,
        ghl_contact_id, ghl_calendar_id, ghl_provider_updated_at, ghl_ends_at,
        ghl_last_event_id, ghl_last_payload_fingerprint, created_at, updated_at
      ) values (
        mapping_record.organization_id, lead_record.user_id, lead_record.campaign_id,
        resolved_lead_id_value, p_starts_at, canonical_status_value, 'ghl',
        mapping_record.id, trim(p_provider_object_id), provider_contact_value,
        nullif(trim(p_provider_calendar_id), ''), provider_time_value, p_ends_at,
        trim(p_provider_event_id), p_payload_fingerprint, p_received_at, p_received_at
      ) returning id into strict canonical_appointment_id_value;
    end if;

    if canonical_status_value in ('booked', 'completed') then
      update public.leads
      set status = 'booked', updated_at = p_received_at
      where id = resolved_lead_id_value and organization_id = mapping_record.organization_id;
    elsif canonical_status_value in ('canceled', 'no_show')
       and not exists (
         select 1 from public.appointments other_appointment
         where other_appointment.organization_id = mapping_record.organization_id
           and other_appointment.lead_id = resolved_lead_id_value
           and other_appointment.id <> canonical_appointment_id_value
           and other_appointment.status in ('scheduled', 'booked', 'completed')
       ) then
      update public.leads
      set status = 'qualified', updated_at = p_received_at
      where id = resolved_lead_id_value
        and organization_id = mapping_record.organization_id
        and status = 'booked';
    end if;
  elsif object_kind_value = 'opportunity' then
    if provider_status_value in ('lost', 'abandoned') then
      update public.leads set status = 'lost', updated_at = p_received_at
      where id = resolved_lead_id_value and organization_id = mapping_record.organization_id;
    elsif provider_status_value = 'won' then
      update public.leads set status = 'booked', updated_at = p_received_at
      where id = resolved_lead_id_value and organization_id = mapping_record.organization_id;
    elsif provider_status_value = 'open' then
      update public.leads set status = 'qualified', updated_at = p_received_at
      where id = resolved_lead_id_value
        and organization_id = mapping_record.organization_id
        and status in ('new', 'engaged');
    end if;
  end if;

  insert into public.ghl_lifecycle_object_states (
    organization_id, location_mapping_id, lead_id, object_kind,
    provider_object_id, provider_contact_id, provider_status,
    canonical_appointment_id, last_event_id, last_event_type,
    last_provider_updated_at, last_received_at, last_payload_fingerprint,
    created_at, updated_at
  ) values (
    mapping_record.organization_id, mapping_record.id, resolved_lead_id_value,
    object_kind_value, trim(p_provider_object_id), provider_contact_value,
    provider_status_value, canonical_appointment_id_value,
    trim(p_provider_event_id), p_event_type, provider_time_value, p_received_at,
    p_payload_fingerprint, p_received_at, p_received_at
  ) on conflict (location_mapping_id, object_kind, provider_object_id) do update set
    provider_contact_id = excluded.provider_contact_id,
    provider_status = excluded.provider_status,
    canonical_appointment_id = coalesce(excluded.canonical_appointment_id, public.ghl_lifecycle_object_states.canonical_appointment_id),
    last_event_id = excluded.last_event_id,
    last_event_type = excluded.last_event_type,
    last_provider_updated_at = excluded.last_provider_updated_at,
    last_received_at = excluded.last_received_at,
    last_payload_fingerprint = excluded.last_payload_fingerprint,
    updated_at = excluded.updated_at
  where public.ghl_lifecycle_object_states.organization_id = excluded.organization_id
    and public.ghl_lifecycle_object_states.lead_id = excluded.lead_id;
  if not found then
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id, 'ghl_lifecycle_object_binding_conflict', object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  end if;

  update public.ghl_lifecycle_webhook_events
  set projection_status = 'reconciled',
      projection_code = 'canonical_state_projected',
      resolved_lead_id = resolved_lead_id_value,
      canonical_appointment_id = canonical_appointment_id_value,
      projected_at = p_received_at
  where id = result_record.id
  returning * into strict result_record;
  return result_record;
end;
$$;

-- The production producer and claimer intentionally preserve the already
-- verified sandbox protocol byte-for-byte, changing only the exact provider
-- environment and adding the database-side lead kill switch. Any unexpected
-- predecessor definition aborts the migration instead of silently weakening it.
do $dealflow_clone_ghl_production_lead_protocol$
declare
  enqueue_definition text;
  claim_definition text;
begin
  select pg_get_functiondef('public.enqueue_ghl_sandbox_lead_effects(uuid,uuid,timestamptz)'::regprocedure)
    into enqueue_definition;
  if enqueue_definition is null
     or position('provider_mode'', ''sandbox''' in enqueue_definition) = 0
     or position('environment = ''sandbox''' in enqueue_definition) = 0 then
    raise exception 'Unexpected GHL sandbox enqueue protocol; production clone refused.';
  end if;
  enqueue_definition := replace(enqueue_definition, 'enqueue_ghl_sandbox_lead_effects', 'enqueue_ghl_production_lead_effects');
  enqueue_definition := replace(enqueue_definition, 'GHL sandbox', 'GHL production');
  enqueue_definition := replace(enqueue_definition, 'ghl-sandbox-lead-effect-v2:', 'ghl-production-lead-effect-v2:');
  enqueue_definition := replace(enqueue_definition, '''sandbox''', '''production''');
  enqueue_definition := regexp_replace(
    enqueue_definition,
    'begin[[:space:]]+if[[:space:]]+not[[:space:]]+exists',
    E'begin\n  if not exists (select 1 from public.ghl_runtime_controls where environment = ''production'' and lead_writes_enabled) then\n    raise exception ''GHL production lead database kill switch is closed.'';\n  end if;\n  if not exists',
    'i'
  );
  if position('database kill switch is closed' in enqueue_definition) = 0 then
    raise exception 'Could not fence GHL production enqueue protocol.';
  end if;
  execute enqueue_definition;

  select pg_get_functiondef('public.claim_next_ghl_sandbox_lead_outbox(text,timestamptz,integer)'::regprocedure)
    into claim_definition;
  if claim_definition is null
     or position('{"provider_mode":"sandbox"}' in claim_definition) = 0
     or position('environment = ''sandbox''' in claim_definition) = 0 then
    raise exception 'Unexpected GHL sandbox claim protocol; production clone refused.';
  end if;
  claim_definition := replace(claim_definition, 'claim_next_ghl_sandbox_lead_outbox', 'claim_next_ghl_production_lead_outbox');
  claim_definition := replace(claim_definition, '"sandbox"', '"production"');
  claim_definition := replace(claim_definition, '''sandbox''', '''production''');
  claim_definition := regexp_replace(
    claim_definition,
    'begin[[:space:]]+if[[:space:]]+p_worker_id[[:space:]]+is[[:space:]]+null',
    E'begin\n  if not exists (select 1 from public.ghl_runtime_controls where environment = ''production'' and lead_writes_enabled) then\n    raise exception ''GHL production lead database kill switch is closed.'';\n  end if;\n  if p_worker_id is null',
    'i'
  );
  if position('database kill switch is closed' in claim_definition) = 0 then
    raise exception 'Could not fence GHL production claim protocol.';
  end if;
  execute claim_definition;
end;
$dealflow_clone_ghl_production_lead_protocol$;

revoke all on table public.ghl_runtime_controls from anon, authenticated;
revoke all on table public.ghl_billing_activation_requests from anon, authenticated;
revoke all on table public.ghl_location_personalizations from anon, authenticated;
revoke all on table public.ghl_lifecycle_webhook_events from public, anon, authenticated, service_role;
revoke all on table public.ghl_lifecycle_object_states from public, anon, authenticated, service_role;
grant select on table public.ghl_runtime_controls to service_role;
grant select, insert, update on table public.ghl_billing_activation_requests to service_role;
grant select, insert, update on table public.ghl_location_personalizations to service_role;
grant select on table public.ghl_lifecycle_webhook_events to service_role;
grant select on table public.ghl_lifecycle_object_states to service_role;
revoke all on function public.request_ghl_provisioning_from_billing_activation_v1(uuid, uuid, text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.request_ghl_provisioning_from_billing_activation_v1(uuid, uuid, text, uuid, text, timestamptz) to service_role;
revoke all on function public.claim_next_ghl_provisioning_run_v1(text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_next_ghl_provisioning_run_v1(text, text, timestamptz, integer) to service_role;
revoke all on function public.release_ghl_provisioning_run_claim_v1(uuid, text, uuid, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.release_ghl_provisioning_run_claim_v1(uuid, text, uuid, bigint, timestamptz) to service_role;
revoke all on function public.prepare_ghl_location_personalization_v1(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.prepare_ghl_location_personalization_v1(uuid, timestamptz) to service_role;
revoke all on function public.claim_next_ghl_location_personalization_v1(text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_next_ghl_location_personalization_v1(text, text, timestamptz, integer) to service_role;
revoke all on function public.settle_ghl_location_personalization_v1(uuid, text, uuid, bigint, text, jsonb, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.settle_ghl_location_personalization_v1(uuid, text, uuid, bigint, text, jsonb, text, timestamptz, timestamptz) to service_role;
revoke all on function public.resolve_ghl_ready_destination_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_ghl_ready_destination_v1(uuid, text) to service_role;
revoke all on function public.ingest_ghl_lifecycle_webhook_v1(text, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz, text, timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_ghl_lifecycle_webhook_v1(text, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz, text, timestamptz) to service_role;
revoke all on function private.record_ghl_lifecycle_operator_action_v1(uuid, text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.enqueue_ghl_production_lead_effects(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_ghl_production_lead_effects(uuid, uuid, timestamptz) to service_role;
revoke all on function public.claim_next_ghl_production_lead_outbox(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_next_ghl_production_lead_outbox(text, timestamptz, integer) to service_role;
