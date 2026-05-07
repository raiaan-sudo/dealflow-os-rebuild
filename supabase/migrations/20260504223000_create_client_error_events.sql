create table if not exists public.client_error_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  route_path text not null default '/',
  source text not null default 'browser',
  severity text not null default 'medium',
  error_name text null,
  message text not null,
  stack text null,
  component_stack text null,
  browser text null,
  viewport text null,
  metadata jsonb not null default '{}'::jsonb,
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by text null,
  resolution_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_error_events_event_key_not_blank check (length(trim(event_key)) > 0),
  constraint client_error_events_route_path_not_blank check (length(trim(route_path)) > 0),
  constraint client_error_events_source_not_blank check (length(trim(source)) > 0),
  constraint client_error_events_message_not_blank check (length(trim(message)) > 0),
  constraint client_error_events_occurrence_positive check (occurrence_count > 0),
  constraint client_error_events_severity_check check (severity in ('critical', 'high', 'medium', 'low'))
);

create unique index if not exists client_error_events_event_key_unique
  on public.client_error_events(event_key);

create index if not exists client_error_events_last_seen_idx
  on public.client_error_events(last_seen_at desc);

create index if not exists client_error_events_unreviewed_idx
  on public.client_error_events(last_seen_at desc)
  where reviewed_at is null;

alter table public.client_error_events enable row level security;
alter table public.client_error_events force row level security;

drop policy if exists client_error_events_service_role_all on public.client_error_events;
create policy client_error_events_service_role_all
  on public.client_error_events
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.client_error_events is
  'Durable first-party browser/client error telemetry. Rows must be server-scrubbed and must never store cookies, JWTs, provider tokens, payment data, secrets, or raw customer PII.';

insert into public.app_schema_metadata (key, value)
values ('client_error_events_schema_version', '20260504223000')
on conflict (key) do update set value = excluded.value;
