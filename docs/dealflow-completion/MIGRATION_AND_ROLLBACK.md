# DealFlow migration, drain, and forward-recovery contract

Overall verdict: `NO_GO`
Frozen foundation: `80 MIGRATIONS / HISTORICAL_PASS`
Integrated candidate: `99 MIGRATIONS / PENDING_FINAL_SEAL`
Exact clean-seal 99-chain proof: `NOT_YET_RUN`
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

The current source tree contains exactly 99 ordered SQL migrations. The nineteen
additive extensions after the frozen foundation are:

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

Migrations 90-99 are not cosmetic. They prevent location-global GHL personalization
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

The final manifest must derive count, order, per-file digest, and aggregate
digest from the exact clean commit. Those values are `PENDING_FINAL_SEAL` and
must not be copied from a working tree.

## Required local 99-chain proof

Using PostgreSQL 17.6 and the exact clean candidate, both final rounds must prove:

1. all 99 migrations apply in order to a fresh disposable database;
2. frozen foundation followed by extensions converges to the same semantic
   public/private schema as the direct fresh chain;
3. exact migration history replay performs zero structural mutation;
4. known foundation, partial, metadata, column, index, policy, privilege, and
   campaign-personalization collisions fail before mutation;
5. RLS, force-RLS, grants/revocations, default ACLs, relation/routine/sequence
   ownership, function search paths, and direct-DML denials match the oracle;
6. old-worker/new-schema and new-worker/old-schema boundaries fail safely;
7. injected transactional failure leaves no migration-history or schema
   partials and succeeds through reviewed forward completion;
8. tenant/campaign/provider receipts, activation, billing, lead, support, GHL,
   Meta, and optimizer invariants survive idempotent replay;
9. two independent final databases produce the same normalized digest; and
10. all disposable roles/databases/processes are removed after proof.

Current result for the exact final 99-migration seal: `NOT_YET_RUN`.

## Isolated staging application contract

The staging broker may run only after two passing final summaries bind the same
clean seal. It must independently verify:

- exact 99-file inventory and final filename;
- exact repository commit/tree/content/lock/migration digests;
- exact isolated Supabase fingerprint and safe suffix;
- exact staging Vercel project and host with no production alias;
- owner-only database authority and an empty supported platform baseline;
- PostgreSQL runtime compatibility;
- one transaction per migration plus its history receipt;
- post-application schema/ACL/RLS digest and idempotent replay; and
- sanitized external evidence with no credential or customer payload.

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
forward-recovery drill. A final-seal 99-chain local drill, hosted staging drill,
and production-bound recovery exercise are all `NOT_YET_RUN`.
