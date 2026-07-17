-- Complete the local GHL Marketplace OAuth and lifecycle runtime without
-- enabling provider effects. This migration is additive and service-role only.

alter table public.ghl_marketplace_oauth_states
  add column if not exists installation_id uuid null,
  add column if not exists location_mapping_id uuid null,
  add column if not exists install_scope text null,
  add column if not exists state_protection text not null default 'legacy_pkce',
  add column if not exists redirect_uri_fingerprint text null,
  add column if not exists return_path text not null default '/settings',
  add column if not exists reconnect_requested boolean not null default false;

alter table public.ghl_marketplace_oauth_states
  alter column pkce_challenge drop not null,
  alter column pkce_method drop not null,
  alter column encrypted_pkce_verifier_ref drop not null;

alter table public.ghl_marketplace_oauth_states
  drop constraint if exists ghl_marketplace_oauth_states_pkce_check,
  drop constraint if exists ghl_marketplace_oauth_states_verifier_ref_check,
  drop constraint if exists ghl_marketplace_oauth_states_runtime_binding_check,
  drop constraint if exists ghl_marketplace_oauth_states_installation_environment_fk,
  drop constraint if exists ghl_marketplace_oauth_states_mapping_tenant_fk,
  drop constraint if exists ghl_marketplace_oauth_states_scope_mapping_check,
  add constraint ghl_marketplace_oauth_states_runtime_binding_check check (
    (
      state_protection = 'legacy_pkce'
      and pkce_method = 'S256'
      and pkce_challenge ~ '^[A-Za-z0-9_-]{43}$'
      and encrypted_pkce_verifier_ref ~ '^enc-ref:v[1-9][0-9]*:[A-Za-z0-9][A-Za-z0-9._:/-]{15,255}$'
    ) or (
      state_protection = 'single_use_hash_cookie_binding'
      and pkce_method is null and pkce_challenge is null
      and encrypted_pkce_verifier_ref is null
      and installation_id is not null
      and install_scope in ('company','location')
      and redirect_uri_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and left(return_path,1) = '/'
      and length(return_path) between 1 and 512
      and position(chr(92) in return_path) = 0
      and return_path !~ '^//'
    )
  ),
  add constraint ghl_marketplace_oauth_states_installation_environment_fk
    foreign key (installation_id, environment)
    references public.ghl_installations(id, environment) on delete restrict,
  add constraint ghl_marketplace_oauth_states_mapping_tenant_fk
    foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings(id, organization_id) on delete restrict,
  add constraint ghl_marketplace_oauth_states_scope_mapping_check check (
    state_protection = 'legacy_pkce'
    or (install_scope = 'company' and location_mapping_id is null and location_fingerprint is null)
    or (install_scope = 'location' and location_mapping_id is not null and location_fingerprint is not null)
  );

create table if not exists public.ghl_marketplace_encrypted_credentials (
  id uuid primary key default gen_random_uuid(),
  credential_ref text not null unique,
  oauth_state_id uuid null references public.ghl_marketplace_oauth_states(id) on delete cascade,
  authority_id uuid null references public.ghl_marketplace_authorities(id) on delete cascade,
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete cascade,
  purpose text not null,
  encrypted_envelope jsonb not null,
  credential_fingerprint text not null,
  key_version integer not null,
  generation bigint not null,
  status text not null default 'staged',
  created_at timestamptz not null default timezone('utc', now()),
  activated_at timestamptz null,
  retired_at timestamptz null,
  constraint ghl_marketplace_encrypted_credentials_ref_check
    check (credential_ref ~ '^enc-ref:v[1-9][0-9]*:ghl-marketplace/(access|refresh)/[0-9a-f-]{36}$'),
  constraint ghl_marketplace_encrypted_credentials_binding_check
    check ((oauth_state_id is not null)::integer + (authority_id is not null)::integer = 1),
  constraint ghl_marketplace_encrypted_credentials_purpose_check
    check (purpose in ('access','refresh')),
  constraint ghl_marketplace_encrypted_credentials_fingerprint_check
    check (credential_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  constraint ghl_marketplace_encrypted_credentials_version_check
    check (key_version > 0 and generation > 0),
  constraint ghl_marketplace_encrypted_credentials_status_check
    check (status in ('staged','active','retired','revoked')),
  constraint ghl_marketplace_encrypted_credentials_status_timestamp_check check (
    (status = 'staged' and activated_at is null and retired_at is null)
    or (status = 'active' and activated_at is not null and retired_at is null)
    or (status in ('retired','revoked') and retired_at is not null)
  ),
  constraint ghl_marketplace_encrypted_credentials_envelope_check check (
    jsonb_typeof(encrypted_envelope) = 'object'
    and encrypted_envelope->>'version' = '1'
    and encrypted_envelope->>'algorithm' = 'A256GCM'
    and encrypted_envelope->>'purpose' = purpose
    and encrypted_envelope->>'reference' = credential_ref
    and (encrypted_envelope->>'keyVersion')::integer = key_version
    and encrypted_envelope ?& array['iv','ciphertext','tag']
    and not (encrypted_envelope ?| array[
      'accessToken','access_token','refreshToken','refresh_token','clientSecret','client_secret','authorizationCode','code'
    ])
  )
);

drop index if exists public.ghl_marketplace_encrypted_credentials_active_purpose_unique;

create table if not exists public.ghl_marketplace_runtime_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  authority_id uuid null references public.ghl_marketplace_authorities(id) on delete cascade,
  organization_id uuid null references public.ghl_workspace_tenants(organization_id) on delete cascade,
  location_mapping_id uuid null,
  partner_id uuid null references public.partners(id) on delete restrict,
  event_type text not null,
  event_fingerprint text not null,
  payload_fingerprint text not null,
  app_fingerprint text not null,
  company_fingerprint text null,
  location_fingerprint text null,
  account_fingerprint text null,
  user_fingerprint text null,
  email_fingerprint text null,
  identifiers_complete boolean not null,
  outcome text not null,
  operator_blocker_code text null,
  provider_occurred_at timestamptz null,
  received_at timestamptz not null default timezone('utc', now()),
  reconciled_at timestamptz null,
  constraint ghl_marketplace_runtime_events_environment_check
    check (environment in ('production','sandbox','test')),
  constraint ghl_marketplace_runtime_events_type_check
    check (event_type in ('INSTALL','UNINSTALL','UPDATE','UserCreate','UserUpdate','UserDelete','LocationCreate','LocationUpdate')),
  constraint ghl_marketplace_runtime_events_fingerprint_check check (
    event_fingerprint ~ '^sha256:[a-f0-9]{64}$'
    and payload_fingerprint ~ '^sha256:[a-f0-9]{64}$'
    and app_fingerprint ~ '^sha256:[a-f0-9]{64}$'
    and (company_fingerprint is null or company_fingerprint ~ '^sha256:[a-f0-9]{64}$')
    and (location_fingerprint is null or location_fingerprint ~ '^sha256:[a-f0-9]{64}$')
    and (account_fingerprint is null or account_fingerprint ~ '^sha256:[a-f0-9]{64}$')
    and (user_fingerprint is null or user_fingerprint ~ '^sha256:[a-f0-9]{64}$')
    and (email_fingerprint is null or email_fingerprint ~ '^sha256:[a-f0-9]{64}$')
  ),
  constraint ghl_marketplace_runtime_events_outcome_check
    check (outcome in ('pending_authority','applied','reconciled','operator_required','rejected')),
  constraint ghl_marketplace_runtime_events_mapping_tenant_fk
    foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings(id, organization_id) on delete restrict,
  constraint ghl_marketplace_runtime_events_reconciliation_check check (
    (outcome = 'pending_authority' and reconciled_at is null)
    or (outcome <> 'pending_authority' and reconciled_at is not null)
  ),
  unique(environment, app_fingerprint, event_fingerprint)
);

create index if not exists ghl_marketplace_runtime_events_pending_idx
  on public.ghl_marketplace_runtime_events(environment, app_fingerprint, account_fingerprint, received_at)
  where outcome = 'pending_authority';

create or replace function public.create_ghl_marketplace_oauth_state_v2(
  p_organization_id uuid,
  p_initiated_by_user_id uuid,
  p_partner_id uuid,
  p_environment text,
  p_state_hash text,
  p_installation_id uuid,
  p_location_mapping_id uuid,
  p_install_scope text,
  p_app_fingerprint text,
  p_account_fingerprint text,
  p_scope_fingerprint text,
  p_company_fingerprint text,
  p_location_fingerprint text,
  p_redirect_uri_fingerprint text,
  p_return_path text,
  p_reconnect_requested boolean,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  installation public.ghl_installations%rowtype;
  mapping public.ghl_location_mappings%rowtype;
  state_id_value uuid;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  perform private.assert_ghl_marketplace_tenant_partner_v1(p_organization_id, p_partner_id);
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = p_initiated_by_user_id
      and membership.role in ('owner','admin')
  ) then
    raise exception using errcode = '42501', message = 'ghl_marketplace_connect_admin_required';
  end if;
  select * into installation from public.ghl_installations
  where id = p_installation_id and environment = p_environment and status = 'active';
  if not found or installation.partner_id is distinct from p_partner_id then
    raise exception using errcode = '42501', message = 'ghl_marketplace_connect_installation_mismatch';
  end if;
  if private.ghl_marketplace_fingerprint_v1(installation.provider_agency_id) <> p_company_fingerprint then
    raise exception using errcode = '42501', message = 'ghl_marketplace_connect_company_mismatch';
  end if;
  if p_install_scope = 'location' then
    select * into mapping from public.ghl_location_mappings
    where id = p_location_mapping_id and organization_id = p_organization_id
      and installation_id = p_installation_id and environment = p_environment
      and partner_id is not distinct from p_partner_id and status = 'active';
    if not found
      or private.ghl_marketplace_fingerprint_v1(mapping.provider_location_id) <> p_location_fingerprint
      or p_account_fingerprint <> p_location_fingerprint then
      raise exception using errcode = '42501', message = 'ghl_marketplace_connect_location_mismatch';
    end if;
  elsif p_install_scope = 'company' then
    if p_location_mapping_id is not null or p_location_fingerprint is not null
      or p_account_fingerprint <> p_company_fingerprint then
      raise exception using errcode = '42501', message = 'ghl_marketplace_connect_company_scope_invalid';
    end if;
  else
    raise exception using errcode = '22023', message = 'ghl_marketplace_connect_scope_invalid';
  end if;
  if exists (
    select 1 from public.ghl_marketplace_authorities authority
    where authority.environment = p_environment and authority.app_fingerprint = p_app_fingerprint
      and authority.account_fingerprint = p_account_fingerprint and authority.status <> 'uninstalled'
  ) and not p_reconnect_requested then
    raise exception using errcode = '23505', message = 'ghl_marketplace_reconnect_explicitly_required';
  end if;
  insert into public.ghl_marketplace_oauth_states(
    organization_id, initiated_by_user_id, partner_id, environment, state_hash,
    pkce_challenge, pkce_method, encrypted_pkce_verifier_ref,
    app_fingerprint, account_fingerprint, scope_fingerprint, company_fingerprint,
    location_fingerprint, expires_at, installation_id, location_mapping_id,
    install_scope, state_protection, redirect_uri_fingerprint, return_path,
    reconnect_requested
  ) values (
    p_organization_id, p_initiated_by_user_id, p_partner_id, p_environment, p_state_hash,
    null, null, null, p_app_fingerprint, p_account_fingerprint, p_scope_fingerprint,
    p_company_fingerprint, p_location_fingerprint, p_expires_at, p_installation_id,
    p_location_mapping_id, p_install_scope, 'single_use_hash_cookie_binding',
    p_redirect_uri_fingerprint, p_return_path, p_reconnect_requested
  ) returning id into state_id_value;
  return state_id_value;
end;
$$;

create or replace function public.consume_ghl_marketplace_oauth_state_v2(
  p_state_hash text,
  p_organization_id uuid,
  p_initiated_by_user_id uuid,
  p_redirect_uri_fingerprint text,
  p_now timestamptz default timezone('utc', now())
)
returns table (
  result_outcome text,
  result_state_id uuid,
  result_installation_id uuid,
  result_location_mapping_id uuid,
  result_partner_id uuid,
  result_environment text,
  result_install_scope text,
  result_app_fingerprint text,
  result_account_fingerprint text,
  result_scope_fingerprint text,
  result_company_fingerprint text,
  result_location_fingerprint text,
  result_return_path text,
  result_reconnect_requested boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare state_record public.ghl_marketplace_oauth_states%rowtype;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into state_record from public.ghl_marketplace_oauth_states
  where state_hash = p_state_hash for update;
  if not found then
    return query select 'not_found',null::uuid,null::uuid,null::uuid,null::uuid,null::text,null::text,
      null::text,null::text,null::text,null::text,null::text,null::text,null::boolean;
    return;
  end if;
  if state_record.state_protection <> 'single_use_hash_cookie_binding'
    or state_record.status <> 'pending' then
    return query select 'replayed',state_record.id,null::uuid,null::uuid,null::uuid,null::text,null::text,
      null::text,null::text,null::text,null::text,null::text,null::text,null::boolean;
    return;
  end if;
  if state_record.expires_at <= p_now then
    update public.ghl_marketplace_oauth_states set status='expired' where id=state_record.id;
    return query select 'expired',state_record.id,null::uuid,null::uuid,null::uuid,null::text,null::text,
      null::text,null::text,null::text,null::text,null::text,null::text,null::boolean;
    return;
  end if;
  if state_record.organization_id <> p_organization_id
    or state_record.initiated_by_user_id <> p_initiated_by_user_id
    or state_record.redirect_uri_fingerprint <> p_redirect_uri_fingerprint then
    return query select 'binding_mismatch',state_record.id,null::uuid,null::uuid,null::uuid,null::text,null::text,
      null::text,null::text,null::text,null::text,null::text,null::text,null::boolean;
    return;
  end if;
  update public.ghl_marketplace_oauth_states
  set status='consumed', consumed_at=p_now
  where id=state_record.id and status='pending';
  if not found then
    return query select 'replayed',state_record.id,null::uuid,null::uuid,null::uuid,null::text,null::text,
      null::text,null::text,null::text,null::text,null::text,null::text,null::boolean;
    return;
  end if;
  return query select 'consumed',state_record.id,state_record.installation_id,
    state_record.location_mapping_id,state_record.partner_id,state_record.environment,
    state_record.install_scope,state_record.app_fingerprint,state_record.account_fingerprint,
    state_record.scope_fingerprint,state_record.company_fingerprint,state_record.location_fingerprint,
    state_record.return_path,state_record.reconnect_requested;
end;
$$;

create or replace function public.store_staged_ghl_marketplace_credential_v2(
  p_credential_ref text,
  p_oauth_state_id uuid,
  p_authority_id uuid,
  p_organization_id uuid,
  p_purpose text,
  p_encrypted_envelope jsonb,
  p_credential_fingerprint text,
  p_key_version integer,
  p_generation bigint,
  p_now timestamptz default timezone('utc', now())
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare credential_id_value uuid;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  if (p_oauth_state_id is null)::integer + (p_authority_id is null)::integer <> 1 then
    raise exception using errcode = '22023', message = 'ghl_marketplace_credential_binding_invalid';
  end if;
  if p_oauth_state_id is not null and not exists (
    select 1 from public.ghl_marketplace_oauth_states state
    where state.id=p_oauth_state_id and state.organization_id=p_organization_id and state.status='consumed'
  ) then raise exception using errcode='42501', message='ghl_marketplace_credential_state_mismatch'; end if;
  if p_authority_id is not null and not exists (
    select 1 from public.ghl_marketplace_authorities authority
    where authority.id=p_authority_id and authority.organization_id=p_organization_id
      and authority.status='active'
  ) then raise exception using errcode='42501', message='ghl_marketplace_credential_authority_mismatch'; end if;
  insert into public.ghl_marketplace_encrypted_credentials(
    credential_ref,oauth_state_id,authority_id,organization_id,purpose,encrypted_envelope,
    credential_fingerprint,key_version,generation,status,created_at
  ) values (
    p_credential_ref,p_oauth_state_id,p_authority_id,p_organization_id,p_purpose,p_encrypted_envelope,
    p_credential_fingerprint,p_key_version,p_generation,'staged',p_now
  ) returning id into credential_id_value;
  return credential_id_value;
end;
$$;

create or replace function public.resolve_ghl_marketplace_credential_v2(
  p_credential_ref text,
  p_authority_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare envelope_value jsonb;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select credential.encrypted_envelope into envelope_value
  from public.ghl_marketplace_encrypted_credentials credential
  join public.ghl_marketplace_authorities authority on authority.id=credential.authority_id
  where credential.credential_ref=p_credential_ref and credential.authority_id=p_authority_id
    and credential.status='active' and authority.status='active';
  if not found then raise exception using errcode='42501', message='ghl_marketplace_credential_not_active'; end if;
  return envelope_value;
end;
$$;

create or replace function public.store_staged_ghl_marketplace_credential_pair_v2(
  p_oauth_state_id uuid,
  p_authority_id uuid,
  p_organization_id uuid,
  p_access_credential_ref text,
  p_access_envelope jsonb,
  p_access_fingerprint text,
  p_refresh_credential_ref text,
  p_refresh_envelope jsonb,
  p_refresh_fingerprint text,
  p_key_version integer,
  p_generation bigint,
  p_now timestamptz default timezone('utc', now())
)
returns table (result_access_id uuid, result_refresh_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare access_id_value uuid; refresh_id_value uuid;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  access_id_value := public.store_staged_ghl_marketplace_credential_v2(
    p_access_credential_ref,p_oauth_state_id,p_authority_id,p_organization_id,'access',
    p_access_envelope,p_access_fingerprint,p_key_version,p_generation,p_now
  );
  refresh_id_value := public.store_staged_ghl_marketplace_credential_v2(
    p_refresh_credential_ref,p_oauth_state_id,p_authority_id,p_organization_id,'refresh',
    p_refresh_envelope,p_refresh_fingerprint,p_key_version,p_generation,p_now
  );
  return query select access_id_value,refresh_id_value;
end;
$$;

create or replace function public.finalize_ghl_marketplace_oauth_callback_v2(
  p_oauth_state_id uuid,
  p_access_credential_ref text,
  p_refresh_credential_ref text,
  p_token_account_fingerprint text,
  p_token_scope_fingerprint text,
  p_token_company_fingerprint text,
  p_token_location_fingerprint text,
  p_access_expires_at timestamptz,
  p_refresh_expires_at timestamptz,
  p_key_version integer,
  p_now timestamptz default timezone('utc', now())
)
returns table (result_outcome text, result_authority_id uuid, result_token_set_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_record public.ghl_marketplace_oauth_states%rowtype;
  prior_authority public.ghl_marketplace_authorities%rowtype;
  authority_id_value uuid;
  token_set_id_value uuid;
  staged_count integer;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into state_record from public.ghl_marketplace_oauth_states
  where id=p_oauth_state_id for update;
  if not found or state_record.state_protection <> 'single_use_hash_cookie_binding'
    or state_record.status <> 'consumed' or state_record.consumed_at is null then
    raise exception using errcode='42501', message='ghl_marketplace_callback_state_not_consumed';
  end if;
  if state_record.account_fingerprint <> p_token_account_fingerprint
    or state_record.scope_fingerprint <> p_token_scope_fingerprint
    or state_record.company_fingerprint <> p_token_company_fingerprint
    or state_record.location_fingerprint is distinct from p_token_location_fingerprint then
    raise exception using errcode='42501', message='ghl_marketplace_callback_token_binding_mismatch';
  end if;
  select count(*) into staged_count
  from public.ghl_marketplace_encrypted_credentials credential
  where credential.oauth_state_id=state_record.id and credential.organization_id=state_record.organization_id
    and credential.status='staged' and credential.key_version=p_key_version
    and credential.generation=1
    and ((credential.purpose='access' and credential.credential_ref=p_access_credential_ref)
      or (credential.purpose='refresh' and credential.credential_ref=p_refresh_credential_ref));
  if staged_count <> 2 then
    raise exception using errcode='42501', message='ghl_marketplace_callback_credentials_incomplete';
  end if;

  select * into prior_authority from public.ghl_marketplace_authorities prior
  where prior.environment=state_record.environment and prior.app_fingerprint=state_record.app_fingerprint
    and prior.account_fingerprint=state_record.account_fingerprint and prior.status <> 'uninstalled'
  for update;
  if found then
    if not state_record.reconnect_requested then
      return query select 'already_connected',prior_authority.id,null::uuid;
      return;
    end if;
    update public.ghl_marketplace_authorities set status='uninstalled',uninstalled_at=p_now,
      operator_blocker_code='ghl_reconnect_superseded',updated_at=p_now where id=prior_authority.id;
    update public.ghl_marketplace_token_sets set status='revoked',revoked_at=p_now,
      revocation_code='ghl_reconnect_superseded',refresh_claim_token=null,refresh_claimed_by=null,
      refresh_claimed_at=null,refresh_claim_expires_at=null,updated_at=p_now
    where authority_id=prior_authority.id and status <> 'revoked';
    update public.ghl_marketplace_encrypted_credentials set status='retired',retired_at=p_now
    where authority_id=prior_authority.id and status in ('active','staged');
  end if;

  authority_id_value := public.create_ghl_marketplace_authority_v1(
    state_record.installation_id,state_record.organization_id,state_record.location_mapping_id,
    state_record.partner_id,state_record.environment,state_record.install_scope,
    state_record.app_fingerprint,state_record.scope_fingerprint
  );
  update public.ghl_marketplace_authorities set status='active',installed_at=p_now,
    uninstalled_at=null,operator_blocker_code=null,updated_at=p_now where id=authority_id_value;
  token_set_id_value := public.store_initial_ghl_marketplace_token_set_v1(
    authority_id_value,state_record.install_scope,state_record.organization_id,
    state_record.location_mapping_id,state_record.partner_id,p_access_credential_ref,
    p_refresh_credential_ref,state_record.account_fingerprint,state_record.scope_fingerprint,
    p_access_expires_at,p_refresh_expires_at,p_key_version,p_now
  );
  update public.ghl_marketplace_encrypted_credentials set
    oauth_state_id=null,authority_id=authority_id_value,status='active',activated_at=p_now
  where oauth_state_id=state_record.id and status='staged'
    and credential_ref in (p_access_credential_ref,p_refresh_credential_ref);
  update public.ghl_marketplace_runtime_events event set
    authority_id=authority_id_value,organization_id=state_record.organization_id,
    location_mapping_id=state_record.location_mapping_id,partner_id=state_record.partner_id,
    outcome='reconciled',operator_blocker_code=null,reconciled_at=p_now
  where event.environment=state_record.environment and event.app_fingerprint=state_record.app_fingerprint
    and event.account_fingerprint=state_record.account_fingerprint and event.outcome='pending_authority'
    and event.company_fingerprint is not distinct from state_record.company_fingerprint
    and event.location_fingerprint is not distinct from state_record.location_fingerprint
    and event.event_type in ('INSTALL','UPDATE');
  update public.ghl_marketplace_runtime_events event set
    outcome='rejected',operator_blocker_code='ghl_marketplace_event_tenant_binding_mismatch',
    reconciled_at=p_now
  where event.environment=state_record.environment and event.app_fingerprint=state_record.app_fingerprint
    and event.account_fingerprint=state_record.account_fingerprint and event.outcome='pending_authority'
    and (
      event.company_fingerprint is distinct from state_record.company_fingerprint
      or event.location_fingerprint is distinct from state_record.location_fingerprint
    )
    and event.event_type in ('INSTALL','UPDATE');
  return query select 'finalized',authority_id_value,token_set_id_value;
end;
$$;

create or replace function public.settle_ghl_marketplace_token_refresh_encrypted_v2(
  p_token_set_id uuid,
  p_claim_token uuid,
  p_expected_generation bigint,
  p_access_credential_ref text,
  p_refresh_credential_ref text,
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
  settle_outcome text;
  settle_generation bigint;
  staged_count integer;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into token_record from public.ghl_marketplace_token_sets where id=p_token_set_id for update;
  if not found then return query select 'not_found',null::bigint; return; end if;
  select count(*) into staged_count from public.ghl_marketplace_encrypted_credentials credential
  where credential.authority_id=token_record.authority_id and credential.status='staged'
    and credential.generation=p_expected_generation+1 and credential.key_version=p_key_version
    and ((credential.purpose='access' and credential.credential_ref=p_access_credential_ref)
      or (credential.purpose='refresh' and credential.credential_ref=p_refresh_credential_ref));
  if staged_count <> 2 then
    raise exception using errcode='42501', message='ghl_marketplace_refresh_credentials_incomplete';
  end if;
  select settlement.result_outcome,settlement.result_generation
  into settle_outcome,settle_generation
  from public.settle_ghl_marketplace_token_refresh_v1(
    p_token_set_id,p_claim_token,p_expected_generation,p_access_credential_ref,p_refresh_credential_ref,
    p_account_fingerprint,p_scope_fingerprint,p_access_expires_at,p_refresh_expires_at,
    p_key_version,p_outcome_fingerprint,p_now
  ) settlement;
  if settle_outcome='settled' then
    update public.ghl_marketplace_encrypted_credentials set status='retired',retired_at=p_now
    where authority_id=token_record.authority_id and status='active'
      and credential_ref in (
        token_record.encrypted_access_credential_ref,
        token_record.encrypted_refresh_credential_ref
      );
    update public.ghl_marketplace_encrypted_credentials set status='active',activated_at=p_now
    where authority_id=token_record.authority_id and status='staged'
      and credential_ref in (p_access_credential_ref,p_refresh_credential_ref);
  else
    update public.ghl_marketplace_encrypted_credentials set status='revoked',retired_at=p_now
    where authority_id=token_record.authority_id and status='staged'
      and credential_ref in (p_access_credential_ref,p_refresh_credential_ref);
  end if;
  return query select settle_outcome,settle_generation;
end;
$$;

create or replace function public.mark_ghl_marketplace_token_refresh_ambiguous_v2(
  p_token_set_id uuid,
  p_claim_token uuid,
  p_expected_generation bigint,
  p_now timestamptz default timezone('utc', now())
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare token_record public.ghl_marketplace_token_sets%rowtype;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into token_record from public.ghl_marketplace_token_sets where id=p_token_set_id for update;
  if not found then return 'not_found'; end if;
  if token_record.generation <> p_expected_generation then return 'stale_generation'; end if;
  if token_record.status <> 'refreshing' or token_record.refresh_claim_token is distinct from p_claim_token then
    return 'stale_claim';
  end if;
  update public.ghl_marketplace_token_sets set status='operator_required',
    operator_blocker_code='ghl_rotating_refresh_outcome_ambiguous',refresh_claim_token=null,
    refresh_claimed_by=null,refresh_claimed_at=null,refresh_claim_expires_at=null,updated_at=p_now
  where id=p_token_set_id;
  insert into public.ghl_marketplace_token_events(
    token_set_id,organization_id,event_type,generation,account_fingerprint,scope_fingerprint,
    key_version,outcome_fingerprint,recorded_at
  ) values (
    token_record.id,token_record.organization_id,'ambiguous',token_record.generation,
    token_record.account_fingerprint,token_record.scope_fingerprint,token_record.key_version,
    private.ghl_marketplace_fingerprint_v1('ghl_rotating_refresh_outcome_ambiguous'),p_now
  );
  return 'operator_required';
end;
$$;

-- A provider-confirmed 4xx means the current rotating refresh credential is
-- unusable. It is not safe to leave the token set leased for another blind
-- attempt: retire both encrypted credentials, revoke the token set, and append
-- one immutable reconnect-required receipt under the exact claim CAS.
create or replace function public.mark_ghl_marketplace_token_refresh_reconnect_required_v2(
  p_token_set_id uuid,
  p_claim_token uuid,
  p_expected_generation bigint,
  p_failure_code text,
  p_now timestamptz default timezone('utc', now())
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare token_record public.ghl_marketplace_token_sets%rowtype;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  if p_failure_code not in (
    'ghl_refresh_token_invalid',
    'ghl_location_inactive',
    'ghl_oauth_credential_rejected',
    'ghl_oauth_provider_rejected',
    'ghl_oauth_response_too_large'
  ) then
    raise exception using errcode='22023',
      message='ghl_marketplace_refresh_terminal_failure_code_invalid';
  end if;
  select * into token_record
  from public.ghl_marketplace_token_sets
  where id=p_token_set_id
  for update;
  if not found then return 'not_found'; end if;
  if token_record.generation <> p_expected_generation then return 'stale_generation'; end if;
  if token_record.status = 'revoked'
    and token_record.revocation_code = 'ghl_refresh_reconnect_required' then
    return 'reconnect_required';
  end if;
  if token_record.status <> 'refreshing'
    or token_record.refresh_claim_token is distinct from p_claim_token then
    return 'stale_claim';
  end if;

  update public.ghl_marketplace_encrypted_credentials credential
  set status='revoked', retired_at=p_now
  where credential.authority_id=token_record.authority_id
    and credential.status='active'
    and credential.credential_ref in (
      token_record.encrypted_access_credential_ref,
      token_record.encrypted_refresh_credential_ref
    );
  update public.ghl_marketplace_token_sets
  set status='revoked', revoked_at=p_now,
    revocation_code='ghl_refresh_reconnect_required',
    operator_blocker_code=p_failure_code,
    refresh_claim_token=null, refresh_claimed_by=null,
    refresh_claimed_at=null, refresh_claim_expires_at=null, updated_at=p_now
  where id=p_token_set_id;
  insert into public.ghl_marketplace_token_events(
    token_set_id,organization_id,event_type,generation,account_fingerprint,
    scope_fingerprint,key_version,outcome_fingerprint,recorded_at
  ) values (
    token_record.id,token_record.organization_id,'revoked',token_record.generation,
    token_record.account_fingerprint,token_record.scope_fingerprint,
    token_record.key_version,
    private.ghl_marketplace_fingerprint_v1(
      'ghl_refresh_reconnect_required:' || p_failure_code
    ),p_now
  );
  return 'reconnect_required';
end;
$$;

-- A provider-confirmed 429/5xx happens before any rotating token response.
-- Release only the exact live claim back to active so normal bounded worker
-- scheduling can retry later; record the release append-only for auditability.
alter table public.ghl_marketplace_token_events
  drop constraint if exists ghl_marketplace_token_events_type_check;
alter table public.ghl_marketplace_token_events
  add constraint ghl_marketplace_token_events_type_check
  check (event_type in (
    'created','refreshed','revoked','ambiguous','operator_required','retry_released'
  ));

create or replace function public.release_ghl_marketplace_token_refresh_retry_v2(
  p_token_set_id uuid,
  p_claim_token uuid,
  p_expected_generation bigint,
  p_failure_code text,
  p_now timestamptz default timezone('utc', now())
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare token_record public.ghl_marketplace_token_sets%rowtype;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  if p_failure_code not in (
    'ghl_oauth_rate_limited',
    'ghl_oauth_provider_unavailable'
  ) then
    raise exception using errcode='22023',
      message='ghl_marketplace_refresh_retry_failure_code_invalid';
  end if;
  select * into token_record
  from public.ghl_marketplace_token_sets
  where id=p_token_set_id
  for update;
  if not found then return 'not_found'; end if;
  if token_record.generation <> p_expected_generation then return 'stale_generation'; end if;
  if token_record.status <> 'refreshing'
    or token_record.refresh_claim_token is distinct from p_claim_token then
    return 'stale_claim';
  end if;
  update public.ghl_marketplace_token_sets
  set status='active', refresh_claim_token=null, refresh_claimed_by=null,
    refresh_claimed_at=null, refresh_claim_expires_at=null,
    operator_blocker_code=null, updated_at=p_now
  where id=p_token_set_id;
  insert into public.ghl_marketplace_token_events(
    token_set_id,organization_id,event_type,generation,account_fingerprint,
    scope_fingerprint,key_version,outcome_fingerprint,recorded_at
  ) values (
    token_record.id,token_record.organization_id,'retry_released',
    token_record.generation,token_record.account_fingerprint,
    token_record.scope_fingerprint,token_record.key_version,
    private.ghl_marketplace_fingerprint_v1(
      'ghl_refresh_retry_released:' || p_failure_code
    ),p_now
  );
  return 'retry_released';
end;
$$;

-- The original request contract was installation-bound but allowed a direct
-- company authority to nominate another direct workspace on the same
-- installation. V2 closes that tenant-confusion path before creating or
-- returning an idempotent exchange receipt.
create or replace function public.request_ghl_marketplace_location_token_exchange_v2(
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
  token_record public.ghl_marketplace_token_sets%rowtype;
  authority_record public.ghl_marketplace_authorities%rowtype;
  mapping_record public.ghl_location_mappings%rowtype;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into token_record from public.ghl_marketplace_token_sets
  where id=p_company_token_set_id for update;
  if not found or token_record.subject_kind <> 'company'
    or token_record.organization_id is distinct from p_organization_id
    or token_record.partner_id is distinct from p_partner_id then
    raise exception using errcode='42501', message='ghl_marketplace_company_token_tenant_mismatch';
  end if;
  select * into authority_record from public.ghl_marketplace_authorities
  where id=token_record.authority_id for update;
  if not found or authority_record.organization_id is distinct from p_organization_id
    or authority_record.partner_id is distinct from p_partner_id
    or authority_record.install_scope <> 'company' or authority_record.status <> 'active' then
    raise exception using errcode='42501', message='ghl_marketplace_company_authority_tenant_mismatch';
  end if;
  select * into mapping_record from public.ghl_location_mappings
  where id=p_location_mapping_id and organization_id=p_organization_id
    and installation_id=authority_record.installation_id
    and environment=authority_record.environment and status='active'
    and partner_id is not distinct from p_partner_id for update;
  if not found then
    raise exception using errcode='42501', message='ghl_marketplace_location_exchange_tenant_mismatch';
  end if;
  return public.request_ghl_marketplace_location_token_exchange_v1(
    p_company_token_set_id,p_organization_id,p_location_mapping_id,p_partner_id,
    p_request_fingerprint,p_idempotency_key,p_now
  );
end;
$$;

create or replace function public.settle_ghl_marketplace_location_exchange_encrypted_v2(
  p_exchange_id uuid,
  p_outcome text,
  p_access_credential_ref text,
  p_refresh_credential_ref text,
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
  settle_outcome text;
  token_set_id_value uuid;
  staged_count integer;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into exchange_record from public.ghl_marketplace_location_token_exchanges
  where id=p_exchange_id for update;
  if not found then return query select 'not_found',null::uuid; return; end if;
  if p_outcome='succeeded' then
    select count(*) into staged_count from public.ghl_marketplace_encrypted_credentials credential
    where credential.authority_id=exchange_record.authority_id and credential.status='staged'
      and credential.generation=1 and credential.key_version=p_key_version
      and ((credential.purpose='access' and credential.credential_ref=p_access_credential_ref)
        or (credential.purpose='refresh' and credential.credential_ref=p_refresh_credential_ref));
    if staged_count <> 2 then
      raise exception using errcode='42501', message='ghl_marketplace_location_credentials_incomplete';
    end if;
  end if;
  select settlement.result_outcome,settlement.result_token_set_id
  into settle_outcome,token_set_id_value
  from public.settle_ghl_marketplace_location_token_exchange_v1(
    p_exchange_id,p_outcome,p_access_credential_ref,p_refresh_credential_ref,
    p_access_expires_at,p_refresh_expires_at,p_key_version,p_now
  ) settlement;
  if settle_outcome='succeeded' then
    update public.ghl_marketplace_encrypted_credentials set status='active',activated_at=p_now
    where authority_id=exchange_record.authority_id and status='staged'
      and credential_ref in (p_access_credential_ref,p_refresh_credential_ref);
  elsif p_outcome <> 'succeeded' then
    update public.ghl_marketplace_encrypted_credentials set status='revoked',retired_at=p_now
    where authority_id=exchange_record.authority_id and status='staged'
      and credential_ref in (p_access_credential_ref,p_refresh_credential_ref);
  end if;
  return query select settle_outcome,token_set_id_value;
end;
$$;

create or replace function public.ingest_ghl_marketplace_runtime_event_v2(
  p_environment text,
  p_event_type text,
  p_event_fingerprint text,
  p_payload_fingerprint text,
  p_app_fingerprint text,
  p_company_fingerprint text,
  p_location_fingerprint text,
  p_account_fingerprint text,
  p_user_fingerprint text,
  p_email_fingerprint text,
  p_raw_user_email text,
  p_identifiers_complete boolean,
  p_provider_occurred_at timestamptz,
  p_received_at timestamptz default timezone('utc', now())
)
returns table (result_outcome text, result_event_id uuid, result_authority_id uuid, result_organization_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.ghl_marketplace_runtime_events%rowtype;
  authority public.ghl_marketplace_authorities%rowtype;
  mapping public.ghl_location_mappings%rowtype;
  event_id_value uuid;
  outcome_value text;
  blocker_value text;
  authority_count integer;
  authority_id_value uuid;
  user_count integer;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into existing from public.ghl_marketplace_runtime_events
  where environment=p_environment and app_fingerprint=p_app_fingerprint
    and event_fingerprint=p_event_fingerprint for update;
  if found then
    if existing.event_type is distinct from p_event_type
      or existing.payload_fingerprint is distinct from p_payload_fingerprint
      or existing.company_fingerprint is distinct from p_company_fingerprint
      or existing.location_fingerprint is distinct from p_location_fingerprint
      or existing.account_fingerprint is distinct from p_account_fingerprint
      or existing.user_fingerprint is distinct from p_user_fingerprint
      or existing.email_fingerprint is distinct from p_email_fingerprint then
      raise exception using errcode='23505', message='ghl_marketplace_runtime_event_identity_collision';
    end if;
    return query select 'duplicate',existing.id,existing.authority_id,existing.organization_id;
    return;
  end if;
  if not p_identifiers_complete or p_account_fingerprint is null then
    outcome_value := 'operator_required'; blocker_value := 'ghl_marketplace_event_identifiers_incomplete';
  else
    select count(*),(array_agg(candidate.id order by candidate.id))[1]
    into authority_count,authority_id_value
    from public.ghl_marketplace_authorities candidate
    where candidate.environment=p_environment and candidate.app_fingerprint=p_app_fingerprint
      and candidate.status <> 'uninstalled'
      and (
        candidate.account_fingerprint=p_account_fingerprint
        or (
          candidate.install_scope='company' and p_location_fingerprint is not null
          and exists (
            select 1 from public.ghl_location_mappings location
            where location.installation_id=candidate.installation_id
              and location.environment=candidate.environment and location.status='active'
              and location.organization_id=candidate.organization_id
              and location.partner_id is not distinct from candidate.partner_id
              and private.ghl_marketplace_fingerprint_v1(location.provider_location_id)=p_location_fingerprint
          )
        )
      );
    if authority_count = 0 then
      if p_event_type in ('INSTALL','UPDATE') then outcome_value := 'pending_authority';
      else outcome_value := 'operator_required'; blocker_value := 'ghl_marketplace_event_authority_not_found'; end if;
    elsif authority_count <> 1 then
      outcome_value := 'operator_required'; blocker_value := 'ghl_marketplace_event_authority_ambiguous';
    else
      select * into authority from public.ghl_marketplace_authorities
      where id=authority_id_value for update;
      if authority.company_fingerprint is distinct from coalesce(p_company_fingerprint,authority.company_fingerprint)
        or (authority.install_scope='location'
          and authority.location_fingerprint is distinct from p_location_fingerprint) then
        outcome_value := 'rejected'; blocker_value := 'ghl_marketplace_event_tenant_binding_mismatch';
      elsif p_event_type in ('INSTALL','UNINSTALL') then
        outcome_value := public.record_ghl_marketplace_lifecycle_v1(
          authority.id,authority.organization_id,authority.partner_id,p_event_type,p_event_fingerprint,
          p_app_fingerprint,authority.company_fingerprint,authority.location_fingerprint,
          authority.account_fingerprint,true,p_received_at
        );
        if outcome_value = 'duplicate' then outcome_value := 'reconciled';
        elsif outcome_value <> 'applied' then blocker_value := 'ghl_marketplace_app_lifecycle_not_applied'; end if;
        if p_event_type='UNINSTALL' and outcome_value='applied' then
          update public.ghl_marketplace_encrypted_credentials credential
          set status='revoked',retired_at=p_received_at
          where credential.authority_id=authority.id and credential.status in ('active','staged');
        end if;
      elsif p_event_type in ('UPDATE','LocationCreate','LocationUpdate') then
        outcome_value := 'reconciled';
      else
        if authority.organization_id is null or authority.partner_id is null or p_user_fingerprint is null then
          outcome_value := 'operator_required'; blocker_value := 'ghl_marketplace_user_tenant_binding_unavailable';
        else
          if authority.location_mapping_id is not null then
            select * into mapping from public.ghl_location_mappings where id=authority.location_mapping_id;
          else
            select * into mapping from public.ghl_location_mappings candidate
            where candidate.installation_id=authority.installation_id
              and candidate.organization_id=authority.organization_id
              and candidate.partner_id=authority.partner_id
              and candidate.environment=authority.environment
              and private.ghl_marketplace_fingerprint_v1(candidate.provider_location_id)=p_location_fingerprint;
          end if;
          if not found then
            outcome_value := 'operator_required'; blocker_value := 'ghl_marketplace_user_location_unbound';
          elsif p_event_type='UserDelete' then
            select count(*) into user_count from public.workspace_ghl_users target
            where target.workspace_id=authority.organization_id and target.partner_id=authority.partner_id
              and target.ghl_location_id=mapping.provider_location_id and target.ghl_user_id is not null
              and private.ghl_marketplace_fingerprint_v1(target.ghl_user_id)=p_user_fingerprint;
            if user_count=1 then
              update public.workspace_ghl_users target set ghl_user_id=null,invite_status='not_invited',updated_at=p_received_at
              where target.workspace_id=authority.organization_id and target.partner_id=authority.partner_id
                and target.ghl_location_id=mapping.provider_location_id and target.ghl_user_id is not null
                and private.ghl_marketplace_fingerprint_v1(target.ghl_user_id)=p_user_fingerprint;
              outcome_value := 'applied';
            else outcome_value := 'operator_required'; blocker_value := 'ghl_marketplace_user_delete_ambiguous'; end if;
          else
            if p_raw_user_email is null or lower(btrim(p_raw_user_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
              or private.ghl_marketplace_fingerprint_v1(lower(btrim(p_raw_user_email))) <> p_email_fingerprint then
              outcome_value := 'rejected'; blocker_value := 'ghl_marketplace_user_email_invalid';
            else
              select count(*) into user_count from public.workspace_ghl_users target
              where target.workspace_id=authority.organization_id and target.partner_id=authority.partner_id
                and target.ghl_location_id=mapping.provider_location_id
                and lower(target.email)=lower(btrim(p_raw_user_email));
              if user_count=1 and not exists (
                select 1 from public.workspace_ghl_users target
                where target.workspace_id=authority.organization_id and target.partner_id=authority.partner_id
                  and target.ghl_location_id=mapping.provider_location_id
                  and lower(target.email)=lower(btrim(p_raw_user_email)) and target.ghl_user_id is not null
                  and private.ghl_marketplace_fingerprint_v1(target.ghl_user_id) <> p_user_fingerprint
              ) then
                -- Raw provider user IDs are deliberately not reconstructed from fingerprints.
                -- Existing matching IDs can be confirmed; new IDs require the outbound operation receipt.
                if exists (
                  select 1 from public.workspace_ghl_users target
                  where target.workspace_id=authority.organization_id and target.partner_id=authority.partner_id
                    and target.ghl_location_id=mapping.provider_location_id
                    and lower(target.email)=lower(btrim(p_raw_user_email)) and target.ghl_user_id is not null
                    and private.ghl_marketplace_fingerprint_v1(target.ghl_user_id)=p_user_fingerprint
                ) then outcome_value := 'reconciled';
                else outcome_value := 'operator_required'; blocker_value := 'ghl_marketplace_user_id_requires_outbound_receipt'; end if;
              else outcome_value := 'operator_required'; blocker_value := 'ghl_marketplace_user_update_ambiguous'; end if;
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;
  insert into public.ghl_marketplace_runtime_events(
    environment,authority_id,organization_id,location_mapping_id,partner_id,event_type,
    event_fingerprint,payload_fingerprint,app_fingerprint,company_fingerprint,location_fingerprint,
    account_fingerprint,user_fingerprint,email_fingerprint,identifiers_complete,outcome,
    operator_blocker_code,provider_occurred_at,received_at,reconciled_at
  ) values (
    p_environment,authority.id,authority.organization_id,mapping.id,authority.partner_id,p_event_type,
    p_event_fingerprint,p_payload_fingerprint,p_app_fingerprint,p_company_fingerprint,p_location_fingerprint,
    p_account_fingerprint,p_user_fingerprint,p_email_fingerprint,p_identifiers_complete,outcome_value,
    blocker_value,p_provider_occurred_at,p_received_at,
    case when outcome_value='pending_authority' then null else p_received_at end
  ) returning id into event_id_value;
  return query select outcome_value,event_id_value,authority.id,authority.organization_id;
end;
$$;

-- The OAuth-state guard must cover the new immutable runtime bindings.
create or replace function private.guard_ghl_marketplace_oauth_state_update_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.organization_id is distinct from new.organization_id
    or old.initiated_by_user_id is distinct from new.initiated_by_user_id
    or old.partner_id is distinct from new.partner_id or old.environment is distinct from new.environment
    or old.state_hash is distinct from new.state_hash or old.pkce_challenge is distinct from new.pkce_challenge
    or old.pkce_method is distinct from new.pkce_method
    or old.encrypted_pkce_verifier_ref is distinct from new.encrypted_pkce_verifier_ref
    or old.app_fingerprint is distinct from new.app_fingerprint
    or old.account_fingerprint is distinct from new.account_fingerprint
    or old.scope_fingerprint is distinct from new.scope_fingerprint
    or old.company_fingerprint is distinct from new.company_fingerprint
    or old.location_fingerprint is distinct from new.location_fingerprint
    or old.expires_at is distinct from new.expires_at or old.created_at is distinct from new.created_at
    or old.installation_id is distinct from new.installation_id
    or old.location_mapping_id is distinct from new.location_mapping_id
    or old.install_scope is distinct from new.install_scope
    or old.state_protection is distinct from new.state_protection
    or old.redirect_uri_fingerprint is distinct from new.redirect_uri_fingerprint
    or old.return_path is distinct from new.return_path
    or old.reconnect_requested is distinct from new.reconnect_requested then
    raise exception using errcode='42501', message='ghl_marketplace_oauth_state_binding_is_immutable';
  end if;
  if old.status <> 'pending' or new.status not in ('consumed','expired','rejected') then
    raise exception using errcode='42501', message='ghl_marketplace_oauth_state_transition_invalid';
  end if;
  return new;
end;
$$;

alter table public.ghl_marketplace_encrypted_credentials enable row level security;
alter table public.ghl_marketplace_encrypted_credentials force row level security;
alter table public.ghl_marketplace_runtime_events enable row level security;
alter table public.ghl_marketplace_runtime_events force row level security;
revoke all on table public.ghl_marketplace_encrypted_credentials from public,anon,authenticated,service_role;
revoke all on table public.ghl_marketplace_runtime_events from public,anon,authenticated,service_role;
grant select on table public.ghl_marketplace_encrypted_credentials to service_role;
grant select on table public.ghl_marketplace_runtime_events to service_role;

revoke all on function public.create_ghl_marketplace_oauth_state_v2(uuid,uuid,uuid,text,text,uuid,uuid,text,text,text,text,text,text,text,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.create_ghl_marketplace_oauth_state_v2(uuid,uuid,uuid,text,text,uuid,uuid,text,text,text,text,text,text,text,text,boolean,timestamptz) to service_role;
revoke all on function public.consume_ghl_marketplace_oauth_state_v2(text,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.consume_ghl_marketplace_oauth_state_v2(text,uuid,uuid,text,timestamptz) to service_role;
revoke all on function public.store_staged_ghl_marketplace_credential_v2(text,uuid,uuid,uuid,text,jsonb,text,integer,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.store_staged_ghl_marketplace_credential_v2(text,uuid,uuid,uuid,text,jsonb,text,integer,bigint,timestamptz) to service_role;
revoke all on function public.resolve_ghl_marketplace_credential_v2(text,uuid) from public,anon,authenticated;
grant execute on function public.resolve_ghl_marketplace_credential_v2(text,uuid) to service_role;
revoke all on function public.store_staged_ghl_marketplace_credential_pair_v2(uuid,uuid,uuid,text,jsonb,text,text,jsonb,text,integer,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.store_staged_ghl_marketplace_credential_pair_v2(uuid,uuid,uuid,text,jsonb,text,text,jsonb,text,integer,bigint,timestamptz) to service_role;
revoke all on function public.finalize_ghl_marketplace_oauth_callback_v2(uuid,text,text,text,text,text,text,timestamptz,timestamptz,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.finalize_ghl_marketplace_oauth_callback_v2(uuid,text,text,text,text,text,text,timestamptz,timestamptz,integer,timestamptz) to service_role;
revoke all on function public.settle_ghl_marketplace_token_refresh_encrypted_v2(uuid,uuid,bigint,text,text,text,text,timestamptz,timestamptz,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.settle_ghl_marketplace_token_refresh_encrypted_v2(uuid,uuid,bigint,text,text,text,text,timestamptz,timestamptz,integer,text,timestamptz) to service_role;
revoke all on function public.mark_ghl_marketplace_token_refresh_ambiguous_v2(uuid,uuid,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.mark_ghl_marketplace_token_refresh_ambiguous_v2(uuid,uuid,bigint,timestamptz) to service_role;
revoke all on function public.mark_ghl_marketplace_token_refresh_reconnect_required_v2(uuid,uuid,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.mark_ghl_marketplace_token_refresh_reconnect_required_v2(uuid,uuid,bigint,text,timestamptz) to service_role;
revoke all on function public.release_ghl_marketplace_token_refresh_retry_v2(uuid,uuid,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.release_ghl_marketplace_token_refresh_retry_v2(uuid,uuid,bigint,text,timestamptz) to service_role;
revoke all on function public.request_ghl_marketplace_location_token_exchange_v2(uuid,uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.request_ghl_marketplace_location_token_exchange_v2(uuid,uuid,uuid,uuid,text,text,timestamptz) to service_role;
revoke all on function public.settle_ghl_marketplace_location_exchange_encrypted_v2(uuid,text,text,text,timestamptz,timestamptz,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.settle_ghl_marketplace_location_exchange_encrypted_v2(uuid,text,text,text,timestamptz,timestamptz,integer,timestamptz) to service_role;
revoke all on function public.ingest_ghl_marketplace_runtime_event_v2(text,text,text,text,text,text,text,text,text,text,text,boolean,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.ingest_ghl_marketplace_runtime_event_v2(text,text,text,text,text,text,text,text,text,text,text,boolean,timestamptz,timestamptz) to service_role;

insert into public.account_deletion_data_inventory(
  resource_kind,relation_schema,relation_name,scope_column,disposition,retention_class,executor_task,pii_columns
) values
  ('table','public','ghl_marketplace_encrypted_credentials','organization_id','provider_detach','immediate','delete_operational_data',array['encrypted_envelope']::text[]),
  ('table','public','ghl_marketplace_runtime_events','organization_id','provider_detach','immediate','delete_operational_data','{}'::text[])
on conflict (resource_kind,relation_schema,relation_name) do update set
  scope_column=excluded.scope_column,disposition=excluded.disposition,retention_class=excluded.retention_class,
  executor_task=excluded.executor_task,pii_columns=excluded.pii_columns,classified_at=timezone('utc',now());
