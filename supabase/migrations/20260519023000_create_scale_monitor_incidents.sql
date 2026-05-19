create table if not exists public.scale_monitor_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null unique,
  subsystem text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  title text not null,
  evidence jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz null,
  recurrence_count integer not null default 1,
  clean_check_count integer not null default 0,
  affected_organization_id uuid null,
  affected_campaign_id uuid null,
  recommended_action text not null,
  alert_channels jsonb not null default '[]'::jsonb,
  last_alerted_at timestamptz null,
  acknowledged_at timestamptz null,
  acknowledged_by text null,
  resolution_note text null,
  synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scale_monitor_incidents_severity_check check (severity in ('p0', 'p1', 'p2', 'p3', 'low', 'medium', 'high', 'critical')),
  constraint scale_monitor_incidents_status_check check (status in ('open', 'acknowledged', 'resolved'))
);

create index if not exists scale_monitor_incidents_status_idx
  on public.scale_monitor_incidents (status, severity, last_seen_at desc);

create index if not exists scale_monitor_incidents_subsystem_idx
  on public.scale_monitor_incidents (subsystem, status, last_seen_at desc);

create table if not exists public.scale_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  status text not null default 'running',
  verdict text null,
  summary jsonb not null default '{}'::jsonb,
  smoke_summary jsonb not null default '{}'::jsonb,
  incidents_opened integer not null default 0,
  incidents_resolved integer not null default 0,
  error_code text null,
  created_at timestamptz not null default now(),
  constraint scale_monitor_runs_status_check check (status in ('running', 'completed', 'failed'))
);

create index if not exists scale_monitor_runs_started_idx
  on public.scale_monitor_runs (started_at desc);

alter table public.scale_monitor_incidents enable row level security;
alter table public.scale_monitor_incidents force row level security;
alter table public.scale_monitor_runs enable row level security;
alter table public.scale_monitor_runs force row level security;

drop policy if exists scale_monitor_incidents_service_role_all on public.scale_monitor_incidents;
create policy scale_monitor_incidents_service_role_all
  on public.scale_monitor_incidents
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists scale_monitor_runs_service_role_all on public.scale_monitor_runs;
create policy scale_monitor_runs_service_role_all
  on public.scale_monitor_runs
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.scale_monitor_incidents from anon, authenticated;
revoke all on public.scale_monitor_runs from anon, authenticated;

insert into public.app_schema_metadata (key, value)
values
  ('schema_version', '20260519023000'),
  ('scale_monitor_incidents_schema_version', '20260519023000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
