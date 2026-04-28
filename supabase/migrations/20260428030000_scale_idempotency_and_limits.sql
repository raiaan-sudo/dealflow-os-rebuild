create table if not exists public.provider_usage_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid null references public.campaign_plans (id) on delete cascade,
  provider text not null,
  operation text not null,
  usage_date date not null default current_date,
  usage_count integer not null default 0,
  limit_count integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_usage_limits_count_nonnegative check (usage_count >= 0),
  constraint provider_usage_limits_limit_positive check (limit_count > 0),
  constraint provider_usage_limits_scope_unique unique (
    user_id,
    campaign_id,
    provider,
    operation,
    usage_date
  )
);

comment on table public.provider_usage_limits is
  'Durable per-user/campaign/provider usage ledger for paid generation and provider cost backpressure.';

alter table public.system_jobs
  add column if not exists idempotency_key text null,
  add column if not exists locked_by text null,
  add column if not exists locked_until timestamptz null,
  add column if not exists next_run_at timestamptz null,
  add column if not exists last_error_code text null,
  add column if not exists dead_lettered_at timestamptz null;

create unique index if not exists system_jobs_idempotency_key_unique
  on public.system_jobs (idempotency_key)
  where idempotency_key is not null;

create index if not exists system_jobs_claim_idx
  on public.system_jobs (status, next_run_at, locked_until, created_at);

alter table public.leads
  add column if not exists dedupe_hash text null,
  add column if not exists consent_metadata jsonb null,
  add column if not exists sms_opted_out_at timestamptz null;

create unique index if not exists leads_dedupe_hash_unique
  on public.leads (dedupe_hash)
  where dedupe_hash is not null;

create index if not exists leads_campaign_contact_idx
  on public.leads (organization_id, campaign_id, email, phone);

do $$
begin
  if to_regclass('public.lead_messages') is not null then
    alter table public.lead_messages
      add column if not exists provider_message_id text null,
      add column if not exists delivery_status text not null default 'recorded',
      add column if not exists error_message text null;

    create index if not exists lead_messages_provider_message_idx
      on public.lead_messages (provider_message_id)
      where provider_message_id is not null;
  end if;
end $$;

create table if not exists public.meta_launch_locks (
  campaign_id uuid primary key references public.campaign_plans (id) on delete cascade,
  lock_token text not null,
  locked_by text null,
  locked_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.meta_launch_locks is
  'Durable campaign-level launch lease preventing duplicate Meta object creation across serverless instances.';

create index if not exists meta_launch_locks_expiry_idx
  on public.meta_launch_locks (locked_until);

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260428030000')
on conflict (key) do update
set value = excluded.value;
