create index if not exists appointments_lead_id_idx
  on public.appointments(lead_id)
  where lead_id is not null;

create index if not exists audit_logs_actor_user_id_idx
  on public.audit_logs(actor_user_id)
  where actor_user_id is not null;

create index if not exists data_imports_uploaded_by_idx
  on public.data_imports(uploaded_by)
  where uploaded_by is not null;

create index if not exists deals_appointment_id_idx
  on public.deals(appointment_id)
  where appointment_id is not null;

create index if not exists deals_lead_id_idx
  on public.deals(lead_id)
  where lead_id is not null;

create index if not exists generated_artifacts_generated_by_idx
  on public.generated_artifacts(generated_by)
  where generated_by is not null;

create index if not exists internal_notes_author_user_id_idx
  on public.internal_notes(author_user_id)
  where author_user_id is not null;

create index if not exists jobs_assigned_user_id_idx
  on public.jobs(assigned_user_id)
  where assigned_user_id is not null;

create index if not exists jobs_lead_id_idx
  on public.jobs(lead_id)
  where lead_id is not null;

create index if not exists jobs_service_type_id_idx
  on public.jobs(service_type_id)
  where service_type_id is not null;

create index if not exists leads_assigned_user_id_idx
  on public.leads(assigned_user_id)
  where assigned_user_id is not null;

create index if not exists leads_marketing_account_id_idx
  on public.leads(marketing_account_id)
  where marketing_account_id is not null;

create index if not exists leads_service_type_id_idx
  on public.leads(service_type_id)
  where service_type_id is not null;

create index if not exists organizations_owner_user_id_idx
  on public.organizations(owner_user_id)
  where owner_user_id is not null;

create index if not exists provider_usage_events_campaign_id_idx
  on public.provider_usage_events(campaign_id)
  where campaign_id is not null;

create index if not exists provider_usage_events_user_id_idx
  on public.provider_usage_events(user_id)
  where user_id is not null;

create index if not exists provider_usage_limits_campaign_id_idx
  on public.provider_usage_limits(campaign_id)
  where campaign_id is not null;

create index if not exists provider_usage_limits_organization_id_idx
  on public.provider_usage_limits(organization_id)
  where organization_id is not null;

create index if not exists user_credit_ledger_organization_id_idx
  on public.user_credit_ledger(organization_id)
  where organization_id is not null;

drop index if exists public.rate_limit_buckets_bucket_key_unique;

drop policy if exists app_schema_metadata_service_role_all on public.app_schema_metadata;
create policy app_schema_metadata_service_role_all
  on public.app_schema_metadata
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists users_select_self on public.users;
create policy users_select_self
  on public.users
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists users_update_self on public.users;
create policy users_update_self
  on public.users
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
  on public.organizations
  for select
  to authenticated
  using (owner_user_id = (select auth.uid()) or private.is_current_user_org_member(id));

drop policy if exists organizations_update_owner on public.organizations;
create policy organizations_update_owner
  on public.organizations
  for update
  to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

drop policy if exists organization_memberships_select_member on public.organization_memberships;
create policy organization_memberships_select_member
  on public.organization_memberships
  for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_current_user_org_member(organization_id));

drop policy if exists campaign_plans_member_access on public.campaign_plans;
create policy campaign_plans_member_access
  on public.campaign_plans
  for all
  to authenticated
  using (
    user_id::text = (select auth.uid())::text
    or owner_id = (select auth.uid())::text
    or private.is_current_user_org_member(organization_id)
  )
  with check (
    user_id::text = (select auth.uid())::text
    or owner_id = (select auth.uid())::text
    or private.is_current_user_org_member(organization_id)
  );

drop policy if exists creative_assets_member_access on public.creative_assets;
create policy creative_assets_member_access
  on public.creative_assets
  for all
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.campaign_plans campaign_record
      where campaign_record.id = creative_assets.campaign_id
        and (
          campaign_record.user_id::text = (select auth.uid())::text
          or campaign_record.owner_id = (select auth.uid())::text
          or private.is_current_user_org_member(campaign_record.organization_id)
        )
    )
  )
  with check (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.campaign_plans campaign_record
      where campaign_record.id = creative_assets.campaign_id
        and (
          campaign_record.user_id::text = (select auth.uid())::text
          or campaign_record.owner_id = (select auth.uid())::text
          or private.is_current_user_org_member(campaign_record.organization_id)
        )
    )
  );

drop policy if exists leads_member_access on public.leads;
create policy leads_member_access
  on public.leads
  for all
  to authenticated
  using (
    user_id = (select auth.uid())
    or assigned_user_id = (select auth.uid())
    or private.is_current_user_org_member(organization_id)
  )
  with check (
    user_id = (select auth.uid())
    or assigned_user_id = (select auth.uid())
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
          lead_record.user_id = (select auth.uid())
          or lead_record.assigned_user_id = (select auth.uid())
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
          lead_record.user_id = (select auth.uid())
          or lead_record.assigned_user_id = (select auth.uid())
          or private.is_current_user_org_member(lead_record.organization_id)
        )
    )
  );

drop policy if exists billing_subscriptions_member_select on public.billing_subscriptions;
create policy billing_subscriptions_member_select
  on public.billing_subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_current_user_org_member(organization_id));

drop policy if exists system_jobs_member_access on public.system_jobs;
create policy system_jobs_member_access
  on public.system_jobs
  for all
  to authenticated
  using (user_id = (select auth.uid()) or private.is_current_user_org_member(organization_id))
  with check (user_id = (select auth.uid()) or private.is_current_user_org_member(organization_id));

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
          job_record.user_id = (select auth.uid())
          or private.is_current_user_org_member(job_record.organization_id)
        )
    )
  );

drop policy if exists provider_usage_limits_member_select on public.provider_usage_limits;
create policy provider_usage_limits_member_select
  on public.provider_usage_limits
  for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_current_user_org_member(organization_id));

drop policy if exists provider_usage_events_member_select on public.provider_usage_events;
create policy provider_usage_events_member_select
  on public.provider_usage_events
  for select
  to authenticated
  using (user_id = (select auth.uid()) or private.is_current_user_org_member(organization_id));

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
          campaign_record.user_id::text = (select auth.uid())::text
          or campaign_record.owner_id = (select auth.uid())::text
          or private.is_current_user_org_member(campaign_record.organization_id)
        )
    )
  );

drop policy if exists user_credits_member_select on public.user_credits;
create policy user_credits_member_select
  on public.user_credits
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_credit_ledger_member_select on public.user_credit_ledger;
create policy user_credit_ledger_member_select
  on public.user_credit_ledger
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists agent_profiles_service_role_all on public.agent_profiles;
create policy agent_profiles_service_role_all
  on public.agent_profiles
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists lead_assignments_service_role_all on public.lead_assignments;
create policy lead_assignments_service_role_all
  on public.lead_assignments
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists lead_notifications_service_role_all on public.lead_notifications;
create policy lead_notifications_service_role_all
  on public.lead_notifications
  for all
  to service_role
  using (true)
  with check (true);

insert into public.app_schema_metadata (key, value)
values ('rls_and_fk_advisor_hardening_schema_version', '20260504220000')
on conflict (key) do update set value = excluded.value;
