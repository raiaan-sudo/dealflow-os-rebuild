-- Retention policy is owner/legal authority, not application authority.
-- Supabase may grant service_role broad table privileges through default ACLs
-- when a table is created. Remove that inherited authority explicitly and
-- retain only the read access needed to snapshot an approved policy.

revoke all privileges on table public.account_deletion_retention_configuration
  from public, anon, authenticated, service_role;

-- Table-level REVOKE does not remove column-level grants in PostgreSQL. Revoke
-- every column privilege explicitly so a stale UPDATE(column) grant cannot
-- bypass the owner/legal-only table contract.
revoke all privileges (
  singleton,
  grace_days,
  operational_retention_days,
  support_retention_days,
  analytics_retention_days,
  financial_retention_days,
  receipt_retention_days,
  billing_cancellation_mode,
  policy_version,
  approved_authority_hash,
  approved_at
) on table public.account_deletion_retention_configuration
  from public, anon, authenticated, service_role;

grant select on table public.account_deletion_retention_configuration
  to service_role;

comment on table public.account_deletion_retention_configuration is
  'Owner/legal-controlled account-deletion retention policy. Application service_role may read the approved policy but cannot create, change, or delete policy authority.';

do $$
declare
  relation_owner name;
  forbidden_privilege text;
  api_role text;
begin
  select pg_get_userbyid(class.relowner)
  into relation_owner
  from pg_class class
  join pg_namespace namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = 'account_deletion_retention_configuration'
    and class.relkind in ('r', 'p');

  if relation_owner is null then
    raise exception 'account_deletion_retention_configuration_missing';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.account_deletion_retention_configuration',
    'SELECT'
  ) then
    raise exception 'account_deletion_retention_service_role_select_missing';
  end if;

  if has_any_column_privilege(
    'service_role',
    'public.account_deletion_retention_configuration',
    'INSERT,UPDATE,REFERENCES'
  ) then
    raise exception 'account_deletion_retention_service_role_column_write_still_granted';
  end if;

  foreach api_role in array array['anon', 'authenticated'] loop
    if has_any_column_privilege(
      api_role,
      'public.account_deletion_retention_configuration',
      'SELECT,INSERT,UPDATE,REFERENCES'
    ) then
      raise exception 'account_deletion_retention_%_column_privilege_still_granted',
        api_role;
    end if;
  end loop;

  if exists (
    select 1
    from pg_attribute attribute
    cross join lateral aclexplode(attribute.attacl) acl
    where attribute.attrelid = 'public.account_deletion_retention_configuration'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
      and acl.grantee = 0
      and acl.privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')
  ) then
    raise exception 'account_deletion_retention_public_column_write_still_granted';
  end if;

  foreach forbidden_privilege in array array[
    'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ] loop
    if has_table_privilege(
      'service_role',
      'public.account_deletion_retention_configuration',
      forbidden_privilege
    ) then
      raise exception 'account_deletion_retention_service_role_%_still_granted',
        lower(forbidden_privilege);
    end if;
  end loop;

  if not has_table_privilege(
    relation_owner,
    'public.account_deletion_retention_configuration',
    'UPDATE'
  ) then
    raise exception 'account_deletion_retention_owner_update_missing';
  end if;
end;
$$;
