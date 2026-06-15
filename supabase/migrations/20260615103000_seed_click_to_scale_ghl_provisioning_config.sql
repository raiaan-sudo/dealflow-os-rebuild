insert into public.partner_configs (
  partner_id,
  display_name,
  product_name,
  legal_fallback_name,
  support_email,
  support_phone,
  primary_color,
  secondary_color,
  accent_color,
  background_color,
  logo_url,
  favicon_url,
  billing_owner,
  stripe_partner_metadata,
  ghl_enabled,
  ghl_default_pipeline_id,
  ghl_default_stage_id,
  ghl_default_tags,
  sms_template,
  updated_at
) values (
  'click_to_scale',
  'Click to Scale',
  'Click to Scale DealFlow',
  'DealFlow',
  'support@agentdealflow.io',
  null,
  '#2999B6',
  '#00254E',
  '#225273',
  '#020610',
  '/partners/click-to-scale/logo.png',
  '/partners/click-to-scale/logo.png',
  'dealflow',
  'click_to_scale',
  true,
  null,
  null,
  '["DealFlow", "Click to Scale", "New Lead"]'::jsonb,
  'click_to_scale_lead_alert',
  now()
)
on conflict (partner_id) do update set
  display_name = excluded.display_name,
  product_name = excluded.product_name,
  legal_fallback_name = excluded.legal_fallback_name,
  support_email = excluded.support_email,
  logo_url = excluded.logo_url,
  favicon_url = excluded.favicon_url,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  accent_color = excluded.accent_color,
  background_color = excluded.background_color,
  billing_owner = excluded.billing_owner,
  stripe_partner_metadata = excluded.stripe_partner_metadata,
  ghl_enabled = excluded.ghl_enabled,
  ghl_default_tags = excluded.ghl_default_tags,
  sms_template = excluded.sms_template,
  updated_at = now();

insert into public.partner_ghl_config (
  partner_id,
  enabled,
  auth_type,
  encrypted_credential_ref,
  agency_id,
  company_id,
  default_location_id,
  default_pipeline_id,
  default_stage_id,
  default_tags,
  default_source,
  updated_at
) values (
  'click_to_scale',
  true,
  'private_integration_token',
  'CLICKTOSCALE_GHL_PRIVATE_INTEGRATION',
  null,
  null,
  null,
  null,
  null,
  '["DealFlow", "Click to Scale", "New Lead"]'::jsonb,
  'DealFlow / Click to Scale',
  now()
)
on conflict (partner_id) do update set
  enabled = true,
  auth_type = excluded.auth_type,
  encrypted_credential_ref = excluded.encrypted_credential_ref,
  default_tags = excluded.default_tags,
  default_source = excluded.default_source,
  updated_at = now();

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260615103000')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
