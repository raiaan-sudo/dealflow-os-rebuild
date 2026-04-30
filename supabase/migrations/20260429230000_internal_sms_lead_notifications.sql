create table if not exists public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone_raw text,
  phone_e164 text,
  company_name text,
  brokerage_name text,
  sms_notifications_enabled boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

alter table public.leads
  add column if not exists tenant_id uuid,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone_raw text,
  add column if not exists phone_e164 text,
  add column if not exists campaign_name text,
  add column if not exists lead_type text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists ad_id text,
  add column if not exists landing_page_url text,
  add column if not exists updated_at timestamptz not null default now();

update public.leads
set tenant_id = organization_id
where tenant_id is null
  and organization_id is not null;

create table if not exists public.lead_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  agent_id uuid references public.agent_profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  contacted_at timestamptz,
  status text not null default 'assigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_assignments_status_check check (status in ('assigned', 'contacted', 'bad_lead', 'failed', 'unassigned'))
);

create table if not exists public.lead_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  agent_id uuid references public.agent_profiles(id) on delete set null,
  channel text not null default 'sms',
  provider text not null default 'twilio',
  purpose text not null,
  provider_message_id text,
  status text not null default 'queued',
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_notifications_purpose_check check (purpose in ('new_lead_alert', 'lead_reply_template')),
  constraint lead_notifications_status_check check (status in ('queued', 'sent', 'delivered', 'undelivered', 'failed'))
);

create index if not exists agent_profiles_tenant_id_idx on public.agent_profiles(tenant_id);
create index if not exists agent_profiles_user_id_idx on public.agent_profiles(user_id);
create index if not exists agent_profiles_sms_enabled_idx on public.agent_profiles(tenant_id, active, sms_notifications_enabled) where phone_e164 is not null;

create index if not exists leads_tenant_id_idx on public.leads(tenant_id);
create index if not exists leads_phone_e164_idx on public.leads(phone_e164);
create index if not exists leads_ad_id_idx on public.leads(ad_id);

create index if not exists lead_assignments_tenant_id_idx on public.lead_assignments(tenant_id);
create unique index if not exists lead_assignments_lead_id_key on public.lead_assignments(lead_id);
create index if not exists lead_assignments_agent_id_idx on public.lead_assignments(agent_id);
create index if not exists lead_assignments_status_idx on public.lead_assignments(status);
create index if not exists lead_assignments_assigned_at_idx on public.lead_assignments(assigned_at);

create index if not exists lead_notifications_tenant_id_idx on public.lead_notifications(tenant_id);
create index if not exists lead_notifications_lead_id_idx on public.lead_notifications(lead_id);
create index if not exists lead_notifications_agent_id_idx on public.lead_notifications(agent_id);
create index if not exists lead_notifications_status_idx on public.lead_notifications(status);
create unique index if not exists lead_notifications_provider_message_id_key
  on public.lead_notifications(provider_message_id)
  where provider_message_id is not null;
create unique index if not exists lead_notifications_once_per_lead_agent_purpose
  on public.lead_notifications(tenant_id, lead_id, agent_id, purpose)
  where agent_id is not null;
create unique index if not exists lead_notifications_once_per_lead_unassigned_purpose
  on public.lead_notifications(tenant_id, lead_id, purpose)
  where agent_id is null;

alter table public.agent_profiles enable row level security;
alter table public.lead_assignments enable row level security;
alter table public.lead_notifications enable row level security;

drop policy if exists agent_profiles_service_role_all on public.agent_profiles;
create policy agent_profiles_service_role_all
  on public.agent_profiles
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists lead_assignments_service_role_all on public.lead_assignments;
create policy lead_assignments_service_role_all
  on public.lead_assignments
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists lead_notifications_service_role_all on public.lead_notifications;
create policy lead_notifications_service_role_all
  on public.lead_notifications
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
