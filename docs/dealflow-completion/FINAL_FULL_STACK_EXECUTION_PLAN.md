# DealFlow final full-stack execution plan

> **Superseded as an execution authority on 2026-07-17.** Preserve this document
> as historical planning evidence. The only current release-closure authority is
> [`../release/MASTER_RELEASE_PLAN.md`](../release/MASTER_RELEASE_PLAN.md).

Status: **EXECUTION READY / PRODUCTION NO_GO**
Plan version: `dealflow.full-stack-execution.v1`
Starting baseline commit: `042fed5d9080a2cd4ba3393420584b61d6f3eb7e`
Starting baseline tree: `c80d60c2612883af6a9663fe98d8ef4695af2a8d`
Current dependency lock SHA-256: `c95f4be2a2fb44f87a401138ba6b2ec4085b6994a96d76ad2b0928945bee1d9b`
Current migration portfolio: `115` files, SHA-256 `581f4a33126f65259939c1c307fa5c6f949c1956b4354db5889bc95625885849`
Controlling-plan SHA-256: `22f787c57a3fbf00081db0a57ec0c3ebfcf1f28d8a939556cb3da069db969b37`

This document is a tracked authority and orchestration overlay. It does not change runtime behavior, authorize production, or replace any acceptance criterion in the 53 controlling requirements. The final implementation identity is intentionally emitted into detached evidence after the repository is sealed, because a tracked document cannot contain its own commit and tree without creating a self-reference. Qualification must bind that detached identity to this exact baseline ancestry, lockfile and migration portfolio.

## Definition of 100%

DealFlow reaches engineering completion when every mandatory requirement below is implemented, evidence-bound and free of known P0/P1, security, tenancy, financial-integrity, data-loss or required-journey defects. It reaches production completion only after every external owner/legal/provider/recovery/release gate passes, the ordered cutover succeeds and the real observation windows complete.

“100%” does not mean claiming that no future defect can ever exist. It means:

- zero unresolved mandatory implementation rows;
- zero unapproved skips, warnings or flaky qualification results;
- zero tenant crossing, lead loss, duplicate effect or financial mismatch;
- truthful missing, stale, failed and ambiguous states;
- one exact source/schema/artifact promoted through every gate;
- safe forward recovery and effect shutdown proven before customer traffic; and
- exact limitations and intentionally disabled capabilities recorded in the final seal.

No overnight run can fabricate legal approval, provider ownership, production authority, a 24-hour observation period, or the later 7-day and 30-day reviews.

## Non-negotiable execution controls

1. Preserve the current UI direction and existing working infrastructure. Make only evidence-backed corrections.
2. Never infer authority from an environment variable, credential presence, HTTP success, queue row, redirect, mock or prose statement.
3. All 43 owner/legal decisions remain unresolved and fail closed until the signed packet is complete. The canonical packet is [`config/authority/dealflow-owner-decisions.v1.json`](../../config/authority/dealflow-owner-decisions.v1.json).
4. Persist immutable intent before any provider effect. Use one-use dispatch identity, bounded timeout, provider readback, durable receipt, reconciliation and no blind retry after ambiguity.
5. Keep production, customer data, live spend, live billing, customer communications, DNS and public aliases untouched until their named gates and separate authorization pass.
6. Use additive migrations and additive forward recovery. Never use destructive rollback as routine recovery.
7. Any tracked source, schema or release configuration change invalidates previous qualification and requires one new exact seal.
8. Every proof records exact commit, tree, lock digest, migration digest, deployment, environment, provider account fingerprint, observed time and expiry.
9. Run tests with retries disabled. A retry-assisted or nondeterministic pass does not qualify release.
10. Stop immediately on tenant crossing, lead loss, duplicate provider effect, financial mismatch, secret/PII exposure, unexplained ambiguity or missing recovery authority.

## Chunk 1 — Decisions, product completion and immutable local seal

### Assigned controlling requirements: 11/53

- `CORE-ADMIN-001`
- `CORE-AUTH-001`
- `CORE-CAMPAIGN-001`
- `CORE-FUNNEL-001`
- `CORE-ONBOARDING-001`
- `CORE-QUALITY-SCALE-001`
- `CORE-SECURITY-DATA-001`
- `CORE-UI-001`
- `PRIVACY-COMPLIANCE-001`
- `PVD-FOUNDATION-001`
- `SEC-PRIVILEGED-TENANCY-001`

### Execute

1. Validate the 43-row decision packet. Apply its explicit safe defaults to every unsigned choice; do not invent an approval.
2. Complete local source, schema, UI, security, privacy, financial, deletion, export, KPI, accessibility, localization, scale and operator-truth gaps while preserving working architecture.
3. Make authentication complete: verification, recovery, session lifecycle, multi-workspace switching, AAL2/recent-auth for high-risk operations, role changes, break-glass auditing and production-disabled QA bypasses.
4. Make onboarding inputs versioned, tenant scoped, resumable and traceable through copy, funnel, creative and launch outputs. No paid generation before recognized positive Stripe activation.
5. Make campaign lifecycle durable from draft through provider-readback-confirmed terminal states, including DST-safe 9:00 a.m. Eastern scheduling and ambiguity handling.
6. Make all customer/admin UI states truthful. Missing provider data is never rendered or persisted as zero; security scores are evidence-backed or unavailable.
7. Add executable privacy authority, consent history/withdrawal, DSAR/export, deletion/offboarding and backup anti-resurrection behavior only under approved policy. Unapproved processing stays disabled.
8. Prove RLS plus every bypass path: service role, database owner, cron, security-definer functions, storage, cache, realtime, provider mappings, jobs, admin and impersonation.
9. Complete CI and supply-chain controls: immutable install, pinned runtime/tooling, vulnerability/license/secret scans, SBOM, provenance, requirement-to-test coverage and 300-tenant synthetic capacity proof.
10. Regenerate source, lock, migration, SBOM, license and provenance identities, then seal one clean descendant.

### Qualification

- Targeted unit, contract, concurrency, timeout, ambiguity, replay, recovery, RLS and disposable-database tests.
- Full fresh migration replay and normalized schema/ACL/RLS proof.
- Lint, typecheck, production build, secret scan, dependency audit, SBOM and license-policy validation.
- Four-engine browser/device matrix, WCAG 2.2 AA checks, visual diff, keyboard and representative assistive-technology review.
- Complete exact local command portfolio twice from independent clean states against the same candidate, with zero failures, skips, retries, unexplained warnings or residue.

### Exit

Every locally closable row is verified, unresolved rows are demonstrably external-authority-only, all 43 decisions are either signed or safely disabled, and one immutable exact candidate is locally qualified twice.

## Chunk 2 — Isolated staging and provider acceptance

### Assigned controlling requirements: 15/53

- `PVD-CONTENT-RIGHTS-001`
- `PVD-CREATIVE-001`
- `PVD-DELETE-001`
- `PVD-GHL-001`
- `PVD-GHL-COMMUNICATION-SAFETY-001`
- `PVD-GOLDEN-001`
- `PVD-LEAD-OUTCOME-FEEDBACK-001`
- `PVD-LOCALIZATION-001`
- `PVD-META-001`
- `PVD-OPTIMIZER-001`
- `PVD-REPORT-001`
- `PVD-STRIPE-001`
- `PVD-TWILIO-001`
- `PVD-WHITELABEL-001`
- `VISION-SUPPORT-001`

### Execute

1. Deploy the exact sealed artifact to protected isolated staging. Build an empty database from the exact migration chain and prove schema, ACL, RLS, tenant isolation, seed, replay, injected-failure containment, application cutback and additive forward recovery.
2. Run authenticated direct-realtor, partner-admin, partner-child, platform-admin, attacker, unpaid, paid, grace, canceled, deleted, EN/FR/ES, desktop/mobile and accessibility journeys with synthetic data only.
3. Open one provider capability at a time in a separate acceptance deployment. Bind every capability to exact environment, provider account, tenant, ceiling and expiry; close it in `finally`.
4. Prove Stripe test activation, $297 subscription semantics, one $10 grant, $1 static and $5 video charging, top-up, refund/dispute/failure behavior and append-only reconciliation.
5. Prove GHL install/token lifecycle, snapshot/slot manifest, provisioning, fixed-form catalog, lead/contact/opportunity/workflow effects, refresh/reconnect/uninstall and platform-owned versus customer-owned offboarding.
6. Prove Meta OAuth, Page/Pixel/form selection, 9:00 a.m. launch, Instant Form ingestion, website lead dedupe, reporting and optimizer shadow/canary within approved budgets. Pixel/CAPI remain consent-gated.
7. Prove static/video generation, storage, content/rights provenance, timeout/ambiguity recovery, credits and cleanup. No paid call occurs without an approved ceiling.
8. Prove Twilio only inside an approved test boundary; keep lead-facing communications disabled unless separately signed. Prove GHL hidden workflows cannot emit unapproved communications.
9. Prove support ticket persistence remains authoritative while safe-recipient notification, callback lifecycle, bounce/suppression and ambiguity handling work without ticket loss.
10. Prove consent grant/deny/withdrawal, DSAR/export tenant isolation, correction, deletion/legal hold/provider ambiguity and no backup resurrection.
11. Prove truthful KPI lineage, synthetic-data exclusion, lead-quality outcomes, reporting freshness states and optimizer refusal when source data is stale, missing or failed.
12. Run the direct and both partner golden journeys plus provider-disabled 300-tenant load/soak under the signed infrastructure and provider cost ceiling.

### Exit

One staging-qualified artifact has exact source, schema, deployment, environment, alias, browser, provider, scale and cleanup evidence. Every supported provider has readback-confirmed receipts; any provider lacking a safe test boundary remains explicitly disabled and release-blocking only for its dependent capability.

## Chunk 3 — Production truth, recovery and pre-mutation admission

### Assigned controlling requirements: 16/53

- `REL-CANARY-INGRESS-001`
- `REL-CAPABILITY-001`
- `REL-DEPLOYMENT-001`
- `REL-DOMAINS-001`
- `REL-DRAIN-001`
- `REL-ENV-001`
- `REL-GUARD-001`
- `REL-MIGRATION-001`
- `REL-MIGRATION-IMPACT-001`
- `REL-OBS-001`
- `REL-PROD-TRUTH-001`
- `REL-SIGNED-PREREQUISITE-INDEX-001`
- `REL-SOURCE-001`
- `REL-SUPPLY-CHAIN-001`
- `REL-TRUST-001`
- `REL-WHOLE-SYSTEM-DR-001`

### Execute

1. Recover or establish the authoritative owner-controlled private remote without squashing history. Prove ancestry, protect branches/tags/environments, require exact checks and CODEOWNERS, and use short-lived workload identity plus external signing authority.
2. Build once from the signed tag on a protected runner, sign provenance and independently match the promoted artifact digest.
3. Capture fresh read-only production truth: deployments, domains, environment metadata, schema/migrations/ACL/RLS, row-count-only compatibility inventory, tenants, subscriptions, balances, campaigns, funnels, leads, jobs, workers and provider mappings.
4. Produce a disposition for every existing tenant and funnel. Preserve existing entitlements and history; do not infer ownership or repair ambiguous provider mappings.
5. Prove exact production migration delta, lock/impact budgets, non-empty compatibility and additive forward recovery using a production-scale isolated clone.
6. Prove backup, PITR and full-system restore including Auth, Storage, database, jobs, deployments, DNS metadata, provider lineage and key-encryption authority. Measure signed RPO/RTO and prove deleted data/effects cannot resurrect or replay.
7. Create the dormant protected production deployment from the exact promoted artifact with aliases detached and provider effects closed.
8. Prove environment attestation, stable OAuth/webhook ingress, old-worker drain, WAF/abuse/privacy controls, monitoring, alert delivery, dashboards, staffed owners, runbooks and capability policy.
9. Create one externally signed prerequisite index binding every still-fresh evidence object and its expiry.
10. Run the enforced release guard and require exact `PRE_MUTATION_ADMISSION_PASS`.

### Exit

A cryptographically authorized dormant production candidate, complete recovery portfolio and `PRE_MUTATION_ADMISSION_PASS` exist for the same exact artifact. This still does not authorize schema mutation or customer traffic.

## Chunk 4 — Ordered cutover, customer ramp and evidence seals

### Assigned controlling requirements: 11/53

- `REL-ALIASES-001`
- `REL-CANARY-001`
- `REL-CUTOVER-001`
- `REL-GOLDEN-001`
- `REL-LEGACY-FUNNEL-MIGRATION-001`
- `REL-MONITOR-001`
- `REL-POST-ALIAS-GUARD-AND-RAMP-001`
- `REL-POST-MIGRATION-GUARD-001`
- `REL-PRE-ALIAS-001`
- `REL-RECOVERY-001`
- `REL-SEAL-001`

### Execute

1. Obtain separate explicit production authorization naming the exact artifact, migration, domains, provider accounts, ceilings, owners and release window.
2. Apply only the approved additive schema migration. Regenerate affected evidence and require `POST_MIGRATION_RUNTIME_PASS` before running the application or any provider canary.
3. On the protected production URL, prove auth, entitlement, tenancy, admin, localization, accessibility, onboarding, campaign creation, support, lead dedupe, reporting and worker behavior with all external effects closed.
4. Run owner-marked synthetic provider canaries sequentially: Stripe, GHL, Meta, creative, Twilio/support, lead capture and deletion. Require readback and reconciliation before opening the next capability.
5. Attach public and partner aliases in internal-only mode. Admit only owner/server-marked synthetic identities; keep signup and customer traffic blocked.
6. Run complete public and partner golden journeys, regenerate routing evidence and require `POST_ALIAS_RUNTIME_PASS`.
7. Migrate legacy funnels one tenant at a time with compatibility proof, dual observation, one canonical lead effect, preserved URL/attribution and additive forward recovery.
8. Ramp approved customer cohorts gradually. Stop on any SLO, error, queue, lead, billing, provider, spend, tenant or ambiguity threshold.
9. Monitor through the first 9:00 a.m. Eastern launch boundary and complete staffed 24-hour qualification.
10. Seal the immutable `GO_LIVE_SEAL`, including exact identities, gates, receipts, costs, communications, cleanup, recovery position and known limitations.
11. Complete separate real 7-day and 30-day reviews before issuing `PRODUCTION_STEADY_STATE` and `STEADY_STATE_SEAL`.

### Exit

Production is live only after every named gate passes, the exact candidate is serving approved customer traffic, provider effects reconcile, the 24-hour observation passes and the go-live evidence bundle validates independently. Mature retention/churn and 7/30-day steady-state claims remain pending until real time and cohorts exist.

## Global stop conditions

At any point, close the affected capability and stop progression when there is:

- source, artifact, schema, environment, account, domain or authority drift;
- missing or expired signed evidence;
- tenant crossing, privilege bypass or privacy-policy violation;
- lead loss, duplicate lead/provider effect or provider write ambiguity;
- billing, credit, refund, dispute or provider-cost mismatch;
- missing backup/restore/forward-recovery authority;
- unexplained test skip, retry, warning, flake, cancellation or residue;
- unbounded latency, queue growth, rate-limit collapse or SLO breach; or
- any unapproved spend, communication, customer-data access or production mutation.

Recovery closes the capability first, preserves receipts and provider truth, reconciles authoritative systems, and uses the proven application-cutback or additive-forward-recovery path. Never deploy an old checkout merely because it predates a defect.

## Final completeness accounting

- Controlling requirements assigned exactly once: `53/53`.
- Owner/legal decisions represented in the fail-closed packet: `43/43`.
- Execution chunks: `4`.
- Production authorization granted by this plan: `NO`.
- Current release verdict: `NO_GO` until the named implementation, authority, staging, recovery, trust and production gates pass.

Validate this authority plane with:

```bash
npm run authority:validate
npm run test:authority
```
