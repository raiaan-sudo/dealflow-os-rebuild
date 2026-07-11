alter table public.billing_access_keys
  add column if not exists reveal_verifier_hash text null,
  add column if not exists reveal_verifier_expires_at timestamptz null,
  add column if not exists reveal_consumed_at timestamptz null,
  add column if not exists claim_token_expires_at timestamptz null;

alter table public.billing_access_keys
  drop constraint if exists billing_access_keys_reveal_verifier_check;
alter table public.billing_access_keys
  add constraint billing_access_keys_reveal_verifier_check check (
    (reveal_verifier_hash is null and reveal_verifier_expires_at is null)
    or (
      reveal_verifier_hash ~ '^[0-9a-f]{64}$'
      and reveal_verifier_expires_at is not null
    )
  );

update public.billing_access_keys
set claim_token_expires_at = (metadata ->> 'claim_token_expires_at')::timestamptz
where claim_token_expires_at is null
  and metadata ->> 'claim_token_expires_at'
    ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$';

create or replace function public.consume_billing_access_key_reveal(
  p_checkout_session_id text,
  p_reveal_verifier_hash text
)
returns table (
  access_key_id uuid,
  key_prefix text,
  plan_tier text,
  partner_slug text,
  stripe_checkout_session_id text,
  reveal_ciphertext text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_key public.billing_access_keys%rowtype;
  consumed_at timestamptz := timezone('utc', now());
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to consume an access-key reveal';
  end if;

  if nullif(trim(coalesce(p_checkout_session_id, '')), '') is null
    or coalesce(p_reveal_verifier_hash, '') !~ '^[0-9a-f]{64}$' then
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
    or access_key.reveal_verifier_expires_at <= consumed_at
    or nullif(access_key.metadata ->> 'reveal_ciphertext', '') is null then
    return;
  end if;

  update public.billing_access_keys candidate
  set reveal_consumed_at = consumed_at,
      reveal_verifier_hash = null,
      reveal_verifier_expires_at = null,
      metadata = (candidate.metadata - 'reveal_ciphertext') || jsonb_build_object(
        'revealed_at', consumed_at,
        'reveal_consumed_atomically', true
      ),
      updated_at = consumed_at
  where candidate.id = access_key.id
    and candidate.reveal_consumed_at is null
    and candidate.reveal_verifier_hash = p_reveal_verifier_hash
    and candidate.reveal_verifier_expires_at > consumed_at;

  if not found then
    return;
  end if;

  return query select
    access_key.id,
    access_key.key_prefix,
    access_key.plan_tier,
    access_key.partner_slug,
    access_key.stripe_checkout_session_id,
    access_key.metadata ->> 'reveal_ciphertext';
end;
$$;

revoke execute on function public.consume_billing_access_key_reveal(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_billing_access_key_reveal(text, text)
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
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to preclaim an access key';
  end if;

  if coalesce(p_key_hash, '') !~ '^[0-9a-f]{64}$'
    or nullif(trim(coalesce(p_email, '')), '') is null
    or length(trim(p_email)) > 320
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
    ) then
    return;
  end if;

  update public.billing_access_keys candidate
  set status = 'preclaimed',
      claim_token_hash = p_claim_token_hash,
      claim_token_expires_at = p_claim_token_expires_at,
      preclaimed_email = lower(trim(p_email)),
      preclaimed_at = changed_at,
      metadata = candidate.metadata || jsonb_build_object(
        'claim_token_expires_at', p_claim_token_expires_at
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

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260710235992')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
