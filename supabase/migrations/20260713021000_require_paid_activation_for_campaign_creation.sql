-- Keep the database campaign-creation gate aligned with the application billing
-- truth: an active plan is not commercially activated until a qualifying paid
-- Stripe event (or an explicit legacy reconciliation) exists.
create or replace function public.create_campaign_plan_with_entitlement_v1(
  p_campaign_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_plan jsonb,
  p_launch_status text default null,
  p_lead_loop_verified boolean default false,
  p_public_slug text default null
)
returns setof public.campaign_plans
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_campaign public.campaign_plans%rowtype;
  created_campaign public.campaign_plans%rowtype;
  campaign_count bigint := 0;
  billing_count bigint := 0;
  billing_plan_tier text := null;
  billing_status text := null;
  billing_period_end timestamptz := null;
  billing_cancel_at_period_end boolean := false;
  billing_metadata jsonb := '{}'::jsonb;
  commercially_activated boolean := false;
  has_unlimited_campaigns boolean := false;
begin
  if p_campaign_id is null or p_organization_id is null or p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'campaign_creation_identity_required';
  end if;

  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'campaign_creation_plan_required';
  end if;

  -- Serialize exact replay, entitlement evaluation, count, and insert per
  -- organization. No application preflight can replace this transaction lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text, 492724601)
  );

  if not exists (
    select 1
    from public.organizations organization_record
    where organization_record.id = p_organization_id
      and organization_record.owner_user_id = p_user_id
  ) and not exists (
    select 1
    from public.organization_memberships membership_record
    where membership_record.organization_id = p_organization_id
      and membership_record.user_id = p_user_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'campaign_creation_actor_not_member';
  end if;

  select candidate.*
  into existing_campaign
  from public.campaign_plans candidate
  where candidate.id = p_campaign_id;

  if found then
    if existing_campaign.organization_id is distinct from p_organization_id
       or existing_campaign.user_id is distinct from p_user_id then
      raise exception using
        errcode = '23505',
        message = 'campaign_creation_identity_collision';
    end if;

    -- Exact tenant/user identity replay is read-only and remains allowed even
    -- when current billing cannot authorize a new campaign.
    return next existing_campaign;
    return;
  end if;

  select count(*)
  into billing_count
  from public.billing_subscriptions subscription_record
  where subscription_record.organization_id = p_organization_id;

  if billing_count > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'campaign_creation_billing_ambiguous';
  end if;

  select
    lower(trim(subscription_record.plan_tier)),
    lower(trim(subscription_record.status)),
    subscription_record.current_period_end,
    subscription_record.cancel_at_period_end,
    coalesce(subscription_record.metadata, '{}'::jsonb)
  into
    billing_plan_tier,
    billing_status,
    billing_period_end,
    billing_cancel_at_period_end,
    billing_metadata
  from public.billing_subscriptions subscription_record
  where subscription_record.organization_id = p_organization_id;

  commercially_activated := exists (
    select 1
    from public.commercial_activations activation_record
    where activation_record.organization_id = p_organization_id
  ) or coalesce(billing_metadata ->> 'legacy_commercial_activation_reconciled', '') = 'true';

  has_unlimited_campaigns := coalesce(
    commercially_activated
      and billing_plan_tier in ('pro', 'growth')
      and billing_status in ('active', 'trialing')
      and not (
        billing_cancel_at_period_end
        and billing_period_end is not null
        and billing_period_end <= now()
      ),
    false
  );

  select count(*)
  into campaign_count
  from public.campaign_plans campaign_record
  where campaign_record.organization_id = p_organization_id;

  if not has_unlimited_campaigns and campaign_count >= 1 then
    raise exception using
      errcode = 'P0001',
      message = 'campaign_preview_limit_reached';
  end if;

  insert into public.campaign_plans (
    id,
    owner_id,
    organization_id,
    user_id,
    plan,
    launch_status,
    lead_loop_verified,
    public_slug
  ) values (
    p_campaign_id,
    p_organization_id::text,
    p_organization_id,
    p_user_id,
    p_plan,
    nullif(trim(p_launch_status), ''),
    coalesce(p_lead_loop_verified, false),
    nullif(trim(p_public_slug), '')
  )
  returning * into created_campaign;

  return next created_campaign;
end;
$$;

revoke execute on function public.create_campaign_plan_with_entitlement_v1(
  uuid,
  uuid,
  uuid,
  jsonb,
  text,
  boolean,
  text
) from public, anon, authenticated;
grant execute on function public.create_campaign_plan_with_entitlement_v1(
  uuid,
  uuid,
  uuid,
  jsonb,
  text,
  boolean,
  text
) to service_role;

comment on function public.create_campaign_plan_with_entitlement_v1(
  uuid,
  uuid,
  uuid,
  jsonb,
  text,
  boolean,
  text
) is
  'Atomically creates or exactly reuses a tenant-bound campaign; more than one campaign requires current eligible billing plus durable commercial activation authority.';

insert into public.app_schema_metadata(key, value)
values ('schema_version', '20260713021000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());

do $$
begin
  if to_regprocedure(
    'public.create_campaign_plan_with_entitlement_v1(uuid,uuid,uuid,jsonb,text,boolean,text)'
  ) is null then
    raise exception '20260713021000 postcondition failed: entitlement RPC is missing';
  end if;
  if has_function_privilege(
       'anon',
       'public.create_campaign_plan_with_entitlement_v1(uuid,uuid,uuid,jsonb,text,boolean,text)',
       'EXECUTE'
     ) or has_function_privilege(
       'authenticated',
       'public.create_campaign_plan_with_entitlement_v1(uuid,uuid,uuid,jsonb,text,boolean,text)',
       'EXECUTE'
     ) then
    raise exception '20260713021000 postcondition failed: entitlement RPC leaked';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.create_campaign_plan_with_entitlement_v1(uuid,uuid,uuid,jsonb,text,boolean,text)',
    'EXECUTE'
  ) then
    raise exception '20260713021000 postcondition failed: service role cannot execute entitlement RPC';
  end if;
  if not exists (
    select 1 from public.app_schema_metadata metadata
    where metadata.key = 'schema_version'
      and metadata.value = '20260713021000'
  ) then
    raise exception '20260713021000 postcondition failed: schema version was not advanced';
  end if;
end;
$$;
