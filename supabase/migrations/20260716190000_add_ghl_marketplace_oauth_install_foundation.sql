-- Local GHL Marketplace OAuth/install authority foundation.
-- Provider effects remain disabled. This migration stores only fingerprints and
-- opaque encrypted references; raw OAuth tokens, authorization codes, PKCE
-- verifiers, client secrets, and customer payloads are forbidden.

create schema if not exists private;

create or replace function private.require_ghl_marketplace_service_role_v1()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ghl_marketplace_service_role_required';
  end if;
end;
$$;

create or replace function private.ghl_marketplace_fingerprint_v1(p_value text)
returns text
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
begin
  if btrim(p_value) = '' then
    raise exception using errcode = '22023', message = 'ghl_marketplace_fingerprint_source_required';
  end if;
  return 'sha256:' || encode(extensions.digest(convert_to(btrim(p_value), 'UTF8'), 'sha256'), 'hex');
end;
$$;

create table if not exists public.ghl_marketplace_oauth_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete cascade,
  initiated_by_user_id uuid not null references public.users(id) on delete cascade,
  partner_id uuid null references public.partners(id) on delete restrict,
  environment text not null,
  state_hash text not null unique,
  pkce_challenge text not null,
  pkce_method text not null default 'S256',
  encrypted_pkce_verifier_ref text not null,
  app_fingerprint text not null,
  account_fingerprint text not null,
  scope_fingerprint text not null,
  company_fingerprint text not null,
  location_fingerprint text null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint ghl_marketplace_oauth_states_environment_check
    check (environment in ('production', 'sandbox', 'test')),
  constraint ghl_marketplace_oauth_states_state_hash_check
    check (state_hash ~ '^sha256:[a-f0-9]{64}$'),
  constraint ghl_marketplace_oauth_states_pkce_check
    check (pkce_method = 'S256' and pkce_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  constraint ghl_marketplace_oauth_states_verifier_ref_check
    check (encrypted_pkce_verifier_ref ~ '^enc-ref:v[1-9][0-9]*:[A-Za-z0-9][A-Za-z0-9._:/-]{15,255}$'),
  constraint ghl_marketplace_oauth_states_fingerprint_check
    check (
      app_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and account_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and scope_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and company_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and (location_fingerprint is null or location_fingerprint ~ '^sha256:[a-f0-9]{64}$')
    ),
  constraint ghl_marketplace_oauth_states_status_check
    check (status in ('pending', 'consumed', 'expired', 'rejected')),
  constraint ghl_marketplace_oauth_states_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '15 minutes'),
  constraint ghl_marketplace_oauth_states_consumption_check
    check ((status = 'consumed') = (consumed_at is not null))
);

comment on table public.ghl_marketplace_oauth_states is
  'Service-role-only one-time GHL OAuth state. State is hash-only; PKCE verifier is an opaque encrypted reference.';

create table if not exists public.ghl_marketplace_authorities (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null,
  organization_id uuid null references public.ghl_workspace_tenants(organization_id) on delete cascade,
  location_mapping_id uuid null,
  partner_id uuid null references public.partners(id) on delete restrict,
  environment text not null,
  owner_kind text not null,
  install_scope text not null,
  app_fingerprint text not null,
  company_fingerprint text not null,
  location_fingerprint text null,
  account_fingerprint text not null,
  scope_fingerprint text not null,
  status text not null default 'pending',
  operator_blocker_code text null,
  installed_at timestamptz null,
  uninstalled_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_marketplace_authorities_environment_check
    check (environment in ('production', 'sandbox', 'test')),
  constraint ghl_marketplace_authorities_owner_check
    check (owner_kind in ('platform', 'partner')),
  constraint ghl_marketplace_authorities_scope_check
    check (
      (install_scope = 'company' and location_mapping_id is null and location_fingerprint is null)
      or
      (install_scope = 'location' and organization_id is not null and location_mapping_id is not null and location_fingerprint is not null)
    ),
  constraint ghl_marketplace_authorities_partner_check
    check ((owner_kind = 'partner' and partner_id is not null) or owner_kind = 'platform'),
  constraint ghl_marketplace_authorities_fingerprint_check
    check (
      app_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and company_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and account_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and scope_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and (location_fingerprint is null or location_fingerprint ~ '^sha256:[a-f0-9]{64}$')
    ),
  constraint ghl_marketplace_authorities_status_check
    check (status in ('pending', 'active', 'uninstalled', 'ambiguous', 'operator_required')),
  constraint ghl_marketplace_authorities_status_timestamp_check
    check (
      (status = 'active' and installed_at is not null and uninstalled_at is null)
      or (status = 'uninstalled' and uninstalled_at is not null)
      or status in ('pending', 'ambiguous', 'operator_required')
    ),
  constraint ghl_marketplace_authorities_installation_environment_fk
    foreign key (installation_id, environment)
    references public.ghl_installations(id, environment) on delete restrict,
  constraint ghl_marketplace_authorities_mapping_tenant_fk
    foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings(id, organization_id) on delete restrict
);

create unique index if not exists ghl_marketplace_authorities_account_unique
  on public.ghl_marketplace_authorities(environment, app_fingerprint, account_fingerprint)
  where status <> 'uninstalled';

create table if not exists public.ghl_marketplace_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid not null references public.ghl_marketplace_authorities(id) on delete cascade,
  organization_id uuid null references public.ghl_workspace_tenants(organization_id) on delete cascade,
  partner_id uuid null references public.partners(id) on delete restrict,
  event_type text not null,
  event_fingerprint text not null unique,
  app_fingerprint text not null,
  company_fingerprint text null,
  location_fingerprint text null,
  account_fingerprint text null,
  outcome text not null,
  operator_blocker_code text null,
  received_at timestamptz not null default timezone('utc', now()),
  constraint ghl_marketplace_lifecycle_events_type_check
    check (event_type in ('INSTALL', 'UNINSTALL')),
  constraint ghl_marketplace_lifecycle_events_fingerprint_check
    check (
      event_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and app_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and (company_fingerprint is null or company_fingerprint ~ '^sha256:[a-f0-9]{64}$')
      and (location_fingerprint is null or location_fingerprint ~ '^sha256:[a-f0-9]{64}$')
      and (account_fingerprint is null or account_fingerprint ~ '^sha256:[a-f0-9]{64}$')
    ),
  constraint ghl_marketplace_lifecycle_events_outcome_check
    check (outcome in ('applied', 'ambiguous', 'operator_required', 'rejected'))
);

create table if not exists public.ghl_marketplace_token_sets (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid not null references public.ghl_marketplace_authorities(id) on delete cascade,
  organization_id uuid null references public.ghl_workspace_tenants(organization_id) on delete cascade,
  location_mapping_id uuid null,
  partner_id uuid null references public.partners(id) on delete restrict,
  subject_kind text not null,
  encrypted_access_credential_ref text not null,
  encrypted_refresh_credential_ref text not null,
  account_fingerprint text not null,
  scope_fingerprint text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  key_version integer not null,
  generation bigint not null default 1,
  status text not null default 'active',
  refresh_claim_token uuid null,
  refresh_claim_generation bigint not null default 0,
  refresh_claimed_by text null,
  refresh_claimed_at timestamptz null,
  refresh_claim_expires_at timestamptz null,
  revoked_at timestamptz null,
  revocation_code text null,
  operator_blocker_code text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_marketplace_token_sets_subject_check
    check (
      (subject_kind = 'company' and location_mapping_id is null)
      or (subject_kind = 'location' and organization_id is not null and location_mapping_id is not null)
    ),
  constraint ghl_marketplace_token_sets_reference_check
    check (
      encrypted_access_credential_ref ~ '^enc-ref:v[1-9][0-9]*:[A-Za-z0-9][A-Za-z0-9._:/-]{15,255}$'
      and encrypted_refresh_credential_ref ~ '^enc-ref:v[1-9][0-9]*:[A-Za-z0-9][A-Za-z0-9._:/-]{15,255}$'
    ),
  constraint ghl_marketplace_token_sets_fingerprint_check
    check (
      account_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and scope_fingerprint ~ '^sha256:[a-f0-9]{64}$'
    ),
  constraint ghl_marketplace_token_sets_expiry_check
    check (access_expires_at > created_at and refresh_expires_at > access_expires_at),
  constraint ghl_marketplace_token_sets_generation_check
    check (generation > 0 and refresh_claim_generation >= 0 and key_version > 0),
  constraint ghl_marketplace_token_sets_status_check
    check (status in ('active', 'refreshing', 'revoked', 'operator_required')),
  constraint ghl_marketplace_token_sets_claim_check
    check (
      (status = 'refreshing' and refresh_claim_token is not null and refresh_claimed_by is not null
        and refresh_claimed_at is not null and refresh_claim_expires_at is not null)
      or
      (status <> 'refreshing' and refresh_claim_token is null and refresh_claimed_by is null
        and refresh_claimed_at is null and refresh_claim_expires_at is null)
    ),
  constraint ghl_marketplace_token_sets_revocation_check
    check ((status = 'revoked') = (revoked_at is not null)),
  constraint ghl_marketplace_token_sets_mapping_tenant_fk
    foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings(id, organization_id) on delete restrict
);

create unique index if not exists ghl_marketplace_token_sets_subject_unique
  on public.ghl_marketplace_token_sets(
    authority_id,
    subject_kind,
    coalesce(location_mapping_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists ghl_marketplace_token_sets_refresh_due_idx
  on public.ghl_marketplace_token_sets(status, access_expires_at)
  where status in ('active', 'refreshing');

create table if not exists public.ghl_marketplace_token_events (
  id uuid primary key default gen_random_uuid(),
  token_set_id uuid not null references public.ghl_marketplace_token_sets(id) on delete cascade,
  organization_id uuid null references public.ghl_workspace_tenants(organization_id) on delete cascade,
  event_type text not null,
  generation bigint not null,
  account_fingerprint text not null,
  scope_fingerprint text not null,
  key_version integer not null,
  outcome_fingerprint text null,
  recorded_at timestamptz not null default timezone('utc', now()),
  constraint ghl_marketplace_token_events_type_check
    check (event_type in ('created', 'refreshed', 'revoked', 'ambiguous', 'operator_required')),
  constraint ghl_marketplace_token_events_generation_check
    check (generation > 0 and key_version > 0),
  constraint ghl_marketplace_token_events_fingerprint_check
    check (
      account_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and scope_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and (outcome_fingerprint is null or outcome_fingerprint ~ '^sha256:[a-f0-9]{64}$')
    )
);

create table if not exists public.ghl_marketplace_location_token_exchanges (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid not null references public.ghl_marketplace_authorities(id) on delete cascade,
  company_token_set_id uuid not null references public.ghl_marketplace_token_sets(id) on delete restrict,
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete cascade,
  location_mapping_id uuid not null,
  partner_id uuid null references public.partners(id) on delete restrict,
  operation text not null default 'company_to_location_token_exchange',
  company_fingerprint text not null,
  location_fingerprint text not null,
  account_fingerprint text not null,
  scope_fingerprint text not null,
  request_fingerprint text not null,
  idempotency_key text not null unique,
  status text not null default 'pending',
  result_token_set_id uuid null references public.ghl_marketplace_token_sets(id) on delete restrict,
  operator_blocker_code text null,
  created_at timestamptz not null default timezone('utc', now()),
  settled_at timestamptz null,
  constraint ghl_marketplace_location_exchanges_operation_check
    check (operation = 'company_to_location_token_exchange'),
  constraint ghl_marketplace_location_exchanges_fingerprint_check
    check (
      company_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and location_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and account_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and scope_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and request_fingerprint ~ '^sha256:[a-f0-9]{64}$'
    ),
  constraint ghl_marketplace_location_exchanges_status_check
    check (status in ('pending', 'succeeded', 'ambiguous', 'operator_required', 'revoked')),
  constraint ghl_marketplace_location_exchanges_mapping_tenant_fk
    foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings(id, organization_id) on delete restrict
);

create table if not exists public.ghl_marketplace_realtor_user_operations (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid not null references public.ghl_marketplace_authorities(id) on delete cascade,
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete cascade,
  location_mapping_id uuid not null,
  partner_id uuid null references public.partners(id) on delete restrict,
  dealflow_user_id uuid not null references public.users(id) on delete cascade,
  realtor_identity_fingerprint text not null,
  operation text not null,
  provider_user_fingerprint text null,
  request_fingerprint text not null,
  provider_request_fingerprint text null,
  idempotency_key text not null unique,
  status text not null default 'pending',
  generation bigint not null default 1,
  operator_blocker_code text null,
  created_at timestamptz not null default timezone('utc', now()),
  settled_at timestamptz null,
  constraint ghl_marketplace_realtor_user_operations_operation_check
    check (operation in ('user_create', 'user_invite', 'user_revoke')),
  constraint ghl_marketplace_realtor_user_operations_fingerprint_check
    check (
      realtor_identity_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and request_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and (provider_user_fingerprint is null or provider_user_fingerprint ~ '^sha256:[a-f0-9]{64}$')
      and (provider_request_fingerprint is null or provider_request_fingerprint ~ '^sha256:[a-f0-9]{64}$')
    ),
  constraint ghl_marketplace_realtor_user_operations_status_check
    check (status in ('pending', 'succeeded', 'ambiguous', 'operator_required', 'canceled')),
  constraint ghl_marketplace_realtor_user_operations_generation_check
    check (generation > 0),
  constraint ghl_marketplace_realtor_user_operations_mapping_tenant_fk
    foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings(id, organization_id) on delete restrict
);

create index if not exists ghl_marketplace_realtor_user_operations_identity_idx
  on public.ghl_marketplace_realtor_user_operations(
    organization_id, realtor_identity_fingerprint, operation, status, created_at desc
  );

create or replace function private.assert_ghl_marketplace_tenant_partner_v1(
  p_organization_id uuid,
  p_partner_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tenant public.ghl_workspace_tenants%rowtype;
begin
  select * into tenant
  from public.ghl_workspace_tenants
  where organization_id = p_organization_id;
  if not found or tenant.status <> 'active' then
    raise exception using errcode = '42501', message = 'ghl_marketplace_tenant_not_active';
  end if;
  if tenant.partner_id is distinct from p_partner_id then
    raise exception using errcode = '42501', message = 'ghl_marketplace_partner_mismatch';
  end if;
end;
$$;

create or replace function private.assert_ghl_marketplace_authority_v1(
  p_authority_id uuid,
  p_organization_id uuid,
  p_partner_id uuid,
  p_app_fingerprint text,
  p_company_fingerprint text,
  p_location_fingerprint text,
  p_account_fingerprint text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  authority public.ghl_marketplace_authorities%rowtype;
begin
  select * into authority
  from public.ghl_marketplace_authorities
  where id = p_authority_id;
  if not found then
    raise exception using errcode = '22023', message = 'ghl_marketplace_authority_not_found';
  end if;
  if authority.organization_id is distinct from p_organization_id then
    raise exception using errcode = '42501', message = 'ghl_marketplace_authority_tenant_mismatch';
  end if;
  if authority.partner_id is distinct from p_partner_id then
    raise exception using errcode = '42501', message = 'ghl_marketplace_authority_partner_mismatch';
  end if;
  if authority.app_fingerprint <> p_app_fingerprint then
    raise exception using errcode = '42501', message = 'ghl_marketplace_authority_app_mismatch';
  end if;
  if authority.company_fingerprint <> p_company_fingerprint then
    raise exception using errcode = '42501', message = 'ghl_marketplace_authority_company_mismatch';
  end if;
  if authority.location_fingerprint is distinct from p_location_fingerprint then
    raise exception using errcode = '42501', message = 'ghl_marketplace_authority_location_mismatch';
  end if;
  if authority.account_fingerprint <> p_account_fingerprint then
    raise exception using errcode = '42501', message = 'ghl_marketplace_authority_account_mismatch';
  end if;
end;
$$;

create or replace function public.create_ghl_marketplace_oauth_state_v1(
  p_organization_id uuid,
  p_initiated_by_user_id uuid,
  p_partner_id uuid,
  p_environment text,
  p_state_hash text,
  p_pkce_challenge text,
  p_encrypted_pkce_verifier_ref text,
  p_app_fingerprint text,
  p_account_fingerprint text,
  p_scope_fingerprint text,
  p_company_fingerprint text,
  p_location_fingerprint text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_id uuid;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  perform private.assert_ghl_marketplace_tenant_partner_v1(p_organization_id, p_partner_id);
  if not exists (
    select 1 from public.organization_memberships member
    where member.organization_id = p_organization_id
      and member.user_id = p_initiated_by_user_id
  ) then
    raise exception using errcode = '42501', message = 'ghl_marketplace_initiating_user_not_in_tenant';
  end if;
  insert into public.ghl_marketplace_oauth_states(
    organization_id, initiated_by_user_id, partner_id, environment, state_hash,
    pkce_challenge, encrypted_pkce_verifier_ref, app_fingerprint,
    account_fingerprint, scope_fingerprint, company_fingerprint,
    location_fingerprint, expires_at
  ) values (
    p_organization_id, p_initiated_by_user_id, p_partner_id, p_environment, p_state_hash,
    p_pkce_challenge, p_encrypted_pkce_verifier_ref, p_app_fingerprint,
    p_account_fingerprint, p_scope_fingerprint, p_company_fingerprint,
    p_location_fingerprint, p_expires_at
  ) returning id into state_id;
  return state_id;
end;
$$;

create or replace function public.consume_ghl_marketplace_oauth_state_v1(
  p_state_hash text,
  p_organization_id uuid,
  p_initiated_by_user_id uuid,
  p_partner_id uuid,
  p_app_fingerprint text,
  p_account_fingerprint text,
  p_scope_fingerprint text,
  p_company_fingerprint text,
  p_location_fingerprint text,
  p_now timestamptz default timezone('utc', now())
)
returns table (
  result_outcome text,
  result_state_id uuid,
  result_encrypted_pkce_verifier_ref text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_record public.ghl_marketplace_oauth_states%rowtype;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into state_record
  from public.ghl_marketplace_oauth_states
  where state_hash = p_state_hash
  for update;
  if not found then
    return query select 'not_found'::text, null::uuid, null::text;
    return;
  end if;
  if state_record.status <> 'pending' then
    return query select 'replayed'::text, state_record.id, null::text;
    return;
  end if;
  if state_record.expires_at <= p_now then
    update public.ghl_marketplace_oauth_states
    set status = 'expired'
    where id = state_record.id;
    return query select 'expired'::text, state_record.id, null::text;
    return;
  end if;
  if state_record.organization_id <> p_organization_id then
    return query select 'tenant_mismatch'::text, state_record.id, null::text;
    return;
  end if;
  if state_record.initiated_by_user_id <> p_initiated_by_user_id then
    return query select 'user_mismatch'::text, state_record.id, null::text;
    return;
  end if;
  if state_record.partner_id is distinct from p_partner_id then
    return query select 'partner_mismatch'::text, state_record.id, null::text;
    return;
  end if;
  if state_record.app_fingerprint <> p_app_fingerprint then
    return query select 'app_mismatch'::text, state_record.id, null::text;
    return;
  end if;
  if state_record.account_fingerprint <> p_account_fingerprint
    or state_record.company_fingerprint <> p_company_fingerprint
    or state_record.location_fingerprint is distinct from p_location_fingerprint then
    return query select 'account_mismatch'::text, state_record.id, null::text;
    return;
  end if;
  if state_record.scope_fingerprint <> p_scope_fingerprint then
    return query select 'scope_mismatch'::text, state_record.id, null::text;
    return;
  end if;
  update public.ghl_marketplace_oauth_states
  set status = 'consumed', consumed_at = p_now
  where id = state_record.id and status = 'pending';
  if not found then
    return query select 'replayed'::text, state_record.id, null::text;
    return;
  end if;
  return query select 'consumed'::text, state_record.id, state_record.encrypted_pkce_verifier_ref;
end;
$$;

create or replace function public.create_ghl_marketplace_authority_v1(
  p_installation_id uuid,
  p_organization_id uuid,
  p_location_mapping_id uuid,
  p_partner_id uuid,
  p_environment text,
  p_install_scope text,
  p_app_fingerprint text,
  p_scope_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  installation public.ghl_installations%rowtype;
  mapping public.ghl_location_mappings%rowtype;
  tenant public.ghl_workspace_tenants%rowtype;
  expected_partner_id uuid;
  company_fingerprint_value text;
  location_fingerprint_value text;
  account_fingerprint_value text;
  authority_id_value uuid;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into installation
  from public.ghl_installations
  where id = p_installation_id and environment = p_environment;
  if not found then
    raise exception using errcode = '22023', message = 'ghl_marketplace_installation_not_found';
  end if;
  if installation.status = 'revoked' then
    raise exception using errcode = '42501', message = 'ghl_marketplace_installation_revoked';
  end if;
  expected_partner_id := installation.partner_id;
  if p_organization_id is not null then
    select * into tenant from public.ghl_workspace_tenants
    where organization_id = p_organization_id;
    if not found or tenant.status <> 'active' then
      raise exception using errcode = '42501', message = 'ghl_marketplace_tenant_not_active';
    end if;
    if installation.owner_kind = 'partner' and tenant.partner_id is distinct from installation.partner_id then
      raise exception using errcode = '42501', message = 'ghl_marketplace_installation_partner_mismatch';
    end if;
    expected_partner_id := coalesce(installation.partner_id, tenant.partner_id);
  end if;
  if expected_partner_id is distinct from p_partner_id then
    raise exception using errcode = '42501', message = 'ghl_marketplace_partner_mismatch';
  end if;
  company_fingerprint_value := private.ghl_marketplace_fingerprint_v1(installation.provider_agency_id);
  if p_install_scope = 'location' then
    if p_organization_id is null or p_location_mapping_id is null then
      raise exception using errcode = '22023', message = 'ghl_marketplace_location_scope_requires_tenant_mapping';
    end if;
    select * into mapping from public.ghl_location_mappings
    where id = p_location_mapping_id
      and organization_id = p_organization_id
      and installation_id = p_installation_id
      and environment = p_environment;
    if not found or mapping.partner_id is distinct from p_partner_id then
      raise exception using errcode = '42501', message = 'ghl_marketplace_location_mapping_mismatch';
    end if;
    location_fingerprint_value := private.ghl_marketplace_fingerprint_v1(mapping.provider_location_id);
    account_fingerprint_value := location_fingerprint_value;
  elsif p_install_scope = 'company' then
    if p_location_mapping_id is not null then
      raise exception using errcode = '22023', message = 'ghl_marketplace_company_scope_forbids_location_mapping';
    end if;
    location_fingerprint_value := null;
    account_fingerprint_value := company_fingerprint_value;
  else
    raise exception using errcode = '22023', message = 'ghl_marketplace_install_scope_invalid';
  end if;
  insert into public.ghl_marketplace_authorities(
    installation_id, organization_id, location_mapping_id, partner_id, environment,
    owner_kind, install_scope, app_fingerprint, company_fingerprint,
    location_fingerprint, account_fingerprint, scope_fingerprint
  ) values (
    p_installation_id, p_organization_id, p_location_mapping_id, p_partner_id, p_environment,
    installation.owner_kind, p_install_scope, p_app_fingerprint, company_fingerprint_value,
    location_fingerprint_value, account_fingerprint_value, p_scope_fingerprint
  ) returning id into authority_id_value;
  return authority_id_value;
end;
$$;

create or replace function public.record_ghl_marketplace_lifecycle_v1(
  p_authority_id uuid,
  p_organization_id uuid,
  p_partner_id uuid,
  p_event_type text,
  p_event_fingerprint text,
  p_app_fingerprint text,
  p_company_fingerprint text,
  p_location_fingerprint text,
  p_account_fingerprint text,
  p_identifiers_complete boolean,
  p_received_at timestamptz default timezone('utc', now())
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  authority public.ghl_marketplace_authorities%rowtype;
  existing_event public.ghl_marketplace_lifecycle_events%rowtype;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into existing_event
  from public.ghl_marketplace_lifecycle_events
  where event_fingerprint = p_event_fingerprint
  for update;
  if found then
    if existing_event.authority_id is distinct from p_authority_id
      or existing_event.organization_id is distinct from p_organization_id
      or existing_event.partner_id is distinct from p_partner_id
      or existing_event.event_type is distinct from p_event_type
      or existing_event.app_fingerprint is distinct from p_app_fingerprint
      or existing_event.company_fingerprint is distinct from p_company_fingerprint
      or existing_event.location_fingerprint is distinct from p_location_fingerprint
      or existing_event.account_fingerprint is distinct from p_account_fingerprint then
      raise exception using errcode = '23505', message = 'ghl_marketplace_lifecycle_event_identity_collision';
    end if;
    return 'duplicate';
  end if;
  perform private.assert_ghl_marketplace_authority_v1(
    p_authority_id, p_organization_id, p_partner_id, p_app_fingerprint,
    p_company_fingerprint, p_location_fingerprint, p_account_fingerprint
  );
  select * into authority from public.ghl_marketplace_authorities
  where id = p_authority_id for update;

  if not p_identifiers_complete then
    update public.ghl_marketplace_authorities
    set status = 'operator_required',
        operator_blocker_code = 'ghl_lifecycle_identifiers_incomplete',
        updated_at = p_received_at
    where id = p_authority_id and status <> 'uninstalled';
    insert into public.ghl_marketplace_lifecycle_events(
      authority_id, organization_id, partner_id, event_type, event_fingerprint,
      app_fingerprint, company_fingerprint, location_fingerprint, account_fingerprint,
      outcome, operator_blocker_code, received_at
    ) values (
      p_authority_id, p_organization_id, p_partner_id, p_event_type, p_event_fingerprint,
      p_app_fingerprint, p_company_fingerprint, p_location_fingerprint, p_account_fingerprint,
      'operator_required', 'ghl_lifecycle_identifiers_incomplete', p_received_at
    );
    return 'operator_required';
  end if;

  if p_event_type = 'INSTALL' then
    if authority.status = 'uninstalled' then
      insert into public.ghl_marketplace_lifecycle_events(
        authority_id, organization_id, partner_id, event_type, event_fingerprint,
        app_fingerprint, company_fingerprint, location_fingerprint, account_fingerprint,
        outcome, operator_blocker_code, received_at
      ) values (
        p_authority_id, p_organization_id, p_partner_id, p_event_type, p_event_fingerprint,
        p_app_fingerprint, p_company_fingerprint, p_location_fingerprint, p_account_fingerprint,
        'rejected', 'ghl_install_after_uninstall_requires_new_authority', p_received_at
      );
      return 'rejected';
    end if;
    update public.ghl_marketplace_authorities
    set status = 'active', installed_at = coalesce(installed_at, p_received_at),
        uninstalled_at = null, operator_blocker_code = null, updated_at = p_received_at
    where id = p_authority_id;
  elsif p_event_type = 'UNINSTALL' then
    update public.ghl_marketplace_authorities
    set status = 'uninstalled', uninstalled_at = p_received_at,
        operator_blocker_code = null, updated_at = p_received_at
    where id = p_authority_id;
    insert into public.ghl_marketplace_token_events(
      token_set_id, organization_id, event_type, generation,
      account_fingerprint, scope_fingerprint, key_version, outcome_fingerprint, recorded_at
    )
    select token.id, token.organization_id, 'revoked', token.generation,
      token.account_fingerprint, token.scope_fingerprint, token.key_version,
      private.ghl_marketplace_fingerprint_v1('ghl_app_uninstalled'), p_received_at
    from public.ghl_marketplace_token_sets token
    where token.authority_id = p_authority_id and token.status <> 'revoked';
    update public.ghl_marketplace_token_sets
    set status = 'revoked', revoked_at = p_received_at, revocation_code = 'ghl_app_uninstalled',
        refresh_claim_token = null, refresh_claimed_by = null, refresh_claimed_at = null,
        refresh_claim_expires_at = null, updated_at = p_received_at
    where authority_id = p_authority_id and status <> 'revoked';
    update public.ghl_marketplace_location_token_exchanges
    set status = 'revoked', operator_blocker_code = 'ghl_app_uninstalled', settled_at = p_received_at
    where authority_id = p_authority_id and status = 'pending';
    update public.ghl_marketplace_realtor_user_operations
    set status = 'canceled', operator_blocker_code = 'ghl_app_uninstalled', settled_at = p_received_at
    where authority_id = p_authority_id and status = 'pending';
  else
    raise exception using errcode = '22023', message = 'ghl_marketplace_lifecycle_event_type_invalid';
  end if;

  insert into public.ghl_marketplace_lifecycle_events(
    authority_id, organization_id, partner_id, event_type, event_fingerprint,
    app_fingerprint, company_fingerprint, location_fingerprint, account_fingerprint,
    outcome, received_at
  ) values (
    p_authority_id, p_organization_id, p_partner_id, p_event_type, p_event_fingerprint,
    p_app_fingerprint, p_company_fingerprint, p_location_fingerprint, p_account_fingerprint,
    'applied', p_received_at
  );
  return 'applied';
end;
$$;

create or replace function public.store_initial_ghl_marketplace_token_set_v1(
  p_authority_id uuid,
  p_subject_kind text,
  p_organization_id uuid,
  p_location_mapping_id uuid,
  p_partner_id uuid,
  p_encrypted_access_credential_ref text,
  p_encrypted_refresh_credential_ref text,
  p_account_fingerprint text,
  p_scope_fingerprint text,
  p_access_expires_at timestamptz,
  p_refresh_expires_at timestamptz,
  p_key_version integer,
  p_now timestamptz default timezone('utc', now())
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  authority public.ghl_marketplace_authorities%rowtype;
  mapping public.ghl_location_mappings%rowtype;
  expected_account_fingerprint text;
  token_set_id_value uuid;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into authority from public.ghl_marketplace_authorities
  where id = p_authority_id for update;
  if not found or authority.status not in ('pending', 'active') then
    raise exception using errcode = '42501', message = 'ghl_marketplace_authority_not_token_eligible';
  end if;
  if authority.partner_id is distinct from p_partner_id then
    raise exception using errcode = '42501', message = 'ghl_marketplace_token_partner_mismatch';
  end if;
  if p_scope_fingerprint <> authority.scope_fingerprint then
    raise exception using errcode = '42501', message = 'ghl_marketplace_token_scope_mismatch';
  end if;

  if p_subject_kind = 'company' then
    if authority.install_scope <> 'company' or p_location_mapping_id is not null
      or authority.organization_id is distinct from p_organization_id then
      raise exception using errcode = '42501', message = 'ghl_marketplace_company_token_scope_mismatch';
    end if;
    expected_account_fingerprint := authority.company_fingerprint;
  elsif p_subject_kind = 'location' then
    if p_organization_id is null or p_location_mapping_id is null then
      raise exception using errcode = '22023', message = 'ghl_marketplace_location_token_requires_mapping';
    end if;
    select * into mapping from public.ghl_location_mappings
    where id = p_location_mapping_id
      and organization_id = p_organization_id
      and installation_id = authority.installation_id
      and environment = authority.environment;
    if not found or mapping.partner_id is distinct from p_partner_id then
      raise exception using errcode = '42501', message = 'ghl_marketplace_location_token_mapping_mismatch';
    end if;
    if authority.install_scope = 'location' and authority.location_mapping_id <> p_location_mapping_id then
      raise exception using errcode = '42501', message = 'ghl_marketplace_location_token_authority_mismatch';
    end if;
    expected_account_fingerprint := private.ghl_marketplace_fingerprint_v1(mapping.provider_location_id);
  else
    raise exception using errcode = '22023', message = 'ghl_marketplace_token_subject_invalid';
  end if;
  if expected_account_fingerprint <> p_account_fingerprint then
    raise exception using errcode = '42501', message = 'ghl_marketplace_token_account_mismatch';
  end if;
  if p_access_expires_at <= p_now or p_refresh_expires_at <= p_access_expires_at or p_key_version <= 0 then
    raise exception using errcode = '22023', message = 'ghl_marketplace_token_metadata_invalid';
  end if;
  insert into public.ghl_marketplace_token_sets(
    authority_id, organization_id, location_mapping_id, partner_id, subject_kind,
    encrypted_access_credential_ref, encrypted_refresh_credential_ref,
    account_fingerprint, scope_fingerprint, access_expires_at, refresh_expires_at,
    key_version, generation, status, created_at, updated_at
  ) values (
    p_authority_id, p_organization_id, p_location_mapping_id, p_partner_id, p_subject_kind,
    p_encrypted_access_credential_ref, p_encrypted_refresh_credential_ref,
    p_account_fingerprint, p_scope_fingerprint, p_access_expires_at, p_refresh_expires_at,
    p_key_version, 1, 'active', p_now, p_now
  ) returning id into token_set_id_value;
  insert into public.ghl_marketplace_token_events(
    token_set_id, organization_id, event_type, generation,
    account_fingerprint, scope_fingerprint, key_version, recorded_at
  ) values (
    token_set_id_value, p_organization_id, 'created', 1,
    p_account_fingerprint, p_scope_fingerprint, p_key_version, p_now
  );
  return token_set_id_value;
end;
$$;

create or replace function public.claim_ghl_marketplace_token_refresh_v1(
  p_token_set_id uuid,
  p_expected_generation bigint,
  p_worker_id text,
  p_now timestamptz default timezone('utc', now()),
  p_lease_seconds integer default 120
)
returns table (
  result_outcome text,
  result_claim_token uuid,
  result_generation bigint,
  result_encrypted_refresh_credential_ref text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_record public.ghl_marketplace_token_sets%rowtype;
  authority_status text;
  new_claim_token uuid;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  if btrim(coalesce(p_worker_id, '')) = '' or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception using errcode = '22023', message = 'ghl_marketplace_refresh_claim_invalid';
  end if;
  select * into token_record
  from public.ghl_marketplace_token_sets
  where id = p_token_set_id
  for update;
  if not found then
    return query select 'not_found'::text, null::uuid, null::bigint, null::text;
    return;
  end if;
  select status into authority_status
  from public.ghl_marketplace_authorities
  where id = token_record.authority_id;
  if authority_status = 'uninstalled' or token_record.status = 'revoked' then
    return query select 'revoked'::text, null::uuid, token_record.generation, null::text;
    return;
  end if;
  if authority_status <> 'active' then
    return query select 'authority_not_active'::text, null::uuid, token_record.generation, null::text;
    return;
  end if;
  if token_record.generation <> p_expected_generation then
    return query select 'stale_generation'::text, null::uuid, token_record.generation, null::text;
    return;
  end if;
  if token_record.status = 'refreshing' and token_record.refresh_claim_expires_at > p_now then
    return query select 'refresh_in_progress'::text, null::uuid, token_record.generation, null::text;
    return;
  end if;
  if token_record.status = 'refreshing' then
    update public.ghl_marketplace_token_sets
    set status = 'operator_required', operator_blocker_code = 'ghl_rotating_refresh_outcome_ambiguous',
        refresh_claim_token = null, refresh_claimed_by = null, refresh_claimed_at = null,
        refresh_claim_expires_at = null, updated_at = p_now
    where id = token_record.id;
    insert into public.ghl_marketplace_token_events(
      token_set_id, organization_id, event_type, generation,
      account_fingerprint, scope_fingerprint, key_version, outcome_fingerprint, recorded_at
    ) values (
      token_record.id, token_record.organization_id, 'ambiguous', token_record.generation,
      token_record.account_fingerprint, token_record.scope_fingerprint, token_record.key_version,
      private.ghl_marketplace_fingerprint_v1('ghl_rotating_refresh_outcome_ambiguous'), p_now
    );
    return query select 'operator_required'::text, null::uuid, token_record.generation, null::text;
    return;
  end if;
  if token_record.status <> 'active' then
    return query select 'operator_required'::text, null::uuid, token_record.generation, null::text;
    return;
  end if;
  if token_record.refresh_expires_at <= p_now then
    update public.ghl_marketplace_token_sets
    set status = 'revoked', revoked_at = p_now, revocation_code = 'ghl_refresh_credential_expired',
        updated_at = p_now
    where id = token_record.id;
    insert into public.ghl_marketplace_token_events(
      token_set_id, organization_id, event_type, generation,
      account_fingerprint, scope_fingerprint, key_version, outcome_fingerprint, recorded_at
    ) values (
      token_record.id, token_record.organization_id, 'revoked', token_record.generation,
      token_record.account_fingerprint, token_record.scope_fingerprint, token_record.key_version,
      private.ghl_marketplace_fingerprint_v1('ghl_refresh_credential_expired'), p_now
    );
    return query select 'refresh_expired'::text, null::uuid, token_record.generation, null::text;
    return;
  end if;
  new_claim_token := gen_random_uuid();
  update public.ghl_marketplace_token_sets
  set status = 'refreshing', refresh_claim_token = new_claim_token,
      refresh_claim_generation = refresh_claim_generation + 1,
      refresh_claimed_by = p_worker_id, refresh_claimed_at = p_now,
      refresh_claim_expires_at = p_now + make_interval(secs => p_lease_seconds),
      operator_blocker_code = null, updated_at = p_now
  where id = token_record.id and generation = p_expected_generation and status = 'active';
  if not found then
    return query select 'refresh_in_progress'::text, null::uuid, token_record.generation, null::text;
    return;
  end if;
  return query select 'claimed'::text, new_claim_token, token_record.generation,
    token_record.encrypted_refresh_credential_ref;
end;
$$;

create or replace function public.settle_ghl_marketplace_token_refresh_v1(
  p_token_set_id uuid,
  p_claim_token uuid,
  p_expected_generation bigint,
  p_encrypted_access_credential_ref text,
  p_encrypted_refresh_credential_ref text,
  p_account_fingerprint text,
  p_scope_fingerprint text,
  p_access_expires_at timestamptz,
  p_refresh_expires_at timestamptz,
  p_key_version integer,
  p_outcome_fingerprint text,
  p_now timestamptz default timezone('utc', now())
)
returns table (result_outcome text, result_generation bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_record public.ghl_marketplace_token_sets%rowtype;
  authority_status text;
  next_generation bigint;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into token_record
  from public.ghl_marketplace_token_sets
  where id = p_token_set_id
  for update;
  if not found then
    return query select 'not_found'::text, null::bigint;
    return;
  end if;
  select status into authority_status
  from public.ghl_marketplace_authorities
  where id = token_record.authority_id;
  if authority_status = 'uninstalled' or token_record.status = 'revoked' then
    return query select 'uninstalled_race'::text, token_record.generation;
    return;
  end if;
  if token_record.generation <> p_expected_generation then
    return query select 'stale_generation'::text, token_record.generation;
    return;
  end if;
  if token_record.status <> 'refreshing' or token_record.refresh_claim_token is distinct from p_claim_token then
    return query select 'stale_claim'::text, token_record.generation;
    return;
  end if;
  if token_record.refresh_claim_expires_at <= p_now then
    update public.ghl_marketplace_token_sets
    set status = 'operator_required', operator_blocker_code = 'ghl_rotating_refresh_outcome_ambiguous',
        refresh_claim_token = null, refresh_claimed_by = null, refresh_claimed_at = null,
        refresh_claim_expires_at = null, updated_at = p_now
    where id = token_record.id;
    insert into public.ghl_marketplace_token_events(
      token_set_id, organization_id, event_type, generation,
      account_fingerprint, scope_fingerprint, key_version, outcome_fingerprint, recorded_at
    ) values (
      token_record.id, token_record.organization_id, 'ambiguous', token_record.generation,
      token_record.account_fingerprint, token_record.scope_fingerprint, token_record.key_version,
      private.ghl_marketplace_fingerprint_v1('ghl_rotating_refresh_outcome_ambiguous'), p_now
    );
    return query select 'operator_required'::text, token_record.generation;
    return;
  end if;
  if token_record.account_fingerprint <> p_account_fingerprint then
    update public.ghl_marketplace_token_sets
    set status = 'operator_required', operator_blocker_code = 'ghl_refresh_account_fingerprint_mismatch',
        refresh_claim_token = null, refresh_claimed_by = null, refresh_claimed_at = null,
        refresh_claim_expires_at = null, updated_at = p_now
    where id = token_record.id;
    return query select 'account_mismatch'::text, token_record.generation;
    return;
  end if;
  if token_record.scope_fingerprint <> p_scope_fingerprint then
    update public.ghl_marketplace_token_sets
    set status = 'operator_required', operator_blocker_code = 'ghl_refresh_scope_fingerprint_mismatch',
        refresh_claim_token = null, refresh_claimed_by = null, refresh_claimed_at = null,
        refresh_claim_expires_at = null, updated_at = p_now
    where id = token_record.id;
    return query select 'scope_mismatch'::text, token_record.generation;
    return;
  end if;
  if p_access_expires_at <= p_now or p_refresh_expires_at <= p_access_expires_at
    or p_key_version < token_record.key_version then
    raise exception using errcode = '22023', message = 'ghl_marketplace_refresh_metadata_invalid';
  end if;
  next_generation := token_record.generation + 1;
  update public.ghl_marketplace_token_sets
  set encrypted_access_credential_ref = p_encrypted_access_credential_ref,
      encrypted_refresh_credential_ref = p_encrypted_refresh_credential_ref,
      access_expires_at = p_access_expires_at, refresh_expires_at = p_refresh_expires_at,
      key_version = p_key_version, generation = next_generation, status = 'active',
      refresh_claim_token = null, refresh_claimed_by = null, refresh_claimed_at = null,
      refresh_claim_expires_at = null, operator_blocker_code = null, updated_at = p_now
  where id = token_record.id;
  insert into public.ghl_marketplace_token_events(
    token_set_id, organization_id, event_type, generation,
    account_fingerprint, scope_fingerprint, key_version, outcome_fingerprint, recorded_at
  ) values (
    token_record.id, token_record.organization_id, 'refreshed', next_generation,
    token_record.account_fingerprint, token_record.scope_fingerprint, p_key_version,
    p_outcome_fingerprint, p_now
  );
  return query select 'settled'::text, next_generation;
end;
$$;

create or replace function public.request_ghl_marketplace_location_token_exchange_v1(
  p_company_token_set_id uuid,
  p_organization_id uuid,
  p_location_mapping_id uuid,
  p_partner_id uuid,
  p_request_fingerprint text,
  p_idempotency_key text,
  p_now timestamptz default timezone('utc', now())
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_token public.ghl_marketplace_token_sets%rowtype;
  authority public.ghl_marketplace_authorities%rowtype;
  mapping public.ghl_location_mappings%rowtype;
  existing_exchange public.ghl_marketplace_location_token_exchanges%rowtype;
  exchange_id_value uuid;
  company_fingerprint_value text;
  location_fingerprint_value text;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into company_token from public.ghl_marketplace_token_sets
  where id = p_company_token_set_id for update;
  if not found or company_token.subject_kind <> 'company' or company_token.status <> 'active' then
    raise exception using errcode = '42501', message = 'ghl_marketplace_company_token_not_active';
  end if;
  select * into authority from public.ghl_marketplace_authorities
  where id = company_token.authority_id;
  if not found or authority.status <> 'active' or authority.install_scope <> 'company'
    or authority.partner_id is distinct from p_partner_id then
    raise exception using errcode = '42501', message = 'ghl_marketplace_company_authority_mismatch';
  end if;
  perform private.assert_ghl_marketplace_tenant_partner_v1(p_organization_id, p_partner_id);
  select * into mapping from public.ghl_location_mappings
  where id = p_location_mapping_id
    and organization_id = p_organization_id
    and installation_id = authority.installation_id
    and environment = authority.environment;
  if not found or mapping.partner_id is distinct from p_partner_id then
    raise exception using errcode = '42501', message = 'ghl_marketplace_location_exchange_mapping_mismatch';
  end if;
  company_fingerprint_value := authority.company_fingerprint;
  location_fingerprint_value := private.ghl_marketplace_fingerprint_v1(mapping.provider_location_id);
  insert into public.ghl_marketplace_location_token_exchanges(
    authority_id, company_token_set_id, organization_id, location_mapping_id, partner_id,
    company_fingerprint, location_fingerprint, account_fingerprint, scope_fingerprint,
    request_fingerprint, idempotency_key, status, created_at
  ) values (
    authority.id, company_token.id, p_organization_id, p_location_mapping_id, p_partner_id,
    company_fingerprint_value, location_fingerprint_value, location_fingerprint_value,
    company_token.scope_fingerprint, p_request_fingerprint, p_idempotency_key, 'pending', p_now
  )
  on conflict (idempotency_key) do nothing
  returning id into exchange_id_value;
  if exchange_id_value is null then
    select * into strict existing_exchange
    from public.ghl_marketplace_location_token_exchanges existing
    where existing.idempotency_key = p_idempotency_key
    for update;
    if existing_exchange.authority_id is distinct from authority.id
      or existing_exchange.company_token_set_id is distinct from company_token.id
      or existing_exchange.organization_id is distinct from p_organization_id
      or existing_exchange.location_mapping_id is distinct from p_location_mapping_id
      or existing_exchange.partner_id is distinct from p_partner_id
      or existing_exchange.company_fingerprint is distinct from company_fingerprint_value
      or existing_exchange.location_fingerprint is distinct from location_fingerprint_value
      or existing_exchange.account_fingerprint is distinct from location_fingerprint_value
      or existing_exchange.scope_fingerprint is distinct from company_token.scope_fingerprint
      or existing_exchange.request_fingerprint is distinct from p_request_fingerprint then
      raise exception using errcode = '23505', message = 'ghl_marketplace_location_exchange_identity_collision';
    end if;
    exchange_id_value := existing_exchange.id;
  end if;
  return exchange_id_value;
end;
$$;

create or replace function public.settle_ghl_marketplace_location_token_exchange_v1(
  p_exchange_id uuid,
  p_outcome text,
  p_encrypted_access_credential_ref text,
  p_encrypted_refresh_credential_ref text,
  p_access_expires_at timestamptz,
  p_refresh_expires_at timestamptz,
  p_key_version integer,
  p_now timestamptz default timezone('utc', now())
)
returns table (result_outcome text, result_token_set_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  exchange_record public.ghl_marketplace_location_token_exchanges%rowtype;
  authority_status text;
  token_set_id_value uuid;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into exchange_record from public.ghl_marketplace_location_token_exchanges
  where id = p_exchange_id for update;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if exchange_record.status <> 'pending' then
    return query select 'already_settled'::text, exchange_record.result_token_set_id;
    return;
  end if;
  select status into authority_status from public.ghl_marketplace_authorities
  where id = exchange_record.authority_id;
  if authority_status = 'uninstalled' then
    update public.ghl_marketplace_location_token_exchanges
    set status = 'revoked', operator_blocker_code = 'ghl_app_uninstalled', settled_at = p_now
    where id = exchange_record.id;
    return query select 'uninstalled_race'::text, null::uuid;
    return;
  end if;
  if p_outcome in ('ambiguous', 'operator_required') then
    update public.ghl_marketplace_location_token_exchanges
    set status = p_outcome,
        operator_blocker_code = case when p_outcome = 'ambiguous'
          then 'ghl_location_token_exchange_outcome_ambiguous'
          else 'ghl_location_token_exchange_operator_required' end,
        settled_at = p_now
    where id = exchange_record.id;
    return query select p_outcome, null::uuid;
    return;
  end if;
  if p_outcome <> 'succeeded' then
    raise exception using errcode = '22023', message = 'ghl_marketplace_location_exchange_outcome_invalid';
  end if;
  token_set_id_value := public.store_initial_ghl_marketplace_token_set_v1(
    exchange_record.authority_id, 'location', exchange_record.organization_id,
    exchange_record.location_mapping_id, exchange_record.partner_id,
    p_encrypted_access_credential_ref, p_encrypted_refresh_credential_ref,
    exchange_record.account_fingerprint, exchange_record.scope_fingerprint,
    p_access_expires_at, p_refresh_expires_at, p_key_version, p_now
  );
  update public.ghl_marketplace_location_token_exchanges
  set status = 'succeeded', result_token_set_id = token_set_id_value,
      operator_blocker_code = null, settled_at = p_now
  where id = exchange_record.id;
  return query select 'succeeded'::text, token_set_id_value;
end;
$$;

create or replace function public.request_ghl_marketplace_realtor_user_operation_v1(
  p_authority_id uuid,
  p_organization_id uuid,
  p_location_mapping_id uuid,
  p_partner_id uuid,
  p_dealflow_user_id uuid,
  p_realtor_identity_fingerprint text,
  p_operation text,
  p_provider_user_fingerprint text,
  p_request_fingerprint text,
  p_idempotency_key text,
  p_now timestamptz default timezone('utc', now())
)
returns table (result_outcome text, result_operation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authority public.ghl_marketplace_authorities%rowtype;
  mapping public.ghl_location_mappings%rowtype;
  existing_operation public.ghl_marketplace_realtor_user_operations%rowtype;
  operation_id_value uuid;
  initial_status text := 'pending';
  blocker_code_value text := null;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into authority from public.ghl_marketplace_authorities
  where id = p_authority_id;
  if not found or authority.status <> 'active' or authority.partner_id is distinct from p_partner_id then
    raise exception using errcode = '42501', message = 'ghl_marketplace_user_authority_mismatch';
  end if;
  perform private.assert_ghl_marketplace_tenant_partner_v1(p_organization_id, p_partner_id);
  select * into mapping from public.ghl_location_mappings
  where id = p_location_mapping_id
    and organization_id = p_organization_id
    and installation_id = authority.installation_id
    and environment = authority.environment;
  if not found or mapping.partner_id is distinct from p_partner_id then
    raise exception using errcode = '42501', message = 'ghl_marketplace_user_location_mismatch';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = p_organization_id and membership.user_id = p_dealflow_user_id
  ) then
    raise exception using errcode = '42501', message = 'ghl_marketplace_realtor_not_in_tenant';
  end if;
  if exists (
    select 1 from public.ghl_marketplace_realtor_user_operations prior
    where prior.organization_id = p_organization_id
      and prior.realtor_identity_fingerprint = p_realtor_identity_fingerprint
      and prior.operation = 'user_revoke' and prior.status = 'succeeded'
  ) then
    return query select 'revoked_user'::text, null::uuid;
    return;
  end if;
  if p_operation = 'user_invite' then
    initial_status := 'operator_required';
    blocker_code_value := 'ghl_standalone_user_invite_contract_not_documented';
  elsif p_operation not in ('user_create', 'user_revoke') then
    raise exception using errcode = '22023', message = 'ghl_marketplace_realtor_user_operation_invalid';
  end if;
  if p_operation = 'user_revoke' and p_provider_user_fingerprint is null then
    raise exception using errcode = '22023', message = 'ghl_marketplace_revoke_requires_provider_user_fingerprint';
  end if;
  insert into public.ghl_marketplace_realtor_user_operations(
    authority_id, organization_id, location_mapping_id, partner_id, dealflow_user_id,
    realtor_identity_fingerprint, operation, provider_user_fingerprint,
    request_fingerprint, idempotency_key, status, operator_blocker_code, created_at
  ) values (
    p_authority_id, p_organization_id, p_location_mapping_id, p_partner_id, p_dealflow_user_id,
    p_realtor_identity_fingerprint, p_operation, p_provider_user_fingerprint,
    p_request_fingerprint, p_idempotency_key, initial_status, blocker_code_value, p_now
  )
  on conflict (idempotency_key) do nothing
  returning id, status into operation_id_value, initial_status;
  if operation_id_value is null then
    select * into strict existing_operation
    from public.ghl_marketplace_realtor_user_operations existing
    where existing.idempotency_key = p_idempotency_key
    for update;
    if existing_operation.authority_id is distinct from p_authority_id
      or existing_operation.organization_id is distinct from p_organization_id
      or existing_operation.location_mapping_id is distinct from p_location_mapping_id
      or existing_operation.partner_id is distinct from p_partner_id
      or existing_operation.dealflow_user_id is distinct from p_dealflow_user_id
      or existing_operation.realtor_identity_fingerprint is distinct from p_realtor_identity_fingerprint
      or existing_operation.operation is distinct from p_operation
      or (p_operation = 'user_revoke'
        and existing_operation.provider_user_fingerprint is distinct from p_provider_user_fingerprint)
      or existing_operation.request_fingerprint is distinct from p_request_fingerprint then
      raise exception using errcode = '23505', message = 'ghl_marketplace_realtor_user_operation_identity_collision';
    end if;
    operation_id_value := existing_operation.id;
    initial_status := existing_operation.status;
  end if;
  return query select initial_status, operation_id_value;
end;
$$;

create or replace function public.settle_ghl_marketplace_realtor_user_operation_v1(
  p_operation_id uuid,
  p_outcome text,
  p_provider_user_fingerprint text,
  p_provider_request_fingerprint text,
  p_now timestamptz default timezone('utc', now())
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_record public.ghl_marketplace_realtor_user_operations%rowtype;
  authority_status text;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into operation_record from public.ghl_marketplace_realtor_user_operations
  where id = p_operation_id for update;
  if not found then return 'not_found'; end if;
  if operation_record.status <> 'pending' then return 'already_settled'; end if;
  select status into authority_status from public.ghl_marketplace_authorities
  where id = operation_record.authority_id;
  if authority_status = 'uninstalled' then
    update public.ghl_marketplace_realtor_user_operations
    set status = 'canceled', operator_blocker_code = 'ghl_app_uninstalled', settled_at = p_now
    where id = operation_record.id;
    return 'uninstalled_race';
  end if;
  if p_outcome not in ('succeeded', 'ambiguous', 'operator_required') then
    raise exception using errcode = '22023', message = 'ghl_marketplace_realtor_user_outcome_invalid';
  end if;
  if p_outcome = 'succeeded' and p_provider_user_fingerprint is null then
    raise exception using errcode = '22023', message = 'ghl_marketplace_provider_user_fingerprint_required';
  end if;
  update public.ghl_marketplace_realtor_user_operations
  set status = p_outcome,
      provider_user_fingerprint = coalesce(p_provider_user_fingerprint, provider_user_fingerprint),
      provider_request_fingerprint = p_provider_request_fingerprint,
      operator_blocker_code = case
        when p_outcome = 'ambiguous' then 'ghl_realtor_user_operation_outcome_ambiguous'
        when p_outcome = 'operator_required' then 'ghl_realtor_user_operation_operator_required'
        else null end,
      settled_at = p_now
  where id = operation_record.id;
  return p_outcome;
end;
$$;

create or replace function private.reject_ghl_marketplace_append_only_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'ghl_marketplace_receipt_is_append_only';
end;
$$;

create or replace function private.guard_ghl_marketplace_oauth_state_update_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.organization_id is distinct from new.organization_id
    or old.initiated_by_user_id is distinct from new.initiated_by_user_id
    or old.partner_id is distinct from new.partner_id
    or old.environment is distinct from new.environment
    or old.state_hash is distinct from new.state_hash
    or old.pkce_challenge is distinct from new.pkce_challenge
    or old.pkce_method is distinct from new.pkce_method
    or old.encrypted_pkce_verifier_ref is distinct from new.encrypted_pkce_verifier_ref
    or old.app_fingerprint is distinct from new.app_fingerprint
    or old.account_fingerprint is distinct from new.account_fingerprint
    or old.scope_fingerprint is distinct from new.scope_fingerprint
    or old.company_fingerprint is distinct from new.company_fingerprint
    or old.location_fingerprint is distinct from new.location_fingerprint
    or old.expires_at is distinct from new.expires_at
    or old.created_at is distinct from new.created_at then
    raise exception using errcode = '42501', message = 'ghl_marketplace_oauth_state_binding_is_immutable';
  end if;
  if old.status <> 'pending' or new.status not in ('consumed', 'expired', 'rejected') then
    raise exception using errcode = '42501', message = 'ghl_marketplace_oauth_state_transition_invalid';
  end if;
  return new;
end;
$$;

drop trigger if exists ghl_marketplace_oauth_state_update_guard on public.ghl_marketplace_oauth_states;
create trigger ghl_marketplace_oauth_state_update_guard
  before update on public.ghl_marketplace_oauth_states
  for each row execute function private.guard_ghl_marketplace_oauth_state_update_v1();

drop trigger if exists ghl_marketplace_lifecycle_events_append_only on public.ghl_marketplace_lifecycle_events;
create trigger ghl_marketplace_lifecycle_events_append_only
  before update or delete on public.ghl_marketplace_lifecycle_events
  for each row execute function private.reject_ghl_marketplace_append_only_mutation_v1();

drop trigger if exists ghl_marketplace_token_events_append_only on public.ghl_marketplace_token_events;
create trigger ghl_marketplace_token_events_append_only
  before update or delete on public.ghl_marketplace_token_events
  for each row execute function private.reject_ghl_marketplace_append_only_mutation_v1();

do $ghl_marketplace_rls$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'ghl_marketplace_oauth_states',
    'ghl_marketplace_authorities',
    'ghl_marketplace_lifecycle_events',
    'ghl_marketplace_token_sets',
    'ghl_marketplace_token_events',
    'ghl_marketplace_location_token_exchanges',
    'ghl_marketplace_realtor_user_operations'
  ] loop
    execute format('alter table public.%I enable row level security', relation_name);
    execute format('alter table public.%I force row level security', relation_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', relation_name);
    execute format('grant select on table public.%I to service_role', relation_name);
  end loop;
end;
$ghl_marketplace_rls$;

revoke all on function private.require_ghl_marketplace_service_role_v1() from public, anon, authenticated, service_role;
revoke all on function private.ghl_marketplace_fingerprint_v1(text) from public, anon, authenticated, service_role;
revoke all on function private.assert_ghl_marketplace_tenant_partner_v1(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function private.assert_ghl_marketplace_authority_v1(uuid,uuid,uuid,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function private.reject_ghl_marketplace_append_only_mutation_v1() from public, anon, authenticated, service_role;
revoke all on function private.guard_ghl_marketplace_oauth_state_update_v1() from public, anon, authenticated, service_role;

revoke all on function public.create_ghl_marketplace_oauth_state_v1(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_ghl_marketplace_oauth_state_v1(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,timestamptz)
  to service_role;
revoke all on function public.consume_ghl_marketplace_oauth_state_v1(text,uuid,uuid,uuid,text,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_ghl_marketplace_oauth_state_v1(text,uuid,uuid,uuid,text,text,text,text,text,timestamptz)
  to service_role;
revoke all on function public.create_ghl_marketplace_authority_v1(uuid,uuid,uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.create_ghl_marketplace_authority_v1(uuid,uuid,uuid,uuid,text,text,text,text)
  to service_role;
revoke all on function public.record_ghl_marketplace_lifecycle_v1(uuid,uuid,uuid,text,text,text,text,text,text,boolean,timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_ghl_marketplace_lifecycle_v1(uuid,uuid,uuid,text,text,text,text,text,text,boolean,timestamptz)
  to service_role;
revoke all on function public.store_initial_ghl_marketplace_token_set_v1(uuid,text,uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,timestamptz)
  from public, anon, authenticated;
grant execute on function public.store_initial_ghl_marketplace_token_set_v1(uuid,text,uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,timestamptz)
  to service_role;
revoke all on function public.claim_ghl_marketplace_token_refresh_v1(uuid,bigint,text,timestamptz,integer)
  from public, anon, authenticated;
grant execute on function public.claim_ghl_marketplace_token_refresh_v1(uuid,bigint,text,timestamptz,integer)
  to service_role;
revoke all on function public.settle_ghl_marketplace_token_refresh_v1(uuid,uuid,bigint,text,text,text,text,timestamptz,timestamptz,integer,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_ghl_marketplace_token_refresh_v1(uuid,uuid,bigint,text,text,text,text,timestamptz,timestamptz,integer,text,timestamptz)
  to service_role;
revoke all on function public.request_ghl_marketplace_location_token_exchange_v1(uuid,uuid,uuid,uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.request_ghl_marketplace_location_token_exchange_v1(uuid,uuid,uuid,uuid,text,text,timestamptz)
  to service_role;
revoke all on function public.settle_ghl_marketplace_location_token_exchange_v1(uuid,text,text,text,timestamptz,timestamptz,integer,timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_ghl_marketplace_location_token_exchange_v1(uuid,text,text,text,timestamptz,timestamptz,integer,timestamptz)
  to service_role;
revoke all on function public.request_ghl_marketplace_realtor_user_operation_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.request_ghl_marketplace_realtor_user_operation_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz)
  to service_role;
revoke all on function public.settle_ghl_marketplace_realtor_user_operation_v1(uuid,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_ghl_marketplace_realtor_user_operation_v1(uuid,text,text,text,timestamptz)
  to service_role;

-- Explicitly refresh the account-deletion inventory because the inventory
-- migration predates these relations. Credential references are detached and
-- deleted with the workspace; no raw secret is retained in receipts.
insert into public.account_deletion_data_inventory(
  resource_kind, relation_schema, relation_name, scope_column, disposition,
  retention_class, executor_task, pii_columns
) values
  ('table','public','ghl_marketplace_oauth_states','organization_id','provider_detach','immediate','delete_operational_data',
    array['encrypted_pkce_verifier_ref']::text[]),
  ('table','public','ghl_marketplace_authorities','organization_id','provider_detach','immediate','delete_operational_data',
    '{}'::text[]),
  ('table','public','ghl_marketplace_lifecycle_events','organization_id','provider_detach','immediate','delete_operational_data',
    '{}'::text[]),
  ('table','public','ghl_marketplace_token_sets','organization_id','provider_detach','immediate','delete_operational_data',
    array['encrypted_access_credential_ref','encrypted_refresh_credential_ref']::text[]),
  ('table','public','ghl_marketplace_token_events','organization_id','provider_detach','immediate','delete_operational_data',
    '{}'::text[]),
  ('table','public','ghl_marketplace_location_token_exchanges','organization_id','provider_detach','immediate','delete_operational_data',
    '{}'::text[]),
  ('table','public','ghl_marketplace_realtor_user_operations','organization_id','provider_detach','immediate','delete_operational_data',
    '{}'::text[])
on conflict (resource_kind, relation_schema, relation_name) do update set
  scope_column = excluded.scope_column,
  disposition = excluded.disposition,
  retention_class = excluded.retention_class,
  executor_task = excluded.executor_task,
  pii_columns = excluded.pii_columns,
  classified_at = timezone('utc', now());

do $ghl_marketplace_inventory_coverage$
declare
  missing_count integer;
begin
  select count(*) into missing_count
  from unnest(array[
    'ghl_marketplace_oauth_states',
    'ghl_marketplace_authorities',
    'ghl_marketplace_lifecycle_events',
    'ghl_marketplace_token_sets',
    'ghl_marketplace_token_events',
    'ghl_marketplace_location_token_exchanges',
    'ghl_marketplace_realtor_user_operations'
  ]) relation_name
  where not exists (
    select 1 from public.account_deletion_data_inventory inventory
    where inventory.resource_kind = 'table' and inventory.relation_schema = 'public'
      and inventory.relation_name = relation_name
  );
  if missing_count <> 0 then
    raise exception using errcode = '55000', message = 'ghl_marketplace_deletion_inventory_incomplete';
  end if;
end;
$ghl_marketplace_inventory_coverage$;

comment on table public.ghl_marketplace_token_sets is
  'Rotating OAuth token authority. Only opaque encrypted references are stored; generation is compare-and-swap protected.';
comment on function public.claim_ghl_marketplace_token_refresh_v1(uuid,bigint,text,timestamptz,integer) is
  'Single-flight claim for HighLevel rotating refresh tokens. An expired in-flight lease becomes operator-required instead of being retried.';
comment on table public.ghl_marketplace_realtor_user_operations is
  'Provider-disabled operation ledger for realtor user create, invite, and revoke. No email, password, profile, or raw provider payload is stored.';
