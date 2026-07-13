-- A provider write that outlives its fenced worker lease has an ambiguous
-- outcome. Never turn that ambiguity into an automatic second provider write.
-- Location creation may be replayed only after a durable reconciliation proves
-- the original request absent. Lead effects require explicit operator handling.

create or replace function public.claim_ghl_provider_outbox(
  p_outbox_id uuid,
  p_organization_id uuid,
  p_worker_id text,
  p_now timestamptz default timezone('utc', now()),
  p_lease_ms integer default 300000
)
returns setof public.ghl_provider_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
  expired_record public.ghl_provider_outbox%rowtype;
  expired_status text;
  expired_error_code text;
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'p_worker_id is required';
  end if;

  select outbox.* into expired_record
  from public.ghl_provider_outbox outbox
  where outbox.id = p_outbox_id
    and outbox.organization_id = p_organization_id
    and outbox.provisioning_run_id is not null
    and outbox.status = 'dispatching'
    and outbox.lease_expires_at is not null
    and outbox.lease_expires_at <= p_now
  for update;

  if found then
    expired_status := case
      when expired_record.operation = 'location_create' then 'uncertain'
      else 'operator_action_required'
    end;
    expired_error_code := case
      when expired_record.operation = 'location_create'
        then 'ghl_location_create_dispatch_lease_expired_uncertain'
      else 'ghl_provider_dispatch_lease_expired_operator_action_required'
    end;

    insert into public.ghl_provider_receipts (
      outbox_id,
      attempt_number,
      outcome,
      provider_request_id,
      provider_reference,
      http_status,
      response_fingerprint,
      receipt_metadata,
      received_at
    ) values (
      expired_record.id,
      expired_record.attempt_count,
      expired_status,
      null,
      case when expired_record.operation = 'location_create'
        then expired_record.idempotency_key else null end,
      null,
      null,
      jsonb_build_object(
        'errorCode', expired_error_code,
        'providerDispatchStarted', true,
        'providerMutationAttempted', true,
        'terminalizedFromExpiredLease', true
      ),
      p_now
    ) on conflict (outbox_id, attempt_number) do nothing;

    update public.ghl_provider_outbox outbox
    set status = expired_status,
        available_at = p_now,
        locked_at = null,
        locked_by = null,
        lease_token = null,
        lease_expires_at = null,
        completed_at = p_now,
        last_error_code = expired_error_code,
        updated_at = p_now
    where outbox.id = expired_record.id;

    -- This invocation is a terminalization pass, never a replacement dispatch.
    return;
  end if;

  with candidate as (
    select outbox.id
    from public.ghl_provider_outbox outbox
    left join public.ghl_provisioning_runs run
      on run.id = outbox.provisioning_run_id
     and run.organization_id = outbox.organization_id
    where outbox.id = p_outbox_id
      and outbox.organization_id = p_organization_id
      and outbox.provisioning_run_id is not null
      and (
        (
          outbox.status in ('pending', 'retryable_failure')
          and outbox.available_at <= p_now
        )
        or (
          outbox.status = 'uncertain'
          and outbox.operation = 'location_create'
          and outbox.available_at <= p_now
          and run.state = 'location_create_requested'
          and run.last_reconciled_at is not null
          and run.last_error_code = 'location_absent_after_reconciliation'
        )
      )
    for update of outbox skip locked
    limit 1
  )
  update public.ghl_provider_outbox outbox
  set status = 'dispatching',
      attempt_count = outbox.attempt_count + 1,
      locked_at = p_now,
      locked_by = trim(p_worker_id),
      lease_token = gen_random_uuid(),
      lease_generation = outbox.lease_generation + 1,
      lease_expires_at = p_now
        + (least(greatest(p_lease_ms, 1000), 3600000)::text || ' milliseconds')::interval,
      completed_at = null,
      last_error_code = null,
      updated_at = p_now
  where outbox.id in (select id from candidate)
  returning outbox.id into claimed_id;

  if claimed_id is null then
    return;
  end if;

  return query
  select *
  from public.ghl_provider_outbox
  where id = claimed_id;
end;
$$;

create or replace function public.claim_next_ghl_sandbox_lead_outbox(
  p_worker_id text,
  p_now timestamptz default timezone('utc', now()),
  p_lease_ms integer default 300000
)
returns setof public.ghl_provider_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
  expired_record record;
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'p_worker_id is required';
  end if;

  -- A dispatching row may already have mutated GHL. Persist that ambiguity and
  -- remove it from the automatic claim surface before considering new work.
  for expired_record in
    select outbox.*, effect.id as effect_id
    from public.ghl_provider_outbox outbox
    join public.ghl_lead_effect_events effect
      on effect.outbox_id = outbox.id
     and effect.organization_id = outbox.organization_id
    where outbox.request_payload @> '{"provider_mode":"sandbox"}'::jsonb
      and outbox.status = 'dispatching'
      and outbox.lease_expires_at is not null
      and outbox.lease_expires_at <= p_now
      and effect.status = 'dispatching'
    for update of outbox, effect skip locked
  loop
    insert into public.ghl_provider_receipts (
      outbox_id,
      attempt_number,
      outcome,
      provider_request_id,
      provider_reference,
      http_status,
      response_fingerprint,
      receipt_metadata,
      received_at
    ) values (
      expired_record.id,
      expired_record.attempt_count,
      'uncertain',
      null,
      null,
      null,
      null,
      jsonb_build_object(
        'provider_mode', 'sandbox',
        'provider_network_access', 'https',
        'provider_dispatch_started', true,
        'provider_mutation_attempted', true,
        'terminalized_from_expired_lease', true,
        'error_code', 'ghl_lead_effect_dispatch_lease_expired_uncertain'
      ),
      p_now
    ) on conflict (outbox_id, attempt_number) do nothing;

    update public.ghl_provider_outbox outbox
    set status = 'uncertain',
        available_at = p_now,
        locked_at = null,
        locked_by = null,
        lease_token = null,
        lease_expires_at = null,
        completed_at = p_now,
        last_error_code = 'ghl_lead_effect_dispatch_lease_expired_uncertain',
        updated_at = p_now
    where outbox.id = expired_record.id;

    update public.ghl_lead_effect_events effect
    set status = 'uncertain',
        next_retry_at = null,
        last_error_code = 'ghl_lead_effect_dispatch_lease_expired_uncertain',
        last_error_message = 'Provider outcome is ambiguous after the dispatch lease expired; operator reconciliation is required before replay.',
        metadata = coalesce(effect.metadata, '{}'::jsonb) || jsonb_build_object(
          'provider_mode', 'sandbox',
          'provider_dispatch_started', true,
          'provider_mutation_attempted', true,
          'terminalized_from_expired_lease', true
        ),
        completed_at = p_now,
        updated_at = p_now
    where effect.id = expired_record.effect_id;
  end loop;

  -- Explicitly retryable outcomes may consume a bounded retry. Once exhausted,
  -- both durable records move to operator-required truth in one transaction.
  with exhausted as (
    select outbox.id, effect.id as effect_id
    from public.ghl_provider_outbox outbox
    join public.ghl_lead_effect_events effect
      on effect.outbox_id = outbox.id and effect.organization_id = outbox.organization_id
    where outbox.request_payload @> '{"provider_mode":"sandbox"}'::jsonb
      and effect.attempt_count >= effect.max_attempts
      and outbox.status = 'retryable_failure'
      and outbox.available_at <= p_now
      and effect.status = 'retryable_failure'
    for update of outbox, effect skip locked
  ), terminal_outbox as (
    update public.ghl_provider_outbox outbox
    set status = 'operator_action_required', available_at = p_now,
        locked_at = null, locked_by = null, lease_token = null,
        lease_expires_at = null, completed_at = p_now,
        last_error_code = 'ghl_lead_effect_attempts_exhausted', updated_at = p_now
    from exhausted where outbox.id = exhausted.id
    returning exhausted.effect_id
  )
  update public.ghl_lead_effect_events effect
  set status = 'operator_action_required', next_retry_at = null,
      last_error_code = 'ghl_lead_effect_attempts_exhausted',
      last_error_message = null, completed_at = p_now, updated_at = p_now
  from terminal_outbox where effect.id = terminal_outbox.effect_id;

  with candidate as (
    select outbox.id, effect.id as effect_id
    from public.ghl_provider_outbox outbox
    join public.ghl_lead_effect_events effect
      on effect.outbox_id = outbox.id and effect.organization_id = outbox.organization_id
    join public.ghl_location_mappings mapping
      on mapping.id = effect.location_mapping_id and mapping.organization_id = effect.organization_id
    join public.ghl_workspace_tenants tenant
      on tenant.organization_id = effect.organization_id and tenant.status = 'active'
    join public.ghl_installations installation
      on installation.id = mapping.installation_id
     and installation.environment = 'sandbox'
     and installation.status = 'active'
     and installation.encrypted_credential_ref is not null
     and length(trim(installation.encrypted_credential_ref)) > 0
    where outbox.request_payload @> '{"provider_mode":"sandbox"}'::jsonb
      and mapping.environment = 'sandbox'
      and mapping.status = 'active'
      and mapping.snapshot_verified_at is not null
      and mapping.required_objects_verified_at is not null
      and not exists (
        select 1 from public.workspace_ghl_mapping legacy
        where legacy.workspace_id = effect.organization_id
          and legacy.sync_enabled
          and legacy.ghl_location_id is distinct from mapping.provider_location_id
      )
      and not exists (
        select 1 from public.partner_ghl_config config
        where config.partner_id = tenant.partner_id
          and config.enabled
          and config.default_location_id is not null
          and config.default_location_id is distinct from mapping.provider_location_id
      )
      and effect.attempt_count < effect.max_attempts
      and (
        effect.effect_kind = 'contact_upsert'
        or exists (
          select 1 from public.ghl_lead_effect_events contact_effect
          where contact_effect.organization_id = effect.organization_id
            and contact_effect.lead_id = effect.lead_id
            and contact_effect.location_mapping_id = effect.location_mapping_id
            and contact_effect.effect_kind = 'contact_upsert'
            and contact_effect.status = 'succeeded'
            and contact_effect.provider_contact_id is not null
        )
      )
      and (
        (
          outbox.status = 'pending'
          and outbox.available_at <= p_now
          and effect.status in ('pending', 'replay_requested')
        )
        or (
          outbox.status = 'retryable_failure'
          and outbox.available_at <= p_now
          and effect.status = 'retryable_failure'
        )
      )
    order by
      case effect.effect_kind
        when 'contact_upsert' then 0
        when 'opportunity_upsert' then 1
        when 'tag_apply' then 2
        when 'workflow_enroll' then 3
        else 4
      end,
      outbox.available_at, outbox.created_at, outbox.id
    for update of outbox, effect skip locked
    limit 1
  ), claimed as (
    update public.ghl_provider_outbox outbox
    set status = 'dispatching', attempt_count = outbox.attempt_count + 1,
        locked_at = p_now, locked_by = trim(p_worker_id),
        lease_token = gen_random_uuid(), lease_generation = outbox.lease_generation + 1,
        lease_expires_at = p_now + (least(greatest(p_lease_ms, 1000), 3600000)::text || ' milliseconds')::interval,
        completed_at = null, last_error_code = null, updated_at = p_now
    from candidate where outbox.id = candidate.id
    returning outbox.id, candidate.effect_id
  ), effect_claim as (
    update public.ghl_lead_effect_events effect
    set status = 'dispatching', attempt_count = effect.attempt_count + 1,
        next_retry_at = null, last_error_code = null, last_error_message = null,
        updated_at = p_now
    from claimed where effect.id = claimed.effect_id
    returning claimed.id
  )
  select id into claimed_id from effect_claim;

  if claimed_id is null then return; end if;
  return query select * from public.ghl_provider_outbox where id = claimed_id;
end;
$$;

-- Keep sandbox and production protocols structurally identical. Production's
-- database kill switch is injected as an additional mandatory precondition.
do $dealflow_clone_safe_ghl_production_claim$
declare
  claim_definition text;
begin
  select pg_get_functiondef(
    'public.claim_next_ghl_sandbox_lead_outbox(text,timestamptz,integer)'::regprocedure
  ) into claim_definition;
  if claim_definition is null
     or position('{"provider_mode":"sandbox"}' in claim_definition) = 0
     or position('environment = ''sandbox''' in claim_definition) = 0
     or position('ghl_lead_effect_dispatch_lease_expired_uncertain' in claim_definition) = 0 then
    raise exception 'Unexpected GHL sandbox safe-claim protocol; production clone refused.';
  end if;
  claim_definition := replace(
    claim_definition,
    'claim_next_ghl_sandbox_lead_outbox',
    'claim_next_ghl_production_lead_outbox'
  );
  claim_definition := replace(claim_definition, '"sandbox"', '"production"');
  claim_definition := replace(claim_definition, '''sandbox''', '''production''');
  claim_definition := regexp_replace(
    claim_definition,
    'begin[[:space:]]+if[[:space:]]+p_worker_id[[:space:]]+is[[:space:]]+null',
    E'begin\n  if not exists (select 1 from public.ghl_runtime_controls where environment = ''production'' and lead_writes_enabled) then\n    raise exception ''GHL production lead database kill switch is closed.'';\n  end if;\n  if p_worker_id is null',
    'i'
  );
  if position('database kill switch is closed' in claim_definition) = 0 then
    raise exception 'Could not fence the GHL production safe-claim protocol.';
  end if;
  execute claim_definition;
end;
$dealflow_clone_safe_ghl_production_claim$;

revoke all on function public.claim_ghl_provider_outbox(uuid, uuid, text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.claim_ghl_provider_outbox(uuid, uuid, text, timestamptz, integer)
  to service_role;

revoke all on function public.claim_next_ghl_sandbox_lead_outbox(text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.claim_next_ghl_sandbox_lead_outbox(text, timestamptz, integer)
  to service_role;

revoke all on function public.claim_next_ghl_production_lead_outbox(text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.claim_next_ghl_production_lead_outbox(text, timestamptz, integer)
  to service_role;

comment on function public.claim_ghl_provider_outbox(uuid, uuid, text, timestamptz, integer) is
  'Claims one provisioning provider effect. Expired dispatches terminalize and cannot be automatically reclaimed; location create reopens only after proven absence reconciliation.';
comment on function public.claim_next_ghl_sandbox_lead_outbox(text, timestamptz, integer) is
  'Claims one dependency-ordered sandbox lead effect. Expired dispatches terminalize as uncertain and cannot be automatically replayed.';
comment on function public.claim_next_ghl_production_lead_outbox(text, timestamptz, integer) is
  'Claims one dependency-ordered production lead effect behind the database kill switch. Expired dispatches terminalize as uncertain and cannot be automatically replayed.';
