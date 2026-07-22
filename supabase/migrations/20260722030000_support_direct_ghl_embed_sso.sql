-- Direct realtor workspaces intentionally have no partner id. Extend the same
-- fail-closed, signed HighLevel embed SSO authority used by partner children to
-- those first-party tenants without weakening location, user, membership,
-- provider, replay, or environment binding.

alter table public.ghl_embed_auth_exchanges
  alter column partner_id drop not null;

alter table public.workspace_ghl_users
  alter column partner_id drop not null;

create unique index if not exists workspace_ghl_users_direct_email_unique
  on public.workspace_ghl_users (workspace_id, email)
  where partner_id is null;

create unique index if not exists workspace_ghl_users_direct_identity_unique
  on public.workspace_ghl_users (workspace_id, dealflow_user_id)
  where partner_id is null and dealflow_user_id is not null;

create or replace function public.bind_workspace_ghl_dealflow_user_v1(
  p_workspace_id uuid,
  p_partner_id uuid,
  p_ghl_location_id text,
  p_ghl_user_id text,
  p_normalized_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  binding public.workspace_ghl_users%rowtype;
  candidate_user_id uuid;
  candidate_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'ghl_embed_binding_service_role_required' using errcode = '42501';
  end if;
  if p_workspace_id is null
    or length(btrim(coalesce(p_ghl_location_id, ''))) not between 3 and 160
    or length(btrim(coalesce(p_ghl_user_id, ''))) not between 3 and 160
    or p_normalized_email is distinct from lower(btrim(p_normalized_email))
    or length(p_normalized_email) not between 3 and 320 then
    raise exception 'ghl_embed_binding_context_invalid' using errcode = '22023';
  end if;

  select * into strict binding
  from public.workspace_ghl_users candidate
  where candidate.workspace_id = p_workspace_id
    and candidate.partner_id is not distinct from p_partner_id
    and candidate.ghl_location_id = p_ghl_location_id
    and candidate.ghl_user_id = p_ghl_user_id
    and lower(btrim(candidate.email)) = p_normalized_email
    and candidate.invite_status = 'active'
  for update;

  select count(*)::integer, (array_agg(candidate.id order by candidate.id))[1]
    into candidate_count, candidate_user_id
  from public.users candidate
  join public.organization_memberships membership
    on membership.organization_id = p_workspace_id
   and membership.user_id = candidate.id
  join auth.users auth_candidate
    on auth_candidate.id = candidate.id
   and lower(btrim(auth_candidate.email)) = p_normalized_email
  where candidate.partner_id is not distinct from p_partner_id
    and lower(btrim(candidate.email)) = p_normalized_email
    and lower(btrim(membership.role)) not in ('platform_admin','internal_admin','operator')
    and auth_candidate.email_confirmed_at is not null
    and auth_candidate.deleted_at is null
    and coalesce(auth_candidate.is_anonymous, false) = false
    and (auth_candidate.banned_until is null or auth_candidate.banned_until <= timezone('utc', now()))
    and not exists (
      select 1 from public.platform_operator_grants operator_grant
      where operator_grant.user_id = candidate.id
    )
    and not exists (
      select 1 from public.account_deletion_suspensions suspension
      where suspension.organization_id = p_workspace_id
         or suspension.requested_by_user_id = candidate.id
    );

  if candidate_count <> 1 or candidate_user_id is null then
    raise exception 'ghl_embed_binding_candidate_ambiguous_or_missing' using errcode = '42501';
  end if;
  if binding.dealflow_user_id is not null
    and binding.dealflow_user_id <> candidate_user_id then
    raise exception 'ghl_embed_binding_collision' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.workspace_ghl_users other
    where other.workspace_id = p_workspace_id
      and other.partner_id is not distinct from p_partner_id
      and other.dealflow_user_id = candidate_user_id
      and other.id <> binding.id
  ) then
    raise exception 'ghl_embed_binding_collision' using errcode = '23505';
  end if;

  update public.workspace_ghl_users
     set dealflow_user_id = candidate_user_id,
         updated_at = timezone('utc', now())
   where id = binding.id;
  return candidate_user_id;
exception when no_data_found or too_many_rows then
  raise exception 'ghl_embed_binding_row_ambiguous_or_missing' using errcode = '42501';
end;
$$;

create or replace function public.begin_ghl_embed_auth_exchange_v1(
  p_payload_digest text,
  p_partner_id uuid,
  p_organization_id uuid,
  p_provider_location_id text,
  p_provider_user_id text,
  p_dealflow_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'ghl_embed_exchange_service_role_required' using errcode = '42501';
  end if;
  if p_payload_digest !~ '^[0-9a-f]{64}$'
    or p_organization_id is null
    or p_dealflow_user_id is null
    or length(btrim(coalesce(p_provider_location_id, ''))) not between 3 and 160
    or length(btrim(coalesce(p_provider_user_id, ''))) not between 3 and 160 then
    raise exception 'ghl_embed_exchange_context_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.workspace_ghl_users binding
    where binding.workspace_id = p_organization_id
      and binding.partner_id is not distinct from p_partner_id
      and binding.ghl_location_id = p_provider_location_id
      and binding.ghl_user_id = p_provider_user_id
      and binding.dealflow_user_id = p_dealflow_user_id
      and binding.invite_status = 'active'
  ) then
    raise exception 'ghl_embed_exchange_binding_invalid' using errcode = '42501';
  end if;

  delete from public.ghl_embed_auth_exchanges exchange
   where exchange.created_at < timezone('utc', now()) - interval '24 hours';

  update public.ghl_embed_auth_exchanges exchange
     set state = 'expired'
   where exchange.state = 'pending'
     and exchange.expires_at <= timezone('utc', now());

  begin
    insert into public.ghl_embed_auth_exchanges (
      payload_digest, partner_id, organization_id, provider_location_id,
      provider_user_id, dealflow_user_id, expires_at
    ) values (
      p_payload_digest, p_partner_id, p_organization_id,
      btrim(p_provider_location_id), btrim(p_provider_user_id),
      p_dealflow_user_id, timezone('utc', now()) + interval '2 minutes'
    ) returning id into created_id;
  exception when unique_violation then
    raise exception 'ghl_embed_exchange_payload_already_seen' using errcode = '23505';
  end;
  return created_id;
end;
$$;

create or replace function public.bind_direct_workspace_ghl_user_v1(
  p_workspace_id uuid,
  p_ghl_location_id text,
  p_ghl_user_id text,
  p_normalized_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_user_id uuid;
  candidate_count integer;
  existing_binding public.workspace_ghl_users%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'ghl_embed_binding_service_role_required' using errcode = '42501';
  end if;
  if p_workspace_id is null
    or length(btrim(coalesce(p_ghl_location_id, ''))) not between 3 and 160
    or length(btrim(coalesce(p_ghl_user_id, ''))) not between 3 and 160
    or p_normalized_email is distinct from lower(btrim(p_normalized_email))
    or length(p_normalized_email) not between 3 and 320 then
    raise exception 'ghl_embed_binding_context_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.ghl_workspace_tenants tenant
    where tenant.organization_id = p_workspace_id
      and tenant.tenant_kind = 'direct_realtor'
      and tenant.partner_id is null
      and tenant.status = 'active'
  ) or not exists (
    select 1 from public.ghl_location_mappings mapping
    where mapping.organization_id = p_workspace_id
      and mapping.partner_id is null
      and mapping.provider_location_id = p_ghl_location_id
      and mapping.status = 'active'
  ) then
    raise exception 'ghl_embed_direct_workspace_unbound' using errcode = '42501';
  end if;

  select count(*)::integer, (array_agg(candidate.id order by candidate.id))[1]
    into candidate_count, candidate_user_id
  from public.users candidate
  join public.organization_memberships membership
    on membership.organization_id = p_workspace_id
   and membership.user_id = candidate.id
  join auth.users auth_candidate
    on auth_candidate.id = candidate.id
   and lower(btrim(auth_candidate.email)) = p_normalized_email
  where candidate.partner_id is null
    and lower(btrim(candidate.email)) = p_normalized_email
    and lower(btrim(membership.role)) not in ('platform_admin','internal_admin','operator')
    and auth_candidate.email_confirmed_at is not null
    and auth_candidate.deleted_at is null
    and coalesce(auth_candidate.is_anonymous, false) = false
    and (auth_candidate.banned_until is null or auth_candidate.banned_until <= timezone('utc', now()))
    and not exists (
      select 1 from public.platform_operator_grants operator_grant
      where operator_grant.user_id = candidate.id
    )
    and not exists (
      select 1 from public.account_deletion_suspensions suspension
      where suspension.organization_id = p_workspace_id
         or suspension.requested_by_user_id = candidate.id
    );
  if candidate_count <> 1 or candidate_user_id is null then
    raise exception 'ghl_embed_binding_candidate_ambiguous_or_missing' using errcode = '42501';
  end if;

  select * into existing_binding
  from public.workspace_ghl_users binding
  where binding.workspace_id = p_workspace_id
    and binding.partner_id is null
    and lower(btrim(binding.email)) = p_normalized_email
  for update;
  if found then
    if existing_binding.ghl_location_id <> p_ghl_location_id
      or (existing_binding.ghl_user_id is not null and existing_binding.ghl_user_id <> p_ghl_user_id)
      or (existing_binding.dealflow_user_id is not null and existing_binding.dealflow_user_id <> candidate_user_id) then
      raise exception 'ghl_embed_binding_collision' using errcode = '23505';
    end if;
    update public.workspace_ghl_users
       set ghl_user_id = p_ghl_user_id,
           invite_status = 'active',
           dealflow_user_id = candidate_user_id,
           updated_at = timezone('utc', now())
     where id = existing_binding.id;
    return candidate_user_id;
  end if;

  insert into public.workspace_ghl_users (
    workspace_id, ghl_location_id, ghl_user_id, email, invite_status,
    metadata, partner_id, dealflow_user_id, created_at, updated_at
  ) values (
    p_workspace_id, btrim(p_ghl_location_id), btrim(p_ghl_user_id),
    p_normalized_email, 'active', '{"source":"signed_ghl_direct_embed"}'::jsonb,
    null, candidate_user_id, timezone('utc', now()), timezone('utc', now())
  );
  return candidate_user_id;
end;
$$;

revoke all on function public.bind_workspace_ghl_dealflow_user_v1(uuid,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.begin_ghl_embed_auth_exchange_v1(text,uuid,uuid,text,text,uuid)
  from public, anon, authenticated;
revoke all on function public.bind_direct_workspace_ghl_user_v1(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.bind_workspace_ghl_dealflow_user_v1(uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.begin_ghl_embed_auth_exchange_v1(text,uuid,uuid,text,text,uuid)
  to service_role;
grant execute on function public.bind_direct_workspace_ghl_user_v1(uuid,text,text,text)
  to service_role;

do $dealflow_direct_ghl_embed_postconditions$
begin
  if (select attnotnull from pg_catalog.pg_attribute
      where attrelid = 'public.ghl_embed_auth_exchanges'::regclass
        and attname = 'partner_id' and not attisdropped) then
    raise exception 'direct GHL embed receipt partner id remains required' using errcode = '55000';
  end if;
  if (select attnotnull from pg_catalog.pg_attribute
      where attrelid = 'public.workspace_ghl_users'::regclass
        and attname = 'partner_id' and not attisdropped) then
    raise exception 'direct GHL user partner id remains required' using errcode = '55000';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class c on c.oid = i.indexrelid
    where c.relname = 'workspace_ghl_users_direct_identity_unique' and i.indisvalid
  ) then
    raise exception 'direct GHL embed identity fence missing' using errcode = '55000';
  end if;
end;
$dealflow_direct_ghl_embed_postconditions$;
