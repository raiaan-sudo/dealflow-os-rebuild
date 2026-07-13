-- Customer-authorized, fail-closed activation of an already receipted PAUSED
-- Meta launch. This migration creates authority and durable saga state only;
-- both runtime controls are seeded closed and no provider action is performed.

create table if not exists public.meta_campaign_activation_runtime_controls (
  environment text primary key check (environment in ('staging', 'production')),
  activation_writes_enabled boolean not null default false,
  control_generation bigint not null default 1 check (control_generation > 0),
  change_reason text not null default 'seeded_closed' check (length(trim(change_reason)) between 3 and 500),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.meta_campaign_activation_runtime_controls (
  environment, activation_writes_enabled, control_generation, change_reason
) values
  ('staging', false, 1, 'seeded_closed'),
  ('production', false, 1, 'seeded_closed')
on conflict (environment) do nothing;

create table if not exists public.meta_campaign_activation_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  launch_record_id uuid not null references public.campaign_launch_records(id) on delete restrict,
  marketing_account_id uuid not null references public.marketing_accounts(id) on delete restrict,
  customer_authorized_by uuid not null references auth.users(id) on delete restrict,
  customer_authorized_at timestamptz not null default timezone('utc', now()),
  customer_approval_digest text not null check (customer_approval_digest ~ '^[0-9a-f]{64}$'),
  launch_input_digest text not null check (launch_input_digest ~ '^[0-9a-f]{64}$'),
  activation_input_digest text not null check (activation_input_digest ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (length(trim(idempotency_key)) between 8 and 200),
  scheduled_for timestamptz not null,
  approved_daily_budget_minor bigint not null check (approved_daily_budget_minor between 100 and 100000000),
  approved_currency text not null check (approved_currency ~ '^[A-Z]{3}$'),
  provider_ad_account_id text not null check (provider_ad_account_id ~ '^(act_)?[0-9]{5,40}$'),
  provider_campaign_id text not null check (provider_campaign_id ~ '^[0-9]{5,40}$'),
  provider_ad_set_ids jsonb not null check (
    jsonb_typeof(provider_ad_set_ids) = 'array'
    and jsonb_array_length(provider_ad_set_ids) between 1 and 20
  ),
  provider_ad_ids jsonb not null check (
    jsonb_typeof(provider_ad_ids) = 'array'
    and jsonb_array_length(provider_ad_ids) between 1 and 20
  ),
  status text not null default 'authorized'
    check (status in ('authorized', 'processing', 'active', 'rejected', 'operator_required', 'cancelled')),
  processing_worker_id text null,
  processing_token uuid null,
  processing_generation bigint not null default 0 check (processing_generation >= 0),
  processing_locked_until timestamptz null,
  claimed_environment text null check (claimed_environment is null or claimed_environment in ('staging', 'production')),
  claimed_control_generation bigint null check (claimed_control_generation is null or claimed_control_generation > 0),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  last_error_code text null,
  last_error_message text null,
  provider_receipt_summary jsonb not null default '{}'::jsonb,
  operator_reconciliation_digest text null check (
    operator_reconciliation_digest is null or operator_reconciliation_digest ~ '^[0-9a-f]{64}$'
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  constraint meta_campaign_activation_intent_campaign_scope_fk
    foreign key (campaign_id, organization_id, user_id)
    references public.campaign_plans (id, organization_id, user_id)
    on delete restrict,
  constraint meta_campaign_activation_intent_idempotency_unique
    unique (organization_id, idempotency_key),
  constraint meta_campaign_activation_intent_digest_unique
    unique (organization_id, activation_input_digest),
  constraint meta_campaign_activation_intent_processing_check check (
    (
      status = 'processing'
      and processing_worker_id is not null
      and processing_token is not null
      and processing_locked_until is not null
      and claimed_environment is not null
      and claimed_control_generation is not null
    ) or (
      status <> 'processing'
      and processing_worker_id is null
      and processing_token is null
      and processing_locked_until is null
      and claimed_environment is null
      and claimed_control_generation is null
    )
  ),
  constraint meta_campaign_activation_intent_active_check check (
    status <> 'active' or completed_at is not null
  )
);

create unique index if not exists meta_campaign_activation_one_open_launch_idx
  on public.meta_campaign_activation_intents (launch_record_id)
  where status in ('authorized', 'processing', 'active', 'operator_required');

create index if not exists meta_campaign_activation_due_idx
  on public.meta_campaign_activation_intents (scheduled_for, created_at)
  where status = 'authorized';

create table if not exists public.meta_campaign_activation_objects (
  id uuid primary key default gen_random_uuid(),
  activation_intent_id uuid not null references public.meta_campaign_activation_intents(id) on delete cascade,
  sequence_number integer not null check (sequence_number between 1 and 1000),
  provider_object_type text not null check (provider_object_type in ('ad', 'adset', 'campaign')),
  provider_object_id text not null check (provider_object_id ~ '^[0-9]{5,40}$'),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'rejected', 'operator_required')),
  provider_mutation_state text not null default 'idle'
    check (provider_mutation_state in ('idle', 'armed', 'receipted', 'reconciled', 'rejected', 'operator_required')),
  provider_receipt_id text null check (provider_receipt_id is null or length(trim(provider_receipt_id)) between 3 and 500),
  provider_state_digest text null check (provider_state_digest is null or provider_state_digest ~ '^[0-9a-f]{64}$'),
  provider_receipt jsonb not null default '{}'::jsonb check (octet_length(provider_receipt::text) <= 16384),
  mutation_generation bigint null check (mutation_generation is null or mutation_generation > 0),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  last_error_code text null,
  last_error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  activated_at timestamptz null,
  constraint meta_campaign_activation_object_sequence_unique unique (activation_intent_id, sequence_number),
  constraint meta_campaign_activation_object_identity_unique unique (activation_intent_id, provider_object_type, provider_object_id),
  constraint meta_campaign_activation_object_receipt_check check (
    provider_mutation_state not in ('receipted', 'reconciled')
    or (provider_receipt_id is not null and provider_state_digest is not null)
  ),
  constraint meta_campaign_activation_object_active_check check (
    status <> 'active'
    or (provider_mutation_state in ('receipted', 'reconciled') and activated_at is not null)
  )
);

alter table public.meta_campaign_activation_runtime_controls enable row level security;
alter table public.meta_campaign_activation_runtime_controls force row level security;
alter table public.meta_campaign_activation_intents enable row level security;
alter table public.meta_campaign_activation_intents force row level security;
alter table public.meta_campaign_activation_objects enable row level security;
alter table public.meta_campaign_activation_objects force row level security;

revoke all on table public.meta_campaign_activation_runtime_controls from public, anon, authenticated, service_role;
revoke all on table public.meta_campaign_activation_intents from public, anon, authenticated, service_role;
revoke all on table public.meta_campaign_activation_objects from public, anon, authenticated, service_role;
grant select on table public.meta_campaign_activation_runtime_controls to service_role;
grant select on table public.meta_campaign_activation_intents to service_role;
grant select on table public.meta_campaign_activation_objects to service_role;

create or replace function public.authorize_meta_campaign_activation(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_launch_record_id uuid,
  p_scheduled_for timestamptz,
  p_approved_daily_budget_minor bigint,
  p_approved_currency text,
  p_customer_approval_digest text,
  p_idempotency_key text
)
returns public.meta_campaign_activation_intents
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  customer_user_id uuid := auth.uid();
  launch public.campaign_launch_records%rowtype;
  account public.marketing_accounts%rowtype;
  expected_budget_text text;
  activation_digest text;
  inserted public.meta_campaign_activation_intents%rowtype;
  object_id text;
  object_sequence integer := 0;
begin
  if auth.role() is distinct from 'authenticated' or customer_user_id is null then
    raise exception 'authenticated customer authority is required' using errcode = '42501';
  end if;
  if p_customer_approval_digest !~ '^[0-9a-f]{64}$'
    or length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 200
    or upper(trim(coalesce(p_approved_currency, ''))) !~ '^[A-Z]{3}$'
    or p_approved_daily_budget_minor not between 100 and 100000000
    or p_scheduled_for < timezone('utc', now()) - interval '1 minute'
    or p_scheduled_for > timezone('utc', now()) + interval '366 days' then
    raise exception 'invalid customer activation authorization' using errcode = '22023';
  end if;

  select * into strict launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_record_id
    and candidate.organization_id = p_organization_id
    and candidate.user_id = customer_user_id
    and candidate.campaign_id = p_campaign_id
  for share;

  if launch.result_status <> 'success'
    or launch.launch_mode not in ('provider_paused', 'scheduled_provider_paused')
    or launch.launch_input_digest !~ '^[0-9a-f]{64}$'
    or launch.meta_campaign_id !~ '^[0-9]{5,40}$'
    or jsonb_typeof(launch.meta_ad_set_ids) <> 'array'
    or jsonb_array_length(launch.meta_ad_set_ids) not between 1 and 20
    or jsonb_typeof(launch.meta_ad_ids) <> 'array'
    or jsonb_array_length(launch.meta_ad_ids) not between 1 and 20 then
    raise exception 'activation requires an exact successful provider-paused launch' using errcode = '23514';
  end if;

  expected_budget_text := nullif(trim(coalesce(
    launch.launch_input_snapshot -> 'delivery' ->> 'daily_budget_minor', ''
  )), '');
  if expected_budget_text !~ '^[0-9]+$'
    or expected_budget_text::bigint is distinct from p_approved_daily_budget_minor then
    raise exception 'customer-approved budget does not match the immutable launch input' using errcode = '23514';
  end if;

  if exists (select 1 from jsonb_array_elements_text(launch.meta_ad_set_ids) value where value !~ '^[0-9]{5,40}$')
    or exists (select 1 from jsonb_array_elements_text(launch.meta_ad_ids) value where value !~ '^[0-9]{5,40}$') then
    raise exception 'launch provider object identity is invalid' using errcode = '23514';
  end if;

  select * into strict account
  from public.marketing_accounts candidate
  where candidate.organization_id = p_organization_id
    and candidate.platform = 'meta_ads'
    and candidate.status = 'connected'
    and replace(candidate.external_account_id, 'act_', '') = replace(
      launch.launch_input_snapshot -> 'provider' ->> 'ad_account_id', 'act_', ''
    );

  activation_digest := encode(extensions.digest(convert_to(
    concat_ws('|',
      p_organization_id::text, customer_user_id::text, p_campaign_id::text,
      p_launch_record_id::text, launch.launch_input_digest,
      p_approved_daily_budget_minor::text, upper(trim(p_approved_currency)),
      to_char(p_scheduled_for at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      launch.meta_campaign_id, launch.meta_ad_set_ids::text, launch.meta_ad_ids::text,
      p_customer_approval_digest
    ), 'UTF8'), 'sha256'), 'hex');

  insert into public.meta_campaign_activation_intents (
    organization_id, user_id, campaign_id, launch_record_id, marketing_account_id,
    customer_authorized_by, customer_approval_digest, launch_input_digest,
    activation_input_digest, idempotency_key, scheduled_for,
    approved_daily_budget_minor, approved_currency, provider_ad_account_id,
    provider_campaign_id, provider_ad_set_ids, provider_ad_ids
  ) values (
    p_organization_id, customer_user_id, p_campaign_id, p_launch_record_id, account.id,
    customer_user_id, p_customer_approval_digest, launch.launch_input_digest,
    activation_digest, trim(p_idempotency_key), p_scheduled_for,
    p_approved_daily_budget_minor, upper(trim(p_approved_currency)),
    launch.launch_input_snapshot -> 'provider' ->> 'ad_account_id',
    launch.meta_campaign_id, launch.meta_ad_set_ids, launch.meta_ad_ids
  )
  on conflict (organization_id, idempotency_key) do nothing
  returning * into inserted;

  if inserted.id is null then
    select * into strict inserted
    from public.meta_campaign_activation_intents existing
    where existing.organization_id = p_organization_id
      and existing.idempotency_key = trim(p_idempotency_key);
    if inserted.activation_input_digest is distinct from activation_digest then
      raise exception 'activation idempotency identity mismatch' using errcode = '23514';
    end if;
    return inserted;
  end if;

  for object_id in select value from jsonb_array_elements_text(launch.meta_ad_ids) value loop
    object_sequence := object_sequence + 1;
    insert into public.meta_campaign_activation_objects (
      activation_intent_id, sequence_number, provider_object_type, provider_object_id
    ) values (inserted.id, object_sequence, 'ad', object_id);
  end loop;
  for object_id in select value from jsonb_array_elements_text(launch.meta_ad_set_ids) value loop
    object_sequence := object_sequence + 1;
    insert into public.meta_campaign_activation_objects (
      activation_intent_id, sequence_number, provider_object_type, provider_object_id
    ) values (inserted.id, object_sequence, 'adset', object_id);
  end loop;
  insert into public.meta_campaign_activation_objects (
    activation_intent_id, sequence_number, provider_object_type, provider_object_id
  ) values (inserted.id, object_sequence + 1, 'campaign', launch.meta_campaign_id);

  return inserted;
exception
  when no_data_found or too_many_rows then
    raise exception 'activation authority is missing or ambiguous' using errcode = '42501';
end;
$$;

create or replace function public.cancel_meta_campaign_activation(p_activation_intent_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise exception 'authenticated customer authority is required' using errcode = '42501';
  end if;
  update public.meta_campaign_activation_intents intent set
    status = 'cancelled', updated_at = timezone('utc', now()),
    processing_worker_id = null, processing_token = null, processing_locked_until = null,
    claimed_environment = null, claimed_control_generation = null
  where intent.id = p_activation_intent_id
    and intent.user_id = auth.uid()
    and intent.customer_authorized_by = auth.uid()
    and intent.status = 'authorized';
  return found;
end;
$$;

create or replace function public.claim_due_meta_campaign_activation(
  p_worker_id text,
  p_environment text,
  p_lease_seconds integer default 300
)
returns table (
  activation_intent_id uuid,
  organization_id uuid,
  user_id uuid,
  campaign_id uuid,
  launch_record_id uuid,
  marketing_account_id uuid,
  activation_input_digest text,
  approved_daily_budget_minor bigint,
  approved_currency text,
  processing_token uuid,
  processing_generation bigint,
  claimed_control_generation bigint,
  provider_objects jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  control public.meta_campaign_activation_runtime_controls%rowtype;
  claimed public.meta_campaign_activation_intents%rowtype;
begin
  if auth.role() is distinct from 'service_role'
    or length(trim(coalesce(p_worker_id, ''))) not between 3 and 200
    or p_environment not in ('staging', 'production')
    or p_lease_seconds not between 30 and 900 then
    raise exception 'invalid activation worker claim' using errcode = '42501';
  end if;

  select * into control from public.meta_campaign_activation_runtime_controls candidate
  where candidate.environment = p_environment for update;
  if control.environment is null or control.activation_writes_enabled is not true then
    return;
  end if;

  update public.meta_campaign_activation_intents intent set
    status = 'operator_required',
    last_error_code = 'meta_activation_expired_ambiguous_write',
    last_error_message = 'The activation lease expired after a provider mutation was armed or receipted.',
    processing_worker_id = null, processing_token = null, processing_locked_until = null,
    claimed_environment = null, claimed_control_generation = null,
    updated_at = timezone('utc', now())
  where intent.status = 'processing'
    and intent.processing_locked_until <= timezone('utc', now())
    and exists (
      select 1 from public.meta_campaign_activation_objects object
      where object.activation_intent_id = intent.id
        and object.provider_mutation_state in ('armed', 'receipted')
    );

  update public.meta_campaign_activation_objects object set
    status = 'operator_required', provider_mutation_state = 'operator_required',
    last_error_code = 'meta_activation_expired_ambiguous_write',
    last_error_message = 'Operator reconciliation is required before another provider attempt.',
    updated_at = timezone('utc', now())
  where object.activation_intent_id in (
    select intent.id from public.meta_campaign_activation_intents intent
    where intent.status = 'operator_required'
      and intent.last_error_code = 'meta_activation_expired_ambiguous_write'
  ) and object.provider_mutation_state in ('armed', 'receipted');

  update public.meta_campaign_activation_intents intent set
    status = 'authorized', processing_worker_id = null, processing_token = null,
    processing_locked_until = null, claimed_environment = null,
    claimed_control_generation = null, updated_at = timezone('utc', now())
  where intent.status = 'processing'
    and intent.processing_locked_until <= timezone('utc', now())
    and not exists (
      select 1 from public.meta_campaign_activation_objects object
      where object.activation_intent_id = intent.id
        and object.provider_mutation_state in ('armed', 'receipted', 'operator_required')
    );

  select * into claimed
  from public.meta_campaign_activation_intents candidate
  where candidate.status = 'authorized'
    and candidate.scheduled_for <= timezone('utc', now())
    and candidate.attempt_count < 5
  order by candidate.scheduled_for, candidate.created_at
  for update skip locked
  limit 1;
  if claimed.id is null then return; end if;

  update public.meta_campaign_activation_intents intent set
    status = 'processing', processing_worker_id = trim(p_worker_id),
    processing_token = gen_random_uuid(),
    processing_generation = intent.processing_generation + 1,
    processing_locked_until = timezone('utc', now()) + make_interval(secs => p_lease_seconds),
    claimed_environment = p_environment,
    claimed_control_generation = control.control_generation,
    attempt_count = intent.attempt_count + 1,
    last_error_code = null, last_error_message = null,
    updated_at = timezone('utc', now())
  where intent.id = claimed.id returning * into claimed;

  return query select claimed.id, claimed.organization_id, claimed.user_id,
    claimed.campaign_id, claimed.launch_record_id, claimed.marketing_account_id,
    claimed.activation_input_digest, claimed.approved_daily_budget_minor,
    claimed.approved_currency, claimed.processing_token,
    claimed.processing_generation, claimed.claimed_control_generation,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', object.id, 'sequence', object.sequence_number,
      'type', object.provider_object_type, 'providerId', object.provider_object_id,
      'status', object.status, 'mutationState', object.provider_mutation_state
    ) order by object.sequence_number)
    from public.meta_campaign_activation_objects object
    where object.activation_intent_id = claimed.id), '[]'::jsonb);
end;
$$;

create or replace function public.renew_meta_campaign_activation_claim(
  p_activation_intent_id uuid, p_worker_id text, p_processing_token uuid,
  p_processing_generation bigint, p_lease_seconds integer default 300
)
returns boolean language sql security definer set search_path = pg_catalog, public, auth as $$
  with renewed as (
    update public.meta_campaign_activation_intents intent set
      processing_locked_until = timezone('utc', now()) + make_interval(secs => p_lease_seconds),
      updated_at = timezone('utc', now())
    where auth.role() = 'service_role'
      and intent.id = p_activation_intent_id and intent.status = 'processing'
      and intent.processing_worker_id = trim(p_worker_id)
      and intent.processing_token = p_processing_token
      and intent.processing_generation = p_processing_generation
      and intent.processing_locked_until > timezone('utc', now())
      and p_lease_seconds between 30 and 900
    returning 1
  ) select exists(select 1 from renewed)
$$;

create or replace function public.arm_meta_campaign_activation_object(
  p_activation_intent_id uuid, p_object_id uuid, p_worker_id text,
  p_processing_token uuid, p_processing_generation bigint
)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare intent public.meta_campaign_activation_intents%rowtype;
begin
  if auth.role() is distinct from 'service_role' then return false; end if;
  select * into intent from public.meta_campaign_activation_intents candidate
  where candidate.id = p_activation_intent_id for update;
  if intent.status <> 'processing' or intent.processing_worker_id is distinct from trim(p_worker_id)
    or intent.processing_token is distinct from p_processing_token
    or intent.processing_generation is distinct from p_processing_generation
    or intent.processing_locked_until <= timezone('utc', now())
    or not exists (select 1 from public.meta_campaign_activation_runtime_controls control
      where control.environment = intent.claimed_environment
        and control.activation_writes_enabled
        and control.control_generation = intent.claimed_control_generation) then
    return false;
  end if;
  if exists (select 1 from public.meta_campaign_activation_objects earlier
    join public.meta_campaign_activation_objects target on target.id = p_object_id
    where earlier.activation_intent_id = intent.id
      and earlier.sequence_number < target.sequence_number and earlier.status <> 'active') then
    return false;
  end if;
  update public.meta_campaign_activation_objects object set
    provider_mutation_state = 'armed', mutation_generation = p_processing_generation,
    attempt_count = object.attempt_count + 1, updated_at = timezone('utc', now())
  where object.id = p_object_id and object.activation_intent_id = intent.id
    and object.status = 'pending' and object.provider_mutation_state = 'idle';
  return found;
end;
$$;

create or replace function public.record_meta_campaign_activation_receipt(
  p_activation_intent_id uuid, p_object_id uuid, p_worker_id text,
  p_processing_token uuid, p_processing_generation bigint,
  p_provider_receipt_id text, p_provider_state_digest text, p_provider_receipt jsonb
)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare intent public.meta_campaign_activation_intents%rowtype; object_record public.meta_campaign_activation_objects%rowtype;
begin
  if auth.role() is distinct from 'service_role' then return false; end if;
  select * into intent from public.meta_campaign_activation_intents candidate where candidate.id = p_activation_intent_id for update;
  select * into object_record from public.meta_campaign_activation_objects candidate where candidate.id = p_object_id for update;
  if intent.status <> 'processing' or intent.processing_worker_id is distinct from trim(p_worker_id)
    or intent.processing_token is distinct from p_processing_token
    or intent.processing_generation is distinct from p_processing_generation
    or intent.processing_locked_until <= timezone('utc', now())
    or object_record.activation_intent_id is distinct from intent.id
    or object_record.provider_mutation_state <> 'armed'
    or object_record.mutation_generation is distinct from p_processing_generation
    or length(trim(coalesce(p_provider_receipt_id, ''))) not between 3 and 500
    or p_provider_state_digest !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(coalesce(p_provider_receipt, 'null'::jsonb)) <> 'object'
    or octet_length(p_provider_receipt::text) > 16384
    or p_provider_receipt ->> 'activationInputDigest' is distinct from intent.activation_input_digest
    or p_provider_receipt ->> 'providerObjectId' is distinct from object_record.provider_object_id
    or p_provider_receipt ->> 'providerObjectType' is distinct from object_record.provider_object_type then
    return false;
  end if;
  update public.meta_campaign_activation_objects object set
    provider_mutation_state = 'receipted', provider_receipt_id = trim(p_provider_receipt_id),
    provider_state_digest = p_provider_state_digest, provider_receipt = p_provider_receipt,
    updated_at = timezone('utc', now())
  where object.id = p_object_id;
  return true;
end;
$$;

create or replace function public.settle_meta_campaign_activation_object(
  p_activation_intent_id uuid, p_object_id uuid, p_worker_id text,
  p_processing_token uuid, p_processing_generation bigint
)
returns boolean
language sql security definer set search_path = pg_catalog, public, auth as $$
  with settled as (
    update public.meta_campaign_activation_objects object set
      status = 'active', activated_at = timezone('utc', now()), updated_at = timezone('utc', now())
    from public.meta_campaign_activation_intents intent
    where auth.role() = 'service_role'
      and intent.id = p_activation_intent_id and intent.status = 'processing'
      and intent.processing_worker_id = trim(p_worker_id)
      and intent.processing_token = p_processing_token
      and intent.processing_generation = p_processing_generation
      and intent.processing_locked_until > timezone('utc', now())
      and object.id = p_object_id and object.activation_intent_id = intent.id
      and object.status = 'pending' and object.provider_mutation_state = 'receipted'
      and object.mutation_generation = p_processing_generation
    returning 1
  ) select exists(select 1 from settled)
$$;

create or replace function public.settle_meta_campaign_activation(
  p_activation_intent_id uuid, p_worker_id text, p_processing_token uuid,
  p_processing_generation bigint, p_outcome text,
  p_error_code text default null, p_error_message text default null
)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare intent public.meta_campaign_activation_intents%rowtype;
begin
  if auth.role() is distinct from 'service_role' or p_outcome not in ('active', 'rejected', 'operator_required') then return false; end if;
  select * into intent from public.meta_campaign_activation_intents candidate where candidate.id = p_activation_intent_id for update;
  if intent.status <> 'processing' or intent.processing_worker_id is distinct from trim(p_worker_id)
    or intent.processing_token is distinct from p_processing_token
    or intent.processing_generation is distinct from p_processing_generation then return false; end if;
  if p_outcome = 'active' and exists (select 1 from public.meta_campaign_activation_objects object
    where object.activation_intent_id = intent.id and object.status <> 'active') then return false; end if;
  if p_outcome = 'rejected' and exists (select 1 from public.meta_campaign_activation_objects object
    where object.activation_intent_id = intent.id and object.provider_mutation_state in ('receipted', 'reconciled')) then
    p_outcome := 'operator_required';
  end if;
  update public.meta_campaign_activation_intents candidate set
    status = p_outcome, processing_worker_id = null, processing_token = null,
    processing_locked_until = null, claimed_environment = null, claimed_control_generation = null,
    last_error_code = p_error_code, last_error_message = left(p_error_message, 2000),
    provider_receipt_summary = (select coalesce(jsonb_object_agg(
      object.provider_object_type || ':' || object.provider_object_id,
      jsonb_build_object('status', object.status, 'receiptId', object.provider_receipt_id,
        'stateDigest', object.provider_state_digest)), '{}'::jsonb)
      from public.meta_campaign_activation_objects object where object.activation_intent_id = intent.id),
    completed_at = case when p_outcome = 'active' then timezone('utc', now()) else null end,
    updated_at = timezone('utc', now())
  where candidate.id = intent.id;
  if p_outcome in ('rejected', 'operator_required') then
    update public.meta_campaign_activation_objects object set
      status = case when object.status = 'active' then object.status else p_outcome end,
      provider_mutation_state = case when object.status = 'active' then object.provider_mutation_state
        when p_outcome = 'rejected' then 'rejected' else 'operator_required' end,
      last_error_code = p_error_code, last_error_message = left(p_error_message, 2000),
      updated_at = timezone('utc', now())
    where object.activation_intent_id = intent.id and object.status <> 'active';
  end if;
  return true;
end;
$$;

create or replace function public.reconcile_meta_campaign_activation_object(
  p_activation_intent_id uuid, p_object_id uuid, p_observed_state text,
  p_operator_proof_digest text, p_provider_receipt_id text, p_provider_state_digest text
)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare remaining integer;
begin
  if auth.role() is distinct from 'service_role' or p_observed_state not in ('active', 'paused')
    or p_operator_proof_digest !~ '^[0-9a-f]{64}$' or p_provider_state_digest !~ '^[0-9a-f]{64}$'
    or length(trim(coalesce(p_provider_receipt_id, ''))) not between 3 and 500 then return false; end if;
  update public.meta_campaign_activation_objects object set
    status = case when p_observed_state = 'active' then 'active' else 'pending' end,
    provider_mutation_state = case when p_observed_state = 'active' then 'reconciled' else 'idle' end,
    provider_receipt_id = trim(p_provider_receipt_id), provider_state_digest = p_provider_state_digest,
    provider_receipt = jsonb_build_object('source', 'operator_reconciliation', 'proofDigest', p_operator_proof_digest,
      'observedState', p_observed_state, 'providerObjectId', object.provider_object_id,
      'providerObjectType', object.provider_object_type),
    activated_at = case when p_observed_state = 'active' then timezone('utc', now()) else null end,
    last_error_code = null, last_error_message = null, updated_at = timezone('utc', now())
  where object.id = p_object_id and object.activation_intent_id = p_activation_intent_id
    and object.status = 'operator_required';
  if not found then return false; end if;
  select count(*) into remaining from public.meta_campaign_activation_objects object
    where object.activation_intent_id = p_activation_intent_id and object.status <> 'active';
  update public.meta_campaign_activation_intents intent set
    status = case when remaining = 0 then 'active' else 'authorized' end,
    operator_reconciliation_digest = p_operator_proof_digest,
    completed_at = case when remaining = 0 then timezone('utc', now()) else null end,
    last_error_code = null, last_error_message = null, updated_at = timezone('utc', now())
  where intent.id = p_activation_intent_id and intent.status = 'operator_required';
  return found;
end;
$$;

revoke all on function public.authorize_meta_campaign_activation(uuid, uuid, uuid, timestamptz, bigint, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_meta_campaign_activation(uuid) from public, anon, authenticated, service_role;
revoke all on function public.claim_due_meta_campaign_activation(text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.renew_meta_campaign_activation_claim(uuid, text, uuid, bigint, integer) from public, anon, authenticated, service_role;
revoke all on function public.arm_meta_campaign_activation_object(uuid, uuid, text, uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function public.record_meta_campaign_activation_receipt(uuid, uuid, text, uuid, bigint, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.settle_meta_campaign_activation_object(uuid, uuid, text, uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function public.settle_meta_campaign_activation(uuid, text, uuid, bigint, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.reconcile_meta_campaign_activation_object(uuid, uuid, text, text, text, text) from public, anon, authenticated, service_role;

grant execute on function public.authorize_meta_campaign_activation(uuid, uuid, uuid, timestamptz, bigint, text, text, text) to authenticated;
grant execute on function public.cancel_meta_campaign_activation(uuid) to authenticated;
grant execute on function public.claim_due_meta_campaign_activation(text, text, integer) to service_role;
grant execute on function public.renew_meta_campaign_activation_claim(uuid, text, uuid, bigint, integer) to service_role;
grant execute on function public.arm_meta_campaign_activation_object(uuid, uuid, text, uuid, bigint) to service_role;
grant execute on function public.record_meta_campaign_activation_receipt(uuid, uuid, text, uuid, bigint, text, text, jsonb) to service_role;
grant execute on function public.settle_meta_campaign_activation_object(uuid, uuid, text, uuid, bigint) to service_role;
grant execute on function public.settle_meta_campaign_activation(uuid, text, uuid, bigint, text, text, text) to service_role;
grant execute on function public.reconcile_meta_campaign_activation_object(uuid, uuid, text, text, text, text) to service_role;
