-- Paid creative generation crosses a database/provider transaction boundary.
-- Persist a dispatch intent before the provider POST, persist the accepted
-- provider output before projecting it into product tables, and never infer
-- that an ambiguous dispatch is safe to repeat.

create table if not exists public.paid_creative_dispatches (
  id uuid primary key default gen_random_uuid(),
  provider_usage_event_id uuid not null
    references public.provider_usage_events(id) on delete restrict,
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  campaign_id uuid null
    references public.campaign_plans(id) on delete restrict,
  provider text not null,
  operation text not null,
  attempt_key text not null,
  request_fingerprint text not null,
  request_payload jsonb not null default '{}'::jsonb,
  state text not null default 'dispatching',
  dispatch_token uuid not null,
  dispatch_generation bigint not null default 1,
  provider_request_id text null,
  provider_output jsonb null,
  projection_receipt jsonb null,
  last_error_code text null,
  dispatched_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz null,
  projected_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint paid_creative_dispatches_state_check
    check (state in ('dispatching', 'accepted', 'rejected', 'uncertain', 'projected')),
  constraint paid_creative_dispatches_attempt_key_nonblank
    check (length(trim(attempt_key)) between 8 and 512),
  constraint paid_creative_dispatches_request_fingerprint_nonblank
    check (length(trim(request_fingerprint)) between 16 and 256),
  constraint paid_creative_dispatches_request_payload_object
    check (jsonb_typeof(request_payload) = 'object'),
  constraint paid_creative_dispatches_provider_output_object
    check (provider_output is null or jsonb_typeof(provider_output) = 'object'),
  constraint paid_creative_dispatches_projection_receipt_object
    check (projection_receipt is null or jsonb_typeof(projection_receipt) = 'object'),
  constraint paid_creative_dispatches_usage_event_unique
    unique (provider_usage_event_id),
  constraint paid_creative_dispatches_scoped_attempt_unique
    unique (organization_id, user_id, attempt_key)
);

create index if not exists paid_creative_dispatches_recovery_idx
  on public.paid_creative_dispatches (state, updated_at, organization_id);
create index if not exists paid_creative_dispatches_campaign_idx
  on public.paid_creative_dispatches (organization_id, campaign_id, created_at desc)
  where campaign_id is not null;

alter table public.paid_creative_dispatches enable row level security;
alter table public.paid_creative_dispatches force row level security;

revoke all on public.paid_creative_dispatches
  from public, anon, authenticated, service_role;
grant select on public.paid_creative_dispatches to service_role;

alter table public.creative_assets
  add column if not exists paid_creative_dispatch_id uuid null
    references public.paid_creative_dispatches(id) on delete restrict;

create unique index if not exists creative_assets_paid_dispatch_role_unique
  on public.creative_assets (paid_creative_dispatch_id, asset_type)
  where paid_creative_dispatch_id is not null;

create or replace function public.begin_paid_creative_dispatch_v1(
  p_provider_usage_event_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_provider text,
  p_operation text,
  p_attempt_key text,
  p_request_fingerprint text,
  p_request_payload jsonb default '{}'::jsonb
)
returns table (
  dispatch_id uuid,
  decision text,
  dispatch_state text,
  dispatch_token uuid,
  dispatch_generation bigint,
  provider_request_id text,
  provider_output jsonb,
  projection_receipt jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_record public.provider_usage_events%rowtype;
  dispatch_record public.paid_creative_dispatches%rowtype;
  normalized_provider text := nullif(trim(coalesce(p_provider, '')), '');
  normalized_operation text := nullif(trim(coalesce(p_operation, '')), '');
  normalized_attempt_key text := nullif(trim(coalesce(p_attempt_key, '')), '');
  normalized_fingerprint text := nullif(trim(coalesce(p_request_fingerprint, '')), '');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'paid_creative_dispatch_service_role_required';
  end if;

  if p_provider_usage_event_id is null or p_organization_id is null or p_user_id is null
    or normalized_provider is null or normalized_operation is null
    or normalized_attempt_key is null or length(normalized_attempt_key) < 8
    or normalized_fingerprint is null or length(normalized_fingerprint) < 16
    or p_request_payload is null or jsonb_typeof(p_request_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'paid_creative_dispatch_identity_invalid';
  end if;

  -- Serialize the first-intent decision independently of worker leases.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider_usage_event_id::text, 17000)
  );

  select * into usage_record
  from public.provider_usage_events event_record
  where event_record.id = p_provider_usage_event_id
    and event_record.organization_id = p_organization_id
    and event_record.user_id = p_user_id
  for update;

  if usage_record.id is null
    or usage_record.campaign_id is distinct from p_campaign_id
    or usage_record.provider is distinct from normalized_provider
    or usage_record.operation is distinct from normalized_operation
    or usage_record.attempt_key is distinct from normalized_attempt_key then
    raise exception using errcode = '42501', message = 'paid_creative_dispatch_usage_scope_mismatch';
  end if;

  select * into dispatch_record
  from public.paid_creative_dispatches existing_dispatch
  where existing_dispatch.provider_usage_event_id = p_provider_usage_event_id
  for update;

  if dispatch_record.id is null then
    if usage_record.status <> 'reserved' then
      raise exception using errcode = '55000', message = 'paid_creative_dispatch_missing_for_terminal_usage';
    end if;

    insert into public.paid_creative_dispatches (
      provider_usage_event_id,
      organization_id,
      user_id,
      campaign_id,
      provider,
      operation,
      attempt_key,
      request_fingerprint,
      request_payload,
      state,
      dispatch_token,
      dispatch_generation
    ) values (
      p_provider_usage_event_id,
      p_organization_id,
      p_user_id,
      p_campaign_id,
      normalized_provider,
      normalized_operation,
      normalized_attempt_key,
      normalized_fingerprint,
      p_request_payload,
      'dispatching',
      gen_random_uuid(),
      1
    ) returning * into dispatch_record;

    return query select
      dispatch_record.id,
      'dispatch'::text,
      dispatch_record.state,
      dispatch_record.dispatch_token,
      dispatch_record.dispatch_generation,
      dispatch_record.provider_request_id,
      dispatch_record.provider_output,
      dispatch_record.projection_receipt;
    return;
  end if;

  if dispatch_record.organization_id is distinct from p_organization_id
    or dispatch_record.user_id is distinct from p_user_id
    or dispatch_record.campaign_id is distinct from p_campaign_id
    or dispatch_record.provider is distinct from normalized_provider
    or dispatch_record.operation is distinct from normalized_operation
    or dispatch_record.attempt_key is distinct from normalized_attempt_key
    or dispatch_record.request_fingerprint is distinct from normalized_fingerprint
    or dispatch_record.request_payload is distinct from p_request_payload then
    raise exception using errcode = '23505', message = 'paid_creative_dispatch_identity_collision';
  end if;

  return query select
    dispatch_record.id,
    case
      when dispatch_record.state in ('accepted', 'projected') then 'recover'
      when dispatch_record.state = 'rejected' then 'terminal'
      else 'operator_action_required'
    end,
    dispatch_record.state,
    dispatch_record.dispatch_token,
    dispatch_record.dispatch_generation,
    dispatch_record.provider_request_id,
    dispatch_record.provider_output,
    dispatch_record.projection_receipt;
end;
$$;

create or replace function public.record_paid_creative_provider_outcome_v1(
  p_dispatch_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_dispatch_token uuid,
  p_dispatch_generation bigint,
  p_outcome text,
  p_provider_request_id text default null,
  p_provider_output jsonb default null,
  p_error_code text default null
)
returns table (
  recorded boolean,
  reused_terminal boolean,
  dispatch_state text,
  provider_request_id text,
  provider_output jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_record public.paid_creative_dispatches%rowtype;
  normalized_outcome text := lower(trim(coalesce(p_outcome, '')));
  normalized_request_id text := nullif(trim(coalesce(p_provider_request_id, '')), '');
  normalized_error_code text := nullif(trim(coalesce(p_error_code, '')), '');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'paid_creative_dispatch_service_role_required';
  end if;

  if p_dispatch_id is null or p_organization_id is null or p_user_id is null
    or p_dispatch_token is null
    or p_dispatch_generation is null or p_dispatch_generation < 1
    or normalized_outcome not in ('accepted', 'rejected', 'uncertain')
    or (p_provider_output is not null and jsonb_typeof(p_provider_output) <> 'object') then
    raise exception using errcode = '22023', message = 'paid_creative_dispatch_outcome_invalid';
  end if;

  select * into dispatch_record
  from public.paid_creative_dispatches existing_dispatch
  where existing_dispatch.id = p_dispatch_id
    and existing_dispatch.organization_id = p_organization_id
    and existing_dispatch.user_id = p_user_id
  for update;

  if dispatch_record.id is null then
    raise exception using errcode = '42501', message = 'paid_creative_dispatch_scope_mismatch';
  end if;

  if dispatch_record.dispatch_token is distinct from p_dispatch_token
    or dispatch_record.dispatch_generation is distinct from p_dispatch_generation then
    raise exception using errcode = '40001', message = 'paid_creative_dispatch_fence_lost';
  end if;

  if dispatch_record.state <> 'dispatching' then
    if dispatch_record.state = normalized_outcome
      and dispatch_record.provider_request_id is not distinct from normalized_request_id
      and dispatch_record.provider_output is not distinct from p_provider_output then
      return query select
        false,
        true,
        dispatch_record.state,
        dispatch_record.provider_request_id,
        dispatch_record.provider_output;
      return;
    end if;

    raise exception using errcode = '55000', message = 'paid_creative_dispatch_outcome_terminal';
  end if;

  if normalized_outcome = 'accepted'
    and (p_provider_output is null or jsonb_typeof(p_provider_output) <> 'object') then
    raise exception using errcode = '22023', message = 'paid_creative_dispatch_accepted_output_required';
  end if;

  if normalized_outcome = 'accepted'
    and dispatch_record.operation like '%video_generation'
    and normalized_request_id is null then
    raise exception using errcode = '22023', message = 'paid_creative_dispatch_video_request_id_required';
  end if;

  update public.paid_creative_dispatches existing_dispatch
  set state = normalized_outcome,
      provider_request_id = normalized_request_id,
      provider_output = p_provider_output,
      last_error_code = normalized_error_code,
      accepted_at = case when normalized_outcome = 'accepted'
        then timezone('utc', now()) else existing_dispatch.accepted_at end,
      updated_at = timezone('utc', now())
  where existing_dispatch.id = dispatch_record.id
  returning * into dispatch_record;

  return query select
    true,
    false,
    dispatch_record.state,
    dispatch_record.provider_request_id,
    dispatch_record.provider_output;
end;
$$;

create or replace function public.finalize_paid_creative_projection_v1(
  p_dispatch_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_projection_receipt jsonb default '{}'::jsonb
)
returns table (
  finalized boolean,
  reused_projection boolean,
  dispatch_state text,
  usage_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_record public.paid_creative_dispatches%rowtype;
  usage_record public.provider_usage_events%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'paid_creative_dispatch_service_role_required';
  end if;

  if p_dispatch_id is null or p_organization_id is null or p_user_id is null
    or p_projection_receipt is null or jsonb_typeof(p_projection_receipt) <> 'object' then
    raise exception using errcode = '22023', message = 'paid_creative_projection_invalid';
  end if;

  select * into dispatch_record
  from public.paid_creative_dispatches existing_dispatch
  where existing_dispatch.id = p_dispatch_id
    and existing_dispatch.organization_id = p_organization_id
    and existing_dispatch.user_id = p_user_id
  for update;

  if dispatch_record.id is null then
    raise exception using errcode = '42501', message = 'paid_creative_dispatch_scope_mismatch';
  end if;

  select * into usage_record
  from public.provider_usage_events event_record
  where event_record.id = dispatch_record.provider_usage_event_id
    and event_record.organization_id = p_organization_id
    and event_record.user_id = p_user_id
  for update;

  if usage_record.id is null then
    raise exception using errcode = '42501', message = 'paid_creative_dispatch_usage_scope_mismatch';
  end if;

  if dispatch_record.state = 'projected' then
    if dispatch_record.projection_receipt is distinct from p_projection_receipt
      or usage_record.status <> 'consumed' then
      raise exception using errcode = '23505', message = 'paid_creative_projection_identity_collision';
    end if;
    return query select false, true, dispatch_record.state, usage_record.status;
    return;
  end if;

  if dispatch_record.state <> 'accepted'
    or dispatch_record.provider_output is null then
    raise exception using errcode = '55000', message = 'paid_creative_dispatch_not_accepted';
  end if;

  if usage_record.status not in ('reserved', 'consumed') then
    raise exception using errcode = '55000', message = 'paid_creative_usage_not_consumable';
  end if;

  if usage_record.status = 'reserved' then
    update public.provider_usage_events event_record
    set status = 'consumed',
        metadata = coalesce(event_record.metadata, '{}'::jsonb) || jsonb_build_object(
          'paidCreativeDispatchId', dispatch_record.id,
          'providerRequestId', dispatch_record.provider_request_id,
          'providerOutputPersistedBeforeConsumption', true
        ),
        settlement_token = null,
        settled_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where event_record.id = usage_record.id;
    usage_record.status := 'consumed';
  end if;

  update public.paid_creative_dispatches existing_dispatch
  set state = 'projected',
      projection_receipt = p_projection_receipt,
      projected_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where existing_dispatch.id = dispatch_record.id
  returning * into dispatch_record;

  return query select true, false, dispatch_record.state, usage_record.status;
end;
$$;

revoke all on function public.begin_paid_creative_dispatch_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.begin_paid_creative_dispatch_v1(
  uuid, uuid, uuid, uuid, text, text, text, text, jsonb
) to service_role;

revoke all on function public.record_paid_creative_provider_outcome_v1(
  uuid, uuid, uuid, uuid, bigint, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.record_paid_creative_provider_outcome_v1(
  uuid, uuid, uuid, uuid, bigint, text, text, jsonb, text
) to service_role;

revoke all on function public.finalize_paid_creative_projection_v1(
  uuid, uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.finalize_paid_creative_projection_v1(
  uuid, uuid, uuid, jsonb
) to service_role;
