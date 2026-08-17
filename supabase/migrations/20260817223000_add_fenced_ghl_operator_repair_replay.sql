-- Restore a provisioning run only after the operator has repaired the exact
-- preinstalled/required-object configuration that caused a terminal stop.
--
-- Provider receipts remain append-only. The failed attempt is preserved and
-- the same immutable outbox identity is reopened under a database-local fence.
-- No provider call occurs in this function; the normal sandbox/production
-- runtime controls still gate the later worker claim and provider read.

create or replace function public.enforce_ghl_provisioning_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  mapping_record public.ghl_location_mappings%rowtype;
  manifest_record public.ghl_snapshot_manifests%rowtype;
  transition_allowed boolean := false;
  operator_repair_run_id text := current_setting(
    'dealflow.ghl_operator_repair_run_id',
    true
  );
begin
  if tg_op = 'INSERT' then
    if new.state <> 'requested' then
      raise exception 'A GHL provisioning run must begin in requested state.';
    end if;
    return new;
  end if;

  if old.organization_id is distinct from new.organization_id
     or old.environment is distinct from new.environment
     or old.activation_event_id is distinct from new.activation_event_id
     or old.installation_id is distinct from new.installation_id
     or old.snapshot_manifest_id is distinct from new.snapshot_manifest_id
     or old.idempotency_key is distinct from new.idempotency_key then
    raise exception 'GHL provisioning identity is immutable.';
  end if;

  if old.location_mapping_id is not null
     and old.location_mapping_id is distinct from new.location_mapping_id then
    raise exception 'An assigned GHL location mapping cannot be replaced in-place.';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'GHL provisioning updates require exactly one optimistic revision increment.';
  end if;

  if new.state = old.state then
    if new.state = 'location_uncertain' and not new.reconcile_before_retry then
      raise exception 'An uncertain GHL location must retain its reconciliation gate.';
    end if;
    return new;
  end if;

  transition_allowed := case old.state
    when 'requested' then new.state in ('location_create_requested', 'operator_action_required', 'canceled')
    when 'location_create_requested' then new.state in ('location_uncertain', 'location_assigned', 'retryable_failure', 'operator_action_required', 'canceled')
    when 'location_uncertain' then new.state in ('location_assigned', 'retryable_failure', 'operator_action_required', 'canceled')
    when 'location_assigned' then new.state in ('snapshot_install_requested', 'operator_action_required', 'canceled')
    when 'snapshot_install_requested' then new.state in ('snapshot_installing', 'retryable_failure', 'operator_action_required', 'canceled')
    when 'snapshot_installing' then new.state in ('snapshot_verifying', 'retryable_failure', 'operator_action_required', 'canceled')
    when 'snapshot_verifying' then new.state in ('snapshot_installing', 'required_objects_verifying', 'retryable_failure', 'operator_action_required', 'canceled')
    when 'required_objects_verifying' then new.state in ('ready', 'retryable_failure', 'operator_action_required', 'canceled')
    when 'retryable_failure' then new.state in ('location_create_requested', 'snapshot_install_requested', 'snapshot_verifying', 'required_objects_verifying', 'operator_action_required', 'canceled')
    when 'operator_action_required' then
      coalesce(operator_repair_run_id = old.id::text, false)
      and (
        (
          old.last_error_code = 'ghl_preinstalled_required_objects_missing'
          and new.state = 'snapshot_install_requested'
        )
        or (
          old.last_error_code = 'required_snapshot_objects_missing'
          and new.state = 'required_objects_verifying'
        )
      )
      and new.resume_state is null
      and not new.reconcile_before_retry
      and new.next_retry_at is null
      and new.attempt_count = old.attempt_count
      and new.last_reconciled_at is not distinct from old.last_reconciled_at
      and new.ready_at is not distinct from old.ready_at
      and new.state_metadata is not distinct from old.state_metadata
      and new.last_error_code = 'ghl_operator_repair_replay_requested'
      and new.last_error_message = 'The exact operator-repaired GHL object inventory is queued for fenced re-verification.'
    else false
  end;

  if not transition_allowed then
    raise exception 'Invalid GHL provisioning transition from % to %.', old.state, new.state;
  end if;

  if new.state = 'location_uncertain' then
    new.reconcile_before_retry = true;
  end if;

  if old.state = 'location_uncertain' and new.state = 'retryable_failure' then
    if new.last_reconciled_at is null or new.last_reconciled_at < old.updated_at then
      raise exception 'An uncertain GHL location result must be reconciled before retry.';
    end if;
    new.reconcile_before_retry = false;
  end if;

  if old.state = 'retryable_failure' then
    if old.resume_state is null or new.state <> old.resume_state then
      raise exception 'GHL replay must resume only the recorded retry state.';
    end if;
    new.resume_state = null;
    new.next_retry_at = null;
  end if;

  if new.state = 'ready' then
    if new.location_mapping_id is null then
      raise exception 'READY requires an active tenant/location mapping.';
    end if;

    select * into strict mapping_record
    from public.ghl_location_mappings
    where id = new.location_mapping_id
      and organization_id = new.organization_id
      and environment = new.environment
      and status = 'active';

    select * into strict manifest_record
    from public.ghl_snapshot_manifests
    where id = new.snapshot_manifest_id
      and environment = new.environment
      and status = 'approved';

    if mapping_record.snapshot_manifest_id is distinct from manifest_record.id
       or mapping_record.snapshot_verified_at is null
       or mapping_record.required_objects_verified_at is null then
      raise exception 'READY requires the approved snapshot and required-object verification.';
    end if;

    new.ready_at = coalesce(new.ready_at, timezone('utc', now()));
  end if;

  return new;
end;
$$;

create or replace function public.enforce_ghl_outbox_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  transition_allowed boolean := false;
  operator_repair_run_id text := current_setting(
    'dealflow.ghl_operator_repair_run_id',
    true
  );
begin
  if old.organization_id is distinct from new.organization_id
     or old.provisioning_run_id is distinct from new.provisioning_run_id
     or old.operation is distinct from new.operation
     or old.idempotency_key is distinct from new.idempotency_key
     or old.request_payload is distinct from new.request_payload then
    raise exception 'GHL provider outbox request identity is immutable.';
  end if;
  if new.attempt_count < old.attempt_count then
    raise exception 'GHL provider outbox attempt count cannot decrease.';
  end if;

  if new.status = 'dispatching' then
    if new.locked_at is null
       or new.locked_by is null
       or length(trim(new.locked_by)) = 0
       or new.lease_token is null
       or new.lease_expires_at is null
       or new.lease_expires_at <= new.locked_at then
      raise exception 'A dispatching GHL outbox row requires a complete live lease.';
    end if;

    if new.attempt_count <> old.attempt_count + 1
       or new.lease_generation <> old.lease_generation + 1 then
      raise exception 'Each GHL outbox claim must advance exactly one attempt and fencing generation.';
    end if;
  else
    if new.locked_at is not null
       or new.locked_by is not null
       or new.lease_token is not null
       or new.lease_expires_at is not null then
      raise exception 'A non-dispatching GHL outbox row cannot retain a worker lease.';
    end if;

    if new.attempt_count <> old.attempt_count
       or new.lease_generation <> old.lease_generation then
      raise exception 'GHL outbox attempts and fencing generations change only during claim.';
    end if;
  end if;

  if new.status = old.status then
    if new.status <> 'dispatching'
       and (
         new.locked_at is distinct from old.locked_at
         or new.locked_by is distinct from old.locked_by
         or new.lease_token is distinct from old.lease_token
         or new.lease_expires_at is distinct from old.lease_expires_at
       ) then
      raise exception 'GHL outbox lease fields cannot change outside a claim or settlement.';
    end if;
    return new;
  end if;

  transition_allowed := case old.status
    when 'pending' then new.status in ('dispatching', 'canceled')
    when 'retryable_failure' then new.status in ('pending', 'dispatching', 'operator_action_required', 'canceled')
    when 'dispatching' then new.status in (
      'pending',
      'uncertain',
      'succeeded',
      'retryable_failure',
      'operator_action_required',
      'canceled'
    )
    when 'uncertain' then new.status in ('dispatching', 'operator_action_required', 'canceled')
    when 'operator_action_required' then
      new.status = 'canceled'
      or (
        coalesce(operator_repair_run_id = old.provisioning_run_id::text, false)
        and new.status = 'pending'
        and (
          (
            old.operation = 'snapshot_install'
            and old.last_error_code = 'ghl_preinstalled_required_objects_missing'
          )
          or (
            old.operation = 'required_objects_verify'
            and old.last_error_code = 'required_snapshot_objects_missing'
          )
        )
        and new.completed_at is null
        and new.last_error_code is null
      )
    else false
  end;

  if not transition_allowed then
    raise exception 'Invalid GHL provider outbox transition from % to %.', old.status, new.status;
  end if;

  return new;
end;
$$;

create or replace function public.replay_ghl_operator_repaired_provisioning_v1(
  p_run_id uuid,
  p_organization_id uuid,
  p_now timestamptz default timezone('utc', now())
)
returns setof public.ghl_provisioning_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.ghl_provisioning_runs%rowtype;
  outbox_record public.ghl_provider_outbox%rowtype;
  target_state text;
  target_operation text;
  target_request_kind text;
begin
  if p_run_id is null or p_organization_id is null then
    raise exception 'The exact GHL provisioning run and organization are required.';
  end if;

  select * into strict run_record
  from public.ghl_provisioning_runs run
  where run.id = p_run_id
    and run.organization_id = p_organization_id
  for update;

  if run_record.state <> 'operator_action_required' then
    raise exception 'The GHL provisioning run is not awaiting an operator repair.';
  end if;
  if run_record.locked_by is not null
     or run_record.lease_token is not null
     or run_record.locked_until is not null then
    raise exception 'The GHL provisioning run still has a worker lease.';
  end if;
  if run_record.location_mapping_id is null then
    raise exception 'Operator repair replay requires the exact assigned location mapping.';
  end if;

  if run_record.last_error_code = 'ghl_preinstalled_required_objects_missing' then
    target_state := 'snapshot_install_requested';
    target_operation := 'snapshot_install';
    target_request_kind := 'snapshot_verification';
  elsif run_record.last_error_code = 'required_snapshot_objects_missing' then
    target_state := 'required_objects_verifying';
    target_operation := 'required_objects_verify';
    target_request_kind := 'required_object_repair';
  else
    raise exception 'The GHL operator blocker is not eligible for object-repair replay.';
  end if;

  select * into strict outbox_record
  from public.ghl_provider_outbox outbox
  where outbox.organization_id = p_organization_id
    and outbox.provisioning_run_id = p_run_id
    and outbox.operation = target_operation
    and outbox.status = 'operator_action_required'
    and outbox.last_error_code = run_record.last_error_code
  for update;

  if outbox_record.locked_by is not null
     or outbox_record.lease_token is not null
     or outbox_record.lease_expires_at is not null then
    raise exception 'The GHL provider outbox still has a worker lease.';
  end if;
  if not exists (
    select 1
    from public.ghl_provider_receipts receipt
    where receipt.outbox_id = outbox_record.id
      and receipt.attempt_number = outbox_record.attempt_count
      and receipt.outcome = 'operator_action_required'
      and receipt.receipt_metadata ->> 'errorCode' = run_record.last_error_code
  ) then
    raise exception 'The append-only GHL provider receipt does not prove the exact operator blocker.';
  end if;
  if not exists (
    select 1
    from public.ghl_operator_requests request
    where request.organization_id = p_organization_id
      and request.provisioning_run_id = p_run_id
      and request.request_kind = target_request_kind
      and request.blocker_code = run_record.last_error_code
      and request.status in ('open', 'acknowledged')
  ) then
    raise exception 'The matching unresolved GHL operator request is missing.';
  end if;

  perform set_config(
    'dealflow.ghl_operator_repair_run_id',
    run_record.id::text,
    true
  );

  update public.ghl_provider_outbox outbox
  set status = 'pending',
      available_at = p_now,
      completed_at = null,
      last_error_code = null
  where outbox.id = outbox_record.id
    and outbox.status = 'operator_action_required';
  if not found then
    raise exception 'The GHL operator-repair outbox fence was lost.';
  end if;

  update public.ghl_provisioning_runs run
  set state = target_state,
      resume_state = null,
      reconcile_before_retry = false,
      next_retry_at = null,
      last_error_code = 'ghl_operator_repair_replay_requested',
      last_error_message = 'The exact operator-repaired GHL object inventory is queued for fenced re-verification.',
      revision = run.revision + 1,
      updated_at = p_now
  where run.id = run_record.id
    and run.organization_id = p_organization_id
    and run.revision = run_record.revision;
  if not found then
    raise exception 'The GHL operator-repair run revision fence was lost.';
  end if;

  update public.ghl_operator_requests request
  set status = 'resolved',
      resolved_at = p_now,
      updated_at = p_now,
      details = request.details || jsonb_build_object(
        'resolution', 'exact_required_objects_repaired',
        'replayRequestedAt', p_now
      )
  where request.organization_id = p_organization_id
    and request.provisioning_run_id = p_run_id
    and request.request_kind = target_request_kind
    and request.blocker_code = run_record.last_error_code
    and request.status in ('open', 'acknowledged');

  update public.ghl_billing_activation_requests activation
  set status = 'provisioning_requested',
      blocker_code = null,
      updated_at = p_now
  where activation.organization_id = p_organization_id
    and activation.provisioning_run_id = p_run_id;

  return query
  select run.*
  from public.ghl_provisioning_runs run
  where run.id = p_run_id
    and run.organization_id = p_organization_id;
end;
$$;

comment on function public.replay_ghl_operator_repaired_provisioning_v1(
  uuid,
  uuid,
  timestamptz
) is
  'Reopens only an exactly receipted GHL preinstalled/required-object verification after the matching operator repair. It performs no provider call and preserves immutable provider receipts.';

revoke all on function public.replay_ghl_operator_repaired_provisioning_v1(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.replay_ghl_operator_repaired_provisioning_v1(
  uuid,
  uuid,
  timestamptz
) to service_role;
