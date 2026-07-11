# DealFlow GoHighLevel architecture

Status: `CANDIDATE_FAKE_ONLY / DISPOSABLE_DB_VERIFIED / LIVE_PROVIDER_BLOCKED`
Overall release verdict: `NO_GO`

## Baseline versus candidate

The canonical production baseline contains no executable GHL client,
provisioning service, tenant/location mapping, provider outbox/receipt protocol,
or lead-effect delivery path. The isolated candidate now contains a locally
testable foundation:

- fake-only adapter and explicit real-write denial;
- workspace tenant/install/snapshot/location mapping schema;
- provisioning runs, provider outbox, append-only receipts, lead-effect events,
  and operator requests;
- atomic claim/heartbeat/settlement with token and generation fencing;
- exact organization/workspace/location constraints and current-membership
  checks;
- terminal sweeps for exhausted attempts;
- PII-free fake lead processing; and
- deterministic plus network-disabled PostgreSQL tests.

This does not implement or imply a real GHL adapter, account creation, snapshot
installation, funnel publication, contact/opportunity creation, workflow
execution, appointment handling, or webhook acceptance. Production execution is
blocked and fake execution is denied in production.

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

The intended future live provisioning model remains:

```text
location_create_requested
  -> location_uncertain | location_assigned
  -> snapshot_install_requested
  -> snapshot_installing
  -> snapshot_verifying
  -> required_objects_verifying
  -> ready
```

`ready` must require the exact mapping, owner-approved snapshot version and
required-object manifest, provider-confirmed installation status, and
reconciled receipts. A local request, queue row, fake receipt, HTTP `202`, or
accepted job is not provider readiness.

## Lead and publication contract

DealFlow must authenticate the source, resolve one exact tenant/location/form,
persist the canonical lead first, and represent each GHL contact, opportunity,
tag/workflow, appointment, and notification as an independent durable effect.
Provider idempotency/object IDs and retry state are receipts, not inferred from a
parent job.

Direct programmable funnel/page publication sufficient for the approved owner
model has not been proven. Until a sanctioned provider contract exists,
GHL-hosted publication is `BLOCKED_EXTERNAL`. A versioned snapshot/template and
custom-value flow is preferred if official capability, identity, rollback, and
receipt requirements can be proven.

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
