-- Durable Stripe Checkout, refund and dispute projections. Webhook receipts
-- remain the event ledger; these tables are current, tenant-fenced projections.

alter table public.credit_top_up_intents drop constraint if exists credit_top_up_intents_status_check;
alter table public.credit_top_up_intents
  add constraint credit_top_up_intents_status_check check (
    status in (
      'created', 'checkout_created', 'completed', 'payment_failed', 'expired',
      'refunded', 'operator_action_required'
    )
  );

alter table public.billing_access_keys drop constraint if exists billing_access_keys_status_check;
alter table public.billing_access_keys
  add constraint billing_access_keys_status_check check (
    status in (
      'created', 'pending_payment', 'payment_failed', 'active', 'preclaimed',
      'claimed', 'revoked', 'expired'
    )
  );

alter table public.commercial_activations
  drop constraint if exists commercial_activations_source_event_type_valid;
alter table public.commercial_activations
  add constraint commercial_activations_source_event_type_valid check (
    source_event_type in (
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'invoice.payment_succeeded'
    )
  );

-- Preserve the existing atomic activation/credit contract while recognizing
-- the authoritative delayed-payment success event as a qualifying source.
create or replace function public.record_commercial_activation_with_initial_credit(
  p_organization_id uuid,
  p_user_id uuid,
  p_source_event_id text,
  p_source_event_type text,
  p_source_event_created bigint,
  p_source_payment_id text,
  p_source_subscription_id text,
  p_amount_paid_cents integer,
  p_currency text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  activation_id uuid,
  activation_created boolean,
  initial_credit_granted boolean,
  balance integer,
  ledger_id uuid,
  reused_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation_row public.commercial_activations%rowtype;
  credit_balance integer;
  credit_ledger_id uuid;
  credit_reused boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'commercial_activation_service_role_required';
  end if;
  if p_organization_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'commercial_activation_identity_required';
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
    raise exception using errcode = '42501', message = 'commercial_activation_actor_not_member';
  end if;
  if nullif(trim(coalesce(p_source_event_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'commercial_activation_event_required';
  end if;
  if p_source_event_type not in (
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'invoice.payment_succeeded'
  ) then
    raise exception using errcode = '22023', message = 'commercial_activation_event_not_qualifying';
  end if;
  if p_amount_paid_cents is null or p_amount_paid_cents <= 0 then
    raise exception using errcode = '22023', message = 'commercial_activation_amount_not_positive';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text, 0));
  select * into activation_row
  from public.commercial_activations existing
  where existing.organization_id = p_organization_id
  limit 1;

  if found then
    select ledger.balance_after, ledger.id
      into credit_balance, credit_ledger_id
    from public.user_credit_ledger ledger
    where ledger.reference_type = 'commercial_activation'
      and ledger.reference_id = activation_row.id::text
      and ledger.idempotency_key = 'commercial_activation_initial_credit:' || p_organization_id::text
    limit 1;
    if credit_ledger_id is null then
      raise exception using errcode = '55000', message = 'commercial_activation_credit_missing';
    end if;
    return query select activation_row.id, false, false, credit_balance, credit_ledger_id, true;
    return;
  end if;

  insert into public.commercial_activations (
    organization_id, user_id, source_event_id, source_event_type,
    source_event_created, source_payment_id, source_subscription_id,
    amount_paid_cents, currency, metadata
  ) values (
    p_organization_id, p_user_id, trim(p_source_event_id), p_source_event_type,
    greatest(coalesce(p_source_event_created, 0), 0),
    nullif(trim(coalesce(p_source_payment_id, '')), ''),
    nullif(trim(coalesce(p_source_subscription_id, '')), ''),
    p_amount_paid_cents, nullif(lower(trim(coalesce(p_currency, ''))), ''),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning * into activation_row;

  select result.balance, result.ledger_id, result.reused_existing
    into credit_balance, credit_ledger_id, credit_reused
  from public.grant_user_credits(
    p_user_id, p_organization_id, 1000,
    'commercial_activation_initial_credit', 'commercial_activation', activation_row.id::text,
    'commercial_activation_initial_credit:' || p_organization_id::text,
    pg_catalog.jsonb_build_object(
      'activationId', activation_row.id,
      'sourceEventId', activation_row.source_event_id,
      'sourceEventType', activation_row.source_event_type
    )
  ) result;
  if credit_ledger_id is null or credit_reused then
    raise exception using errcode = '55000', message = 'commercial_activation_credit_not_atomic';
  end if;
  return query select activation_row.id, true, true, credit_balance, credit_ledger_id, false;
end;
$$;

revoke all on function public.record_commercial_activation_with_initial_credit(
  uuid, uuid, text, text, bigint, text, text, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_commercial_activation_with_initial_credit(
  uuid, uuid, text, text, bigint, text, text, integer, text, jsonb
) to service_role;

create table if not exists public.stripe_checkout_payment_lifecycle (
  stripe_checkout_session_id text primary key,
  checkout_flow text not null check (checkout_flow in ('subscription', 'access_key', 'credit_top_up')),
  payment_state text not null check (payment_state in ('pending', 'succeeded', 'failed', 'expired')),
  organization_id uuid null references public.organizations(id) on delete restrict,
  user_id uuid null references auth.users(id) on delete restrict,
  access_key_id uuid null references public.billing_access_keys(id) on delete restrict,
  credit_top_up_intent_id uuid null references public.credit_top_up_intents(id) on delete restrict,
  stripe_customer_id text null,
  stripe_payment_intent_id text null,
  stripe_subscription_id text null,
  amount_total integer not null check (amount_total >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  latest_event_id text not null,
  latest_event_type text not null,
  latest_event_created bigint not null check (latest_event_created >= 0),
  success_event_id text null,
  success_event_created bigint null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint stripe_checkout_lifecycle_flow_identity_check check (
    (checkout_flow = 'subscription' and organization_id is not null and user_id is not null
      and access_key_id is null and credit_top_up_intent_id is null)
    or (checkout_flow = 'access_key' and organization_id is null and user_id is null
      and access_key_id is not null and credit_top_up_intent_id is null)
    or (checkout_flow = 'credit_top_up' and organization_id is not null and user_id is not null
      and access_key_id is null and credit_top_up_intent_id is not null)
  ),
  constraint stripe_checkout_lifecycle_success_check check (
    (payment_state = 'succeeded' and success_event_id is not null and success_event_created is not null and amount_total > 0)
    or (payment_state <> 'succeeded' and success_event_id is null and success_event_created is null)
  )
);

create index if not exists stripe_checkout_lifecycle_org_updated_idx
  on public.stripe_checkout_payment_lifecycle (organization_id, updated_at desc)
  where organization_id is not null;
create unique index if not exists stripe_checkout_lifecycle_success_event_unique
  on public.stripe_checkout_payment_lifecycle (success_event_id)
  where success_event_id is not null;

create table if not exists public.stripe_charge_financial_lifecycle (
  stripe_charge_id text primary key,
  stripe_payment_intent_id text null,
  stripe_customer_id text null,
  organization_id uuid null references public.organizations(id) on delete restrict,
  credit_top_up_intent_id uuid null references public.credit_top_up_intents(id) on delete restrict,
  commercial_activation_id uuid null references public.commercial_activations(id) on delete restrict,
  amount_cents integer not null check (amount_cents >= 0),
  amount_refunded_cents integer not null check (amount_refunded_cents between 0 and amount_cents),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  latest_event_id text not null,
  latest_event_created bigint not null check (latest_event_created >= 0),
  operator_action_required boolean not null default false,
  operator_reason text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stripe_refund_lifecycle (
  stripe_refund_id text primary key,
  stripe_charge_id text null,
  stripe_payment_intent_id text null,
  organization_id uuid null references public.organizations(id) on delete restrict,
  credit_top_up_intent_id uuid null references public.credit_top_up_intents(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  refund_status text not null check (refund_status in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')),
  failure_reason text null,
  latest_event_id text not null,
  latest_event_type text not null,
  latest_event_created bigint not null check (latest_event_created >= 0),
  operator_action_required boolean not null default false,
  operator_reason text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stripe_dispute_lifecycle (
  stripe_dispute_id text primary key,
  stripe_charge_id text not null,
  stripe_payment_intent_id text null,
  organization_id uuid null references public.organizations(id) on delete restrict,
  credit_top_up_intent_id uuid null references public.credit_top_up_intents(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  dispute_status text not null check (dispute_status in (
    'warning_needs_response', 'warning_under_review', 'warning_closed',
    'needs_response', 'under_review', 'won', 'lost', 'prevented'
  )),
  dispute_reason text not null,
  latest_event_id text not null,
  latest_event_type text not null,
  latest_event_created bigint not null check (latest_event_created >= 0),
  operator_action_required boolean not null default true,
  operator_reason text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.stripe_checkout_payment_lifecycle enable row level security;
alter table public.stripe_checkout_payment_lifecycle force row level security;
alter table public.stripe_charge_financial_lifecycle enable row level security;
alter table public.stripe_charge_financial_lifecycle force row level security;
alter table public.stripe_refund_lifecycle enable row level security;
alter table public.stripe_refund_lifecycle force row level security;
alter table public.stripe_dispute_lifecycle enable row level security;
alter table public.stripe_dispute_lifecycle force row level security;

revoke all on public.stripe_checkout_payment_lifecycle from public, anon, authenticated, service_role;
revoke all on public.stripe_charge_financial_lifecycle from public, anon, authenticated, service_role;
revoke all on public.stripe_refund_lifecycle from public, anon, authenticated, service_role;
revoke all on public.stripe_dispute_lifecycle from public, anon, authenticated, service_role;
grant select on public.stripe_checkout_payment_lifecycle to service_role;
grant select on public.stripe_charge_financial_lifecycle to service_role;
grant select on public.stripe_refund_lifecycle to service_role;
grant select on public.stripe_dispute_lifecycle to service_role;

create or replace function public.project_stripe_checkout_payment_lifecycle_v1(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_checkout_session_id text,
  p_checkout_flow text,
  p_payment_state text,
  p_organization_id uuid,
  p_user_id uuid,
  p_access_key_id uuid,
  p_credit_top_up_intent_id uuid,
  p_stripe_customer_id text,
  p_stripe_payment_intent_id text,
  p_stripe_subscription_id text,
  p_amount_total integer,
  p_currency text
)
returns table (
  applied boolean,
  current_payment_state text,
  organization_id uuid,
  user_id uuid,
  access_key_id uuid,
  credit_top_up_intent_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_record public.stripe_checkout_payment_lifecycle%rowtype;
  billing_record public.billing_subscriptions%rowtype;
  access_record public.billing_access_keys%rowtype;
  credit_record public.credit_top_up_intents%rowtype;
  resolved_organization_id uuid := p_organization_id;
  resolved_user_id uuid := p_user_id;
  should_apply boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'stripe_lifecycle_service_role_required';
  end if;
  if nullif(trim(coalesce(p_event_id, '')), '') is null
    or nullif(trim(coalesce(p_checkout_session_id, '')), '') is null
    or p_event_created is null or p_event_created < 0
    or p_event_type not in (
      'checkout.session.completed', 'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed', 'checkout.session.expired'
    )
    or p_checkout_flow not in ('subscription', 'access_key', 'credit_top_up')
    or p_payment_state not in ('pending', 'succeeded', 'failed', 'expired')
    or p_amount_total is null or p_amount_total < 0
    or lower(trim(coalesce(p_currency, ''))) !~ '^[a-z]{3}$' then
    raise exception using errcode = '22023', message = 'stripe_checkout_lifecycle_input_invalid';
  end if;
  if (p_event_type = 'checkout.session.async_payment_succeeded' and p_payment_state <> 'succeeded')
    or (p_event_type = 'checkout.session.async_payment_failed' and p_payment_state <> 'failed')
    or (p_event_type = 'checkout.session.expired' and p_payment_state <> 'expired')
    or (p_payment_state = 'succeeded' and p_amount_total <= 0) then
    raise exception using errcode = '22023', message = 'stripe_checkout_lifecycle_transition_invalid';
  end if;

  if p_checkout_flow = 'subscription' then
    if p_organization_id is null or p_user_id is null or p_access_key_id is not null or p_credit_top_up_intent_id is not null then
      raise exception using errcode = '22023', message = 'stripe_checkout_subscription_identity_invalid';
    end if;
    begin
      select * into strict billing_record from public.billing_subscriptions existing
      where existing.organization_id = p_organization_id for update;
    exception when no_data_found or too_many_rows then
      raise exception using errcode = '42501', message = 'stripe_checkout_subscription_tenant_mismatch';
    end;
    if billing_record.user_id is distinct from p_user_id
      or billing_record.stripe_checkout_session_id is distinct from trim(p_checkout_session_id)
      or (billing_record.stripe_customer_id is not null and billing_record.stripe_customer_id is distinct from nullif(trim(coalesce(p_stripe_customer_id, '')), '')) then
      raise exception using errcode = '42501', message = 'stripe_checkout_subscription_tenant_mismatch';
    end if;
  elsif p_checkout_flow = 'access_key' then
    if p_access_key_id is null or p_organization_id is not null or p_user_id is not null or p_credit_top_up_intent_id is not null then
      raise exception using errcode = '22023', message = 'stripe_checkout_access_key_identity_invalid';
    end if;
    begin
      select * into strict access_record from public.billing_access_keys existing
      where existing.id = p_access_key_id for update;
    exception when no_data_found or too_many_rows then
      raise exception using errcode = '42501', message = 'stripe_checkout_access_key_tenant_mismatch';
    end;
    if access_record.stripe_checkout_session_id is distinct from trim(p_checkout_session_id)
      or access_record.stripe_customer_id is distinct from nullif(trim(coalesce(p_stripe_customer_id, '')), '') then
      raise exception using errcode = '42501', message = 'stripe_checkout_access_key_tenant_mismatch';
    end if;
  else
    if p_credit_top_up_intent_id is null or p_access_key_id is not null or p_organization_id is not null or p_user_id is not null then
      raise exception using errcode = '22023', message = 'stripe_checkout_credit_identity_invalid';
    end if;
    begin
      select * into strict credit_record from public.credit_top_up_intents existing
      where existing.id = p_credit_top_up_intent_id for update;
    exception when no_data_found or too_many_rows then
      raise exception using errcode = '42501', message = 'stripe_checkout_credit_tenant_mismatch';
    end;
    if credit_record.stripe_checkout_session_id is distinct from trim(p_checkout_session_id)
      or credit_record.stripe_customer_id is distinct from nullif(trim(coalesce(p_stripe_customer_id, '')), '')
      or credit_record.amount_cents is distinct from p_amount_total
      or credit_record.currency is distinct from lower(trim(p_currency)) then
      raise exception using errcode = '42501', message = 'stripe_checkout_credit_tenant_mismatch';
    end if;
    resolved_organization_id := credit_record.organization_id;
    resolved_user_id := credit_record.user_id;
  end if;

  select * into current_record from public.stripe_checkout_payment_lifecycle existing
  where existing.stripe_checkout_session_id = trim(p_checkout_session_id) for update;
  if found then
    if current_record.checkout_flow is distinct from p_checkout_flow
      or current_record.organization_id is distinct from resolved_organization_id
      or current_record.user_id is distinct from resolved_user_id
      or current_record.access_key_id is distinct from p_access_key_id
      or current_record.credit_top_up_intent_id is distinct from p_credit_top_up_intent_id
      or current_record.stripe_customer_id is distinct from nullif(trim(coalesce(p_stripe_customer_id, '')), '')
      or current_record.amount_total is distinct from p_amount_total
      or current_record.currency is distinct from lower(trim(p_currency))
      or (current_record.stripe_payment_intent_id is not null and p_stripe_payment_intent_id is not null
        and current_record.stripe_payment_intent_id is distinct from trim(p_stripe_payment_intent_id))
      or (current_record.stripe_subscription_id is not null and p_stripe_subscription_id is not null
        and current_record.stripe_subscription_id is distinct from trim(p_stripe_subscription_id)) then
      raise exception using errcode = '23505', message = 'stripe_checkout_lifecycle_identity_collision';
    end if;
    should_apply := (p_payment_state = 'succeeded' and current_record.payment_state <> 'succeeded')
      or (current_record.payment_state <> 'succeeded' and (
        p_event_created > current_record.latest_event_created
        or (p_event_created = current_record.latest_event_created and trim(p_event_id) > current_record.latest_event_id)
      ));
  else
    should_apply := true;
    insert into public.stripe_checkout_payment_lifecycle (
      stripe_checkout_session_id, checkout_flow, payment_state, organization_id, user_id,
      access_key_id, credit_top_up_intent_id, stripe_customer_id, stripe_payment_intent_id,
      stripe_subscription_id, amount_total, currency, latest_event_id, latest_event_type,
      latest_event_created, success_event_id, success_event_created
    ) values (
      trim(p_checkout_session_id), p_checkout_flow, p_payment_state, resolved_organization_id, resolved_user_id,
      p_access_key_id, p_credit_top_up_intent_id, nullif(trim(coalesce(p_stripe_customer_id, '')), ''),
      nullif(trim(coalesce(p_stripe_payment_intent_id, '')), ''),
      nullif(trim(coalesce(p_stripe_subscription_id, '')), ''), p_amount_total, lower(trim(p_currency)),
      trim(p_event_id), p_event_type, p_event_created,
      case when p_payment_state = 'succeeded' then trim(p_event_id) else null end,
      case when p_payment_state = 'succeeded' then p_event_created else null end
    ) returning * into current_record;
  end if;

  if should_apply and current_record.stripe_checkout_session_id is not null then
    update public.stripe_checkout_payment_lifecycle existing set
      payment_state = p_payment_state,
      stripe_payment_intent_id = coalesce(existing.stripe_payment_intent_id, nullif(trim(coalesce(p_stripe_payment_intent_id, '')), '')),
      stripe_subscription_id = coalesce(existing.stripe_subscription_id, nullif(trim(coalesce(p_stripe_subscription_id, '')), '')),
      latest_event_id = trim(p_event_id), latest_event_type = p_event_type,
      latest_event_created = p_event_created,
      success_event_id = case when p_payment_state = 'succeeded' then trim(p_event_id) else null end,
      success_event_created = case when p_payment_state = 'succeeded' then p_event_created else null end,
      updated_at = timezone('utc', now())
    where existing.stripe_checkout_session_id = trim(p_checkout_session_id)
    returning * into current_record;
  end if;

  if should_apply then
    if p_checkout_flow = 'credit_top_up' and p_payment_state in ('failed', 'expired')
      and credit_record.status not in ('completed', 'operator_action_required', 'refunded') then
      update public.credit_top_up_intents existing
      set status = case when p_payment_state = 'failed' then 'payment_failed' else 'expired' end,
          updated_at = timezone('utc', now())
      where existing.id = credit_record.id;
    elsif p_checkout_flow = 'access_key' and p_payment_state in ('failed', 'expired')
      and access_record.status in ('created', 'pending_payment', 'payment_failed') then
      update public.billing_access_keys existing
      set status = case when p_payment_state = 'failed' then 'payment_failed' else 'expired' end,
          updated_at = timezone('utc', now())
      where existing.id = access_record.id;
    elsif p_checkout_flow = 'subscription' and p_payment_state in ('failed', 'expired')
      and billing_record.status in ('inactive', 'checkout_started', 'checkout_failed', 'checkout_expired') then
      update public.billing_subscriptions existing
      set status = case when p_payment_state = 'failed' then 'checkout_failed' else 'checkout_expired' end,
          updated_at = timezone('utc', now())
      where existing.organization_id = billing_record.organization_id
        and existing.stripe_checkout_session_id = trim(p_checkout_session_id);
    end if;
  end if;

  return query select should_apply, current_record.payment_state, resolved_organization_id,
    resolved_user_id, p_access_key_id, p_credit_top_up_intent_id;
end;
$$;

create or replace function private.resolve_stripe_financial_identity_v1(
  p_stripe_payment_intent_id text,
  p_stripe_customer_id text,
  p_stripe_charge_id text,
  p_organization_id_hint uuid,
  p_credit_top_up_intent_id_hint uuid
)
returns table (
  organization_id uuid,
  credit_top_up_intent_id uuid,
  commercial_activation_id uuid,
  user_id uuid,
  resolution_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  credit_record public.credit_top_up_intents%rowtype;
  activation_record public.commercial_activations%rowtype;
  billing_record public.billing_subscriptions%rowtype;
  charge_record public.stripe_charge_financial_lifecycle%rowtype;
  resolved_organization uuid;
  resolved_user uuid;
  resolved_credit_top_up_intent_id uuid;
  resolved_commercial_activation_id uuid;
begin
  if p_credit_top_up_intent_id_hint is not null then
    begin
      select * into strict credit_record from public.credit_top_up_intents existing
      where existing.id = p_credit_top_up_intent_id_hint;
    exception when no_data_found or too_many_rows then
      raise exception using errcode = '42501', message = 'stripe_financial_credit_hint_mismatch';
    end;
    if credit_record.stripe_payment_intent_id is not null
      and credit_record.stripe_payment_intent_id is distinct from nullif(trim(coalesce(p_stripe_payment_intent_id, '')), '') then
      raise exception using errcode = '42501', message = 'stripe_financial_credit_hint_mismatch';
    end if;
  elsif nullif(trim(coalesce(p_stripe_payment_intent_id, '')), '') is not null then
    if (select count(*) from public.credit_top_up_intents existing
      where existing.stripe_payment_intent_id = trim(p_stripe_payment_intent_id)) > 1 then
      raise exception using errcode = '42501', message = 'stripe_financial_tenant_ambiguity';
    end if;
    select * into credit_record from public.credit_top_up_intents existing
    where existing.stripe_payment_intent_id = trim(p_stripe_payment_intent_id) limit 1;
  end if;

  if nullif(trim(coalesce(p_stripe_payment_intent_id, '')), '') is not null then
    if (select count(*) from public.commercial_activations existing
      where existing.source_payment_id = trim(p_stripe_payment_intent_id)) > 1 then
      raise exception using errcode = '42501', message = 'stripe_financial_tenant_ambiguity';
    end if;
    select * into activation_record from public.commercial_activations existing
    where existing.source_payment_id = trim(p_stripe_payment_intent_id) limit 1;
  end if;
  if nullif(trim(coalesce(p_stripe_customer_id, '')), '') is not null then
    if (select count(*) from public.billing_subscriptions existing
      where existing.stripe_customer_id = trim(p_stripe_customer_id)) > 1 then
      raise exception using errcode = '42501', message = 'stripe_financial_tenant_ambiguity';
    end if;
    select * into billing_record from public.billing_subscriptions existing
    where existing.stripe_customer_id = trim(p_stripe_customer_id) limit 1;
  end if;
  if nullif(trim(coalesce(p_stripe_charge_id, '')), '') is not null then
    select * into charge_record from public.stripe_charge_financial_lifecycle existing
    where existing.stripe_charge_id = trim(p_stripe_charge_id);
  end if;

  if credit_record.id is not null
    and charge_record.credit_top_up_intent_id is not null
    and credit_record.id is distinct from charge_record.credit_top_up_intent_id then
    raise exception using errcode = '23505', message = 'stripe_financial_credit_identity_collision';
  end if;
  if activation_record.id is not null
    and charge_record.commercial_activation_id is not null
    and activation_record.id is distinct from charge_record.commercial_activation_id then
    raise exception using errcode = '23505', message = 'stripe_financial_activation_identity_collision';
  end if;
  resolved_credit_top_up_intent_id := coalesce(
    credit_record.id,
    charge_record.credit_top_up_intent_id
  );
  resolved_commercial_activation_id := coalesce(
    activation_record.id,
    charge_record.commercial_activation_id
  );
  if resolved_credit_top_up_intent_id is not null
    and resolved_commercial_activation_id is not null then
    raise exception using errcode = '23505', message = 'stripe_financial_transaction_kind_ambiguity';
  end if;

  resolved_organization := coalesce(
    credit_record.organization_id, activation_record.organization_id,
    billing_record.organization_id, charge_record.organization_id
  );
  if (credit_record.organization_id is not null and credit_record.organization_id is distinct from resolved_organization)
    or (activation_record.organization_id is not null and activation_record.organization_id is distinct from resolved_organization)
    or (billing_record.organization_id is not null and billing_record.organization_id is distinct from resolved_organization)
    or (charge_record.organization_id is not null and charge_record.organization_id is distinct from resolved_organization)
    or (p_organization_id_hint is not null and resolved_organization is not null and p_organization_id_hint is distinct from resolved_organization) then
    raise exception using errcode = '42501', message = 'stripe_financial_tenant_ambiguity';
  end if;
  resolved_user := coalesce(credit_record.user_id, activation_record.user_id, billing_record.user_id);
  return query select resolved_organization, resolved_credit_top_up_intent_id,
    resolved_commercial_activation_id, resolved_user,
    case when resolved_organization is null then 'unmapped' else 'resolved' end;
end;
$$;

revoke all on function private.resolve_stripe_financial_identity_v1(text, text, text, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.project_stripe_charge_refund_lifecycle_v1(
  p_event_id text, p_event_created bigint, p_stripe_charge_id text,
  p_stripe_payment_intent_id text, p_stripe_customer_id text,
  p_organization_id_hint uuid, p_credit_top_up_intent_id_hint uuid,
  p_amount_cents integer, p_amount_refunded_cents integer, p_currency text
)
returns table (applied boolean, organization_id uuid, credit_top_up_intent_id uuid, operator_action_required boolean)
language plpgsql security definer set search_path = '' as $$
declare
  identity_record record;
  current_record public.stripe_charge_financial_lifecycle%rowtype;
  should_apply boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'stripe_lifecycle_service_role_required';
  end if;
  if nullif(trim(coalesce(p_event_id, '')), '') is null or p_event_created < 0
    or nullif(trim(coalesce(p_stripe_charge_id, '')), '') is null
    or p_amount_cents < 0 or p_amount_refunded_cents < 0 or p_amount_refunded_cents > p_amount_cents
    or lower(trim(coalesce(p_currency, ''))) !~ '^[a-z]{3}$' then
    raise exception using errcode = '22023', message = 'stripe_charge_refund_input_invalid';
  end if;
  select * into strict identity_record from private.resolve_stripe_financial_identity_v1(
    p_stripe_payment_intent_id, p_stripe_customer_id, p_stripe_charge_id,
    p_organization_id_hint, p_credit_top_up_intent_id_hint
  );
  select * into current_record from public.stripe_charge_financial_lifecycle existing
  where existing.stripe_charge_id = trim(p_stripe_charge_id) for update;
  if found then
    if current_record.stripe_payment_intent_id is not null and p_stripe_payment_intent_id is not null
      and current_record.stripe_payment_intent_id is distinct from trim(p_stripe_payment_intent_id)
      or current_record.organization_id is not null and identity_record.organization_id is not null
        and current_record.organization_id is distinct from identity_record.organization_id
      or current_record.amount_cents is distinct from p_amount_cents
      or current_record.currency is distinct from lower(trim(p_currency)) then
      raise exception using errcode = '23505', message = 'stripe_charge_refund_identity_collision';
    end if;
    should_apply := p_event_created > current_record.latest_event_created
      or (p_event_created = current_record.latest_event_created and trim(p_event_id) > current_record.latest_event_id);
    if should_apply and p_amount_refunded_cents < current_record.amount_refunded_cents then
      raise exception using errcode = '22023', message = 'stripe_charge_refund_regression';
    end if;
  else
    should_apply := true;
    insert into public.stripe_charge_financial_lifecycle (
      stripe_charge_id, stripe_payment_intent_id, stripe_customer_id, organization_id,
      credit_top_up_intent_id, commercial_activation_id, amount_cents, amount_refunded_cents,
      currency, latest_event_id, latest_event_created, operator_action_required, operator_reason
    ) values (
      trim(p_stripe_charge_id), nullif(trim(coalesce(p_stripe_payment_intent_id, '')), ''),
      nullif(trim(coalesce(p_stripe_customer_id, '')), ''), identity_record.organization_id,
      identity_record.credit_top_up_intent_id, identity_record.commercial_activation_id,
      p_amount_cents, p_amount_refunded_cents, lower(trim(p_currency)), trim(p_event_id), p_event_created,
      p_amount_refunded_cents > 0, case when p_amount_refunded_cents > 0 then 'refund_policy_reconciliation_required' else null end
    ) returning * into current_record;
  end if;
  if should_apply and current_record.stripe_charge_id is not null then
    update public.stripe_charge_financial_lifecycle existing set
      stripe_payment_intent_id = coalesce(existing.stripe_payment_intent_id, nullif(trim(coalesce(p_stripe_payment_intent_id, '')), '')),
      stripe_customer_id = coalesce(existing.stripe_customer_id, nullif(trim(coalesce(p_stripe_customer_id, '')), '')),
      organization_id = coalesce(existing.organization_id, identity_record.organization_id),
      credit_top_up_intent_id = coalesce(existing.credit_top_up_intent_id, identity_record.credit_top_up_intent_id),
      commercial_activation_id = coalesce(existing.commercial_activation_id, identity_record.commercial_activation_id),
      amount_refunded_cents = p_amount_refunded_cents, latest_event_id = trim(p_event_id),
      latest_event_created = p_event_created, operator_action_required = p_amount_refunded_cents > 0,
      operator_reason = case when p_amount_refunded_cents > 0 then 'refund_policy_reconciliation_required' else null end,
      updated_at = timezone('utc', now())
    where existing.stripe_charge_id = trim(p_stripe_charge_id) returning * into current_record;
  end if;
  if should_apply and p_amount_refunded_cents > 0 and identity_record.credit_top_up_intent_id is not null then
    update public.credit_top_up_intents existing set status = 'operator_action_required', updated_at = timezone('utc', now())
    where existing.id = identity_record.credit_top_up_intent_id and existing.status = 'completed';
  end if;
  return query select should_apply, identity_record.organization_id,
    identity_record.credit_top_up_intent_id, current_record.operator_action_required;
end; $$;

create or replace function public.project_stripe_refund_lifecycle_v1(
  p_event_id text, p_event_type text, p_event_created bigint, p_stripe_refund_id text,
  p_stripe_charge_id text, p_stripe_payment_intent_id text,
  p_organization_id_hint uuid, p_credit_top_up_intent_id_hint uuid,
  p_amount_cents integer, p_currency text, p_refund_status text, p_failure_reason text
)
returns table (applied boolean, organization_id uuid, credit_top_up_intent_id uuid, operator_action_required boolean)
language plpgsql security definer set search_path = '' as $$
declare
  identity_record record;
  current_record public.stripe_refund_lifecycle%rowtype;
  should_apply boolean := false;
  action_required boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'stripe_lifecycle_service_role_required';
  end if;
  if p_event_type not in ('refund.created', 'refund.updated', 'refund.failed')
    or nullif(trim(coalesce(p_event_id, '')), '') is null or p_event_created < 0
    or nullif(trim(coalesce(p_stripe_refund_id, '')), '') is null or p_amount_cents <= 0
    or lower(trim(coalesce(p_currency, ''))) !~ '^[a-z]{3}$'
    or p_refund_status not in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled') then
    raise exception using errcode = '22023', message = 'stripe_refund_lifecycle_input_invalid';
  end if;
  select * into strict identity_record from private.resolve_stripe_financial_identity_v1(
    p_stripe_payment_intent_id, null, p_stripe_charge_id,
    p_organization_id_hint, p_credit_top_up_intent_id_hint
  );
  action_required := p_refund_status in ('pending', 'requires_action', 'succeeded')
    or identity_record.resolution_status = 'unmapped';
  select * into current_record from public.stripe_refund_lifecycle existing
  where existing.stripe_refund_id = trim(p_stripe_refund_id) for update;
  if found then
    if current_record.stripe_charge_id is not null and p_stripe_charge_id is not null
      and current_record.stripe_charge_id is distinct from trim(p_stripe_charge_id)
      or current_record.stripe_payment_intent_id is not null and p_stripe_payment_intent_id is not null
        and current_record.stripe_payment_intent_id is distinct from trim(p_stripe_payment_intent_id)
      or current_record.organization_id is not null and identity_record.organization_id is not null
        and current_record.organization_id is distinct from identity_record.organization_id
      or current_record.amount_cents is distinct from p_amount_cents
      or current_record.currency is distinct from lower(trim(p_currency)) then
      raise exception using errcode = '23505', message = 'stripe_refund_lifecycle_identity_collision';
    end if;
    should_apply := p_event_created > current_record.latest_event_created
      or (p_event_created = current_record.latest_event_created and trim(p_event_id) > current_record.latest_event_id);
  else
    should_apply := true;
    insert into public.stripe_refund_lifecycle (
      stripe_refund_id, stripe_charge_id, stripe_payment_intent_id, organization_id,
      credit_top_up_intent_id, amount_cents, currency, refund_status, failure_reason,
      latest_event_id, latest_event_type, latest_event_created, operator_action_required, operator_reason
    ) values (
      trim(p_stripe_refund_id), nullif(trim(coalesce(p_stripe_charge_id, '')), ''),
      nullif(trim(coalesce(p_stripe_payment_intent_id, '')), ''), identity_record.organization_id,
      identity_record.credit_top_up_intent_id, p_amount_cents, lower(trim(p_currency)), p_refund_status,
      nullif(left(coalesce(p_failure_reason, ''), 160), ''), trim(p_event_id), p_event_type, p_event_created,
      action_required, case when identity_record.resolution_status = 'unmapped' then 'refund_tenant_unmapped'
        when action_required then 'refund_policy_reconciliation_required' else null end
    ) returning * into current_record;
  end if;
  if should_apply and current_record.stripe_refund_id is not null then
    update public.stripe_refund_lifecycle existing set
      stripe_charge_id = coalesce(existing.stripe_charge_id, nullif(trim(coalesce(p_stripe_charge_id, '')), '')),
      stripe_payment_intent_id = coalesce(existing.stripe_payment_intent_id, nullif(trim(coalesce(p_stripe_payment_intent_id, '')), '')),
      organization_id = coalesce(existing.organization_id, identity_record.organization_id),
      credit_top_up_intent_id = coalesce(existing.credit_top_up_intent_id, identity_record.credit_top_up_intent_id),
      refund_status = p_refund_status, failure_reason = nullif(left(coalesce(p_failure_reason, ''), 160), ''),
      latest_event_id = trim(p_event_id), latest_event_type = p_event_type, latest_event_created = p_event_created,
      operator_action_required = action_required,
      operator_reason = case when identity_record.resolution_status = 'unmapped' then 'refund_tenant_unmapped'
        when action_required then 'refund_policy_reconciliation_required' else null end,
      updated_at = timezone('utc', now())
    where existing.stripe_refund_id = trim(p_stripe_refund_id) returning * into current_record;
  end if;
  if should_apply and p_refund_status = 'succeeded' and identity_record.credit_top_up_intent_id is not null then
    update public.credit_top_up_intents existing set status = 'operator_action_required', updated_at = timezone('utc', now())
    where existing.id = identity_record.credit_top_up_intent_id and existing.status = 'completed';
  end if;
  return query select should_apply, identity_record.organization_id,
    identity_record.credit_top_up_intent_id, current_record.operator_action_required;
end; $$;

create or replace function public.project_stripe_dispute_lifecycle_v1(
  p_event_id text, p_event_type text, p_event_created bigint, p_stripe_dispute_id text,
  p_stripe_charge_id text, p_stripe_payment_intent_id text,
  p_organization_id_hint uuid, p_credit_top_up_intent_id_hint uuid,
  p_amount_cents integer, p_currency text, p_dispute_status text, p_dispute_reason text
)
returns table (applied boolean, organization_id uuid, credit_top_up_intent_id uuid, operator_action_required boolean)
language plpgsql security definer set search_path = '' as $$
declare
  identity_record record;
  current_record public.stripe_dispute_lifecycle%rowtype;
  should_apply boolean := false;
  action_required boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'stripe_lifecycle_service_role_required';
  end if;
  if p_event_type not in ('charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed')
    or nullif(trim(coalesce(p_event_id, '')), '') is null or p_event_created < 0
    or nullif(trim(coalesce(p_stripe_dispute_id, '')), '') is null
    or nullif(trim(coalesce(p_stripe_charge_id, '')), '') is null or p_amount_cents <= 0
    or lower(trim(coalesce(p_currency, ''))) !~ '^[a-z]{3}$'
    or p_dispute_status not in (
      'warning_needs_response', 'warning_under_review', 'warning_closed',
      'needs_response', 'under_review', 'won', 'lost', 'prevented'
    ) then
    raise exception using errcode = '22023', message = 'stripe_dispute_lifecycle_input_invalid';
  end if;
  select * into strict identity_record from private.resolve_stripe_financial_identity_v1(
    p_stripe_payment_intent_id, null, p_stripe_charge_id,
    p_organization_id_hint, p_credit_top_up_intent_id_hint
  );
  action_required := p_dispute_status not in ('won', 'warning_closed', 'prevented')
    or identity_record.resolution_status = 'unmapped';
  select * into current_record from public.stripe_dispute_lifecycle existing
  where existing.stripe_dispute_id = trim(p_stripe_dispute_id) for update;
  if found then
    if current_record.stripe_charge_id is distinct from trim(p_stripe_charge_id)
      or current_record.stripe_payment_intent_id is not null and p_stripe_payment_intent_id is not null
        and current_record.stripe_payment_intent_id is distinct from trim(p_stripe_payment_intent_id)
      or current_record.organization_id is not null and identity_record.organization_id is not null
        and current_record.organization_id is distinct from identity_record.organization_id
      or current_record.amount_cents is distinct from p_amount_cents
      or current_record.currency is distinct from lower(trim(p_currency)) then
      raise exception using errcode = '23505', message = 'stripe_dispute_lifecycle_identity_collision';
    end if;
    should_apply := p_event_created > current_record.latest_event_created
      or (p_event_created = current_record.latest_event_created and trim(p_event_id) > current_record.latest_event_id);
  else
    should_apply := true;
    insert into public.stripe_dispute_lifecycle (
      stripe_dispute_id, stripe_charge_id, stripe_payment_intent_id, organization_id,
      credit_top_up_intent_id, amount_cents, currency, dispute_status, dispute_reason,
      latest_event_id, latest_event_type, latest_event_created, operator_action_required, operator_reason
    ) values (
      trim(p_stripe_dispute_id), trim(p_stripe_charge_id),
      nullif(trim(coalesce(p_stripe_payment_intent_id, '')), ''), identity_record.organization_id,
      identity_record.credit_top_up_intent_id, p_amount_cents, lower(trim(p_currency)), p_dispute_status,
      left(coalesce(nullif(trim(p_dispute_reason), ''), 'unknown'), 160), trim(p_event_id), p_event_type,
      p_event_created, action_required, case when identity_record.resolution_status = 'unmapped' then 'dispute_tenant_unmapped'
        when action_required then 'dispute_policy_reconciliation_required' else null end
    ) returning * into current_record;
  end if;
  if should_apply and current_record.stripe_dispute_id is not null then
    update public.stripe_dispute_lifecycle existing set
      stripe_payment_intent_id = coalesce(existing.stripe_payment_intent_id, nullif(trim(coalesce(p_stripe_payment_intent_id, '')), '')),
      organization_id = coalesce(existing.organization_id, identity_record.organization_id),
      credit_top_up_intent_id = coalesce(existing.credit_top_up_intent_id, identity_record.credit_top_up_intent_id),
      dispute_status = p_dispute_status, dispute_reason = left(coalesce(nullif(trim(p_dispute_reason), ''), 'unknown'), 160),
      latest_event_id = trim(p_event_id), latest_event_type = p_event_type, latest_event_created = p_event_created,
      operator_action_required = action_required,
      operator_reason = case when identity_record.resolution_status = 'unmapped' then 'dispute_tenant_unmapped'
        when action_required then 'dispute_policy_reconciliation_required' else null end,
      updated_at = timezone('utc', now())
    where existing.stripe_dispute_id = trim(p_stripe_dispute_id) returning * into current_record;
  end if;
  if should_apply and action_required and identity_record.credit_top_up_intent_id is not null then
    update public.credit_top_up_intents existing set status = 'operator_action_required', updated_at = timezone('utc', now())
    where existing.id = identity_record.credit_top_up_intent_id and existing.status = 'completed';
  end if;
  return query select should_apply, identity_record.organization_id,
    identity_record.credit_top_up_intent_id, current_record.operator_action_required;
end; $$;

revoke all on function public.project_stripe_checkout_payment_lifecycle_v1(
  text, text, bigint, text, text, text, uuid, uuid, uuid, uuid, text, text, text, integer, text
) from public, anon, authenticated;
grant execute on function public.project_stripe_checkout_payment_lifecycle_v1(
  text, text, bigint, text, text, text, uuid, uuid, uuid, uuid, text, text, text, integer, text
) to service_role;
revoke all on function public.project_stripe_charge_refund_lifecycle_v1(
  text, bigint, text, text, text, uuid, uuid, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.project_stripe_charge_refund_lifecycle_v1(
  text, bigint, text, text, text, uuid, uuid, integer, integer, text
) to service_role;
revoke all on function public.project_stripe_refund_lifecycle_v1(
  text, text, bigint, text, text, text, uuid, uuid, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.project_stripe_refund_lifecycle_v1(
  text, text, bigint, text, text, text, uuid, uuid, integer, text, text, text
) to service_role;
revoke all on function public.project_stripe_dispute_lifecycle_v1(
  text, text, bigint, text, text, text, uuid, uuid, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.project_stripe_dispute_lifecycle_v1(
  text, text, bigint, text, text, text, uuid, uuid, integer, text, text, text
) to service_role;

-- These projections are financial evidence, not operational customer data.
-- They follow the configured financial retention class only after the separate
-- owner/legal authority gate is approved; they are never silently cascaded.
insert into public.account_deletion_data_inventory (
  resource_kind, relation_schema, relation_name, scope_column, disposition,
  retention_class, executor_task, pii_columns
) values
  ('table', 'public', 'stripe_checkout_payment_lifecycle', 'organization_id',
    'legal_retain', 'financial', 'purge_expired_financial_records',
    array['stripe_customer_id']::text[]),
  ('table', 'public', 'stripe_charge_financial_lifecycle', 'organization_id',
    'legal_retain', 'financial', 'purge_expired_financial_records',
    array['stripe_customer_id']::text[]),
  ('table', 'public', 'stripe_refund_lifecycle', 'organization_id',
    'legal_retain', 'financial', 'purge_expired_financial_records', '{}'::text[]),
  ('table', 'public', 'stripe_dispute_lifecycle', 'organization_id',
    'legal_retain', 'financial', 'purge_expired_financial_records', '{}'::text[])
on conflict (resource_kind, relation_schema, relation_name) do update set
  scope_column = excluded.scope_column,
  disposition = excluded.disposition,
  retention_class = excluded.retention_class,
  executor_task = excluded.executor_task,
  pii_columns = excluded.pii_columns,
  classified_at = timezone('utc', now());

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260716200000')
on conflict (key) do update
set value = excluded.value, updated_at = timezone('utc', now());
