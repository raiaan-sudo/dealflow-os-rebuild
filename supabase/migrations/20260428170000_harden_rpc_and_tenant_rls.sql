revoke execute on function public.consume_rate_limit_bucket(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit_bucket(text, integer, integer) to service_role;

revoke execute on function public.reserve_provider_usage(uuid, uuid, uuid, text, text, integer, text, numeric) from public, anon, authenticated;
grant execute on function public.reserve_provider_usage(uuid, uuid, uuid, text, text, integer, text, numeric) to service_role;

revoke execute on function public.claim_next_system_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_next_system_job(text, integer) to service_role;

revoke execute on function public.apply_billing_subscription_webhook(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  boolean,
  jsonb,
  text,
  bigint
) from public, anon, authenticated;
grant execute on function public.apply_billing_subscription_webhook(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  boolean,
  jsonb,
  text,
  bigint
) to service_role;

create or replace function public.is_current_user_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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
$$;

revoke execute on function public.is_current_user_org_member(uuid) from public, anon;
grant execute on function public.is_current_user_org_member(uuid) to authenticated, service_role;

alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.campaign_plans enable row level security;
alter table public.leads enable row level security;
alter table public.lead_messages enable row level security;
alter table public.marketing_accounts enable row level security;
alter table public.creative_assets enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.system_jobs enable row level security;
alter table public.system_job_logs enable row level security;
alter table public.provider_usage_limits enable row level security;
alter table public.provider_usage_events enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.meta_launch_locks enable row level security;

alter table public.users force row level security;
alter table public.organizations force row level security;
alter table public.organization_memberships force row level security;
alter table public.campaign_plans force row level security;
alter table public.leads force row level security;
alter table public.lead_messages force row level security;
alter table public.marketing_accounts force row level security;
alter table public.creative_assets force row level security;
alter table public.billing_subscriptions force row level security;
alter table public.system_jobs force row level security;
alter table public.system_job_logs force row level security;
alter table public.provider_usage_limits force row level security;
alter table public.provider_usage_events force row level security;
alter table public.stripe_webhook_events force row level security;
alter table public.meta_launch_locks force row level security;

drop policy if exists users_select_self on public.users;
create policy users_select_self
  on public.users
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists users_update_self on public.users;
create policy users_update_self
  on public.users
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
  on public.organizations
  for select
  to authenticated
  using (owner_user_id = auth.uid() or public.is_current_user_org_member(id));

drop policy if exists organizations_update_owner on public.organizations;
create policy organizations_update_owner
  on public.organizations
  for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists organization_memberships_select_member on public.organization_memberships;
create policy organization_memberships_select_member
  on public.organization_memberships
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_current_user_org_member(organization_id));

drop policy if exists organization_memberships_insert_self on public.organization_memberships;
create policy organization_memberships_insert_self
  on public.organization_memberships
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists campaign_plans_member_access on public.campaign_plans;
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

drop policy if exists leads_member_access on public.leads;
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

drop policy if exists marketing_accounts_member_access on public.marketing_accounts;
create policy marketing_accounts_member_access
  on public.marketing_accounts
  for all
  to authenticated
  using (public.is_current_user_org_member(organization_id))
  with check (public.is_current_user_org_member(organization_id));

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

drop policy if exists billing_subscriptions_member_select on public.billing_subscriptions;
create policy billing_subscriptions_member_select
  on public.billing_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_current_user_org_member(organization_id));

drop policy if exists system_jobs_member_access on public.system_jobs;
create policy system_jobs_member_access
  on public.system_jobs
  for all
  to authenticated
  using (user_id = auth.uid() or public.is_current_user_org_member(organization_id))
  with check (user_id = auth.uid() or public.is_current_user_org_member(organization_id));

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
          or public.is_current_user_org_member(job_record.organization_id)
        )
    )
  );

drop policy if exists provider_usage_limits_member_select on public.provider_usage_limits;
create policy provider_usage_limits_member_select
  on public.provider_usage_limits
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_current_user_org_member(organization_id));

drop policy if exists provider_usage_events_member_select on public.provider_usage_events;
create policy provider_usage_events_member_select
  on public.provider_usage_events
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_current_user_org_member(organization_id));

drop policy if exists stripe_webhook_events_member_select on public.stripe_webhook_events;
create policy stripe_webhook_events_member_select
  on public.stripe_webhook_events
  for select
  to authenticated
  using (organization_id is not null and public.is_current_user_org_member(organization_id));

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
          or public.is_current_user_org_member(campaign_record.organization_id)
        )
    )
  );

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260428170000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
