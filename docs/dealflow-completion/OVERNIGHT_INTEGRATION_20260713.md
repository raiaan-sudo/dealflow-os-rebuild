# DealFlow integrated completion candidate — 2026-07-13

> **Dated predecessor handoff.** This 104-migration integration record is
> immutable historical context, not current release truth. See
> [`FINAL_MASTER_SUCCESSOR_STATUS_20260716.md`](FINAL_MASTER_SUCCESSOR_STATUS_20260716.md)
> for the unsealed 108-migration / 91-command successor and remaining staging
> and production gates.

Status: `INTEGRATED WORKING CANDIDATE / PENDING_FINAL_SEAL / LOCAL EXACT-SEAL NOT_YET_RUN / HOSTED STAGING NOT_YET_RUN / PRODUCTION NO_GO`

This document is the current pre-release integration handoff for the candidate assembled from
the preserved DealFlow completion branch. Earlier audit statements describing
an 80- or 82-migration candidate, no isolated staging target, or the absence of
a PAUSED-to-ACTIVE Meta saga are historical evidence and do not describe this
candidate. It does not claim a final clean commit/tree, hosted staging result,
provider acceptance, production migration, deployment or release.

## Product contract now implemented

- DealFlow remains realtor-only and preserves the existing onboarding/UI
  structure.
- The only new-acquisition subscription is $297. A qualifying first payment
  records one immutable commercial activation and grants exactly $10 in
  generation credit once. Static generation costs $1 and video generation
  costs $5.
- Website funnels and Meta Instant Forms are independent ad-destination
  choices. Qualification depth is a separate choice.
- A paid/GHL-required workspace must have a verified ready GHL HTTPS
  destination. Pending, blocked, invalid, or unreadable GHL setup fails closed;
  it cannot silently launch on the legacy DealFlow funnel.
- Meta Instant Forms use a durable provisioning saga and an exact tenant lead
  route.
- Meta objects are first created and verified PAUSED. ACTIVE delivery requires
  a separate customer-authorized, exact-budget intent; ordered ad, ad-set, then
  campaign activation; renewable leases; generation fencing; armed effects;
  immutable receipts; provider re-read; and operator reconciliation for
  ambiguity.
- Daily and lifetime Meta budgets use separate minor-unit ceilings. Customer
  values are preserved exactly and hosted/live paths require explicit valid
  ceiling configuration.
- GHL provisioning, personalization, lead delivery, and lifecycle processing
  are durable, tenant-fenced, receipt-backed, and default off at both the app
  and database layers.
- Higgsfield is the primary guarded video path. Paid provider calls remain
  credit-reserved and default off without explicit provider authority.
- Reporting can refresh continuously. Optimization is bound to one exact
  launched campaign/ad set/ad, immutable owner consent, USD/CAD, a customer
  daily ceiling, fixed policy-v2 thresholds, 24-hour cooldown and 20% daily
  scale cap. Its claim/read/arm/dispatch/write/reconcile/settle saga continuously
  revalidates the finalized preauthorization, active delivery evidence, launch
  receipt, single-primary object receipts, lease, runtime generation, kill
  switches, currency, budget and provider hierarchy. The provider write follows
  a durable one-use dispatch nonce; expired or ambiguous armed effects require
  operator reconciliation, and budget scaling requires effective ACTIVE
  delivery. Execution is default closed;
  staging and production each require an exact host, environment, account,
  application flag, and database-runtime gate before a provider effect.
- Support has an in-product receipt path and a noncommunication staging sink;
  external delivery remains fail closed until its canonical owner destination
  is approved.

## Data and proof contract

- The frozen 80-migration recovered foundation remains immutable authority.
- Twenty-four additive product migrations extend the candidate to exactly 104
  migrations, ending at
  `20260715010000_move_legacy_org_member_policies_private.sql`. Migration
  100 adds canonical generated-video storage, migration 101 adds durable
  account deletion and provider offboarding, migration 102 adds the fenced GHL
  location display-name finalization operation, and migration 103 removes
  service-role mutation authority from the owner/legal retention configuration.
  Migration 104 permanently repairs the hosted reporting `42501` by moving all
  18 retained organization-member RLS policies from the intentionally revoked
  `public.is_org_member(uuid)` helper to the hardened
  `private.is_current_user_org_member(uuid)` helper. It keeps the public helper
  revoked, restores authorized member reads, and keeps cross-tenant and
  anonymous reads denied.
- PostgreSQL 17.6 proof must show fresh application, history replay, and frozen
  foundation followed by all extensions converge to the same public/private
  schema and the same ACL, default-ACL, policy, and function oracle.
- Final verification must run from a completely clean worktree and remain
  bound after every command to one HEAD commit, HEAD tree, tracked-file count,
  tracked-worktree SHA-256, dependency-lock SHA-256, and exact migration
  portfolio SHA-256. Node 24 and a clean `npm ci` dependency installation are
  mandatory in each round. An atomic worktree-scoped process lock rejects
  overlapping verification rounds so concurrent dependency installation cannot
  corrupt either result. Abnormal termination leaves the lock fail-closed; it
  may be removed only after the recorded owner PID and every child process are
  confirmed absent.
- The isolated staging fixture must prove direct unpaid/paid, reconciled legacy,
  white-label partner/child, admin/operator, attacker/removed-member, and
  failure/recovery scenarios. It must include a synthetic $297 activation, its
  exact-once $10 ledger receipt, idempotent replay, `meta_ads` account identity,
  deterministic timestamps/counts, exact attested auth identities, and
  synthetic-only records.
- The staging migration broker may run only after two complete passing
  final-verification rounds bind the same clean seal. It pins the isolated
  project by fingerprint and suffix. A genuinely empty hosted platform receives
  the exact 104-file portfolio and its history receipts in one transaction. The
  current qibh state must instead match the pinned read-only-proven prior-103
  state before the broker can commit only migration 104 and its receipt in one
  transaction.

## Release gates

All provider and delivery controls default closed. A local or staging pass is
not production authority. Production requires, at minimum, the exact deployed
candidate identity, authoritative production schema/backup/PITR proof, a
signed zero-old-worker drain, approved provider credentials and policies,
controlled canary results, rollback proof, and no unresolved P0/P1 findings.
If any mandatory gate is absent, the required verdict is `NO_GO` and no
production deployment may occur.

## Canonical verification

Use Node 24 LTS and PostgreSQL 17.6, then run two independent external-output
rounds with:

```bash
node scripts/run-dealflow-final-verification.mjs <external-round-directory> <round-number>
```

Only after rounds 1 and 2 both pass from the same clean seal, the isolated
staging migration broker accepts their summary files explicitly:

```bash
node scripts/staging/apply-fresh-staging-migrations.mjs \
  /private/tmp/dealflow-overnight-release-20260712 \
  <new-external-staging-evidence-directory> \
  <round-1-directory>/verification-summary.json \
  <round-2-directory>/verification-summary.json \
  --apply-forward-exact <pinned-read-only-103-run>/migration-proof
```

The broker refuses a dirty or different repository, different round seals,
an unpinned project identity, any nonempty hosted database that is not the exact
pinned prior-103 state selected by forward mode, an unpinned local PostgreSQL
runtime, non-owner-only project authority, or a migration portfolio other than
the exact 104 reviewed files. Fresh mode still requires a genuinely empty
hosted database and never falls back from forward mode. It obtains the database
password from Keychain into process memory and supplies it only to the
interactive password prompt; the password is not placed in arguments, process
environment, evidence, or repository files.

The runner includes lint, typecheck, production build, product/security
contracts, the completion suite, all database suites, the 104-migration
integrated proof, GHL destination fencing, Meta budget safety, Meta activation,
the customer-authorized optimizer executor, and staging-fixture contracts.

Hosted staging acceptance must additionally use the centralized
zero-external-effects proof, fail if any authenticated Playwright test is
skipped, cover direct/partner/admin/attacker and EN/FR/ES journeys across the
configured browser/device matrix, run bounded synthetic no-write lead load, and
retain a sanitized manifest/checksum portfolio.

The isolated project has a retained read-only proof for the exact predecessor
103-migration state. The forward broker now accepts only that pinned pre-state
and can commit only migration 104 plus its history receipt in one outer
transaction. That 103-to-104 hosted transition is implemented but remains
`NOT_YET_RUN`; it requires the new clean candidate and two passing exact-seal
rounds first.

## Current operating documents

- `CURRENT_RELEASE_ISSUE_LEDGER.md`
- `CURRENT_VS_DESIRED.md`
- `TEST_AND_PROOF_MATRIX.md`
- `MIGRATION_AND_ROLLBACK.md`
- `SYSTEMS_OF_RECORD.md`
- `PROVIDER_ACCEPTANCE_BOUNDARIES.md`
- `GHL_PRODUCTION_OPERATING_CONTRACT.md`
- `META_OPERATING_CONTRACT.md`
- `OPTIMIZATION_POLICY.md`
- `COMMERCIAL_SUPPORT_WHITE_LABEL_CONTRACT.md`
- `MULTILINGUAL_PRODUCT_CONTRACT.md`
- `FINAL_RELEASE_DOCUMENTATION_CHECKLIST.md`

Until the checklist is populated with retained evidence for one exact seal and
deployment, every unresolved field remains exactly `PENDING_FINAL_SEAL` or
`NOT_YET_RUN`; the verdict remains `NO_GO`.
