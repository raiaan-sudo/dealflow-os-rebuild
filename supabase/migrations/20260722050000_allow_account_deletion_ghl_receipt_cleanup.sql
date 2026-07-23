-- GHL Marketplace lifecycle and token receipts are append-only during normal
-- operation, but the approved account-deletion inventory classifies them as
-- tenant-scoped operational data. Permit deletion only while the private
-- account-deletion inventory executor is processing its retention task.

create table if not exists private.account_deletion_ghl_cleanup_context (
  backend_pid integer not null,
  transaction_id text not null,
  organization_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (backend_pid, transaction_id, organization_id)
);

revoke all on table private.account_deletion_ghl_cleanup_context
  from public, anon, authenticated, service_role;

create or replace function private.reject_ghl_marketplace_append_only_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and exists (
      select 1
      from private.account_deletion_ghl_cleanup_context cleanup
      where cleanup.backend_pid = pg_backend_pid()
        and cleanup.transaction_id = pg_current_xact_id()::text
        and cleanup.organization_id = old.organization_id
    ) then
    return old;
  end if;
  raise exception using errcode = '42501', message = 'ghl_marketplace_receipt_is_append_only';
end;
$$;

create or replace function private.execute_account_deletion_inventory_group(
  p_executor_task text,
  p_organization_id uuid,
  p_user_id uuid
)
returns table (deleted_count bigint, remaining_count bigint, blocked_relation_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inventory record;
  affected bigint;
  pass_deleted bigint;
  pass integer;
  cleanup_enabled boolean := p_executor_task = 'delete_operational_data';
begin
  deleted_count := 0;
  blocked_relation_count := 0;
  if cleanup_enabled then
    insert into private.account_deletion_ghl_cleanup_context(
      backend_pid, transaction_id, organization_id
    ) values (
      pg_backend_pid(), pg_current_xact_id()::text, p_organization_id
    ) on conflict do nothing;
    delete from public.ghl_marketplace_location_token_exchanges
    where organization_id = p_organization_id;
    get diagnostics affected = row_count;
    deleted_count := deleted_count + affected;
    delete from public.ghl_marketplace_realtor_user_operations
    where organization_id = p_organization_id;
    get diagnostics affected = row_count;
    deleted_count := deleted_count + affected;
    delete from public.ghl_marketplace_token_events
    where organization_id = p_organization_id;
    get diagnostics affected = row_count;
    deleted_count := deleted_count + affected;
    delete from public.ghl_marketplace_token_sets
    where organization_id = p_organization_id;
    get diagnostics affected = row_count;
    deleted_count := deleted_count + affected;
    delete from public.ghl_marketplace_lifecycle_events
    where organization_id = p_organization_id;
    get diagnostics affected = row_count;
    deleted_count := deleted_count + affected;
    delete from public.ghl_marketplace_oauth_states
    where organization_id = p_organization_id;
    get diagnostics affected = row_count;
    deleted_count := deleted_count + affected;
    delete from public.ghl_marketplace_authorities
    where organization_id = p_organization_id;
    get diagnostics affected = row_count;
    deleted_count := deleted_count + affected;
  end if;
  for pass in 1..8 loop
    pass_deleted := 0;
    for inventory in
      select * from public.account_deletion_data_inventory candidate
      where candidate.resource_kind = 'table'
        and candidate.executor_task = p_executor_task
        and candidate.relation_name not in ('organizations', 'users', 'support_tickets', 'creative_assets')
        and candidate.disposition <> 'anonymize'
      order by candidate.relation_name desc
    loop
      begin
        if inventory.scope_column in ('organization_id', 'workspace_id') then
          execute format('delete from %I.%I where %I = $1',
            inventory.relation_schema, inventory.relation_name, inventory.scope_column)
            using p_organization_id;
        elsif inventory.scope_column in ('user_id', 'owner_id') then
          execute format('delete from %I.%I where %I = $1',
            inventory.relation_schema, inventory.relation_name, inventory.scope_column)
            using p_user_id;
        else
          raise exception using errcode = '42501', message = 'account_deletion_inventory_scope_unsupported';
        end if;
        get diagnostics affected = row_count;
        deleted_count := deleted_count + affected;
        pass_deleted := pass_deleted + affected;
      exception
        when others then
          blocked_relation_count := blocked_relation_count + 1;
      end;
    end loop;
    exit when pass_deleted = 0;
  end loop;

  remaining_count := 0;
  for inventory in
    select * from public.account_deletion_data_inventory candidate
    where candidate.resource_kind = 'table'
      and candidate.executor_task = p_executor_task
      and candidate.relation_name not in ('organizations', 'users', 'support_tickets', 'creative_assets')
      and candidate.disposition <> 'anonymize'
  loop
    remaining_count := remaining_count + private.account_deletion_inventory_row_count(
      inventory.relation_schema, inventory.relation_name, inventory.scope_column,
      p_organization_id, p_user_id
    );
  end loop;
  if cleanup_enabled then
    delete from private.account_deletion_ghl_cleanup_context cleanup
    where cleanup.backend_pid = pg_backend_pid()
      and cleanup.transaction_id = pg_current_xact_id()::text
      and cleanup.organization_id = p_organization_id;
  end if;
  return next;
exception
  when others then
    if cleanup_enabled then
      delete from private.account_deletion_ghl_cleanup_context cleanup
      where cleanup.backend_pid = pg_backend_pid()
        and cleanup.transaction_id = pg_current_xact_id()::text
        and cleanup.organization_id = p_organization_id;
    end if;
    raise;
end;
$$;

revoke all on function private.reject_ghl_marketplace_append_only_mutation_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.execute_account_deletion_inventory_group(text,uuid,uuid)
  from public, anon, authenticated, service_role;

do $dealflow_account_deletion_ghl_cleanup_postconditions$
begin
  if to_regprocedure('private.reject_ghl_marketplace_append_only_mutation_v1()') is null
    or to_regprocedure('private.execute_account_deletion_inventory_group(text,uuid,uuid)') is null then
    raise exception 'account-deletion GHL cleanup authority is incomplete' using errcode = '55000';
  end if;
  if has_function_privilege(
    'service_role',
    'private.execute_account_deletion_inventory_group(text,uuid,uuid)',
    'execute'
  ) then
    raise exception 'private account-deletion inventory executor became directly callable' using errcode = '55000';
  end if;
  if has_table_privilege(
    'service_role',
    'private.account_deletion_ghl_cleanup_context',
    'select,insert,update,delete'
  ) then
    raise exception 'private account-deletion GHL cleanup context became directly accessible' using errcode = '55000';
  end if;
end;
$dealflow_account_deletion_ghl_cleanup_postconditions$;

comment on function private.reject_ghl_marketplace_append_only_mutation_v1() is
  'Keeps GHL Marketplace receipt rows append-only except during the private tenant-scoped account-deletion inventory cleanup transaction.';
