-- Forward-only campaign lifecycle truth hardening. This migration changes no
-- provider state. It keeps campaign_plans.plan.runtime and launch_status as
-- truthful projections of already-durable launch/activation evidence.

create or replace function private.persist_campaign_launch_operator_truth(
  p_launch_id uuid,
  p_error_code text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch public.campaign_launch_records%rowtype;
  changed_at timestamptz := timezone('utc', now());
  safe_message text := left(coalesce(p_message, p_error_code, 'Operator review required.'), 1000);
begin
  select * into strict launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_id
    and candidate.result_status = 'operator_action_required';

  update public.campaign_plans campaign
  set plan = jsonb_set(
        jsonb_set(
          coalesce(campaign.plan, '{}'::jsonb),
          '{launch_runtime}',
          coalesce(campaign.plan -> 'launch_runtime', '{}'::jsonb) || jsonb_build_object(
            'status', 'operator_action_required',
            'step_status', 'operator_action_required',
            'error', safe_message,
            'updated_at', changed_at
          ),
          true
        ),
        '{runtime}',
        coalesce(campaign.plan -> 'runtime', '{}'::jsonb) || jsonb_build_object(
          'status', 'operator_action_required',
          'safetyState', 'failed',
          'metaPushStatus', 'operator_action_required',
          'metaLastMessage', safe_message,
          'lastAction', safe_message,
          'statusUpdatedAt', changed_at
        ),
        true
      ),
      launch_status = 'operator_action_required',
      updated_at = changed_at
  where campaign.id = launch.campaign_id
    and campaign.organization_id = launch.organization_id
    and campaign.user_id = launch.user_id;

  if not found then
    raise exception 'operator-required campaign runtime target is missing';
  end if;

  update public.campaign_tracking_contracts tracking
  set status = 'needs_review',
      readiness = coalesce(tracking.readiness, '{}'::jsonb) || jsonb_build_object(
        'ready', false,
        'missing', jsonb_build_array('launch_receipt_reconciliation'),
        'checked_at', changed_at
      ),
      metadata = coalesce(tracking.metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciliationRequired', true,
        'reconciliationErrorCode', nullif(trim(coalesce(p_error_code, '')), '')
      ),
      last_verified_at = null,
      updated_at = changed_at
  where tracking.campaign_id = launch.campaign_id
    and tracking.organization_id = launch.organization_id;
end;
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
  changed_at timestamptz := timezone('utc', now());
  safe_message text;
  projected_status text;
  projected_push_status text;
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
    completed_at = case when terminal_outcome = 'active' then changed_at else null end,
    updated_at = changed_at
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
      updated_at = changed_at
    where object.activation_intent_id = intent.id and object.status <> 'active';
  end if;

  if terminal_outcome = 'active' then
    projected_status := case
      when intent.provider_delivery_status = 'delivery_active' then 'live'
      else 'provider_processing'
    end;
    projected_push_status := case
      when intent.provider_delivery_status = 'delivery_active' then 'published'
      else 'provider_processing'
    end;
    safe_message := case
      when intent.provider_delivery_status = 'delivery_active'
        then 'Meta activation receipts and final provider readback confirmed active delivery.'
      else 'Meta activation is authorized and configured active; provider review or delivery startup remains in progress.'
    end;
    update public.campaign_plans campaign
    set plan = jsonb_set(
          coalesce(campaign.plan, '{}'::jsonb),
          '{runtime}',
          coalesce(campaign.plan -> 'runtime', '{}'::jsonb) || jsonb_build_object(
            'status', projected_status,
            'safetyState', 'live',
            'metaPushStatus', projected_push_status,
            'metaLastMessage', safe_message,
            'lastAction', safe_message,
            'launchedAt', coalesce(
              nullif(campaign.plan -> 'runtime' -> 'launchedAt', 'null'::jsonb),
              to_jsonb(changed_at)
            ),
            'statusUpdatedAt', changed_at
          ),
          true
        ),
        launch_status = projected_status,
        updated_at = changed_at
    where campaign.id = intent.campaign_id
      and campaign.organization_id = intent.organization_id
      and campaign.user_id = intent.user_id;
    if not found then raise exception 'activation campaign runtime target is missing'; end if;
  elsif terminal_outcome = 'operator_required' then
    safe_message := left(coalesce(p_error_message, p_error_code, 'Meta activation requires operator reconciliation.'), 1000);
    update public.campaign_plans campaign
    set plan = jsonb_set(
          coalesce(campaign.plan, '{}'::jsonb),
          '{runtime}',
          coalesce(campaign.plan -> 'runtime', '{}'::jsonb) || jsonb_build_object(
            'status', 'operator_action_required',
            'safetyState', 'failed',
            'metaPushStatus', 'operator_action_required',
            'metaLastMessage', safe_message,
            'lastAction', safe_message,
            'statusUpdatedAt', changed_at
          ),
          true
        ),
        launch_status = 'operator_action_required',
        updated_at = changed_at
    where campaign.id = intent.campaign_id
      and campaign.organization_id = intent.organization_id
      and campaign.user_id = intent.user_id;
    if not found then raise exception 'activation campaign runtime target is missing'; end if;
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
  active_count integer;
  intent_record public.meta_campaign_activation_intents%rowtype;
  target public.meta_campaign_activation_objects%rowtype;
  changed_at timestamptz := timezone('utc', now());
  projected_status text;
  safe_message text;
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
    activated_at = case when p_observed_state = 'active' then changed_at else null end,
    last_error_code = null,
    last_error_message = null,
    updated_at = changed_at
  where object.id = target.id;
  if not found then return false; end if;
  select count(*), count(*) filter (where object.status = 'active')
    into unresolved, active_count
  from public.meta_campaign_activation_objects object
  where object.activation_intent_id = p_activation_intent_id
    and (object.status = 'operator_required' or object.status = 'active');
  unresolved := (
    select count(*) from public.meta_campaign_activation_objects object
    where object.activation_intent_id = p_activation_intent_id
      and object.status = 'operator_required'
  );
  update public.meta_campaign_activation_intents intent set
    status = case when unresolved > 0 then 'operator_required' else 'authorized' end,
    operator_reconciliation_digest = p_operator_proof_digest,
    provider_delivery_status = 'not_activated',
    provider_delivery_evidence_digest = null,
    provider_contract_evidence_digest = null,
    completed_at = null,
    last_error_code = null,
    last_error_message = null,
    updated_at = changed_at
  where intent.id = p_activation_intent_id and intent.status = 'operator_required';
  if not found then return false; end if;

  if unresolved = 0 then
    projected_status := case when active_count > 0 then 'provider_processing' else 'provider_paused' end;
    safe_message := case
      when active_count > 0 then 'Ambiguous provider state was reconciled. A verified active prefix remains and authorized activation recovery is pending.'
      else 'Ambiguous provider state was reconciled. The exact provider hierarchy remains paused.'
    end;
    update public.campaign_plans campaign
    set plan = jsonb_set(
          coalesce(campaign.plan, '{}'::jsonb),
          '{runtime}',
          coalesce(campaign.plan -> 'runtime', '{}'::jsonb) || jsonb_build_object(
            'status', projected_status,
            'safetyState', case when active_count > 0 then 'live' else 'paused' end,
            'metaPushStatus', projected_status,
            'metaLastMessage', safe_message,
            'lastAction', safe_message,
            'statusUpdatedAt', changed_at
          ),
          true
        ),
        launch_status = projected_status,
        updated_at = changed_at
    where campaign.id = intent_record.campaign_id
      and campaign.organization_id = intent_record.organization_id
      and campaign.user_id = intent_record.user_id;
    if not found then raise exception 'reconciled activation campaign runtime target is missing'; end if;
  end if;
  return true;
end;
$$;

revoke all on function public.settle_meta_campaign_activation(uuid, text, uuid, bigint, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reconcile_meta_campaign_activation_object(uuid, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.persist_campaign_launch_operator_truth(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.settle_meta_campaign_activation(uuid, text, uuid, bigint, text, text, text)
  to service_role;
grant execute on function public.reconcile_meta_campaign_activation_object(uuid, uuid, text, text, text, text)
  to service_role;

comment on function private.persist_campaign_launch_operator_truth(uuid, text, text) is
  'Projects ambiguous launch truth without fabricating a definitive provider failure or retryable launch-ready state.';
comment on function public.settle_meta_campaign_activation(uuid, text, uuid, bigint, text, text, text) is
  'Settles activation and atomically projects verified active, processing, or operator-required lifecycle truth.';
