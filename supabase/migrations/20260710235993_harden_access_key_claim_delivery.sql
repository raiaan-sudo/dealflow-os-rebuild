alter table public.billing_access_keys
  add column if not exists claim_reconciliation_status text not null default 'not_started',
  add column if not exists claim_reconciliation_lease_token uuid null,
  add column if not exists claim_reconciliation_locked_until timestamptz null,
  add column if not exists claim_reconciliation_generation bigint not null default 0,
  add column if not exists claim_reconciliation_last_error_code text null,
  add column if not exists reveal_delivery_token_hash text null,
  add column if not exists reveal_delivery_started_at timestamptz null,
  add column if not exists reveal_delivery_expires_at timestamptz null,
  add column if not exists reveal_delivery_generation bigint not null default 0,
  add column if not exists reveal_ack_token_hash text null;

update public.billing_access_keys
set claim_reconciliation_status = case
      when metadata ->> 'provider_sync_status' = 'completed' then 'completed'
      else 'failed'
    end,
    claim_reconciliation_last_error_code = case
      when metadata ->> 'provider_sync_status' = 'completed' then null
      else coalesce(metadata ->> 'provider_sync_last_error_code', 'legacy_claim_reconciliation_incomplete')
    end
where status = 'claimed'
  and claim_reconciliation_status = 'not_started';

alter table public.billing_access_keys
  drop constraint if exists billing_access_keys_claim_reconciliation_status_check;
alter table public.billing_access_keys
  add constraint billing_access_keys_claim_reconciliation_status_check check (
    claim_reconciliation_status in ('not_started', 'processing', 'failed', 'completed')
  );

alter table public.billing_access_keys
  drop constraint if exists billing_access_keys_claim_reconciliation_generation_check;
alter table public.billing_access_keys
  add constraint billing_access_keys_claim_reconciliation_generation_check check (
    claim_reconciliation_generation >= 0
  );

alter table public.billing_access_keys
  drop constraint if exists billing_access_keys_claim_reconciliation_lease_check;
alter table public.billing_access_keys
  add constraint billing_access_keys_claim_reconciliation_lease_check check (
    (
      claim_reconciliation_status = 'processing'
      and claim_reconciliation_lease_token is not null
      and claim_reconciliation_locked_until is not null
    )
    or (
      claim_reconciliation_status <> 'processing'
      and claim_reconciliation_lease_token is null
      and claim_reconciliation_locked_until is null
    )
  );

alter table public.billing_access_keys
  drop constraint if exists billing_access_keys_reveal_delivery_check;
alter table public.billing_access_keys
  add constraint billing_access_keys_reveal_delivery_check check (
    reveal_delivery_generation >= 0
    and (
      (
        reveal_delivery_token_hash is null
        and reveal_delivery_started_at is null
        and reveal_delivery_expires_at is null
      )
      or (
        reveal_delivery_token_hash ~ '^[0-9a-f]{64}$'
        and reveal_delivery_started_at is not null
        and reveal_delivery_expires_at is not null
        and reveal_delivery_expires_at > reveal_delivery_started_at
      )
    )
    and (reveal_ack_token_hash is null or reveal_ack_token_hash ~ '^[0-9a-f]{64}$')
  );

create or replace function public.claim_billing_access_key_reconciliation(
  p_claim_token_hash text,
  p_user_id uuid,
  p_organization_id uuid,
  p_email text,
  p_lease_ms integer default 600000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_key public.billing_access_keys%rowtype;
  changed_at timestamptz := timezone('utc', now());
  locked_until timestamptz;
  recovery_count integer := 0;
  recovered_without_token boolean := false;
  recovered_claim boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to claim access-key reconciliation';
  end if;

  if coalesce(p_claim_token_hash, '') !~ '^[0-9a-f]{64}$'
    or p_user_id is null
    or p_organization_id is null
    or nullif(trim(coalesce(p_email, '')), '') is null
    or length(trim(p_email)) > 320 then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  if not exists (
      select 1
      from public.organizations organization
      where organization.id = p_organization_id
        and organization.owner_user_id = p_user_id
    )
    or not exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = p_organization_id
        and membership.user_id = p_user_id
    ) then
    return jsonb_build_object('outcome', 'workspace_identity_mismatch');
  end if;

  select * into access_key
  from public.billing_access_keys candidate
  where candidate.claim_token_hash = p_claim_token_hash
  for update;

  if access_key.id is null then
    select count(*) into recovery_count
    from public.billing_access_keys candidate
    where candidate.status = 'claimed'
      and candidate.claimed_by_user_id = p_user_id
      and candidate.claimed_organization_id = p_organization_id
      and candidate.claim_reconciliation_status <> 'completed';

    if recovery_count > 1 then
      return jsonb_build_object('outcome', 'ambiguous_recovery');
    end if;

    if recovery_count = 1 then
      select * into access_key
      from public.billing_access_keys candidate
      where candidate.status = 'claimed'
        and candidate.claimed_by_user_id = p_user_id
        and candidate.claimed_organization_id = p_organization_id
        and candidate.claim_reconciliation_status <> 'completed'
      for update;
      recovered_without_token := true;
    end if;
  end if;

  if access_key.id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if access_key.status = 'preclaimed' then
    if access_key.expires_at is null or access_key.expires_at <= changed_at then
      return jsonb_build_object('outcome', 'expired', 'access_key_id', access_key.id);
    end if;
    if access_key.claim_token_expires_at is null or access_key.claim_token_expires_at <= changed_at then
      return jsonb_build_object('outcome', 'claim_token_expired', 'access_key_id', access_key.id);
    end if;
    if access_key.preclaimed_email is null
      or access_key.preclaimed_email is distinct from lower(trim(p_email)) then
      return jsonb_build_object('outcome', 'email_mismatch', 'access_key_id', access_key.id);
    end if;
  elsif access_key.status = 'claimed' then
    recovered_claim := true;
    if access_key.claimed_by_user_id is distinct from p_user_id
      or access_key.claimed_organization_id is distinct from p_organization_id
      or access_key.preclaimed_email is null
      or access_key.preclaimed_email is distinct from lower(trim(p_email)) then
      return jsonb_build_object('outcome', 'claim_identity_mismatch', 'access_key_id', access_key.id);
    end if;
    if access_key.claim_reconciliation_status = 'completed' then
      return jsonb_build_object('outcome', 'completed', 'access_key_id', access_key.id);
    end if;
  else
    return jsonb_build_object('outcome', 'invalid_status', 'access_key_id', access_key.id);
  end if;

  if access_key.claim_reconciliation_status = 'processing'
    and access_key.claim_reconciliation_locked_until > changed_at then
    return jsonb_build_object('outcome', 'in_progress', 'access_key_id', access_key.id);
  end if;

  locked_until := changed_at
    + make_interval(secs => least(greatest(coalesce(p_lease_ms, 600000), 60000), 1800000) / 1000.0);

  update public.billing_access_keys candidate
  set status = 'claimed',
      claimed_by_user_id = p_user_id,
      claimed_organization_id = p_organization_id,
      claimed_at = coalesce(candidate.claimed_at, changed_at),
      claim_reconciliation_status = 'processing',
      claim_reconciliation_lease_token = gen_random_uuid(),
      claim_reconciliation_locked_until = locked_until,
      claim_reconciliation_generation = candidate.claim_reconciliation_generation + 1,
      claim_reconciliation_last_error_code = null,
      metadata = candidate.metadata || jsonb_build_object(
        'claimed_source', case
          when recovered_without_token then 'app_context_recovery'
          else 'app_context_bootstrap'
        end,
        'provider_sync_status', 'pending',
        'claim_reconciliation_recoverable', true
      ),
      updated_at = changed_at
  where candidate.id = access_key.id
    and (
      candidate.status = 'preclaimed'
      or (
        candidate.status = 'claimed'
        and candidate.claimed_by_user_id = p_user_id
        and candidate.claimed_organization_id = p_organization_id
        and candidate.claim_reconciliation_status <> 'completed'
        and (
          candidate.claim_reconciliation_status <> 'processing'
          or candidate.claim_reconciliation_locked_until <= changed_at
        )
      )
    )
  returning * into access_key;

  if access_key.id is null then
    return jsonb_build_object('outcome', 'in_progress');
  end if;

  return jsonb_build_object(
    'outcome', case
      when recovered_without_token or recovered_claim then 'recovered'
      else 'acquired'
    end,
    'access_key', to_jsonb(access_key)
  );
end;
$$;

revoke execute on function public.claim_billing_access_key_reconciliation(text, uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_billing_access_key_reconciliation(text, uuid, uuid, text, integer)
  to service_role;

create or replace function public.complete_billing_access_key_reconciliation(
  p_access_key_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_metadata_patch jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_at timestamptz := timezone('utc', now());
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to complete access-key reconciliation';
  end if;
  if jsonb_typeof(coalesce(p_metadata_patch, 'null'::jsonb)) <> 'object' then
    return false;
  end if;

  update public.billing_access_keys candidate
  set claim_token_hash = null,
      claim_token_expires_at = null,
      claim_reconciliation_status = 'completed',
      claim_reconciliation_lease_token = null,
      claim_reconciliation_locked_until = null,
      claim_reconciliation_last_error_code = null,
      metadata = candidate.metadata || p_metadata_patch || jsonb_build_object(
        'provider_sync_status', 'completed',
        'provider_sync_completed_at', completed_at,
        'provider_sync_last_error_code', null,
        'claim_token_expires_at', null,
        'claim_reconciliation_recoverable', false
      ),
      updated_at = completed_at
  where candidate.id = p_access_key_id
    and candidate.status = 'claimed'
    and candidate.claimed_by_user_id = p_user_id
    and candidate.claimed_organization_id = p_organization_id
    and candidate.claim_reconciliation_status = 'processing'
    and candidate.claim_reconciliation_lease_token = p_lease_token
    and candidate.claim_reconciliation_generation = p_lease_generation
    and candidate.claim_reconciliation_locked_until > completed_at;

  return found;
end;
$$;

revoke execute on function public.complete_billing_access_key_reconciliation(uuid, uuid, uuid, uuid, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_billing_access_key_reconciliation(uuid, uuid, uuid, uuid, bigint, jsonb)
  to service_role;

create or replace function public.fail_billing_access_key_reconciliation(
  p_access_key_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  failed_at timestamptz := timezone('utc', now());
  safe_error_code text := case
    when coalesce(p_error_code, '') ~ '^[a-z0-9_]{3,100}$' then p_error_code
    else 'access_key_reconciliation_failed'
  end;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to fail access-key reconciliation';
  end if;

  update public.billing_access_keys candidate
  set claim_reconciliation_status = 'failed',
      claim_reconciliation_lease_token = null,
      claim_reconciliation_locked_until = null,
      claim_reconciliation_last_error_code = safe_error_code,
      metadata = candidate.metadata || jsonb_build_object(
        'provider_sync_status', 'failed',
        'provider_sync_last_error_code', safe_error_code,
        'claim_reconciliation_recoverable', true
      ),
      updated_at = failed_at
  where candidate.id = p_access_key_id
    and candidate.status = 'claimed'
    and candidate.claimed_by_user_id = p_user_id
    and candidate.claimed_organization_id = p_organization_id
    and candidate.claim_reconciliation_status = 'processing'
    and candidate.claim_reconciliation_lease_token = p_lease_token
    and candidate.claim_reconciliation_generation = p_lease_generation;

  return found;
end;
$$;

revoke execute on function public.fail_billing_access_key_reconciliation(uuid, uuid, uuid, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.fail_billing_access_key_reconciliation(uuid, uuid, uuid, uuid, bigint, text)
  to service_role;

create or replace function public.preclaim_billing_access_key(
  p_key_hash text,
  p_email text,
  p_partner_slug text,
  p_claim_token_hash text,
  p_claim_token_expires_at timestamptz
)
returns setof public.billing_access_keys
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_key public.billing_access_keys%rowtype;
  changed_at timestamptz := timezone('utc', now());
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to preclaim an access key';
  end if;
  if coalesce(p_key_hash, '') !~ '^[0-9a-f]{64}$'
    or nullif(normalized_email, '') is null
    or length(normalized_email) > 320
    or coalesce(p_claim_token_hash, '') !~ '^[0-9a-f]{64}$'
    or p_claim_token_expires_at is null
    or p_claim_token_expires_at <= changed_at
    or p_claim_token_expires_at > changed_at + interval '25 hours' then
    return;
  end if;

  select * into access_key
  from public.billing_access_keys candidate
  where candidate.key_hash = p_key_hash
  for update;

  if access_key.id is null
    or access_key.expires_at is null
    or access_key.expires_at <= changed_at
    or access_key.status not in ('active', 'preclaimed')
    or (
      nullif(trim(coalesce(p_partner_slug, '')), '') is not null
      and access_key.partner_slug is not null
      and access_key.partner_slug is distinct from trim(p_partner_slug)
    )
    or (
      access_key.status = 'preclaimed'
      and access_key.claim_token_expires_at is not null
      and access_key.claim_token_expires_at > changed_at
      and access_key.preclaimed_email is distinct from normalized_email
    ) then
    return;
  end if;

  update public.billing_access_keys candidate
  set status = 'preclaimed',
      claim_token_hash = p_claim_token_hash,
      claim_token_expires_at = p_claim_token_expires_at,
      preclaimed_email = normalized_email,
      preclaimed_at = changed_at,
      metadata = candidate.metadata || jsonb_build_object(
        'claim_token_expires_at', p_claim_token_expires_at,
        'same_email_preclaim_recoverable', true
      ),
      updated_at = changed_at
  where candidate.id = access_key.id
    and (
      candidate.status = 'active'
      or (
        candidate.status = 'preclaimed'
        and (
          candidate.claim_token_expires_at is null
          or candidate.claim_token_expires_at <= changed_at
          or candidate.preclaimed_email = normalized_email
        )
      )
    )
  returning candidate.* into access_key;

  if access_key.id is not null then
    return next access_key;
  end if;
end;
$$;

revoke execute on function public.preclaim_billing_access_key(text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.preclaim_billing_access_key(text, text, text, text, timestamptz)
  to service_role;

revoke execute on function public.consume_billing_access_key_reveal(text, text)
  from public, anon, authenticated, service_role;
drop function if exists public.consume_billing_access_key_reveal(text, text);

create or replace function public.begin_billing_access_key_reveal_delivery(
  p_checkout_session_id text,
  p_reveal_verifier_hash text,
  p_delivery_token_hash text,
  p_lease_ms integer default 300000
)
returns table (
  access_key_id uuid,
  reveal_ciphertext text,
  delivery_generation bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_key public.billing_access_keys%rowtype;
  started_at timestamptz := timezone('utc', now());
  delivery_expires_at timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to begin an access-key reveal delivery';
  end if;

  if nullif(trim(coalesce(p_checkout_session_id, '')), '') is null
    or coalesce(p_reveal_verifier_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_delivery_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  select * into access_key
  from public.billing_access_keys candidate
  where candidate.stripe_checkout_session_id = trim(p_checkout_session_id)
  for update;

  if access_key.id is null
    or access_key.status not in ('active', 'preclaimed')
    or access_key.claimed_at is not null
    or access_key.reveal_consumed_at is not null
    or access_key.reveal_verifier_hash is distinct from p_reveal_verifier_hash
    or access_key.reveal_verifier_expires_at is null
    or access_key.reveal_verifier_expires_at <= started_at
    or nullif(access_key.metadata ->> 'reveal_ciphertext', '') is null
    or (
      access_key.reveal_delivery_token_hash is not null
      and access_key.reveal_delivery_expires_at > started_at
    ) then
    return;
  end if;

  delivery_expires_at := least(
    access_key.reveal_verifier_expires_at,
    started_at + make_interval(secs => least(greatest(coalesce(p_lease_ms, 300000), 60000), 600000) / 1000.0)
  );

  update public.billing_access_keys candidate
  set reveal_delivery_token_hash = p_delivery_token_hash,
      reveal_delivery_started_at = started_at,
      reveal_delivery_expires_at = delivery_expires_at,
      reveal_delivery_generation = candidate.reveal_delivery_generation + 1,
      updated_at = started_at
  where candidate.id = access_key.id
    and candidate.reveal_consumed_at is null
    and candidate.reveal_verifier_hash = p_reveal_verifier_hash
    and candidate.reveal_verifier_expires_at > started_at
    and (
      candidate.reveal_delivery_token_hash is null
      or candidate.reveal_delivery_expires_at <= started_at
    )
  returning * into access_key;

  if access_key.id is null then
    return;
  end if;

  return query select
    access_key.id,
    access_key.metadata ->> 'reveal_ciphertext',
    access_key.reveal_delivery_generation;
end;
$$;

revoke execute on function public.begin_billing_access_key_reveal_delivery(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.begin_billing_access_key_reveal_delivery(text, text, text, integer)
  to service_role;

create or replace function public.release_billing_access_key_reveal_delivery(
  p_checkout_session_id text,
  p_delivery_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to release an access-key reveal delivery';
  end if;

  update public.billing_access_keys candidate
  set reveal_delivery_token_hash = null,
      reveal_delivery_started_at = null,
      reveal_delivery_expires_at = null,
      updated_at = timezone('utc', now())
  where candidate.stripe_checkout_session_id = trim(coalesce(p_checkout_session_id, ''))
    and candidate.reveal_consumed_at is null
    and candidate.reveal_delivery_token_hash = p_delivery_token_hash;

  return found;
end;
$$;

revoke execute on function public.release_billing_access_key_reveal_delivery(text, text)
  from public, anon, authenticated;
grant execute on function public.release_billing_access_key_reveal_delivery(text, text)
  to service_role;

create or replace function public.ack_billing_access_key_reveal_delivery(
  p_checkout_session_id text,
  p_delivery_token_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_key public.billing_access_keys%rowtype;
  acknowledged_at timestamptz := timezone('utc', now());
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to acknowledge an access-key reveal delivery';
  end if;
  if nullif(trim(coalesce(p_checkout_session_id, '')), '') is null
    or coalesce(p_delivery_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return 'rejected';
  end if;

  select * into access_key
  from public.billing_access_keys candidate
  where candidate.stripe_checkout_session_id = trim(p_checkout_session_id)
  for update;

  if access_key.id is null then
    return 'rejected';
  end if;
  if access_key.reveal_consumed_at is not null
    and access_key.reveal_ack_token_hash = p_delivery_token_hash then
    return 'already_acknowledged';
  end if;
  if access_key.reveal_consumed_at is not null
    or access_key.reveal_delivery_token_hash is distinct from p_delivery_token_hash then
    return 'rejected';
  end if;

  update public.billing_access_keys candidate
  set reveal_consumed_at = acknowledged_at,
      reveal_verifier_hash = null,
      reveal_verifier_expires_at = null,
      reveal_delivery_token_hash = null,
      reveal_delivery_started_at = null,
      reveal_delivery_expires_at = null,
      reveal_ack_token_hash = p_delivery_token_hash,
      metadata = (candidate.metadata - 'reveal_ciphertext') || jsonb_build_object(
        'revealed_at', acknowledged_at,
        'reveal_delivery_acknowledged', true
      ),
      updated_at = acknowledged_at
  where candidate.id = access_key.id
    and candidate.reveal_consumed_at is null
    and candidate.reveal_delivery_token_hash = p_delivery_token_hash;

  return case when found then 'acknowledged' else 'rejected' end;
end;
$$;

revoke execute on function public.ack_billing_access_key_reveal_delivery(text, text)
  from public, anon, authenticated;
grant execute on function public.ack_billing_access_key_reveal_delivery(text, text)
  to service_role;

comment on function public.begin_billing_access_key_reveal_delivery(text, text, text, integer) is
  'Takes a single concurrent reveal-delivery lease without deleting ciphertext. A failed decrypt can release the lease; an expired unacknowledged delivery can be retried.';
comment on function public.ack_billing_access_key_reveal_delivery(text, text) is
  'Irreversibly consumes a reveal only after the browser acknowledges receipt. The exact delivery token makes acknowledgement idempotent and stale acknowledgements harmless.';
comment on function public.claim_billing_access_key_reconciliation(text, uuid, uuid, text, integer) is
  'Atomically binds a paid access key to one exact owner workspace and leases recoverable provider/billing reconciliation. Live concurrent claims do not share the lease token.';

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260710235993')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
