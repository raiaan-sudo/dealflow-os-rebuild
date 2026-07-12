-- Isolated staging only: this migration creates the durable GHL sandbox lead
-- producer/claim contract. Runtime gates still categorically deny production.

alter table public.ghl_snapshot_manifests
  add column if not exists installation_mode text not null default 'provider_api';

alter table public.ghl_snapshot_manifests
  drop constraint if exists ghl_snapshot_manifests_installation_mode_check,
  add constraint ghl_snapshot_manifests_installation_mode_check
    check (installation_mode in ('preinstalled', 'provider_api'));

create or replace function public.enqueue_ghl_sandbox_lead_effects(
  p_organization_id uuid,
  p_lead_id uuid,
  p_now timestamptz default timezone('utc', now())
)
returns setof public.ghl_lead_effect_events
language plpgsql
security definer
set search_path = public
as $$
declare
  mapping_record public.ghl_location_mappings%rowtype;
  tenant_record public.ghl_workspace_tenants%rowtype;
  installation_record public.ghl_installations%rowtype;
  effect_kind_value text;
  operation_value text;
  outbox_key text;
  effect_key text;
  payload jsonb;
  outbox_record public.ghl_provider_outbox%rowtype;
  effect_record public.ghl_lead_effect_events%rowtype;
begin
  if not exists (
    select 1 from public.leads
    where id = p_lead_id and organization_id = p_organization_id
  ) then
    raise exception 'GHL sandbox lead producer rejected a missing or cross-tenant lead.';
  end if;

  select * into tenant_record
  from public.ghl_workspace_tenants
  where organization_id = p_organization_id and status = 'active';
  if not found then return; end if;

  select * into mapping_record
  from public.ghl_location_mappings
  where organization_id = p_organization_id
    and environment = 'sandbox'
    and status = 'active'
    and snapshot_verified_at is not null
    and required_objects_verified_at is not null
  order by updated_at desc
  limit 1;
  if not found then return; end if;

  select * into strict installation_record
  from public.ghl_installations
  where id = mapping_record.installation_id
    and environment = 'sandbox'
    and status = 'active'
    and encrypted_credential_ref is not null
    and length(trim(encrypted_credential_ref)) > 0;

  -- `ghl_location_mappings` is the sole routing authority. The legacy tables
  -- are compatibility projections only and must never disagree with it.
  if exists (
    select 1 from public.workspace_ghl_mapping legacy
    where legacy.workspace_id = p_organization_id
      and legacy.sync_enabled
      and legacy.ghl_location_id is distinct from mapping_record.provider_location_id
  ) then
    raise exception 'GHL canonical mapping conflicts with legacy workspace mapping.';
  end if;
  if tenant_record.partner_id is not null and exists (
    select 1 from public.partner_ghl_config config
    where config.partner_id = tenant_record.partner_id
      and config.enabled
      and config.default_location_id is not null
      and config.default_location_id is distinct from mapping_record.provider_location_id
  ) then
    raise exception 'GHL canonical mapping conflicts with legacy partner configuration.';
  end if;

  foreach effect_kind_value in array array[
    'contact_upsert',
    'opportunity_upsert',
    'tag_apply',
    'workflow_enroll'
  ] loop
    operation_value := case effect_kind_value
      when 'contact_upsert' then 'lead_contact_upsert'
      when 'opportunity_upsert' then 'lead_opportunity_upsert'
      when 'tag_apply' then 'lead_tag_apply'
      when 'workflow_enroll' then 'lead_workflow_enroll'
    end;
    effect_key := concat(
      'ghl-sandbox-lead-effect-v2:', p_organization_id::text, ':',
      p_lead_id::text, ':', effect_kind_value
    );
    outbox_key := effect_key || ':outbox';
    payload := jsonb_build_object(
      'contract_version', 2,
      'provider_mode', 'sandbox',
      'organization_id', p_organization_id::text,
      'lead_id', p_lead_id::text,
      'location_mapping_id', mapping_record.id::text,
      'effect_kind', effect_kind_value
    );

    insert into public.ghl_provider_outbox (
      organization_id, provisioning_run_id, operation, idempotency_key,
      status, request_payload, available_at
    ) values (
      p_organization_id, null, operation_value, outbox_key,
      'pending', payload, p_now
    ) on conflict (idempotency_key) do nothing
    returning * into outbox_record;

    if outbox_record.id is null then
      select * into strict outbox_record
      from public.ghl_provider_outbox where idempotency_key = outbox_key;
      if outbox_record.organization_id is distinct from p_organization_id
         or outbox_record.operation is distinct from operation_value
         or outbox_record.request_payload is distinct from payload then
        raise exception 'GHL sandbox outbox idempotency crossed an immutable boundary.';
      end if;
    end if;

    insert into public.ghl_lead_effect_events (
      organization_id, lead_id, location_mapping_id, effect_kind,
      idempotency_key, status, outbox_id, metadata
    ) values (
      p_organization_id, p_lead_id, mapping_record.id, effect_kind_value,
      effect_key, 'pending', outbox_record.id,
      jsonb_build_object(
        'contract_version', 2,
        'provider_mode', 'sandbox',
        'provider_network_access', 'https',
        'provider_mutation_attempted', false
      )
    ) on conflict (idempotency_key) do nothing
    returning * into effect_record;

    if effect_record.id is null then
      select * into strict effect_record
      from public.ghl_lead_effect_events where idempotency_key = effect_key;
      if effect_record.organization_id is distinct from p_organization_id
         or effect_record.lead_id is distinct from p_lead_id
         or effect_record.location_mapping_id is distinct from mapping_record.id
         or effect_record.effect_kind is distinct from effect_kind_value
         or effect_record.outbox_id is distinct from outbox_record.id then
        raise exception 'GHL sandbox lead-effect idempotency crossed an immutable boundary.';
      end if;
    end if;

    return next effect_record;
    outbox_record := null;
    effect_record := null;
  end loop;
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
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'p_worker_id is required';
  end if;

  with exhausted as (
    select outbox.id, effect.id as effect_id
    from public.ghl_provider_outbox outbox
    join public.ghl_lead_effect_events effect
      on effect.outbox_id = outbox.id and effect.organization_id = outbox.organization_id
    where outbox.request_payload @> '{"provider_mode":"sandbox"}'::jsonb
      and effect.attempt_count >= effect.max_attempts
      and (
        (outbox.status = 'dispatching' and outbox.lease_expires_at <= p_now and effect.status = 'dispatching')
        or (outbox.status = 'retryable_failure' and outbox.available_at <= p_now and effect.status = 'retryable_failure')
      )
    for update of outbox, effect skip locked
  ), terminal_outbox as (
    update public.ghl_provider_outbox outbox
    set status = 'operator_action_required', available_at = p_now,
        locked_at = null, locked_by = null, lease_token = null,
        lease_expires_at = null, completed_at = p_now,
        last_error_code = 'ghl_lead_effect_attempts_exhausted'
    from exhausted where outbox.id = exhausted.id
    returning exhausted.effect_id
  )
  update public.ghl_lead_effect_events effect
  set status = 'operator_action_required', next_retry_at = null,
      last_error_code = 'ghl_lead_effect_attempts_exhausted',
      last_error_message = null, completed_at = p_now
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
        (outbox.status in ('pending', 'retryable_failure')
          and outbox.available_at <= p_now
          and effect.status in ('pending', 'replay_requested', 'retryable_failure'))
        or (outbox.status = 'dispatching' and outbox.lease_expires_at <= p_now
          and effect.status = 'dispatching')
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
        completed_at = null, last_error_code = null
    from candidate where outbox.id = candidate.id
    returning outbox.id, candidate.effect_id
  ), effect_claim as (
    update public.ghl_lead_effect_events effect
    set status = 'dispatching', attempt_count = effect.attempt_count + 1,
        next_retry_at = null, last_error_code = null, last_error_message = null
    from claimed where effect.id = claimed.effect_id
    returning claimed.id
  )
  select id into claimed_id from effect_claim;

  if claimed_id is null then return; end if;
  return query select * from public.ghl_provider_outbox where id = claimed_id;
end;
$$;

revoke all on function public.enqueue_ghl_sandbox_lead_effects(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.enqueue_ghl_sandbox_lead_effects(uuid, uuid, timestamptz)
  to service_role;

revoke all on function public.claim_next_ghl_sandbox_lead_outbox(text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.claim_next_ghl_sandbox_lead_outbox(text, timestamptz, integer)
  to service_role;

comment on function public.enqueue_ghl_sandbox_lead_effects(uuid, uuid, timestamptz) is
  'Idempotently creates PII-free GHL sandbox delivery effects after canonical lead persistence. Production runtime use is forbidden.';
comment on function public.claim_next_ghl_sandbox_lead_outbox(text, timestamptz, integer) is
  'Claims one dependency-ordered isolated GHL sandbox lead effect with a fenced lease.';

alter table public.system_job_effects
  drop constraint if exists system_job_effects_key_check,
  add constraint system_job_effects_key_check
    check (effect_key in ('agent_notification', 'meta_conversion', 'ghl_delivery'));

-- Preserve the already-hardened claim function byte-for-byte except for its
-- allowlisted effect key. The exact prior definition is a migration precondition.
do $dealflow_expand_lead_effect_claim$
declare
  function_definition text;
  old_allowlist constant text := 'p_effect_key not in (''agent_notification'', ''meta_conversion'')';
  new_allowlist constant text := 'p_effect_key not in (''agent_notification'', ''meta_conversion'', ''ghl_delivery'')';
begin
  select pg_get_functiondef(
    'public.claim_lead_system_job_effect(uuid,uuid,uuid,text,boolean,text,text,uuid,bigint)'::regprocedure
  ) into function_definition;
  if function_definition is null or position(old_allowlist in function_definition) = 0 then
    raise exception 'Unexpected claim_lead_system_job_effect definition; refusing unsafe rewrite.';
  end if;
  execute replace(function_definition, old_allowlist, new_allowlist);
end;
$dealflow_expand_lead_effect_claim$;
