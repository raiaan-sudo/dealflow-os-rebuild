create unique index if not exists campaign_plans_id_organization_unique
  on public.campaign_plans (id, organization_id);

create table if not exists public.onboarding_drafts (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  contract_version integer not null,
  payload jsonb not null,
  current_step text not null,
  furthest_step_index integer not null default 0,
  campaign_id uuid null,
  submission_status text not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, user_id),
  constraint onboarding_drafts_contract_version_positive check (contract_version > 0),
  constraint onboarding_drafts_campaign_tenant_fk
    foreign key (campaign_id, organization_id)
    references public.campaign_plans (id, organization_id)
    on delete restrict,
  constraint onboarding_drafts_furthest_step_index_valid check (furthest_step_index between 0 and 9),
  constraint onboarding_drafts_submission_status_valid check (submission_status in ('draft', 'submitted')),
  constraint onboarding_drafts_current_step_valid check (
    current_step in ('intent', 'market', 'property', 'audience', 'budget', 'setup', 'offer', 'agent', 'plan', 'review')
  )
);

comment on table public.onboarding_drafts is
  'Authenticated, tenant-scoped server truth for the realtor onboarding draft. Browser storage must not contain the PII payload.';

alter table public.onboarding_drafts enable row level security;
alter table public.onboarding_drafts force row level security;

drop policy if exists onboarding_drafts_user_member_select on public.onboarding_drafts;
create policy onboarding_drafts_user_member_select
  on public.onboarding_drafts
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists onboarding_drafts_user_member_insert on public.onboarding_drafts;
create policy onboarding_drafts_user_member_insert
  on public.onboarding_drafts
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and private.is_current_user_org_member(organization_id)
  );

drop policy if exists onboarding_drafts_user_member_update on public.onboarding_drafts;
create policy onboarding_drafts_user_member_update
  on public.onboarding_drafts
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and private.is_current_user_org_member(organization_id)
  )
  with check (
    user_id = auth.uid()
    and private.is_current_user_org_member(organization_id)
  );

revoke all on table public.onboarding_drafts from anon, authenticated;
grant select, insert, update on table public.onboarding_drafts to authenticated;

create table if not exists public.activation_journey_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_name text not null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint activation_journey_events_event_name_valid check (
    event_name in ('onboarding_started', 'onboarding_step_completed')
  ),
  constraint activation_journey_events_idempotency_key_present check (length(trim(idempotency_key)) > 0),
  constraint activation_journey_events_idempotency_unique unique (organization_id, user_id, idempotency_key)
);

comment on table public.activation_journey_events is
  'Product-journey telemetry only. These rows never represent commercial activation, entitlement, or payment truth.';

alter table public.activation_journey_events enable row level security;
alter table public.activation_journey_events force row level security;

drop policy if exists activation_journey_events_user_member_select on public.activation_journey_events;
create policy activation_journey_events_user_member_select
  on public.activation_journey_events
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and private.is_current_user_org_member(organization_id)
  );

revoke all on table public.activation_journey_events from anon, authenticated;
grant select on table public.activation_journey_events to authenticated;

create table if not exists public.commercial_activations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  source_provider text not null default 'stripe',
  source_event_id text not null,
  source_event_type text not null,
  source_event_created bigint not null,
  source_payment_id text null,
  source_subscription_id text null,
  amount_paid_cents integer not null,
  currency text null,
  metadata jsonb not null default '{}'::jsonb,
  activated_at timestamptz not null default timezone('utc', now()),
  constraint commercial_activations_organization_unique unique (organization_id),
  constraint commercial_activations_source_event_unique unique (source_provider, source_event_id),
  constraint commercial_activations_source_provider_stripe check (source_provider = 'stripe'),
  constraint commercial_activations_source_event_type_valid check (
    source_event_type in ('checkout.session.completed', 'invoice.payment_succeeded')
  ),
  constraint commercial_activations_amount_positive check (amount_paid_cents > 0),
  constraint commercial_activations_source_event_present check (length(trim(source_event_id)) > 0)
);

comment on table public.commercial_activations is
  'Immutable first qualifying paid commercial activation. This historical fact is separate from current subscription entitlement and setup readiness.';

create index if not exists commercial_activations_user_created_idx
  on public.commercial_activations (user_id, activated_at desc);

alter table public.commercial_activations enable row level security;
alter table public.commercial_activations force row level security;

drop policy if exists commercial_activations_member_select on public.commercial_activations;
create policy commercial_activations_member_select
  on public.commercial_activations
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or private.is_current_user_org_member(organization_id)
  );

revoke all on table public.commercial_activations from anon, authenticated;
grant select on table public.commercial_activations to authenticated;

create or replace function public.prevent_commercial_activation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Commercial activation facts are append-only.';
end;
$$;

drop trigger if exists commercial_activations_append_only_guard
  on public.commercial_activations;
create trigger commercial_activations_append_only_guard
  before update or delete on public.commercial_activations
  for each row execute function public.prevent_commercial_activation_mutation();

revoke execute on function public.prevent_commercial_activation_mutation()
  from public, anon, authenticated;

create or replace function public.record_commercial_activation_with_initial_credit(
  p_organization_id uuid,
  p_user_id uuid,
  p_source_event_id text,
  p_source_event_type text,
  p_source_event_created bigint,
  p_source_payment_id text,
  p_source_subscription_id text,
  p_amount_paid_cents integer,
  p_currency text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  activation_id uuid,
  activation_created boolean,
  initial_credit_granted boolean,
  balance integer,
  ledger_id uuid,
  reused_existing boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  activation_row public.commercial_activations%rowtype;
  credit_balance integer;
  credit_ledger_id uuid;
  credit_reused boolean;
begin
  if p_organization_id is null or p_user_id is null then
    raise exception 'organization_id and user_id are required';
  end if;

  if not exists (
    select 1
      from public.organizations organization_record
     where organization_record.id = p_organization_id
       and organization_record.owner_user_id = p_user_id
  ) and not exists (
    select 1
      from public.organization_memberships membership_record
     where membership_record.organization_id = p_organization_id
       and membership_record.user_id = p_user_id
  ) then
    raise exception 'commercial activation user is not a member of the organization';
  end if;

  if p_source_event_id is null or length(trim(p_source_event_id)) = 0 then
    raise exception 'source_event_id is required';
  end if;

  if p_source_event_type not in ('checkout.session.completed', 'invoice.payment_succeeded') then
    raise exception 'source_event_type is not a qualifying payment event';
  end if;

  if p_amount_paid_cents is null or p_amount_paid_cents <= 0 then
    raise exception 'amount_paid_cents must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select *
    into activation_row
    from public.commercial_activations
   where organization_id = p_organization_id
   limit 1;

  if found then
    select ledger.balance_after, ledger.id
      into credit_balance, credit_ledger_id
      from public.user_credit_ledger ledger
     where ledger.reference_type = 'commercial_activation'
       and ledger.reference_id = activation_row.id::text
       and ledger.idempotency_key = 'commercial_activation_initial_credit:' || p_organization_id::text
     limit 1;

    if credit_ledger_id is null then
      raise exception 'commercial activation exists without its initial credit ledger entry';
    end if;

    return query
      select activation_row.id, false, false, credit_balance, credit_ledger_id, true;
    return;
  end if;

  insert into public.commercial_activations (
    organization_id,
    user_id,
    source_event_id,
    source_event_type,
    source_event_created,
    source_payment_id,
    source_subscription_id,
    amount_paid_cents,
    currency,
    metadata
  )
  values (
    p_organization_id,
    p_user_id,
    trim(p_source_event_id),
    p_source_event_type,
    greatest(coalesce(p_source_event_created, 0), 0),
    nullif(trim(coalesce(p_source_payment_id, '')), ''),
    nullif(trim(coalesce(p_source_subscription_id, '')), ''),
    p_amount_paid_cents,
    nullif(lower(trim(coalesce(p_currency, ''))), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into activation_row;

  select grant_result.balance, grant_result.ledger_id, grant_result.reused_existing
    into credit_balance, credit_ledger_id, credit_reused
    from public.grant_user_credits(
      p_user_id,
      p_organization_id,
      1000,
      'commercial_activation_initial_credit',
      'commercial_activation',
      activation_row.id::text,
      'commercial_activation_initial_credit:' || p_organization_id::text,
      jsonb_build_object(
        'activationId', activation_row.id,
        'sourceEventId', activation_row.source_event_id,
        'sourceEventType', activation_row.source_event_type
      )
    ) grant_result;

  if credit_ledger_id is null or credit_reused then
    raise exception 'initial commercial activation credit was not created atomically';
  end if;

  return query
    select activation_row.id, true, true, credit_balance, credit_ledger_id, false;
end;
$$;

revoke all on function public.record_commercial_activation_with_initial_credit(
  uuid,
  uuid,
  text,
  text,
  bigint,
  text,
  text,
  integer,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.record_commercial_activation_with_initial_credit(
  uuid,
  uuid,
  text,
  text,
  bigint,
  text,
  text,
  integer,
  text,
  jsonb
) to service_role;

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260710180000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
