-- Bind verified partner attribution as one serialized database decision.
-- A domain token is only an input hint; the active partner/domain authority is
-- revalidated here immediately before any user or workspace row changes.

create or replace function public.bind_verified_partner_attribution_v1(
  p_user_id uuid,
  p_organization_id uuid,
  p_partner_id uuid,
  p_verified_domain text
)
returns table(
  binding_status text,
  resolved_partner_id uuid,
  resolved_user_partner_id uuid,
  resolved_organization_partner_id uuid,
  attribution_active boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  normalized_domain text := lower(trim(coalesce(p_verified_domain, '')));
  user_partner uuid;
  organization_partner uuid;
  organization_owner uuid;
  attribution_id uuid;
  attribution_partner uuid;
  attribution_is_active boolean;
  attribution_exists boolean := false;
  existing_partner uuid;
  changed boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_user_id is null or p_organization_id is null or p_partner_id is null then
    raise exception 'verified partner binding identity is incomplete' using errcode = '22023';
  end if;
  if normalized_domain = '' or length(normalized_domain) > 253
    or normalized_domain ~ '[/:@]' or normalized_domain !~ '^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$' then
    raise exception 'verified partner domain is invalid' using errcode = '22023';
  end if;

  -- A single lock order serializes competing domain-token requests.
  select profile.partner_id
    into user_partner
  from public.users profile
  where profile.id = p_user_id
  for update;
  if not found then
    raise exception 'verified partner user is missing' using errcode = '23503';
  end if;

  select workspace.partner_id, workspace.owner_user_id
    into organization_partner, organization_owner
  from public.organizations workspace
  where workspace.id = p_organization_id
  for update;
  if not found then
    raise exception 'verified partner workspace is missing' using errcode = '23503';
  end if;

  if organization_owner is distinct from p_user_id
    and not exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = p_organization_id
        and membership.user_id = p_user_id
    ) then
    raise exception 'verified partner user is not a workspace member' using errcode = '42501';
  end if;

  select attribution.id, attribution.partner_id, attribution.active
    into attribution_id, attribution_partner, attribution_is_active
  from public.workspace_partner_attribution attribution
  where attribution.workspace_id = p_organization_id
  for update;
  attribution_exists := found;

  perform 1
  from public.partners partner
  join public.partner_domains domain_record
    on domain_record.partner_id = partner.id
  where partner.id = p_partner_id
    and partner.status = 'active'
    and partner.deleted_at is null
    and domain_record.domain = normalized_domain
    and domain_record.verification_status = 'verified'
    and domain_record.ssl_status = 'active'
    and domain_record.deleted_at is null
  for share of partner, domain_record;
  if not found then
    raise exception 'verified partner domain authority is not active' using errcode = '42501';
  end if;

  if (user_partner is not null and organization_partner is not null and user_partner <> organization_partner)
    or (user_partner is not null and attribution_partner is not null and user_partner <> attribution_partner)
    or (organization_partner is not null and attribution_partner is not null and organization_partner <> attribution_partner) then
    binding_status := 'existing_inconsistent';
    resolved_partner_id := coalesce(user_partner, organization_partner, attribution_partner);
    resolved_user_partner_id := user_partner;
    resolved_organization_partner_id := organization_partner;
    attribution_active := coalesce(attribution_is_active, false);
    return next;
    return;
  end if;

  existing_partner := coalesce(user_partner, organization_partner, attribution_partner);
  if existing_partner is not null and existing_partner <> p_partner_id then
    binding_status := 'conflict_preserved';
    resolved_partner_id := existing_partner;
    resolved_user_partner_id := user_partner;
    resolved_organization_partner_id := organization_partner;
    attribution_active := coalesce(attribution_is_active, false);
    return next;
    return;
  end if;

  -- A member may inherit an already-bound workspace partner, but only the
  -- workspace owner may establish a previously unbound workspace authority.
  if organization_owner is distinct from p_user_id and organization_partner is null then
    binding_status := 'workspace_owner_required';
    resolved_partner_id := existing_partner;
    resolved_user_partner_id := user_partner;
    resolved_organization_partner_id := organization_partner;
    attribution_active := coalesce(attribution_is_active, false);
    return next;
    return;
  end if;

  if user_partner is null then
    update public.users profile
      set partner_id = p_partner_id,
          updated_at = timezone('utc', now())
    where profile.id = p_user_id
      and profile.partner_id is null;
    if not found then
      raise exception 'verified partner user binding lost its lock' using errcode = '40001';
    end if;
    changed := true;
  end if;

  if organization_partner is null then
    update public.organizations workspace
      set partner_id = p_partner_id,
          updated_at = timezone('utc', now())
    where workspace.id = p_organization_id
      and workspace.owner_user_id = p_user_id
      and workspace.partner_id is null;
    if not found then
      raise exception 'verified partner workspace binding lost its lock' using errcode = '40001';
    end if;
    changed := true;
  end if;

  if attribution_exists then
    if attribution_partner is distinct from p_partner_id then
      raise exception 'verified partner attribution changed after locking' using errcode = '40001';
    end if;
    if attribution_is_active is distinct from true then
      update public.workspace_partner_attribution attribution
        set active = true,
            source = 'domain',
            metadata = coalesce(attribution.metadata, '{}'::jsonb) || jsonb_build_object(
              'verified_domain', normalized_domain,
              'binding_version', 2
            ),
            updated_at = timezone('utc', now())
      where attribution.id = attribution_id
        and attribution.partner_id = p_partner_id;
      if not found then
        raise exception 'verified partner attribution reactivation lost its lock' using errcode = '40001';
      end if;
      changed := true;
    end if;
  else
    insert into public.workspace_partner_attribution(
      workspace_id,
      partner_id,
      source,
      active,
      metadata,
      assigned_by
    ) values (
      p_organization_id,
      p_partner_id,
      'domain',
      true,
      jsonb_build_object(
        'verified_domain', normalized_domain,
        'binding_version', 2
      ),
      p_user_id
    );
    changed := true;
  end if;

  select profile.partner_id, workspace.partner_id, attribution.active
    into user_partner, organization_partner, attribution_is_active
  from public.users profile
  join public.organizations workspace on workspace.id = p_organization_id
  join public.workspace_partner_attribution attribution
    on attribution.workspace_id = workspace.id
  where profile.id = p_user_id
    and attribution.partner_id = p_partner_id;
  if not found
    or user_partner is distinct from p_partner_id
    or organization_partner is distinct from p_partner_id
    or attribution_is_active is distinct from true then
    raise exception 'verified partner binding postcondition failed' using errcode = '40001';
  end if;

  binding_status := case when changed then 'bound' else 'already_bound' end;
  resolved_partner_id := p_partner_id;
  resolved_user_partner_id := user_partner;
  resolved_organization_partner_id := organization_partner;
  attribution_active := attribution_is_active;
  return next;
end;
$$;

revoke all on function public.bind_verified_partner_attribution_v1(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.bind_verified_partner_attribution_v1(uuid, uuid, uuid, text)
  to service_role;

insert into public.app_schema_metadata(key, value)
values ('schema_version', '20260713015000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
