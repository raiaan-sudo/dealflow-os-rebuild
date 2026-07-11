-- DealFlow pre-application read-only migration preflight.
-- Run only against an explicitly authorized target after confirming its
-- identity out of band. Every result is a boolean or aggregate count. This
-- file intentionally references only the established pre-candidate schema.

begin transaction isolation level repeatable read read only;

select
  to_regclass('public.organizations') is not null as organizations_present,
  to_regclass('public.organization_memberships') is not null as memberships_present,
  to_regclass('public.campaign_plans') is not null as campaign_plans_present,
  to_regclass('public.leads') is not null as leads_present,
  to_regclass('public.system_jobs') is not null as system_jobs_present,
  to_regclass('public.user_credit_ledger') is not null as credit_ledger_present;

do $$
begin
  if to_regclass('public.organizations') is null
    or to_regclass('public.organization_memberships') is null
    or to_regclass('public.campaign_plans') is null
    or to_regclass('public.leads') is null
    or to_regclass('public.system_jobs') is null
    or to_regclass('public.user_credit_ledger') is null then
    raise exception 'DealFlow foundational schema is incomplete; stop before candidate migration application.';
  end if;
end;
$$;

select count(*) as campaign_rows_without_workspace
from public.campaign_plans
where organization_id is null;

select count(*) as job_rows_without_workspace
from public.system_jobs
where organization_id is null;

select count(*) as jobs_with_cross_tenant_campaign
from public.system_jobs job
join public.campaign_plans campaign on campaign.id = job.campaign_id
where job.organization_id is distinct from campaign.organization_id;

select count(*) as leads_with_cross_tenant_campaign
from public.leads lead_row
join public.campaign_plans campaign on campaign.id = lead_row.campaign_id
where lead_row.organization_id is distinct from campaign.organization_id;

select count(*) as memberships_without_workspace
from public.organization_memberships membership
left join public.organizations organization_row
  on organization_row.id = membership.organization_id
where organization_row.id is null;

commit;
