alter table public.lead_notifications
  add column if not exists request_digest text null,
  add column if not exists delivery_locked_by text null,
  add column if not exists delivery_locked_until timestamptz null,
  add column if not exists delivery_lease_token uuid null,
  add column if not exists delivery_lease_generation bigint not null default 0,
  add column if not exists delivery_attempt_count integer not null default 0;

alter table public.lead_notifications
  drop constraint if exists lead_notifications_status_check;
alter table public.lead_notifications
  add constraint lead_notifications_status_check
  check (status in ('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'operator_action_required'));

update public.lead_notifications
set status = 'operator_action_required',
    error_message = 'Legacy queued delivery has no provider receipt and must be reconciled before retry.',
    updated_at = timezone('utc', now())
where status = 'queued';

alter table public.lead_notifications
  drop constraint if exists lead_notifications_delivery_attempt_count_check;
alter table public.lead_notifications
  add constraint lead_notifications_delivery_attempt_count_check
  check (delivery_attempt_count >= 0 and delivery_lease_generation >= 0);

create or replace function public.claim_lead_notification_delivery(
  p_notification_id uuid,
  p_worker_id text,
  p_request_digest text,
  p_lease_ms integer default 120000
)
returns setof public.lead_notifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.lead_notifications%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to claim SMS delivery';
  end if;

  if p_worker_id is null or length(trim(p_worker_id)) = 0
    or p_request_digest is null
    or trim(p_request_digest) !~ '^[0-9a-f]{64}$' then
    raise exception 'SMS delivery claim identity is incomplete';
  end if;

  -- A purpose-scoped notification is immutable. Reusing its unique identity
  -- with different recipient/body input must never reuse a prior success or
  -- leave a queued row claimable under the old payload.
  update public.lead_notifications notification
  set status = 'operator_action_required',
      error_message = 'SMS notification identity was reused with a different request digest.',
      delivery_locked_by = null,
      delivery_locked_until = null,
      delivery_lease_token = null,
      updated_at = timezone('utc', now())
  where notification.id = p_notification_id
    and notification.request_digest is not null
    and notification.request_digest <> trim(p_request_digest)
    and notification.status not in ('sending', 'operator_action_required');

  update public.lead_notifications notification
  set status = 'operator_action_required',
      error_message = 'A prior SMS provider attempt has no durable receipt; reconcile it before retry.',
      delivery_locked_by = null,
      delivery_locked_until = null,
      delivery_lease_token = null,
      updated_at = timezone('utc', now())
  where notification.id = p_notification_id
    and notification.status = 'sending'
    and coalesce(notification.delivery_locked_until, '-infinity'::timestamptz)
      <= timezone('utc', now());

  update public.lead_notifications notification
  set status = 'sending',
      request_digest = trim(p_request_digest),
      delivery_locked_by = trim(p_worker_id),
      delivery_locked_until = timezone('utc', now())
        + make_interval(secs => least(greatest(coalesce(p_lease_ms, 120000), 30000), 600000) / 1000.0),
      delivery_lease_token = gen_random_uuid(),
      delivery_lease_generation = notification.delivery_lease_generation + 1,
      delivery_attempt_count = notification.delivery_attempt_count + 1,
      error_message = null,
      updated_at = timezone('utc', now())
  where notification.id = p_notification_id
    and notification.status = 'queued'
    and (notification.request_digest is null or notification.request_digest = trim(p_request_digest))
  returning * into claimed;

  if claimed.id is not null then
    return next claimed;
    return;
  end if;

  return query
  select * from public.lead_notifications notification
  where notification.id = p_notification_id;
end;
$$;

revoke execute on function public.claim_lead_notification_delivery(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_lead_notification_delivery(uuid, text, text, integer)
  to service_role;

create or replace function public.settle_lead_notification_delivery(
  p_notification_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_status text,
  p_provider_message_id text,
  p_error_message text
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
    raise exception 'service_role is required to settle SMS delivery';
  end if;

  if p_status not in ('sent', 'failed', 'operator_action_required') then
    raise exception 'SMS settlement status is invalid';
  end if;

  if p_status = 'sent' and nullif(trim(coalesce(p_provider_message_id, '')), '') is null then
    raise exception 'sent SMS settlement requires a provider receipt';
  end if;

  update public.lead_notifications notification
  set status = p_status,
      provider_message_id = nullif(trim(coalesce(p_provider_message_id, '')), ''),
      error_message = nullif(left(coalesce(p_error_message, ''), 500), ''),
      sent_at = case when p_status = 'sent' then timezone('utc', now()) else notification.sent_at end,
      failed_at = case when p_status = 'failed' then timezone('utc', now()) else notification.failed_at end,
      delivery_locked_by = null,
      delivery_locked_until = null,
      delivery_lease_token = null,
      updated_at = timezone('utc', now())
  where notification.id = p_notification_id
    and notification.status = 'sending'
    and notification.delivery_locked_by = trim(p_worker_id)
    and notification.delivery_lease_token = p_lease_token
    and notification.delivery_lease_generation = p_lease_generation
    and notification.delivery_locked_until > timezone('utc', now());

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke execute on function public.settle_lead_notification_delivery(uuid, text, uuid, bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_lead_notification_delivery(uuid, text, uuid, bigint, text, text, text)
  to service_role;

create or replace function public.apply_lead_notification_delivery_status(
  p_provider_message_id text,
  p_status text,
  p_error_message text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification public.lead_notifications%rowtype;
  next_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to apply SMS delivery status';
  end if;

  if nullif(trim(coalesce(p_provider_message_id, '')), '') is null
    or p_status not in ('queued', 'sent', 'delivered', 'undelivered', 'failed') then
    raise exception 'SMS provider delivery status is invalid';
  end if;

  select * into notification
  from public.lead_notifications existing
  where existing.provider_message_id = trim(p_provider_message_id)
  for update;

  if notification.id is null then
    return false;
  end if;

  -- The local provider acceptance receipt is already `sent`. A late or
  -- out-of-order `queued` callback may never regress it to a claimable state.
  -- Successful and failed terminal callbacks are likewise monotonic.
  next_status := case
    when notification.status = 'delivered' then 'delivered'
    when notification.status in ('failed', 'undelivered') then notification.status
    when notification.status = 'operator_action_required' then notification.status
    when p_status = 'queued' then notification.status
    else p_status
  end;

  update public.lead_notifications existing
  set status = next_status,
      error_message = case
        when next_status in ('failed', 'undelivered')
          then nullif(left(coalesce(p_error_message, ''), 500), '')
        else existing.error_message
      end,
      delivered_at = case
        when next_status = 'delivered' and existing.delivered_at is null
          then timezone('utc', now())
        else existing.delivered_at
      end,
      failed_at = case
        when next_status in ('failed', 'undelivered') and existing.failed_at is null
          then timezone('utc', now())
        else existing.failed_at
      end,
      updated_at = timezone('utc', now())
  where existing.id = notification.id;

  return true;
end;
$$;

revoke execute on function public.apply_lead_notification_delivery_status(text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_lead_notification_delivery_status(text, text, text)
  to service_role;

create table if not exists public.inbound_sms_receipts (
  provider_message_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  message_digest text not null check (length(message_digest) = 64),
  status text not null check (status in ('processing', 'retrying', 'completed', 'operator_action_required')),
  attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 5),
  locked_by text null,
  locked_until timestamptz null,
  lease_token uuid null,
  lease_generation bigint not null default 0 check (lease_generation >= 0),
  result jsonb null,
  last_error_code text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  constraint inbound_sms_receipts_lead_organization_fk
    foreign key (lead_id, organization_id)
    references public.leads (id, organization_id)
    on delete cascade
);

alter table public.inbound_sms_receipts enable row level security;
alter table public.inbound_sms_receipts force row level security;
revoke all on public.inbound_sms_receipts from anon, authenticated;

create or replace function public.claim_inbound_sms_receipt(
  p_provider_message_id text,
  p_organization_id uuid,
  p_lead_id uuid,
  p_message_digest text,
  p_worker_id text,
  p_lease_ms integer default 120000
)
returns setof public.inbound_sms_receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt public.inbound_sms_receipts%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to claim inbound SMS receipts';
  end if;

  if nullif(trim(coalesce(p_provider_message_id, '')), '') is null
    or nullif(trim(coalesce(p_worker_id, '')), '') is null
    or trim(coalesce(p_message_digest, '')) !~ '^[0-9a-f]{64}$' then
    raise exception 'inbound SMS receipt identity is incomplete';
  end if;

  insert into public.inbound_sms_receipts (
    provider_message_id,
    organization_id,
    lead_id,
    message_digest,
    status,
    attempt_count
  ) values (
    trim(p_provider_message_id),
    p_organization_id,
    p_lead_id,
    trim(p_message_digest),
    'retrying',
    0
  )
  on conflict (provider_message_id) do nothing;

  select * into strict receipt
  from public.inbound_sms_receipts existing
  where existing.provider_message_id = trim(p_provider_message_id)
  for update;

  if receipt.organization_id <> p_organization_id
    or receipt.lead_id <> p_lead_id
    or receipt.message_digest <> trim(p_message_digest) then
    if receipt.status = 'processing'
      and receipt.locked_until > timezone('utc', now()) then
      -- Fail the colliding caller closed without invalidating the legitimate
      -- in-flight lease after it may already have applied an atomic effect.
      receipt.status := 'operator_action_required';
      receipt.locked_by := null;
      receipt.locked_until := null;
      receipt.lease_token := null;
      receipt.last_error_code := 'inbound_sms_identity_collision';
      return next receipt;
      return;
    end if;

    update public.inbound_sms_receipts existing
    set status = 'operator_action_required',
        locked_by = null,
        locked_until = null,
        lease_token = null,
        last_error_code = 'inbound_sms_identity_collision',
        updated_at = timezone('utc', now())
    where existing.provider_message_id = receipt.provider_message_id
    returning * into receipt;
    return next receipt;
    return;
  end if;

  if receipt.status = 'completed' or receipt.status = 'operator_action_required' then
    return next receipt;
    return;
  end if;

  if receipt.status = 'processing' and receipt.locked_until > timezone('utc', now()) then
    return next receipt;
    return;
  end if;

  if receipt.attempt_count >= 5 then
    update public.inbound_sms_receipts existing
    set status = 'operator_action_required',
        locked_by = null,
        locked_until = null,
        lease_token = null,
        last_error_code = 'inbound_sms_attempts_exhausted',
        updated_at = timezone('utc', now())
    where existing.provider_message_id = receipt.provider_message_id
    returning * into receipt;
    return next receipt;
    return;
  end if;

  update public.inbound_sms_receipts existing
  set status = 'processing',
      attempt_count = existing.attempt_count + 1,
      locked_by = trim(p_worker_id),
      locked_until = timezone('utc', now())
        + make_interval(secs => least(greatest(coalesce(p_lease_ms, 120000), 30000), 600000) / 1000.0),
      lease_token = gen_random_uuid(),
      lease_generation = existing.lease_generation + 1,
      last_error_code = null,
      updated_at = timezone('utc', now())
  where existing.provider_message_id = receipt.provider_message_id
  returning * into receipt;

  return next receipt;
end;
$$;

revoke execute on function public.claim_inbound_sms_receipt(text, uuid, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_inbound_sms_receipt(text, uuid, uuid, text, text, integer)
  to service_role;

create or replace function public.settle_inbound_sms_receipt(
  p_provider_message_id text,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_status text,
  p_result jsonb,
  p_error_code text
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
    raise exception 'service_role is required to settle inbound SMS receipts';
  end if;

  if p_status not in ('completed', 'retrying', 'operator_action_required') then
    raise exception 'inbound SMS receipt settlement status is invalid';
  end if;

  update public.inbound_sms_receipts receipt
  set status = p_status,
      result = case when p_status = 'completed' then coalesce(p_result, '{}'::jsonb) else receipt.result end,
      last_error_code = nullif(trim(coalesce(p_error_code, '')), ''),
      locked_by = null,
      locked_until = null,
      lease_token = null,
      completed_at = case when p_status = 'completed' then timezone('utc', now()) else receipt.completed_at end,
      updated_at = timezone('utc', now())
  where receipt.provider_message_id = trim(p_provider_message_id)
    and receipt.status = 'processing'
    and receipt.locked_by = trim(p_worker_id)
    and receipt.lease_token = p_lease_token
    and receipt.lease_generation = p_lease_generation
    and receipt.locked_until > timezone('utc', now());

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke execute on function public.settle_inbound_sms_receipt(text, text, uuid, bigint, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.settle_inbound_sms_receipt(text, text, uuid, bigint, text, jsonb, text)
  to service_role;

create or replace function public.complete_inbound_sms_compliance_receipt(
  p_provider_message_id text,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_action text
)
returns setof public.inbound_sms_receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt public.inbound_sms_receipts%rowtype;
  lead_record public.leads%rowtype;
  completed_result jsonb;
  captured_at timestamptz := timezone('utc', now());
  response_text text;
  result_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to complete inbound SMS compliance receipts';
  end if;

  if nullif(trim(coalesce(p_provider_message_id, '')), '') is null
    or nullif(trim(coalesce(p_worker_id, '')), '') is null
    or p_lease_token is null
    or p_lease_generation is null
    or p_lease_generation < 1 then
    raise exception 'inbound SMS compliance lease identity is incomplete';
  end if;

  if p_action is null or p_action not in ('opt_out', 'opt_in', 'help') then
    raise exception 'inbound SMS compliance action is invalid';
  end if;

  select * into receipt
  from public.inbound_sms_receipts existing
  where existing.provider_message_id = trim(p_provider_message_id)
  for update;

  if receipt.provider_message_id is null
    or receipt.status <> 'processing'
    or receipt.locked_by is distinct from trim(p_worker_id)
    or receipt.lease_token is distinct from p_lease_token
    or receipt.lease_generation is distinct from p_lease_generation
    or receipt.locked_until is null
    or receipt.locked_until <= timezone('utc', now()) then
    return;
  end if;

  select * into lead_record
  from public.leads existing
  where existing.id = receipt.lead_id
    and existing.organization_id = receipt.organization_id
  for update;

  if lead_record.id is null then
    raise exception 'inbound SMS compliance lead identity is missing';
  end if;

  if p_action = 'opt_out' then
    update public.leads existing
    set sms_opted_out_at = coalesce(existing.sms_opted_out_at, captured_at),
        status = 'lost',
        metadata = case
          when jsonb_typeof(existing.metadata) = 'object' then existing.metadata
          else '{}'::jsonb
        end || jsonb_build_object(
          'sms_opt_out',
          jsonb_build_object(
            'status', 'opted_out',
            'opted_out_at', coalesce(existing.sms_opted_out_at, captured_at)
          )
        )
    where existing.id = receipt.lead_id
      and existing.organization_id = receipt.organization_id;

    response_text := 'You have been unsubscribed and will not receive more messages.';
    result_status := 'lost';
  elsif p_action = 'opt_in' then
    update public.leads existing
    set sms_opted_out_at = null,
        metadata = case
          when jsonb_typeof(existing.metadata) = 'object' then existing.metadata
          else '{}'::jsonb
        end || jsonb_build_object(
          'sms_opt_in',
          jsonb_build_object(
            'status', 'opted_in',
            'opted_in_at', captured_at,
            'source', 'inbound_start'
          )
        ),
        consent_metadata = jsonb_build_object(
          'source', 'inbound_start',
          'captured_at', captured_at,
          'sms', jsonb_build_object(
            'consented', true,
            'captured_at', captured_at,
            'phone', existing.phone,
            'consent_copy', 'Reply START to resume SMS messages. Message and data rates may apply. Reply STOP to opt out or HELP for help.',
            'opt_out_copy', 'Reply STOP to opt out or HELP for help.',
            'source_url', null,
            'privacy_url', '/privacy',
            'terms_url', '/terms'
          )
        )
    where existing.id = receipt.lead_id
      and existing.organization_id = receipt.organization_id;

    response_text := 'You are subscribed again. Reply STOP to opt out or HELP for help. Message and data rates may apply.';
    result_status := coalesce(lead_record.status::text, 'new');
  else
    response_text := 'DealFlow OS lead updates: reply STOP to opt out, START to resume, or contact the business directly for help. Message and data rates may apply.';
    result_status := coalesce(lead_record.status::text, 'new');
  end if;

  completed_result := jsonb_build_object(
    'leadId', receipt.lead_id::text,
    'response', response_text,
    'status', result_status,
    'slots', '[]'::jsonb,
    'blocked', false,
    'complianceAction', p_action
  );

  update public.inbound_sms_receipts existing
  set status = 'completed',
      result = completed_result,
      last_error_code = null,
      locked_by = null,
      locked_until = null,
      lease_token = null,
      completed_at = captured_at,
      updated_at = captured_at
  where existing.provider_message_id = receipt.provider_message_id
    and existing.status = 'processing'
    and existing.locked_by = trim(p_worker_id)
    and existing.lease_token = p_lease_token
    and existing.lease_generation = p_lease_generation
  returning * into receipt;

  if receipt.status = 'completed' then
    return next receipt;
  end if;
end;
$$;

revoke execute on function public.complete_inbound_sms_compliance_receipt(text, text, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.complete_inbound_sms_compliance_receipt(text, text, uuid, bigint, text)
  to service_role;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260710235600')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
