create table if not exists public.lead_billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete restrict,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  stripe_subscription_item_id text null,
  stripe_metered_price_id text null,
  amount_cents integer not null default 300 check (amount_cents >= 0),
  meter_event_name text not null default 'dealflow_billable_lead',
  status text not null default 'pending' check (status in ('pending', 'reported', 'skipped', 'failed', 'credited')),
  skip_reason text null,
  stripe_meter_event_id text null,
  idempotency_key text not null,
  reported_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint lead_billing_events_lead_unique unique (lead_id),
  constraint lead_billing_events_idempotency_unique unique (idempotency_key)
);

create index if not exists lead_billing_events_org_period_idx
  on public.lead_billing_events (organization_id, created_at desc);

create index if not exists lead_billing_events_campaign_idx
  on public.lead_billing_events (campaign_id, created_at desc);

create index if not exists lead_billing_events_status_idx
  on public.lead_billing_events (status, created_at desc);

alter table public.lead_billing_events enable row level security;
alter table public.lead_billing_events force row level security;

drop policy if exists lead_billing_events_member_select on public.lead_billing_events;
create policy lead_billing_events_member_select
  on public.lead_billing_events
  for select
  to authenticated
  using (private.is_current_user_org_member(organization_id));

drop policy if exists lead_billing_events_service_role_all on public.lead_billing_events;
create policy lead_billing_events_service_role_all
  on public.lead_billing_events
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.lead_billing_events is
  'Local exactly-once ledger for Performance plan qualified-lead metered Stripe usage.';

comment on column public.lead_billing_events.status is
  'pending means created locally but not reported to Stripe; reported means Stripe meter event accepted; skipped means non-billable; failed means retryable/manual review; credited means manual credit/adjustment recorded outside automated billing.';
