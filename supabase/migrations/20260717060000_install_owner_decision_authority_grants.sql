-- Detached owner-decision envelopes are verified by the protected release
-- broker before deployment. Only a direct database-owner session may install
-- the resulting immutable candidate/capability projection. PostgREST,
-- service_role, environment variables, and application code cannot grant it.

create table if not exists public.owner_decision_authority_grants (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('production', 'staging')),
  authority_mode text not null check (
    authority_mode in ('externally_signed', 'synthetic_staging')
  ),
  capability text not null check (capability ~ '^[a-z][a-z0-9_.:-]{1,127}$'),
  decision_ids text[] not null check (cardinality(decision_ids) between 1 and 43),
  selected_values jsonb not null check (jsonb_typeof(selected_values) = 'array'),
  selected_values_sha256 text not null check (selected_values_sha256 ~ '^[0-9a-f]{64}$'),
  policy jsonb,
  policy_sha256 text check (policy_sha256 is null or policy_sha256 ~ '^[0-9a-f]{64}$'),
  envelope_id text not null check (envelope_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  envelope_sha256 text not null check (envelope_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature_reference text not null check (
    signature_reference ~ '^ed25519:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}:[0-9a-f]{64}$'
  ),
  authority_id text not null check (authority_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  key_id text not null check (key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  public_key_sha256 text not null check (public_key_sha256 ~ '^[0-9a-f]{64}$'),
  generation bigint not null check (generation > 0),
  revocation_generation bigint not null check (revocation_generation >= 0),
  host_project_id_sha256 text not null check (host_project_id_sha256 ~ '^[0-9a-f]{64}$'),
  candidate_commit text not null check (candidate_commit ~ '^[0-9a-f]{40}$'),
  candidate_tree text not null check (candidate_tree ~ '^[0-9a-f]{40}$'),
  candidate_digest text not null check (candidate_digest ~ '^[0-9a-f]{64}$'),
  tracked_file_count integer not null check (tracked_file_count > 0),
  dependency_lock_sha256 text not null check (dependency_lock_sha256 ~ '^[0-9a-f]{64}$'),
  migration_portfolio_sha256 text not null check (migration_portfolio_sha256 ~ '^[0-9a-f]{64}$'),
  migration_count integer not null check (migration_count > 0),
  template_sha256 text not null check (template_sha256 ~ '^[0-9a-f]{64}$'),
  decision_inventory_sha256 text not null check (decision_inventory_sha256 ~ '^[0-9a-f]{64}$'),
  requirement_inventory_sha256 text not null check (requirement_inventory_sha256 ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz not null,
  expires_at timestamptz not null,
  installed_at timestamptz not null default clock_timestamp(),
  grant_digest text not null unique check (grant_digest ~ '^[0-9a-f]{64}$'),
  constraint owner_decision_authority_time_order check (expires_at > effective_at),
  constraint owner_decision_authority_policy_shape check (
    (policy is null and policy_sha256 is null)
    or (policy is not null and jsonb_typeof(policy) = 'object' and policy_sha256 is not null)
  ),
  constraint owner_decision_authority_signature_payload_binding check (
    signature_reference like '%:' || payload_sha256
  ),
  constraint owner_decision_authority_production_external_only check (
    environment <> 'production' or authority_mode = 'externally_signed'
  ),
  constraint owner_decision_authority_synthetic_staging_only check (
    authority_mode <> 'synthetic_staging'
    or (environment = 'staging' and expires_at <= effective_at + interval '24 hours')
  ),
  constraint owner_decision_authority_unique_projection unique (
    environment, capability, generation
  )
);

create index if not exists owner_decision_authority_runtime_resolution_idx
  on public.owner_decision_authority_grants (
    environment, capability, candidate_commit, candidate_tree,
    candidate_digest, envelope_sha256, generation
  );

create table if not exists public.owner_decision_authority_revocations (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.owner_decision_authority_grants(id) on delete restrict,
  revocation_generation bigint not null check (revocation_generation > 0),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_.:-]{1,127}$'),
  revoked_at timestamptz not null default clock_timestamp(),
  receipt_digest text not null unique check (receipt_digest ~ '^[0-9a-f]{64}$'),
  constraint owner_decision_authority_one_revocation unique (grant_id)
);

alter table public.owner_decision_authority_grants enable row level security;
alter table public.owner_decision_authority_grants force row level security;
alter table public.owner_decision_authority_revocations enable row level security;
alter table public.owner_decision_authority_revocations force row level security;

revoke all on table public.owner_decision_authority_grants
  from public, anon, authenticated, service_role;
revoke all on table public.owner_decision_authority_revocations
  from public, anon, authenticated, service_role;

create or replace function public.owner_decision_authority_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'owner_decision_authority_immutable' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.environment || ':' || new.capability, 0)
  );
  if new.signature_reference is distinct from
    concat('ed25519:', new.authority_id, ':', new.key_id, ':', new.payload_sha256) then
    raise exception 'owner_decision_authority_signature_identity_mismatch' using errcode = '23514';
  end if;
  if new.effective_at > clock_timestamp() + interval '10 minutes'
    or new.expires_at <= clock_timestamp() then
    raise exception 'owner_decision_authority_time_window_invalid' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.owner_decision_authority_grants existing
    where existing.environment = new.environment
      and existing.capability = new.capability
      and existing.generation >= new.generation
  ) then
    raise exception 'owner_decision_authority_generation_downgrade' using errcode = '23514';
  end if;
  if new.revocation_generation < coalesce((
    select max(existing.revocation_generation)
    from public.owner_decision_authority_grants existing
    where existing.environment = new.environment
      and existing.capability = new.capability
  ), 0) then
    raise exception 'owner_decision_authority_revocation_generation_downgrade' using errcode = '23514';
  end if;
  new.grant_digest := encode(extensions.digest(convert_to(concat_ws('|',
    new.id::text, new.environment, new.authority_mode, new.capability,
    array_to_string(new.decision_ids, ','), new.selected_values_sha256,
    coalesce(new.policy_sha256, ''), new.envelope_id, new.envelope_sha256,
    new.payload_sha256, new.signature_reference, new.authority_id, new.key_id,
    new.public_key_sha256, new.generation::text, new.revocation_generation::text,
    new.host_project_id_sha256,
    new.candidate_commit, new.candidate_tree, new.candidate_digest,
    new.tracked_file_count::text, new.dependency_lock_sha256,
    new.migration_portfolio_sha256, new.migration_count::text,
    new.template_sha256, new.decision_inventory_sha256,
    new.requirement_inventory_sha256, new.effective_at::text,
    new.expires_at::text, new.installed_at::text
  ), 'UTF8'), 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists owner_decision_authority_immutable_guard
  on public.owner_decision_authority_grants;
create trigger owner_decision_authority_immutable_guard
before insert or update or delete on public.owner_decision_authority_grants
for each row execute function public.owner_decision_authority_immutable_v1();

create or replace function public.owner_decision_revocation_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  grant_generation bigint;
begin
  if tg_op <> 'INSERT' then
    raise exception 'owner_decision_authority_revocation_immutable' using errcode = '42501';
  end if;
  select grant_row.revocation_generation into strict grant_generation
  from public.owner_decision_authority_grants grant_row where grant_row.id = new.grant_id;
  if new.revocation_generation <= grant_generation then
    raise exception 'owner_decision_authority_revocation_generation_invalid' using errcode = '23514';
  end if;
  new.receipt_digest := encode(extensions.digest(convert_to(concat_ws('|',
    new.id::text, new.grant_id::text, new.revocation_generation::text,
    new.reason_code, new.revoked_at::text
  ), 'UTF8'), 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists owner_decision_revocation_immutable_guard
  on public.owner_decision_authority_revocations;
create trigger owner_decision_revocation_immutable_guard
before insert or update or delete on public.owner_decision_authority_revocations
for each row execute function public.owner_decision_revocation_immutable_v1();

create or replace function public.resolve_owner_decision_authority_v1(
  p_environment text,
  p_capability text,
  p_host_project_id_sha256 text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_tracked_file_count integer,
  p_dependency_lock_sha256 text,
  p_migration_portfolio_sha256 text,
  p_migration_count integer
)
returns table (
  authority_mode text,
  decision_ids text[],
  selected_values jsonb,
  selected_values_sha256 text,
  policy jsonb,
  policy_sha256 text,
  envelope_id text,
  envelope_sha256 text,
  payload_sha256 text,
  signature_reference text,
  authority_id text,
  key_id text,
  public_key_sha256 text,
  generation bigint,
  revocation_generation bigint,
  host_project_id_sha256 text,
  effective_at timestamptz,
  expires_at timestamptz,
  candidate_commit text,
  candidate_tree text,
  candidate_digest text,
  tracked_file_count integer,
  dependency_lock_sha256 text,
  migration_portfolio_sha256 text,
  migration_count integer,
  template_sha256 text,
  decision_inventory_sha256 text,
  requirement_inventory_sha256 text,
  grant_digest text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'owner_decision_authority_service_role_required' using errcode = '42501';
  end if;
  if p_environment not in ('production', 'staging')
    or p_capability !~ '^[a-z][a-z0-9_.:-]{1,127}$'
    or p_host_project_id_sha256 !~ '^[0-9a-f]{64}$'
    or p_candidate_commit !~ '^[0-9a-f]{40}$'
    or p_candidate_tree !~ '^[0-9a-f]{40}$'
    or p_candidate_digest !~ '^[0-9a-f]{64}$'
    or p_tracked_file_count <= 0
    or p_dependency_lock_sha256 !~ '^[0-9a-f]{64}$'
    or p_migration_portfolio_sha256 !~ '^[0-9a-f]{64}$'
    or p_migration_count <= 0 then
    return;
  end if;

  select count(*)::integer into matching_count
  from public.owner_decision_authority_grants grant_row
  where grant_row.environment = p_environment
    and grant_row.capability = p_capability
    and grant_row.host_project_id_sha256 = p_host_project_id_sha256
    and grant_row.candidate_commit = p_candidate_commit
    and grant_row.candidate_tree = p_candidate_tree
    and grant_row.candidate_digest = p_candidate_digest
    and grant_row.tracked_file_count = p_tracked_file_count
    and grant_row.dependency_lock_sha256 = p_dependency_lock_sha256
    and grant_row.migration_portfolio_sha256 = p_migration_portfolio_sha256
    and grant_row.migration_count = p_migration_count
    and grant_row.generation = (
      select max(latest.generation)
      from public.owner_decision_authority_grants latest
      where latest.environment = p_environment
        and latest.capability = p_capability
    )
    and grant_row.effective_at <= clock_timestamp()
    and grant_row.expires_at > clock_timestamp()
    and not exists (
      select 1 from public.owner_decision_authority_revocations revocation
      where revocation.grant_id = grant_row.id
        and revocation.revocation_generation > grant_row.revocation_generation
    );

  if matching_count <> 1 then return; end if;

  return query
  select grant_row.authority_mode, grant_row.decision_ids,
    grant_row.selected_values, grant_row.selected_values_sha256,
    grant_row.policy, grant_row.policy_sha256, grant_row.envelope_id,
    grant_row.envelope_sha256, grant_row.payload_sha256,
    grant_row.signature_reference, grant_row.authority_id, grant_row.key_id,
    grant_row.public_key_sha256, grant_row.generation,
    grant_row.revocation_generation, grant_row.host_project_id_sha256,
    grant_row.effective_at,
    grant_row.expires_at, grant_row.candidate_commit, grant_row.candidate_tree,
    grant_row.candidate_digest, grant_row.tracked_file_count,
    grant_row.dependency_lock_sha256, grant_row.migration_portfolio_sha256,
    grant_row.migration_count, grant_row.template_sha256,
    grant_row.decision_inventory_sha256, grant_row.requirement_inventory_sha256,
    grant_row.grant_digest
  from public.owner_decision_authority_grants grant_row
  where grant_row.environment = p_environment
    and grant_row.capability = p_capability
    and grant_row.host_project_id_sha256 = p_host_project_id_sha256
    and grant_row.candidate_commit = p_candidate_commit
    and grant_row.candidate_tree = p_candidate_tree
    and grant_row.candidate_digest = p_candidate_digest
    and grant_row.tracked_file_count = p_tracked_file_count
    and grant_row.dependency_lock_sha256 = p_dependency_lock_sha256
    and grant_row.migration_portfolio_sha256 = p_migration_portfolio_sha256
    and grant_row.migration_count = p_migration_count
    and grant_row.generation = (
      select max(latest.generation)
      from public.owner_decision_authority_grants latest
      where latest.environment = p_environment
        and latest.capability = p_capability
    )
    and grant_row.effective_at <= clock_timestamp()
    and grant_row.expires_at > clock_timestamp()
    and not exists (
      select 1 from public.owner_decision_authority_revocations revocation
      where revocation.grant_id = grant_row.id
        and revocation.revocation_generation > grant_row.revocation_generation
    );
end;
$$;

revoke all on function public.resolve_owner_decision_authority_v1(
  text, text, text, text, text, text, integer, text, text, integer
) from public, anon, authenticated;
grant execute on function public.resolve_owner_decision_authority_v1(
  text, text, text, text, text, text, integer, text, text, integer
) to service_role;

do $$
begin
  if to_regprocedure('public.refresh_privacy_data_inventory_v1()') is not null then
    perform public.refresh_privacy_data_inventory_v1();
  end if;
end;
$$;

insert into public.app_schema_metadata (key, value, updated_at)
values ('schema_version', '20260717060000', now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
