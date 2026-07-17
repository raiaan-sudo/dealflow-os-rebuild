-- Platform administration is a separately authorized security boundary.
-- Email allowlists, application environment variables, ordinary workspace
-- membership, and possession of a service key are never operator grants.

create table if not exists public.platform_operator_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  environment text not null check (environment in ('production', 'staging')),
  operator_role text not null check (
    operator_role in ('viewer', 'operator', 'security_admin', 'break_glass')
  ),
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  generation bigint not null check (generation > 0),
  authority_mode text not null check (
    authority_mode in ('externally_signed', 'synthetic_staging')
  ),
  signed_authority_ref text not null check (length(btrim(signed_authority_ref)) between 1 and 512),
  authority_packet_digest text not null check (authority_packet_digest ~ '^[0-9a-f]{64}$'),
  candidate_commit text not null check (candidate_commit ~ '^[0-9a-f]{40}$'),
  candidate_tree text not null check (candidate_tree ~ '^[0-9a-f]{40}$'),
  candidate_digest text not null check (candidate_digest ~ '^[0-9a-f]{64}$'),
  grant_digest text not null unique check (grant_digest ~ '^[0-9a-f]{64}$'),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revocation_reason_code text,
  constraint platform_operator_grant_generation_unique
    unique (user_id, environment, generation),
  constraint platform_operator_grant_time_order check (
    expires_at is null or expires_at > granted_at
  ),
  constraint platform_operator_grant_revocation_shape check (
    (status = 'revoked' and revoked_at is not null and
      revocation_reason_code is not null and
      length(btrim(revocation_reason_code)) between 1 and 128)
    or (status <> 'revoked' and revoked_at is null and revocation_reason_code is null)
  ),
  constraint platform_operator_break_glass_maximum check (
    operator_role <> 'break_glass'
    or (expires_at is not null and expires_at <= granted_at + interval '60 minutes')
  ),
  constraint platform_operator_synthetic_staging_only check (
    authority_mode <> 'synthetic_staging'
    or (
      environment = 'staging' and expires_at is not null and
      expires_at <= granted_at + interval '24 hours'
    )
  ),
  constraint platform_operator_production_external_only check (
    environment <> 'production' or authority_mode = 'externally_signed'
  )
);

create index if not exists platform_operator_grants_resolution_idx
  on public.platform_operator_grants (
    user_id, environment, status, candidate_commit, candidate_tree,
    candidate_digest, authority_packet_digest
  );

create table if not exists public.platform_operator_access_receipts (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.platform_operator_grants(id) on delete restrict,
  actor_subject_digest text not null check (actor_subject_digest ~ '^[0-9a-f]{64}$'),
  environment text not null check (environment in ('production', 'staging')),
  operator_role text not null check (
    operator_role in ('viewer', 'operator', 'security_admin', 'break_glass')
  ),
  required_action text not null check (
    required_action in (
      'admin:read', 'operations:write', 'security:read', 'security:write',
      'access_keys:revoke', 'platform_grants:manage'
    )
  ),
  grant_generation bigint not null check (grant_generation > 0),
  assurance_level text not null check (assurance_level = 'aal2'),
  session_issued_at timestamptz not null,
  candidate_commit text not null check (candidate_commit ~ '^[0-9a-f]{40}$'),
  candidate_tree text not null check (candidate_tree ~ '^[0-9a-f]{40}$'),
  candidate_digest text not null check (candidate_digest ~ '^[0-9a-f]{64}$'),
  authority_packet_digest text not null check (authority_packet_digest ~ '^[0-9a-f]{64}$'),
  signed_authority_ref_digest text not null check (signed_authority_ref_digest ~ '^[0-9a-f]{64}$'),
  accessed_at timestamptz not null default now(),
  receipt_digest text not null unique check (receipt_digest ~ '^[0-9a-f]{64}$')
);

create index if not exists platform_operator_receipts_grant_time_idx
  on public.platform_operator_access_receipts (grant_id, accessed_at desc);

alter table public.platform_operator_grants enable row level security;
alter table public.platform_operator_grants force row level security;
alter table public.platform_operator_access_receipts enable row level security;
alter table public.platform_operator_access_receipts force row level security;

revoke all on table public.platform_operator_grants
  from public, anon, authenticated, service_role;
revoke all on table public.platform_operator_access_receipts
  from public, anon, authenticated, service_role;

create or replace function public.platform_operator_grant_integrity_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'platform_operator_grant_delete_forbidden_use_revocation' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.grant_digest := encode(extensions.digest(convert_to(concat_ws('|',
      new.id::text, new.user_id::text, new.environment, new.operator_role,
      new.generation::text, new.authority_mode, new.signed_authority_ref,
      new.authority_packet_digest, new.candidate_commit, new.candidate_tree,
      new.candidate_digest, new.granted_at::text, coalesce(new.expires_at::text, '')
    ), 'UTF8'), 'sha256'), 'hex');
    return new;
  end if;

  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.environment is distinct from old.environment
    or new.operator_role is distinct from old.operator_role
    or new.generation is distinct from old.generation
    or new.authority_mode is distinct from old.authority_mode
    or new.signed_authority_ref is distinct from old.signed_authority_ref
    or new.authority_packet_digest is distinct from old.authority_packet_digest
    or new.candidate_commit is distinct from old.candidate_commit
    or new.candidate_tree is distinct from old.candidate_tree
    or new.candidate_digest is distinct from old.candidate_digest
    or new.grant_digest is distinct from old.grant_digest
    or new.granted_at is distinct from old.granted_at
    or new.expires_at is distinct from old.expires_at
    or old.status <> 'active'
    or new.status not in ('revoked', 'expired') then
    raise exception 'platform_operator_grant_identity_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists platform_operator_grant_integrity_guard
  on public.platform_operator_grants;
create trigger platform_operator_grant_integrity_guard
before insert or update or delete on public.platform_operator_grants
for each row execute function public.platform_operator_grant_integrity_v1();

create or replace function public.platform_operator_receipt_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'platform_operator_receipt_immutable' using errcode = '42501';
end;
$$;

drop trigger if exists platform_operator_receipt_immutable_guard
  on public.platform_operator_access_receipts;
create trigger platform_operator_receipt_immutable_guard
before update or delete on public.platform_operator_access_receipts
for each row execute function public.platform_operator_receipt_immutable_v1();

create or replace function public.resolve_platform_operator_grant_v1(
  p_user_id uuid,
  p_environment text,
  p_required_action text,
  p_session_issued_at timestamptz,
  p_assurance_level text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signed_authority_ref text
)
returns table (
  grant_id uuid,
  operator_role text,
  grant_generation bigint,
  authority_mode text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.platform_operator_grants%rowtype;
  candidate_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'platform_operator_service_authority_required' using errcode = '42501';
  end if;
  if p_user_id is null or p_environment not in ('production', 'staging') then
    raise exception 'platform_operator_context_invalid' using errcode = '42501';
  end if;
  if p_required_action not in (
    'admin:read', 'operations:write', 'security:read', 'security:write',
    'access_keys:revoke', 'platform_grants:manage'
  ) then
    raise exception 'platform_operator_action_invalid' using errcode = '42501';
  end if;
  if p_assurance_level is distinct from 'aal2'
    or p_session_issued_at is null
    or p_session_issued_at < now() - interval '10 minutes'
    or p_session_issued_at > now() + interval '30 seconds' then
    raise exception 'platform_operator_recent_aal2_required' using errcode = '42501';
  end if;
  if p_candidate_commit !~ '^[0-9a-f]{40}$'
    or p_candidate_tree !~ '^[0-9a-f]{40}$'
    or p_candidate_digest !~ '^[0-9a-f]{64}$'
    or p_authority_packet_digest !~ '^[0-9a-f]{64}$'
    or length(btrim(p_signed_authority_ref)) not between 1 and 512 then
    raise exception 'platform_operator_candidate_authority_invalid' using errcode = '42501';
  end if;

  select count(*)::integer into candidate_count
  from public.platform_operator_grants grant_row
  where grant_row.user_id = p_user_id
    and grant_row.environment = p_environment
    and grant_row.status = 'active'
    and grant_row.candidate_commit = p_candidate_commit
    and grant_row.candidate_tree = p_candidate_tree
    and grant_row.candidate_digest = p_candidate_digest
    and grant_row.authority_packet_digest = p_authority_packet_digest
    and grant_row.signed_authority_ref = p_signed_authority_ref;

  if candidate_count = 0 then
    raise exception 'platform_operator_grant_not_found' using errcode = '42501';
  end if;
  if candidate_count <> 1 then
    raise exception 'platform_operator_grant_ambiguous' using errcode = '42501';
  end if;

  select * into strict candidate
  from public.platform_operator_grants grant_row
  where grant_row.user_id = p_user_id
    and grant_row.environment = p_environment
    and grant_row.status = 'active'
    and grant_row.candidate_commit = p_candidate_commit
    and grant_row.candidate_tree = p_candidate_tree
    and grant_row.candidate_digest = p_candidate_digest
    and grant_row.authority_packet_digest = p_authority_packet_digest
    and grant_row.signed_authority_ref = p_signed_authority_ref;

  if candidate.expires_at is not null and candidate.expires_at <= now() then
    raise exception 'platform_operator_grant_expired' using errcode = '42501';
  end if;
  if p_environment = 'production' and candidate.authority_mode <> 'externally_signed' then
    raise exception 'platform_operator_production_authority_invalid' using errcode = '42501';
  end if;
  if candidate.authority_mode = 'synthetic_staging' and p_environment <> 'staging' then
    raise exception 'platform_operator_synthetic_environment_invalid' using errcode = '42501';
  end if;
  if not (
    (candidate.operator_role = 'viewer' and p_required_action = 'admin:read')
    or (candidate.operator_role = 'operator' and p_required_action in ('admin:read', 'operations:write'))
    or candidate.operator_role in ('security_admin', 'break_glass')
  ) then
    raise exception 'platform_operator_role_action_denied' using errcode = '42501';
  end if;

  return query select candidate.id, candidate.operator_role,
    candidate.generation, candidate.authority_mode;
end;
$$;

create or replace function public.check_platform_operator_navigation_v1(
  p_user_id uuid,
  p_environment text,
  p_session_issued_at timestamptz,
  p_assurance_level text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signed_authority_ref text
)
returns table (operator_role text, grant_generation bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select resolved.operator_role, resolved.grant_generation
  from public.resolve_platform_operator_grant_v1(
    p_user_id, p_environment, 'admin:read', p_session_issued_at,
    p_assurance_level, p_candidate_commit, p_candidate_tree, p_candidate_digest,
    p_authority_packet_digest, p_signed_authority_ref
  ) resolved;
end;
$$;

create or replace function public.authorize_platform_operator_access_v1(
  p_user_id uuid,
  p_environment text,
  p_required_action text,
  p_session_issued_at timestamptz,
  p_assurance_level text,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signed_authority_ref text
)
returns table (receipt_id uuid, operator_role text, grant_generation bigint, receipt_digest text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved record;
  new_receipt_id uuid := gen_random_uuid();
  new_receipt_digest text;
begin
  select * into strict resolved
  from public.resolve_platform_operator_grant_v1(
    p_user_id, p_environment, p_required_action, p_session_issued_at,
    p_assurance_level, p_candidate_commit, p_candidate_tree, p_candidate_digest,
    p_authority_packet_digest, p_signed_authority_ref
  );
  new_receipt_digest := encode(extensions.digest(convert_to(concat_ws('|',
    new_receipt_id::text, resolved.grant_id::text, p_user_id::text,
    p_environment, resolved.operator_role, p_required_action,
    resolved.grant_generation::text, p_session_issued_at::text,
    p_candidate_commit, p_candidate_tree, p_candidate_digest,
    p_authority_packet_digest, clock_timestamp()::text
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.platform_operator_access_receipts (
    id, grant_id, actor_subject_digest, environment, operator_role,
    required_action, grant_generation, assurance_level, session_issued_at,
    candidate_commit, candidate_tree, candidate_digest,
    authority_packet_digest, signed_authority_ref_digest, receipt_digest
  ) values (
    new_receipt_id, resolved.grant_id,
    encode(extensions.digest(convert_to(p_user_id::text, 'UTF8'), 'sha256'), 'hex'),
    p_environment, resolved.operator_role, p_required_action,
    resolved.grant_generation, 'aal2', p_session_issued_at,
    p_candidate_commit, p_candidate_tree, p_candidate_digest,
    p_authority_packet_digest,
    encode(extensions.digest(convert_to(p_signed_authority_ref, 'UTF8'), 'sha256'), 'hex'),
    new_receipt_digest
  );

  return query select new_receipt_id, resolved.operator_role,
    resolved.grant_generation, new_receipt_digest;
end;
$$;

create or replace function public.install_synthetic_staging_platform_operator_grant_v1(
  p_user_id uuid,
  p_operator_role text,
  p_expires_at timestamptz,
  p_candidate_commit text,
  p_candidate_tree text,
  p_candidate_digest text,
  p_authority_packet_digest text,
  p_signed_authority_ref text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_generation bigint;
  inserted_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'platform_operator_service_authority_required' using errcode = '42501';
  end if;
  if p_operator_role not in ('viewer', 'operator', 'security_admin', 'break_glass')
    or p_expires_at is null or p_expires_at <= now()
    or p_expires_at > now() + interval '24 hours'
    or (p_operator_role = 'break_glass' and p_expires_at > now() + interval '60 minutes') then
    raise exception 'platform_operator_synthetic_grant_invalid' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.platform_operator_grants
    where user_id = p_user_id and environment = 'staging' and status = 'active'
      and authority_mode = 'externally_signed'
  ) then
    raise exception 'platform_operator_synthetic_grant_collision' using errcode = '42501';
  end if;
  update public.platform_operator_grants
  set status = 'revoked', revoked_at = now(),
      revocation_reason_code = 'synthetic_staging_rotation'
  where user_id = p_user_id and environment = 'staging' and status = 'active'
    and authority_mode = 'synthetic_staging';
  select coalesce(max(generation), 0) + 1 into next_generation
  from public.platform_operator_grants
  where user_id = p_user_id and environment = 'staging';
  insert into public.platform_operator_grants (
    user_id, environment, operator_role, generation, authority_mode,
    signed_authority_ref, authority_packet_digest, candidate_commit,
    candidate_tree, candidate_digest, expires_at, grant_digest
  ) values (
    p_user_id, 'staging', p_operator_role, next_generation, 'synthetic_staging',
    p_signed_authority_ref, p_authority_packet_digest, p_candidate_commit,
    p_candidate_tree, p_candidate_digest, p_expires_at, repeat('0', 64)
  ) returning id into inserted_id;
  return inserted_id;
end;
$$;

revoke all on function public.platform_operator_grant_integrity_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.platform_operator_receipt_immutable_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_platform_operator_grant_v1(
  uuid, text, text, timestamptz, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.check_platform_operator_navigation_v1(
  uuid, text, timestamptz, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.authorize_platform_operator_access_v1(
  uuid, text, text, timestamptz, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.install_synthetic_staging_platform_operator_grant_v1(
  uuid, text, timestamptz, text, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.check_platform_operator_navigation_v1(
  uuid, text, timestamptz, text, text, text, text, text, text
) to service_role;
grant execute on function public.authorize_platform_operator_access_v1(
  uuid, text, text, timestamptz, text, text, text, text, text, text
) to service_role;
grant execute on function public.install_synthetic_staging_platform_operator_grant_v1(
  uuid, text, timestamptz, text, text, text, text, text
) to service_role;

comment on table public.platform_operator_grants is
  'Candidate-bound, environment-bound platform operator grants. Email and environment allowlists are not authority.';
comment on table public.platform_operator_access_receipts is
  'Immutable pseudonymous receipts written atomically before every privileged platform-admin read or action.';
comment on function public.authorize_platform_operator_access_v1(
  uuid, text, text, timestamptz, text, text, text, text, text, text
) is 'Requires service mediation, one exact active grant, current AAL2, a session age of at most ten minutes, role/action authority, and writes the immutable receipt before returning.';

insert into public.app_schema_metadata (key, value)
values ('schema_version', '20260717030000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());
