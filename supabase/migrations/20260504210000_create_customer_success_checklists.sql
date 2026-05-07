create table if not exists public.customer_success_checklists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  onboarding_reviewed_at timestamptz null,
  creative_qa_completed_at timestamptz null,
  preview_reviewed_at timestamptz null,
  billing_verified_at timestamptz null,
  meta_connected_verified_at timestamptz null,
  assets_selected_verified_at timestamptz null,
  launch_readiness_verified_at timestamptz null,
  lead_loop_verified_at timestamptz null,
  day_7_check_in_completed_at timestamptz null,
  day_14_value_proof_completed_at timestamptz null,
  day_25_renewal_risk_review_completed_at timestamptz null,
  risk_level text not null default 'normal',
  owner_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_success_checklists_campaign_unique unique (campaign_id),
  constraint customer_success_checklists_risk_check check (risk_level in ('normal', 'watch', 'at_risk', 'blocked'))
);

create index if not exists customer_success_checklists_org_updated_idx
  on public.customer_success_checklists(organization_id, updated_at desc);

create index if not exists customer_success_checklists_campaign_idx
  on public.customer_success_checklists(campaign_id);

alter table public.customer_success_checklists enable row level security;
alter table public.customer_success_checklists force row level security;

drop policy if exists customer_success_checklists_member_select on public.customer_success_checklists;
create policy customer_success_checklists_member_select
  on public.customer_success_checklists
  for select
  to authenticated
  using (private.is_current_user_org_member(organization_id));

drop policy if exists customer_success_checklists_service_role_all on public.customer_success_checklists;
create policy customer_success_checklists_service_role_all
  on public.customer_success_checklists
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.customer_success_checklists is
  'Lightweight launch customer-success checklist state. Stores completion timestamps and non-sensitive operator notes only; no secrets, provider tokens, raw lead PII, or customer payment data.';

insert into public.app_schema_metadata (key, value)
values ('customer_success_checklists_schema_version', '20260504210000')
on conflict (key) do update set value = excluded.value;
