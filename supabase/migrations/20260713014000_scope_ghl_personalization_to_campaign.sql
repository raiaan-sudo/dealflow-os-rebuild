-- DealFlow exact GHL campaign-scoped personalization.
--
-- This preserves the supported owner-preinstalled snapshot model. It only
-- writes documented GHL custom values and verifies exact preinstalled forms;
-- it does not claim to create or publish GHL funnels, pages, or forms.

alter table public.ghl_location_personalizations
  add column if not exists campaign_id uuid null references public.campaign_plans(id) on delete restrict,
  add column if not exists slot_key text null,
  add column if not exists source_plan_fingerprint text null,
  add column if not exists destination_contract_fingerprint text null,
  add column if not exists contract_revision bigint not null default 1,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5;

alter table public.ghl_location_personalizations
  drop constraint if exists ghl_location_personalizations_mapping_unique,
  drop constraint if exists ghl_location_personalizations_status_check;

alter table public.ghl_location_personalizations
  add constraint ghl_location_personalizations_status_check
    check (status in ('pending', 'applying', 'ready', 'uncertain', 'operator_action_required')),
  add constraint ghl_location_personalizations_campaign_scope_check
    check (
      (campaign_id is null and slot_key is null and source_plan_fingerprint is null and destination_contract_fingerprint is null)
      or (
        campaign_id is not null
        and slot_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'
        and source_plan_fingerprint ~ '^[a-f0-9]{64}$'
        and destination_contract_fingerprint ~ '^[a-f0-9]{64}$'
      )
    ),
  add constraint ghl_location_personalizations_contract_revision_check check (contract_revision > 0);

alter table public.ghl_location_personalizations
  add constraint ghl_location_personalizations_attempts_check
    check (attempt_count >= 0 and max_attempts between 1 and 20 and attempt_count <= max_attempts);

-- Legacy location-only rows cannot be trusted for any campaign. They remain
-- visible evidence but are never claimable or resolvable by the v2 contract.
update public.ghl_location_personalizations
set status = 'operator_action_required',
    current_step = case when current_step = 'ready' then 'forms' else current_step end,
    last_error_code = 'ghl_legacy_location_personalization_not_campaign_scoped',
    locked_by = null,
    locked_until = null,
    lease_token = null,
    next_retry_at = null,
    updated_at = timezone('utc', now())
where campaign_id is null;

create unique index if not exists ghl_location_personalizations_campaign_unique
  on public.ghl_location_personalizations (location_mapping_id, campaign_id)
  where campaign_id is not null;

create unique index if not exists ghl_location_personalizations_campaign_scope_unique
  on public.ghl_location_personalizations (organization_id, campaign_id, environment)
  where campaign_id is not null;

create unique index if not exists ghl_location_personalizations_slot_unique
  on public.ghl_location_personalizations (location_mapping_id, slot_key)
  where campaign_id is not null;

create index if not exists ghl_location_personalizations_campaign_resolution_idx
  on public.ghl_location_personalizations (
    organization_id, campaign_id, environment, status, current_step
  ) where campaign_id is not null;

create table if not exists public.ghl_campaign_personalization_receipts (
  id uuid primary key default gen_random_uuid(),
  personalization_id uuid not null references public.ghl_location_personalizations(id) on delete restrict,
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  campaign_id uuid not null references public.campaign_plans(id) on delete restrict,
  environment text not null,
  contract_revision bigint not null,
  attempt_number integer not null,
  lease_generation bigint not null,
  step text not null,
  values_fingerprint text not null,
  source_plan_fingerprint text not null,
  destination_contract_fingerprint text not null,
  outcome text not null,
  receipt jsonb not null,
  recorded_at timestamptz not null default timezone('utc', now()),
  constraint ghl_campaign_personalization_receipts_environment_check
    check (environment in ('production', 'sandbox', 'test')),
  constraint ghl_campaign_personalization_receipts_revision_check check (contract_revision > 0),
  constraint ghl_campaign_personalization_receipts_attempt_check check (attempt_number > 0),
  constraint ghl_campaign_personalization_receipts_lease_generation_check check (lease_generation > 0),
  constraint ghl_campaign_personalization_receipts_step_check check (step in ('custom_values', 'forms')),
  constraint ghl_campaign_personalization_receipts_outcome_check
    check (outcome in ('succeeded', 'retryable_failure', 'uncertain', 'operator_action_required')),
  constraint ghl_campaign_personalization_receipts_payload_check check (jsonb_typeof(receipt) = 'object'),
  constraint ghl_campaign_personalization_receipts_fingerprint_check check (
    values_fingerprint ~ '^[a-f0-9]{64}$'
    and source_plan_fingerprint ~ '^[a-f0-9]{64}$'
    and destination_contract_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint ghl_campaign_personalization_receipts_exact_once
    unique (personalization_id, contract_revision, step, lease_generation)
);

alter table public.ghl_campaign_personalization_receipts enable row level security;
alter table public.ghl_campaign_personalization_receipts force row level security;

create or replace function public.ghl_reject_personalization_receipt_mutation_v2()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'GHL campaign personalization receipts are append-only.';
end;
$$;

drop trigger if exists ghl_campaign_personalization_receipts_append_only
  on public.ghl_campaign_personalization_receipts;
create trigger ghl_campaign_personalization_receipts_append_only
before update or delete on public.ghl_campaign_personalization_receipts
for each row execute function public.ghl_reject_personalization_receipt_mutation_v2();

create or replace function public.ghl_default_campaign_custom_value_names_v2()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'campaignId', 'DealFlow Campaign ID',
    'organizationId', 'DealFlow Organization ID',
    'selectedCreativeId', 'DealFlow Selected Creative ID',
    'campaignMode', 'DealFlow Campaign Mode',
    'offer', 'DealFlow Offer',
    'market', 'DealFlow Market',
    'audience', 'DealFlow Audience',
    'propertyType', 'DealFlow Property Type',
    'priceRange', 'DealFlow Price Range',
    'headline', 'DealFlow Headline',
    'primaryText', 'DealFlow Primary Text',
    'cta', 'DealFlow CTA',
    'agentName', 'DealFlow Agent Name',
    'brokerageName', 'DealFlow Brokerage Name',
    'phone', 'DealFlow Agent Phone',
    'language', 'DealFlow Language',
    'themePrimaryColor', 'DealFlow Theme Primary',
    'themeSecondaryColor', 'DealFlow Theme Secondary',
    'themeAccentColor', 'DealFlow Theme Accent',
    'logoUrl', 'DealFlow Logo URL'
  )
$$;

create or replace function public.ghl_campaign_personalization_source_v2(
  p_plan jsonb,
  p_campaign_id uuid,
  p_organization_id uuid
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  onboarding jsonb := p_plan -> 'onboarding_contract';
  campaign_payload jsonb := p_plan -> 'campaign_payload';
  source_value jsonb;
  agent_name_value text;
  selected_ad_id_value text;
  selected_ad_value jsonb;
begin
  if jsonb_typeof(p_plan) <> 'object'
     or jsonb_typeof(onboarding) <> 'object'
     or coalesce(p_plan ->> 'onboarding_contract_version', '') <> '1'
     or onboarding ->> 'businessType' <> 'real_estate_realtor'
     or onboarding ->> 'adDestination' <> 'website' then
    raise exception 'GHL campaign personalization requires the exact realtor website onboarding contract.';
  end if;

  selected_ad_id_value := trim(coalesce(
    p_plan ->> 'selected_ad_id',
    campaign_payload ->> 'selected_ad_id'
  ));
  if selected_ad_id_value = '' or jsonb_typeof(p_plan -> 'staticAds') <> 'array' then
    raise exception 'GHL campaign personalization requires one exact selected primary creative.';
  end if;
  select creative into selected_ad_value
  from jsonb_array_elements(p_plan -> 'staticAds') creative
  where creative ->> 'id' = selected_ad_id_value;
  if selected_ad_value is null
     or nullif(trim(selected_ad_value ->> 'headline'), '') is null
     or nullif(trim(selected_ad_value ->> 'primaryText'), '') is null
     or nullif(trim(selected_ad_value ->> 'cta'), '') is null then
    raise exception 'The selected primary creative is missing exact GHL headline, copy, or CTA fields.';
  end if;

  agent_name_value := trim(concat_ws(' ', onboarding ->> 'agentFirstName', onboarding ->> 'agentLastName'));
  source_value := jsonb_build_object(
    'campaignId', p_campaign_id::text,
    'organizationId', p_organization_id::text,
    'selectedCreativeId', selected_ad_id_value,
    'campaignMode', trim(onboarding ->> 'campaignMode'),
    'offer', trim(onboarding ->> 'offer'),
    'market', trim(onboarding ->> 'market'),
    'audience', trim(onboarding ->> 'audience'),
    'propertyType', trim(onboarding ->> 'propertyType'),
    'priceRange', trim(onboarding ->> 'priceRange'),
    'headline', trim(selected_ad_value ->> 'headline'),
    'primaryText', trim(selected_ad_value ->> 'primaryText'),
    'cta', trim(selected_ad_value ->> 'cta'),
    'agentName', agent_name_value,
    'brokerageName', trim(onboarding ->> 'agentCompanyName'),
    'phone', trim(onboarding ->> 'agentPhone'),
    'language', trim(onboarding ->> 'funnelLanguage'),
    'themePrimaryColor', lower(trim(onboarding ->> 'themePrimaryColor')),
    'themeSecondaryColor', lower(trim(onboarding ->> 'themeSecondaryColor')),
    'themeAccentColor', lower(trim(onboarding ->> 'themeAccentColor')),
    'logoUrl', trim(coalesce(onboarding ->> 'logoUrl', ''))
  );

  if exists (
    select 1 from jsonb_each_text(source_value) field
    where field.key <> 'logoUrl' and nullif(trim(field.value), '') is null
  )
  or length(source_value ->> 'offer') > 500
  or length(source_value ->> 'market') > 160
  or length(source_value ->> 'audience') > 500
  or length(source_value ->> 'headline') > 500
  or length(source_value ->> 'primaryText') > 5000
  or source_value ->> 'language' not in ('en', 'fr', 'es')
  or source_value ->> 'themePrimaryColor' !~ '^#[a-f0-9]{6}$'
  or source_value ->> 'themeSecondaryColor' !~ '^#[a-f0-9]{6}$'
  or source_value ->> 'themeAccentColor' !~ '^#[a-f0-9]{6}$'
  or (
    (source_value ->> 'logoUrl') <> ''
    and (
      (source_value ->> 'logoUrl') !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/|$)'
      or (source_value ->> 'logoUrl') ~ '[@[:space:]]'
    )
  ) then
    raise exception 'Authoritative DealFlow campaign personalization fields are incomplete or invalid.';
  end if;
  return source_value;
end;
$$;

create or replace function public.ghl_campaign_personalization_source_fingerprint_v2(
  p_plan jsonb,
  p_campaign_id uuid,
  p_organization_id uuid
)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  return encode(extensions.digest(convert_to(
    public.ghl_campaign_personalization_source_v2(
      p_plan, p_campaign_id, p_organization_id
    )::text,
    'utf8'
  ), 'sha256'), 'hex');
exception when others then
  return null;
end;
$$;

drop function if exists public.prepare_ghl_location_personalization_v1(uuid, timestamptz);
drop function if exists public.resolve_ghl_ready_destination_v1(uuid, text);

create or replace function public.prepare_ghl_campaign_personalization_v2(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_environment text,
  p_now timestamptz default timezone('utc', now())
)
returns public.ghl_location_personalizations
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_record public.campaign_plans%rowtype;
  run_record public.ghl_provisioning_runs%rowtype;
  mapping_record public.ghl_location_mappings%rowtype;
  manifest_record public.ghl_snapshot_manifests%rowtype;
  result_record public.ghl_location_personalizations%rowtype;
  source_value jsonb;
  base_values jsonb;
  slots_value jsonb;
  slot_value jsonb;
  slot_key_value text;
  custom_value_names jsonb;
  custom_values_value jsonb;
  required_form_ids_value jsonb;
  destination_url_value text;
  source_fingerprint_value text;
  destination_fingerprint_value text;
  values_fingerprint_value text;
begin
  if p_environment not in ('sandbox', 'production') or p_campaign_id is null or p_organization_id is null then
    raise exception 'Invalid GHL campaign personalization scope.';
  end if;

  select * into strict campaign_record
  from public.campaign_plans campaign
  where campaign.id = p_campaign_id
    and campaign.organization_id = p_organization_id
    and campaign.publish_state = 'published'
  for update;
  source_value := public.ghl_campaign_personalization_source_v2(
    campaign_record.plan, p_campaign_id, p_organization_id
  );
  source_fingerprint_value := encode(
    extensions.digest(convert_to(source_value::text, 'utf8'), 'sha256'), 'hex'
  );

  select * into strict run_record
  from public.ghl_provisioning_runs run
  where run.organization_id = p_organization_id
    and run.environment = p_environment
    and run.state = 'ready'
    and run.location_mapping_id is not null
  order by run.ready_at desc nulls last, run.id
  limit 1;
  select * into strict mapping_record
  from public.ghl_location_mappings mapping
  where mapping.id = run_record.location_mapping_id
    and mapping.organization_id = p_organization_id
    and mapping.environment = p_environment
    and mapping.status = 'active'
    and mapping.snapshot_verified_at is not null
    and mapping.required_objects_verified_at is not null
  for update;
  select * into strict manifest_record
  from public.ghl_snapshot_manifests manifest
  where manifest.id = mapping_record.snapshot_manifest_id
    and manifest.id = run_record.snapshot_manifest_id
    and manifest.environment = p_environment
    and manifest.installation_id = mapping_record.installation_id
    and manifest.status = 'approved'
    and manifest.installation_mode = 'preinstalled';

  base_values := manifest_record.personalization_contract -> 'customValues';
  slots_value := manifest_record.personalization_contract -> 'campaignSlots';
  if jsonb_typeof(base_values) <> 'object'
     or exists (
       select 1 from jsonb_each(base_values) entry
       where jsonb_typeof(entry.value) <> 'string'
          or length(trim(entry.key)) = 0
          or length(entry.key) > 120
          or length(entry.value #>> '{}') > 5000
     ) then
    raise exception 'Approved GHL base custom-value contract is invalid.';
  end if;

  select * into result_record
  from public.ghl_location_personalizations personalization
  where personalization.organization_id = p_organization_id
    and personalization.campaign_id = p_campaign_id
    and personalization.environment = p_environment
  for update;

  if jsonb_typeof(slots_value) = 'array' and jsonb_array_length(slots_value) > 0 then
    if jsonb_array_length(slots_value) > 25
       or exists (
         select 1 from jsonb_array_elements(slots_value) slot
         where jsonb_typeof(slot) <> 'object'
            or coalesce(slot ->> 'slotKey', '') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'
            or coalesce(slot ->> 'destinationUrl', '') !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/|$)'
            or coalesce(slot ->> 'destinationUrl', '') ~ '[@[:space:]]'
            or jsonb_typeof(slot -> 'requiredFormIds') <> 'array'
            or jsonb_array_length(slot -> 'requiredFormIds') = 0
            or jsonb_typeof(slot -> 'customValueNames') <> 'object'
            or exists (
              select 1 from jsonb_array_elements(slot -> 'requiredFormIds') form_id
              where jsonb_typeof(form_id) <> 'string'
                 or (form_id #>> '{}') !~ '^[A-Za-z0-9_-]{3,180}$'
            )
            or exists (
              select 1 from jsonb_each_text(public.ghl_default_campaign_custom_value_names_v2()) required_name
              where nullif(trim(slot -> 'customValueNames' ->> required_name.key), '') is null
            )
            or exists (
              select 1 from jsonb_object_keys(slot -> 'customValueNames') provided_name(name)
              where not (public.ghl_default_campaign_custom_value_names_v2() ? provided_name.name)
            )
            or exists (
              select 1 from jsonb_each(slot -> 'customValueNames') custom_name
              where jsonb_typeof(custom_name.value) <> 'string'
                 or length(trim(custom_name.value #>> '{}')) = 0
                 or length(custom_name.value #>> '{}') > 120
            )
       )
       or exists (
         select 1
         from (
           select slot ->> 'slotKey' value
           from jsonb_array_elements(slots_value) slot
           group by slot ->> 'slotKey' having count(*) > 1
           union all
           select slot ->> 'destinationUrl' value
           from jsonb_array_elements(slots_value) slot
           group by slot ->> 'destinationUrl' having count(*) > 1
           union all
           select lower(trim(custom_name.value)) value
           from jsonb_array_elements(slots_value) slot
           cross join lateral jsonb_each_text(slot -> 'customValueNames') custom_name
           group by lower(trim(custom_name.value)) having count(*) > 1
           union all
           select lower(trim(form_id #>> '{}')) value
           from jsonb_array_elements(slots_value) slot
           cross join lateral jsonb_array_elements(slot -> 'requiredFormIds') form_id
           group by lower(trim(form_id #>> '{}')) having count(*) > 1
           union all
           select lower(trim(base_name.key)) value
           from jsonb_object_keys(base_values) base_name(key)
           where exists (
             select 1
             from jsonb_array_elements(slots_value) slot
             cross join lateral jsonb_each_text(slot -> 'customValueNames') custom_name
             where lower(trim(custom_name.value)) = lower(trim(base_name.key))
           )
         ) duplicate_contract
       ) then
      raise exception 'Approved GHL campaign-slot contract is invalid or cross-campaign mutable.';
    end if;

    if result_record.id is not null then
      select slot into slot_value
      from jsonb_array_elements(slots_value) slot
      where slot ->> 'slotKey' = result_record.slot_key;
      if slot_value is null then
        raise exception 'The assigned GHL campaign slot is no longer present in the approved manifest.';
      end if;
    else
      select slot into slot_value
      from jsonb_array_elements(slots_value) with ordinality candidate(slot, ordinal)
      where not exists (
        select 1 from public.ghl_location_personalizations occupied
        where occupied.location_mapping_id = mapping_record.id
          and occupied.campaign_id is not null
          and occupied.slot_key = candidate.slot ->> 'slotKey'
      )
      order by ordinal
      limit 1;
      if slot_value is null then
        raise exception 'GHL campaign personalization slot capacity is exhausted.';
      end if;
    end if;
    slot_key_value := slot_value ->> 'slotKey';
    destination_url_value := trim(slot_value ->> 'destinationUrl');
    required_form_ids_value := slot_value -> 'requiredFormIds';
    custom_value_names := slot_value -> 'customValueNames';
  else
    -- Backwards-compatible single campaign only. A second campaign is blocked
    -- instead of overwriting location-global custom values.
    if result_record.id is null and exists (
      select 1 from public.ghl_location_personalizations occupied
      where occupied.location_mapping_id = mapping_record.id
        and occupied.campaign_id is not null
    ) then
      raise exception 'The legacy GHL manifest supports exactly one campaign; add non-overlapping campaignSlots.';
    end if;
    slot_key_value := 'legacy-default';
    destination_url_value := trim(manifest_record.personalization_contract ->> 'destinationUrl');
    required_form_ids_value := manifest_record.personalization_contract -> 'requiredFormIds';
    custom_value_names := public.ghl_default_campaign_custom_value_names_v2();
  end if;

  if destination_url_value !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/|$)'
     or destination_url_value ~ '[@[:space:]]'
     or jsonb_typeof(required_form_ids_value) <> 'array'
     or jsonb_array_length(required_form_ids_value) = 0
     or jsonb_typeof(custom_value_names) <> 'object'
     or exists (
       select 1 from jsonb_array_elements(required_form_ids_value) form_id
       where jsonb_typeof(form_id) <> 'string'
          or (form_id #>> '{}') !~ '^[A-Za-z0-9_-]{3,180}$'
     ) then
    raise exception 'The selected GHL campaign destination contract is invalid.';
  end if;
  select coalesce(jsonb_object_agg(trim(custom_value_names ->> source_field.key), source_field.value), '{}'::jsonb)
  into custom_values_value
  from jsonb_each_text(source_value) source_field;
  custom_values_value := base_values || custom_values_value;
  if (select count(*) from jsonb_object_keys(custom_values_value)) = 0
     or (select count(*) from jsonb_object_keys(custom_values_value)) > 50
     or exists (
       select 1 from jsonb_each(custom_values_value) entry
       where jsonb_typeof(entry.value) <> 'string'
          or length(trim(entry.key)) = 0
          or length(entry.key) > 120
          or length(entry.value #>> '{}') > 5000
     ) then
    raise exception 'The derived GHL campaign custom values exceed the supported contract.';
  end if;

  destination_fingerprint_value := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'manifestId', manifest_record.id,
      'slotKey', slot_key_value,
      'destinationUrl', destination_url_value,
      'requiredFormIds', required_form_ids_value,
      'customValueNames', custom_value_names
    )::text,
    'utf8'
  ), 'sha256'), 'hex');
  values_fingerprint_value := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'organizationId', p_organization_id,
      'campaignId', p_campaign_id,
      'environment', p_environment,
      'mappingId', mapping_record.id,
      'sourcePlanFingerprint', source_fingerprint_value,
      'destinationContractFingerprint', destination_fingerprint_value,
      'customValues', custom_values_value
    )::text,
    'utf8'
  ), 'sha256'), 'hex');

  if result_record.id is null then
    insert into public.ghl_location_personalizations (
      organization_id, campaign_id, location_mapping_id, environment, slot_key,
      custom_values, required_form_ids, destination_url, status, current_step,
      values_fingerprint, source_plan_fingerprint, destination_contract_fingerprint,
      contract_revision, created_at, updated_at
    ) values (
      p_organization_id, p_campaign_id, mapping_record.id, p_environment, slot_key_value,
      custom_values_value, required_form_ids_value, destination_url_value, 'pending', 'custom_values',
      values_fingerprint_value, source_fingerprint_value, destination_fingerprint_value,
      1, p_now, p_now
    ) returning * into strict result_record;
  elsif result_record.organization_id is distinct from p_organization_id
     or result_record.environment is distinct from p_environment
     or result_record.location_mapping_id is distinct from mapping_record.id
     or result_record.slot_key is distinct from slot_key_value then
    raise exception 'GHL campaign personalization crossed an immutable tenant, environment, or slot boundary.';
  elsif result_record.destination_contract_fingerprint is distinct from destination_fingerprint_value then
    raise exception 'The assigned GHL campaign slot wiring changed; reconcile the preinstalled snapshot before reuse.';
  elsif result_record.values_fingerprint = values_fingerprint_value then
    return result_record;
  elsif result_record.status = 'applying' then
    raise exception 'GHL campaign personalization is in flight and must settle before contract replacement.';
  else
    update public.ghl_location_personalizations personalization set
      custom_values = custom_values_value,
      required_form_ids = required_form_ids_value,
      destination_url = destination_url_value,
      status = 'pending',
      current_step = 'custom_values',
      values_fingerprint = values_fingerprint_value,
      source_plan_fingerprint = source_fingerprint_value,
      destination_contract_fingerprint = destination_fingerprint_value,
      contract_revision = personalization.contract_revision + 1,
      attempt_count = 0,
      custom_value_receipt = null,
      form_verification_receipt = null,
      locked_by = null,
      locked_until = null,
      lease_token = null,
      next_retry_at = null,
      applied_at = null,
      verified_at = null,
      last_error_code = null,
      updated_at = p_now
    where personalization.id = result_record.id
    returning * into strict result_record;
  end if;
  return result_record;
end;
$$;

create or replace function public.claim_next_ghl_location_personalization_v1(
  p_environment text,
  p_worker_id text,
  p_now timestamptz default timezone('utc', now()),
  p_lease_ms integer default 300000
)
returns setof public.ghl_location_personalizations
language plpgsql
security definer
set search_path = public
as $$
declare claimed_id uuid;
begin
  if p_environment not in ('production', 'sandbox') or nullif(trim(p_worker_id), '') is null then
    raise exception 'Invalid GHL personalization worker authority.';
  end if;
  if not exists (
    select 1 from public.ghl_runtime_controls
    where environment = p_environment and provisioning_writes_enabled
  ) then
    raise exception 'GHL personalization database kill switch is closed.';
  end if;
  -- An expired provider-effect lease is ambiguous. Never silently replay it:
  -- preserve the exact contract and require the fenced reconciliation RPC.
  update public.ghl_location_personalizations personalization set
    status = 'uncertain',
    last_error_code = 'ghl_campaign_personalization_lease_expired_uncertain',
    locked_by = null,
    locked_until = null,
    lease_token = null,
    next_retry_at = null,
    updated_at = p_now
  where personalization.environment = p_environment
    and personalization.campaign_id is not null
    and personalization.status = 'applying'
    and personalization.locked_until <= p_now;
  update public.ghl_location_personalizations personalization set
    status = 'operator_action_required',
    last_error_code = 'ghl_campaign_personalization_attempts_exhausted',
    next_retry_at = null,
    updated_at = p_now
  where personalization.environment = p_environment
    and personalization.campaign_id is not null
    and personalization.status = 'pending'
    and personalization.attempt_count >= personalization.max_attempts;
  with candidate as (
    select personalization.id
    from public.ghl_location_personalizations personalization
    join public.campaign_plans campaign
      on campaign.id = personalization.campaign_id
     and campaign.organization_id = personalization.organization_id
     and campaign.publish_state = 'published'
    join public.ghl_location_mappings mapping
      on mapping.id = personalization.location_mapping_id
     and mapping.organization_id = personalization.organization_id
     and mapping.environment = personalization.environment
     and mapping.status = 'active'
    where personalization.environment = p_environment
      and personalization.campaign_id is not null
      and personalization.status = 'pending'
      and personalization.attempt_count < personalization.max_attempts
      and personalization.source_plan_fingerprint = public.ghl_campaign_personalization_source_fingerprint_v2(
        campaign.plan, campaign.id, campaign.organization_id
      )
      and (personalization.next_retry_at is null or personalization.next_retry_at <= p_now)
      and (personalization.locked_until is null or personalization.locked_until <= p_now)
    order by personalization.created_at, personalization.id
    for update of personalization skip locked
    limit 1
  )
  update public.ghl_location_personalizations personalization set
    status = 'applying',
    locked_by = trim(p_worker_id),
    locked_until = p_now + (least(greatest(p_lease_ms, 1000), 3600000)::text || ' milliseconds')::interval,
    lease_token = gen_random_uuid(),
    lease_generation = personalization.lease_generation + 1,
    attempt_count = personalization.attempt_count + 1,
    updated_at = p_now
  from candidate
  where personalization.id = candidate.id
  returning personalization.id into claimed_id;
  if claimed_id is null then return; end if;
  return query select * from public.ghl_location_personalizations where id = claimed_id;
end;
$$;

create or replace function public.settle_ghl_location_personalization_v1(
  p_personalization_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_outcome text,
  p_receipt jsonb,
  p_error_code text,
  p_next_retry_at timestamptz,
  p_now timestamptz default timezone('utc', now())
)
returns public.ghl_location_personalizations
language plpgsql
security definer
set search_path = public
as $$
declare current_record public.ghl_location_personalizations%rowtype;
declare result_record public.ghl_location_personalizations%rowtype;
declare campaign_record public.campaign_plans%rowtype;
declare effective_outcome text := p_outcome;
declare effective_error_code text := p_error_code;
begin
  if p_outcome not in ('succeeded', 'retryable_failure', 'uncertain', 'operator_action_required')
     or jsonb_typeof(coalesce(p_receipt, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid GHL personalization settlement.';
  end if;
  select * into strict current_record from public.ghl_location_personalizations
  where id = p_personalization_id for update;
  if current_record.campaign_id is null
     or current_record.status <> 'applying'
     or current_record.locked_by is distinct from p_worker_id
     or current_record.lease_token is distinct from p_lease_token
     or current_record.lease_generation is distinct from p_lease_generation
     or current_record.locked_until <= p_now then
    raise exception 'GHL personalization lease expired or was superseded.';
  end if;
  select * into strict campaign_record from public.campaign_plans
  where id = current_record.campaign_id
    and organization_id = current_record.organization_id;
  if current_record.source_plan_fingerprint is distinct from public.ghl_campaign_personalization_source_fingerprint_v2(
    campaign_record.plan, campaign_record.id, campaign_record.organization_id
  ) or campaign_record.publish_state is distinct from 'published' then
    effective_outcome := 'operator_action_required';
    effective_error_code := 'ghl_campaign_plan_changed_during_provider_effect';
  elsif effective_outcome = 'retryable_failure'
     and current_record.attempt_count >= current_record.max_attempts then
    effective_outcome := 'operator_action_required';
    effective_error_code := 'ghl_campaign_personalization_attempts_exhausted';
  end if;

  insert into public.ghl_campaign_personalization_receipts (
    personalization_id, organization_id, campaign_id, environment,
    contract_revision, attempt_number, lease_generation, step, values_fingerprint, source_plan_fingerprint,
    destination_contract_fingerprint, outcome, receipt, recorded_at
  ) values (
    current_record.id, current_record.organization_id, current_record.campaign_id, current_record.environment,
    current_record.contract_revision, current_record.attempt_count, current_record.lease_generation,
    current_record.current_step, current_record.values_fingerprint,
    current_record.source_plan_fingerprint, current_record.destination_contract_fingerprint,
    effective_outcome, coalesce(p_receipt, '{}'::jsonb), p_now
  ) on conflict (personalization_id, contract_revision, step, lease_generation) do nothing;

  update public.ghl_location_personalizations set
    custom_value_receipt = case when current_record.current_step = 'custom_values' then p_receipt else custom_value_receipt end,
    form_verification_receipt = case when current_record.current_step = 'forms' then p_receipt else form_verification_receipt end,
    current_step = case
      when effective_outcome = 'succeeded' and current_record.current_step = 'custom_values' then 'forms'
      when effective_outcome = 'succeeded' and current_record.current_step = 'forms' then 'ready'
      else current_record.current_step
    end,
    status = case
      when effective_outcome = 'succeeded' and current_record.current_step = 'forms' then 'ready'
      when effective_outcome in ('succeeded', 'retryable_failure') then 'pending'
      else effective_outcome
    end,
    applied_at = case when effective_outcome = 'succeeded' and current_record.current_step = 'custom_values' then p_now else applied_at end,
    verified_at = case when effective_outcome = 'succeeded' and current_record.current_step = 'forms' then p_now else verified_at end,
    last_error_code = case when effective_outcome = 'succeeded' then null else effective_error_code end,
    next_retry_at = case when effective_outcome = 'retryable_failure' then p_next_retry_at else null end,
    locked_by = null,
    locked_until = null,
    lease_token = null,
    updated_at = p_now
  where id = current_record.id
  returning * into strict result_record;
  return result_record;
end;
$$;

create or replace function public.requeue_ghl_campaign_personalization_v2(
  p_personalization_id uuid,
  p_expected_values_fingerprint text,
  p_now timestamptz default timezone('utc', now())
)
returns public.ghl_location_personalizations
language plpgsql
security definer
set search_path = public
as $$
declare result_record public.ghl_location_personalizations%rowtype;
begin
  update public.ghl_location_personalizations personalization set
    status = 'pending',
    attempt_count = 0,
    next_retry_at = null,
    last_error_code = null,
    locked_by = null,
    locked_until = null,
    lease_token = null,
    updated_at = p_now
  where personalization.id = p_personalization_id
    and personalization.campaign_id is not null
    and personalization.values_fingerprint = p_expected_values_fingerprint
    and personalization.status in ('uncertain', 'operator_action_required')
    and personalization.locked_by is null
    and personalization.lease_token is null
    and exists (
      select 1 from public.campaign_plans campaign
      where campaign.id = personalization.campaign_id
        and campaign.organization_id = personalization.organization_id
        and personalization.source_plan_fingerprint = public.ghl_campaign_personalization_source_fingerprint_v2(
          campaign.plan, campaign.id, campaign.organization_id
        )
    )
  returning * into result_record;
  if result_record.id is null then
    raise exception 'GHL campaign personalization reconciliation identity changed or is not requeueable.';
  end if;
  return result_record;
end;
$$;

create or replace function public.resolve_ghl_ready_campaign_destination_v2(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_environment text
)
returns table(
  personalization_id uuid,
  campaign_id uuid,
  location_mapping_id uuid,
  slot_key text,
  destination_url text,
  destination_contract_fingerprint text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    personalization.id,
    personalization.campaign_id,
    personalization.location_mapping_id,
    personalization.slot_key,
    personalization.destination_url,
    personalization.destination_contract_fingerprint
  from public.ghl_location_personalizations personalization
  join public.campaign_plans campaign
    on campaign.id = personalization.campaign_id
   and campaign.organization_id = personalization.organization_id
  join public.ghl_location_mappings mapping
    on mapping.id = personalization.location_mapping_id
   and mapping.organization_id = personalization.organization_id
   and mapping.environment = personalization.environment
  join public.ghl_provisioning_runs run
    on run.organization_id = personalization.organization_id
   and run.environment = personalization.environment
   and run.location_mapping_id = personalization.location_mapping_id
   and run.snapshot_manifest_id = mapping.snapshot_manifest_id
   and run.state = 'ready'
  where personalization.organization_id = p_organization_id
    and personalization.campaign_id = p_campaign_id
    and personalization.environment = p_environment
    and campaign.publish_state = 'published'
    and personalization.status = 'ready'
    and personalization.current_step = 'ready'
    and personalization.verified_at is not null
    and mapping.status = 'active'
    and personalization.source_plan_fingerprint = public.ghl_campaign_personalization_source_fingerprint_v2(
      campaign.plan, campaign.id, campaign.organization_id
    )
  limit 1
$$;

revoke all on table public.ghl_location_personalizations from anon, authenticated, service_role;
grant select on table public.ghl_location_personalizations to service_role;
revoke all on table public.ghl_campaign_personalization_receipts from anon, authenticated, service_role;
grant select on table public.ghl_campaign_personalization_receipts to service_role;

revoke all on function public.ghl_reject_personalization_receipt_mutation_v2() from public, anon, authenticated;
revoke all on function public.ghl_default_campaign_custom_value_names_v2() from public, anon, authenticated;
grant execute on function public.ghl_default_campaign_custom_value_names_v2() to service_role;
revoke all on function public.ghl_campaign_personalization_source_v2(jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ghl_campaign_personalization_source_v2(jsonb, uuid, uuid) to service_role;
revoke all on function public.ghl_campaign_personalization_source_fingerprint_v2(jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ghl_campaign_personalization_source_fingerprint_v2(jsonb, uuid, uuid) to service_role;
revoke all on function public.prepare_ghl_campaign_personalization_v2(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.prepare_ghl_campaign_personalization_v2(uuid, uuid, text, timestamptz) to service_role;
revoke all on function public.claim_next_ghl_location_personalization_v1(text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_next_ghl_location_personalization_v1(text, text, timestamptz, integer) to service_role;
revoke all on function public.settle_ghl_location_personalization_v1(uuid, text, uuid, bigint, text, jsonb, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.settle_ghl_location_personalization_v1(uuid, text, uuid, bigint, text, jsonb, text, timestamptz, timestamptz) to service_role;
revoke all on function public.requeue_ghl_campaign_personalization_v2(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.requeue_ghl_campaign_personalization_v2(uuid, text, timestamptz) to service_role;
revoke all on function public.resolve_ghl_ready_campaign_destination_v2(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_ghl_ready_campaign_destination_v2(uuid, uuid, text) to service_role;
