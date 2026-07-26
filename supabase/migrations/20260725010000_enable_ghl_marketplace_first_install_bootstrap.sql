-- Break the first-install circular dependency without weakening readiness.
--
-- A verified HighLevel embed context may create a short-lived, hash-bound
-- claim. An authenticated DealFlow workspace owner/admin may consume that
-- claim exactly once to create an active provider installation and a
-- PROVISIONING location mapping. The mapping cannot become active until the
-- existing snapshot and required-object readiness constraints are satisfied.

create table if not exists public.ghl_marketplace_embed_bootstrap_claims (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  partner_id uuid null references public.partners(id) on delete restrict,
  app_fingerprint text not null,
  company_fingerprint text not null,
  location_fingerprint text not null,
  user_fingerprint text not null,
  email_fingerprint text not null,
  parent_origin_fingerprint text not null,
  payload_fingerprint text not null,
  provider_company_id text not null,
  provider_location_id text not null,
  provider_user_id text not null,
  status text not null default 'pending',
  claimed_organization_id uuid null
    references public.ghl_workspace_tenants(organization_id) on delete cascade,
  claimed_by_user_id uuid null references auth.users(id) on delete cascade,
  installation_id uuid null,
  location_mapping_id uuid null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_marketplace_embed_bootstrap_claims_environment_check
    check (environment in ('production','sandbox','test')),
  constraint ghl_marketplace_embed_bootstrap_claims_provider_id_check
    check (
      provider_company_id ~ '^[A-Za-z0-9_-]{3,160}$'
      and provider_location_id ~ '^[A-Za-z0-9_-]{3,160}$'
      and provider_user_id ~ '^[A-Za-z0-9_-]{3,160}$'
    ),
  constraint ghl_marketplace_embed_bootstrap_claims_fingerprint_check
    check (
      app_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and company_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and location_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and user_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and email_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and parent_origin_fingerprint ~ '^sha256:[a-f0-9]{64}$'
      and payload_fingerprint ~ '^sha256:[a-f0-9]{64}$'
    ),
  constraint ghl_marketplace_embed_bootstrap_claims_status_check
    check (status in ('pending','consumed','expired','rejected')),
  constraint ghl_marketplace_embed_bootstrap_claims_state_check
    check (
      (
        status = 'pending'
        and claimed_organization_id is null
        and claimed_by_user_id is null
        and installation_id is null
        and location_mapping_id is null
        and consumed_at is null
      )
      or (
        status = 'consumed'
        and claimed_organization_id is not null
        and claimed_by_user_id is not null
        and installation_id is not null
        and location_mapping_id is not null
        and consumed_at is not null
      )
      or (
        status in ('expired','rejected')
        and consumed_at is null
      )
    ),
  constraint ghl_marketplace_embed_bootstrap_claims_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  constraint ghl_marketplace_embed_bootstrap_claims_installation_environment_fk
    foreign key (installation_id, environment)
    references public.ghl_installations(id, environment) on delete restrict,
  constraint ghl_marketplace_embed_bootstrap_claims_mapping_tenant_fk
    foreign key (location_mapping_id, claimed_organization_id)
    references public.ghl_location_mappings(id, organization_id) on delete restrict,
  unique(environment, app_fingerprint, payload_fingerprint)
);

comment on table public.ghl_marketplace_embed_bootstrap_claims is
  'Service-only, short-lived first-install receipts. Raw provider ids are never returned by read APIs; user email is stored only as a fingerprint.';

create unique index if not exists ghl_marketplace_embed_bootstrap_pending_location_unique
  on public.ghl_marketplace_embed_bootstrap_claims(
    environment, app_fingerprint, location_fingerprint
  )
  where status = 'pending';

create index if not exists ghl_marketplace_embed_bootstrap_expiry_idx
  on public.ghl_marketplace_embed_bootstrap_claims(expires_at)
  where status = 'pending';

create or replace function public.register_ghl_marketplace_embed_bootstrap_claim_v1(
  p_environment text,
  p_partner_id uuid,
  p_app_fingerprint text,
  p_company_fingerprint text,
  p_location_fingerprint text,
  p_user_fingerprint text,
  p_email_fingerprint text,
  p_parent_origin_fingerprint text,
  p_payload_fingerprint text,
  p_provider_company_id text,
  p_provider_location_id text,
  p_provider_user_id text,
  p_expires_at timestamptz,
  p_now timestamptz default timezone('utc', now())
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_id uuid;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  if p_environment not in ('production','sandbox','test')
    or p_expires_at <= p_now
    or p_expires_at > p_now + interval '10 minutes' then
    raise exception using errcode='22023', message='ghl_marketplace_bootstrap_claim_invalid';
  end if;
  if private.ghl_marketplace_fingerprint_v1(p_provider_company_id) <> p_company_fingerprint
    or private.ghl_marketplace_fingerprint_v1(p_provider_location_id) <> p_location_fingerprint
    or private.ghl_marketplace_fingerprint_v1(p_provider_user_id) <> p_user_fingerprint then
    raise exception using errcode='42501', message='ghl_marketplace_bootstrap_provider_binding_mismatch';
  end if;

  update public.ghl_marketplace_embed_bootstrap_claims
     set status='expired', updated_at=p_now
   where status='pending' and expires_at <= p_now;

  select id into claim_id
  from public.ghl_marketplace_embed_bootstrap_claims
  where environment=p_environment
    and app_fingerprint=p_app_fingerprint
    and payload_fingerprint=p_payload_fingerprint
    and status='pending'
    and expires_at > p_now
  for update;
  if found then return claim_id; end if;

  insert into public.ghl_marketplace_embed_bootstrap_claims(
    environment,partner_id,app_fingerprint,company_fingerprint,
    location_fingerprint,user_fingerprint,email_fingerprint,
    parent_origin_fingerprint,payload_fingerprint,provider_company_id,
    provider_location_id,provider_user_id,expires_at,created_at,updated_at
  ) values (
    p_environment,p_partner_id,p_app_fingerprint,p_company_fingerprint,
    p_location_fingerprint,p_user_fingerprint,p_email_fingerprint,
    p_parent_origin_fingerprint,p_payload_fingerprint,p_provider_company_id,
    p_provider_location_id,p_provider_user_id,p_expires_at,p_now,p_now
  )
  returning id into claim_id;
  return claim_id;
exception
  when unique_violation then
    select id into claim_id
    from public.ghl_marketplace_embed_bootstrap_claims
    where environment=p_environment
      and app_fingerprint=p_app_fingerprint
      and location_fingerprint=p_location_fingerprint
      and status='pending'
      and expires_at > p_now;
    if claim_id is null then raise; end if;
    return claim_id;
end;
$$;

create or replace function public.consume_ghl_marketplace_embed_bootstrap_claim_v1(
  p_claim_id uuid,
  p_payload_fingerprint text,
  p_organization_id uuid,
  p_user_id uuid,
  p_now timestamptz default timezone('utc', now())
)
returns table (
  result_installation_id uuid,
  result_location_mapping_id uuid,
  result_partner_id uuid,
  result_provider_company_id text,
  result_provider_location_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.ghl_marketplace_embed_bootstrap_claims%rowtype;
  tenant public.ghl_workspace_tenants%rowtype;
  installation public.ghl_installations%rowtype;
  mapping public.ghl_location_mappings%rowtype;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into claim
  from public.ghl_marketplace_embed_bootstrap_claims
  where id=p_claim_id
  for update;
  if not found
    or claim.status <> 'pending'
    or claim.expires_at <= p_now
    or claim.payload_fingerprint <> p_payload_fingerprint then
    raise exception using errcode='42501', message='ghl_marketplace_bootstrap_claim_unavailable';
  end if;

  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id=p_organization_id
      and membership.user_id=p_user_id
      and membership.role in ('owner','admin')
  ) then
    raise exception using errcode='42501', message='ghl_marketplace_bootstrap_admin_required';
  end if;

  select * into tenant from public.ghl_workspace_tenants
  where organization_id=p_organization_id and status='active';
  if not found or tenant.partner_id is distinct from claim.partner_id then
    raise exception using errcode='42501', message='ghl_marketplace_bootstrap_tenant_mismatch';
  end if;

  select * into installation
  from public.ghl_installations
  where environment=claim.environment
    and provider_agency_id=claim.provider_company_id
    and status='active'
  for update;
  if found then
    if installation.partner_id is distinct from claim.partner_id then
      raise exception using errcode='23505', message='ghl_marketplace_bootstrap_company_collision';
    end if;
  else
    insert into public.ghl_installations(
      environment,owner_kind,partner_id,provider_agency_id,status,
      capability_manifest,created_at,updated_at
    ) values (
      claim.environment,
      case when claim.partner_id is null then 'platform' else 'partner' end,
      claim.partner_id,claim.provider_company_id,'active',
      jsonb_build_object(
        'source','ghl_marketplace_signed_embed_bootstrap',
        'app_fingerprint',claim.app_fingerprint
      ),
      p_now,p_now
    ) returning * into installation;
  end if;

  select * into mapping
  from public.ghl_location_mappings
  where environment=claim.environment
    and provider_location_id=claim.provider_location_id
    and status in ('provisioning','active')
  for update;
  if found then
    if mapping.organization_id <> p_organization_id
      or mapping.installation_id <> installation.id
      or mapping.partner_id is distinct from claim.partner_id then
      raise exception using errcode='23505', message='ghl_marketplace_bootstrap_location_collision';
    end if;
  else
    if exists (
      select 1 from public.ghl_location_mappings existing
      where existing.organization_id=p_organization_id
        and existing.environment=claim.environment
        and existing.status in ('provisioning','active')
    ) then
      raise exception using errcode='23505', message='ghl_marketplace_bootstrap_workspace_collision';
    end if;
    insert into public.ghl_location_mappings(
      organization_id,partner_id,installation_id,environment,
      provider_location_id,provisioning_owner,status,created_at,updated_at
    ) values (
      p_organization_id,claim.partner_id,installation.id,claim.environment,
      claim.provider_location_id,
      case when claim.partner_id is null then 'platform' else 'partner' end,
      'provisioning',p_now,p_now
    ) returning * into mapping;
  end if;

  update public.ghl_marketplace_embed_bootstrap_claims
     set status='consumed',
         claimed_organization_id=p_organization_id,
         claimed_by_user_id=p_user_id,
         installation_id=installation.id,
         location_mapping_id=mapping.id,
         consumed_at=p_now,
         updated_at=p_now
   where id=claim.id;

  return query select
    installation.id,mapping.id,claim.partner_id,
    claim.provider_company_id,claim.provider_location_id;
end;
$$;

-- A location token is required to inspect and verify the provider snapshot,
-- therefore token exchange must be allowed while the exact mapping is still
-- provisioning. This does not make the mapping routable as READY; the
-- independent mapping readiness check remains unchanged.
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
    and environment=authority_record.environment
    and status in ('provisioning','active')
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

create or replace function public.settle_ghl_marketplace_location_exchange_encrypted_v3(
  p_exchange_id uuid,
  p_outcome text,
  p_access_credential_ref text,
  p_refresh_credential_ref text,
  p_scope_fingerprint text,
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
  staged_count integer;
begin
  perform private.require_ghl_marketplace_service_role_v1();
  select * into exchange_record
  from public.ghl_marketplace_location_token_exchanges
  where id=p_exchange_id
  for update;
  if not found then
    return query select 'not_found'::text,null::uuid;
    return;
  end if;
  if exchange_record.status <> 'pending' then
    return query select 'already_settled'::text,exchange_record.result_token_set_id;
    return;
  end if;

  select status into authority_status
  from public.ghl_marketplace_authorities
  where id=exchange_record.authority_id;
  if authority_status='uninstalled' then
    update public.ghl_marketplace_location_token_exchanges
       set status='revoked',operator_blocker_code='ghl_app_uninstalled',
           result_scope_fingerprint=null,settled_at=p_now
     where id=exchange_record.id;
    return query select 'uninstalled_race'::text,null::uuid;
    return;
  end if;
  if p_outcome in ('ambiguous','operator_required') then
    update public.ghl_marketplace_location_token_exchanges
       set status=p_outcome,
           operator_blocker_code=case when p_outcome='ambiguous'
             then 'ghl_location_token_exchange_outcome_ambiguous'
             else 'ghl_location_token_exchange_operator_required' end,
           result_scope_fingerprint=null,settled_at=p_now
     where id=exchange_record.id;
    return query select p_outcome,null::uuid;
    return;
  end if;
  if p_outcome <> 'succeeded'
    or p_scope_fingerprint !~ '^sha256:[a-f0-9]{64}$' then
    raise exception using errcode='22023',
      message='ghl_marketplace_location_exchange_scope_invalid';
  end if;

  select count(*) into staged_count
  from public.ghl_marketplace_encrypted_credentials credential
  where credential.authority_id=exchange_record.authority_id
    and credential.status='staged'
    and credential.generation=1
    and credential.key_version=p_key_version
    and (
      (credential.purpose='access' and credential.credential_ref=p_access_credential_ref)
      or
      (credential.purpose='refresh' and credential.credential_ref=p_refresh_credential_ref)
    );
  if staged_count <> 2 then
    raise exception using errcode='42501',
      message='ghl_marketplace_location_credentials_incomplete';
  end if;

  if authority_status is distinct from 'active'
    or not exists (
      select 1 from public.ghl_location_mappings mapping
      where mapping.id=exchange_record.location_mapping_id
        and mapping.organization_id=exchange_record.organization_id
        and mapping.partner_id is not distinct from exchange_record.partner_id
        and mapping.status in ('provisioning','active')
        and private.ghl_marketplace_fingerprint_v1(mapping.provider_location_id)
          = exchange_record.account_fingerprint
    )
    or p_access_expires_at <= p_now
    or p_refresh_expires_at <= p_access_expires_at
    or p_key_version <= 0 then
    raise exception using errcode='42501',
      message='ghl_marketplace_location_token_binding_invalid';
  end if;

  insert into public.ghl_marketplace_token_sets(
    authority_id,organization_id,location_mapping_id,partner_id,subject_kind,
    encrypted_access_credential_ref,encrypted_refresh_credential_ref,
    account_fingerprint,scope_fingerprint,access_expires_at,refresh_expires_at,
    key_version,generation,status,created_at,updated_at
  ) values (
    exchange_record.authority_id,exchange_record.organization_id,
    exchange_record.location_mapping_id,exchange_record.partner_id,'location',
    p_access_credential_ref,p_refresh_credential_ref,
    exchange_record.account_fingerprint,p_scope_fingerprint,
    p_access_expires_at,p_refresh_expires_at,p_key_version,1,'active',p_now,p_now
  ) returning id into token_set_id_value;

  insert into public.ghl_marketplace_token_events(
    token_set_id,organization_id,event_type,generation,
    account_fingerprint,scope_fingerprint,key_version,recorded_at
  ) values (
    token_set_id_value,exchange_record.organization_id,'created',1,
    exchange_record.account_fingerprint,p_scope_fingerprint,p_key_version,p_now
  );

  update public.ghl_marketplace_location_token_exchanges
     set status='succeeded',result_token_set_id=token_set_id_value,
         result_scope_fingerprint=p_scope_fingerprint,
         operator_blocker_code=null,settled_at=p_now
   where id=exchange_record.id;
  update public.ghl_marketplace_encrypted_credentials
     set status='active',activated_at=p_now
   where authority_id=exchange_record.authority_id
     and status='staged'
     and credential_ref in (p_access_credential_ref,p_refresh_credential_ref);

  return query select 'succeeded'::text,token_set_id_value;
end;
$$;

alter table public.ghl_marketplace_embed_bootstrap_claims enable row level security;
alter table public.ghl_marketplace_embed_bootstrap_claims force row level security;
revoke all on table public.ghl_marketplace_embed_bootstrap_claims
  from public,anon,authenticated,service_role;
grant select on table public.ghl_marketplace_embed_bootstrap_claims to service_role;

revoke all on function public.register_ghl_marketplace_embed_bootstrap_claim_v1(
  text,uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz
) from public,anon,authenticated;
grant execute on function public.register_ghl_marketplace_embed_bootstrap_claim_v1(
  text,uuid,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz
) to service_role;
revoke all on function public.consume_ghl_marketplace_embed_bootstrap_claim_v1(
  uuid,text,uuid,uuid,timestamptz
) from public,anon,authenticated;
grant execute on function public.consume_ghl_marketplace_embed_bootstrap_claim_v1(
  uuid,text,uuid,uuid,timestamptz
) to service_role;
revoke all on function public.request_ghl_marketplace_location_token_exchange_v2(
  uuid,uuid,uuid,uuid,text,text,timestamptz
) from public,anon,authenticated;
grant execute on function public.request_ghl_marketplace_location_token_exchange_v2(
  uuid,uuid,uuid,uuid,text,text,timestamptz
) to service_role;
revoke all on function public.settle_ghl_marketplace_location_exchange_encrypted_v3(
  uuid,text,text,text,text,timestamptz,timestamptz,integer,timestamptz
) from public,anon,authenticated;
grant execute on function public.settle_ghl_marketplace_location_exchange_encrypted_v3(
  uuid,text,text,text,text,timestamptz,timestamptz,integer,timestamptz
) to service_role;

do $dealflow_ghl_marketplace_bootstrap_postconditions$
begin
  if to_regclass('public.ghl_marketplace_embed_bootstrap_claims') is null then
    raise exception 'GHL Marketplace bootstrap claim table missing' using errcode='55000';
  end if;
  if not (select relrowsecurity and relforcerowsecurity
          from pg_catalog.pg_class
          where oid='public.ghl_marketplace_embed_bootstrap_claims'::regclass) then
    raise exception 'GHL Marketplace bootstrap claim RLS missing' using errcode='55000';
  end if;
  if has_table_privilege('service_role',
       'public.ghl_marketplace_embed_bootstrap_claims','INSERT,UPDATE,DELETE') then
    raise exception 'GHL Marketplace bootstrap direct write privilege leaked'
      using errcode='55000';
  end if;
end;
$dealflow_ghl_marketplace_bootstrap_postconditions$;
