create table if not exists public.billing_cancellation_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  plan_tier text null,
  subscription_status text null,
  billing_state text null,
  reason_code text not null default 'not_provided',
  reason_detail text null,
  source text not null default 'settings_portal_entry',
  created_at timestamptz not null default now(),
  constraint billing_cancellation_intents_reason_check check (
    reason_code in (
      'too_expensive',
      'not_enough_leads',
      'campaign_paused',
      'missing_features',
      'switched_provider',
      'temporary_pause',
      'other',
      'not_provided'
    )
  ),
  constraint billing_cancellation_intents_source_not_blank check (length(trim(source)) > 0)
);

create index if not exists billing_cancellation_intents_org_created_idx
  on public.billing_cancellation_intents(organization_id, created_at desc);

create index if not exists billing_cancellation_intents_subscription_created_idx
  on public.billing_cancellation_intents(stripe_subscription_id, created_at desc)
  where stripe_subscription_id is not null;

alter table public.billing_cancellation_intents enable row level security;
alter table public.billing_cancellation_intents force row level security;

drop policy if exists billing_cancellation_intents_member_select on public.billing_cancellation_intents;
create policy billing_cancellation_intents_member_select
  on public.billing_cancellation_intents
  for select
  to authenticated
  using (private.is_current_user_org_member(organization_id));

drop policy if exists billing_cancellation_intents_service_role_all on public.billing_cancellation_intents;
create policy billing_cancellation_intents_service_role_all
  on public.billing_cancellation_intents
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.billing_cancellation_intents is
  'Tracks local manage/cancel intent before redirecting to Stripe Portal. Stripe remains the payment source of truth; this table must not contain secrets, tokens, or raw card/payment data.';

comment on column public.billing_cancellation_intents.reason_detail is
  'Optional customer-entered reason. Keep short, operator-facing, and free of secrets or payment data.';

insert into public.app_schema_metadata (key, value)
values ('billing_cancellation_intents_schema_version', '20260504203000')
on conflict (key) do update set value = excluded.value;
