create table if not exists public.campaign_sync_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_name text not null,
  account_name text null,
  launch_mode text not null default 'test',
  sync_result text not null default 'failed',
  meta_campaign_id text null,
  meta_ad_set_ids jsonb not null default '[]'::jsonb,
  meta_ad_ids jsonb not null default '[]'::jsonb,
  campaign_status text null,
  ad_set_statuses jsonb not null default '[]'::jsonb,
  ad_statuses jsonb not null default '[]'::jsonb,
  delivery_metrics jsonb not null default '{}'::jsonb,
  sync_metadata jsonb not null default '{}'::jsonb,
  sync_errors jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint campaign_sync_snapshots_launch_mode_check check (launch_mode in ('test', 'live')),
  constraint campaign_sync_snapshots_result_check check (sync_result in ('success', 'partial_success', 'failed')),
  constraint campaign_sync_snapshots_name_not_blank check (length(trim(campaign_name)) > 0)
);

create index if not exists campaign_sync_snapshots_org_synced_idx
  on public.campaign_sync_snapshots(organization_id, synced_at desc);

create index if not exists campaign_sync_snapshots_user_synced_idx
  on public.campaign_sync_snapshots(user_id, synced_at desc);

create index if not exists campaign_sync_snapshots_meta_campaign_idx
  on public.campaign_sync_snapshots(organization_id, user_id, meta_campaign_id, synced_at desc)
  where meta_campaign_id is not null;

create index if not exists campaign_sync_snapshots_campaign_name_idx
  on public.campaign_sync_snapshots(organization_id, user_id, campaign_name, synced_at desc);

alter table public.campaign_sync_snapshots enable row level security;
alter table public.campaign_sync_snapshots force row level security;

drop policy if exists campaign_sync_snapshots_member_select on public.campaign_sync_snapshots;
create policy campaign_sync_snapshots_member_select
  on public.campaign_sync_snapshots
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists campaign_sync_snapshots_member_insert on public.campaign_sync_snapshots;
create policy campaign_sync_snapshots_member_insert
  on public.campaign_sync_snapshots
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists campaign_sync_snapshots_service_role_all on public.campaign_sync_snapshots;
create policy campaign_sync_snapshots_service_role_all
  on public.campaign_sync_snapshots
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.performance_tracking (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_snapshot_id uuid null references public.campaign_sync_snapshots(id) on delete set null,
  campaign_id text not null,
  spend numeric not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  ctr numeric not null default 0,
  leads integer not null default 0,
  cpl numeric null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint performance_tracking_campaign_not_blank check (length(trim(campaign_id)) > 0)
);

create index if not exists performance_tracking_org_synced_idx
  on public.performance_tracking(organization_id, synced_at desc);

create index if not exists performance_tracking_campaign_synced_idx
  on public.performance_tracking(organization_id, user_id, campaign_id, synced_at desc);

alter table public.performance_tracking enable row level security;
alter table public.performance_tracking force row level security;

drop policy if exists performance_tracking_member_select on public.performance_tracking;
create policy performance_tracking_member_select
  on public.performance_tracking
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists performance_tracking_member_insert on public.performance_tracking;
create policy performance_tracking_member_insert
  on public.performance_tracking
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists performance_tracking_service_role_all on public.performance_tracking;
create policy performance_tracking_service_role_all
  on public.performance_tracking
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.targeting_intelligence_patterns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  audience text not null,
  location text not null,
  targeting_pattern text not null,
  spend numeric not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  ctr numeric not null default 0,
  leads integer not null default 0,
  cpl numeric null,
  performance_tag text not null default 'test',
  success_count integer not null default 0,
  failure_count integer not null default 0,
  confidence_score numeric not null default 0.5,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint targeting_intelligence_patterns_key_not_blank check (
    length(trim(audience)) > 0
    and length(trim(location)) > 0
    and length(trim(targeting_pattern)) > 0
  )
);

create unique index if not exists targeting_intelligence_patterns_org_key_unique
  on public.targeting_intelligence_patterns(organization_id, user_id, audience, location, targeting_pattern);

create index if not exists targeting_intelligence_patterns_confidence_idx
  on public.targeting_intelligence_patterns(organization_id, user_id, confidence_score desc);

alter table public.targeting_intelligence_patterns enable row level security;
alter table public.targeting_intelligence_patterns force row level security;

drop policy if exists targeting_intelligence_patterns_member_select on public.targeting_intelligence_patterns;
create policy targeting_intelligence_patterns_member_select
  on public.targeting_intelligence_patterns
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists targeting_intelligence_patterns_member_insert on public.targeting_intelligence_patterns;
create policy targeting_intelligence_patterns_member_insert
  on public.targeting_intelligence_patterns
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists targeting_intelligence_patterns_member_update on public.targeting_intelligence_patterns;
create policy targeting_intelligence_patterns_member_update
  on public.targeting_intelligence_patterns
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  )
  with check (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists targeting_intelligence_patterns_service_role_all on public.targeting_intelligence_patterns;
create policy targeting_intelligence_patterns_service_role_all
  on public.targeting_intelligence_patterns
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.campaign_action_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sync_snapshot_id uuid null references public.campaign_sync_snapshots(id) on delete set null,
  meta_campaign_id text not null,
  action_type text not null,
  title text not null,
  reason text not null,
  expected_impact text not null,
  status text not null default 'suggested',
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_action_suggestions_status_check check (status in ('suggested', 'approved', 'applying', 'applied', 'dismissed')),
  constraint campaign_action_suggestions_type_check check (action_type in ('pause_low_performing_ad', 'test_new_creative_angle', 'increase_budget_on_winner', 'adjust_targeting', 'refresh_headline')),
  constraint campaign_action_suggestions_required_text_check check (
    length(trim(meta_campaign_id)) > 0
    and length(trim(title)) > 0
    and length(trim(reason)) > 0
    and length(trim(expected_impact)) > 0
  )
);

create index if not exists campaign_action_suggestions_org_created_idx
  on public.campaign_action_suggestions(organization_id, user_id, created_at desc);

create index if not exists campaign_action_suggestions_campaign_status_idx
  on public.campaign_action_suggestions(organization_id, user_id, meta_campaign_id, status);

alter table public.campaign_action_suggestions enable row level security;
alter table public.campaign_action_suggestions force row level security;

drop policy if exists campaign_action_suggestions_member_select on public.campaign_action_suggestions;
create policy campaign_action_suggestions_member_select
  on public.campaign_action_suggestions
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists campaign_action_suggestions_member_insert on public.campaign_action_suggestions;
create policy campaign_action_suggestions_member_insert
  on public.campaign_action_suggestions
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists campaign_action_suggestions_member_update on public.campaign_action_suggestions;
create policy campaign_action_suggestions_member_update
  on public.campaign_action_suggestions
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  )
  with check (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists campaign_action_suggestions_member_delete on public.campaign_action_suggestions;
create policy campaign_action_suggestions_member_delete
  on public.campaign_action_suggestions
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists campaign_action_suggestions_service_role_all on public.campaign_action_suggestions;
create policy campaign_action_suggestions_service_role_all
  on public.campaign_action_suggestions
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.campaign_draft_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id text not null,
  action_type text not null,
  source_reason text not null,
  proposed_change jsonb not null default '{}'::jsonb,
  expected_impact text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_draft_actions_status_check check (status in ('draft', 'awaiting_approval', 'auto_prepared', 'approved', 'applied', 'dismissed')),
  constraint campaign_draft_actions_type_check check (action_type in ('duplicate_winning_ad', 'replacement_creative', 'headline_test', 'creative_angle_test', 'campaign_clone_test', 'budget_adjustment', 'targeting_adjustment')),
  constraint campaign_draft_actions_required_text_check check (
    length(trim(campaign_id)) > 0
    and length(trim(source_reason)) > 0
    and length(trim(expected_impact)) > 0
  )
);

create index if not exists campaign_draft_actions_org_created_idx
  on public.campaign_draft_actions(organization_id, user_id, created_at desc);

create index if not exists campaign_draft_actions_campaign_idx
  on public.campaign_draft_actions(organization_id, user_id, campaign_id, created_at desc);

alter table public.campaign_draft_actions enable row level security;
alter table public.campaign_draft_actions force row level security;

drop policy if exists campaign_draft_actions_member_select on public.campaign_draft_actions;
create policy campaign_draft_actions_member_select
  on public.campaign_draft_actions
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists campaign_draft_actions_member_insert on public.campaign_draft_actions;
create policy campaign_draft_actions_member_insert
  on public.campaign_draft_actions
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists campaign_draft_actions_member_update on public.campaign_draft_actions;
create policy campaign_draft_actions_member_update
  on public.campaign_draft_actions
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  )
  with check (
    auth.uid() = user_id
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists campaign_draft_actions_service_role_all on public.campaign_draft_actions;
create policy campaign_draft_actions_service_role_all
  on public.campaign_draft_actions
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.campaign_sync_snapshots is
  'Meta read-only confirmation snapshots. Payloads must never contain access tokens, cookies, secrets, provider request payloads, or raw lead PII.';

comment on table public.performance_tracking is
  'Aggregated campaign performance points derived from Meta sync snapshots.';

comment on table public.targeting_intelligence_patterns is
  'Aggregated targeting pattern learning derived from campaign performance only.';

comment on table public.campaign_action_suggestions is
  'Suggested campaign optimizations produced from aggregate sync data; suggestions do not execute provider mutations.';

comment on table public.campaign_draft_actions is
  'Prepared in-app draft optimizations that require app approval paths before provider-facing changes.';

insert into public.app_schema_metadata (key, value)
values ('meta_sync_optimization_tables_schema_version', '20260509020000')
on conflict (key) do update set value = excluded.value;
