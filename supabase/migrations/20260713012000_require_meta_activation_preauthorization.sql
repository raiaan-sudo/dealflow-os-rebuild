-- Customer consent must exist before a provider launch begins. A service-role
-- worker may only finalize that immutable consent after the exact launch has
-- been durably receipted in PAUSED state; it cannot invent consent.

create table public.meta_campaign_activation_preauthorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  launch_record_id uuid not null references public.campaign_launch_records(id) on delete restrict,
  customer_authorized_by uuid not null references auth.users(id) on delete restrict,
  customer_authorized_at timestamptz not null default timezone('utc', now()),
  scheduled_for timestamptz not null,
  approved_daily_budget_minor bigint not null check (approved_daily_budget_minor between 100 and 100000000),
  approved_currency text not null check (approved_currency in ('USD', 'CAD')),
  provider_ad_account_id text not null check (provider_ad_account_id ~ '^[0-9]{5,40}$'),
  provider_page_id text not null check (provider_page_id ~ '^[0-9]{5,40}$'),
  provider_pixel_id text not null check (provider_pixel_id ~ '^[0-9]{5,40}$'),
  selected_ad_id text not null check (selected_ad_id ~ '^[A-Za-z0-9._:-]{1,200}$'),
  ad_destination text not null check (ad_destination in ('website', 'meta_instant_form')),
  destination_url_digest text not null check (destination_url_digest ~ '^[0-9a-f]{64}$'),
  launch_approval_snapshot jsonb not null check (
    jsonb_typeof(launch_approval_snapshot) = 'object'
    and launch_approval_snapshot ->> 'schema_version' = '1'
    and octet_length(launch_approval_snapshot::text) between 100 and 32768
  ),
  launch_approval_digest text not null check (launch_approval_digest ~ '^[0-9a-f]{64}$'),
  customer_approval_digest text not null check (customer_approval_digest ~ '^[0-9a-f]{64}$'),
  authorization_input_digest text not null check (authorization_input_digest ~ '^[0-9a-f]{64}$'),
  authorization_generation integer not null check (authorization_generation between 1 and 1000),
  idempotency_key text not null check (length(trim(idempotency_key)) between 8 and 200),
  status text not null default 'authorized'
    check (status in ('authorized', 'finalized', 'cancelled', 'operator_required')),
  activation_intent_id uuid null references public.meta_campaign_activation_intents(id) on delete restrict,
  last_error_code text null,
  last_error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint meta_activation_preauth_campaign_scope_fk
    foreign key (campaign_id, organization_id, user_id)
    references public.campaign_plans (id, organization_id, user_id)
    on delete restrict,
  constraint meta_activation_preauth_customer_identity_check
    check (customer_authorized_by = user_id),
  constraint meta_activation_preauth_idempotency_unique
    unique (organization_id, idempotency_key),
  constraint meta_activation_preauth_finalization_check check (
    (status = 'finalized' and activation_intent_id is not null)
    or (status <> 'finalized')
  )
);

create unique index meta_activation_preauth_one_open_launch_idx
  on public.meta_campaign_activation_preauthorizations (launch_record_id)
  where status in ('authorized', 'finalized', 'operator_required');

create unique index meta_activation_preauth_open_digest_idx
  on public.meta_campaign_activation_preauthorizations (organization_id, authorization_input_digest)
  where status in ('authorized', 'finalized', 'operator_required');

create index meta_activation_preauth_recovery_idx
  on public.meta_campaign_activation_preauthorizations (created_at)
  where status = 'authorized';

alter table public.meta_instant_form_provisioning
  drop constraint if exists meta_instant_form_provisioning_subscription_state_check;
alter table public.meta_instant_form_provisioning
  add column if not exists subscription_armed_at timestamptz null,
  add column if not exists subscription_receipted_at timestamptz null,
  add column if not exists subscription_evidence_digest text null,
  add constraint meta_instant_form_provisioning_subscription_state_check
    check (subscription_state in (
      'pending', 'armed', 'subscribed', 'reconciled', 'rejected', 'operator_required'
    )),
  add constraint meta_instant_form_subscription_evidence_check check (
    (subscription_state in ('subscribed', 'reconciled')
      and subscription_receipted_at is not null
      and subscription_evidence_digest ~ '^[0-9a-f]{64}$')
    or subscription_state not in ('subscribed', 'reconciled')
  );

alter table public.meta_campaign_activation_preauthorizations enable row level security;
alter table public.meta_campaign_activation_preauthorizations force row level security;
revoke all on table public.meta_campaign_activation_preauthorizations from public, anon, authenticated, service_role;
grant select on table public.meta_campaign_activation_preauthorizations to service_role;

create or replace function public.prevent_meta_activation_preauthorization_identity_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.user_id is distinct from old.user_id
    or new.campaign_id is distinct from old.campaign_id
    or new.launch_record_id is distinct from old.launch_record_id
    or new.customer_authorized_by is distinct from old.customer_authorized_by
    or new.customer_authorized_at is distinct from old.customer_authorized_at
    or new.scheduled_for is distinct from old.scheduled_for
    or new.approved_daily_budget_minor is distinct from old.approved_daily_budget_minor
    or new.approved_currency is distinct from old.approved_currency
    or new.provider_ad_account_id is distinct from old.provider_ad_account_id
    or new.provider_page_id is distinct from old.provider_page_id
    or new.provider_pixel_id is distinct from old.provider_pixel_id
    or new.selected_ad_id is distinct from old.selected_ad_id
    or new.ad_destination is distinct from old.ad_destination
    or new.destination_url_digest is distinct from old.destination_url_digest
    or new.launch_approval_snapshot is distinct from old.launch_approval_snapshot
    or new.launch_approval_digest is distinct from old.launch_approval_digest
    or new.customer_approval_digest is distinct from old.customer_approval_digest
    or new.authorization_input_digest is distinct from old.authorization_input_digest
    or new.authorization_generation is distinct from old.authorization_generation
    or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'activation preauthorization identity is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists meta_activation_preauthorization_identity_immutable
  on public.meta_campaign_activation_preauthorizations;
create trigger meta_activation_preauthorization_identity_immutable
before update on public.meta_campaign_activation_preauthorizations
for each row execute function public.prevent_meta_activation_preauthorization_identity_mutation();

revoke all on function public.prevent_meta_activation_preauthorization_identity_mutation()
  from public, anon, authenticated, service_role;

create or replace function public.preauthorize_meta_campaign_activation(
  p_organization_id uuid,
  p_customer_user_id uuid,
  p_campaign_id uuid,
  p_approved_daily_budget_minor bigint,
  p_approved_currency text,
  p_provider_ad_account_id text,
  p_provider_page_id text,
  p_provider_pixel_id text,
  p_selected_ad_id text,
  p_ad_destination text,
  p_destination_url_digest text,
  p_launch_approval_snapshot jsonb,
  p_customer_approval_digest text,
  p_idempotency_key text
)
returns public.meta_campaign_activation_preauthorizations
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  customer_user_id uuid := p_customer_user_id;
  campaign_record public.campaign_plans%rowtype;
  launch public.campaign_launch_records%rowtype;
  existing public.meta_campaign_activation_preauthorizations%rowtype;
  inserted public.meta_campaign_activation_preauthorizations%rowtype;
  input_digest text;
  approval_digest text;
  next_generation integer;
  normalized_currency text := upper(trim(coalesce(p_approved_currency, '')));
  normalized_ad_account_id text := replace(trim(coalesce(p_provider_ad_account_id, '')), 'act_', '');
  normalized_page_id text := trim(coalesce(p_provider_page_id, ''));
  normalized_pixel_id text := trim(coalesce(p_provider_pixel_id, ''));
  normalized_selected_ad_id text := trim(coalesce(p_selected_ad_id, ''));
  normalized_ad_destination text := lower(trim(coalesce(p_ad_destination, '')));
  canonical_budget_text text;
  canonical_selected_ad_id text;
  canonical_ad_destination text;
begin
  if auth.role() is distinct from 'service_role' or customer_user_id is null then
    raise exception 'service-controlled customer authority is required' using errcode = '42501';
  end if;
  if p_customer_approval_digest !~ '^[0-9a-f]{64}$'
    or length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 195
    or normalized_currency not in ('USD', 'CAD')
    or normalized_ad_account_id !~ '^[0-9]{5,40}$'
    or normalized_page_id !~ '^[0-9]{5,40}$'
    or normalized_pixel_id !~ '^[0-9]{5,40}$'
    or normalized_selected_ad_id !~ '^[A-Za-z0-9._:-]{1,200}$'
    or normalized_ad_destination not in ('website', 'meta_instant_form')
    or p_destination_url_digest !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(coalesce(p_launch_approval_snapshot, 'null'::jsonb)) <> 'object'
    or p_launch_approval_snapshot ->> 'schema_version' <> '1'
    or octet_length(p_launch_approval_snapshot::text) not between 100 and 32768
    or p_approved_daily_budget_minor not between 100 and 100000000 then
    raise exception 'invalid customer activation preauthorization' using errcode = '22023';
  end if;
  select * into campaign_record
  from public.campaign_plans campaign
  where campaign.id = p_campaign_id
    and campaign.organization_id = p_organization_id
    and campaign.user_id = customer_user_id
  for update;
  if campaign_record.id is null then
    raise exception 'campaign authority is missing' using errcode = '42501';
  end if;
  canonical_budget_text := coalesce(
    campaign_record.plan ->> 'daily_budget_cents',
    campaign_record.plan #>> '{campaign_payload,daily_budget_cents}',
    ''
  );
  canonical_selected_ad_id := trim(coalesce(
    campaign_record.plan ->> 'selected_ad_id',
    campaign_record.plan #>> '{campaign_payload,selected_ad_id}',
    ''
  ));
  canonical_ad_destination := lower(trim(coalesce(
    campaign_record.plan ->> 'ad_destination',
    campaign_record.plan #>> '{campaign_payload,ad_destination}',
    ''
  )));
  if canonical_budget_text !~ '^[0-9]+$'
    or canonical_budget_text::bigint is distinct from p_approved_daily_budget_minor
    or canonical_selected_ad_id is distinct from normalized_selected_ad_id
    or canonical_ad_destination is distinct from normalized_ad_destination then
    raise exception 'customer activation authority does not match canonical campaign truth' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.marketing_accounts account
    where account.organization_id = p_organization_id
      and account.platform = 'meta_ads'
      and account.status = 'connected'
      and replace(account.external_account_id, 'act_', '') = normalized_ad_account_id
      and replace(coalesce(account.connection_metadata ->> 'selected_external_account_id', ''), 'act_', '') = normalized_ad_account_id
      and coalesce(account.connection_metadata ->> 'selected_page_id', '') = normalized_page_id
      and coalesce(account.connection_metadata ->> 'pixel_id', '') = normalized_pixel_id
  ) then
    raise exception 'customer activation authority does not match canonical Meta selection' using errcode = '23514';
  end if;

  if p_launch_approval_snapshot ->> 'organization_id' is distinct from p_organization_id::text
    or p_launch_approval_snapshot ->> 'campaign_id' is distinct from p_campaign_id::text
    or replace(coalesce(p_launch_approval_snapshot -> 'provider' ->> 'ad_account_id', ''), 'act_', '')
      is distinct from normalized_ad_account_id
    or upper(coalesce(p_launch_approval_snapshot -> 'provider' ->> 'account_currency', ''))
      is distinct from normalized_currency
    or coalesce(p_launch_approval_snapshot -> 'provider' ->> 'page_id', '')
      is distinct from normalized_page_id
    or coalesce(p_launch_approval_snapshot -> 'provider' ->> 'pixel_id', '')
      is distinct from normalized_pixel_id
    or coalesce(p_launch_approval_snapshot -> 'creative' ->> 'selected_ad_id', '')
      is distinct from normalized_selected_ad_id
    or lower(coalesce(p_launch_approval_snapshot -> 'destination' ->> 'ad_destination', ''))
      is distinct from normalized_ad_destination
    or coalesce(p_launch_approval_snapshot -> 'destination' -> 'provider_form_id', 'null'::jsonb) <> 'null'::jsonb
    or encode(extensions.digest(convert_to(coalesce(p_launch_approval_snapshot ->> 'destination_url', ''), 'UTF8'), 'sha256'), 'hex')
      is distinct from p_destination_url_digest
    or coalesce(p_launch_approval_snapshot -> 'delivery' ->> 'daily_budget_minor', '')
      is distinct from p_approved_daily_budget_minor::text
    or coalesce(p_launch_approval_snapshot -> 'delivery' -> 'special_ad_categories', 'null'::jsonb)
      is distinct from '["HOUSING"]'::jsonb
    or coalesce(p_launch_approval_snapshot -> 'delivery' ->> 'objective', '') !~ '^OUTCOME_[A-Z_]+$'
    or coalesce(p_launch_approval_snapshot -> 'delivery' ->> 'country_code', '') !~ '^[A-Z]{2}$'
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'campaign' ->> 'objective', '')
      is distinct from coalesce(p_launch_approval_snapshot -> 'delivery' ->> 'objective', '')
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'campaign' -> 'special_ad_categories', 'null'::jsonb)
      is distinct from '["HOUSING"]'::jsonb
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'campaign' -> 'special_ad_category_country', 'null'::jsonb)
      is distinct from jsonb_build_array(p_launch_approval_snapshot -> 'delivery' ->> 'country_code')
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'campaign' -> 'is_adset_budget_sharing_enabled', 'null'::jsonb)
      is distinct from 'false'::jsonb
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'ad_set' ->> 'billing_event', '') <> 'IMPRESSIONS'
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'ad_set' ->> 'optimization_goal', '')
      is distinct from (case
        when normalized_ad_destination = 'meta_instant_form' then 'LEAD_GENERATION'
        when p_launch_approval_snapshot -> 'delivery' ->> 'objective' = 'OUTCOME_TRAFFIC' then 'LINK_CLICKS'
        else 'OFFSITE_CONVERSIONS'
      end)
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'ad_set' ->> 'daily_budget_minor', '')
      is distinct from p_approved_daily_budget_minor::text
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'ad_set' ->> 'bid_strategy', '') <> 'LOWEST_COST_WITHOUT_CAP'
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'ad_set' -> 'targeting', 'null'::jsonb)
      is distinct from jsonb_build_object('geo_locations', jsonb_build_object(
        'countries', jsonb_build_array(p_launch_approval_snapshot -> 'delivery' ->> 'country_code')
      ))
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'ad_set' -> 'destination_type', '"__missing__"'::jsonb)
      is distinct from (case
        when normalized_ad_destination = 'meta_instant_form' then '"ON_AD"'::jsonb
        else 'null'::jsonb
      end)
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'ad_set' -> 'promoted_object', 'null'::jsonb)
      is distinct from (case
        when normalized_ad_destination = 'meta_instant_form'
          then jsonb_build_object('page_id', normalized_page_id)
        else jsonb_build_object('pixel_id', normalized_pixel_id, 'custom_event_type', 'LEAD')
      end)
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'ad_set' -> 'tracking_specs', 'null'::jsonb)
      is distinct from (case
        when normalized_ad_destination = 'meta_instant_form' then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object(
          'action_type', jsonb_build_array('offsite_conversion'),
          'fb_pixel', jsonb_build_array(normalized_pixel_id)
        ))
      end)
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'creative' ->> 'page_id', '')
      is distinct from normalized_page_id
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'creative' ->> 'call_to_action_type', '') <> 'LEARN_MORE'
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'creative' ->> 'link', '')
      is distinct from (case
        when normalized_ad_destination = 'meta_instant_form' then 'https://fb.me/'
        else p_launch_approval_snapshot ->> 'destination_url'
      end)
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'creative' -> 'cta_link', '"__missing__"'::jsonb)
      is distinct from (case
        when normalized_ad_destination = 'meta_instant_form' then 'null'::jsonb
        else to_jsonb(p_launch_approval_snapshot ->> 'destination_url')
      end)
    or coalesce(p_launch_approval_snapshot -> 'provider_contract' -> 'creative' -> 'provider_form_binding', '"__missing__"'::jsonb)
      is distinct from (case
        when normalized_ad_destination = 'meta_instant_form' then '"provisioning_receipt"'::jsonb
        else 'null'::jsonb
      end)
    or coalesce(p_launch_approval_snapshot -> 'creative' ->> 'primary_text_sha256', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_launch_approval_snapshot -> 'creative' ->> 'headline_sha256', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_launch_approval_snapshot -> 'creative' ->> 'image_content_sha256', '') !~ '^[0-9a-f]{64}$'
    or (
      normalized_ad_destination = 'meta_instant_form'
      and coalesce(p_launch_approval_snapshot -> 'destination' ->> 'form_definition_digest', '') !~ '^[0-9a-f]{64}$'
    ) then
    raise exception 'immutable launch approval snapshot is invalid' using errcode = '23514';
  end if;

  select * into strict launch
  from public.campaign_launch_records candidate
  where candidate.organization_id = p_organization_id
    and candidate.user_id = customer_user_id
    and candidate.campaign_id = p_campaign_id
    and candidate.scheduled_for is not null
    and candidate.result_status in ('scheduled', 'failed')
  for update;

  approval_digest := encode(extensions.digest(convert_to(p_launch_approval_snapshot::text, 'UTF8'), 'sha256'), 'hex');

  select * into existing
  from public.meta_campaign_activation_preauthorizations candidate
  where candidate.launch_record_id = launch.id
    and candidate.status in ('authorized', 'finalized', 'operator_required')
  for update;
  if existing.id is not null then
    if existing.approved_daily_budget_minor is distinct from p_approved_daily_budget_minor
      or existing.approved_currency is distinct from normalized_currency
      or existing.provider_ad_account_id is distinct from normalized_ad_account_id
      or existing.provider_page_id is distinct from normalized_page_id
      or existing.provider_pixel_id is distinct from normalized_pixel_id
      or existing.selected_ad_id is distinct from normalized_selected_ad_id
      or existing.ad_destination is distinct from normalized_ad_destination
      or existing.destination_url_digest is distinct from p_destination_url_digest
      or existing.launch_approval_digest is distinct from approval_digest then
      raise exception 'an incompatible activation preauthorization already exists' using errcode = '23514';
    end if;
    return existing;
  end if;

  select coalesce(max(candidate.authorization_generation), 0) + 1 into next_generation
  from public.meta_campaign_activation_preauthorizations candidate
  where candidate.launch_record_id = launch.id;
  if next_generation not between 1 and 1000 then
    raise exception 'activation preauthorization generation limit exceeded' using errcode = '54000';
  end if;

  input_digest := encode(extensions.digest(convert_to(concat_ws('|',
    p_organization_id::text, customer_user_id::text, p_campaign_id::text,
    launch.id::text, to_char(launch.scheduled_for at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    p_approved_daily_budget_minor::text, normalized_currency,
    normalized_ad_account_id, normalized_page_id, normalized_pixel_id,
    normalized_selected_ad_id, normalized_ad_destination, p_destination_url_digest,
    approval_digest, p_customer_approval_digest, next_generation::text
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.meta_campaign_activation_preauthorizations (
    organization_id, user_id, campaign_id, launch_record_id,
    customer_authorized_by, scheduled_for, approved_daily_budget_minor,
    approved_currency, provider_ad_account_id, provider_page_id, provider_pixel_id,
    selected_ad_id, ad_destination, destination_url_digest,
    launch_approval_snapshot, launch_approval_digest,
    customer_approval_digest, authorization_input_digest, authorization_generation,
    idempotency_key
  ) values (
    p_organization_id, customer_user_id, p_campaign_id, launch.id,
    customer_user_id, launch.scheduled_for, p_approved_daily_budget_minor,
    normalized_currency, normalized_ad_account_id, normalized_page_id, normalized_pixel_id,
    normalized_selected_ad_id, normalized_ad_destination, p_destination_url_digest,
    p_launch_approval_snapshot, approval_digest,
    p_customer_approval_digest, input_digest, next_generation,
    trim(p_idempotency_key) || ':' || next_generation::text
  )
  returning * into inserted;
  return inserted;
exception
  when no_data_found or too_many_rows then
    raise exception 'a unique pre-launch record is required for activation authority' using errcode = '42501';
end;
$$;

-- The customer-facing server uses this single transactional boundary. A due
-- launch record can never be created without its immutable customer authority;
-- any validation or preauthorization failure rolls the schedule insert back.
create or replace function public.schedule_and_preauthorize_meta_campaign_activation(
  p_organization_id uuid,
  p_customer_user_id uuid,
  p_campaign_id uuid,
  p_campaign_name text,
  p_scheduled_for timestamptz,
  p_time_zone text,
  p_approved_daily_budget_minor bigint,
  p_approved_currency text,
  p_provider_ad_account_id text,
  p_provider_page_id text,
  p_provider_pixel_id text,
  p_selected_ad_id text,
  p_ad_destination text,
  p_destination_url_digest text,
  p_launch_approval_snapshot jsonb,
  p_customer_approval_digest text,
  p_idempotency_key text
)
returns public.meta_campaign_activation_preauthorizations
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  campaign public.campaign_plans%rowtype;
  launch public.campaign_launch_records%rowtype;
  authorization_record public.meta_campaign_activation_preauthorizations%rowtype;
  schedule_idempotency_key text;
begin
  if auth.role() is distinct from 'service_role'
    or p_customer_user_id is null
    or p_scheduled_for is null
    or p_time_zone is distinct from 'America/New_York'
    or nullif(trim(coalesce(p_campaign_name, '')), '') is null
    or p_scheduled_for < timezone('utc', now()) - interval '1 minute'
    or p_scheduled_for > timezone('utc', now()) + interval '26 hours'
    or extract(hour from p_scheduled_for at time zone 'America/New_York') <> 9
    or extract(minute from p_scheduled_for at time zone 'America/New_York') <> 0
    or extract(second from p_scheduled_for at time zone 'America/New_York') <> 0 then
    raise exception 'atomic campaign launch authorization is invalid' using errcode = '22023';
  end if;

  select * into campaign
  from public.campaign_plans candidate
  where candidate.id = p_campaign_id
    and candidate.organization_id = p_organization_id
    and candidate.user_id = p_customer_user_id
  for update;
  if campaign.id is null then
    raise exception 'campaign launch owner is invalid' using errcode = '42501';
  end if;

  select * into launch
  from public.campaign_launch_records existing
  where existing.campaign_id = p_campaign_id
    and existing.organization_id = p_organization_id
    and existing.user_id = p_customer_user_id
  for update;

  if launch.id is not null then
    if launch.result_status in ('success', 'partial_success', 'uncertain', 'operator_action_required', 'processing')
      or launch.launch_mode is distinct from 'scheduled_provider_paused' then
      raise exception 'existing campaign launch cannot be atomically authorized' using errcode = '23514';
    end if;
    if launch.scheduled_for is distinct from p_scheduled_for then
      if exists (
          select 1 from public.meta_campaign_activation_preauthorizations prior
          where prior.launch_record_id = launch.id
            and prior.status <> 'cancelled'
        )
        or exists (select 1 from public.campaign_launch_provider_receipts receipt where receipt.launch_id = launch.id)
        or coalesce(launch.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
        or launch.meta_campaign_id is not null
        or jsonb_array_length(launch.meta_ad_set_ids) <> 0
        or launch.meta_creative_id is not null
        or jsonb_array_length(launch.meta_ad_ids) <> 0
        or launch.schedule_locked_by is not null
        or launch.launch_input_snapshot is not null
        or launch.launch_input_digest is not null then
        raise exception 'cancelled launch cannot be safely rescheduled' using errcode = '23514';
      end if;
      schedule_idempotency_key := 'campaign_schedule:' || p_campaign_id::text || ':'
        || extract(epoch from p_scheduled_for)::text;
      update public.campaign_launch_records candidate set
        idempotency_key = schedule_idempotency_key,
        campaign_name = left(trim(p_campaign_name), 300),
        result_status = 'scheduled',
        scheduled_for = p_scheduled_for,
        schedule_attempt_count = 0,
        schedule_next_attempt_at = null,
        schedule_last_error_code = null,
        execution_metadata = jsonb_build_object(
          'timeZone', p_time_zone,
          'launchHourLocal', 9,
          'providerMutationPerformed', false,
          'customerPreauthorizationRequired', true,
          'rescheduledAfterCustomerCancellation', true
        ),
        event_timeline = candidate.event_timeline || jsonb_build_array(jsonb_build_object(
          'id', 'customer-reauthorized:' || extract(epoch from p_scheduled_for)::text,
          'label', 'Launch rescheduled for fresh authorization',
          'status', 'success',
          'target', left(trim(p_campaign_name), 300),
          'detail', 'The previously cancelled, unclaimed launch was safely moved to a new 9:00 a.m. Eastern window.',
          'timestamp', timezone('utc', now())
        )),
        updated_at = timezone('utc', now())
      where candidate.id = launch.id
      returning * into launch;
    end if;
  else
    schedule_idempotency_key := 'campaign_schedule:' || p_campaign_id::text || ':'
      || extract(epoch from p_scheduled_for)::text;
    insert into public.campaign_launch_records (
      organization_id, user_id, campaign_id, idempotency_key, campaign_name,
      account_name, launch_mode, result_status, scheduled_for,
      meta_campaign_id, meta_ad_set_ids, meta_ad_ids, execution_metadata, event_timeline
    ) values (
      p_organization_id, p_customer_user_id, p_campaign_id, schedule_idempotency_key,
      left(trim(p_campaign_name), 300), null, 'scheduled_provider_paused', 'scheduled',
      p_scheduled_for, null, '[]'::jsonb, '[]'::jsonb,
      jsonb_build_object(
        'timeZone', p_time_zone,
        'launchHourLocal', 9,
        'providerMutationPerformed', false,
        'customerPreauthorizationRequired', true
      ),
      jsonb_build_array(jsonb_build_object(
        'id', 'scheduled-and-authorized:' || extract(epoch from p_scheduled_for)::text,
        'label', 'Launch scheduled and authorized',
        'status', 'success',
        'target', left(trim(p_campaign_name), 300),
        'detail', 'The 9:00 a.m. Eastern launch and immutable customer approval were committed atomically. No provider mutation was performed.',
        'timestamp', timezone('utc', now())
      ))
    )
    returning * into launch;
  end if;

  select * into authorization_record
  from public.preauthorize_meta_campaign_activation(
    p_organization_id, p_customer_user_id, p_campaign_id,
    p_approved_daily_budget_minor, p_approved_currency,
    p_provider_ad_account_id, p_provider_page_id, p_provider_pixel_id,
    p_selected_ad_id, p_ad_destination, p_destination_url_digest,
    p_launch_approval_snapshot, p_customer_approval_digest, p_idempotency_key
  );
  return authorization_record;
end;
$$;

create or replace function public.get_meta_campaign_activation_authorization_status(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns table (
  authorization_id uuid,
  authorization_status text,
  launch_record_id uuid,
  activation_intent_id uuid,
  scheduled_for timestamptz,
  approved_daily_budget_minor bigint,
  approved_currency text,
  customer_authorized_at timestamptz,
  last_error_code text
)
language sql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
  select candidate.id, candidate.status, candidate.launch_record_id,
    candidate.activation_intent_id, candidate.scheduled_for,
    candidate.approved_daily_budget_minor, candidate.approved_currency,
    candidate.customer_authorized_at, candidate.last_error_code
  from public.meta_campaign_activation_preauthorizations candidate
  where auth.role() = 'authenticated'
    and auth.uid() is not null
    and candidate.organization_id = p_organization_id
    and candidate.user_id = auth.uid()
    and candidate.customer_authorized_by = auth.uid()
    and candidate.campaign_id = p_campaign_id
  order by candidate.created_at desc
  limit 1
$$;

create or replace function public.assert_meta_campaign_activation_preauthorization(
  p_launch_record_id uuid,
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, auth
stable
as $$
  select auth.role() = 'service_role' and exists (
    select 1
    from public.meta_campaign_activation_preauthorizations authz
    join public.campaign_launch_records launch on launch.id = authz.launch_record_id
    where authz.launch_record_id = p_launch_record_id
      and authz.organization_id = p_organization_id
      and authz.user_id = p_user_id
      and authz.campaign_id = p_campaign_id
      and authz.customer_authorized_by = p_user_id
      and authz.status = 'authorized'
      and launch.organization_id = authz.organization_id
      and launch.user_id = authz.user_id
      and launch.campaign_id = authz.campaign_id
      and launch.scheduled_for is not distinct from authz.scheduled_for
      and launch.result_status in ('scheduled', 'processing', 'failed')
      and launch.launch_mode = 'scheduled_provider_paused'
  )
$$;

create or replace function public.cancel_meta_campaign_activation_preauthorization(
  p_authorization_id uuid,
  p_organization_id uuid,
  p_campaign_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  preauth public.meta_campaign_activation_preauthorizations%rowtype;
  launch public.campaign_launch_records%rowtype;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise exception 'authenticated customer authority is required' using errcode = '42501';
  end if;
  select * into launch
  from public.campaign_launch_records candidate
  where candidate.organization_id = p_organization_id
    and candidate.campaign_id = p_campaign_id
    and candidate.user_id = auth.uid()
  for update;
  if launch.id is null then return false; end if;

  select * into preauth
  from public.meta_campaign_activation_preauthorizations candidate
  where candidate.id = p_authorization_id
    and candidate.organization_id = p_organization_id
    and candidate.campaign_id = p_campaign_id
    and candidate.user_id = auth.uid()
    and candidate.customer_authorized_by = auth.uid()
  for update;
  if preauth.id is null then return false; end if;

  if preauth.status = 'authorized' then
    if launch.id is distinct from preauth.launch_record_id
      or launch.result_status not in ('scheduled', 'failed')
      or launch.schedule_locked_by is not null
      or coalesce(launch.execution_metadata -> 'providerMutationPending' ->> 'state', '') = 'pending'
      or exists (select 1 from public.campaign_launch_provider_receipts receipt where receipt.launch_id = launch.id)
      or launch.meta_campaign_id is not null
      or jsonb_array_length(launch.meta_ad_set_ids) <> 0
      or launch.meta_creative_id is not null
      or jsonb_array_length(launch.meta_ad_ids) <> 0
      or exists (
        select 1 from public.meta_instant_form_provisioning provisioning
        where provisioning.organization_id = preauth.organization_id
          and provisioning.user_id = preauth.user_id
          and provisioning.campaign_id = preauth.campaign_id
          and provisioning.definition_digest = coalesce(
            preauth.launch_approval_snapshot -> 'destination' ->> 'form_definition_digest', ''
          )
          and (
            provisioning.provider_form_id is not null
            or provisioning.provider_mutation_state in ('armed', 'receipted', 'reconciled', 'operator_required')
            or provisioning.subscription_state in ('armed', 'subscribed', 'reconciled', 'operator_required')
            or provisioning.subscription_armed_at is not null
            or provisioning.subscription_receipted_at is not null
            or provisioning.subscription_evidence_digest is not null
          )
      ) then
      return false;
    end if;
    update public.meta_campaign_activation_preauthorizations candidate set
      status = 'cancelled', updated_at = timezone('utc', now())
    where candidate.id = preauth.id;
    update public.campaign_launch_records candidate set
      schedule_next_attempt_at = null,
      launch_input_snapshot = null,
      launch_input_digest = null,
      execution_metadata = (
        candidate.execution_metadata
        - 'launchInputDigest'
        - 'launchInputSchemaVersion'
        - 'providerMutationPending'
      ) || jsonb_build_object(
        'customerAuthorizationCancelled', true,
        'customerAuthorizationCancelledAt', timezone('utc', now())
      ),
      event_timeline = candidate.event_timeline || jsonb_build_array(jsonb_build_object(
        'id', 'customer-authorization-cancelled:' || preauth.authorization_generation::text,
        'label', 'Customer cancelled launch authorization',
        'status', 'success',
        'target', candidate.campaign_name,
        'detail', 'The unclaimed launch remains provider-inert until the customer creates a fresh authorization.',
        'timestamp', timezone('utc', now())
      )),
      updated_at = timezone('utc', now())
    where candidate.id = launch.id;
    return true;
  end if;
  if preauth.status = 'finalized' then
    update public.meta_campaign_activation_intents intent set
      status = 'cancelled', updated_at = timezone('utc', now())
    where intent.id = preauth.activation_intent_id
      and intent.status = 'authorized';
    if not found then return false; end if;
    update public.meta_campaign_activation_preauthorizations candidate set
      status = 'cancelled', updated_at = timezone('utc', now())
    where candidate.id = preauth.id;
    return true;
  end if;
  return preauth.status = 'cancelled';
end;
$$;

-- Override the generic launch arm so cancellation and provider mutation share
-- one launch-row lock. The exact immutable approval must still be authorized
-- at the same transaction boundary that records a pending Meta write.
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
set search_path = pg_catalog, public, auth
as $$
declare
  launch public.campaign_launch_records%rowtype;
  authorization_record public.meta_campaign_activation_preauthorizations%rowtype;
  pending_mutation jsonb;
  armed_at timestamptz := timezone('utc', now());
  normalized_snapshot jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to arm provider mutations' using errcode = '42501';
  end if;
  if p_stage not in ('campaign', 'adset', 'creative', 'ad')
    or nullif(trim(coalesce(p_object_key, '')), '') is null
    or length(trim(p_object_key)) > 500 then
    raise exception 'campaign launch provider mutation identity is invalid' using errcode = '22023';
  end if;

  select * into launch from public.campaign_launch_records candidate
  where candidate.id = p_launch_id for update;
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

  select * into authorization_record
  from public.meta_campaign_activation_preauthorizations candidate
  where candidate.launch_record_id = launch.id
    and candidate.organization_id = launch.organization_id
    and candidate.user_id = launch.user_id
    and candidate.campaign_id = launch.campaign_id
    and candidate.status = 'authorized'
  for key share;
  normalized_snapshot := jsonb_set(
    launch.launch_input_snapshot,
    '{destination,provider_form_id}',
    'null'::jsonb,
    false
  );
  if authorization_record.id is null
    or normalized_snapshot is distinct from authorization_record.launch_approval_snapshot
    or encode(extensions.digest(convert_to(normalized_snapshot::text, 'UTF8'), 'sha256'), 'hex')
      is distinct from authorization_record.launch_approval_digest then
    return false;
  end if;

  pending_mutation := launch.execution_metadata -> 'providerMutationPending';
  if coalesce(pending_mutation ->> 'state', '') = 'pending' then return false; end if;

  update public.campaign_launch_records candidate set
    execution_metadata = candidate.execution_metadata || jsonb_build_object(
      'providerMutationPending', jsonb_build_object(
        'state', 'pending', 'stage', p_stage, 'objectKey', trim(p_object_key),
        'leaseGeneration', p_lease_generation, 'armedAt', armed_at,
        'activationAuthorizationId', authorization_record.id
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
    and coalesce(candidate.execution_metadata -> 'providerMutationPending' ->> 'state', '') <> 'pending'
    and exists (
      select 1 from public.meta_campaign_activation_preauthorizations current_authorization
      where current_authorization.id = authorization_record.id
        and current_authorization.status = 'authorized'
    );
  return found;
end;
$$;

create or replace function public.arm_meta_instant_form_provider_mutation(
  p_provisioning_id uuid,
  p_processing_token uuid,
  p_processing_generation bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  provisioning public.meta_instant_form_provisioning%rowtype;
  launch public.campaign_launch_records%rowtype;
  authorization_record public.meta_campaign_activation_preauthorizations%rowtype;
  normalized_snapshot jsonb;
begin
  if auth.role() is distinct from 'service_role' then return false; end if;
  select * into provisioning from public.meta_instant_form_provisioning candidate
  where candidate.id = p_provisioning_id;
  if provisioning.id is null then return false; end if;
  select * into launch from public.campaign_launch_records candidate
  where candidate.organization_id = provisioning.organization_id
    and candidate.user_id = provisioning.user_id
    and candidate.campaign_id = provisioning.campaign_id
    and candidate.result_status = 'processing'
  for update;
  if launch.id is null then return false; end if;
  select * into authorization_record from public.meta_campaign_activation_preauthorizations candidate
  where candidate.launch_record_id = launch.id and candidate.status = 'authorized'
  for key share;
  normalized_snapshot := jsonb_set(launch.launch_input_snapshot, '{destination,provider_form_id}', 'null'::jsonb, false);
  if authorization_record.id is null
    or normalized_snapshot is distinct from authorization_record.launch_approval_snapshot
    or coalesce(normalized_snapshot -> 'destination' ->> 'form_definition_digest', '')
      is distinct from provisioning.definition_digest then
    return false;
  end if;
  update public.meta_instant_form_provisioning candidate set
    provider_mutation_state = 'armed', updated_at = timezone('utc', now())
  where candidate.id = provisioning.id
    and candidate.status = 'processing'
    and candidate.processing_token = p_processing_token
    and candidate.processing_generation = p_processing_generation
    and candidate.processing_locked_until > timezone('utc', now())
    and candidate.provider_form_id is null
    and candidate.provider_mutation_state in ('idle', 'rejected')
    and exists (
      select 1 from public.meta_campaign_activation_preauthorizations current_authorization
      where current_authorization.id = authorization_record.id and current_authorization.status = 'authorized'
    );
  return found;
end;
$$;

create or replace function public.arm_meta_instant_form_subscription_mutation(
  p_provisioning_id uuid,
  p_processing_token uuid,
  p_processing_generation bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  provisioning public.meta_instant_form_provisioning%rowtype;
  launch public.campaign_launch_records%rowtype;
  authorization_record public.meta_campaign_activation_preauthorizations%rowtype;
begin
  if auth.role() is distinct from 'service_role' then return false; end if;
  select * into provisioning from public.meta_instant_form_provisioning candidate
  where candidate.id = p_provisioning_id;
  if provisioning.id is null then return false; end if;
  select * into launch from public.campaign_launch_records candidate
  where candidate.organization_id = provisioning.organization_id
    and candidate.user_id = provisioning.user_id
    and candidate.campaign_id = provisioning.campaign_id
    and candidate.result_status = 'processing'
  for update;
  if launch.id is null then return false; end if;
  select * into authorization_record from public.meta_campaign_activation_preauthorizations candidate
  where candidate.launch_record_id = launch.id
    and candidate.status = 'authorized'
    and candidate.launch_approval_snapshot is not distinct from jsonb_set(
      launch.launch_input_snapshot, '{destination,provider_form_id}', 'null'::jsonb, false
    )
  for key share;
  if authorization_record.id is null then return false; end if;
  update public.meta_instant_form_provisioning candidate set
    subscription_state = 'armed',
    subscription_armed_at = timezone('utc', now()),
    subscription_receipted_at = null,
    subscription_evidence_digest = null,
    updated_at = timezone('utc', now())
  where candidate.id = provisioning.id
    and candidate.status = 'processing'
    and candidate.processing_token = p_processing_token
    and candidate.processing_generation = p_processing_generation
    and candidate.processing_locked_until > timezone('utc', now())
    and candidate.provider_form_id is not null
    and candidate.provider_mutation_state in ('receipted', 'reconciled')
    and candidate.subscription_state = 'pending'
    and exists (
      select 1 from public.meta_campaign_activation_preauthorizations current_authorization
      where current_authorization.id = authorization_record.id and current_authorization.status = 'authorized'
    );
  return found;
end;
$$;

create or replace function public.record_meta_instant_form_subscription_receipt(
  p_provisioning_id uuid,
  p_processing_token uuid,
  p_processing_generation bigint,
  p_evidence_digest text,
  p_receipt_source text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, auth
as $$
  with receipted as (
    update public.meta_instant_form_provisioning candidate set
      subscription_state = case when p_receipt_source = 'reconciled' then 'reconciled' else 'subscribed' end,
      subscription_receipted_at = timezone('utc', now()),
      subscription_evidence_digest = p_evidence_digest,
      updated_at = timezone('utc', now())
    where auth.role() = 'service_role'
      and candidate.id = p_provisioning_id
      and candidate.status = 'processing'
      and candidate.processing_token = p_processing_token
      and candidate.processing_generation = p_processing_generation
      and candidate.processing_locked_until > timezone('utc', now())
      and p_evidence_digest ~ '^[0-9a-f]{64}$'
      and p_receipt_source in ('provider_response', 'reconciled')
      and (
        (p_receipt_source = 'provider_response' and candidate.subscription_state = 'armed')
        or (p_receipt_source = 'reconciled' and candidate.subscription_state in ('pending', 'armed'))
      )
    returning 1
  )
  select exists(select 1 from receipted)
$$;

create or replace function public.settle_meta_instant_form_provisioning(
  p_provisioning_id uuid,
  p_processing_token uuid,
  p_processing_generation bigint,
  p_outcome text,
  p_provider_form_id text default null,
  p_error_code text default null,
  p_error_message text default null
)
returns table (settled boolean, provisioning_status text, provider_form_id text)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  settled_row public.meta_instant_form_provisioning%rowtype;
begin
  if auth.role() is distinct from 'service_role'
    or p_outcome not in ('created', 'rejected', 'operator_required')
    or (p_outcome = 'created' and coalesce(p_provider_form_id, '') !~ '^[0-9]{5,40}$') then
    raise exception 'invalid instant form provisioning settlement' using errcode = '22023';
  end if;
  update public.meta_instant_form_provisioning candidate set
    status = p_outcome,
    provider_form_id = case when p_provider_form_id ~ '^[0-9]{5,40}$' then p_provider_form_id else candidate.provider_form_id end,
    processing_token = null,
    processing_locked_until = null,
    provider_mutation_state = case
      when p_outcome = 'created' and candidate.provider_mutation_state = 'reconciled' then 'reconciled'
      when p_outcome = 'created' then 'receipted'
      when p_outcome = 'rejected' and candidate.provider_form_id is null then 'rejected'
      when p_outcome = 'operator_required' and candidate.provider_form_id is null then 'operator_required'
      else candidate.provider_mutation_state end,
    subscription_state = case
      when p_outcome = 'created' then candidate.subscription_state
      when p_outcome = 'rejected' and candidate.provider_form_id is not null then 'rejected'
      when p_outcome = 'operator_required' and candidate.provider_form_id is not null then 'operator_required'
      else candidate.subscription_state end,
    last_error_code = p_error_code,
    last_error_message = left(p_error_message, 2000),
    completed_at = case when p_outcome = 'created' then timezone('utc', now()) else null end,
    updated_at = timezone('utc', now())
  where candidate.id = p_provisioning_id
    and candidate.status = 'processing'
    and candidate.processing_token = p_processing_token
    and candidate.processing_generation = p_processing_generation
    and (
      p_outcome <> 'created'
      or (
        candidate.provider_form_id = p_provider_form_id
        and candidate.provider_mutation_state in ('receipted', 'reconciled')
        and candidate.subscription_state in ('subscribed', 'reconciled')
        and candidate.subscription_receipted_at is not null
        and candidate.subscription_evidence_digest ~ '^[0-9a-f]{64}$'
        and exists (
          select 1
          from public.campaign_launch_records launch
          join public.meta_campaign_activation_preauthorizations authz
            on authz.launch_record_id = launch.id
          where launch.organization_id = candidate.organization_id
            and launch.user_id = candidate.user_id
            and launch.campaign_id = candidate.campaign_id
            and launch.result_status = 'processing'
            and authz.status = 'authorized'
        )
      )
    )
  returning * into settled_row;
  if found then
    return query select true, settled_row.status, settled_row.provider_form_id;
    return;
  end if;
  select * into settled_row from public.meta_instant_form_provisioning candidate
  where candidate.id = p_provisioning_id;
  return query select false, settled_row.status, settled_row.provider_form_id;
end;
$$;

-- The immutable customer approval binds the form definition. The provider form
-- id is a dynamic receipt stored in the provisioning table, not customer input.
create or replace function private.finalize_meta_instant_form_launch_route()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  form_receipt public.meta_instant_form_provisioning%rowtype;
  account_record public.marketing_accounts%rowtype;
  snapshot_definition_digest text;
begin
  if new.result_status <> 'success'
    or new.launch_mode not in ('provider_paused', 'scheduled_provider_paused')
    or coalesce(new.launch_input_snapshot -> 'destination' ->> 'ad_destination', 'website') <> 'meta_instant_form' then
    return new;
  end if;
  snapshot_definition_digest := nullif(trim(coalesce(
    new.launch_input_snapshot -> 'destination' ->> 'form_definition_digest', ''
  )), '');
  if snapshot_definition_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'meta_instant_form_launch_snapshot_incomplete' using errcode = '23514';
  end if;
  select provisioning.* into strict form_receipt
  from public.meta_instant_form_provisioning provisioning
  where provisioning.organization_id = new.organization_id
    and provisioning.user_id = new.user_id
    and provisioning.campaign_id = new.campaign_id
    and provisioning.definition_digest = snapshot_definition_digest
    and provisioning.provider_form_id ~ '^[0-9]{5,40}$'
    and provisioning.status = 'created'
    and provisioning.subscription_state in ('subscribed', 'reconciled');
  select account.* into strict account_record
  from public.marketing_accounts account
  where account.id = form_receipt.marketing_account_id
    and account.organization_id = new.organization_id
    and account.platform = 'meta_ads' and account.status = 'connected';
  perform * from public.upsert_meta_leadgen_route(
    new.organization_id, new.user_id, new.user_id, new.campaign_id,
    form_receipt.marketing_account_id, replace(account_record.external_account_id, 'act_', ''),
    form_receipt.provider_page_id, form_receipt.provider_form_id, 'active'
  );
  if not found then raise exception 'meta_instant_form_route_not_created' using errcode = 'P0002'; end if;
  return new;
exception when no_data_found or too_many_rows then
  raise exception 'meta_instant_form_route_authority_ambiguous' using errcode = '23514';
end;
$$;

create or replace function public.finalize_meta_campaign_activation_preauthorization(
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid,
  p_launch_record_id uuid
)
returns table (finalization_status text, authorization_id uuid, activation_intent_id uuid, error_code text)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  preauth public.meta_campaign_activation_preauthorizations%rowtype;
  launch public.campaign_launch_records%rowtype;
  account_id uuid;
  account_count integer;
  activation_digest text;
  inserted_intent public.meta_campaign_activation_intents%rowtype;
  object_id text;
  object_sequence integer := 0;
  snapshot_account_id text;
  snapshot_page_id text;
  snapshot_pixel_id text;
  snapshot_selected_ad_id text;
  snapshot_ad_destination text;
  snapshot_destination_url_digest text;
  snapshot_currency text;
  snapshot_budget text;
  normalized_launch_approval_snapshot jsonb;
  snapshot_approval_digest text;
  failure_code text;
  receipt_stage text;
  expected_receipt_ids text[];
  observed_receipt_ids text[];
  successful_receipt_ids text[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role finalization authority is required' using errcode = '42501';
  end if;

  -- Every launch/preauthorization path uses the same lock order. Cancellation,
  -- finalization, and provider arms therefore serialize on launch first and
  -- cannot deadlock or finalize stale consent after cancellation.
  select * into launch from public.campaign_launch_records candidate
  where candidate.id = p_launch_record_id
    and candidate.organization_id = p_organization_id
    and candidate.user_id = p_user_id
    and candidate.campaign_id = p_campaign_id
  for update;

  select * into preauth
  from public.meta_campaign_activation_preauthorizations candidate
  where candidate.organization_id = p_organization_id
    and candidate.user_id = p_user_id
    and candidate.campaign_id = p_campaign_id
    and candidate.launch_record_id = p_launch_record_id
    and candidate.status in ('authorized', 'finalized')
  for update;
  if preauth.id is null then
    return query select 'not_authorized'::text, null::uuid, null::uuid, null::text;
    return;
  end if;
  if preauth.status = 'finalized' then
    return query select 'finalized'::text, preauth.id, preauth.activation_intent_id, null::text;
    return;
  end if;

  if launch.id is null or launch.result_status <> 'success'
    or launch.launch_mode not in ('provider_paused', 'scheduled_provider_paused')
    or launch.scheduled_for is distinct from preauth.scheduled_for
    or launch.launch_input_digest !~ '^[0-9a-f]{64}$'
    or launch.meta_campaign_id !~ '^[0-9]{5,40}$'
    or launch.meta_creative_id !~ '^[0-9]{5,40}$'
    or jsonb_typeof(launch.meta_ad_set_ids) <> 'array'
    or jsonb_array_length(launch.meta_ad_set_ids) not between 1 and 20
    or jsonb_typeof(launch.meta_ad_ids) <> 'array'
    or jsonb_array_length(launch.meta_ad_ids) not between 1 and 20 then
    failure_code := 'meta_activation_launch_receipt_mismatch';
  end if;

  snapshot_account_id := nullif(trim(coalesce(launch.launch_input_snapshot -> 'provider' ->> 'ad_account_id', '')), '');
  snapshot_currency := upper(trim(coalesce(launch.launch_input_snapshot -> 'provider' ->> 'account_currency', '')));
  snapshot_page_id := nullif(trim(coalesce(launch.launch_input_snapshot -> 'provider' ->> 'page_id', '')), '');
  snapshot_pixel_id := nullif(trim(coalesce(launch.launch_input_snapshot -> 'provider' ->> 'pixel_id', '')), '');
  snapshot_selected_ad_id := nullif(trim(coalesce(launch.launch_input_snapshot -> 'creative' ->> 'selected_ad_id', '')), '');
  snapshot_ad_destination := lower(trim(coalesce(launch.launch_input_snapshot -> 'destination' ->> 'ad_destination', '')));
  snapshot_destination_url_digest := encode(extensions.digest(convert_to(
    coalesce(launch.launch_input_snapshot ->> 'destination_url', ''), 'UTF8'
  ), 'sha256'), 'hex');
  snapshot_budget := nullif(trim(coalesce(launch.launch_input_snapshot -> 'delivery' ->> 'daily_budget_minor', '')), '');
  normalized_launch_approval_snapshot := jsonb_set(
    launch.launch_input_snapshot,
    '{destination,provider_form_id}',
    'null'::jsonb,
    false
  );
  snapshot_approval_digest := encode(extensions.digest(
    convert_to(coalesce(normalized_launch_approval_snapshot, '{}'::jsonb)::text, 'UTF8'),
    'sha256'
  ), 'hex');
  if failure_code is null and (
    snapshot_account_id !~ '^(act_)?[0-9]{5,40}$'
    or replace(snapshot_account_id, 'act_', '') is distinct from preauth.provider_ad_account_id
    or snapshot_currency is distinct from preauth.approved_currency
    or snapshot_page_id is distinct from preauth.provider_page_id
    or snapshot_pixel_id is distinct from preauth.provider_pixel_id
    or snapshot_selected_ad_id is distinct from preauth.selected_ad_id
    or snapshot_ad_destination is distinct from preauth.ad_destination
    or snapshot_destination_url_digest is distinct from preauth.destination_url_digest
    or snapshot_budget !~ '^[0-9]+$'
    or snapshot_budget::bigint is distinct from preauth.approved_daily_budget_minor
    or normalized_launch_approval_snapshot is distinct from preauth.launch_approval_snapshot
    or snapshot_approval_digest is distinct from preauth.launch_approval_digest
    or exists (select 1 from jsonb_array_elements_text(launch.meta_ad_set_ids) value where value !~ '^[0-9]{5,40}$')
    or exists (select 1 from jsonb_array_elements_text(launch.meta_ad_ids) value where value !~ '^[0-9]{5,40}$')
  ) then
    failure_code := 'meta_activation_immutable_input_mismatch';
  end if;

  if failure_code is null then
    foreach receipt_stage in array array['campaign', 'adset', 'creative', 'ad'] loop
      expected_receipt_ids := case receipt_stage
        when 'campaign' then array[launch.meta_campaign_id]
        when 'adset' then array(select value from jsonb_array_elements_text(launch.meta_ad_set_ids) value order by value)
        when 'creative' then array[launch.meta_creative_id]
        when 'ad' then array(select value from jsonb_array_elements_text(launch.meta_ad_ids) value order by value)
      end;
      select
        coalesce(array_agg(distinct receipt.object_id order by receipt.object_id), array[]::text[]),
        coalesce(array_agg(distinct receipt.object_id order by receipt.object_id)
          filter (where receipt.response_status between 200 and 299), array[]::text[])
      into observed_receipt_ids, successful_receipt_ids
      from public.campaign_launch_provider_receipts receipt
      where receipt.launch_id = launch.id
        and receipt.stage = receipt_stage
        and receipt.launch_input_digest = launch.launch_input_digest;
      if observed_receipt_ids is distinct from expected_receipt_ids
        or successful_receipt_ids is distinct from expected_receipt_ids
        or exists (
          select 1 from public.campaign_launch_provider_receipts receipt
          where receipt.launch_id = launch.id
            and receipt.stage = receipt_stage
            and receipt.launch_input_digest is distinct from launch.launch_input_digest
        ) then
        failure_code := 'meta_activation_creation_receipt_mismatch';
        exit;
      end if;
    end loop;
  end if;

  if failure_code is null then
    select count(*), (array_agg(candidate.id order by candidate.id))[1] into account_count, account_id
    from public.marketing_accounts candidate
    where candidate.organization_id = p_organization_id
      and candidate.platform = 'meta_ads'
      and candidate.status = 'connected'
      and replace(candidate.external_account_id, 'act_', '') = preauth.provider_ad_account_id;
    if account_count <> 1 then
      failure_code := 'meta_activation_account_authority_mismatch';
    end if;
  end if;

  if failure_code is not null then
    update public.meta_campaign_activation_preauthorizations candidate set
      status = 'operator_required', last_error_code = failure_code,
      last_error_message = 'Immutable customer authority did not exactly match the receipted PAUSED launch.',
      updated_at = timezone('utc', now())
    where candidate.id = preauth.id;
    return query select 'operator_required'::text, preauth.id, null::uuid, failure_code;
    return;
  end if;

  activation_digest := encode(extensions.digest(convert_to(concat_ws('|',
    preauth.authorization_input_digest, launch.launch_input_digest,
    launch.meta_campaign_id, launch.meta_ad_set_ids::text, launch.meta_ad_ids::text,
    snapshot_account_id, snapshot_page_id, snapshot_pixel_id,
    snapshot_selected_ad_id, snapshot_ad_destination, snapshot_destination_url_digest
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.meta_campaign_activation_intents (
    organization_id, user_id, campaign_id, launch_record_id, marketing_account_id,
    customer_authorized_by, customer_authorized_at, customer_approval_digest,
    launch_input_digest, activation_input_digest, idempotency_key, scheduled_for,
    approved_daily_budget_minor, approved_currency, provider_ad_account_id,
    provider_campaign_id, provider_ad_set_ids, provider_ad_ids
  ) values (
    preauth.organization_id, preauth.user_id, preauth.campaign_id,
    preauth.launch_record_id, account_id, preauth.customer_authorized_by,
    preauth.customer_authorized_at, preauth.customer_approval_digest,
    launch.launch_input_digest, activation_digest, preauth.idempotency_key,
    preauth.scheduled_for, preauth.approved_daily_budget_minor,
    preauth.approved_currency, snapshot_account_id, launch.meta_campaign_id,
    launch.meta_ad_set_ids, launch.meta_ad_ids
  )
  returning * into inserted_intent;

  for object_id in select value from jsonb_array_elements_text(launch.meta_ad_ids) value loop
    object_sequence := object_sequence + 1;
    insert into public.meta_campaign_activation_objects (
      activation_intent_id, sequence_number, provider_object_type, provider_object_id
    ) values (inserted_intent.id, object_sequence, 'ad', object_id);
  end loop;
  for object_id in select value from jsonb_array_elements_text(launch.meta_ad_set_ids) value loop
    object_sequence := object_sequence + 1;
    insert into public.meta_campaign_activation_objects (
      activation_intent_id, sequence_number, provider_object_type, provider_object_id
    ) values (inserted_intent.id, object_sequence, 'adset', object_id);
  end loop;
  insert into public.meta_campaign_activation_objects (
    activation_intent_id, sequence_number, provider_object_type, provider_object_id
  ) values (inserted_intent.id, object_sequence + 1, 'campaign', launch.meta_campaign_id);

  update public.meta_campaign_activation_preauthorizations candidate set
    status = 'finalized', activation_intent_id = inserted_intent.id,
    last_error_code = null, last_error_message = null,
    updated_at = timezone('utc', now())
  where candidate.id = preauth.id;

  return query select 'finalized'::text, preauth.id, inserted_intent.id, null::text;
end;
$$;

create or replace function public.finalize_due_meta_campaign_activation_preauthorizations(p_limit integer default 20)
returns table (examined_count integer, finalized_count integer, operator_required_count integer)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  candidate record;
  outcome record;
  examined integer := 0;
  finalized integer := 0;
  operator_required integer := 0;
begin
  if auth.role() is distinct from 'service_role' or p_limit not between 1 and 100 then
    raise exception 'invalid activation finalization recovery request' using errcode = '42501';
  end if;
  for candidate in
    select preauth.organization_id, preauth.user_id,
      preauth.campaign_id, preauth.launch_record_id
    from public.meta_campaign_activation_preauthorizations preauth
    join public.campaign_launch_records launch on launch.id = preauth.launch_record_id
    where preauth.status = 'authorized'
      and launch.result_status = 'success'
      and launch.launch_mode in ('provider_paused', 'scheduled_provider_paused')
    order by preauth.created_at
    limit p_limit
  loop
    examined := examined + 1;
    select * into outcome from public.finalize_meta_campaign_activation_preauthorization(
      candidate.organization_id, candidate.user_id, candidate.campaign_id, candidate.launch_record_id
    );
    if outcome.finalization_status = 'finalized' then finalized := finalized + 1;
    elsif outcome.finalization_status = 'operator_required' then operator_required := operator_required + 1;
    end if;
  end loop;
  return query select examined, finalized, operator_required;
end;
$$;

-- A previously created form is not assumed healthy forever. This service-only
-- reacquisition preserves the immutable form receipt but resets subscription
-- verification under a fresh fenced lease. It uses the universal lock order:
-- launch, preauthorization, then provisioning.
create or replace function public.reacquire_meta_instant_form_verification(
  p_provisioning_id uuid,
  p_processing_token uuid,
  p_lease_seconds integer default 300
)
returns table (
  provisioning_id uuid,
  acquired boolean,
  provisioning_status text,
  provider_form_id text,
  processing_generation bigint,
  provider_mutation_state text,
  subscription_state text,
  processing_locked_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  initial public.meta_instant_form_provisioning%rowtype;
  current_row public.meta_instant_form_provisioning%rowtype;
  launch public.campaign_launch_records%rowtype;
  authorization_record public.meta_campaign_activation_preauthorizations%rowtype;
begin
  if auth.role() is distinct from 'service_role'
    or p_processing_token is null
    or p_lease_seconds not between 30 and 900 then
    raise exception 'invalid Instant Form verification reacquisition' using errcode = '42501';
  end if;
  select * into initial from public.meta_instant_form_provisioning candidate
  where candidate.id = p_provisioning_id;
  if initial.id is null then return; end if;

  select * into launch from public.campaign_launch_records candidate
  where candidate.organization_id = initial.organization_id
    and candidate.user_id = initial.user_id
    and candidate.campaign_id = initial.campaign_id
    and candidate.result_status = 'processing'
  for update;
  if launch.id is null then return; end if;
  select * into authorization_record from public.meta_campaign_activation_preauthorizations candidate
  where candidate.launch_record_id = launch.id
    and candidate.organization_id = launch.organization_id
    and candidate.user_id = launch.user_id
    and candidate.campaign_id = launch.campaign_id
    and candidate.status = 'authorized'
    and candidate.launch_approval_snapshot is not distinct from jsonb_set(
      launch.launch_input_snapshot, '{destination,provider_form_id}', 'null'::jsonb, false
    )
  for update;
  if authorization_record.id is null then return; end if;
  select * into current_row from public.meta_instant_form_provisioning candidate
  where candidate.id = initial.id
    and candidate.organization_id = authorization_record.organization_id
    and candidate.user_id = authorization_record.user_id
    and candidate.campaign_id = authorization_record.campaign_id
    and candidate.definition_digest = coalesce(
      authorization_record.launch_approval_snapshot -> 'destination' ->> 'form_definition_digest', ''
    )
  for update;
  if current_row.id is null
    or current_row.status <> 'created'
    or current_row.provider_form_id !~ '^[0-9]{5,40}$'
    or current_row.provider_mutation_state not in ('receipted', 'reconciled')
    or current_row.subscription_state not in ('subscribed', 'reconciled')
    or current_row.subscription_receipted_at is null
    or current_row.subscription_evidence_digest !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  update public.meta_instant_form_provisioning candidate set
    status = 'processing',
    processing_token = p_processing_token,
    processing_generation = candidate.processing_generation + 1,
    processing_locked_until = timezone('utc', now()) + make_interval(secs => p_lease_seconds),
    subscription_state = 'pending',
    subscription_armed_at = null,
    subscription_receipted_at = null,
    subscription_evidence_digest = null,
    attempt_count = candidate.attempt_count + 1,
    completed_at = null,
    last_error_code = null,
    last_error_message = null,
    updated_at = timezone('utc', now())
  where candidate.id = current_row.id
    and exists (
      select 1 from public.meta_campaign_activation_preauthorizations current_authorization
      where current_authorization.id = authorization_record.id
        and current_authorization.status = 'authorized'
    )
  returning * into current_row;
  return query select current_row.id, true, current_row.status,
    current_row.provider_form_id, current_row.processing_generation,
    current_row.provider_mutation_state, current_row.subscription_state,
    current_row.processing_locked_until;
end;
$$;

-- The post-launch customer function from the previous tranche is deliberately
-- unreachable now. Customer authority must be captured before provider launch.
revoke all on function public.authorize_meta_campaign_activation(uuid, uuid, uuid, timestamptz, bigint, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.preauthorize_meta_campaign_activation(uuid, uuid, uuid, bigint, text, text, text, text, text, text, text, jsonb, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.schedule_and_preauthorize_meta_campaign_activation(uuid, uuid, uuid, text, timestamptz, text, bigint, text, text, text, text, text, text, text, jsonb, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_meta_campaign_activation_authorization_status(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.assert_meta_campaign_activation_preauthorization(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_meta_campaign_activation_preauthorization(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_meta_campaign_activation_preauthorization(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_due_meta_campaign_activation_preauthorizations(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.arm_meta_instant_form_subscription_mutation(uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.record_meta_instant_form_subscription_receipt(uuid, uuid, bigint, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reacquire_meta_instant_form_verification(uuid, uuid, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.preauthorize_meta_campaign_activation(uuid, uuid, uuid, bigint, text, text, text, text, text, text, text, jsonb, text, text) to service_role;
grant execute on function public.schedule_and_preauthorize_meta_campaign_activation(uuid, uuid, uuid, text, timestamptz, text, bigint, text, text, text, text, text, text, text, jsonb, text, text) to service_role;
grant execute on function public.get_meta_campaign_activation_authorization_status(uuid, uuid) to authenticated;
grant execute on function public.assert_meta_campaign_activation_preauthorization(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.cancel_meta_campaign_activation_preauthorization(uuid, uuid, uuid) to authenticated;
grant execute on function public.finalize_meta_campaign_activation_preauthorization(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.finalize_due_meta_campaign_activation_preauthorizations(integer) to service_role;
grant execute on function public.arm_meta_instant_form_subscription_mutation(uuid, uuid, bigint) to service_role;
grant execute on function public.record_meta_instant_form_subscription_receipt(uuid, uuid, bigint, text, text) to service_role;
grant execute on function public.reacquire_meta_instant_form_verification(uuid, uuid, integer) to service_role;
