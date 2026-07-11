-- Campaign identity is immutable after creation. All browser access is
-- current-workspace membership based; creator ids are not durable access
-- capabilities after a member is removed.

create or replace function public.prevent_campaign_plan_identity_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.owner_id is distinct from old.owner_id
    or new.user_id is distinct from old.user_id then
    raise exception using
      errcode = '42501',
      message = 'campaign_plan_tenant_identity_immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists campaign_plans_identity_immutable_guard
  on public.campaign_plans;
create trigger campaign_plans_identity_immutable_guard
before update of id, organization_id, owner_id, user_id
on public.campaign_plans
for each row execute function public.prevent_campaign_plan_identity_mutation();

revoke execute on function public.prevent_campaign_plan_identity_mutation()
  from public, anon, authenticated;

drop policy if exists campaign_plans_member_access on public.campaign_plans;
drop policy if exists campaign_plans_current_workspace_select on public.campaign_plans;
create policy campaign_plans_current_workspace_select
  on public.campaign_plans
  for select
  to authenticated
  using (private.is_current_user_org_member(organization_id));

-- Authenticated clients may read only through the current membership policy.
-- Server writes use exact campaign + organization predicates, while the
-- immutable trigger prevents even service-role code from shuttling a row
-- between tenants or changing its creator identity.
revoke insert, update, delete, truncate, references, trigger
  on public.campaign_plans from public, anon, authenticated;
grant select on public.campaign_plans to authenticated;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260710235960')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());

comment on function public.prevent_campaign_plan_identity_mutation() is
  'Rejects campaign id, tenant, owner, or creator changes after the atomic creation RPC establishes identity.';
