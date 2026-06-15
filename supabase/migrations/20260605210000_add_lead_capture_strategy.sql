alter table public.campaign_plans
  add column if not exists lead_capture_goal text not null default 'quality'
    check (lead_capture_goal in ('quality', 'balanced', 'volume')),
  add column if not exists capture_method text not null default 'website_funnel'
    check (capture_method in ('website_funnel', 'meta_instant_form')),
  add column if not exists form_friction_level text not null default 'high'
    check (form_friction_level in ('low', 'medium', 'high')),
  add column if not exists lead_form_template_id text null,
  add column if not exists meta_lead_form_id text null,
  add column if not exists funnel_id text null,
  add column if not exists privacy_policy_url text null,
  add column if not exists terms_url text null,
  add column if not exists sms_consent_enabled boolean not null default true,
  add column if not exists lead_delivery_destination text not null default 'dealflow_dashboard'
    check (lead_delivery_destination in ('dealflow_dashboard', 'csv_export', 'crm_later', 'webhook_later', 'operator_notification_later')),
  add column if not exists special_ad_category text not null default 'HOUSING'
    check (special_ad_category in ('HOUSING', 'NONE')),
  add column if not exists lead_capture_status text not null default 'draft'
    check (lead_capture_status in ('not_configured', 'draft', 'ready', 'blocked', 'created', 'live', 'error')),
  add column if not exists lead_capture_ready_at timestamptz null,
  add column if not exists lead_capture_last_error text null;

create index if not exists campaign_plans_lead_capture_idx
  on public.campaign_plans (organization_id, capture_method, lead_capture_status, created_at desc);

create table if not exists public.lead_form_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete cascade,
  partner_id uuid null,
  template_key text not null,
  name text not null,
  lead_capture_goal text not null check (lead_capture_goal in ('quality', 'balanced', 'volume')),
  capture_method text not null check (capture_method in ('website_funnel', 'meta_instant_form')),
  form_friction_level text not null check (form_friction_level in ('low', 'medium', 'high')),
  questions_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint lead_form_templates_unique_org_key unique (organization_id, template_key)
);

create index if not exists lead_form_templates_org_goal_idx
  on public.lead_form_templates (organization_id, lead_capture_goal, active);

alter table public.lead_form_templates enable row level security;
alter table public.lead_form_templates force row level security;

drop policy if exists lead_form_templates_member_select on public.lead_form_templates;
create policy lead_form_templates_member_select
  on public.lead_form_templates
  for select
  to authenticated
  using (organization_id is null or private.is_current_user_org_member(organization_id));

drop policy if exists lead_form_templates_service_role_all on public.lead_form_templates;
create policy lead_form_templates_service_role_all
  on public.lead_form_templates
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.campaign_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  lead_capture_goal text not null check (lead_capture_goal in ('quality', 'balanced', 'volume')),
  capture_method text not null check (capture_method in ('website_funnel', 'meta_instant_form')),
  source text not null default 'website_funnel',
  source_lead_id text null,
  dedupe_key text not null,
  full_name text null,
  email text null,
  phone text null,
  answers_json jsonb not null default '{}'::jsonb,
  qualification_score integer not null default 0 check (qualification_score >= 0 and qualification_score <= 100),
  qualified boolean not null default false,
  qualification_json jsonb not null default '{}'::jsonb,
  attribution_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint campaign_leads_dedupe_unique unique (dedupe_key)
);

create index if not exists campaign_leads_org_created_idx
  on public.campaign_leads (organization_id, created_at desc);

create index if not exists campaign_leads_campaign_created_idx
  on public.campaign_leads (campaign_id, created_at desc);

create index if not exists campaign_leads_qualified_idx
  on public.campaign_leads (organization_id, qualified, created_at desc);

alter table public.campaign_leads enable row level security;
alter table public.campaign_leads force row level security;

drop policy if exists campaign_leads_member_select on public.campaign_leads;
create policy campaign_leads_member_select
  on public.campaign_leads
  for select
  to authenticated
  using (private.is_current_user_org_member(organization_id));

drop policy if exists campaign_leads_service_role_all on public.campaign_leads;
create policy campaign_leads_service_role_all
  on public.campaign_leads
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.lead_capture_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  campaign_lead_id uuid null references public.campaign_leads(id) on delete set null,
  event_type text not null,
  capture_method text not null check (capture_method in ('website_funnel', 'meta_instant_form')),
  idempotency_key text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint lead_capture_events_idempotency_unique unique (idempotency_key)
);

create index if not exists lead_capture_events_org_created_idx
  on public.lead_capture_events (organization_id, created_at desc);

create index if not exists lead_capture_events_campaign_created_idx
  on public.lead_capture_events (campaign_id, created_at desc);

alter table public.lead_capture_events enable row level security;
alter table public.lead_capture_events force row level security;

drop policy if exists lead_capture_events_member_select on public.lead_capture_events;
create policy lead_capture_events_member_select
  on public.lead_capture_events
  for select
  to authenticated
  using (private.is_current_user_org_member(organization_id));

drop policy if exists lead_capture_events_service_role_all on public.lead_capture_events;
create policy lead_capture_events_service_role_all
  on public.lead_capture_events
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.lead_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  campaign_lead_id uuid not null references public.campaign_leads(id) on delete cascade,
  destination text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text null,
  metadata_json jsonb not null default '{}'::jsonb,
  sent_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists lead_delivery_attempts_org_status_idx
  on public.lead_delivery_attempts (organization_id, status, created_at desc);

create index if not exists lead_delivery_attempts_lead_idx
  on public.lead_delivery_attempts (campaign_lead_id, created_at desc);

alter table public.lead_delivery_attempts enable row level security;
alter table public.lead_delivery_attempts force row level security;

drop policy if exists lead_delivery_attempts_member_select on public.lead_delivery_attempts;
create policy lead_delivery_attempts_member_select
  on public.lead_delivery_attempts
  for select
  to authenticated
  using (private.is_current_user_org_member(organization_id));

drop policy if exists lead_delivery_attempts_service_role_all on public.lead_delivery_attempts;
create policy lead_delivery_attempts_service_role_all
  on public.lead_delivery_attempts
  for all
  to service_role
  using (true)
  with check (true);

comment on column public.campaign_plans.capture_method is
  'Lead-capture surface for the campaign: website funnel or Meta Instant Form. Defaults preserve legacy website funnel behavior.';

comment on table public.campaign_leads is
  'Durable, tenant-scoped lead ledger for website funnel and Meta Instant Form lead ingestion.';
