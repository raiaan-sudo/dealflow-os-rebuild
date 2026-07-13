-- Durable, fail-closed authority for Meta Instant Form provisioning. Meta
-- forms are immutable provider objects, so ambiguous writes must never be
-- retried until an operator reconciles the exact deterministic form name.

create table if not exists public.meta_instant_form_provisioning (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaign_plans(id) on delete cascade,
  marketing_account_id uuid not null references public.marketing_accounts(id) on delete restrict,
  provider_page_id text not null check (provider_page_id ~ '^[0-9]{5,40}$'),
  form_name text not null check (length(trim(form_name)) between 8 and 200),
  definition_digest text not null check (definition_digest ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('processing', 'created', 'rejected', 'operator_required')),
  provider_form_id text null check (provider_form_id is null or provider_form_id ~ '^[0-9]{5,40}$'),
  processing_token uuid null,
  processing_generation bigint not null default 0 check (processing_generation >= 0),
  processing_locked_until timestamptz null,
  provider_mutation_state text not null default 'idle'
    check (provider_mutation_state in ('idle', 'armed', 'receipted', 'reconciled', 'rejected', 'operator_required')),
  subscription_state text not null default 'pending'
    check (subscription_state in ('pending', 'subscribed', 'rejected', 'operator_required')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text null,
  last_error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  constraint meta_instant_form_provisioning_scope_unique
    unique (campaign_id, definition_digest),
  constraint meta_instant_form_provisioning_processing_check check (
    (status = 'processing' and processing_token is not null and processing_locked_until is not null)
    or (status <> 'processing' and processing_token is null and processing_locked_until is null)
  ),
  constraint meta_instant_form_provisioning_created_check check (
    (status = 'created' and provider_form_id is not null and completed_at is not null)
    or status <> 'created'
  )
);

create index if not exists meta_instant_form_provisioning_scope_idx
  on public.meta_instant_form_provisioning (organization_id, user_id, campaign_id, updated_at desc);

alter table public.meta_instant_form_provisioning enable row level security;
alter table public.meta_instant_form_provisioning force row level security;
revoke all on table public.meta_instant_form_provisioning from public, anon, authenticated, service_role;
grant select on table public.meta_instant_form_provisioning to service_role;

create or replace function public.claim_meta_instant_form_provisioning(
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_marketing_account_id uuid,
  p_provider_page_id text,
  p_form_name text,
  p_definition_digest text,
  p_processing_token uuid,
  p_lease_seconds integer default 300
)
returns table (
  provisioning_id uuid,
  acquired boolean,
  provisioning_status text,
  provider_form_id text,
  processing_generation bigint,
  provider_mutation_state text,
  subscription_state text,
  processing_locked_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing public.meta_instant_form_provisioning%rowtype;
  next_generation bigint;
begin
  if p_processing_token is null
    or p_lease_seconds not between 30 and 900
    or p_provider_page_id !~ '^[0-9]{5,40}$'
    or p_definition_digest !~ '^[0-9a-f]{64}$'
    or length(trim(p_form_name)) not between 8 and 200 then
    raise exception 'invalid instant form provisioning claim' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.campaign_plans c
    where c.id = p_campaign_id
      and c.organization_id = p_organization_id
      and c.user_id = p_user_id
  ) or not exists (
    select 1 from public.marketing_accounts m
    where m.id = p_marketing_account_id
      and m.organization_id = p_organization_id
      and m.platform = 'meta_ads'
      and m.status = 'connected'
  ) then
    raise exception 'instant form tenant authority mismatch' using errcode = '42501';
  end if;

  select * into existing
  from public.meta_instant_form_provisioning p
  where p.campaign_id = p_campaign_id
    and p.definition_digest = p_definition_digest
  for update;

  if not found then
    insert into public.meta_instant_form_provisioning (
      organization_id, user_id, campaign_id, marketing_account_id,
      provider_page_id, form_name, definition_digest, status,
      processing_token, processing_generation, processing_locked_until, attempt_count
    ) values (
      p_organization_id, p_user_id, p_campaign_id, p_marketing_account_id,
      p_provider_page_id, trim(p_form_name), p_definition_digest, 'processing',
      p_processing_token, 1, timezone('utc', now()) + make_interval(secs => p_lease_seconds), 1
    )
    returning * into existing;
    return query select existing.id, true, existing.status,
      existing.provider_form_id, existing.processing_generation,
      existing.provider_mutation_state, existing.subscription_state,
      existing.processing_locked_until;
    return;
  end if;

  if existing.organization_id <> p_organization_id
    or existing.user_id <> p_user_id
    or existing.marketing_account_id <> p_marketing_account_id
    or existing.provider_page_id <> p_provider_page_id
    or existing.form_name <> trim(p_form_name) then
    raise exception 'instant form claim identity mismatch' using errcode = '42501';
  end if;

  if existing.status = 'created' then
    return query select existing.id, false, existing.status,
      existing.provider_form_id, existing.processing_generation,
      existing.provider_mutation_state, existing.subscription_state,
      existing.processing_locked_until;
    return;
  end if;

  if existing.status = 'processing'
    and existing.processing_locked_until > timezone('utc', now()) then
    return query select existing.id, false, existing.status,
      existing.provider_form_id, existing.processing_generation,
      existing.provider_mutation_state, existing.subscription_state,
      existing.processing_locked_until;
    return;
  end if;

  if existing.status = 'processing'
    and existing.provider_mutation_state = 'armed' then
    update public.meta_instant_form_provisioning p set
      status = 'operator_required',
      processing_token = null,
      processing_locked_until = null,
      provider_mutation_state = 'operator_required',
      last_error_code = 'meta_instant_form_expired_ambiguous_write',
      last_error_message = 'The provider write lease expired without a durable form receipt.',
      updated_at = timezone('utc', now())
    where p.id = existing.id
    returning * into existing;
    return query select existing.id, false, existing.status,
      existing.provider_form_id, existing.processing_generation,
      existing.provider_mutation_state, existing.subscription_state,
      existing.processing_locked_until;
    return;
  end if;

  if existing.status = 'operator_required' and existing.provider_form_id is null then
    return query select existing.id, false, existing.status,
      existing.provider_form_id, existing.processing_generation,
      existing.provider_mutation_state, existing.subscription_state,
      existing.processing_locked_until;
    return;
  end if;

  next_generation := existing.processing_generation + 1;
  update public.meta_instant_form_provisioning p set
    status = 'processing',
    processing_token = p_processing_token,
    processing_generation = next_generation,
    processing_locked_until = timezone('utc', now()) + make_interval(secs => p_lease_seconds),
    attempt_count = p.attempt_count + 1,
    last_error_code = null,
    last_error_message = null,
    updated_at = timezone('utc', now())
  where p.id = existing.id
  returning * into existing;

  return query select existing.id, true, existing.status,
    existing.provider_form_id, existing.processing_generation,
    existing.provider_mutation_state, existing.subscription_state,
    existing.processing_locked_until;
end;
$$;

create or replace function public.renew_meta_instant_form_provisioning(
  p_provisioning_id uuid,
  p_processing_token uuid,
  p_processing_generation bigint,
  p_lease_seconds integer default 300
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with renewed as (
    update public.meta_instant_form_provisioning p set
      processing_locked_until = timezone('utc', now()) + make_interval(secs => p_lease_seconds),
      updated_at = timezone('utc', now())
    where p.id = p_provisioning_id
      and p.status = 'processing'
      and p.processing_token = p_processing_token
      and p.processing_generation = p_processing_generation
      and p.processing_locked_until > timezone('utc', now())
      and p_lease_seconds between 30 and 900
    returning 1
  )
  select exists(select 1 from renewed)
$$;

create or replace function public.arm_meta_instant_form_provider_mutation(
  p_provisioning_id uuid,
  p_processing_token uuid,
  p_processing_generation bigint
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with armed as (
    update public.meta_instant_form_provisioning p set
      provider_mutation_state = 'armed',
      updated_at = timezone('utc', now())
    where p.id = p_provisioning_id
      and p.status = 'processing'
      and p.processing_token = p_processing_token
      and p.processing_generation = p_processing_generation
      and p.processing_locked_until > timezone('utc', now())
      and p.provider_form_id is null
      and p.provider_mutation_state in ('idle', 'rejected')
    returning 1
  )
  select exists(select 1 from armed)
$$;

create or replace function public.record_meta_instant_form_provider_receipt(
  p_provisioning_id uuid,
  p_processing_token uuid,
  p_processing_generation bigint,
  p_provider_form_id text,
  p_receipt_source text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with receipted as (
    update public.meta_instant_form_provisioning p set
      provider_form_id = trim(p_provider_form_id),
      provider_mutation_state = case
        when p_receipt_source = 'reconciled' then 'reconciled'
        else 'receipted'
      end,
      updated_at = timezone('utc', now())
    where p.id = p_provisioning_id
      and p.status = 'processing'
      and p.processing_token = p_processing_token
      and p.processing_generation = p_processing_generation
      and p.processing_locked_until > timezone('utc', now())
      and p_provider_form_id ~ '^[0-9]{5,40}$'
      and p_receipt_source in ('provider_response', 'reconciled')
      and (p.provider_form_id is null or p.provider_form_id = trim(p_provider_form_id))
      and p.provider_mutation_state in ('idle', 'armed', 'receipted', 'reconciled')
    returning 1
  )
  select exists(select 1 from receipted)
$$;

create or replace function public.settle_meta_instant_form_provisioning(
  p_provisioning_id uuid,
  p_processing_token uuid,
  p_processing_generation bigint,
  p_outcome text,
  p_provider_form_id text default null,
  p_error_code text default null,
  p_error_message text default null
)
returns table (settled boolean, provisioning_status text, provider_form_id text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  settled_row public.meta_instant_form_provisioning%rowtype;
begin
  if p_outcome not in ('created', 'rejected', 'operator_required')
    or (p_outcome = 'created' and coalesce(p_provider_form_id, '') !~ '^[0-9]{5,40}$') then
    raise exception 'invalid instant form provisioning settlement' using errcode = '22023';
  end if;

  update public.meta_instant_form_provisioning p set
    status = p_outcome,
    provider_form_id = case
      when p_provider_form_id ~ '^[0-9]{5,40}$' then p_provider_form_id
      else p.provider_form_id
    end,
    processing_token = null,
    processing_locked_until = null,
    provider_mutation_state = case
      when p_outcome = 'created' and p.provider_mutation_state = 'reconciled' then 'reconciled'
      when p_outcome = 'created' then 'receipted'
      when p_outcome = 'rejected' and p.provider_form_id is null then 'rejected'
      when p_outcome = 'operator_required' and p.provider_form_id is null then 'operator_required'
      else p.provider_mutation_state
    end,
    subscription_state = case
      when p_outcome = 'created' then 'subscribed'
      when p_outcome = 'rejected' and p.provider_form_id is not null then 'rejected'
      when p_outcome = 'operator_required' and p.provider_form_id is not null then 'operator_required'
      else p.subscription_state
    end,
    last_error_code = p_error_code,
    last_error_message = left(p_error_message, 2000),
    completed_at = case when p_outcome = 'created' then timezone('utc', now()) else null end,
    updated_at = timezone('utc', now())
  where p.id = p_provisioning_id
    and p.status = 'processing'
    and p.processing_token = p_processing_token
    and p.processing_generation = p_processing_generation
  returning * into settled_row;

  if found then
    return query select true, settled_row.status, settled_row.provider_form_id;
    return;
  end if;

  select * into settled_row from public.meta_instant_form_provisioning p
  where p.id = p_provisioning_id;
  return query select false, settled_row.status, settled_row.provider_form_id;
end;
$$;

-- Route creation is deferred to transaction end so the launch completion RPC
-- can first atomically write provider-paused campaign/tracking truth. Any route
-- mismatch aborts the same completion transaction instead of publishing a
-- campaign whose native leads have no exact tenant route.
create or replace function private.finalize_meta_instant_form_launch_route()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  form_receipt public.meta_instant_form_provisioning%rowtype;
  account_record public.marketing_accounts%rowtype;
  snapshot_form_id text;
  snapshot_definition_digest text;
begin
  if new.result_status <> 'success'
    or new.launch_mode not in ('provider_paused', 'scheduled_provider_paused')
    or coalesce(new.launch_input_snapshot -> 'destination' ->> 'ad_destination', 'website')
      <> 'meta_instant_form' then
    return new;
  end if;

  snapshot_form_id := nullif(trim(coalesce(
    new.launch_input_snapshot -> 'destination' ->> 'provider_form_id', ''
  )), '');
  snapshot_definition_digest := nullif(trim(coalesce(
    new.launch_input_snapshot -> 'destination' ->> 'form_definition_digest', ''
  )), '');
  if snapshot_form_id !~ '^[0-9]{5,40}$'
    or snapshot_definition_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'meta_instant_form_launch_snapshot_incomplete' using errcode = '23514';
  end if;

  select provisioning.* into strict form_receipt
  from public.meta_instant_form_provisioning provisioning
  where provisioning.organization_id = new.organization_id
    and provisioning.user_id = new.user_id
    and provisioning.campaign_id = new.campaign_id
    and provisioning.definition_digest = snapshot_definition_digest
    and provisioning.provider_form_id = snapshot_form_id
    and provisioning.status = 'created';

  select account.* into strict account_record
  from public.marketing_accounts account
  where account.id = form_receipt.marketing_account_id
    and account.organization_id = new.organization_id
    and account.platform = 'meta_ads'
    and account.status = 'connected';

  perform * from public.upsert_meta_leadgen_route(
    new.organization_id,
    new.user_id,
    new.user_id,
    new.campaign_id,
    form_receipt.marketing_account_id,
    replace(account_record.external_account_id, 'act_', ''),
    form_receipt.provider_page_id,
    form_receipt.provider_form_id,
    'active'
  );
  if not found then
    raise exception 'meta_instant_form_route_not_created' using errcode = 'P0002';
  end if;

  return new;
exception
  when no_data_found or too_many_rows then
    raise exception 'meta_instant_form_route_authority_ambiguous' using errcode = '23514';
end;
$$;

drop trigger if exists finalize_meta_instant_form_launch_route
  on public.campaign_launch_records;
create constraint trigger finalize_meta_instant_form_launch_route
after insert or update of result_status on public.campaign_launch_records
deferrable initially deferred
for each row
execute function private.finalize_meta_instant_form_launch_route();

revoke all on function public.claim_meta_instant_form_provisioning(uuid, uuid, uuid, uuid, text, text, text, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.renew_meta_instant_form_provisioning(uuid, uuid, bigint, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.arm_meta_instant_form_provider_mutation(uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.record_meta_instant_form_provider_receipt(uuid, uuid, bigint, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.finalize_meta_instant_form_launch_route()
  from public, anon, authenticated, service_role;
revoke all on function public.settle_meta_instant_form_provisioning(uuid, uuid, bigint, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_meta_instant_form_provisioning(uuid, uuid, uuid, uuid, text, text, text, uuid, integer)
  to service_role;
grant execute on function public.renew_meta_instant_form_provisioning(uuid, uuid, bigint, integer)
  to service_role;
grant execute on function public.arm_meta_instant_form_provider_mutation(uuid, uuid, bigint)
  to service_role;
grant execute on function public.record_meta_instant_form_provider_receipt(uuid, uuid, bigint, text, text)
  to service_role;
grant execute on function public.settle_meta_instant_form_provisioning(uuid, uuid, bigint, text, text, text, text)
  to service_role;
