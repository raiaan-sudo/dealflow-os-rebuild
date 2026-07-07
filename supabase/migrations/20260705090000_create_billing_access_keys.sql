create table if not exists public.billing_access_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null,
  key_prefix text not null,
  status text not null default 'created',
  stripe_checkout_session_id text null,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  stripe_price_id text null,
  plan_tier text not null default 'pro',
  partner_id uuid null references public.partners (id) on delete set null,
  partner_slug text null,
  claim_token_hash text null,
  preclaimed_email text null,
  preclaimed_at timestamptz null,
  claimed_by_user_id uuid null references auth.users (id) on delete set null,
  claimed_organization_id uuid null references public.organizations (id) on delete set null,
  claimed_at timestamptz null,
  expires_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_access_keys_status_check check (
    status in ('created', 'pending_payment', 'active', 'preclaimed', 'claimed', 'revoked', 'expired')
  )
);

create unique index if not exists billing_access_keys_hash_idx
  on public.billing_access_keys (key_hash);

create unique index if not exists billing_access_keys_checkout_session_idx
  on public.billing_access_keys (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists billing_access_keys_claim_token_idx
  on public.billing_access_keys (claim_token_hash)
  where claim_token_hash is not null;

create index if not exists billing_access_keys_status_created_idx
  on public.billing_access_keys (status, created_at desc);

create table if not exists public.billing_access_key_events (
  id uuid primary key default gen_random_uuid(),
  access_key_id uuid not null references public.billing_access_keys (id) on delete cascade,
  event_type text not null,
  actor_user_id uuid null references auth.users (id) on delete set null,
  actor_organization_id uuid null references public.organizations (id) on delete set null,
  stripe_checkout_session_id text null,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists billing_access_key_events_key_created_idx
  on public.billing_access_key_events (access_key_id, created_at desc);

alter table public.billing_access_keys enable row level security;
alter table public.billing_access_key_events enable row level security;

comment on table public.billing_access_keys is
  'Single-use paid checkout access keys that can be claimed by a new DealFlow workspace.';

comment on column public.billing_access_keys.key_hash is
  'Hash of the raw access key using the server-side access-key pepper; raw keys are never stored in plaintext.';

comment on table public.billing_access_key_events is
  'Immutable audit ledger for access-key checkout, activation, preclaim, claim, revoke, and failure events.';

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260705090000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
