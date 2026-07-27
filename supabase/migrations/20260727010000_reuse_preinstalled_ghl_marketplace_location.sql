-- DealFlow realtors connect an existing, snapshot-preinstalled GHL location.
-- Billing activation must bind and verify that exact OAuth-proven location; it
-- must never create a duplicate provider sub-account or rename the existing
-- location as a side effect of activation.

create or replace function public.enforce_ghl_location_hierarchy()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  tenant_record public.ghl_workspace_tenants%rowtype;
  installation_record public.ghl_installations%rowtype;
  manifest_record public.ghl_snapshot_manifests%rowtype;
  retirement_authority text := current_setting('dealflow.ghl_retirement_mapping_id', true);
  manifest_binding_authority text := current_setting('dealflow.ghl_manifest_binding_mapping_id', true);
  manifest_binding_allowed boolean := false;
begin
  if tg_op = 'UPDATE'
     and old.snapshot_manifest_id is null
     and new.snapshot_manifest_id is not null
     and old.status = 'provisioning'
     and new.status = 'provisioning'
     and manifest_binding_authority = old.id::text then
    select * into manifest_record
    from public.ghl_snapshot_manifests
    where id = new.snapshot_manifest_id
      and installation_id = old.installation_id
      and environment = old.environment
      and installation_mode = 'preinstalled'
      and status = 'approved';
    manifest_binding_allowed := found;
  end if;

  if tg_op = 'UPDATE' and (
    old.organization_id is distinct from new.organization_id
    or old.partner_id is distinct from new.partner_id
    or old.installation_id is distinct from new.installation_id
    or old.environment is distinct from new.environment
    or old.provider_location_id is distinct from new.provider_location_id
    or old.provisioning_owner is distinct from new.provisioning_owner
    or (
      old.snapshot_manifest_id is distinct from new.snapshot_manifest_id
      and not manifest_binding_allowed
    )
  ) then
    raise exception 'GHL mapping identity is immutable; retire it and create a reconciled replacement.';
  end if;

  select * into strict tenant_record
  from public.ghl_workspace_tenants
  where organization_id = new.organization_id;

  select * into strict installation_record
  from public.ghl_installations
  where id = new.installation_id and environment = new.environment;

  if tenant_record.tenant_kind = 'direct_realtor' and new.partner_id is not null then
    raise exception 'Direct realtor GHL mappings cannot carry a partner id.';
  end if;
  if tenant_record.tenant_kind = 'partner_child'
     and new.partner_id is distinct from tenant_record.partner_id then
    raise exception 'Partner-child GHL mapping does not match the workspace hierarchy.';
  end if;
  if installation_record.owner_kind = 'partner'
     and new.partner_id is distinct from installation_record.partner_id then
    raise exception 'Partner-owned GHL installation cannot be used outside its partner hierarchy.';
  end if;
  if new.provisioning_owner = 'partner' and new.partner_id is null then
    raise exception 'Partner provisioning requires a partner id.';
  end if;
  if tg_op = 'UPDATE'
     and old.status = 'active'
     and new.status <> 'active'
     and exists (
       select 1 from public.ghl_provisioning_runs run_record
       where run_record.location_mapping_id = old.id and run_record.state = 'ready'
     )
     and not (
       new.status = 'inactive'
       and retirement_authority = old.id::text
       and new.retired_at is not null
       and new.retirement_reason is not null
       and new.retired_by is not null
     ) then
    raise exception 'An active GHL mapping cannot be retired while a provisioning run is READY.';
  end if;
  return new;
end;
$$;

create or replace function public.request_ghl_provisioning_from_billing_activation_v1(
  p_organization_id uuid,
  p_user_id uuid,
  p_environment text,
  p_commercial_activation_id uuid,
  p_stripe_subscription_id text,
  p_now timestamptz default timezone('utc', now())
)
returns table(request_id uuid, request_status text, provisioning_run_id uuid, blocker_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_record public.organizations%rowtype;
  activation_record public.commercial_activations%rowtype;
  installation_record public.ghl_installations%rowtype;
  manifest_record public.ghl_snapshot_manifests%rowtype;
  mapping_record public.ghl_location_mappings%rowtype;
  request_record public.ghl_billing_activation_requests%rowtype;
  run_record public.ghl_provisioning_runs%rowtype;
  tenant_kind_value text;
  country_value text;
  timezone_value text;
  idempotency_value text;
  blocker_value text;
begin
  if p_environment not in ('production', 'sandbox', 'test') or p_commercial_activation_id is null then
    raise exception 'Invalid GHL billing activation identity.';
  end if;

  select * into strict organization_record
  from public.organizations
  where id = p_organization_id;
  if organization_record.owner_user_id is distinct from p_user_id or not exists (
    select 1
    from public.organization_memberships
    where organization_id = p_organization_id
      and user_id = p_user_id
      and role in ('owner', 'admin')
  ) then
    raise exception 'GHL billing activation user is not the exact workspace owner.';
  end if;

  select * into strict activation_record
  from public.commercial_activations activation
  where activation.id = p_commercial_activation_id
    and activation.organization_id = p_organization_id
    and activation.user_id = p_user_id
    and activation.source_provider = 'stripe'
    and activation.source_event_type in ('checkout.session.completed', 'invoice.payment_succeeded')
    and activation.amount_paid_cents > 0;
  if activation_record.source_subscription_id is distinct from p_stripe_subscription_id then
    raise exception 'GHL provisioning subscription does not match the immutable commercial activation.';
  end if;

  tenant_kind_value := case
    when organization_record.partner_id is null then 'direct_realtor'
    else 'partner_child'
  end;
  insert into public.ghl_workspace_tenants (
    organization_id, tenant_kind, partner_id, status
  ) values (
    p_organization_id, tenant_kind_value, organization_record.partner_id, 'active'
  )
  on conflict (organization_id) do update set
    tenant_kind = excluded.tenant_kind,
    partner_id = excluded.partner_id,
    status = 'active',
    updated_at = p_now
  where public.ghl_workspace_tenants.tenant_kind = excluded.tenant_kind
    and public.ghl_workspace_tenants.partner_id is not distinct from excluded.partner_id;
  if not found then
    raise exception 'GHL tenant ownership changed across an immutable activation boundary.';
  end if;

  insert into public.ghl_billing_activation_requests (
    organization_id, user_id, partner_id, tenant_kind, environment,
    commercial_activation_id, activation_event_id, stripe_subscription_id,
    status, requested_at, updated_at
  ) values (
    p_organization_id, p_user_id, organization_record.partner_id,
    tenant_kind_value, p_environment, activation_record.id,
    activation_record.source_event_id, p_stripe_subscription_id,
    'received', p_now, p_now
  )
  on conflict (organization_id, environment, commercial_activation_id) do nothing;

  select * into strict request_record
  from public.ghl_billing_activation_requests
  where organization_id = p_organization_id
    and environment = p_environment
    and commercial_activation_id = activation_record.id;
  if request_record.user_id is distinct from p_user_id
     or request_record.stripe_subscription_id is distinct from p_stripe_subscription_id
     or request_record.partner_id is distinct from organization_record.partner_id then
    raise exception 'GHL billing activation idempotency crossed tenant or payment identity.';
  end if;
  if request_record.provisioning_run_id is not null then
    return query
    select request_record.id, request_record.status,
      request_record.provisioning_run_id, request_record.blocker_code;
    return;
  end if;

  select * into run_record
  from public.ghl_provisioning_runs
  where organization_id = p_organization_id
    and environment = p_environment
    and state <> 'canceled'
  order by requested_at asc, id asc
  limit 1;
  if found then
    update public.ghl_billing_activation_requests set
      provisioning_run_id = run_record.id,
      status = 'provisioning_requested',
      blocker_code = case
        when run_record.state = 'operator_action_required'
          then coalesce(run_record.last_error_code, 'ghl_existing_run_operator_action_required')
        else null
      end,
      updated_at = p_now
    where id = request_record.id
    returning * into request_record;
    return query
    select request_record.id, request_record.status,
      request_record.provisioning_run_id, request_record.blocker_code;
    return;
  end if;

  select * into installation_record
  from public.ghl_installations installation
  where installation.environment = p_environment
    and installation.status = 'active'
    and installation.encrypted_credential_ref is not null
    and (
      (
        organization_record.partner_id is null
        and installation.owner_kind = 'platform'
        and installation.partner_id is null
      )
      or (
        organization_record.partner_id is not null
        and installation.owner_kind = 'partner'
        and installation.partner_id = organization_record.partner_id
      )
    )
  order by installation.created_at asc
  limit 1;
  if not found then
    blocker_value := 'ghl_activation_installation_missing';
  end if;

  if blocker_value is null then
    select * into manifest_record
    from public.ghl_snapshot_manifests manifest
    where manifest.environment = p_environment
      and manifest.installation_id = installation_record.id
      and manifest.status = 'approved'
      and manifest.installation_mode = 'preinstalled'
      and jsonb_typeof(manifest.personalization_contract) = 'object'
      and jsonb_typeof(manifest.personalization_contract -> 'customValues') = 'object'
      and jsonb_typeof(manifest.personalization_contract -> 'requiredFormIds') = 'array'
      and jsonb_array_length(manifest.personalization_contract -> 'requiredFormIds') > 0
      and nullif(trim(manifest.personalization_contract ->> 'destinationUrl'), '') ~ '^https://'
    order by manifest.approved_at desc nulls last, manifest.created_at desc
    limit 1;
    if not found then
      blocker_value := 'ghl_activation_personalized_preinstalled_manifest_missing';
    end if;
  end if;

  if blocker_value is null then
    country_value := nullif(trim(installation_record.capability_manifest ->> 'defaultCountry'), '');
    timezone_value := nullif(trim(installation_record.capability_manifest ->> 'defaultTimezone'), '');
    if country_value !~ '^[A-Z]{2}$' or timezone_value is null then
      blocker_value := 'ghl_activation_location_profile_missing';
    end if;
  end if;

  if blocker_value is null then
    select * into mapping_record
    from public.ghl_location_mappings mapping
    where mapping.organization_id = p_organization_id
      and mapping.installation_id = installation_record.id
      and mapping.environment = p_environment
      and mapping.status in ('provisioning', 'active')
    for update;
    if not found then
      blocker_value := 'ghl_activation_preinstalled_location_mapping_missing';
    elsif mapping_record.snapshot_manifest_id is not null
      and mapping_record.snapshot_manifest_id is distinct from manifest_record.id then
      blocker_value := 'ghl_activation_preinstalled_manifest_conflict';
    end if;
  end if;

  if blocker_value is not null then
    update public.ghl_billing_activation_requests set
      status = 'blocked_configuration',
      blocker_code = blocker_value,
      updated_at = p_now
    where id = request_record.id
    returning * into request_record;
    return query
    select request_record.id, request_record.status,
      request_record.provisioning_run_id, request_record.blocker_code;
    return;
  end if;

  if mapping_record.snapshot_manifest_id is null then
    perform set_config(
      'dealflow.ghl_manifest_binding_mapping_id',
      mapping_record.id::text,
      true
    );
    update public.ghl_location_mappings set
      snapshot_manifest_id = manifest_record.id,
      last_reconciled_at = p_now,
      updated_at = p_now
    where id = mapping_record.id
      and organization_id = p_organization_id
      and status = 'provisioning'
      and snapshot_manifest_id is null
    returning * into mapping_record;
    if not found then
      raise exception 'GHL preinstalled manifest binding lost its exact mapping fence.';
    end if;
  end if;

  idempotency_value := concat(
    'ghl-commercial-activation-v1:',
    p_environment, ':', p_organization_id, ':',
    activation_record.id, ':', manifest_record.id
  );
  insert into public.ghl_provisioning_runs (
    organization_id, environment, activation_event_id, installation_id,
    snapshot_manifest_id, idempotency_key, state, state_metadata,
    requested_at, created_at, updated_at
  ) values (
    p_organization_id, p_environment, activation_record.source_event_id,
    installation_record.id, manifest_record.id, idempotency_value, 'requested',
    jsonb_build_object(
      'location_profile', jsonb_build_object(
        'display_name', organization_record.name,
        'country', country_value,
        'timezone', timezone_value
      ),
      'billing_user_id', p_user_id::text,
      'billing_subscription_id', p_stripe_subscription_id
    ),
    p_now, p_now, p_now
  )
  on conflict (idempotency_key) do nothing;

  select * into strict run_record
  from public.ghl_provisioning_runs
  where idempotency_key = idempotency_value;
  if run_record.organization_id is distinct from p_organization_id
     or run_record.installation_id is distinct from installation_record.id
     or run_record.snapshot_manifest_id is distinct from manifest_record.id then
    raise exception 'GHL provisioning idempotency crossed tenant or installation authority.';
  end if;

  if run_record.state = 'requested' then
    update public.ghl_provisioning_runs set
      state = 'location_create_requested',
      location_mapping_id = mapping_record.id,
      state_metadata = state_metadata || jsonb_build_object(
        'provider_location_id', mapping_record.provider_location_id,
        'preinstalled_location_reused', true
      ),
      revision = revision + 1,
      updated_at = p_now
    where id = run_record.id
      and revision = run_record.revision
    returning * into run_record;

    update public.ghl_provisioning_runs set
      state = 'location_assigned',
      revision = revision + 1,
      updated_at = p_now
    where id = run_record.id
      and revision = run_record.revision
    returning * into run_record;

    update public.ghl_provisioning_runs set
      state = 'snapshot_install_requested',
      revision = revision + 1,
      updated_at = p_now
    where id = run_record.id
      and revision = run_record.revision
    returning * into run_record;
  end if;

  if run_record.location_mapping_id is distinct from mapping_record.id
     or run_record.state = 'requested'
     or run_record.state in ('location_create_requested', 'location_assigned') then
    raise exception 'GHL preinstalled location reuse did not reach the fenced snapshot-verification boundary.';
  end if;

  update public.ghl_billing_activation_requests set
    provisioning_run_id = run_record.id,
    status = 'provisioning_requested',
    blocker_code = null,
    updated_at = p_now
  where id = request_record.id
  returning * into request_record;

  return query
  select request_record.id, request_record.status,
    request_record.provisioning_run_id, request_record.blocker_code;
end;
$$;

comment on function public.request_ghl_provisioning_from_billing_activation_v1(
  uuid, uuid, text, uuid, text, timestamptz
) is
  'Requests GHL provisioning for a paid workspace by reusing its exact OAuth-bound preinstalled location. It never creates or renames a provider location.';

revoke all on function public.request_ghl_provisioning_from_billing_activation_v1(
  uuid, uuid, text, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.request_ghl_provisioning_from_billing_activation_v1(
  uuid, uuid, text, uuid, text, timestamptz
) to service_role;
