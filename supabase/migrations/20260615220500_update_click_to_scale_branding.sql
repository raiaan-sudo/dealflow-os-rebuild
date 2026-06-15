update public.partners
set
  logo_url = '/partners/click-to-scale/logo.png',
  favicon_url = '/partners/click-to-scale/logo.png',
  primary_color = '#2999B6',
  secondary_color = '#00254E',
  accent_color = '#225273',
  updated_at = timezone('utc'::text, now())
where slug = 'click-to-scale';

update public.partner_configs
set
  logo_url = '/partners/click-to-scale/logo.png',
  favicon_url = '/partners/click-to-scale/logo.png',
  primary_color = '#2999B6',
  secondary_color = '#00254E',
  accent_color = '#225273',
  background_color = '#020610',
  updated_at = now()
where partner_id = 'click_to_scale';

update public.partner_branding
set
  theme_json = coalesce(theme_json, '{}'::jsonb)
    || jsonb_build_object(
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
  updated_at = timezone('utc'::text, now())
where partner_id in (
  select id from public.partners where slug = 'click-to-scale'
);

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260615220500')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
