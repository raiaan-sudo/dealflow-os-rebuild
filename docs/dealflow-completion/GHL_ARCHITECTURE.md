# DealFlow GoHighLevel architecture

Status: `PRODUCTION_CAPABLE_DEFAULT_OFF / DISPOSABLE_DB_VERIFIED / LIVE_PROVIDER_ACCEPTANCE_BLOCKED`
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
- durable verified GHL destination resolution for campaign binding;
- signed appointment/contact lifecycle webhook reconciliation;
- PII-free provider outbox payloads; and
- deterministic plus network-disabled PostgreSQL tests.

Provider paths are implemented but default disabled. No live acceptance has
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
  -> custom_values
  -> exact_form_verification
  -> destination_ready
```

Lead-delivery readiness requires the exact mapping, owner-approved snapshot
version and required-object manifest, provider-confirmed installation status,
custom-value receipt, exact form verification, approved HTTPS destination, and
reconciled receipts. A local request, queue row, fake receipt, HTTP `202`, or
accepted job is not provider readiness.

## Lead and publication contract

DealFlow must authenticate the source, resolve one exact tenant/location/form,
persist the canonical lead first, and represent each GHL contact, opportunity,
tag/workflow, appointment, and notification as an independent durable effect.
Provider idempotency/object IDs and retry state are receipts, not inferred from a
parent job.

Direct programmable funnel/page publication sufficient for the approved owner
model is not exposed by the documented API. The implemented supported boundary
requires an owner-preinstalled versioned template, applies documented custom
values, and verifies exact preinstalled forms and required objects. Publication
outside that boundary remains `BLOCKED_EXTERNAL`.

## Provider/owner blockers

- Authoritative agency account/plan/capability and least-privileged credential.
- Owner-approved snapshot ID/version and required-object manifest.
- Supported personalization/publication mechanism and reconciliation contract.
- Data controller/processor, export, deletion, retention, ownership, portability,
  and offboarding obligations for DealFlow-provided locations.
- Whether any provider object may be created before qualifying payment. Current
  default: no.
- Webhook signature/version, rate-limit, timeout/idempotency, and provider
  sandbox/live acceptance.
- Signed deployed environment evidence and mandatory old-worker drain.

No GHL connection, record, location, snapshot, contact, opportunity, workflow,
calendar, funnel, communication, or external mutation occurred in this run.
