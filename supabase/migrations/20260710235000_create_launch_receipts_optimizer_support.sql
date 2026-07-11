create unique index if not exists campaign_plans_id_organization_user_unique
  on public.campaign_plans (id, organization_id, user_id);

create table if not exists public.campaign_launch_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid null,
  idempotency_key text not null,
  campaign_name text not null,
  account_name text null,
  launch_mode text not null,
  result_status text not null check (result_status in ('scheduled', 'processing', 'success', 'partial_success', 'failed', 'uncertain', 'operator_action_required')),
  scheduled_for timestamptz null,
  provider_request_id text null,
  provider_receipt_id text null,
  meta_campaign_id text null,
  meta_ad_set_ids jsonb not null default '[]'::jsonb,
  meta_ad_ids jsonb not null default '[]'::jsonb,
  execution_metadata jsonb not null default '{}'::jsonb,
  event_timeline jsonb not null default '[]'::jsonb,
  reconciled_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint campaign_launch_records_idempotency_present check (length(trim(idempotency_key)) > 0),
  constraint campaign_launch_records_campaign_tenant_fk
    foreign key (campaign_id, organization_id, user_id)
    references public.campaign_plans (id, organization_id, user_id)
    on delete restrict,
  constraint campaign_launch_records_idempotency_unique unique (organization_id, idempotency_key)
);

create index if not exists campaign_launch_records_campaign_created_idx
  on public.campaign_launch_records (organization_id, campaign_id, created_at desc);

create index if not exists campaign_launch_records_status_scheduled_idx
  on public.campaign_launch_records (result_status, scheduled_for)
  where result_status in ('scheduled', 'processing', 'uncertain', 'operator_action_required');

create table if not exists public.optimization_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null,
  policy_id text not null,
  policy_digest text not null,
  idempotency_key text not null,
  mode text not null default 'shadow' check (mode = 'shadow'),
  source_status text not null check (source_status in ('confirmed', 'partial', 'stale', 'missing', 'unavailable', 'failed')),
  source_timestamp timestamptz null,
  input_snapshot jsonb not null default '{}'::jsonb,
  authority_checks jsonb not null default '{}'::jsonb,
  proposed_action text not null,
  reasons jsonb not null default '[]'::jsonb,
  before_state jsonb not null default '{}'::jsonb,
  intended_state jsonb not null default '{}'::jsonb,
  simulated_result jsonb not null default '{}'::jsonb,
  live_action_performed boolean not null default false check (live_action_performed = false),
  recovery_status text not null default 'not_required',
  created_at timestamptz not null default timezone('utc', now()),
  constraint optimization_decisions_campaign_tenant_fk
    foreign key (campaign_id, organization_id)
    references public.campaign_plans (id, organization_id)
    on delete cascade,
  constraint optimization_decisions_idempotency_unique unique (organization_id, idempotency_key)
);

create index if not exists optimization_decisions_campaign_created_idx
  on public.optimization_decisions (organization_id, campaign_id, created_at desc);

create or replace function public.prevent_optimization_decision_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Optimization decisions are append-only.';
end;
$$;

drop trigger if exists optimization_decisions_append_only_guard
  on public.optimization_decisions;
create trigger optimization_decisions_append_only_guard
  before update or delete on public.optimization_decisions
  for each row execute function public.prevent_optimization_decision_mutation();

revoke execute on function public.prevent_optimization_decision_mutation()
  from public, anon, authenticated;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  correlation_id uuid not null default gen_random_uuid(),
  category text null,
  subject text not null,
  message text not null,
  route_path text null,
  safe_context jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint support_tickets_category_valid check (category is null or category in ('product_feedback', 'product_blocker')),
  constraint support_tickets_subject_size check (length(trim(subject)) between 1 and 200),
  constraint support_tickets_message_present check (length(trim(message)) > 0),
  constraint support_tickets_message_size check (length(message) <= 10000),
  constraint support_tickets_route_path_safe check (
    route_path is null
    or (
      length(route_path) <= 500
      and route_path like '/%'
      and route_path not like '//%'
      and position('?' in route_path) = 0
      and position('#' in route_path) = 0
    )
  ),
  constraint support_tickets_safe_context_size check (octet_length(safe_context::text) <= 4096),
  constraint support_tickets_request_unique unique (organization_id, user_id, request_id)
);

create table if not exists public.support_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  channel text not null default 'mailbox' check (channel = 'mailbox'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'retrying', 'delivered', 'failed', 'operator_action_required')),
  idempotency_key text not null unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz null,
  locked_by text null,
  last_error_code text null,
  delivered_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.support_operator_inbox (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null unique references public.support_notification_outbox(id) on delete cascade,
  ticket_id uuid not null unique references public.support_tickets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'unread' check (status in ('unread', 'acknowledged', 'resolved')),
  created_at timestamptz not null default timezone('utc', now()),
  acknowledged_at timestamptz null,
  resolved_at timestamptz null
);

alter table public.campaign_launch_records enable row level security;
alter table public.campaign_launch_records force row level security;
alter table public.optimization_decisions enable row level security;
alter table public.optimization_decisions force row level security;
alter table public.support_tickets enable row level security;
alter table public.support_tickets force row level security;
alter table public.support_notification_outbox enable row level security;
alter table public.support_notification_outbox force row level security;
alter table public.support_operator_inbox enable row level security;
alter table public.support_operator_inbox force row level security;

drop policy if exists campaign_launch_records_member_select on public.campaign_launch_records;
create policy campaign_launch_records_member_select
  on public.campaign_launch_records for select to authenticated
  using (private.is_current_user_org_member(organization_id));

drop policy if exists campaign_launch_records_member_insert on public.campaign_launch_records;
drop policy if exists campaign_launch_records_member_update on public.campaign_launch_records;
revoke insert, update, delete, truncate, references, trigger
  on public.campaign_launch_records from anon, authenticated;

create or replace function public.schedule_campaign_launch_intent(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_expected_campaign_owner_id uuid,
  p_campaign_name text,
  p_scheduled_for timestamptz,
  p_time_zone text
)
returns public.campaign_launch_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign public.campaign_plans%rowtype;
  scheduled_launch public.campaign_launch_records%rowtype;
  derived_idempotency_key text;
begin
  if auth.uid() is null
    or not private.is_current_user_org_member(p_organization_id) then
    raise exception 'campaign launch schedule actor is not authorized';
  end if;

  if p_campaign_id is null
    or p_expected_campaign_owner_id is null
    or p_scheduled_for is null
    or p_time_zone is distinct from 'America/New_York'
    or nullif(trim(coalesce(p_campaign_name, '')), '') is null then
    raise exception 'campaign launch schedule is invalid';
  end if;

  if p_scheduled_for < now() - interval '1 minute'
    or p_scheduled_for > now() + interval '26 hours'
    or extract(hour from p_scheduled_for at time zone 'America/New_York') <> 9
    or extract(minute from p_scheduled_for at time zone 'America/New_York') <> 0
    or extract(second from p_scheduled_for at time zone 'America/New_York') <> 0 then
    raise exception 'campaign launch schedule must use a due 9:00 a.m. Eastern window';
  end if;

  select * into campaign
  from public.campaign_plans candidate
  where candidate.id = p_campaign_id
    and candidate.organization_id = p_organization_id
  for update;

  if campaign.id is null or campaign.user_id <> p_expected_campaign_owner_id then
    raise exception 'campaign launch owner is invalid';
  end if;

  select * into scheduled_launch
  from public.campaign_launch_records existing
  where existing.campaign_id = campaign.id
    and existing.organization_id = campaign.organization_id
    and existing.user_id = campaign.user_id
  for update;

  if scheduled_launch.id is not null then
    return scheduled_launch;
  end if;

  derived_idempotency_key := 'campaign_schedule:'
    || p_campaign_id::text
    || ':'
    || extract(epoch from p_scheduled_for)::text;

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
    meta_ad_ids,
    execution_metadata,
    event_timeline
  ) values (
    p_organization_id,
    campaign.user_id,
    campaign.id,
    derived_idempotency_key,
    left(trim(p_campaign_name), 300),
    null,
    'scheduled_provider_paused',
    'scheduled',
    p_scheduled_for,
    null,
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object(
      'timeZone', p_time_zone,
      'launchHourLocal', 9,
      'providerMutationPerformed', false
    ),
    jsonb_build_array(jsonb_build_object(
      'id', 'scheduled:' || extract(epoch from p_scheduled_for)::text,
      'label', 'Launch scheduled',
      'status', 'success',
      'target', left(trim(p_campaign_name), 300),
      'detail', 'The launch intent is scheduled for a validated 9:00 a.m. Eastern window. No provider mutation was performed.',
      'timestamp', timezone('utc', now())
    ))
  )
  on conflict do nothing
  returning * into scheduled_launch;

  if scheduled_launch.id is null then
    select * into strict scheduled_launch
    from public.campaign_launch_records existing
    where existing.campaign_id = campaign.id
      and existing.organization_id = campaign.organization_id
      and existing.user_id = campaign.user_id;
  end if;

  return scheduled_launch;
end;
$$;

revoke execute on function public.schedule_campaign_launch_intent(uuid, uuid, uuid, text, timestamptz, text)
  from public, anon;
grant execute on function public.schedule_campaign_launch_intent(uuid, uuid, uuid, text, timestamptz, text)
  to authenticated;

drop policy if exists optimization_decisions_member_select on public.optimization_decisions;
create policy optimization_decisions_member_select
  on public.optimization_decisions for select to authenticated
  using (private.is_current_user_org_member(organization_id));

drop policy if exists support_tickets_member_access on public.support_tickets;
drop policy if exists support_tickets_member_select on public.support_tickets;
create policy support_tickets_member_select
  on public.support_tickets for select to authenticated
  using (
    user_id = auth.uid()
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists support_tickets_owner_insert on public.support_tickets;
drop policy if exists support_tickets_owner_update on public.support_tickets;

drop policy if exists support_notification_outbox_member_select on public.support_notification_outbox;
create policy support_notification_outbox_member_select
  on public.support_notification_outbox for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets ticket
      where ticket.id = support_notification_outbox.ticket_id
        and ticket.user_id = auth.uid()
        and private.is_current_user_org_member(ticket.organization_id)
    )
  );

drop policy if exists support_notification_outbox_member_insert on public.support_notification_outbox;

revoke all on public.support_operator_inbox from anon, authenticated;

create or replace function public.create_support_ticket_with_outbox(
  p_organization_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_correlation_id uuid,
  p_category text,
  p_subject text,
  p_message text,
  p_route_path text,
  p_safe_context jsonb
)
returns table (
  ticket_id uuid,
  correlation_id uuid,
  outbox_id uuid,
  outbox_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_ticket public.support_tickets%rowtype;
  created_outbox public.support_notification_outbox%rowtype;
begin
  if auth.uid() is null
    or auth.uid() <> p_user_id
    or not private.is_current_user_org_member(p_organization_id) then
    raise exception 'support ticket actor is not authorized';
  end if;

  if p_request_id is null
    or p_correlation_id is null
    or p_subject is null
    or length(trim(p_subject)) = 0
    or length(trim(p_subject)) > 200
    or p_message is null
    or length(trim(p_message)) = 0
    or length(p_message) > 10000
    or (p_category is not null and p_category not in ('product_feedback', 'product_blocker'))
    or (
      p_route_path is not null
      and (
        length(p_route_path) > 500
        or p_route_path not like '/%'
        or p_route_path like '//%'
        or position('?' in p_route_path) > 0
        or position('#' in p_route_path) > 0
      )
    )
    or jsonb_typeof(coalesce(p_safe_context, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_safe_context, '{}'::jsonb)::text) > 4096 then
    raise exception 'support ticket content is incomplete';
  end if;

  insert into public.support_tickets (
    organization_id,
    user_id,
    request_id,
    correlation_id,
    category,
    subject,
    message,
    route_path,
    safe_context,
    status
  ) values (
    p_organization_id,
    p_user_id,
    p_request_id,
    p_correlation_id,
    nullif(trim(coalesce(p_category, '')), ''),
    trim(p_subject),
    trim(p_message),
    nullif(trim(coalesce(p_route_path, '')), ''),
    coalesce(p_safe_context, '{}'::jsonb),
    'open'
  )
  on conflict (organization_id, user_id, request_id)
  do update set request_id = excluded.request_id
  returning * into created_ticket;

  insert into public.support_notification_outbox (
    ticket_id,
    channel,
    status,
    idempotency_key,
    next_attempt_at
  ) values (
    created_ticket.id,
    'mailbox',
    'pending',
    'support_ticket:' || created_ticket.id::text || ':operator_mailbox',
    timezone('utc', now())
  )
  on conflict (idempotency_key)
  do update set idempotency_key = excluded.idempotency_key
  returning * into created_outbox;

  return query
  select created_ticket.id, created_ticket.correlation_id, created_outbox.id, created_outbox.status;
end;
$$;

revoke execute on function public.create_support_ticket_with_outbox(uuid, uuid, uuid, uuid, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.create_support_ticket_with_outbox(uuid, uuid, uuid, uuid, text, text, text, text, jsonb)
  to authenticated, service_role;

create or replace function public.claim_support_notification_outbox(
  p_worker_id text,
  p_limit integer default 25
)
returns setof public.support_notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'p_worker_id is required';
  end if;

  -- Expired work that has already consumed its final permitted attempt is
  -- terminalized in the same transaction as the next claim. This prevents
  -- max-attempt rows from remaining forever in a claim-ineligible state.
  update public.support_notification_outbox queue
  set status = 'operator_action_required',
      next_attempt_at = timezone('utc', now()),
      locked_at = null,
      locked_by = null,
      last_error_code = 'support_outbox_attempts_exhausted',
      updated_at = timezone('utc', now())
  where queue.attempt_count >= queue.max_attempts
    and (
      (
        queue.status in ('pending', 'retrying')
        and queue.next_attempt_at <= timezone('utc', now())
      )
      or (
        queue.status = 'processing'
        and queue.locked_at < timezone('utc', now()) - interval '5 minutes'
      )
    );

  return query
  with due as (
    select queue.id
    from public.support_notification_outbox queue
    where (
        queue.status in ('pending', 'retrying')
        or (
          queue.status = 'processing'
          and queue.locked_at < timezone('utc', now()) - interval '5 minutes'
        )
      )
      and queue.next_attempt_at <= timezone('utc', now())
      and queue.attempt_count < queue.max_attempts
    order by queue.created_at asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  update public.support_notification_outbox queue
  set status = 'processing',
      attempt_count = queue.attempt_count + 1,
      locked_at = timezone('utc', now()),
      locked_by = trim(p_worker_id),
      last_error_code = null,
      updated_at = timezone('utc', now())
  where queue.id in (select due.id from due)
  returning queue.*;
end;
$$;

revoke execute on function public.claim_support_notification_outbox(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_support_notification_outbox(text, integer)
  to service_role;

create or replace function public.deliver_support_notification_to_operator_inbox(
  p_outbox_id uuid,
  p_worker_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  queue public.support_notification_outbox%rowtype;
  ticket public.support_tickets%rowtype;
  receipt public.support_operator_inbox%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role is required to deliver support notifications';
  end if;

  select * into queue
  from public.support_notification_outbox candidate
  where candidate.id = p_outbox_id
    and candidate.status = 'processing'
    and candidate.locked_by = trim(p_worker_id)
  for update;

  if queue.id is null then
    return null;
  end if;

  select * into strict ticket
  from public.support_tickets source
  where source.id = queue.ticket_id;

  insert into public.support_operator_inbox (
    outbox_id,
    ticket_id,
    organization_id,
    status
  ) values (
    queue.id,
    ticket.id,
    ticket.organization_id,
    'unread'
  )
  on conflict (outbox_id)
  do update set outbox_id = excluded.outbox_id
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
    raise exception 'support notification completion fence was lost';
  end if;

  return receipt.id;
end;
$$;

revoke execute on function public.deliver_support_notification_to_operator_inbox(uuid, text)
  from public, anon, authenticated;
grant execute on function public.deliver_support_notification_to_operator_inbox(uuid, text)
  to service_role;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260710235000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
