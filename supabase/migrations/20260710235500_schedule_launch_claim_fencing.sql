alter table public.campaign_launch_records
  add column if not exists schedule_attempt_count integer not null default 0,
  add column if not exists schedule_next_attempt_at timestamptz null,
  add column if not exists schedule_locked_at timestamptz null,
  add column if not exists schedule_locked_until timestamptz null,
  add column if not exists schedule_locked_by text null,
  add column if not exists schedule_lease_token uuid null,
  add column if not exists schedule_lease_generation bigint not null default 0,
  add column if not exists schedule_last_error_code text null,
  add column if not exists meta_creative_id text null,
  add column if not exists launch_input_snapshot jsonb null,
  add column if not exists launch_input_digest text null;

alter table public.campaign_launch_records
  drop constraint if exists campaign_launch_records_schedule_attempt_count_check;
alter table public.campaign_launch_records
  add constraint campaign_launch_records_schedule_attempt_count_check
  check (schedule_attempt_count >= 0);

alter table public.campaign_launch_records
  drop constraint if exists campaign_launch_records_schedule_lease_generation_check;
alter table public.campaign_launch_records
  add constraint campaign_launch_records_schedule_lease_generation_check
  check (schedule_lease_generation >= 0);

alter table public.campaign_launch_records
  drop constraint if exists campaign_launch_records_input_snapshot_check;
alter table public.campaign_launch_records
  add constraint campaign_launch_records_input_snapshot_check
  check (
    (launch_input_snapshot is null and launch_input_digest is null)
    or (
      jsonb_typeof(launch_input_snapshot) = 'object'
      and octet_length(launch_input_snapshot::text) between 2 and 32768
      and launch_input_digest ~ '^[0-9a-f]{64}$'
    )
  );

create index if not exists campaign_launch_records_due_schedule_claim_idx
  on public.campaign_launch_records (
    coalesce(schedule_next_attempt_at, scheduled_for),
    schedule_locked_until,
    created_at
  )
  where result_status in ('scheduled', 'failed', 'uncertain', 'partial_success', 'processing');

create unique index if not exists campaign_launch_records_campaign_unique
  on public.campaign_launch_records (campaign_id)
  where campaign_id is not null;

create table if not exists public.campaign_launch_provider_receipts (
  id uuid primary key default gen_random_uuid(),
  launch_id uuid not null references public.campaign_launch_records(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  campaign_id uuid not null,
  lease_generation bigint not null check (lease_generation > 0),
  stage text not null check (stage in ('campaign', 'adset', 'creative', 'ad')),
  object_id text not null check (length(trim(object_id)) > 0),
  response_status integer not null check (response_status between 100 and 599),
  launch_input_digest text not null check (launch_input_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default timezone('utc', now()),
  constraint campaign_launch_provider_receipts_campaign_tenant_fk
    foreign key (campaign_id, organization_id)
    references public.campaign_plans (id, organization_id)
    on delete restrict,
  constraint campaign_launch_provider_receipts_unique
    unique (launch_id, lease_generation, stage, object_id, response_status)
);

alter table public.campaign_launch_provider_receipts enable row level security;
alter table public.campaign_launch_provider_receipts force row level security;
revoke all on public.campaign_launch_provider_receipts from anon, authenticated;

create or replace function public.prevent_campaign_launch_provider_receipt_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Scheduled provider receipts are append-only.';
end;
$$;

drop trigger if exists campaign_launch_provider_receipts_append_only_guard
  on public.campaign_launch_provider_receipts;
create trigger campaign_launch_provider_receipts_append_only_guard
  before update or delete on public.campaign_launch_provider_receipts
  for each row execute function public.prevent_campaign_launch_provider_receipt_mutation();

revoke execute on function public.prevent_campaign_launch_provider_receipt_mutation()
  from public, anon, authenticated;

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
            'status', 'failed',
            'step_status', 'failed',
            'error', left(coalesce(p_message, p_error_code, 'Operator review required.'), 1000),
            'updated_at', changed_at
          ),
          true
        ),
        '{runtime}',
        coalesce(campaign.plan -> 'runtime', '{}'::jsonb) || jsonb_build_object(
          'status', 'launch_ready',
          'safetyState', 'failed',
          'metaPushStatus', 'failed',
          'metaLastMessage', left(coalesce(p_message, p_error_code, 'Operator review required.'), 1000),
          'lastAction', left(coalesce(p_message, p_error_code, 'Operator review required.'), 1000),
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

revoke execute on function private.persist_campaign_launch_operator_truth(uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.bind_campaign_launch_input_snapshot(
  p_launch_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_launch_input_snapshot jsonb,
  p_launch_input_digest text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch public.campaign_launch_records%rowtype;
  changed_at timestamptz := timezone('utc', now());
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to bind launch inputs';
  end if;

  if jsonb_typeof(coalesce(p_launch_input_snapshot, 'null'::jsonb)) <> 'object'
    or octet_length(p_launch_input_snapshot::text) not between 2 and 32768
    or coalesce(p_launch_input_digest, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'campaign launch input snapshot is invalid';
  end if;

  select * into launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_id
  for update;

  if launch.id is null
    or launch.result_status <> 'processing'
    or launch.schedule_locked_by is distinct from p_worker_id
    or launch.schedule_lease_token is distinct from p_lease_token
    or launch.schedule_lease_generation is distinct from p_lease_generation
    or launch.schedule_locked_until <= changed_at then
    return false;
  end if;

  if p_launch_input_snapshot ->> 'schema_version' <> '1'
    or p_launch_input_snapshot ->> 'organization_id' is distinct from launch.organization_id::text
    or p_launch_input_snapshot ->> 'campaign_id' is distinct from launch.campaign_id::text
    or nullif(trim(coalesce(p_launch_input_snapshot ->> 'attempt_id', '')), '') is null
    or nullif(trim(coalesce(p_launch_input_snapshot -> 'provider' ->> 'ad_account_id', '')), '') is null
    or nullif(trim(coalesce(p_launch_input_snapshot -> 'provider' ->> 'page_id', '')), '') is null
    or nullif(trim(coalesce(p_launch_input_snapshot -> 'provider' ->> 'pixel_id', '')), '') is null
    or nullif(trim(coalesce(p_launch_input_snapshot ->> 'destination_url', '')), '') is null
    or coalesce(p_launch_input_snapshot ->> 'destination_host', '') !~ '^[a-z0-9.-]{1,253}$' then
    raise exception 'campaign launch input snapshot does not match its durable launch identity';
  end if;

  if launch.launch_input_snapshot is null and launch.launch_input_digest is null then
    update public.campaign_launch_records candidate
    set launch_input_snapshot = p_launch_input_snapshot,
        launch_input_digest = p_launch_input_digest,
        execution_metadata = candidate.execution_metadata || jsonb_build_object(
          'launchInputSnapshotBound', true,
          'launchInputDigest', p_launch_input_digest,
          'launchInputSchemaVersion', p_launch_input_snapshot ->> 'schema_version'
        ),
        updated_at = changed_at
    where candidate.id = launch.id
      and candidate.result_status = 'processing'
      and candidate.schedule_locked_by = p_worker_id
      and candidate.schedule_lease_token = p_lease_token
      and candidate.schedule_lease_generation = p_lease_generation
      and candidate.schedule_locked_until > changed_at
      and candidate.launch_input_snapshot is null
      and candidate.launch_input_digest is null;

    return found;
  end if;

  if launch.launch_input_snapshot = p_launch_input_snapshot
    and launch.launch_input_digest = p_launch_input_digest then
    return true;
  end if;

  update public.campaign_launch_records candidate
  set result_status = 'operator_action_required',
      schedule_next_attempt_at = null,
      schedule_locked_at = null,
      schedule_locked_until = null,
      schedule_locked_by = null,
      schedule_lease_token = null,
      schedule_last_error_code = 'launch_input_snapshot_mismatch',
      execution_metadata = candidate.execution_metadata || jsonb_build_object(
        'launchInputSnapshotMismatch', true,
        'expectedLaunchInputDigest', candidate.launch_input_digest,
        'observedLaunchInputDigest', p_launch_input_digest
      ),
      event_timeline = candidate.event_timeline || jsonb_build_array(jsonb_build_object(
        'id', 'launch-input-mismatch:generation:' || p_lease_generation::text,
        'label', 'Launch inputs changed during recovery',
        'status', 'failed',
        'target', candidate.campaign_name,
        'detail', 'The provider account or launch payload changed after this launch lineage began. No further provider request is authorized.',
        'timestamp', changed_at
      )),
      updated_at = changed_at
  where candidate.id = launch.id
    and candidate.result_status = 'processing'
    and candidate.schedule_locked_by = p_worker_id
    and candidate.schedule_lease_token = p_lease_token
    and candidate.schedule_lease_generation = p_lease_generation
    and candidate.schedule_locked_until > changed_at;

  if found then
    perform private.persist_campaign_launch_operator_truth(
      launch.id,
      'launch_input_snapshot_mismatch',
      'The immutable launch input lineage changed during recovery. Operator reconciliation is required.'
    );
  end if;

  return false;
end;
$$;

revoke execute on function public.bind_campaign_launch_input_snapshot(uuid, text, uuid, bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.bind_campaign_launch_input_snapshot(uuid, text, uuid, bigint, jsonb, text)
  to service_role;

create or replace function public.arm_campaign_launch_provider_mutation(
  p_launch_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_stage text,
  p_object_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch public.campaign_launch_records%rowtype;
  pending_mutation jsonb;
  armed_at timestamptz := timezone('utc', now());
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to arm provider mutations';
  end if;

  if p_stage not in ('campaign', 'adset', 'creative', 'ad')
    or nullif(trim(coalesce(p_object_key, '')), '') is null
    or length(trim(p_object_key)) > 500 then
    raise exception 'campaign launch provider mutation identity is invalid';
  end if;

  select * into launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_id
  for update;

  if launch.id is null
    or launch.result_status <> 'processing'
    or launch.schedule_locked_by is distinct from p_worker_id
    or launch.schedule_lease_token is distinct from p_lease_token
    or launch.schedule_lease_generation is distinct from p_lease_generation
    or launch.schedule_locked_until <= armed_at
    or launch.launch_input_snapshot is null
    or launch.launch_input_digest is null then
    return false;
  end if;

  pending_mutation := launch.execution_metadata -> 'providerMutationPending';
  if coalesce(pending_mutation ->> 'state', '') = 'pending' then
    return false;
  end if;

  update public.campaign_launch_records candidate
  set execution_metadata = candidate.execution_metadata || jsonb_build_object(
        'providerMutationPending', jsonb_build_object(
          'state', 'pending',
          'stage', p_stage,
          'objectKey', trim(p_object_key),
          'leaseGeneration', p_lease_generation,
          'armedAt', armed_at
        ),
        'providerMutationOutcome', 'ambiguous_until_receipted_or_explicitly_rejected'
      ),
      updated_at = armed_at
  where candidate.id = launch.id
    and candidate.result_status = 'processing'
    and candidate.schedule_locked_by = p_worker_id
    and candidate.schedule_lease_token = p_lease_token
    and candidate.schedule_lease_generation = p_lease_generation
    and candidate.schedule_locked_until > armed_at
    and coalesce(candidate.execution_metadata -> 'providerMutationPending' ->> 'state', '') <> 'pending';

  return found;
end;
$$;

revoke execute on function public.arm_campaign_launch_provider_mutation(uuid, text, uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.arm_campaign_launch_provider_mutation(uuid, text, uuid, bigint, text, text)
  to service_role;

create or replace function public.settle_campaign_launch_provider_mutation(
  p_launch_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_stage text,
  p_object_key text,
  p_outcome text,
  p_object_id text,
  p_response_status integer,
  p_provider_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch public.campaign_launch_records%rowtype;
  pending_mutation jsonb;
  settled_at timestamptz := timezone('utc', now());
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to settle provider mutations';
  end if;

  if p_stage not in ('campaign', 'adset', 'creative', 'ad')
    or nullif(trim(coalesce(p_object_key, '')), '') is null
    or p_outcome not in ('receipted', 'explicit_provider_rejection') then
    raise exception 'campaign launch provider mutation settlement is invalid';
  end if;

  select * into launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_id
  for update;

  if launch.id is null
    or launch.result_status <> 'processing'
    or launch.schedule_locked_by is distinct from p_worker_id
    or launch.schedule_lease_token is distinct from p_lease_token
    or launch.schedule_lease_generation is distinct from p_lease_generation
    or launch.schedule_locked_until <= settled_at then
    return false;
  end if;

  pending_mutation := launch.execution_metadata -> 'providerMutationPending';
  if coalesce(pending_mutation ->> 'state', '') <> 'pending'
    or pending_mutation ->> 'stage' is distinct from p_stage
    or pending_mutation ->> 'objectKey' is distinct from trim(p_object_key)
    or pending_mutation -> 'leaseGeneration' is distinct from to_jsonb(p_lease_generation) then
    return false;
  end if;

  if p_outcome = 'receipted' then
    if nullif(trim(coalesce(p_object_id, '')), '') is null
      or p_response_status not between 200 and 299
      or not exists (
        select 1
        from public.campaign_launch_provider_receipts receipt
        where receipt.launch_id = launch.id
          and receipt.lease_generation = p_lease_generation
          and receipt.stage = p_stage
          and receipt.object_id = trim(p_object_id)
          and receipt.response_status between 200 and 299
          and receipt.launch_input_digest = launch.launch_input_digest
      ) then
      return false;
    end if;
  else
    -- Only an explicit provider rejection body on this bounded status set is
    -- accepted as proof that the create did not succeed. Timeouts, throttles,
    -- conflicts, empty bodies, 2xx-without-ID, and 5xx responses stay pending.
    if p_object_id is not null
      or p_response_status not in (400, 401, 403, 404, 405, 410, 422)
      or coalesce(p_provider_error_code, '') !~ '^[A-Za-z0-9_.:-]{1,100}$' then
      return false;
    end if;
  end if;

  update public.campaign_launch_records candidate
  set execution_metadata = candidate.execution_metadata || jsonb_build_object(
        'providerMutationPending', jsonb_build_object(
          'state', case when p_outcome = 'receipted' then 'receipted' else 'definitive_absence' end,
          'stage', p_stage,
          'objectKey', trim(p_object_key),
          'leaseGeneration', p_lease_generation,
          'settledAt', settled_at,
          'responseStatus', p_response_status,
          'objectId', nullif(trim(coalesce(p_object_id, '')), ''),
          'providerErrorCode', nullif(trim(coalesce(p_provider_error_code, '')), '')
        ),
        'providerMutationOutcome', case
          when p_outcome = 'receipted' then 'durably_receipted'
          else 'explicit_provider_rejection'
        end
      ),
      updated_at = settled_at
  where candidate.id = launch.id
    and candidate.result_status = 'processing'
    and candidate.schedule_locked_by = p_worker_id
    and candidate.schedule_lease_token = p_lease_token
    and candidate.schedule_lease_generation = p_lease_generation
    and candidate.schedule_locked_until > settled_at
    and candidate.execution_metadata -> 'providerMutationPending' = pending_mutation;

  return found;
end;
$$;

revoke execute on function public.settle_campaign_launch_provider_mutation(uuid, text, uuid, bigint, text, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.settle_campaign_launch_provider_mutation(uuid, text, uuid, bigint, text, text, text, text, integer, text)
  to service_role;

create or replace function public.record_campaign_launch_provider_receipt(
  p_launch_id uuid,
  p_lease_generation bigint,
  p_stage text,
  p_object_id text,
  p_response_status integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch public.campaign_launch_records%rowtype;
  receipt_id uuid;
  receipt_inserted boolean := false;
  expected_object_id text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to record scheduled provider receipts';
  end if;

  select * into strict launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_id
  for update;

  if p_lease_generation is null
    or p_lease_generation <= 0
    or p_lease_generation > launch.schedule_lease_generation
    or launch.launch_input_snapshot is null
    or launch.launch_input_digest is null
    or p_stage not in ('campaign', 'adset', 'creative', 'ad')
    or nullif(trim(coalesce(p_object_id, '')), '') is null
    or p_response_status not between 100 and 599 then
    raise exception 'scheduled provider receipt is invalid';
  end if;

  insert into public.campaign_launch_provider_receipts (
    launch_id,
    organization_id,
    campaign_id,
    lease_generation,
    stage,
    object_id,
    response_status,
    launch_input_digest
  ) values (
    launch.id,
    launch.organization_id,
    launch.campaign_id,
    p_lease_generation,
    p_stage,
    trim(p_object_id),
    p_response_status,
    launch.launch_input_digest
  )
  on conflict (launch_id, lease_generation, stage, object_id, response_status)
  do nothing
  returning id into receipt_id;

  if receipt_id is not null then
    receipt_inserted := true;
  else
    select receipt.id into receipt_id
    from public.campaign_launch_provider_receipts receipt
    where receipt.launch_id = launch.id
      and receipt.lease_generation = p_lease_generation
      and receipt.stage = p_stage
      and receipt.object_id = trim(p_object_id)
      and receipt.response_status = p_response_status;
  end if;

  if launch.result_status = 'success' and receipt_inserted then
    expected_object_id := case p_stage
      when 'campaign' then launch.meta_campaign_id
      when 'adset' then launch.meta_ad_set_ids ->> 0
      when 'creative' then launch.meta_creative_id
      when 'ad' then launch.meta_ad_ids ->> 0
    end;

    if p_response_status not between 200 and 299
      or expected_object_id is null
      or expected_object_id is distinct from trim(p_object_id) then
      update public.campaign_launch_records candidate
      set result_status = 'operator_action_required',
          schedule_next_attempt_at = null,
          schedule_locked_at = null,
          schedule_locked_until = null,
          schedule_locked_by = null,
          schedule_lease_token = null,
          schedule_last_error_code = 'late_provider_receipt_conflict',
          execution_metadata = candidate.execution_metadata || jsonb_build_object(
            'lateProviderReceiptConflict', true,
            'lateProviderReceiptStage', p_stage,
            'lateProviderReceiptGeneration', p_lease_generation
          ),
          event_timeline = candidate.event_timeline || jsonb_build_array(jsonb_build_object(
            'id', 'late-provider-receipt:' || receipt_id::text,
            'label', 'Late provider evidence requires reconciliation',
            'status', 'failed',
            'target', candidate.campaign_name,
            'detail', 'A late provider response contradicted the completed object set. Delivery truth is no longer treated as confirmed.',
            'timestamp', timezone('utc', now())
          )),
          updated_at = timezone('utc', now())
      where candidate.id = launch.id;

      perform private.persist_campaign_launch_operator_truth(
        launch.id,
        'late_provider_receipt_conflict',
        'A late provider response contradicted the completed object set. Operator reconciliation is required.'
      );
    end if;
  end if;

  return receipt_id;
end;
$$;

revoke execute on function public.record_campaign_launch_provider_receipt(uuid, bigint, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.record_campaign_launch_provider_receipt(uuid, bigint, text, text, integer)
  to service_role;
revoke insert, update, delete, truncate, references, trigger
  on public.campaign_launch_provider_receipts from service_role;
grant select on public.campaign_launch_provider_receipts to service_role;

create or replace function public.record_legacy_campaign_launch(
  p_organization_id uuid,
  p_user_id uuid,
  p_idempotency_key text,
  p_campaign_name text,
  p_account_name text,
  p_launch_mode text,
  p_result_status text,
  p_scheduled_for timestamptz,
  p_meta_campaign_id text,
  p_meta_ad_set_ids jsonb,
  p_meta_creative_id text,
  p_meta_ad_ids jsonb,
  p_execution_metadata jsonb,
  p_event_timeline jsonb
)
returns public.campaign_launch_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded_launch public.campaign_launch_records%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to record legacy launch history';
  end if;

  if p_organization_id is null
    or p_user_id is null
    or nullif(trim(coalesce(p_idempotency_key, '')), '') is null
    or length(trim(p_idempotency_key)) > 500
    or nullif(trim(coalesce(p_campaign_name, '')), '') is null
    or length(trim(p_campaign_name)) > 300
    or nullif(trim(coalesce(p_launch_mode, '')), '') is null
    or length(trim(p_launch_mode)) > 100
    or p_result_status not in (
      'scheduled',
      'processing',
      'success',
      'partial_success',
      'failed',
      'uncertain',
      'operator_action_required'
    )
    or jsonb_typeof(coalesce(p_meta_ad_set_ids, 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_meta_ad_ids, 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_execution_metadata, 'null'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_event_timeline, 'null'::jsonb)) <> 'array'
    or octet_length(coalesce(p_execution_metadata, '{}'::jsonb)::text) > 65536
    or octet_length(coalesce(p_event_timeline, '[]'::jsonb)::text) > 65536 then
    raise exception 'legacy campaign launch history is invalid';
  end if;

  if not exists (
    select 1
    from public.organizations organization_record
    where organization_record.id = p_organization_id
      and (
        organization_record.owner_user_id = p_user_id
        or exists (
          select 1
          from public.organization_memberships membership_record
          where membership_record.organization_id = p_organization_id
            and membership_record.user_id = p_user_id
        )
      )
  ) then
    raise exception 'legacy campaign launch actor is not a workspace member';
  end if;

  insert into public.campaign_launch_records (
    organization_id,
    user_id,
    campaign_id,
    idempotency_key,
    campaign_name,
    account_name,
    launch_mode,
    result_status,
    scheduled_for,
    meta_campaign_id,
    meta_ad_set_ids,
    meta_creative_id,
    meta_ad_ids,
    execution_metadata,
    event_timeline
  ) values (
    p_organization_id,
    p_user_id,
    null,
    trim(p_idempotency_key),
    trim(p_campaign_name),
    nullif(trim(coalesce(p_account_name, '')), ''),
    trim(p_launch_mode),
    p_result_status,
    p_scheduled_for,
    nullif(trim(coalesce(p_meta_campaign_id, '')), ''),
    p_meta_ad_set_ids,
    nullif(trim(coalesce(p_meta_creative_id, '')), ''),
    p_meta_ad_ids,
    p_execution_metadata,
    p_event_timeline
  )
  on conflict (organization_id, idempotency_key) do nothing
  returning * into recorded_launch;

  if recorded_launch.id is null then
    select * into strict recorded_launch
    from public.campaign_launch_records existing
    where existing.organization_id = p_organization_id
      and existing.idempotency_key = trim(p_idempotency_key)
      and existing.campaign_id is null
      and existing.user_id = p_user_id;
  end if;

  return recorded_launch;
end;
$$;

revoke execute on function public.record_legacy_campaign_launch(uuid, uuid, text, text, text, text, text, timestamptz, text, jsonb, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_legacy_campaign_launch(uuid, uuid, text, text, text, text, text, timestamptz, text, jsonb, text, jsonb, jsonb, jsonb)
  to service_role;

revoke insert, update, delete, truncate, references, trigger
  on public.campaign_launch_records from service_role;
grant select on public.campaign_launch_records to service_role;

create or replace function public.claim_due_campaign_launch_records(
  p_worker_id text,
  p_limit integer default 5,
  p_lease_ms integer default 1800000
)
returns setof public.campaign_launch_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  terminalized_launch public.campaign_launch_records%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to claim scheduled launches';
  end if;

  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'p_worker_id is required';
  end if;

  for terminalized_launch in
    update public.campaign_launch_records launch
    set result_status = 'operator_action_required',
        schedule_next_attempt_at = null,
        schedule_locked_at = null,
        schedule_locked_until = null,
        schedule_locked_by = null,
        schedule_lease_token = null,
        schedule_last_error_code = 'meta_provider_create_outcome_ambiguous',
        execution_metadata = launch.execution_metadata || jsonb_build_object(
          'providerMutationOutcome', 'operator_reconciliation_required',
          'terminalizedBy', 'claim_due_campaign_launch_records',
          'operatorActionId', launch.id
        ),
        event_timeline = launch.event_timeline || jsonb_build_array(jsonb_build_object(
          'id', 'provider-mutation-ambiguous:generation:' || launch.schedule_lease_generation::text,
          'label', 'Provider create outcome requires reconciliation',
          'status', 'failed',
          'target', launch.campaign_name,
          'detail', 'A provider create request was armed but never durably receipted or explicitly rejected. Automatic recreation is stopped.',
          'timestamp', timezone('utc', now())
        )),
        updated_at = timezone('utc', now())
    where launch.result_status = 'processing'
      and launch.schedule_locked_until < timezone('utc', now())
      and coalesce(launch.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
    returning launch.*
  loop
    perform private.persist_campaign_launch_operator_truth(
      terminalized_launch.id,
      'meta_provider_create_outcome_ambiguous',
      'A provider create outcome is ambiguous. Automatic retries are stopped and operator reconciliation is required.'
    );
  end loop;

  for terminalized_launch in
    update public.campaign_launch_records launch
    set result_status = 'operator_action_required',
        schedule_next_attempt_at = null,
        schedule_locked_at = null,
        schedule_locked_until = null,
        schedule_locked_by = null,
        schedule_lease_token = null,
        schedule_last_error_code = 'scheduled_launch_max_attempts_exhausted',
        execution_metadata = launch.execution_metadata || jsonb_build_object(
          'maxAttemptsExhausted', true,
          'terminalizedBy', 'claim_due_campaign_launch_records'
        ),
        event_timeline = launch.event_timeline || jsonb_build_array(jsonb_build_object(
          'id', 'scheduled-launch-max-attempts:' || launch.schedule_lease_generation::text,
          'label', 'Scheduled launch requires operator review',
          'status', 'failed',
          'target', launch.campaign_name,
          'detail', 'The retry limit was exhausted without a durable settlement. Automatic retries are stopped.',
          'timestamp', timezone('utc', now())
        )),
        updated_at = timezone('utc', now())
    where launch.schedule_attempt_count >= 5
      and (
        launch.result_status in ('scheduled', 'failed', 'uncertain', 'partial_success')
        or (
          launch.result_status = 'processing'
          and launch.schedule_locked_until < timezone('utc', now())
        )
      )
    returning launch.*
  loop
    perform private.persist_campaign_launch_operator_truth(
      terminalized_launch.id,
      'scheduled_launch_max_attempts_exhausted',
      'The launch retry limit was exhausted without a durable settlement. Operator review is required.'
    );
  end loop;

  return query
  with due as (
    select launch.id
    from public.campaign_launch_records launch
    where launch.campaign_id is not null
      and exists (
        select 1
        from public.campaign_plans campaign
        where campaign.id = launch.campaign_id
          and campaign.organization_id = launch.organization_id
          and campaign.user_id = launch.user_id
      )
      and launch.scheduled_for is not null
      and launch.scheduled_for <= timezone('utc', now())
      and coalesce(launch.schedule_next_attempt_at, launch.scheduled_for) <= timezone('utc', now())
      and coalesce(launch.execution_metadata -> 'providerMutationPending' ->> 'state', '') <> 'pending'
      and (
        (
          launch.result_status in ('scheduled', 'failed', 'uncertain', 'partial_success')
          and launch.schedule_attempt_count < 5
        )
        or (
          launch.result_status = 'processing'
          and launch.schedule_attempt_count < 5
          and launch.schedule_locked_until < timezone('utc', now())
        )
      )
    order by coalesce(launch.schedule_next_attempt_at, launch.scheduled_for) asc, launch.created_at asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 5), 1), 25)
  )
  update public.campaign_launch_records launch
  set result_status = 'processing',
      schedule_attempt_count = launch.schedule_attempt_count + 1,
      schedule_locked_at = timezone('utc', now()),
      schedule_locked_until = timezone('utc', now())
        + make_interval(secs => least(greatest(coalesce(p_lease_ms, 1800000), 60000), 3600000) / 1000.0),
      schedule_locked_by = trim(p_worker_id),
      schedule_lease_token = gen_random_uuid(),
      schedule_lease_generation = launch.schedule_lease_generation + 1,
      schedule_last_error_code = null,
      updated_at = timezone('utc', now())
  from due
  where launch.id = due.id
  returning launch.*;
end;
$$;

revoke execute on function public.claim_due_campaign_launch_records(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_campaign_launch_records(text, integer, integer)
  to service_role;

create or replace function public.renew_campaign_launch_schedule_lease(
  p_launch_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_lease_ms integer default 1800000
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to renew scheduled launch leases';
  end if;

  update public.campaign_launch_records launch
  set schedule_locked_until = timezone('utc', now())
        + make_interval(secs => least(greatest(coalesce(p_lease_ms, 1800000), 60000), 3600000) / 1000.0),
      updated_at = timezone('utc', now())
  where launch.id = p_launch_id
    and launch.result_status = 'processing'
    and launch.schedule_locked_by = p_worker_id
    and launch.schedule_lease_token = p_lease_token
    and launch.schedule_lease_generation = p_lease_generation
    and launch.schedule_locked_until > timezone('utc', now());

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke execute on function public.renew_campaign_launch_schedule_lease(uuid, text, uuid, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.renew_campaign_launch_schedule_lease(uuid, text, uuid, bigint, integer)
  to service_role;

create or replace function public.persist_campaign_launch_runtime_claim(
  p_launch_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_launch_runtime jsonb,
  p_message text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch public.campaign_launch_records%rowtype;
  campaign public.campaign_plans%rowtype;
  launch_state text;
  runtime_status text;
  runtime_patch jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to persist launch runtime';
  end if;

  if jsonb_typeof(coalesce(p_launch_runtime, 'null'::jsonb)) <> 'object'
    or octet_length(p_launch_runtime::text) > 16384
    or nullif(trim(coalesce(p_message, '')), '') is null
    or length(p_message) > 1000 then
    raise exception 'campaign launch runtime payload is invalid';
  end if;

  launch_state := p_launch_runtime ->> 'status';
  if launch_state not in ('pending', 'in_progress', 'failed') then
    raise exception 'terminal launch runtime must be persisted by the completion RPC';
  end if;

  select * into launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_id
  for update;

  if launch.id is null
    or launch.result_status <> 'processing'
    or launch.schedule_locked_by is distinct from p_worker_id
    or launch.schedule_lease_token is distinct from p_lease_token
    or launch.schedule_lease_generation is distinct from p_lease_generation
    or launch.schedule_locked_until <= timezone('utc', now()) then
    return false;
  end if;

  select * into campaign
  from public.campaign_plans candidate
  where candidate.id = launch.campaign_id
    and candidate.organization_id = launch.organization_id
    and candidate.user_id = launch.user_id
  for update;

  if campaign.id is null then
    raise exception 'campaign launch runtime target does not match its tenant';
  end if;

  runtime_status := case
    when launch_state = 'failed' then 'launch_ready'
    else 'launching'
  end;
  runtime_patch := jsonb_build_object(
    'campaignId', p_launch_runtime -> 'campaign_id',
    'adSetId', p_launch_runtime -> 'adset_id',
    'creativeId', p_launch_runtime -> 'creative_id',
    'adId', p_launch_runtime -> 'ad_id',
    'metaAdSetIds', case
      when nullif(trim(coalesce(p_launch_runtime ->> 'adset_id', '')), '') is null
        then '[]'::jsonb
      else jsonb_build_array(p_launch_runtime ->> 'adset_id')
    end,
    'metaCreativeIds', case
      when nullif(trim(coalesce(p_launch_runtime ->> 'creative_id', '')), '') is null
        then '[]'::jsonb
      else jsonb_build_array(p_launch_runtime ->> 'creative_id')
    end,
    'metaAdIds', case
      when nullif(trim(coalesce(p_launch_runtime ->> 'ad_id', '')), '') is null
        then '[]'::jsonb
      else jsonb_build_array(p_launch_runtime ->> 'ad_id')
    end,
    'metaPushStatus', case when launch_state = 'failed' then 'failed' else 'publishing' end,
    'status', runtime_status,
    'metaLastMessage', trim(p_message),
    'lastAction', trim(p_message),
    'statusUpdatedAt', coalesce(p_launch_runtime -> 'updated_at', to_jsonb(timezone('utc', now())))
  );

  update public.campaign_plans candidate
  set plan = jsonb_set(
        jsonb_set(
          coalesce(candidate.plan, '{}'::jsonb),
          '{launch_runtime}',
          p_launch_runtime,
          true
        ),
        '{runtime}',
        coalesce(candidate.plan -> 'runtime', '{}'::jsonb) || runtime_patch,
        true
      ),
      launch_status = runtime_status,
      updated_at = timezone('utc', now())
  where candidate.id = campaign.id
    and candidate.organization_id = launch.organization_id
    and candidate.user_id = launch.user_id;

  return found;
end;
$$;

revoke execute on function public.persist_campaign_launch_runtime_claim(uuid, text, uuid, bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.persist_campaign_launch_runtime_claim(uuid, text, uuid, bigint, jsonb, text)
  to service_role;

create or replace function private.persist_launch_tracking_contract(
  p_launch_id uuid,
  p_meta_campaign_id text,
  p_meta_ad_set_id text,
  p_meta_ad_ids jsonb,
  p_execution_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch public.campaign_launch_records%rowtype;
  pixel_id text;
  launch_domain text;
  launch_url text;
  launch_input_digest text;
  contract_ready boolean;
  checked_at timestamptz := timezone('utc', now());
begin
  select * into launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_id
    and candidate.result_status = 'success';

  if launch.id is null
    or launch.meta_campaign_id is distinct from trim(p_meta_campaign_id)
    or launch.meta_ad_set_ids is distinct from jsonb_build_array(trim(p_meta_ad_set_id))
    or launch.meta_ad_ids is distinct from p_meta_ad_ids then
    raise exception 'tracking contract requires an exact successful launch receipt';
  end if;

  pixel_id := nullif(trim(coalesce(launch.launch_input_snapshot -> 'provider' ->> 'pixel_id', '')), '');
  launch_domain := nullif(trim(coalesce(launch.launch_input_snapshot ->> 'destination_host', '')), '');
  launch_url := nullif(trim(coalesce(launch.launch_input_snapshot ->> 'destination_url', '')), '');
  launch_input_digest := nullif(trim(coalesce(launch.launch_input_digest, '')), '');

  if launch_input_digest is null
    or nullif(trim(coalesce(p_execution_metadata ->> 'launchInputDigest', '')), '')
      is distinct from launch_input_digest then
    raise exception 'tracking contract launch input lineage does not match the durable receipt';
  end if;

  contract_ready := pixel_id is not null
    and launch_domain is not null
    and launch_url is not null;

  insert into public.campaign_tracking_contracts (
    organization_id,
    campaign_id,
    user_id,
    tracking_mode,
    expected_lead_destination,
    meta_campaign_id,
    meta_adset_id,
    meta_ad_ids,
    pixel_id,
    launch_domain,
    launch_url,
    expected_event_name,
    expected_action_source,
    expected_attribution_params,
    status,
    readiness,
    metadata,
    last_verified_at,
    updated_at
  ) values (
    launch.organization_id,
    launch.campaign_id,
    launch.user_id,
    'website_funnel',
    'dealflow_dashboard',
    launch.meta_campaign_id,
    trim(p_meta_ad_set_id),
    array(select jsonb_array_elements_text(p_meta_ad_ids)),
    pixel_id,
    launch_domain,
    launch_url,
    'Lead',
    'website',
    array['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid']::text[],
    case when contract_ready then 'configured' else 'needs_review' end,
    jsonb_build_object(
      'ready', contract_ready,
      'missing', case when contract_ready then '[]'::jsonb else jsonb_build_array('launch_tracking_configuration') end,
      'checked_at', checked_at
    ),
    jsonb_build_object(
      'source', coalesce(p_execution_metadata ->> 'source', 'campaign_launch_completion_rpc'),
      'launchReceiptId', launch.id,
      'launchLeaseGeneration', launch.schedule_lease_generation,
      'launchInputDigest', launch_input_digest
    ),
    case when contract_ready then checked_at else null end,
    checked_at
  )
  on conflict (campaign_id)
  do update set
    organization_id = excluded.organization_id,
    user_id = excluded.user_id,
    tracking_mode = excluded.tracking_mode,
    expected_lead_destination = excluded.expected_lead_destination,
    meta_campaign_id = excluded.meta_campaign_id,
    meta_adset_id = excluded.meta_adset_id,
    meta_ad_ids = excluded.meta_ad_ids,
    pixel_id = excluded.pixel_id,
    launch_domain = excluded.launch_domain,
    launch_url = excluded.launch_url,
    expected_event_name = excluded.expected_event_name,
    expected_action_source = excluded.expected_action_source,
    expected_attribution_params = excluded.expected_attribution_params,
    status = excluded.status,
    readiness = excluded.readiness,
    metadata = public.campaign_tracking_contracts.metadata || excluded.metadata,
    last_verified_at = excluded.last_verified_at,
    updated_at = excluded.updated_at;

  insert into public.lead_tracking_events (
    organization_id,
    campaign_id,
    event_type,
    status,
    source,
    event_id,
    pixel_id,
    metadata
  ) values (
    launch.organization_id,
    launch.campaign_id,
    case when contract_ready then 'tracking_contract_created' else 'tracking_contract_failed' end,
    case when contract_ready then 'recorded' else 'failed' end,
    'campaign_launch_completion_rpc',
    'launch_tracking:' || launch.id::text,
    pixel_id,
    jsonb_build_object(
      'launchReceiptId', launch.id,
      'launchLeaseGeneration', launch.schedule_lease_generation,
      'launchInputDigest', launch_input_digest,
      'ready', contract_ready
    )
  );
end;
$$;

revoke execute on function private.persist_launch_tracking_contract(uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.complete_campaign_launch_schedule_claim(
  p_launch_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_meta_campaign_id text,
  p_meta_ad_set_ids jsonb,
  p_meta_creative_id text,
  p_meta_ad_ids jsonb,
  p_execution_metadata jsonb,
  p_event jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch public.campaign_launch_records%rowtype;
  stage_name text;
  expected_object_id text;
  distinct_receipt_count integer;
  successful_receipt_count integer;
  lineage_mismatch_count integer;
  receipted_object_id text;
  completed_at timestamptz := timezone('utc', now());
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to complete scheduled launch claims';
  end if;

  if nullif(trim(coalesce(p_meta_campaign_id, '')), '') is null
    or nullif(trim(coalesce(p_meta_creative_id, '')), '') is null
    or jsonb_typeof(coalesce(p_meta_ad_set_ids, 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_meta_ad_ids, 'null'::jsonb)) <> 'array' then
    raise exception 'a complete provider object receipt is required';
  end if;

  if jsonb_array_length(p_meta_ad_set_ids) <> 1
    or jsonb_array_length(p_meta_ad_ids) <> 1 then
    raise exception 'a complete provider object receipt is required';
  end if;

  select * into launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_id
  for update;

  if launch.id is null
    or launch.result_status <> 'processing'
    or launch.schedule_locked_by is distinct from p_worker_id
    or launch.schedule_lease_token is distinct from p_lease_token
    or launch.schedule_lease_generation is distinct from p_lease_generation
    or launch.launch_input_snapshot is null
    or launch.launch_input_digest is null
    or coalesce(launch.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
    or launch.schedule_locked_until <= completed_at then
    return false;
  end if;

  if nullif(trim(coalesce(p_execution_metadata ->> 'launchInputDigest', '')), '')
    is distinct from launch.launch_input_digest then
    raise exception 'scheduled launch completion input lineage does not match its durable snapshot';
  end if;

  foreach stage_name in array array['campaign', 'adset', 'creative', 'ad'] loop
    expected_object_id := case stage_name
      when 'campaign' then nullif(trim(coalesce(p_meta_campaign_id, '')), '')
      when 'adset' then nullif(trim(coalesce(p_meta_ad_set_ids ->> 0, '')), '')
      when 'creative' then nullif(trim(coalesce(p_meta_creative_id, '')), '')
      when 'ad' then nullif(trim(coalesce(p_meta_ad_ids ->> 0, '')), '')
    end;

    select count(distinct receipt.object_id),
        count(*) filter (
          where receipt.response_status between 200 and 299
            and receipt.launch_input_digest = launch.launch_input_digest
        ),
        count(*) filter (
          where receipt.launch_input_digest is distinct from launch.launch_input_digest
        ),
        min(receipt.object_id)
      into distinct_receipt_count, successful_receipt_count, lineage_mismatch_count, receipted_object_id
    from public.campaign_launch_provider_receipts receipt
    where receipt.launch_id = launch.id
      and receipt.lease_generation <= p_lease_generation
      and receipt.stage = stage_name;

    if distinct_receipt_count <> 1
      or successful_receipt_count < 1
      or lineage_mismatch_count <> 0
      or receipted_object_id is distinct from expected_object_id then
      raise exception 'scheduled launch completion does not match successful provider receipts';
    end if;
  end loop;

  update public.campaign_launch_records candidate
  set result_status = 'success',
      launch_mode = 'scheduled_provider_paused',
      meta_campaign_id = nullif(trim(coalesce(p_meta_campaign_id, '')), ''),
      meta_ad_set_ids = coalesce(p_meta_ad_set_ids, '[]'::jsonb),
      meta_creative_id = nullif(trim(coalesce(p_meta_creative_id, '')), ''),
      meta_ad_ids = coalesce(p_meta_ad_ids, '[]'::jsonb),
      execution_metadata = candidate.execution_metadata || coalesce(p_execution_metadata, '{}'::jsonb),
      event_timeline = candidate.event_timeline || jsonb_build_array(coalesce(p_event, '{}'::jsonb)),
      schedule_next_attempt_at = null,
      schedule_locked_at = null,
      schedule_locked_until = null,
      schedule_locked_by = null,
      schedule_lease_token = null,
      schedule_last_error_code = null,
      reconciled_at = completed_at,
      updated_at = completed_at
  where candidate.id = p_launch_id
    and candidate.result_status = 'processing'
    and candidate.schedule_locked_by = p_worker_id
    and candidate.schedule_lease_token = p_lease_token
    and candidate.schedule_lease_generation = p_lease_generation
    and candidate.schedule_locked_until > completed_at;

  if not found then
    return false;
  end if;

  update public.campaign_plans campaign
  set plan = jsonb_set(
        jsonb_set(
          coalesce(campaign.plan, '{}'::jsonb),
          '{launch_runtime}',
          coalesce(campaign.plan -> 'launch_runtime', '{}'::jsonb) || jsonb_build_object(
            'campaign_id', trim(p_meta_campaign_id),
            'adset_id', trim(p_meta_ad_set_ids ->> 0),
            'creative_id', trim(p_meta_creative_id),
            'ad_id', trim(p_meta_ad_ids ->> 0),
            'current_stage', 'ad',
            'status', 'completed',
            'step_status', 'created',
            'error', null,
            'updated_at', completed_at
          ),
          true
        ),
        '{runtime}',
        coalesce(campaign.plan -> 'runtime', '{}'::jsonb) || jsonb_build_object(
          'campaignId', trim(p_meta_campaign_id),
          'adSetId', trim(p_meta_ad_set_ids ->> 0),
          'creativeId', trim(p_meta_creative_id),
          'adId', trim(p_meta_ad_ids ->> 0),
          'metaAdSetIds', p_meta_ad_set_ids,
          'metaCreativeIds', jsonb_build_array(trim(p_meta_creative_id)),
          'metaAdIds', p_meta_ad_ids,
          'metaPushStatus', 'provider_paused',
          'status', 'provider_paused',
          'safetyState', 'paused',
          'metaLastMessage', 'Meta objects were created, receipted, and verified in PAUSED state. Delivery and spend are not inferred.',
          'lastAction', 'Meta objects were created, receipted, and verified in PAUSED state. Delivery and spend are not inferred.',
          'providerObjectsCreatedAt', completed_at,
          'launchedAt', null,
          'statusUpdatedAt', completed_at
        ),
        true
      ),
      launch_status = 'provider_paused',
      updated_at = completed_at
  where campaign.id = launch.campaign_id
    and campaign.organization_id = launch.organization_id
    and campaign.user_id = launch.user_id;

  if not found then
    raise exception 'scheduled launch campaign runtime target is missing';
  end if;

  perform private.persist_launch_tracking_contract(
    launch.id,
    trim(p_meta_campaign_id),
    trim(p_meta_ad_set_ids ->> 0),
    p_meta_ad_ids,
    coalesce(p_execution_metadata, '{}'::jsonb)
  );

  return true;
end;
$$;

revoke execute on function public.complete_campaign_launch_schedule_claim(uuid, text, uuid, bigint, text, jsonb, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_campaign_launch_schedule_claim(uuid, text, uuid, bigint, text, jsonb, text, jsonb, jsonb, jsonb)
  to service_role;

create or replace function public.release_campaign_launch_schedule_claim(
  p_launch_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_result_status text,
  p_next_attempt_at timestamptz,
  p_error_code text,
  p_execution_metadata jsonb,
  p_event jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch public.campaign_launch_records%rowtype;
  settled_status text;
  settled_error_code text;
  settled_at timestamptz := timezone('utc', now());
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to release scheduled launch claims';
  end if;

  if p_result_status not in ('scheduled', 'operator_action_required') then
    raise exception 'scheduled launch release status is invalid';
  end if;

  select * into launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_id
    and candidate.result_status = 'processing'
    and candidate.schedule_locked_by = p_worker_id
    and candidate.schedule_lease_token = p_lease_token
    and candidate.schedule_lease_generation = p_lease_generation
    and candidate.schedule_locked_until > settled_at
  for update;

  if launch.id is null then
    return false;
  end if;

  settled_status := case
    when coalesce(launch.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
      or p_error_code in (
        'meta_provider_create_outcome_ambiguous',
        'scheduled_launch_provider_receipt_persist_failed',
        'campaign_launch_provider_receipt_persist_failed',
        'scheduled_launch_provider_mutation_settlement_failed',
        'campaign_launch_provider_mutation_settlement_failed',
        'meta_lookup_ambiguous'
      ) then 'operator_action_required'
    when launch.schedule_attempt_count >= 5 then 'operator_action_required'
    else p_result_status
  end;
  settled_error_code := case
    when p_error_code in (
      'meta_provider_create_outcome_ambiguous',
      'scheduled_launch_provider_receipt_persist_failed',
      'campaign_launch_provider_receipt_persist_failed',
      'scheduled_launch_provider_mutation_settlement_failed',
      'campaign_launch_provider_mutation_settlement_failed',
      'meta_lookup_ambiguous'
    ) then p_error_code
    when coalesce(launch.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
      then 'meta_provider_create_outcome_ambiguous'
    when launch.schedule_attempt_count >= 5 then 'scheduled_launch_max_attempts_exhausted'
    else nullif(trim(coalesce(p_error_code, '')), '')
  end;

  if settled_status = 'scheduled'
    and (p_next_attempt_at is null or p_next_attempt_at <= settled_at) then
    raise exception 'scheduled launch retry must have a future next-attempt time';
  end if;

  update public.campaign_launch_records candidate
  set result_status = settled_status,
      schedule_next_attempt_at = case
        when settled_status = 'scheduled' then p_next_attempt_at
        else null
      end,
      schedule_locked_at = null,
      schedule_locked_until = null,
      schedule_locked_by = null,
      schedule_lease_token = null,
      schedule_last_error_code = settled_error_code,
      execution_metadata = candidate.execution_metadata
        || coalesce(p_execution_metadata, '{}'::jsonb)
        || case when settled_status = 'operator_action_required'
          then jsonb_build_object(
            'maxAttemptsExhausted', candidate.schedule_attempt_count >= 5,
            'operatorActionId', candidate.id,
            'providerMutationOutcome', case
              when coalesce(candidate.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
                then 'operator_reconciliation_required'
              else candidate.execution_metadata ->> 'providerMutationOutcome'
            end
          )
          else '{}'::jsonb
        end,
      event_timeline = candidate.event_timeline || jsonb_build_array(coalesce(p_event, '{}'::jsonb)),
      updated_at = settled_at
  where candidate.id = launch.id;

  if settled_status = 'operator_action_required' then
    perform private.persist_campaign_launch_operator_truth(
      launch.id,
      coalesce(settled_error_code, 'scheduled_launch_operator_action_required'),
      case
        when coalesce(launch.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
          then 'A provider create request has no durable receipt or explicit rejection. Automatic retries are stopped and operator reconciliation is required.'
        when launch.schedule_attempt_count >= 5
          then 'The fifth scheduled launch attempt did not complete. Automatic retries are stopped and operator review is required.'
        else 'The scheduled launch requires operator review before any retry.'
      end
    );
  end if;

  return true;
end;
$$;

revoke execute on function public.release_campaign_launch_schedule_claim(uuid, text, uuid, bigint, text, timestamptz, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.release_campaign_launch_schedule_claim(uuid, text, uuid, bigint, text, timestamptz, text, jsonb, jsonb)
  to service_role;

comment on function public.claim_due_campaign_launch_records(text, integer, integer) is
  'Atomically claims due scheduled launch intents with SKIP LOCKED and a monotonic fencing generation.';
comment on column public.campaign_launch_records.schedule_lease_generation is
  'Monotonic generation used with the lease token to fence superseded scheduled launch workers.';

create or replace function public.claim_manual_campaign_launch_record(
  p_launch_id uuid,
  p_organization_id uuid,
  p_campaign_id uuid,
  p_expected_campaign_owner_id uuid,
  p_worker_id text,
  p_lease_ms integer default 1800000
)
returns public.campaign_launch_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch public.campaign_launch_records%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to claim manual launches';
  end if;

  if p_launch_id is null
    or p_organization_id is null
    or p_campaign_id is null
    or p_expected_campaign_owner_id is null
    or nullif(trim(coalesce(p_worker_id, '')), '') is null then
    raise exception 'manual campaign launch claim is invalid';
  end if;

  select * into launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_id
    and candidate.organization_id = p_organization_id
    and candidate.campaign_id = p_campaign_id
    and candidate.user_id = p_expected_campaign_owner_id
    and candidate.scheduled_for is not null
    and candidate.scheduled_for <= timezone('utc', now())
    and coalesce(candidate.schedule_next_attempt_at, candidate.scheduled_for)
      <= timezone('utc', now())
  for update;

  if launch.id is not null
    and coalesce(launch.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
    and (
      launch.result_status in ('scheduled', 'failed', 'uncertain', 'partial_success')
      or (
        launch.result_status = 'processing'
        and launch.schedule_locked_until < timezone('utc', now())
      )
    ) then
    update public.campaign_launch_records candidate
    set result_status = 'operator_action_required',
        schedule_next_attempt_at = null,
        schedule_locked_at = null,
        schedule_locked_until = null,
        schedule_locked_by = null,
        schedule_lease_token = null,
        schedule_last_error_code = 'meta_provider_create_outcome_ambiguous',
        execution_metadata = candidate.execution_metadata || jsonb_build_object(
          'providerMutationOutcome', 'operator_reconciliation_required',
          'terminalizedBy', 'claim_manual_campaign_launch_record',
          'operatorActionId', candidate.id
        ),
        event_timeline = candidate.event_timeline || jsonb_build_array(jsonb_build_object(
          'id', 'provider-mutation-ambiguous:generation:' || candidate.schedule_lease_generation::text,
          'label', 'Provider create outcome requires reconciliation',
          'status', 'failed',
          'target', candidate.campaign_name,
          'detail', 'A provider create request was armed but never durably receipted or explicitly rejected. Automatic recreation is stopped.',
          'timestamp', timezone('utc', now())
        )),
        updated_at = timezone('utc', now())
    where candidate.id = launch.id
    returning * into launch;
    perform private.persist_campaign_launch_operator_truth(
      launch.id,
      'meta_provider_create_outcome_ambiguous',
      'A provider create outcome is ambiguous. Automatic retries are stopped and operator reconciliation is required.'
    );
    return null;
  end if;

  if launch.id is not null
    and launch.schedule_attempt_count >= 5
    and (
      launch.result_status in ('scheduled', 'failed', 'uncertain', 'partial_success')
      or (
        launch.result_status = 'processing'
        and launch.schedule_locked_until < timezone('utc', now())
      )
    ) then
    update public.campaign_launch_records candidate
    set result_status = 'operator_action_required',
        schedule_next_attempt_at = null,
        schedule_locked_at = null,
        schedule_locked_until = null,
        schedule_locked_by = null,
        schedule_lease_token = null,
        schedule_last_error_code = 'manual_launch_max_attempts_exhausted',
        execution_metadata = candidate.execution_metadata || jsonb_build_object(
          'maxAttemptsExhausted', true,
          'terminalizedBy', 'claim_manual_campaign_launch_record'
        ),
        event_timeline = candidate.event_timeline || jsonb_build_array(jsonb_build_object(
          'id', 'manual-launch-max-attempts:' || candidate.schedule_lease_generation::text,
          'label', 'Manual launch requires operator review',
          'status', 'failed',
          'target', candidate.campaign_name,
        'detail', 'The manual launch retry limit was exhausted without a durable settlement. Automatic retries are stopped.',
          'timestamp', timezone('utc', now())
        )),
        updated_at = timezone('utc', now())
    where candidate.id = launch.id
    returning * into launch;
    perform private.persist_campaign_launch_operator_truth(
      launch.id,
      'manual_launch_max_attempts_exhausted',
      'The manual launch retry limit was exhausted without a durable settlement. Operator review is required.'
    );
    return null;
  end if;

  if launch.id is null
    or launch.schedule_attempt_count >= 5
    or not (
      launch.result_status in (
        'scheduled',
        'failed',
        'uncertain',
        'partial_success'
      )
      or (
        launch.result_status = 'processing'
        and launch.schedule_locked_until < timezone('utc', now())
      )
    ) then
    return null;
  end if;

  update public.campaign_launch_records candidate
  set result_status = 'processing',
      schedule_attempt_count = candidate.schedule_attempt_count + 1,
      schedule_locked_at = timezone('utc', now()),
      schedule_locked_until = timezone('utc', now())
        + make_interval(secs => least(greatest(coalesce(p_lease_ms, 1800000), 60000), 3600000) / 1000.0),
      schedule_locked_by = trim(p_worker_id),
      schedule_lease_token = gen_random_uuid(),
      schedule_lease_generation = candidate.schedule_lease_generation + 1,
      schedule_last_error_code = null,
      updated_at = timezone('utc', now())
  where candidate.id = launch.id
  returning * into launch;

  return launch;
end;
$$;

revoke execute on function public.claim_manual_campaign_launch_record(uuid, uuid, uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_manual_campaign_launch_record(uuid, uuid, uuid, uuid, text, integer)
  to service_role;

create or replace function public.complete_manual_campaign_launch_claim(
  p_launch_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_meta_campaign_id text,
  p_meta_ad_set_id text,
  p_meta_creative_id text,
  p_meta_ad_id text,
  p_execution_metadata jsonb,
  p_event jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch public.campaign_launch_records%rowtype;
  stage_name text;
  expected_object_id text;
  distinct_receipt_count integer;
  successful_receipt_count integer;
  lineage_mismatch_count integer;
  receipted_object_id text;
  completed_at timestamptz := timezone('utc', now());
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to complete manual launch claims';
  end if;

  select * into launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_id
  for update;

  if launch.id is null
    or launch.result_status <> 'processing'
    or launch.schedule_locked_by is distinct from p_worker_id
    or launch.schedule_lease_token is distinct from p_lease_token
    or launch.schedule_lease_generation is distinct from p_lease_generation
    or launch.launch_input_snapshot is null
    or launch.launch_input_digest is null
    or coalesce(launch.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
    or launch.schedule_locked_until <= timezone('utc', now()) then
    return false;
  end if;

  if nullif(trim(coalesce(p_execution_metadata ->> 'launchInputDigest', '')), '')
    is distinct from launch.launch_input_digest then
    raise exception 'manual launch completion input lineage does not match its durable snapshot';
  end if;

  foreach stage_name in array array['campaign', 'adset', 'creative', 'ad'] loop
    expected_object_id := case stage_name
      when 'campaign' then nullif(trim(coalesce(p_meta_campaign_id, '')), '')
      when 'adset' then nullif(trim(coalesce(p_meta_ad_set_id, '')), '')
      when 'creative' then nullif(trim(coalesce(p_meta_creative_id, '')), '')
      when 'ad' then nullif(trim(coalesce(p_meta_ad_id, '')), '')
    end;

    if expected_object_id is null then
      raise exception 'a complete provider object receipt is required';
    end if;

    select count(distinct receipt.object_id),
        count(*) filter (
          where receipt.response_status between 200 and 299
            and receipt.launch_input_digest = launch.launch_input_digest
        ),
        count(*) filter (
          where receipt.launch_input_digest is distinct from launch.launch_input_digest
        ),
        min(receipt.object_id)
      into distinct_receipt_count, successful_receipt_count, lineage_mismatch_count, receipted_object_id
    from public.campaign_launch_provider_receipts receipt
    where receipt.launch_id = launch.id
      and receipt.lease_generation <= p_lease_generation
      and receipt.stage = stage_name;

    if distinct_receipt_count <> 1
      or successful_receipt_count < 1
      or lineage_mismatch_count <> 0
      or receipted_object_id is distinct from expected_object_id then
      raise exception 'manual launch completion does not match its successful provider receipts';
    end if;
  end loop;

  update public.campaign_launch_records candidate
  set result_status = 'success',
      launch_mode = 'provider_paused',
      meta_campaign_id = trim(p_meta_campaign_id),
      meta_ad_set_ids = jsonb_build_array(trim(p_meta_ad_set_id)),
      meta_creative_id = trim(p_meta_creative_id),
      meta_ad_ids = jsonb_build_array(trim(p_meta_ad_id)),
      execution_metadata = candidate.execution_metadata || coalesce(p_execution_metadata, '{}'::jsonb),
      event_timeline = candidate.event_timeline || jsonb_build_array(coalesce(p_event, '{}'::jsonb)),
      schedule_next_attempt_at = null,
      schedule_locked_at = null,
      schedule_locked_until = null,
      schedule_locked_by = null,
      schedule_lease_token = null,
      schedule_last_error_code = null,
      reconciled_at = completed_at,
      updated_at = completed_at
  where candidate.id = launch.id
    and candidate.result_status = 'processing'
    and candidate.schedule_locked_by = p_worker_id
    and candidate.schedule_lease_token = p_lease_token
    and candidate.schedule_lease_generation = p_lease_generation
    and candidate.schedule_locked_until > completed_at;

  if not found then
    return false;
  end if;

  update public.campaign_plans campaign
  set plan = jsonb_set(
        jsonb_set(
          coalesce(campaign.plan, '{}'::jsonb),
          '{launch_runtime}',
          coalesce(campaign.plan -> 'launch_runtime', '{}'::jsonb) || jsonb_build_object(
            'campaign_id', trim(p_meta_campaign_id),
            'adset_id', trim(p_meta_ad_set_id),
            'creative_id', trim(p_meta_creative_id),
            'ad_id', trim(p_meta_ad_id),
            'current_stage', 'ad',
            'status', 'completed',
            'step_status', 'created',
            'error', null,
            'updated_at', completed_at
          ),
          true
        ),
        '{runtime}',
        coalesce(campaign.plan -> 'runtime', '{}'::jsonb) || jsonb_build_object(
          'campaignId', trim(p_meta_campaign_id),
          'adSetId', trim(p_meta_ad_set_id),
          'creativeId', trim(p_meta_creative_id),
          'adId', trim(p_meta_ad_id),
          'metaAdSetIds', jsonb_build_array(trim(p_meta_ad_set_id)),
          'metaCreativeIds', jsonb_build_array(trim(p_meta_creative_id)),
          'metaAdIds', jsonb_build_array(trim(p_meta_ad_id)),
          'metaPushStatus', 'provider_paused',
          'status', 'provider_paused',
          'safetyState', 'paused',
          'metaLastMessage', 'Meta objects were created, receipted, and verified in PAUSED state. Delivery and spend are not inferred.',
          'lastAction', 'Meta objects were created, receipted, and verified in PAUSED state. Delivery and spend are not inferred.',
          'providerObjectsCreatedAt', completed_at,
          'launchedAt', null,
          'statusUpdatedAt', completed_at
        ),
        true
      ),
      launch_status = 'provider_paused',
      updated_at = completed_at
  where campaign.id = launch.campaign_id
    and campaign.organization_id = launch.organization_id
    and campaign.user_id = launch.user_id;

  if not found then
    raise exception 'manual launch campaign runtime target is missing';
  end if;

  perform private.persist_launch_tracking_contract(
    launch.id,
    trim(p_meta_campaign_id),
    trim(p_meta_ad_set_id),
    jsonb_build_array(trim(p_meta_ad_id)),
    coalesce(p_execution_metadata, '{}'::jsonb)
  );

  return true;
end;
$$;

revoke execute on function public.complete_manual_campaign_launch_claim(uuid, text, uuid, bigint, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_manual_campaign_launch_claim(uuid, text, uuid, bigint, text, text, text, text, jsonb, jsonb)
  to service_role;

create or replace function public.fail_manual_campaign_launch_claim(
  p_launch_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_error_code text,
  p_meta_campaign_id text,
  p_meta_ad_set_ids jsonb,
  p_meta_ad_ids jsonb,
  p_execution_metadata jsonb,
  p_event jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch public.campaign_launch_records%rowtype;
  supplied_object_id text;
  settled_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to fail manual launch claims';
  end if;

  select * into launch
  from public.campaign_launch_records candidate
  where candidate.id = p_launch_id
  for update;

  if launch.id is null
    or launch.result_status <> 'processing'
    or launch.schedule_locked_by is distinct from p_worker_id
    or launch.schedule_lease_token is distinct from p_lease_token
    or launch.schedule_lease_generation is distinct from p_lease_generation
    or launch.schedule_locked_until <= timezone('utc', now()) then
    return false;
  end if;

  if jsonb_typeof(coalesce(p_meta_ad_set_ids, 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_meta_ad_ids, 'null'::jsonb)) <> 'array' then
    raise exception 'manual launch partial provider ids are invalid';
  end if;

  if nullif(trim(coalesce(p_meta_campaign_id, '')), '') is not null
    and not exists (
      select 1 from public.campaign_launch_provider_receipts receipt
      where receipt.launch_id = launch.id
        and receipt.lease_generation <= p_lease_generation
        and receipt.stage = 'campaign'
        and receipt.object_id = trim(p_meta_campaign_id)
    ) then
    raise exception 'manual launch partial campaign id is not receipted';
  end if;

  for supplied_object_id in select jsonb_array_elements_text(p_meta_ad_set_ids) loop
    if not exists (
      select 1 from public.campaign_launch_provider_receipts receipt
      where receipt.launch_id = launch.id
        and receipt.lease_generation <= p_lease_generation
        and receipt.stage = 'adset'
        and receipt.object_id = trim(supplied_object_id)
    ) then
      raise exception 'manual launch partial ad set id is not receipted';
    end if;
  end loop;

  for supplied_object_id in select jsonb_array_elements_text(p_meta_ad_ids) loop
    if not exists (
      select 1 from public.campaign_launch_provider_receipts receipt
      where receipt.launch_id = launch.id
        and receipt.lease_generation <= p_lease_generation
        and receipt.stage = 'ad'
        and receipt.object_id = trim(supplied_object_id)
    ) then
      raise exception 'manual launch partial ad id is not receipted';
    end if;
  end loop;

  update public.campaign_launch_records candidate
  set result_status = case
        when coalesce(candidate.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
          or p_error_code in (
            'meta_provider_create_outcome_ambiguous',
            'scheduled_launch_provider_receipt_persist_failed',
            'campaign_launch_provider_receipt_persist_failed',
            'scheduled_launch_provider_mutation_settlement_failed',
            'campaign_launch_provider_mutation_settlement_failed',
            'meta_lookup_ambiguous'
          ) then 'operator_action_required'
        when candidate.schedule_attempt_count >= 5 then 'operator_action_required'
        else 'failed'
      end,
      meta_campaign_id = nullif(trim(coalesce(p_meta_campaign_id, '')), ''),
      meta_ad_set_ids = coalesce(p_meta_ad_set_ids, '[]'::jsonb),
      meta_ad_ids = coalesce(p_meta_ad_ids, '[]'::jsonb),
      execution_metadata = candidate.execution_metadata
        || coalesce(p_execution_metadata, '{}'::jsonb)
        || case
          when coalesce(candidate.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
            then jsonb_build_object(
              'providerMutationOutcome', 'operator_reconciliation_required',
              'operatorActionId', candidate.id
            )
          else '{}'::jsonb
        end,
      event_timeline = candidate.event_timeline || jsonb_build_array(coalesce(p_event, '{}'::jsonb)),
      schedule_locked_at = null,
      schedule_locked_until = null,
      schedule_locked_by = null,
      schedule_lease_token = null,
      schedule_last_error_code = case
        when p_error_code in (
          'meta_provider_create_outcome_ambiguous',
          'scheduled_launch_provider_receipt_persist_failed',
          'campaign_launch_provider_receipt_persist_failed',
          'scheduled_launch_provider_mutation_settlement_failed',
          'campaign_launch_provider_mutation_settlement_failed',
          'meta_lookup_ambiguous'
        ) then p_error_code
        when coalesce(candidate.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
          then 'meta_provider_create_outcome_ambiguous'
        when candidate.schedule_attempt_count >= 5 then 'manual_launch_max_attempts_exhausted'
        else nullif(trim(coalesce(p_error_code, '')), '')
      end,
      updated_at = timezone('utc', now())
  where candidate.id = launch.id
    and candidate.result_status = 'processing'
    and candidate.schedule_locked_by = p_worker_id
    and candidate.schedule_lease_token = p_lease_token
    and candidate.schedule_lease_generation = p_lease_generation
    and candidate.schedule_locked_until > timezone('utc', now())
  returning candidate.result_status into settled_status;

  if settled_status is null then
    return false;
  end if;

  if settled_status = 'operator_action_required' then
    perform private.persist_campaign_launch_operator_truth(
      launch.id,
      case
        when p_error_code in (
          'meta_provider_create_outcome_ambiguous',
          'scheduled_launch_provider_receipt_persist_failed',
          'campaign_launch_provider_receipt_persist_failed',
          'scheduled_launch_provider_mutation_settlement_failed',
          'campaign_launch_provider_mutation_settlement_failed',
          'meta_lookup_ambiguous'
        ) then p_error_code
        when coalesce(launch.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
          then 'meta_provider_create_outcome_ambiguous'
        else 'manual_launch_max_attempts_exhausted'
      end,
      case
        when coalesce(launch.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
          then 'A provider create request has no durable receipt or explicit rejection. Automatic retries are stopped and operator reconciliation is required.'
        when p_error_code in (
          'meta_provider_create_outcome_ambiguous',
          'scheduled_launch_provider_receipt_persist_failed',
          'campaign_launch_provider_receipt_persist_failed',
          'scheduled_launch_provider_mutation_settlement_failed',
          'campaign_launch_provider_mutation_settlement_failed',
          'meta_lookup_ambiguous'
        ) then 'Provider evidence is ambiguous. Automatic retries are stopped and operator reconciliation is required.'
        else 'The fifth manual launch attempt failed. Automatic retries are stopped and operator review is required.'
      end
    );
  end if;

  return true;
end;
$$;

revoke execute on function public.fail_manual_campaign_launch_claim(uuid, text, uuid, bigint, text, text, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.fail_manual_campaign_launch_claim(uuid, text, uuid, bigint, text, text, jsonb, jsonb, jsonb, jsonb)
  to service_role;

comment on function public.claim_manual_campaign_launch_record(uuid, uuid, uuid, uuid, text, integer) is
  'Claims one authenticated, due launch intent using the same token and monotonic generation fence as the scheduled worker.';
