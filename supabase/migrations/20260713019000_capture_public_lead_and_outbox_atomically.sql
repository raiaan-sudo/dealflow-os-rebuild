-- Public funnel capture is only durable when the canonical lead and its
-- lead_side_effects parent job commit together. This RPC is deliberately
-- service-role-only: the public route performs validation, abuse controls,
-- entitlement checks, and consent capture before entering this transaction.

create or replace function public.capture_public_lead_with_side_effects_v1(
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_request_id text,
  p_name text,
  p_source text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_phone_raw text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_ad_id text,
  p_landing_page_url text,
  p_dedupe_hash text,
  p_notes text,
  p_consent_metadata jsonb,
  p_metadata jsonb,
  p_job_payload jsonb,
  p_created_at timestamptz default timezone('utc', now()),
  p_test_failure_point text default null
)
returns table(
  lead_record jsonb,
  side_effect_job_id uuid,
  lead_created boolean,
  side_effect_job_created boolean,
  lead_receipt jsonb,
  side_effect_job_receipt jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  campaign_record public.campaign_plans%rowtype;
  persisted_lead public.leads%rowtype;
  persisted_job public.system_jobs%rowtype;
  normalized_request_id text := trim(coalesce(p_request_id, ''));
  normalized_dedupe_hash text := lower(trim(coalesce(p_dedupe_hash, '')));
  normalized_source text := trim(coalesce(p_source, ''));
  canonical_lead_payload jsonb;
  canonical_job_payload jsonb;
  job_idempotency_key text;
  inserted_lead boolean := false;
  inserted_job boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_organization_id is null or p_user_id is null or p_campaign_id is null then
    raise exception 'atomic_lead_capture_scope_required' using errcode = '22023';
  end if;
  if normalized_request_id = '' or length(normalized_request_id) > 200 then
    raise exception 'atomic_lead_capture_request_id_invalid' using errcode = '22023';
  end if;
  if normalized_dedupe_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'atomic_lead_capture_dedupe_hash_invalid' using errcode = '22023';
  end if;
  if trim(coalesce(p_name, '')) = ''
     or trim(coalesce(p_first_name, '')) = ''
     or trim(coalesce(p_last_name, '')) = ''
     or normalized_source = ''
     or (nullif(trim(coalesce(p_email, '')), '') is null
         and nullif(trim(coalesce(p_phone, '')), '') is null) then
    raise exception 'atomic_lead_capture_identity_invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_consent_metadata, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_job_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'atomic_lead_capture_payload_invalid' using errcode = '22023';
  end if;
  if p_job_payload ? 'enabledEffects'
     and jsonb_typeof(p_job_payload -> 'enabledEffects') <> 'array' then
    raise exception 'atomic_lead_capture_enabled_effects_invalid' using errcode = '22023';
  end if;
  if p_job_payload ? 'requiredEffects'
     and jsonb_typeof(p_job_payload -> 'requiredEffects') <> 'array' then
    raise exception 'atomic_lead_capture_required_effects_invalid' using errcode = '22023';
  end if;
  if p_job_payload ? 'metaConversion'
     and jsonb_typeof(p_job_payload -> 'metaConversion') <> 'object' then
    raise exception 'atomic_lead_capture_meta_conversion_invalid' using errcode = '22023';
  end if;
  if (p_job_payload ? 'enabledEffects') and exists (
    select 1
    from jsonb_array_elements_text(p_job_payload -> 'enabledEffects') effect(value)
    where effect.value not in ('agent_notification', 'meta_conversion', 'ghl_delivery')
  ) then
    raise exception 'atomic_lead_capture_enabled_effect_unknown' using errcode = '22023';
  end if;
  if (p_job_payload ? 'requiredEffects') and exists (
    select 1
    from jsonb_array_elements_text(p_job_payload -> 'requiredEffects') effect(value)
    where effect.value not in ('agent_notification', 'meta_conversion', 'ghl_delivery')
  ) then
    raise exception 'atomic_lead_capture_required_effect_unknown' using errcode = '22023';
  end if;
  if p_test_failure_point is not null
     and p_test_failure_point not in ('after_lead', 'after_job') then
    raise exception 'atomic_lead_capture_test_failure_point_invalid' using errcode = '22023';
  end if;
  if p_test_failure_point is not null
     and current_setting('dealflow.atomic_lead_capture_test_mode', true) is distinct from 'on' then
    raise exception 'atomic_lead_capture_test_mode_required' using errcode = '42501';
  end if;

  select campaign.*
    into campaign_record
  from public.campaign_plans campaign
  where campaign.id = p_campaign_id
    and campaign.organization_id = p_organization_id
    and campaign.user_id = p_user_id
    and campaign.publish_state = 'published'
  for key share;

  if not found then
    raise exception 'atomic_lead_capture_campaign_scope_invalid' using errcode = '42501';
  end if;

  insert into public.leads (
    organization_id,
    tenant_id,
    user_id,
    campaign_id,
    name,
    source,
    first_name,
    last_name,
    email,
    phone,
    phone_raw,
    phone_e164,
    utm_source,
    utm_medium,
    utm_campaign,
    ad_id,
    landing_page_url,
    dedupe_hash,
    status,
    notes,
    consent_metadata,
    metadata,
    created_at
  ) values (
    p_organization_id,
    p_organization_id,
    p_user_id,
    p_campaign_id,
    trim(p_name),
    normalized_source,
    trim(p_first_name),
    trim(p_last_name),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_phone_raw, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_utm_source, '')), ''),
    nullif(trim(coalesce(p_utm_medium, '')), ''),
    nullif(trim(coalesce(p_utm_campaign, '')), ''),
    nullif(trim(coalesce(p_ad_id, '')), ''),
    nullif(trim(coalesce(p_landing_page_url, '')), ''),
    normalized_dedupe_hash,
    'new',
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_consent_metadata, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_created_at, timezone('utc', now()))
  )
  on conflict (dedupe_hash) where dedupe_hash is not null do nothing
  returning * into persisted_lead;

  inserted_lead := found;
  if not inserted_lead then
    select lead.*
      into persisted_lead
    from public.leads lead
    where lead.dedupe_hash = normalized_dedupe_hash
    for update;

    if not found
       or persisted_lead.organization_id is distinct from p_organization_id
       or persisted_lead.tenant_id is distinct from p_organization_id
       or persisted_lead.user_id is distinct from p_user_id
       or persisted_lead.campaign_id is distinct from p_campaign_id then
      raise exception 'atomic_lead_capture_dedupe_scope_conflict' using errcode = '23505';
    end if;
  end if;

  if p_test_failure_point = 'after_lead' then
    raise exception 'atomic_lead_capture_injected_after_lead' using errcode = 'P0001';
  end if;

  canonical_lead_payload := jsonb_strip_nulls(jsonb_build_object(
    'id', persisted_lead.id,
    'organization_id', persisted_lead.organization_id,
    'tenant_id', persisted_lead.tenant_id,
    'campaign_id', persisted_lead.campaign_id,
    'campaign_name', persisted_lead.campaign_name,
    'name', persisted_lead.name,
    'first_name', persisted_lead.first_name,
    'last_name', persisted_lead.last_name,
    'email', persisted_lead.email,
    'phone', persisted_lead.phone,
    'phone_raw', persisted_lead.phone_raw,
    'phone_e164', persisted_lead.phone_e164,
    'source', persisted_lead.source,
    'lead_type', persisted_lead.lead_type,
    'utm_source', persisted_lead.utm_source,
    'utm_medium', persisted_lead.utm_medium,
    'utm_campaign', persisted_lead.utm_campaign,
    'ad_id', persisted_lead.ad_id,
    'landing_page_url', persisted_lead.landing_page_url,
    'created_at', persisted_lead.created_at
  ));

  canonical_job_payload :=
    (coalesce(p_job_payload, '{}'::jsonb) - 'lead' - 'requestId')
    || jsonb_build_object(
      'requestId', normalized_request_id,
      'lead', canonical_lead_payload
    );

  if canonical_job_payload ? 'metaConversion' then
    canonical_job_payload := jsonb_set(
      canonical_job_payload,
      '{metaConversion}',
      (canonical_job_payload -> 'metaConversion') || jsonb_build_object(
        'organizationId', persisted_lead.organization_id,
        'leadId', persisted_lead.id,
        'campaignId', persisted_lead.campaign_id,
        'eventTime', persisted_lead.created_at,
        'name', persisted_lead.name,
        'email', persisted_lead.email,
        'phone', persisted_lead.phone
      ),
      true
    );
  end if;

  job_idempotency_key := 'lead_side_effects:' || persisted_lead.id::text;
  insert into public.system_jobs (
    organization_id,
    user_id,
    campaign_id,
    kind,
    status,
    payload,
    idempotency_key,
    max_attempts
  ) values (
    p_organization_id,
    p_user_id,
    p_campaign_id,
    'lead_side_effects',
    'pending',
    canonical_job_payload,
    job_idempotency_key,
    3
  )
  on conflict do nothing
  returning * into persisted_job;

  inserted_job := found;
  if not inserted_job then
    select job.*
      into persisted_job
    from public.system_jobs job
    where job.idempotency_key = job_idempotency_key
    for update;

    if not found
       or persisted_job.organization_id is distinct from p_organization_id
       or persisted_job.user_id is distinct from p_user_id
       or persisted_job.campaign_id is distinct from p_campaign_id
       or persisted_job.kind is distinct from 'lead_side_effects'
       or persisted_job.payload #>> '{lead,id}' is distinct from persisted_lead.id::text
       or persisted_job.payload #>> '{lead,organization_id}' is distinct from p_organization_id::text
       or persisted_job.payload #>> '{lead,campaign_id}' is distinct from p_campaign_id::text then
      raise exception 'atomic_lead_capture_job_idempotency_conflict' using errcode = '23505';
    end if;
  end if;

  if p_test_failure_point = 'after_job' then
    raise exception 'atomic_lead_capture_injected_after_job' using errcode = 'P0001';
  end if;

  lead_record := to_jsonb(persisted_lead);
  side_effect_job_id := persisted_job.id;
  lead_created := inserted_lead;
  side_effect_job_created := inserted_job;
  lead_receipt := jsonb_build_object(
    'leadId', persisted_lead.id,
    'organizationId', persisted_lead.organization_id,
    'userId', persisted_lead.user_id,
    'campaignId', persisted_lead.campaign_id,
    'dedupeHash', persisted_lead.dedupe_hash,
    'created', inserted_lead
  );
  side_effect_job_receipt := jsonb_build_object(
    'jobId', persisted_job.id,
    'leadId', persisted_lead.id,
    'organizationId', persisted_job.organization_id,
    'userId', persisted_job.user_id,
    'campaignId', persisted_job.campaign_id,
    'idempotencyKey', persisted_job.idempotency_key,
    'created', inserted_job
  );
  return next;
end;
$$;

revoke all on function public.capture_public_lead_with_side_effects_v1(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, jsonb, jsonb, jsonb,
  timestamptz, text
) from public, anon, authenticated;
grant execute on function public.capture_public_lead_with_side_effects_v1(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, jsonb, jsonb, jsonb,
  timestamptz, text
) to service_role;

comment on function public.capture_public_lead_with_side_effects_v1(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, jsonb, jsonb, jsonb,
  timestamptz, text
) is
  'Atomically persists or reuses one tenant-fenced public lead and one stable lead_side_effects parent job; no provider effect executes inside this transaction.';

-- Historical gaps are never activated by a schema migration. An explicitly
-- authorized operator may only stage inert review records. These records are
-- not claimable and carry an exact empty effect policy; a separate reviewed
-- action is required before any historical customer/provider effect can run.
create or replace function private.stage_missing_lead_side_effect_jobs_for_review_v1(
  p_limit integer
)
returns table(lead_id uuid, side_effect_job_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate public.leads%rowtype;
  inserted_job_id uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'lead_side_effect_backfill_limit_invalid' using errcode = '22023';
  end if;

  for candidate in
    select lead.*
    from public.leads lead
    join public.campaign_plans campaign
      on campaign.id = lead.campaign_id
     and campaign.organization_id = lead.organization_id
     and campaign.user_id = lead.user_id
    where lead.organization_id is not null
      and lead.tenant_id is not distinct from lead.organization_id
      and lead.user_id is not null
      and lead.campaign_id is not null
      and not exists (
        select 1
        from public.system_jobs job
        where job.idempotency_key = 'lead_side_effects:' || lead.id::text
      )
    order by lead.created_at, lead.id
    for update of lead skip locked
    limit p_limit
  loop
    inserted_job_id := null;
    insert into public.system_jobs (
      organization_id,
      user_id,
      campaign_id,
      kind,
      status,
      payload,
      idempotency_key,
      max_attempts
    ) values (
      candidate.organization_id,
      candidate.user_id,
      candidate.campaign_id,
      'lead_side_effects',
      'operator_action_required',
      jsonb_build_object(
        'requestId', 'historical-lead-operator-review:' || candidate.id::text,
        'enabledEffects', jsonb_build_array(),
        'requiredEffects', jsonb_build_array(),
        'historicalRecoveryReviewRequired', true,
        'lead', jsonb_strip_nulls(jsonb_build_object(
          'id', candidate.id,
          'organization_id', candidate.organization_id,
          'tenant_id', candidate.tenant_id,
          'campaign_id', candidate.campaign_id,
          'campaign_name', candidate.campaign_name,
          'name', candidate.name,
          'first_name', candidate.first_name,
          'last_name', candidate.last_name,
          'email', candidate.email,
          'phone', candidate.phone,
          'phone_raw', candidate.phone_raw,
          'phone_e164', candidate.phone_e164,
          'source', candidate.source,
          'lead_type', candidate.lead_type,
          'utm_source', candidate.utm_source,
          'utm_medium', candidate.utm_medium,
          'utm_campaign', candidate.utm_campaign,
          'ad_id', candidate.ad_id,
          'landing_page_url', candidate.landing_page_url,
          'created_at', candidate.created_at
        ))
      ),
      'lead_side_effects:' || candidate.id::text,
      3
    )
    on conflict do nothing
    returning id into inserted_job_id;

    if inserted_job_id is not null then
      lead_id := candidate.id;
      side_effect_job_id := inserted_job_id;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function private.stage_missing_lead_side_effect_jobs_for_review_v1(integer)
  from public, anon, authenticated, service_role;

create or replace function public.stage_missing_lead_side_effect_jobs_for_review_v1(
  p_authorization text,
  p_limit integer default 500
)
returns table(lead_id uuid, side_effect_job_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_authorization is distinct from
    'DEALFLOW_STAGE_HISTORICAL_LEAD_RECOVERY_FOR_OPERATOR_REVIEW_V1'
  then
    raise exception 'historical_lead_recovery_authorization_invalid'
      using errcode = '42501';
  end if;
  return query
    select repair.lead_id, repair.side_effect_job_id
    from private.stage_missing_lead_side_effect_jobs_for_review_v1(p_limit) repair;
end;
$$;

revoke all on function public.stage_missing_lead_side_effect_jobs_for_review_v1(text, integer)
  from public, anon, authenticated;
grant execute on function public.stage_missing_lead_side_effect_jobs_for_review_v1(text, integer)
  to service_role;

comment on function public.stage_missing_lead_side_effect_jobs_for_review_v1(text, integer) is
  'Explicitly authorized service-role staging of inert operator-review records for historical tenant-consistent leads. It never activates communications or provider effects.';

insert into public.app_schema_metadata(key, value, updated_at)
values (
  'atomic_public_lead_side_effect_outbox',
  '20260713019000',
  timezone('utc', now())
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;
