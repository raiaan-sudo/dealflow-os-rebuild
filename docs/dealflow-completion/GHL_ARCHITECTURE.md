# DealFlow GoHighLevel architecture

Status: `INTEGRATED 99-MIGRATION CANDIDATE / FINAL-SEAL PROOF NOT_YET_RUN / LIVE PROVIDER ACCEPTANCE BLOCKED`
Overall release verdict: `NO_GO`

## Baseline versus candidate

The canonical production baseline had no executable GHL client, provisioning
service, tenant/location mapping, provider outbox/receipt protocol, or durable
lead-effect delivery path. The isolated candidate now contains:

- fake, sandbox, and production-capable bounded adapters;
- exact-deployment, project, provider-host, global, operation, and database kill switches;
- workspace tenant/install/snapshot/location mapping schema;
- provisioning runs, provider outbox, append-only receipts, lead-effect events,
  and operator requests;
- atomic claim/heartbeat/settlement with token and generation fencing;
- exact organization/workspace/location constraints and current-membership
  checks;
- terminal sweeps for exhausted attempts;
- immutable paid-commercial-activation-to-provisioning receipts for exact direct and partner-owned tenants;
- supported preinstalled-template custom-value/form personalization;
- campaign-scoped, revisioned personalization using non-overlapping manifest
  slots, exact source-plan fingerprints, and immutable provider receipts;
- durable verified GHL destination resolution for one exact campaign binding;
- signed appointment/contact lifecycle webhook reconciliation;
- PII-free provider outbox payloads; and
- deterministic plus network-disabled PostgreSQL tests.

Provider paths are present in the integrated candidate but default disabled.
The current exact candidate ends at migration
`20260713024000_add_durable_ghl_periodic_form_sweeps.sql`; final clean-seal
PostgreSQL proof is `NOT_YET_RUN`. No live acceptance has
occurred, so production execution remains blocked. Direct snapshot, funnel,
page, or form publication is not claimed because no documented writable API was
proven. See `GHL_PRODUCTION_OPERATING_CONTRACT.md`.

## Hidden hierarchy and mapping invariant

```text
platform
  -> partner (optional manager)
     -> realtor workspace
        -> one active environment-scoped GHL installation
           -> exactly one active GHL location mapping
```

- One active realtor workspace maps to exactly one active location per
  environment.
- One location maps to at most one active workspace.
- Installation, location, workspace, optional partner, environment, snapshot
  identity/version, status, and audit timestamps are durable.
- Missing, inactive, conflicting, or ambiguous mappings fail closed and enter an
  operator-visible state.
- Email address, first provider search result, URL/local-storage value, or
  mutable UI state is never mapping authority.

## Candidate state machine

```text
requested
  -> fake_only_queued
  -> claimed(token, generation, expiry)
  -> fake_receipt_recorded
  -> fake_completed

Failure/recovery:
  retryable_failure -> bounded reclaim
  uncertain_result -> reconcile before retry
  operator_action_required -> no automatic duplicate
  max_attempts_exhausted -> terminal operator state

Real provider states:
  blocked_external -> never promoted to ready
```

The implemented provider provisioning model is:

```text
location_create_requested
  -> location_uncertain | location_assigned
  -> snapshot_install_requested
  -> snapshot_installing
  -> snapshot_verifying
  -> required_objects_verifying
           -> provisioning_ready
  -> campaign_slot_selected
  -> campaign_revision_claimed
  -> custom_values
  -> exact_form_verification
  -> campaign_destination_ready
```

Website lead-delivery readiness requires the exact mapping, owner-approved
snapshot version and required-object manifest, provider-confirmed installation
status, one non-overlapping campaign slot, current campaign-plan fingerprint,
custom-value receipt, exact form verification, approved HTTPS destination, and
reconciled receipts. A legacy root-only contract can serve one campaign only;
a second campaign fails closed. A local request, queue row, fake receipt, HTTP
`202`, or accepted job is not provider readiness.

## Lead and publication contract

DealFlow must authenticate the source, resolve one exact tenant/location/form,
persist the canonical lead first, and represent each GHL contact, opportunity,
tag/workflow, appointment, and notification as an independent durable effect.
Provider idempotency/object IDs and retry state are receipts, not inferred from a
parent job.

Direct programmable funnel/page publication sufficient for the approved owner
model is not exposed by the documented API. The implemented supported boundary
binds an owner-approved versioned template as `snapshotId` during the one v3
sub-account create request, applies documented custom values through one exact
campaign manifest slot, and verifies exact copied forms and required objects.
Snapshot status is not funnel publication; copied provider drafts remain
fail-closed. Slot destinations and custom-value names cannot be
shared across campaigns. Publication outside that boundary remains
`BLOCKED_EXTERNAL`.

## Provider/owner blockers

- Authoritative agency account/plan/capability and least-privileged credential.
- Owner-approved snapshot ID/version and required-object manifest.
- Supported personalization/publication mechanism and reconciliation contract.
- Owner-approved non-overlapping campaign-slot manifest for the intended number
  of concurrent website campaigns.
- Data controller/processor, export, deletion, retention, ownership, portability,
  and offboarding obligations for DealFlow-provided locations.
- Whether any provider object may be created before qualifying payment. Current
  default: no.
- Webhook signature/version, rate-limit, timeout/idempotency, and provider
  sandbox/live acceptance.
- Signed deployed environment evidence and mandatory old-worker drain.

No GHL connection, record, location, snapshot, contact, opportunity, workflow,
calendar, funnel, communication, or external mutation is claimed by this
candidate documentation. Hosted sandbox acceptance is `NOT_YET_RUN`.
