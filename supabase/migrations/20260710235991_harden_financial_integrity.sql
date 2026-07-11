-- Financial-integrity cutover.
--
-- Deployment prerequisite: drain workers which can still call the legacy
-- provider-usage RPC or write provider_usage_events directly. This migration
-- revokes those paths and converts every legacy in-flight reservation to an
-- operator-owned terminal state rather than guessing whether a provider
-- charged for it.

create table if not exists public.organization_user_credits (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  balance integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, user_id),
  constraint organization_user_credits_balance_nonnegative check (balance >= 0)
);

comment on table public.organization_user_credits is
  'Workspace-and-user scoped paid generation balance. All mutations are RPC-only and append a scoped ledger row.';

create table if not exists public.credit_scope_migration_blockers (
  user_id uuid primary key references auth.users(id) on delete restrict,
  legacy_balance integer not null check (legacy_balance > 0),
  candidate_organization_count integer not null check (candidate_organization_count <> 1),
  status text not null default 'operator_action_required'
    check (status in ('operator_action_required', 'resolved')),
  detected_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz null,
  resolution_note text null
);

comment on table public.credit_scope_migration_blockers is
  'Positive legacy user-only balances which cannot be assigned to exactly one workspace without an owner decision.';

with candidate_scopes as (
  select organization_record.owner_user_id as user_id, organization_record.id as organization_id
  from public.organizations organization_record
  union
  select membership_record.user_id, membership_record.organization_id
  from public.organization_memberships membership_record
),
scope_counts as (
  select candidate.user_id,
         count(*)::integer as organization_count,
         (array_agg(candidate.organization_id order by candidate.organization_id))[1]
           as sole_organization_id
  from candidate_scopes candidate
  group by candidate.user_id
)
insert into public.organization_user_credits (organization_id, user_id, balance)
select scope.sole_organization_id, legacy.user_id, legacy.balance
from public.user_credits legacy
join scope_counts scope on scope.user_id = legacy.user_id
where scope.organization_count = 1
on conflict (organization_id, user_id) do nothing;

with candidate_scopes as (
  select organization_record.owner_user_id as user_id, organization_record.id as organization_id
  from public.organizations organization_record
  union
  select membership_record.user_id, membership_record.organization_id
  from public.organization_memberships membership_record
),
scope_counts as (
  select candidate.user_id, count(*)::integer as organization_count
  from candidate_scopes candidate
  group by candidate.user_id
)
insert into public.credit_scope_migration_blockers (
  user_id,
  legacy_balance,
  candidate_organization_count
)
select legacy.user_id, legacy.balance, coalesce(scope.organization_count, 0)
from public.user_credits legacy
left join scope_counts scope on scope.user_id = legacy.user_id
where legacy.balance > 0
  and coalesce(scope.organization_count, 0) <> 1
on conflict (user_id) do update
set legacy_balance = excluded.legacy_balance,
    candidate_organization_count = excluded.candidate_organization_count,
    status = 'operator_action_required',
    resolved_at = null,
    resolution_note = null;

alter table public.organization_user_credits enable row level security;
alter table public.organization_user_credits force row level security;
alter table public.credit_scope_migration_blockers enable row level security;
alter table public.credit_scope_migration_blockers force row level security;

drop policy if exists organization_user_credits_member_select on public.organization_user_credits;
create policy organization_user_credits_member_select
  on public.organization_user_credits
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and (
      exists (
        select 1
        from public.organizations organization_record
        where organization_record.id = organization_user_credits.organization_id
          and organization_record.owner_user_id = auth.uid()
      )
      or exists (
        select 1
        from public.organization_memberships membership_record
        where membership_record.organization_id = organization_user_credits.organization_id
          and membership_record.user_id = auth.uid()
      )
    )
  );

revoke all on public.organization_user_credits
  from public, anon, authenticated, service_role;
grant select on public.organization_user_credits to authenticated, service_role;
revoke all on public.credit_scope_migration_blockers
  from public, anon, authenticated, service_role;
grant select on public.credit_scope_migration_blockers to service_role;

-- The old user-only table remains frozen as migration evidence. It is never a
-- source for new grants, spends, refunds, activation credits, or summaries.
revoke insert, update, delete, truncate, references, trigger
  on public.user_credits from service_role;
revoke all on public.user_credits from anon, authenticated;
grant select on public.user_credits to service_role;

alter table public.user_credit_ledger
  add column if not exists source_ledger_id uuid null
    references public.user_credit_ledger(id) on delete restrict;
alter table public.user_credit_ledger enable row level security;
alter table public.user_credit_ledger force row level security;

drop index if exists public.user_credit_ledger_idempotency_unique;
alter table public.user_credit_ledger
  drop constraint if exists user_credit_ledger_idempotency_key_key;

create unique index if not exists user_credit_ledger_scoped_idempotency_unique
  on public.user_credit_ledger (organization_id, user_id, idempotency_key)
  where organization_id is not null and idempotency_key is not null;

create unique index if not exists user_credit_ledger_compensation_source_unique
  on public.user_credit_ledger (source_ledger_id)
  where source_ledger_id is not null;

revoke insert, update, delete, truncate, references, trigger
  on public.user_credit_ledger from service_role;
grant select on public.user_credit_ledger to service_role;

drop policy if exists user_credit_ledger_member_select
  on public.user_credit_ledger;
create policy user_credit_ledger_member_select
  on public.user_credit_ledger
  for select
  to authenticated
  using (
    organization_id is not null
    and user_id = auth.uid()
    and (
      exists (
        select 1
        from public.organizations organization_record
        where organization_record.id = user_credit_ledger.organization_id
          and organization_record.owner_user_id = auth.uid()
      )
      or exists (
        select 1
        from public.organization_memberships membership_record
        where membership_record.organization_id = user_credit_ledger.organization_id
          and membership_record.user_id = auth.uid()
      )
    )
  );

create or replace function public.consume_user_credits(
  p_user_id uuid,
  p_organization_id uuid,
  p_amount integer,
  p_reason text,
  p_reference_type text default null,
  p_reference_id text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  allowed boolean,
  balance integer,
  ledger_id uuid,
  reused_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  balance_record public.organization_user_credits%rowtype;
  existing_ledger public.user_credit_ledger%rowtype;
  inserted_ledger public.user_credit_ledger%rowtype;
  normalized_reason text := nullif(trim(coalesce(p_reason, '')), '');
  normalized_reference_type text := nullif(trim(coalesce(p_reference_type, '')), '');
  normalized_reference_id text := nullif(trim(coalesce(p_reference_id, '')), '');
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  next_balance integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'credit_service_role_required';
  end if;

  if p_user_id is null or p_organization_id is null
    or p_amount is null or p_amount <= 0
    or normalized_reason is null then
    raise exception using errcode = '22023', message = 'credit_consume_identity_invalid';
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
    raise exception using errcode = '42501', message = 'credit_actor_not_workspace_member';
  end if;

  insert into public.organization_user_credits (organization_id, user_id, balance)
  values (p_organization_id, p_user_id, 0)
  on conflict (organization_id, user_id) do nothing;

  select * into strict balance_record
  from public.organization_user_credits credit_record
  where credit_record.organization_id = p_organization_id
    and credit_record.user_id = p_user_id
  for update;

  if normalized_idempotency_key is not null then
    select * into existing_ledger
    from public.user_credit_ledger ledger_record
    where ledger_record.organization_id = p_organization_id
      and ledger_record.user_id = p_user_id
      and ledger_record.idempotency_key = normalized_idempotency_key
    limit 1;

    if existing_ledger.id is not null then
      if existing_ledger.delta is distinct from -p_amount
        or existing_ledger.reason is distinct from normalized_reason
        or existing_ledger.reference_type is distinct from normalized_reference_type
        or existing_ledger.reference_id is distinct from normalized_reference_id then
        raise exception using errcode = '23505', message = 'credit_idempotency_identity_collision';
      end if;

      return query select true, existing_ledger.balance_after, existing_ledger.id, true;
      return;
    end if;
  end if;

  if balance_record.balance < p_amount then
    return query select false, balance_record.balance, null::uuid, false;
    return;
  end if;

  next_balance := balance_record.balance - p_amount;

  update public.organization_user_credits credit_record
  set balance = next_balance,
      updated_at = timezone('utc', now())
  where credit_record.organization_id = p_organization_id
    and credit_record.user_id = p_user_id;

  insert into public.user_credit_ledger (
    user_id,
    organization_id,
    delta,
    balance_after,
    reason,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  ) values (
    p_user_id,
    p_organization_id,
    -p_amount,
    next_balance,
    normalized_reason,
    normalized_reference_type,
    normalized_reference_id,
    normalized_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning * into inserted_ledger;

  return query select true, next_balance, inserted_ledger.id, false;
end;
$$;

create or replace function public.grant_user_credits(
  p_user_id uuid,
  p_organization_id uuid,
  p_amount integer,
  p_reason text,
  p_reference_type text default null,
  p_reference_id text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  balance integer,
  ledger_id uuid,
  reused_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  balance_record public.organization_user_credits%rowtype;
  existing_ledger public.user_credit_ledger%rowtype;
  inserted_ledger public.user_credit_ledger%rowtype;
  normalized_reason text := nullif(trim(coalesce(p_reason, '')), '');
  normalized_reference_type text := nullif(trim(coalesce(p_reference_type, '')), '');
  normalized_reference_id text := nullif(trim(coalesce(p_reference_id, '')), '');
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  next_balance integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'credit_service_role_required';
  end if;

  if p_user_id is null or p_organization_id is null
    or p_amount is null or p_amount <= 0
    or normalized_reason is null then
    raise exception using errcode = '22023', message = 'credit_grant_identity_invalid';
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
    raise exception using errcode = '42501', message = 'credit_actor_not_workspace_member';
  end if;

  insert into public.organization_user_credits (organization_id, user_id, balance)
  values (p_organization_id, p_user_id, 0)
  on conflict (organization_id, user_id) do nothing;

  select * into strict balance_record
  from public.organization_user_credits credit_record
  where credit_record.organization_id = p_organization_id
    and credit_record.user_id = p_user_id
  for update;

  if normalized_idempotency_key is not null then
    select * into existing_ledger
    from public.user_credit_ledger ledger_record
    where ledger_record.organization_id = p_organization_id
      and ledger_record.user_id = p_user_id
      and ledger_record.idempotency_key = normalized_idempotency_key
    limit 1;

    if existing_ledger.id is not null then
      if existing_ledger.delta is distinct from p_amount
        or existing_ledger.reason is distinct from normalized_reason
        or existing_ledger.reference_type is distinct from normalized_reference_type
        or existing_ledger.reference_id is distinct from normalized_reference_id then
        raise exception using errcode = '23505', message = 'credit_idempotency_identity_collision';
      end if;

      return query select existing_ledger.balance_after, existing_ledger.id, true;
      return;
    end if;
  end if;

  next_balance := balance_record.balance + p_amount;

  update public.organization_user_credits credit_record
  set balance = next_balance,
      updated_at = timezone('utc', now())
  where credit_record.organization_id = p_organization_id
    and credit_record.user_id = p_user_id;

  insert into public.user_credit_ledger (
    user_id,
    organization_id,
    delta,
    balance_after,
    reason,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  ) values (
    p_user_id,
    p_organization_id,
    p_amount,
    next_balance,
    normalized_reason,
    normalized_reference_type,
    normalized_reference_id,
    normalized_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning * into inserted_ledger;

  return query select next_balance, inserted_ledger.id, false;
end;
$$;

revoke all on function public.consume_user_credits(uuid, uuid, integer, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.consume_user_credits(uuid, uuid, integer, text, text, text, text, jsonb)
  to service_role;
revoke all on function public.grant_user_credits(uuid, uuid, integer, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.grant_user_credits(uuid, uuid, integer, text, text, text, text, jsonb)
  to service_role;

alter table public.provider_usage_events
  add column if not exists attempt_key text null,
  add column if not exists settlement_token uuid null,
  add column if not exists settlement_generation bigint not null default 0,
  add column if not exists credit_ledger_id uuid null
    references public.user_credit_ledger(id) on delete restrict,
  add column if not exists compensation_ledger_id uuid null
    references public.user_credit_ledger(id) on delete restrict,
  add column if not exists settled_at timestamptz null;

alter table public.provider_usage_events
  drop constraint if exists provider_usage_events_status_check;
alter table public.provider_usage_events
  add constraint provider_usage_events_status_check
  check (status in (
    'reserved',
    'consumed',
    'rejected',
    'released',
    'operator_action_required',
    'failed'
  ));

-- No old reservation can be safely called consumed or refundable after a
-- writer cutover. Preserve it for reconciliation and block automatic replay.
update public.provider_usage_events event_record
set status = 'operator_action_required',
    metadata = coalesce(event_record.metadata, '{}'::jsonb) || jsonb_build_object(
      'financialIntegrityCutover', 'legacy_inflight_outcome_ambiguous'
    ),
    settled_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
where event_record.status = 'reserved';

drop index if exists public.provider_usage_events_idempotency_unique;
create unique index if not exists provider_usage_events_scoped_idempotency_unique
  on public.provider_usage_events (organization_id, user_id, idempotency_key)
  where organization_id is not null and idempotency_key is not null;
create unique index if not exists provider_usage_events_scoped_attempt_unique
  on public.provider_usage_events (organization_id, user_id, attempt_key)
  where organization_id is not null and attempt_key is not null;

drop index if exists public.provider_usage_limits_scope_unique_idx;
create unique index if not exists provider_usage_limits_tenant_scope_unique_idx
  on public.provider_usage_limits (
    organization_id,
    user_id,
    coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider,
    operation,
    usage_date
  )
  where organization_id is not null;

create or replace function public.reserve_provider_usage_attempt_v2(
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_provider text,
  p_operation text,
  p_limit_count integer,
  p_idempotency_key text,
  p_attempt_key text,
  p_settlement_token uuid,
  p_estimated_cost numeric default null,
  p_credit_amount integer default 0,
  p_credit_reason text default 'provider_generation'
)
returns table (
  allowed boolean,
  block_reason text,
  current_count integer,
  next_count integer,
  limit_count integer,
  usage_id uuid,
  event_id uuid,
  reused_existing boolean,
  event_status text,
  settlement_token uuid,
  settlement_generation bigint,
  credit_balance integer,
  credit_ledger_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := current_date;
  usage_record public.provider_usage_limits%rowtype;
  existing_event public.provider_usage_events%rowtype;
  inserted_event public.provider_usage_events%rowtype;
  balance_record public.organization_user_credits%rowtype;
  debit_ledger public.user_credit_ledger%rowtype;
  normalized_provider text := nullif(trim(coalesce(p_provider, '')), '');
  normalized_operation text := nullif(trim(coalesce(p_operation, '')), '');
  normalized_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_attempt_key text := nullif(trim(coalesce(p_attempt_key, '')), '');
  normalized_credit_reason text := nullif(trim(coalesce(p_credit_reason, '')), '');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'provider_usage_service_role_required';
  end if;

  if p_organization_id is null or p_user_id is null
    or normalized_provider is null or normalized_operation is null
    or normalized_idempotency_key is null or normalized_attempt_key is null
    or p_settlement_token is null
    or p_limit_count is null or p_limit_count <= 0
    or p_credit_amount is null or p_credit_amount < 0
    or normalized_credit_reason is null then
    raise exception using errcode = '22023', message = 'provider_usage_attempt_identity_invalid';
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
    raise exception using errcode = '42501', message = 'provider_usage_actor_not_workspace_member';
  end if;

  if p_campaign_id is not null and not exists (
    select 1 from public.campaign_plans campaign_record
    where campaign_record.id = p_campaign_id
      and campaign_record.organization_id = p_organization_id
      and campaign_record.user_id = p_user_id
  ) then
    raise exception using errcode = '42501', message = 'provider_usage_campaign_scope_mismatch';
  end if;

  begin
    insert into public.provider_usage_limits (
      organization_id,
      user_id,
      campaign_id,
      provider,
      operation,
      usage_date,
      usage_count,
      limit_count
    ) values (
      p_organization_id,
      p_user_id,
      p_campaign_id,
      normalized_provider,
      normalized_operation,
      today,
      0,
      p_limit_count
    );
  exception when unique_violation then
    null;
  end;

  select * into strict usage_record
  from public.provider_usage_limits usage_limit
  where usage_limit.organization_id = p_organization_id
    and usage_limit.user_id = p_user_id
    and coalesce(usage_limit.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(p_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and usage_limit.provider = normalized_provider
    and usage_limit.operation = normalized_operation
    and usage_limit.usage_date = today
  for update;

  select * into existing_event
  from public.provider_usage_events event_record
  where event_record.organization_id = p_organization_id
    and event_record.user_id = p_user_id
    and (
      event_record.idempotency_key = normalized_idempotency_key
      or event_record.attempt_key = normalized_attempt_key
    )
  order by event_record.created_at asc
  limit 1;

  if existing_event.id is not null then
    if existing_event.organization_id is distinct from p_organization_id
      or existing_event.user_id is distinct from p_user_id
      or existing_event.campaign_id is distinct from p_campaign_id
      or existing_event.provider is distinct from normalized_provider
      or existing_event.operation is distinct from normalized_operation
      or existing_event.idempotency_key is distinct from normalized_idempotency_key
      or existing_event.attempt_key is distinct from normalized_attempt_key then
      raise exception using errcode = '23505', message = 'provider_usage_attempt_identity_collision';
    end if;

    allowed := false;
    block_reason := case
      when existing_event.status = 'reserved' then 'attempt_in_progress'
      when existing_event.status = 'consumed' then 'attempt_consumed'
      when existing_event.status = 'operator_action_required' then 'operator_action_required'
      else 'attempt_terminal'
    end;
    current_count := greatest(usage_record.usage_count - 1, 0);
    next_count := usage_record.usage_count;
    limit_count := usage_record.limit_count;
    usage_id := usage_record.id;
    event_id := existing_event.id;
    reused_existing := true;
    event_status := existing_event.status;
    settlement_token := existing_event.settlement_token;
    settlement_generation := existing_event.settlement_generation;
    credit_ledger_id := existing_event.credit_ledger_id;
    if existing_event.compensation_ledger_id is not null then
      select ledger_record.balance_after into credit_balance
      from public.user_credit_ledger ledger_record
      where ledger_record.id = existing_event.compensation_ledger_id;
    elsif existing_event.credit_ledger_id is not null then
      select ledger_record.balance_after into credit_balance
      from public.user_credit_ledger ledger_record
      where ledger_record.id = existing_event.credit_ledger_id;
    end if;
    return next;
    return;
  end if;

  if usage_record.usage_count >= p_limit_count then
    return query select
      false,
      'limit_reached'::text,
      usage_record.usage_count,
      usage_record.usage_count,
      p_limit_count,
      usage_record.id,
      null::uuid,
      false,
      null::text,
      null::uuid,
      null::bigint,
      null::integer,
      null::uuid;
    return;
  end if;

  insert into public.organization_user_credits (organization_id, user_id, balance)
  values (p_organization_id, p_user_id, 0)
  on conflict (organization_id, user_id) do nothing;

  select * into strict balance_record
  from public.organization_user_credits credit_record
  where credit_record.organization_id = p_organization_id
    and credit_record.user_id = p_user_id
  for update;

  if balance_record.balance < p_credit_amount then
    return query select
      false,
      'credit_insufficient'::text,
      usage_record.usage_count,
      usage_record.usage_count,
      p_limit_count,
      usage_record.id,
      null::uuid,
      false,
      null::text,
      null::uuid,
      null::bigint,
      balance_record.balance,
      null::uuid;
    return;
  end if;

  insert into public.provider_usage_events (
    organization_id,
    user_id,
    campaign_id,
    provider,
    operation,
    idempotency_key,
    attempt_key,
    settlement_token,
    settlement_generation,
    usage_date,
    estimated_cost,
    status,
    metadata
  ) values (
    p_organization_id,
    p_user_id,
    p_campaign_id,
    normalized_provider,
    normalized_operation,
    normalized_idempotency_key,
    normalized_attempt_key,
    p_settlement_token,
    1,
    today,
    p_estimated_cost,
    'reserved',
    jsonb_build_object('attemptKey', normalized_attempt_key)
  ) returning * into inserted_event;

  if p_credit_amount > 0 then
    credit_balance := balance_record.balance - p_credit_amount;

    update public.organization_user_credits credit_record
    set balance = credit_balance,
        updated_at = timezone('utc', now())
    where credit_record.organization_id = p_organization_id
      and credit_record.user_id = p_user_id;

    insert into public.user_credit_ledger (
      user_id,
      organization_id,
      delta,
      balance_after,
      reason,
      reference_type,
      reference_id,
      idempotency_key,
      metadata
    ) values (
      p_user_id,
      p_organization_id,
      -p_credit_amount,
      credit_balance,
      normalized_credit_reason,
      'provider_usage_event',
      inserted_event.id::text,
      'provider_usage_debit:' || inserted_event.id::text,
      jsonb_build_object(
        'provider', normalized_provider,
        'operation', normalized_operation,
        'attemptKey', normalized_attempt_key
      )
    ) returning * into debit_ledger;

    update public.provider_usage_events event_record
    set credit_ledger_id = debit_ledger.id
    where event_record.id = inserted_event.id;
  else
    credit_balance := balance_record.balance;
  end if;

  update public.provider_usage_limits usage_limit
  set usage_count = usage_record.usage_count + 1,
      limit_count = p_limit_count,
      updated_at = timezone('utc', now())
  where usage_limit.id = usage_record.id;

  allowed := true;
  block_reason := null;
  current_count := usage_record.usage_count;
  next_count := usage_record.usage_count + 1;
  limit_count := p_limit_count;
  usage_id := usage_record.id;
  event_id := inserted_event.id;
  reused_existing := false;
  event_status := 'reserved';
  settlement_token := p_settlement_token;
  settlement_generation := 1;
  credit_ledger_id := debit_ledger.id;
  return next;
end;
$$;

create or replace function public.settle_provider_usage_attempt_v2(
  p_event_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_settlement_token uuid,
  p_settlement_generation bigint,
  p_outcome text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  settled boolean,
  event_status text,
  reused_terminal boolean,
  compensated boolean,
  compensation_ledger_id uuid,
  credit_balance integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.provider_usage_events%rowtype;
  debit_ledger public.user_credit_ledger%rowtype;
  existing_compensation public.user_credit_ledger%rowtype;
  inserted_compensation public.user_credit_ledger%rowtype;
  balance_record public.organization_user_credits%rowtype;
  normalized_outcome text := lower(trim(coalesce(p_outcome, '')));
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'provider_usage_service_role_required';
  end if;

  if p_event_id is null or p_organization_id is null or p_user_id is null
    or p_settlement_token is null
    or p_settlement_generation is null or p_settlement_generation < 1
    or normalized_outcome not in (
      'consumed',
      'rejected',
      'released',
      'operator_action_required'
    ) then
    raise exception using errcode = '22023', message = 'provider_usage_settlement_invalid';
  end if;

  select * into event_record
  from public.provider_usage_events existing_event
  where existing_event.id = p_event_id
    and existing_event.organization_id = p_organization_id
    and existing_event.user_id = p_user_id
  for update;

  if event_record.id is null then
    raise exception using errcode = '42501', message = 'provider_usage_event_scope_mismatch';
  end if;

  if event_record.status <> 'reserved' then
    if event_record.compensation_ledger_id is not null then
      select ledger_record.balance_after into credit_balance
      from public.user_credit_ledger ledger_record
      where ledger_record.id = event_record.compensation_ledger_id;
    elsif event_record.credit_ledger_id is not null then
      select ledger_record.balance_after into credit_balance
      from public.user_credit_ledger ledger_record
      where ledger_record.id = event_record.credit_ledger_id;
    end if;

    return query select
      false,
      event_record.status,
      true,
      event_record.compensation_ledger_id is not null,
      event_record.compensation_ledger_id,
      credit_balance;
    return;
  end if;

  if event_record.settlement_token is distinct from p_settlement_token
    or event_record.settlement_generation is distinct from p_settlement_generation then
    return query select
      false,
      event_record.status,
      false,
      false,
      null::uuid,
      null::integer;
    return;
  end if;

  if normalized_outcome in ('rejected', 'released')
    and event_record.credit_ledger_id is not null then
    select * into strict debit_ledger
    from public.user_credit_ledger ledger_record
    where ledger_record.id = event_record.credit_ledger_id
      and ledger_record.organization_id = p_organization_id
      and ledger_record.user_id = p_user_id
      and ledger_record.reference_type = 'provider_usage_event'
      and ledger_record.reference_id = p_event_id::text
      and ledger_record.delta < 0;

    insert into public.organization_user_credits (organization_id, user_id, balance)
    values (p_organization_id, p_user_id, 0)
    on conflict (organization_id, user_id) do nothing;

    select * into strict balance_record
    from public.organization_user_credits credit_record
    where credit_record.organization_id = p_organization_id
      and credit_record.user_id = p_user_id
    for update;

    select * into existing_compensation
    from public.user_credit_ledger ledger_record
    where ledger_record.source_ledger_id = debit_ledger.id
    limit 1;

    if existing_compensation.id is null then
      credit_balance := balance_record.balance + abs(debit_ledger.delta);

      update public.organization_user_credits credit_record
      set balance = credit_balance,
          updated_at = timezone('utc', now())
      where credit_record.organization_id = p_organization_id
        and credit_record.user_id = p_user_id;

      insert into public.user_credit_ledger (
        user_id,
        organization_id,
        delta,
        balance_after,
        reason,
        reference_type,
        reference_id,
        idempotency_key,
        source_ledger_id,
        metadata
      ) values (
        p_user_id,
        p_organization_id,
        abs(debit_ledger.delta),
        credit_balance,
        debit_ledger.reason || '_compensation',
        'provider_usage_event',
        p_event_id::text,
        'provider_usage_compensation:' || p_event_id::text,
        debit_ledger.id,
        jsonb_build_object(
          'settlementOutcome', normalized_outcome,
          'originalLedgerId', debit_ledger.id
        )
      ) returning * into inserted_compensation;
    else
      inserted_compensation := existing_compensation;
      credit_balance := existing_compensation.balance_after;
    end if;
  elsif event_record.credit_ledger_id is not null then
    select ledger_record.balance_after into credit_balance
    from public.user_credit_ledger ledger_record
    where ledger_record.id = event_record.credit_ledger_id;
  else
    select credit_record.balance into credit_balance
    from public.organization_user_credits credit_record
    where credit_record.organization_id = p_organization_id
      and credit_record.user_id = p_user_id;
  end if;

  update public.provider_usage_events existing_event
  set status = normalized_outcome,
      metadata = coalesce(existing_event.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      compensation_ledger_id = inserted_compensation.id,
      settlement_token = null,
      settled_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where existing_event.id = event_record.id;

  return query select
    true,
    normalized_outcome,
    false,
    inserted_compensation.id is not null,
    inserted_compensation.id,
    credit_balance;
end;
$$;

revoke all on function public.reserve_provider_usage_attempt_v2(
  uuid, uuid, uuid, text, text, integer, text, text, uuid, numeric, integer, text
) from public, anon, authenticated;
grant execute on function public.reserve_provider_usage_attempt_v2(
  uuid, uuid, uuid, text, text, integer, text, text, uuid, numeric, integer, text
) to service_role;

revoke all on function public.settle_provider_usage_attempt_v2(
  uuid, uuid, uuid, uuid, bigint, text, jsonb
) from public, anon, authenticated;
grant execute on function public.settle_provider_usage_attempt_v2(
  uuid, uuid, uuid, uuid, bigint, text, jsonb
) to service_role;

revoke all on function public.reserve_provider_usage(
  uuid, uuid, uuid, text, text, integer, text, numeric
) from public, anon, authenticated, service_role;

revoke insert, update, delete, truncate, references, trigger
  on public.provider_usage_events from service_role;
revoke insert, update, delete, truncate, references, trigger
  on public.provider_usage_limits from service_role;
grant select on public.provider_usage_events to service_role;
grant select on public.provider_usage_limits to service_role;

-- Payment history belongs to the workspace. A user recorded on the original
-- activation does not retain access after their workspace membership is
-- removed; personal receipt retention requires a separate explicit policy.
drop policy if exists commercial_activations_member_select
  on public.commercial_activations;
create policy commercial_activations_member_select
  on public.commercial_activations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organizations organization_record
      where organization_record.id = commercial_activations.organization_id
        and organization_record.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.organization_memberships membership_record
      where membership_record.organization_id = commercial_activations.organization_id
        and membership_record.user_id = auth.uid()
    )
  );

-- Apply the authoritative subscription and its organizations.plan_tier
-- projection in one transaction. Every stale/exact replay also repairs the
-- projection from the currently authoritative billing row.
create or replace function public.apply_billing_subscription_webhook(
  p_organization_id uuid,
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_plan_tier text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_metadata jsonb,
  p_stripe_event_id text,
  p_stripe_event_created bigint
)
returns table (
  applied boolean,
  ignored_reason text,
  latest_event_created bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_event_created bigint := greatest(coalesce(p_stripe_event_created, 0), 0);
  normalized_event_id text := coalesce(p_stripe_event_id, '');
  billing_record public.billing_subscriptions%rowtype;
  row_was_applied boolean := false;
  projection_plan_tier text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'billing_webhook_service_role_required';
  end if;

  if p_organization_id is null
    or nullif(trim(coalesce(p_stripe_subscription_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'billing_subscription_identity_invalid';
  end if;

  if not exists (
    select 1 from public.organizations organization_record
    where organization_record.id = p_organization_id
  ) then
    raise exception using errcode = '23503', message = 'billing_organization_missing';
  end if;

  insert into public.billing_subscriptions (
    organization_id,
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    plan_tier,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    metadata,
    stripe_latest_event_id,
    stripe_latest_event_created,
    updated_at
  ) values (
    p_organization_id,
    p_user_id,
    p_stripe_customer_id,
    trim(p_stripe_subscription_id),
    p_stripe_price_id,
    coalesce(nullif(trim(coalesce(p_plan_tier, '')), ''), 'starter'),
    coalesce(nullif(trim(coalesce(p_status, '')), ''), 'inactive'),
    p_current_period_start,
    p_current_period_end,
    coalesce(p_cancel_at_period_end, false),
    coalesce(p_metadata, '{}'::jsonb),
    p_stripe_event_id,
    normalized_event_created,
    timezone('utc', now())
  )
  on conflict (organization_id) do update
  set user_id = excluded.user_id,
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_price_id = excluded.stripe_price_id,
      plan_tier = excluded.plan_tier,
      status = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      metadata = excluded.metadata,
      stripe_latest_event_id = excluded.stripe_latest_event_id,
      stripe_latest_event_created = excluded.stripe_latest_event_created,
      updated_at = timezone('utc', now())
  where public.billing_subscriptions.stripe_latest_event_created < excluded.stripe_latest_event_created
     or (
       public.billing_subscriptions.stripe_latest_event_created = excluded.stripe_latest_event_created
       and coalesce(public.billing_subscriptions.stripe_latest_event_id, '') < normalized_event_id
     )
  returning * into billing_record;

  row_was_applied := billing_record.id is not null;

  if not row_was_applied then
    select * into strict billing_record
    from public.billing_subscriptions existing_subscription
    where existing_subscription.organization_id = p_organization_id
    for update;
  end if;

  projection_plan_tier := case
    when lower(trim(coalesce(billing_record.status, ''))) in ('active', 'trialing', 'past_due')
      then coalesce(nullif(trim(coalesce(billing_record.plan_tier, '')), ''), 'starter')
    else 'starter'
  end;

  update public.organizations organization_record
  set plan_tier = projection_plan_tier
  where organization_record.id = p_organization_id;

  applied := row_was_applied;
  ignored_reason := case
    when row_was_applied then null
    when billing_record.stripe_latest_event_created = normalized_event_created
      and coalesce(billing_record.stripe_latest_event_id, '') = normalized_event_id
      then 'replay_projection_repaired'
    else 'stale_event'
  end;
  latest_event_created := billing_record.stripe_latest_event_created;
  return next;
end;
$$;

revoke all on function public.apply_billing_subscription_webhook(
  uuid, uuid, text, text, text, text, text, timestamptz, timestamptz,
  boolean, jsonb, text, bigint
) from public, anon, authenticated;
grant execute on function public.apply_billing_subscription_webhook(
  uuid, uuid, text, text, text, text, text, timestamptz, timestamptz,
  boolean, jsonb, text, bigint
) to service_role;

update public.organizations organization_record
set plan_tier = case
  when lower(trim(coalesce(subscription_record.status, ''))) in ('active', 'trialing', 'past_due')
    then coalesce(nullif(trim(coalesce(subscription_record.plan_tier, '')), ''), 'starter')
  else 'starter'
end
from public.billing_subscriptions subscription_record
where subscription_record.organization_id = organization_record.id;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260710235991')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
