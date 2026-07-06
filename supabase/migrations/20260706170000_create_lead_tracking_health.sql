create table if not exists public.campaign_tracking_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans (id) on delete cascade,
  user_id uuid null references auth.users (id) on delete set null,
  tracking_mode text not null,
  expected_lead_destination text not null,
  meta_campaign_id text null,
  meta_adset_id text null,
  meta_ad_ids text[] not null default '{}'::text[],
  meta_page_id text null,
  pixel_id text null,
  launch_domain text null,
  launch_url text null,
  expected_event_name text not null default 'Lead',
  expected_action_source text not null default 'website',
  expected_attribution_params text[] not null default array['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid']::text[],
  status text not null default 'needs_review',
  readiness jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint campaign_tracking_contracts_campaign_unique unique (campaign_id),
  constraint campaign_tracking_contracts_mode_check check (tracking_mode in ('website_funnel', 'instant_form')),
  constraint campaign_tracking_contracts_destination_check check (expected_lead_destination in ('dealflow_dashboard', 'facebook_lead_center')),
  constraint campaign_tracking_contracts_status_check check (status in ('configured', 'needs_review', 'failed', 'disabled'))
);

create index if not exists campaign_tracking_contracts_org_status_idx
  on public.campaign_tracking_contracts (organization_id, status, updated_at desc);

create index if not exists campaign_tracking_contracts_campaign_idx
  on public.campaign_tracking_contracts (campaign_id);

create table if not exists public.lead_tracking_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid null references public.campaign_plans (id) on delete set null,
  lead_id uuid null references public.leads (id) on delete cascade,
  event_type text not null,
  status text not null default 'recorded',
  source text not null default 'dealflow',
  event_id text null,
  pixel_id text null,
  fbtrace_id text null,
  meta_events_received integer null,
  attribution jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint lead_tracking_events_type_check check (
    event_type in (
      'lead_captured',
      'browser_pixel_attempted',
      'capi_queued',
      'capi_sent',
      'capi_failed',
      'crm_sync_status',
      'notification_status',
      'meta_reporting_checked',
      'tracking_contract_created',
      'tracking_contract_failed'
    )
  ),
  constraint lead_tracking_events_status_check check (status in ('recorded', 'sent', 'failed', 'skipped', 'seen', 'missing'))
);

create index if not exists lead_tracking_events_lead_created_idx
  on public.lead_tracking_events (lead_id, created_at desc);

create index if not exists lead_tracking_events_campaign_type_idx
  on public.lead_tracking_events (campaign_id, event_type, created_at desc);

create index if not exists lead_tracking_events_org_created_idx
  on public.lead_tracking_events (organization_id, created_at desc);

alter table public.campaign_tracking_contracts enable row level security;
alter table public.campaign_tracking_contracts force row level security;
alter table public.lead_tracking_events enable row level security;
alter table public.lead_tracking_events force row level security;

drop policy if exists campaign_tracking_contracts_member_read on public.campaign_tracking_contracts;
create policy campaign_tracking_contracts_member_read
  on public.campaign_tracking_contracts
  for select
  to authenticated
  using (public.is_current_user_org_member(organization_id));

drop policy if exists lead_tracking_events_member_read on public.lead_tracking_events;
create policy lead_tracking_events_member_read
  on public.lead_tracking_events
  for select
  to authenticated
  using (public.is_current_user_org_member(organization_id));

revoke all on table public.campaign_tracking_contracts from anon, authenticated;
revoke all on table public.lead_tracking_events from anon, authenticated;
grant select on table public.campaign_tracking_contracts to authenticated;
grant select on table public.lead_tracking_events to authenticated;
grant all on table public.campaign_tracking_contracts to service_role;
grant all on table public.lead_tracking_events to service_role;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260706170000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
