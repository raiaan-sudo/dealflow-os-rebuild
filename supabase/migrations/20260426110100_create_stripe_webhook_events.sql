create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  stripe_event_type text not null,
  stripe_object_id text null,
  organization_id uuid null references public.organizations (id) on delete set null,
  stripe_subscription_id text null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'ignored', 'failed')),
  processed_at timestamptz null,
  error_code text null,
  error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  payload jsonb null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists stripe_webhook_events_organization_idx
  on public.stripe_webhook_events (organization_id, created_at desc);

create index if not exists stripe_webhook_events_subscription_idx
  on public.stripe_webhook_events (stripe_subscription_id, created_at desc);
