-- Bind every outbound SMS notification to the lead's canonical organization.
-- The migration intentionally fails if historical rows violate this identity;
-- those rows require explicit operator reconciliation, not guessed repair.
alter table public.lead_notifications
  drop constraint if exists lead_notifications_lead_tenant_fk;
alter table public.lead_notifications
  add constraint lead_notifications_lead_tenant_fk
  foreign key (lead_id, tenant_id)
  references public.leads (id, organization_id)
  on delete cascade;

create or replace function public.create_lead_notification_delivery_v2(
  p_tenant_id uuid,
  p_lead_id uuid,
  p_agent_id uuid,
  p_purpose text,
  p_request_digest text
)
returns setof public.lead_notifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification public.lead_notifications%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'sms_delivery_service_role_required';
  end if;

  if p_tenant_id is null or p_lead_id is null
    or p_purpose not in ('new_lead_alert', 'lead_reply_template')
    or trim(coalesce(p_request_digest, '')) !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'sms_delivery_identity_incomplete';
  end if;

  if p_agent_id is not null and not exists (
    select 1
    from public.agent_profiles agent
    where agent.id = p_agent_id
      and agent.tenant_id = p_tenant_id
  ) then
    raise exception using errcode = '23503', message = 'sms_delivery_agent_tenant_mismatch';
  end if;

  insert into public.lead_notifications (
    tenant_id,
    lead_id,
    agent_id,
    channel,
    provider,
    purpose,
    status,
    request_digest,
    updated_at
  ) values (
    p_tenant_id,
    p_lead_id,
    p_agent_id,
    'sms',
    'twilio',
    p_purpose,
    'queued',
    trim(p_request_digest),
    timezone('utc', now())
  )
  on conflict do nothing
  returning * into notification;

  if notification.id is not null then
    return next notification;
    return;
  end if;

  if p_agent_id is null then
    select * into strict notification
    from public.lead_notifications existing
    where existing.tenant_id = p_tenant_id
      and existing.lead_id = p_lead_id
      and existing.agent_id is null
      and existing.purpose = p_purpose
    limit 1;
  else
    select * into strict notification
    from public.lead_notifications existing
    where existing.tenant_id = p_tenant_id
      and existing.lead_id = p_lead_id
      and existing.agent_id = p_agent_id
      and existing.purpose = p_purpose
    limit 1;
  end if;

  return next notification;
end;
$$;

create or replace function public.record_failed_lead_notification_v2(
  p_tenant_id uuid,
  p_lead_id uuid,
  p_purpose text,
  p_error_message text
)
returns setof public.lead_notifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification public.lead_notifications%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'sms_delivery_service_role_required';
  end if;

  if p_tenant_id is null or p_lead_id is null
    or p_purpose not in ('new_lead_alert', 'lead_reply_template') then
    raise exception using errcode = '22023', message = 'sms_failure_identity_incomplete';
  end if;

  insert into public.lead_notifications (
    tenant_id,
    lead_id,
    agent_id,
    channel,
    provider,
    purpose,
    status,
    error_message,
    failed_at,
    updated_at
  ) values (
    p_tenant_id,
    p_lead_id,
    null,
    'sms',
    'twilio',
    p_purpose,
    'failed',
    nullif(left(coalesce(p_error_message, ''), 500), ''),
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict do nothing
  returning * into notification;

  if notification.id is null then
    update public.lead_notifications existing
    set status = 'failed',
        error_message = nullif(left(coalesce(p_error_message, ''), 500), ''),
        failed_at = coalesce(existing.failed_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where existing.tenant_id = p_tenant_id
      and existing.lead_id = p_lead_id
      and existing.agent_id is null
      and existing.purpose = p_purpose
      and existing.status in ('queued', 'failed')
    returning * into notification;
  end if;

  if notification.id is null then
    select * into strict notification
    from public.lead_notifications existing
    where existing.tenant_id = p_tenant_id
      and existing.lead_id = p_lead_id
      and existing.agent_id is null
      and existing.purpose = p_purpose
    limit 1;
  end if;

  return next notification;
end;
$$;

revoke all on function public.create_lead_notification_delivery_v2(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_lead_notification_delivery_v2(uuid, uuid, uuid, text, text)
  to service_role;
revoke all on function public.record_failed_lead_notification_v2(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_failed_lead_notification_v2(uuid, uuid, text, text)
  to service_role;

-- New code uses the versioned create/claim/settle/status functions. Blocking
-- table writes makes post-cutover old invocations fail before starting a new
-- provider attempt instead of silently bypassing lease fencing.
revoke insert, update, delete, truncate, references, trigger
  on public.lead_notifications from service_role;
grant select on public.lead_notifications to service_role;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260710235980')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
