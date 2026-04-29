do $$
declare
  table_name text;
  policy_record record;
  table_names text[] := array[
    'users',
    'organizations',
    'organization_memberships',
    'campaign_plans',
    'leads',
    'lead_messages',
    'marketing_accounts',
    'creative_assets',
    'billing_subscriptions',
    'system_jobs',
    'system_job_logs',
    'provider_usage_limits',
    'provider_usage_events',
    'stripe_webhook_events',
    'meta_launch_locks'
  ];
begin
  foreach table_name in array table_names loop
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, table_name);
    end loop;
  end loop;
end $$;

create policy users_select_self
  on public.users
  for select
  to authenticated
  using (id = auth.uid());

create policy users_update_self
  on public.users
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy organizations_select_member
  on public.organizations
  for select
  to authenticated
  using (owner_user_id = auth.uid() or public.is_current_user_org_member(id));

create policy organizations_update_owner
  on public.organizations
  for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy organization_memberships_select_member
  on public.organization_memberships
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_current_user_org_member(organization_id));

create policy organization_memberships_insert_self
  on public.organization_memberships
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy campaign_plans_member_access
  on public.campaign_plans
  for all
  to authenticated
  using (
    user_id::text = auth.uid()::text
    or owner_id = auth.uid()::text
    or public.is_current_user_org_member(organization_id)
  )
  with check (
    user_id::text = auth.uid()::text
    or owner_id = auth.uid()::text
    or public.is_current_user_org_member(organization_id)
  );

create policy leads_member_access
  on public.leads
  for all
  to authenticated
  using (
    user_id = auth.uid()
    or assigned_user_id = auth.uid()
    or public.is_current_user_org_member(organization_id)
  )
  with check (
    user_id = auth.uid()
    or assigned_user_id = auth.uid()
    or public.is_current_user_org_member(organization_id)
  );

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
          or public.is_current_user_org_member(lead_record.organization_id)
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
          or public.is_current_user_org_member(lead_record.organization_id)
        )
    )
  );

create policy marketing_accounts_member_access
  on public.marketing_accounts
  for all
  to authenticated
  using (public.is_current_user_org_member(organization_id))
  with check (public.is_current_user_org_member(organization_id));

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
          or public.is_current_user_org_member(campaign_record.organization_id)
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
          or public.is_current_user_org_member(campaign_record.organization_id)
        )
    )
  );

create policy billing_subscriptions_member_select
  on public.billing_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_current_user_org_member(organization_id));

create policy system_jobs_member_access
  on public.system_jobs
  for all
  to authenticated
  using (user_id = auth.uid() or public.is_current_user_org_member(organization_id))
  with check (user_id = auth.uid() or public.is_current_user_org_member(organization_id));

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
          or public.is_current_user_org_member(job_record.organization_id)
        )
    )
  );

create policy provider_usage_limits_member_select
  on public.provider_usage_limits
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_current_user_org_member(organization_id));

create policy provider_usage_events_member_select
  on public.provider_usage_events
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_current_user_org_member(organization_id));

create policy stripe_webhook_events_member_select
  on public.stripe_webhook_events
  for select
  to authenticated
  using (organization_id is not null and public.is_current_user_org_member(organization_id));

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
          or public.is_current_user_org_member(campaign_record.organization_id)
        )
    )
  );

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260429101000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
