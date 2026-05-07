create table if not exists public.campaign_value_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  campaign_id uuid references public.campaign_plans(id) on delete cascade,
  report_type text not null default 'weekly_value',
  report_key text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'generated',
  summary jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_value_reports_type_check check (report_type in ('weekly_value', 'campaign_progress')),
  constraint campaign_value_reports_status_check check (status in ('generated', 'review_needed', 'sent', 'archived')),
  constraint campaign_value_reports_key_not_blank check (length(trim(report_key)) > 0)
);

create unique index if not exists campaign_value_reports_org_campaign_key_unique
  on public.campaign_value_reports(organization_id, campaign_id, report_key);

create index if not exists campaign_value_reports_org_created_idx
  on public.campaign_value_reports(organization_id, created_at desc);

create index if not exists campaign_value_reports_campaign_created_idx
  on public.campaign_value_reports(campaign_id, created_at desc);

alter table public.campaign_value_reports enable row level security;
alter table public.campaign_value_reports force row level security;

drop policy if exists campaign_value_reports_member_select on public.campaign_value_reports;
create policy campaign_value_reports_member_select
  on public.campaign_value_reports
  for select
  to authenticated
  using (private.is_current_user_org_member(organization_id));

drop policy if exists campaign_value_reports_service_role_all on public.campaign_value_reports;
create policy campaign_value_reports_service_role_all
  on public.campaign_value_reports
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.campaign_value_reports is
  'Deterministic in-app campaign progress and weekly value report snapshots. Summary JSON must avoid raw lead PII and provider secrets.';

insert into public.app_schema_metadata (key, value)
values ('campaign_value_reports_schema_version', '20260504190000')
on conflict (key) do update set value = excluded.value;
