-- Canonical lead outcome lineage. A contact entering GHL is not a conversion;
-- only explicit, definition-bound lifecycle evidence becomes an outcome.

create table public.lead_outcome_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete restrict,
  outcome_type text not null check (outcome_type in (
    'replied','conversation_started','appointment_booked','appointment_attended',
    'opportunity_created','qualified','disqualified','closed_won','closed_lost'
  )),
  definition_version integer not null check (definition_version > 0),
  definition_text text not null check (length(trim(definition_text)) between 10 and 1000),
  qualification_rules jsonb not null check (jsonb_typeof(qualification_rules)='object'),
  authority_grant_id uuid not null references public.owner_decision_authority_grants(id) on delete restrict,
  definition_digest text not null check (definition_digest ~ '^[a-f0-9]{64}$'),
  effective_at timestamptz not null,
  expires_at timestamptz null,
  created_at timestamptz not null default timezone('utc',now()),
  constraint lead_outcome_definition_scope_unique unique(organization_id,outcome_type,definition_version),
  check (expires_at is null or expires_at > effective_at)
);

create unique index lead_outcome_definition_global_unique
  on public.lead_outcome_definitions(outcome_type,definition_version)
  where organization_id is null;

create table public.lead_outcome_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  lead_id uuid not null,
  campaign_id uuid not null,
  definition_id uuid not null references public.lead_outcome_definitions(id) on delete restrict,
  outcome_type text not null,
  source_system text not null check (source_system in ('ghl','dealflow','synthetic_staging')),
  source_event_id text not null,
  idempotency_key text not null,
  ghl_location_mapping_id uuid null references public.ghl_location_mappings(id) on delete restrict,
  ghl_contact_id text null,
  ghl_opportunity_id text null,
  meta_ad_account_id text null,
  meta_campaign_id text null,
  meta_ad_id text null,
  meta_form_id text null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default timezone('utc',now()),
  correction_of_event_id uuid null references public.lead_outcome_events(id) on delete restrict,
  correction_reason_code text null,
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  lineage_digest text not null check (lineage_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default timezone('utc',now()),
  constraint lead_outcome_event_lead_scope_fk foreign key(lead_id,organization_id)
    references public.leads(id,organization_id) on delete restrict,
  constraint lead_outcome_event_campaign_scope_fk foreign key(campaign_id,organization_id)
    references public.campaign_plans(id,organization_id) on delete restrict,
  constraint lead_outcome_event_idempotency_unique unique(organization_id,idempotency_key),
  constraint lead_outcome_event_source_unique unique(source_system,source_event_id),
  constraint lead_outcome_event_correction_shape check (
    (correction_of_event_id is null and correction_reason_code is null)
    or (correction_of_event_id is not null and correction_reason_code ~ '^[a-z0-9][a-z0-9_:-]{2,127}$')
  ),
  constraint lead_outcome_event_ghl_lineage check (
    source_system <> 'ghl'
    or (ghl_location_mapping_id is not null and nullif(trim(ghl_contact_id),'') is not null)
  ),
  constraint lead_outcome_event_opportunity_lineage check (
    outcome_type not in ('opportunity_created','qualified','disqualified','closed_won','closed_lost')
    or nullif(trim(ghl_opportunity_id),'') is not null
  )
);

create table public.lead_outcome_current (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  lead_id uuid primary key,
  campaign_id uuid not null,
  latest_event_id uuid not null unique references public.lead_outcome_events(id) on delete restrict,
  outcome_type text not null,
  occurred_at timestamptz not null,
  definition_id uuid not null references public.lead_outcome_definitions(id) on delete restrict,
  lineage_digest text not null check (lineage_digest ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default timezone('utc',now()),
  constraint lead_outcome_current_lead_scope_fk foreign key(lead_id,organization_id)
    references public.leads(id,organization_id) on delete restrict,
  constraint lead_outcome_current_campaign_scope_fk foreign key(campaign_id,organization_id)
    references public.campaign_plans(id,organization_id) on delete restrict
);

create index lead_outcome_events_campaign_time_idx
  on public.lead_outcome_events(organization_id,campaign_id,occurred_at,received_at);
create index lead_outcome_events_quality_idx
  on public.lead_outcome_events(organization_id,campaign_id,outcome_type,occurred_at)
  where correction_of_event_id is null;

alter table public.lead_outcome_definitions enable row level security;
alter table public.lead_outcome_definitions force row level security;
alter table public.lead_outcome_events enable row level security;
alter table public.lead_outcome_events force row level security;
alter table public.lead_outcome_current enable row level security;
alter table public.lead_outcome_current force row level security;
revoke all on public.lead_outcome_definitions from public,anon,authenticated,service_role;
revoke all on public.lead_outcome_events from public,anon,authenticated,service_role;
revoke all on public.lead_outcome_current from public,anon,authenticated,service_role;
grant select on public.lead_outcome_definitions,public.lead_outcome_events,public.lead_outcome_current to service_role;
create policy lead_outcome_events_member_select on public.lead_outcome_events
  for select to authenticated using(private.is_current_user_org_member(organization_id));
create policy lead_outcome_current_member_select on public.lead_outcome_current
  for select to authenticated using(private.is_current_user_org_member(organization_id));
create policy lead_outcome_definitions_member_select on public.lead_outcome_definitions
  for select to authenticated using(organization_id is null or private.is_current_user_org_member(organization_id));

create or replace function private.reject_lead_outcome_immutable_mutation_v1()
returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='23514',message='lead_outcome_history_append_only'; end;
$$;
create trigger lead_outcome_definitions_append_only before update or delete on public.lead_outcome_definitions
for each row execute function private.reject_lead_outcome_immutable_mutation_v1();
create trigger lead_outcome_events_append_only before update or delete on public.lead_outcome_events
for each row execute function private.reject_lead_outcome_immutable_mutation_v1();

create or replace function public.record_lead_outcome_event_v1(
  p_organization_id uuid,
  p_lead_id uuid,
  p_campaign_id uuid,
  p_definition_id uuid,
  p_outcome_type text,
  p_source_system text,
  p_source_event_id text,
  p_idempotency_key text,
  p_ghl_location_mapping_id uuid,
  p_ghl_contact_id text,
  p_ghl_opportunity_id text,
  p_meta_ad_account_id text,
  p_meta_campaign_id text,
  p_meta_ad_id text,
  p_meta_form_id text,
  p_occurred_at timestamptz,
  p_correction_of_event_id uuid,
  p_correction_reason_code text,
  p_payload_digest text
)
returns table(event_id uuid,replayed boolean,current_projection_updated boolean)
language plpgsql security definer set search_path='' as $$
declare
  definition public.lead_outcome_definitions%rowtype;
  existing public.lead_outcome_events%rowtype;
  correction public.lead_outcome_events%rowtype;
  created public.lead_outcome_events%rowtype;
  current_row public.lead_outcome_current%rowtype;
  lineage_digest text;
  projection_updated boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='42501',message='lead_outcome_service_role_required';
  end if;
  if p_outcome_type not in ('replied','conversation_started','appointment_booked','appointment_attended','opportunity_created','qualified','disqualified','closed_won','closed_lost')
    or p_source_system not in ('ghl','dealflow','synthetic_staging')
    or length(trim(coalesce(p_source_event_id,''))) not between 8 and 300
    or length(trim(coalesce(p_idempotency_key,''))) not between 8 and 300
    or p_occurred_at is null or p_occurred_at > timezone('utc',now())+interval '5 minutes'
    or p_payload_digest !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='lead_outcome_event_invalid';
  end if;
  if not exists(select 1 from public.leads lead where lead.id=p_lead_id and lead.organization_id=p_organization_id and lead.campaign_id=p_campaign_id)
    or not exists(select 1 from public.campaign_plans campaign where campaign.id=p_campaign_id and campaign.organization_id=p_organization_id) then
    raise exception using errcode='42501',message='lead_outcome_tenant_lineage_invalid';
  end if;
  select * into definition from public.lead_outcome_definitions candidate
    where candidate.id=p_definition_id and candidate.outcome_type=p_outcome_type
      and (candidate.organization_id is null or candidate.organization_id=p_organization_id)
      and candidate.effective_at<=p_occurred_at
      and (candidate.expires_at is null or candidate.expires_at>p_occurred_at);
  if definition.id is null then
    raise exception using errcode='55000',message='lead_outcome_definition_unavailable';
  end if;
  if p_source_system='ghl' and (
    p_ghl_location_mapping_id is null or nullif(trim(coalesce(p_ghl_contact_id,'')),'') is null
    or not exists(select 1 from public.ghl_location_mappings mapping
      where mapping.id=p_ghl_location_mapping_id and mapping.organization_id=p_organization_id)
  ) then raise exception using errcode='42501',message='lead_outcome_ghl_lineage_invalid'; end if;
  if p_outcome_type in ('opportunity_created','qualified','disqualified','closed_won','closed_lost')
    and nullif(trim(coalesce(p_ghl_opportunity_id,'')),'') is null then
    raise exception using errcode='22023',message='lead_outcome_opportunity_lineage_required';
  end if;
  if p_correction_of_event_id is not null then
    select * into correction from public.lead_outcome_events candidate
      where candidate.id=p_correction_of_event_id and candidate.organization_id=p_organization_id
        and candidate.lead_id=p_lead_id and candidate.campaign_id=p_campaign_id;
    if correction.id is null or p_correction_reason_code !~ '^[a-z0-9][a-z0-9_:-]{2,127}$' then
      raise exception using errcode='22023',message='lead_outcome_correction_invalid';
    end if;
  elsif p_correction_reason_code is not null then
    raise exception using errcode='22023',message='lead_outcome_correction_invalid';
  end if;
  lineage_digest := encode(extensions.digest(convert_to(concat_ws('|',
    p_organization_id::text,p_lead_id::text,p_campaign_id::text,p_definition_id::text,p_outcome_type,
    p_source_system,trim(p_source_event_id),coalesce(p_ghl_location_mapping_id::text,''),
    coalesce(trim(p_ghl_contact_id),''),coalesce(trim(p_ghl_opportunity_id),''),
    coalesce(trim(p_meta_ad_account_id),''),coalesce(trim(p_meta_campaign_id),''),
    coalesce(trim(p_meta_ad_id),''),coalesce(trim(p_meta_form_id),''),p_occurred_at::text,
    coalesce(p_correction_of_event_id::text,''),coalesce(p_correction_reason_code,''),p_payload_digest
  ),'UTF8'),'sha256'),'hex');
  select * into existing from public.lead_outcome_events candidate
    where candidate.organization_id=p_organization_id and candidate.idempotency_key=trim(p_idempotency_key);
  if existing.id is not null then
    if existing.lineage_digest<>lineage_digest then
      raise exception using errcode='23505',message='lead_outcome_idempotency_collision';
    end if;
    return query select existing.id,true,false; return;
  end if;
  insert into public.lead_outcome_events(
    organization_id,lead_id,campaign_id,definition_id,outcome_type,source_system,source_event_id,
    idempotency_key,ghl_location_mapping_id,ghl_contact_id,ghl_opportunity_id,meta_ad_account_id,
    meta_campaign_id,meta_ad_id,meta_form_id,occurred_at,correction_of_event_id,
    correction_reason_code,payload_digest,lineage_digest
  ) values(
    p_organization_id,p_lead_id,p_campaign_id,p_definition_id,p_outcome_type,p_source_system,trim(p_source_event_id),
    trim(p_idempotency_key),p_ghl_location_mapping_id,nullif(trim(p_ghl_contact_id),''),nullif(trim(p_ghl_opportunity_id),''),
    nullif(trim(p_meta_ad_account_id),''),nullif(trim(p_meta_campaign_id),''),nullif(trim(p_meta_ad_id),''),
    nullif(trim(p_meta_form_id),''),p_occurred_at,p_correction_of_event_id,p_correction_reason_code,p_payload_digest,lineage_digest
  ) returning * into created;
  select * into current_row from public.lead_outcome_current candidate where candidate.lead_id=p_lead_id for update;
  if current_row.lead_id is null or p_correction_of_event_id=current_row.latest_event_id or p_occurred_at>=current_row.occurred_at then
    insert into public.lead_outcome_current(
      organization_id,lead_id,campaign_id,latest_event_id,outcome_type,occurred_at,definition_id,lineage_digest
    ) values(p_organization_id,p_lead_id,p_campaign_id,created.id,p_outcome_type,p_occurred_at,p_definition_id,lineage_digest)
    on conflict(lead_id) do update set
      latest_event_id=excluded.latest_event_id,outcome_type=excluded.outcome_type,occurred_at=excluded.occurred_at,
      definition_id=excluded.definition_id,lineage_digest=excluded.lineage_digest,updated_at=timezone('utc',now());
    projection_updated := true;
  end if;
  return query select created.id,false,projection_updated;
end;
$$;

revoke all on function public.record_lead_outcome_event_v1(uuid,uuid,uuid,uuid,text,text,text,text,uuid,text,text,text,text,text,text,timestamptz,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.record_lead_outcome_event_v1(uuid,uuid,uuid,uuid,text,text,text,text,uuid,text,text,text,text,text,text,timestamptz,uuid,text,text)
  to service_role;

insert into public.app_schema_metadata(key,value,updated_at)
values('schema_version','20260717090000',timezone('utc',now()))
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

do $dealflow_lead_outcome_postcondition$
begin
  if to_regclass('public.lead_outcome_events') is null
    or to_regclass('public.lead_outcome_current') is null
    or not exists(select 1 from public.app_schema_metadata metadata
      where metadata.key='schema_version' and metadata.value='20260717090000')
    or to_regprocedure('public.record_lead_outcome_event_v1(uuid,uuid,uuid,uuid,text,text,text,text,uuid,text,text,text,text,text,text,timestamp with time zone,uuid,text,text)') is null then
    raise exception '20260717090000 postcondition failed';
  end if;
end;
$dealflow_lead_outcome_postcondition$;
