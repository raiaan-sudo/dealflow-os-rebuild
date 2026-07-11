alter table public.marketing_accounts
  add column if not exists refresh_token_encrypted text null,
  add column if not exists token_expires_at timestamptz null;

comment on column public.marketing_accounts.refresh_token_encrypted is
  'Encrypted provider refresh token when the provider flow supplies one; never exposed to the browser.';
comment on column public.marketing_accounts.token_expires_at is
  'Authoritative provider-token expiry used to prevent stale connection readiness.';

create table if not exists public.meta_oauth_states (
  state_hash text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_to text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint meta_oauth_states_hash_shape
    check (state_hash ~ '^[0-9a-f]{64}$'),
  constraint meta_oauth_states_return_to_safe
    check (
      length(return_to) between 1 and 1000
      and return_to like '/%'
      and return_to not like '//%'
    ),
  constraint meta_oauth_states_expiry_bounded
    check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);

create index if not exists meta_oauth_states_expiry_idx
  on public.meta_oauth_states (expires_at)
  where consumed_at is null;

alter table public.meta_oauth_states enable row level security;
alter table public.meta_oauth_states force row level security;
revoke all on public.meta_oauth_states from public, anon, authenticated;

create or replace function public.consume_meta_oauth_state(
  p_state_hash text,
  p_user_id uuid,
  p_organization_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  bound_return_to text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to consume Meta OAuth state';
  end if;

  if p_state_hash is null
    or p_state_hash !~ '^[0-9a-f]{64}$'
    or p_user_id is null
    or p_organization_id is null then
    return null;
  end if;

  update public.meta_oauth_states state
  set consumed_at = timezone('utc', now())
  where state.state_hash = p_state_hash
    and state.user_id = p_user_id
    and state.organization_id = p_organization_id
    and state.consumed_at is null
    and state.expires_at > timezone('utc', now())
  returning state.return_to into bound_return_to;

  return bound_return_to;
end;
$$;

revoke execute on function public.consume_meta_oauth_state(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.consume_meta_oauth_state(text, uuid, uuid)
  to service_role;

comment on table public.meta_oauth_states is
  'One-time, expiring Meta OAuth CSRF state bound to the initiating user and organization.';
