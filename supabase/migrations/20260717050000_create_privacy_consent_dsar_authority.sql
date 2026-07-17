-- DealFlow privacy authority plane.
--
-- Privacy execution is bound to one externally signed, candidate-bound owner
-- decision packet. Environment flags, email allowlists, service-role possession,
-- and unsigned policy documents are not authority. Synthetic authority is
-- accepted only in isolated staging and only when installed by the database
-- owner. Provider calls are never made from these database functions.

create schema if not exists private;

create table public.privacy_authority_grants (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('production', 'staging')),
  authority_mode text not null check (authority_mode in ('externally_signed', 'synthetic_staging')),
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  generation bigint not null check (generation > 0),
  candidate_commit text not null check (candidate_commit ~ '^[0-9a-f]{40}$'),
  candidate_tree text not null check (candidate_tree ~ '^[0-9a-f]{40}$'),
  candidate_digest text not null check (candidate_digest ~ '^[0-9a-f]{64}$'),
  authority_packet_digest text not null check (authority_packet_digest ~ '^[0-9a-f]{64}$'),
  signature_bundle_digest text not null check (signature_bundle_digest ~ '^[0-9a-f]{64}$'),
  policy_version text not null check (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  policy_digest text not null check (policy_digest ~ '^[0-9a-f]{64}$'),
  inventory_generation_digest text not null check (inventory_generation_digest ~ '^[0-9a-f]{64}$'),
  inventory_relation_count integer not null check (inventory_relation_count > 0),
  inventory_classification_digest text not null check (inventory_classification_digest ~ '^[0-9a-f]{64}$'),
  allowed_purposes text[] not null check (cardinality(allowed_purposes) between 1 and 64),
  consent_maximum_age_days integer not null check (consent_maximum_age_days between 1 and 3650),
  dsar_request_expiry_hours integer not null check (dsar_request_expiry_hours between 1 and 720),
  export_artifact_expiry_hours integer not null check (export_artifact_expiry_hours between 1 and 168),
  legal_retention_authorized boolean not null default false,
  legal_authority_ref_digest text null check (legal_authority_ref_digest is null or legal_authority_ref_digest ~ '^[0-9a-f]{64}$'),
  grant_digest text not null unique check (grant_digest ~ '^[0-9a-f]{64}$'),
  granted_at timestamptz not null default now(),
  expires_at timestamptz null,
  revoked_at timestamptz null,
  revocation_reason_code text null,
  constraint privacy_authority_environment_generation_unique unique (environment, generation),
  constraint privacy_authority_legal_shape check (
    (legal_retention_authorized and legal_authority_ref_digest is not null)
    or (not legal_retention_authorized and legal_authority_ref_digest is null)
  ),
  constraint privacy_authority_time_order check (expires_at is null or expires_at > granted_at),
  constraint privacy_authority_revocation_shape check (
    (status = 'revoked' and revoked_at is not null and revocation_reason_code ~ '^[a-z0-9][a-z0-9_:-]{2,127}$')
    or (status <> 'revoked' and revoked_at is null and revocation_reason_code is null)
  ),
  constraint privacy_authority_production_external_only check (
    environment <> 'production' or authority_mode = 'externally_signed'
  ),
  constraint privacy_authority_synthetic_staging_only check (
    authority_mode <> 'synthetic_staging'
    or (environment = 'staging' and expires_at is not null and expires_at <= granted_at + interval '24 hours')
  )
);

create unique index privacy_authority_one_active_environment_idx
  on public.privacy_authority_grants (environment) where status = 'active';

create table public.privacy_consent_events (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  subject_digest text not null check (subject_digest ~ '^[0-9a-f]{64}$'),
  purpose_key text not null check (purpose_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  event_type text not null check (event_type in ('grant', 'deny', 'withdraw')),
  sequence bigint not null check (sequence > 0),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{15,127}$'),
  policy_version text not null,
  policy_digest text not null check (policy_digest ~ '^[0-9a-f]{64}$'),
  copy_digest text not null check (copy_digest ~ '^[0-9a-f]{64}$'),
  evidence_digest text not null check (evidence_digest ~ '^[0-9a-f]{64}$'),
  authority_grant_id uuid not null references public.privacy_authority_grants(id) on delete restrict,
  authority_packet_digest text not null check (authority_packet_digest ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null,
  expires_at timestamptz null,
  event_digest text not null unique check (event_digest ~ '^[0-9a-f]{64}$'),
  constraint privacy_consent_sequence_unique unique (organization_id, user_id, purpose_key, sequence),
  constraint privacy_consent_idempotency_unique unique (organization_id, user_id, idempotency_key),
  constraint privacy_consent_expiry_shape check (
    (event_type = 'grant' and expires_at is not null and expires_at > occurred_at)
    or (event_type <> 'grant' and expires_at is null)
  )
);

create table public.privacy_consent_current (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  subject_digest text not null check (subject_digest ~ '^[0-9a-f]{64}$'),
  purpose_key text not null,
  state text not null check (state in ('granted', 'denied', 'withdrawn')),
  sequence bigint not null check (sequence > 0),
  source_event_id uuid not null unique references public.privacy_consent_events(id) on delete restrict,
  policy_version text not null,
  policy_digest text not null check (policy_digest ~ '^[0-9a-f]{64}$'),
  evidence_digest text not null check (evidence_digest ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz not null,
  expires_at timestamptz null,
  primary key (organization_id, user_id, purpose_key)
);

create table public.privacy_subject_requests (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  subject_digest text not null check (subject_digest ~ '^[0-9a-f]{64}$'),
  request_type text not null check (request_type in ('access', 'correction', 'export', 'delete')),
  state text not null default 'accepted' check (state in ('accepted', 'in_progress', 'completed', 'rejected', 'expired')),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{15,127}$'),
  request_payload_digest text not null check (request_payload_digest ~ '^[0-9a-f]{64}$'),
  policy_version text not null,
  policy_digest text not null check (policy_digest ~ '^[0-9a-f]{64}$'),
  authority_grant_id uuid not null references public.privacy_authority_grants(id) on delete restrict,
  authority_packet_digest text not null check (authority_packet_digest ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz not null,
  expires_at timestamptz not null,
  completed_at timestamptz null,
  account_deletion_request_id uuid null unique references public.account_deletion_requests(id) on delete restrict,
  last_receipt_digest text not null check (last_receipt_digest ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null,
  constraint privacy_subject_request_idempotency_unique unique (organization_id, requested_by_user_id, idempotency_key),
  constraint privacy_subject_request_expiry_check check (expires_at > accepted_at),
  constraint privacy_subject_request_completion_shape check (
    (state = 'completed' and completed_at is not null)
    or (state <> 'completed' and completed_at is null)
  )
);

alter table public.account_deletion_requests
  add column if not exists privacy_subject_request_id uuid null;
create unique index if not exists account_deletion_privacy_request_unique
  on public.account_deletion_requests (privacy_subject_request_id)
  where privacy_subject_request_id is not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'account_deletion_privacy_request_fk'
  ) then
    alter table public.account_deletion_requests
      add constraint account_deletion_privacy_request_fk
      foreign key (privacy_subject_request_id)
      references public.privacy_subject_requests(id) on delete restrict;
  end if;
end;
$$;

create table public.privacy_subject_request_receipts (
  id uuid primary key,
  request_id uuid not null references public.privacy_subject_requests(id) on delete restrict,
  organization_subject_digest text not null check (organization_subject_digest ~ '^[0-9a-f]{64}$'),
  action_code text not null check (action_code ~ '^[a-z0-9][a-z0-9_:-]{2,127}$'),
  previous_state text null,
  next_state text not null,
  actor_subject_digest text not null check (actor_subject_digest ~ '^[0-9a-f]{64}$'),
  authority_grant_id uuid not null references public.privacy_authority_grants(id) on delete restrict,
  operation_idempotency_key text not null check (operation_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{15,127}$'),
  evidence_digest text not null check (evidence_digest ~ '^[0-9a-f]{64}$'),
  metadata_digest text not null check (metadata_digest ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null,
  receipt_digest text not null unique check (receipt_digest ~ '^[0-9a-f]{64}$'),
  unique (request_id, operation_idempotency_key)
);

create table private.privacy_export_manifest_entries (
  request_id uuid not null references public.privacy_subject_requests(id) on delete restrict,
  ordinal integer not null check (ordinal > 0),
  relation_schema text not null check (relation_schema in ('public', 'private')),
  relation_name text not null check (relation_name ~ '^[a-zA-Z0-9_]{1,128}$'),
  row_count bigint not null check (row_count >= 0),
  content_digest text not null check (content_digest ~ '^[0-9a-f]{64}$'),
  manifest_generation_digest text not null check (manifest_generation_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null,
  primary key (request_id, ordinal),
  unique (request_id, relation_schema, relation_name)
);

create table private.privacy_export_artifacts (
  request_id uuid primary key references public.privacy_subject_requests(id) on delete restrict,
  manifest_digest text not null check (manifest_digest ~ '^[0-9a-f]{64}$'),
  object_key_digest text not null check (object_key_digest ~ '^[0-9a-f]{64}$'),
  archive_digest text not null check (archive_digest ~ '^[0-9a-f]{64}$'),
  archive_bytes bigint not null check (archive_bytes >= 0),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  receipt_digest text not null unique check (receipt_digest ~ '^[0-9a-f]{64}$'),
  check (expires_at > created_at)
);

create table public.privacy_data_inventory (
  relation_schema text not null check (relation_schema in ('public', 'private')),
  relation_name text not null,
  relation_kind text not null check (relation_kind in ('table', 'partitioned_table')),
  scope_columns text[] not null,
  sensitive_candidate_columns text[] not null,
  authority_class text not null check (authority_class in (
    'unresolved_owner_privacy_authority',
    'owner_signed_account_deletion_authority',
    'owner_signed_no_subject_data',
    'synthetic_staging_test_only'
  )),
  scope_column text null,
  disposition text null check (disposition is null or disposition in (
    'delete', 'anonymize', 'legal_retain', 'provider_detach',
    'no_subject_data', 'synthetic_test_only'
  )),
  retention_class text null check (retention_class is null or retention_class in (
    'immediate', 'operational', 'support', 'analytics', 'financial', 'receipt',
    'not_applicable', 'synthetic_test_only'
  )),
  executor_task text null,
  authority_grant_id uuid null references public.privacy_authority_grants(id) on delete restrict,
  classification_snapshot_digest text null check (
    classification_snapshot_digest is null or classification_snapshot_digest ~ '^[0-9a-f]{64}$'
  ),
  inventory_generation_digest text not null check (inventory_generation_digest ~ '^[0-9a-f]{64}$'),
  refreshed_at timestamptz not null,
  primary key (relation_schema, relation_name),
  check (
    (authority_class = 'unresolved_owner_privacy_authority'
      and scope_column is null and disposition is null and retention_class is null
      and executor_task is null and authority_grant_id is null
      and classification_snapshot_digest is null)
    or (authority_class = 'owner_signed_account_deletion_authority'
      and scope_column is not null and disposition in ('delete', 'anonymize', 'legal_retain', 'provider_detach')
      and retention_class in ('immediate', 'operational', 'support', 'analytics', 'financial', 'receipt')
      and executor_task is not null and authority_grant_id is not null
      and classification_snapshot_digest is not null)
    or (authority_class = 'owner_signed_no_subject_data'
      and scope_column is null and disposition = 'no_subject_data'
      and retention_class = 'not_applicable' and executor_task = 'none_required'
      and authority_grant_id is not null and classification_snapshot_digest is not null)
    or (authority_class = 'synthetic_staging_test_only'
      and scope_column is null and disposition = 'synthetic_test_only'
      and retention_class = 'synthetic_test_only' and executor_task = 'synthetic_test_only'
      and authority_grant_id is not null and classification_snapshot_digest is not null)
  )
);

comment on table public.privacy_consent_events is
  'Immutable tenant-fenced consent history bound to exact policy, copy, evidence, candidate, and signed authority digests.';
comment on table public.privacy_subject_request_receipts is
  'Immutable pseudonymous lifecycle receipts. Raw payloads, provider logs, credentials, emails, names, and phone numbers are forbidden.';
comment on table private.privacy_export_manifest_entries is
  'Deterministic private export metadata only. Exported subject data is not stored in this ledger.';
comment on table public.privacy_data_inventory is
  'Catalog-derived inventory of every current public/private table. DSAR, export, delete, worker, and legal-hold execution requires an exact current owner-signed per-relation classification/executor snapshot; unresolved or stale rows fail closed.';

create or replace function private.current_privacy_catalog_identity_v1()
returns table (relation_count integer, inventory_generation_digest text)
language sql
stable
security definer
set search_path = ''
as $$
  with relation_rows as (
    select namespace.nspname as relation_schema,
      class.relname as relation_name,
      case class.relkind when 'p' then 'partitioned_table' else 'table' end as relation_kind,
      coalesce((
        select array_agg(attribute.attname order by attribute.attnum)
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = class.oid and attribute.attnum > 0
          and not attribute.attisdropped
          and attribute.attname in (
            'organization_id', 'workspace_id', 'tenant_id', 'user_id',
            'owner_user_id', 'requested_by_user_id', 'actor_user_id',
            'subject_user_id', 'campaign_id', 'request_id'
          )
      ), '{}'::text[]) as scope_columns,
      coalesce((
        select array_agg(attribute.attname order by attribute.attnum)
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = class.oid and attribute.attnum > 0
          and not attribute.attisdropped
          and attribute.attname ~* '(email|phone|name|address|token|secret|credential|payload|content|message|subject|cookie|authorization|ip_)'
      ), '{}'::text[]) as sensitive_candidate_columns
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname in ('public', 'private')
      and class.relkind in ('r', 'p')
  )
  select count(*)::integer,
    encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
      relation_schema, relation_name, relation_kind,
      array_to_string(scope_columns, ','),
      array_to_string(sensitive_candidate_columns, ',')
    ), E'\n' order by relation_schema, relation_name), ''), 'UTF8'), 'sha256'), 'hex')
  from relation_rows;
$$;

create or replace function private.privacy_inventory_write_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  relation_owner name;
begin
  select pg_catalog.pg_get_userbyid(class.relowner) into relation_owner
  from pg_catalog.pg_class class where class.oid = tg_relid;
  if current_user <> relation_owner
    or current_setting('dealflow.privacy_inventory_write', true) is distinct from 'on' then
    raise exception 'privacy_inventory_owner_rpc_required' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger privacy_inventory_write_guard
before insert or update or delete on public.privacy_data_inventory
for each row execute function private.privacy_inventory_write_guard_v1();

alter table public.privacy_authority_grants enable row level security;
alter table public.privacy_authority_grants force row level security;
alter table public.privacy_consent_events enable row level security;
alter table public.privacy_consent_events force row level security;
alter table public.privacy_consent_current enable row level security;
alter table public.privacy_consent_current force row level security;
alter table public.privacy_subject_requests enable row level security;
alter table public.privacy_subject_requests force row level security;
alter table public.privacy_subject_request_receipts enable row level security;
alter table public.privacy_subject_request_receipts force row level security;
alter table private.privacy_export_manifest_entries enable row level security;
alter table private.privacy_export_manifest_entries force row level security;
alter table private.privacy_export_artifacts enable row level security;
alter table private.privacy_export_artifacts force row level security;
alter table public.privacy_data_inventory enable row level security;
alter table public.privacy_data_inventory force row level security;

revoke all on table public.privacy_authority_grants, public.privacy_consent_events,
  public.privacy_consent_current, public.privacy_subject_requests,
  public.privacy_subject_request_receipts, public.privacy_data_inventory,
  private.privacy_export_manifest_entries, private.privacy_export_artifacts
  from public, anon, authenticated, service_role;

grant select on table public.privacy_consent_events, public.privacy_consent_current,
  public.privacy_subject_requests, public.privacy_subject_request_receipts
  to authenticated;
grant select on table public.privacy_data_inventory to service_role;

create policy privacy_consent_events_subject_select
  on public.privacy_consent_events for select to authenticated
  using (user_id = auth.uid());
create policy privacy_consent_current_subject_select
  on public.privacy_consent_current for select to authenticated
  using (user_id = auth.uid());
create policy privacy_subject_requests_owner_select
  on public.privacy_subject_requests for select to authenticated
  using (requested_by_user_id = auth.uid());
create policy privacy_subject_receipts_owner_select
  on public.privacy_subject_request_receipts for select to authenticated
  using (exists (
    select 1 from public.privacy_subject_requests request
    where request.id = request_id and request.requested_by_user_id = auth.uid()
  ));

create or replace function private.privacy_grant_integrity_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  table_owner name;
  purpose text;
begin
  select pg_get_userbyid(class.relowner) into table_owner
  from pg_class class where class.oid = tg_relid;
  if current_user <> table_owner then
    raise exception 'privacy_grant_database_owner_required' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'privacy_grant_delete_forbidden_use_revocation' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if cardinality(new.allowed_purposes) <> (
      select count(distinct value)::integer from unnest(new.allowed_purposes) value
    ) then
      raise exception 'privacy_grant_purpose_duplicate' using errcode = '22023';
    end if;
    foreach purpose in array new.allowed_purposes loop
      if purpose !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
        raise exception 'privacy_grant_purpose_invalid' using errcode = '22023';
      end if;
    end loop;
    new.grant_digest := encode(extensions.digest(convert_to(concat_ws('|',
      new.id::text, new.environment, new.authority_mode, new.generation::text,
      new.candidate_commit, new.candidate_tree, new.candidate_digest,
      new.authority_packet_digest, new.signature_bundle_digest,
      new.policy_version, new.policy_digest, new.inventory_generation_digest,
      new.inventory_relation_count::text, new.inventory_classification_digest,
      array_to_string(new.allowed_purposes, ','),
      new.consent_maximum_age_days::text, new.dsar_request_expiry_hours::text,
      new.export_artifact_expiry_hours::text, new.legal_retention_authorized::text,
      coalesce(new.legal_authority_ref_digest, ''), new.granted_at::text,
      coalesce(new.expires_at::text, '')
    ), 'UTF8'), 'sha256'), 'hex');
    return new;
  end if;
  if old.status <> 'active'
    or new.status not in ('revoked', 'expired')
    or new.id is distinct from old.id
    or new.environment is distinct from old.environment
    or new.authority_mode is distinct from old.authority_mode
    or new.generation is distinct from old.generation
    or new.candidate_commit is distinct from old.candidate_commit
    or new.candidate_tree is distinct from old.candidate_tree
    or new.candidate_digest is distinct from old.candidate_digest
    or new.authority_packet_digest is distinct from old.authority_packet_digest
    or new.signature_bundle_digest is distinct from old.signature_bundle_digest
    or new.policy_version is distinct from old.policy_version
    or new.policy_digest is distinct from old.policy_digest
    or new.inventory_generation_digest is distinct from old.inventory_generation_digest
    or new.inventory_relation_count is distinct from old.inventory_relation_count
    or new.inventory_classification_digest is distinct from old.inventory_classification_digest
    or new.allowed_purposes is distinct from old.allowed_purposes
    or new.consent_maximum_age_days is distinct from old.consent_maximum_age_days
    or new.dsar_request_expiry_hours is distinct from old.dsar_request_expiry_hours
    or new.export_artifact_expiry_hours is distinct from old.export_artifact_expiry_hours
    or new.legal_retention_authorized is distinct from old.legal_retention_authorized
    or new.legal_authority_ref_digest is distinct from old.legal_authority_ref_digest
    or new.grant_digest is distinct from old.grant_digest
    or new.granted_at is distinct from old.granted_at
    or new.expires_at is distinct from old.expires_at then
    raise exception 'privacy_grant_identity_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger privacy_grant_integrity_guard
before insert or update or delete on public.privacy_authority_grants
for each row execute function private.privacy_grant_integrity_v1();

create or replace function private.privacy_append_only_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'privacy_ledger_immutable' using errcode = '42501';
end;
$$;

create trigger privacy_consent_event_immutable_guard
before update or delete on public.privacy_consent_events
for each row execute function private.privacy_append_only_v1();
create trigger privacy_subject_receipt_immutable_guard
before update or delete on public.privacy_subject_request_receipts
for each row execute function private.privacy_append_only_v1();
create trigger privacy_export_manifest_immutable_guard
before update or delete on private.privacy_export_manifest_entries
for each row execute function private.privacy_append_only_v1();
create trigger privacy_export_artifact_immutable_guard
before update or delete on private.privacy_export_artifacts
for each row execute function private.privacy_append_only_v1();

create or replace function private.privacy_projection_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('dealflow.privacy_projection_write', true) is distinct from 'on' then
    raise exception 'privacy_projection_rpc_required' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger privacy_consent_projection_guard
before insert or update or delete on public.privacy_consent_current
for each row execute function private.privacy_projection_guard_v1();

create or replace function private.resolve_privacy_authority_v1(
  p_environment text,
  p_action text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signature_bundle_digest text,
  p_policy_version text,
  p_policy_digest text
)
returns table (
  grant_id uuid,
  allowed_purposes text[],
  consent_maximum_age_days integer,
  dsar_request_expiry_hours integer,
  export_artifact_expiry_hours integer,
  legal_retention_authorized boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.privacy_authority_grants%rowtype;
  candidate_count integer;
  current_relation_count integer;
  current_inventory_generation_digest text;
  current_classification_digest text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'privacy_service_authority_required' using errcode = '42501';
  end if;
  if p_environment not in ('production', 'staging')
    or p_action not in ('consent', 'dsar', 'export', 'delete', 'worker', 'legal_hold')
    or p_candidate_commit !~ '^[0-9a-f]{40}$'
    or p_candidate_tree !~ '^[0-9a-f]{40}$'
    or p_candidate_digest !~ '^[0-9a-f]{64}$'
    or p_authority_packet_digest !~ '^[0-9a-f]{64}$'
    or p_signature_bundle_digest !~ '^[0-9a-f]{64}$'
    or p_policy_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'privacy_authority_context_invalid' using errcode = '42501';
  end if;
  select count(*)::integer into candidate_count
  from public.privacy_authority_grants grant_row
  where grant_row.environment = p_environment and grant_row.status = 'active'
    and grant_row.candidate_commit = p_candidate_commit
    and grant_row.candidate_tree = p_candidate_tree
    and grant_row.candidate_digest = p_candidate_digest
    and grant_row.authority_packet_digest = p_authority_packet_digest
    and grant_row.signature_bundle_digest = p_signature_bundle_digest
    and grant_row.policy_version = p_policy_version
    and grant_row.policy_digest = p_policy_digest;
  if candidate_count = 0 then
    raise exception 'privacy_authority_grant_not_found' using errcode = '42501';
  end if;
  if candidate_count <> 1 then
    raise exception 'privacy_authority_grant_ambiguous' using errcode = '42501';
  end if;
  select * into strict candidate
  from public.privacy_authority_grants grant_row
  where grant_row.environment = p_environment and grant_row.status = 'active'
    and grant_row.candidate_commit = p_candidate_commit
    and grant_row.candidate_tree = p_candidate_tree
    and grant_row.candidate_digest = p_candidate_digest
    and grant_row.authority_packet_digest = p_authority_packet_digest
    and grant_row.signature_bundle_digest = p_signature_bundle_digest
    and grant_row.policy_version = p_policy_version
    and grant_row.policy_digest = p_policy_digest;
  if candidate.expires_at is not null and candidate.expires_at <= now() then
    raise exception 'privacy_authority_grant_expired' using errcode = '42501';
  end if;
  if p_environment = 'production' and candidate.authority_mode <> 'externally_signed' then
    raise exception 'privacy_production_authority_invalid' using errcode = '42501';
  end if;
  if candidate.authority_mode = 'synthetic_staging' and p_environment <> 'staging' then
    raise exception 'privacy_synthetic_environment_invalid' using errcode = '42501';
  end if;
  -- Consent history can be recorded independently. Every action that reads,
  -- exports, corrects, deletes, retains, or processes subject data requires a
  -- complete exact-current relation snapshot. A grant alone is never enough.
  if p_action <> 'consent' then
    select identity.relation_count, identity.inventory_generation_digest
    into strict current_relation_count, current_inventory_generation_digest
    from private.current_privacy_catalog_identity_v1() identity;
    if candidate.inventory_relation_count <> current_relation_count
      or candidate.inventory_generation_digest <> current_inventory_generation_digest then
      raise exception 'privacy_inventory_generation_mismatch' using errcode = '55000';
    end if;
    if (select count(*) from public.privacy_data_inventory) <> current_relation_count
      or exists (
        select 1 from public.privacy_data_inventory inventory
        where inventory.inventory_generation_digest <> current_inventory_generation_digest
          or inventory.authority_grant_id is distinct from candidate.id
          or inventory.classification_snapshot_digest is distinct from candidate.inventory_classification_digest
          or inventory.authority_class = 'unresolved_owner_privacy_authority'
          or inventory.disposition is null or inventory.retention_class is null
          or inventory.executor_task is null
      )
      or exists (
        select namespace.nspname, class.relname
        from pg_catalog.pg_class class
        join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
        where namespace.nspname in ('public', 'private') and class.relkind in ('r', 'p')
        except
        select inventory.relation_schema, inventory.relation_name
        from public.privacy_data_inventory inventory
      ) then
      raise exception 'privacy_inventory_classification_incomplete' using errcode = '55000';
    end if;
    select encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
      inventory.relation_schema, inventory.relation_name, inventory.authority_class,
      coalesce(inventory.scope_column, ''), inventory.disposition,
      inventory.retention_class, inventory.executor_task
    ), E'\n' order by inventory.relation_schema, inventory.relation_name), ''), 'UTF8'), 'sha256'), 'hex')
    into current_classification_digest
    from public.privacy_data_inventory inventory;
    if current_classification_digest <> candidate.inventory_classification_digest then
      raise exception 'privacy_inventory_classification_digest_mismatch' using errcode = '55000';
    end if;
    if exists (
      select 1 from public.privacy_data_inventory inventory
      left join public.account_deletion_data_inventory executor
        on executor.resource_kind = 'table'
        and executor.relation_schema = inventory.relation_schema
        and executor.relation_name = inventory.relation_name
        and executor.scope_column = inventory.scope_column
        and executor.disposition = inventory.disposition
        and executor.retention_class = inventory.retention_class
        and executor.executor_task = inventory.executor_task
      where inventory.authority_class = 'owner_signed_account_deletion_authority'
        and (
          executor.relation_name is null
          or inventory.executor_task not in (
            'delete_operational_data', 'delete_creative_storage',
            'anonymize_support', 'anonymize_analytics',
            'purge_expired_financial_records'
          )
        )
    ) or exists (
      select 1 from public.privacy_data_inventory inventory
      where inventory.authority_class = 'owner_signed_no_subject_data'
        and cardinality(inventory.scope_columns) <> 0
    ) then
      raise exception 'privacy_inventory_executor_coverage_invalid' using errcode = '55000';
    end if;
    if candidate.authority_mode = 'externally_signed' and exists (
      select 1 from public.privacy_data_inventory inventory
      where inventory.authority_class = 'synthetic_staging_test_only'
    ) then
      raise exception 'privacy_inventory_synthetic_classification_forbidden' using errcode = '55000';
    end if;
  end if;
  if p_action in ('worker', 'legal_hold') and not candidate.legal_retention_authorized then
    raise exception 'privacy_legal_retention_authority_pending' using errcode = '42501';
  end if;
  return query select candidate.id, candidate.allowed_purposes,
    candidate.consent_maximum_age_days, candidate.dsar_request_expiry_hours,
    candidate.export_artifact_expiry_hours, candidate.legal_retention_authorized;
end;
$$;

create or replace function private.assert_privacy_actor_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_require_owner boolean,
  p_assurance_level text,
  p_session_issued_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id is null or p_organization_id is null
    or p_assurance_level is distinct from 'aal2'
    or p_session_issued_at is null
    or p_session_issued_at < now() - interval '10 minutes'
    or p_session_issued_at > now() + interval '30 seconds' then
    raise exception 'privacy_recent_aal2_required' using errcode = '42501';
  end if;
  if p_require_owner then
    if not exists (
      select 1 from public.organizations organization
      where organization.id = p_organization_id
        and organization.owner_user_id = p_actor_user_id
    ) then
      raise exception 'privacy_owner_authority_required' using errcode = '42501';
    end if;
  elsif not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id and organization.owner_user_id = p_actor_user_id
  ) and not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = p_organization_id and membership.user_id = p_actor_user_id
  ) then
    raise exception 'privacy_tenant_membership_required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.record_privacy_consent_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_purpose_key text,
  p_event_type text,
  p_idempotency_key text,
  p_copy_digest text,
  p_evidence_digest text,
  p_assurance_level text,
  p_session_issued_at timestamptz,
  p_environment text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signature_bundle_digest text,
  p_policy_version text,
  p_policy_digest text
)
returns setof public.privacy_consent_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  authority record;
  existing public.privacy_consent_events%rowtype;
  current_projection public.privacy_consent_current%rowtype;
  event_id uuid := gen_random_uuid();
  event_sequence bigint;
  event_at timestamptz := clock_timestamp();
  event_expires_at timestamptz;
  subject_hash text;
  calculated_digest text;
  created public.privacy_consent_events%rowtype;
begin
  select * into strict authority from private.resolve_privacy_authority_v1(
    p_environment, 'consent', p_candidate_commit, p_candidate_tree,
    p_candidate_digest, p_authority_packet_digest, p_signature_bundle_digest,
    p_policy_version, p_policy_digest
  );
  perform private.assert_privacy_actor_v1(
    p_organization_id, p_actor_user_id, false, p_assurance_level, p_session_issued_at
  );
  if p_event_type not in ('grant', 'deny', 'withdraw')
    or p_purpose_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or not (p_purpose_key = any(authority.allowed_purposes))
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{15,127}$'
    or p_copy_digest !~ '^[0-9a-f]{64}$'
    or p_evidence_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'privacy_consent_input_invalid' using errcode = '22023';
  end if;
  -- Serialize the first event as well as later projection updates for the exact
  -- tenant/user/purpose key. Without this lock, two first writers could both
  -- observe an empty projection and choose sequence one.
  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':' || p_actor_user_id::text || ':' || p_purpose_key,
    0
  ));

  select * into existing from public.privacy_consent_events event_row
  where event_row.organization_id = p_organization_id
    and event_row.user_id = p_actor_user_id
    and event_row.idempotency_key = p_idempotency_key;
  if found then
    if existing.purpose_key <> p_purpose_key
      or existing.event_type <> p_event_type
      or existing.policy_version <> p_policy_version
      or existing.policy_digest <> p_policy_digest
      or existing.copy_digest <> p_copy_digest
      or existing.evidence_digest <> p_evidence_digest
      or existing.authority_grant_id <> authority.grant_id then
      raise exception 'privacy_consent_idempotency_collision' using errcode = '23505';
    end if;
    return next existing;
    return;
  end if;

  select * into current_projection
  from public.privacy_consent_current projection
  where projection.organization_id = p_organization_id
    and projection.user_id = p_actor_user_id
    and projection.purpose_key = p_purpose_key
  for update;
  if p_event_type = 'withdraw' and (
    not found or current_projection.state <> 'granted'
    or current_projection.expires_at <= event_at
  ) then
    raise exception 'privacy_consent_withdraw_without_active_grant' using errcode = '55000';
  end if;

  select coalesce(max(event_row.sequence), 0) + 1 into event_sequence
  from public.privacy_consent_events event_row
  where event_row.organization_id = p_organization_id
    and event_row.user_id = p_actor_user_id
    and event_row.purpose_key = p_purpose_key;
  subject_hash := encode(extensions.digest(convert_to(
    p_organization_id::text || ':' || p_actor_user_id::text, 'UTF8'
  ), 'sha256'), 'hex');
  event_expires_at := case when p_event_type = 'grant' then
    event_at + make_interval(days => authority.consent_maximum_age_days) else null end;
  calculated_digest := encode(extensions.digest(convert_to(concat_ws('|',
    event_id::text, p_organization_id::text, p_actor_user_id::text,
    subject_hash, p_purpose_key, p_event_type, event_sequence::text,
    p_idempotency_key, p_policy_version, p_policy_digest, p_copy_digest,
    p_evidence_digest, authority.grant_id::text, p_authority_packet_digest,
    event_at::text, coalesce(event_expires_at::text, '')
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.privacy_consent_events (
    id, organization_id, user_id, subject_digest, purpose_key, event_type,
    sequence, idempotency_key, policy_version, policy_digest, copy_digest,
    evidence_digest, authority_grant_id, authority_packet_digest, occurred_at,
    expires_at, event_digest
  ) values (
    event_id, p_organization_id, p_actor_user_id, subject_hash, p_purpose_key,
    p_event_type, event_sequence, p_idempotency_key, p_policy_version,
    p_policy_digest, p_copy_digest, p_evidence_digest, authority.grant_id,
    p_authority_packet_digest, event_at, event_expires_at, calculated_digest
  ) returning * into created;

  perform set_config('dealflow.privacy_projection_write', 'on', true);
  insert into public.privacy_consent_current (
    organization_id, user_id, subject_digest, purpose_key, state, sequence,
    source_event_id, policy_version, policy_digest, evidence_digest,
    effective_at, expires_at
  ) values (
    p_organization_id, p_actor_user_id, subject_hash, p_purpose_key,
    case p_event_type when 'grant' then 'granted' when 'deny' then 'denied' else 'withdrawn' end,
    event_sequence, event_id, p_policy_version, p_policy_digest,
    p_evidence_digest, event_at, event_expires_at
  ) on conflict (organization_id, user_id, purpose_key) do update set
    subject_digest = excluded.subject_digest,
    state = excluded.state,
    sequence = excluded.sequence,
    source_event_id = excluded.source_event_id,
    policy_version = excluded.policy_version,
    policy_digest = excluded.policy_digest,
    evidence_digest = excluded.evidence_digest,
    effective_at = excluded.effective_at,
    expires_at = excluded.expires_at
  where public.privacy_consent_current.sequence < excluded.sequence;
  perform set_config('dealflow.privacy_projection_write', 'off', true);

  return next created;
end;
$$;

create or replace function private.insert_privacy_request_receipt_v1(
  p_request_id uuid,
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_action_code text,
  p_previous_state text,
  p_next_state text,
  p_operation_idempotency_key text,
  p_authority_grant_id uuid,
  p_evidence_digest text,
  p_metadata_digest text,
  p_occurred_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt_id uuid := gen_random_uuid();
  organization_hash text;
  actor_hash text;
  calculated_digest text;
begin
  if p_action_code !~ '^[a-z0-9][a-z0-9_:-]{2,127}$'
    or p_operation_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{15,127}$'
    or p_evidence_digest !~ '^[0-9a-f]{64}$'
    or p_metadata_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'privacy_receipt_invalid' using errcode = '22023';
  end if;
  organization_hash := encode(extensions.digest(convert_to(p_organization_id::text, 'UTF8'), 'sha256'), 'hex');
  actor_hash := encode(extensions.digest(convert_to(p_actor_user_id::text, 'UTF8'), 'sha256'), 'hex');
  calculated_digest := encode(extensions.digest(convert_to(concat_ws('|',
    receipt_id::text, p_request_id::text, organization_hash, actor_hash,
    p_action_code, coalesce(p_previous_state, ''), p_next_state,
    p_operation_idempotency_key, p_authority_grant_id::text,
    p_evidence_digest, p_metadata_digest, p_occurred_at::text
  ), 'UTF8'), 'sha256'), 'hex');
  insert into public.privacy_subject_request_receipts (
    id, request_id, organization_subject_digest, action_code, previous_state,
    next_state, actor_subject_digest, authority_grant_id,
    operation_idempotency_key, evidence_digest, metadata_digest, occurred_at,
    receipt_digest
  ) values (
    receipt_id, p_request_id, organization_hash, p_action_code,
    p_previous_state, p_next_state, actor_hash, p_authority_grant_id,
    p_operation_idempotency_key, p_evidence_digest, p_metadata_digest,
    p_occurred_at, calculated_digest
  );
  return calculated_digest;
end;
$$;

create or replace function public.create_privacy_subject_request_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_request_type text,
  p_idempotency_key text,
  p_request_payload_digest text,
  p_evidence_digest text,
  p_assurance_level text,
  p_session_issued_at timestamptz,
  p_environment text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signature_bundle_digest text,
  p_policy_version text,
  p_policy_digest text
)
returns setof public.privacy_subject_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  authority record;
  existing public.privacy_subject_requests%rowtype;
  existing_acceptance_receipt public.privacy_subject_request_receipts%rowtype;
  request_id uuid := gen_random_uuid();
  now_at timestamptz := clock_timestamp();
  subject_hash text;
  receipt_hash text;
  created public.privacy_subject_requests%rowtype;
begin
  select * into strict authority from private.resolve_privacy_authority_v1(
    p_environment, 'dsar', p_candidate_commit, p_candidate_tree,
    p_candidate_digest, p_authority_packet_digest, p_signature_bundle_digest,
    p_policy_version, p_policy_digest
  );
  perform private.assert_privacy_actor_v1(
    p_organization_id, p_actor_user_id, true, p_assurance_level, p_session_issued_at
  );
  if p_request_type not in ('access', 'correction', 'export') then
    raise exception 'privacy_request_type_requires_specialized_flow' using errcode = '22023';
  end if;
  if p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{15,127}$'
    or p_request_payload_digest !~ '^[0-9a-f]{64}$'
    or p_evidence_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'privacy_request_input_invalid' using errcode = '22023';
  end if;
  select * into existing from public.privacy_subject_requests request
  where request.organization_id = p_organization_id
    and request.requested_by_user_id = p_actor_user_id
    and request.idempotency_key = p_idempotency_key;
  if found then
    select * into existing_acceptance_receipt
    from public.privacy_subject_request_receipts receipt
    where receipt.request_id = existing.id
      and receipt.operation_idempotency_key = p_idempotency_key;
    if existing.request_type <> p_request_type
      or existing.request_payload_digest <> p_request_payload_digest
      or existing.policy_version <> p_policy_version
      or existing.policy_digest <> p_policy_digest
      or existing.authority_grant_id <> authority.grant_id
      or not found
      or existing_acceptance_receipt.evidence_digest <> p_evidence_digest
      or existing_acceptance_receipt.metadata_digest <> p_request_payload_digest then
      raise exception 'privacy_request_idempotency_collision' using errcode = '23505';
    end if;
    return next existing;
    return;
  end if;
  subject_hash := encode(extensions.digest(convert_to(
    p_organization_id::text || ':' || p_actor_user_id::text, 'UTF8'
  ), 'sha256'), 'hex');
  receipt_hash := repeat('0', 64);
  insert into public.privacy_subject_requests (
    id, organization_id, requested_by_user_id, subject_digest, request_type,
    state, idempotency_key, request_payload_digest, policy_version,
    policy_digest, authority_grant_id, authority_packet_digest, accepted_at,
    expires_at, last_receipt_digest, updated_at
  ) values (
    request_id, p_organization_id, p_actor_user_id, subject_hash, p_request_type,
    'accepted', p_idempotency_key, p_request_payload_digest, p_policy_version,
    p_policy_digest, authority.grant_id, p_authority_packet_digest, now_at,
    now_at + make_interval(hours => authority.dsar_request_expiry_hours),
    receipt_hash, now_at
  ) returning * into created;
  receipt_hash := private.insert_privacy_request_receipt_v1(
    request_id, p_organization_id, p_actor_user_id, 'request_accepted', null,
    'accepted', p_idempotency_key, authority.grant_id, p_evidence_digest,
    p_request_payload_digest, now_at
  );
  update public.privacy_subject_requests request set
    last_receipt_digest = receipt_hash
  where request.id = request_id
  returning * into created;
  return next created;
end;
$$;

create or replace function public.transition_privacy_subject_request_v1(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_next_state text,
  p_action_code text,
  p_operation_idempotency_key text,
  p_evidence_digest text,
  p_metadata_digest text,
  p_assurance_level text,
  p_session_issued_at timestamptz,
  p_environment text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signature_bundle_digest text,
  p_policy_version text,
  p_policy_digest text
)
returns setof public.privacy_subject_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  authority record;
  request_row public.privacy_subject_requests%rowtype;
  prior_receipt public.privacy_subject_request_receipts%rowtype;
  now_at timestamptz := clock_timestamp();
  receipt_hash text;
begin
  select * into strict authority from private.resolve_privacy_authority_v1(
    p_environment, 'dsar', p_candidate_commit, p_candidate_tree,
    p_candidate_digest, p_authority_packet_digest, p_signature_bundle_digest,
    p_policy_version, p_policy_digest
  );
  select * into strict request_row from public.privacy_subject_requests request
  where request.id = p_request_id for update;
  perform private.assert_privacy_actor_v1(
    request_row.organization_id, p_actor_user_id, true,
    p_assurance_level, p_session_issued_at
  );
  if request_row.requested_by_user_id <> p_actor_user_id
    or request_row.policy_version <> p_policy_version
    or request_row.policy_digest <> p_policy_digest
    or request_row.authority_grant_id <> authority.grant_id then
    raise exception 'privacy_request_authority_mismatch' using errcode = '42501';
  end if;
  if p_operation_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{15,127}$'
    or p_action_code !~ '^[a-z0-9][a-z0-9_:-]{2,127}$'
    or p_evidence_digest !~ '^[0-9a-f]{64}$'
    or p_metadata_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'privacy_request_transition_invalid' using errcode = '22023';
  end if;
  select * into prior_receipt from public.privacy_subject_request_receipts receipt
  where receipt.request_id = p_request_id
    and receipt.operation_idempotency_key = p_operation_idempotency_key;
  if found then
    if prior_receipt.next_state <> p_next_state
      or prior_receipt.action_code <> p_action_code
      or prior_receipt.evidence_digest <> p_evidence_digest
      or prior_receipt.metadata_digest <> p_metadata_digest then
      raise exception 'privacy_request_transition_idempotency_collision' using errcode = '23505';
    end if;
    return next request_row;
    return;
  end if;
  if not (
    (request_row.state = 'accepted' and p_next_state in ('in_progress', 'rejected'))
    or (request_row.state = 'in_progress' and p_next_state in ('completed', 'rejected'))
    or (request_row.state in ('accepted', 'in_progress') and p_next_state = 'expired' and request_row.expires_at <= now_at)
  ) then
    raise exception 'privacy_request_transition_not_allowed' using errcode = '55000';
  end if;
  receipt_hash := private.insert_privacy_request_receipt_v1(
    request_row.id, request_row.organization_id, p_actor_user_id,
    p_action_code, request_row.state, p_next_state,
    p_operation_idempotency_key, authority.grant_id, p_evidence_digest,
    p_metadata_digest, now_at
  );
  update public.privacy_subject_requests request set
    state = p_next_state,
    completed_at = case when p_next_state = 'completed' then now_at else null end,
    last_receipt_digest = receipt_hash,
    updated_at = now_at
  where request.id = p_request_id returning * into request_row;
  return next request_row;
end;
$$;

create or replace function public.register_privacy_export_artifact_v1(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_entries jsonb,
  p_object_key_digest text,
  p_archive_digest text,
  p_archive_bytes bigint,
  p_idempotency_key text,
  p_evidence_digest text,
  p_assurance_level text,
  p_session_issued_at timestamptz,
  p_environment text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signature_bundle_digest text,
  p_policy_version text,
  p_policy_digest text
)
returns setof private.privacy_export_artifacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  authority record;
  request_row public.privacy_subject_requests%rowtype;
  existing private.privacy_export_artifacts%rowtype;
  existing_receipt public.privacy_subject_request_receipts%rowtype;
  now_at timestamptz := clock_timestamp();
  manifest_hash text;
  receipt_hash text;
  artifact_receipt_hash text;
  created private.privacy_export_artifacts%rowtype;
begin
  select * into strict authority from private.resolve_privacy_authority_v1(
    p_environment, 'export', p_candidate_commit, p_candidate_tree,
    p_candidate_digest, p_authority_packet_digest, p_signature_bundle_digest,
    p_policy_version, p_policy_digest
  );
  select * into strict request_row from public.privacy_subject_requests request
  where request.id = p_request_id for update;
  perform private.assert_privacy_actor_v1(
    request_row.organization_id, p_actor_user_id, true,
    p_assurance_level, p_session_issued_at
  );
  if request_row.requested_by_user_id <> p_actor_user_id
    or request_row.request_type <> 'export'
    or request_row.state not in ('accepted', 'in_progress', 'completed')
    or request_row.expires_at <= now_at
    or request_row.policy_version <> p_policy_version
    or request_row.policy_digest <> p_policy_digest
    or request_row.authority_grant_id <> authority.grant_id then
    raise exception 'privacy_export_request_invalid' using errcode = '42501';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) not between 1 and 1000
    or exists (
      select 1 from jsonb_array_elements(p_entries) entry
      where jsonb_typeof(entry) <> 'object'
        or (select count(*) from jsonb_object_keys(entry)) <> 4
        or not (entry ?& array['relationSchema', 'relationName', 'rowCount', 'contentDigest'])
        or entry->>'relationSchema' not in ('public', 'private')
        or entry->>'relationName' !~ '^[A-Za-z0-9_]{1,128}$'
        or (entry->>'rowCount') !~ '^[0-9]+$'
        or (entry->>'contentDigest') !~ '^[0-9a-f]{64}$'
    )
    or exists (
      select 1 from jsonb_array_elements(p_entries) entry
      group by entry->>'relationSchema', entry->>'relationName' having count(*) > 1
    )
    or p_object_key_digest !~ '^[0-9a-f]{64}$'
    or p_archive_digest !~ '^[0-9a-f]{64}$'
    or p_archive_bytes < 0
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{15,127}$'
    or p_evidence_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'privacy_export_manifest_invalid' using errcode = '22023';
  end if;
  select encode(extensions.digest(convert_to(string_agg(concat_ws('|',
      entry->>'relationSchema', entry->>'relationName',
      ((entry->>'rowCount')::bigint)::text,
      entry->>'contentDigest'
    ), E'\n' order by entry->>'relationSchema', entry->>'relationName'), 'UTF8'), 'sha256'), 'hex')
  into manifest_hash from jsonb_array_elements(p_entries) entry;

  select * into existing from private.privacy_export_artifacts artifact
  where artifact.request_id = p_request_id;
  if found then
    select * into existing_receipt
    from public.privacy_subject_request_receipts receipt
    where receipt.request_id = p_request_id
      and receipt.action_code = 'export_artifact_registered';
    if existing.manifest_digest <> manifest_hash
      or existing.object_key_digest <> p_object_key_digest
      or existing.archive_digest <> p_archive_digest
      or existing.archive_bytes <> p_archive_bytes
      or not found
      or existing_receipt.operation_idempotency_key <> p_idempotency_key
      or existing_receipt.evidence_digest <> p_evidence_digest
      or existing_receipt.metadata_digest <> manifest_hash then
      raise exception 'privacy_export_artifact_collision' using errcode = '23505';
    end if;
    return next existing;
    return;
  end if;

  insert into private.privacy_export_manifest_entries (
    request_id, ordinal, relation_schema, relation_name, row_count,
    content_digest, manifest_generation_digest, created_at
  ) select p_request_id, row_number() over (
      order by entry->>'relationSchema', entry->>'relationName'
    )::integer,
    entry->>'relationSchema', entry->>'relationName', (entry->>'rowCount')::bigint,
    entry->>'contentDigest', manifest_hash, now_at
  from jsonb_array_elements(p_entries) entry;

  artifact_receipt_hash := encode(extensions.digest(convert_to(concat_ws('|',
    p_request_id::text, manifest_hash, p_object_key_digest, p_archive_digest,
    p_archive_bytes::text, now_at::text,
    (now_at + make_interval(hours => authority.export_artifact_expiry_hours))::text
  ), 'UTF8'), 'sha256'), 'hex');
  insert into private.privacy_export_artifacts (
    request_id, manifest_digest, object_key_digest, archive_digest,
    archive_bytes, created_at, expires_at, receipt_digest
  ) values (
    p_request_id, manifest_hash, p_object_key_digest, p_archive_digest,
    p_archive_bytes, now_at,
    now_at + make_interval(hours => authority.export_artifact_expiry_hours),
    artifact_receipt_hash
  ) returning * into created;
  receipt_hash := private.insert_privacy_request_receipt_v1(
    p_request_id, request_row.organization_id, p_actor_user_id,
    'export_artifact_registered', request_row.state, 'completed',
    p_idempotency_key, authority.grant_id, p_evidence_digest,
    manifest_hash, now_at
  );
  update public.privacy_subject_requests request set
    state = 'completed', completed_at = now_at,
    last_receipt_digest = receipt_hash, updated_at = now_at
  where request.id = p_request_id;
  return next created;
end;
$$;

create or replace function public.create_privacy_delete_request_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_identity_email_hash text,
  p_request_payload_digest text,
  p_evidence_digest text,
  p_assurance_level text,
  p_session_issued_at timestamptz,
  p_environment text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signature_bundle_digest text,
  p_policy_version text,
  p_policy_digest text
)
returns table (
  privacy_request_id uuid,
  account_deletion_request_id uuid,
  confirmation_code text,
  deletion_state text,
  accepted_at timestamptz,
  expires_at timestamptz,
  receipt_digest text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authority record;
  existing public.privacy_subject_requests%rowtype;
  existing_receipt public.privacy_subject_request_receipts%rowtype;
  privacy_row public.privacy_subject_requests%rowtype;
  deletion_row public.account_deletion_requests%rowtype;
  new_request_id uuid := gen_random_uuid();
  now_at timestamptz := clock_timestamp();
  subject_hash text;
  receipt_hash text := repeat('0', 64);
begin
  select * into strict authority from private.resolve_privacy_authority_v1(
    p_environment, 'delete', p_candidate_commit, p_candidate_tree,
    p_candidate_digest, p_authority_packet_digest, p_signature_bundle_digest,
    p_policy_version, p_policy_digest
  );
  perform private.assert_privacy_actor_v1(
    p_organization_id, p_actor_user_id, true,
    p_assurance_level, p_session_issued_at
  );
  if p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{15,127}$'
    or p_identity_email_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_request_payload_digest !~ '^[0-9a-f]{64}$'
    or p_evidence_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'privacy_delete_request_invalid' using errcode = '22023';
  end if;
  select * into existing from public.privacy_subject_requests request
  where request.organization_id = p_organization_id
    and request.requested_by_user_id = p_actor_user_id
    and request.idempotency_key = p_idempotency_key;
  if found then
    select * into existing_receipt
    from public.privacy_subject_request_receipts receipt
    where receipt.request_id = existing.id
      and receipt.operation_idempotency_key = p_idempotency_key;
    if existing.request_type <> 'delete'
      or existing.request_payload_digest <> p_request_payload_digest
      or existing.policy_version <> p_policy_version
      or existing.policy_digest <> p_policy_digest
      or existing.authority_grant_id <> authority.grant_id
      or existing.account_deletion_request_id is null
      or not found
      or existing_receipt.evidence_digest <> p_evidence_digest
      or existing_receipt.metadata_digest <> p_request_payload_digest then
      raise exception 'privacy_delete_idempotency_collision' using errcode = '23505';
    end if;
    select * into strict deletion_row from public.account_deletion_requests request
    where request.id = existing.account_deletion_request_id;
    if deletion_row.identity_email_hash <> p_identity_email_hash then
      raise exception 'privacy_delete_idempotency_collision' using errcode = '23505';
    end if;
    return query select existing.id, deletion_row.id, deletion_row.confirmation_code,
      deletion_row.state, existing.accepted_at, existing.expires_at,
      existing.last_receipt_digest;
    return;
  end if;
  subject_hash := encode(extensions.digest(convert_to(
    p_organization_id::text || ':' || p_actor_user_id::text, 'UTF8'
  ), 'sha256'), 'hex');
  insert into public.privacy_subject_requests (
    id, organization_id, requested_by_user_id, subject_digest, request_type,
    state, idempotency_key, request_payload_digest, policy_version,
    policy_digest, authority_grant_id, authority_packet_digest, accepted_at,
    expires_at, last_receipt_digest, updated_at
  ) values (
    new_request_id, p_organization_id, p_actor_user_id, subject_hash, 'delete',
    'accepted', p_idempotency_key, p_request_payload_digest, p_policy_version,
    p_policy_digest, authority.grant_id, p_authority_packet_digest, now_at,
    now_at + make_interval(hours => authority.dsar_request_expiry_hours),
    receipt_hash, now_at
  ) returning * into privacy_row;

  select * into strict deletion_row from public.create_account_deletion_request_v1(
    p_organization_id, p_actor_user_id, p_idempotency_key, 'aal2',
    p_identity_email_hash
  );
  update public.account_deletion_requests request set
    privacy_subject_request_id = new_request_id
  where request.id = deletion_row.id;
  receipt_hash := private.insert_privacy_request_receipt_v1(
    new_request_id, p_organization_id, p_actor_user_id,
    'delete_scheduled', null, 'in_progress', p_idempotency_key,
    authority.grant_id, p_evidence_digest, p_request_payload_digest, now_at
  );
  update public.privacy_subject_requests request set
    state = 'in_progress', account_deletion_request_id = deletion_row.id,
    last_receipt_digest = receipt_hash, updated_at = now_at
  where request.id = new_request_id returning * into privacy_row;
  return query select privacy_row.id, deletion_row.id,
    deletion_row.confirmation_code, deletion_row.state, privacy_row.accepted_at,
    privacy_row.expires_at, privacy_row.last_receipt_digest;
end;
$$;

create or replace function public.claim_account_deletion_tasks_v2(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer,
  p_environment text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signature_bundle_digest text,
  p_policy_version text,
  p_policy_digest text
)
returns table (
  id uuid, request_id uuid, organization_id uuid, requested_by_user_id uuid,
  task_kind text, attempt_count integer, max_attempts integer,
  claim_token uuid, claim_generation bigint, reconciliation_required boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.resolve_privacy_authority_v1(
    p_environment, 'worker', p_candidate_commit, p_candidate_tree,
    p_candidate_digest, p_authority_packet_digest, p_signature_bundle_digest,
    p_policy_version, p_policy_digest
  );
  return query select * from public.claim_account_deletion_tasks_v1(
    p_worker_id, p_limit, p_lease_seconds
  );
end;
$$;

create or replace function public.manage_account_deletion_legal_hold_v2(
  p_request_id uuid,
  p_action text,
  p_reason_code text,
  p_authority_reference_hash text,
  p_actor_user_id uuid,
  p_assurance_level text,
  p_session_issued_at timestamptz,
  p_environment text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signature_bundle_digest text,
  p_policy_version text,
  p_policy_digest text
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.resolve_privacy_authority_v1(
    p_environment, 'legal_hold', p_candidate_commit, p_candidate_tree,
    p_candidate_digest, p_authority_packet_digest, p_signature_bundle_digest,
    p_policy_version, p_policy_digest
  );
  if p_assurance_level is distinct from 'aal2'
    or p_session_issued_at is null
    or p_session_issued_at < now() - interval '10 minutes'
    or p_session_issued_at > now() + interval '30 seconds' then
    raise exception 'privacy_legal_hold_recent_aal2_required' using errcode = '42501';
  end if;
  return public.manage_account_deletion_legal_hold_v1(
    p_request_id, p_action, p_reason_code,
    p_authority_reference_hash, p_actor_user_id
  );
end;
$$;

-- Remove service-role execution of unbound entry points. The v2 wrappers remain
-- able to call them as their table-owner security definer, but an application
-- caller cannot bypass signed privacy authority.
revoke execute on function public.create_account_deletion_request_v1(uuid,uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke execute on function public.claim_account_deletion_tasks_v1(text,integer,integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.manage_account_deletion_legal_hold_v1(uuid,text,text,text,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.refresh_privacy_data_inventory_v1()
returns table (relation_count integer, inventory_generation_digest text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  generation_hash text;
  catalog_count integer;
  inserted_count integer;
  relation_owner name;
begin
  select pg_catalog.pg_get_userbyid(class.relowner) into relation_owner
  from pg_catalog.pg_class class
  where class.oid = 'public.privacy_data_inventory'::regclass;
  if auth.role() is not null or current_user <> relation_owner then
    raise exception 'privacy_inventory_database_owner_required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dealflow-privacy-catalog-inventory-v1', 0)
  );
  select identity.relation_count, identity.inventory_generation_digest
  into strict catalog_count, generation_hash
  from private.current_privacy_catalog_identity_v1() identity;
  perform pg_catalog.set_config('dealflow.privacy_inventory_write', 'on', true);
  delete from public.privacy_data_inventory;
  insert into public.privacy_data_inventory (
    relation_schema, relation_name, relation_kind, scope_columns,
    sensitive_candidate_columns, authority_class, scope_column, disposition,
    retention_class, executor_task, authority_grant_id,
    classification_snapshot_digest, inventory_generation_digest, refreshed_at
  )
  select namespace.nspname, class.relname,
    case class.relkind when 'p' then 'partitioned_table' else 'table' end,
    coalesce((
      select array_agg(attribute.attname order by attribute.attnum)
      from pg_attribute attribute
      where attribute.attrelid = class.oid and attribute.attnum > 0
        and not attribute.attisdropped
        and attribute.attname in (
          'organization_id', 'workspace_id', 'tenant_id', 'user_id',
          'owner_user_id', 'requested_by_user_id', 'actor_user_id',
          'subject_user_id', 'campaign_id', 'request_id'
        )
    ), '{}'::text[]),
    coalesce((
      select array_agg(attribute.attname order by attribute.attnum)
      from pg_attribute attribute
      where attribute.attrelid = class.oid and attribute.attnum > 0
        and not attribute.attisdropped
        and attribute.attname ~* '(email|phone|name|address|token|secret|credential|payload|content|message|subject|cookie|authorization|ip_)'
    ), '{}'::text[]),
    'unresolved_owner_privacy_authority', null, null, null, null, null, null,
    generation_hash, clock_timestamp()
  from pg_catalog.pg_class class
  join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
  where namespace.nspname in ('public', 'private')
    and class.relkind in ('r', 'p');
  get diagnostics inserted_count = row_count;
  if inserted_count <> catalog_count then
    raise exception 'privacy_inventory_catalog_mismatch' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.privacy_data_inventory inventory
    where inventory.authority_class <> 'unresolved_owner_privacy_authority'
      or inventory.scope_column is not null or inventory.disposition is not null
      or inventory.retention_class is not null or inventory.executor_task is not null
      or inventory.authority_grant_id is not null
      or inventory.classification_snapshot_digest is not null
  ) then
    raise exception 'privacy_inventory_unapproved_classification' using errcode = '55000';
  end if;
  return query select inserted_count, generation_hash;
end;
$$;

create or replace function public.install_privacy_inventory_classifications_v1(
  p_grant_id uuid,
  p_classifications jsonb
)
returns table (
  classified_relation_count integer,
  inventory_generation_digest text,
  inventory_classification_digest text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authority public.privacy_authority_grants%rowtype;
  catalog_count integer;
  catalog_digest text;
  classification_count integer;
  classification_digest text;
  updated_count integer;
  relation_owner name;
begin
  select pg_catalog.pg_get_userbyid(class.relowner) into relation_owner
  from pg_catalog.pg_class class
  where class.oid = 'public.privacy_data_inventory'::regclass;
  if auth.role() is not null or current_user <> relation_owner then
    raise exception 'privacy_inventory_database_owner_required' using errcode = '42501';
  end if;
  if p_grant_id is null or pg_catalog.jsonb_typeof(p_classifications) <> 'array' then
    raise exception 'privacy_inventory_classification_payload_invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dealflow-privacy-classification-install-v1', 0)
  );
  select * into strict authority
  from public.privacy_authority_grants grant_row
  where grant_row.id = p_grant_id and grant_row.status = 'active'
  for update;
  if authority.expires_at is not null and authority.expires_at <= clock_timestamp() then
    raise exception 'privacy_authority_grant_expired' using errcode = '42501';
  end if;

  select refreshed.relation_count, refreshed.inventory_generation_digest
  into strict catalog_count, catalog_digest
  from public.refresh_privacy_data_inventory_v1() refreshed;
  if authority.inventory_relation_count <> catalog_count
    or authority.inventory_generation_digest <> catalog_digest then
    raise exception 'privacy_inventory_generation_mismatch' using errcode = '55000';
  end if;

  select count(*)::integer into classification_count
  from pg_catalog.jsonb_to_recordset(p_classifications) as classification(
    relation_schema text, relation_name text, authority_class text,
    scope_column text, disposition text, retention_class text, executor_task text
  );
  if classification_count <> catalog_count
    or classification_count <> pg_catalog.jsonb_array_length(p_classifications)
    or (select count(distinct (classification.relation_schema, classification.relation_name))
        from pg_catalog.jsonb_to_recordset(p_classifications) as classification(
          relation_schema text, relation_name text, authority_class text,
          scope_column text, disposition text, retention_class text, executor_task text
        )) <> catalog_count
    or exists (
      select inventory.relation_schema, inventory.relation_name
      from public.privacy_data_inventory inventory
      except
      select classification.relation_schema, classification.relation_name
      from pg_catalog.jsonb_to_recordset(p_classifications) as classification(
        relation_schema text, relation_name text, authority_class text,
        scope_column text, disposition text, retention_class text, executor_task text
      )
    )
    or exists (
      select classification.relation_schema, classification.relation_name
      from pg_catalog.jsonb_to_recordset(p_classifications) as classification(
        relation_schema text, relation_name text, authority_class text,
        scope_column text, disposition text, retention_class text, executor_task text
      )
      except
      select inventory.relation_schema, inventory.relation_name
      from public.privacy_data_inventory inventory
    ) then
    raise exception 'privacy_inventory_classification_incomplete' using errcode = '55000';
  end if;

  if authority.authority_mode = 'synthetic_staging' then
    if authority.environment <> 'staging' or exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_classifications) as classification(
        relation_schema text, relation_name text, authority_class text,
        scope_column text, disposition text, retention_class text, executor_task text
      )
      where classification.authority_class is distinct from 'synthetic_staging_test_only'
        or classification.scope_column is not null
        or classification.disposition is distinct from 'synthetic_test_only'
        or classification.retention_class is distinct from 'synthetic_test_only'
        or classification.executor_task is distinct from 'synthetic_test_only'
    ) then
      raise exception 'privacy_inventory_synthetic_classification_invalid' using errcode = '55000';
    end if;
  elsif authority.authority_mode = 'externally_signed' then
    if exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_classifications) as classification(
        relation_schema text, relation_name text, authority_class text,
        scope_column text, disposition text, retention_class text, executor_task text
      )
      left join public.privacy_data_inventory inventory
        on inventory.relation_schema = classification.relation_schema
        and inventory.relation_name = classification.relation_name
      left join public.account_deletion_data_inventory executor
        on executor.resource_kind = 'table'
        and executor.relation_schema = classification.relation_schema
        and executor.relation_name = classification.relation_name
        and executor.scope_column = classification.scope_column
        and executor.disposition = classification.disposition
        and executor.retention_class = classification.retention_class
        and executor.executor_task = classification.executor_task
      where not (
        (classification.authority_class = 'owner_signed_account_deletion_authority'
          and executor.relation_name is not null
          and classification.executor_task in (
            'delete_operational_data', 'delete_creative_storage',
            'anonymize_support', 'anonymize_analytics',
            'purge_expired_financial_records'
          ))
        or (classification.authority_class = 'owner_signed_no_subject_data'
          and cardinality(inventory.scope_columns) = 0
          and classification.scope_column is null
          and classification.disposition = 'no_subject_data'
          and classification.retention_class = 'not_applicable'
          and classification.executor_task = 'none_required')
      )
    ) then
      raise exception 'privacy_inventory_executor_coverage_invalid' using errcode = '55000';
    end if;
  else
    raise exception 'privacy_inventory_authority_mode_invalid' using errcode = '55000';
  end if;

  select encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
    classification.relation_schema, classification.relation_name,
    classification.authority_class, coalesce(classification.scope_column, ''),
    classification.disposition, classification.retention_class,
    classification.executor_task
  ), E'\n' order by classification.relation_schema, classification.relation_name), ''), 'UTF8'), 'sha256'), 'hex')
  into classification_digest
  from pg_catalog.jsonb_to_recordset(p_classifications) as classification(
    relation_schema text, relation_name text, authority_class text,
    scope_column text, disposition text, retention_class text, executor_task text
  );
  if classification_digest <> authority.inventory_classification_digest then
    raise exception 'privacy_inventory_classification_digest_mismatch' using errcode = '55000';
  end if;

  perform pg_catalog.set_config('dealflow.privacy_inventory_write', 'on', true);
  update public.privacy_data_inventory inventory set
    authority_class = classification.authority_class,
    scope_column = classification.scope_column,
    disposition = classification.disposition,
    retention_class = classification.retention_class,
    executor_task = classification.executor_task,
    authority_grant_id = authority.id,
    classification_snapshot_digest = classification_digest
  from pg_catalog.jsonb_to_recordset(p_classifications) as classification(
    relation_schema text, relation_name text, authority_class text,
    scope_column text, disposition text, retention_class text, executor_task text
  )
  where inventory.relation_schema = classification.relation_schema
    and inventory.relation_name = classification.relation_name;
  get diagnostics updated_count = row_count;
  if updated_count <> catalog_count or exists (
    select 1 from public.privacy_data_inventory inventory
    where inventory.authority_grant_id is distinct from authority.id
      or inventory.classification_snapshot_digest is distinct from classification_digest
      or inventory.authority_class = 'unresolved_owner_privacy_authority'
      or inventory.executor_task is null
  ) then
    raise exception 'privacy_inventory_classification_readback_failed' using errcode = '55000';
  end if;
  return query select updated_count, catalog_digest, classification_digest;
end;
$$;

create or replace function public.check_privacy_subject_authority_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_assurance_level text,
  p_session_issued_at timestamptz,
  p_environment text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signature_bundle_digest text,
  p_policy_version text,
  p_policy_digest text
)
returns table (grant_id uuid, authority_action text, policy_version text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authority record;
  database_action text;
begin
  database_action := case
    when p_action = 'consent' then 'consent'
    when p_action in ('access', 'correction', 'export') then 'dsar'
    when p_action = 'delete' then 'delete'
    else null end;
  if database_action is null then
    raise exception 'privacy_subject_action_invalid' using errcode = '22023';
  end if;
  select * into strict authority from private.resolve_privacy_authority_v1(
    p_environment, database_action, p_candidate_commit, p_candidate_tree,
    p_candidate_digest, p_authority_packet_digest, p_signature_bundle_digest,
    p_policy_version, p_policy_digest
  );
  perform private.assert_privacy_actor_v1(
    p_organization_id, p_actor_user_id, p_action <> 'consent',
    p_assurance_level, p_session_issued_at
  );
  return query select authority.grant_id, p_action, p_policy_version;
end;
$$;

revoke all on function private.privacy_grant_integrity_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.privacy_append_only_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.privacy_projection_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.current_privacy_catalog_identity_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.privacy_inventory_write_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.resolve_privacy_authority_v1(text,text,text,text,text,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.assert_privacy_actor_v1(uuid,uuid,boolean,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.insert_privacy_request_receipt_v1(uuid,uuid,uuid,text,text,text,text,uuid,text,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.refresh_privacy_data_inventory_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.install_privacy_inventory_classifications_v1(uuid,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.check_privacy_subject_authority_v1(
  uuid,uuid,text,text,timestamptz,text,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;

revoke all on function public.record_privacy_consent_v1(
  uuid,uuid,text,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;
revoke all on function public.create_privacy_subject_request_v1(
  uuid,uuid,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;
revoke all on function public.transition_privacy_subject_request_v1(
  uuid,uuid,text,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;
revoke all on function public.register_privacy_export_artifact_v1(
  uuid,uuid,jsonb,text,text,bigint,text,text,text,timestamptz,text,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;
revoke all on function public.create_privacy_delete_request_v1(
  uuid,uuid,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;
revoke all on function public.claim_account_deletion_tasks_v2(
  text,integer,integer,text,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;
revoke all on function public.manage_account_deletion_legal_hold_v2(
  uuid,text,text,text,uuid,text,timestamptz,text,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;

grant execute on function public.record_privacy_consent_v1(
  uuid,uuid,text,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,text
) to service_role;
grant execute on function public.create_privacy_subject_request_v1(
  uuid,uuid,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,text
) to service_role;
grant execute on function public.transition_privacy_subject_request_v1(
  uuid,uuid,text,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,text
) to service_role;
grant execute on function public.register_privacy_export_artifact_v1(
  uuid,uuid,jsonb,text,text,bigint,text,text,text,timestamptz,text,text,text,text,text,text,text,text
) to service_role;
grant execute on function public.create_privacy_delete_request_v1(
  uuid,uuid,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,text
) to service_role;
grant execute on function public.claim_account_deletion_tasks_v2(
  text,integer,integer,text,text,text,text,text,text,text,text
) to service_role;
grant execute on function public.manage_account_deletion_legal_hold_v2(
  uuid,text,text,text,uuid,text,timestamptz,text,text,text,text,text,text,text,text
) to service_role;
grant execute on function public.check_privacy_subject_authority_v1(
  uuid,uuid,text,text,timestamptz,text,text,text,text,text,text,text,text
) to service_role;

-- Inventory is generated by the migration owner after every table/function in
-- this migration exists. Future migrations must call the same owner-only
-- refresh after adding relations.
select * from public.refresh_privacy_data_inventory_v1();

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260717050000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
