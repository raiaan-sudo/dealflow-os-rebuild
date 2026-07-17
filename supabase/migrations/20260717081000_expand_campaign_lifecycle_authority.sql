-- Canonical campaign approval and lifecycle authority. Existing campaign plan
-- documents remain the build artifact; this ledger is the durable state and
-- provider-readback truth used for launch, pause, resume, and archival.

create table public.campaign_approval_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  campaign_id uuid not null references public.campaign_plans(id) on delete restrict,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approval_generation bigint not null check (approval_generation > 0),
  plan_digest text not null check (plan_digest ~ '^[a-f0-9]{64}$'),
  material_input_digest text not null check (material_input_digest ~ '^[a-f0-9]{64}$'),
  approval_digest text not null check (approval_digest ~ '^[a-f0-9]{64}$'),
  approved_snapshot jsonb not null check (
    jsonb_typeof(approved_snapshot) = 'object'
    and approved_snapshot ->> 'schemaVersion' = '1'
    and octet_length(approved_snapshot::text) between 100 and 65536
  ),
  approved_daily_budget_minor bigint not null check (approved_daily_budget_minor between 100 and 100000000),
  currency text not null check (currency in ('USD', 'CAD')),
  schedule_timezone text not null default 'America/New_York' check (schedule_timezone = 'America/New_York'),
  scheduled_for timestamptz not null,
  superseded_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint campaign_approval_snapshot_campaign_tenant_fk
    foreign key(campaign_id, organization_id)
    references public.campaign_plans(id, organization_id) on delete restrict,
  constraint campaign_approval_snapshot_generation_unique unique(campaign_id, approval_generation),
  constraint campaign_approval_snapshot_digest_unique unique(campaign_id, approval_digest),
  constraint campaign_approval_nine_am_eastern check (
    (scheduled_for at time zone 'America/New_York')::time = time '09:00:00'
  )
);

create index campaign_approval_campaign_created_idx
  on public.campaign_approval_snapshots(campaign_id, approval_generation desc, created_at desc);

create table public.campaign_lifecycle_authority (
  campaign_id uuid primary key references public.campaign_plans(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  state text not null check (state in (
    'draft', 'generated', 'review_required', 'approved', 'scheduled',
    'publishing', 'provider_paused', 'active', 'paused', 'completed',
    'archived', 'failed', 'canceled', 'ambiguous', 'operator_required'
  )),
  state_version bigint not null default 1 check (state_version > 0),
  active_approval_snapshot_id uuid null references public.campaign_approval_snapshots(id) on delete restrict,
  material_plan_digest text not null check (material_plan_digest ~ '^[a-f0-9]{64}$'),
  provider_effective_status text null,
  provider_readback_digest text null check (
    provider_readback_digest is null or provider_readback_digest ~ '^[a-f0-9]{64}$'
  ),
  last_transition_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint campaign_lifecycle_authority_tenant_fk
    foreign key(campaign_id, organization_id)
    references public.campaign_plans(id, organization_id) on delete restrict,
  check (
    (state in ('approved','scheduled','publishing','provider_paused','active','paused','completed','archived')
      and active_approval_snapshot_id is not null)
    or state not in ('approved','scheduled','publishing','provider_paused','active','paused','completed','archived')
  )
);

create table public.campaign_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign_plans(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_idempotency_key text not null,
  from_state text null,
  to_state text not null,
  state_version bigint not null check (state_version > 0),
  actor_kind text not null check (actor_kind in ('customer','system_worker','provider_reconciliation','operator')),
  actor_user_id uuid null references auth.users(id) on delete restrict,
  approval_snapshot_id uuid null references public.campaign_approval_snapshots(id) on delete restrict,
  reason_code text not null check (reason_code ~ '^[a-z0-9][a-z0-9_:-]{2,127}$'),
  evidence_digest text not null check (evidence_digest ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null default timezone('utc', now()),
  constraint campaign_lifecycle_event_unique unique(campaign_id, event_idempotency_key),
  constraint campaign_lifecycle_event_version_unique unique(campaign_id, state_version)
);

create table public.campaign_provider_action_intents (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign_plans(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  approval_snapshot_id uuid not null references public.campaign_approval_snapshots(id) on delete restrict,
  action text not null check (action in ('publish','pause','resume','complete','archive','cancel')),
  idempotency_key text not null,
  status text not null default 'pending' check (status in (
    'pending','processing','succeeded','failed','ambiguous','operator_required'
  )),
  expected_provider_status text not null,
  provider_request_id text null,
  provider_receipt_digest text null check (
    provider_receipt_digest is null or provider_receipt_digest ~ '^sha256:[a-f0-9]{64}$'
  ),
  provider_readback_digest text null check (
    provider_readback_digest is null or provider_readback_digest ~ '^[a-f0-9]{64}$'
  ),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  settled_at timestamptz null,
  constraint campaign_provider_action_unique unique(campaign_id, idempotency_key),
  constraint campaign_provider_action_tenant_fk
    foreign key(campaign_id, organization_id)
    references public.campaign_plans(id, organization_id) on delete restrict
);

alter table public.campaign_approval_snapshots enable row level security;
alter table public.campaign_approval_snapshots force row level security;
alter table public.campaign_lifecycle_authority enable row level security;
alter table public.campaign_lifecycle_authority force row level security;
alter table public.campaign_lifecycle_events enable row level security;
alter table public.campaign_lifecycle_events force row level security;
alter table public.campaign_provider_action_intents enable row level security;
alter table public.campaign_provider_action_intents force row level security;
revoke all on public.campaign_approval_snapshots from public, anon, authenticated, service_role;
revoke all on public.campaign_lifecycle_authority from public, anon, authenticated, service_role;
revoke all on public.campaign_lifecycle_events from public, anon, authenticated, service_role;
revoke all on public.campaign_provider_action_intents from public, anon, authenticated, service_role;
grant select on public.campaign_approval_snapshots, public.campaign_lifecycle_authority,
  public.campaign_lifecycle_events, public.campaign_provider_action_intents to service_role;

create policy campaign_approval_member_select on public.campaign_approval_snapshots
  for select to authenticated using (private.is_current_user_org_member(organization_id));
create policy campaign_lifecycle_member_select on public.campaign_lifecycle_authority
  for select to authenticated using (private.is_current_user_org_member(organization_id));
create policy campaign_lifecycle_events_member_select on public.campaign_lifecycle_events
  for select to authenticated using (private.is_current_user_org_member(organization_id));
create policy campaign_provider_actions_member_select on public.campaign_provider_action_intents
  for select to authenticated using (private.is_current_user_org_member(organization_id));

create or replace function private.reject_campaign_immutable_record_mutation_v1()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'campaign_lifecycle_record_append_only';
end;
$$;
create trigger campaign_approval_snapshots_append_only
before update or delete on public.campaign_approval_snapshots
for each row execute function private.reject_campaign_immutable_record_mutation_v1();
create trigger campaign_lifecycle_events_append_only
before update or delete on public.campaign_lifecycle_events
for each row execute function private.reject_campaign_immutable_record_mutation_v1();

create or replace function private.campaign_current_plan_digest_v1(p_campaign_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.digest(convert_to(coalesce(plan::text, '{}'), 'UTF8'), 'sha256'), 'hex')
  from public.campaign_plans where id = p_campaign_id
$$;
revoke all on function private.campaign_current_plan_digest_v1(uuid)
  from public, anon, authenticated, service_role;

-- Preserve every pre-existing campaign without fabricating a historical
-- customer approval. Untouched drafts remain drafts; anything with launch
-- evidence is imported as explicit operator-required truth until its legacy
-- receipts are reconciled under an owner-approved procedure.
insert into public.campaign_lifecycle_authority(
  campaign_id, organization_id, state, state_version, material_plan_digest
)
select campaign.id, campaign.organization_id,
  case when campaign.launch_status is not null
    or nullif(campaign.plan -> 'runtime' ->> 'campaignId', '') is not null
    or nullif(campaign.plan -> 'runtime' ->> 'adSetId', '') is not null
    or nullif(campaign.plan -> 'runtime' ->> 'adId', '') is not null
    or exists (
    select 1 from public.campaign_launch_records launch
    where launch.campaign_id = campaign.id
  ) then 'operator_required' else 'draft' end,
  1,
  private.campaign_current_plan_digest_v1(campaign.id)
from public.campaign_plans campaign;

insert into public.campaign_lifecycle_events(
  campaign_id, organization_id, event_idempotency_key, from_state, to_state,
  state_version, actor_kind, reason_code, evidence_digest
)
select authority.campaign_id, authority.organization_id,
  'migration-import:20260717081000', null, authority.state, 1,
  'system_worker',
  case when authority.state = 'operator_required'
    then 'legacy_launch_requires_reconciliation'
    else 'legacy_unlaunched_campaign_imported' end,
  encode(extensions.digest(convert_to(
    authority.campaign_id::text || ':' || authority.state || ':20260717081000',
    'UTF8'
  ), 'sha256'), 'hex')
from public.campaign_lifecycle_authority authority;

create or replace function public.approve_campaign_snapshot_v1(
  p_campaign_id uuid,
  p_material_input_digest text,
  p_approved_snapshot jsonb,
  p_approved_daily_budget_minor bigint,
  p_currency text,
  p_scheduled_for timestamptz,
  p_idempotency_key text
)
returns public.campaign_approval_snapshots
language plpgsql security definer set search_path = '' as $$
declare
  campaign public.campaign_plans%rowtype;
  prior public.campaign_approval_snapshots%rowtype;
  created public.campaign_approval_snapshots%rowtype;
  generation bigint;
  plan_digest text;
  approval_digest text;
begin
  if auth.uid() is null then raise exception using errcode='42501', message='campaign_approval_auth_required'; end if;
  select * into strict campaign from public.campaign_plans where id=p_campaign_id for update;
  if not private.is_current_user_org_member(campaign.organization_id) then
    raise exception using errcode='42501', message='campaign_approval_member_required';
  end if;
  if p_material_input_digest !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(coalesce(p_approved_snapshot,'null'::jsonb)) <> 'object'
    or p_approved_snapshot->>'schemaVersion' <> '1'
    or p_currency not in ('USD','CAD')
    or p_approved_daily_budget_minor not between 100 and 100000000
    or p_scheduled_for < timezone('utc',now())
    or (p_scheduled_for at time zone 'America/New_York')::time <> time '09:00:00'
    or length(trim(coalesce(p_idempotency_key,''))) not between 8 and 200 then
    raise exception using errcode='22023', message='campaign_approval_snapshot_invalid';
  end if;
  plan_digest := private.campaign_current_plan_digest_v1(p_campaign_id);
  approval_digest := encode(extensions.digest(convert_to(jsonb_build_object(
    'campaignId',p_campaign_id,'planDigest',plan_digest,'materialInputDigest',p_material_input_digest,
    'snapshot',p_approved_snapshot,'dailyBudgetMinor',p_approved_daily_budget_minor,
    'currency',p_currency,'scheduledFor',p_scheduled_for,'idempotencyKey',trim(p_idempotency_key)
  )::text,'UTF8'),'sha256'),'hex');
  select * into prior from public.campaign_approval_snapshots
    where campaign_id=p_campaign_id and approval_digest=approval_digest;
  if prior.id is not null then return prior; end if;
  select coalesce(max(approval_generation),0)+1 into generation
    from public.campaign_approval_snapshots where campaign_id=p_campaign_id;
  insert into public.campaign_approval_snapshots(
    organization_id,campaign_id,approved_by,approval_generation,plan_digest,
    material_input_digest,approval_digest,approved_snapshot,approved_daily_budget_minor,
    currency,scheduled_for
  ) values (
    campaign.organization_id,p_campaign_id,auth.uid(),generation,plan_digest,
    p_material_input_digest,approval_digest,p_approved_snapshot,p_approved_daily_budget_minor,
    p_currency,p_scheduled_for
  ) returning * into created;
  return created;
end;
$$;

create or replace function private.campaign_transition_allowed_v1(p_from text,p_to text)
returns boolean language sql immutable set search_path='' as $$
  select case
    when p_from=p_to then true
    when p_from='draft' and p_to in ('generated','canceled') then true
    when p_from='generated' and p_to in ('review_required','draft','canceled') then true
    when p_from='review_required' and p_to in ('approved','generated','canceled') then true
    when p_from='approved' and p_to in ('scheduled','review_required','canceled') then true
    when p_from='scheduled' and p_to in ('publishing','approved','canceled') then true
    when p_from='publishing' and p_to in ('provider_paused','failed','ambiguous','operator_required') then true
    when p_from='provider_paused' and p_to in ('active','paused','canceled','operator_required') then true
    when p_from='active' and p_to in ('paused','completed','archived','ambiguous','operator_required') then true
    when p_from='paused' and p_to in ('active','completed','archived','canceled','operator_required') then true
    when p_from='completed' and p_to='archived' then true
    when p_from in ('failed','ambiguous','operator_required') and p_to in ('review_required','paused','canceled') then true
    else false end
$$;

create or replace function public.transition_campaign_lifecycle_v1(
  p_campaign_id uuid,
  p_expected_version bigint,
  p_to_state text,
  p_reason_code text,
  p_evidence_digest text,
  p_idempotency_key text,
  p_approval_snapshot_id uuid default null,
  p_actor_kind text default 'customer'
)
returns public.campaign_lifecycle_authority
language plpgsql security definer set search_path='' as $$
declare
  campaign public.campaign_plans%rowtype;
  current public.campaign_lifecycle_authority%rowtype;
  approval public.campaign_approval_snapshots%rowtype;
  prior_event public.campaign_lifecycle_events%rowtype;
  next_version bigint;
  actor uuid := auth.uid();
  plan_digest text;
begin
  select * into strict campaign from public.campaign_plans where id=p_campaign_id;
  if auth.role() is distinct from 'service_role'
    and (actor is null or not private.is_current_user_org_member(campaign.organization_id)) then
    raise exception using errcode='42501', message='campaign_lifecycle_actor_required';
  end if;
  if p_to_state not in ('draft','generated','review_required','approved','scheduled','publishing','provider_paused','active','paused','completed','archived','failed','canceled','ambiguous','operator_required')
    or p_reason_code !~ '^[a-z0-9][a-z0-9_:-]{2,127}$'
    or p_evidence_digest !~ '^[a-f0-9]{64}$'
    or length(trim(coalesce(p_idempotency_key,''))) not between 8 and 200
    or p_actor_kind not in ('customer','system_worker','provider_reconciliation','operator') then
    raise exception using errcode='22023', message='campaign_lifecycle_transition_invalid';
  end if;
  if auth.role() is distinct from 'service_role' and p_actor_kind <> 'customer' then
    raise exception using errcode='42501', message='campaign_lifecycle_actor_kind_forbidden';
  end if;
  if auth.role() is distinct from 'service_role'
    and p_to_state not in ('draft','generated','review_required','approved','scheduled','canceled') then
    raise exception using errcode='42501', message='campaign_lifecycle_provider_state_forbidden';
  end if;
  plan_digest := private.campaign_current_plan_digest_v1(p_campaign_id);
  insert into public.campaign_lifecycle_authority(campaign_id,organization_id,state,state_version,material_plan_digest)
    values(p_campaign_id,campaign.organization_id,'draft',1,plan_digest)
    on conflict(campaign_id) do nothing;
  select * into strict current from public.campaign_lifecycle_authority where campaign_id=p_campaign_id for update;
  select * into prior_event from public.campaign_lifecycle_events
    where campaign_id=p_campaign_id and event_idempotency_key=trim(p_idempotency_key);
  if prior_event.id is not null then
    if prior_event.to_state <> p_to_state or prior_event.reason_code <> p_reason_code then
      raise exception using errcode='22023', message='campaign_lifecycle_idempotency_conflict';
    end if;
    return current;
  end if;
  if current.state_version <> p_expected_version then
    raise exception using errcode='40001', message='campaign_lifecycle_version_conflict';
  end if;
  if not private.campaign_transition_allowed_v1(current.state,p_to_state) then
    raise exception using errcode='22023', message='campaign_lifecycle_transition_forbidden';
  end if;
  if current.material_plan_digest <> plan_digest and p_to_state not in ('draft','generated','review_required','canceled') then
    raise exception using errcode='55000', message='campaign_material_change_requires_reapproval';
  end if;
  if p_to_state in ('approved','scheduled','publishing','provider_paused','active','paused','completed','archived') then
    select * into approval from public.campaign_approval_snapshots candidate
      where candidate.id=coalesce(p_approval_snapshot_id,current.active_approval_snapshot_id)
        and candidate.campaign_id=p_campaign_id;
    if approval.id is null or approval.plan_digest<>plan_digest then
      raise exception using errcode='55000', message='campaign_active_approval_required';
    end if;
  end if;
  next_version := current.state_version + 1;
  insert into public.campaign_lifecycle_events(
    campaign_id,organization_id,event_idempotency_key,from_state,to_state,state_version,
    actor_kind,actor_user_id,approval_snapshot_id,reason_code,evidence_digest
  ) values(
    p_campaign_id,campaign.organization_id,trim(p_idempotency_key),current.state,p_to_state,next_version,
    p_actor_kind,actor,coalesce(approval.id,current.active_approval_snapshot_id),p_reason_code,p_evidence_digest
  ) on conflict(campaign_id,event_idempotency_key) do nothing;
  if not found then return current; end if;
  update public.campaign_lifecycle_authority set
    state=p_to_state,state_version=next_version,
    active_approval_snapshot_id=case when approval.id is not null then approval.id else current.active_approval_snapshot_id end,
    material_plan_digest=plan_digest,last_transition_at=timezone('utc',now()),updated_at=timezone('utc',now())
  where campaign_id=p_campaign_id returning * into current;
  return current;
end;
$$;

revoke all on function public.approve_campaign_snapshot_v1(uuid,text,jsonb,bigint,text,timestamptz,text)
  from public, anon, service_role;
grant execute on function public.approve_campaign_snapshot_v1(uuid,text,jsonb,bigint,text,timestamptz,text)
  to authenticated;
revoke all on function public.transition_campaign_lifecycle_v1(uuid,bigint,text,text,text,text,uuid,text)
  from public, anon;
grant execute on function public.transition_campaign_lifecycle_v1(uuid,bigint,text,text,text,text,uuid,text)
  to authenticated, service_role;

do $dealflow_campaign_lifecycle_postcondition$
begin
  if to_regclass('public.campaign_approval_snapshots') is null
    or to_regclass('public.campaign_lifecycle_authority') is null
    or to_regclass('public.campaign_lifecycle_events') is null
    or to_regclass('public.campaign_provider_action_intents') is null
    or to_regprocedure('public.transition_campaign_lifecycle_v1(uuid,bigint,text,text,text,text,uuid,text)') is null then
    raise exception '20260717081000 postcondition failed';
  end if;
end;
$dealflow_campaign_lifecycle_postcondition$;
