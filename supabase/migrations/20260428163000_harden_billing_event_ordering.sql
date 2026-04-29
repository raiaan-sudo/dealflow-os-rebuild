create or replace function public.apply_billing_subscription_webhook(
  p_organization_id uuid,
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_plan_tier text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_metadata jsonb,
  p_stripe_event_id text,
  p_stripe_event_created bigint
)
returns table (
  applied boolean,
  ignored_reason text,
  latest_event_created bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_event_created bigint := greatest(coalesce(p_stripe_event_created, 0), 0);
  stored_event_created bigint;
begin
  if p_organization_id is null then
    raise exception 'p_organization_id is required';
  end if;

  if p_stripe_subscription_id is null or length(trim(p_stripe_subscription_id)) = 0 then
    raise exception 'p_stripe_subscription_id is required';
  end if;

  insert into public.billing_subscriptions (
    organization_id,
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    plan_tier,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    metadata,
    stripe_latest_event_id,
    stripe_latest_event_created,
    updated_at
  )
  values (
    p_organization_id,
    p_user_id,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_price_id,
    coalesce(nullif(p_plan_tier, ''), 'starter'),
    coalesce(nullif(p_status, ''), 'inactive'),
    p_current_period_start,
    p_current_period_end,
    coalesce(p_cancel_at_period_end, false),
    coalesce(p_metadata, '{}'::jsonb),
    p_stripe_event_id,
    normalized_event_created,
    timezone('utc', now())
  )
  on conflict (organization_id) do update
  set user_id = excluded.user_id,
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_price_id = excluded.stripe_price_id,
      plan_tier = excluded.plan_tier,
      status = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      metadata = excluded.metadata,
      stripe_latest_event_id = excluded.stripe_latest_event_id,
      stripe_latest_event_created = excluded.stripe_latest_event_created,
      updated_at = timezone('utc', now())
  where public.billing_subscriptions.stripe_latest_event_created < excluded.stripe_latest_event_created
     or (
       public.billing_subscriptions.stripe_latest_event_created = excluded.stripe_latest_event_created
       and coalesce(public.billing_subscriptions.stripe_latest_event_id, '') < coalesce(excluded.stripe_latest_event_id, '')
     )
  returning stripe_latest_event_created
  into stored_event_created;

  if stored_event_created is not null then
    applied := true;
    ignored_reason := null;
    latest_event_created := stored_event_created;
    return next;
    return;
  end if;

  select stripe_latest_event_created
  into stored_event_created
  from public.billing_subscriptions
  where organization_id = p_organization_id;

  applied := false;
  ignored_reason := 'stale_event';
  latest_event_created := stored_event_created;
  return next;
end;
$$;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260428163000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
