-- Durable support delivery receipts. This migration does not configure or
-- contact an email provider; it only supplies the fenced persistence contract
-- used after an explicitly authorized adapter returns a conclusive receipt.

create table if not exists public.support_delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null unique
    references public.support_notification_outbox(id) on delete restrict,
  ticket_id uuid not null
    references public.support_tickets(id) on delete restrict,
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  user_id uuid not null
    references auth.users(id) on delete restrict,
  adapter text not null
    check (adapter in ('external_webhook', 'mail_sink')),
  delivery_scope text not null
    check (delivery_scope in ('external_operator_notification', 'noncommunication_test')),
  destination_reference text not null,
  provider_receipt_id text not null,
  delivered_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint support_delivery_destination_reference_present
    check (destination_reference ~ '^sha256:[a-f0-9]{64}$'),
  constraint support_delivery_provider_receipt_present
    check (length(trim(provider_receipt_id)) between 1 and 300)
);

create index if not exists support_delivery_receipts_ticket_idx
  on public.support_delivery_receipts(ticket_id, created_at desc);

create index if not exists support_delivery_receipts_user_idx
  on public.support_delivery_receipts(organization_id, user_id, created_at desc);

alter table public.support_delivery_receipts enable row level security;
alter table public.support_delivery_receipts force row level security;
revoke all on public.support_delivery_receipts from public, anon, authenticated;
grant select on public.support_delivery_receipts to service_role;

create or replace function public.get_support_notification_delivery_payload_v1(
  p_outbox_id uuid,
  p_worker_id text
)
returns table (
  outbox_id uuid,
  ticket_id uuid,
  organization_id uuid,
  user_id uuid,
  correlation_id uuid,
  category text,
  subject text,
  message text,
  route_path text,
  reply_email text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'support_delivery_service_role_required';
  end if;

  if p_outbox_id is null or nullif(trim(coalesce(p_worker_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'support_delivery_claim_identity_missing';
  end if;

  return query
  select
    queue.id,
    ticket.id,
    ticket.organization_id,
    ticket.user_id,
    ticket.correlation_id,
    ticket.category,
    ticket.subject,
    ticket.message,
    ticket.route_path,
    lower(nullif(trim(coalesce(identity.email, '')), ''))
  from public.support_notification_outbox queue
  join public.support_tickets ticket on ticket.id = queue.ticket_id
  join auth.users identity on identity.id = ticket.user_id
  where queue.id = p_outbox_id
    and queue.status = 'processing'
    and queue.locked_by = trim(p_worker_id)
    and queue.locked_at >= timezone('utc', now()) - interval '5 minutes';
end;
$$;

revoke all on function public.get_support_notification_delivery_payload_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_support_notification_delivery_payload_v1(uuid, text)
  to service_role;

create or replace function public.settle_support_external_delivery_v1(
  p_outbox_id uuid,
  p_worker_id text,
  p_adapter text,
  p_delivery_scope text,
  p_destination_reference text,
  p_provider_receipt_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  queue public.support_notification_outbox%rowtype;
  ticket public.support_tickets%rowtype;
  receipt public.support_delivery_receipts%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'support_delivery_service_role_required';
  end if;

  if p_adapter not in ('external_webhook', 'mail_sink')
    or p_delivery_scope not in ('external_operator_notification', 'noncommunication_test')
    or p_destination_reference !~ '^sha256:[a-f0-9]{64}$'
    or nullif(trim(coalesce(p_provider_receipt_id, '')), '') is null
    or length(trim(p_provider_receipt_id)) > 300 then
    raise exception using errcode = '22023', message = 'support_delivery_receipt_invalid';
  end if;

  select * into queue
  from public.support_notification_outbox candidate
  where candidate.id = p_outbox_id
    and candidate.status = 'processing'
    and candidate.locked_by = trim(p_worker_id)
    and candidate.locked_at >= timezone('utc', now()) - interval '5 minutes'
  for update;

  if queue.id is null then
    return null;
  end if;

  select * into strict ticket
  from public.support_tickets source
  where source.id = queue.ticket_id;

  insert into public.support_delivery_receipts (
    outbox_id,
    ticket_id,
    organization_id,
    user_id,
    adapter,
    delivery_scope,
    destination_reference,
    provider_receipt_id
  ) values (
    queue.id,
    ticket.id,
    ticket.organization_id,
    ticket.user_id,
    p_adapter,
    p_delivery_scope,
    p_destination_reference,
    trim(p_provider_receipt_id)
  )
  on conflict (outbox_id) do update
  set outbox_id = excluded.outbox_id
  returning * into receipt;

  update public.support_notification_outbox delivered
  set status = 'delivered',
      delivered_at = timezone('utc', now()),
      next_attempt_at = timezone('utc', now()),
      last_error_code = null,
      locked_at = null,
      locked_by = null,
      updated_at = timezone('utc', now())
  where delivered.id = queue.id
    and delivered.status = 'processing'
    and delivered.locked_by = trim(p_worker_id);

  if not found then
    raise exception using errcode = '40001', message = 'support_delivery_completion_fence_lost';
  end if;

  return receipt.id;
end;
$$;

revoke all on function public.settle_support_external_delivery_v1(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_support_external_delivery_v1(uuid, text, text, text, text, text)
  to service_role;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260713010000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
