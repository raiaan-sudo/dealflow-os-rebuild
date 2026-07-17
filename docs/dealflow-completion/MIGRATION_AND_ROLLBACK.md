# DealFlow migration, drain, and forward-recovery contract

> **Historical predecessor contract.** The 104-migration and 103-to-104 details
> below remain evidence for that exact predecessor only. Current successor truth
> is [`FINAL_MASTER_SUCCESSOR_STATUS_20260716.md`](FINAL_MASTER_SUCCESSOR_STATUS_20260716.md):
> 108 migrations ending at `20260716200000_harden_stripe_payment_lifecycle.sql`,
> with clean-seal, staging, drain and production proof all `NOT_YET_RUN`.

Overall verdict: `NO_GO`
Frozen foundation: `80 MIGRATIONS / HISTORICAL_PASS`
Integrated candidate: `104 MIGRATIONS / PENDING_FINAL_SEAL`
Exact clean-seal 104-chain proof: `NOT_YET_RUN`
Isolated hosted staging application: `NOT_YET_RUN`
Production migration: `NOT_YET_RUN`

No shared or production database change, deployment, provider action, flag
change, destructive rollback, or production release is authorized by this
document.

## Historical foundation versus current candidate

The original tracked replay failed before `public.campaign_plans` existed. The
raw failing-before artifact remains immutable at
`evidence/migration/fresh-replay-result.json`. The recovered authority later
produced a frozen 80-migration foundation and retained PostgreSQL 17.6 evidence
for 14 foundation/adoption/collision/RLS/recovery gates. That evidence is a
`HISTORICAL_PASS` for migrations 1-80; it is not proof of the current extensions.

The current source tree contains exactly 104 ordered SQL migrations. The
twenty-four additive extensions after the frozen foundation are:

81. `20260712213000_create_ghl_sandbox_provider_path.sql`
82. `20260712214000_create_continuous_reporting_and_safe_optimizer.sql`
83. `20260712223000_complete_ghl_activation_and_lifecycle_foundation.sql`
84. `20260712235991_create_meta_instant_form_provisioning.sql`
85. `20260713010000_harden_support_external_delivery.sql`
86. `20260713011000_create_customer_authorized_meta_activation.sql`
87. `20260713012000_require_meta_activation_preauthorization.sql`
88. `20260713012100_harden_meta_activation_delivery_and_recovery.sql`
89. `20260713013000_create_customer_authorized_meta_optimizer_executor.sql`
90. `20260713014000_scope_ghl_personalization_to_campaign.sql`
91. `20260713015000_bind_verified_partner_attribution_atomically.sql`
92. `20260713016000_terminalize_ambiguous_ghl_dispatches.sql`
93. `20260713017000_make_paid_creative_dispatch_recoverable.sql`
94. `20260713018000_harden_meta_reporting_and_leadgen_integrity.sql`
95. `20260713019000_capture_public_lead_and_outbox_atomically.sql`
96. `20260713020000_add_fair_reporting_worker_claim.sql`
97. `20260713021000_require_paid_activation_for_campaign_creation.sql`
98. `20260713022000_reconcile_native_ghl_form_submissions.sql`
99. `20260713024000_add_durable_ghl_periodic_form_sweeps.sql`
100. `20260713025000_add_generated_video_canonical_storage.sql`
101. `20260713026000_add_account_deletion_and_provider_offboarding.sql`
102. `20260713027000_add_ghl_location_display_name_finalization.sql`
103. `20260713028000_harden_account_deletion_retention_authority.sql`
104. `20260715010000_move_legacy_org_member_policies_private.sql`

Migrations 90-104 are not cosmetic. They prevent location-global GHL personalization
from allowing one website campaign to overwrite another. Readiness becomes an
exact organization + campaign + environment + manifest-slot + source-plan
fingerprint fact. Legacy root-only personalization can serve one campaign only;
a second campaign fails closed until an approved non-overlapping slot exists.
They also atomically bind verified partner attribution, terminalize ambiguous
GHL writes instead of replaying them, recover paid creative provider output
without a second charge or provider POST, fence Meta reporting and attribution
to immutable launch identity, commit public leads and their side-effect job in
one transaction, provide fair leased reporting-worker claims, and keep campaign
creation preview-limited until eligible billing has durable paid activation or
explicit legacy reconciliation.
Migration 98 adds signed native GHL form-submission reconciliation, exact
campaign consent/question contracts, location-scoped read authority, bounded
polling, tenant-safe lead idempotency, fenced rotation/retirement, and audited
operator replay while leaving provider execution default-off.
Migration 99 adds a durable, leased, GET-only periodic recovery sweep for GHL
native-form submissions. It binds each claim and scope proof to the exact
mapping credential generation and form set, preserves a bounded no-loss
backfill anchor, revalidates both runtime gates immediately before every
provider read, fences credential rotation and retirement, isolates
retry/operator outcomes, and preserves immutable generation-scoped replay
audits while resetting each proven generation's bounded retry/replay budget.
Both reconciliation and sweep execution remain independently default-off.
Migration 100 adds the private immutable binding ledger and service-only atomic
binding path for canonical generated-video objects, plus exact tenant-path,
no-overwrite, identity/URL immutability, and reserved-prefix storage guards.
Migration 101 adds the always-on account-suspension fence, owner-verified and
idempotent deletion request lifecycle, leased ordered tasks, append-only
receipts and legal holds, bounded retention/pseudonymization, and proof-bound
provider offboarding. Execution and provider-write controls remain default-off.
Migration 102 adds the fenced GHL location display-name finalization operation.
It keeps the full immutable request tag only until exact location identity is
durable, then requires official PUT cleanup and GET readback of the clean name
before snapshot provisioning can advance.
Migration 103 closes the retained account-deletion authority gap. The
owner/legal retention configuration remains readable by `service_role`, but
only database-owner authority may mutate it; explicit postconditions fail the
migration if the service role retains `INSERT`, `UPDATE`, `DELETE`, or
`TRUNCATE` privileges at table level, or any column-level `INSERT`, `UPDATE`,
or `REFERENCES` grant survives.
Migration 104 closes the authenticated reporting failure discovered on isolated
staging. The hardened foundation intentionally revoked API-role execution of
`public.is_org_member(uuid)`, but 18 retained organization-member policies still
called that public helper. Authorized dashboard reads could therefore fail with
SQLSTATE `42501`, which surfaced as an HTTP `500` instead of reporting data.
Migration 104 changes all 18 policies to the already hardened
`private.is_current_user_org_member(uuid)` helper, restricts the policies to the
`authenticated` role, and fails before or after mutation if the exact portfolio
shape is incomplete. It does not re-grant the public helper. Targeted disposable
PostgreSQL 17.6 proof reproduces the failure, proves 18/18 policies repaired,
replays safely, restores the authorized member read, denies cross-tenant and
anonymous reads, and proves that the public RPC remains unavailable.

The final manifest must derive count, order, per-file digest, and aggregate
digest from the exact clean commit. Those values are `PENDING_FINAL_SEAL` and
must not be copied from a working tree.

## Required local 104-chain proof

Using PostgreSQL 17.6 and the exact clean candidate, both final rounds must prove:

1. all 104 migrations apply in order to a fresh disposable database;
2. frozen foundation followed by extensions converges to the same semantic
   public/private schema as the direct fresh chain;
3. exact migration history replay performs zero structural mutation;
4. known foundation, partial, metadata, column, index, policy, privilege, and
   campaign-personalization collisions fail before mutation;
5. RLS, force-RLS, grants/revocations, default ACLs, relation/routine/sequence
   ownership, function search paths, and direct-DML denials match the oracle;
6. old-worker/new-schema and new-worker/old-schema boundaries fail safely;
7. migration 104 reproduces the retained public-helper `42501`, repairs exactly
   18 policies, restores authorized member access, preserves cross-tenant and
   anonymous denial, keeps the public helper revoked, and replays safely;
8. injected transactional failure leaves no migration-history or schema
   partials and succeeds through reviewed forward completion;
9. tenant/campaign/provider receipts, activation, billing, lead, support, GHL,
   Meta, and optimizer invariants survive idempotent replay;
10. two independent final databases produce the same normalized digest; and
11. all disposable roles/databases/processes are removed after proof.

Current result for the exact final 104-migration seal: `NOT_YET_RUN`.

## Isolated staging application contract

The staging broker may run only after two passing final summaries bind the same
clean seal. It must independently verify:

- exact 104-file inventory and final filename;
- exact repository commit/tree/content/lock/migration digests;
- exact isolated Supabase fingerprint and safe suffix;
- exact staging Vercel project and host with no production alias;
- owner-only database authority and either an empty supported platform baseline
  or the pinned exact prior-103 qibh proof;
- PostgreSQL runtime compatibility;
- one outer transaction for the selected portfolio (fresh 104 or forward-only
  migration 104) and every matching history receipt;
- post-application schema/ACL/RLS digest and idempotent replay; and
- sanitized external evidence with no credential or customer payload.

The isolated project has retained read-only proof of the exact prior-103
migration history, schema and structural catalog, bound to the predecessor
candidate. The forward-only broker is pinned to that proof and rejects any
different first-103 filename, SQL digest, commit/tree or remote state before it
can mutate. If authorized after the new clean candidate and two exact-seal
rounds, it may commit only migration 104 and its history receipt in one outer
transaction, then repeat the history, catalog, schema, ACL and closed-provider
checks. This implemented 103-to-104 transition is `NOT_YET_RUN`; the retained
prior-103 proof is not current-104 acceptance.

The database password may be borrowed only through the approved ephemeral
secret path. It must not enter arguments, environment dumps, logs, evidence,
repository files, or chat. Hosted staging application is `NOT_YET_RUN`.

## Read-only production preflight

Before any production mutation is considered, capture and compare, read-only:

1. exact production project/account/host and current deployment identity;
2. migration history, extension versions, schema/ACL/RLS/function digests, and
   row-count-only collision/sentinel checks;
3. backup recency, restore target, PITR window, and restore-test authority;
4. active/leased/armed/ambiguous jobs across every superseded protocol; and
5. current provider/runtime flags as signed booleans, never raw secrets.

Any missing foundation object, unexpected migration, collision, nonzero unsafe
sentinel, incompatible active worker, stale backup, or identity mismatch is an
immediate `NO_GO`. Production preflight is `NOT_YET_RUN`.

## Mandatory old-worker and provider-protocol drain

Before the contract boundary, signed exact-deployment evidence must prove zero
old or in-flight unsafe work for all superseded application and provider paths,
including Meta launch/activation/optimizer/CAPI, GHL provisioning/
personalization/lead effects, Stripe billing/provider usage, Twilio/support
communications, creative generation/storage, and system-job protocol versions.

The proof must be fresh, independently signed under the protected external
release trust, exact-deployment bound, and regenerated immediately before
migration. Logs, a quiet interval, caller-authored JSON, or target-added keys are
not evidence. Signed drain proof is `NOT_YET_RUN`.

## Forward recovery, not destructive rollback

Before any contract migration, stop and correct the candidate or procedure.
After the boundary changes RPCs, direct-write authority, leases, receipts,
billing, tenant, activation, or terminal-state semantics, the historical
baseline is not a safe automatic application rollback target.

Recovery must be a reviewed additive patch/migration that preserves migration
history and every durable job, receipt, payment, credit, lead, support,
deletion, consent, GHL, Meta, and provider record. Never:

- run destructive down migrations;
- delete candidate tables/columns/evidence rows to force compatibility;
- rewrite tenant/campaign ownership or first-match ambiguous mappings;
- erase claims, leases, receipts, consent, payments, or audit history; or
- deploy an older checkout merely because it predates the failure.

The retained 80-migration foundation includes a historical local
forward-recovery drill. A final-seal 104-chain local drill, hosted staging drill,
and production-bound recovery exercise are all `NOT_YET_RUN`.
