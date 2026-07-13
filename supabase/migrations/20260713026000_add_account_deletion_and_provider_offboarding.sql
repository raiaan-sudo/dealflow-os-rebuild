-- DealFlow verified account deletion, retention, and provider-offboarding lifecycle.

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete restrict,
  requested_by_user_id uuid null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  confirmation_code text not null unique,
  identity_method text not null,
  identity_email_hash text not null,
  subject_hash text not null,
  state text not null default 'identity_confirmed',
  retention_policy jsonb not null,
  requested_at timestamptz not null default timezone('utc', now()),
  scheduled_deletion_at timestamptz not null,
  suspended_at timestamptz null,
  offboarding_completed_at timestamptz null,
  deletion_started_at timestamptz null,
  legal_hold_active boolean not null default false,
  legal_hold_reason_code text null,
  legal_hold_set_at timestamptz null,
  completed_at timestamptz null,
  rejected_at timestamptz null,
  operator_required_at timestamptz null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint account_deletion_idempotency_unique unique (organization_id, requested_by_user_id, idempotency_key),
  constraint account_deletion_confirmation_code_check check (confirmation_code ~ '^[a-f0-9]{32}$'),
  constraint account_deletion_identity_method_check check (identity_method in ('password', 'aal2')),
  constraint account_deletion_identity_email_hash_check check (identity_email_hash ~ '^sha256:[a-f0-9]{64}$'),
  constraint account_deletion_subject_hash_check check (subject_hash ~ '^sha256:[a-f0-9]{64}$'),
  constraint account_deletion_state_check check (state in (
    'identity_confirmed', 'suspending', 'offboarding', 'retention_window',
    'deleting', 'legal_hold', 'operator_required', 'completed', 'rejected'
  )),
  constraint account_deletion_policy_object_check check (
    jsonb_typeof(retention_policy) = 'object'
    and retention_policy ?& array[
      'graceDays', 'operationalRetentionDays', 'supportRetentionDays',
      'analyticsRetentionDays', 'financialRetentionDays', 'receiptRetentionDays',
      'billingCancellationMode'
    ]
  ),
  constraint account_deletion_schedule_check check (scheduled_deletion_at >= requested_at),
  constraint account_deletion_legal_hold_check check (
    (legal_hold_active and legal_hold_reason_code is not null and legal_hold_set_at is not null)
    or (not legal_hold_active and legal_hold_reason_code is null and legal_hold_set_at is null)
  )
);

create unique index if not exists account_deletion_one_active_workspace_idx
  on public.account_deletion_requests (organization_id)
  where state not in ('completed', 'rejected');

create index if not exists account_deletion_public_status_idx
  on public.account_deletion_requests (confirmation_code, updated_at desc);

create table if not exists public.account_deletion_suspensions (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  request_id uuid not null unique references public.account_deletion_requests(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  subject_hash text not null,
  suspended_at timestamptz not null default timezone('utc', now()),
  constraint account_deletion_suspension_subject_hash_check check (subject_hash ~ '^sha256:[a-f0-9]{64}$')
);

create table if not exists public.account_deletion_tasks (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.account_deletion_requests(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  task_kind text not null,
  task_ordinal integer not null,
  phase text not null,
  status text not null default 'queued',
  legal_hold_blocking boolean not null default false,
  available_at timestamptz not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  reconciliation_required boolean not null default false,
  next_attempt_at timestamptz null,
  claimed_by text null,
  claim_token uuid null,
  claim_generation bigint not null default 0,
  claimed_at timestamptz null,
  locked_until timestamptz null,
  last_result_code text null,
  completed_at timestamptz null,
  operator_required_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint account_deletion_task_unique unique (request_id, task_kind),
  constraint account_deletion_task_ordinal_unique unique (request_id, task_ordinal),
  constraint account_deletion_task_kind_check check (task_kind in (
    'suspend_workspace', 'revoke_auth_sessions', 'cancel_stripe_subscription',
    'revoke_meta_permissions', 'disconnect_ghl', 'disable_support_delivery',
    'freeze_analytics', 'delete_creative_storage', 'anonymize_support',
    'anonymize_analytics', 'delete_operational_data', 'anonymize_financial_subjects',
    'purge_expired_financial_records', 'expire_deletion_receipt_details',
    'delete_auth_identity', 'complete_request'
  )),
  constraint account_deletion_task_phase_check check (phase in ('immediate', 'retention', 'final')),
  constraint account_deletion_task_status_check check (status in (
    'queued', 'processing', 'retry', 'reconcile', 'completed', 'operator_required'
  )),
  constraint account_deletion_task_attempt_check check (
    attempt_count >= 0 and max_attempts between 1 and 20 and attempt_count <= max_attempts
  ),
  constraint account_deletion_task_claim_check check (
    (status = 'processing' and claimed_by is not null and claim_token is not null and claimed_at is not null and locked_until is not null)
    or status <> 'processing'
  )
);

create index if not exists account_deletion_task_claim_idx
  on public.account_deletion_tasks (status, available_at, next_attempt_at, task_ordinal)
  where status in ('queued', 'retry', 'reconcile', 'processing');

create table if not exists public.account_deletion_receipts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.account_deletion_requests(id) on delete restrict,
  task_id uuid not null references public.account_deletion_tasks(id) on delete restrict,
  organization_subject_hash text not null,
  task_kind text not null,
  attempt_number integer not null,
  claim_generation bigint not null,
  outcome text not null,
  result_code text not null,
  provider_receipt_id text null,
  receipt_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default timezone('utc', now()),
  details_expires_at timestamptz not null,
  constraint account_deletion_receipt_attempt_unique unique (task_id, claim_generation),
  constraint account_deletion_receipt_subject_hash_check check (organization_subject_hash ~ '^sha256:[a-f0-9]{64}$'),
  constraint account_deletion_receipt_outcome_check check (outcome in ('completed', 'retry', 'reconcile', 'operator_required')),
  constraint account_deletion_receipt_result_code_check check (result_code ~ '^[a-z0-9][a-z0-9_:-]{2,127}$'),
  constraint account_deletion_receipt_provider_id_check check (
    provider_receipt_id is null or provider_receipt_id ~ '^sha256:[a-f0-9]{64}$'
  ),
  constraint account_deletion_receipt_metadata_check check (
    jsonb_typeof(receipt_metadata) = 'object' and octet_length(receipt_metadata::text) <= 8192
  )
);

create table if not exists public.account_deletion_legal_hold_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.account_deletion_requests(id) on delete restrict,
  action text not null check (action in ('set', 'released')),
  reason_code text not null check (reason_code ~ '^[a-z0-9][a-z0-9_:-]{2,127}$'),
  authority_reference_hash text not null check (authority_reference_hash ~ '^sha256:[a-f0-9]{64}$'),
  actor_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.account_deletion_operator_authorities (
  user_id uuid primary key references auth.users(id) on delete restrict,
  can_manage_legal_holds boolean not null default false,
  can_resolve_provider_evidence boolean not null default false,
  active boolean not null default true,
  granted_by_user_id uuid null references auth.users(id) on delete set null,
  granted_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz null,
  constraint account_deletion_operator_authority_active_check check (
    (active and revoked_at is null) or (not active and revoked_at is not null)
  )
);

-- Owner/legal-approved policy authority. Requests snapshot this server-owned
-- row; no API caller can shorten a retention period or change billing mode.
create table if not exists public.account_deletion_retention_configuration (
  singleton boolean primary key default true check (singleton),
  grace_days integer not null check (grace_days between 0 and 30),
  operational_retention_days integer not null check (operational_retention_days between 1 and 365),
  support_retention_days integer not null check (support_retention_days between 1 and 365),
  analytics_retention_days integer not null check (analytics_retention_days between 1 and 365),
  financial_retention_days integer not null check (financial_retention_days between 365 and 3650),
  receipt_retention_days integer not null check (receipt_retention_days between 365 and 3650),
  billing_cancellation_mode text not null check (billing_cancellation_mode in ('immediate', 'period_end')),
  policy_version integer not null check (policy_version > 0),
  approved_authority_hash text null check (
    approved_authority_hash is null or approved_authority_hash ~ '^sha256:[a-f0-9]{64}$'
  ),
  approved_at timestamptz null,
  constraint account_deletion_retention_approval_pair_check check (
    (approved_authority_hash is null and approved_at is null)
    or (approved_authority_hash is not null and approved_at is not null)
  )
);

insert into public.account_deletion_retention_configuration (
  singleton, grace_days, operational_retention_days, support_retention_days,
  analytics_retention_days, financial_retention_days, receipt_retention_days,
  billing_cancellation_mode, policy_version, approved_authority_hash, approved_at
) values (
  true, 7, 30, 30, 30, 2555, 2555, 'period_end', 1,
  null,
  null
) on conflict (singleton) do nothing;

-- Complete schema-derived classification ledger. Every public relation with
-- an organization/workspace/user/owner scope is classified exactly once.
create table if not exists public.account_deletion_data_inventory (
  resource_kind text not null check (resource_kind in ('table', 'storage_bucket')),
  relation_schema text not null,
  relation_name text not null,
  scope_column text not null,
  disposition text not null check (disposition in ('delete', 'anonymize', 'legal_retain', 'provider_detach')),
  retention_class text not null check (retention_class in ('immediate', 'operational', 'support', 'analytics', 'financial', 'receipt')),
  executor_task text not null,
  pii_columns text[] not null default '{}'::text[],
  classified_at timestamptz not null default timezone('utc', now()),
  primary key (resource_kind, relation_schema, relation_name)
);

-- Immutable provenance is the only authority for treating a pre-existing GHL
-- location as customer-connected and therefore non-owned by DealFlow.
create table if not exists public.ghl_location_origin_attestations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  location_mapping_id uuid not null references public.ghl_location_mappings(id) on delete restrict,
  provider_location_id text not null,
  origin text not null check (origin in ('customer_connected', 'dealflow_created', 'partner_created')),
  evidence_reference_hash text not null check (evidence_reference_hash ~ '^sha256:[a-f0-9]{64}$'),
  recorded_by_authority_hash text not null check (recorded_by_authority_hash ~ '^sha256:[a-f0-9]{64}$'),
  recorded_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, location_mapping_id, provider_location_id)
);

comment on table public.account_deletion_requests is
  'Verified workspace deletion state. Customer-visible completion is derived only from settled durable tasks.';
comment on table public.account_deletion_receipts is
  'Append-only sanitized proof. Raw credentials, provider payloads, emails, names, phone numbers, and customer records are forbidden.';
comment on column public.account_deletion_tasks.reconciliation_required is
  'A provider write returned an ambiguous outcome. The next worker must read authoritative provider state before any retry.';

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_requests force row level security;
alter table public.account_deletion_suspensions enable row level security;
alter table public.account_deletion_suspensions force row level security;
alter table public.account_deletion_tasks enable row level security;
alter table public.account_deletion_tasks force row level security;
alter table public.account_deletion_receipts enable row level security;
alter table public.account_deletion_receipts force row level security;
alter table public.account_deletion_legal_hold_events enable row level security;
alter table public.account_deletion_legal_hold_events force row level security;
alter table public.account_deletion_operator_authorities enable row level security;
alter table public.account_deletion_operator_authorities force row level security;
alter table public.account_deletion_retention_configuration enable row level security;
alter table public.account_deletion_retention_configuration force row level security;
alter table public.account_deletion_data_inventory enable row level security;
alter table public.account_deletion_data_inventory force row level security;
alter table public.ghl_location_origin_attestations enable row level security;
alter table public.ghl_location_origin_attestations force row level security;

revoke all on public.account_deletion_requests, public.account_deletion_suspensions,
  public.account_deletion_tasks, public.account_deletion_receipts,
  public.account_deletion_legal_hold_events, public.account_deletion_operator_authorities,
  public.account_deletion_retention_configuration, public.account_deletion_data_inventory,
  public.ghl_location_origin_attestations
  from public, anon, authenticated;
grant select on public.account_deletion_requests, public.account_deletion_tasks,
  public.account_deletion_receipts to authenticated;
grant select, insert, update, delete on public.account_deletion_requests,
  public.account_deletion_suspensions, public.account_deletion_tasks,
  public.account_deletion_receipts, public.account_deletion_legal_hold_events,
  public.account_deletion_operator_authorities to service_role;
grant select on public.account_deletion_retention_configuration,
  public.account_deletion_data_inventory to service_role;
grant select, insert on public.ghl_location_origin_attestations to service_role;

drop policy if exists account_deletion_request_owner_select on public.account_deletion_requests;
create policy account_deletion_request_owner_select
  on public.account_deletion_requests for select to authenticated
  using (requested_by_user_id = auth.uid());
drop policy if exists account_deletion_task_owner_select on public.account_deletion_tasks;
create policy account_deletion_task_owner_select
  on public.account_deletion_tasks for select to authenticated
  using (requested_by_user_id = auth.uid());
drop policy if exists account_deletion_receipt_owner_select on public.account_deletion_receipts;
create policy account_deletion_receipt_owner_select
  on public.account_deletion_receipts for select to authenticated
  using (exists (
    select 1 from public.account_deletion_requests request
    where request.id = account_deletion_receipts.request_id
      and request.requested_by_user_id = auth.uid()
  ));

insert into public.account_deletion_data_inventory (
  resource_kind, relation_schema, relation_name, scope_column, disposition,
  retention_class, executor_task, pii_columns
)
select
  'table', 'public', relation.table_name,
  case
    when relation.table_name = 'organizations' then 'id'
    when relation.table_name = 'users' then 'id'
    when relation.table_name = 'creative_assets' then 'campaign_join'
    when relation.has_organization_id then 'organization_id'
    when relation.has_workspace_id then 'workspace_id'
    when relation.has_user_id then 'user_id'
    else 'owner_id'
  end,
  case
    when relation.table_name in ('organizations', 'users', 'support_tickets') then 'anonymize'
    when relation.table_name in ('stripe_webhook_events', 'ghl_location_origin_attestations')
      or relation.table_name ~ '(billing|credit|payment|invoice|financial|ledger|payout|refund|tax|security|audit)'
      then 'legal_retain'
    when relation.table_name ~ '(marketing_account|integration|installation|mapping|provider|webhook|oauth|token)'
      then 'provider_detach'
    else 'delete'
  end,
  case
    when relation.table_name in ('support_tickets', 'support_notification_outbox') then 'support'
    when relation.table_name ~ '(analytics|insight|recommendation|health_score|journey|performance|targeting|client_error)'
      then 'analytics'
    when relation.table_name in ('stripe_webhook_events', 'ghl_location_origin_attestations')
      or relation.table_name ~ '(billing|credit|payment|invoice|financial|ledger|payout|refund|tax|security|audit)'
      then 'financial'
    else 'operational'
  end,
  case
    when relation.table_name = 'creative_assets' then 'delete_creative_storage'
    when relation.table_name in ('support_tickets', 'support_notification_outbox') then 'anonymize_support'
    when relation.table_name ~ '(analytics|insight|recommendation|health_score|journey|performance|targeting|client_error)'
      then 'anonymize_analytics'
    when relation.table_name in ('stripe_webhook_events', 'ghl_location_origin_attestations')
      or relation.table_name ~ '(billing|credit|payment|invoice|financial|ledger|payout|refund|tax|security|audit)'
      then 'purge_expired_financial_records'
    else 'delete_operational_data'
  end,
  relation.pii_columns
from (
  select
    class.relname as table_name,
    bool_or(attribute.attname = 'organization_id') as has_organization_id,
    bool_or(attribute.attname = 'workspace_id') as has_workspace_id,
    bool_or(attribute.attname = 'user_id') as has_user_id,
    coalesce((
      select array_agg(pii.attname order by pii.attnum)
      from pg_attribute pii
      where pii.attrelid = class.oid and pii.attnum > 0 and not pii.attisdropped
        and pii.attname ~ '(name|email|phone|address|note|answer|body|subject|message|payload|metadata|token|secret|credential|file_path|file_url|error|customer)'
    ), '{}'::text[]) as pii_columns
  from pg_class class
  join pg_namespace namespace on namespace.oid = class.relnamespace
  join pg_attribute attribute on attribute.attrelid = class.oid
    and attribute.attnum > 0 and not attribute.attisdropped
  where namespace.nspname = 'public' and class.relkind in ('r', 'p')
    and class.relname not like 'account_deletion_%'
    and attribute.attname in ('organization_id', 'workspace_id', 'user_id', 'owner_id')
  group by class.oid, class.relname
) relation
on conflict (resource_kind, relation_schema, relation_name) do update set
  scope_column = excluded.scope_column,
  disposition = excluded.disposition,
  retention_class = excluded.retention_class,
  executor_task = excluded.executor_task,
  pii_columns = excluded.pii_columns,
  classified_at = timezone('utc', now());

insert into public.account_deletion_data_inventory (
  resource_kind, relation_schema, relation_name, scope_column, disposition,
  retention_class, executor_task, pii_columns
) values
  ('table', 'public', 'organizations', 'id', 'anonymize', 'operational',
    'delete_operational_data', array['name', 'slug']::text[]),
  ('table', 'public', 'users', 'id', 'anonymize', 'operational',
    'delete_operational_data', array['email', 'full_name', 'avatar_url']::text[])
on conflict (resource_kind, relation_schema, relation_name) do update set
  scope_column = excluded.scope_column,
  disposition = excluded.disposition,
  retention_class = excluded.retention_class,
  executor_task = excluded.executor_task,
  pii_columns = excluded.pii_columns,
  classified_at = timezone('utc', now());

insert into public.account_deletion_data_inventory (
  resource_kind, relation_schema, relation_name, scope_column, disposition,
  retention_class, executor_task, pii_columns
) values (
  'storage_bucket', 'storage', 'creative-assets', 'campaign_join', 'delete',
  'operational', 'delete_creative_storage', array['storage_path']::text[]
) on conflict (resource_kind, relation_schema, relation_name) do update set
  scope_column = excluded.scope_column,
  disposition = excluded.disposition,
  retention_class = excluded.retention_class,
  executor_task = excluded.executor_task,
  pii_columns = excluded.pii_columns,
  classified_at = timezone('utc', now());

do $account_deletion_assert_inventory_coverage$
declare
  missing_count integer;
begin
  select count(*) into missing_count
  from (
    select class.relname
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public' and class.relkind in ('r', 'p')
      and class.relname not like 'account_deletion_%'
      and exists (
        select 1 from pg_attribute attribute
        where attribute.attrelid = class.oid and attribute.attnum > 0
          and not attribute.attisdropped
          and attribute.attname in ('organization_id', 'workspace_id', 'user_id', 'owner_id')
      )
      and not exists (
        select 1 from public.account_deletion_data_inventory inventory
        where inventory.resource_kind = 'table'
          and inventory.relation_schema = 'public'
          and inventory.relation_name = class.relname
      )
  ) missing;
  if missing_count <> 0 then
    raise exception using errcode = '55000', message = 'account_deletion_inventory_incomplete';
  end if;
end;
$account_deletion_assert_inventory_coverage$;

create or replace function private.is_account_deletion_suspended(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_deletion_suspensions suspension
    where suspension.organization_id = p_organization_id
  );
$$;
revoke all on function private.is_account_deletion_suspended(uuid) from public, anon;
grant execute on function private.is_account_deletion_suspended(uuid) to authenticated, service_role;

-- Edge/app access gate. It exposes only a boolean for the authenticated
-- subject and never returns tenant, request, or provider identifiers.
create or replace function public.is_current_account_deletion_suspended_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.role() is distinct from 'authenticated' or auth.uid() is null then true
    else exists (
      select 1
      from public.account_deletion_suspensions suspension
      where suspension.requested_by_user_id = auth.uid()
         or exists (
           select 1 from public.organization_memberships membership
           where membership.organization_id = suspension.organization_id
             and membership.user_id = auth.uid()
         )
         or exists (
           select 1 from public.organizations organization
           where organization.id = suspension.organization_id
             and organization.owner_user_id = auth.uid()
         )
    )
  end;
$$;
revoke all on function public.is_current_account_deletion_suspended_v1() from public, anon;
grant execute on function public.is_current_account_deletion_suspended_v1() to authenticated;

-- Restrictive RLS closes direct authenticated reads and writes even when an
-- older permissive policy contains a direct user-id or owner-id alternative.
do $account_deletion_install_restrictive_policies$
declare
  relation record;
  scope_expression text;
begin
  for relation in
    select distinct namespace.nspname as schema_name, class.relname as table_name,
      exists (
        select 1 from pg_attribute attribute
        where attribute.attrelid = class.oid and attribute.attname = 'organization_id'
          and attribute.attnum > 0 and not attribute.attisdropped
      ) as has_organization_id,
      exists (
        select 1 from pg_attribute attribute
        where attribute.attrelid = class.oid and attribute.attname = 'workspace_id'
          and attribute.attnum > 0 and not attribute.attisdropped
      ) as has_workspace_id
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public' and class.relkind in ('r', 'p')
      and class.relname not like 'account_deletion_%'
      and exists (
        select 1 from pg_attribute attribute
        where attribute.attrelid = class.oid
          and attribute.attname in ('organization_id', 'workspace_id')
          and attribute.attnum > 0 and not attribute.attisdropped
      )
  loop
    scope_expression := case
      when relation.has_organization_id and relation.has_workspace_id
        then 'coalesce(organization_id, workspace_id)'
      when relation.has_organization_id then 'organization_id'
      else 'workspace_id'
    end;
    execute format('drop policy if exists account_deletion_not_suspended on %I.%I', relation.schema_name, relation.table_name);
    execute format(
      'create policy account_deletion_not_suspended on %I.%I as restrictive for all to authenticated using (not private.is_account_deletion_suspended(%s)) with check (not private.is_account_deletion_suspended(%s))',
      relation.schema_name, relation.table_name, scope_expression, scope_expression
    );
  end loop;

  drop policy if exists account_deletion_not_suspended on public.organizations;
  create policy account_deletion_not_suspended on public.organizations
    as restrictive for all to authenticated
    using (not private.is_account_deletion_suspended(organizations.id))
    with check (not private.is_account_deletion_suspended(organizations.id));
end;
$account_deletion_install_restrictive_policies$;

-- A generic write guard also fences service-role jobs and adapters, because
-- service_role bypasses RLS. Only the exact deletion request executor may set
-- the transaction-local bypass, and the trigger verifies its tenant scope.
create or replace function private.reject_suspended_account_deletion_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_payload jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  new_payload jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  old_organization_text text := coalesce(old_payload ->> 'organization_id', old_payload ->> 'workspace_id');
  new_organization_text text := coalesce(new_payload ->> 'organization_id', new_payload ->> 'workspace_id');
  organization_scope uuid;
  bypass_request text := current_setting('dealflow.account_deletion_request_id', true);
  stripe_receipt_safe boolean;
  stripe_projection_safe boolean;
begin
  for organization_scope in
    select distinct candidate.scope_text::uuid
    from unnest(array[old_organization_text, new_organization_text]) candidate(scope_text)
    where candidate.scope_text is not null and candidate.scope_text <> ''
  loop
    if exists (
      select 1 from public.account_deletion_suspensions suspension
      where suspension.organization_id = organization_scope
    ) then
      if exists (
        select 1 from public.account_deletion_requests request
        where request.id::text = bypass_request
          and request.organization_id = organization_scope
          and request.state not in ('completed', 'rejected')
      ) then
        continue;
      end if;

      stripe_receipt_safe := auth.role() = 'service_role'
        and tg_table_schema = 'public' and tg_table_name = 'stripe_webhook_events'
        and coalesce(new_payload ->> 'status', '') in ('processing', 'processed', 'ignored', 'failed')
        and jsonb_typeof(coalesce(new_payload -> 'payload', '{}'::jsonb)) = 'object'
        and octet_length(coalesce(new_payload -> 'payload', '{}'::jsonb)::text) <= 2048
        and not exists (
          select 1 from jsonb_object_keys(coalesce(new_payload -> 'payload', '{}'::jsonb)) key
          where key not in ('api_version', 'created', 'livemode')
        )
        and (
          tg_op = 'INSERT'
          or (
            tg_op = 'UPDATE'
            and old_payload ->> 'organization_id' is not distinct from new_payload ->> 'organization_id'
            and old_payload ->> 'stripe_event_id' is not distinct from new_payload ->> 'stripe_event_id'
            and old_payload ->> 'stripe_event_type' is not distinct from new_payload ->> 'stripe_event_type'
            and old_payload ->> 'stripe_object_id' is not distinct from new_payload ->> 'stripe_object_id'
            and old_payload ->> 'stripe_subscription_id' is not distinct from new_payload ->> 'stripe_subscription_id'
            and old_payload -> 'payload' is not distinct from new_payload -> 'payload'
          )
        );

      stripe_projection_safe := auth.role() = 'service_role'
        and tg_table_schema = 'public' and tg_table_name = 'billing_subscriptions'
        and (
          coalesce(new_payload ->> 'status', '') in (
            'canceled', 'unpaid', 'incomplete_expired', 'paused', 'inactive'
          )
          or coalesce((new_payload ->> 'cancel_at_period_end')::boolean, false)
        )
        and (
          tg_op = 'INSERT'
          or (
            tg_op = 'UPDATE'
            and old_payload ->> 'organization_id' is not distinct from new_payload ->> 'organization_id'
            and old_payload ->> 'stripe_subscription_id' is not distinct from new_payload ->> 'stripe_subscription_id'
          )
        );
      if stripe_receipt_safe or stripe_projection_safe then
        continue;
      end if;

      raise exception using errcode = '42501', message = 'account_deletion_workspace_suspended';
    end if;
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.reject_suspended_account_deletion_write() from public, anon, authenticated;

do $account_deletion_install_write_guards$
declare
  relation record;
begin
  for relation in
    select distinct namespace.nspname as schema_name, class.relname as table_name
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public' and class.relkind in ('r', 'p')
      and class.relname not like 'account_deletion_%'
      and exists (
        select 1 from pg_attribute attribute
        where attribute.attrelid = class.oid
          and attribute.attname in ('organization_id', 'workspace_id')
          and attribute.attnum > 0 and not attribute.attisdropped
      )
  loop
    execute format('drop trigger if exists account_deletion_suspension_write_guard on %I.%I', relation.schema_name, relation.table_name);
    execute format(
      'create trigger account_deletion_suspension_write_guard before insert or update or delete on %I.%I for each row execute function private.reject_suspended_account_deletion_write()',
      relation.schema_name, relation.table_name
    );
  end loop;
end;
$account_deletion_install_write_guards$;

create or replace function private.prevent_account_deletion_receipt_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
    and current_setting('dealflow.account_deletion_receipt_expiry_request_id', true) = old.request_id::text
    and new.id = old.id
    and new.request_id = old.request_id
    and new.task_id = old.task_id
    and new.organization_subject_hash = old.organization_subject_hash
    and new.task_kind = old.task_kind
    and new.attempt_number = old.attempt_number
    and new.claim_generation = old.claim_generation
    and new.outcome = old.outcome
    and new.result_code = old.result_code
    and new.received_at = old.received_at
    and new.details_expires_at = old.details_expires_at
    and new.provider_receipt_id is null
    and new.receipt_metadata = '{"detailsExpired":true}'::jsonb
    and exists (
      select 1 from public.account_deletion_tasks task
      where task.request_id = old.request_id
        and task.task_kind = 'expire_deletion_receipt_details'
        and task.status = 'processing'
    ) then
    return new;
  end if;
  raise exception using errcode = '55000', message = 'account_deletion_receipt_append_only';
end;
$$;
revoke all on function private.prevent_account_deletion_receipt_mutation() from public, anon, authenticated;
drop trigger if exists account_deletion_receipt_append_only on public.account_deletion_receipts;
create trigger account_deletion_receipt_append_only
  before update or delete on public.account_deletion_receipts
  for each row execute function private.prevent_account_deletion_receipt_mutation();

create or replace function private.prevent_ghl_location_origin_attestation_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE'
    and exists (
      select 1
      from public.account_deletion_requests request
      join public.account_deletion_tasks task on task.request_id = request.id
      where request.id::text = current_setting('dealflow.account_deletion_request_id', true)
        and request.organization_id = old.organization_id
        and task.task_kind = 'purge_expired_financial_records'
        and task.status = 'processing'
        and task.available_at <= timezone('utc', now())
    ) then
    return old;
  end if;
  raise exception using errcode = '55000', message = 'ghl_location_origin_attestation_immutable';
end;
$$;
revoke all on function private.prevent_ghl_location_origin_attestation_mutation()
  from public, anon, authenticated;
drop trigger if exists ghl_location_origin_attestation_immutable
  on public.ghl_location_origin_attestations;
create trigger ghl_location_origin_attestation_immutable
  before update or delete on public.ghl_location_origin_attestations
  for each row execute function private.prevent_ghl_location_origin_attestation_mutation();

create or replace function public.create_account_deletion_request_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_identity_method text,
  p_identity_email_hash text
)
returns setof public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing public.account_deletion_requests%rowtype;
  created public.account_deletion_requests%rowtype;
  policy public.account_deletion_retention_configuration%rowtype;
  policy_snapshot jsonb;
  now_at timestamptz := timezone('utc', now());
  grace_days integer;
  operational_days integer;
  support_days integer;
  analytics_days integer;
  financial_days integer;
  receipt_days integer;
  final_days integer;
  subject_digest text;
begin
  if auth.role() is distinct from 'service_role' or p_actor_user_id is null then
    raise exception using errcode = '42501', message = 'account_deletion_service_role_required';
  end if;
  if not exists (
    select 1 from public.organizations organization
    where organization.id = p_organization_id and organization.owner_user_id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'account_deletion_owner_authority_required';
  end if;
  if exists (
    select 1 from public.organizations organization
    where organization.owner_user_id = p_actor_user_id
      and organization.id <> p_organization_id
  ) or exists (
    select 1 from public.organization_memberships membership
    where membership.user_id = p_actor_user_id
      and membership.organization_id <> p_organization_id
  ) then
    raise exception using errcode = '55000', message = 'account_deletion_actor_shared_workspace_scope';
  end if;
  if p_identity_method not in ('password', 'aal2')
    or p_identity_email_hash !~ '^sha256:[a-f0-9]{64}$'
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{15,127}$' then
    raise exception using errcode = '22023', message = 'account_deletion_request_invalid';
  end if;

  select * into strict policy
  from public.account_deletion_retention_configuration configuration
  where configuration.singleton for share;
  if policy.approved_authority_hash is null or policy.approved_at is null then
    raise exception using
      errcode = '55000',
      message = 'account_deletion_retention_authority_pending';
  end if;
  grace_days := policy.grace_days;
  operational_days := policy.operational_retention_days;
  support_days := policy.support_retention_days;
  analytics_days := policy.analytics_retention_days;
  financial_days := policy.financial_retention_days;
  receipt_days := policy.receipt_retention_days;
  final_days := greatest(
    grace_days, operational_days, support_days, analytics_days,
    financial_days, receipt_days
  );
  policy_snapshot := jsonb_build_object(
    'graceDays', grace_days,
    'operationalRetentionDays', operational_days,
    'supportRetentionDays', support_days,
    'analyticsRetentionDays', analytics_days,
    'financialRetentionDays', financial_days,
    'receiptRetentionDays', receipt_days,
    'billingCancellationMode', policy.billing_cancellation_mode,
    'policyVersion', policy.policy_version,
    'approvedAuthorityHash', policy.approved_authority_hash
  );
  subject_digest := 'sha256:' || encode(extensions.digest(
    p_organization_id::text || ':' || p_actor_user_id::text, 'sha256'
  ), 'hex');

  select * into existing from public.account_deletion_requests request
  where request.organization_id = p_organization_id
    and request.requested_by_user_id = p_actor_user_id
    and request.idempotency_key = p_idempotency_key;
  if found then return next existing; return; end if;

  if exists (
    select 1 from public.account_deletion_requests request
    where request.organization_id = p_organization_id and request.state not in ('completed', 'rejected')
  ) then
    raise exception using errcode = '23505', message = 'account_deletion_request_already_active';
  end if;

  insert into public.account_deletion_requests (
    organization_id, requested_by_user_id, idempotency_key, confirmation_code,
    identity_method, identity_email_hash, subject_hash, state, retention_policy,
    requested_at, scheduled_deletion_at, updated_at
  ) values (
    p_organization_id, p_actor_user_id, p_idempotency_key, encode(extensions.gen_random_bytes(16), 'hex'),
    p_identity_method, p_identity_email_hash, subject_digest, 'suspending', policy_snapshot,
    now_at, now_at + make_interval(days => final_days), now_at
  ) returning * into created;

  insert into public.account_deletion_suspensions (
    organization_id, request_id, requested_by_user_id, subject_hash, suspended_at
  ) values (p_organization_id, created.id, p_actor_user_id, subject_digest, now_at);

  insert into public.account_deletion_tasks (
    request_id, organization_id, requested_by_user_id, task_kind, task_ordinal,
    phase, legal_hold_blocking, available_at, max_attempts
  )
  select created.id, p_organization_id, p_actor_user_id, plan.kind, plan.ordinal, plan.phase,
    plan.hold_blocking,
    case plan.deadline
      when 'immediate' then now_at
      when 'operational' then now_at + make_interval(days => greatest(grace_days, operational_days))
      when 'support' then now_at + make_interval(days => greatest(grace_days, support_days))
      when 'analytics' then now_at + make_interval(days => greatest(grace_days, analytics_days))
      when 'financial' then now_at + make_interval(days => greatest(grace_days, financial_days))
      when 'receipt' then now_at + make_interval(days => greatest(grace_days, receipt_days))
      else now_at + make_interval(days => final_days)
    end,
    8
  from (values
    ('suspend_workspace', 1, 'immediate', false, 'immediate'),
    ('revoke_auth_sessions', 2, 'immediate', false, 'immediate'),
    ('cancel_stripe_subscription', 3, 'immediate', false, 'immediate'),
    ('revoke_meta_permissions', 4, 'immediate', false, 'immediate'),
    ('disconnect_ghl', 5, 'immediate', false, 'immediate'),
    ('disable_support_delivery', 6, 'immediate', false, 'immediate'),
    ('freeze_analytics', 7, 'immediate', false, 'immediate'),
    ('delete_creative_storage', 8, 'retention', true, 'operational'),
    ('anonymize_support', 9, 'retention', true, 'support'),
    ('anonymize_analytics', 10, 'retention', true, 'analytics'),
    ('delete_operational_data', 11, 'retention', true, 'operational'),
    ('anonymize_financial_subjects', 12, 'retention', true, 'operational'),
    ('purge_expired_financial_records', 13, 'final', true, 'financial'),
    ('expire_deletion_receipt_details', 14, 'final', true, 'receipt'),
    ('delete_auth_identity', 15, 'final', true, 'final'),
    ('complete_request', 16, 'final', true, 'final')
  ) plan(kind, ordinal, phase, hold_blocking, deadline);

  return next created;
end;
$$;
revoke all on function public.create_account_deletion_request_v1(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.create_account_deletion_request_v1(uuid,uuid,text,text,text)
  to service_role;

create or replace function public.claim_account_deletion_tasks_v1(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer
)
returns table (
  id uuid, request_id uuid, organization_id uuid, requested_by_user_id uuid,
  task_kind text, attempt_count integer, max_attempts integer,
  claim_token uuid, claim_generation bigint, reconciliation_required boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'account_deletion_service_role_required';
  end if;
  if trim(coalesce(p_worker_id, '')) !~ '^[A-Za-z0-9@._:-]{3,180}$'
    or p_limit not between 1 and 25 or p_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'account_deletion_claim_invalid';
  end if;

  return query
  with candidates as (
    select task.id
    from public.account_deletion_tasks task
    join public.account_deletion_requests request on request.id = task.request_id
    where (
        task.status in ('queued', 'retry', 'reconcile')
        or (task.status = 'processing' and task.locked_until < timezone('utc', now()))
      )
      and task.available_at <= timezone('utc', now())
      and coalesce(task.next_attempt_at, task.available_at) <= timezone('utc', now())
      and not (task.legal_hold_blocking and request.legal_hold_active)
      and request.state not in ('completed', 'rejected')
      and not exists (
        select 1 from public.account_deletion_tasks predecessor
        where predecessor.request_id = task.request_id
          and predecessor.task_ordinal < task.task_ordinal
          and predecessor.status <> 'completed'
      )
    order by task.available_at, task.task_ordinal, task.id
    for update of task skip locked
    limit p_limit
  ), claimed as (
    update public.account_deletion_tasks task set
      status = 'processing', claimed_by = trim(p_worker_id), claim_token = gen_random_uuid(),
      claim_generation = task.claim_generation + 1, claimed_at = timezone('utc', now()),
      locked_until = timezone('utc', now()) + make_interval(secs => p_lease_seconds),
      attempt_count = least(task.attempt_count + 1, task.max_attempts), updated_at = timezone('utc', now())
    from candidates where task.id = candidates.id
    returning task.*
  )
  select claimed.id, claimed.request_id, claimed.organization_id, claimed.requested_by_user_id,
    claimed.task_kind, claimed.attempt_count, claimed.max_attempts,
    claimed.claim_token, claimed.claim_generation, claimed.reconciliation_required
  from claimed order by claimed.task_ordinal;
end;
$$;
revoke all on function public.claim_account_deletion_tasks_v1(text,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_account_deletion_tasks_v1(text,integer,integer) to service_role;

-- Creative assets have no direct organization_id. Their only deletion scope
-- is the immutable campaign/user join; ambiguous or cross-tenant identities
-- are returned as unresolved and never handed to object storage.
create or replace function public.get_account_deletion_creative_storage_inventory_v1(
  p_task_id uuid,
  p_claim_token uuid,
  p_claim_generation bigint
)
returns table (
  asset_id uuid,
  storage_bucket text,
  storage_path text,
  inventory_state text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.account_deletion_tasks%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'account_deletion_service_role_required';
  end if;
  select * into strict task from public.account_deletion_tasks candidate
  where candidate.id = p_task_id
    and candidate.task_kind = 'delete_creative_storage'
    and candidate.status = 'processing'
    and candidate.claim_token = p_claim_token
    and candidate.claim_generation = p_claim_generation
    and candidate.locked_until >= timezone('utc', now());

  return query
  select asset.id, asset.storage_bucket, asset.storage_path,
    case
      when asset.user_id is distinct from campaign.user_id then 'ambiguous_user_scope'
      when asset.storage_bucket is null and asset.storage_path is null then 'database_only'
      when asset.storage_bucket = 'creative-assets'
        and position('..' in asset.storage_path) = 0
        and (
          (
            asset.provider_name = 'manual_upload'
            and asset.storage_path = asset.user_id::text || '/' || asset.campaign_id::text || '/' || split_part(asset.storage_path, '/', 3)
            and split_part(asset.storage_path, '/', 3) <> ''
          )
          or (
            asset.provider_name in ('higgsfield', 'heygen')
            and exists (
              select 1 from private.generated_video_storage_bindings binding
              where binding.asset_id = asset.id
                and binding.organization_id = task.organization_id
                and binding.user_id = asset.user_id
                and binding.campaign_id = asset.campaign_id
                and binding.provider_name = asset.provider_name
                and binding.storage_bucket = asset.storage_bucket
                and binding.storage_path = asset.storage_path
            )
          )
        ) then 'canonical'
      else 'ambiguous_storage_identity'
    end
  from public.creative_assets asset
  join public.campaign_plans campaign on campaign.id = asset.campaign_id
  where campaign.organization_id = task.organization_id
  union all
  select asset.id, null::text, null::text, 'ambiguous_campaign_scope'::text
  from public.creative_assets asset
  where asset.user_id = task.requested_by_user_id
    and not exists (
      select 1 from public.campaign_plans campaign
      where campaign.id = asset.campaign_id
        and campaign.organization_id = task.organization_id
        and campaign.user_id = asset.user_id
    );
end;
$$;
revoke all on function public.get_account_deletion_creative_storage_inventory_v1(uuid,uuid,bigint)
  from public, anon, authenticated;
grant execute on function public.get_account_deletion_creative_storage_inventory_v1(uuid,uuid,bigint)
  to service_role;

create or replace function public.finalize_account_deletion_creative_storage_v1(
  p_task_id uuid,
  p_claim_token uuid,
  p_claim_generation bigint,
  p_asset_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.account_deletion_tasks%rowtype;
  expected_ids uuid[];
  affected integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'account_deletion_service_role_required';
  end if;
  select * into strict task from public.account_deletion_tasks candidate
  where candidate.id = p_task_id
    and candidate.task_kind = 'delete_creative_storage'
    and candidate.status = 'processing'
    and candidate.claim_token = p_claim_token
    and candidate.claim_generation = p_claim_generation
    and candidate.locked_until >= timezone('utc', now())
  for update;

  if exists (
    select 1
    from public.get_account_deletion_creative_storage_inventory_v1(
      p_task_id, p_claim_token, p_claim_generation
    ) inventory
    where inventory.inventory_state not in ('canonical', 'database_only')
  ) then
    raise exception using errcode = '55000', message = 'account_deletion_creative_inventory_ambiguous';
  end if;

  select coalesce(array_agg(inventory.asset_id order by inventory.asset_id), '{}'::uuid[])
  into expected_ids
  from public.get_account_deletion_creative_storage_inventory_v1(
    p_task_id, p_claim_token, p_claim_generation
  ) inventory;
  if expected_ids is distinct from (
    select coalesce(array_agg(candidate order by candidate), '{}'::uuid[])
    from unnest(coalesce(p_asset_ids, '{}'::uuid[])) candidate
  ) then
    raise exception using errcode = '55000', message = 'account_deletion_creative_inventory_changed';
  end if;

  perform set_config('dealflow.account_deletion_request_id', task.request_id::text, true);
  delete from public.creative_assets asset where asset.id = any(expected_ids);
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.finalize_account_deletion_creative_storage_v1(uuid,uuid,bigint,uuid[])
  from public, anon, authenticated;
grant execute on function public.finalize_account_deletion_creative_storage_v1(uuid,uuid,bigint,uuid[])
  to service_role;

create or replace function private.reject_suspended_creative_asset_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_scope uuid;
  bypass_request text := current_setting('dealflow.account_deletion_request_id', true);
begin
  for campaign_scope in
    select distinct campaign.organization_id
    from public.campaign_plans campaign
    where campaign.id in (
      case when tg_op in ('UPDATE', 'DELETE') then old.campaign_id else null end,
      case when tg_op in ('INSERT', 'UPDATE') then new.campaign_id else null end
    )
  loop
    if exists (
      select 1 from public.account_deletion_suspensions suspension
      where suspension.organization_id = campaign_scope
    ) and not exists (
      select 1 from public.account_deletion_requests request
      where request.id::text = bypass_request
        and request.organization_id = campaign_scope
        and request.state not in ('completed', 'rejected')
    ) then
      raise exception using errcode = '42501', message = 'account_deletion_workspace_suspended';
    end if;
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.reject_suspended_creative_asset_write()
  from public, anon, authenticated;
drop trigger if exists account_deletion_creative_asset_write_guard on public.creative_assets;
create trigger account_deletion_creative_asset_write_guard
  before insert or update or delete on public.creative_assets
  for each row execute function private.reject_suspended_creative_asset_write();

create or replace function private.account_deletion_inventory_row_count(
  p_relation_schema text,
  p_relation_name text,
  p_scope_column text,
  p_organization_id uuid,
  p_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_count bigint;
begin
  if not exists (
    select 1 from public.account_deletion_data_inventory inventory
    where inventory.resource_kind = 'table'
      and inventory.relation_schema = p_relation_schema
      and inventory.relation_name = p_relation_name
      and inventory.scope_column = p_scope_column
  ) then
    raise exception using errcode = '42501', message = 'account_deletion_inventory_relation_unclassified';
  end if;
  if p_relation_schema = 'public' and p_relation_name = 'creative_assets'
    and p_scope_column = 'campaign_join' then
    select count(distinct asset.id) into result_count
    from public.creative_assets asset
    left join public.campaign_plans campaign on campaign.id = asset.campaign_id
    where campaign.organization_id = p_organization_id
       or asset.user_id = p_user_id;
    return result_count;
  end if;
  if p_scope_column in ('organization_id', 'workspace_id') then
    execute format('select count(*) from %I.%I where %I = $1',
      p_relation_schema, p_relation_name, p_scope_column)
      into result_count using p_organization_id;
  elsif p_scope_column in ('user_id', 'owner_id') then
    execute format('select count(*) from %I.%I where %I = $1',
      p_relation_schema, p_relation_name, p_scope_column)
      into result_count using p_user_id;
  elsif p_scope_column = 'id' and p_relation_name = 'organizations' then
    select count(*) into result_count from public.organizations where id = p_organization_id;
  elsif p_scope_column = 'id' and p_relation_name = 'users' then
    select count(*) into result_count from public.users where id = p_user_id;
  else
    raise exception using errcode = '42501', message = 'account_deletion_inventory_scope_unsupported';
  end if;
  return result_count;
end;
$$;
revoke all on function private.account_deletion_inventory_row_count(text,text,text,uuid,uuid)
  from public, anon, authenticated;

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
begin
  deleted_count := 0;
  blocked_relation_count := 0;
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
  return next;
end;
$$;
revoke all on function private.execute_account_deletion_inventory_group(text,uuid,uuid)
  from public, anon, authenticated;

create or replace function public.execute_account_deletion_internal_action_v1(
  p_task_id uuid,
  p_claim_token uuid,
  p_claim_generation bigint
)
returns table (result_outcome text, result_code text, receipt_metadata jsonb)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  task public.account_deletion_tasks%rowtype;
  request public.account_deletion_requests%rowtype;
  affected bigint := 0;
  active_ghl_count integer := 0;
  inventory record;
  inventory_result record;
  remaining bigint := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'account_deletion_service_role_required';
  end if;
  select * into strict task from public.account_deletion_tasks candidate
  where candidate.id = p_task_id and candidate.status = 'processing'
    and candidate.claim_token = p_claim_token and candidate.claim_generation = p_claim_generation
    and candidate.locked_until >= timezone('utc', now())
  for update;
  select * into strict request from public.account_deletion_requests source
  where source.id = task.request_id for update;
  perform set_config('dealflow.account_deletion_request_id', task.request_id::text, true);

  if task.task_kind = 'suspend_workspace' then
    insert into public.account_deletion_suspensions (
      organization_id, request_id, requested_by_user_id, subject_hash, suspended_at
    ) values (task.organization_id, task.request_id, task.requested_by_user_id, request.subject_hash, timezone('utc', now()))
    on conflict (organization_id) do nothing;
    update public.account_deletion_requests set suspended_at = coalesce(suspended_at, timezone('utc', now())),
      state = 'suspending', updated_at = timezone('utc', now()) where id = task.request_id;
    return query select 'completed', 'workspace_suspended', '{}'::jsonb; return;
  end if;

  if task.task_kind = 'disconnect_ghl' then
    select count(*) into active_ghl_count from public.ghl_location_mappings mapping
    where mapping.organization_id = task.organization_id and mapping.status = 'active';
    if exists (
      select 1 from public.ghl_provisioning_runs run
      where run.organization_id = task.organization_id
        and run.locked_until > timezone('utc', now()) and run.lease_token is not null
    ) or exists (
      select 1 from public.ghl_provider_outbox outbox
      where outbox.organization_id = task.organization_id and outbox.status in ('dispatching', 'uncertain')
    ) then
      raise exception using errcode = '55000', message = 'ghl_offboarding_requires_tenant_worker_drain';
    end if;
    update public.ghl_provider_outbox set status = 'canceled', completed_at = timezone('utc', now()),
      last_error_code = 'account_deletion_offboarding', updated_at = timezone('utc', now())
    where organization_id = task.organization_id and status in ('pending', 'retryable_failure', 'operator_action_required');
    update public.workspace_ghl_mapping set sync_enabled = false
    where workspace_id = task.organization_id;
    -- Active mappings are executed by the application provider worker. That
    -- worker uses HighLevel's official DELETE /locations/:locationId only
    -- when immutable provisioning-run/outbox/receipt evidence proves this
    -- exact tenant owns a DealFlow/partner-created location. If the database
    -- executor is called directly, it cannot access provider credentials and
    -- therefore escalates without representing provider deletion.
    if active_ghl_count > 0 then
      return query select 'operator_required', 'ghl_provider_worker_or_operator_evidence_required',
        jsonb_build_object(
          'localExecutionFenced', true,
          'credentialReferenceRemoved', false,
          'providerMappingCount', active_ghl_count
        ); return;
    end if;
    return query select 'completed', 'ghl_already_disconnected',
      jsonb_build_object('localExecutionFenced', true, 'providerMappingCount', 0); return;
  end if;

  if task.task_kind = 'disable_support_delivery' then
    update public.support_notification_outbox queue set status = 'operator_action_required',
      next_attempt_at = 'infinity'::timestamptz, last_error_code = 'account_deletion_offboarding',
      locked_at = null, locked_by = null, updated_at = timezone('utc', now())
    where queue.ticket_id in (
      select ticket.id from public.support_tickets ticket where ticket.organization_id = task.organization_id
    ) and queue.status in ('pending', 'retrying', 'failed');
    get diagnostics affected = row_count;
    return query select 'completed', 'support_delivery_disabled', jsonb_build_object('queueCount', affected); return;
  end if;

  if task.task_kind = 'freeze_analytics' then
    return query select 'completed', 'analytics_collection_frozen_by_workspace_suspension', '{}'::jsonb; return;
  end if;

  if task.task_kind = 'anonymize_support' then
    delete from public.support_notification_outbox queue
    where queue.ticket_id in (
      select ticket.id from public.support_tickets ticket
      where ticket.organization_id = task.organization_id
    );
    update public.support_tickets set subject = 'Deleted account request', message = '[deleted]',
      route_path = null, safe_context = '{}'::jsonb, updated_at = timezone('utc', now())
    where organization_id = task.organization_id;
    get diagnostics affected = row_count;
    return query select 'completed', 'support_content_anonymized', jsonb_build_object('ticketCount', affected); return;
  end if;

  if task.task_kind = 'anonymize_analytics' then
    -- Browser errors are legacy-global rows; only erase rows that carry an
    -- exact tenant identity in their bounded metadata rather than guessing.
    delete from public.client_error_events
    where metadata ->> 'organizationId' = task.organization_id::text
       or metadata ->> 'organization_id' = task.organization_id::text;
    select * into inventory_result
    from private.execute_account_deletion_inventory_group(
      'anonymize_analytics', task.organization_id, task.requested_by_user_id
    );
    if inventory_result.remaining_count > 0 then
      return query select 'operator_required', 'account_deletion_analytics_records_remaining',
        jsonb_build_object('remainingCount', inventory_result.remaining_count); return;
    end if;
    return query select 'completed', 'analytics_data_deleted',
      jsonb_build_object('deletedCount', inventory_result.deleted_count); return;
  end if;

  if task.task_kind = 'delete_operational_data' then
    select * into inventory_result
    from private.execute_account_deletion_inventory_group(
      'delete_operational_data', task.organization_id, task.requested_by_user_id
    );
    update public.organizations set
      name = 'Deleted workspace', slug = 'deleted-' || substr(replace(id::text, '-', ''), 1, 20),
      updated_at = timezone('utc', now()) where id = task.organization_id;
    update public.users set email = 'deleted+' || substr(replace(id::text, '-', ''), 1, 20) || '@invalid.example',
      full_name = 'Deleted user', avatar_url = null, updated_at = timezone('utc', now())
    where id = task.requested_by_user_id;
    if inventory_result.remaining_count > 0 then
      return query select 'operator_required', 'account_deletion_operational_records_remaining',
        jsonb_build_object(
          'remainingCount', inventory_result.remaining_count,
          'blockedRelationCount', inventory_result.blocked_relation_count
        ); return;
    end if;
    return query select 'completed', 'operational_data_deleted_or_anonymized',
      jsonb_build_object('deletedCount', inventory_result.deleted_count); return;
  end if;

  if task.task_kind = 'anonymize_financial_subjects' then
    remaining := 0;
    for inventory in
      select * from public.account_deletion_data_inventory candidate
      where candidate.resource_kind = 'table' and candidate.disposition = 'legal_retain'
    loop
      remaining := remaining + private.account_deletion_inventory_row_count(
        inventory.relation_schema, inventory.relation_name, inventory.scope_column,
        task.organization_id, task.requested_by_user_id
      );
    end loop;
    return query select 'completed', 'financial_records_isolated_until_expiry',
      jsonb_build_object(
        'retentionDays', request.retention_policy -> 'financialRetentionDays',
        'retainedRecordCount', remaining
      ); return;
  end if;

  if task.task_kind = 'purge_expired_financial_records' then
    select * into inventory_result
    from private.execute_account_deletion_inventory_group(
      'purge_expired_financial_records', task.organization_id, task.requested_by_user_id
    );
    if inventory_result.remaining_count > 0 then
      return query select 'operator_required', 'account_deletion_financial_retention_purge_blocked',
        jsonb_build_object(
          'remainingCount', inventory_result.remaining_count,
          'blockedRelationCount', inventory_result.blocked_relation_count
        ); return;
    end if;
    return query select 'completed', 'expired_financial_records_purged',
      jsonb_build_object('deletedCount', inventory_result.deleted_count); return;
  end if;

  if task.task_kind = 'expire_deletion_receipt_details' then
    perform set_config(
      'dealflow.account_deletion_receipt_expiry_request_id', task.request_id::text, true
    );
    update public.account_deletion_receipts receipt set
      provider_receipt_id = null,
      receipt_metadata = '{"detailsExpired":true}'::jsonb
    where receipt.request_id = task.request_id
      and receipt.details_expires_at <= timezone('utc', now())
      and (
        receipt.provider_receipt_id is not null
        or receipt.receipt_metadata <> '{"detailsExpired":true}'::jsonb
      );
    get diagnostics affected = row_count;
    select count(*) into remaining
    from public.account_deletion_receipts receipt
    where receipt.request_id = task.request_id
      and (
        receipt.details_expires_at > timezone('utc', now())
        or receipt.provider_receipt_id is not null
        or receipt.receipt_metadata <> '{"detailsExpired":true}'::jsonb
      );
    if remaining > 0 then
      return query select 'operator_required', 'account_deletion_receipt_details_remaining',
        jsonb_build_object('remainingCount', remaining); return;
    end if;
    return query select 'completed', 'account_deletion_receipt_details_expired',
      jsonb_build_object('expiredCount', affected); return;
  end if;

  if task.task_kind = 'complete_request' then
    remaining := 0;
    for inventory in
      select * from public.account_deletion_data_inventory candidate
      where candidate.resource_kind = 'table'
        and candidate.relation_name not in ('organizations', 'users', 'support_tickets')
    loop
      remaining := remaining + private.account_deletion_inventory_row_count(
        inventory.relation_schema, inventory.relation_name, inventory.scope_column,
        task.organization_id, task.requested_by_user_id
      );
    end loop;
    select remaining
      + count(*) filter (where subject <> 'Deleted account request'
          or message <> '[deleted]' or route_path is not null or safe_context <> '{}'::jsonb)
    into remaining
    from public.support_tickets
    where organization_id = task.organization_id;
    if not exists (
      select 1 from public.organizations organization
      where organization.id = task.organization_id
        and organization.name = 'Deleted workspace'
        and organization.slug like 'deleted-%'
    ) or not exists (
      select 1 from public.users user_record
      where user_record.id = task.requested_by_user_id
        and user_record.email like 'deleted+%@invalid.example'
        and user_record.full_name = 'Deleted user'
        and user_record.avatar_url is null
    ) then
      remaining := remaining + 1;
    end if;
    if exists (
      select 1 from public.account_deletion_receipts receipt
      where receipt.request_id = task.request_id
        and (
          receipt.provider_receipt_id is not null
          or receipt.receipt_metadata <> '{"detailsExpired":true}'::jsonb
        )
    ) then
      remaining := remaining + 1;
    end if;
    if remaining > 0 then
      return query select 'operator_required', 'account_deletion_disallowed_pii_remaining',
        jsonb_build_object('remainingCount', remaining); return;
    end if;
    return query select 'completed', 'account_deletion_lifecycle_complete',
      jsonb_build_object('receiptRetentionDays', request.retention_policy -> 'receiptRetentionDays'); return;
  end if;

  raise exception using errcode = '22023', message = 'account_deletion_task_requires_application_executor';
end;
$$;
revoke all on function public.execute_account_deletion_internal_action_v1(uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.execute_account_deletion_internal_action_v1(uuid,uuid,bigint) to service_role;

create or replace function public.settle_account_deletion_task_v1(
  p_task_id uuid,
  p_claim_token uuid,
  p_claim_generation bigint,
  p_outcome text,
  p_result_code text,
  p_provider_receipt_id text,
  p_receipt_metadata jsonb,
  p_next_attempt_at timestamptz
)
returns public.account_deletion_tasks
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  task public.account_deletion_tasks%rowtype;
  request public.account_deletion_requests%rowtype;
  final_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'account_deletion_service_role_required';
  end if;
  if p_outcome not in ('completed', 'retry', 'reconcile', 'operator_required')
    or p_result_code !~ '^[a-z0-9][a-z0-9_:-]{2,127}$'
    or (p_provider_receipt_id is not null and p_provider_receipt_id !~ '^sha256:[a-f0-9]{64}$')
    or jsonb_typeof(coalesce(p_receipt_metadata, '{}'::jsonb)) is distinct from 'object'
    or octet_length(coalesce(p_receipt_metadata, '{}'::jsonb)::text) > 8192 then
    raise exception using errcode = '22023', message = 'account_deletion_settlement_invalid';
  end if;
  select * into strict task from public.account_deletion_tasks candidate
  where candidate.id = p_task_id and candidate.status = 'processing'
    and candidate.claim_token = p_claim_token and candidate.claim_generation = p_claim_generation
    and candidate.locked_until >= timezone('utc', now())
  for update;
  select * into strict request from public.account_deletion_requests source
  where source.id = task.request_id for update;
  perform set_config('dealflow.account_deletion_request_id', task.request_id::text, true);

  insert into public.account_deletion_receipts (
    request_id, task_id, organization_subject_hash, task_kind, attempt_number,
    claim_generation, outcome, result_code, provider_receipt_id, receipt_metadata,
    details_expires_at
  ) values (
    task.request_id, task.id, request.subject_hash, task.task_kind, task.attempt_count,
    task.claim_generation, p_outcome, p_result_code,
    case when timezone('utc', now()) >= request.requested_at + make_interval(
      days => (request.retention_policy ->> 'receiptRetentionDays')::integer
    ) then null else p_provider_receipt_id end,
    case when timezone('utc', now()) >= request.requested_at + make_interval(
      days => (request.retention_policy ->> 'receiptRetentionDays')::integer
    )
      then '{"detailsExpired":true}'::jsonb
      else coalesce(p_receipt_metadata, '{}'::jsonb)
    end,
    request.requested_at + make_interval(
      days => (request.retention_policy ->> 'receiptRetentionDays')::integer
    )
  );

  final_status := case
    when p_outcome = 'completed' then 'completed'
    when p_outcome = 'operator_required' or task.attempt_count >= task.max_attempts then 'operator_required'
    else p_outcome
  end;
  update public.account_deletion_tasks set
    status = final_status,
    reconciliation_required = p_outcome = 'reconcile',
    next_attempt_at = case
      when final_status in ('retry', 'reconcile') then coalesce(
        p_next_attempt_at,
        timezone('utc', now()) + make_interval(mins => least(5 * (2 ^ greatest(attempt_count - 1, 0))::integer, 720))
      ) else null end,
    last_result_code = p_result_code,
    completed_at = case when final_status = 'completed' then timezone('utc', now()) else completed_at end,
    operator_required_at = case when final_status = 'operator_required' then timezone('utc', now()) else null end,
    claimed_by = null, claim_token = null, claimed_at = null, locked_until = null,
    updated_at = timezone('utc', now())
  where id = task.id returning * into task;

  if task.task_kind = 'revoke_meta_permissions' and task.status = 'completed' then
    update public.marketing_accounts set status = 'disconnected', access_token_encrypted = null,
      connected_at = null, token_last_synced_at = null,
      connection_metadata = coalesce(connection_metadata, '{}'::jsonb) || jsonb_build_object(
        'offboardedAt', timezone('utc', now()), 'offboardingReceipt', p_result_code
      )
    where organization_id = task.organization_id and platform = 'meta';
  end if;

  if task.task_kind = 'cancel_stripe_subscription' and task.status = 'completed' then
    update public.billing_subscriptions set
      status = case
        when p_result_code in (
          'stripe_subscription_cancelled', 'stripe_subscription_already_cancelled',
          'stripe_subscription_already_absent'
        ) then 'canceled'
        else status
      end,
      cancel_at_period_end = case
        when p_result_code in (
          'stripe_subscription_nonrenewal_scheduled',
          'stripe_subscription_nonrenewal_already_scheduled'
        ) then true
        else cancel_at_period_end
      end,
      current_period_end = case
        when p_result_code in (
          'stripe_subscription_cancelled', 'stripe_subscription_already_cancelled',
          'stripe_subscription_already_absent'
        ) then least(coalesce(current_period_end, timezone('utc', now())), timezone('utc', now()))
        else current_period_end
      end,
      updated_at = timezone('utc', now())
    where organization_id = task.organization_id;
  end if;

  if task.task_kind = 'disconnect_ghl' and task.status = 'completed' then
    update public.ghl_location_mappings set
      status = 'inactive', forms_readonly_credential_ref = null,
      forms_readonly_capabilities = null, forms_readonly_scope_attested_at = null,
      last_reconciled_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where organization_id = task.organization_id;
    update public.ghl_workspace_tenants set status = 'inactive',
      updated_at = timezone('utc', now())
    where organization_id = task.organization_id;
    update public.workspace_ghl_mapping set sync_enabled = false,
      ghl_pipeline_id = null, ghl_stage_id = null, metadata = '{}'::jsonb,
      updated_at = timezone('utc', now())
    where workspace_id = task.organization_id;
  end if;

  update public.account_deletion_requests source set
    state = case
      when source.legal_hold_active then 'legal_hold'
      when exists (select 1 from public.account_deletion_tasks t where t.request_id = source.id and t.status = 'operator_required') then 'operator_required'
      when not exists (select 1 from public.account_deletion_tasks t where t.request_id = source.id and t.status <> 'completed') then 'completed'
      when exists (select 1 from public.account_deletion_tasks t where t.request_id = source.id and t.phase = 'retention' and t.status = 'processing') then 'deleting'
      when exists (select 1 from public.account_deletion_tasks t where t.request_id = source.id and t.phase = 'immediate' and t.status <> 'completed') then 'offboarding'
      else 'retention_window'
    end,
    offboarding_completed_at = case when not exists (
      select 1 from public.account_deletion_tasks t where t.request_id = source.id and t.phase = 'immediate' and t.status <> 'completed'
    ) then coalesce(source.offboarding_completed_at, timezone('utc', now())) else source.offboarding_completed_at end,
    deletion_started_at = case when task.phase <> 'immediate' then coalesce(source.deletion_started_at, timezone('utc', now())) else source.deletion_started_at end,
    completed_at = case when not exists (
      select 1 from public.account_deletion_tasks t where t.request_id = source.id and t.status <> 'completed'
    ) then timezone('utc', now()) else source.completed_at end,
    operator_required_at = case when final_status = 'operator_required' then timezone('utc', now()) else source.operator_required_at end,
    updated_at = timezone('utc', now())
  where source.id = task.request_id;
  return task;
end;
$$;
revoke all on function public.settle_account_deletion_task_v1(uuid,uuid,bigint,text,text,text,jsonb,timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_account_deletion_task_v1(uuid,uuid,bigint,text,text,text,jsonb,timestamptz)
  to service_role;

create or replace function public.manage_account_deletion_legal_hold_v1(
  p_request_id uuid,
  p_action text,
  p_reason_code text,
  p_authority_reference_hash text,
  p_actor_user_id uuid
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  request public.account_deletion_requests%rowtype;
begin
  if auth.role() is distinct from 'service_role'
    or p_action not in ('set', 'released')
    or p_reason_code !~ '^[a-z0-9][a-z0-9_:-]{2,127}$'
    or p_authority_reference_hash !~ '^sha256:[a-f0-9]{64}$'
    or not exists (
      select 1 from public.account_deletion_operator_authorities authority
      where authority.user_id = p_actor_user_id and authority.active
        and authority.can_manage_legal_holds
    ) then
    raise exception using errcode = '42501', message = 'account_deletion_legal_hold_authority_required';
  end if;
  select * into strict request from public.account_deletion_requests source
  where source.id = p_request_id and source.state not in ('completed', 'rejected') for update;
  if (p_action = 'set' and request.legal_hold_active)
    or (p_action = 'released' and not request.legal_hold_active) then
    raise exception using errcode = '55000', message = 'account_deletion_legal_hold_transition_invalid';
  end if;

  insert into public.account_deletion_legal_hold_events (
    request_id, action, reason_code, authority_reference_hash, actor_user_id
  ) values (p_request_id, p_action, p_reason_code, p_authority_reference_hash, p_actor_user_id);

  update public.account_deletion_requests source set
    legal_hold_active = p_action = 'set',
    legal_hold_reason_code = case when p_action = 'set' then p_reason_code else null end,
    legal_hold_set_at = case when p_action = 'set' then timezone('utc', now()) else null end,
    state = case
      when p_action = 'set' then 'legal_hold'
      when exists (
        select 1 from public.account_deletion_tasks task
        where task.request_id = source.id and task.status = 'operator_required'
      ) then 'operator_required'
      when exists (
        select 1 from public.account_deletion_tasks task
        where task.request_id = source.id and task.phase = 'immediate' and task.status <> 'completed'
      ) then 'offboarding'
      else 'retention_window'
    end,
    updated_at = timezone('utc', now())
  where source.id = p_request_id returning * into request;
  return request;
end;
$$;
revoke all on function public.manage_account_deletion_legal_hold_v1(uuid,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.manage_account_deletion_legal_hold_v1(uuid,text,text,text,uuid)
  to service_role;

create or replace function public.resolve_account_deletion_operator_task_v1(
  p_task_id uuid,
  p_action text,
  p_result_code text,
  p_evidence_reference_hash text,
  p_actor_user_id uuid
)
returns public.account_deletion_tasks
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  task public.account_deletion_tasks%rowtype;
  request public.account_deletion_requests%rowtype;
begin
  if auth.role() is distinct from 'service_role'
    or p_action not in ('requeue', 'complete_with_evidence')
    or p_result_code !~ '^[a-z0-9][a-z0-9_:-]{2,127}$'
    or not exists (
      select 1 from public.account_deletion_operator_authorities authority
      where authority.user_id = p_actor_user_id and authority.active
        and authority.can_resolve_provider_evidence
    ) then
    raise exception using errcode = '42501', message = 'account_deletion_operator_resolution_authority_required';
  end if;
  if p_action = 'complete_with_evidence'
    and p_evidence_reference_hash !~ '^sha256:[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'account_deletion_operator_evidence_required';
  end if;
  select * into strict task from public.account_deletion_tasks candidate
  where candidate.id = p_task_id and candidate.status = 'operator_required' for update;
  select * into strict request from public.account_deletion_requests source
  where source.id = task.request_id and source.state not in ('completed', 'rejected') for update;
  perform set_config('dealflow.account_deletion_request_id', task.request_id::text, true);

  if p_action = 'complete_with_evidence' then
    if task.task_kind not in (
      'cancel_stripe_subscription', 'revoke_meta_permissions', 'disconnect_ghl'
    ) then
      raise exception using errcode = '42501', message = 'account_deletion_operator_manual_completion_forbidden';
    end if;
    if (task.task_kind = 'cancel_stripe_subscription' and p_result_code not in (
        'stripe_cancellation_verified', 'stripe_nonrenewal_verified',
        'stripe_subscription_absence_verified'
      ))
      or (task.task_kind = 'revoke_meta_permissions' and p_result_code not in (
        'meta_permissions_revocation_verified', 'meta_permissions_absence_verified'
      ))
      or (task.task_kind = 'disconnect_ghl' and p_result_code not in (
        'ghl_owned_location_deletion_verified', 'ghl_customer_connection_detach_verified',
        'ghl_provider_absence_verified'
      )) then
      raise exception using errcode = '22023', message = 'account_deletion_operator_evidence_result_invalid';
    end if;
    update public.account_deletion_tasks set status = 'completed',
      reconciliation_required = false, next_attempt_at = null,
      last_result_code = p_result_code, completed_at = timezone('utc', now()),
      operator_required_at = null, claim_generation = claim_generation + 1,
      updated_at = timezone('utc', now())
    where id = task.id returning * into task;
    insert into public.account_deletion_receipts (
      request_id, task_id, organization_subject_hash, task_kind, attempt_number,
      claim_generation, outcome, result_code, provider_receipt_id, receipt_metadata,
      details_expires_at
    ) values (
      task.request_id, task.id, request.subject_hash, task.task_kind, task.attempt_count,
      task.claim_generation, 'completed', p_result_code,
      case when timezone('utc', now()) >= request.requested_at + make_interval(
        days => (request.retention_policy ->> 'receiptRetentionDays')::integer
      ) then null else p_evidence_reference_hash end,
      case when timezone('utc', now()) >= request.requested_at + make_interval(
        days => (request.retention_policy ->> 'receiptRetentionDays')::integer
      ) then '{"detailsExpired":true}'::jsonb else jsonb_build_object(
        'operatorEvidence', true, 'actorFingerprint',
        'sha256:' || encode(extensions.digest(p_actor_user_id::text, 'sha256'), 'hex')
      ) end,
      request.requested_at + make_interval(
        days => (request.retention_policy ->> 'receiptRetentionDays')::integer
      )
    );
    if task.task_kind = 'disconnect_ghl' then
      -- The evidence hash proves the provider-side tenant uninstall/revoke was
      -- independently confirmed. Only then may routing be marked inactive.
      -- The immutable provider-location identity remains as pseudonymous
      -- audit evidence; the existing identity-integrity trigger forbids
      -- rewriting it in place.
      update public.ghl_location_mappings set
        status = 'inactive',
        forms_readonly_credential_ref = null,
        forms_readonly_capabilities = null,
        forms_readonly_scope_attested_at = null,
        last_reconciled_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
      where organization_id = task.organization_id;
      update public.ghl_workspace_tenants set status = 'inactive',
        updated_at = timezone('utc', now())
      where organization_id = task.organization_id;
      update public.workspace_ghl_mapping set
        sync_enabled = false,
        ghl_pipeline_id = null, ghl_stage_id = null, metadata = '{}'::jsonb,
        updated_at = timezone('utc', now())
      where workspace_id = task.organization_id;
    end if;
    if task.task_kind = 'cancel_stripe_subscription' then
      update public.billing_subscriptions set
        status = case
          when p_result_code in ('stripe_cancellation_verified', 'stripe_subscription_absence_verified')
            then 'canceled'
          else status
        end,
        cancel_at_period_end = case
          when p_result_code = 'stripe_nonrenewal_verified' then true
          else cancel_at_period_end
        end,
        current_period_end = case
          when p_result_code in ('stripe_cancellation_verified', 'stripe_subscription_absence_verified')
            then least(coalesce(current_period_end, timezone('utc', now())), timezone('utc', now()))
          else current_period_end
        end,
        updated_at = timezone('utc', now())
      where organization_id = task.organization_id;
    end if;
  else
    update public.account_deletion_tasks set
      status = case when task.task_kind in (
        'cancel_stripe_subscription', 'revoke_meta_permissions', 'disconnect_ghl'
      ) then 'reconcile' else 'queued' end,
      reconciliation_required = task.task_kind in (
        'cancel_stripe_subscription', 'revoke_meta_permissions', 'disconnect_ghl'
      ),
      attempt_count = 0, next_attempt_at = timezone('utc', now()),
      last_result_code = p_result_code, operator_required_at = null,
      updated_at = timezone('utc', now())
    where id = task.id returning * into task;
  end if;

  update public.account_deletion_requests source set
    state = case
      when source.legal_hold_active then 'legal_hold'
      when exists (
        select 1 from public.account_deletion_tasks candidate
        where candidate.request_id = source.id and candidate.status = 'operator_required'
      ) then 'operator_required'
      when exists (
        select 1 from public.account_deletion_tasks candidate
        where candidate.request_id = source.id and candidate.phase = 'immediate'
          and candidate.status <> 'completed'
      ) then 'offboarding'
      else 'retention_window'
    end,
    operator_required_at = case when exists (
      select 1 from public.account_deletion_tasks candidate
      where candidate.request_id = source.id and candidate.status = 'operator_required'
    ) then source.operator_required_at else null end,
    updated_at = timezone('utc', now())
  where source.id = task.request_id;
  return task;
end;
$$;
revoke all on function public.resolve_account_deletion_operator_task_v1(uuid,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_account_deletion_operator_task_v1(uuid,text,text,text,uuid)
  to service_role;

-- External policy/provider boundaries retained deliberately:
-- * operator authority rows and retention values require owner/legal approval;
-- * the application worker may settle GHL from an official provider receipt;
--   operator evidence remains the fallback for unavailable credential/scope;
-- * the integration owner must convert this reviewed proposal into the normal
--   generated numbered migration and schema-lineage artifacts.
