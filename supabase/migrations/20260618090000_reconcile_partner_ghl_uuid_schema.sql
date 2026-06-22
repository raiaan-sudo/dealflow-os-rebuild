-- Reconcile legacy text-keyed Click-to-Scale/GHL tables to UUID partner architecture.
--
-- Preconditions:
-- 1. Run docs/launch-reports/ghl_uuid_migration_preflight_20260618.sql first.
-- 2. Export backups for every table listed in docs/launch-reports/GHL_UUID_MIGRATION_PACKET_20260618.md.
-- 3. Confirm every old text partner id maps to public.partners.slug = replace(old_partner_id, '_', '-').
--
-- Safety:
-- - No external GHL calls.
-- - No provisioning.
-- - No workflow enrollment.
-- - No CRM sync wiring.
-- - public.partner_configs is intentionally left in place for legacy audit compatibility.
-- - Existing ghl_provisioning_jobs.status = 'provisioned' is preserved and allowed.

begin;

lock table public.partners in share row exclusive mode;

create temp table _dealflow_ghl_tables (
  table_name text primary key,
  require_service_role_policy boolean not null default true
) on commit drop;

insert into _dealflow_ghl_tables (table_name, require_service_role_policy)
values
  ('workspace_partner_attribution', false),
  ('partner_ghl_config', true),
  ('workspace_ghl_mapping', true),
  ('lead_crm_sync_events', true),
  ('ghl_provisioning_jobs', true),
  ('ghl_provisioning_events', true),
  ('workspace_ghl_users', true),
  ('partner_ghl_template_config', true),
  ('partner_ghl_workflow_config', true);

do $$
declare
  missing_table text;
begin
  select t.table_name
    into missing_table
  from _dealflow_ghl_tables t
  where to_regclass('public.' || t.table_name) is null
  order by t.table_name
  limit 1;

  if missing_table is not null then
    raise exception 'GHL UUID migration blocked: required table public.% is missing', missing_table;
  end if;
end $$;

create temp table _dealflow_ghl_row_counts_before (
  table_name text primary key,
  row_count bigint not null
) on commit drop;

do $$
declare
  target record;
begin
  for target in select table_name from _dealflow_ghl_tables order by table_name loop
    execute format(
      'insert into _dealflow_ghl_row_counts_before(table_name, row_count) select %L, count(*) from public.%I',
      target.table_name,
      target.table_name
    );
  end loop;
end $$;

alter table public.partner_ghl_config
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.workspace_ghl_mapping
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.ghl_provisioning_jobs
  add column if not exists max_attempts integer not null default 3;

create temp table _dealflow_old_partner_ids (
  old_partner_id text primary key
) on commit drop;

do $$
declare
  target record;
  partner_column_type text;
begin
  for target in select table_name from _dealflow_ghl_tables order by table_name loop
    select format_type(a.atttypid, a.atttypmod)
      into partner_column_type
    from pg_attribute a
    where a.attrelid = to_regclass('public.' || target.table_name)
      and a.attname = 'partner_id'
      and not a.attisdropped;

    if partner_column_type = 'text' then
      execute format(
        'insert into _dealflow_old_partner_ids(old_partner_id)
         select distinct partner_id from public.%I where partner_id is not null
         on conflict (old_partner_id) do nothing',
        target.table_name
      );
    elsif partner_column_type = 'uuid' then
      -- Already reconciled for this table. Keep going.
      null;
    elsif partner_column_type is null then
      raise exception 'GHL UUID migration blocked: public.% has no partner_id column', target.table_name;
    else
      raise exception 'GHL UUID migration blocked: public.% partner_id has unexpected type %', target.table_name, partner_column_type;
    end if;
  end loop;
end $$;

create temp table _dealflow_partner_id_map (
  old_partner_id text primary key,
  -- Temporary tables cannot hold FK constraints to permanent tables in PostgreSQL.
  -- The join below plus explicit unresolved/click-to-scale checks validate the mapping.
  partner_uuid uuid not null,
  partner_slug text not null
) on commit drop;

insert into _dealflow_partner_id_map (old_partner_id, partner_uuid, partner_slug)
select old.old_partner_id,
       partner.id,
       partner.slug
from _dealflow_old_partner_ids old
join public.partners partner
  on partner.slug = replace(old.old_partner_id, '_', '-')
 and partner.deleted_at is null;

do $$
declare
  unresolved text;
begin
  select string_agg(old.old_partner_id, ', ' order by old.old_partner_id)
    into unresolved
  from _dealflow_old_partner_ids old
  left join _dealflow_partner_id_map mapped on mapped.old_partner_id = old.old_partner_id
  where mapped.old_partner_id is null;

  if unresolved is not null then
    raise exception 'GHL UUID migration blocked: unresolved legacy partner ids: %', unresolved;
  end if;

  if exists (select 1 from _dealflow_old_partner_ids where old_partner_id = 'click_to_scale')
     and not exists (
       select 1
       from _dealflow_partner_id_map
       where old_partner_id = 'click_to_scale'
         and partner_uuid = '1b22d077-1f54-4327-ba48-1b1b793488a1'::uuid
     ) then
    raise exception 'GHL UUID migration blocked: click_to_scale did not map to expected Click-to-Scale partner UUID';
  end if;
end $$;

do $$
declare
  duplicate_count bigint;
begin
  select count(*)
    into duplicate_count
  from (
    select mapped.partner_uuid
    from public.partner_ghl_config target_row
    join _dealflow_partner_id_map mapped on mapped.old_partner_id = target_row.partner_id::text
    group by mapped.partner_uuid
    having count(*) > 1
  ) duplicates;
  if duplicate_count > 0 then
    raise exception 'GHL UUID migration blocked: duplicate partner_ghl_config(partner_id) groups after UUID mapping: %', duplicate_count;
  end if;

  select count(*)
    into duplicate_count
  from (
    select target_row.workspace_id, mapped.partner_uuid
    from public.workspace_ghl_mapping target_row
    join _dealflow_partner_id_map mapped on mapped.old_partner_id = target_row.partner_id::text
    group by target_row.workspace_id, mapped.partner_uuid
    having count(*) > 1
  ) duplicates;
  if duplicate_count > 0 then
    raise exception 'GHL UUID migration blocked: duplicate workspace_ghl_mapping(workspace_id, partner_id) groups after UUID mapping: %', duplicate_count;
  end if;

  select count(*)
    into duplicate_count
  from (
    select idempotency_key
    from public.lead_crm_sync_events
    group by idempotency_key
    having count(*) > 1
  ) duplicates;
  if duplicate_count > 0 then
    raise exception 'GHL UUID migration blocked: duplicate lead_crm_sync_events(idempotency_key) groups: %', duplicate_count;
  end if;

  select count(*)
    into duplicate_count
  from (
    select idempotency_key
    from public.ghl_provisioning_jobs
    group by idempotency_key
    having count(*) > 1
  ) duplicates;
  if duplicate_count > 0 then
    raise exception 'GHL UUID migration blocked: duplicate ghl_provisioning_jobs(idempotency_key) groups: %', duplicate_count;
  end if;

  select count(*)
    into duplicate_count
  from (
    select target_row.workspace_id, mapped.partner_uuid, target_row.email
    from public.workspace_ghl_users target_row
    join _dealflow_partner_id_map mapped on mapped.old_partner_id = target_row.partner_id::text
    group by target_row.workspace_id, mapped.partner_uuid, target_row.email
    having count(*) > 1
  ) duplicates;
  if duplicate_count > 0 then
    raise exception 'GHL UUID migration blocked: duplicate workspace_ghl_users(workspace_id, partner_id, email) groups after UUID mapping: %', duplicate_count;
  end if;
end $$;

create or replace function pg_temp._dealflow_drop_partner_id_dependencies(target regclass)
returns void
language plpgsql
as $$
declare
  partner_attnum smallint;
  constraint_record record;
  index_record record;
begin
  select a.attnum
    into partner_attnum
  from pg_attribute a
  where a.attrelid = target
    and a.attname = 'partner_id'
    and not a.attisdropped;

  if partner_attnum is null then
    raise exception 'GHL UUID migration blocked: %.partner_id column not found', target::text;
  end if;

  for constraint_record in
    select con.conname
    from pg_constraint con
    where con.conrelid = target
      and partner_attnum = any(con.conkey)
    order by con.conname
  loop
    execute format('alter table %s drop constraint %I', target, constraint_record.conname);
  end loop;

  for index_record in
    select idx.indexrelid::regclass::text as index_name
    from pg_index idx
    where idx.indrelid = target
      and partner_attnum::text = any(string_to_array(idx.indkey::text, ' '))
      and not exists (
        select 1
        from pg_constraint con
        where con.conindid = idx.indexrelid
      )
    order by idx.indexrelid::regclass::text
  loop
    execute format('drop index if exists %s', index_record.index_name);
  end loop;
end;
$$;

create or replace function pg_temp._dealflow_reconcile_partner_id_column(table_name text)
returns void
language plpgsql
as $$
declare
  target regclass := to_regclass('public.' || table_name);
  partner_column_type text;
  unresolved_count bigint;
begin
  if target is null then
    raise exception 'GHL UUID migration blocked: public.% does not exist', table_name;
  end if;

  select format_type(a.atttypid, a.atttypmod)
    into partner_column_type
  from pg_attribute a
  where a.attrelid = target
    and a.attname = 'partner_id'
    and not a.attisdropped;

  if partner_column_type = 'uuid' then
    return;
  end if;

  if partner_column_type is distinct from 'text' then
    raise exception 'GHL UUID migration blocked: public.% partner_id has unexpected type %', table_name, partner_column_type;
  end if;

  perform pg_temp._dealflow_drop_partner_id_dependencies(target);

  execute format('alter table %s add column if not exists partner_uuid uuid', target);

  execute format(
    'update %s target_row
        set partner_uuid = mapped.partner_uuid
       from _dealflow_partner_id_map mapped
      where target_row.partner_id = mapped.old_partner_id',
    target
  );

  execute format(
    'select count(*) from %s where partner_id is not null and partner_uuid is null',
    target
  ) into unresolved_count;

  if unresolved_count > 0 then
    raise exception 'GHL UUID migration blocked: public.% has % unresolved partner_uuid values after backfill', table_name, unresolved_count;
  end if;

  execute format('alter table %s alter column partner_uuid set not null', target);
  execute format('alter table %s drop column partner_id', target);
  execute format('alter table %s rename column partner_uuid to partner_id', target);
end;
$$;

select pg_temp._dealflow_reconcile_partner_id_column(table_name)
from _dealflow_ghl_tables
order by table_name;

do $$
declare
  target record;
begin
  for target in
    select unnest(array[
      'workspace_partner_attribution',
      'partner_ghl_config',
      'workspace_ghl_mapping',
      'lead_crm_sync_events',
      'ghl_provisioning_jobs',
      'ghl_provisioning_events',
      'workspace_ghl_users',
      'partner_ghl_template_config',
      'partner_ghl_workflow_config'
    ]) as table_name
  loop
    if not exists (
      select 1
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attname = 'partner_id'
       and not att.attisdropped
      where con.conrelid = to_regclass('public.' || target.table_name)
        and con.contype = 'f'
        and con.confrelid = 'public.partners'::regclass
        and att.attnum = any(con.conkey)
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (partner_id) references public.partners(id) on delete cascade',
        target.table_name,
        target.table_name || '_partner_id_fkey'
      );
    end if;
  end loop;
end $$;

alter table public.partner_ghl_config
  drop constraint if exists partner_ghl_config_auth_type_check,
  add constraint partner_ghl_config_auth_type_check check (auth_type in ('private_integration_token', 'oauth'));

alter table public.workspace_ghl_mapping
  drop constraint if exists workspace_ghl_mapping_location_check,
  drop constraint if exists workspace_ghl_mapping_pipeline_check,
  drop constraint if exists workspace_ghl_mapping_stage_check,
  add constraint workspace_ghl_mapping_location_check check (ghl_location_id ~ '^[A-Za-z0-9_-]{3,120}$'),
  add constraint workspace_ghl_mapping_pipeline_check check (ghl_pipeline_id is null or ghl_pipeline_id ~ '^[A-Za-z0-9_-]{3,160}$'),
  add constraint workspace_ghl_mapping_stage_check check (ghl_stage_id is null or ghl_stage_id ~ '^[A-Za-z0-9_-]{3,160}$');

alter table public.lead_crm_sync_events
  drop constraint if exists lead_crm_sync_events_destination_check,
  drop constraint if exists lead_crm_sync_events_status_check,
  add constraint lead_crm_sync_events_destination_check check (destination in ('gohighlevel')),
  add constraint lead_crm_sync_events_status_check check (status in ('queued', 'processing', 'synced', 'failed', 'dead_letter', 'skipped'));

alter table public.ghl_provisioning_jobs
  drop constraint if exists ghl_provisioning_jobs_status_check,
  add constraint ghl_provisioning_jobs_status_check check (status in ('queued', 'processing', 'succeeded', 'provisioned', 'failed', 'dead_letter', 'skipped'));

alter table public.ghl_provisioning_events
  drop constraint if exists ghl_provisioning_events_status_check,
  add constraint ghl_provisioning_events_status_check check (status in ('started', 'succeeded', 'failed', 'skipped'));

alter table public.workspace_ghl_users
  drop constraint if exists workspace_ghl_users_invite_status_check,
  add constraint workspace_ghl_users_invite_status_check check (invite_status in ('not_invited', 'invited', 'active', 'failed', 'deferred', 'pending'));

alter table public.partner_ghl_workflow_config
  drop constraint if exists partner_ghl_workflow_config_trigger_check,
  add constraint partner_ghl_workflow_config_trigger_check check (enrollment_trigger in ('disabled', 'lead_synced', 'manual'));

create index if not exists workspace_partner_attribution_workspace_partner_idx
  on public.workspace_partner_attribution (workspace_id, partner_id);

create unique index if not exists partner_ghl_config_partner_unique
  on public.partner_ghl_config (partner_id);

create unique index if not exists workspace_ghl_mapping_workspace_partner_unique
  on public.workspace_ghl_mapping (workspace_id, partner_id);

create index if not exists workspace_ghl_mapping_partner_idx
  on public.workspace_ghl_mapping (partner_id, sync_enabled);

create unique index if not exists lead_crm_sync_events_idempotency_unique
  on public.lead_crm_sync_events (idempotency_key);

create index if not exists lead_crm_sync_events_workspace_status_idx
  on public.lead_crm_sync_events (workspace_id, status, created_at desc);

create index if not exists lead_crm_sync_events_partner_status_idx
  on public.lead_crm_sync_events (partner_id, status, created_at desc);

create index if not exists lead_crm_sync_events_next_retry_idx
  on public.lead_crm_sync_events (status, next_retry_at)
  where status in ('queued', 'failed');

create unique index if not exists ghl_provisioning_jobs_idempotency_unique
  on public.ghl_provisioning_jobs (idempotency_key);

create index if not exists ghl_provisioning_jobs_workspace_status_idx
  on public.ghl_provisioning_jobs (workspace_id, status, created_at desc);

create index if not exists ghl_provisioning_jobs_partner_status_idx
  on public.ghl_provisioning_jobs (partner_id, status, created_at desc);

create index if not exists ghl_provisioning_events_job_idx
  on public.ghl_provisioning_events (job_id, created_at desc);

create index if not exists ghl_provisioning_events_workspace_idx
  on public.ghl_provisioning_events (workspace_id, created_at desc);

create index if not exists ghl_provisioning_events_partner_idx
  on public.ghl_provisioning_events (partner_id, created_at desc);

create unique index if not exists workspace_ghl_users_workspace_partner_email_unique
  on public.workspace_ghl_users (workspace_id, partner_id, email);

create unique index if not exists partner_ghl_template_config_partner_unique
  on public.partner_ghl_template_config (partner_id);

create unique index if not exists partner_ghl_workflow_config_partner_unique
  on public.partner_ghl_workflow_config (partner_id);

alter table public.workspace_partner_attribution enable row level security;
alter table public.partner_ghl_config enable row level security;
alter table public.workspace_ghl_mapping enable row level security;
alter table public.lead_crm_sync_events enable row level security;
alter table public.ghl_provisioning_jobs enable row level security;
alter table public.ghl_provisioning_events enable row level security;
alter table public.workspace_ghl_users enable row level security;
alter table public.partner_ghl_template_config enable row level security;
alter table public.partner_ghl_workflow_config enable row level security;

alter table public.partner_ghl_config force row level security;
alter table public.workspace_ghl_mapping force row level security;
alter table public.lead_crm_sync_events force row level security;
alter table public.ghl_provisioning_jobs force row level security;
alter table public.ghl_provisioning_events force row level security;
alter table public.workspace_ghl_users force row level security;
alter table public.partner_ghl_template_config force row level security;
alter table public.partner_ghl_workflow_config force row level security;

drop policy if exists partner_ghl_config_service_role_all on public.partner_ghl_config;
create policy partner_ghl_config_service_role_all
  on public.partner_ghl_config
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists workspace_ghl_mapping_service_role_all on public.workspace_ghl_mapping;
create policy workspace_ghl_mapping_service_role_all
  on public.workspace_ghl_mapping
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists lead_crm_sync_events_service_role_all on public.lead_crm_sync_events;
create policy lead_crm_sync_events_service_role_all
  on public.lead_crm_sync_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists ghl_provisioning_jobs_service_role_all on public.ghl_provisioning_jobs;
create policy ghl_provisioning_jobs_service_role_all
  on public.ghl_provisioning_jobs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists ghl_provisioning_events_service_role_all on public.ghl_provisioning_events;
create policy ghl_provisioning_events_service_role_all
  on public.ghl_provisioning_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists workspace_ghl_users_service_role_all on public.workspace_ghl_users;
create policy workspace_ghl_users_service_role_all
  on public.workspace_ghl_users
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists partner_ghl_template_config_service_role_all on public.partner_ghl_template_config;
create policy partner_ghl_template_config_service_role_all
  on public.partner_ghl_template_config
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists partner_ghl_workflow_config_service_role_all on public.partner_ghl_workflow_config;
create policy partner_ghl_workflow_config_service_role_all
  on public.partner_ghl_workflow_config
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

do $$
declare
  target record;
  after_count bigint;
  before_count bigint;
  null_partner_count bigint;
  bad_partner_count bigint;
  partner_column_type text;
begin
  for target in select table_name from _dealflow_ghl_tables order by table_name loop
    execute format('select count(*) from public.%I', target.table_name) into after_count;

    select row_count
      into before_count
    from _dealflow_ghl_row_counts_before
    where table_name = target.table_name;

    if after_count is distinct from before_count then
      raise exception 'GHL UUID migration blocked: public.% row count changed from % to %', target.table_name, before_count, after_count;
    end if;

    select format_type(a.atttypid, a.atttypmod)
      into partner_column_type
    from pg_attribute a
    where a.attrelid = to_regclass('public.' || target.table_name)
      and a.attname = 'partner_id'
      and not a.attisdropped;

    if partner_column_type is distinct from 'uuid' then
      raise exception 'GHL UUID migration blocked: public.% partner_id type is %, expected uuid', target.table_name, partner_column_type;
    end if;

    execute format('select count(*) from public.%I where partner_id is null', target.table_name)
      into null_partner_count;
    if null_partner_count > 0 then
      raise exception 'GHL UUID migration blocked: public.% has % null partner_id values', target.table_name, null_partner_count;
    end if;

    execute format(
      'select count(*)
         from public.%I target_row
         left join public.partners partner on partner.id = target_row.partner_id
        where partner.id is null',
      target.table_name
    ) into bad_partner_count;
    if bad_partner_count > 0 then
      raise exception 'GHL UUID migration blocked: public.% has % partner_id values without public.partners rows', target.table_name, bad_partner_count;
    end if;
  end loop;
end $$;

insert into public.app_schema_metadata (key, value)
values ('ghl_integration_schema_version', '20260618090000')
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());

commit;
