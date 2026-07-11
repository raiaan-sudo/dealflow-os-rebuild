# Local GHL tenant-provisioning foundation proof

Status: `LOCAL_RELEASE_CANDIDATE / FAKE_ONLY / NO_PROVIDER_OR_DATABASE_MUTATION`

Date: 2026-07-10

## Outcome

The canonical release-candidate worktree now has a local GHL foundation for direct-realtor and white-label partner-child tenants. It is deliberately not a live integration. It contains no GHL network client, no real provider endpoint, no token reader, and no lead-worker hook.

Provider writes default to disabled. The only adapter is a deterministic fake with `networkAccess: "none"`. Enabling any adapter kind other than `fake` fails closed.

The modeled location and snapshot operations use only the official HighLevel contract basis recorded in [`GHL_ARCHITECTURE.md`](../../GHL_ARCHITECTURE.md). No undocumented funnel/page mutation was inferred from those contracts.

## Implemented contracts

- Hidden resource hierarchy: platform or partner installation → realtor workspace → one active environment/location mapping.
- Database-enforced active mapping invariants:
  - at most one active location per workspace/environment;
  - one provider location can be active for at most one workspace/environment;
  - a `READY` provisioning run must have exactly one active mapping;
  - partner-child mappings must match their partner hierarchy and a partner-owned installation cannot cross partner boundaries.
- Approved snapshot manifest with exact version and required pipelines, stages, workflows, tags, calendars, or custom fields.
- Durable provisioning states: `requested`, `location_create_requested`, `location_uncertain`, `location_assigned`, `snapshot_install_requested`, `snapshot_installing`, `snapshot_verifying`, `required_objects_verifying`, `ready`, `retryable_failure`, `operator_action_required`, and `canceled`.
- Optimistic revision checks and a unique provisioning idempotency key derived from workspace, environment, payment activation event, snapshot key, and snapshot version.
- Provider outbox with unique operation idempotency keys plus append-only sanitized receipts.
- Uncertain location-create handling that forbids retry until reconciliation proves the original result `found` or conclusively `not_found`.
- `READY` protection that requires an active exact mapping, an approved snapshot, provider snapshot-status verification, and every required manifest object.
- Lead CRM effect event schema with same-tenant composite foreign keys, effect-level idempotency, retry due time, provider object receipts, and an operator review path.
- Operator-side replay request logic that only marks existing retryable effects `replay_requested`; it does not call GHL.

## Funnel publication disposition

Direct GHL funnel/page publication remains `BLOCKED_EXTERNAL` because no sanctioned mutation contract was proven in the official documentation reviewed for this execution. The code exposes no publication provider method. A publication request creates an explicit operator request with `providerMutationAttempted: false`.

## Deterministic proof

Command:

```text
node scripts/test-ghl-tenant-provisioning.mjs
```

Result: `PASS`

Covered cases:

1. Default-closed write gate and rejection of any non-fake adapter.
2. Provisioning request idempotency for the same payment/snapshot identity.
3. Full fake lifecycle to `READY` with active mapping and provider receipts.
4. Timeout after create: reconcile finds the location, no duplicate create occurs.
5. Timeout before create: reconcile proves absence, due-time is enforced, and replay happens only afterward.
6. Cross-tenant run mutation rejection.
7. Duplicate provider-location assignment rejection.
8. Direct-realtor versus partner-child hierarchy validation.
9. Required-object failure prevents `READY` and opens operator work.
10. Funnel publication produces `BLOCKED_EXTERNAL` without a provider call.
11. Static migration checks for active-location uniqueness, same-tenant lead/mapping foreign keys, uncertain-result reconciliation, and append-only receipts.
12. Static no-network check over the complete local GHL implementation.

Additional checks:

```text
npx tsc --noEmit -p tsconfig.typecheck.json --pretty false
npx eslint src/lib/integrations/gohighlevel src/lib/services/ghl-provisioning-service.ts src/lib/services/ghl-provisioning-repository.ts src/lib/services/ghl-lead-effect-service.ts src/lib/services/fulfillment-monitor-service.ts scripts/test-ghl-tenant-provisioning.mjs
node scripts/test-lead-tracking-health.mjs
SUPABASE_SCHEMA_CHECK_MODE=local npm run schema:check
./node_modules/.bin/next build
```

All exited `0` in the isolated worktree.

## Explicit non-claims and blockers

- The migration was not applied to a local, staging, or production database. SQL structure is statically exercised, not database-executed.
- A read-only `supabase status --output json` check could not inspect a local stack because the Docker daemon was unavailable at `/Users/raiaanreza/.colima/default/docker.sock`. No container or database was started, reset, or changed.
- No HighLevel credential, account, agency plan, installation, snapshot, location, contact, opportunity, workflow, or customer data was accessed.
- No real provider request was sent.
- The lead worker does not create GHL effect events yet by design for this tranche. The schema and replay control exist, but an end-to-end lead-to-GHL claim would be false.
- No worker consumes GHL provider outbox rows yet. This foundation models truth and recovery but does not claim operational delivery.
- The approved production snapshot ID/version and its required-object manifest remain an owner/provider acceptance input.
- Live location creation, snapshot installation, object verification, permission scope, rate-limit behavior, webhook behavior, and provider idempotency remain `BLOCKED_EXTERNAL` pending a sanctioned isolated GHL test environment and separate mutation approval.
- Legal/data ownership, export, deletion, and offboarding rules for DealFlow-provided GHL locations remain owner/legal decisions.
