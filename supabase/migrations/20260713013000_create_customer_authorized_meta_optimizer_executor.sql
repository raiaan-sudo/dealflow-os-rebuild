-- Customer-authorized autonomous Meta optimization. Provider writes remain
-- default-closed; this migration creates only durable authority, queue, and
-- armed-effect state.

create table public.meta_optimization_runtime_controls (
  environment text primary key check (environment in ('staging', 'production')),
  provider_mode text not null default 'shadow' check (provider_mode in ('shadow', 'sandbox', 'live')),
  execution_writes_enabled boolean not null default false,
  global_kill_switch boolean not null default true,
  control_generation bigint not null default 1 check (control_generation > 0),
  change_reason text not null default 'seeded_closed' check (length(trim(change_reason)) between 3 and 500),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.meta_optimization_runtime_controls(
  environment, provider_mode, execution_writes_enabled, global_kill_switch,
  control_generation, change_reason
) values
  ('staging', 'shadow', false, true, 1, 'seeded_closed'),
  ('production', 'shadow', false, true, 1, 'seeded_closed')
on conflict (environment) do nothing;

create table public.meta_optimization_policy_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  activation_preauthorization_id uuid not null
    references public.meta_campaign_activation_preauthorizations(id) on delete restrict,
  activation_intent_id uuid not null
    references public.meta_campaign_activation_intents(id) on delete restrict,
  launch_record_id uuid not null references public.campaign_launch_records(id) on delete restrict,
  customer_authorized_by uuid not null references auth.users(id) on delete restrict,
  customer_authorized_at timestamptz not null default timezone('utc', now()),
  policy_version text not null default 'dealflow-realtor-optimization-v2'
    check (policy_version = 'dealflow-realtor-optimization-v2'),
  approved_currency text not null check (approved_currency in ('USD', 'CAD')),
  current_daily_budget_minor bigint not null check (current_daily_budget_minor between 100 and 100000000),
  customer_daily_budget_ceiling_minor bigint not null
    check (customer_daily_budget_ceiling_minor between 100 and 100000000),
  provider_ad_account_id text not null check (provider_ad_account_id ~ '^[0-9]{5,40}$'),
  provider_campaign_id text not null check (provider_campaign_id ~ '^[0-9]{5,40}$'),
  provider_ad_set_id text not null check (provider_ad_set_id ~ '^[0-9]{5,40}$'),
  maximum_observation_age_minutes integer not null default 60
    check (maximum_observation_age_minutes = 60),
  minimum_impressions integer not null default 1000 check (minimum_impressions = 1000),
  minimum_clicks integer not null default 20 check (minimum_clicks = 20),
  minimum_spend_minor bigint not null default 5000 check (minimum_spend_minor = 5000),
  minimum_leads_for_cpl integer not null default 1 check (minimum_leads_for_cpl = 1),
  cooldown_minutes integer not null default 1440 check (cooldown_minutes = 1440),
  maximum_budget_increase_percent numeric not null default 20
    check (maximum_budget_increase_percent = 20),
  maximum_budget_decrease_percent numeric not null default 100
    check (maximum_budget_decrease_percent = 100),
  maximum_daily_scale_percent numeric not null default 20
    check (maximum_daily_scale_percent = 20),
  customer_consent_digest text not null check (customer_consent_digest ~ '^[0-9a-f]{64}$'),
  policy_digest text not null check (policy_digest ~ '^[0-9a-f]{64}$'),
  authorization_generation integer not null check (authorization_generation between 1 and 1000),
  idempotency_key text not null check (length(trim(idempotency_key)) between 8 and 200),
  status text not null default 'active' check (status in ('active', 'revoked', 'operator_required')),
  revoked_at timestamptz null,
  revocation_reason text null,
  last_error_code text null,
  last_error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint meta_optimization_policy_campaign_scope_fk
    foreign key (campaign_id, organization_id, user_id)
    references public.campaign_plans(id, organization_id, user_id) on delete restrict,
  constraint meta_optimization_policy_customer_check check (
    customer_authorized_by = user_id
    and customer_daily_budget_ceiling_minor >= current_daily_budget_minor
  ),
  constraint meta_optimization_policy_idempotency_unique unique (organization_id, idempotency_key)
);

create unique index meta_optimization_one_active_policy_idx
  on public.meta_optimization_policy_authorizations(organization_id, campaign_id)
  where status = 'active';

alter table public.optimization_campaign_controls
  add column if not exists active_policy_authorization_id uuid null
    references public.meta_optimization_policy_authorizations(id) on delete restrict,
  add column if not exists approved_currency text null
    check (approved_currency is null or approved_currency in ('USD', 'CAD')),
  add column if not exists customer_daily_budget_ceiling_minor bigint null
    check (customer_daily_budget_ceiling_minor is null or customer_daily_budget_ceiling_minor between 100 and 100000000),
  add column if not exists last_known_daily_budget_minor bigint null
    check (last_known_daily_budget_minor is null or last_known_daily_budget_minor between 100 and 100000000),
  add column if not exists provider_ad_account_id text null,
  add column if not exists provider_campaign_id text null,
  add column if not exists provider_ad_set_id text null,
  add column if not exists policy_consent_at timestamptz null,
  add column if not exists scale_window_started_at timestamptz null;

create table public.meta_optimization_execution_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  decision_id uuid not null references public.optimization_decisions(id) on delete restrict,
  policy_authorization_id uuid not null
    references public.meta_optimization_policy_authorizations(id) on delete restrict,
  environment text not null check (environment in ('staging', 'production')),
  policy_version text not null check (policy_version = 'dealflow-realtor-optimization-v2'),
  approved_currency text not null check (approved_currency in ('USD', 'CAD')),
  provider_ad_account_id text not null check (provider_ad_account_id ~ '^[0-9]{5,40}$'),
  provider_campaign_id text not null check (provider_campaign_id ~ '^[0-9]{5,40}$'),
  provider_object_type text not null check (provider_object_type in ('campaign', 'adset')),
  provider_object_id text not null check (provider_object_id ~ '^[0-9]{5,40}$'),
  action_type text not null check (action_type in ('pause', 'budget')),
  action_reason text not null check (length(trim(action_reason)) between 3 and 500),
  change_percent numeric not null check (change_percent in (-100, 20)),
  current_daily_budget_minor bigint not null check (current_daily_budget_minor between 100 and 100000000),
  intended_daily_budget_minor bigint null
    check (intended_daily_budget_minor is null or intended_daily_budget_minor between 100 and 100000000),
  customer_daily_budget_ceiling_minor bigint not null
    check (customer_daily_budget_ceiling_minor between 100 and 100000000),
  source_timestamp timestamptz not null,
  evidence_digest text not null check (evidence_digest ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (length(trim(idempotency_key)) between 8 and 240),
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'armed', 'succeeded', 'blocked', 'operator_required', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  worker_id text null,
  lease_token uuid null,
  lease_generation bigint not null default 0 check (lease_generation >= 0),
  locked_until timestamptz null,
  claimed_control_generation bigint null,
  execution_token uuid null,
  provider_effect_armed_at timestamptz null,
  dispatch_authority_nonce uuid null,
  dispatch_authority_checked_at timestamptz null,
  dispatch_control_generation bigint null check (
    dispatch_control_generation is null or dispatch_control_generation > 0
  ),
  dispatch_authority_digest text null check (
    dispatch_authority_digest is null or dispatch_authority_digest ~ '^[0-9a-f]{64}$'
  ),
  provider_mutation_performed boolean not null default false,
  before_state jsonb null,
  before_state_digest text null check (before_state_digest is null or before_state_digest ~ '^[0-9a-f]{64}$'),
  provider_receipt_id text null,
  after_state jsonb null,
  after_state_digest text null check (after_state_digest is null or after_state_digest ~ '^[0-9a-f]{64}$'),
  last_error_code text null,
  last_error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  constraint meta_optimization_intent_campaign_scope_fk
    foreign key (campaign_id, organization_id, user_id)
    references public.campaign_plans(id, organization_id, user_id) on delete restrict,
  constraint meta_optimization_intent_idempotency_unique unique (organization_id, idempotency_key),
  constraint meta_optimization_intent_decision_unique unique (decision_id, action_type),
  constraint meta_optimization_intent_action_shape check (
    (action_type = 'pause' and provider_object_type = 'campaign'
      and intended_daily_budget_minor is null and change_percent = -100)
    or
    (action_type = 'budget' and provider_object_type = 'adset'
      and intended_daily_budget_minor is not null and change_percent = 20
      and intended_daily_budget_minor > current_daily_budget_minor
      and intended_daily_budget_minor <= customer_daily_budget_ceiling_minor)
  ),
  constraint meta_optimization_intent_claim_shape check (
    (status in ('claimed', 'armed') and worker_id is not null and lease_token is not null
      and locked_until is not null and claimed_control_generation is not null)
    or
    (status not in ('claimed', 'armed') and worker_id is null and lease_token is null
      and locked_until is null and claimed_control_generation is null)
  ),
  constraint meta_optimization_intent_arm_shape check (
    (status = 'armed' and execution_token is not null and provider_effect_armed_at is not null
      and before_state is not null and before_state_digest is not null)
    or status <> 'armed'
  ),
  constraint meta_optimization_intent_dispatch_shape check (
    (dispatch_authority_nonce is null and dispatch_authority_checked_at is null
      and dispatch_control_generation is null and dispatch_authority_digest is null)
    or
    (dispatch_authority_nonce is not null and dispatch_authority_checked_at is not null
      and dispatch_control_generation is not null and dispatch_authority_digest is not null)
  )
);

create index meta_optimization_execution_due_idx
  on public.meta_optimization_execution_intents(environment, status, created_at)
  where status = 'pending';
create index meta_optimization_execution_recovery_idx
  on public.meta_optimization_execution_intents(status, locked_until)
  where status in ('claimed', 'armed');

alter table public.meta_optimization_action_receipts
  add column if not exists execution_intent_id uuid null
    references public.meta_optimization_execution_intents(id) on delete restrict,
  add column if not exists receipt_status text not null default 'legacy'
    check (receipt_status in ('legacy', 'succeeded', 'operator_required')),
  add column if not exists approved_currency text null
    check (approved_currency is null or approved_currency in ('USD', 'CAD')),
  add column if not exists provider_object_id text null,
  add column if not exists change_percent numeric null;
create unique index meta_optimization_receipt_intent_unique
  on public.meta_optimization_action_receipts(execution_intent_id)
  where execution_intent_id is not null;

alter table public.meta_optimization_runtime_controls enable row level security;
alter table public.meta_optimization_runtime_controls force row level security;
alter table public.meta_optimization_policy_authorizations enable row level security;
alter table public.meta_optimization_policy_authorizations force row level security;
alter table public.meta_optimization_execution_intents enable row level security;
alter table public.meta_optimization_execution_intents force row level security;

revoke all on table public.meta_optimization_runtime_controls from public, anon, authenticated, service_role;
revoke all on table public.meta_optimization_policy_authorizations from public, anon, authenticated, service_role;
revoke all on table public.meta_optimization_execution_intents from public, anon, authenticated, service_role;
grant select on table public.meta_optimization_runtime_controls to service_role;
grant select on table public.meta_optimization_policy_authorizations to service_role;
grant select on table public.meta_optimization_execution_intents to service_role;
grant select, insert on table public.meta_optimization_action_receipts to service_role;

create policy meta_optimization_policy_owner_select
  on public.meta_optimization_policy_authorizations for select to authenticated
  using (user_id = auth.uid() and private.is_current_user_org_member(organization_id));
create policy meta_optimization_intent_owner_select
  on public.meta_optimization_execution_intents for select to authenticated
  using (user_id = auth.uid() and private.is_current_user_org_member(organization_id));

create or replace function private.meta_optimization_metric_numeric(
  p_metrics jsonb,
  p_key text
) returns numeric
language plpgsql immutable
set search_path = pg_catalog
as $$
declare raw_value text;
begin
  if jsonb_typeof(p_metrics) is distinct from 'object' then return null; end if;
  raw_value := p_metrics ->> p_key;
  if raw_value is null
    or raw_value !~ '^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$'
    or length(raw_value) > 32 then
    return null;
  end if;
  begin
    return raw_value::numeric;
  exception when numeric_value_out_of_range then
    return null;
  end;
end;
$$;
revoke all on function private.meta_optimization_metric_numeric(jsonb,text)
  from public, anon, authenticated, service_role;

create or replace function private.meta_optimization_activation_authority_current(
  p_policy_authorization_id uuid
) returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.meta_optimization_policy_authorizations policy
    join public.meta_campaign_activation_preauthorizations preauth
      on preauth.id = policy.activation_preauthorization_id
    join public.meta_campaign_activation_intents activation
      on activation.id = policy.activation_intent_id
    join public.campaign_launch_records launch
      on launch.id = policy.launch_record_id
    where policy.id = p_policy_authorization_id
      and policy.status = 'active'
      and preauth.organization_id = policy.organization_id
      and preauth.user_id = policy.user_id
      and preauth.campaign_id = policy.campaign_id
      and preauth.launch_record_id = policy.launch_record_id
      and preauth.activation_intent_id = policy.activation_intent_id
      and preauth.status = 'finalized'
      and preauth.approved_currency = policy.approved_currency
      and preauth.approved_daily_budget_minor = policy.current_daily_budget_minor
      and replace(preauth.provider_ad_account_id, 'act_', '') = policy.provider_ad_account_id
      and activation.organization_id = policy.organization_id
      and activation.user_id = policy.user_id
      and activation.campaign_id = policy.campaign_id
      and activation.launch_record_id = policy.launch_record_id
      and activation.status = 'active'
      and activation.provider_delivery_status in (
        'configured_active_pending_review', 'delivery_active'
      )
      and activation.provider_delivery_evidence_digest ~ '^[0-9a-f]{64}$'
      and activation.provider_contract_evidence_digest ~ '^[0-9a-f]{64}$'
      and replace(activation.provider_ad_account_id, 'act_', '') = policy.provider_ad_account_id
      and activation.provider_campaign_id = policy.provider_campaign_id
      and jsonb_typeof(activation.provider_ad_set_ids) = 'array'
      and jsonb_array_length(activation.provider_ad_set_ids) = 1
      and activation.provider_ad_set_ids ->> 0 = policy.provider_ad_set_id
      and jsonb_typeof(activation.provider_ad_ids) = 'array'
      and jsonb_array_length(activation.provider_ad_ids) = 1
      and launch.organization_id = policy.organization_id
      and launch.user_id = policy.user_id
      and launch.campaign_id = policy.campaign_id
      and launch.result_status = 'success'
      and launch.meta_campaign_id = policy.provider_campaign_id
      and launch.meta_ad_set_ids = activation.provider_ad_set_ids
      and launch.meta_ad_ids = activation.provider_ad_ids
      and (
        select count(*) = 3
        from public.meta_campaign_activation_objects object
        where object.activation_intent_id = activation.id
          and object.status = 'active'
          and object.provider_mutation_state in ('receipted', 'reconciled')
      )
      and exists (
        select 1 from public.meta_campaign_activation_objects object
        where object.activation_intent_id = activation.id
          and object.provider_object_type = 'campaign'
          and object.provider_object_id = policy.provider_campaign_id
          and object.status = 'active'
          and object.provider_mutation_state in ('receipted', 'reconciled')
      )
      and exists (
        select 1 from public.meta_campaign_activation_objects object
        where object.activation_intent_id = activation.id
          and object.provider_object_type = 'adset'
          and object.provider_object_id = policy.provider_ad_set_id
          and object.status = 'active'
          and object.provider_mutation_state in ('receipted', 'reconciled')
      )
      and exists (
        select 1 from public.meta_campaign_activation_objects object
        where object.activation_intent_id = activation.id
          and object.provider_object_type = 'ad'
          and object.provider_object_id = (activation.provider_ad_ids ->> 0)
          and object.status = 'active'
          and object.provider_mutation_state in ('receipted', 'reconciled')
      )
  )
$$;
revoke all on function private.meta_optimization_activation_authority_current(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.prevent_meta_optimization_policy_identity_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.user_id is distinct from old.user_id
    or new.campaign_id is distinct from old.campaign_id
    or new.activation_preauthorization_id is distinct from old.activation_preauthorization_id
    or new.activation_intent_id is distinct from old.activation_intent_id
    or new.launch_record_id is distinct from old.launch_record_id
    or new.customer_authorized_by is distinct from old.customer_authorized_by
    or new.customer_authorized_at is distinct from old.customer_authorized_at
    or new.policy_version is distinct from old.policy_version
    or new.approved_currency is distinct from old.approved_currency
    or new.current_daily_budget_minor is distinct from old.current_daily_budget_minor
    or new.customer_daily_budget_ceiling_minor is distinct from old.customer_daily_budget_ceiling_minor
    or new.provider_ad_account_id is distinct from old.provider_ad_account_id
    or new.provider_campaign_id is distinct from old.provider_campaign_id
    or new.provider_ad_set_id is distinct from old.provider_ad_set_id
    or new.maximum_observation_age_minutes is distinct from old.maximum_observation_age_minutes
    or new.minimum_impressions is distinct from old.minimum_impressions
    or new.minimum_clicks is distinct from old.minimum_clicks
    or new.minimum_spend_minor is distinct from old.minimum_spend_minor
    or new.minimum_leads_for_cpl is distinct from old.minimum_leads_for_cpl
    or new.cooldown_minutes is distinct from old.cooldown_minutes
    or new.maximum_budget_increase_percent is distinct from old.maximum_budget_increase_percent
    or new.maximum_budget_decrease_percent is distinct from old.maximum_budget_decrease_percent
    or new.maximum_daily_scale_percent is distinct from old.maximum_daily_scale_percent
    or new.customer_consent_digest is distinct from old.customer_consent_digest
    or new.policy_digest is distinct from old.policy_digest
    or new.authorization_generation is distinct from old.authorization_generation
    or new.idempotency_key is distinct from old.idempotency_key
    or new.created_at is distinct from old.created_at then
    raise exception 'optimization policy authority identity is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger meta_optimization_policy_identity_immutable
  before update on public.meta_optimization_policy_authorizations
  for each row execute function public.prevent_meta_optimization_policy_identity_mutation();

create or replace function public.set_meta_optimization_staging_runtime_control(
  p_expected_generation bigint,
  p_execution_writes_enabled boolean,
  p_global_kill_switch boolean,
  p_confirmation text,
  p_change_reason text
) returns public.meta_optimization_runtime_controls
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare updated public.meta_optimization_runtime_controls%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_expected_generation < 1
    or length(trim(coalesce(p_change_reason, ''))) not between 3 and 500
    or (p_execution_writes_enabled and p_global_kill_switch)
    or (p_execution_writes_enabled
      and p_confirmation is distinct from 'ENABLE_STAGING_SANDBOX_META_OPTIMIZATION')
    or (not p_execution_writes_enabled
      and p_confirmation is distinct from 'CLOSE_STAGING_META_OPTIMIZATION') then
    raise exception 'staging optimization control confirmation is invalid' using errcode = '22023';
  end if;
  update public.meta_optimization_runtime_controls control set
    provider_mode = case when p_execution_writes_enabled then 'sandbox' else 'shadow' end,
    execution_writes_enabled = p_execution_writes_enabled,
    global_kill_switch = p_global_kill_switch,
    control_generation = control.control_generation + 1,
    change_reason = trim(p_change_reason),
    updated_at = timezone('utc', now())
  where control.environment = 'staging'
    and control.control_generation = p_expected_generation
  returning * into updated;
  if updated.environment is null then
    raise exception 'staging optimization control generation conflict' using errcode = '40001';
  end if;
  return updated;
end;
$$;

create or replace function public.set_meta_optimization_production_runtime_control(
  p_expected_generation bigint,
  p_execution_writes_enabled boolean,
  p_global_kill_switch boolean,
  p_confirmation text,
  p_change_reason text
) returns public.meta_optimization_runtime_controls
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare updated public.meta_optimization_runtime_controls%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_expected_generation < 1
    or length(trim(coalesce(p_change_reason, ''))) not between 3 and 500
    or (p_execution_writes_enabled and p_global_kill_switch)
    or (p_execution_writes_enabled
      and p_confirmation is distinct from 'ENABLE_PRODUCTION_LIVE_META_OPTIMIZATION')
    or (not p_execution_writes_enabled
      and p_confirmation is distinct from 'CLOSE_PRODUCTION_META_OPTIMIZATION') then
    raise exception 'production optimization control confirmation is invalid' using errcode = '22023';
  end if;
  update public.meta_optimization_runtime_controls control set
    provider_mode = case when p_execution_writes_enabled then 'live' else 'shadow' end,
    execution_writes_enabled = p_execution_writes_enabled,
    global_kill_switch = p_global_kill_switch,
    control_generation = control.control_generation + 1,
    change_reason = trim(p_change_reason),
    updated_at = timezone('utc', now())
  where control.environment = 'production'
    and control.control_generation = p_expected_generation
  returning * into updated;
  if updated.environment is null then
    raise exception 'production optimization control generation conflict' using errcode = '40001';
  end if;
  return updated;
end;
$$;

create or replace function public.authorize_meta_optimization_policy(
  p_organization_id uuid, p_customer_user_id uuid, p_campaign_id uuid,
  p_customer_daily_budget_ceiling_minor bigint, p_approved_currency text,
  p_confirmation text, p_idempotency_key text
) returns public.meta_optimization_policy_authorizations
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare
  campaign public.campaign_plans%rowtype;
  preauth public.meta_campaign_activation_preauthorizations%rowtype;
  activation public.meta_campaign_activation_intents%rowtype;
  launch public.campaign_launch_records%rowtype;
  existing public.meta_optimization_policy_authorizations%rowtype;
  inserted public.meta_optimization_policy_authorizations%rowtype;
  normalized_currency text := upper(trim(coalesce(p_approved_currency, '')));
  ad_set_id text;
  consent_digest text;
  policy_digest text;
  next_generation integer;
  preauth_id uuid;
begin
  if auth.role() is distinct from 'service_role' or p_customer_user_id is null then
    raise exception 'service-controlled customer authority is required' using errcode = '42501';
  end if;
  if p_confirmation is distinct from 'ENABLE_AUTONOMOUS_META_OPTIMIZATION' then
    raise exception 'explicit optimization consent confirmation is required' using errcode = '22023';
  end if;
  if normalized_currency not in ('USD', 'CAD')
    or p_customer_daily_budget_ceiling_minor not between 100 and 100000000
    or length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 200 then
    raise exception 'optimization policy input is invalid' using errcode = '22023';
  end if;

  select * into campaign from public.campaign_plans candidate
  where candidate.id = p_campaign_id and candidate.organization_id = p_organization_id
    and candidate.user_id = p_customer_user_id for update;
  if campaign.id is null then raise exception 'campaign authority is missing' using errcode = '42501'; end if;

  select p.id into preauth_id
  from public.meta_campaign_activation_preauthorizations p
  join public.meta_campaign_activation_intents a on a.id = p.activation_intent_id
  join public.campaign_launch_records l on l.id = p.launch_record_id
  where p.organization_id = p_organization_id and p.user_id = p_customer_user_id
    and p.campaign_id = p_campaign_id and p.status = 'finalized'
    and a.status = 'active' and a.provider_delivery_status in ('configured_active_pending_review', 'delivery_active')
    and a.provider_delivery_evidence_digest ~ '^[0-9a-f]{64}$'
    and a.provider_contract_evidence_digest ~ '^[0-9a-f]{64}$'
    and jsonb_typeof(a.provider_ad_set_ids) = 'array' and jsonb_array_length(a.provider_ad_set_ids) = 1
    and jsonb_typeof(a.provider_ad_ids) = 'array' and jsonb_array_length(a.provider_ad_ids) = 1
    and l.result_status = 'success' and l.meta_campaign_id is not null
    and jsonb_typeof(l.meta_ad_set_ids) = 'array' and jsonb_array_length(l.meta_ad_set_ids) = 1
    and jsonb_typeof(l.meta_ad_ids) = 'array' and jsonb_array_length(l.meta_ad_ids) = 1
    and a.provider_campaign_id = l.meta_campaign_id
    and a.provider_ad_set_ids = l.meta_ad_set_ids
    and a.provider_ad_ids = l.meta_ad_ids
    and replace(a.provider_ad_account_id, 'act_', '') = replace(p.provider_ad_account_id, 'act_', '')
    and (select count(*) from public.meta_campaign_activation_objects object
      where object.activation_intent_id = a.id and object.status = 'active'
        and object.provider_mutation_state in ('receipted', 'reconciled')) = 3
    and exists (select 1 from public.meta_campaign_activation_objects object
      where object.activation_intent_id = a.id and object.provider_object_type = 'campaign'
        and object.provider_object_id = a.provider_campaign_id and object.status = 'active'
        and object.provider_mutation_state in ('receipted', 'reconciled'))
    and exists (select 1 from public.meta_campaign_activation_objects object
      where object.activation_intent_id = a.id and object.provider_object_type = 'adset'
        and object.provider_object_id = (a.provider_ad_set_ids ->> 0) and object.status = 'active'
        and object.provider_mutation_state in ('receipted', 'reconciled'))
    and exists (select 1 from public.meta_campaign_activation_objects object
      where object.activation_intent_id = a.id and object.provider_object_type = 'ad'
        and object.provider_object_id = (a.provider_ad_ids ->> 0) and object.status = 'active'
        and object.provider_mutation_state in ('receipted', 'reconciled'))
  order by p.customer_authorized_at desc limit 1;
  if preauth_id is null then
    raise exception 'an active, exactly receipted Meta launch is required' using errcode = '55000';
  end if;
  select * into strict preauth from public.meta_campaign_activation_preauthorizations
    where id = preauth_id;
  select * into strict activation from public.meta_campaign_activation_intents
    where id = preauth.activation_intent_id;
  select * into strict launch from public.campaign_launch_records
    where id = preauth.launch_record_id;
  ad_set_id := launch.meta_ad_set_ids ->> 0;
  if normalized_currency is distinct from preauth.approved_currency
    or p_customer_daily_budget_ceiling_minor < preauth.approved_daily_budget_minor
    or replace(preauth.provider_ad_account_id, 'act_', '') !~ '^[0-9]{5,40}$'
    or launch.meta_campaign_id !~ '^[0-9]{5,40}$'
    or ad_set_id !~ '^[0-9]{5,40}$' then
    raise exception 'optimization authority does not match the activated Meta contract' using errcode = '22023';
  end if;

  consent_digest := encode(extensions.digest(convert_to(concat_ws('|', p_organization_id::text, p_customer_user_id::text,
    p_campaign_id::text, preauth.id::text, activation.id::text, launch.id::text,
    p_customer_daily_budget_ceiling_minor::text, normalized_currency,
    replace(preauth.provider_ad_account_id, 'act_', ''), launch.meta_campaign_id, ad_set_id,
    p_confirmation), 'UTF8'), 'sha256'), 'hex');
  policy_digest := encode(extensions.digest(convert_to(concat_ws('|', 'dealflow-realtor-optimization-v2', consent_digest,
    '60', '1000', '20', '5000', '1', '1440', '20', '100', '20'), 'UTF8'), 'sha256'), 'hex');

  select * into existing from public.meta_optimization_policy_authorizations candidate
  where candidate.organization_id = p_organization_id and candidate.idempotency_key = trim(p_idempotency_key);
  if existing.id is not null then
    if existing.customer_consent_digest is distinct from consent_digest then
      raise exception 'optimization authorization idempotency conflict' using errcode = '23505';
    end if;
    return existing;
  end if;
  select * into existing from public.meta_optimization_policy_authorizations candidate
  where candidate.organization_id = p_organization_id and candidate.campaign_id = p_campaign_id
    and candidate.status = 'active';
  if existing.id is not null then
    if existing.customer_consent_digest is not distinct from consent_digest then return existing; end if;
    raise exception 'an active optimization policy already exists' using errcode = '55000';
  end if;
  select coalesce(max(candidate.authorization_generation), 0) + 1 into next_generation
  from public.meta_optimization_policy_authorizations candidate
  where candidate.organization_id = p_organization_id and candidate.campaign_id = p_campaign_id;

  insert into public.meta_optimization_policy_authorizations(
    organization_id, user_id, campaign_id, activation_preauthorization_id,
    activation_intent_id, launch_record_id, customer_authorized_by,
    approved_currency, current_daily_budget_minor, customer_daily_budget_ceiling_minor,
    provider_ad_account_id, provider_campaign_id, provider_ad_set_id,
    customer_consent_digest, policy_digest, authorization_generation, idempotency_key
  ) values (
    p_organization_id, p_customer_user_id, p_campaign_id, preauth.id,
    activation.id, launch.id, p_customer_user_id,
    normalized_currency, preauth.approved_daily_budget_minor, p_customer_daily_budget_ceiling_minor,
    replace(preauth.provider_ad_account_id, 'act_', ''), launch.meta_campaign_id, ad_set_id,
    consent_digest, policy_digest, next_generation, trim(p_idempotency_key)
  ) returning * into inserted;

  insert into public.optimization_campaign_controls(
    campaign_id, organization_id, user_id, policy_version, execution_enabled,
    global_kill_switch, campaign_kill_switch, customer_daily_budget_ceiling,
    active_policy_authorization_id, approved_currency,
    customer_daily_budget_ceiling_minor, last_known_daily_budget_minor,
    provider_ad_account_id, provider_campaign_id, provider_ad_set_id, policy_consent_at
  ) values (
    p_campaign_id, p_organization_id, p_customer_user_id, inserted.policy_version, true,
    false, false, p_customer_daily_budget_ceiling_minor::numeric / 100,
    inserted.id, normalized_currency, p_customer_daily_budget_ceiling_minor,
    preauth.approved_daily_budget_minor, replace(preauth.provider_ad_account_id, 'act_', ''),
    launch.meta_campaign_id, ad_set_id, inserted.customer_authorized_at
  ) on conflict (campaign_id) do update set
    organization_id = excluded.organization_id, user_id = excluded.user_id,
    policy_version = excluded.policy_version, execution_enabled = true,
    global_kill_switch = false, campaign_kill_switch = false,
    customer_daily_budget_ceiling = excluded.customer_daily_budget_ceiling,
    active_policy_authorization_id = excluded.active_policy_authorization_id,
    approved_currency = excluded.approved_currency,
    customer_daily_budget_ceiling_minor = excluded.customer_daily_budget_ceiling_minor,
    last_known_daily_budget_minor = excluded.last_known_daily_budget_minor,
    provider_ad_account_id = excluded.provider_ad_account_id,
    provider_campaign_id = excluded.provider_campaign_id,
    provider_ad_set_id = excluded.provider_ad_set_id,
    policy_consent_at = excluded.policy_consent_at, updated_at = timezone('utc', now());
  return inserted;
end;
$$;

create or replace function public.get_meta_optimization_policy_status(
  p_organization_id uuid, p_campaign_id uuid
) returns table(
  authorization_id uuid, authorization_status text, approved_currency text,
  current_daily_budget_minor bigint, customer_daily_budget_ceiling_minor bigint,
  execution_enabled boolean, global_kill_switch boolean, account_kill_switch boolean,
  campaign_kill_switch boolean, emergency_stop boolean, customer_authorized_at timestamptz
) language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  if auth.uid() is null or not private.is_current_user_org_member(p_organization_id) then
    raise exception 'optimization policy status actor is unauthorized' using errcode = '42501';
  end if;
  return query select policy.id, policy.status, policy.approved_currency,
    controls.last_known_daily_budget_minor, policy.customer_daily_budget_ceiling_minor,
    controls.execution_enabled, controls.global_kill_switch, controls.account_kill_switch,
    controls.campaign_kill_switch, controls.emergency_stop, policy.customer_authorized_at
  from public.meta_optimization_policy_authorizations policy
  join public.optimization_campaign_controls controls on controls.campaign_id = policy.campaign_id
  where policy.organization_id = p_organization_id and policy.campaign_id = p_campaign_id
    and policy.user_id = auth.uid()
  order by policy.authorization_generation desc limit 1;
end;
$$;

create or replace function public.revoke_meta_optimization_policy(
  p_organization_id uuid, p_campaign_id uuid, p_authorization_id uuid,
  p_confirmation text
) returns boolean language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare changed integer;
begin
  if auth.uid() is null or not private.is_current_user_org_member(p_organization_id)
    or p_confirmation is distinct from 'DISABLE_AUTONOMOUS_META_OPTIMIZATION' then
    raise exception 'optimization policy revocation actor is unauthorized' using errcode = '42501';
  end if;
  update public.meta_optimization_policy_authorizations policy set
    status = 'revoked', revoked_at = timezone('utc', now()),
    revocation_reason = 'customer_revoked', updated_at = timezone('utc', now())
  where policy.id = p_authorization_id and policy.organization_id = p_organization_id
    and policy.campaign_id = p_campaign_id and policy.user_id = auth.uid()
    and policy.status = 'active';
  get diagnostics changed = row_count;
  if changed = 1 then
    update public.optimization_campaign_controls controls set
      execution_enabled = false, campaign_kill_switch = true,
      active_policy_authorization_id = null, updated_at = timezone('utc', now())
    where controls.organization_id = p_organization_id and controls.campaign_id = p_campaign_id
      and controls.user_id = auth.uid();
    update public.meta_optimization_execution_intents intent set
      status = 'cancelled', last_error_code = 'customer_policy_revoked',
      last_error_message = 'Customer revoked autonomous optimization before provider effect arming.',
      worker_id = null, lease_token = null, locked_until = null,
      claimed_control_generation = null, completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where intent.organization_id = p_organization_id and intent.campaign_id = p_campaign_id
      and intent.policy_authorization_id = p_authorization_id
      and intent.status in ('pending', 'claimed');
  end if;
  return changed = 1;
end;
$$;

create or replace function public.enqueue_meta_optimization_execution_intent(
  p_organization_id uuid, p_user_id uuid, p_campaign_id uuid, p_decision_id uuid,
  p_environment text, p_action_type text, p_action_reason text,
  p_intended_daily_budget_minor bigint, p_idempotency_key text
) returns public.meta_optimization_execution_intents
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare
  policy public.meta_optimization_policy_authorizations%rowtype;
  controls public.optimization_campaign_controls%rowtype;
  decision public.optimization_decisions%rowtype;
  inserted public.meta_optimization_execution_intents%rowtype;
  metrics jsonb;
  strong_count integer := 0;
  intended_budget bigint;
  evidence_digest text;
  provider_object_type text;
  provider_object_id text;
  change_percent numeric;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if p_environment not in ('staging', 'production') or p_action_type not in ('pause', 'budget')
    or length(trim(coalesce(p_action_reason, ''))) not between 3 and 500
    or length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 240 then
    raise exception 'optimization intent input is invalid' using errcode = '22023';
  end if;
  select * into controls from public.optimization_campaign_controls candidate
  where candidate.organization_id = p_organization_id and candidate.user_id = p_user_id
    and candidate.campaign_id = p_campaign_id for update;
  select * into policy from public.meta_optimization_policy_authorizations candidate
  where candidate.id = controls.active_policy_authorization_id
    and candidate.organization_id = p_organization_id and candidate.user_id = p_user_id
    and candidate.campaign_id = p_campaign_id and candidate.status = 'active';
  select * into decision from public.optimization_decisions candidate
  where candidate.id = p_decision_id and candidate.organization_id = p_organization_id
    and candidate.campaign_id = p_campaign_id;
  if controls.campaign_id is null or policy.id is null or decision.id is null
    or controls.execution_enabled is not true
    or controls.global_kill_switch or controls.account_kill_switch
    or controls.campaign_kill_switch or controls.emergency_stop
    or not private.meta_optimization_activation_authority_current(policy.id) then
    raise exception 'optimization execution authority is closed' using errcode = '55000';
  end if;
  if decision.policy_id is distinct from policy.id::text or decision.mode is distinct from 'shadow'
    or decision.live_action_performed or decision.source_status is distinct from 'confirmed'
    or decision.source_timestamp is null
    or decision.source_timestamp < timezone('utc', now()) - make_interval(mins => policy.maximum_observation_age_minutes)
    or decision.source_timestamp > timezone('utc', now()) + interval '5 minutes'
    or jsonb_typeof(decision.authority_checks -> 'blockers') is distinct from 'array'
    or jsonb_array_length(decision.authority_checks -> 'blockers') <> 0 then
    raise exception 'optimization decision evidence is not executable' using errcode = '55000';
  end if;
  metrics := decision.input_snapshot -> 'metrics';
  if jsonb_typeof(metrics) is distinct from 'object'
    or coalesce(private.meta_optimization_metric_numeric(metrics, 'impressions'), -1) < policy.minimum_impressions
    or coalesce(private.meta_optimization_metric_numeric(metrics, 'clicks'), -1) < policy.minimum_clicks
    or coalesce(private.meta_optimization_metric_numeric(metrics, 'spend'), -1) * 100 < policy.minimum_spend_minor then
    raise exception 'optimization decision is below minimum data thresholds' using errcode = '55000';
  end if;

  if p_action_type = 'pause' then
    if not (
      coalesce(private.meta_optimization_metric_numeric(metrics, 'ctr'), 999) < 0.5
      or (coalesce(private.meta_optimization_metric_numeric(metrics, 'leads'), 0) >= policy.minimum_leads_for_cpl
        and coalesce(private.meta_optimization_metric_numeric(metrics, 'cpl'), 0) > 50)
      or coalesce(private.meta_optimization_metric_numeric(metrics, 'frequency'), 0) > 4
      or (coalesce(private.meta_optimization_metric_numeric(metrics, 'leads'), 0) = 0
        and coalesce(private.meta_optimization_metric_numeric(metrics, 'spend'), 0) >= 100
        and exists (select 1 from public.campaign_launch_records launch
          where launch.id = policy.launch_record_id and launch.created_at <= timezone('utc', now()) - interval '24 hours'))
    ) then raise exception 'pause guardrail threshold is not met' using errcode = '55000'; end if;
    intended_budget := null; provider_object_type := 'campaign';
    provider_object_id := policy.provider_campaign_id; change_percent := -100;
  else
    strong_count :=
      (case when coalesce(private.meta_optimization_metric_numeric(metrics, 'ctr'), 0) >= 2 then 1 else 0 end) +
      (case when coalesce(private.meta_optimization_metric_numeric(metrics, 'cpc'), 999999) > 0
        and coalesce(private.meta_optimization_metric_numeric(metrics, 'cpc'), 999999) <= 1 then 1 else 0 end) +
      (case when coalesce(private.meta_optimization_metric_numeric(metrics, 'cpl'), 999999) > 0
        and coalesce(private.meta_optimization_metric_numeric(metrics, 'cpl'), 999999) <= 50 then 1 else 0 end) +
      (case when coalesce(private.meta_optimization_metric_numeric(metrics, 'lp_cvr'), 0) >= 5 then 1 else 0 end);
    intended_budget := floor(controls.last_known_daily_budget_minor::numeric * 1.2)::bigint;
    if strong_count < 2 or p_intended_daily_budget_minor is distinct from intended_budget
      or intended_budget > policy.customer_daily_budget_ceiling_minor
      or (case when controls.scale_window_started_at is null
          or controls.scale_window_started_at <= timezone('utc', now()) - interval '24 hours'
        then 0 else controls.scale_applied_last_24h_percent end) + 20 > policy.maximum_daily_scale_percent then
      raise exception 'budget scale guardrail is not met' using errcode = '55000';
    end if;
    provider_object_type := 'adset'; provider_object_id := policy.provider_ad_set_id;
    change_percent := 20;
  end if;
  if controls.last_provider_mutation_at is not null
    and controls.last_provider_mutation_at > timezone('utc', now()) - make_interval(mins => policy.cooldown_minutes) then
    raise exception 'optimization cooldown is active' using errcode = '55000';
  end if;
  evidence_digest := encode(extensions.digest(convert_to(concat_ws('|', decision.id::text, decision.policy_digest,
    decision.source_timestamp::text, metrics::text, p_action_type, p_action_reason,
    coalesce(intended_budget::text, ''), policy.policy_digest), 'UTF8'), 'sha256'), 'hex');
  insert into public.meta_optimization_execution_intents(
    organization_id, user_id, campaign_id, decision_id, policy_authorization_id,
    environment, policy_version, approved_currency, provider_ad_account_id,
    provider_campaign_id, provider_object_type, provider_object_id, action_type,
    action_reason, change_percent, current_daily_budget_minor,
    intended_daily_budget_minor, customer_daily_budget_ceiling_minor,
    source_timestamp, evidence_digest, idempotency_key
  ) values (
    p_organization_id, p_user_id, p_campaign_id, decision.id, policy.id,
    p_environment, policy.policy_version, policy.approved_currency, policy.provider_ad_account_id,
    policy.provider_campaign_id, provider_object_type, provider_object_id, p_action_type,
    trim(p_action_reason), change_percent, controls.last_known_daily_budget_minor,
    intended_budget, policy.customer_daily_budget_ceiling_minor,
    decision.source_timestamp, evidence_digest, trim(p_idempotency_key)
  ) on conflict (organization_id, idempotency_key) do nothing returning * into inserted;
  if inserted.id is null then select * into strict inserted
    from public.meta_optimization_execution_intents candidate
    where candidate.organization_id = p_organization_id and candidate.idempotency_key = trim(p_idempotency_key);
    if inserted.decision_id is distinct from decision.id
      or inserted.policy_authorization_id is distinct from policy.id
      or inserted.action_type is distinct from p_action_type
      or inserted.evidence_digest is distinct from evidence_digest
      or inserted.intended_daily_budget_minor is distinct from intended_budget then
      raise exception 'optimization execution idempotency conflict' using errcode = '23505';
    end if;
  end if;
  return inserted;
end;
$$;

create or replace function public.claim_meta_optimization_execution_intent(
  p_environment text, p_worker_id text, p_lease_seconds integer
) returns setof public.meta_optimization_execution_intents
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare control public.meta_optimization_runtime_controls%rowtype; claimed_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if p_environment not in ('staging', 'production') or length(trim(coalesce(p_worker_id, ''))) < 8
    or p_lease_seconds not between 30 and 900 then raise exception 'optimization claim input is invalid' using errcode = '22023'; end if;
  select * into control from public.meta_optimization_runtime_controls candidate
  where candidate.environment = p_environment for update;
  if control.environment is null or not control.execution_writes_enabled or control.global_kill_switch
    or (p_environment = 'staging' and control.provider_mode <> 'sandbox')
    or (p_environment = 'production' and control.provider_mode <> 'live') then
    return;
  end if;

  update public.meta_optimization_execution_intents intent set
    status = 'operator_required', last_error_code = 'armed_effect_lease_expired',
    last_error_message = 'An armed provider effect lost its lease and requires reconciliation before replay.',
    worker_id = null, lease_token = null, locked_until = null, claimed_control_generation = null,
    completed_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where intent.environment = p_environment and intent.status = 'armed'
    and intent.locked_until <= timezone('utc', now());
  update public.meta_optimization_execution_intents intent set
    status = case when intent.attempt_count >= 3 then 'operator_required' else 'pending' end,
    last_error_code = case when intent.attempt_count >= 3 then 'optimization_claim_attempts_exhausted' else 'optimization_claim_recovered' end,
    last_error_message = case when intent.attempt_count >= 3
      then 'Optimization exhausted safe pre-effect claim attempts.' else 'Expired pre-effect claim safely recovered.' end,
    worker_id = null, lease_token = null, locked_until = null, claimed_control_generation = null,
    completed_at = case when intent.attempt_count >= 3 then timezone('utc', now()) else null end,
    updated_at = timezone('utc', now())
  where intent.environment = p_environment and intent.status = 'claimed'
    and intent.locked_until <= timezone('utc', now());

  update public.meta_optimization_execution_intents intent set
    status = 'blocked', last_error_code = 'meta_activation_authority_drifted',
    last_error_message = 'The exact activated Meta launch no longer authorizes optimization execution.',
    completed_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where intent.environment = p_environment and intent.status = 'pending'
    and not private.meta_optimization_activation_authority_current(
      intent.policy_authorization_id
    );

  with candidate as (
    select intent.id from public.meta_optimization_execution_intents intent
    join public.meta_optimization_policy_authorizations policy on policy.id = intent.policy_authorization_id
    join public.optimization_campaign_controls controls on controls.campaign_id = intent.campaign_id
    where intent.environment = p_environment and intent.status = 'pending' and intent.attempt_count < 3
      and policy.status = 'active' and controls.execution_enabled
      and not controls.global_kill_switch and not controls.account_kill_switch
      and not controls.campaign_kill_switch and not controls.emergency_stop
      and controls.active_policy_authorization_id = policy.id
      and private.meta_optimization_activation_authority_current(policy.id)
    order by intent.created_at for update of intent skip locked limit 1
  ) update public.meta_optimization_execution_intents intent set
    status = 'claimed', worker_id = trim(p_worker_id), lease_token = gen_random_uuid(),
    lease_generation = intent.lease_generation + 1,
    locked_until = timezone('utc', now()) + make_interval(secs => p_lease_seconds),
    claimed_control_generation = control.control_generation,
    attempt_count = intent.attempt_count + 1, updated_at = timezone('utc', now())
  where intent.id in (select id from candidate) returning intent.id into claimed_id;
  if claimed_id is null then return; end if;
  return query select * from public.meta_optimization_execution_intents where id = claimed_id;
end;
$$;

create or replace function public.arm_meta_optimization_execution_intent(
  p_intent_id uuid, p_worker_id text, p_lease_token uuid, p_lease_generation bigint,
  p_before_state jsonb
) returns public.meta_optimization_execution_intents
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare intent public.meta_optimization_execution_intents%rowtype;
  control public.meta_optimization_runtime_controls%rowtype;
  policy public.meta_optimization_policy_authorizations%rowtype;
  controls public.optimization_campaign_controls%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  select * into intent from public.meta_optimization_execution_intents candidate where candidate.id = p_intent_id for update;
  if intent.id is null or intent.status <> 'claimed' or intent.worker_id is distinct from p_worker_id
    or intent.lease_token is distinct from p_lease_token or intent.lease_generation is distinct from p_lease_generation
    or intent.locked_until <= timezone('utc', now()) then raise exception 'optimization execution lease lost' using errcode = '40001'; end if;
  select * into control from public.meta_optimization_runtime_controls candidate
    where candidate.environment = intent.environment;
  select * into policy from public.meta_optimization_policy_authorizations candidate
    where candidate.id = intent.policy_authorization_id;
  select * into controls from public.optimization_campaign_controls candidate
    where candidate.campaign_id = intent.campaign_id;
  if not control.execution_writes_enabled or control.global_kill_switch
    or control.control_generation is distinct from intent.claimed_control_generation
    or policy.status <> 'active' or controls.active_policy_authorization_id is distinct from policy.id
    or not controls.execution_enabled or controls.global_kill_switch or controls.account_kill_switch
    or controls.campaign_kill_switch or controls.emergency_stop
    or not private.meta_optimization_activation_authority_current(policy.id)
    or (controls.last_provider_mutation_at is not null
      and controls.last_provider_mutation_at > timezone('utc', now()) - make_interval(mins => policy.cooldown_minutes)) then
    raise exception 'optimization execution authority changed before arming' using errcode = '55000';
  end if;
  if jsonb_typeof(p_before_state) is distinct from 'object'
    or octet_length(p_before_state::text) > 32768
    or replace(coalesce(p_before_state ->> 'accountId', ''), 'act_', '') is distinct from intent.provider_ad_account_id
    or coalesce(p_before_state ->> 'campaignId', '') is distinct from intent.provider_campaign_id
    or coalesce(p_before_state ->> 'objectType', '') is distinct from intent.provider_object_type
    or coalesce(p_before_state ->> 'objectId', '') is distinct from intent.provider_object_id
    or upper(coalesce(p_before_state ->> 'currency', '')) is distinct from intent.approved_currency
    or coalesce(p_before_state ->> 'configuredStatus', '') <> 'ACTIVE'
    or (intent.action_type = 'budget'
      and (
        upper(coalesce(p_before_state ->> 'effectiveStatus', '')) <> 'ACTIVE'
        or private.meta_optimization_metric_numeric(p_before_state, 'dailyBudgetMinor')
          is distinct from controls.last_known_daily_budget_minor::numeric
      )) then
    raise exception 'optimization provider state drifted before arming' using errcode = '55000';
  end if;
  update public.meta_optimization_execution_intents candidate set
    status = 'armed', execution_token = gen_random_uuid(),
    provider_effect_armed_at = timezone('utc', now()), before_state = p_before_state,
    before_state_digest = encode(extensions.digest(convert_to(p_before_state::text, 'UTF8'), 'sha256'), 'hex'),
    updated_at = timezone('utc', now())
  where candidate.id = intent.id returning * into intent;
  return intent;
end;
$$;

create or replace function public.confirm_meta_optimization_execution_dispatch(
  p_intent_id uuid, p_worker_id text, p_lease_token uuid,
  p_lease_generation bigint, p_execution_token uuid
) returns public.meta_optimization_execution_intents
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare
  intent public.meta_optimization_execution_intents%rowtype;
  control public.meta_optimization_runtime_controls%rowtype;
  policy public.meta_optimization_policy_authorizations%rowtype;
  controls public.optimization_campaign_controls%rowtype;
  preauth public.meta_campaign_activation_preauthorizations%rowtype;
  activation public.meta_campaign_activation_intents%rowtype;
  launch public.campaign_launch_records%rowtype;
  checked_at timestamptz := timezone('utc', now());
  dispatch_nonce uuid := gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  select * into intent from public.meta_optimization_execution_intents candidate
    where candidate.id = p_intent_id for update;
  if intent.id is null or intent.status <> 'armed'
    or intent.worker_id is distinct from p_worker_id
    or intent.lease_token is distinct from p_lease_token
    or intent.lease_generation is distinct from p_lease_generation
    or intent.execution_token is distinct from p_execution_token
    or intent.locked_until <= checked_at
    or intent.dispatch_authority_nonce is not null then
    raise exception 'optimization dispatch fence is unavailable' using errcode = '40001';
  end if;
  select * into control from public.meta_optimization_runtime_controls candidate
    where candidate.environment = intent.environment for update;
  select * into policy from public.meta_optimization_policy_authorizations candidate
    where candidate.id = intent.policy_authorization_id for update;
  select * into controls from public.optimization_campaign_controls candidate
    where candidate.organization_id = intent.organization_id
      and candidate.user_id = intent.user_id
      and candidate.campaign_id = intent.campaign_id for update;
  select * into preauth from public.meta_campaign_activation_preauthorizations candidate
    where candidate.id = policy.activation_preauthorization_id for share;
  select * into activation from public.meta_campaign_activation_intents candidate
    where candidate.id = policy.activation_intent_id for share;
  select * into launch from public.campaign_launch_records candidate
    where candidate.id = policy.launch_record_id for share;
  perform 1 from public.meta_campaign_activation_objects object
    where object.activation_intent_id = policy.activation_intent_id for share;
  if control.environment is null or policy.id is null or controls.campaign_id is null
    or preauth.id is null or activation.id is null or launch.id is null
    or not control.execution_writes_enabled or control.global_kill_switch
    or control.control_generation is distinct from intent.claimed_control_generation
    or (intent.environment = 'staging' and control.provider_mode <> 'sandbox')
    or (intent.environment = 'production' and control.provider_mode <> 'live')
    or policy.status <> 'active'
    or policy.organization_id is distinct from intent.organization_id
    or policy.user_id is distinct from intent.user_id
    or policy.campaign_id is distinct from intent.campaign_id
    or policy.id is distinct from controls.active_policy_authorization_id
    or policy.approved_currency is distinct from intent.approved_currency
    or policy.provider_ad_account_id is distinct from intent.provider_ad_account_id
    or policy.provider_campaign_id is distinct from intent.provider_campaign_id
    or policy.customer_daily_budget_ceiling_minor is distinct from intent.customer_daily_budget_ceiling_minor
    or controls.last_known_daily_budget_minor is distinct from intent.current_daily_budget_minor
    or not controls.execution_enabled or controls.global_kill_switch
    or controls.account_kill_switch or controls.campaign_kill_switch or controls.emergency_stop
    or intent.source_timestamp < checked_at - make_interval(mins => policy.maximum_observation_age_minutes)
    or intent.source_timestamp > checked_at + interval '5 minutes'
    or (controls.last_provider_mutation_at is not null
      and controls.last_provider_mutation_at > checked_at - make_interval(mins => policy.cooldown_minutes))
    or not private.meta_optimization_activation_authority_current(policy.id)
    or (intent.action_type = 'pause'
      and (intent.provider_object_type <> 'campaign'
        or intent.provider_object_id <> policy.provider_campaign_id
        or intent.intended_daily_budget_minor is not null))
    or (intent.action_type = 'budget'
      and (intent.provider_object_type <> 'adset'
        or intent.provider_object_id <> policy.provider_ad_set_id
        or intent.intended_daily_budget_minor
          is distinct from floor(controls.last_known_daily_budget_minor::numeric * 1.2)::bigint
        or intent.intended_daily_budget_minor > policy.customer_daily_budget_ceiling_minor
        or upper(coalesce(intent.before_state ->> 'effectiveStatus', '')) <> 'ACTIVE')) then
    raise exception 'optimization authority changed before provider dispatch' using errcode = '55000';
  end if;
  update public.meta_optimization_execution_intents candidate set
    dispatch_authority_nonce = dispatch_nonce,
    dispatch_authority_checked_at = checked_at,
    dispatch_control_generation = control.control_generation,
    dispatch_authority_digest = encode(extensions.digest(convert_to(concat_ws('|',
      intent.id::text, intent.policy_authorization_id::text, intent.execution_token::text,
      control.control_generation::text, policy.policy_digest, intent.before_state_digest,
      preauth.id::text, activation.id::text, launch.id::text,
      activation.provider_delivery_evidence_digest,
      activation.provider_contract_evidence_digest,
      intent.organization_id::text, intent.user_id::text, intent.campaign_id::text,
      intent.provider_ad_account_id, intent.provider_campaign_id, intent.provider_object_id,
      intent.action_type, intent.current_daily_budget_minor::text,
      coalesce(intent.intended_daily_budget_minor::text, ''),
      intent.customer_daily_budget_ceiling_minor::text, checked_at::text, dispatch_nonce::text
    ), 'UTF8'), 'sha256'), 'hex'),
    updated_at = checked_at
  where candidate.id = intent.id returning * into intent;
  return intent;
end;
$$;

create or replace function public.release_meta_optimization_execution_claim(
  p_intent_id uuid, p_worker_id text, p_lease_token uuid, p_lease_generation bigint,
  p_outcome text, p_error_code text, p_error_message text
) returns boolean language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare changed integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if p_outcome not in ('retry', 'blocked', 'operator_required') then raise exception 'invalid pre-effect outcome' using errcode = '22023'; end if;
  update public.meta_optimization_execution_intents intent set
    status = case when p_outcome = 'retry' and intent.attempt_count < 3 then 'pending'
      when p_outcome = 'retry' then 'operator_required' else p_outcome end,
    last_error_code = left(coalesce(p_error_code, 'optimization_preflight_failed'), 160),
    last_error_message = left(coalesce(p_error_message, 'Optimization preflight failed safely.'), 1000),
    worker_id = null, lease_token = null, locked_until = null, claimed_control_generation = null,
    completed_at = case when p_outcome = 'retry' and intent.attempt_count < 3 then null
      else timezone('utc', now()) end,
    updated_at = timezone('utc', now())
  where intent.id = p_intent_id and intent.status = 'claimed'
    and intent.worker_id = p_worker_id and intent.lease_token = p_lease_token
    and intent.lease_generation = p_lease_generation
    and intent.locked_until > timezone('utc', now());
  get diagnostics changed = row_count; return changed = 1;
end;
$$;

create or replace function public.settle_meta_optimization_execution_intent(
  p_intent_id uuid, p_worker_id text, p_lease_token uuid, p_lease_generation bigint,
  p_execution_token uuid, p_outcome text, p_provider_mutation_performed boolean,
  p_provider_receipt_id text, p_after_state jsonb,
  p_error_code text, p_error_message text
) returns boolean language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare intent public.meta_optimization_execution_intents%rowtype; changed integer; desired_matches boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if p_outcome not in ('succeeded', 'operator_required') then raise exception 'invalid armed-effect outcome' using errcode = '22023'; end if;
  select * into intent from public.meta_optimization_execution_intents candidate where candidate.id = p_intent_id for update;
  if intent.id is null or intent.status <> 'armed' or intent.worker_id is distinct from p_worker_id
    or intent.lease_token is distinct from p_lease_token or intent.lease_generation is distinct from p_lease_generation
    or intent.execution_token is distinct from p_execution_token
    or intent.locked_until <= timezone('utc', now()) then
    raise exception 'optimization armed-effect lease lost' using errcode = '40001';
  end if;
  desired_matches := jsonb_typeof(p_after_state) = 'object'
    and replace(coalesce(p_after_state ->> 'accountId', ''), 'act_', '') = intent.provider_ad_account_id
    and coalesce(p_after_state ->> 'campaignId', '') = intent.provider_campaign_id
    and coalesce(p_after_state ->> 'objectType', '') = intent.provider_object_type
    and coalesce(p_after_state ->> 'objectId', '') = intent.provider_object_id
    and upper(coalesce(p_after_state ->> 'currency', '')) = intent.approved_currency
    and ((intent.action_type = 'pause' and upper(coalesce(p_after_state ->> 'configuredStatus', '')) = 'PAUSED')
      or (intent.action_type = 'budget'
        and upper(coalesce(p_after_state ->> 'configuredStatus', '')) = 'ACTIVE'
        and upper(coalesce(p_after_state ->> 'effectiveStatus', '')) = 'ACTIVE'
        and private.meta_optimization_metric_numeric(p_after_state, 'dailyBudgetMinor')
          = intent.intended_daily_budget_minor::numeric));
  if p_provider_mutation_performed and intent.dispatch_authority_nonce is null then
    raise exception 'optimization provider effect lacks dispatch authority' using errcode = '55000';
  end if;
  if intent.dispatch_authority_nonce is not null and not p_provider_mutation_performed then
    raise exception 'dispatched optimization outcome cannot be downgraded to no provider effect' using errcode = '55000';
  end if;
  if p_outcome = 'succeeded' and not desired_matches then
    raise exception 'optimization success reconciliation does not match intent' using errcode = '55000';
  end if;
  update public.meta_optimization_execution_intents candidate set
    status = p_outcome, provider_mutation_performed = p_provider_mutation_performed,
    provider_receipt_id = nullif(left(trim(coalesce(p_provider_receipt_id, '')), 500), ''),
    after_state = p_after_state,
    after_state_digest = case when jsonb_typeof(p_after_state) = 'object'
      then encode(extensions.digest(convert_to(p_after_state::text, 'UTF8'), 'sha256'), 'hex') else null end,
    last_error_code = case when p_outcome = 'operator_required' then left(coalesce(p_error_code, 'optimization_reconciliation_ambiguous'), 160) else null end,
    last_error_message = case when p_outcome = 'operator_required' then left(coalesce(p_error_message, 'Provider outcome requires operator reconciliation.'), 1000) else null end,
    worker_id = null, lease_token = null, locked_until = null, claimed_control_generation = null,
    completed_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where candidate.id = intent.id returning * into intent;
  get diagnostics changed = row_count;
  if changed <> 1 then return false; end if;
  if p_outcome = 'succeeded' and p_provider_mutation_performed then
    update public.optimization_campaign_controls controls set
      last_provider_mutation_at = timezone('utc', now()),
      last_known_daily_budget_minor = case when intent.action_type = 'budget'
        then intent.intended_daily_budget_minor else controls.last_known_daily_budget_minor end,
      scale_applied_last_24h_percent = case when intent.action_type = 'budget' then 20 else 0 end,
      scale_window_started_at = case when intent.action_type = 'budget' then timezone('utc', now()) else controls.scale_window_started_at end,
      updated_at = timezone('utc', now())
    where controls.organization_id = intent.organization_id and controls.campaign_id = intent.campaign_id
      and controls.active_policy_authorization_id = intent.policy_authorization_id;
  end if;
  insert into public.meta_optimization_action_receipts(
    organization_id, campaign_id, idempotency_key, policy_version, action_type,
    before_state, intended_state, provider_receipt_id, after_state, reconciled,
    rollback_state, execution_intent_id, receipt_status, approved_currency,
    provider_object_id, change_percent
  ) values (
    intent.organization_id, intent.campaign_id, intent.idempotency_key,
    intent.policy_version, intent.action_type, intent.before_state,
    jsonb_build_object('actionType', intent.action_type, 'dailyBudgetMinor', intent.intended_daily_budget_minor),
    coalesce(nullif(trim(p_provider_receipt_id), ''), 'no_provider_receipt'), p_after_state,
    p_outcome = 'succeeded' and desired_matches,
    jsonb_build_object('required', false, 'succeeded', null, 'reason', null),
    intent.id, p_outcome, intent.approved_currency, intent.provider_object_id,
    intent.change_percent
  ) on conflict (execution_intent_id) where execution_intent_id is not null do nothing;
  return true;
end;
$$;

revoke all on function public.authorize_meta_optimization_policy(uuid,uuid,uuid,bigint,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.authorize_meta_optimization_policy(uuid,uuid,uuid,bigint,text,text,text)
  to service_role;
revoke all on function public.set_meta_optimization_staging_runtime_control(bigint,boolean,boolean,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_meta_optimization_staging_runtime_control(bigint,boolean,boolean,text,text)
  to service_role;
revoke all on function public.set_meta_optimization_production_runtime_control(bigint,boolean,boolean,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_meta_optimization_production_runtime_control(bigint,boolean,boolean,text,text)
  to service_role;
revoke all on function public.get_meta_optimization_policy_status(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_meta_optimization_policy_status(uuid,uuid) to authenticated;
revoke all on function public.revoke_meta_optimization_policy(uuid,uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_meta_optimization_policy(uuid,uuid,uuid,text) to authenticated;
revoke all on function public.enqueue_meta_optimization_execution_intent(uuid,uuid,uuid,uuid,text,text,text,bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.enqueue_meta_optimization_execution_intent(uuid,uuid,uuid,uuid,text,text,text,bigint,text)
  to service_role;
revoke all on function public.claim_meta_optimization_execution_intent(text,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_meta_optimization_execution_intent(text,text,integer) to service_role;
revoke all on function public.arm_meta_optimization_execution_intent(uuid,text,uuid,bigint,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.arm_meta_optimization_execution_intent(uuid,text,uuid,bigint,jsonb) to service_role;
revoke all on function public.confirm_meta_optimization_execution_dispatch(uuid,text,uuid,bigint,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.confirm_meta_optimization_execution_dispatch(uuid,text,uuid,bigint,uuid)
  to service_role;
revoke all on function public.release_meta_optimization_execution_claim(uuid,text,uuid,bigint,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.release_meta_optimization_execution_claim(uuid,text,uuid,bigint,text,text,text) to service_role;
revoke all on function public.settle_meta_optimization_execution_intent(uuid,text,uuid,bigint,uuid,text,boolean,text,jsonb,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.settle_meta_optimization_execution_intent(uuid,text,uuid,bigint,uuid,text,boolean,text,jsonb,text,text)
  to service_role;
revoke all on function public.prevent_meta_optimization_policy_identity_mutation()
  from public, anon, authenticated, service_role;

insert into public.app_schema_metadata(key, value) values ('schema_version', '20260713013000')
on conflict (key) do update set value = excluded.value, updated_at = timezone('utc', now());
