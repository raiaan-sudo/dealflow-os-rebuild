alter table public.stripe_webhook_events
  add column if not exists payload jsonb null;

alter table public.stripe_webhook_events
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

comment on column public.stripe_webhook_events.payload is
  'Minimal Stripe event metadata captured at claim time for webhook idempotency and auditability.';

comment on column public.stripe_webhook_events.updated_at is
  'Last webhook processing state transition timestamp used to reclaim stale processing events safely.';

update public.stripe_webhook_events
set updated_at = coalesce(updated_at, created_at, timezone('utc', now()));

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260427')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
