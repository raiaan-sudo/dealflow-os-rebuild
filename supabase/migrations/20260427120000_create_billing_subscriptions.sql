create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid null references auth.users (id) on delete set null,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  stripe_checkout_session_id text null,
  stripe_price_id text null,
  plan_tier text not null default 'starter',
  status text not null default 'inactive',
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  metadata jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_subscriptions_organization_unique unique (organization_id)
);

create unique index if not exists billing_subscriptions_stripe_subscription_idx
  on public.billing_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists billing_subscriptions_user_idx
  on public.billing_subscriptions (user_id, created_at desc);

comment on table public.billing_subscriptions
  is 'Stores the authoritative Stripe subscription state used by launch billing gates.';

comment on column public.billing_subscriptions.organization_id
  is 'Workspace/organization that owns the billing subscription.';

comment on column public.billing_subscriptions.status
  is 'Latest Stripe subscription or checkout status used for access decisions.';

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260427')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
