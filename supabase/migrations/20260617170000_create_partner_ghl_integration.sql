create table if not exists public.partner_ghl_config (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  enabled boolean not null default false,
  auth_type text not null default 'private_integration_token',
  encrypted_credential_ref text not null,
  agency_id text null,
  company_id text null,
  default_location_id text null,
  default_pipeline_id text null,
  default_stage_id text null,
  default_tags jsonb not null default '[]'::jsonb,
  default_source text not null default 'DealFlow',
  rate_limit_policy jsonb not null default '{"requests_per_10s":100,"requests_per_day":200000,"backoff":"exponential"}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint partner_ghl_config_auth_type_check check (auth_type in ('private_integration_token', 'oauth')),
  constraint partner_ghl_config_partner_unique unique (partner_id),
  constraint partner_ghl_config_credential_ref_check check (encrypted_credential_ref ~ '^[A-Z0-9_]{8,120}$')
);

create table if not exists public.workspace_ghl_mapping (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations (id) on delete cascade,
  partner_id uuid not null references public.partners (id) on delete cascade,
  ghl_location_id text not null,
  ghl_pipeline_id text null,
  ghl_stage_id text null,
  sync_enabled boolean not null default true,
  assigned_by uuid null references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_ghl_mapping_location_check check (ghl_location_id ~ '^[A-Za-z0-9_-]{3,120}$'),
  constraint workspace_ghl_mapping_pipeline_check check (ghl_pipeline_id is null or ghl_pipeline_id ~ '^[A-Za-z0-9_-]{3,160}$'),
  constraint workspace_ghl_mapping_stage_check check (ghl_stage_id is null or ghl_stage_id ~ '^[A-Za-z0-9_-]{3,160}$')
);

create unique index if not exists workspace_ghl_mapping_workspace_partner_unique
  on public.workspace_ghl_mapping (workspace_id, partner_id);

create index if not exists workspace_ghl_mapping_partner_idx
  on public.workspace_ghl_mapping (partner_id, sync_enabled);

create table if not exists public.lead_crm_sync_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  workspace_id uuid not null references public.organizations (id) on delete cascade,
  partner_id uuid not null references public.partners (id) on delete cascade,
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
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint lead_crm_sync_events_destination_check check (destination in ('gohighlevel')),
  constraint lead_crm_sync_events_status_check check (status in ('queued', 'processing', 'synced', 'failed', 'dead_letter', 'skipped'))
);

create unique index if not exists lead_crm_sync_events_idempotency_unique
  on public.lead_crm_sync_events (idempotency_key);

create index if not exists lead_crm_sync_events_workspace_status_idx
  on public.lead_crm_sync_events (workspace_id, status, created_at desc);

create index if not exists lead_crm_sync_events_partner_status_idx
  on public.lead_crm_sync_events (partner_id, status, created_at desc);

create index if not exists lead_crm_sync_events_next_retry_idx
  on public.lead_crm_sync_events (status, next_retry_at)
  where status in ('queued', 'failed');

create table if not exists public.ghl_provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid null references auth.users (id) on delete set null,
  partner_id uuid not null references public.partners (id) on delete cascade,
  status text not null default 'queued',
  idempotency_key text not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  last_error_code text null,
  last_error_message text null,
  next_retry_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_provisioning_jobs_status_check check (status in ('queued', 'processing', 'succeeded', 'failed', 'dead_letter', 'skipped'))
);

create unique index if not exists ghl_provisioning_jobs_idempotency_unique
  on public.ghl_provisioning_jobs (idempotency_key);

create index if not exists ghl_provisioning_jobs_workspace_status_idx
  on public.ghl_provisioning_jobs (workspace_id, status, created_at desc);

create index if not exists ghl_provisioning_jobs_partner_status_idx
  on public.ghl_provisioning_jobs (partner_id, status, created_at desc);

create table if not exists public.ghl_provisioning_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid null references public.ghl_provisioning_jobs (id) on delete cascade,
  workspace_id uuid not null references public.organizations (id) on delete cascade,
  partner_id uuid not null references public.partners (id) on delete cascade,
  step text not null,
  status text not null,
  external_id text null,
  error_code text null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint ghl_provisioning_events_status_check check (status in ('started', 'succeeded', 'failed', 'skipped'))
);

create index if not exists ghl_provisioning_events_job_idx
  on public.ghl_provisioning_events (job_id, created_at desc);

create index if not exists ghl_provisioning_events_workspace_idx
  on public.ghl_provisioning_events (workspace_id, created_at desc);

create table if not exists public.workspace_ghl_users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations (id) on delete cascade,
  partner_id uuid not null references public.partners (id) on delete cascade,
  ghl_location_id text not null,
  ghl_user_id text null,
  email text not null,
  invite_status text not null default 'not_invited',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_ghl_users_invite_status_check check (invite_status in ('not_invited', 'invited', 'active', 'failed', 'deferred'))
);

create unique index if not exists workspace_ghl_users_workspace_partner_email_unique
  on public.workspace_ghl_users (workspace_id, partner_id, email);

create table if not exists public.partner_ghl_template_config (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  snapshot_id text null,
  default_pipeline_name text null,
  default_stage_name text null,
  default_tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint partner_ghl_template_config_partner_unique unique (partner_id)
);

create table if not exists public.partner_ghl_workflow_config (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  workflow_id text null,
  enabled boolean not null default false,
  enrollment_trigger text not null default 'disabled',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint partner_ghl_workflow_config_partner_unique unique (partner_id),
  constraint partner_ghl_workflow_config_trigger_check check (enrollment_trigger in ('disabled', 'lead_synced', 'manual'))
);

alter table public.partner_ghl_config enable row level security;
alter table public.workspace_ghl_mapping enable row level security;
alter table public.lead_crm_sync_events enable row level security;
alter table public.ghl_provisioning_jobs enable row level security;
alter table public.ghl_provisioning_events enable row level security;
alter table public.workspace_ghl_users enable row level security;
alter table public.partner_ghl_template_config enable row level security;
alter table public.partner_ghl_workflow_config enable row level security;

alter table public.partner_ghl_config force row level security;
alter table public.workspace_ghl_mapping force row level security;
alter table public.lead_crm_sync_events force row level security;
alter table public.ghl_provisioning_jobs force row level security;
alter table public.ghl_provisioning_events force row level security;
alter table public.workspace_ghl_users force row level security;
alter table public.partner_ghl_template_config force row level security;
alter table public.partner_ghl_workflow_config force row level security;

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

drop policy if exists lead_crm_sync_events_service_role_all on public.lead_crm_sync_events;
create policy lead_crm_sync_events_service_role_all
  on public.lead_crm_sync_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists ghl_provisioning_jobs_service_role_all on public.ghl_provisioning_jobs;
create policy ghl_provisioning_jobs_service_role_all
  on public.ghl_provisioning_jobs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists ghl_provisioning_events_service_role_all on public.ghl_provisioning_events;
create policy ghl_provisioning_events_service_role_all
  on public.ghl_provisioning_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists workspace_ghl_users_service_role_all on public.workspace_ghl_users;
create policy workspace_ghl_users_service_role_all
  on public.workspace_ghl_users
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists partner_ghl_template_config_service_role_all on public.partner_ghl_template_config;
create policy partner_ghl_template_config_service_role_all
  on public.partner_ghl_template_config
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists partner_ghl_workflow_config_service_role_all on public.partner_ghl_workflow_config;
create policy partner_ghl_workflow_config_service_role_all
  on public.partner_ghl_workflow_config
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into public.app_schema_metadata (key, value)
values ('ghl_integration_schema_version', '20260617170000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
