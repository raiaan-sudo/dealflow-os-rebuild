create table if not exists public.system_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  campaign_id uuid null,
  kind text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  result jsonb null,
  retry_count integer not null default 0,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

comment on table public.system_jobs is
  'Lightweight durable job tracking for long-running generation, sync, and recovery flows.';

comment on column public.system_jobs.kind is
  'Application job type such as funnel_generation, creative_generation, meta_sync, or lead_capture_retry.';

comment on column public.system_jobs.status is
  'Database execution status: pending, processing, completed, or failed.';

comment on column public.system_jobs.payload is
  'Job-specific input payload plus tracking metadata such as correlation ID and lifecycle status.';

comment on column public.system_jobs.result is
  'Structured result payload recorded after successful completion when available.';

create index if not exists system_jobs_user_created_idx
  on public.system_jobs (user_id, created_at desc);

create index if not exists system_jobs_campaign_created_idx
  on public.system_jobs (campaign_id, created_at desc);

create index if not exists system_jobs_status_created_idx
  on public.system_jobs (status, created_at asc);

create index if not exists system_jobs_kind_created_idx
  on public.system_jobs (kind, created_at desc);

create table if not exists public.system_job_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.system_jobs(id) on delete cascade,
  level text not null default 'info',
  message text not null,
  details jsonb null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

comment on table public.system_job_logs is
  'Append-only execution log entries for system_jobs.';

comment on column public.system_job_logs.level is
  'Log severity level such as info, warning, or error.';

create index if not exists system_job_logs_job_created_idx
  on public.system_job_logs (job_id, created_at asc);

create table if not exists public.app_schema_metadata (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260427')
on conflict (key)
do update set
  value = excluded.value,
  updated_at = timezone('utc'::text, now());
