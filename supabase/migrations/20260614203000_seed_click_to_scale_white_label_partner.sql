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
    '/partners/click-to-scale/logo.png',
    '/partners/click-to-scale/logo.png',
    '#2999B6',
    '#00254E',
    '#225273',
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
        logo_url = excluded.logo_url,
        favicon_url = excluded.favicon_url,
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
    'primary', '#2999B6',
    'primaryColor', '#2999B6',
    'secondary', '#00254E',
    'secondaryColor', '#00254E',
    'accent', '#225273',
    'accentColor', '#225273',
    'background', '#020610',
    'backgroundColor', '#020610',
    'gradientFrom', '#2999B6',
    'gradientTo', '#4AB6D8',
    'logoUrl', '/partners/click-to-scale/logo.png',
    'faviconUrl', '/partners/click-to-scale/logo.png'
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
