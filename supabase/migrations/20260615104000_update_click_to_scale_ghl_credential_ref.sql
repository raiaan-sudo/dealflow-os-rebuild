update public.partner_ghl_config
set
  encrypted_credential_ref = 'CLICKTOSCALE_GHL_PRIVATE_INTEGRATION',
  updated_at = now()
where partner_id = 'click_to_scale';

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260615104000')
on conflict (key) do update
set
  value = excluded.value,
  updated_at = now();
