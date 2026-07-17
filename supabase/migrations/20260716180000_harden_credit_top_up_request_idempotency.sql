-- A browser-created request UUID is a semantic purchase-attempt identity. The
-- server still owns the durable intent UUID; this tuple only makes retries and
-- concurrent submissions converge on that one server-owned intent.
alter table public.credit_top_up_intents
  add column if not exists client_request_id uuid null;

create unique index if not exists credit_top_up_intents_actor_request_unique
  on public.credit_top_up_intents (organization_id, user_id, client_request_id)
  where client_request_id is not null;

comment on column public.credit_top_up_intents.client_request_id is
  'Client-generated UUID for one top-up attempt; unique per organization and user.';

create or replace function public.create_credit_top_up_intent_v2(
  p_intent_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_client_request_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_stripe_customer_id text
)
returns table (
  intent_id uuid,
  organization_id uuid,
  user_id uuid,
  client_request_id uuid,
  amount_cents integer,
  currency text,
  stripe_customer_id text,
  stripe_checkout_session_id text,
  status text,
  reused_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  intent public.credit_top_up_intents%rowtype;
  inserted_count integer := 0;
  normalized_currency text := lower(trim(coalesce(p_currency, '')));
  normalized_customer_id text := trim(coalesce(p_stripe_customer_id, ''));
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'credit_top_up_service_role_required';
  end if;

  if p_intent_id is null
    or p_organization_id is null
    or p_user_id is null
    or p_client_request_id is null
    or p_amount_cents is null
    or p_amount_cents < 2500
    or p_amount_cents > 100000
    or normalized_currency <> 'usd'
    or normalized_customer_id = '' then
    raise exception using errcode = '22023', message = 'credit_top_up_intent_invalid';
  end if;

  if not exists (
    select 1
    from public.organizations organization_record
    where organization_record.id = p_organization_id
      and organization_record.owner_user_id = p_user_id
  ) and not exists (
    select 1
    from public.organization_memberships membership_record
    where membership_record.organization_id = p_organization_id
      and membership_record.user_id = p_user_id
  ) then
    raise exception using errcode = '42501', message = 'credit_top_up_actor_not_member';
  end if;

  insert into public.credit_top_up_intents (
    id,
    organization_id,
    user_id,
    client_request_id,
    amount_cents,
    currency,
    stripe_customer_id
  ) values (
    p_intent_id,
    p_organization_id,
    p_user_id,
    p_client_request_id,
    p_amount_cents,
    normalized_currency,
    normalized_customer_id
  )
  on conflict (organization_id, user_id, client_request_id)
    where client_request_id is not null
  do nothing;

  get diagnostics inserted_count = row_count;

  select existing.* into strict intent
  from public.credit_top_up_intents existing
  where existing.organization_id = p_organization_id
    and existing.user_id = p_user_id
    and existing.client_request_id = p_client_request_id
  for update;

  if intent.amount_cents is distinct from p_amount_cents
    or intent.currency is distinct from normalized_currency
    or intent.stripe_customer_id is distinct from normalized_customer_id then
    raise exception using errcode = '23505', message = 'credit_top_up_request_identity_collision';
  end if;

  return query select
    intent.id,
    intent.organization_id,
    intent.user_id,
    intent.client_request_id,
    intent.amount_cents,
    intent.currency,
    intent.stripe_customer_id,
    intent.stripe_checkout_session_id,
    intent.status,
    inserted_count = 0;
end;
$$;

revoke all on function public.create_credit_top_up_intent_v2(
  uuid, uuid, uuid, uuid, integer, text, text
) from public, anon, authenticated;
grant execute on function public.create_credit_top_up_intent_v2(
  uuid, uuid, uuid, uuid, integer, text, text
) to service_role;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260716180000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
