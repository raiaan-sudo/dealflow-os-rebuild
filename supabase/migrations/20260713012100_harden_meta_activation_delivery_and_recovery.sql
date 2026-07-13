-- Forward-only hardening for final Meta delivery truth, safe pre-write retry,
-- and ordered operator reconciliation. No provider or production action occurs.

alter table public.meta_campaign_activation_intents
  add column if not exists provider_delivery_status text not null default 'not_activated'
    check (provider_delivery_status in (
      'not_activated', 'configured_active_pending_review', 'delivery_active'
    )),
  add column if not exists provider_delivery_evidence_digest text null check (
    provider_delivery_evidence_digest is null
    or provider_delivery_evidence_digest ~ '^[0-9a-f]{64}$'
  ),
  add column if not exists provider_contract_evidence_digest text null check (
    provider_contract_evidence_digest is null
    or provider_contract_evidence_digest ~ '^[0-9a-f]{64}$'
  );

create or replace function public.record_meta_campaign_activation_delivery_state(
  p_activation_intent_id uuid, p_worker_id text, p_processing_token uuid,
  p_processing_generation bigint, p_delivery_status text,
  p_delivery_evidence_digest text, p_provider_contract_evidence_digest text
)
returns boolean
language sql security definer set search_path = pg_catalog, public, auth as $$
  with recorded as (
    update public.meta_campaign_activation_intents intent set
      provider_delivery_status = p_delivery_status,
      provider_delivery_evidence_digest = p_delivery_evidence_digest,
      provider_contract_evidence_digest = p_provider_contract_evidence_digest,
      updated_at = timezone('utc', now())
    where auth.role() = 'service_role'
      and intent.id = p_activation_intent_id
      and intent.status = 'processing'
      and intent.processing_worker_id = trim(p_worker_id)
      and intent.processing_token = p_processing_token
      and intent.processing_generation = p_processing_generation
      and intent.processing_locked_until > timezone('utc', now())
      and p_delivery_status in ('configured_active_pending_review', 'delivery_active')
      and p_delivery_evidence_digest ~ '^[0-9a-f]{64}$'
      and p_provider_contract_evidence_digest ~ '^[0-9a-f]{64}$'
      and not exists (
        select 1 from public.meta_campaign_activation_objects object
        where object.activation_intent_id = intent.id
          and object.status <> 'active'
      )
    returning 1
  ) select exists(select 1 from recorded)
$$;

create or replace function public.settle_meta_campaign_activation(
  p_activation_intent_id uuid, p_worker_id text, p_processing_token uuid,
  p_processing_generation bigint, p_outcome text,
  p_error_code text default null, p_error_message text default null
)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare
  intent public.meta_campaign_activation_intents%rowtype;
  terminal_outcome text;
begin
  if auth.role() is distinct from 'service_role'
    or p_outcome not in ('active', 'rejected', 'operator_required', 'retryable') then
    return false;
  end if;
  select * into intent from public.meta_campaign_activation_intents candidate
  where candidate.id = p_activation_intent_id for update;
  if intent.status <> 'processing'
    or intent.processing_worker_id is distinct from trim(p_worker_id)
    or intent.processing_token is distinct from p_processing_token
    or intent.processing_generation is distinct from p_processing_generation then
    return false;
  end if;
  if p_outcome = 'retryable' and exists (
    select 1 from public.meta_campaign_activation_objects object
    where object.activation_intent_id = intent.id
      and object.mutation_generation = p_processing_generation
      and object.provider_mutation_state in ('armed', 'receipted')
  ) then
    return false;
  end if;
  if p_outcome = 'active' and exists (
    select 1 from public.meta_campaign_activation_objects object
    where object.activation_intent_id = intent.id and object.status <> 'active'
  ) then
    return false;
  end if;
  if p_outcome = 'active' and (
    intent.provider_delivery_status not in ('configured_active_pending_review', 'delivery_active')
    or intent.provider_delivery_evidence_digest !~ '^[0-9a-f]{64}$'
    or intent.provider_contract_evidence_digest !~ '^[0-9a-f]{64}$'
  ) then
    return false;
  end if;
  if p_outcome = 'rejected' and exists (
    select 1 from public.meta_campaign_activation_objects object
    where object.activation_intent_id = intent.id
      and object.provider_mutation_state in ('receipted', 'reconciled')
  ) then
    p_outcome := 'operator_required';
  end if;
  terminal_outcome := case
    when p_outcome = 'retryable' and intent.attempt_count >= 5 then 'operator_required'
    when p_outcome = 'retryable' then 'authorized'
    else p_outcome
  end;
  update public.meta_campaign_activation_intents candidate set
    status = terminal_outcome,
    processing_worker_id = null,
    processing_token = null,
    processing_locked_until = null,
    claimed_environment = null,
    claimed_control_generation = null,
    last_error_code = p_error_code,
    last_error_message = left(p_error_message, 2000),
    provider_receipt_summary = (
      select coalesce(jsonb_object_agg(
        object.provider_object_type || ':' || object.provider_object_id,
        jsonb_build_object(
          'status', object.status,
          'receiptId', object.provider_receipt_id,
          'stateDigest', object.provider_state_digest
        )
      ), '{}'::jsonb)
      from public.meta_campaign_activation_objects object
      where object.activation_intent_id = intent.id
    ),
    provider_delivery_status = case
      when terminal_outcome = 'active' then candidate.provider_delivery_status
      else 'not_activated'
    end,
    provider_delivery_evidence_digest = case
      when terminal_outcome = 'active' then candidate.provider_delivery_evidence_digest
      else null
    end,
    provider_contract_evidence_digest = case
      when terminal_outcome = 'active' then candidate.provider_contract_evidence_digest
      else null
    end,
    completed_at = case when terminal_outcome = 'active' then timezone('utc', now()) else null end,
    updated_at = timezone('utc', now())
  where candidate.id = intent.id;
  if terminal_outcome in ('rejected', 'operator_required') and p_outcome <> 'retryable' then
    update public.meta_campaign_activation_objects object set
      status = case when object.status = 'active' then object.status else terminal_outcome end,
      provider_mutation_state = case
        when object.status = 'active' then object.provider_mutation_state
        when terminal_outcome = 'rejected' then 'rejected'
        else 'operator_required'
      end,
      last_error_code = p_error_code,
      last_error_message = left(p_error_message, 2000),
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
declare
  unresolved integer;
  intent_record public.meta_campaign_activation_intents%rowtype;
  target public.meta_campaign_activation_objects%rowtype;
begin
  if auth.role() is distinct from 'service_role'
    or p_observed_state not in ('active', 'paused')
    or p_operator_proof_digest !~ '^[0-9a-f]{64}$'
    or p_provider_state_digest !~ '^[0-9a-f]{64}$'
    or length(trim(coalesce(p_provider_receipt_id, ''))) not between 3 and 500 then
    return false;
  end if;
  select * into intent_record
  from public.meta_campaign_activation_intents intent
  where intent.id = p_activation_intent_id and intent.status = 'operator_required'
  for update;
  if intent_record.id is null then return false; end if;
  select * into target
  from public.meta_campaign_activation_objects object
  where object.id = p_object_id
    and object.activation_intent_id = p_activation_intent_id
    and object.status = 'operator_required'
  for update;
  if target.id is null then return false; end if;
  if p_observed_state = 'active' and exists (
    select 1 from public.meta_campaign_activation_objects earlier
    where earlier.activation_intent_id = p_activation_intent_id
      and earlier.sequence_number < target.sequence_number
      and earlier.status <> 'active'
  ) then return false; end if;
  if p_observed_state = 'paused' and exists (
    select 1 from public.meta_campaign_activation_objects later
    where later.activation_intent_id = p_activation_intent_id
      and later.sequence_number > target.sequence_number
      and later.status = 'active'
  ) then return false; end if;
  update public.meta_campaign_activation_objects object set
    status = case when p_observed_state = 'active' then 'active' else 'pending' end,
    provider_mutation_state = case when p_observed_state = 'active' then 'reconciled' else 'idle' end,
    provider_receipt_id = trim(p_provider_receipt_id),
    provider_state_digest = p_provider_state_digest,
    provider_receipt = jsonb_build_object(
      'source', 'operator_reconciliation',
      'proofDigest', p_operator_proof_digest,
      'observedState', p_observed_state,
      'providerObjectId', object.provider_object_id,
      'providerObjectType', object.provider_object_type
    ),
    activated_at = case when p_observed_state = 'active' then timezone('utc', now()) else null end,
    last_error_code = null,
    last_error_message = null,
    updated_at = timezone('utc', now())
  where object.id = target.id;
  if not found then return false; end if;
  select count(*) into unresolved
  from public.meta_campaign_activation_objects object
  where object.activation_intent_id = p_activation_intent_id
    and object.status = 'operator_required';
  update public.meta_campaign_activation_intents intent set
    status = case when unresolved > 0 then 'operator_required' else 'authorized' end,
    operator_reconciliation_digest = p_operator_proof_digest,
    provider_delivery_status = 'not_activated',
    provider_delivery_evidence_digest = null,
    provider_contract_evidence_digest = null,
    completed_at = null,
    last_error_code = null,
    last_error_message = null,
    updated_at = timezone('utc', now())
  where intent.id = p_activation_intent_id and intent.status = 'operator_required';
  return found;
end;
$$;

revoke all on function public.record_meta_campaign_activation_delivery_state(uuid, text, uuid, bigint, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.settle_meta_campaign_activation(uuid, text, uuid, bigint, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reconcile_meta_campaign_activation_object(uuid, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.record_meta_campaign_activation_delivery_state(uuid, text, uuid, bigint, text, text, text)
  to service_role;
grant execute on function public.settle_meta_campaign_activation(uuid, text, uuid, bigint, text, text, text)
  to service_role;
grant execute on function public.reconcile_meta_campaign_activation_object(uuid, uuid, text, text, text, text)
  to service_role;
