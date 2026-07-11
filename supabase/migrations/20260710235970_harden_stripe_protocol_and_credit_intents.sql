-- Hard cutover for Stripe webhook claims: new workers use versioned SECURITY
-- DEFINER functions and old workers lose direct write privileges. A deployment
-- drain is still mandatory for invocations that began before this migration.

create or replace function public.claim_stripe_webhook_event_v2(
  p_stripe_event_id text,
  p_stripe_event_type text,
  p_stripe_object_id text,
  p_organization_id uuid,
  p_stripe_subscription_id text,
  p_payload jsonb,
  p_claim_token uuid,
  p_lease_ms integer default 300000
)
returns table (
  claim_outcome text,
  receipt_id uuid,
  receipt_status text,
  claim_token uuid,
  claim_generation bigint,
  locked_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt public.stripe_webhook_events%rowtype;
  lease_deadline timestamptz := timezone('utc', now())
    + pg_catalog.make_interval(
        secs => least(greatest(coalesce(p_lease_ms, 300000), 30000), 600000) / 1000.0
      );
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'stripe_webhook_service_role_required';
  end if;

  if nullif(trim(coalesce(p_stripe_event_id, '')), '') is null
    or nullif(trim(coalesce(p_stripe_event_type, '')), '') is null
    or p_claim_token is null then
    raise exception using errcode = '22023', message = 'stripe_webhook_claim_identity_incomplete';
  end if;

  insert into public.stripe_webhook_events (
    stripe_event_id,
    stripe_event_type,
    stripe_object_id,
    organization_id,
    stripe_subscription_id,
    status,
    processing_claim_token,
    processing_claim_generation,
    processing_locked_until,
    payload,
    updated_at
  ) values (
    trim(p_stripe_event_id),
    trim(p_stripe_event_type),
    nullif(trim(coalesce(p_stripe_object_id, '')), ''),
    p_organization_id,
    nullif(trim(coalesce(p_stripe_subscription_id, '')), ''),
    'processing',
    p_claim_token,
    1,
    lease_deadline,
    coalesce(p_payload, '{}'::jsonb),
    timezone('utc', now())
  )
  on conflict (stripe_event_id) do nothing
  returning * into receipt;

  if receipt.id is not null then
    return query select
      'claimed'::text,
      receipt.id,
      receipt.status,
      receipt.processing_claim_token,
      receipt.processing_claim_generation,
      receipt.processing_locked_until;
    return;
  end if;

  select * into strict receipt
  from public.stripe_webhook_events existing
  where existing.stripe_event_id = trim(p_stripe_event_id)
  for update;

  if receipt.stripe_event_type is distinct from trim(p_stripe_event_type)
    or receipt.stripe_object_id is distinct from nullif(trim(coalesce(p_stripe_object_id, '')), '')
    or receipt.organization_id is distinct from p_organization_id
    or receipt.stripe_subscription_id is distinct from nullif(trim(coalesce(p_stripe_subscription_id, '')), '') then
    raise exception using errcode = '23505', message = 'stripe_webhook_event_identity_collision';
  end if;

  if receipt.status in ('processed', 'ignored') then
    return query select
      'duplicate'::text,
      receipt.id,
      receipt.status,
      receipt.processing_claim_token,
      receipt.processing_claim_generation,
      receipt.processing_locked_until;
    return;
  end if;

  if receipt.status = 'processing'
    and receipt.processing_locked_until is not null
    and receipt.processing_locked_until > timezone('utc', now()) then
    return query select
      'busy'::text,
      receipt.id,
      receipt.status,
      receipt.processing_claim_token,
      receipt.processing_claim_generation,
      receipt.processing_locked_until;
    return;
  end if;

  update public.stripe_webhook_events existing
  set status = 'processing',
      processed_at = null,
      error_code = null,
      error_message = null,
      processing_claim_token = p_claim_token,
      processing_claim_generation = greatest(existing.processing_claim_generation + 1, 1),
      processing_locked_until = lease_deadline,
      updated_at = timezone('utc', now())
  where existing.id = receipt.id
    and (
      existing.status = 'failed'
      or (
        existing.status = 'processing'
        and coalesce(existing.processing_locked_until, '-infinity'::timestamptz)
          <= timezone('utc', now())
      )
    )
  returning * into receipt;

  if receipt.id is null then
    return query select 'busy'::text, null::uuid, null::text, null::uuid, null::bigint, null::timestamptz;
    return;
  end if;

  return query select
    'claimed'::text,
    receipt.id,
    receipt.status,
    receipt.processing_claim_token,
    receipt.processing_claim_generation,
    receipt.processing_locked_until;
end;
$$;

create or replace function public.settle_stripe_webhook_event_v2(
  p_stripe_event_id text,
  p_claim_token uuid,
  p_claim_generation bigint,
  p_status text,
  p_error_code text,
  p_error_message text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'stripe_webhook_service_role_required';
  end if;

  if p_status not in ('processed', 'ignored', 'failed')
    or p_claim_token is null
    or p_claim_generation is null
    or p_claim_generation < 1 then
    raise exception using errcode = '22023', message = 'stripe_webhook_settlement_invalid';
  end if;

  update public.stripe_webhook_events receipt
  set status = p_status,
      processed_at = case when p_status = 'failed' then null else timezone('utc', now()) end,
      error_code = nullif(left(coalesce(p_error_code, ''), 200), ''),
      error_message = nullif(left(coalesce(p_error_message, ''), 1000), ''),
      processing_claim_token = null,
      processing_locked_until = null,
      updated_at = timezone('utc', now())
  where receipt.stripe_event_id = trim(p_stripe_event_id)
    and receipt.status = 'processing'
    and receipt.processing_claim_token = p_claim_token
    and receipt.processing_claim_generation = p_claim_generation
    and receipt.processing_locked_until > timezone('utc', now());

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.claim_stripe_webhook_event_v2(text, text, text, uuid, text, jsonb, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event_v2(text, text, text, uuid, text, jsonb, uuid, integer)
  to service_role;
revoke all on function public.settle_stripe_webhook_event_v2(text, uuid, bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_stripe_webhook_event_v2(text, uuid, bigint, text, text, text)
  to service_role;

revoke insert, update, delete, truncate, references, trigger
  on public.stripe_webhook_events from service_role;
grant select on public.stripe_webhook_events to service_role;

-- A credit purchase is defined by this durable server-created intent. Stripe
-- metadata contains only its opaque id; tenant, user, amount, currency, and
-- customer are derived from the locked intent during webhook settlement.
create table if not exists public.credit_top_up_intents (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_cents integer not null check (amount_cents between 2500 and 100000),
  currency text not null check (currency = lower(currency) and length(currency) = 3),
  stripe_customer_id text not null,
  stripe_checkout_session_id text null,
  stripe_payment_intent_id text null,
  source_event_id text null,
  status text not null default 'created'
    check (status in ('created', 'checkout_created', 'completed', 'operator_action_required')),
  created_at timestamptz not null default timezone('utc', now()),
  checkout_bound_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint credit_top_up_intents_customer_present check (length(trim(stripe_customer_id)) > 0),
  constraint credit_top_up_intents_session_unique unique (stripe_checkout_session_id),
  constraint credit_top_up_intents_source_event_unique unique (source_event_id)
);

alter table public.credit_top_up_intents enable row level security;
alter table public.credit_top_up_intents force row level security;
revoke all on public.credit_top_up_intents from public, anon, authenticated, service_role;

create or replace function public.create_credit_top_up_intent_v1(
  p_intent_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_stripe_customer_id text
)
returns setof public.credit_top_up_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.credit_top_up_intents%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'credit_top_up_service_role_required';
  end if;

  if p_intent_id is null or p_organization_id is null or p_user_id is null
    or p_amount_cents is null or p_amount_cents < 2500 or p_amount_cents > 100000
    or lower(trim(coalesce(p_currency, ''))) <> 'usd'
    or nullif(trim(coalesce(p_stripe_customer_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'credit_top_up_intent_invalid';
  end if;

  if not exists (
    select 1 from public.organizations organization_record
    where organization_record.id = p_organization_id
      and organization_record.owner_user_id = p_user_id
  ) and not exists (
    select 1 from public.organization_memberships membership_record
    where membership_record.organization_id = p_organization_id
      and membership_record.user_id = p_user_id
  ) then
    raise exception using errcode = '42501', message = 'credit_top_up_actor_not_member';
  end if;

  insert into public.credit_top_up_intents (
    id, organization_id, user_id, amount_cents, currency, stripe_customer_id
  ) values (
    p_intent_id,
    p_organization_id,
    p_user_id,
    p_amount_cents,
    lower(trim(p_currency)),
    trim(p_stripe_customer_id)
  )
  on conflict (id) do nothing;

  select * into strict intent
  from public.credit_top_up_intents existing
  where existing.id = p_intent_id;

  if intent.organization_id is distinct from p_organization_id
    or intent.user_id is distinct from p_user_id
    or intent.amount_cents is distinct from p_amount_cents
    or intent.currency is distinct from lower(trim(p_currency))
    or intent.stripe_customer_id is distinct from trim(p_stripe_customer_id) then
    raise exception using errcode = '23505', message = 'credit_top_up_intent_identity_collision';
  end if;

  return next intent;
end;
$$;

create or replace function public.bind_credit_top_up_checkout_v1(
  p_intent_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_stripe_checkout_session_id text
)
returns setof public.credit_top_up_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.credit_top_up_intents%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'credit_top_up_service_role_required';
  end if;

  select * into strict intent
  from public.credit_top_up_intents existing
  where existing.id = p_intent_id
  for update;

  if intent.organization_id is distinct from p_organization_id
    or intent.user_id is distinct from p_user_id
    or nullif(trim(coalesce(p_stripe_checkout_session_id, '')), '') is null then
    raise exception using errcode = '42501', message = 'credit_top_up_checkout_identity_mismatch';
  end if;

  if intent.stripe_checkout_session_id is not null
    and intent.stripe_checkout_session_id is distinct from trim(p_stripe_checkout_session_id) then
    raise exception using errcode = '23505', message = 'credit_top_up_checkout_already_bound';
  end if;

  if intent.status = 'created' then
    update public.credit_top_up_intents existing
    set stripe_checkout_session_id = trim(p_stripe_checkout_session_id),
        status = 'checkout_created',
        checkout_bound_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where existing.id = p_intent_id
    returning * into intent;
  end if;

  return next intent;
end;
$$;

create or replace function public.complete_credit_top_up_intent_v1(
  p_intent_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_customer_id text,
  p_stripe_payment_intent_id text,
  p_stripe_event_id text,
  p_amount_total integer,
  p_currency text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  organization_id uuid,
  user_id uuid,
  amount_cents integer,
  balance integer,
  ledger_id uuid,
  reused_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.credit_top_up_intents%rowtype;
  credit_balance integer;
  credit_ledger_id uuid;
  credit_reused boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'credit_top_up_service_role_required';
  end if;

  select * into strict intent
  from public.credit_top_up_intents existing
  where existing.id = p_intent_id
  for update;

  if intent.stripe_checkout_session_id is distinct from trim(coalesce(p_stripe_checkout_session_id, ''))
    or intent.stripe_customer_id is distinct from trim(coalesce(p_stripe_customer_id, ''))
    or intent.amount_cents is distinct from p_amount_total
    or intent.currency is distinct from lower(trim(coalesce(p_currency, '')))
    or (
      intent.stripe_payment_intent_id is not null
      and intent.stripe_payment_intent_id is distinct from nullif(trim(coalesce(p_stripe_payment_intent_id, '')), '')
    )
    or nullif(trim(coalesce(p_stripe_event_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'credit_top_up_authoritative_payment_mismatch';
  end if;

  if intent.status = 'created' then
    raise exception using errcode = '55000', message = 'credit_top_up_checkout_not_bound';
  end if;

  if intent.status = 'operator_action_required' then
    raise exception using errcode = '55000', message = 'credit_top_up_operator_action_required';
  end if;

  select grant_result.balance, grant_result.ledger_id, grant_result.reused_existing
  into credit_balance, credit_ledger_id, credit_reused
  from public.grant_user_credits(
    intent.user_id,
    intent.organization_id,
    intent.amount_cents,
    'stripe_credit_top_up',
    'stripe_checkout_session',
    intent.stripe_checkout_session_id,
    'stripe_credit_top_up:' || intent.id::text,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'creditTopUpIntentId', intent.id,
      'stripeEventId', trim(p_stripe_event_id),
      'stripePaymentIntentId', nullif(trim(coalesce(p_stripe_payment_intent_id, '')), '')
    )
  ) grant_result;

  if credit_ledger_id is null then
    raise exception using errcode = 'P0001', message = 'credit_top_up_ledger_missing';
  end if;

  if intent.status <> 'completed' then
    update public.credit_top_up_intents existing
    set status = 'completed',
        stripe_payment_intent_id = nullif(trim(coalesce(p_stripe_payment_intent_id, '')), ''),
        source_event_id = trim(p_stripe_event_id),
        completed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where existing.id = intent.id;
  elsif intent.source_event_id is distinct from trim(p_stripe_event_id) then
    -- A different Stripe event may replay the same completed Checkout Session;
    -- the credit ledger idempotency key remains the durable duplicate fence.
    credit_reused := true;
  end if;

  return query select
    intent.organization_id,
    intent.user_id,
    intent.amount_cents,
    credit_balance,
    credit_ledger_id,
    credit_reused;
end;
$$;

revoke all on function public.create_credit_top_up_intent_v1(uuid, uuid, uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.create_credit_top_up_intent_v1(uuid, uuid, uuid, integer, text, text)
  to service_role;
revoke all on function public.bind_credit_top_up_checkout_v1(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.bind_credit_top_up_checkout_v1(uuid, uuid, uuid, text)
  to service_role;
revoke all on function public.complete_credit_top_up_intent_v1(uuid, text, text, text, text, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_credit_top_up_intent_v1(uuid, text, text, text, text, integer, text, jsonb)
  to service_role;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260710235970')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
