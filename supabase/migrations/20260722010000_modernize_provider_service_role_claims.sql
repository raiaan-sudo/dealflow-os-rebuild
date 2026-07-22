-- Keep provider-only RPC authorization compatible with both PostgREST claim
-- formats. Current PostgREST exposes the complete JWT as request.jwt.claims;
-- older deployments exposed request.jwt.claim.role as a dedicated setting.

create or replace function private.require_ghl_marketplace_service_role_v1()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_legacy_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_claims jsonb := '{}'::jsonb;
  v_claims_role text := '';
begin
  begin
    v_claims := coalesce(
      nullif(current_setting('request.jwt.claims', true), ''),
      '{}'
    )::jsonb;
  exception when others then
    v_claims := '{}'::jsonb;
  end;

  v_claims_role := coalesce(v_claims ->> 'role', '');

  if v_legacy_role <> 'service_role' and v_claims_role <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'ghl_marketplace_service_role_required';
  end if;
end;
$$;

revoke all on function private.require_ghl_marketplace_service_role_v1()
  from public, anon, authenticated, service_role;

create or replace function private.assert_meta_leadgen_service_role()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_legacy_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_claims jsonb := '{}'::jsonb;
  v_claims_role text := '';
begin
  begin
    v_claims := coalesce(
      nullif(current_setting('request.jwt.claims', true), ''),
      '{}'
    )::jsonb;
  exception when others then
    v_claims := '{}'::jsonb;
  end;

  v_claims_role := coalesce(v_claims ->> 'role', '');

  if v_legacy_role <> 'service_role' and v_claims_role <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'meta_leadgen_service_role_required';
  end if;
end;
$$;

revoke all on function private.assert_meta_leadgen_service_role()
  from public, anon, authenticated, service_role;
