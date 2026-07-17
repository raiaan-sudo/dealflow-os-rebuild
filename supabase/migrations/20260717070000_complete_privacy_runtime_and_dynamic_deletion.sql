-- Complete the privacy runtime with a catalog-bound deletion manifest and an
-- external anti-resurrection tombstone. Nothing in this migration performs an
-- external call or deletes data; it makes final completion fail closed until
-- every current relation and the independent tombstone receipt are proven.

create table public.account_deletion_resource_manifest (
  request_id uuid not null references public.account_deletion_requests(id) on delete restrict,
  relation_schema text not null,
  relation_name text not null,
  inventory_generation_digest text not null check (inventory_generation_digest ~ '^[0-9a-f]{64}$'),
  classification_snapshot_digest text not null check (classification_snapshot_digest ~ '^[0-9a-f]{64}$'),
  authority_grant_id uuid not null references public.privacy_authority_grants(id) on delete restrict,
  disposition text not null check (disposition in (
    'delete', 'anonymize', 'legal_retain', 'provider_detach',
    'no_subject_data', 'synthetic_test_only'
  )),
  retention_class text not null,
  executor_task text not null,
  scope_column text null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'operator_required')),
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (request_id, relation_schema, relation_name),
  check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create index account_deletion_resource_manifest_task_idx
  on public.account_deletion_resource_manifest(request_id, executor_task, status);

create table public.account_deletion_tombstones (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.account_deletion_requests(id) on delete restrict,
  subject_digest text not null unique check (subject_digest ~ '^sha256:[a-f0-9]{64}$'),
  manifest_digest text not null check (manifest_digest ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending_anchor' check (state in (
    'pending_anchor', 'anchored', 'restore_approved', 'operator_required'
  )),
  backup_expiry_at timestamptz not null,
  tombstone_expiry_at timestamptz not null,
  external_anchor_receipt_digest text null check (
    external_anchor_receipt_digest is null or external_anchor_receipt_digest ~ '^sha256:[a-f0-9]{64}$'
  ),
  anchored_at timestamptz null,
  restore_approved_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (tombstone_expiry_at > backup_expiry_at),
  check (
    (state = 'anchored' and external_anchor_receipt_digest is not null and anchored_at is not null)
    or state <> 'anchored'
  ),
  check ((state = 'restore_approved' and restore_approved_at is not null) or state <> 'restore_approved')
);

alter table public.account_deletion_resource_manifest enable row level security;
alter table public.account_deletion_resource_manifest force row level security;
alter table public.account_deletion_tombstones enable row level security;
alter table public.account_deletion_tombstones force row level security;
revoke all on public.account_deletion_resource_manifest from public, anon, authenticated, service_role;
revoke all on public.account_deletion_tombstones from public, anon, authenticated, service_role;
grant select on public.account_deletion_resource_manifest to service_role;
grant select on public.account_deletion_tombstones to service_role;

create or replace function private.reject_account_deletion_manifest_identity_mutation_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or new.request_id is distinct from old.request_id
    or new.relation_schema is distinct from old.relation_schema
    or new.relation_name is distinct from old.relation_name
    or new.inventory_generation_digest is distinct from old.inventory_generation_digest
    or new.classification_snapshot_digest is distinct from old.classification_snapshot_digest
    or new.authority_grant_id is distinct from old.authority_grant_id
    or new.disposition is distinct from old.disposition
    or new.retention_class is distinct from old.retention_class
    or new.executor_task is distinct from old.executor_task
    or new.scope_column is distinct from old.scope_column
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514', message = 'account_deletion_manifest_identity_immutable';
  end if;
  return new;
end;
$$;

create trigger account_deletion_manifest_identity_immutable
before update or delete on public.account_deletion_resource_manifest
for each row execute function private.reject_account_deletion_manifest_identity_mutation_v1();

create or replace function private.reject_account_deletion_tombstone_identity_mutation_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    or new.id is distinct from old.id
    or new.request_id is distinct from old.request_id
    or new.subject_digest is distinct from old.subject_digest
    or new.manifest_digest is distinct from old.manifest_digest
    or new.backup_expiry_at is distinct from old.backup_expiry_at
    or new.tombstone_expiry_at is distinct from old.tombstone_expiry_at
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514', message = 'account_deletion_tombstone_identity_immutable';
  end if;
  return new;
end;
$$;

create trigger account_deletion_tombstone_identity_immutable
before update or delete on public.account_deletion_tombstones
for each row execute function private.reject_account_deletion_tombstone_identity_mutation_v1();

create or replace function public.prepare_account_deletion_completion_v2(
  p_request_id uuid,
  p_claim_token uuid,
  p_claim_generation bigint,
  p_backup_retention_days integer default 30,
  p_tombstone_retention_days integer default 3650
)
returns table(manifest_digest text, subject_digest text, tombstone_state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.account_deletion_tasks%rowtype;
  request public.account_deletion_requests%rowtype;
  generation_count integer;
  generation_digest text;
  catalog_count integer;
  catalog_digest text;
  inventory_count integer;
  unresolved_count integer;
  computed_manifest text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'account_deletion_service_role_required';
  end if;
  if p_backup_retention_days not between 1 and 3650
    or p_tombstone_retention_days <= p_backup_retention_days
    or p_tombstone_retention_days > 36500 then
    raise exception using errcode = '22023', message = 'account_deletion_tombstone_retention_invalid';
  end if;

  select * into strict task
  from public.account_deletion_tasks candidate
  where candidate.request_id = p_request_id
    and candidate.task_kind = 'complete_request'
    and candidate.status = 'processing'
    and candidate.claim_token = p_claim_token
    and candidate.claim_generation = p_claim_generation
    and candidate.locked_until >= timezone('utc', now())
  for update;
  select * into strict request from public.account_deletion_requests source
  where source.id = p_request_id for update;

  -- Runtime deletion workers may verify the owner-installed inventory, but
  -- cannot refresh or reclassify it. A catalog change after owner approval is
  -- an explicit fail-closed reauthorization event.
  select identity.relation_count, identity.inventory_generation_digest
  into strict catalog_count, catalog_digest
  from private.current_privacy_catalog_identity_v1() identity;
  select count(*), count(distinct inventory_generation_digest), min(inventory_generation_digest),
    count(*) filter (where authority_class = 'unresolved_owner_privacy_authority'
      or authority_grant_id is null or classification_snapshot_digest is null
      or disposition is null or retention_class is null or executor_task is null)
  into inventory_count, generation_count, generation_digest, unresolved_count
  from public.privacy_data_inventory;
  if inventory_count <> catalog_count or generation_count <> 1
    or generation_digest is distinct from catalog_digest then
    raise exception using errcode = '55000', message = 'account_deletion_dynamic_inventory_catalog_drift';
  end if;
  if generation_digest is null or unresolved_count <> 0 then
    raise exception using errcode = '55000', message = 'account_deletion_dynamic_inventory_unresolved';
  end if;

  if not exists (
    select 1 from public.account_deletion_resource_manifest manifest
    where manifest.request_id = p_request_id
  ) then
    insert into public.account_deletion_resource_manifest(
      request_id, relation_schema, relation_name, inventory_generation_digest,
      classification_snapshot_digest, authority_grant_id, disposition,
      retention_class, executor_task, scope_column, status, completed_at
    )
    select p_request_id, inventory.relation_schema, inventory.relation_name,
      inventory.inventory_generation_digest, inventory.classification_snapshot_digest,
      inventory.authority_grant_id, inventory.disposition, inventory.retention_class,
      inventory.executor_task, inventory.scope_column,
      case
        when inventory.executor_task in ('none_required', 'synthetic_test_only') then 'completed'
        when exists (
          select 1 from public.account_deletion_tasks completed_task
          where completed_task.request_id = p_request_id
            and completed_task.task_kind = inventory.executor_task
            and completed_task.status = 'completed'
        ) then 'completed'
        else 'pending'
      end,
      case
        when inventory.executor_task in ('none_required', 'synthetic_test_only') then timezone('utc', now())
        when exists (
          select 1 from public.account_deletion_tasks completed_task
          where completed_task.request_id = p_request_id
            and completed_task.task_kind = inventory.executor_task
            and completed_task.status = 'completed'
        ) then timezone('utc', now())
        else null
      end
    from public.privacy_data_inventory inventory;
  end if;

  if exists (
    select 1 from public.account_deletion_resource_manifest manifest
    where manifest.request_id = p_request_id
      and manifest.inventory_generation_digest <> generation_digest
  ) then
    raise exception using errcode = '55000', message = 'account_deletion_manifest_catalog_drift';
  end if;

  select encode(extensions.digest(convert_to(coalesce(string_agg(
    concat_ws('|', relation_schema, relation_name, inventory_generation_digest,
      classification_snapshot_digest, authority_grant_id::text, disposition,
      retention_class, executor_task, coalesce(scope_column, '')), E'\n'
    order by relation_schema, relation_name), ''), 'UTF8'), 'sha256'), 'hex')
  into computed_manifest
  from public.account_deletion_resource_manifest
  where request_id = p_request_id;

  insert into public.account_deletion_tombstones(
    request_id, subject_digest, manifest_digest, state,
    backup_expiry_at, tombstone_expiry_at
  ) values (
    p_request_id, request.subject_hash, computed_manifest, 'pending_anchor',
    timezone('utc', now()) + make_interval(days => p_backup_retention_days),
    timezone('utc', now()) + make_interval(days => p_tombstone_retention_days)
  ) on conflict (request_id) do nothing;

  return query select computed_manifest, request.subject_hash, tombstone.state
  from public.account_deletion_tombstones tombstone
  where tombstone.request_id = p_request_id;
end;
$$;

create or replace function public.attest_account_deletion_tombstone_anchor_v1(
  p_request_id uuid,
  p_claim_token uuid,
  p_claim_generation bigint,
  p_manifest_digest text,
  p_external_anchor_receipt_digest text
)
returns public.account_deletion_tombstones
language plpgsql
security definer
set search_path = ''
as $$
declare result public.account_deletion_tombstones%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'account_deletion_service_role_required';
  end if;
  if p_manifest_digest !~ '^[a-f0-9]{64}$'
    or p_external_anchor_receipt_digest !~ '^sha256:[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'account_deletion_tombstone_receipt_invalid';
  end if;
  if not exists (
    select 1 from public.account_deletion_tasks task
    where task.request_id = p_request_id and task.task_kind = 'complete_request'
      and task.status = 'processing' and task.claim_token = p_claim_token
      and task.claim_generation = p_claim_generation
      and task.locked_until >= timezone('utc', now())
  ) then
    raise exception using errcode = '40001', message = 'account_deletion_claim_stale';
  end if;
  update public.account_deletion_tombstones tombstone set
    state = 'anchored', external_anchor_receipt_digest = p_external_anchor_receipt_digest,
    anchored_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where tombstone.request_id = p_request_id
    and tombstone.manifest_digest = p_manifest_digest
    and tombstone.state in ('pending_anchor', 'anchored')
    and (tombstone.external_anchor_receipt_digest is null
      or tombstone.external_anchor_receipt_digest = p_external_anchor_receipt_digest)
  returning * into result;
  if result.id is null then
    raise exception using errcode = '55000', message = 'account_deletion_tombstone_anchor_conflict';
  end if;
  return result;
end;
$$;

create or replace function private.account_deletion_manifest_task_completion_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.task_kind = 'complete_request' then
      if not exists (
        select 1 from public.account_deletion_resource_manifest manifest
        where manifest.request_id = new.request_id
      ) or exists (
        select 1 from public.account_deletion_resource_manifest manifest
        where manifest.request_id = new.request_id
          and manifest.executor_task <> 'complete_request'
          and manifest.status <> 'completed'
      ) or not exists (
        select 1 from public.account_deletion_tombstones tombstone
        where tombstone.request_id = new.request_id and tombstone.state = 'anchored'
          and tombstone.external_anchor_receipt_digest is not null
      ) then
        raise exception using errcode = '55000', message = 'account_deletion_completion_proof_incomplete';
      end if;
    end if;
    update public.account_deletion_resource_manifest manifest set
      status = 'completed', completed_at = timezone('utc', now())
    where manifest.request_id = new.request_id
      and manifest.executor_task = new.task_kind
      and manifest.status = 'pending';
  elsif new.status = 'operator_required' and old.status is distinct from 'operator_required' then
    update public.account_deletion_resource_manifest manifest set status = 'operator_required'
    where manifest.request_id = new.request_id
      and manifest.executor_task = new.task_kind
      and manifest.status = 'pending';
  end if;
  return new;
end;
$$;
revoke all on function private.account_deletion_manifest_task_completion_v1()
  from public, anon, authenticated, service_role;

create trigger account_deletion_manifest_task_completion
after update of status on public.account_deletion_tasks
for each row execute function private.account_deletion_manifest_task_completion_v1();

revoke all on function public.prepare_account_deletion_completion_v2(uuid,uuid,bigint,integer,integer)
  from public, anon, authenticated;
grant execute on function public.prepare_account_deletion_completion_v2(uuid,uuid,bigint,integer,integer)
  to service_role;
revoke all on function public.attest_account_deletion_tombstone_anchor_v1(uuid,uuid,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.attest_account_deletion_tombstone_anchor_v1(uuid,uuid,bigint,text,text)
  to service_role;

do $dealflow_privacy_completion_postcondition$
begin
  if to_regclass('public.account_deletion_resource_manifest') is null
    or to_regclass('public.account_deletion_tombstones') is null
    or to_regprocedure('public.prepare_account_deletion_completion_v2(uuid,uuid,bigint,integer,integer)') is null
    or to_regprocedure('public.attest_account_deletion_tombstone_anchor_v1(uuid,uuid,bigint,text,text)') is null then
    raise exception '20260717070000 postcondition failed';
  end if;
end;
$dealflow_privacy_completion_postcondition$;
