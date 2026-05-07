create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_current_user_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.organizations organization_record
    where organization_record.id = p_organization_id
      and organization_record.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.organization_memberships membership_record
    where membership_record.organization_id = p_organization_id
      and membership_record.user_id = auth.uid()
  );
$function$;

revoke execute on function private.is_current_user_org_member(uuid) from public, anon;
grant execute on function private.is_current_user_org_member(uuid) to authenticated, service_role;

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
  on public.organizations
  for select
  to authenticated
  using (owner_user_id = auth.uid() or private.is_current_user_org_member(id));

drop policy if exists organization_memberships_select_member on public.organization_memberships;
create policy organization_memberships_select_member
  on public.organization_memberships
  for select
  to authenticated
  using (user_id = auth.uid() or private.is_current_user_org_member(organization_id));

drop policy if exists campaign_plans_member_access on public.campaign_plans;
create policy campaign_plans_member_access
  on public.campaign_plans
  for all
  to authenticated
  using (
    user_id::text = auth.uid()::text
    or owner_id = auth.uid()::text
    or private.is_current_user_org_member(organization_id)
  )
  with check (
    user_id::text = auth.uid()::text
    or owner_id = auth.uid()::text
    or private.is_current_user_org_member(organization_id)
  );

drop policy if exists leads_member_access on public.leads;
create policy leads_member_access
  on public.leads
  for all
  to authenticated
  using (
    user_id = auth.uid()
    or assigned_user_id = auth.uid()
    or private.is_current_user_org_member(organization_id)
  )
  with check (
    user_id = auth.uid()
    or assigned_user_id = auth.uid()
    or private.is_current_user_org_member(organization_id)
  );

drop policy if exists lead_messages_member_access on public.lead_messages;
create policy lead_messages_member_access
  on public.lead_messages
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.leads lead_record
      where lead_record.id = lead_messages.lead_id
        and (
          lead_record.user_id = auth.uid()
          or lead_record.assigned_user_id = auth.uid()
          or private.is_current_user_org_member(lead_record.organization_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.leads lead_record
      where lead_record.id = lead_messages.lead_id
        and (
          lead_record.user_id = auth.uid()
          or lead_record.assigned_user_id = auth.uid()
          or private.is_current_user_org_member(lead_record.organization_id)
        )
    )
  );

drop policy if exists marketing_accounts_member_access on public.marketing_accounts;
create policy marketing_accounts_member_access
  on public.marketing_accounts
  for all
  to authenticated
  using (private.is_current_user_org_member(organization_id))
  with check (private.is_current_user_org_member(organization_id));

drop policy if exists creative_assets_member_access on public.creative_assets;
create policy creative_assets_member_access
  on public.creative_assets
  for all
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.campaign_plans campaign_record
      where campaign_record.id = creative_assets.campaign_id
        and (
          campaign_record.user_id::text = auth.uid()::text
          or campaign_record.owner_id = auth.uid()::text
          or private.is_current_user_org_member(campaign_record.organization_id)
        )
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1
      from public.campaign_plans campaign_record
      where campaign_record.id = creative_assets.campaign_id
        and (
          campaign_record.user_id::text = auth.uid()::text
          or campaign_record.owner_id = auth.uid()::text
          or private.is_current_user_org_member(campaign_record.organization_id)
        )
    )
  );

drop policy if exists billing_subscriptions_member_select on public.billing_subscriptions;
create policy billing_subscriptions_member_select
  on public.billing_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid() or private.is_current_user_org_member(organization_id));

drop policy if exists system_jobs_member_access on public.system_jobs;
create policy system_jobs_member_access
  on public.system_jobs
  for all
  to authenticated
  using (user_id = auth.uid() or private.is_current_user_org_member(organization_id))
  with check (user_id = auth.uid() or private.is_current_user_org_member(organization_id));

drop policy if exists system_job_logs_member_select on public.system_job_logs;
create policy system_job_logs_member_select
  on public.system_job_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.system_jobs job_record
      where job_record.id = system_job_logs.job_id
        and (
          job_record.user_id = auth.uid()
          or private.is_current_user_org_member(job_record.organization_id)
        )
    )
  );

drop policy if exists provider_usage_limits_member_select on public.provider_usage_limits;
create policy provider_usage_limits_member_select
  on public.provider_usage_limits
  for select
  to authenticated
  using (user_id = auth.uid() or private.is_current_user_org_member(organization_id));

drop policy if exists provider_usage_events_member_select on public.provider_usage_events;
create policy provider_usage_events_member_select
  on public.provider_usage_events
  for select
  to authenticated
  using (user_id = auth.uid() or private.is_current_user_org_member(organization_id));

drop policy if exists stripe_webhook_events_member_select on public.stripe_webhook_events;
create policy stripe_webhook_events_member_select
  on public.stripe_webhook_events
  for select
  to authenticated
  using (organization_id is not null and private.is_current_user_org_member(organization_id));

drop policy if exists meta_launch_locks_member_select on public.meta_launch_locks;
create policy meta_launch_locks_member_select
  on public.meta_launch_locks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.campaign_plans campaign_record
      where campaign_record.id = meta_launch_locks.campaign_id
        and (
          campaign_record.user_id::text = auth.uid()::text
          or campaign_record.owner_id = auth.uid()::text
          or private.is_current_user_org_member(campaign_record.organization_id)
        )
    )
  );

revoke execute on function public.is_current_user_org_member(uuid) from public, anon, authenticated;
grant execute on function public.is_current_user_org_member(uuid) to service_role;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260502192332')
on conflict (key) do update set value = excluded.value;
