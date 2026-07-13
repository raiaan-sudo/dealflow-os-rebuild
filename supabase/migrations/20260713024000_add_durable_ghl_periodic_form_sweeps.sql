-- Durable GHL native-form recovery sweep.
--
-- Signed ContactCreate/ContactUpdate webhooks remain the priority fast path.
-- This separately gated lane performs bounded Sub-Account forms.readonly
-- reads for one exact active mapping/form route and durably feeds the existing
-- reconciliation/application pipeline using explicit provider_api_read
-- receipts. It never labels provider reads as signed webhooks.

alter table public.ghl_runtime_controls
  add column if not exists inbound_form_sweep_enabled boolean not null default false;

alter table public.ghl_location_mappings
  add column if not exists forms_readonly_credential_generation bigint not null default 0;
update public.ghl_location_mappings
set forms_readonly_credential_generation = 1
where forms_readonly_credential_ref is not null
  and forms_readonly_credential_generation = 0;

alter table public.ghl_location_mappings
  drop constraint if exists ghl_location_mappings_forms_readonly_authority_check,
  add constraint ghl_location_mappings_forms_readonly_authority_check check (
    (
      forms_readonly_credential_ref is null
      and forms_readonly_capabilities is null
      and forms_readonly_scope_attested_at is null
    ) or (
      forms_readonly_credential_ref ~ '^env:[A-Z][A-Z0-9_]{2,127}$'
      and jsonb_typeof(forms_readonly_capabilities) = 'array'
      and forms_readonly_capabilities @> '["forms.readonly"]'::jsonb
    )
  );

alter table public.ghl_lifecycle_webhook_events
  add column if not exists receipt_source text not null default 'signed_webhook';

alter table public.ghl_lifecycle_webhook_events
  drop constraint if exists ghl_lifecycle_webhook_type_check,
  drop constraint if exists ghl_lifecycle_webhook_signature_check,
  add constraint ghl_lifecycle_webhook_type_check check (event_type in (
    'AppointmentCreate', 'AppointmentUpdate', 'AppointmentDelete', 'ContactCreate', 'ContactUpdate',
    'OpportunityStatusUpdate', 'OutboundMessage', 'FormSubmissionSweep'
  )),
  add constraint ghl_lifecycle_webhook_signature_check check (
    (
      receipt_source = 'signed_webhook'
      and signature_algorithm = 'ed25519'
      and event_type <> 'FormSubmissionSweep'
    ) or (
      receipt_source = 'provider_api_read'
      and signature_algorithm = 'provider_api_read'
      and event_type = 'FormSubmissionSweep'
    )
  );

comment on column public.ghl_lifecycle_webhook_events.receipt_source is
  'signed_webhook for verified Ed25519 deliveries; provider_api_read for internal periodic form-read receipts.';

create table if not exists public.ghl_inbound_form_sweep_cursors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  location_mapping_id uuid not null,
  environment text not null,
  provider_location_id text not null,
  provider_form_id text not null,
  allowed_field_ids jsonb not null default '[]'::jsonb,
  route_fingerprint text not null,
  authority_fingerprint text not null,
  credential_generation bigint not null,
  anchor_at timestamptz not null,
  anchor_reason text not null,
  anchor_fingerprint text not null,
  cursor_through timestamptz not null,
  status text not null default 'active',
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  next_retry_at timestamptz null,
  last_success_at timestamptz null,
  last_observed_lag_seconds integer null,
  last_error_code text null,
  replay_count integer not null default 0,
  replay_history jsonb not null default '[]'::jsonb,
  last_replayed_at timestamptz null,
  last_replayed_by text null,
  last_replay_reason text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_inbound_form_sweep_cursor_environment_check check (environment in ('sandbox', 'production')),
  constraint ghl_inbound_form_sweep_cursor_identity_check check (
    provider_location_id ~ '^[A-Za-z0-9_-]{3,180}$'
    and provider_form_id ~ '^[A-Za-z0-9_-]{3,180}$'
    and route_fingerprint ~ '^[a-f0-9]{64}$'
    and authority_fingerprint ~ '^[a-f0-9]{64}$'
    and credential_generation > 0
    and anchor_fingerprint ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(allowed_field_ids) = 'array'
    and jsonb_array_length(allowed_field_ids) <= 125
  ),
  constraint ghl_inbound_form_sweep_cursor_anchor_check check (
    anchor_reason = 'max(mapping_ready,route_ready,bounded_lookback)'
    and cursor_through >= anchor_at
  ),
  constraint ghl_inbound_form_sweep_cursor_status_check check (
    status in ('active', 'operator_action_required', 'retired')
  ),
  constraint ghl_inbound_form_sweep_cursor_attempt_check check (
    attempt_count >= 0 and max_attempts between 2 and 20 and attempt_count <= max_attempts
    and (last_observed_lag_seconds is null or last_observed_lag_seconds >= 0)
  ),
  constraint ghl_inbound_form_sweep_cursor_replay_check check (
    replay_count between 0 and 5
    and jsonb_typeof(replay_history) = 'array'
    and jsonb_array_length(replay_history) = replay_count
    and (last_replayed_by is null or last_replayed_by ~ '^[A-Za-z0-9@._:-]{3,180}$')
    and (last_replay_reason is null or length(last_replay_reason) between 3 and 500)
  ),
  constraint ghl_inbound_form_sweep_cursor_mapping_fk foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings(id, organization_id) on update restrict on delete restrict,
  constraint ghl_inbound_form_sweep_cursor_route_unique unique (environment, location_mapping_id, provider_form_id)
);

create table if not exists public.ghl_inbound_form_sweep_runs (
  id uuid primary key default gen_random_uuid(),
  cursor_id uuid not null references public.ghl_inbound_form_sweep_cursors(id) on delete restrict,
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  location_mapping_id uuid not null,
  environment text not null,
  provider_location_id text not null,
  provider_form_id text not null,
  allowed_field_ids jsonb not null,
  route_fingerprint text not null,
  authority_fingerprint text not null,
  credential_generation bigint not null,
  cursor_before timestamptz not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null default 'processing',
  attempt_count integer not null,
  worker_id text not null,
  locked_by text null,
  locked_at timestamptz null,
  locked_until timestamptz null,
  lease_token uuid null,
  lease_generation bigint not null,
  provider_request_ids jsonb not null default '[]'::jsonb,
  response_fingerprint text null,
  page_count integer null,
  observed_total integer null,
  exact_window_submission_count integer null,
  enqueued_reconciliation_count integer null,
  last_error_code text null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ghl_inbound_form_sweep_run_environment_check check (environment in ('sandbox', 'production')),
  constraint ghl_inbound_form_sweep_run_identity_check check (
    provider_location_id ~ '^[A-Za-z0-9_-]{3,180}$'
    and provider_form_id ~ '^[A-Za-z0-9_-]{3,180}$'
    and route_fingerprint ~ '^[a-f0-9]{64}$'
    and authority_fingerprint ~ '^[a-f0-9]{64}$'
    and credential_generation > 0
    and jsonb_typeof(allowed_field_ids) = 'array'
    and jsonb_typeof(provider_request_ids) = 'array'
    and jsonb_array_length(provider_request_ids) <= 10
  ),
  constraint ghl_inbound_form_sweep_run_window_check check (
    window_start <= cursor_before and cursor_before < window_end
    and window_end - window_start <= interval '70 minutes'
  ),
  constraint ghl_inbound_form_sweep_run_status_check check (
    status in ('processing', 'succeeded', 'retryable_failure', 'operator_action_required')
  ),
  constraint ghl_inbound_form_sweep_run_lease_check check (
    attempt_count between 1 and 20 and lease_generation > 0
    and worker_id ~ '^[A-Za-z0-9@._:-]{3,180}$'
    and (
      (status = 'processing' and locked_by = worker_id and locked_at is not null
        and locked_until > locked_at and lease_token is not null and completed_at is null)
      or
      (status <> 'processing' and locked_by is null and locked_at is null
        and locked_until is null and lease_token is null and completed_at is not null)
    )
  ),
  constraint ghl_inbound_form_sweep_run_counts_check check (
    (page_count is null or page_count between 1 and 10)
    and (observed_total is null or observed_total between 0 and 1000)
    and (exact_window_submission_count is null or exact_window_submission_count between 0 and 1000)
    and (enqueued_reconciliation_count is null or enqueued_reconciliation_count between 0 and 1000)
  ),
  constraint ghl_inbound_form_sweep_run_mapping_fk foreign key (location_mapping_id, organization_id)
    references public.ghl_location_mappings(id, organization_id) on update restrict on delete restrict
);

create table if not exists public.ghl_form_sweep_credential_rotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  location_mapping_id uuid not null,
  environment text not null,
  provider_location_id text not null,
  prior_generation bigint not null,
  new_generation bigint not null,
  actor text not null,
  reason text not null,
  status text not null default 'awaiting_provider_verification',
  verified_at timestamptz null,
  created_at timestamptz not null,
  constraint ghl_form_sweep_rotation_identity_check check (
    environment in ('sandbox', 'production')
    and provider_location_id ~ '^[A-Za-z0-9_-]{3,180}$'
    and prior_generation >= 1 and new_generation = prior_generation + 1
    and actor ~ '^[A-Za-z0-9@._:-]{3,180}$'
    and length(reason) between 3 and 500
  ),
  constraint ghl_form_sweep_rotation_status_check check (
    (status = 'awaiting_provider_verification' and verified_at is null)
    or (status = 'provider_verified' and verified_at is not null)
  ),
  constraint ghl_form_sweep_rotation_generation_unique unique (location_mapping_id, new_generation)
);

create table if not exists public.ghl_form_sweep_scope_attestations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  location_mapping_id uuid not null,
  environment text not null,
  provider_location_id text not null,
  credential_generation bigint not null,
  verified_form_ids jsonb not null,
  probe_kind text not null,
  provider_request_id text null,
  response_fingerprint text not null,
  verified_at timestamptz not null,
  constraint ghl_form_sweep_attestation_identity_check check (
    environment in ('sandbox', 'production')
    and provider_location_id ~ '^[A-Za-z0-9_-]{3,180}$'
    and credential_generation > 0
    and jsonb_typeof(verified_form_ids) = 'array'
    and jsonb_array_length(verified_form_ids) between 1 and 25
    and probe_kind = 'zero_customer_form_submissions_read'
    and (provider_request_id is null or (
      length(provider_request_id) between 1 and 240 and provider_request_id !~ '[[:cntrl:]]'
    ))
    and response_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint ghl_form_sweep_attestation_unique unique (
    location_mapping_id, credential_generation, verified_at
  )
);

create table if not exists public.ghl_form_sweep_attestation_refresh_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  location_mapping_id uuid not null,
  environment text not null,
  provider_location_id text not null,
  credential_generation bigint not null,
  status text not null default 'due',
  attempt_count integer not null default 0,
  next_refresh_at timestamptz not null,
  worker_id text null,
  locked_at timestamptz null,
  locked_until timestamptz null,
  lease_token uuid null,
  lease_generation bigint not null default 0,
  last_error_code text null,
  last_verified_at timestamptz null,
  replay_count integer not null default 0,
  replay_history jsonb not null default '[]'::jsonb,
  last_replayed_at timestamptz null,
  last_replayed_by text null,
  last_replay_reason text null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint ghl_form_sweep_refresh_state_identity_check check (
    environment in ('sandbox', 'production')
    and provider_location_id ~ '^[A-Za-z0-9_-]{3,180}$'
    and credential_generation > 0
    and status in ('due', 'processing', 'operator_action_required', 'retired')
    and attempt_count between 0 and 20
    and lease_generation >= 0
  ),
  constraint ghl_form_sweep_refresh_state_lease_check check (
    (status = 'processing' and worker_id ~ '^[A-Za-z0-9@._:-]{3,180}$'
      and locked_at is not null and locked_until > locked_at and lease_token is not null)
    or (status <> 'processing' and worker_id is null and locked_at is null
      and locked_until is null and lease_token is null)
  ),
  constraint ghl_form_sweep_refresh_state_replay_check check (
    replay_count between 0 and 5
    and jsonb_typeof(replay_history) = 'array'
    and jsonb_array_length(replay_history) = replay_count
    and (last_replayed_by is null or last_replayed_by ~ '^[A-Za-z0-9@._:-]{3,180}$')
    and (last_replay_reason is null or length(last_replay_reason) between 3 and 500)
  ),
  constraint ghl_form_sweep_refresh_state_mapping_unique unique (location_mapping_id)
);

create table if not exists public.ghl_inbound_form_sweep_cursor_replay_audits (
  id uuid primary key default gen_random_uuid(),
  cursor_id uuid not null references public.ghl_inbound_form_sweep_cursors(id) on delete restrict,
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  location_mapping_id uuid not null,
  environment text not null,
  provider_form_id text not null,
  credential_generation bigint not null,
  replay_ordinal integer not null,
  replayed_at timestamptz not null,
  replayed_by text not null,
  reason text not null,
  prior_error_code text null,
  cursor_through timestamptz not null,
  constraint ghl_form_sweep_cursor_replay_audit_identity_check check (
    environment in ('sandbox', 'production')
    and provider_form_id ~ '^[A-Za-z0-9_-]{3,180}$'
    and credential_generation > 0 and replay_ordinal between 1 and 5
    and replayed_by ~ '^[A-Za-z0-9@._:-]{3,180}$'
    and length(reason) between 3 and 500
    and (prior_error_code is null or prior_error_code ~ '^[a-z0-9_:-]{3,180}$')
  ),
  constraint ghl_form_sweep_cursor_replay_audit_unique unique (
    cursor_id, credential_generation, replay_ordinal
  ),
  constraint ghl_form_sweep_cursor_replay_audit_mapping_fk foreign key (
    location_mapping_id, organization_id
  ) references public.ghl_location_mappings(id, organization_id) on update restrict on delete restrict
);

create table if not exists public.ghl_form_sweep_refresh_replay_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ghl_workspace_tenants(organization_id) on delete restrict,
  location_mapping_id uuid not null,
  environment text not null,
  provider_location_id text not null,
  credential_generation bigint not null,
  replay_ordinal integer not null,
  replayed_at timestamptz not null,
  replayed_by text not null,
  reason text not null,
  prior_error_code text null,
  constraint ghl_form_sweep_refresh_replay_audit_identity_check check (
    environment in ('sandbox', 'production')
    and provider_location_id ~ '^[A-Za-z0-9_-]{3,180}$'
    and credential_generation > 0 and replay_ordinal between 1 and 5
    and replayed_by ~ '^[A-Za-z0-9@._:-]{3,180}$'
    and length(reason) between 3 and 500
    and (prior_error_code is null or prior_error_code ~ '^[a-z0-9_:-]{3,180}$')
  ),
  constraint ghl_form_sweep_refresh_replay_audit_unique unique (
    location_mapping_id, credential_generation, replay_ordinal
  ),
  constraint ghl_form_sweep_refresh_replay_audit_mapping_fk foreign key (
    location_mapping_id, organization_id
  ) references public.ghl_location_mappings(id, organization_id) on update restrict on delete restrict
);

create unique index if not exists ghl_inbound_form_sweep_one_live_run_idx
  on public.ghl_inbound_form_sweep_runs(cursor_id) where status = 'processing';
create index if not exists ghl_inbound_form_sweep_cursor_claim_idx
  on public.ghl_inbound_form_sweep_cursors(environment, status, next_retry_at, cursor_through, id)
  where status = 'active';

alter table public.ghl_inbound_form_sweep_cursors enable row level security;
alter table public.ghl_inbound_form_sweep_cursors force row level security;
alter table public.ghl_inbound_form_sweep_runs enable row level security;
alter table public.ghl_inbound_form_sweep_runs force row level security;
alter table public.ghl_form_sweep_credential_rotations enable row level security;
alter table public.ghl_form_sweep_credential_rotations force row level security;
alter table public.ghl_form_sweep_scope_attestations enable row level security;
alter table public.ghl_form_sweep_scope_attestations force row level security;
alter table public.ghl_form_sweep_attestation_refresh_states enable row level security;
alter table public.ghl_form_sweep_attestation_refresh_states force row level security;
alter table public.ghl_inbound_form_sweep_cursor_replay_audits enable row level security;
alter table public.ghl_inbound_form_sweep_cursor_replay_audits force row level security;
alter table public.ghl_form_sweep_refresh_replay_audits enable row level security;
alter table public.ghl_form_sweep_refresh_replay_audits force row level security;
revoke all on table public.ghl_inbound_form_sweep_cursors from public, anon, authenticated, service_role;
revoke all on table public.ghl_inbound_form_sweep_runs from public, anon, authenticated, service_role;
revoke all on table public.ghl_form_sweep_credential_rotations from public, anon, authenticated, service_role;
revoke all on table public.ghl_form_sweep_scope_attestations from public, anon, authenticated, service_role;
revoke all on table public.ghl_form_sweep_attestation_refresh_states from public, anon, authenticated, service_role;
revoke all on table public.ghl_inbound_form_sweep_cursor_replay_audits from public, anon, authenticated, service_role;
revoke all on table public.ghl_form_sweep_refresh_replay_audits from public, anon, authenticated, service_role;
grant select on table public.ghl_inbound_form_sweep_cursors to service_role;
grant select on table public.ghl_inbound_form_sweep_runs to service_role;
grant select on table public.ghl_form_sweep_credential_rotations to service_role;
grant select on table public.ghl_form_sweep_scope_attestations to service_role;
grant select on table public.ghl_form_sweep_attestation_refresh_states to service_role;
grant select on table public.ghl_inbound_form_sweep_cursor_replay_audits to service_role;
grant select on table public.ghl_form_sweep_refresh_replay_audits to service_role;

create or replace function private.ghl_form_sweep_field_ids_valid_v1(p_value jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_typeof(p_value) = 'array'
    and jsonb_array_length(p_value) <= 125
    and not exists (
      select 1 from jsonb_array_elements(p_value) item
      where jsonb_typeof(item) <> 'string'
         or item #>> '{}' !~ '^[A-Za-z0-9_-]{3,180}$'
    )
    and jsonb_array_length(p_value) = (
      select count(distinct item #>> '{}') from jsonb_array_elements(p_value) item
    )
$$;

alter table public.ghl_inbound_form_sweep_cursors
  add constraint ghl_inbound_form_sweep_cursor_fields_check
    check (private.ghl_form_sweep_field_ids_valid_v1(allowed_field_ids)),
  add constraint ghl_inbound_form_sweep_cursor_exact_identity_unique unique (
    id, organization_id, location_mapping_id, environment, provider_location_id, provider_form_id
  );

alter table public.ghl_inbound_form_sweep_runs
  add constraint ghl_inbound_form_sweep_run_fields_check
    check (private.ghl_form_sweep_field_ids_valid_v1(allowed_field_ids)),
  add constraint ghl_inbound_form_sweep_run_exact_cursor_fk foreign key (
    cursor_id, organization_id, location_mapping_id, environment, provider_location_id, provider_form_id
  ) references public.ghl_inbound_form_sweep_cursors (
    id, organization_id, location_mapping_id, environment, provider_location_id, provider_form_id
  ) on update restrict on delete restrict;
alter table public.ghl_form_sweep_scope_attestations
  add constraint ghl_form_sweep_attestation_fields_check
    check (private.ghl_form_sweep_field_ids_valid_v1(verified_form_ids));

alter table public.ghl_location_mappings
  add constraint ghl_location_mappings_sweep_exact_identity_unique unique (
    id, organization_id, environment, provider_location_id
  );
alter table public.ghl_form_sweep_attestation_refresh_states
  add constraint ghl_form_sweep_refresh_state_mapping_fk foreign key (
    location_mapping_id, organization_id, environment, provider_location_id
  ) references public.ghl_location_mappings (
    id, organization_id, environment, provider_location_id
  ) on update restrict on delete restrict;
alter table public.ghl_form_sweep_credential_rotations
  add constraint ghl_form_sweep_rotation_mapping_fk foreign key (
    location_mapping_id, organization_id, environment, provider_location_id
  ) references public.ghl_location_mappings (
    id, organization_id, environment, provider_location_id
  ) on update restrict on delete restrict;
alter table public.ghl_form_sweep_scope_attestations
  add constraint ghl_form_sweep_attestation_mapping_fk foreign key (
    location_mapping_id, organization_id, environment, provider_location_id
  ) references public.ghl_location_mappings (
    id, organization_id, environment, provider_location_id
  ) on update restrict on delete restrict;
alter table public.ghl_inbound_form_sweep_cursors
  add constraint ghl_inbound_form_sweep_cursor_exact_mapping_fk foreign key (
    location_mapping_id, organization_id, environment, provider_location_id
  ) references public.ghl_location_mappings (
    id, organization_id, environment, provider_location_id
  ) on update restrict on delete restrict;

create or replace function private.ghl_form_sweep_request_ids_valid_v1(p_value jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_typeof(p_value) = 'array'
    and jsonb_array_length(p_value) <= 10
    and not exists (
      select 1 from jsonb_array_elements(p_value) item
      where jsonb_typeof(item) <> 'string'
         or length(item #>> '{}') not between 1 and 240
         or item #>> '{}' ~ '[[:cntrl:]]'
    )
$$;

alter table public.ghl_inbound_form_sweep_runs
  add constraint ghl_inbound_form_sweep_run_response_check check (
    (response_fingerprint is null or response_fingerprint ~ '^[a-f0-9]{64}$')
    and private.ghl_form_sweep_request_ids_valid_v1(provider_request_ids)
  ),
  add constraint ghl_inbound_form_sweep_run_terminal_check check (
    (status = 'processing' and completed_at is null and last_error_code is null)
    or
    (status = 'succeeded'
      and completed_at is not null and last_error_code is null
      and response_fingerprint is not null and page_count is not null
      and observed_total is not null and exact_window_submission_count is not null
      and enqueued_reconciliation_count is not null
      and enqueued_reconciliation_count <= exact_window_submission_count
      and exact_window_submission_count <= observed_total)
    or
    (status in ('retryable_failure', 'operator_action_required')
      and completed_at is not null
      and last_error_code ~ '^[a-z0-9_:-]{3,180}$')
  );

create or replace function private.enforce_ghl_form_sweep_run_identity_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.cursor_id is distinct from new.cursor_id
     or old.organization_id is distinct from new.organization_id
     or old.location_mapping_id is distinct from new.location_mapping_id
     or old.environment is distinct from new.environment
     or old.provider_location_id is distinct from new.provider_location_id
     or old.provider_form_id is distinct from new.provider_form_id
     or old.allowed_field_ids is distinct from new.allowed_field_ids
     or old.route_fingerprint is distinct from new.route_fingerprint
     or old.authority_fingerprint is distinct from new.authority_fingerprint
     or old.credential_generation is distinct from new.credential_generation
     or old.cursor_before is distinct from new.cursor_before
     or old.window_start is distinct from new.window_start
     or old.window_end is distinct from new.window_end
     or old.attempt_count is distinct from new.attempt_count
     or old.worker_id is distinct from new.worker_id
     or old.lease_generation is distinct from new.lease_generation
     or old.created_at is distinct from new.created_at then
    raise exception 'ghl_form_sweep_run_identity_immutable';
  end if;
  if old.status <> 'processing' then
    raise exception 'ghl_form_sweep_terminal_run_immutable';
  end if;
  return new;
end;
$$;

create trigger enforce_ghl_form_sweep_run_identity
before update on public.ghl_inbound_form_sweep_runs
for each row execute function private.enforce_ghl_form_sweep_run_identity_v1();

create or replace function private.enforce_ghl_form_sweep_run_generation_at_insert_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.ghl_inbound_form_sweep_cursors cursor_record
    where cursor_record.id = new.cursor_id
      and cursor_record.organization_id = new.organization_id
      and cursor_record.location_mapping_id = new.location_mapping_id
      and cursor_record.environment = new.environment
      and cursor_record.provider_location_id = new.provider_location_id
      and cursor_record.provider_form_id = new.provider_form_id
      and cursor_record.credential_generation = new.credential_generation
  ) then
    raise exception 'ghl_form_sweep_run_generation_not_current_at_insert';
  end if;
  return new;
end;
$$;

create trigger enforce_ghl_form_sweep_run_generation_at_insert
before insert on public.ghl_inbound_form_sweep_runs
for each row execute function private.enforce_ghl_form_sweep_run_generation_at_insert_v1();

create or replace function private.fence_ghl_form_sweep_authority_change_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.forms_readonly_credential_ref is distinct from new.forms_readonly_credential_ref
     or old.forms_readonly_capabilities is distinct from new.forms_readonly_capabilities then
    if exists (
      select 1 from public.ghl_runtime_controls controls
      where controls.environment = old.environment
        and (controls.inbound_form_sweep_enabled or controls.inbound_form_reconciliation_enabled)
    ) then
      raise exception 'ghl_form_sweep_authority_change_requires_closed_runtime';
    end if;
    if exists (
      select 1 from public.ghl_inbound_form_sweep_runs run
      where run.location_mapping_id = old.id and run.status = 'processing'
    ) or exists (
      select 1 from public.ghl_form_sweep_attestation_refresh_states refresh_state
      where refresh_state.location_mapping_id = old.id and refresh_state.status = 'processing'
    ) or exists (
      select 1 from public.ghl_inbound_form_reconciliations reconciliation
      where reconciliation.location_mapping_id = old.id
        and reconciliation.status = 'processing'
    ) then
      raise exception 'ghl_form_sweep_authority_change_requires_zero_live_leases';
    end if;
    new.forms_readonly_credential_generation := old.forms_readonly_credential_generation + 1;
    if old.forms_readonly_credential_generation > 0 then
      if current_setting('dealflow.ghl_form_sweep_verified_configuration', true)
           is distinct from 'true' then
        new.forms_readonly_scope_attested_at := null;
      end if;
      insert into public.ghl_form_sweep_credential_rotations (
        organization_id, location_mapping_id, environment, provider_location_id,
        prior_generation, new_generation, actor, reason, created_at
      ) values (
        old.organization_id, old.id, old.environment, old.provider_location_id,
        old.forms_readonly_credential_generation, new.forms_readonly_credential_generation,
        coalesce(
          nullif(current_setting('dealflow.ghl_form_sweep_configuration_actor', true), ''),
          'system:credential-binding'
        ),
        'credential reference or capability changed',
        timezone('utc', now())
      );
    end if;
  elsif new.forms_readonly_credential_generation is distinct from old.forms_readonly_credential_generation then
    if current_setting('dealflow.ghl_form_sweep_rotation_mapping_id', true) is distinct from old.id::text
       or new.forms_readonly_credential_generation <> old.forms_readonly_credential_generation + 1 then
      raise exception 'ghl_form_sweep_credential_generation_is_managed';
    end if;
    if exists (
      select 1 from public.ghl_runtime_controls controls
      where controls.environment = old.environment
        and (controls.inbound_form_sweep_enabled or controls.inbound_form_reconciliation_enabled)
    ) or exists (
      select 1 from public.ghl_inbound_form_sweep_runs run
      where run.location_mapping_id = old.id and run.status = 'processing'
    ) or exists (
      select 1 from public.ghl_form_sweep_attestation_refresh_states refresh_state
      where refresh_state.location_mapping_id = old.id and refresh_state.status = 'processing'
    ) or exists (
      select 1 from public.ghl_inbound_form_reconciliations reconciliation
      where reconciliation.location_mapping_id = old.id
        and reconciliation.status = 'processing'
    ) then
      raise exception 'ghl_form_sweep_same_ref_rotation_requires_closed_drained_runtime';
    end if;
  end if;
  -- A routine exact-mapping scope attestation refresh is deliberately not a
  -- credential rotation: it may occur while the lane is open and never bumps
  -- generation or fences an already claimed run.
  return new;
end;
$$;

create trigger fence_ghl_form_sweep_authority_change
before update of forms_readonly_credential_ref, forms_readonly_capabilities,
  forms_readonly_scope_attested_at, forms_readonly_credential_generation
on public.ghl_location_mappings
for each row execute function private.fence_ghl_form_sweep_authority_change_v1();

create or replace function private.current_ghl_form_sweep_route_fingerprint_v1(
  p_organization_id uuid,
  p_location_mapping_id uuid,
  p_environment text,
  p_provider_form_id text
)
returns text
language sql
security definer
stable
set search_path = pg_catalog, public, private, extensions
as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'organizationId', p_organization_id,
    'mappingId', p_location_mapping_id,
    'environment', p_environment,
    'providerFormId', route.provider_form_id,
    'allowedFieldIds', route.allowed_field_ids,
    'personalizationId', personalization.id,
    'verifiedAt', personalization.verified_at,
    'sourcePlanFingerprint', personalization.source_plan_fingerprint,
    'destinationContractFingerprint', personalization.destination_contract_fingerprint,
    'inboundConsentContractFingerprint', personalization.inbound_consent_contract_fingerprint
  )::text, 'utf8'), 'sha256'), 'hex')
  from public.list_ghl_inbound_eligible_form_routes_v1(
    p_organization_id, p_location_mapping_id, p_environment
  ) route
  join public.ghl_location_personalizations personalization
    on personalization.organization_id = p_organization_id
   and personalization.location_mapping_id = p_location_mapping_id
   and personalization.environment = p_environment
   and personalization.required_form_ids ? route.provider_form_id
   and personalization.status = 'ready'
   and personalization.current_step = 'ready'
   and personalization.verified_at is not null
  where route.provider_form_id = p_provider_form_id
$$;

create or replace function private.current_ghl_form_sweep_authority_fingerprint_v1(
  p_organization_id uuid,
  p_location_mapping_id uuid,
  p_environment text
)
returns text
language sql
security definer
stable
set search_path = pg_catalog, public, extensions
as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'organizationId', mapping.organization_id,
    'mappingId', mapping.id,
    'environment', mapping.environment,
    'providerLocationId', mapping.provider_location_id,
    'credentialRef', mapping.forms_readonly_credential_ref,
    'credentialGeneration', mapping.forms_readonly_credential_generation,
    'capabilities', mapping.forms_readonly_capabilities,
    'scopeKind', 'forms.readonly'
  )::text, 'utf8'), 'sha256'), 'hex')
  from public.ghl_location_mappings mapping
  where mapping.id = p_location_mapping_id
    and mapping.organization_id = p_organization_id
    and mapping.environment = p_environment
    and mapping.status = 'active'
    and mapping.forms_readonly_credential_ref is not null
    and mapping.forms_readonly_capabilities = '["forms.readonly"]'::jsonb
    and (
      (p_environment = 'sandbox' and mapping.forms_readonly_credential_ref ~ '^env:GHL_SANDBOX_LOCATION(_[A-Z0-9]+)*_TOKEN$')
      or (p_environment = 'production' and mapping.forms_readonly_credential_ref ~ '^env:GHL_PRODUCTION_LOCATION(_[A-Z0-9]+)*_TOKEN$')
    )
$$;

create or replace function private.current_ghl_form_sweep_scope_proof_valid_v1(
  p_organization_id uuid,
  p_location_mapping_id uuid,
  p_environment text,
  p_provider_location_id text,
  p_credential_generation bigint,
  p_scope_attested_at timestamptz
)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public, private
as $$
  select p_scope_attested_at is not null
    and exists (
      select 1
      from public.ghl_form_sweep_scope_attestations proof
      where proof.organization_id = p_organization_id
        and proof.location_mapping_id = p_location_mapping_id
        and proof.environment = p_environment
        and proof.provider_location_id = p_provider_location_id
        and proof.credential_generation = p_credential_generation
        and proof.verified_at = p_scope_attested_at
        and proof.verified_form_ids = (
          select coalesce(
            jsonb_agg(route.provider_form_id order by route.provider_form_id),
            '[]'::jsonb
          )
          from public.list_ghl_inbound_eligible_form_routes_v1(
            p_organization_id, p_location_mapping_id, p_environment
          ) route
        )
    )
$$;

create or replace function public.set_ghl_inbound_form_sweep_runtime_v1(
  p_environment text,
  p_enabled boolean,
  p_now timestamptz
)
returns public.ghl_runtime_controls
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result_record public.ghl_runtime_controls%rowtype;
begin
  if p_environment not in ('sandbox', 'production')
     or p_enabled is null
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_runtime_authorization_invalid';
  end if;
  if p_enabled and not exists (
    select 1 from public.ghl_runtime_controls controls
    where controls.environment = p_environment
      and controls.inbound_form_reconciliation_enabled
  ) then
    raise exception 'ghl_form_sweep_requires_reconciliation_runtime';
  end if;
  if p_enabled and exists (
    select 1
    from public.ghl_location_mappings mapping
    where mapping.environment = p_environment
      and mapping.status = 'active'
      and exists (
        select 1 from public.list_ghl_inbound_eligible_form_routes_v1(
          mapping.organization_id, mapping.id, mapping.environment
        ) route
      )
      and (
        private.current_ghl_form_sweep_authority_fingerprint_v1(
          mapping.organization_id, mapping.id, mapping.environment
        ) is null
        or mapping.forms_readonly_scope_attested_at not between p_now - interval '15 minutes' and p_now + interval '5 minutes'
        or not private.current_ghl_form_sweep_scope_proof_valid_v1(
          mapping.organization_id, mapping.id, mapping.environment,
          mapping.provider_location_id, mapping.forms_readonly_credential_generation,
          mapping.forms_readonly_scope_attested_at
        )
      )
  ) then
    raise exception 'ghl_form_sweep_location_authority_incomplete';
  end if;
  update public.ghl_runtime_controls controls set
    inbound_form_sweep_enabled = p_enabled,
    updated_at = p_now
  where controls.environment = p_environment
  returning * into strict result_record;
  return result_record;
end;
$$;

create or replace function public.drain_ghl_inbound_form_sweep_claims_v1(
  p_environment text,
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  active_claim_count integer;
begin
  if p_environment not in ('sandbox', 'production')
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_drain_authorization_invalid';
  end if;
  if not exists (
    select 1 from public.ghl_runtime_controls controls
    where controls.environment = p_environment
      and controls.inbound_form_sweep_enabled = false
  ) then
    raise exception 'ghl_form_sweep_drain_requires_closed_runtime';
  end if;
  update public.ghl_inbound_form_sweep_runs run set
    status = 'retryable_failure',
    last_error_code = 'ghl_form_sweep_worker_lease_expired_during_fence',
    locked_by = null, locked_at = null, locked_until = null, lease_token = null,
    completed_at = p_now,
    updated_at = p_now
  where run.environment = p_environment
    and run.status = 'processing'
    and run.locked_until <= p_now;
  update public.ghl_inbound_form_sweep_cursors cursor_record set
    attempt_count = greatest(cursor_record.attempt_count - 1, 0),
    next_retry_at = p_now + interval '30 seconds',
    last_error_code = 'ghl_form_sweep_worker_lease_expired_during_fence',
    updated_at = p_now
  where cursor_record.environment = p_environment
    and exists (
      select 1 from public.ghl_inbound_form_sweep_runs run
      where run.cursor_id = cursor_record.id
        and run.status = 'retryable_failure'
        and run.last_error_code = 'ghl_form_sweep_worker_lease_expired_during_fence'
        and run.completed_at = p_now
    );
  update public.ghl_form_sweep_attestation_refresh_states state set
    status = 'due', attempt_count = greatest(state.attempt_count - 1, 0),
    next_refresh_at = p_now + interval '30 seconds',
    worker_id = null, locked_at = null, locked_until = null, lease_token = null,
    last_error_code = 'ghl_form_sweep_refresh_lease_expired_during_fence',
    updated_at = p_now
  where state.environment = p_environment and state.status = 'processing'
    and state.locked_until <= timezone('utc', now());
  select count(*)::integer into active_claim_count
  from public.ghl_inbound_form_sweep_runs run
  where run.environment = p_environment and run.status = 'processing';
  active_claim_count := active_claim_count + (
    select count(*)::integer from public.ghl_form_sweep_attestation_refresh_states state
    where state.environment = p_environment and state.status = 'processing'
  );
  return active_claim_count;
end;
$$;

create or replace function public.claim_next_ghl_inbound_form_sweep_v1(
  p_environment text,
  p_worker_id text,
  p_now timestamptz default timezone('utc', now()),
  p_lease_ms integer default 90000,
  p_sync_registry boolean default true
)
returns table(
  run_id uuid,
  cursor_id uuid,
  organization_id uuid,
  location_mapping_id uuid,
  provider_location_id text,
  provider_form_id text,
  allowed_field_ids jsonb,
  route_fingerprint text,
  authority_fingerprint text,
  credential_generation bigint,
  window_start timestamptz,
  window_end timestamptz,
  attempt_count integer,
  lease_token uuid,
  lease_generation bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  mapping_record record;
  route_record record;
  cursor_record public.ghl_inbound_form_sweep_cursors%rowtype;
  run_record public.ghl_inbound_form_sweep_runs%rowtype;
  closed_through timestamptz := p_now - interval '5 minutes';
  readiness_at timestamptz;
  initial_anchor timestamptz;
  route_fingerprint_value text;
  authority_fingerprint_value text;
  anchor_fingerprint_value text;
  next_generation bigint;
begin
  if p_environment not in ('sandbox', 'production')
     or trim(coalesce(p_worker_id, '')) !~ '^[A-Za-z0-9@._:-]{3,180}$'
     or p_lease_ms not between 10000 and 120000
     or p_sync_registry is null
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_claim_invalid';
  end if;
  if not exists (
    select 1 from public.ghl_runtime_controls controls
    where controls.environment = p_environment
      and controls.inbound_form_reconciliation_enabled
      and controls.inbound_form_sweep_enabled
  ) then
    raise exception 'ghl_form_sweep_database_gate_closed';
  end if;

  if p_sync_registry then

  -- Recover expired leases without advancing their cursors. A fresh claim is
  -- a new immutable run/lease generation, so stale workers cannot settle it.
  update public.ghl_inbound_form_sweep_runs run set
    status = 'retryable_failure',
    last_error_code = 'ghl_form_sweep_worker_lease_expired',
    locked_by = null, locked_at = null, locked_until = null, lease_token = null,
    completed_at = p_now,
    updated_at = p_now
  where run.environment = p_environment
    and run.status = 'processing'
    and run.locked_until <= p_now;
  update public.ghl_inbound_form_sweep_cursors candidate set
    attempt_count = greatest(candidate.attempt_count - 1, 0),
    next_retry_at = least(coalesce(candidate.next_retry_at, p_now), p_now),
    last_error_code = 'ghl_form_sweep_worker_lease_expired',
    updated_at = p_now
  where candidate.environment = p_environment
    and exists (
      select 1 from public.ghl_inbound_form_sweep_runs expired
      where expired.cursor_id = candidate.id
        and expired.status = 'retryable_failure'
        and expired.last_error_code = 'ghl_form_sweep_worker_lease_expired'
        and expired.completed_at = p_now
    );

  -- Materialize exactly one cursor for each current active mapping/form route.
  -- Initial history never predates route readiness, credential attestation, or
  -- a bounded 24-hour lookback. ON CONFLICT intentionally preserves the
  -- durable cursor/anchor across gate re-enables and safe reactivation.
  for mapping_record in
    select mapping.*
    from public.ghl_location_mappings mapping
    where mapping.environment = p_environment and mapping.status = 'active'
      and mapping.forms_readonly_scope_attested_at between p_now - interval '15 minutes' and p_now + interval '5 minutes'
      and private.current_ghl_form_sweep_scope_proof_valid_v1(
        mapping.organization_id, mapping.id, mapping.environment,
        mapping.provider_location_id, mapping.forms_readonly_credential_generation,
        mapping.forms_readonly_scope_attested_at
      )
    order by mapping.id
  loop
    authority_fingerprint_value := private.current_ghl_form_sweep_authority_fingerprint_v1(
      mapping_record.organization_id, mapping_record.id, mapping_record.environment
    );
    if authority_fingerprint_value is null then continue; end if;
    for route_record in
      select route.* from public.list_ghl_inbound_eligible_form_routes_v1(
        mapping_record.organization_id, mapping_record.id, mapping_record.environment
      ) route order by route.provider_form_id
    loop
      route_fingerprint_value := private.current_ghl_form_sweep_route_fingerprint_v1(
        mapping_record.organization_id, mapping_record.id, mapping_record.environment,
        route_record.provider_form_id
      );
      select max(personalization.verified_at) into readiness_at
      from public.ghl_location_personalizations personalization
      where personalization.organization_id = mapping_record.organization_id
        and personalization.location_mapping_id = mapping_record.id
        and personalization.environment = mapping_record.environment
        and personalization.required_form_ids ? route_record.provider_form_id
        and personalization.status = 'ready'
        and personalization.current_step = 'ready';
      initial_anchor := greatest(
        closed_through - interval '24 hours',
        mapping_record.snapshot_verified_at,
        mapping_record.required_objects_verified_at,
        readiness_at
      );
      anchor_fingerprint_value := encode(extensions.digest(convert_to(jsonb_build_object(
        'mappingId', mapping_record.id,
        'providerFormId', route_record.provider_form_id,
        'anchorAt', initial_anchor,
        'reason', 'max(mapping_ready,route_ready,bounded_lookback)'
      )::text, 'utf8'), 'sha256'), 'hex');
      insert into public.ghl_inbound_form_sweep_cursors (
        organization_id, location_mapping_id, environment, provider_location_id,
        provider_form_id, allowed_field_ids, route_fingerprint, authority_fingerprint, credential_generation,
        anchor_at, anchor_reason, anchor_fingerprint, cursor_through, created_at, updated_at
      ) values (
        mapping_record.organization_id, mapping_record.id, mapping_record.environment,
        mapping_record.provider_location_id, route_record.provider_form_id,
        route_record.allowed_field_ids, route_fingerprint_value, authority_fingerprint_value,
        mapping_record.forms_readonly_credential_generation,
        initial_anchor, 'max(mapping_ready,route_ready,bounded_lookback)',
        anchor_fingerprint_value, initial_anchor, p_now, p_now
      ) on conflict on constraint ghl_inbound_form_sweep_cursor_route_unique do update set
        allowed_field_ids = excluded.allowed_field_ids,
        route_fingerprint = excluded.route_fingerprint,
        authority_fingerprint = excluded.authority_fingerprint,
        credential_generation = excluded.credential_generation,
        attempt_count = case
          when public.ghl_inbound_form_sweep_cursors.credential_generation
            is distinct from excluded.credential_generation then 0
          else public.ghl_inbound_form_sweep_cursors.attempt_count
        end,
        next_retry_at = case
          when public.ghl_inbound_form_sweep_cursors.credential_generation
            is distinct from excluded.credential_generation then excluded.updated_at
          else public.ghl_inbound_form_sweep_cursors.next_retry_at
        end,
        replay_count = case
          when public.ghl_inbound_form_sweep_cursors.credential_generation
            is distinct from excluded.credential_generation then 0
          else public.ghl_inbound_form_sweep_cursors.replay_count
        end,
        replay_history = case
          when public.ghl_inbound_form_sweep_cursors.credential_generation
            is distinct from excluded.credential_generation then '[]'::jsonb
          else public.ghl_inbound_form_sweep_cursors.replay_history
        end,
        last_replayed_at = case
          when public.ghl_inbound_form_sweep_cursors.credential_generation
            is distinct from excluded.credential_generation then null
          else public.ghl_inbound_form_sweep_cursors.last_replayed_at
        end,
        last_replayed_by = case
          when public.ghl_inbound_form_sweep_cursors.credential_generation
            is distinct from excluded.credential_generation then null
          else public.ghl_inbound_form_sweep_cursors.last_replayed_by
        end,
        last_replay_reason = case
          when public.ghl_inbound_form_sweep_cursors.credential_generation
            is distinct from excluded.credential_generation then null
          else public.ghl_inbound_form_sweep_cursors.last_replay_reason
        end,
        anchor_at = case
          when public.ghl_inbound_form_sweep_cursors.status = 'retired'
            then greatest(public.ghl_inbound_form_sweep_cursors.anchor_at, excluded.anchor_at)
          else public.ghl_inbound_form_sweep_cursors.anchor_at
        end,
        anchor_fingerprint = case
          when public.ghl_inbound_form_sweep_cursors.status = 'retired'
            then excluded.anchor_fingerprint
          else public.ghl_inbound_form_sweep_cursors.anchor_fingerprint
        end,
        cursor_through = case
          when public.ghl_inbound_form_sweep_cursors.status = 'retired'
            then greatest(public.ghl_inbound_form_sweep_cursors.cursor_through, excluded.anchor_at)
          else public.ghl_inbound_form_sweep_cursors.cursor_through
        end,
        status = case
          when public.ghl_inbound_form_sweep_cursors.status = 'retired'
            or public.ghl_inbound_form_sweep_cursors.credential_generation
              is distinct from excluded.credential_generation then 'active'
          else public.ghl_inbound_form_sweep_cursors.status
        end,
        last_error_code = case
          when public.ghl_inbound_form_sweep_cursors.status = 'retired'
            or public.ghl_inbound_form_sweep_cursors.credential_generation
              is distinct from excluded.credential_generation then null
          when public.ghl_inbound_form_sweep_cursors.last_error_code in (
            'ghl_form_sweep_authority_stale', 'ghl_form_sweep_lag_sla_warning',
            'ghl_form_sweep_backfill_active'
          ) then null
          else public.ghl_inbound_form_sweep_cursors.last_error_code
        end,
        updated_at = excluded.updated_at
      where not exists (
        select 1 from public.ghl_inbound_form_sweep_runs live
        where live.cursor_id = public.ghl_inbound_form_sweep_cursors.id
          and live.status = 'processing'
      );
    end loop;
  end loop;

  update public.ghl_inbound_form_sweep_cursors candidate set
    status = 'retired', next_retry_at = null,
    last_error_code = 'ghl_form_sweep_route_retired', updated_at = p_now
  where candidate.environment = p_environment
    and candidate.status in ('active', 'operator_action_required')
    and (
      not exists (
        select 1 from public.ghl_location_mappings mapping
        where mapping.id = candidate.location_mapping_id
          and mapping.organization_id = candidate.organization_id
          and mapping.environment = candidate.environment
          and mapping.provider_location_id = candidate.provider_location_id
          and mapping.status = 'active'
      )
      or private.current_ghl_form_sweep_route_fingerprint_v1(
        candidate.organization_id, candidate.location_mapping_id,
        candidate.environment, candidate.provider_form_id
      ) is null
    )
    and not exists (
      select 1 from public.ghl_inbound_form_sweep_runs live
      where live.cursor_id = candidate.id and live.status = 'processing'
    );

  update public.ghl_inbound_form_sweep_cursors candidate set
    last_error_code = 'ghl_form_sweep_authority_stale',
    last_observed_lag_seconds = greatest(0, extract(epoch from closed_through - candidate.cursor_through)::integer),
    updated_at = p_now
  where candidate.environment = p_environment
    and candidate.status = 'active'
    and exists (
      select 1 from public.ghl_location_mappings mapping
      where mapping.id = candidate.location_mapping_id
        and mapping.organization_id = candidate.organization_id
        and mapping.environment = candidate.environment
        and mapping.status = 'active'
        and (
          mapping.forms_readonly_scope_attested_at not between p_now - interval '15 minutes' and p_now + interval '5 minutes'
          or not private.current_ghl_form_sweep_scope_proof_valid_v1(
            mapping.organization_id, mapping.id, mapping.environment,
            mapping.provider_location_id, mapping.forms_readonly_credential_generation,
            mapping.forms_readonly_scope_attested_at
          )
        )
    );

  update public.ghl_inbound_form_sweep_cursors candidate set
    last_error_code = case
      when closed_through - candidate.cursor_through > interval '2 hours'
        then 'ghl_form_sweep_backfill_active'
      else 'ghl_form_sweep_lag_sla_warning'
    end,
    last_observed_lag_seconds = greatest(0, extract(epoch from closed_through - candidate.cursor_through)::integer),
    updated_at = p_now
  where candidate.environment = p_environment
    and candidate.status = 'active'
    and closed_through - candidate.cursor_through > interval '30 minutes'
    and candidate.last_error_code is distinct from 'ghl_form_sweep_authority_stale';

  update public.ghl_inbound_form_sweep_cursors candidate set
    status = 'operator_action_required', next_retry_at = null,
    last_error_code = case
      when candidate.cursor_through < candidate.anchor_at
        or candidate.cursor_through > p_now + interval '5 minutes'
        then 'ghl_form_sweep_cursor_integrity_invalid'
      else 'ghl_form_sweep_attempts_exhausted'
    end,
    last_observed_lag_seconds = greatest(0, extract(epoch from closed_through - candidate.cursor_through)::integer),
    updated_at = p_now
  where candidate.environment = p_environment
    and candidate.status = 'active'
    and (
      candidate.cursor_through < candidate.anchor_at
      or candidate.cursor_through > p_now + interval '5 minutes'
      or candidate.attempt_count >= candidate.max_attempts
    );
  end if;

  select candidate.* into cursor_record
  from public.ghl_inbound_form_sweep_cursors candidate
  where candidate.environment = p_environment
    and candidate.status = 'active'
    and candidate.cursor_through < closed_through
    and coalesce(candidate.next_retry_at, '-infinity'::timestamptz) <= p_now
    and candidate.route_fingerprint = private.current_ghl_form_sweep_route_fingerprint_v1(
      candidate.organization_id, candidate.location_mapping_id,
      candidate.environment, candidate.provider_form_id
    )
    and candidate.authority_fingerprint = private.current_ghl_form_sweep_authority_fingerprint_v1(
      candidate.organization_id, candidate.location_mapping_id, candidate.environment
    )
    and exists (
      select 1 from public.ghl_location_mappings fresh_mapping
      where fresh_mapping.id = candidate.location_mapping_id
        and fresh_mapping.organization_id = candidate.organization_id
        and fresh_mapping.environment = candidate.environment
        and fresh_mapping.provider_location_id = candidate.provider_location_id
        and fresh_mapping.status = 'active'
        and fresh_mapping.forms_readonly_scope_attested_at
          between p_now - interval '15 minutes' and p_now + interval '5 minutes'
        and private.current_ghl_form_sweep_scope_proof_valid_v1(
          fresh_mapping.organization_id, fresh_mapping.id, fresh_mapping.environment,
          fresh_mapping.provider_location_id, fresh_mapping.forms_readonly_credential_generation,
          fresh_mapping.forms_readonly_scope_attested_at
        )
    )
    and not exists (
      select 1 from public.ghl_inbound_form_sweep_runs live
      where live.cursor_id = candidate.id and live.status = 'processing'
    )
  order by candidate.cursor_through, candidate.last_success_at nulls first, candidate.id
  for update skip locked
  limit 1;
  if not found then return; end if;

  select coalesce(max(prior.lease_generation), 0) + 1 into next_generation
  from public.ghl_inbound_form_sweep_runs prior where prior.cursor_id = cursor_record.id;
  insert into public.ghl_inbound_form_sweep_runs (
    cursor_id, organization_id, location_mapping_id, environment,
    provider_location_id, provider_form_id, allowed_field_ids,
    route_fingerprint, authority_fingerprint, credential_generation, cursor_before, window_start, window_end,
    attempt_count, worker_id, locked_by, locked_at, locked_until, lease_token, lease_generation,
    created_at, updated_at
  ) values (
    cursor_record.id, cursor_record.organization_id, cursor_record.location_mapping_id,
    cursor_record.environment, cursor_record.provider_location_id, cursor_record.provider_form_id,
    cursor_record.allowed_field_ids, cursor_record.route_fingerprint, cursor_record.authority_fingerprint,
    cursor_record.credential_generation,
    cursor_record.cursor_through, greatest(
      cursor_record.cursor_through - interval '10 minutes', cursor_record.anchor_at
    ),
    least(cursor_record.cursor_through + interval '1 hour', closed_through),
    cursor_record.attempt_count + 1, trim(p_worker_id), trim(p_worker_id), p_now,
    p_now + make_interval(secs => p_lease_ms::numeric / 1000), gen_random_uuid(),
    next_generation, p_now, p_now
  ) returning * into strict run_record;
  update public.ghl_inbound_form_sweep_cursors candidate set
    attempt_count = run_record.attempt_count,
    next_retry_at = null,
    last_observed_lag_seconds = greatest(0, extract(epoch from closed_through - candidate.cursor_through)::integer),
    updated_at = p_now
  where candidate.id = cursor_record.id;

  return query select run_record.id, run_record.cursor_id, run_record.organization_id,
    run_record.location_mapping_id, run_record.provider_location_id, run_record.provider_form_id,
    run_record.allowed_field_ids, run_record.route_fingerprint, run_record.authority_fingerprint,
    run_record.credential_generation, run_record.window_start, run_record.window_end, run_record.attempt_count,
    run_record.lease_token, run_record.lease_generation;
end;
$$;

create or replace function public.validate_ghl_inbound_form_sweep_dispatch_v1(
  p_run_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_now timestamptz default timezone('utc', now())
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  run_record public.ghl_inbound_form_sweep_runs%rowtype;
begin
  if p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_dispatch_time_invalid';
  end if;
  select * into strict run_record
  from public.ghl_inbound_form_sweep_runs run
  where run.id = p_run_id and run.status = 'processing'
    and run.locked_by = trim(p_worker_id)
    and run.lease_token = p_lease_token
    and run.lease_generation = p_lease_generation
    and run.locked_until > timezone('utc', now());
  if not exists (
    select 1 from public.ghl_runtime_controls controls
    where controls.environment = run_record.environment
      and controls.inbound_form_reconciliation_enabled
      and controls.inbound_form_sweep_enabled
  )
  or run_record.route_fingerprint is distinct from
    private.current_ghl_form_sweep_route_fingerprint_v1(
      run_record.organization_id, run_record.location_mapping_id,
      run_record.environment, run_record.provider_form_id
    )
  or run_record.authority_fingerprint is distinct from
    private.current_ghl_form_sweep_authority_fingerprint_v1(
      run_record.organization_id, run_record.location_mapping_id, run_record.environment
    )
  or not exists (
    select 1 from public.ghl_location_mappings mapping
    where mapping.id = run_record.location_mapping_id
      and mapping.organization_id = run_record.organization_id
      and mapping.environment = run_record.environment
      and mapping.provider_location_id = run_record.provider_location_id
      and mapping.status = 'active'
      and mapping.forms_readonly_credential_generation = run_record.credential_generation
      and mapping.forms_readonly_scope_attested_at
        between p_now - interval '15 minutes' and p_now + interval '5 minutes'
      and private.current_ghl_form_sweep_scope_proof_valid_v1(
        mapping.organization_id, mapping.id, mapping.environment,
        mapping.provider_location_id, mapping.forms_readonly_credential_generation,
        mapping.forms_readonly_scope_attested_at
      )
  ) then
    raise exception 'ghl_form_sweep_dispatch_scope_changed';
  end if;
  return true;
end;
$$;

create or replace function public.fail_ghl_inbound_form_sweep_v1(
  p_run_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_disposition text,
  p_error_code text,
  p_provider_request_ids jsonb default '[]'::jsonb,
  p_response_fingerprint text default null,
  p_retry_after_ms integer default null,
  p_now timestamptz default timezone('utc', now())
)
returns public.ghl_inbound_form_sweep_runs
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  run_record public.ghl_inbound_form_sweep_runs%rowtype;
  result_record public.ghl_inbound_form_sweep_runs%rowtype;
begin
  if p_disposition not in ('retryable_failure', 'operator_action_required')
     or coalesce(p_error_code, '') !~ '^[a-z0-9_:-]{3,180}$'
     or not private.ghl_form_sweep_request_ids_valid_v1(p_provider_request_ids)
     or (p_response_fingerprint is not null and p_response_fingerprint !~ '^[a-f0-9]{64}$')
     or (p_retry_after_ms is not null and p_retry_after_ms not between 1000 and 900000)
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_failure_contract_invalid';
  end if;
  select * into strict run_record
  from public.ghl_inbound_form_sweep_runs run
  where run.id = p_run_id and run.status = 'processing'
    and run.locked_by = trim(p_worker_id)
    and run.lease_token = p_lease_token
    and run.lease_generation = p_lease_generation
    and run.locked_until > p_now
    and run.locked_until > timezone('utc', now())
  for update;

  update public.ghl_inbound_form_sweep_runs run set
    status = p_disposition,
    provider_request_ids = p_provider_request_ids,
    response_fingerprint = p_response_fingerprint,
    last_error_code = p_error_code,
    locked_by = null, locked_at = null, locked_until = null, lease_token = null,
    completed_at = p_now, updated_at = p_now
  where run.id = run_record.id returning * into strict result_record;
  update public.ghl_inbound_form_sweep_cursors cursor_record set
    status = case when p_disposition = 'operator_action_required'
      then 'operator_action_required' else cursor_record.status end,
    next_retry_at = case when p_disposition = 'retryable_failure'
      then p_now + make_interval(secs => coalesce(p_retry_after_ms, 30000)::numeric / 1000)
      else null end,
    last_error_code = p_error_code,
    updated_at = p_now
  where cursor_record.id = run_record.cursor_id
    and cursor_record.cursor_through = run_record.cursor_before;
  if not found then raise exception 'ghl_form_sweep_cursor_fence_lost'; end if;
  return result_record;
end;
$$;

create or replace function public.complete_ghl_inbound_form_sweep_v1(
  p_run_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_submissions jsonb,
  p_provider_request_ids jsonb,
  p_response_fingerprint text,
  p_page_count integer,
  p_observed_total integer,
  p_now timestamptz default timezone('utc', now())
)
returns public.ghl_inbound_form_sweep_runs
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  run_record public.ghl_inbound_form_sweep_runs%rowtype;
  result_record public.ghl_inbound_form_sweep_runs%rowtype;
  cursor_record public.ghl_inbound_form_sweep_cursors%rowtype;
  submission jsonb;
  event_record public.ghl_lifecycle_webhook_events%rowtype;
  existing_binding public.ghl_inbound_form_submission_bindings%rowtype;
  submitted_at_value timestamptz;
  provider_event_id_value text;
  enqueued_count integer := 0;
  inserted_reconciliation_count integer := 0;
  exact_count integer;
begin
  if jsonb_typeof(p_submissions) is distinct from 'array'
     or jsonb_array_length(p_submissions) > 1000
     or not private.ghl_form_sweep_request_ids_valid_v1(p_provider_request_ids)
     or p_response_fingerprint !~ '^[a-f0-9]{64}$'
     or p_page_count not between 1 and 10
     or p_observed_total not between 0 and 1000
     or p_page_count <> greatest(1, (p_observed_total + 99) / 100)
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_success_contract_invalid';
  end if;
  exact_count := jsonb_array_length(p_submissions);
  if exact_count > p_observed_total
     or exists (
       select 1 from jsonb_array_elements(p_submissions) item
       where jsonb_typeof(item) <> 'object'
          or (select count(*) from jsonb_object_keys(item)) <> 5
          or exists (
            select 1 from jsonb_object_keys(item) key
            where key not in (
              'providerSubmissionId', 'providerFormId', 'providerContactId',
              'submittedAt', 'submissionFingerprint'
            )
          )
          or coalesce(item ->> 'providerSubmissionId', '') !~ '^[A-Za-z0-9_-]{3,180}$'
          or coalesce(item ->> 'providerFormId', '') !~ '^[A-Za-z0-9_-]{3,180}$'
          or coalesce(item ->> 'providerContactId', '') !~ '^[A-Za-z0-9_-]{3,180}$'
          or coalesce(item ->> 'submissionFingerprint', '') !~ '^[a-f0-9]{64}$'
          or coalesce(item ->> 'submittedAt', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$'
     )
     or exact_count <> (
       select count(distinct item ->> 'providerSubmissionId')
       from jsonb_array_elements(p_submissions) item
     ) then
    raise exception 'ghl_form_sweep_submission_identity_invalid';
  end if;

  select * into strict run_record
  from public.ghl_inbound_form_sweep_runs run
  where run.id = p_run_id and run.status = 'processing'
    and run.locked_by = trim(p_worker_id)
    and run.lease_token = p_lease_token
    and run.lease_generation = p_lease_generation
    and run.locked_until > p_now
    and run.locked_until > timezone('utc', now())
  for update;
  select * into strict cursor_record
  from public.ghl_inbound_form_sweep_cursors cursor_value
  where cursor_value.id = run_record.cursor_id
    and cursor_value.status = 'active'
    and cursor_value.cursor_through = run_record.cursor_before
  for update;
  if not exists (
    select 1 from public.ghl_runtime_controls controls
    where controls.environment = run_record.environment
      and controls.inbound_form_reconciliation_enabled
      and controls.inbound_form_sweep_enabled
  ) then raise exception 'ghl_form_sweep_database_gate_closed_before_settlement'; end if;
  if run_record.route_fingerprint is distinct from
      private.current_ghl_form_sweep_route_fingerprint_v1(
        run_record.organization_id, run_record.location_mapping_id,
        run_record.environment, run_record.provider_form_id
      )
     or run_record.authority_fingerprint is distinct from
      private.current_ghl_form_sweep_authority_fingerprint_v1(
        run_record.organization_id, run_record.location_mapping_id, run_record.environment
      )
     or not exists (
       select 1 from public.ghl_location_mappings mapping
       where mapping.id = run_record.location_mapping_id
         and mapping.organization_id = run_record.organization_id
         and mapping.environment = run_record.environment
         and mapping.provider_location_id = run_record.provider_location_id
         and mapping.status = 'active'
         and mapping.forms_readonly_credential_generation = run_record.credential_generation
         and mapping.forms_readonly_scope_attested_at
           between p_now - interval '15 minutes' and p_now + interval '5 minutes'
         and private.current_ghl_form_sweep_scope_proof_valid_v1(
           mapping.organization_id, mapping.id, mapping.environment,
           mapping.provider_location_id, mapping.forms_readonly_credential_generation,
           mapping.forms_readonly_scope_attested_at
         )
     ) then
    raise exception 'ghl_form_sweep_route_or_authority_fence_changed';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_submissions) item
    where item ->> 'providerFormId' <> run_record.provider_form_id
       or (item ->> 'submittedAt')::timestamptz < run_record.window_start
       or (item ->> 'submittedAt')::timestamptz >= run_record.window_end
  ) then raise exception 'ghl_form_sweep_exact_window_scope_mismatch'; end if;

  -- Detect every stable-id/fingerprint conflict before creating any receipt.
  for submission in select item from jsonb_array_elements(p_submissions) item loop
    select * into existing_binding
    from public.ghl_inbound_form_submission_bindings binding
    where binding.location_mapping_id = run_record.location_mapping_id
      and binding.provider_submission_id = submission ->> 'providerSubmissionId';
    if found and (
      existing_binding.provider_form_id is distinct from submission ->> 'providerFormId'
      or existing_binding.provider_contact_id is distinct from submission ->> 'providerContactId'
      or existing_binding.submission_fingerprint is distinct from submission ->> 'submissionFingerprint'
    ) then raise exception 'ghl_form_sweep_submission_idempotency_conflict'; end if;
  end loop;

  for submission in
    select item from jsonb_array_elements(p_submissions) item
    order by item ->> 'submittedAt', item ->> 'providerSubmissionId'
  loop
    if exists (
      select 1 from public.ghl_inbound_form_submission_bindings binding
      where binding.location_mapping_id = run_record.location_mapping_id
        and binding.provider_submission_id = submission ->> 'providerSubmissionId'
    ) then continue; end if;
    submitted_at_value := (submission ->> 'submittedAt')::timestamptz;
    provider_event_id_value := 'sweep:' || (submission ->> 'providerSubmissionId');
    insert into public.ghl_lifecycle_webhook_events (
      organization_id, location_mapping_id, provider_event_id, event_type,
      provider_object_id, provider_contact_id, provider_updated_at,
      signature_algorithm, receipt_source, payload_fingerprint,
      projection_status, projection_code, received_at
    ) values (
      run_record.organization_id, run_record.location_mapping_id,
      provider_event_id_value, 'FormSubmissionSweep',
      submission ->> 'providerSubmissionId', submission ->> 'providerContactId',
      submitted_at_value, 'provider_api_read', 'provider_api_read',
      submission ->> 'submissionFingerprint', 'reconciliation_pending',
      'provider_api_read_form_submission_requires_reconciliation', p_now
    ) on conflict (location_mapping_id, provider_event_id) do nothing;
    select * into strict event_record
    from public.ghl_lifecycle_webhook_events event
    where event.location_mapping_id = run_record.location_mapping_id
      and event.provider_event_id = provider_event_id_value
    for update;
    if event_record.organization_id is distinct from run_record.organization_id
       or event_record.event_type <> 'FormSubmissionSweep'
       or event_record.provider_object_id <> submission ->> 'providerSubmissionId'
       or event_record.provider_contact_id <> submission ->> 'providerContactId'
       or event_record.provider_updated_at is distinct from submitted_at_value
       or event_record.signature_algorithm <> 'provider_api_read'
       or event_record.receipt_source <> 'provider_api_read'
       or event_record.payload_fingerprint <> submission ->> 'submissionFingerprint' then
      raise exception 'ghl_form_sweep_receipt_idempotency_conflict';
    end if;
    insert into public.ghl_inbound_form_reconciliations (
      organization_id, location_mapping_id, lifecycle_event_id, environment,
      provider_contact_id, reconciliation_window_start, reconciliation_window_end,
      created_at, updated_at
    ) values (
      run_record.organization_id, run_record.location_mapping_id, event_record.id,
      run_record.environment, submission ->> 'providerContactId',
      submitted_at_value - interval '10 minutes', submitted_at_value + interval '10 minutes',
      p_now, p_now
    ) on conflict (lifecycle_event_id) do nothing;
    get diagnostics inserted_reconciliation_count = row_count;
    enqueued_count := enqueued_count + inserted_reconciliation_count;
  end loop;

  update public.ghl_inbound_form_sweep_runs run set
    status = 'succeeded', provider_request_ids = p_provider_request_ids,
    response_fingerprint = p_response_fingerprint, page_count = p_page_count,
    observed_total = p_observed_total, exact_window_submission_count = exact_count,
    enqueued_reconciliation_count = enqueued_count, last_error_code = null,
    locked_by = null, locked_at = null, locked_until = null, lease_token = null,
    completed_at = p_now, updated_at = p_now
  where run.id = run_record.id returning * into strict result_record;
  update public.ghl_inbound_form_sweep_cursors cursor_value set
    cursor_through = run_record.window_end,
    attempt_count = 0,
    next_retry_at = run_record.window_end + interval '15 minutes',
    last_success_at = p_now,
    last_observed_lag_seconds = greatest(0, extract(epoch from (p_now - interval '5 minutes') - run_record.window_end)::integer),
    last_error_code = null,
    updated_at = p_now
  where cursor_value.id = run_record.cursor_id
    and cursor_value.cursor_through = run_record.cursor_before;
  if not found then raise exception 'ghl_form_sweep_cursor_fence_lost'; end if;
  return result_record;
end;
$$;

create or replace function public.replay_ghl_inbound_form_sweep_cursor_v1(
  p_cursor_id uuid,
  p_organization_id uuid,
  p_environment text,
  p_reason text,
  p_actor text,
  p_authorization text,
  p_now timestamptz
)
returns public.ghl_inbound_form_sweep_cursors
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  cursor_record public.ghl_inbound_form_sweep_cursors%rowtype;
begin
  if p_environment not in ('sandbox', 'production')
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500
     or trim(coalesce(p_actor, '')) !~ '^[A-Za-z0-9@._:-]{3,180}$'
     or p_authorization <> 'DEALFLOW_GHL_FORM_SWEEP_CURSOR_REPLAY_V1'
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_cursor_replay_authorization_invalid';
  end if;
  if not exists (
    select 1 from public.ghl_runtime_controls controls
    where controls.environment = p_environment and controls.inbound_form_sweep_enabled = false
  ) then raise exception 'ghl_form_sweep_cursor_replay_requires_closed_runtime'; end if;
  select * into strict cursor_record
  from public.ghl_inbound_form_sweep_cursors cursor_value
  where cursor_value.id = p_cursor_id
    and cursor_value.organization_id = p_organization_id
    and cursor_value.environment = p_environment
    and cursor_value.status = 'operator_action_required'
  for update;
  if exists (
    select 1 from public.ghl_inbound_form_sweep_runs run
    where run.cursor_id = cursor_record.id and run.status = 'processing'
  ) then raise exception 'ghl_form_sweep_cursor_replay_requires_zero_live_leases'; end if;
  if cursor_record.cursor_through < cursor_record.anchor_at
     or cursor_record.cursor_through > p_now + interval '5 minutes'
     or (p_now - interval '5 minutes') - cursor_record.cursor_through > interval '24 hours' then
    raise exception 'ghl_form_sweep_cursor_replay_requires_backfill_decision';
  end if;
  if cursor_record.route_fingerprint is distinct from
      private.current_ghl_form_sweep_route_fingerprint_v1(
        cursor_record.organization_id, cursor_record.location_mapping_id,
        cursor_record.environment, cursor_record.provider_form_id
      )
     or cursor_record.authority_fingerprint is distinct from
      private.current_ghl_form_sweep_authority_fingerprint_v1(
        cursor_record.organization_id, cursor_record.location_mapping_id, cursor_record.environment
      )
     or not exists (
       select 1 from public.ghl_location_mappings mapping
       where mapping.id = cursor_record.location_mapping_id
         and mapping.organization_id = cursor_record.organization_id
         and mapping.environment = cursor_record.environment
         and mapping.provider_location_id = cursor_record.provider_location_id
         and mapping.status = 'active'
         and mapping.forms_readonly_credential_generation = cursor_record.credential_generation
         and mapping.forms_readonly_scope_attested_at
           between p_now - interval '15 minutes' and p_now + interval '5 minutes'
         and private.current_ghl_form_sweep_scope_proof_valid_v1(
           mapping.organization_id, mapping.id, mapping.environment,
           mapping.provider_location_id, mapping.forms_readonly_credential_generation,
           mapping.forms_readonly_scope_attested_at
         )
     ) then raise exception 'ghl_form_sweep_cursor_replay_scope_changed'; end if;
  if cursor_record.replay_count >= 5 then
    raise exception 'ghl_form_sweep_cursor_replay_limit_reached';
  end if;
  insert into public.ghl_inbound_form_sweep_cursor_replay_audits (
    cursor_id, organization_id, location_mapping_id, environment,
    provider_form_id, credential_generation, replay_ordinal,
    replayed_at, replayed_by, reason, prior_error_code, cursor_through
  ) values (
    cursor_record.id, cursor_record.organization_id, cursor_record.location_mapping_id,
    cursor_record.environment, cursor_record.provider_form_id,
    cursor_record.credential_generation, cursor_record.replay_count + 1,
    p_now, trim(p_actor), trim(p_reason), cursor_record.last_error_code,
    cursor_record.cursor_through
  );
  update public.ghl_inbound_form_sweep_cursors cursor_value set
    status = 'active', attempt_count = 0, next_retry_at = p_now,
    replay_count = cursor_value.replay_count + 1,
    replay_history = cursor_value.replay_history || jsonb_build_array(jsonb_build_object(
      'replayedAt', p_now,
      'replayedBy', trim(p_actor),
      'reason', trim(p_reason),
      'priorErrorCode', cursor_value.last_error_code,
      'cursorThrough', cursor_value.cursor_through
    )),
    last_replayed_at = p_now,
    last_replayed_by = trim(p_actor),
    last_replay_reason = trim(p_reason),
    last_error_code = null, updated_at = p_now
  where cursor_value.id = cursor_record.id returning * into strict cursor_record;
  return cursor_record;
end;
$$;

create or replace function private.refresh_ghl_form_sweep_scope_attestation_v1(
  p_organization_id uuid,
  p_location_mapping_id uuid,
  p_environment text,
  p_provider_location_id text,
  p_verified_form_ids jsonb,
  p_expected_credential_generation bigint,
  p_provider_request_id text,
  p_response_fingerprint text,
  p_now timestamptz
)
returns public.ghl_location_mappings
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  mapping_record public.ghl_location_mappings%rowtype;
  expected_form_ids jsonb;
begin
  if p_environment not in ('sandbox', 'production')
     or p_provider_location_id !~ '^[A-Za-z0-9_-]{3,180}$'
     or jsonb_typeof(p_verified_form_ids) is distinct from 'array'
     or jsonb_array_length(p_verified_form_ids) not between 1 and 25
     or exists (
       select 1 from jsonb_array_elements(p_verified_form_ids) item
       where jsonb_typeof(item) <> 'string'
          or item #>> '{}' !~ '^[A-Za-z0-9_-]{3,180}$'
     )
     or p_expected_credential_generation < 1
     or length(coalesce(p_provider_request_id, '')) > 240
     or (p_provider_request_id is not null and p_provider_request_id ~ '[[:cntrl:]]')
     or p_response_fingerprint !~ '^[a-f0-9]{64}$'
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_attestation_refresh_invalid';
  end if;
  select * into strict mapping_record
  from public.ghl_location_mappings mapping
  where mapping.id = p_location_mapping_id
    and mapping.organization_id = p_organization_id
    and mapping.environment = p_environment
    and mapping.provider_location_id = p_provider_location_id
    and mapping.status = 'active'
    and mapping.forms_readonly_credential_generation = p_expected_credential_generation
    and private.current_ghl_form_sweep_authority_fingerprint_v1(
      mapping.organization_id, mapping.id, mapping.environment
    ) is not null
    and exists (
      select 1 from public.list_ghl_inbound_eligible_form_routes_v1(
        mapping.organization_id, mapping.id, mapping.environment
      ) route
    )
  for update;
  select coalesce(jsonb_agg(route.provider_form_id order by route.provider_form_id), '[]'::jsonb)
  into expected_form_ids
  from public.list_ghl_inbound_eligible_form_routes_v1(
    mapping_record.organization_id, mapping_record.id, mapping_record.environment
  ) route;
  if expected_form_ids is distinct from p_verified_form_ids then
    raise exception 'ghl_form_sweep_attestation_verified_scope_changed';
  end if;
  insert into public.ghl_form_sweep_scope_attestations (
    organization_id, location_mapping_id, environment, provider_location_id,
    credential_generation, verified_form_ids, probe_kind, provider_request_id,
    response_fingerprint, verified_at
  ) values (
    mapping_record.organization_id, mapping_record.id, mapping_record.environment,
    mapping_record.provider_location_id, mapping_record.forms_readonly_credential_generation,
    p_verified_form_ids, 'zero_customer_form_submissions_read',
    nullif(trim(coalesce(p_provider_request_id, '')), ''), p_response_fingerprint, p_now
  );
  update public.ghl_location_mappings mapping set
    forms_readonly_scope_attested_at = p_now,
    updated_at = p_now
  where mapping.id = mapping_record.id
  returning * into strict mapping_record;
  update public.ghl_form_sweep_credential_rotations rotation set
    status = 'provider_verified', verified_at = p_now
  where rotation.location_mapping_id = mapping_record.id
    and rotation.new_generation = mapping_record.forms_readonly_credential_generation
    and rotation.status = 'awaiting_provider_verification';
  return mapping_record;
end;
$$;

-- Provider verification is performed before this call with each exact
-- mapping-bound location credential. The previously committed dual runtime
-- fence remains closed if any validation, binding, proof insertion, or reopen
-- step fails: the complete batch executes in this one database transaction.
create or replace function public.configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v1(
  p_environment text,
  p_bindings jsonb,
  p_enable_periodic_sweep boolean,
  p_actor text,
  p_now timestamptz
)
returns public.ghl_runtime_controls
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  binding_value jsonb;
  sanitized_bindings jsonb;
  mapping_record public.ghl_location_mappings%rowtype;
  result_record public.ghl_runtime_controls%rowtype;
begin
  if p_environment not in ('sandbox', 'production')
     or jsonb_typeof(p_bindings) is distinct from 'array'
     or jsonb_array_length(p_bindings) not between 1 and 1000
     or p_enable_periodic_sweep is null
     or trim(coalesce(p_actor, '')) !~ '^[A-Za-z0-9@._:-]{3,180}$'
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds'
     or exists (
       select 1 from jsonb_array_elements(p_bindings) binding
       where jsonb_typeof(binding) <> 'object'
          or exists (
            select 1 from jsonb_object_keys(binding) key
            where key not in (
              'organizationId', 'mappingId', 'providerLocationId',
              'credentialRef', 'verifiedFormIds',
              'submissionScopeProviderRequestId',
              'submissionScopeResponseFingerprint'
            )
          )
          or not binding ? 'submissionScopeProviderRequestId'
          or not binding ? 'submissionScopeResponseFingerprint'
          or (
            jsonb_typeof(binding -> 'submissionScopeProviderRequestId') <> 'null'
            and (
              jsonb_typeof(binding -> 'submissionScopeProviderRequestId') <> 'string'
              or length(binding ->> 'submissionScopeProviderRequestId') not between 1 and 240
              or binding ->> 'submissionScopeProviderRequestId' ~ '[[:cntrl:]]'
            )
          )
          or coalesce(binding ->> 'submissionScopeResponseFingerprint', '')
            !~ '^[a-f0-9]{64}$'
     ) then
    raise exception 'ghl_form_sweep_verified_authority_batch_invalid';
  end if;

  select * into strict result_record
  from public.ghl_runtime_controls controls
  where controls.environment = p_environment
    and controls.inbound_form_reconciliation_enabled = false
    and controls.inbound_form_sweep_enabled = false
  for update;
  if exists (
    select 1 from public.ghl_inbound_form_reconciliations reconciliation
    where reconciliation.environment = p_environment
      and reconciliation.status = 'processing'
  ) or exists (
    select 1 from public.ghl_inbound_form_sweep_runs run
    where run.environment = p_environment and run.status = 'processing'
  ) or exists (
    select 1 from public.ghl_form_sweep_attestation_refresh_states refresh_state
    where refresh_state.environment = p_environment and refresh_state.status = 'processing'
  ) then
    raise exception 'ghl_form_sweep_verified_authority_batch_requires_drained_workers';
  end if;

  select jsonb_agg(
    binding
      - 'submissionScopeProviderRequestId'
      - 'submissionScopeResponseFingerprint'
    order by binding ->> 'mappingId'
  ) into sanitized_bindings
  from jsonb_array_elements(p_bindings) binding;

  perform set_config('dealflow.ghl_form_sweep_verified_configuration', 'true', true);
  perform set_config(
    'dealflow.ghl_form_sweep_configuration_actor', trim(p_actor), true
  );
  -- This older exact-set RPC also reopens reconciliation, but that state and
  -- every binding remain invisible until this outer transaction commits.
  -- Therefore no worker can observe an authority before the proof loop below.
  result_record := public.configure_ghl_inbound_forms_read_authorities_v1(
    p_environment, sanitized_bindings, p_now
  );

  for binding_value in
    select binding from jsonb_array_elements(p_bindings) binding
    order by binding ->> 'mappingId'
  loop
    select * into strict mapping_record
    from public.ghl_location_mappings mapping
    where mapping.id = (binding_value ->> 'mappingId')::uuid
      and mapping.organization_id = (binding_value ->> 'organizationId')::uuid
      and mapping.environment = p_environment
      and mapping.provider_location_id = binding_value ->> 'providerLocationId'
      and mapping.status = 'active'
    for update;
    mapping_record := private.refresh_ghl_form_sweep_scope_attestation_v1(
      mapping_record.organization_id,
      mapping_record.id,
      mapping_record.environment,
      mapping_record.provider_location_id,
      binding_value -> 'verifiedFormIds',
      mapping_record.forms_readonly_credential_generation,
      nullif(binding_value ->> 'submissionScopeProviderRequestId', ''),
      binding_value ->> 'submissionScopeResponseFingerprint',
      p_now
    );
  end loop;

  result_record := public.set_ghl_inbound_form_sweep_runtime_v1(
    p_environment, p_enable_periodic_sweep, p_now
  );
  return result_record;
end;
$$;

create or replace function public.list_ghl_form_sweep_attestation_refresh_candidates_v1(
  p_environment text,
  p_now timestamptz,
  p_limit integer default 20
)
returns table(
  organization_id uuid,
  location_mapping_id uuid,
  provider_location_id text,
  credential_generation bigint,
  verified_form_ids jsonb
)
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select mapping.organization_id, mapping.id, mapping.provider_location_id,
    mapping.forms_readonly_credential_generation,
    (select jsonb_agg(route.provider_form_id order by route.provider_form_id)
     from public.list_ghl_inbound_eligible_form_routes_v1(
       mapping.organization_id, mapping.id, mapping.environment
     ) route) as verified_form_ids
  from public.ghl_location_mappings mapping
  where p_environment in ('sandbox', 'production')
    and p_limit between 1 and 100
    and p_now between timezone('utc', now()) - interval '60 seconds'
      and timezone('utc', now()) + interval '60 seconds'
    and mapping.environment = p_environment
    and mapping.status = 'active'
    and mapping.forms_readonly_credential_generation > 0
    and private.current_ghl_form_sweep_authority_fingerprint_v1(
      mapping.organization_id, mapping.id, mapping.environment
    ) is not null
    and exists (
      select 1 from public.ghl_runtime_controls controls
      where controls.environment = p_environment
        and controls.inbound_form_reconciliation_enabled
        and controls.inbound_form_sweep_enabled
    )
    and exists (
      select 1 from public.list_ghl_inbound_eligible_form_routes_v1(
        mapping.organization_id, mapping.id, mapping.environment
      ) route
    )
    and (
      mapping.forms_readonly_scope_attested_at is null
      or mapping.forms_readonly_scope_attested_at < p_now - interval '10 minutes'
    )
  order by mapping.forms_readonly_scope_attested_at nulls first, mapping.id
  limit p_limit
$$;

create or replace function public.claim_ghl_form_sweep_attestation_refresh_batch_v1(
  p_environment text,
  p_worker_id text,
  p_now timestamptz,
  p_limit integer default 100,
  p_lease_ms integer default 30000,
  p_sync_registry boolean default true
)
returns table(
  state_id uuid,
  organization_id uuid,
  location_mapping_id uuid,
  provider_location_id text,
  credential_generation bigint,
  verified_form_ids jsonb,
  attempt_count integer,
  lease_token uuid,
  lease_generation bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if p_environment not in ('sandbox', 'production')
     or trim(coalesce(p_worker_id, '')) !~ '^[A-Za-z0-9@._:-]{3,180}$'
     or p_limit not between 1 and 100
     or p_lease_ms not between 10000 and 60000
     or p_sync_registry is null
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_refresh_claim_invalid';
  end if;
  if not exists (
    select 1 from public.ghl_runtime_controls controls
    where controls.environment = p_environment
      and controls.inbound_form_reconciliation_enabled
      and controls.inbound_form_sweep_enabled
  ) then raise exception 'ghl_form_sweep_refresh_requires_reconciliation_runtime'; end if;

  if p_sync_registry then

  -- A refresh state is only actionable while its exact mapping remains active,
  -- retains a narrow location credential, and still exposes at least one
  -- unambiguous eligible form route. Retire stale state before considering any
  -- claim so route removal or mapping retirement cannot create operator noise.
  update public.ghl_form_sweep_attestation_refresh_states state set
    status = 'retired', worker_id = null, locked_at = null, locked_until = null,
    lease_token = null, next_refresh_at = p_now,
    last_error_code = 'ghl_form_sweep_refresh_scope_retired', updated_at = p_now
  where state.environment = p_environment
    and state.status <> 'processing'
    and not exists (
      select 1
      from public.ghl_location_mappings mapping
      where mapping.id = state.location_mapping_id
        and mapping.organization_id = state.organization_id
        and mapping.environment = state.environment
        and mapping.provider_location_id = state.provider_location_id
        and mapping.status = 'active'
        and private.current_ghl_form_sweep_authority_fingerprint_v1(
          mapping.organization_id, mapping.id, mapping.environment
        ) is not null
        and exists (
          select 1 from public.list_ghl_inbound_eligible_form_routes_v1(
            mapping.organization_id, mapping.id, mapping.environment
          ) route
        )
    );

  insert into public.ghl_form_sweep_attestation_refresh_states (
    organization_id, location_mapping_id, environment, provider_location_id,
    credential_generation, next_refresh_at, created_at, updated_at
  )
  select mapping.organization_id, mapping.id, mapping.environment,
    mapping.provider_location_id, mapping.forms_readonly_credential_generation,
    case
      when mapping.forms_readonly_scope_attested_at is null
        or not exists (
          select 1 from public.ghl_form_sweep_scope_attestations proof
          where proof.location_mapping_id = mapping.id
            and proof.credential_generation = mapping.forms_readonly_credential_generation
        ) then p_now
      else greatest(mapping.forms_readonly_scope_attested_at + interval '10 minutes', p_now)
    end,
    p_now, p_now
  from public.ghl_location_mappings mapping
  where mapping.environment = p_environment and mapping.status = 'active'
    and mapping.forms_readonly_credential_generation > 0
    and private.current_ghl_form_sweep_authority_fingerprint_v1(
      mapping.organization_id, mapping.id, mapping.environment
    ) is not null
    and exists (
      select 1 from public.list_ghl_inbound_eligible_form_routes_v1(
        mapping.organization_id, mapping.id, mapping.environment
      ) route
    )
  on conflict on constraint ghl_form_sweep_refresh_state_mapping_unique do update set
    credential_generation = excluded.credential_generation,
    status = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation
        or public.ghl_form_sweep_attestation_refresh_states.status = 'retired' then 'due'
      else public.ghl_form_sweep_attestation_refresh_states.status
    end,
    attempt_count = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation
        or public.ghl_form_sweep_attestation_refresh_states.status = 'retired' then 0
      else public.ghl_form_sweep_attestation_refresh_states.attempt_count
    end,
    next_refresh_at = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation
        or public.ghl_form_sweep_attestation_refresh_states.status = 'retired'
        then excluded.next_refresh_at
      else public.ghl_form_sweep_attestation_refresh_states.next_refresh_at
    end,
    worker_id = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation then null
      else public.ghl_form_sweep_attestation_refresh_states.worker_id
    end,
    locked_at = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation then null
      else public.ghl_form_sweep_attestation_refresh_states.locked_at
    end,
    locked_until = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation then null
      else public.ghl_form_sweep_attestation_refresh_states.locked_until
    end,
    lease_token = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation then null
      else public.ghl_form_sweep_attestation_refresh_states.lease_token
    end,
    last_error_code = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation
        or public.ghl_form_sweep_attestation_refresh_states.status = 'retired' then null
      else public.ghl_form_sweep_attestation_refresh_states.last_error_code
    end,
    last_verified_at = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation then null
      else public.ghl_form_sweep_attestation_refresh_states.last_verified_at
    end,
    replay_count = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation then 0
      else public.ghl_form_sweep_attestation_refresh_states.replay_count
    end,
    replay_history = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation then '[]'::jsonb
      else public.ghl_form_sweep_attestation_refresh_states.replay_history
    end,
    last_replayed_at = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation then null
      else public.ghl_form_sweep_attestation_refresh_states.last_replayed_at
    end,
    last_replayed_by = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation then null
      else public.ghl_form_sweep_attestation_refresh_states.last_replayed_by
    end,
    last_replay_reason = case
      when public.ghl_form_sweep_attestation_refresh_states.credential_generation
        is distinct from excluded.credential_generation then null
      else public.ghl_form_sweep_attestation_refresh_states.last_replay_reason
    end,
    updated_at = excluded.updated_at
  where public.ghl_form_sweep_attestation_refresh_states.status <> 'processing';

  update public.ghl_form_sweep_attestation_refresh_states state set
    status = 'due', attempt_count = greatest(state.attempt_count - 1, 0),
    next_refresh_at = p_now, worker_id = null, locked_at = null,
    locked_until = null, lease_token = null,
    last_error_code = 'ghl_form_sweep_refresh_lease_expired', updated_at = p_now
  where state.environment = p_environment and state.status = 'processing'
    and state.locked_until <= timezone('utc', now());
  update public.ghl_form_sweep_attestation_refresh_states state set
    status = 'operator_action_required', worker_id = null, locked_at = null,
    locked_until = null, lease_token = null,
    last_error_code = 'ghl_form_sweep_refresh_attempts_exhausted', updated_at = p_now
  where state.environment = p_environment and state.status = 'due'
    and state.attempt_count >= 20;
  end if;

  return query
  with candidates as (
    select state.id
    from public.ghl_form_sweep_attestation_refresh_states state
    join public.ghl_location_mappings mapping
      on mapping.id = state.location_mapping_id
     and mapping.organization_id = state.organization_id
     and mapping.environment = state.environment
     and mapping.provider_location_id = state.provider_location_id
     and mapping.forms_readonly_credential_generation = state.credential_generation
     and mapping.status = 'active'
    where state.environment = p_environment and state.status = 'due'
      and state.next_refresh_at <= p_now
      and private.current_ghl_form_sweep_authority_fingerprint_v1(
        mapping.organization_id, mapping.id, mapping.environment
      ) is not null
      and exists (
        select 1 from public.list_ghl_inbound_eligible_form_routes_v1(
          mapping.organization_id, mapping.id, mapping.environment
        ) route
      )
    order by state.next_refresh_at, state.last_verified_at nulls first, state.id
    for update skip locked limit p_limit
  ), claimed as (
    update public.ghl_form_sweep_attestation_refresh_states state set
      status = 'processing', attempt_count = state.attempt_count + 1,
      worker_id = trim(p_worker_id), locked_at = p_now,
      locked_until = p_now + make_interval(secs => p_lease_ms::numeric / 1000),
      lease_token = gen_random_uuid(), lease_generation = state.lease_generation + 1,
      last_error_code = null, updated_at = p_now
    from candidates where state.id = candidates.id
    returning state.*
  )
  select claimed.id, claimed.organization_id, claimed.location_mapping_id,
    claimed.provider_location_id, claimed.credential_generation,
    (select jsonb_agg(route.provider_form_id order by route.provider_form_id)
     from public.list_ghl_inbound_eligible_form_routes_v1(
       claimed.organization_id, claimed.location_mapping_id, claimed.environment
     ) route),
    claimed.attempt_count, claimed.lease_token, claimed.lease_generation
  from claimed order by claimed.next_refresh_at, claimed.id;
end;
$$;

create or replace function public.complete_ghl_form_sweep_attestation_refresh_v1(
  p_state_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_verified_form_ids jsonb,
  p_provider_request_id text,
  p_response_fingerprint text,
  p_now timestamptz
)
returns public.ghl_form_sweep_attestation_refresh_states
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  state_record public.ghl_form_sweep_attestation_refresh_states%rowtype;
  result_record public.ghl_form_sweep_attestation_refresh_states%rowtype;
begin
  if p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_refresh_settlement_time_invalid';
  end if;
  select * into strict state_record
  from public.ghl_form_sweep_attestation_refresh_states state
  where state.id = p_state_id and state.status = 'processing'
    and state.worker_id = trim(p_worker_id)
    and state.lease_token = p_lease_token
    and state.lease_generation = p_lease_generation
    and state.locked_until > timezone('utc', now())
  for update;
  perform private.refresh_ghl_form_sweep_scope_attestation_v1(
    state_record.organization_id, state_record.location_mapping_id,
    state_record.environment, state_record.provider_location_id,
    p_verified_form_ids, state_record.credential_generation,
    p_provider_request_id, p_response_fingerprint, p_now
  );
  update public.ghl_form_sweep_attestation_refresh_states state set
    status = 'due', attempt_count = 0,
    next_refresh_at = p_now + interval '8 minutes'
      + make_interval(secs => mod(abs(hashtext(state.location_mapping_id::text)), 120)),
    worker_id = null, locked_at = null, locked_until = null, lease_token = null,
    last_error_code = null, last_verified_at = p_now, updated_at = p_now
  where state.id = state_record.id returning * into strict result_record;
  return result_record;
end;
$$;

create or replace function public.validate_ghl_form_sweep_attestation_refresh_dispatch_v1(
  p_state_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_expected_form_ids jsonb,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  state_record public.ghl_form_sweep_attestation_refresh_states%rowtype;
  current_form_ids jsonb;
begin
  if jsonb_typeof(p_expected_form_ids) is distinct from 'array'
     or jsonb_array_length(p_expected_form_ids) not between 1 and 25
     or not private.ghl_form_sweep_field_ids_valid_v1(p_expected_form_ids)
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_refresh_dispatch_contract_invalid';
  end if;
  select * into strict state_record
  from public.ghl_form_sweep_attestation_refresh_states state
  where state.id = p_state_id and state.status = 'processing'
    and state.worker_id = trim(p_worker_id)
    and state.lease_token = p_lease_token
    and state.lease_generation = p_lease_generation
    and state.locked_until > timezone('utc', now());
  if not exists (
    select 1 from public.ghl_runtime_controls controls
    where controls.environment = state_record.environment
      and controls.inbound_form_reconciliation_enabled
      and controls.inbound_form_sweep_enabled
  ) or not exists (
    select 1 from public.ghl_location_mappings mapping
    where mapping.id = state_record.location_mapping_id
      and mapping.organization_id = state_record.organization_id
      and mapping.environment = state_record.environment
      and mapping.provider_location_id = state_record.provider_location_id
      and mapping.forms_readonly_credential_generation = state_record.credential_generation
      and mapping.status = 'active'
      and private.current_ghl_form_sweep_authority_fingerprint_v1(
        mapping.organization_id, mapping.id, mapping.environment
      ) is not null
  ) then
    raise exception 'ghl_form_sweep_refresh_dispatch_scope_changed';
  end if;
  select coalesce(jsonb_agg(route.provider_form_id order by route.provider_form_id), '[]'::jsonb)
  into current_form_ids
  from public.list_ghl_inbound_eligible_form_routes_v1(
    state_record.organization_id, state_record.location_mapping_id, state_record.environment
  ) route;
  if current_form_ids is distinct from p_expected_form_ids then
    raise exception 'ghl_form_sweep_refresh_dispatch_form_scope_changed';
  end if;
  return true;
end;
$$;

create or replace function public.fail_ghl_form_sweep_attestation_refresh_v1(
  p_state_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_generation bigint,
  p_disposition text,
  p_error_code text,
  p_now timestamptz
)
returns public.ghl_form_sweep_attestation_refresh_states
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  state_record public.ghl_form_sweep_attestation_refresh_states%rowtype;
begin
  if p_disposition not in ('retryable_failure', 'operator_action_required')
     or coalesce(p_error_code, '') !~ '^[a-z0-9_:-]{3,180}$'
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_refresh_failure_invalid';
  end if;
  select * into strict state_record
  from public.ghl_form_sweep_attestation_refresh_states state
  where state.id = p_state_id and state.status = 'processing'
    and state.worker_id = trim(p_worker_id)
    and state.lease_token = p_lease_token
    and state.lease_generation = p_lease_generation
    and state.locked_until > timezone('utc', now())
  for update;
  update public.ghl_form_sweep_attestation_refresh_states state set
    status = case when p_disposition = 'operator_action_required'
      then 'operator_action_required' else 'due' end,
    next_refresh_at = case when p_disposition = 'retryable_failure'
      then p_now + interval '30 seconds' else state.next_refresh_at end,
    worker_id = null, locked_at = null, locked_until = null, lease_token = null,
    last_error_code = p_error_code, updated_at = p_now
  where state.id = state_record.id returning * into strict state_record;
  return state_record;
end;
$$;

create or replace function public.replay_ghl_form_sweep_attestation_refresh_v1(
  p_state_id uuid,
  p_organization_id uuid,
  p_environment text,
  p_reason text,
  p_actor text,
  p_authorization text,
  p_now timestamptz
)
returns public.ghl_form_sweep_attestation_refresh_states
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  state_record public.ghl_form_sweep_attestation_refresh_states%rowtype;
begin
  if p_environment not in ('sandbox', 'production')
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500
     or trim(coalesce(p_actor, '')) !~ '^[A-Za-z0-9@._:-]{3,180}$'
     or p_authorization <> 'DEALFLOW_GHL_FORM_SWEEP_ATTESTATION_REFRESH_REPLAY_V1'
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_refresh_replay_authorization_invalid';
  end if;
  if not exists (
    select 1 from public.ghl_runtime_controls controls
    where controls.environment = p_environment
      and controls.inbound_form_reconciliation_enabled
      and controls.inbound_form_sweep_enabled
  ) then
    raise exception 'ghl_form_sweep_refresh_replay_requires_open_runtime';
  end if;
  select * into strict state_record
  from public.ghl_form_sweep_attestation_refresh_states state
  where state.id = p_state_id
    and state.organization_id = p_organization_id
    and state.environment = p_environment
    and state.status = 'operator_action_required'
  for update;
  if state_record.replay_count >= 5 then
    raise exception 'ghl_form_sweep_refresh_replay_limit_reached';
  end if;
  if not exists (
    select 1 from public.ghl_location_mappings mapping
    where mapping.id = state_record.location_mapping_id
      and mapping.organization_id = state_record.organization_id
      and mapping.environment = state_record.environment
      and mapping.provider_location_id = state_record.provider_location_id
      and mapping.forms_readonly_credential_generation = state_record.credential_generation
      and mapping.status = 'active'
      and private.current_ghl_form_sweep_authority_fingerprint_v1(
        mapping.organization_id, mapping.id, mapping.environment
      ) is not null
      and exists (
        select 1 from public.list_ghl_inbound_eligible_form_routes_v1(
          mapping.organization_id, mapping.id, mapping.environment
        ) route
      )
  ) then
    raise exception 'ghl_form_sweep_refresh_replay_scope_changed';
  end if;
  insert into public.ghl_form_sweep_refresh_replay_audits (
    organization_id, location_mapping_id, environment, provider_location_id,
    credential_generation, replay_ordinal, replayed_at, replayed_by,
    reason, prior_error_code
  ) values (
    state_record.organization_id, state_record.location_mapping_id,
    state_record.environment, state_record.provider_location_id,
    state_record.credential_generation, state_record.replay_count + 1,
    p_now, trim(p_actor), trim(p_reason), state_record.last_error_code
  );
  update public.ghl_form_sweep_attestation_refresh_states state set
    status = 'due', attempt_count = 0, next_refresh_at = p_now,
    last_error_code = null,
    replay_count = state.replay_count + 1,
    replay_history = state.replay_history || jsonb_build_array(jsonb_build_object(
      'replayedAt', p_now,
      'replayedBy', trim(p_actor),
      'reason', trim(p_reason),
      'priorErrorCode', state.last_error_code,
      'credentialGeneration', state.credential_generation
    )),
    last_replayed_at = p_now,
    last_replayed_by = trim(p_actor),
    last_replay_reason = trim(p_reason),
    updated_at = p_now
  where state.id = state_record.id
  returning * into strict state_record;
  return state_record;
end;
$$;

create or replace function public.summarize_ghl_form_sweep_health_v1(
  p_environment text,
  p_now timestamptz
)
returns table(
  active_cursor_count integer,
  backfill_active_count integer,
  lag_warning_count integer,
  cursor_operator_required_count integer,
  retired_cursor_count integer,
  max_lag_seconds bigint,
  refresh_due_count integer,
  refresh_operator_required_count integer
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    count(*) filter (where cursor_record.status = 'active')::integer,
    count(*) filter (
      where cursor_record.status = 'active'
        and (p_now - interval '5 minutes') - cursor_record.cursor_through > interval '2 hours'
    )::integer,
    count(*) filter (
      where cursor_record.status = 'active'
        and (p_now - interval '5 minutes') - cursor_record.cursor_through > interval '30 minutes'
        and (p_now - interval '5 minutes') - cursor_record.cursor_through <= interval '2 hours'
    )::integer,
    count(*) filter (where cursor_record.status = 'operator_action_required')::integer,
    count(*) filter (where cursor_record.status = 'retired')::integer,
    coalesce(max(greatest(
      0,
      extract(epoch from (p_now - interval '5 minutes') - cursor_record.cursor_through)::bigint
    )) filter (where cursor_record.status in ('active', 'operator_action_required')), 0)::bigint,
    (
      select count(*)::integer
      from public.ghl_form_sweep_attestation_refresh_states refresh_state
      where refresh_state.environment = p_environment
        and refresh_state.status = 'due'
        and refresh_state.next_refresh_at <= p_now
    ),
    (
      select count(*)::integer
      from public.ghl_form_sweep_attestation_refresh_states refresh_state
      where refresh_state.environment = p_environment
        and refresh_state.status = 'operator_action_required'
    )
  from public.ghl_inbound_form_sweep_cursors cursor_record
  where p_environment in ('sandbox', 'production')
    and p_now between timezone('utc', now()) - interval '60 seconds'
      and timezone('utc', now()) + interval '60 seconds'
    and cursor_record.environment = p_environment
$$;

create or replace function public.rotate_ghl_form_sweep_same_ref_generation_v1(
  p_organization_id uuid,
  p_location_mapping_id uuid,
  p_environment text,
  p_provider_location_id text,
  p_expected_credential_generation bigint,
  p_actor text,
  p_reason text,
  p_authorization text,
  p_now timestamptz
)
returns public.ghl_location_mappings
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  mapping_record public.ghl_location_mappings%rowtype;
begin
  if p_environment not in ('sandbox', 'production')
     or p_provider_location_id !~ '^[A-Za-z0-9_-]{3,180}$'
     or p_expected_credential_generation < 1
     or trim(coalesce(p_actor, '')) !~ '^[A-Za-z0-9@._:-]{3,180}$'
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500
     or p_authorization <> 'DEALFLOW_GHL_FORM_SWEEP_SAME_REF_ROTATION_V1'
     or p_now < timezone('utc', now()) - interval '60 seconds'
     or p_now > timezone('utc', now()) + interval '60 seconds' then
    raise exception 'ghl_form_sweep_same_ref_rotation_invalid';
  end if;
  if exists (
    select 1 from public.ghl_runtime_controls controls
    where controls.environment = p_environment
      and (controls.inbound_form_sweep_enabled or controls.inbound_form_reconciliation_enabled)
  ) then raise exception 'ghl_form_sweep_same_ref_rotation_requires_closed_runtimes'; end if;
  select * into strict mapping_record
  from public.ghl_location_mappings mapping
  where mapping.id = p_location_mapping_id
    and mapping.organization_id = p_organization_id
    and mapping.environment = p_environment
    and mapping.provider_location_id = p_provider_location_id
    and mapping.status = 'active'
    and mapping.forms_readonly_credential_generation = p_expected_credential_generation
  for update;
  if exists (
    select 1 from public.ghl_inbound_form_sweep_runs run
    where run.location_mapping_id = mapping_record.id and run.status = 'processing'
  ) or exists (
    select 1 from public.ghl_form_sweep_attestation_refresh_states refresh_state
    where refresh_state.location_mapping_id = mapping_record.id and refresh_state.status = 'processing'
  ) or exists (
    select 1 from public.ghl_inbound_form_reconciliations reconciliation
    where reconciliation.location_mapping_id = mapping_record.id
      and reconciliation.status = 'processing'
  ) then raise exception 'ghl_form_sweep_same_ref_rotation_requires_zero_live_leases'; end if;
  perform set_config('dealflow.ghl_form_sweep_rotation_mapping_id', mapping_record.id::text, true);
  update public.ghl_location_mappings mapping set
    forms_readonly_credential_generation = mapping.forms_readonly_credential_generation + 1,
    -- Preserve the non-null authority-shape invariant while explicitly making
    -- the old attestation unusably stale. Only a subsequent real GET proof may
    -- refresh it for this new generation.
    forms_readonly_scope_attested_at = null,
    updated_at = p_now
  where mapping.id = mapping_record.id returning * into strict mapping_record;
  insert into public.ghl_form_sweep_credential_rotations (
    organization_id, location_mapping_id, environment, provider_location_id,
    prior_generation, new_generation, actor, reason, created_at
  ) values (
    mapping_record.organization_id, mapping_record.id, mapping_record.environment,
    mapping_record.provider_location_id, p_expected_credential_generation,
    mapping_record.forms_readonly_credential_generation, trim(p_actor), trim(p_reason), p_now
  );
  return mapping_record;
end;
$$;

create or replace function private.fence_ghl_form_sweep_mapping_retirement_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'active' and new.status <> 'active' then
    if exists (
      select 1 from public.ghl_runtime_controls controls
      where controls.environment = old.environment
        and (controls.inbound_form_sweep_enabled or controls.inbound_form_reconciliation_enabled)
    ) then raise exception 'ghl_form_sweep_mapping_retirement_requires_closed_runtime'; end if;
    if exists (
      select 1 from public.ghl_inbound_form_sweep_runs run
      where run.location_mapping_id = old.id and run.status = 'processing'
    ) or exists (
      select 1 from public.ghl_form_sweep_attestation_refresh_states refresh_state
      where refresh_state.location_mapping_id = old.id and refresh_state.status = 'processing'
    ) or exists (
      select 1 from public.ghl_inbound_form_reconciliations reconciliation
      where reconciliation.location_mapping_id = old.id
        and reconciliation.status = 'processing'
    ) then raise exception 'ghl_form_sweep_mapping_retirement_requires_zero_live_leases'; end if;
  end if;
  return new;
end;
$$;

create or replace function private.retire_ghl_form_sweep_cursors_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'active' and new.status <> 'active' then
    update public.ghl_inbound_form_sweep_cursors cursor_record set
      status = 'retired', next_retry_at = null,
      last_error_code = 'ghl_form_sweep_mapping_retired',
      updated_at = coalesce(new.retired_at, timezone('utc', now()))
    where cursor_record.location_mapping_id = new.id
      and cursor_record.status <> 'retired';
    update public.ghl_form_sweep_attestation_refresh_states refresh_state set
      status = 'retired', next_refresh_at = coalesce(new.retired_at, timezone('utc', now())),
      worker_id = null, locked_at = null, locked_until = null, lease_token = null,
      last_error_code = 'ghl_form_sweep_refresh_mapping_retired',
      updated_at = coalesce(new.retired_at, timezone('utc', now()))
    where refresh_state.location_mapping_id = new.id
      and refresh_state.status <> 'retired';
  end if;
  return new;
end;
$$;

create trigger fence_ghl_form_sweep_mapping_retirement
before update of status on public.ghl_location_mappings
for each row execute function private.fence_ghl_form_sweep_mapping_retirement_v1();
create trigger retire_ghl_form_sweep_cursors
after update of status on public.ghl_location_mappings
for each row execute function private.retire_ghl_form_sweep_cursors_v1();

revoke all on function private.current_ghl_form_sweep_route_fingerprint_v1(uuid,uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function private.current_ghl_form_sweep_authority_fingerprint_v1(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.current_ghl_form_sweep_scope_proof_valid_v1(uuid,uuid,text,text,bigint,timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.ghl_form_sweep_field_ids_valid_v1(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.ghl_form_sweep_request_ids_valid_v1(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.enforce_ghl_form_sweep_run_generation_at_insert_v1() from public, anon, authenticated, service_role;

revoke all on function public.set_ghl_inbound_form_sweep_runtime_v1(text,boolean,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.drain_ghl_inbound_form_sweep_claims_v1(text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.claim_next_ghl_inbound_form_sweep_v1(text,text,timestamptz,integer,boolean) from public, anon, authenticated, service_role;
revoke all on function public.validate_ghl_inbound_form_sweep_dispatch_v1(uuid,text,uuid,bigint,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.fail_ghl_inbound_form_sweep_v1(uuid,text,uuid,bigint,text,text,jsonb,text,integer,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.complete_ghl_inbound_form_sweep_v1(uuid,text,uuid,bigint,jsonb,jsonb,text,integer,integer,timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.refresh_ghl_form_sweep_scope_attestation_v1(uuid,uuid,text,text,jsonb,bigint,text,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.list_ghl_form_sweep_attestation_refresh_candidates_v1(text,timestamptz,integer) from public, anon, authenticated, service_role;
revoke all on function public.claim_ghl_form_sweep_attestation_refresh_batch_v1(text,text,timestamptz,integer,integer,boolean) from public, anon, authenticated, service_role;
revoke all on function public.complete_ghl_form_sweep_attestation_refresh_v1(uuid,text,uuid,bigint,jsonb,text,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.validate_ghl_form_sweep_attestation_refresh_dispatch_v1(uuid,text,uuid,bigint,jsonb,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.fail_ghl_form_sweep_attestation_refresh_v1(uuid,text,uuid,bigint,text,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.replay_ghl_form_sweep_attestation_refresh_v1(uuid,uuid,text,text,text,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.summarize_ghl_form_sweep_health_v1(text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v1(text,jsonb,boolean,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.rotate_ghl_form_sweep_same_ref_generation_v1(uuid,uuid,text,text,bigint,text,text,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.replay_ghl_inbound_form_sweep_cursor_v1(uuid,uuid,text,text,text,text,timestamptz) from public, anon, authenticated, service_role;

grant execute on function public.set_ghl_inbound_form_sweep_runtime_v1(text,boolean,timestamptz) to service_role;
grant execute on function public.drain_ghl_inbound_form_sweep_claims_v1(text,timestamptz) to service_role;
grant execute on function public.claim_next_ghl_inbound_form_sweep_v1(text,text,timestamptz,integer,boolean) to service_role;
grant execute on function public.validate_ghl_inbound_form_sweep_dispatch_v1(uuid,text,uuid,bigint,timestamptz) to service_role;
grant execute on function public.fail_ghl_inbound_form_sweep_v1(uuid,text,uuid,bigint,text,text,jsonb,text,integer,timestamptz) to service_role;
grant execute on function public.complete_ghl_inbound_form_sweep_v1(uuid,text,uuid,bigint,jsonb,jsonb,text,integer,integer,timestamptz) to service_role;
grant execute on function public.claim_ghl_form_sweep_attestation_refresh_batch_v1(text,text,timestamptz,integer,integer,boolean) to service_role;
grant execute on function public.complete_ghl_form_sweep_attestation_refresh_v1(uuid,text,uuid,bigint,jsonb,text,text,timestamptz) to service_role;
grant execute on function public.validate_ghl_form_sweep_attestation_refresh_dispatch_v1(uuid,text,uuid,bigint,jsonb,timestamptz) to service_role;
grant execute on function public.fail_ghl_form_sweep_attestation_refresh_v1(uuid,text,uuid,bigint,text,text,timestamptz) to service_role;
grant execute on function public.replay_ghl_form_sweep_attestation_refresh_v1(uuid,uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.summarize_ghl_form_sweep_health_v1(text,timestamptz) to service_role;
grant execute on function public.configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v1(text,jsonb,boolean,text,timestamptz) to service_role;
grant execute on function public.rotate_ghl_form_sweep_same_ref_generation_v1(uuid,uuid,text,text,bigint,text,text,text,timestamptz) to service_role;
grant execute on function public.replay_ghl_inbound_form_sweep_cursor_v1(uuid,uuid,text,text,text,text,timestamptz) to service_role;

do $dealflow_ghl_form_sweep_postconditions$
declare
  relation_name text;
  function_name text;
begin
  foreach relation_name in array array[
    'public.ghl_inbound_form_sweep_cursors', 'public.ghl_inbound_form_sweep_runs',
    'public.ghl_form_sweep_credential_rotations',
    'public.ghl_form_sweep_scope_attestations'
    , 'public.ghl_form_sweep_attestation_refresh_states',
    'public.ghl_inbound_form_sweep_cursor_replay_audits',
    'public.ghl_form_sweep_refresh_replay_audits'
  ] loop
    if has_table_privilege('anon', relation_name, 'SELECT,INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated', relation_name, 'SELECT,INSERT,UPDATE,DELETE')
       or has_table_privilege('service_role', relation_name, 'INSERT,UPDATE,DELETE')
       or not has_table_privilege('service_role', relation_name, 'SELECT') then
      raise exception 'ghl_form_sweep_table_privilege_postcondition_failed:%', relation_name;
    end if;
  end loop;
  foreach function_name in array array[
    'public.set_ghl_inbound_form_sweep_runtime_v1(text,boolean,timestamptz)',
    'public.drain_ghl_inbound_form_sweep_claims_v1(text,timestamptz)',
    'public.claim_next_ghl_inbound_form_sweep_v1(text,text,timestamptz,integer,boolean)',
    'public.validate_ghl_inbound_form_sweep_dispatch_v1(uuid,text,uuid,bigint,timestamptz)',
    'public.fail_ghl_inbound_form_sweep_v1(uuid,text,uuid,bigint,text,text,jsonb,text,integer,timestamptz)',
    'public.complete_ghl_inbound_form_sweep_v1(uuid,text,uuid,bigint,jsonb,jsonb,text,integer,integer,timestamptz)',
    'public.claim_ghl_form_sweep_attestation_refresh_batch_v1(text,text,timestamptz,integer,integer,boolean)',
    'public.complete_ghl_form_sweep_attestation_refresh_v1(uuid,text,uuid,bigint,jsonb,text,text,timestamptz)',
    'public.validate_ghl_form_sweep_attestation_refresh_dispatch_v1(uuid,text,uuid,bigint,jsonb,timestamptz)',
    'public.fail_ghl_form_sweep_attestation_refresh_v1(uuid,text,uuid,bigint,text,text,timestamptz)',
    'public.replay_ghl_form_sweep_attestation_refresh_v1(uuid,uuid,text,text,text,text,timestamptz)',
    'public.summarize_ghl_form_sweep_health_v1(text,timestamptz)',
    'public.configure_ghl_inbound_forms_read_authorities_with_sweep_proof_v1(text,jsonb,boolean,text,timestamptz)',
    'public.rotate_ghl_form_sweep_same_ref_generation_v1(uuid,uuid,text,text,bigint,text,text,text,timestamptz)',
    'public.replay_ghl_inbound_form_sweep_cursor_v1(uuid,uuid,text,text,text,text,timestamptz)'
  ] loop
    if has_function_privilege('anon', function_name, 'EXECUTE')
       or has_function_privilege('authenticated', function_name, 'EXECUTE')
       or not has_function_privilege('service_role', function_name, 'EXECUTE') then
      raise exception 'ghl_form_sweep_function_privilege_postcondition_failed:%', function_name;
    end if;
  end loop;
end;
$dealflow_ghl_form_sweep_postconditions$;
