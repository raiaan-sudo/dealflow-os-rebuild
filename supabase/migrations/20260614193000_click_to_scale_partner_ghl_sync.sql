create table if not exists public.partner_configs (
  partner_id text primary key,
  display_name text not null,
  product_name text not null,
  legal_fallback_name text not null default 'DealFlow',
  support_email text not null,
  support_phone text null,
  primary_color text not null,
  secondary_color text not null,
  accent_color text not null,
  background_color text not null,
  logo_url text null,
  favicon_url text null,
  billing_owner text not null default 'dealflow',
  stripe_partner_metadata text not null,
  ghl_enabled boolean not null default false,
  ghl_default_pipeline_id text null,
  ghl_default_stage_id text null,
  ghl_default_tags jsonb not null default '[]'::jsonb,
  sms_template text not null default 'default',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_configs_billing_owner_check check (billing_owner = 'dealflow'),
  constraint partner_configs_sms_template_check check (sms_template in ('default', 'click_to_scale_lead_alert'))
);

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
  '#2DD4BF',
  '#05070D',
  '#38BDF8',
  '#020617',
  null,
  null,
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

create table if not exists public.partner_ghl_config (
  id uuid primary key default gen_random_uuid(),
  partner_id text not null references public.partner_configs(partner_id) on delete cascade,
  enabled boolean not null default false,
  auth_type text not null default 'private_integration_token',
  encrypted_credential_ref text not null,
  agency_id text null,
  company_id text null,
  default_location_id text null,
  default_pipeline_id text null,
  default_stage_id text null,
  default_tags jsonb not null default '[]'::jsonb,
  default_source text not null default 'DealFlow / Click to Scale',
  rate_limit_policy jsonb not null default '{"requests_per_10s":100,"requests_per_day":200000,"backoff":"exponential"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_ghl_config_auth_type_check check (auth_type in ('private_integration_token', 'oauth'))
);

create unique index if not exists partner_ghl_config_partner_unique
  on public.partner_ghl_config(partner_id);

create table if not exists public.workspace_ghl_mapping (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations(id) on delete cascade,
  partner_id text not null references public.partner_configs(partner_id) on delete cascade,
  ghl_location_id text not null,
  ghl_pipeline_id text null,
  ghl_stage_id text null,
  sync_enabled boolean not null default true,
  assigned_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_ghl_mapping_workspace_destination_unique
  on public.workspace_ghl_mapping(workspace_id, partner_id);

create index if not exists workspace_ghl_mapping_partner_idx
  on public.workspace_ghl_mapping(partner_id);

create table if not exists public.workspace_partner_attribution (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations(id) on delete cascade,
  partner_id text not null references public.partner_configs(partner_id) on delete cascade,
  source text not null default 'admin',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  assigned_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_partner_attribution_workspace_unique
  on public.workspace_partner_attribution(workspace_id);

create index if not exists workspace_partner_attribution_partner_idx
  on public.workspace_partner_attribution(partner_id, active);

create table if not exists public.lead_crm_sync_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  workspace_id uuid not null references public.organizations(id) on delete cascade,
  partner_id text not null references public.partner_configs(partner_id) on delete cascade,
  destination text not null default 'gohighlevel',
  ghl_location_id text null,
  ghl_contact_id text null,
  ghl_opportunity_id text null,
  status text not null default 'queued',
  idempotency_key text not null,
  attempt_count integer not null default 0,
  last_error_code text null,
  last_error_message text null,
  next_retry_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_crm_sync_events_destination_check check (destination in ('gohighlevel')),
  constraint lead_crm_sync_events_status_check check (status in ('queued', 'processing', 'synced', 'failed', 'dead_letter', 'skipped'))
);

create unique index if not exists lead_crm_sync_events_idempotency_unique
  on public.lead_crm_sync_events(idempotency_key);

create index if not exists lead_crm_sync_events_workspace_status_idx
  on public.lead_crm_sync_events(workspace_id, status, created_at desc);

create index if not exists lead_crm_sync_events_partner_status_idx
  on public.lead_crm_sync_events(partner_id, status, created_at desc);

create index if not exists lead_crm_sync_events_next_retry_idx
  on public.lead_crm_sync_events(status, next_retry_at)
  where status in ('queued', 'failed');

alter table public.partner_configs enable row level security;
alter table public.partner_ghl_config enable row level security;
alter table public.workspace_ghl_mapping enable row level security;
alter table public.workspace_partner_attribution enable row level security;
alter table public.lead_crm_sync_events enable row level security;

alter table public.partner_configs force row level security;
alter table public.partner_ghl_config force row level security;
alter table public.workspace_ghl_mapping force row level security;
alter table public.workspace_partner_attribution force row level security;
alter table public.lead_crm_sync_events force row level security;

drop policy if exists partner_configs_service_role_all on public.partner_configs;
create policy partner_configs_service_role_all
  on public.partner_configs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists partner_configs_authenticated_select on public.partner_configs;
create policy partner_configs_authenticated_select
  on public.partner_configs
  for select
  to authenticated
  using (true);

drop policy if exists partner_ghl_config_service_role_all on public.partner_ghl_config;
create policy partner_ghl_config_service_role_all
  on public.partner_ghl_config
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists workspace_ghl_mapping_service_role_all on public.workspace_ghl_mapping;
create policy workspace_ghl_mapping_service_role_all
  on public.workspace_ghl_mapping
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists workspace_ghl_mapping_member_select on public.workspace_ghl_mapping;
create policy workspace_ghl_mapping_member_select
  on public.workspace_ghl_mapping
  for select
  to authenticated
  using (private.is_current_user_org_member(workspace_id));

drop policy if exists workspace_partner_attribution_service_role_all on public.workspace_partner_attribution;
create policy workspace_partner_attribution_service_role_all
  on public.workspace_partner_attribution
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists workspace_partner_attribution_member_select on public.workspace_partner_attribution;
create policy workspace_partner_attribution_member_select
  on public.workspace_partner_attribution
  for select
  to authenticated
  using (private.is_current_user_org_member(workspace_id));

drop policy if exists lead_crm_sync_events_service_role_all on public.lead_crm_sync_events;
create policy lead_crm_sync_events_service_role_all
  on public.lead_crm_sync_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists lead_crm_sync_events_member_select on public.lead_crm_sync_events;
create policy lead_crm_sync_events_member_select
  on public.lead_crm_sync_events
  for select
  to authenticated
  using (private.is_current_user_org_member(workspace_id));

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260614193000')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
