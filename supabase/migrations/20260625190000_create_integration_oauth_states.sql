begin;

create table if not exists public.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  nonce text not null,
  state_hash text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaign_plans(id) on delete set null,
  partner_id uuid references public.partners(id) on delete set null,
  origin_host text not null,
  return_host text not null,
  return_to text not null,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint integration_oauth_states_provider_check check (provider in ('meta')),
  constraint integration_oauth_states_nonce_not_blank check (length(trim(nonce)) > 0),
  constraint integration_oauth_states_state_hash_not_blank check (length(trim(state_hash)) > 0),
  constraint integration_oauth_states_return_to_relative check (return_to like '/%' and return_to not like '//%'),
  constraint integration_oauth_states_origin_host_not_blank check (length(trim(origin_host)) > 0),
  constraint integration_oauth_states_return_host_not_blank check (length(trim(return_host)) > 0)
);

create unique index if not exists integration_oauth_states_provider_nonce_idx
  on public.integration_oauth_states(provider, nonce);

create index if not exists integration_oauth_states_campaign_idx
  on public.integration_oauth_states(campaign_id);

create index if not exists integration_oauth_states_expires_at_idx
  on public.integration_oauth_states(expires_at);

alter table public.integration_oauth_states enable row level security;
alter table public.integration_oauth_states force row level security;

drop policy if exists integration_oauth_states_service_role_all on public.integration_oauth_states;
create policy integration_oauth_states_service_role_all
  on public.integration_oauth_states
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.integration_oauth_states is
  'Short-lived server-side OAuth state ledger. Stores hashes and routing context only; no tokens or credentials.';

insert into public.app_schema_metadata(key, value, updated_at)
values (
  'integration_oauth_states_schema_version',
  to_jsonb('20260625190000'::text),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
