-- Pro Autopilot V1 execution schema.
-- Rollback note: disable AUTONOMY_EXECUTION_ENABLED and AUTONOMY_AUTOPILOT_ENABLED
-- before reverting this migration. These tables are append-only audit/control data;
-- drop in reverse dependency order only after exporting audit evidence.

create table if not exists public.customer_autonomy_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mode text not null default 'manual',
  allowed_safe_actions jsonb not null default '[]'::jsonb,
  monthly_budget_cap_cents integer null,
  daily_budget_cap_cents integer null,
  credit_spend_cap_cents integer null,
  kill_switch_enabled boolean not null default false,
  disabled_by text null,
  disabled_at timestamptz null,
  require_approval_for_high_impact boolean not null default true,
  require_rollback_before_mutation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_autonomy_settings_org_unique unique (organization_id),
  constraint customer_autonomy_settings_mode_check check (mode in ('manual', 'assisted', 'auto'))
);

create table if not exists public.campaign_autonomy_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  mode text not null default 'manual',
  allowed_safe_actions jsonb not null default '[]'::jsonb,
  monthly_budget_cap_cents integer null,
  daily_budget_cap_cents integer null,
  credit_spend_cap_cents integer null,
  kill_switch_enabled boolean not null default false,
  disabled_by text null,
  disabled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_autonomy_settings_mode_check check (mode in ('manual', 'assisted', 'auto')),
  constraint campaign_autonomy_settings_campaign_unique unique (organization_id, campaign_id)
);

create table if not exists public.autonomy_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  run_key text not null,
  mode text not null,
  status text not null default 'dry_run',
  trigger_source text not null default 'scheduler',
  dry_run boolean not null default true,
  measured_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  metrics jsonb not null default '{}'::jsonb,
  scoring jsonb not null default '{}'::jsonb,
  guardrail_summary jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autonomy_runs_key_unique unique (run_key),
  constraint autonomy_runs_mode_check check (mode in ('manual', 'assisted', 'auto')),
  constraint autonomy_runs_status_check check (status in ('dry_run', 'evaluated', 'staged', 'executed', 'blocked', 'failed'))
);

create table if not exists public.autonomy_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  run_id uuid null references public.autonomy_runs(id) on delete set null,
  action_key text not null,
  idempotency_key text not null,
  action_type text not null,
  classification text not null,
  execution_type text not null,
  status text not null default 'recommended',
  bottleneck_classification text not null default 'monitor',
  trigger_condition text not null,
  minimum_data_threshold jsonb not null default '{}'::jsonb,
  confidence_threshold numeric not null default 0,
  confidence_score numeric not null default 0,
  risk_score numeric not null default 0,
  expected_budget_impact_cents integer not null default 0,
  customer_explanation text not null,
  internal_explanation text not null,
  chosen_reason text not null,
  rejected_alternatives jsonb not null default '[]'::jsonb,
  rollback_path text not null,
  approval_required boolean not null default true,
  approved_by text null,
  approved_at timestamptz null,
  rejected_by text null,
  rejected_at timestamptz null,
  rejection_reason text null,
  target_object_type text null,
  target_object_id text null,
  before_state jsonb not null default '{}'::jsonb,
  expected_after_state jsonb not null default '{}'::jsonb,
  verified_after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autonomy_actions_idempotency_unique unique (idempotency_key),
  constraint autonomy_actions_status_check check (status in ('recommended', 'staged', 'approved', 'rejected', 'eligible', 'applied', 'verified', 'blocked', 'failed', 'rollback_needed')),
  constraint autonomy_actions_classification_check check (classification in ('manual', 'assisted', 'autopilot_safe', 'high_impact')),
  constraint autonomy_actions_execution_type_check check (execution_type in ('manual_recommendation', 'assisted_approval_required', 'autopilot_safe_action', 'high_impact_approval_required'))
);

create table if not exists public.autonomy_action_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  action_id uuid null references public.autonomy_actions(id) on delete set null,
  run_id uuid null references public.autonomy_runs(id) on delete set null,
  actor_type text not null default 'system',
  actor_id text null,
  event_type text not null,
  customer_message text not null,
  internal_message text not null,
  redacted_request jsonb not null default '{}'::jsonb,
  redacted_response jsonb not null default '{}'::jsonb,
  thresholds jsonb not null default '{}'::jsonb,
  before_after jsonb not null default '{}'::jsonb,
  rollback_payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint autonomy_action_audit_logs_event_check check (length(trim(event_type)) > 0)
);

create table if not exists public.autonomy_rollbacks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  action_id uuid null references public.autonomy_actions(id) on delete set null,
  rollback_key text not null,
  idempotency_key text not null,
  object_type text not null,
  object_id text null,
  before_state jsonb not null default '{}'::jsonb,
  expected_after_state jsonb not null default '{}'::jsonb,
  rollback_payload jsonb not null default '{}'::jsonb,
  rollback_notes text not null default 'Rollback payload must be written before mutation; no real Meta, provider, SMS, or Stripe call should happen without rollback evidence.',
  rollback_eligible boolean not null default true,
  payload_written_before_mutation boolean not null default false,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autonomy_rollbacks_key_unique unique (rollback_key),
  constraint autonomy_rollbacks_status_check check (status in ('ready', 'not_reversible', 'used', 'failed', 'expired'))
);

create table if not exists public.autonomy_experiments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  experiment_key text not null,
  experiment_type text not null,
  primary_variable text not null,
  control_payload jsonb not null default '{}'::jsonb,
  challenger_payload jsonb not null default '{}'::jsonb,
  minimum_spend_cents integer not null default 0,
  minimum_impressions integer not null default 0,
  minimum_clicks integer not null default 0,
  minimum_leads integer not null default 0,
  winner_criteria jsonb not null default '{}'::jsonb,
  status text not null default 'planned',
  learned_pattern text null,
  started_at timestamptz null,
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autonomy_experiments_key_unique unique (organization_id, campaign_id, experiment_key),
  constraint autonomy_experiments_status_check check (status in ('planned', 'running', 'winner', 'loser', 'inconclusive', 'stopped')),
  constraint autonomy_experiments_one_variable_check check (length(trim(primary_variable)) > 0)
);

create table if not exists public.campaign_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  source text not null default 'meta_sync',
  meta_campaign_id text null,
  meta_ad_set_id text null,
  meta_ad_id text null,
  spend_cents integer not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  frequency numeric not null default 0,
  cpm_cents integer not null default 0,
  ctr numeric not null default 0,
  cpc_cents integer not null default 0,
  landing_page_views integer not null default 0,
  leads integer not null default 0,
  cpl_cents integer not null default 0,
  form_submits integer not null default 0,
  thank_you_conversions integer not null default 0,
  funnel_cvr numeric not null default 0,
  selected_creative_asset_ids jsonb not null default '[]'::jsonb,
  creative_angle text null,
  creative_hook text null,
  creative_cta text null,
  public_funnel_state text null,
  lead_notification_state text null,
  lead_quality_status_counts jsonb not null default '{}'::jsonb,
  booked_count integer not null default 0,
  showed_count integer not null default 0,
  signed_count integer not null default 0,
  billing_state text not null default 'unknown',
  operator_debt_state text not null default 'unknown',
  destination_health_status text not null default 'unknown',
  snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.autonomy_learning_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  experiment_id uuid null references public.autonomy_experiments(id) on delete set null,
  action_id uuid null references public.autonomy_actions(id) on delete set null,
  pattern_key text not null,
  pattern_type text not null,
  learned_pattern text not null,
  confidence_score numeric not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autonomy_learning_memory_key_unique unique (organization_id, campaign_id, pattern_key)
);

create table if not exists public.autonomy_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid null references public.campaign_plans(id) on delete cascade,
  action_id uuid null references public.autonomy_actions(id) on delete set null,
  alert_key text not null,
  alert_type text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  title text not null,
  message text not null,
  evidence jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autonomy_alerts_key_unique unique (organization_id, alert_key),
  constraint autonomy_alerts_status_check check (status in ('open', 'acknowledged', 'resolved')),
  constraint autonomy_alerts_severity_check check (severity in ('low', 'medium', 'high', 'critical', 'p0', 'p1', 'p2', 'p3'))
);

create table if not exists public.autonomy_execution_locks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  lock_key text not null,
  lock_scope text not null,
  meta_object_id text null,
  idempotency_key text not null,
  locked_by text not null default 'autonomy',
  locked_until timestamptz not null,
  released_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint autonomy_execution_locks_key_unique unique (lock_key),
  constraint autonomy_execution_locks_scope_check check (lock_scope in ('campaign', 'meta_campaign', 'meta_ad_set', 'meta_ad', 'provider', 'funnel'))
);

create table if not exists public.autonomy_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  idempotency_key text not null,
  action_payload_hash text not null,
  status text not null default 'started',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  response_summary jsonb not null default '{}'::jsonb,
  constraint autonomy_idempotency_records_key_unique unique (idempotency_key),
  constraint autonomy_idempotency_records_status_check check (status in ('started', 'applied', 'blocked', 'failed', 'verified'))
);

create index if not exists customer_autonomy_settings_org_idx on public.customer_autonomy_settings(organization_id, updated_at desc);
create index if not exists campaign_autonomy_settings_org_campaign_idx on public.campaign_autonomy_settings(organization_id, campaign_id);
create index if not exists autonomy_runs_org_campaign_started_idx on public.autonomy_runs(organization_id, campaign_id, started_at desc);
create index if not exists autonomy_actions_org_campaign_status_idx on public.autonomy_actions(organization_id, campaign_id, status, created_at desc);
create index if not exists autonomy_actions_approval_idx on public.autonomy_actions(organization_id, approval_required, status, created_at desc);
create index if not exists autonomy_action_audit_logs_action_idx on public.autonomy_action_audit_logs(organization_id, campaign_id, action_id, created_at desc);
create index if not exists autonomy_rollbacks_status_idx on public.autonomy_rollbacks(organization_id, campaign_id, status, created_at desc);
create index if not exists autonomy_experiments_status_idx on public.autonomy_experiments(organization_id, campaign_id, status, created_at desc);
create index if not exists campaign_performance_snapshots_campaign_time_idx on public.campaign_performance_snapshots(organization_id, campaign_id, snapshot_at desc);
create index if not exists autonomy_learning_memory_pattern_idx on public.autonomy_learning_memory(organization_id, campaign_id, pattern_type, confidence_score desc);
create index if not exists autonomy_alerts_status_idx on public.autonomy_alerts(organization_id, status, severity, last_seen_at desc);
create index if not exists autonomy_execution_locks_campaign_idx on public.autonomy_execution_locks(organization_id, campaign_id, locked_until desc);
create index if not exists autonomy_idempotency_records_campaign_idx on public.autonomy_idempotency_records(organization_id, campaign_id, last_seen_at desc);

alter table public.customer_autonomy_settings enable row level security;
alter table public.customer_autonomy_settings force row level security;
alter table public.campaign_autonomy_settings enable row level security;
alter table public.campaign_autonomy_settings force row level security;
alter table public.autonomy_runs enable row level security;
alter table public.autonomy_runs force row level security;
alter table public.autonomy_actions enable row level security;
alter table public.autonomy_actions force row level security;
alter table public.autonomy_action_audit_logs enable row level security;
alter table public.autonomy_action_audit_logs force row level security;
alter table public.autonomy_rollbacks enable row level security;
alter table public.autonomy_rollbacks force row level security;
alter table public.autonomy_experiments enable row level security;
alter table public.autonomy_experiments force row level security;
alter table public.campaign_performance_snapshots enable row level security;
alter table public.campaign_performance_snapshots force row level security;
alter table public.autonomy_learning_memory enable row level security;
alter table public.autonomy_learning_memory force row level security;
alter table public.autonomy_alerts enable row level security;
alter table public.autonomy_alerts force row level security;
alter table public.autonomy_execution_locks enable row level security;
alter table public.autonomy_execution_locks force row level security;
alter table public.autonomy_idempotency_records enable row level security;
alter table public.autonomy_idempotency_records force row level security;

drop policy if exists customer_autonomy_settings_member_select on public.customer_autonomy_settings;
create policy customer_autonomy_settings_member_select on public.customer_autonomy_settings for select to authenticated using (private.is_current_user_org_member(organization_id));
drop policy if exists customer_autonomy_settings_member_update on public.customer_autonomy_settings;
create policy customer_autonomy_settings_member_update on public.customer_autonomy_settings for update to authenticated using (private.is_current_user_org_member(organization_id)) with check (private.is_current_user_org_member(organization_id));
drop policy if exists customer_autonomy_settings_service_role_all on public.customer_autonomy_settings;
create policy customer_autonomy_settings_service_role_all on public.customer_autonomy_settings for all to service_role using (true) with check (true);

drop policy if exists campaign_autonomy_settings_member_select on public.campaign_autonomy_settings;
create policy campaign_autonomy_settings_member_select on public.campaign_autonomy_settings for select to authenticated using (private.is_current_user_org_member(organization_id));
drop policy if exists campaign_autonomy_settings_member_update on public.campaign_autonomy_settings;
create policy campaign_autonomy_settings_member_update on public.campaign_autonomy_settings for update to authenticated using (private.is_current_user_org_member(organization_id)) with check (private.is_current_user_org_member(organization_id));
drop policy if exists campaign_autonomy_settings_service_role_all on public.campaign_autonomy_settings;
create policy campaign_autonomy_settings_service_role_all on public.campaign_autonomy_settings for all to service_role using (true) with check (true);

drop policy if exists autonomy_runs_member_select on public.autonomy_runs;
create policy autonomy_runs_member_select on public.autonomy_runs for select to authenticated using (private.is_current_user_org_member(organization_id));
drop policy if exists autonomy_runs_service_role_all on public.autonomy_runs;
create policy autonomy_runs_service_role_all on public.autonomy_runs for all to service_role using (true) with check (true);

drop policy if exists autonomy_actions_member_select on public.autonomy_actions;
create policy autonomy_actions_member_select on public.autonomy_actions for select to authenticated using (private.is_current_user_org_member(organization_id));
drop policy if exists autonomy_actions_member_update on public.autonomy_actions;
create policy autonomy_actions_member_update on public.autonomy_actions for update to authenticated using (private.is_current_user_org_member(organization_id)) with check (private.is_current_user_org_member(organization_id));
drop policy if exists autonomy_actions_service_role_all on public.autonomy_actions;
create policy autonomy_actions_service_role_all on public.autonomy_actions for all to service_role using (true) with check (true);

drop policy if exists autonomy_action_audit_logs_member_select on public.autonomy_action_audit_logs;
create policy autonomy_action_audit_logs_member_select on public.autonomy_action_audit_logs for select to authenticated using (private.is_current_user_org_member(organization_id));
drop policy if exists autonomy_action_audit_logs_service_role_all on public.autonomy_action_audit_logs;
create policy autonomy_action_audit_logs_service_role_all on public.autonomy_action_audit_logs for all to service_role using (true) with check (true);

drop policy if exists autonomy_rollbacks_member_select on public.autonomy_rollbacks;
create policy autonomy_rollbacks_member_select on public.autonomy_rollbacks for select to authenticated using (private.is_current_user_org_member(organization_id));
drop policy if exists autonomy_rollbacks_service_role_all on public.autonomy_rollbacks;
create policy autonomy_rollbacks_service_role_all on public.autonomy_rollbacks for all to service_role using (true) with check (true);

drop policy if exists autonomy_experiments_member_select on public.autonomy_experiments;
create policy autonomy_experiments_member_select on public.autonomy_experiments for select to authenticated using (private.is_current_user_org_member(organization_id));
drop policy if exists autonomy_experiments_member_update on public.autonomy_experiments;
create policy autonomy_experiments_member_update on public.autonomy_experiments for update to authenticated using (private.is_current_user_org_member(organization_id)) with check (private.is_current_user_org_member(organization_id));
drop policy if exists autonomy_experiments_service_role_all on public.autonomy_experiments;
create policy autonomy_experiments_service_role_all on public.autonomy_experiments for all to service_role using (true) with check (true);

drop policy if exists campaign_performance_snapshots_member_select on public.campaign_performance_snapshots;
create policy campaign_performance_snapshots_member_select on public.campaign_performance_snapshots for select to authenticated using (private.is_current_user_org_member(organization_id));
drop policy if exists campaign_performance_snapshots_service_role_all on public.campaign_performance_snapshots;
create policy campaign_performance_snapshots_service_role_all on public.campaign_performance_snapshots for all to service_role using (true) with check (true);

drop policy if exists autonomy_learning_memory_member_select on public.autonomy_learning_memory;
create policy autonomy_learning_memory_member_select on public.autonomy_learning_memory for select to authenticated using (private.is_current_user_org_member(organization_id));
drop policy if exists autonomy_learning_memory_service_role_all on public.autonomy_learning_memory;
create policy autonomy_learning_memory_service_role_all on public.autonomy_learning_memory for all to service_role using (true) with check (true);

drop policy if exists autonomy_alerts_member_select on public.autonomy_alerts;
create policy autonomy_alerts_member_select on public.autonomy_alerts for select to authenticated using (private.is_current_user_org_member(organization_id));
drop policy if exists autonomy_alerts_service_role_all on public.autonomy_alerts;
create policy autonomy_alerts_service_role_all on public.autonomy_alerts for all to service_role using (true) with check (true);

drop policy if exists autonomy_execution_locks_service_role_all on public.autonomy_execution_locks;
create policy autonomy_execution_locks_service_role_all on public.autonomy_execution_locks for all to service_role using (true) with check (true);
drop policy if exists autonomy_idempotency_records_service_role_all on public.autonomy_idempotency_records;
create policy autonomy_idempotency_records_service_role_all on public.autonomy_idempotency_records for all to service_role using (true) with check (true);

revoke all on public.autonomy_execution_locks from anon, authenticated;
revoke all on public.autonomy_idempotency_records from anon, authenticated;

comment on table public.autonomy_actions is
  'DealFlow Pro Autopilot V1 actions. High-impact actions require approval; safe actions remain capped, audited, rollbackable, and feature-flagged.';
comment on table public.autonomy_rollbacks is
  'Rollback payloads must be written before any external mutation. V1 records payloads and defaults production posture to dry-run/assisted.';
comment on table public.campaign_performance_snapshots is
  'Normalized Meta, funnel, lead quality, billing, operator debt, creative, and destination health metrics for closed-loop optimization.';

insert into public.app_schema_metadata (key, value)
values
  ('schema_version', '20260519033000'),
  ('autonomy_execution_schema_version', '20260519033000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
