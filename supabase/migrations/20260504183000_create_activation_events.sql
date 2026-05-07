create table if not exists public.activation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  campaign_id uuid references public.campaign_plans(id) on delete set null,
  event_name text not null,
  event_key text not null,
  source text not null default 'app',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint activation_events_name_check check (
    event_name in (
      'signup_session_initialized',
      'onboarding_started',
      'onboarding_step_completed',
      'onboarding_completed',
      'campaign_plan_persisted',
      'preview_generated_or_viewed',
      'paywall_viewed',
      'checkout_started',
      'checkout_completed_or_reconciled',
      'dashboard_viewed',
      'meta_connect_started',
      'meta_selection_completed',
      'launch_ready'
    )
  ),
  constraint activation_events_event_key_not_blank check (length(trim(event_key)) > 0),
  constraint activation_events_source_not_blank check (length(trim(source)) > 0)
);

create unique index if not exists activation_events_org_event_key_unique
  on public.activation_events(organization_id, event_key);

create index if not exists activation_events_org_occurred_idx
  on public.activation_events(organization_id, occurred_at desc);

create index if not exists activation_events_campaign_occurred_idx
  on public.activation_events(campaign_id, occurred_at desc)
  where campaign_id is not null;

create index if not exists activation_events_name_occurred_idx
  on public.activation_events(event_name, occurred_at desc);

alter table public.activation_events enable row level security;
alter table public.activation_events force row level security;

drop policy if exists activation_events_member_select on public.activation_events;
create policy activation_events_member_select
  on public.activation_events
  for select
  to authenticated
  using (private.is_current_user_org_member(organization_id));

drop policy if exists activation_events_service_role_all on public.activation_events;
create policy activation_events_service_role_all
  on public.activation_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.activation_events is
  'Durable first-value telemetry. Metadata must contain safe flags/enums/IDs only, never raw PII, tokens, secrets, cookies, JWTs, or provider credentials.';

insert into public.app_schema_metadata (key, value)
values ('activation_events_schema_version', '20260504183000')
on conflict (key) do update set value = excluded.value;
