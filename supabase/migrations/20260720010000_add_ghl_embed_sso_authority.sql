-- Explicit DealFlow identity binding and one-time, service-only HighLevel embed
-- authentication receipts. Raw HighLevel payloads and user emails are never
-- stored in the receipt authority.

alter table public.workspace_ghl_users
  add column if not exists dealflow_user_id uuid null;

do $dealflow_ghl_user_binding_fk$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.workspace_ghl_users'::regclass
      and conname = 'workspace_ghl_users_dealflow_user_id_fkey'
  ) then
    alter table public.workspace_ghl_users
      add constraint workspace_ghl_users_dealflow_user_id_fkey
      foreign key (dealflow_user_id) references public.users(id) on delete restrict;
  end if;
end;
$dealflow_ghl_user_binding_fk$;

do $dealflow_ghl_binding_backfill$
begin
  if exists (
    with candidates as (
      select binding.id, count(*)::integer as candidate_count
      from public.workspace_ghl_users binding
      join public.users candidate
        on lower(btrim(candidate.email)) = lower(btrim(binding.email))
       and candidate.partner_id = binding.partner_id
      join public.organization_memberships membership
        on membership.organization_id = binding.workspace_id
       and membership.user_id = candidate.id
      join auth.users auth_candidate
        on auth_candidate.id = candidate.id
       and lower(btrim(auth_candidate.email)) = lower(btrim(binding.email))
      where binding.invite_status = 'active'
        and binding.dealflow_user_id is null
        and lower(btrim(membership.role)) not in ('platform_admin','internal_admin','operator')
        and auth_candidate.email_confirmed_at is not null
        and auth_candidate.deleted_at is null
        and coalesce(auth_candidate.is_anonymous, false) = false
        and (auth_candidate.banned_until is null or auth_candidate.banned_until <= timezone('utc', now()))
        and not exists (
          select 1 from public.platform_operator_grants operator_grant
          where operator_grant.user_id = candidate.id
        )
        and not exists (
          select 1 from public.account_deletion_suspensions suspension
          where suspension.organization_id = binding.workspace_id
             or suspension.requested_by_user_id = candidate.id
        )
      group by binding.id
    )
    select 1 from candidates where candidate_count > 1
  ) then
    raise exception 'ghl_embed_binding_backfill_ambiguous' using errcode = '23505';
  end if;

  if exists (
    with exact_candidates as (
      select binding.id as binding_id, (array_agg(candidate.id order by candidate.id))[1] as user_id
      from public.workspace_ghl_users binding
      join public.users candidate
        on lower(btrim(candidate.email)) = lower(btrim(binding.email))
       and candidate.partner_id = binding.partner_id
      join public.organization_memberships membership
        on membership.organization_id = binding.workspace_id
       and membership.user_id = candidate.id
      join auth.users auth_candidate
        on auth_candidate.id = candidate.id
       and lower(btrim(auth_candidate.email)) = lower(btrim(binding.email))
      where binding.invite_status = 'active'
        and binding.dealflow_user_id is null
        and lower(btrim(membership.role)) not in ('platform_admin','internal_admin','operator')
        and auth_candidate.email_confirmed_at is not null
        and auth_candidate.deleted_at is null
        and coalesce(auth_candidate.is_anonymous, false) = false
        and (auth_candidate.banned_until is null or auth_candidate.banned_until <= timezone('utc', now()))
        and not exists (
          select 1 from public.platform_operator_grants operator_grant
          where operator_grant.user_id = candidate.id
        )
        and not exists (
          select 1 from public.account_deletion_suspensions suspension
          where suspension.organization_id = binding.workspace_id
             or suspension.requested_by_user_id = candidate.id
        )
      group by binding.id
      having count(*) = 1
    )
    select 1
    from exact_candidates candidate
    join public.workspace_ghl_users binding on binding.id = candidate.binding_id
    group by candidate.user_id, binding.workspace_id, binding.partner_id
    having count(*) > 1
  ) then
    raise exception 'ghl_embed_binding_backfill_collision' using errcode = '23505';
  end if;

  with exact_candidates as (
    select binding.id as binding_id, (array_agg(candidate.id order by candidate.id))[1] as user_id
    from public.workspace_ghl_users binding
    join public.users candidate
      on lower(btrim(candidate.email)) = lower(btrim(binding.email))
     and candidate.partner_id = binding.partner_id
    join public.organization_memberships membership
      on membership.organization_id = binding.workspace_id
     and membership.user_id = candidate.id
    join auth.users auth_candidate
      on auth_candidate.id = candidate.id
     and lower(btrim(auth_candidate.email)) = lower(btrim(binding.email))
    where binding.invite_status = 'active'
      and binding.dealflow_user_id is null
      and lower(btrim(membership.role)) not in ('platform_admin','internal_admin','operator')
      and auth_candidate.email_confirmed_at is not null
      and auth_candidate.deleted_at is null
      and coalesce(auth_candidate.is_anonymous, false) = false
      and (auth_candidate.banned_until is null or auth_candidate.banned_until <= timezone('utc', now()))
      and not exists (
        select 1 from public.platform_operator_grants operator_grant
        where operator_grant.user_id = candidate.id
      )
      and not exists (
        select 1 from public.account_deletion_suspensions suspension
        where suspension.organization_id = binding.workspace_id
           or suspension.requested_by_user_id = candidate.id
      )
    group by binding.id
    having count(*) = 1
  )
  update public.workspace_ghl_users binding
     set dealflow_user_id = candidate.user_id,
         updated_at = timezone('utc', now())
    from exact_candidates candidate
   where binding.id = candidate.binding_id;
end;
$dealflow_ghl_binding_backfill$;

create unique index if not exists workspace_ghl_users_dealflow_identity_unique
  on public.workspace_ghl_users (workspace_id, partner_id, dealflow_user_id)
  where dealflow_user_id is not null;

create or replace function public.bind_workspace_ghl_dealflow_user_v1(
  p_workspace_id uuid,
  p_partner_id uuid,
  p_ghl_location_id text,
  p_ghl_user_id text,
  p_normalized_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  binding public.workspace_ghl_users%rowtype;
  candidate_user_id uuid;
  candidate_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'ghl_embed_binding_service_role_required' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_partner_id is null
    or length(btrim(coalesce(p_ghl_location_id, ''))) not between 3 and 160
    or length(btrim(coalesce(p_ghl_user_id, ''))) not between 3 and 160
    or p_normalized_email is distinct from lower(btrim(p_normalized_email))
    or length(p_normalized_email) not between 3 and 320 then
    raise exception 'ghl_embed_binding_context_invalid' using errcode = '22023';
  end if;

  select * into strict binding
  from public.workspace_ghl_users candidate
  where candidate.workspace_id = p_workspace_id
    and candidate.partner_id = p_partner_id
    and candidate.ghl_location_id = p_ghl_location_id
    and candidate.ghl_user_id = p_ghl_user_id
    and lower(btrim(candidate.email)) = p_normalized_email
    and candidate.invite_status = 'active'
  for update;

  select count(*)::integer, (array_agg(candidate.id order by candidate.id))[1]
    into candidate_count, candidate_user_id
  from public.users candidate
  join public.organization_memberships membership
    on membership.organization_id = p_workspace_id
   and membership.user_id = candidate.id
  join auth.users auth_candidate
    on auth_candidate.id = candidate.id
   and lower(btrim(auth_candidate.email)) = p_normalized_email
  where candidate.partner_id = p_partner_id
    and lower(btrim(candidate.email)) = p_normalized_email
    and lower(btrim(membership.role)) not in ('platform_admin','internal_admin','operator')
    and auth_candidate.email_confirmed_at is not null
    and auth_candidate.deleted_at is null
    and coalesce(auth_candidate.is_anonymous, false) = false
    and (auth_candidate.banned_until is null or auth_candidate.banned_until <= timezone('utc', now()))
    and not exists (
      select 1 from public.platform_operator_grants operator_grant
      where operator_grant.user_id = candidate.id
    )
    and not exists (
      select 1 from public.account_deletion_suspensions suspension
      where suspension.organization_id = p_workspace_id
         or suspension.requested_by_user_id = candidate.id
    );

  if candidate_count <> 1 or candidate_user_id is null then
    raise exception 'ghl_embed_binding_candidate_ambiguous_or_missing' using errcode = '42501';
  end if;
  if binding.dealflow_user_id is not null
    and binding.dealflow_user_id <> candidate_user_id then
    raise exception 'ghl_embed_binding_collision' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.workspace_ghl_users other
    where other.workspace_id = p_workspace_id
      and other.partner_id = p_partner_id
      and other.dealflow_user_id = candidate_user_id
      and other.id <> binding.id
  ) then
    raise exception 'ghl_embed_binding_collision' using errcode = '23505';
  end if;

  update public.workspace_ghl_users
     set dealflow_user_id = candidate_user_id,
         updated_at = timezone('utc', now())
   where id = binding.id;
  return candidate_user_id;
exception when no_data_found or too_many_rows then
  raise exception 'ghl_embed_binding_row_ambiguous_or_missing' using errcode = '42501';
end;
$$;

revoke all on function public.bind_workspace_ghl_dealflow_user_v1(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.bind_workspace_ghl_dealflow_user_v1(uuid,uuid,text,text,text)
  to service_role;

create table if not exists public.ghl_embed_auth_exchanges (
  id uuid primary key default gen_random_uuid(),
  payload_digest text not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  partner_id uuid not null references public.partners(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_location_id text not null check (length(btrim(provider_location_id)) between 3 and 160),
  provider_user_id text not null check (length(btrim(provider_user_id)) between 3 and 160),
  dealflow_user_id uuid not null references public.users(id) on delete restrict,
  state text not null default 'pending' check (state in ('pending', 'consumed', 'expired')),
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  constraint ghl_embed_auth_exchange_expiry check (
    expires_at > created_at and expires_at <= created_at + interval '2 minutes'
  ),
  constraint ghl_embed_auth_exchange_consumption_shape check (
    (state = 'consumed' and consumed_at is not null)
    or (state <> 'consumed' and consumed_at is null)
  )
);

-- The signed HighLevel payload does not carry a trusted nonce or timestamp.
-- Keep its ciphertext digest globally single-use for 24 hours so consuming or
-- expiring the two-minute exchange cannot reopen an exact ciphertext replay.
create unique index if not exists ghl_embed_auth_exchange_digest_unique
  on public.ghl_embed_auth_exchanges (payload_digest);
create index if not exists ghl_embed_auth_exchange_expiry_idx
  on public.ghl_embed_auth_exchanges (expires_at, state);

alter table public.ghl_embed_auth_exchanges enable row level security;
alter table public.ghl_embed_auth_exchanges force row level security;
revoke all on table public.ghl_embed_auth_exchanges
  from public, anon, authenticated, service_role;

create or replace function public.begin_ghl_embed_auth_exchange_v1(
  p_payload_digest text,
  p_partner_id uuid,
  p_organization_id uuid,
  p_provider_location_id text,
  p_provider_user_id text,
  p_dealflow_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'ghl_embed_exchange_service_role_required' using errcode = '42501';
  end if;
  if p_payload_digest !~ '^[0-9a-f]{64}$'
    or p_partner_id is null
    or p_organization_id is null
    or p_dealflow_user_id is null
    or length(btrim(coalesce(p_provider_location_id, ''))) not between 3 and 160
    or length(btrim(coalesce(p_provider_user_id, ''))) not between 3 and 160 then
    raise exception 'ghl_embed_exchange_context_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.workspace_ghl_users binding
    where binding.workspace_id = p_organization_id
      and binding.partner_id = p_partner_id
      and binding.ghl_location_id = p_provider_location_id
      and binding.ghl_user_id = p_provider_user_id
      and binding.dealflow_user_id = p_dealflow_user_id
      and binding.invite_status = 'active'
  ) then
    raise exception 'ghl_embed_exchange_binding_invalid' using errcode = '42501';
  end if;

  delete from public.ghl_embed_auth_exchanges exchange
   where exchange.created_at < timezone('utc', now()) - interval '24 hours';

  update public.ghl_embed_auth_exchanges exchange
     set state = 'expired'
   where exchange.state = 'pending'
     and exchange.expires_at <= timezone('utc', now());

  begin
    insert into public.ghl_embed_auth_exchanges (
      payload_digest, partner_id, organization_id, provider_location_id,
      provider_user_id, dealflow_user_id, expires_at
    ) values (
      p_payload_digest, p_partner_id, p_organization_id,
      btrim(p_provider_location_id), btrim(p_provider_user_id),
      p_dealflow_user_id, timezone('utc', now()) + interval '2 minutes'
    ) returning id into created_id;
  exception when unique_violation then
    raise exception 'ghl_embed_exchange_payload_already_seen' using errcode = '23505';
  end;
  return created_id;
end;
$$;

create or replace function public.consume_ghl_embed_auth_exchange_v1(
  p_exchange_id uuid,
  p_payload_digest text,
  p_dealflow_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  consumed_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'ghl_embed_exchange_service_role_required' using errcode = '42501';
  end if;
  if p_exchange_id is null
    or p_dealflow_user_id is null
    or p_payload_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'ghl_embed_exchange_context_invalid' using errcode = '22023';
  end if;

  update public.ghl_embed_auth_exchanges exchange
     set state = 'consumed', consumed_at = timezone('utc', now())
   where exchange.id = p_exchange_id
     and exchange.payload_digest = p_payload_digest
     and exchange.dealflow_user_id = p_dealflow_user_id
     and exchange.state = 'pending'
     and exchange.expires_at > timezone('utc', now());
  get diagnostics consumed_count = row_count;
  return consumed_count = 1;
end;
$$;

revoke all on function public.begin_ghl_embed_auth_exchange_v1(text,uuid,uuid,text,text,uuid)
  from public, anon, authenticated;
revoke all on function public.consume_ghl_embed_auth_exchange_v1(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.begin_ghl_embed_auth_exchange_v1(text,uuid,uuid,text,text,uuid)
  to service_role;
grant execute on function public.consume_ghl_embed_auth_exchange_v1(uuid,text,uuid)
  to service_role;

insert into public.app_schema_metadata(key, value, updated_at)
values ('schema_version', '20260720010000', timezone('utc', now()))
on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at;

do $dealflow_ghl_embed_sso_postcondition$
begin
  if to_regclass('public.ghl_embed_auth_exchanges') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'workspace_ghl_users'
        and column_name = 'dealflow_user_id'
    )
    or to_regprocedure('public.begin_ghl_embed_auth_exchange_v1(text,uuid,uuid,text,text,uuid)') is null
    or to_regprocedure('public.consume_ghl_embed_auth_exchange_v1(uuid,text,uuid)') is null
    or to_regprocedure('public.bind_workspace_ghl_dealflow_user_v1(uuid,uuid,text,text,text)') is null
    or not exists (
      select 1 from public.app_schema_metadata metadata
      where metadata.key = 'schema_version' and metadata.value = '20260720010000'
    ) then
    raise exception '20260720010000 postcondition failed';
  end if;
end;
$dealflow_ghl_embed_sso_postcondition$;
