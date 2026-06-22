create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  brand_name text not null,
  legal_name text null,
  logo_url text null,
  favicon_url text null,
  primary_color text not null default '#67e8f9',
  secondary_color text null,
  accent_color text null,
  support_email text null,
  support_phone text null,
  commission_rate numeric(6, 4) not null default 0,
  default_timezone text not null default 'America/Toronto',
  status text not null default 'draft',
  powered_by_dealflow boolean not null default true,
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz null,
  constraint partners_slug_unique unique (slug),
  constraint partners_status_check check (status in ('draft', 'active', 'paused', 'archived')),
  constraint partners_slug_check check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$')
);

create table if not exists public.partner_domains (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  domain text not null,
  type text not null default 'primary',
  verification_status text not null default 'pending',
  ssl_status text not null default 'unknown',
  verification_token text not null default encode(gen_random_bytes(24), 'hex'),
  dns_target text null,
  last_checked_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz null,
  constraint partner_domains_domain_unique unique (domain),
  constraint partner_domains_type_check check (type in ('primary', 'redirect', 'preview')),
  constraint partner_domains_verification_status_check check (verification_status in ('pending', 'verified', 'failed', 'disabled')),
  constraint partner_domains_ssl_status_check check (ssl_status in ('pending', 'active', 'failed', 'unknown')),
  constraint partner_domains_domain_check check (domain = lower(domain) and domain !~ '^https?://')
);

create table if not exists public.partner_branding (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  theme_json jsonb not null default '{}'::jsonb,
  copy_json jsonb not null default '{}'::jsonb,
  email_branding_json jsonb not null default '{}'::jsonb,
  pricing_json jsonb not null default '{}'::jsonb,
  feature_flags_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint partner_branding_partner_unique unique (partner_id)
);

create table if not exists public.partner_memberships (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'partner_viewer',
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint partner_memberships_partner_user_unique unique (partner_id, user_id),
  constraint partner_memberships_role_check check (role in ('partner_admin', 'partner_sales_rep', 'partner_support', 'partner_viewer')),
  constraint partner_memberships_status_check check (status in ('active', 'invited', 'disabled'))
);

create table if not exists public.partner_invites (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  code text not null,
  email text null,
  role text null,
  attribution_source text null,
  max_uses integer null,
  use_count integer not null default 0,
  expires_at timestamptz null,
  used_at timestamptz null,
  used_by_user_id uuid null references auth.users (id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint partner_invites_code_unique unique (code),
  constraint partner_invites_role_check check (role is null or role in ('partner_admin', 'partner_sales_rep', 'partner_support', 'partner_viewer')),
  constraint partner_invites_status_check check (status in ('active', 'used', 'expired', 'revoked')),
  constraint partner_invites_max_uses_check check (max_uses is null or max_uses > 0),
  constraint partner_invites_use_count_check check (use_count >= 0)
);

create table if not exists public.partner_accounts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  account_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid null references auth.users (id) on delete set null,
  attribution_source text not null,
  attribution_detail text null,
  locked boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint partner_accounts_account_unique unique (account_id),
  constraint partner_accounts_source_check check (attribution_source in ('domain', 'slug', 'invite', 'admin', 'import'))
);

create table if not exists public.partner_billing_attribution (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  account_id uuid not null references public.organizations (id) on delete cascade,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  stripe_invoice_id text null,
  pricing_plan_key text null,
  attribution_source text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.partner_commission_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  account_id uuid not null references public.organizations (id) on delete cascade,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  stripe_invoice_id text null,
  event_type text not null,
  gross_amount integer not null default 0,
  net_amount integer null,
  commission_rate numeric(6, 4) not null default 0,
  commission_amount integer not null default 0,
  currency text not null default 'usd',
  status text not null default 'pending',
  notes text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint partner_commission_events_event_type_check check (event_type in ('invoice_paid', 'refund', 'dispute', 'cancellation', 'failed_payment', 'manual_adjustment', 'void')),
  constraint partner_commission_events_status_check check (status in ('pending', 'approved', 'paid', 'void'))
);

create table if not exists public.partner_audit_logs (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid null references public.partners (id) on delete set null,
  actor_user_id uuid null references auth.users (id) on delete set null,
  actor_role text null,
  action text not null,
  target_type text not null,
  target_id text null,
  metadata_json jsonb not null default '{}'::jsonb,
  ip_address text null,
  user_agent text null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.partner_vertical_configs (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid null references public.partners (id) on delete cascade,
  vertical_key text not null default 'real_estate_agent',
  campaign_templates_json jsonb not null default '{}'::jsonb,
  funnel_templates_json jsonb not null default '{}'::jsonb,
  lead_form_schema_json jsonb not null default '{}'::jsonb,
  creative_prompt_templates_json jsonb not null default '{}'::jsonb,
  copy_rules_json jsonb not null default '{}'::jsonb,
  compliance_rules_json jsonb not null default '{}'::jsonb,
  dashboard_labels_json jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint partner_vertical_configs_key_check check (vertical_key in ('real_estate_agent', 'real_estate_wholesaler')),
  constraint partner_vertical_configs_status_check check (status in ('active', 'paused', 'archived')),
  constraint partner_vertical_configs_scope_unique unique (partner_id, vertical_key)
);

create unique index if not exists partner_vertical_configs_native_unique
  on public.partner_vertical_configs (vertical_key)
  where partner_id is null;

create table if not exists public.partner_support_settings (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  support_mode text not null default 'dealflow_first',
  support_email text null,
  support_phone text null,
  escalation_email text null,
  support_footer_copy text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint partner_support_settings_partner_unique unique (partner_id),
  constraint partner_support_settings_mode_check check (support_mode in ('partner_first', 'dealflow_first', 'hybrid'))
);

create table if not exists public.partner_feature_flags (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  flag_key text not null,
  enabled boolean not null default false,
  config_json jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint partner_feature_flags_partner_key_unique unique (partner_id, flag_key)
);

alter table if exists public.organizations add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.users add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.campaign_plans add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.leads add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.lead_messages add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.marketing_accounts add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.creative_assets add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.billing_subscriptions add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.billing_cancellation_intents add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.stripe_webhook_events add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.system_jobs add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.provider_usage_events add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.provider_usage_limits add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.client_error_events add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.activation_events add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.lead_billing_events add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.customer_success_checklists add column if not exists partner_id uuid null references public.partners (id) on delete set null;
alter table if exists public.campaign_sync_snapshots add column if not exists partner_id uuid null references public.partners (id) on delete set null;

create index if not exists partners_status_idx on public.partners (status, created_at desc);
create index if not exists partner_domains_partner_idx on public.partner_domains (partner_id, verification_status);
create index if not exists partner_memberships_partner_user_idx on public.partner_memberships (partner_id, user_id);
create index if not exists partner_memberships_user_idx on public.partner_memberships (user_id, status);
create index if not exists partner_accounts_account_idx on public.partner_accounts (account_id);
create index if not exists partner_accounts_partner_account_idx on public.partner_accounts (partner_id, account_id);
create index if not exists partner_billing_attribution_customer_idx on public.partner_billing_attribution (stripe_customer_id) where stripe_customer_id is not null;
create index if not exists partner_billing_attribution_subscription_idx on public.partner_billing_attribution (stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists partner_billing_attribution_invoice_idx on public.partner_billing_attribution (stripe_invoice_id) where stripe_invoice_id is not null;
create index if not exists partner_commission_events_partner_status_idx on public.partner_commission_events (partner_id, status, created_at desc);
create unique index if not exists partner_commission_events_invoice_event_unique
  on public.partner_commission_events (partner_id, stripe_invoice_id, event_type)
  where stripe_invoice_id is not null;
create index if not exists partner_audit_logs_partner_created_idx on public.partner_audit_logs (partner_id, created_at desc);

create index if not exists organizations_partner_idx on public.organizations (partner_id) where partner_id is not null;
create index if not exists users_partner_idx on public.users (partner_id) where partner_id is not null;
create index if not exists campaign_plans_partner_idx on public.campaign_plans (partner_id) where partner_id is not null;
create index if not exists leads_partner_idx on public.leads (partner_id) where partner_id is not null;
create index if not exists creative_assets_partner_idx on public.creative_assets (partner_id) where partner_id is not null;
create index if not exists billing_subscriptions_partner_idx on public.billing_subscriptions (partner_id) where partner_id is not null;

create or replace function public.is_current_user_partner_member(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.partner_memberships membership_record
    where membership_record.partner_id = p_partner_id
      and membership_record.user_id = auth.uid()
      and membership_record.status = 'active'
  );
$$;

revoke execute on function public.is_current_user_partner_member(uuid) from public, anon;
grant execute on function public.is_current_user_partner_member(uuid) to authenticated, service_role;

alter table public.partners enable row level security;
alter table public.partner_domains enable row level security;
alter table public.partner_branding enable row level security;
alter table public.partner_memberships enable row level security;
alter table public.partner_invites enable row level security;
alter table public.partner_accounts enable row level security;
alter table public.partner_billing_attribution enable row level security;
alter table public.partner_commission_events enable row level security;
alter table public.partner_audit_logs enable row level security;
alter table public.partner_vertical_configs enable row level security;
alter table public.partner_support_settings enable row level security;
alter table public.partner_feature_flags enable row level security;

alter table public.partners force row level security;
alter table public.partner_domains force row level security;
alter table public.partner_branding force row level security;
alter table public.partner_memberships force row level security;
alter table public.partner_invites force row level security;
alter table public.partner_accounts force row level security;
alter table public.partner_billing_attribution force row level security;
alter table public.partner_commission_events force row level security;
alter table public.partner_audit_logs force row level security;
alter table public.partner_vertical_configs force row level security;
alter table public.partner_support_settings force row level security;
alter table public.partner_feature_flags force row level security;

drop policy if exists partners_member_select on public.partners;
create policy partners_member_select
  on public.partners
  for select
  to authenticated
  using (public.is_current_user_partner_member(id));

drop policy if exists partner_domains_member_select on public.partner_domains;
create policy partner_domains_member_select
  on public.partner_domains
  for select
  to authenticated
  using (public.is_current_user_partner_member(partner_id));

drop policy if exists partner_branding_member_select on public.partner_branding;
create policy partner_branding_member_select
  on public.partner_branding
  for select
  to authenticated
  using (public.is_current_user_partner_member(partner_id));

drop policy if exists partner_memberships_member_select on public.partner_memberships;
create policy partner_memberships_member_select
  on public.partner_memberships
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_current_user_partner_member(partner_id));

drop policy if exists partner_accounts_member_select on public.partner_accounts;
create policy partner_accounts_member_select
  on public.partner_accounts
  for select
  to authenticated
  using (public.is_current_user_partner_member(partner_id));

drop policy if exists partner_billing_attribution_member_select on public.partner_billing_attribution;
create policy partner_billing_attribution_member_select
  on public.partner_billing_attribution
  for select
  to authenticated
  using (public.is_current_user_partner_member(partner_id));

drop policy if exists partner_commission_events_member_select on public.partner_commission_events;
create policy partner_commission_events_member_select
  on public.partner_commission_events
  for select
  to authenticated
  using (public.is_current_user_partner_member(partner_id));

drop policy if exists partner_audit_logs_member_select on public.partner_audit_logs;
create policy partner_audit_logs_member_select
  on public.partner_audit_logs
  for select
  to authenticated
  using (partner_id is not null and public.is_current_user_partner_member(partner_id));

drop policy if exists partner_vertical_configs_member_select on public.partner_vertical_configs;
create policy partner_vertical_configs_member_select
  on public.partner_vertical_configs
  for select
  to authenticated
  using (partner_id is null or public.is_current_user_partner_member(partner_id));

drop policy if exists partner_support_settings_member_select on public.partner_support_settings;
create policy partner_support_settings_member_select
  on public.partner_support_settings
  for select
  to authenticated
  using (public.is_current_user_partner_member(partner_id));

drop policy if exists partner_feature_flags_member_select on public.partner_feature_flags;
create policy partner_feature_flags_member_select
  on public.partner_feature_flags
  for select
  to authenticated
  using (public.is_current_user_partner_member(partner_id));

insert into public.partner_vertical_configs (partner_id, vertical_key, campaign_templates_json, funnel_templates_json, lead_form_schema_json, creative_prompt_templates_json, copy_rules_json, compliance_rules_json, dashboard_labels_json, status)
values (
  null,
  'real_estate_agent',
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{"forbidden_discriminatory_housing_copy": true}'::jsonb,
  '{"meta_special_ad_category": "HOUSING"}'::jsonb,
  '{"customer": "Agent", "lead": "Lead"}'::jsonb,
  'active'
)
on conflict (vertical_key) where partner_id is null do update
set updated_at = timezone('utc', now());

insert into public.app_schema_metadata (key, value)
values ('white_label_schema_version', '20260531160000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
