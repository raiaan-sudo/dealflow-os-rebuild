-- Native GHL form submissions are reconciled from signed contact lifecycle
-- receipts through bounded, read-only provider reads. A signed ContactCreate
-- or ContactUpdate never claims a form identity by itself.

alter table public.ghl_runtime_controls
  add column if not exists inbound_form_reconciliation_enabled boolean not null default false;

alter table public.ghl_location_mappings
  add column if not exists forms_readonly_credential_ref text null,
  add column if not exists forms_readonly_capabilities jsonb null,
  add column if not exists forms_readonly_scope_attested_at timestamptz null,
  add column if not exists retired_at timestamptz null,
  add column if not exists retirement_reason text null,
  add column if not exists retired_by text null;

alter table public.ghl_location_mappings
  drop constraint if exists ghl_location_mappings_forms_readonly_authority_check,
  add constraint ghl_location_mappings_forms_readonly_authority_check check (
    (
      forms_readonly_credential_ref is null
      and forms_readonly_capabilities is null
      and forms_readonly_scope_attested_at is null
    )
    or (
      forms_readonly_credential_ref ~ '^env:[A-Z][A-Z0-9_]{2,127}$'
      and jsonb_typeof(forms_readonly_capabilities) = 'array'
      and forms_readonly_capabilities @> '["forms.readonly"]'::jsonb
      and forms_readonly_scope_attested_at is not null
    )
  );

alter table public.ghl_location_mappings
  drop constraint if exists ghl_location_mappings_retirement_check,
  add constraint ghl_location_mappings_retirement_check check (
    (
      retired_at is null and retirement_reason is null and retired_by is null
    ) or (
      status = 'inactive'
      and retired_at is not null
      and length(trim(retirement_reason)) between 3 and 500
      and retired_by ~ '^[A-Za-z0-9@._:-]{3,180}$'
    )
  );

-- Preserve the original hierarchy rules while allowing one explicit,
-- transaction-local retirement transition. Direct active->inactive updates
-- remain forbidden whenever a historical READY run exists.
create or replace function public.enforce_ghl_location_hierarchy()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  tenant_record public.ghl_workspace_tenants%rowtype;
  installation_record public.ghl_installations%rowtype;
  retirement_authority text := current_setting('dealflow.ghl_retirement_mapping_id', true);
begin
  if tg_op = 'UPDATE' and (
    old.organization_id is distinct from new.organization_id
    or old.partner_id is distinct from new.partner_id
    or old.installation_id is distinct from new.installation_id
    or old.environment is distinct from new.environment
    or old.provider_location_id is distinct from new.provider_location_id
    or old.provisioning_owner is distinct from new.provisioning_owner
    or old.snapshot_manifest_id is distinct from new.snapshot_manifest_id
  ) then
    raise exception 'GHL mapping identity is immutable; retire it and create a reconciled replacement.';
  end if;
  select * into strict tenant_record
  from public.ghl_workspace_tenants where organization_id = new.organization_id;
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

comment on column public.ghl_location_mappings.forms_readonly_credential_ref is
  'Reference to a location-scoped credential with forms.readonly. Plaintext credentials are forbidden.';

alter table public.ghl_location_personalizations
  add column if not exists inbound_sms_consent_field_id text null,
  add column if not exists inbound_sms_consent_policy_version text null,
  add column if not exists inbound_sms_consent_copy text null,
  add column if not exists inbound_advertising_consent_field_id text null,
  add column if not exists inbound_advertising_consent_policy_version text null,
  add column if not exists inbound_question_contract_version text null,
  add column if not exists inbound_question_contract jsonb not null default '[]'::jsonb,
  add column if not exists inbound_consent_contract_fingerprint text null;

alter table public.ghl_location_personalizations
  drop constraint if exists ghl_location_personalizations_inbound_consent_check,
  add constraint ghl_location_personalizations_inbound_consent_check check (
    (
      inbound_sms_consent_field_id is null
      and inbound_sms_consent_policy_version is null
      and inbound_sms_consent_copy is null
      or (
        inbound_sms_consent_field_id ~ '^[A-Za-z0-9_-]{3,180}$'
        and inbound_sms_consent_policy_version ~ '^[A-Za-z0-9._:-]{1,100}$'
        and length(trim(inbound_sms_consent_copy)) between 1 and 1000
      )
    )
    and (
      inbound_advertising_consent_field_id is null
      and inbound_advertising_consent_policy_version is null
      or (
        inbound_advertising_consent_field_id ~ '^[A-Za-z0-9_-]{3,180}$'
        and inbound_advertising_consent_policy_version ~ '^[A-Za-z0-9._:-]{1,100}$'
      )
    )
    and (
      inbound_sms_consent_field_id is null
      or inbound_advertising_consent_field_id is null
      or inbound_sms_consent_field_id <> inbound_advertising_consent_field_id
    )
    and jsonb_typeof(inbound_question_contract) = 'array'
    and jsonb_array_length(inbound_question_contract) <= 3
    and (
      (jsonb_array_length(inbound_question_contract) = 0 and inbound_question_contract_version is null)
      or inbound_question_contract_version ~ '^[A-Za-z0-9._:-]{1,100}$'
    )
    and inbound_consent_contract_fingerprint ~ '^[a-f0-9]{64}$'
  );

create or replace function private.ghl_campaign_lead_questions_v1(p_plan jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $$
declare
  raw_questions jsonb;
  normalized_questions jsonb;
begin
  raw_questions := case
    when jsonb_typeof(p_plan -> 'lead_form_questions') = 'array'
      then p_plan -> 'lead_form_questions'
    when jsonb_typeof(p_plan #> '{funnel,customLeadFormQuestions}') = 'array'
      then p_plan #> '{funnel,customLeadFormQuestions}'
    else '[]'::jsonb
  end;
  if jsonb_array_length(raw_questions) > 3
     or exists (
       select 1 from jsonb_array_elements(raw_questions) question
       where jsonb_typeof(question) <> 'string'
          or length(trim(question #>> '{}')) not between 1 and 240
     ) then
    return null;
  end if;
  select coalesce(
    jsonb_agg(to_jsonb(trim(question)) order by ordinal),
    '[]'::jsonb
  ) into normalized_questions
  from jsonb_array_elements_text(raw_questions) with ordinality source(question, ordinal);
  return normalized_questions;
exception when others then
  return null;
end;
$$;

create or replace function private.sync_ghl_inbound_consent_contract_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  mapping_record public.ghl_location_mappings%rowtype;
  manifest_record public.ghl_snapshot_manifests%rowtype;
  contract_value jsonb;
  sms_field text;
  sms_policy text;
  sms_copy text;
  advertising_field text;
  advertising_policy text;
  question_contract jsonb;
  question_contract_version text;
  campaign_questions jsonb;
begin
  if new.campaign_id is null then
    new.inbound_sms_consent_field_id := null;
    new.inbound_sms_consent_policy_version := null;
    new.inbound_sms_consent_copy := null;
    new.inbound_advertising_consent_field_id := null;
    new.inbound_advertising_consent_policy_version := null;
    new.inbound_question_contract_version := null;
    new.inbound_question_contract := '[]'::jsonb;
    new.inbound_consent_contract_fingerprint := encode(
      extensions.digest(convert_to('legacy-unroutable', 'utf8'), 'sha256'), 'hex'
    );
    return new;
  end if;

  select * into strict mapping_record
  from public.ghl_location_mappings mapping
  where mapping.id = new.location_mapping_id
    and mapping.organization_id = new.organization_id
    and mapping.environment = new.environment;

  select * into strict manifest_record
  from public.ghl_snapshot_manifests manifest
  where manifest.id = mapping_record.snapshot_manifest_id
    and manifest.installation_id = mapping_record.installation_id
    and manifest.environment = new.environment
    and manifest.status = 'approved';

  if new.slot_key = 'legacy-default' then
    contract_value := manifest_record.personalization_contract;
  else
    select slot into contract_value
    from jsonb_array_elements(manifest_record.personalization_contract -> 'campaignSlots') slot
    where slot ->> 'slotKey' = new.slot_key;
  end if;
  if contract_value is null or jsonb_typeof(contract_value) <> 'object' then
    raise exception 'ghl_inbound_consent_contract_missing';
  end if;

  sms_field := nullif(trim(contract_value ->> 'inboundSmsConsentFieldId'), '');
  sms_policy := nullif(trim(contract_value ->> 'inboundSmsConsentPolicyVersion'), '');
  sms_copy := nullif(trim(contract_value ->> 'inboundSmsConsentCopy'), '');
  advertising_field := nullif(trim(contract_value ->> 'inboundAdvertisingConsentFieldId'), '');
  advertising_policy := nullif(trim(contract_value ->> 'inboundAdvertisingConsentPolicyVersion'), '');
  question_contract := coalesce(contract_value -> 'inboundQuestionMappings', '[]'::jsonb);
  question_contract_version := nullif(trim(contract_value ->> 'inboundQuestionContractVersion'), '');

  select private.ghl_campaign_lead_questions_v1(campaign.plan)
  into campaign_questions
  from public.campaign_plans campaign
  where campaign.id = new.campaign_id
    and campaign.organization_id = new.organization_id;

  if ((sms_field is null)::integer + (sms_policy is null)::integer + (sms_copy is null)::integer) not in (0, 3)
     or (advertising_field is null) <> (advertising_policy is null)
     or (sms_field is not null and sms_field !~ '^[A-Za-z0-9_-]{3,180}$')
     or (sms_policy is not null and sms_policy !~ '^[A-Za-z0-9._:-]{1,100}$')
     or (sms_copy is not null and length(sms_copy) > 1000)
     or (advertising_field is not null and advertising_field !~ '^[A-Za-z0-9_-]{3,180}$')
     or (advertising_policy is not null and advertising_policy !~ '^[A-Za-z0-9._:-]{1,100}$')
     or (sms_field is not null and sms_field = advertising_field)
     or jsonb_typeof(question_contract) <> 'array'
     or jsonb_array_length(question_contract) > 3
     or ((jsonb_array_length(question_contract) = 0) <> (question_contract_version is null))
     or (question_contract_version is not null and question_contract_version !~ '^[A-Za-z0-9._:-]{1,100}$')
     or jsonb_typeof(campaign_questions) <> 'array'
     or jsonb_array_length(campaign_questions) > 3
     or jsonb_array_length(question_contract) <> jsonb_array_length(campaign_questions)
     or exists (
       select 1 from jsonb_array_elements(question_contract) mapping
       where jsonb_typeof(mapping) <> 'object'
          or coalesce(mapping ->> 'fieldId', '') !~ '^[A-Za-z0-9_-]{3,180}$'
          or length(trim(coalesce(mapping ->> 'question', ''))) = 0
          or length(mapping ->> 'question') > 240
          or not exists (
            select 1 from jsonb_array_elements_text(campaign_questions) question
            where trim(question) = trim(mapping ->> 'question')
          )
     )
     or exists (
       select 1 from jsonb_array_elements_text(campaign_questions) question
       where length(trim(question)) = 0 or length(question) > 240
          or (select count(*) from jsonb_array_elements(question_contract) mapping
              where trim(mapping ->> 'question') = trim(question)) <> 1
     )
     or exists (
       select 1 from jsonb_array_elements(question_contract) mapping
       group by mapping ->> 'fieldId' having count(*) > 1
     ) then
    raise exception 'ghl_inbound_consent_contract_invalid';
  end if;

  if sms_field is not null and not exists (
    select 1 from jsonb_array_elements(manifest_record.required_objects) required_object
    where required_object ->> 'kind' = 'custom_field'
      and required_object ->> 'providerObjectId' = sms_field
  ) then
    raise exception 'ghl_inbound_sms_consent_field_unverified';
  end if;
  if advertising_field is not null and not exists (
    select 1 from jsonb_array_elements(manifest_record.required_objects) required_object
    where required_object ->> 'kind' = 'custom_field'
      and required_object ->> 'providerObjectId' = advertising_field
  ) then
    raise exception 'ghl_inbound_advertising_consent_field_unverified';
  end if;
  if exists (
    select 1 from jsonb_array_elements(question_contract) mapping
    where not exists (
      select 1 from jsonb_array_elements(manifest_record.required_objects) required_object
      where required_object ->> 'kind' = 'custom_field'
        and required_object ->> 'providerObjectId' = mapping ->> 'fieldId'
    )
  ) then
    raise exception 'ghl_inbound_question_field_unverified';
  end if;

  new.inbound_sms_consent_field_id := sms_field;
  new.inbound_sms_consent_policy_version := sms_policy;
  new.inbound_sms_consent_copy := sms_copy;
  new.inbound_advertising_consent_field_id := advertising_field;
  new.inbound_advertising_consent_policy_version := advertising_policy;
  new.inbound_question_contract_version := question_contract_version;
  new.inbound_question_contract := question_contract;
  new.inbound_consent_contract_fingerprint := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'manifestId', manifest_record.id,
      'slotKey', new.slot_key,
      'smsFieldId', sms_field,
      'smsPolicyVersion', sms_policy,
      'smsConsentCopy', sms_copy,
      'advertisingFieldId', advertising_field,
      'advertisingPolicyVersion', advertising_policy,
      'questionContractVersion', question_contract_version,
      'questionMappings', question_contract,
      'campaignQuestions', campaign_questions
    )::text,
    'utf8'
  ), 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists sync_ghl_inbound_consent_contract on public.ghl_location_personalizations;
create trigger sync_ghl_inbound_consent_contract
before insert or update of location_mapping_id, organization_id, campaign_id, environment, slot_key,
  source_plan_fingerprint, destination_contract_fingerprint, contract_revision
on public.ghl_location_personalizations
for each row execute function private.sync_ghl_inbound_consent_contract_v1();

update public.ghl_location_personalizations
set slot_key = slot_key
where campaign_id is not null;

create or replace function public.enforce_ghl_snapshot_manifest_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (
    old.environment is distinct from new.environment
    or old.snapshot_key is distinct from new.snapshot_key
    or old.snapshot_version is distinct from new.snapshot_version
    or old.provider_snapshot_id is distinct from new.provider_snapshot_id
    or old.required_objects is distinct from new.required_objects
    or old.installation_id is distinct from new.installation_id
    or old.installation_mode is distinct from new.installation_mode
    or old.personalization_contract is distinct from new.personalization_contract
  ) and exists (
    select 1 from public.ghl_provisioning_runs run_record
    where run_record.snapshot_manifest_id = old.id
  ) then
    raise exception 'A referenced GHL snapshot manifest is immutable; create a new version.';
  end if;
  return new;
end;
$$;

create or replace function private.current_ghl_inbound_contract_fingerprint_v1(
  p_personalization_id uuid
)
returns text
language plpgsql
security definer
stable
set search_path = pg_catalog, public, extensions
as $$
declare
  personalization_record public.ghl_location_personalizations%rowtype;
  mapping_record public.ghl_location_mappings%rowtype;
  manifest_record public.ghl_snapshot_manifests%rowtype;
  contract_value jsonb;
  campaign_questions jsonb;
begin
  select * into strict personalization_record
  from public.ghl_location_personalizations where id = p_personalization_id;
  select * into strict mapping_record
  from public.ghl_location_mappings
  where id = personalization_record.location_mapping_id
    and organization_id = personalization_record.organization_id
    and environment = personalization_record.environment;
  select * into strict manifest_record
  from public.ghl_snapshot_manifests
  where id = mapping_record.snapshot_manifest_id
    and installation_id = mapping_record.installation_id
    and environment = personalization_record.environment
    and status = 'approved';
  if personalization_record.slot_key = 'legacy-default' then
    contract_value := manifest_record.personalization_contract;
  else
    select slot into contract_value
    from jsonb_array_elements(manifest_record.personalization_contract -> 'campaignSlots') slot
    where slot ->> 'slotKey' = personalization_record.slot_key;
  end if;
  if contract_value is null or jsonb_typeof(contract_value) <> 'object' then return null; end if;
  select private.ghl_campaign_lead_questions_v1(campaign.plan)
  into campaign_questions
  from public.campaign_plans campaign
  where campaign.id = personalization_record.campaign_id
    and campaign.organization_id = personalization_record.organization_id;
  if campaign_questions is null then return null; end if;
  return encode(extensions.digest(convert_to(jsonb_build_object(
    'manifestId', manifest_record.id,
    'slotKey', personalization_record.slot_key,
    'smsFieldId', nullif(trim(contract_value ->> 'inboundSmsConsentFieldId'), ''),
    'smsPolicyVersion', nullif(trim(contract_value ->> 'inboundSmsConsentPolicyVersion'), ''),
    'smsConsentCopy', nullif(trim(contract_value ->> 'inboundSmsConsentCopy'), ''),
    'advertisingFieldId', nullif(trim(contract_value ->> 'inboundAdvertisingConsentFieldId'), ''),
    'advertisingPolicyVersion', nullif(trim(contract_value ->> 'inboundAdvertisingConsentPolicyVersion'), ''),
    'questionContractVersion', nullif(trim(contract_value ->> 'inboundQuestionContractVersion'), ''),
    'questionMappings', coalesce(contract_value -> 'inboundQuestionMappings', '[]'::jsonb),
    'campaignQuestions', campaign_questions
  )::text, 'utf8'), 'sha256'), 'hex');
exception when others then
  return null;
end;
$$;

create or replace function private.invalidate_ghl_personalization_on_question_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if private.ghl_campaign_lead_questions_v1(old.plan) is distinct from
     private.ghl_campaign_lead_questions_v1(new.plan) then
    if exists (
      select 1 from public.ghl_location_personalizations personalization
      where personalization.campaign_id = new.id
        and personalization.organization_id = new.organization_id
        and personalization.status = 'applying'
    ) then
      raise exception 'ghl_inbound_campaign_question_change_blocked_by_inflight_personalization';
    end if;
    update public.ghl_location_personalizations personalization set
      status = 'operator_action_required',
      current_step = 'forms',
      values_fingerprint = encode(extensions.digest(convert_to(
        personalization.values_fingerprint || '|question-contract-change|' ||
        coalesce(private.ghl_campaign_lead_questions_v1(new.plan)::text, 'invalid'),
        'utf8'
      ), 'sha256'), 'hex'),
      last_error_code = 'ghl_inbound_campaign_question_contract_changed',
      locked_by = null,
      locked_until = null,
      lease_token = null,
      next_retry_at = null,
      updated_at = timezone('utc', now())
    where personalization.campaign_id = new.id
      and personalization.organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists invalidate_ghl_personalization_on_question_change
  on public.campaign_plans;
create trigger invalidate_ghl_personalization_on_question_change
after update of plan on public.campaign_plans
for each row execute function private.invalidate_ghl_personalization_on_question_change_v1();

-- The worker may read provider submissions only for forms that are currently
-- published, fully personalized, and attached to the exact active mapping and
-- approved immutable manifest. Returning field ids from this same route keeps
-- the provider response projection bounded to the current consent/question
-- contract. A form id shared by more than one campaign is intentionally
-- omitted: the later apply RPC also fails closed, but the provider read must
-- never begin from an ambiguous route.
create or replace function public.list_ghl_inbound_eligible_form_routes_v1(
  p_organization_id uuid,
  p_location_mapping_id uuid,
  p_environment text
)
returns table(
  provider_form_id text,
  allowed_field_ids jsonb
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  with eligible_personalizations as (
    select
      personalization.id as personalization_id,
      personalization.required_form_ids,
      coalesce((
        select jsonb_agg(field_id order by field_id)
        from (
          select distinct field_id
          from (
            select personalization.inbound_sms_consent_field_id as field_id
            union all
            select personalization.inbound_advertising_consent_field_id
            union all
            select question ->> 'fieldId'
            from jsonb_array_elements(personalization.inbound_question_contract) question
          ) configured_fields
          where field_id ~ '^[A-Za-z0-9_-]{3,180}$'
        ) exact_fields
      ), '[]'::jsonb) as allowed_field_ids
    from public.ghl_location_personalizations personalization
    join public.campaign_plans campaign
      on campaign.id = personalization.campaign_id
     and campaign.organization_id = personalization.organization_id
    join public.ghl_location_mappings mapping
      on mapping.id = personalization.location_mapping_id
     and mapping.organization_id = personalization.organization_id
     and mapping.environment = personalization.environment
    where personalization.organization_id = p_organization_id
      and personalization.location_mapping_id = p_location_mapping_id
      and personalization.environment = p_environment
      and p_environment in ('sandbox', 'production')
      and mapping.status = 'active'
      and mapping.snapshot_verified_at is not null
      and mapping.required_objects_verified_at is not null
      and campaign.publish_state = 'published'
      and personalization.status = 'ready'
      and personalization.current_step = 'ready'
      and personalization.verified_at is not null
      and personalization.source_plan_fingerprint =
        public.ghl_campaign_personalization_source_fingerprint_v2(
          campaign.plan, campaign.id, campaign.organization_id
        )
      and personalization.inbound_consent_contract_fingerprint =
        private.current_ghl_inbound_contract_fingerprint_v1(personalization.id)
      and exists (
        select 1
        from public.ghl_provisioning_runs run_record
        where run_record.organization_id = personalization.organization_id
          and run_record.environment = personalization.environment
          and run_record.location_mapping_id = personalization.location_mapping_id
          and run_record.snapshot_manifest_id = mapping.snapshot_manifest_id
          and run_record.state = 'ready'
      )
  ), candidate_routes as (
    select distinct
      eligible.personalization_id,
      form_id.provider_form_id,
      eligible.allowed_field_ids
    from eligible_personalizations eligible
    cross join lateral jsonb_array_elements_text(eligible.required_form_ids)
      as form_id(provider_form_id)
    where form_id.provider_form_id ~ '^[A-Za-z0-9_-]{3,180}$'
  )
  select candidate.provider_form_id, candidate.allowed_field_ids
  from candidate_routes candidate
  where (
    select count(*)
    from candidate_routes competing
    where competing.provider_form_id = candidate.provider_form_id
  ) = 1
  order by candidate.provider_form_id
$$;

-- An owner-configured Sub-Account token is verified with a GET-only form-list
-- request before this RPC is called. The RPC rechecks the exact current form
-- set under a mapping lock, then persists only the environment-secret
-- reference and the narrow forms.readonly attestation. It categorically
-- rejects agency-token references and never accepts plaintext credentials.
create or replace function public.bind_ghl_inbound_forms_read_authority_v1(
  p_organization_id uuid,
  p_location_mapping_id uuid,
  p_environment text,
  p_provider_location_id text,
  p_credential_ref text,
  p_capabilities jsonb,
  p_verified_form_ids jsonb,
  p_scope_attested_at timestamptz
)
returns public.ghl_location_mappings
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  mapping_record public.ghl_location_mappings%rowtype;
  expected_form_ids jsonb;
begin
  if p_environment not in ('sandbox', 'production')
     or p_provider_location_id !~ '^[A-Za-z0-9_-]{3,180}$'
     or p_capabilities is distinct from '["forms.readonly"]'::jsonb
     or jsonb_typeof(p_verified_form_ids) is distinct from 'array'
     or jsonb_array_length(p_verified_form_ids) not between 1 and 25
     or exists (
       select 1
       from jsonb_array_elements_text(p_verified_form_ids) verified(verified_form_id)
       where verified_form_id !~ '^[A-Za-z0-9_-]{3,180}$'
     )
     or (
       select count(*) from jsonb_array_elements_text(p_verified_form_ids)
     ) <> (
       select count(distinct verified_form_id)
       from jsonb_array_elements_text(p_verified_form_ids) verified(verified_form_id)
     )
     or p_scope_attested_at < timezone('utc', now()) - interval '15 minutes'
     or p_scope_attested_at > timezone('utc', now()) + interval '5 minutes' then
    raise exception 'ghl_inbound_forms_read_attestation_invalid';
  end if;
  if (
    p_environment = 'sandbox'
    and p_credential_ref !~ '^env:GHL_SANDBOX_LOCATION(_[A-Z0-9]+)*_TOKEN$'
  ) or (
    p_environment = 'production'
    and p_credential_ref !~ '^env:GHL_PRODUCTION_LOCATION(_[A-Z0-9]+)*_TOKEN$'
  ) or position('AGENCY' in p_credential_ref) > 0 then
    raise exception 'ghl_inbound_forms_read_credential_reference_invalid';
  end if;

  select * into strict mapping_record
  from public.ghl_location_mappings mapping
  where mapping.id = p_location_mapping_id
    and mapping.organization_id = p_organization_id
    and mapping.environment = p_environment
    and mapping.provider_location_id = p_provider_location_id
    and mapping.status = 'active'
    and mapping.snapshot_verified_at is not null
    and mapping.required_objects_verified_at is not null
  for update;

  select coalesce(jsonb_agg(route.provider_form_id order by route.provider_form_id), '[]'::jsonb)
  into expected_form_ids
  from public.list_ghl_inbound_eligible_form_routes_v1(
    p_organization_id, p_location_mapping_id, p_environment
  ) route;
  if expected_form_ids is distinct from p_verified_form_ids then
    raise exception 'ghl_inbound_forms_read_verified_form_scope_changed';
  end if;

  update public.ghl_location_mappings mapping set
    forms_readonly_credential_ref = p_credential_ref,
    forms_readonly_capabilities = p_capabilities,
    forms_readonly_scope_attested_at = p_scope_attested_at,
    updated_at = p_scope_attested_at
  where mapping.id = mapping_record.id
  returning * into strict mapping_record;
  return mapping_record;
end;
$$;

-- Runtime activation is a separate owner action. Enabling is refused unless
-- every active mapping that currently exposes an eligible campaign form has a
-- valid location-scoped forms.readonly binding. Disabling is always allowed.
create or replace function public.set_ghl_inbound_form_reconciliation_runtime_v1(
  p_environment text,
  p_enabled boolean,
  p_now timestamptz
)
returns public.ghl_runtime_controls
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result_record public.ghl_runtime_controls%rowtype;
  eligible_mapping_count integer;
  bound_mapping_count integer;
begin
  if p_environment not in ('sandbox', 'production')
     or p_enabled is null
     or p_now < timezone('utc', now()) - interval '15 minutes'
     or p_now > timezone('utc', now()) + interval '5 minutes' then
    raise exception 'ghl_inbound_runtime_authorization_invalid';
  end if;

  if p_enabled then
    select count(*)::integer,
           count(*) filter (where
             mapping.forms_readonly_credential_ref is not null
             and mapping.forms_readonly_capabilities = '["forms.readonly"]'::jsonb
             and mapping.forms_readonly_scope_attested_at between p_now - interval '15 minutes' and p_now + interval '5 minutes'
             and (
               (p_environment = 'sandbox' and mapping.forms_readonly_credential_ref ~ '^env:GHL_SANDBOX_LOCATION(_[A-Z0-9]+)*_TOKEN$')
               or (p_environment = 'production' and mapping.forms_readonly_credential_ref ~ '^env:GHL_PRODUCTION_LOCATION(_[A-Z0-9]+)*_TOKEN$')
             )
           )::integer
    into eligible_mapping_count, bound_mapping_count
    from public.ghl_location_mappings mapping
    where mapping.environment = p_environment
      and mapping.status = 'active'
      and exists (
        select 1
        from public.list_ghl_inbound_eligible_form_routes_v1(
          mapping.organization_id, mapping.id, mapping.environment
        ) route
      );
    if eligible_mapping_count = 0 or bound_mapping_count <> eligible_mapping_count then
      raise exception 'ghl_inbound_runtime_location_authority_incomplete';
    end if;
  end if;

  update public.ghl_runtime_controls controls set
    inbound_form_reconciliation_enabled = p_enabled,
    updated_at = p_now
  where controls.environment = p_environment
  returning * into strict result_record;
  return result_record;
end;
$$;

-- Called only after the gate has been committed closed. It terminalizes
-- expired abandoned claims and reports live leases so an operator workflow can
-- wait for zero old workers before credential rotation. It never opens a gate.
create or replace function public.drain_ghl_inbound_form_reconciliation_claims_v1(
  p_environment text,
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  active_claim_count integer;
begin
  if p_environment not in ('sandbox', 'production')
     or p_now < timezone('utc', now()) - interval '15 minutes'
     or p_now > timezone('utc', now()) + interval '5 minutes' then
    raise exception 'ghl_inbound_drain_authorization_invalid';
  end if;
  if not exists (
    select 1 from public.ghl_runtime_controls controls
    where controls.environment = p_environment
      and controls.inbound_form_reconciliation_enabled = false
  ) then
    raise exception 'ghl_inbound_drain_requires_closed_runtime';
  end if;

  update public.ghl_inbound_form_reconciliations reconciliation set
    status = 'retryable_failure',
    -- A committed operator fence, not provider/data failure, ended this claim.
    -- Give the attempt back so rotation cannot exhaust a valid receipt.
    attempt_count = greatest(reconciliation.attempt_count - 1, 0),
    next_retry_at = p_now + interval '30 seconds',
    last_error_code = 'ghl_inbound_reconciliation_worker_lease_expired_during_fence',
    last_error_message = 'The prior GHL inbound reconciliation worker lease expired while the runtime gate was fenced.',
    locked_by = null,
    locked_at = null,
    locked_until = null,
    lease_token = null,
    updated_at = p_now
  where reconciliation.environment = p_environment
    and reconciliation.status = 'processing'
    and (reconciliation.locked_until is null or reconciliation.locked_until <= p_now);

  select count(*)::integer into active_claim_count
  from public.ghl_inbound_form_reconciliations reconciliation
  where reconciliation.environment = p_environment
    and reconciliation.status = 'processing';
  return active_claim_count;
end;
$$;

-- Controlled disconnect/retirement for a successfully provisioned location.
-- Historical READY runs and receipts remain immutable evidence; their metadata
-- records retirement while every not-yet-dispatched effect is canceled. All
-- database gates must already be closed and every provider/inbound worker must
-- be quiescent. No provider action is performed by this RPC.
create or replace function public.retire_ghl_location_mapping_v1(
  p_organization_id uuid,
  p_location_mapping_id uuid,
  p_environment text,
  p_reason text,
  p_actor text,
  p_authorization text,
  p_now timestamptz
)
returns public.ghl_location_mappings
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  mapping_record public.ghl_location_mappings%rowtype;
  reconciliation_record record;
begin
  if p_environment not in ('sandbox', 'production')
     or p_authorization <> 'DEALFLOW_GHL_LOCATION_RETIREMENT_EXACT_V1'
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500
     or trim(coalesce(p_actor, '')) !~ '^[A-Za-z0-9@._:-]{3,180}$'
     or p_now < timezone('utc', now()) - interval '15 minutes'
     or p_now > timezone('utc', now()) + interval '5 minutes' then
    raise exception 'ghl_location_retirement_authorization_invalid';
  end if;

  perform 1
  from public.ghl_runtime_controls controls
  where controls.environment = p_environment
    and controls.provisioning_writes_enabled = false
    and controls.lead_writes_enabled = false
    and controls.lifecycle_webhook_enabled = false
    and controls.inbound_form_reconciliation_enabled = false
  for update;
  if not found then
    raise exception 'ghl_location_retirement_requires_all_database_gates_closed';
  end if;

  select * into strict mapping_record
  from public.ghl_location_mappings mapping
  where mapping.id = p_location_mapping_id
    and mapping.organization_id = p_organization_id
    and mapping.environment = p_environment
    and mapping.status = 'active'
  for update;

  if exists (
    select 1 from public.ghl_inbound_form_reconciliations reconciliation
    where reconciliation.location_mapping_id = mapping_record.id
      and reconciliation.status = 'processing'
  ) or exists (
    select 1 from public.ghl_provisioning_runs run_record
    where run_record.location_mapping_id = mapping_record.id
      and (
        (
          run_record.locked_until > p_now
          and run_record.locked_by is not null
          and run_record.lease_token is not null
        )
        or run_record.state = 'location_uncertain'
        or run_record.reconcile_before_retry
      )
  ) or exists (
    select 1 from public.ghl_location_personalizations personalization
    where personalization.location_mapping_id = mapping_record.id
      and personalization.status = 'applying'
  ) or exists (
    select 1 from public.ghl_provider_outbox outbox
    where outbox.status in ('dispatching', 'uncertain')
      and (
        outbox.provisioning_run_id in (
          select run_record.id from public.ghl_provisioning_runs run_record
          where run_record.location_mapping_id = mapping_record.id
        )
        or outbox.id in (
          select effect.outbox_id from public.ghl_lead_effect_events effect
          where effect.location_mapping_id = mapping_record.id
            and effect.outbox_id is not null
        )
      )
  ) or exists (
    select 1 from public.ghl_lead_effect_events effect
    where effect.location_mapping_id = mapping_record.id
      and effect.status in ('dispatching', 'uncertain')
  ) then
    raise exception 'ghl_location_retirement_requires_zero_active_or_ambiguous_workers';
  end if;

  -- Expired provisioning leases are not live authority. Clear them and
  -- permanently cancel every nonterminal run tied to this mapping so a later
  -- gate reopen cannot claim work against the retired location.
  update public.ghl_provisioning_runs run_record set
    revision = run_record.revision + 1,
    state = 'canceled',
    resume_state = null,
    reconcile_before_retry = false,
    next_retry_at = null,
    last_error_code = 'ghl_location_mapping_retired',
    last_error_message = null,
    state_metadata = coalesce(run_record.state_metadata, '{}'::jsonb) || jsonb_build_object(
      'retiredAt', p_now,
      'retiredBy', trim(p_actor),
      'retirementReason', trim(p_reason),
      'provisioningCanceled', true
    ),
    locked_by = null,
    locked_at = null,
    locked_until = null,
    lease_token = null,
    updated_at = p_now
  where run_record.location_mapping_id = mapping_record.id
    and run_record.state not in ('ready', 'operator_action_required', 'canceled');

  update public.ghl_billing_activation_requests activation set
    status = 'blocked_configuration',
    blocker_code = 'ghl_location_mapping_retired',
    updated_at = p_now
  where activation.provisioning_run_id in (
    select run_record.id
    from public.ghl_provisioning_runs run_record
    where run_record.location_mapping_id = mapping_record.id
      and run_record.state = 'canceled'
      and run_record.last_error_code = 'ghl_location_mapping_retired'
  );

  update public.ghl_provider_outbox outbox set
    status = 'canceled',
    completed_at = p_now,
    last_error_code = 'ghl_location_mapping_retired',
    updated_at = p_now
  where outbox.status in ('pending', 'retryable_failure', 'operator_action_required')
    and (
      outbox.provisioning_run_id in (
        select run_record.id from public.ghl_provisioning_runs run_record
        where run_record.location_mapping_id = mapping_record.id
      )
      or outbox.id in (
        select effect.outbox_id from public.ghl_lead_effect_events effect
        where effect.location_mapping_id = mapping_record.id
          and effect.outbox_id is not null
      )
    );

  update public.ghl_lead_effect_events effect set
    status = 'canceled',
    last_error_code = 'ghl_location_mapping_retired',
    last_error_message = null,
    next_retry_at = null,
    completed_at = p_now,
    updated_at = p_now
  where effect.location_mapping_id = mapping_record.id
    and effect.status in ('pending', 'replay_requested', 'retryable_failure', 'operator_action_required');

  update public.ghl_location_personalizations personalization set
    status = 'operator_action_required',
    current_step = case when personalization.current_step = 'ready' then 'forms'
      else personalization.current_step end,
    last_error_code = 'ghl_location_mapping_retired',
    next_retry_at = null,
    locked_by = null,
    locked_until = null,
    lease_token = null,
    updated_at = p_now
  where personalization.location_mapping_id = mapping_record.id
    and personalization.status <> 'operator_action_required';

  update public.ghl_provisioning_runs run_record set
    revision = run_record.revision + 1,
    state_metadata = coalesce(run_record.state_metadata, '{}'::jsonb) || jsonb_build_object(
      'retiredAt', p_now,
      'retiredBy', trim(p_actor),
      'retirementReason', trim(p_reason),
      'historicalReadyStatePreserved', true
    ),
    last_error_code = 'ghl_location_mapping_retired',
    last_error_message = null,
    updated_at = p_now
  where run_record.location_mapping_id = mapping_record.id
    and run_record.state = 'ready';

  for reconciliation_record in
    select reconciliation.id, reconciliation.lifecycle_event_id
    from public.ghl_inbound_form_reconciliations reconciliation
    where reconciliation.location_mapping_id = mapping_record.id
      and reconciliation.status in ('pending', 'retryable_failure')
    for update
  loop
    update public.ghl_inbound_form_reconciliations reconciliation set
      status = 'operator_action_required',
      last_error_code = 'ghl_inbound_location_mapping_retired',
      last_error_message = null,
      next_retry_at = null,
      locked_by = null, locked_at = null, locked_until = null, lease_token = null,
      completed_at = p_now,
      updated_at = p_now
    where reconciliation.id = reconciliation_record.id;
    perform private.record_ghl_lifecycle_operator_action_v1(
      reconciliation_record.lifecycle_event_id,
      'ghl_inbound_location_mapping_retired',
      'contact',
      p_now
    );
  end loop;

  perform set_config('dealflow.ghl_retirement_mapping_id', mapping_record.id::text, true);
  update public.ghl_location_mappings mapping set
    status = 'inactive',
    forms_readonly_credential_ref = null,
    forms_readonly_capabilities = null,
    forms_readonly_scope_attested_at = null,
    retired_at = p_now,
    retirement_reason = trim(p_reason),
    retired_by = trim(p_actor),
    updated_at = p_now
  where mapping.id = mapping_record.id
  returning * into strict mapping_record;
  return mapping_record;
end;
$$;

-- Provider verification happens before this RPC. The database rotation itself
-- is all-or-nothing across locations: lock and close the runtime control,
-- replace every exact binding, prove no currently eligible mapping is missing,
-- then reopen the gate in this single transaction. A later failure rolls back
-- the control update and every earlier binding update.
create or replace function public.configure_ghl_inbound_forms_read_authorities_v1(
  p_environment text,
  p_bindings jsonb,
  p_now timestamptz
)
returns public.ghl_runtime_controls
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  binding_value jsonb;
  result_record public.ghl_runtime_controls%rowtype;
  binding_count integer;
  eligible_mapping_count integer;
begin
  if p_environment not in ('sandbox', 'production')
     or jsonb_typeof(p_bindings) is distinct from 'array'
     or jsonb_array_length(p_bindings) not between 1 and 1000
     or p_now < timezone('utc', now()) - interval '15 minutes'
     or p_now > timezone('utc', now()) + interval '5 minutes'
     or exists (
       select 1 from jsonb_array_elements(p_bindings) binding
       where jsonb_typeof(binding) <> 'object'
          or exists (
            select 1 from jsonb_object_keys(binding) key
            where key not in (
              'organizationId', 'mappingId', 'providerLocationId',
              'credentialRef', 'verifiedFormIds'
            )
          )
          or coalesce(binding ->> 'organizationId', '') !~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          or coalesce(binding ->> 'mappingId', '') !~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          or coalesce(binding ->> 'providerLocationId', '') !~ '^[A-Za-z0-9_-]{3,180}$'
          or jsonb_typeof(binding -> 'verifiedFormIds') is distinct from 'array'
     ) then
    raise exception 'ghl_inbound_forms_read_batch_attestation_invalid';
  end if;

  select count(*)::integer into binding_count
  from jsonb_array_elements(p_bindings);
  if binding_count <> (
       select count(distinct binding ->> 'mappingId')
       from jsonb_array_elements(p_bindings) binding
     )
     or binding_count <> (
       select count(distinct binding ->> 'providerLocationId')
       from jsonb_array_elements(p_bindings) binding
     ) then
    raise exception 'ghl_inbound_forms_read_batch_scope_duplicated';
  end if;

  select * into strict result_record
  from public.ghl_runtime_controls controls
  where controls.environment = p_environment
  for update;
  if result_record.inbound_form_reconciliation_enabled then
    raise exception 'ghl_inbound_forms_read_batch_requires_committed_runtime_fence';
  end if;
  if exists (
    select 1 from public.ghl_inbound_form_reconciliations reconciliation
    where reconciliation.environment = p_environment
      and reconciliation.status = 'processing'
  ) then
    raise exception 'ghl_inbound_forms_read_batch_old_worker_not_drained';
  end if;

  select count(*)::integer into eligible_mapping_count
  from public.ghl_location_mappings mapping
  where mapping.environment = p_environment
    and mapping.status = 'active'
    and exists (
      select 1
      from public.list_ghl_inbound_eligible_form_routes_v1(
        mapping.organization_id, mapping.id, mapping.environment
      ) route
    );
  if eligible_mapping_count <> binding_count
     or exists (
       select 1
       from public.ghl_location_mappings mapping
       where mapping.environment = p_environment
         and mapping.status = 'active'
         and exists (
           select 1
           from public.list_ghl_inbound_eligible_form_routes_v1(
             mapping.organization_id, mapping.id, mapping.environment
           ) route
         )
         and not exists (
           select 1 from jsonb_array_elements(p_bindings) binding
           where (binding ->> 'organizationId')::uuid = mapping.organization_id
             and (binding ->> 'mappingId')::uuid = mapping.id
             and binding ->> 'providerLocationId' = mapping.provider_location_id
         )
     ) or exists (
       select 1 from jsonb_array_elements(p_bindings) binding
       where not exists (
         select 1
         from public.ghl_location_mappings mapping
         where mapping.environment = p_environment
           and mapping.status = 'active'
           and mapping.organization_id = (binding ->> 'organizationId')::uuid
           and mapping.id = (binding ->> 'mappingId')::uuid
           and mapping.provider_location_id = binding ->> 'providerLocationId'
           and exists (
             select 1
             from public.list_ghl_inbound_eligible_form_routes_v1(
               mapping.organization_id, mapping.id, mapping.environment
             ) route
           )
       )
     ) then
    raise exception 'ghl_inbound_forms_read_batch_exact_mapping_set_required';
  end if;

  -- Exact-set rotation also revokes every active location authority that is
  -- not part of this freshly verified batch. An unpublished/ineligible
  -- campaign must never retain a stale token attestation that could become
  -- provider-readable merely by being published after the global gate opens.
  update public.ghl_location_mappings mapping set
    forms_readonly_credential_ref = null,
    forms_readonly_capabilities = null,
    forms_readonly_scope_attested_at = null,
    updated_at = p_now
  where mapping.environment = p_environment
    and mapping.status = 'active'
    and not exists (
      select 1
      from jsonb_array_elements(p_bindings) binding
      where (binding ->> 'organizationId')::uuid = mapping.organization_id
        and (binding ->> 'mappingId')::uuid = mapping.id
        and binding ->> 'providerLocationId' = mapping.provider_location_id
    );

  for binding_value in
    select binding
    from jsonb_array_elements(p_bindings) binding
    order by binding ->> 'mappingId'
  loop
    perform public.bind_ghl_inbound_forms_read_authority_v1(
      (binding_value ->> 'organizationId')::uuid,
      (binding_value ->> 'mappingId')::uuid,
      p_environment,
      binding_value ->> 'providerLocationId',
      binding_value ->> 'credentialRef',
      '["forms.readonly"]'::jsonb,
      binding_value -> 'verifiedFormIds',
      p_now
    );
  end loop;

  return public.set_ghl_inbound_form_reconciliation_runtime_v1(
    p_environment, true, p_now
  );
end;
$$;

create unique index if not exists ghl_location_personalizations_inbound_scope_unique
  on public.ghl_location_personalizations (
    id, organization_id, campaign_id, location_mapping_id, environment
  );

alter table public.ghl_lifecycle_webhook_events
  drop constraint if exists ghl_lifecycle_webhook_type_check,
  drop constraint if exists ghl_lifecycle_webhook_projection_check;

alter table public.ghl_lifecycle_webhook_events
  add constraint ghl_lifecycle_webhook_type_check check (event_type in (
    'AppointmentCreate', 'AppointmentUpdate', 'AppointmentDelete', 'ContactCreate', 'ContactUpdate',
    'OpportunityStatusUpdate', 'OutboundMessage'
  )),
  add constraint ghl_lifecycle_webhook_projection_check check (
    projection_status in ('received', 'reconciliation_pending', 'reconciled', 'operator_action_required')
  );

create table if not exists public.ghl_inbound_form_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  location_mapping_id uuid not null,
  lifecycle_event_id uuid not null,
  environment text not null,
  provider_contact_id text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  provider_read_count integer not null default 0,
  locked_by text null,
  locked_at timestamptz null,
  locked_until timestamptz null,
  lease_token uuid null,
  lease_generation bigint not null default 0,
  next_retry_at timestamptz null,
  reconciliation_window_start timestamptz not null,
  reconciliation_window_end timestamptz not null,
  provider_request_id text null,
  response_fingerprint text null,
  matched_provider_submission_id text null,
  matched_provider_form_id text null,
  captured_submission_count integer not null default 0,
  resolved_lead_id uuid null,
  replay_count integer not null default 0,
  replay_history jsonb not null default '[]'::jsonb,
  last_replayed_at timestamptz null,
  last_replayed_by text null,
  last_replay_reason text null,
  last_error_code text null,
  last_error_message text null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_inbound_reconciliation_environment_check check (environment in ('production', 'sandbox')),
  constraint ghl_inbound_reconciliation_contact_check check (provider_contact_id ~ '^[A-Za-z0-9_-]{3,180}$'),
  constraint ghl_inbound_reconciliation_status_check check (
    status in ('pending', 'processing', 'retryable_failure', 'completed', 'operator_action_required')
  ),
  constraint ghl_inbound_reconciliation_attempt_check check (
    attempt_count >= 0 and max_attempts between 2 and 12 and attempt_count <= max_attempts
    and provider_read_count >= 0
    and captured_submission_count >= 0
  ),
  constraint ghl_inbound_reconciliation_replay_check check (
    replay_count between 0 and 5
    and jsonb_typeof(replay_history) = 'array'
    and jsonb_array_length(replay_history) = replay_count
    and jsonb_array_length(replay_history) <= 5
    and (last_replayed_by is null or last_replayed_by ~ '^[A-Za-z0-9@._:-]{3,180}$')
    and (last_replay_reason is null or length(last_replay_reason) between 3 and 500)
  ),
  constraint ghl_inbound_reconciliation_window_check check (
    reconciliation_window_end > reconciliation_window_start
    and reconciliation_window_end - reconciliation_window_start <= interval '48 hours'
  ),
  constraint ghl_inbound_reconciliation_mapping_tenant_fk foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings(id, organization_id) on update restrict on delete restrict,
  constraint ghl_inbound_reconciliation_event_tenant_fk foreign key (lifecycle_event_id, organization_id)
    references public.ghl_lifecycle_webhook_events(id, organization_id) on update restrict on delete restrict,
  constraint ghl_inbound_reconciliation_lead_tenant_fk foreign key (resolved_lead_id, organization_id)
    references public.leads(id, organization_id) on update restrict on delete restrict,
  constraint ghl_inbound_reconciliation_event_unique unique (lifecycle_event_id)
);

create index if not exists ghl_inbound_reconciliation_claim_idx
  on public.ghl_inbound_form_reconciliations (environment, status, next_retry_at, created_at, id)
  where status in ('pending', 'retryable_failure', 'processing');

alter table public.ghl_inbound_form_reconciliations
  alter column max_attempts set default 12;
alter table public.ghl_inbound_form_reconciliations
  drop constraint if exists ghl_inbound_reconciliation_attempt_check,
  add constraint ghl_inbound_reconciliation_attempt_check check (
    attempt_count >= 0 and max_attempts between 2 and 12 and attempt_count <= max_attempts
    and provider_read_count >= 0
    and captured_submission_count >= 0
  );
update public.ghl_inbound_form_reconciliations
set max_attempts = 12
where status in ('pending', 'processing', 'retryable_failure')
  and attempt_count <= 12
  and max_attempts <> 12;

create table if not exists public.ghl_inbound_form_submission_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  campaign_id uuid not null references public.campaign_plans(id) on delete restrict,
  location_mapping_id uuid not null,
  personalization_id uuid not null,
  lifecycle_event_id uuid not null,
  lead_id uuid not null,
  environment text not null,
  provider_submission_id text not null,
  provider_form_id text not null,
  provider_contact_id text not null,
  submitted_at timestamptz not null,
  consent_contract_fingerprint text not null,
  sms_consent_granted boolean not null default false,
  advertising_consent_granted boolean not null default false,
  qualification_answers jsonb not null default '[]'::jsonb,
  consent_evidence jsonb not null default '{}'::jsonb,
  attribution jsonb not null default '{}'::jsonb,
  provider_request_id text null,
  submission_fingerprint text not null,
  response_fingerprint text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint ghl_inbound_binding_environment_check check (environment in ('production', 'sandbox')),
  constraint ghl_inbound_binding_provider_identity_check check (
    provider_submission_id ~ '^[A-Za-z0-9_-]{3,180}$'
    and provider_form_id ~ '^[A-Za-z0-9_-]{3,180}$'
    and provider_contact_id ~ '^[A-Za-z0-9_-]{3,180}$'
    and submission_fingerprint ~ '^[a-f0-9]{64}$'
    and response_fingerprint ~ '^[a-f0-9]{64}$'
    and consent_contract_fingerprint ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(qualification_answers) = 'array'
    and jsonb_typeof(consent_evidence) = 'object'
    and jsonb_typeof(attribution) = 'object'
  ),
  constraint ghl_inbound_binding_personalization_scope_fk foreign key (
    personalization_id, organization_id, campaign_id, location_mapping_id, environment
  ) references public.ghl_location_personalizations (
    id, organization_id, campaign_id, location_mapping_id, environment
  ) on update restrict on delete restrict,
  constraint ghl_inbound_binding_event_tenant_fk foreign key (lifecycle_event_id, organization_id)
    references public.ghl_lifecycle_webhook_events(id, organization_id) on update restrict on delete restrict,
  constraint ghl_inbound_binding_lead_tenant_fk foreign key (lead_id, organization_id)
    references public.leads(id, organization_id) on update restrict on delete restrict,
  constraint ghl_inbound_binding_campaign_tenant_user_fk foreign key (campaign_id, organization_id, user_id)
    references public.campaign_plans(id, organization_id, user_id) on update restrict on delete restrict,
  constraint ghl_inbound_binding_submission_unique unique (location_mapping_id, provider_submission_id)
);

create index if not exists ghl_inbound_binding_contact_idx
  on public.ghl_inbound_form_submission_bindings (
    location_mapping_id, provider_contact_id, submitted_at desc, id
  );

alter table public.ghl_inbound_form_reconciliations enable row level security;
alter table public.ghl_inbound_form_reconciliations force row level security;
alter table public.ghl_inbound_form_submission_bindings enable row level security;
alter table public.ghl_inbound_form_submission_bindings force row level security;

revoke all on table public.ghl_inbound_form_reconciliations from anon, authenticated;
revoke all on table public.ghl_inbound_form_submission_bindings from anon, authenticated;

create or replace function public.claim_next_ghl_inbound_form_reconciliation_v1(
  p_environment text,
  p_worker_id text,
  p_now timestamptz default timezone('utc', now()),
  p_lease_ms integer default 120000
)
returns table(
  id uuid,
  organization_id uuid,
  location_mapping_id uuid,
  provider_location_id text,
  provider_contact_id text,
  reconciliation_window_start timestamptz,
  reconciliation_window_end timestamptz,
  attempt_count integer,
  lease_token uuid,
  lease_generation bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate_id uuid;
  inactive_record record;
  exhausted_record record;
begin
  if p_environment not in ('production', 'sandbox')
     or nullif(trim(p_worker_id), '') is null
     or length(trim(p_worker_id)) > 160
     or p_lease_ms < 10000 or p_lease_ms > 600000 then
    raise exception 'ghl_inbound_reconciliation_claim_invalid';
  end if;
  if not exists (
    select 1 from public.ghl_runtime_controls control
    where control.environment = p_environment
      and control.inbound_form_reconciliation_enabled
  ) then
    raise exception 'ghl_inbound_reconciliation_database_gate_closed';
  end if;

  for inactive_record in
    select reconciliation.id, reconciliation.lifecycle_event_id
    from public.ghl_inbound_form_reconciliations reconciliation
    join public.ghl_location_mappings mapping on mapping.id = reconciliation.location_mapping_id
      and mapping.organization_id = reconciliation.organization_id
      and mapping.environment = reconciliation.environment
    where reconciliation.environment = p_environment
      and (
        reconciliation.status in ('pending', 'retryable_failure')
        or (reconciliation.status = 'processing' and reconciliation.locked_until <= p_now)
      )
      and mapping.status <> 'active'
    order by reconciliation.created_at, reconciliation.id
    for update of reconciliation skip locked
    limit 25
  loop
    update public.ghl_inbound_form_reconciliations reconciliation
    set status = 'operator_action_required',
        last_error_code = 'ghl_inbound_location_mapping_inactive',
        next_retry_at = null,
        locked_by = null, locked_at = null, locked_until = null, lease_token = null,
        completed_at = p_now,
        updated_at = p_now
    where reconciliation.id = inactive_record.id;
    perform private.record_ghl_lifecycle_operator_action_v1(
      inactive_record.lifecycle_event_id,
      'ghl_inbound_location_mapping_inactive',
      'contact',
      p_now
    );
  end loop;

  for exhausted_record in
    select reconciliation.id, reconciliation.lifecycle_event_id
    from public.ghl_inbound_form_reconciliations reconciliation
    where reconciliation.environment = p_environment
      and reconciliation.attempt_count >= reconciliation.max_attempts
      and (
        reconciliation.status in ('pending', 'retryable_failure')
        or (reconciliation.status = 'processing' and reconciliation.locked_until <= p_now)
      )
    order by reconciliation.created_at, reconciliation.id
    for update skip locked
    limit 25
  loop
    update public.ghl_inbound_form_reconciliations reconciliation
    set status = 'operator_action_required',
        last_error_code = 'ghl_form_reconciliation_attempts_exhausted',
        next_retry_at = null,
        locked_by = null, locked_at = null, locked_until = null, lease_token = null,
        completed_at = p_now,
        updated_at = p_now
    where reconciliation.id = exhausted_record.id;
    perform private.record_ghl_lifecycle_operator_action_v1(
      exhausted_record.lifecycle_event_id,
      'ghl_form_reconciliation_attempts_exhausted',
      'contact',
      p_now
    );
  end loop;

  select reconciliation.id into candidate_id
  from public.ghl_inbound_form_reconciliations reconciliation
  join public.ghl_location_mappings mapping on mapping.id = reconciliation.location_mapping_id
    and mapping.organization_id = reconciliation.organization_id
    and mapping.environment = reconciliation.environment
    and mapping.status = 'active'
  where reconciliation.environment = p_environment
    and reconciliation.attempt_count < reconciliation.max_attempts
    and (
      (reconciliation.status in ('pending', 'retryable_failure')
        and coalesce(reconciliation.next_retry_at, '-infinity'::timestamptz) <= p_now)
      or (reconciliation.status = 'processing' and reconciliation.locked_until <= p_now)
    )
  order by coalesce(reconciliation.next_retry_at, reconciliation.created_at), reconciliation.created_at, reconciliation.id
  for update skip locked
  limit 1;

  if candidate_id is null then return; end if;

  return query
  update public.ghl_inbound_form_reconciliations reconciliation set
    status = 'processing',
    attempt_count = reconciliation.attempt_count + 1,
    locked_by = trim(p_worker_id),
    locked_at = p_now,
    locked_until = p_now + make_interval(secs => p_lease_ms::numeric / 1000),
    lease_token = gen_random_uuid(),
    lease_generation = reconciliation.lease_generation + 1,
    next_retry_at = null,
    updated_at = p_now
  from public.ghl_location_mappings mapping
  where reconciliation.id = candidate_id
    and mapping.id = reconciliation.location_mapping_id
    and mapping.organization_id = reconciliation.organization_id
    and mapping.environment = reconciliation.environment
    and mapping.status = 'active'
  returning reconciliation.id, reconciliation.organization_id,
    reconciliation.location_mapping_id, mapping.provider_location_id,
    reconciliation.provider_contact_id, reconciliation.reconciliation_window_start,
    reconciliation.reconciliation_window_end, reconciliation.attempt_count,
    reconciliation.lease_token, reconciliation.lease_generation;
end;
$$;

create or replace function public.settle_ghl_inbound_form_reconciliation_v1(
  p_reconciliation_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_outcome text,
  p_error_code text,
  p_error_message text,
  p_retry_after_ms integer,
  p_provider_request_id text,
  p_response_fingerprint text,
  p_now timestamptz default timezone('utc', now())
)
returns public.ghl_inbound_form_reconciliations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_record public.ghl_inbound_form_reconciliations%rowtype;
  result_record public.ghl_inbound_form_reconciliations%rowtype;
  terminal_operator boolean;
begin
  if p_outcome not in ('retryable_failure', 'operator_action_required')
     or nullif(trim(p_error_code), '') is null
     or length(trim(p_error_code)) > 180
     or length(coalesce(p_error_message, '')) > 1000
     or length(coalesce(p_provider_request_id, '')) > 240
     or (p_response_fingerprint is not null and p_response_fingerprint !~ '^[a-f0-9]{64}$')
     or (p_retry_after_ms is not null and (p_retry_after_ms < 1000 or p_retry_after_ms > 3600000)) then
    raise exception 'ghl_inbound_reconciliation_settlement_invalid';
  end if;

  select * into strict current_record
  from public.ghl_inbound_form_reconciliations reconciliation
  where reconciliation.id = p_reconciliation_id
    and reconciliation.status = 'processing'
    and reconciliation.locked_by = trim(p_worker_id)
    and reconciliation.lease_token = p_lease_token
    and reconciliation.lease_generation = p_lease_generation
    and reconciliation.locked_until > p_now
  for update;

  terminal_operator := p_outcome = 'operator_action_required'
    or current_record.attempt_count >= current_record.max_attempts;

  update public.ghl_inbound_form_reconciliations reconciliation set
    status = case when terminal_operator then 'operator_action_required' else 'retryable_failure' end,
    provider_read_count = reconciliation.provider_read_count + 1,
    provider_request_id = nullif(trim(coalesce(p_provider_request_id, '')), ''),
    response_fingerprint = p_response_fingerprint,
    last_error_code = case
      when terminal_operator and p_outcome <> 'operator_action_required' then 'ghl_form_reconciliation_attempts_exhausted'
      else trim(p_error_code)
    end,
    last_error_message = nullif(trim(coalesce(p_error_message, '')), ''),
    next_retry_at = case when terminal_operator then null else
      p_now + make_interval(secs => coalesce(p_retry_after_ms, 30000)::numeric / 1000)
    end,
    locked_by = null, locked_at = null, locked_until = null, lease_token = null,
    completed_at = case when terminal_operator then p_now else null end,
    updated_at = p_now
  where reconciliation.id = current_record.id
  returning * into strict result_record;

  if terminal_operator then
    perform private.record_ghl_lifecycle_operator_action_v1(
      current_record.lifecycle_event_id,
      result_record.last_error_code,
      'contact',
      p_now
    );
  end if;
  return result_record;
end;
$$;

create or replace function public.complete_ghl_inbound_form_reconciliation_without_submission_v1(
  p_reconciliation_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_provider_request_id text,
  p_response_fingerprint text,
  p_now timestamptz default timezone('utc', now())
)
returns public.ghl_inbound_form_reconciliations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_record public.ghl_inbound_form_reconciliations%rowtype;
  result_record public.ghl_inbound_form_reconciliations%rowtype;
  known_contact boolean;
begin
  if length(coalesce(p_provider_request_id, '')) > 240
     or p_response_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'ghl_inbound_empty_reconciliation_evidence_invalid';
  end if;
  select * into strict current_record
  from public.ghl_inbound_form_reconciliations reconciliation
  where reconciliation.id = p_reconciliation_id
    and reconciliation.status = 'processing'
    and reconciliation.locked_by = trim(p_worker_id)
    and reconciliation.lease_token = p_lease_token
    and reconciliation.lease_generation = p_lease_generation
    and reconciliation.locked_until > p_now
  for update;

  if current_record.provider_read_count + 1 < 2
     or p_now < current_record.reconciliation_window_end then
    update public.ghl_inbound_form_reconciliations reconciliation set
      status = 'retryable_failure',
      provider_read_count = reconciliation.provider_read_count + 1,
      provider_request_id = nullif(trim(coalesce(p_provider_request_id, '')), ''),
      response_fingerprint = p_response_fingerprint,
      last_error_code = case
        when p_now < reconciliation.reconciliation_window_end then 'ghl_form_submission_observation_window_open'
        else 'ghl_inbound_empty_reconciliation_requires_two_reads'
      end,
      last_error_message = null,
      -- Poll quickly for ordinary GHL indexing latency, then back off and make
      -- one conclusive read at the observation-window boundary. This preserves
      -- delayed-submission reliability without issuing a fixed two-minute read
      -- against every eligible form for the entire hour.
      next_retry_at = least(
        p_now + case current_record.provider_read_count
          when 0 then interval '30 seconds'
          when 1 then interval '1 minute'
          when 2 then interval '2 minutes'
          when 3 then interval '5 minutes'
          when 4 then interval '10 minutes'
          when 5 then interval '20 minutes'
          else current_record.reconciliation_window_end - p_now
        end,
        reconciliation.reconciliation_window_end
      ),
      locked_by = null, locked_at = null, locked_until = null, lease_token = null,
      updated_at = p_now
    where reconciliation.id = current_record.id
    returning * into strict result_record;
    return result_record;
  end if;
  known_contact := exists (
    select 1 from public.ghl_inbound_form_submission_bindings binding
    where binding.location_mapping_id = current_record.location_mapping_id
      and binding.provider_contact_id = current_record.provider_contact_id
  ) or exists (
    select 1 from public.ghl_lead_effect_events effect
    where effect.location_mapping_id = current_record.location_mapping_id
      and effect.provider_contact_id = current_record.provider_contact_id
      and effect.status = 'succeeded'
  );

  update public.ghl_inbound_form_reconciliations reconciliation set
    status = case when known_contact then 'completed' else 'operator_action_required' end,
    provider_read_count = reconciliation.provider_read_count + 1,
    provider_request_id = nullif(trim(coalesce(p_provider_request_id, '')), ''),
    response_fingerprint = p_response_fingerprint,
    last_error_code = case when known_contact then null else 'ghl_form_submission_not_observed_for_unknown_contact' end,
    last_error_message = null,
    next_retry_at = null,
    locked_by = null, locked_at = null, locked_until = null, lease_token = null,
    completed_at = p_now,
    updated_at = p_now
  where reconciliation.id = current_record.id
  returning * into strict result_record;

  if known_contact then
    update public.ghl_lifecycle_webhook_events
    set projection_status = 'reconciled',
        projection_code = 'contact_event_no_new_form_submission',
        projected_at = p_now
    where id = current_record.lifecycle_event_id;
  else
    perform private.record_ghl_lifecycle_operator_action_v1(
      current_record.lifecycle_event_id,
      result_record.last_error_code,
      'contact',
      p_now
    );
  end if;
  return result_record;
end;
$$;

create or replace function public.ingest_ghl_lifecycle_webhook_v1(
  p_provider_location_id text,
  p_environment text,
  p_provider_event_id text,
  p_event_type text,
  p_provider_object_id text,
  p_provider_contact_id text,
  p_provider_calendar_id text,
  p_appointment_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_provider_updated_at timestamptz,
  p_payload_fingerprint text,
  p_received_at timestamptz default timezone('utc', now())
)
returns public.ghl_lifecycle_webhook_events
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  mapping_record public.ghl_location_mappings%rowtype;
  result_record public.ghl_lifecycle_webhook_events%rowtype;
  state_record public.ghl_lifecycle_object_states%rowtype;
  lead_record public.leads%rowtype;
  appointment_record public.appointments%rowtype;
  candidate_lead_ids uuid[];
  candidate_count integer := 0;
  resolved_lead_id_value uuid;
  object_kind_value text;
  provider_contact_value text;
  provider_status_value text;
  provider_time_value timestamptz;
  canonical_status_value text;
  canonical_appointment_id_value uuid;
  state_found boolean := false;
  appointment_found boolean := false;
begin
  if p_environment not in ('production', 'sandbox')
     or p_event_type not in (
       'AppointmentCreate', 'AppointmentUpdate', 'AppointmentDelete', 'ContactCreate', 'ContactUpdate',
       'OpportunityStatusUpdate', 'OutboundMessage'
     )
     or nullif(trim(p_provider_location_id), '') is null
     or length(trim(p_provider_location_id)) > 180
     or nullif(trim(p_provider_event_id), '') is null
     or length(trim(p_provider_event_id)) > 240
     or nullif(trim(p_provider_object_id), '') is null
     or length(trim(p_provider_object_id)) > 180
     or p_payload_fingerprint !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_provider_contact_id, '')) > 180
     or length(coalesce(p_provider_calendar_id, '')) > 180
     or length(coalesce(p_appointment_status, '')) > 180 then
    raise exception 'Invalid GHL lifecycle webhook identity.';
  end if;
  if not exists (
    select 1 from public.ghl_runtime_controls control
    where control.environment = p_environment and control.lifecycle_webhook_enabled
  ) then
    raise exception 'GHL lifecycle webhook database kill switch is closed.';
  end if;
  select * into strict mapping_record
  from public.ghl_location_mappings mapping
  where mapping.environment = p_environment
    and mapping.provider_location_id = trim(p_provider_location_id)
    and mapping.status = 'active';

  insert into public.ghl_lifecycle_webhook_events (
    organization_id, location_mapping_id, provider_event_id, event_type, provider_object_id,
    provider_contact_id, provider_calendar_id, appointment_status, starts_at, ends_at,
    provider_updated_at, signature_algorithm, payload_fingerprint, received_at
  ) values (
    mapping_record.organization_id, mapping_record.id, trim(p_provider_event_id), p_event_type,
    trim(p_provider_object_id), nullif(trim(p_provider_contact_id), ''),
    nullif(trim(p_provider_calendar_id), ''), nullif(trim(p_appointment_status), ''),
    p_starts_at, p_ends_at, p_provider_updated_at, 'ed25519', p_payload_fingerprint, p_received_at
  ) on conflict (location_mapping_id, provider_event_id) do nothing;

  select * into strict result_record
  from public.ghl_lifecycle_webhook_events event
  where event.location_mapping_id = mapping_record.id
    and event.provider_event_id = trim(p_provider_event_id)
  for update;
  if result_record.payload_fingerprint is distinct from p_payload_fingerprint
     or result_record.event_type is distinct from p_event_type
     or result_record.provider_object_id is distinct from trim(p_provider_object_id)
     or result_record.provider_contact_id is distinct from nullif(trim(p_provider_contact_id), '')
     or result_record.provider_calendar_id is distinct from nullif(trim(p_provider_calendar_id), '')
     or result_record.appointment_status is distinct from nullif(trim(p_appointment_status), '')
     or result_record.starts_at is distinct from p_starts_at
     or result_record.ends_at is distinct from p_ends_at
     or result_record.provider_updated_at is distinct from p_provider_updated_at then
    raise exception 'GHL lifecycle webhook idempotency conflict.';
  end if;
  if result_record.projection_status <> 'received' then return result_record; end if;

  if p_event_type in ('ContactCreate', 'ContactUpdate') then
    if trim(p_provider_object_id) is distinct from nullif(trim(p_provider_contact_id), '') then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_contact_webhook_identity_conflict', 'contact', p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;
    insert into public.ghl_inbound_form_reconciliations (
      organization_id, location_mapping_id, lifecycle_event_id, environment, provider_contact_id,
      reconciliation_window_start, reconciliation_window_end, created_at, updated_at
    ) values (
      mapping_record.organization_id, mapping_record.id, result_record.id, p_environment,
      trim(p_provider_object_id),
      coalesce(p_provider_updated_at, p_received_at) - interval '24 hours',
      coalesce(p_provider_updated_at, p_received_at) + interval '1 hour',
      p_received_at, p_received_at
    ) on conflict (lifecycle_event_id) do nothing;
    update public.ghl_lifecycle_webhook_events
    set projection_status = 'reconciliation_pending',
        projection_code = 'signed_contact_event_requires_form_submission_reconciliation'
    where id = result_record.id
    returning * into strict result_record;
    return result_record;
  end if;

  object_kind_value := case
    when p_event_type like 'Appointment%' then 'appointment'
    when p_event_type = 'OpportunityStatusUpdate' then 'opportunity'
    else 'outbound_message'
  end;
  provider_contact_value := nullif(trim(p_provider_contact_id), '');
  provider_status_value := nullif(lower(trim(p_appointment_status)), '');
  provider_time_value := coalesce(p_provider_updated_at, p_received_at);

  perform pg_advisory_xact_lock(hashtextextended(
    mapping_record.id::text || ':' || object_kind_value || ':' || trim(p_provider_object_id), 0
  ));
  select * into state_record
  from public.ghl_lifecycle_object_states state
  where state.location_mapping_id = mapping_record.id
    and state.object_kind = object_kind_value
    and state.provider_object_id = trim(p_provider_object_id)
  for update;
  state_found := found;

  if state_found and p_provider_updated_at is null
     and state_record.last_payload_fingerprint is distinct from p_payload_fingerprint then
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id, 'ghl_lifecycle_provider_timestamp_missing', object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  end if;
  if state_found and provider_time_value < state_record.last_provider_updated_at then
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id, 'ghl_lifecycle_out_of_order_event', object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  end if;
  if state_found and provider_time_value = state_record.last_provider_updated_at
     and state_record.last_payload_fingerprint is distinct from p_payload_fingerprint then
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id, 'ghl_lifecycle_same_version_conflict', object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  end if;
  if state_found and state_record.last_payload_fingerprint = p_payload_fingerprint then
    update public.ghl_lifecycle_webhook_events
    set projection_status = 'reconciled', projection_code = 'idempotent_provider_object_delivery',
        resolved_lead_id = state_record.lead_id,
        canonical_appointment_id = state_record.canonical_appointment_id,
        projected_at = p_received_at
    where id = result_record.id returning * into strict result_record;
    return result_record;
  end if;

  with candidates as (
    select effect.lead_id
    from public.ghl_lead_effect_events effect
    where effect.organization_id = mapping_record.organization_id
      and effect.location_mapping_id = mapping_record.id
      and effect.status = 'succeeded'
      and (
        (provider_contact_value is not null and effect.provider_contact_id = provider_contact_value)
        or (object_kind_value = 'opportunity' and effect.provider_opportunity_id = trim(p_provider_object_id))
      )
    union
    select binding.lead_id
    from public.ghl_inbound_form_submission_bindings binding
    where binding.organization_id = mapping_record.organization_id
      and binding.location_mapping_id = mapping_record.id
      and provider_contact_value is not null
      and binding.provider_contact_id = provider_contact_value
  )
  select array_agg(candidate.lead_id order by candidate.lead_id), count(*)::integer
  into candidate_lead_ids, candidate_count
  from candidates candidate;
  candidate_count := coalesce(candidate_count, 0);

  if state_found then
    if candidate_count > 1
       or (candidate_count = 1 and candidate_lead_ids[1] is distinct from state_record.lead_id) then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_ambiguous_lead_binding', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;
    resolved_lead_id_value := state_record.lead_id;
  elsif candidate_count = 1 then
    resolved_lead_id_value := candidate_lead_ids[1];
  else
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id,
      case when candidate_count = 0 then 'ghl_lifecycle_unknown_lead_binding' else 'ghl_lifecycle_ambiguous_lead_binding' end,
      object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  end if;

  select * into lead_record
  from public.leads lead
  where lead.id = resolved_lead_id_value
    and lead.organization_id = mapping_record.organization_id
  for update;
  if not found then
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id, 'ghl_lifecycle_lead_tenant_conflict', object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  end if;

  if object_kind_value = 'appointment' then
    select * into appointment_record
    from public.appointments appointment
    where appointment.ghl_location_mapping_id = mapping_record.id
      and appointment.ghl_appointment_id = trim(p_provider_object_id)
    for update;
    appointment_found := found;
    if appointment_found and (
      appointment_record.organization_id is distinct from mapping_record.organization_id
      or appointment_record.lead_id is distinct from resolved_lead_id_value
    ) then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_appointment_binding_conflict', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;
    if p_event_type = 'AppointmentDelete' and not appointment_found then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_appointment_delete_without_binding', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;
    if p_event_type <> 'AppointmentDelete' and p_starts_at is null then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_appointment_start_missing', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;
    if lead_record.user_id is null or lead_record.campaign_id is null then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_lead_campaign_identity_missing', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;
    if p_event_type <> 'AppointmentDelete' and provider_status_value not in (
      'new', 'confirmed', 'active', 'showed', 'completed', 'cancelled', 'canceled', 'noshow', 'no_show'
    ) then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_appointment_status_unknown', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;
    canonical_status_value := case
      when p_event_type = 'AppointmentDelete' or provider_status_value in ('cancelled', 'canceled') then 'canceled'
      when provider_status_value in ('noshow', 'no_show') then 'no_show'
      when provider_status_value in ('completed', 'showed') then 'completed'
      else 'booked'
    end;
    if appointment_found then
      update public.appointments appointment set
        user_id = coalesce(appointment.user_id, lead_record.user_id),
        campaign_id = coalesce(appointment.campaign_id, lead_record.campaign_id),
        scheduled_at = coalesce(p_starts_at, appointment.scheduled_at),
        status = canonical_status_value, appointment_type = coalesce(appointment.appointment_type, 'ghl'),
        ghl_contact_id = coalesce(provider_contact_value, appointment.ghl_contact_id),
        ghl_calendar_id = coalesce(nullif(trim(p_provider_calendar_id), ''), appointment.ghl_calendar_id),
        ghl_provider_updated_at = provider_time_value, ghl_ends_at = coalesce(p_ends_at, appointment.ghl_ends_at),
        ghl_deleted_at = case when p_event_type = 'AppointmentDelete' then p_received_at else null end,
        ghl_last_event_id = trim(p_provider_event_id), ghl_last_payload_fingerprint = p_payload_fingerprint,
        updated_at = p_received_at
      where appointment.id = appointment_record.id returning appointment.id into canonical_appointment_id_value;
    else
      insert into public.appointments (
        organization_id, user_id, campaign_id, lead_id, scheduled_at, status, appointment_type,
        ghl_location_mapping_id, ghl_appointment_id, ghl_contact_id, ghl_calendar_id,
        ghl_provider_updated_at, ghl_ends_at, ghl_last_event_id, ghl_last_payload_fingerprint,
        created_at, updated_at
      ) values (
        mapping_record.organization_id, lead_record.user_id, lead_record.campaign_id, resolved_lead_id_value,
        p_starts_at, canonical_status_value, 'ghl', mapping_record.id, trim(p_provider_object_id),
        provider_contact_value, nullif(trim(p_provider_calendar_id), ''), provider_time_value, p_ends_at,
        trim(p_provider_event_id), p_payload_fingerprint, p_received_at, p_received_at
      ) returning id into canonical_appointment_id_value;
    end if;
    if canonical_status_value in ('booked', 'completed') then
      update public.leads set status = 'booked', updated_at = p_received_at
      where id = resolved_lead_id_value and organization_id = mapping_record.organization_id;
    end if;
  elsif object_kind_value = 'opportunity' then
    if provider_status_value not in ('open', 'won', 'lost', 'abandoned') then
      perform private.record_ghl_lifecycle_operator_action_v1(
        result_record.id, 'ghl_lifecycle_opportunity_status_unknown', object_kind_value, p_received_at
      );
      select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
      return result_record;
    end if;
    update public.leads set
      status = case
        when provider_status_value in ('lost', 'abandoned') then 'lost'
        when provider_status_value = 'won' then 'booked'
        when status in ('new', 'engaged') then 'qualified'
        else status
      end,
      updated_at = p_received_at
    where id = resolved_lead_id_value and organization_id = mapping_record.organization_id;
  end if;

  insert into public.ghl_lifecycle_object_states (
    organization_id, location_mapping_id, lead_id, object_kind, provider_object_id,
    provider_contact_id, provider_status, canonical_appointment_id, last_event_id,
    last_event_type, last_provider_updated_at, last_received_at, last_payload_fingerprint,
    created_at, updated_at
  ) values (
    mapping_record.organization_id, mapping_record.id, resolved_lead_id_value, object_kind_value,
    trim(p_provider_object_id), provider_contact_value, provider_status_value,
    canonical_appointment_id_value, trim(p_provider_event_id), p_event_type, provider_time_value,
    p_received_at, p_payload_fingerprint, p_received_at, p_received_at
  ) on conflict (location_mapping_id, object_kind, provider_object_id) do update set
    provider_contact_id = excluded.provider_contact_id,
    provider_status = excluded.provider_status,
    canonical_appointment_id = coalesce(excluded.canonical_appointment_id, public.ghl_lifecycle_object_states.canonical_appointment_id),
    last_event_id = excluded.last_event_id, last_event_type = excluded.last_event_type,
    last_provider_updated_at = excluded.last_provider_updated_at,
    last_received_at = excluded.last_received_at,
    last_payload_fingerprint = excluded.last_payload_fingerprint,
    updated_at = excluded.updated_at
  where public.ghl_lifecycle_object_states.organization_id = excluded.organization_id
    and public.ghl_lifecycle_object_states.lead_id = excluded.lead_id;
  if not found then
    perform private.record_ghl_lifecycle_operator_action_v1(
      result_record.id, 'ghl_lifecycle_object_binding_conflict', object_kind_value, p_received_at
    );
    select * into strict result_record from public.ghl_lifecycle_webhook_events where id = result_record.id;
    return result_record;
  end if;
  update public.ghl_lifecycle_webhook_events
  set projection_status = 'reconciled', projection_code = 'canonical_state_projected',
      resolved_lead_id = resolved_lead_id_value,
      canonical_appointment_id = canonical_appointment_id_value,
      projected_at = p_received_at
  where id = result_record.id returning * into strict result_record;
  return result_record;
end;
$$;

create or replace function private.terminalize_ghl_inbound_reconciliation_v1(
  p_reconciliation_id uuid,
  p_blocker_code text,
  p_provider_submission_id text,
  p_provider_form_id text,
  p_provider_request_id text,
  p_response_fingerprint text,
  p_now timestamptz
)
returns public.ghl_inbound_form_reconciliations
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  result_record public.ghl_inbound_form_reconciliations%rowtype;
begin
  update public.ghl_inbound_form_reconciliations reconciliation set
    status = 'operator_action_required',
    provider_read_count = reconciliation.provider_read_count + 1,
    provider_request_id = nullif(trim(coalesce(p_provider_request_id, '')), ''),
    response_fingerprint = p_response_fingerprint,
    matched_provider_submission_id = nullif(trim(coalesce(p_provider_submission_id, '')), ''),
    matched_provider_form_id = nullif(trim(coalesce(p_provider_form_id, '')), ''),
    last_error_code = trim(p_blocker_code),
    next_retry_at = null,
    locked_by = null, locked_at = null, locked_until = null, lease_token = null,
    completed_at = p_now,
    updated_at = p_now
  where reconciliation.id = p_reconciliation_id
  returning * into strict result_record;
  perform private.record_ghl_lifecycle_operator_action_v1(
    result_record.lifecycle_event_id, trim(p_blocker_code), 'contact', p_now
  );
  return result_record;
end;
$$;

create or replace function public.apply_ghl_inbound_form_submission_v1(
  p_reconciliation_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_provider_submission_id text,
  p_provider_form_id text,
  p_provider_contact_id text,
  p_submitted_at timestamptz,
  p_name text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_phone_raw text,
  p_qualification jsonb,
  p_attribution jsonb,
  p_submission_fingerprint text,
  p_has_more_unseen boolean,
  p_provider_request_id text,
  p_response_fingerprint text,
  p_now timestamptz default timezone('utc', now())
)
returns public.ghl_inbound_form_reconciliations
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  current_record public.ghl_inbound_form_reconciliations%rowtype;
  result_record public.ghl_inbound_form_reconciliations%rowtype;
  existing_binding public.ghl_inbound_form_submission_bindings%rowtype;
  personalization_record public.ghl_location_personalizations%rowtype;
  campaign_record public.campaign_plans%rowtype;
  capture_record record;
  route_count integer;
  qualification_fields jsonb;
  custom_answers jsonb := '[]'::jsonb;
  sms_consent boolean := false;
  advertising_consent boolean := false;
  commercially_activated boolean := false;
  can_capture boolean := false;
  billing_status text;
  billing_period_end timestamptz;
  billing_cancel_at_period_end boolean;
  billing_metadata jsonb;
  billing_count integer := 0;
  normalized_name text;
  normalized_first_name text;
  normalized_last_name text;
  normalized_email text;
  normalized_phone text;
  dedupe_hash_value text;
  lead_id_value uuid;
  binding_lead_count integer := 0;
  binding_only_lead_id uuid;
  binding_only_submission_id text;
  binding_only_form_id text;
  job_payload jsonb;
  consent_metadata jsonb;
  lead_metadata jsonb;
  accepted_values text[] := array['1', 'true', 'yes', 'on', 'accepted', 'consented'];
begin
  select * into strict current_record
  from public.ghl_inbound_form_reconciliations reconciliation
  where reconciliation.id = p_reconciliation_id
    and reconciliation.status = 'processing'
    and reconciliation.locked_by = trim(p_worker_id)
    and reconciliation.lease_token = p_lease_token
    and reconciliation.lease_generation = p_lease_generation
    and reconciliation.locked_until > p_now
  for update;

  if coalesce(p_provider_submission_id, '') !~ '^[A-Za-z0-9_-]{3,180}$'
     or coalesce(p_provider_form_id, '') !~ '^[A-Za-z0-9_-]{3,180}$'
     or coalesce(p_provider_contact_id, '') !~ '^[A-Za-z0-9_-]{3,180}$'
     or p_submission_fingerprint !~ '^[a-f0-9]{64}$'
     or p_has_more_unseen is null
     or p_response_fingerprint !~ '^[a-f0-9]{64}$'
     or length(coalesce(p_provider_request_id, '')) > 240
     or p_submitted_at is null
     or jsonb_typeof(coalesce(p_qualification, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_attribution, '{}'::jsonb)) <> 'object' then
    return private.terminalize_ghl_inbound_reconciliation_v1(
      current_record.id, 'ghl_form_submission_contract_invalid', p_provider_submission_id,
      p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
    );
  end if;
  if p_provider_contact_id is distinct from current_record.provider_contact_id
     or p_submitted_at < current_record.reconciliation_window_start
     or p_submitted_at > current_record.reconciliation_window_end then
    return private.terminalize_ghl_inbound_reconciliation_v1(
      current_record.id, 'ghl_form_submission_scope_mismatch', p_provider_submission_id,
      p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    current_record.location_mapping_id::text || ':submission:' || p_provider_submission_id, 0
  ));
  select * into existing_binding
  from public.ghl_inbound_form_submission_bindings binding
  where binding.location_mapping_id = current_record.location_mapping_id
    and binding.provider_submission_id = p_provider_submission_id;
  if found then
    if existing_binding.provider_form_id is distinct from p_provider_form_id
       or existing_binding.provider_contact_id is distinct from p_provider_contact_id
       or existing_binding.submission_fingerprint is distinct from p_submission_fingerprint then
      return private.terminalize_ghl_inbound_reconciliation_v1(
        current_record.id, 'ghl_form_submission_idempotency_conflict', p_provider_submission_id,
        p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
      );
    end if;
    if not p_has_more_unseen then
      select count(*)::integer,
             case when count(*) = 1 then min(binding.lead_id::text)::uuid else null end,
             case when count(*) = 1 then min(binding.provider_submission_id) else null end,
             case when count(*) = 1 then min(binding.provider_form_id) else null end
      into binding_lead_count, binding_only_lead_id, binding_only_submission_id, binding_only_form_id
      from public.ghl_inbound_form_submission_bindings binding
      where binding.lifecycle_event_id = current_record.lifecycle_event_id;
    end if;
    update public.ghl_inbound_form_reconciliations reconciliation set
      status = case when p_has_more_unseen then 'processing' else 'completed' end,
      provider_read_count = reconciliation.provider_read_count + case when p_has_more_unseen then 0 else 1 end,
      provider_request_id = nullif(trim(coalesce(p_provider_request_id, '')), ''),
      response_fingerprint = p_response_fingerprint,
      matched_provider_submission_id = case
        when p_has_more_unseen then reconciliation.matched_provider_submission_id
        when binding_lead_count = 0 then p_provider_submission_id
        else binding_only_submission_id
      end,
      matched_provider_form_id = case
        when p_has_more_unseen then reconciliation.matched_provider_form_id
        when binding_lead_count = 0 then p_provider_form_id
        else binding_only_form_id
      end,
      captured_submission_count = case when p_has_more_unseen then reconciliation.captured_submission_count else binding_lead_count end,
      resolved_lead_id = case
        when p_has_more_unseen then reconciliation.resolved_lead_id
        when binding_lead_count = 0 then existing_binding.lead_id
        else binding_only_lead_id
      end,
      last_error_code = null, last_error_message = null, next_retry_at = null,
      locked_by = case when p_has_more_unseen then reconciliation.locked_by else null end,
      locked_at = case when p_has_more_unseen then reconciliation.locked_at else null end,
      locked_until = case when p_has_more_unseen then reconciliation.locked_until else null end,
      lease_token = case when p_has_more_unseen then reconciliation.lease_token else null end,
      completed_at = case when p_has_more_unseen then null else p_now end,
      updated_at = p_now
    where reconciliation.id = current_record.id returning * into strict result_record;
    if not p_has_more_unseen then
      update public.ghl_lifecycle_webhook_events
      set projection_status = 'reconciled',
          projection_code = case
            when binding_lead_count = 0 then 'form_submission_exact_replay'
            when binding_lead_count = 1 then 'native_ghl_form_submission_captured_with_exact_replay'
            else 'multiple_native_ghl_form_submissions_captured_with_exact_replay'
          end,
          resolved_lead_id = case when binding_lead_count = 0 then existing_binding.lead_id else binding_only_lead_id end,
          projected_at = p_now
      where id = current_record.lifecycle_event_id;
    end if;
    return result_record;
  end if;

  qualification_fields := coalesce(p_qualification -> 'fields', '[]'::jsonb);
  if jsonb_typeof(qualification_fields) <> 'array'
     or jsonb_array_length(qualification_fields) > 100
     or exists (
       select 1 from jsonb_array_elements(qualification_fields) field
       where jsonb_typeof(field) <> 'object'
          or coalesce(field ->> 'id', '') !~ '^[A-Za-z0-9_-]{3,180}$'
          or length(coalesce(field ->> 'value', '')) > 500
     )
     or exists (
       select 1 from jsonb_array_elements(qualification_fields) field
       group by field ->> 'id' having count(*) > 1
     ) then
    return private.terminalize_ghl_inbound_reconciliation_v1(
      current_record.id, 'ghl_form_qualification_contract_invalid', p_provider_submission_id,
      p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
    );
  end if;

  perform 1
  from public.ghl_runtime_controls control
  where control.environment = current_record.environment
    and control.inbound_form_reconciliation_enabled
  for share;
  if not found then
    update public.ghl_inbound_form_reconciliations reconciliation set
      status = 'retryable_failure',
      -- A committed credential-rotation fence is not a failed data attempt.
      -- Preserve the provider evidence, give the attempt back, and let the
      -- exact submission replay after the new authority is active.
      attempt_count = greatest(reconciliation.attempt_count - 1, 0),
      provider_read_count = reconciliation.provider_read_count + 1,
      provider_request_id = nullif(trim(coalesce(p_provider_request_id, '')), ''),
      response_fingerprint = p_response_fingerprint,
      matched_provider_submission_id = p_provider_submission_id,
      matched_provider_form_id = p_provider_form_id,
      last_error_code = 'ghl_inbound_reconciliation_fenced_for_authority_rotation',
      last_error_message = null,
      next_retry_at = p_now + interval '30 seconds',
      locked_by = null, locked_at = null, locked_until = null, lease_token = null,
      completed_at = null,
      updated_at = p_now
    where reconciliation.id = current_record.id
    returning * into strict result_record;
    return result_record;
  end if;

  select count(distinct personalization.id)::integer into route_count
  from public.ghl_location_personalizations personalization
  join public.campaign_plans campaign
    on campaign.id = personalization.campaign_id
   and campaign.organization_id = personalization.organization_id
  join public.ghl_location_mappings mapping
    on mapping.id = personalization.location_mapping_id
   and mapping.organization_id = personalization.organization_id
   and mapping.environment = personalization.environment
  where personalization.location_mapping_id = current_record.location_mapping_id
    and personalization.environment = current_record.environment
    and personalization.required_form_ids ? p_provider_form_id
    and personalization.status = 'ready'
    and personalization.current_step = 'ready'
    and personalization.verified_at is not null
    and campaign.publish_state = 'published'
    and mapping.status = 'active'
    and exists (
      select 1 from public.ghl_provisioning_runs run
      where run.organization_id = personalization.organization_id
        and run.environment = personalization.environment
        and run.location_mapping_id = personalization.location_mapping_id
        and run.snapshot_manifest_id = mapping.snapshot_manifest_id
        and run.state = 'ready'
    )
    and personalization.inbound_consent_contract_fingerprint =
      private.current_ghl_inbound_contract_fingerprint_v1(personalization.id)
    and personalization.source_plan_fingerprint = public.ghl_campaign_personalization_source_fingerprint_v2(
      campaign.plan, campaign.id, campaign.organization_id
    );
  if route_count <> 1 then
    return private.terminalize_ghl_inbound_reconciliation_v1(
      current_record.id,
      case when route_count = 0 then 'ghl_form_submission_route_missing' else 'ghl_form_submission_route_ambiguous' end,
      p_provider_submission_id, p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
    );
  end if;

  select personalization.* into strict personalization_record
  from public.ghl_location_personalizations personalization
  join public.campaign_plans campaign
    on campaign.id = personalization.campaign_id
   and campaign.organization_id = personalization.organization_id
  join public.ghl_location_mappings mapping
    on mapping.id = personalization.location_mapping_id
   and mapping.organization_id = personalization.organization_id
   and mapping.environment = personalization.environment
  where personalization.location_mapping_id = current_record.location_mapping_id
    and personalization.environment = current_record.environment
    and personalization.required_form_ids ? p_provider_form_id
    and personalization.status = 'ready' and personalization.current_step = 'ready'
    and personalization.verified_at is not null and campaign.publish_state = 'published'
    and mapping.status = 'active'
    and exists (
      select 1 from public.ghl_provisioning_runs run
      where run.organization_id = personalization.organization_id
        and run.environment = personalization.environment
        and run.location_mapping_id = personalization.location_mapping_id
        and run.snapshot_manifest_id = mapping.snapshot_manifest_id
        and run.state = 'ready'
    )
    and personalization.inbound_consent_contract_fingerprint =
      private.current_ghl_inbound_contract_fingerprint_v1(personalization.id)
    and personalization.source_plan_fingerprint = public.ghl_campaign_personalization_source_fingerprint_v2(
      campaign.plan, campaign.id, campaign.organization_id
    )
  for share of personalization, campaign, mapping;
  perform 1
  from public.ghl_provisioning_runs run
  join public.ghl_location_mappings mapping
    on mapping.id = run.location_mapping_id
   and mapping.organization_id = run.organization_id
   and mapping.environment = run.environment
   and mapping.snapshot_manifest_id = run.snapshot_manifest_id
  where run.organization_id = personalization_record.organization_id
    and run.environment = personalization_record.environment
    and run.location_mapping_id = personalization_record.location_mapping_id
    and run.state = 'ready'
  order by run.ready_at desc nulls last, run.id
  limit 1
  for share of run;
  if not found then
    return private.terminalize_ghl_inbound_reconciliation_v1(
      current_record.id, 'ghl_form_submission_route_missing', p_provider_submission_id,
      p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
    );
  end if;
  perform 1
  from public.ghl_snapshot_manifests manifest
  join public.ghl_location_mappings mapping
    on mapping.snapshot_manifest_id = manifest.id
   and mapping.installation_id = manifest.installation_id
   and mapping.environment = manifest.environment
  where mapping.id = personalization_record.location_mapping_id
    and mapping.organization_id = personalization_record.organization_id
    and mapping.status = 'active'
    and manifest.status = 'approved'
  for share of manifest;
  if not found or personalization_record.inbound_consent_contract_fingerprint is distinct from
      private.current_ghl_inbound_contract_fingerprint_v1(personalization_record.id) then
    return private.terminalize_ghl_inbound_reconciliation_v1(
      current_record.id, 'ghl_inbound_personalization_contract_stale', p_provider_submission_id,
      p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
    );
  end if;
  select * into strict campaign_record
  from public.campaign_plans campaign
  where campaign.id = personalization_record.campaign_id
    and campaign.organization_id = personalization_record.organization_id
    and campaign.publish_state = 'published'
  for share;

  if exists (
    select 1 from jsonb_array_elements(personalization_record.inbound_question_contract) mapping
    where not exists (
      select 1 from jsonb_array_elements(qualification_fields) field
      where field ->> 'id' = mapping ->> 'fieldId'
        and length(trim(coalesce(field ->> 'value', ''))) between 1 and 500
    )
  ) then
    return private.terminalize_ghl_inbound_reconciliation_v1(
      current_record.id, 'ghl_form_required_qualification_answer_missing', p_provider_submission_id,
      p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
    );
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'question', mapping ->> 'question', 'answer', field ->> 'value',
    'providerFieldId', mapping ->> 'fieldId',
    'contractVersion', personalization_record.inbound_question_contract_version
  ) order by ordinal), '[]'::jsonb)
  into custom_answers
  from jsonb_array_elements(personalization_record.inbound_question_contract) with ordinality mapped(mapping, ordinal)
  join jsonb_array_elements(qualification_fields) field
    on field ->> 'id' = mapping ->> 'fieldId';

  sms_consent := personalization_record.inbound_sms_consent_field_id is not null and exists (
    select 1 from jsonb_array_elements(qualification_fields) field
    where field ->> 'id' = personalization_record.inbound_sms_consent_field_id
      and lower(trim(field ->> 'value')) = any(accepted_values)
  );
  advertising_consent := personalization_record.inbound_advertising_consent_field_id is not null and exists (
    select 1 from jsonb_array_elements(qualification_fields) field
    where field ->> 'id' = personalization_record.inbound_advertising_consent_field_id
      and lower(trim(field ->> 'value')) = any(accepted_values)
  );

  select count(*)::integer into billing_count
  from public.billing_subscriptions subscription
  where subscription.organization_id = personalization_record.organization_id;
  if billing_count <> 1 then
    return private.terminalize_ghl_inbound_reconciliation_v1(
      current_record.id,
      case when billing_count = 0 then 'ghl_inbound_billing_state_missing' else 'ghl_inbound_billing_state_ambiguous' end,
      p_provider_submission_id, p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
    );
  end if;
  select lower(trim(subscription.status)), subscription.current_period_end,
    subscription.cancel_at_period_end, coalesce(subscription.metadata, '{}'::jsonb)
  into billing_status, billing_period_end, billing_cancel_at_period_end, billing_metadata
  from public.billing_subscriptions subscription
  where subscription.organization_id = personalization_record.organization_id
  for share;
  commercially_activated := exists (
    select 1 from public.commercial_activations activation
    where activation.organization_id = personalization_record.organization_id
  ) or coalesce(billing_metadata ->> 'legacy_commercial_activation_reconciled', '') = 'true';
  can_capture := commercially_activated and (
    billing_status in ('active', 'trialing', 'past_due', 'incomplete')
    or (
      billing_status in ('canceled', 'cancelled', 'unpaid', 'incomplete_expired', 'paused')
      and coalesce(billing_cancel_at_period_end, false)
      and billing_period_end > p_now
    )
  );
  if not coalesce(can_capture, false) then
    update public.ghl_inbound_form_reconciliations
    set matched_provider_submission_id = p_provider_submission_id,
        matched_provider_form_id = p_provider_form_id,
        provider_request_id = nullif(trim(coalesce(p_provider_request_id, '')), ''),
        response_fingerprint = p_response_fingerprint
    where id = current_record.id;
    return private.terminalize_ghl_inbound_reconciliation_v1(
      current_record.id, 'ghl_inbound_campaign_entitlement_inactive', p_provider_submission_id,
      p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
    );
  end if;

  normalized_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  normalized_phone := nullif(trim(coalesce(p_phone, '')), '');
  normalized_name := nullif(trim(coalesce(p_name, '')), '');
  normalized_first_name := nullif(trim(coalesce(p_first_name, '')), '');
  normalized_last_name := nullif(trim(coalesce(p_last_name, '')), '');
  normalized_first_name := coalesce(normalized_first_name, nullif(split_part(coalesce(normalized_name, ''), ' ', 1), ''), 'Lead');
  normalized_last_name := coalesce(
    normalized_last_name,
    nullif(trim(substr(coalesce(normalized_name, ''), length(normalized_first_name) + 1)), ''),
    'Contact'
  );
  normalized_name := coalesce(normalized_name, trim(normalized_first_name || ' ' || normalized_last_name));
  if normalized_email is null and normalized_phone is null then
    return private.terminalize_ghl_inbound_reconciliation_v1(
      current_record.id, 'ghl_form_submission_contact_method_missing', p_provider_submission_id,
      p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
    );
  end if;
  if (normalized_email is not null and normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
     or (normalized_phone is not null and normalized_phone !~ '^\+[1-9][0-9]{7,14}$')
     or length(coalesce(p_phone_raw, '')) > 80 then
    return private.terminalize_ghl_inbound_reconciliation_v1(
      current_record.id, 'ghl_form_submission_contact_identity_invalid', p_provider_submission_id,
      p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
    );
  end if;
  if length(normalized_name) > 500 or length(normalized_first_name) > 250
     or length(normalized_last_name) > 250 or length(coalesce(normalized_email, '')) > 320
     or length(coalesce(normalized_phone, '')) > 80 then
    return private.terminalize_ghl_inbound_reconciliation_v1(
      current_record.id, 'ghl_form_submission_contact_identity_invalid', p_provider_submission_id,
      p_provider_form_id, p_provider_request_id, p_response_fingerprint, p_now
    );
  end if;

  dedupe_hash_value := encode(extensions.digest(convert_to(
    current_record.location_mapping_id::text || ':' || campaign_record.id::text || ':' || p_provider_submission_id,
    'utf8'
  ), 'sha256'), 'hex');
  consent_metadata := jsonb_build_object(
    'source', 'ghl_native_form_submission',
    'captured_at', p_submitted_at,
    'sms', jsonb_build_object(
      'consented', sms_consent,
      'granted', sms_consent,
      'fieldId', personalization_record.inbound_sms_consent_field_id,
      'policyVersion', personalization_record.inbound_sms_consent_policy_version,
      'captured_at', p_submitted_at,
      'observedAt', p_submitted_at,
      'phone', normalized_phone,
      'consent_copy', personalization_record.inbound_sms_consent_copy,
      'source_url', coalesce(
        nullif(trim(coalesce(p_attribution ->> 'pageUrl', '')), ''),
        nullif(trim(coalesce(p_attribution ->> 'referrer', '')), ''),
        personalization_record.destination_url
      ),
      'privacy_url', '/privacy',
      'terms_url', '/terms'
    ),
    'advertising', jsonb_build_object(
      'granted', advertising_consent,
      'fieldId', personalization_record.inbound_advertising_consent_field_id,
      'policyVersion', personalization_record.inbound_advertising_consent_policy_version,
      'observedAt', p_submitted_at
    )
  );
  lead_metadata := jsonb_build_object(
    'ghl_provider_submission_id', p_provider_submission_id,
    'ghl_provider_form_id', p_provider_form_id,
    'ghl_provider_contact_id', p_provider_contact_id,
    'ghl_personalization_id', personalization_record.id,
    'custom_lead_answers', custom_answers,
    'inbound_question_contract_version', personalization_record.inbound_question_contract_version,
    'attribution', coalesce(p_attribution, '{}'::jsonb)
  );
  job_payload := jsonb_build_object(
    'enabledEffects', case when advertising_consent then jsonb_build_array('meta_conversion') else '[]'::jsonb end,
    'requiredEffects', '[]'::jsonb
  );
  if advertising_consent then
    job_payload := job_payload || jsonb_build_object(
      'advertisingConsent', jsonb_build_object(
        'granted', true,
        'policyVersion', personalization_record.inbound_advertising_consent_policy_version,
        'grantedAt', p_submitted_at,
        'source', 'ghl_native_form:' || personalization_record.inbound_advertising_consent_field_id
      ),
      'metaConversion', jsonb_strip_nulls(jsonb_build_object(
        'eventSourceUrl', coalesce(p_attribution ->> 'pageUrl', p_attribution ->> 'referrer'),
        'fbp', p_attribution ->> 'fbp',
        'fbc', p_attribution ->> 'fbc'
      ))
    );
  end if;

  select * into strict capture_record
  from public.capture_public_lead_with_side_effects_v1(
    personalization_record.organization_id, campaign_record.user_id, campaign_record.id,
    'ghl-form-submission:' || current_record.location_mapping_id::text || ':' || p_provider_submission_id,
    normalized_name, 'ghl_native_form', normalized_first_name, normalized_last_name,
    normalized_email, normalized_phone, nullif(trim(coalesce(p_phone_raw, '')), ''),
    nullif(trim(coalesce(p_attribution ->> 'utmSource', p_attribution ->> 'source', '')), ''),
    nullif(trim(coalesce(p_attribution ->> 'utmMedium', p_attribution ->> 'medium', '')), ''),
    nullif(trim(coalesce(p_attribution ->> 'utmCampaign', '')), ''),
    nullif(trim(coalesce(p_attribution ->> 'adId', '')), ''),
    coalesce(nullif(trim(coalesce(p_attribution ->> 'pageUrl', '')), ''), personalization_record.destination_url),
    dedupe_hash_value, null, consent_metadata, lead_metadata, job_payload, p_submitted_at, null
  );
  lead_id_value := (capture_record.lead_record ->> 'id')::uuid;

  insert into public.ghl_inbound_form_submission_bindings (
    organization_id, user_id, campaign_id, location_mapping_id, personalization_id,
    lifecycle_event_id, lead_id, environment, provider_submission_id, provider_form_id,
    provider_contact_id, submitted_at, consent_contract_fingerprint,
    sms_consent_granted, advertising_consent_granted, qualification_answers, consent_evidence,
    attribution, provider_request_id,
    submission_fingerprint, response_fingerprint, created_at
  ) values (
    personalization_record.organization_id, campaign_record.user_id, campaign_record.id,
    current_record.location_mapping_id, personalization_record.id, current_record.lifecycle_event_id,
    lead_id_value, current_record.environment, p_provider_submission_id, p_provider_form_id,
    p_provider_contact_id, p_submitted_at, personalization_record.inbound_consent_contract_fingerprint,
    sms_consent, advertising_consent, custom_answers, consent_metadata,
    coalesce(p_attribution, '{}'::jsonb),
    nullif(trim(coalesce(p_provider_request_id, '')), ''), p_submission_fingerprint,
    p_response_fingerprint, p_now
  );

  if p_has_more_unseen then
    update public.ghl_inbound_form_reconciliations reconciliation set
      provider_request_id = nullif(trim(coalesce(p_provider_request_id, '')), ''),
      response_fingerprint = p_response_fingerprint,
      matched_provider_submission_id = p_provider_submission_id,
      matched_provider_form_id = p_provider_form_id,
      last_error_code = null, last_error_message = null,
      updated_at = p_now
    where reconciliation.id = current_record.id
      and reconciliation.status = 'processing'
      and reconciliation.locked_by = trim(p_worker_id)
      and reconciliation.lease_token = p_lease_token
      and reconciliation.lease_generation = p_lease_generation
    returning * into strict result_record;
    return result_record;
  end if;

  select count(distinct binding.lead_id)::integer,
         case when count(distinct binding.lead_id) = 1 then min(binding.lead_id::text)::uuid else null end
  into binding_lead_count, binding_only_lead_id
  from public.ghl_inbound_form_submission_bindings binding
  where binding.lifecycle_event_id = current_record.lifecycle_event_id;

  update public.ghl_inbound_form_reconciliations reconciliation set
    status = 'completed', provider_read_count = reconciliation.provider_read_count + 1,
    provider_request_id = nullif(trim(coalesce(p_provider_request_id, '')), ''),
    response_fingerprint = p_response_fingerprint,
    matched_provider_submission_id = case when binding_lead_count = 1 then p_provider_submission_id else null end,
    matched_provider_form_id = case when binding_lead_count = 1 then p_provider_form_id else null end,
    captured_submission_count = binding_lead_count,
    resolved_lead_id = binding_only_lead_id,
    last_error_code = null, last_error_message = null, next_retry_at = null,
    locked_by = null, locked_at = null, locked_until = null, lease_token = null,
    completed_at = p_now, updated_at = p_now
  where reconciliation.id = current_record.id returning * into strict result_record;
  update public.ghl_lifecycle_webhook_events
  set projection_status = 'reconciled',
      projection_code = case when binding_lead_count = 1
        then 'native_ghl_form_submission_captured'
        else 'multiple_native_ghl_form_submissions_captured'
      end,
      resolved_lead_id = binding_only_lead_id, projected_at = p_now
  where id = current_record.lifecycle_event_id;
  return result_record;
end;
$$;

-- Explicit recovery for a signed lifecycle receipt that reached an
-- operator-action state because its read authority or bounded observation
-- failed. The original receipt, window, bindings, and lead idempotency remain
-- intact. A replay is accepted only immediately after the exact active
-- location authority has been re-attested and the runtime gate is open.
create or replace function public.replay_ghl_inbound_form_reconciliation_v1(
  p_organization_id uuid,
  p_reconciliation_id uuid,
  p_environment text,
  p_actor text,
  p_reason text,
  p_authorization text,
  p_now timestamptz
)
returns public.ghl_inbound_form_reconciliations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_record public.ghl_inbound_form_reconciliations%rowtype;
  mapping_record public.ghl_location_mappings%rowtype;
  result_record public.ghl_inbound_form_reconciliations%rowtype;
begin
  if p_environment not in ('sandbox', 'production')
     or p_authorization <> 'DEALFLOW_GHL_INBOUND_RECONCILIATION_REPLAY_EXACT_V1'
     or trim(coalesce(p_actor, '')) !~ '^[A-Za-z0-9@._:-]{3,180}$'
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500
     or p_now < timezone('utc', now()) - interval '15 minutes'
     or p_now > timezone('utc', now()) + interval '5 minutes' then
    raise exception 'ghl_inbound_replay_authorization_invalid';
  end if;

  perform 1
  from public.ghl_runtime_controls controls
  where controls.environment = p_environment
    and controls.inbound_form_reconciliation_enabled
  for share;
  if not found then
    raise exception 'ghl_inbound_replay_requires_open_runtime';
  end if;

  select * into current_record
  from public.ghl_inbound_form_reconciliations reconciliation
  where reconciliation.id = p_reconciliation_id
    and reconciliation.organization_id = p_organization_id
    and reconciliation.environment = p_environment
  for update;
  if not found then
    raise exception 'ghl_inbound_replay_receipt_not_found';
  end if;
  if current_record.status <> 'operator_action_required' then
    raise exception 'ghl_inbound_replay_requires_operator_action_receipt';
  end if;
  if current_record.replay_count >= 5 then
    raise exception 'ghl_inbound_replay_limit_exhausted';
  end if;
  if not coalesce((
    current_record.last_error_code in (
      'ghl_credential_unavailable',
      'ghl_production_credential_unavailable',
      'ghl_credential_reference_invalid',
      'ghl_production_credential_reference_invalid',
      'ghl_form_submission_not_observed_for_unknown_contact',
      'ghl_form_reconciliation_attempts_exhausted'
    )
    or current_record.last_error_code ~ '^ghl_(sandbox|production)_forms_readonly_(authority_missing|scope_unproven|location_mismatch)$'
    or current_record.last_error_code ~ '^ghl_(sandbox|production)_inbound_(ready_forms_missing|mapping_authority_changed)$'
    or current_record.last_error_code ~ '^ghl_form_submissions_read_(400|401|403)$'
  ), false) then
    raise exception 'ghl_inbound_replay_error_not_recoverable';
  end if;

  select * into mapping_record
  from public.ghl_location_mappings mapping
  where mapping.id = current_record.location_mapping_id
    and mapping.organization_id = current_record.organization_id
    and mapping.environment = current_record.environment
    and mapping.status = 'active'
    and mapping.forms_readonly_capabilities = '["forms.readonly"]'::jsonb
    and mapping.forms_readonly_scope_attested_at between p_now - interval '15 minutes' and p_now + interval '5 minutes'
    and (
      (p_environment = 'sandbox' and mapping.forms_readonly_credential_ref ~ '^env:GHL_SANDBOX_LOCATION(_[A-Z0-9]+)*_TOKEN$')
      or (p_environment = 'production' and mapping.forms_readonly_credential_ref ~ '^env:GHL_PRODUCTION_LOCATION(_[A-Z0-9]+)*_TOKEN$')
    )
  for update;
  if not found then
    raise exception 'ghl_inbound_replay_current_location_authority_unproven';
  end if;
  if not exists (
    select 1
    from public.list_ghl_inbound_eligible_form_routes_v1(
      current_record.organization_id,
      current_record.location_mapping_id,
      current_record.environment
    ) route
  ) then
    raise exception 'ghl_inbound_replay_current_form_route_unproven';
  end if;

  update public.ghl_inbound_form_reconciliations reconciliation set
    status = 'pending',
    attempt_count = 0,
    max_attempts = 12,
    provider_read_count = 0,
    next_retry_at = p_now,
    locked_by = null,
    locked_at = null,
    locked_until = null,
    lease_token = null,
    provider_request_id = null,
    response_fingerprint = null,
    matched_provider_submission_id = null,
    matched_provider_form_id = null,
    replay_count = reconciliation.replay_count + 1,
    replay_history = reconciliation.replay_history || jsonb_build_array(jsonb_build_object(
      'replayNumber', reconciliation.replay_count + 1,
      'requestedAt', p_now,
      'requestedBy', trim(p_actor),
      'reason', trim(p_reason),
      'priorErrorCode', reconciliation.last_error_code,
      'priorAttemptCount', reconciliation.attempt_count,
      'priorProviderReadCount', reconciliation.provider_read_count,
      'priorCapturedSubmissionCount', reconciliation.captured_submission_count
    )),
    last_replayed_at = p_now,
    last_replayed_by = trim(p_actor),
    last_replay_reason = trim(p_reason),
    last_error_code = null,
    last_error_message = null,
    completed_at = null,
    updated_at = p_now
  where reconciliation.id = current_record.id
  returning * into strict result_record;

  update public.ghl_lifecycle_webhook_events lifecycle set
    projection_status = 'reconciliation_pending',
    projection_code = 'operator_authorized_reconciliation_replay',
    projected_at = p_now
  where lifecycle.id = current_record.lifecycle_event_id
    and lifecycle.organization_id = current_record.organization_id;
  return result_record;
end;
$$;

-- Remove the superseded production-hardcoded overload. Only the exact
-- deployment-derived environment signature may remain callable.
revoke all on function public.ingest_ghl_lifecycle_webhook_v1(
  text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, text, timestamptz
) from public, anon, authenticated, service_role;
drop function public.ingest_ghl_lifecycle_webhook_v1(
  text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, text, timestamptz
);

revoke all on table public.ghl_inbound_form_reconciliations from anon, authenticated, service_role;
revoke all on table public.ghl_inbound_form_submission_bindings from anon, authenticated, service_role;
grant select on table public.ghl_inbound_form_reconciliations to service_role;
grant select on table public.ghl_inbound_form_submission_bindings to service_role;

revoke all on function private.sync_ghl_inbound_consent_contract_v1() from public, anon, authenticated;
revoke all on function private.ghl_campaign_lead_questions_v1(jsonb) from public, anon, authenticated;
revoke all on function private.invalidate_ghl_personalization_on_question_change_v1() from public, anon, authenticated;
revoke all on function private.current_ghl_inbound_contract_fingerprint_v1(uuid) from public, anon, authenticated;
revoke all on function public.enforce_ghl_snapshot_manifest_identity() from public, anon, authenticated;
revoke all on function private.terminalize_ghl_inbound_reconciliation_v1(
  uuid, text, text, text, text, text, timestamptz
) from public, anon, authenticated;

revoke all on function public.list_ghl_inbound_eligible_form_routes_v1(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.list_ghl_inbound_eligible_form_routes_v1(
  uuid, uuid, text
) to service_role;

revoke all on function public.bind_ghl_inbound_forms_read_authority_v1(
  uuid, uuid, text, text, text, jsonb, jsonb, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.bind_ghl_inbound_forms_read_authority_v1(
  uuid, uuid, text, text, text, jsonb, jsonb, timestamptz
) to service_role;

revoke all on function public.set_ghl_inbound_form_reconciliation_runtime_v1(
  text, boolean, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.set_ghl_inbound_form_reconciliation_runtime_v1(
  text, boolean, timestamptz
) to service_role;

revoke all on function public.drain_ghl_inbound_form_reconciliation_claims_v1(
  text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.drain_ghl_inbound_form_reconciliation_claims_v1(
  text, timestamptz
) to service_role;

revoke all on function public.retire_ghl_location_mapping_v1(
  uuid, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.retire_ghl_location_mapping_v1(
  uuid, uuid, text, text, text, text, timestamptz
) to service_role;

revoke all on function public.configure_ghl_inbound_forms_read_authorities_v1(
  text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.configure_ghl_inbound_forms_read_authorities_v1(
  text, jsonb, timestamptz
) to service_role;

revoke all on function public.claim_next_ghl_inbound_form_reconciliation_v1(
  text, text, timestamptz, integer
) from public, anon, authenticated, service_role;
grant execute on function public.claim_next_ghl_inbound_form_reconciliation_v1(
  text, text, timestamptz, integer
) to service_role;

revoke all on function public.settle_ghl_inbound_form_reconciliation_v1(
  uuid, text, uuid, bigint, text, text, text, integer, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.settle_ghl_inbound_form_reconciliation_v1(
  uuid, text, uuid, bigint, text, text, text, integer, text, text, timestamptz
) to service_role;

revoke all on function public.complete_ghl_inbound_form_reconciliation_without_submission_v1(
  uuid, text, uuid, bigint, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.complete_ghl_inbound_form_reconciliation_without_submission_v1(
  uuid, text, uuid, bigint, text, text, timestamptz
) to service_role;

revoke all on function public.replay_ghl_inbound_form_reconciliation_v1(
  uuid, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.replay_ghl_inbound_form_reconciliation_v1(
  uuid, uuid, text, text, text, text, timestamptz
) to service_role;

revoke all on function public.ingest_ghl_lifecycle_webhook_v1(
  text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.ingest_ghl_lifecycle_webhook_v1(
  text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, text, timestamptz
) to service_role;

revoke all on function public.apply_ghl_inbound_form_submission_v1(
  uuid, text, uuid, bigint, text, text, text, timestamptz,
  text, text, text, text, text, text, jsonb, jsonb, text, boolean,
  text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.apply_ghl_inbound_form_submission_v1(
  uuid, text, uuid, bigint, text, text, text, timestamptz,
  text, text, text, text, text, text, jsonb, jsonb, text, boolean,
  text, text, timestamptz
) to service_role;

do $dealflow_ghl_inbound_postconditions$
declare
  intended regprocedure := to_regprocedure(
    'public.ingest_ghl_lifecycle_webhook_v1(text,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text,timestamptz)'
  );
  apply_proc regprocedure := to_regprocedure(
    'public.apply_ghl_inbound_form_submission_v1(uuid,text,uuid,bigint,text,text,text,timestamptz,text,text,text,text,text,text,jsonb,jsonb,text,boolean,text,text,timestamptz)'
  );
  claim_proc regprocedure := to_regprocedure(
    'public.claim_next_ghl_inbound_form_reconciliation_v1(text,text,timestamptz,integer)'
  );
  settle_proc regprocedure := to_regprocedure(
    'public.settle_ghl_inbound_form_reconciliation_v1(uuid,text,uuid,bigint,text,text,text,integer,text,text,timestamptz)'
  );
  complete_proc regprocedure := to_regprocedure(
    'public.complete_ghl_inbound_form_reconciliation_without_submission_v1(uuid,text,uuid,bigint,text,text,timestamptz)'
  );
  replay_proc regprocedure := to_regprocedure(
    'public.replay_ghl_inbound_form_reconciliation_v1(uuid,uuid,text,text,text,text,timestamptz)'
  );
  route_proc regprocedure := to_regprocedure(
    'public.list_ghl_inbound_eligible_form_routes_v1(uuid,uuid,text)'
  );
  bind_proc regprocedure := to_regprocedure(
    'public.bind_ghl_inbound_forms_read_authority_v1(uuid,uuid,text,text,text,jsonb,jsonb,timestamptz)'
  );
  runtime_proc regprocedure := to_regprocedure(
    'public.set_ghl_inbound_form_reconciliation_runtime_v1(text,boolean,timestamptz)'
  );
  drain_proc regprocedure := to_regprocedure(
    'public.drain_ghl_inbound_form_reconciliation_claims_v1(text,timestamptz)'
  );
  retire_proc regprocedure := to_regprocedure(
    'public.retire_ghl_location_mapping_v1(uuid,uuid,text,text,text,text,timestamptz)'
  );
  configure_proc regprocedure := to_regprocedure(
    'public.configure_ghl_inbound_forms_read_authorities_v1(text,jsonb,timestamptz)'
  );
  ingest_count integer;
begin
  select count(*)::integer into ingest_count
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'ingest_ghl_lifecycle_webhook_v1';
  if ingest_count <> 1 or intended is null or apply_proc is null
     or claim_proc is null or settle_proc is null or complete_proc is null
     or replay_proc is null
     or route_proc is null or bind_proc is null or runtime_proc is null
     or drain_proc is null or retire_proc is null
     or configure_proc is null then
    raise exception 'ghl_inbound_rpc_signature_postcondition_failed';
  end if;
  if has_function_privilege('anon', intended, 'EXECUTE')
     or has_function_privilege('authenticated', intended, 'EXECUTE')
     or has_function_privilege('anon', apply_proc, 'EXECUTE')
     or has_function_privilege('authenticated', apply_proc, 'EXECUTE')
     or has_function_privilege('anon', claim_proc, 'EXECUTE')
     or has_function_privilege('authenticated', claim_proc, 'EXECUTE')
     or has_function_privilege('anon', settle_proc, 'EXECUTE')
     or has_function_privilege('authenticated', settle_proc, 'EXECUTE')
     or has_function_privilege('anon', complete_proc, 'EXECUTE')
     or has_function_privilege('authenticated', complete_proc, 'EXECUTE')
     or has_function_privilege('anon', replay_proc, 'EXECUTE')
     or has_function_privilege('authenticated', replay_proc, 'EXECUTE')
     or has_function_privilege('anon', route_proc, 'EXECUTE')
     or has_function_privilege('authenticated', route_proc, 'EXECUTE')
     or has_function_privilege('anon', bind_proc, 'EXECUTE')
     or has_function_privilege('authenticated', bind_proc, 'EXECUTE')
     or has_function_privilege('anon', runtime_proc, 'EXECUTE')
     or has_function_privilege('authenticated', runtime_proc, 'EXECUTE')
     or has_function_privilege('anon', drain_proc, 'EXECUTE')
     or has_function_privilege('authenticated', drain_proc, 'EXECUTE')
     or has_function_privilege('anon', retire_proc, 'EXECUTE')
     or has_function_privilege('authenticated', retire_proc, 'EXECUTE')
     or has_function_privilege('anon', configure_proc, 'EXECUTE')
     or has_function_privilege('authenticated', configure_proc, 'EXECUTE')
     or not has_function_privilege('service_role', intended, 'EXECUTE')
     or not has_function_privilege('service_role', apply_proc, 'EXECUTE')
     or not has_function_privilege('service_role', claim_proc, 'EXECUTE')
     or not has_function_privilege('service_role', settle_proc, 'EXECUTE')
     or not has_function_privilege('service_role', complete_proc, 'EXECUTE')
     or not has_function_privilege('service_role', replay_proc, 'EXECUTE')
     or not has_function_privilege('service_role', route_proc, 'EXECUTE')
     or not has_function_privilege('service_role', bind_proc, 'EXECUTE')
     or not has_function_privilege('service_role', runtime_proc, 'EXECUTE')
     or not has_function_privilege('service_role', drain_proc, 'EXECUTE')
     or not has_function_privilege('service_role', retire_proc, 'EXECUTE')
     or not has_function_privilege('service_role', configure_proc, 'EXECUTE')
     or has_table_privilege('anon', 'public.ghl_inbound_form_reconciliations', 'SELECT')
     or has_table_privilege('authenticated', 'public.ghl_inbound_form_reconciliations', 'SELECT')
     or has_table_privilege('anon', 'public.ghl_inbound_form_submission_bindings', 'SELECT')
     or has_table_privilege('authenticated', 'public.ghl_inbound_form_submission_bindings', 'SELECT') then
    raise exception 'ghl_inbound_rpc_acl_postcondition_failed';
  end if;
end;
$dealflow_ghl_inbound_postconditions$;
