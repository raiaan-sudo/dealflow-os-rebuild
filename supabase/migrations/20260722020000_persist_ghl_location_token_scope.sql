-- HighLevel's company-to-location token exchange returns the exact location
-- token scope portfolio, which can differ from the company token portfolio.
-- Persist that provider-returned fingerprint without weakening tenant, app,
-- company, location, credential, or idempotency bindings.

alter table public.ghl_marketplace_location_token_exchanges
  add column if not exists result_scope_fingerprint text null;

update public.ghl_marketplace_location_token_exchanges
set result_scope_fingerprint = scope_fingerprint
where status = 'succeeded' and result_scope_fingerprint is null;

alter table public.ghl_marketplace_location_token_exchanges
  drop constraint if exists ghl_marketplace_location_exchanges_result_scope_check,
  add constraint ghl_marketplace_location_exchanges_result_scope_check check (
    (status = 'succeeded' and result_scope_fingerprint ~ '^sha256:[a-f0-9]{64}$')
    or (status <> 'succeeded' and result_scope_fingerprint is null)
  );

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
  where id = p_exchange_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if exchange_record.status <> 'pending' then
    return query select 'already_settled'::text, exchange_record.result_token_set_id;
    return;
  end if;

  select status into authority_status
  from public.ghl_marketplace_authorities
  where id = exchange_record.authority_id;
  if authority_status = 'uninstalled' then
    update public.ghl_marketplace_location_token_exchanges
    set status = 'revoked', operator_blocker_code = 'ghl_app_uninstalled',
        result_scope_fingerprint = null, settled_at = p_now
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
        result_scope_fingerprint = null,
        settled_at = p_now
    where id = exchange_record.id;
    return query select p_outcome, null::uuid;
    return;
  end if;

  if p_outcome <> 'succeeded'
    or p_scope_fingerprint !~ '^sha256:[a-f0-9]{64}$' then
    raise exception using errcode = '22023',
      message = 'ghl_marketplace_location_exchange_scope_invalid';
  end if;

  select count(*) into staged_count
  from public.ghl_marketplace_encrypted_credentials credential
  where credential.authority_id = exchange_record.authority_id
    and credential.status = 'staged'
    and credential.generation = 1
    and credential.key_version = p_key_version
    and (
      (credential.purpose = 'access' and credential.credential_ref = p_access_credential_ref)
      or
      (credential.purpose = 'refresh' and credential.credential_ref = p_refresh_credential_ref)
    );
  if staged_count <> 2 then
    raise exception using errcode = '42501',
      message = 'ghl_marketplace_location_credentials_incomplete';
  end if;

  if authority_status is distinct from 'active'
    or not exists (
      select 1
      from public.ghl_location_mappings mapping
      where mapping.id = exchange_record.location_mapping_id
        and mapping.organization_id = exchange_record.organization_id
        and mapping.partner_id is not distinct from exchange_record.partner_id
        and mapping.status = 'active'
        and private.ghl_marketplace_fingerprint_v1(mapping.provider_location_id)
          = exchange_record.account_fingerprint
    )
    or p_access_expires_at <= p_now
    or p_refresh_expires_at <= p_access_expires_at
    or p_key_version <= 0 then
    raise exception using errcode = '42501',
      message = 'ghl_marketplace_location_token_binding_invalid';
  end if;

  insert into public.ghl_marketplace_token_sets(
    authority_id, organization_id, location_mapping_id, partner_id, subject_kind,
    encrypted_access_credential_ref, encrypted_refresh_credential_ref,
    account_fingerprint, scope_fingerprint, access_expires_at, refresh_expires_at,
    key_version, generation, status, created_at, updated_at
  ) values (
    exchange_record.authority_id, exchange_record.organization_id,
    exchange_record.location_mapping_id, exchange_record.partner_id, 'location',
    p_access_credential_ref, p_refresh_credential_ref,
    exchange_record.account_fingerprint, p_scope_fingerprint,
    p_access_expires_at, p_refresh_expires_at,
    p_key_version, 1, 'active', p_now, p_now
  ) returning id into token_set_id_value;

  insert into public.ghl_marketplace_token_events(
    token_set_id, organization_id, event_type, generation,
    account_fingerprint, scope_fingerprint, key_version, recorded_at
  ) values (
    token_set_id_value, exchange_record.organization_id, 'created', 1,
    exchange_record.account_fingerprint, p_scope_fingerprint, p_key_version, p_now
  );

  update public.ghl_marketplace_location_token_exchanges
  set status = 'succeeded', result_token_set_id = token_set_id_value,
      result_scope_fingerprint = p_scope_fingerprint,
      operator_blocker_code = null, settled_at = p_now
  where id = exchange_record.id;

  update public.ghl_marketplace_encrypted_credentials
  set status = 'active', activated_at = p_now
  where authority_id = exchange_record.authority_id
    and status = 'staged'
    and credential_ref in (p_access_credential_ref, p_refresh_credential_ref);

  return query select 'succeeded'::text, token_set_id_value;
end;
$$;

revoke all on function public.settle_ghl_marketplace_location_exchange_encrypted_v3(
  uuid,text,text,text,text,timestamptz,timestamptz,integer,timestamptz
) from public, anon, authenticated;
grant execute on function public.settle_ghl_marketplace_location_exchange_encrypted_v3(
  uuid,text,text,text,text,timestamptz,timestamptz,integer,timestamptz
) to service_role;
