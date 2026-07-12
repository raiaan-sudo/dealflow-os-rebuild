# Migration, drain, and forward-recovery contract

Status: `NO_GO / 14 OF 14 LOCAL SCHEMA GATES PASS / EXTERNAL RELEASE AUTHORITY ABSENT`

No shared/production database change, deployment, provider action, flag change,
or rollback is authorized by this document.

## Superseded historical blocker and current proof

The original disposable replay stopped at the first tracked baseline migration:

- file: `20260426110000_add_campaign_plan_critical_fields.sql`
- statement: `0`
- SQLSTATE: `42P01`
- error: `public.campaign_plans does not exist`

That raw evidence remains unchanged at
`docs/dealflow-completion/evidence/migration/fresh-replay-result.json` as
superseded failing-before evidence. It is not current candidate status.

The recovered authority now drives an 80-migration portfolio and all 14 local
schema gates pass on PostgreSQL 17.6. The proof covers fresh replay,
authoritative-current adoption, May-2 upgrade, legacy and partial-collision
rejection before mutation, idempotent replay, safe and unsafe sentinel paths,
integrated RLS/private-schema shape, mixed-version safety, two deterministic
final databases, zero-residue cleanup, and forward recovery. The local schema
blocker is cleared. Staging, production, provider acceptance, signed drain, and
exact-environment/release authority remain unproven and unauthorized.

## Migration portfolio and candidate inventory

The full local portfolio contains 80 migrations: 51 sealed tracked migrations
plus 29 explicitly labeled forward-reconstruction files. The generated lineage
never claims that unavailable historical SQL bodies were recovered. Four
tenant-specific data-only identities are preserved as tenant-neutral no-ops
rather than inventing customer, credential, partner, provider, or branding data.

The application-hardening subset below currently adds or hardens:

1. `20260710170000_create_ghl_tenant_provisioning_foundation.sql`
2. `20260710180000_activation_onboarding_contract.sql`
3. `20260710234500_harden_jobs_lead_effects_meta_deletion.sql`
4. `20260710235000_create_launch_receipts_optimizer_support.sql`
5. `20260710235500_schedule_launch_claim_fencing.sql`
6. `20260710235600_harden_sms_delivery_receipts.sql`
7. `20260710235700_protect_creative_asset_storage_identity.sql`
8. `20260710235750_fence_lead_campaign_tenant_identity.sql`
9. `20260710235800_harden_meta_oauth_state.sql`
10. `20260710235900_fence_stripe_webhook_processing.sql`
11. `20260710235950_gate_campaign_creation_entitlement.sql`
12. `20260710235960_harden_campaign_tenant_authority.sql`
13. `20260710235970_harden_stripe_protocol_and_credit_intents.sql`
14. `20260710235980_harden_sms_protocol_and_tenant_fk.sql`
15. `20260710235990_create_meta_leadgen_ingestion.sql`
16. `20260710235991_harden_financial_integrity.sql`
17. `20260710235992_harden_access_key_reveal_claim.sql`
18. `20260710235993_harden_access_key_claim_delivery.sql`

The final manifest must derive file count, order, and aggregate SHA-256 from the
exact committed target. This narrative list is not a digest or release proof.

## Read-only preflight and post-verification

1. Prove exact target/baseline ancestry and migration digests outside the DB.
2. Run
   `docs/dealflow-completion/evidence/migration/read-only-preflight.sql` before
   candidate migrations. It references established schema only and returns
   booleans/aggregate counts; it performs no repair, remap, delete, or first-match
   coercion.
3. Stop on any missing foundational relation or nonzero blocker count.
4. The complete local disposable proof has passed. Apply the complete chain to
   staging only when that isolated target is separately authorized.
5. Run
   `docs/dealflow-completion/evidence/migration/read-only-post-migration-verification.sql`
   after the chain completes. It must cover candidate relations, constraints,
   RLS/force-RLS, grants/revocations, v2-only RPCs, direct-DML negatives,
   migration blockers, immutable identity, and terminal/replay invariants.
6. Local representative prior-schema and idempotent replay have passed. Repeat
   them against the authorized exact staging target before release consideration.

No preflight script may reference a relation that only the candidate creates.

## Mandatory two-phase old-worker and provider-protocol drain

### Phase 1 — compatible drain

Deploying drain code is a separate future authorization. Before any contract
migration, stop new v0/v1 dispatch and positively prove zero active work for:

- `campaign_plan_v0_writers`
- `meta_launch_v0_workers`
- `sms_delivery_v0_workers`
- `stripe_webhook_v1_workers`
- `system_job_v1_workers`

The evidence must be fresh, exact-target and exact-deployment bound,
Ed25519-signed by an authority pinned in a protected external policy whose path
and independently authorized digest come from the out-of-band runner, and
contain exactly zero for every class. Target-declared keys, logs, elapsed
timeout, caller-authored JSON, or absence of traffic are not proof.

The provider cutover must also account for all five externally consequential
classes—Meta launch/CAPI, GHL provisioning/lead effects, Twilio SMS/compliance,
Stripe webhook/billing/provider usage, and creative generation/storage—so no
old worker can pass its last fence and issue a late provider request.

### Phase 2 — contract and verify

1. Reconfirm signed zero counts immediately before the boundary.
2. Apply reviewed protocol-contract migrations.
3. Deploy only the exact v2-only commit bound to the evidence.
4. Run post-migration counts, RLS/privilege negatives, claim/heartbeat/settle,
   stale-generation, ambiguity, direct-DML, and release-guard probes.
5. Keep all live provider gates off pending a separately authorized canary.

If an old worker appears after the boundary, stop new v2 dispatch and treat it
as an incident. Never restore an incompatible binary against contracted schema.

## Forward recovery, not historical rollback

Before the contract boundary, stop and correct the candidate/drain procedure.
After a migration removes old RPCs, revokes old direct writes, or changes lease,
receipt, billing, tenant, or terminal-state semantics, the production baseline
is not a valid application rollback target.

Recovery is a reviewed forward application patch and/or additive
forward-recovery migration that preserves durable job, receipt, billing, credit,
lead, support, deletion, and provider evidence. Do not:

- run destructive down migrations;
- delete candidate columns/tables or evidence rows;
- rewrite tenant ownership or first-match ambiguous records;
- erase receipts, claims, consent, or audit history; or
- switch to an older checkout merely because it predates the failure.

The local injected-failure forward-recovery drill passed with zero partial
mutation and successful forward completion. Destructive down rollback remains
intentionally unattempted because the historical baseline is not claimed safe
after the contract boundary. Release remains `NO_GO` because staging,
production, signed drain/environment authority, and live-provider acceptance
are still absent.
