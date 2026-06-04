alter table if exists public.lead_billing_events
  add column if not exists stripe_payment_intent_id text null,
  add column if not exists stripe_charge_id text null,
  add column if not exists currency text not null default 'usd',
  add column if not exists failure_code text null,
  add column if not exists failure_message text null,
  add column if not exists charged_at timestamptz null,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_retry_at timestamptz null;

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'public.lead_billing_events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%pending%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.lead_billing_events drop constraint %I', constraint_name);
  end if;
end $$;

alter table if exists public.lead_billing_events
  add constraint lead_billing_events_status_check
  check (status in ('pending', 'charging', 'charged', 'reported', 'skipped', 'failed', 'credited'));

create index if not exists lead_billing_events_payment_intent_idx
  on public.lead_billing_events (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists lead_billing_events_retry_idx
  on public.lead_billing_events (status, next_retry_at)
  where status = 'failed' and next_retry_at is not null;

comment on table public.lead_billing_events is
  'Local exactly-once ledger for Performance plan qualified-lead billing. New events charge immediate off-session Stripe PaymentIntents; legacy reported rows may reference Stripe meter events.';

comment on column public.lead_billing_events.status is
  'pending/charging are in-flight immediate lead charges; charged means Stripe PaymentIntent succeeded; reported is a legacy Stripe meter event; skipped is non-billable; failed is retryable/manual review; credited is a manual credit/adjustment.';
