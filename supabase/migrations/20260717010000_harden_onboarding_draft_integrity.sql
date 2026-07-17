-- Make the server-side onboarding draft a 24-hour, compare-and-swap document
-- and make campaign creation plus draft consumption one database transaction.

alter table public.onboarding_drafts
  add column if not exists revision bigint,
  add column if not exists expires_at timestamptz,
  add column if not exists payload_digest text,
  add column if not exists submitted_at timestamptz,
  add column if not exists submission_input_digest text,
  add column if not exists provenance_version integer,
  add column if not exists provenance_digest text;

update public.onboarding_drafts draft
set revision = coalesce(draft.revision, 0),
    expires_at = coalesce(draft.expires_at, draft.updated_at + interval '24 hours'),
    payload_digest = coalesce(
      draft.payload_digest,
      encode(extensions.digest(convert_to(draft.payload::text, 'UTF8'), 'sha256'), 'hex')
    );

-- Preserve truthful provenance for legacy consumed rows without claiming they
-- passed the new v1 handoff contract. Their PII payload is no longer needed.
update public.onboarding_drafts draft
set submitted_at = coalesce(draft.submitted_at, draft.updated_at),
    submission_input_digest = coalesce(draft.submission_input_digest, draft.payload_digest),
    provenance_version = coalesce(draft.provenance_version, 0),
    provenance_digest = coalesce(
      draft.provenance_digest,
      encode(
        extensions.digest(
          convert_to(
            concat_ws('|', 'legacy-onboarding-consumption-v0', draft.payload_digest, draft.campaign_id::text),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    ),
    payload = '{}'::jsonb
where draft.submission_status = 'submitted'
  and draft.campaign_id is not null;

-- A legacy row marked submitted without a campaign was never consumed.
update public.onboarding_drafts draft
set submission_status = 'draft',
    submitted_at = null,
    submission_input_digest = null,
    provenance_version = null,
    provenance_digest = null
where draft.submission_status = 'submitted'
  and draft.campaign_id is null;

alter table public.onboarding_drafts
  alter column revision set default 0,
  alter column revision set not null,
  alter column expires_at set default (now() + interval '24 hours'),
  alter column expires_at set not null,
  alter column payload_digest set not null;

alter table public.onboarding_drafts
  drop constraint if exists onboarding_drafts_revision_nonnegative,
  add constraint onboarding_drafts_revision_nonnegative check (revision >= 0),
  drop constraint if exists onboarding_drafts_payload_digest_valid,
  add constraint onboarding_drafts_payload_digest_valid check (payload_digest ~ '^[0-9a-f]{64}$'),
  drop constraint if exists onboarding_drafts_submission_input_digest_valid,
  add constraint onboarding_drafts_submission_input_digest_valid check (
    submission_input_digest is null or submission_input_digest ~ '^[0-9a-f]{64}$'
  ),
  drop constraint if exists onboarding_drafts_provenance_digest_valid,
  add constraint onboarding_drafts_provenance_digest_valid check (
    provenance_digest is null or provenance_digest ~ '^[0-9a-f]{64}$'
  ),
  drop constraint if exists onboarding_drafts_consumption_shape_valid,
  add constraint onboarding_drafts_consumption_shape_valid check (
    (
      submission_status = 'draft'
      and submitted_at is null
      and submission_input_digest is null
      and provenance_version is null
      and provenance_digest is null
    )
    or (
      submission_status = 'submitted'
      and campaign_id is not null
      and submitted_at is not null
      and submission_input_digest is not null
      and provenance_version in (0, 1)
      and provenance_digest is not null
    )
  );

create table if not exists public.onboarding_submission_receipts (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  campaign_id uuid not null,
  contract_version integer not null,
  draft_revision bigint not null,
  consumed_revision bigint not null,
  draft_payload_digest text not null,
  submission_input_digest text not null,
  provenance_version integer not null,
  provenance_digest text not null,
  submitted_at timestamptz not null default now(),
  primary key (organization_id, user_id, campaign_id),
  constraint onboarding_submission_receipts_campaign_tenant_fk
    foreign key (campaign_id, organization_id)
    references public.campaign_plans(id, organization_id)
    on delete restrict,
  constraint onboarding_submission_receipts_revision_valid
    check (draft_revision >= 0 and consumed_revision = draft_revision + 1),
  constraint onboarding_submission_receipts_contract_version_valid check (contract_version > 0),
  constraint onboarding_submission_receipts_digest_valid check (
    draft_payload_digest ~ '^[0-9a-f]{64}$'
    and submission_input_digest ~ '^[0-9a-f]{64}$'
    and provenance_digest ~ '^[0-9a-f]{64}$'
  ),
  constraint onboarding_submission_receipts_provenance_version_valid
    check (provenance_version in (0, 1)),
  constraint onboarding_submission_receipts_payload_identity_unique
    unique (organization_id, user_id, draft_payload_digest),
  constraint onboarding_submission_receipts_provenance_identity_unique
    unique (organization_id, user_id, provenance_digest)
);

alter table public.onboarding_submission_receipts enable row level security;
alter table public.onboarding_submission_receipts force row level security;
revoke all on table public.onboarding_submission_receipts from public, anon, authenticated, service_role;
comment on table public.onboarding_submission_receipts is
  'No-PII immutable handoff receipts for exact onboarding submit replay and campaign provenance.';

-- Transfer legacy consumed state into the no-PII receipt ledger before active
-- draft rows are removed. New submissions write this ledger transactionally.
insert into public.onboarding_submission_receipts (
  organization_id, user_id, campaign_id, contract_version,
  draft_revision, consumed_revision, draft_payload_digest,
  submission_input_digest, provenance_version, provenance_digest, submitted_at
)
select
  draft.organization_id, draft.user_id, draft.campaign_id, draft.contract_version,
  greatest(draft.revision - 1, 0), greatest(draft.revision, 1), draft.payload_digest,
  draft.submission_input_digest, draft.provenance_version, draft.provenance_digest,
  draft.submitted_at
from public.onboarding_drafts draft
where draft.submission_status = 'submitted'
  and draft.campaign_id is not null
on conflict (organization_id, user_id, campaign_id) do nothing;

delete from public.onboarding_drafts draft
where draft.submission_status = 'submitted'
  and exists (
    select 1 from public.onboarding_submission_receipts receipt
    where receipt.organization_id = draft.organization_id
      and receipt.user_id = draft.user_id
      and receipt.campaign_id = draft.campaign_id
  );

create index if not exists onboarding_drafts_expiry_idx
  on public.onboarding_drafts (expires_at)
  where submission_status = 'draft';

drop policy if exists onboarding_drafts_user_member_select on public.onboarding_drafts;
create policy onboarding_drafts_user_member_select
  on public.onboarding_drafts
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and private.is_current_user_org_member(organization_id)
    and submission_status = 'draft'
    and expires_at > now()
  );

drop policy if exists onboarding_drafts_user_member_insert on public.onboarding_drafts;
drop policy if exists onboarding_drafts_user_member_update on public.onboarding_drafts;
revoke all on table public.onboarding_drafts from anon, authenticated;
grant select on table public.onboarding_drafts to authenticated;

create or replace function public.save_onboarding_draft_v2(
  p_organization_id uuid,
  p_user_id uuid,
  p_expected_revision bigint,
  p_contract_version integer,
  p_payload jsonb,
  p_current_step text,
  p_furthest_step_index integer
)
returns table (
  accepted_revision bigint,
  accepted_payload_digest text,
  accepted_expires_at timestamptz,
  reused_consumed_receipt boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_draft public.onboarding_drafts%rowtype;
  saved_draft public.onboarding_drafts%rowtype;
  consumed_receipt public.onboarding_submission_receipts%rowtype;
  computed_digest text;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is distinct from p_user_id then
    raise exception using errcode = '42501', message = 'onboarding_draft_actor_forbidden';
  end if;
  if p_organization_id is null or p_user_id is null or p_expected_revision is null
     or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'onboarding_draft_identity_or_revision_invalid';
  end if;
  if p_contract_version is null or p_contract_version <= 0
     or p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or p_current_step is null or p_furthest_step_index not between 0 and 9 then
    raise exception using errcode = '22023', message = 'onboarding_draft_payload_invalid';
  end if;
  if not private.is_current_user_org_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'onboarding_draft_actor_not_member';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || p_user_id::text, 170100)
  );
  computed_digest := encode(
    extensions.digest(pg_catalog.convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select draft.* into existing_draft
  from public.onboarding_drafts draft
  where draft.organization_id = p_organization_id and draft.user_id = p_user_id
  for update;

  if not found then
    select receipt.* into consumed_receipt
    from public.onboarding_submission_receipts receipt
    where receipt.organization_id = p_organization_id
      and receipt.user_id = p_user_id
      and receipt.draft_revision = p_expected_revision
      and receipt.draft_payload_digest = computed_digest
    order by receipt.submitted_at desc
    limit 1;
    if found then
      return query select consumed_receipt.draft_revision, consumed_receipt.draft_payload_digest,
        consumed_receipt.submitted_at, true;
      return;
    end if;
    if p_expected_revision <> 0 then
      raise exception using errcode = '40001', message = 'onboarding_draft_stale_revision';
    end if;
    insert into public.onboarding_drafts (
      organization_id, user_id, contract_version, payload, payload_digest,
      current_step, furthest_step_index, revision, expires_at
    ) values (
      p_organization_id, p_user_id, p_contract_version, p_payload, computed_digest,
      p_current_step, p_furthest_step_index, 1, now() + interval '24 hours'
    ) returning * into saved_draft;
  else
    if existing_draft.submission_status = 'submitted' then
      raise exception using errcode = '55000', message = 'onboarding_draft_already_consumed';
    end if;
    if existing_draft.expires_at <= now() then
      raise exception using errcode = '55000', message = 'onboarding_draft_expired';
    end if;
    if existing_draft.revision <> p_expected_revision then
      raise exception using errcode = '40001', message = 'onboarding_draft_stale_revision';
    end if;
    update public.onboarding_drafts draft
    set contract_version = p_contract_version,
        payload = p_payload,
        payload_digest = computed_digest,
        current_step = p_current_step,
        furthest_step_index = greatest(existing_draft.furthest_step_index, p_furthest_step_index),
        revision = existing_draft.revision + 1,
        expires_at = now() + interval '24 hours',
        updated_at = now()
    where draft.organization_id = p_organization_id and draft.user_id = p_user_id
    returning * into saved_draft;
  end if;

  return query select saved_draft.revision, saved_draft.payload_digest, saved_draft.expires_at, false;
end;
$$;

create or replace function public.delete_onboarding_draft_v2(
  p_organization_id uuid,
  p_user_id uuid,
  p_expected_revision bigint default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_draft public.onboarding_drafts%rowtype;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is distinct from p_user_id then
    raise exception using errcode = '42501', message = 'onboarding_draft_actor_forbidden';
  end if;
  if p_expected_revision is not null and p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'onboarding_draft_revision_invalid';
  end if;
  if not private.is_current_user_org_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'onboarding_draft_actor_not_member';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || p_user_id::text, 170100)
  );
  select draft.* into existing_draft
  from public.onboarding_drafts draft
  where draft.organization_id = p_organization_id and draft.user_id = p_user_id
  for update;

  if not found then return false; end if;
  if existing_draft.submission_status = 'submitted' then return false; end if;
  if p_expected_revision is not null and existing_draft.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'onboarding_draft_stale_revision';
  end if;
  delete from public.onboarding_drafts draft
  where draft.organization_id = p_organization_id and draft.user_id = p_user_id;
  return true;
end;
$$;

create or replace function public.submit_onboarding_draft_v2(
  p_organization_id uuid,
  p_user_id uuid,
  p_expected_revision bigint,
  p_draft_payload jsonb,
  p_draft_payload_digest text,
  p_submission jsonb,
  p_submission_input_digest text,
  p_provenance_version integer,
  p_provenance_digest text,
  p_campaign_id uuid,
  p_campaign_plan jsonb
)
returns table (
  submitted_campaign_id uuid,
  consumed_revision bigint,
  reused_existing boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_draft public.onboarding_drafts%rowtype;
  submission_receipt public.onboarding_submission_receipts%rowtype;
  campaign_record public.campaign_plans%rowtype;
  computed_draft_digest text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'onboarding_submit_service_role_required';
  end if;
  if p_organization_id is null or p_user_id is null or p_campaign_id is null
     or p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'onboarding_submit_identity_or_revision_invalid';
  end if;
  if p_draft_payload is null or pg_catalog.jsonb_typeof(p_draft_payload) <> 'object'
     or p_submission is null or pg_catalog.jsonb_typeof(p_submission) <> 'object'
     or p_campaign_plan is null or pg_catalog.jsonb_typeof(p_campaign_plan) <> 'object'
     or p_provenance_version <> 1
     or coalesce(p_draft_payload_digest, '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_submission_input_digest, '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_provenance_digest, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'onboarding_submit_payload_invalid';
  end if;
  if not exists (
    select 1 from public.organizations organization_record
    where organization_record.id = p_organization_id
      and organization_record.owner_user_id = p_user_id
  ) and not exists (
    select 1 from public.organization_memberships membership_record
    where membership_record.organization_id = p_organization_id
      and membership_record.user_id = p_user_id
  ) then
    raise exception using errcode = '42501', message = 'onboarding_submit_actor_not_member';
  end if;
  if p_campaign_plan -> 'onboarding_contract' is distinct from p_submission
     or p_campaign_plan #>> '{onboarding_provenance,provenanceVersion}' is distinct from '1'
     or p_campaign_plan #>> '{onboarding_provenance,draftPayloadDigest}' is distinct from p_draft_payload_digest
     or p_campaign_plan #>> '{onboarding_provenance,submissionInputDigest}' is distinct from p_submission_input_digest
     or p_campaign_plan #>> '{onboarding_provenance,provenanceDigest}' is distinct from p_provenance_digest then
    raise exception using errcode = '22023', message = 'onboarding_submit_provenance_mismatch';
  end if;

  computed_draft_digest := encode(
    extensions.digest(pg_catalog.convert_to(p_draft_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if computed_draft_digest is distinct from p_draft_payload_digest then
    raise exception using errcode = '22023', message = 'onboarding_submit_draft_digest_mismatch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || p_user_id::text, 170100)
  );
  select draft.* into existing_draft
  from public.onboarding_drafts draft
  where draft.organization_id = p_organization_id and draft.user_id = p_user_id
  for update;

  if not found then
    select receipt.* into submission_receipt
    from public.onboarding_submission_receipts receipt
    where receipt.organization_id = p_organization_id
      and receipt.user_id = p_user_id
      and receipt.campaign_id = p_campaign_id;
    if not found then
      raise exception using errcode = '55000', message = 'onboarding_submit_draft_missing';
    end if;
    if submission_receipt.provenance_version <> 1
       or submission_receipt.draft_revision <> p_expected_revision
       or submission_receipt.draft_payload_digest is distinct from p_draft_payload_digest
       or submission_receipt.submission_input_digest is distinct from p_submission_input_digest
       or submission_receipt.provenance_digest is distinct from p_provenance_digest then
      raise exception using errcode = '23505', message = 'onboarding_submit_consumed_collision';
    end if;
    select campaign.* into campaign_record from public.campaign_plans campaign
    where campaign.id = submission_receipt.campaign_id
      and campaign.organization_id = p_organization_id
      and campaign.user_id = p_user_id;
    if not found or campaign_record.plan #>> '{onboarding_provenance,provenanceDigest}'
       is distinct from p_provenance_digest then
      raise exception using errcode = '55000', message = 'onboarding_submit_campaign_provenance_missing';
    end if;
    return query select submission_receipt.campaign_id, submission_receipt.consumed_revision, true;
    return;
  end if;

  if existing_draft.submission_status = 'submitted' then
    if existing_draft.provenance_version <> 1
       or existing_draft.revision <> p_expected_revision + 1
       or existing_draft.campaign_id is distinct from p_campaign_id
       or existing_draft.payload_digest is distinct from p_draft_payload_digest
       or existing_draft.submission_input_digest is distinct from p_submission_input_digest
       or existing_draft.provenance_digest is distinct from p_provenance_digest then
      raise exception using errcode = '23505', message = 'onboarding_submit_consumed_collision';
    end if;
    select campaign.* into campaign_record from public.campaign_plans campaign
    where campaign.id = existing_draft.campaign_id
      and campaign.organization_id = p_organization_id
      and campaign.user_id = p_user_id;
    if not found or campaign_record.plan #>> '{onboarding_provenance,provenanceDigest}'
       is distinct from p_provenance_digest then
      raise exception using errcode = '55000', message = 'onboarding_submit_campaign_provenance_missing';
    end if;
    return query select existing_draft.campaign_id, existing_draft.revision, true;
    return;
  end if;

  if existing_draft.expires_at <= now() then
    raise exception using errcode = '55000', message = 'onboarding_submit_draft_expired';
  end if;
  if existing_draft.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'onboarding_draft_stale_revision';
  end if;
  if existing_draft.payload is distinct from p_draft_payload
     or existing_draft.payload_digest is distinct from p_draft_payload_digest then
    raise exception using errcode = '40001', message = 'onboarding_submit_draft_changed';
  end if;

  select campaign.* into campaign_record
  from public.create_campaign_plan_with_entitlement_v1(
    p_campaign_id, p_organization_id, p_user_id, p_campaign_plan, null, false, null
  ) campaign;
  if campaign_record.id is null
     or campaign_record.organization_id is distinct from p_organization_id
     or campaign_record.user_id is distinct from p_user_id
     or campaign_record.plan #>> '{onboarding_provenance,provenanceDigest}' is distinct from p_provenance_digest then
    raise exception using errcode = '23505', message = 'onboarding_submit_campaign_collision';
  end if;

  insert into public.onboarding_submission_receipts (
    organization_id, user_id, campaign_id, contract_version,
    draft_revision, consumed_revision, draft_payload_digest,
    submission_input_digest, provenance_version, provenance_digest
  ) values (
    p_organization_id, p_user_id, p_campaign_id, existing_draft.contract_version,
    existing_draft.revision, existing_draft.revision + 1, p_draft_payload_digest,
    p_submission_input_digest, p_provenance_version, p_provenance_digest
  ) returning * into submission_receipt;

  delete from public.onboarding_drafts draft
  where draft.organization_id = p_organization_id and draft.user_id = p_user_id;

  return query select p_campaign_id, submission_receipt.consumed_revision, false;
end;
$$;

revoke all on function public.save_onboarding_draft_v2(uuid,uuid,bigint,integer,jsonb,text,integer)
  from public, anon, authenticated;
grant execute on function public.save_onboarding_draft_v2(uuid,uuid,bigint,integer,jsonb,text,integer)
  to authenticated;
revoke all on function public.delete_onboarding_draft_v2(uuid,uuid,bigint)
  from public, anon, authenticated;
grant execute on function public.delete_onboarding_draft_v2(uuid,uuid,bigint)
  to authenticated;
revoke all on function public.submit_onboarding_draft_v2(uuid,uuid,bigint,jsonb,text,jsonb,text,integer,text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_onboarding_draft_v2(uuid,uuid,bigint,jsonb,text,jsonb,text,integer,text,uuid,jsonb)
  to service_role;

comment on function public.save_onboarding_draft_v2(uuid,uuid,bigint,integer,jsonb,text,integer) is
  'Authenticated 24-hour compare-and-swap write for one tenant/user onboarding draft.';
comment on function public.delete_onboarding_draft_v2(uuid,uuid,bigint) is
  'Authenticated compare-and-swap deletion for a non-consumed onboarding draft.';
comment on function public.submit_onboarding_draft_v2(uuid,uuid,bigint,jsonb,text,jsonb,text,integer,text,uuid,jsonb) is
  'Service-only atomic campaign creation and onboarding-draft consumption with versioned provenance.';

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260717010000')
on conflict (key) do update
set value = excluded.value, updated_at = now();

do $$
begin
  if to_regprocedure('public.save_onboarding_draft_v2(uuid,uuid,bigint,integer,jsonb,text,integer)') is null
     or to_regprocedure('public.delete_onboarding_draft_v2(uuid,uuid,bigint)') is null
     or to_regprocedure('public.submit_onboarding_draft_v2(uuid,uuid,bigint,jsonb,text,jsonb,text,integer,text,uuid,jsonb)') is null then
    raise exception '20260717010000 postcondition failed: onboarding integrity RPC is missing';
  end if;
  if has_function_privilege('anon', 'public.save_onboarding_draft_v2(uuid,uuid,bigint,integer,jsonb,text,integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.save_onboarding_draft_v2(uuid,uuid,bigint,integer,jsonb,text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.submit_onboarding_draft_v2(uuid,uuid,bigint,jsonb,text,jsonb,text,integer,text,uuid,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.submit_onboarding_draft_v2(uuid,uuid,bigint,jsonb,text,jsonb,text,integer,text,uuid,jsonb)', 'EXECUTE') then
    raise exception '20260717010000 postcondition failed: onboarding RPC privileges are unsafe';
  end if;
  if has_table_privilege('authenticated', 'public.onboarding_drafts', 'INSERT')
     or has_table_privilege('authenticated', 'public.onboarding_drafts', 'UPDATE')
     or has_table_privilege('authenticated', 'public.onboarding_drafts', 'DELETE') then
    raise exception '20260717010000 postcondition failed: direct onboarding draft writes leaked';
  end if;
  if to_regclass('public.onboarding_submission_receipts') is null
     or has_table_privilege('authenticated', 'public.onboarding_submission_receipts', 'SELECT')
     or has_table_privilege('authenticated', 'public.onboarding_submission_receipts', 'INSERT')
     or has_table_privilege('authenticated', 'public.onboarding_submission_receipts', 'UPDATE')
     or has_table_privilege('authenticated', 'public.onboarding_submission_receipts', 'DELETE')
     or has_table_privilege('service_role', 'public.onboarding_submission_receipts', 'INSERT')
     or has_table_privilege('service_role', 'public.onboarding_submission_receipts', 'UPDATE')
     or has_table_privilege('service_role', 'public.onboarding_submission_receipts', 'DELETE') then
    raise exception '20260717010000 postcondition failed: onboarding receipt ledger is missing or exposed';
  end if;
  if not exists (
    select 1 from public.app_schema_metadata metadata
    where metadata.key = 'schema_version' and metadata.value = '20260717010000'
  ) then
    raise exception '20260717010000 postcondition failed: schema version was not advanced';
  end if;
end;
$$;
