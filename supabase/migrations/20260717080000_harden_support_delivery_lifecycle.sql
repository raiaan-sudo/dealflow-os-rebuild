-- Provider lifecycle truth for support delivery. Ticket/outbox persistence
-- remains authoritative; callbacks can only add signed delivery evidence and
-- can never erase a ticket.

-- A callback contains only the provider receipt identity, so it must resolve
-- to exactly one durable DealFlow delivery. Refuse an ambiguous legacy shape
-- rather than attaching a provider event to the wrong ticket.
create index support_delivery_receipts_provider_receipt_lookup_idx
  on public.support_delivery_receipts(provider_receipt_id);

create table public.support_delivery_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.support_notification_outbox(id) on delete restrict,
  delivery_receipt_id uuid not null references public.support_delivery_receipts(id) on delete restrict,
  provider_event_id text not null,
  provider_event_type text not null check (provider_event_type in (
    'accepted', 'delivered', 'bounced', 'complained', 'suppressed'
  )),
  provider_receipt_id text not null,
  event_occurred_at timestamptz not null,
  received_at timestamptz not null default timezone('utc', now()),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  request_id text not null check (request_id ~ '^[A-Za-z0-9._:-]{8,200}$'),
  constraint support_delivery_lifecycle_provider_event_unique unique(provider_event_id),
  constraint support_delivery_lifecycle_event_payload_unique unique(provider_event_id, payload_digest),
  constraint support_delivery_lifecycle_provider_receipt_check check (
    length(trim(provider_receipt_id)) between 1 and 300
  )
);

create table public.support_delivery_lifecycle_state (
  outbox_id uuid primary key references public.support_notification_outbox(id) on delete restrict,
  delivery_receipt_id uuid not null unique references public.support_delivery_receipts(id) on delete restrict,
  state text not null check (state in (
    'accepted', 'delivered', 'bounced', 'complained', 'suppressed'
  )),
  latest_provider_event_id text not null,
  latest_event_occurred_at timestamptz not null,
  last_payload_digest text not null check (last_payload_digest ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default timezone('utc', now())
);

create index support_delivery_lifecycle_events_outbox_idx
  on public.support_delivery_lifecycle_events(outbox_id, event_occurred_at, received_at);
create index support_delivery_lifecycle_negative_idx
  on public.support_delivery_lifecycle_state(state, updated_at)
  where state in ('bounced', 'complained', 'suppressed');

alter table public.support_delivery_lifecycle_events enable row level security;
alter table public.support_delivery_lifecycle_events force row level security;
alter table public.support_delivery_lifecycle_state enable row level security;
alter table public.support_delivery_lifecycle_state force row level security;
revoke all on public.support_delivery_lifecycle_events from public, anon, authenticated, service_role;
revoke all on public.support_delivery_lifecycle_state from public, anon, authenticated, service_role;
grant select on public.support_delivery_lifecycle_events to service_role;
grant select on public.support_delivery_lifecycle_state to service_role;

create or replace function private.reject_support_lifecycle_event_mutation_v1()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'support_delivery_lifecycle_events_append_only';
end;
$$;
create trigger support_delivery_lifecycle_events_append_only
before update or delete on public.support_delivery_lifecycle_events
for each row execute function private.reject_support_lifecycle_event_mutation_v1();

create or replace function public.record_support_delivery_callback_v1(
  p_provider_event_id text,
  p_provider_event_type text,
  p_provider_receipt_id text,
  p_event_occurred_at timestamptz,
  p_payload_digest text,
  p_request_id text
)
returns table(outbox_id uuid, lifecycle_state text, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt public.support_delivery_receipts%rowtype;
  existing public.support_delivery_lifecycle_events%rowtype;
  current_state public.support_delivery_lifecycle_state%rowtype;
  receipt_count integer;
  target_rank integer;
  current_rank integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'support_delivery_service_role_required';
  end if;
  if p_provider_event_id !~ '^[A-Za-z0-9._:-]+$'
    or length(trim(p_provider_event_id)) not between 8 and 300
    or p_provider_event_type not in ('accepted', 'delivered', 'bounced', 'complained', 'suppressed')
    or nullif(trim(coalesce(p_provider_receipt_id, '')), '') is null
    or length(trim(p_provider_receipt_id)) > 300
    or p_event_occurred_at is null
    or p_event_occurred_at > timezone('utc', now()) + interval '5 minutes'
    or p_payload_digest !~ '^[a-f0-9]{64}$'
    or p_request_id !~ '^[A-Za-z0-9._:-]{8,200}$' then
    raise exception using errcode = '22023', message = 'support_delivery_callback_invalid';
  end if;

  select count(*) into receipt_count from public.support_delivery_receipts candidate
  where candidate.provider_receipt_id = trim(p_provider_receipt_id);
  if receipt_count = 0 then
    raise exception using errcode = '23503', message = 'support_delivery_callback_receipt_unknown';
  end if;
  if receipt_count <> 1 then
    raise exception using errcode = '21000', message = 'support_delivery_callback_receipt_ambiguous';
  end if;
  select * into strict receipt from public.support_delivery_receipts candidate
  where candidate.provider_receipt_id = trim(p_provider_receipt_id);

  select * into existing from public.support_delivery_lifecycle_events candidate
  where candidate.provider_event_id = trim(p_provider_event_id);
  if existing.id is not null then
    if existing.payload_digest <> p_payload_digest
      or existing.provider_event_type <> p_provider_event_type
      or existing.provider_receipt_id <> trim(p_provider_receipt_id) then
      raise exception using errcode = '23505', message = 'support_delivery_callback_dedupe_collision';
    end if;
    return query select existing.outbox_id,
      coalesce((select state from public.support_delivery_lifecycle_state state_row
        where state_row.outbox_id = existing.outbox_id), existing.provider_event_type), true;
    return;
  end if;

  insert into public.support_delivery_lifecycle_events(
    outbox_id, delivery_receipt_id, provider_event_id, provider_event_type,
    provider_receipt_id, event_occurred_at, payload_digest, request_id
  ) values (
    receipt.outbox_id, receipt.id, trim(p_provider_event_id), p_provider_event_type,
    trim(p_provider_receipt_id), p_event_occurred_at, p_payload_digest, trim(p_request_id)
  );

  select * into current_state from public.support_delivery_lifecycle_state candidate
  where candidate.outbox_id = receipt.outbox_id for update;
  target_rank := case p_provider_event_type
    when 'accepted' then 10 when 'delivered' then 20
    when 'bounced' then 30 when 'complained' then 40 when 'suppressed' then 50 end;
  current_rank := case current_state.state
    when 'accepted' then 10 when 'delivered' then 20
    when 'bounced' then 30 when 'complained' then 40 when 'suppressed' then 50 else 0 end;

  if current_state.outbox_id is null then
    insert into public.support_delivery_lifecycle_state(
      outbox_id, delivery_receipt_id, state, latest_provider_event_id,
      latest_event_occurred_at, last_payload_digest
    ) values (
      receipt.outbox_id, receipt.id, p_provider_event_type, trim(p_provider_event_id),
      p_event_occurred_at, p_payload_digest
    );
  elsif target_rank >= current_rank and p_event_occurred_at >= current_state.latest_event_occurred_at then
    update public.support_delivery_lifecycle_state set
      state = p_provider_event_type,
      latest_provider_event_id = trim(p_provider_event_id),
      latest_event_occurred_at = p_event_occurred_at,
      last_payload_digest = p_payload_digest,
      updated_at = timezone('utc', now())
    where support_delivery_lifecycle_state.outbox_id = receipt.outbox_id;
  end if;

  if p_provider_event_type in ('bounced', 'complained', 'suppressed') then
    update public.support_notification_outbox set
      status = 'operator_action_required',
      last_error_code = 'support_delivery_' || p_provider_event_type,
      updated_at = timezone('utc', now())
    where id = receipt.outbox_id;
  end if;

  return query select receipt.outbox_id,
    (select state from public.support_delivery_lifecycle_state final_state
      where final_state.outbox_id = receipt.outbox_id), false;
end;
$$;

revoke all on function public.record_support_delivery_callback_v1(text,text,text,timestamptz,text,text)
  from public, anon, authenticated;
grant execute on function public.record_support_delivery_callback_v1(text,text,text,timestamptz,text,text)
  to service_role;

do $dealflow_support_lifecycle_postcondition$
begin
  if to_regclass('public.support_delivery_lifecycle_events') is null
    or to_regclass('public.support_delivery_lifecycle_state') is null
    or to_regprocedure('public.record_support_delivery_callback_v1(text,text,text,timestamp with time zone,text,text)') is null then
    raise exception '20260717080000 postcondition failed';
  end if;
end;
$dealflow_support_lifecycle_postcondition$;
