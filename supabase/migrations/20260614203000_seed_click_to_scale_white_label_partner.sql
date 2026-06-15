with upserted_partner as (
  insert into public.partners (
    slug,
    brand_name,
    legal_name,
    logo_url,
    favicon_url,
    primary_color,
    secondary_color,
    accent_color,
    support_email,
    support_phone,
    commission_rate,
    default_timezone,
    status,
    powered_by_dealflow,
    updated_at
  )
  values (
    'click-to-scale',
    'Click to Scale',
    'Click to Scale',
    null,
    null,
    '#2DD4BF',
    '#05070D',
    '#38BDF8',
    'support@agentdealflow.io',
    null,
    0,
    'America/Toronto',
    'active',
    true,
    timezone('utc'::text, now())
  )
  on conflict (slug) do update
    set brand_name = excluded.brand_name,
        legal_name = excluded.legal_name,
        primary_color = excluded.primary_color,
        secondary_color = excluded.secondary_color,
        accent_color = excluded.accent_color,
        support_email = excluded.support_email,
        status = excluded.status,
        powered_by_dealflow = excluded.powered_by_dealflow,
        updated_at = timezone('utc'::text, now()),
        deleted_at = null
  returning id
)
insert into public.partner_branding (
  partner_id,
  theme_json,
  copy_json,
  email_branding_json,
  pricing_json,
  feature_flags_json,
  updated_at
)
select
  id,
  jsonb_build_object(
    'primary', '#2DD4BF',
    'secondary', '#05070D',
    'accent', '#38BDF8',
    'background', '#020617',
    'logoUrl', null,
    'faviconUrl', null
  ),
  jsonb_build_object(
    'displayName', 'Click to Scale',
    'productName', 'Click to Scale DealFlow',
    'checkoutHeadline', 'Click to Scale DealFlow'
  ),
  '{}'::jsonb,
  jsonb_build_object(
    'displayProductName', 'Click to Scale DealFlow',
    'checkoutHeadline', 'Click to Scale DealFlow',
    'visiblePlans', jsonb_build_array('performance', 'starter', 'pro'),
    'allowDefaultDealFlowPrices', true,
    'plans', '{}'::jsonb
  ),
  jsonb_build_object(
    'ghlSyncEnabled', true,
    'smsTemplate', 'click_to_scale_lead_alert',
    'billingOwner', 'dealflow'
  ),
  timezone('utc'::text, now())
from upserted_partner
on conflict (partner_id) do update
  set theme_json = excluded.theme_json,
      copy_json = excluded.copy_json,
      pricing_json = excluded.pricing_json,
      feature_flags_json = excluded.feature_flags_json,
      updated_at = timezone('utc'::text, now());

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260614203000')
on conflict (key) do update set value = excluded.value;
