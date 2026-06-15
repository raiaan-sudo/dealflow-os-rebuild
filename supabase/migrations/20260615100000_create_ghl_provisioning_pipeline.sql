create table if not exists public.ghl_provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  partner_id text not null references public.partner_configs(partner_id) on delete cascade,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  stripe_event_id text null,
  status text not null default 'queued',
  idempotency_key text not null,
  attempt_count integer not null default 0,
  last_completed_step text null,
  last_error_code text null,
  last_error_message text null,
  next_retry_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ghl_provisioning_jobs_status_check check (
    status in ('queued', 'processing', 'provisioned', 'failed', 'dead_letter', 'skipped')
  )
);

create unique index if not exists ghl_provisioning_jobs_idempotency_unique
  on public.ghl_provisioning_jobs(idempotency_key);

create index if not exists ghl_provisioning_jobs_workspace_status_idx
  on public.ghl_provisioning_jobs(workspace_id, status, created_at desc);

create index if not exists ghl_provisioning_jobs_partner_status_idx
  on public.ghl_provisioning_jobs(partner_id, status, created_at desc);

create index if not exists ghl_provisioning_jobs_next_retry_idx
  on public.ghl_provisioning_jobs(status, next_retry_at)
  where status in ('queued', 'failed');

create table if not exists public.ghl_provisioning_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ghl_provisioning_jobs(id) on delete cascade,
  workspace_id uuid not null references public.organizations(id) on delete cascade,
  partner_id text not null references public.partner_configs(partner_id) on delete cascade,
  step text not null,
  status text not null,
  external_id text null,
  error_code text null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ghl_provisioning_events_status_check check (status in ('started', 'succeeded', 'failed', 'skipped'))
);

create index if not exists ghl_provisioning_events_job_idx
  on public.ghl_provisioning_events(job_id, created_at desc);

create index if not exists ghl_provisioning_events_workspace_idx
  on public.ghl_provisioning_events(workspace_id, created_at desc);

create table if not exists public.workspace_ghl_users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations(id) on delete cascade,
  partner_id text not null references public.partner_configs(partner_id) on delete cascade,
  ghl_location_id text not null,
  ghl_user_id text null,
  email text not null,
  invite_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_ghl_users_invite_status_check check (
    invite_status in ('pending', 'invited', 'active', 'failed', 'skipped')
  )
);

create unique index if not exists workspace_ghl_users_workspace_partner_email_unique
  on public.workspace_ghl_users(workspace_id, partner_id, email);

create index if not exists workspace_ghl_users_location_idx
  on public.workspace_ghl_users(ghl_location_id);

create table if not exists public.partner_ghl_template_config (
  id uuid primary key default gen_random_uuid(),
  partner_id text not null references public.partner_configs(partner_id) on delete cascade,
  enabled boolean not null default true,
  snapshot_id text null,
  default_pipeline_name text null,
  default_stage_name text null,
  default_custom_fields jsonb not null default '[]'::jsonb,
  default_tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists partner_ghl_template_config_partner_unique
  on public.partner_ghl_template_config(partner_id);

create table if not exists public.partner_ghl_workflow_config (
  id uuid primary key default gen_random_uuid(),
  partner_id text not null references public.partner_configs(partner_id) on delete cascade,
  enabled boolean not null default false,
  workflow_id text null,
  enrollment_trigger text not null default 'lead_synced',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_ghl_workflow_config_trigger_check check (
    enrollment_trigger in ('lead_synced', 'manual', 'disabled')
  )
);

create unique index if not exists partner_ghl_workflow_config_partner_unique
  on public.partner_ghl_workflow_config(partner_id);

insert into public.partner_ghl_template_config (
  partner_id,
  enabled,
  snapshot_id,
  default_pipeline_name,
  default_stage_name,
  default_custom_fields,
  default_tags,
  metadata,
  updated_at
) values (
  'click_to_scale',
  true,
  null,
  'DealFlow Leads',
  'New Lead',
  '["dealflow_lead_id","dealflow_workspace_id","dealflow_campaign_id","dealflow_campaign_name","dealflow_lead_source"]'::jsonb,
  '["DealFlow","Click to Scale","New Lead"]'::jsonb,
  '{"workflow_enrollment":"deferred_until_workflow_selected"}'::jsonb,
  now()
)
on conflict (partner_id) do update set
  enabled = excluded.enabled,
  default_pipeline_name = excluded.default_pipeline_name,
  default_stage_name = excluded.default_stage_name,
  default_custom_fields = excluded.default_custom_fields,
  default_tags = excluded.default_tags,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.partner_ghl_workflow_config (
  partner_id,
  enabled,
  workflow_id,
  enrollment_trigger,
  metadata,
  updated_at
) values (
  'click_to_scale',
  false,
  null,
  'disabled',
  '{"reason":"workflow_not_selected_yet"}'::jsonb,
  now()
)
on conflict (partner_id) do update set
  enabled = false,
  workflow_id = null,
  enrollment_trigger = 'disabled',
  metadata = excluded.metadata,
  updated_at = now();

alter table public.ghl_provisioning_jobs enable row level security;
alter table public.ghl_provisioning_events enable row level security;
alter table public.workspace_ghl_users enable row level security;
alter table public.partner_ghl_template_config enable row level security;
alter table public.partner_ghl_workflow_config enable row level security;

alter table public.ghl_provisioning_jobs force row level security;
alter table public.ghl_provisioning_events force row level security;
alter table public.workspace_ghl_users force row level security;
alter table public.partner_ghl_template_config force row level security;
alter table public.partner_ghl_workflow_config force row level security;

drop policy if exists ghl_provisioning_jobs_service_role_all on public.ghl_provisioning_jobs;
create policy ghl_provisioning_jobs_service_role_all
  on public.ghl_provisioning_jobs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists ghl_provisioning_jobs_member_select on public.ghl_provisioning_jobs;
create policy ghl_provisioning_jobs_member_select
  on public.ghl_provisioning_jobs
  for select
  to authenticated
  using (private.is_current_user_org_member(workspace_id));

drop policy if exists ghl_provisioning_events_service_role_all on public.ghl_provisioning_events;
create policy ghl_provisioning_events_service_role_all
  on public.ghl_provisioning_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists ghl_provisioning_events_member_select on public.ghl_provisioning_events;
create policy ghl_provisioning_events_member_select
  on public.ghl_provisioning_events
  for select
  to authenticated
  using (private.is_current_user_org_member(workspace_id));

drop policy if exists workspace_ghl_users_service_role_all on public.workspace_ghl_users;
create policy workspace_ghl_users_service_role_all
  on public.workspace_ghl_users
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists workspace_ghl_users_member_select on public.workspace_ghl_users;
create policy workspace_ghl_users_member_select
  on public.workspace_ghl_users
  for select
  to authenticated
  using (private.is_current_user_org_member(workspace_id));

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
values ('schema_version', '20260615100000')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
