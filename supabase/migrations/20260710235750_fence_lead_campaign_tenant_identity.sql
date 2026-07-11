-- Make the campaign/tenant/user scope used by lead retry an atomic database
-- invariant. The composite foreign key takes a key-share lock on the exact
-- campaign identity during lead writes, fencing concurrent reassignment.

create unique index if not exists campaign_plans_id_organization_user_unique
  on public.campaign_plans (id, organization_id, user_id);

do $$
begin
  if exists (
    select 1
    from public.leads lead_record
    left join public.campaign_plans campaign_record
      on campaign_record.id = lead_record.campaign_id
      and campaign_record.organization_id = lead_record.organization_id
      and campaign_record.user_id = lead_record.user_id
    where lead_record.campaign_id is not null
      and campaign_record.id is null
  ) then
    raise exception using
      errcode = '23503',
      message = 'Cannot enforce lead campaign tenant identity: existing campaign-scoped leads require reconciliation.';
  end if;
end;
$$;

alter table public.leads
  drop constraint if exists leads_campaign_tenant_user_fk;

alter table public.leads
  add constraint leads_campaign_tenant_user_fk
  foreign key (campaign_id, organization_id, user_id)
  references public.campaign_plans (id, organization_id, user_id)
  on update restrict
  on delete restrict
  not valid;

alter table public.leads
  validate constraint leads_campaign_tenant_user_fk;

comment on constraint leads_campaign_tenant_user_fk on public.leads is
  'Atomically fences every campaign-scoped lead to the exact campaign organization and owner identity.';
