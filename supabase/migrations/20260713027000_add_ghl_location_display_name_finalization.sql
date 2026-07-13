-- A newly created GHL sub-account carries a temporary immutable request tag
-- until its exact provider id has been durably recorded. This fenced operation
-- restores the clean customer-facing display name and requires a GET readback
-- before the provisioning saga can advance.

alter table public.ghl_provider_outbox
  drop constraint if exists ghl_provider_outbox_operation_check;

alter table public.ghl_provider_outbox
  add constraint ghl_provider_outbox_operation_check
  check (operation in (
    'location_create',
    'location_reconcile',
    'location_display_name_finalize',
    'snapshot_install',
    'snapshot_status',
    'required_objects_verify',
    'lead_contact_upsert',
    'lead_opportunity_upsert',
    'lead_tag_apply',
    'lead_workflow_enroll',
    'appointment_sync'
  ));

comment on constraint ghl_provider_outbox_operation_check on public.ghl_provider_outbox is
  'Provider operations include the fenced, idempotent GHL display-name cleanup required after exact location-create identity is proven.';
