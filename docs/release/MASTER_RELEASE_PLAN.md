# DealFlow OS canonical master release-closure plan

Status: **LOCAL IMPLEMENTATION COMPLETE / UNSEALED / STAGING AND PRODUCTION NO_GO**
Plan version: `dealflow.master-release-closure.v1`
Reconciled: `2026-07-17` (`America/Toronto`)
Execution trigger: exact text `EXECUTE MASTER PLAN`
Production authority granted by this document: **NO**

This is the single execution authority for closing the current DealFlow release. It supersedes prior implementation plans as current-status or execution authorities without deleting their audit history. Historical ledgers and bundles remain evidence inputs, not current proof. Product source was not changed during this planning pass.

## 0. EXECUTION STATUS — 2026-07-17

The exact `EXECUTE MASTER PLAN` trigger was received and the locally executable
portion of the plan has been implemented. Sections 1-28 below preserve the
pre-execution reconciliation and acceptance design; when a statement below
still describes the 115-migration planning baseline, this section is the
controlling current-status overlay.

Current implementation truth:

- The working candidate now contains exactly 121 ordered migrations, ending at
  `20260720010000_add_ghl_embed_sso_authority.sql`. The sealed 104-to-120
  authority remains immutable historical proof; a separate exact 120-to-121
  authority covers the additive GHL embed SSO migration.
- The six successor tranches are implemented and connected to runtime:
  dynamic deletion and anti-resurrection, signed support-delivery lifecycle,
  canonical campaign lifecycle authority, provider-aware GHL publication, and
  canonical lead outcome/reporting truth, plus explicit one-time GHL embed SSO
  identity binding and fail-closed passwordless session handoff.
- Usable MFA enrollment/challenge/settings flows are implemented for the direct
  and localized auth surfaces. High-risk actions remain AAL2-gated.
- The final proof runner remains one exact 91-command portfolio and now exposes
  the planned `format:check`, `release:qualify`, and
  `release:staging:qualify` interfaces.
- `npm ci` installed 434 packages and `npm audit --omit=dev` reported zero
  vulnerabilities.
- Formatting, lint, typecheck, the optimized Next.js production build, release
  secret scan, release-evidence contract, immutable 104-to-120 reconstruction,
  exact 120-to-121 successor reconstruction,
  and the complete 77-component DealFlow suite pass.
- The integrated database proofs pass on isolated PostgreSQL 17.6: fresh,
  replay, foundation, exact 104-to-120 forward, exact 120-to-121 successor,
  failure atomicity, RLS/ACL,
  cross-tenant, privacy/deletion, provider lifecycle, financial-integrity, and
  concurrency contracts.
- The local browser proof passes 40/40 executable checks across desktop
  Chromium, mobile Chromium, Firefox, and WebKit. Its 16 authenticated checks
  are explicitly deferred to protected isolated staging and are not reported
  as passes.
- The local zero-external-effects load proof passes 100/100 requests at 20-way
  concurrency with zero failures and 79 ms p95 in the observed run.
- Two proof-environment drift defects found during execution were fixed at the
  root: local browser and load environments now explicitly disable GHL
  Marketplace provider effects.

Current release boundary:

- The implementation is intentionally uncommitted and therefore has no final
  commit/tree seal. The two exact clean-seal rounds cannot truthfully run until
  commit authority is supplied.
- All 43 owner/legal decisions remain unresolved and fail closed. No tracked
  file can self-authorize them.
- Protected isolated staging deployment, authenticated 60/60 hosted acceptance,
  safe-boundary provider readback, scale/soak, and cleanup have not run for this
  unsealed candidate.
- Production inventory, backup/PITR/full restore, worker drain, domains,
  monitoring, protected external trust, release authorization, deployment,
  migration, aliases, canary, and observation remain unproven or separately
  unauthorized.
- No production/shared-data mutation, live provider action, customer data,
  billing action, communication, advertising spend, DNS change, push, or
  deployment occurred.

The next serial gate is one clean source seal plus two exact local rounds. Only
after those pass may the protected isolated-staging broker run. Production
remains separately authorized and is not authorized by this document or by the
execution trigger.

## 1. CURRENT RELEASE-READINESS VERDICT

**NOT READY FOR RELEASE**

The durable candidate is real, clean, buildable, and substantially implemented, but it is not releasable. The exact current source contains 115 migrations, not the claimed 120-migration successor. Five later migrations and their connected runtime surfaces are absent. Three product-contract tests are stale, six deployment tests require a canonical Vercel project link, and the DB proof portfolio cannot yet run through one environment-aware orchestrator. No current-candidate hosted staging, real safe-boundary provider acceptance, production inventory, restore/PITR proof, protected release trust, worker-drain proof, or production authorization exists. Forty-three owner/legal decisions remain fail-closed.

Production, shared data, live providers, billing, communications, advertising spend, DNS, and public aliases were untouched during reconciliation.

## 2. MASTER-PLAN COMPLETENESS VERDICT

**PLAN COMPLETE AND READY FOR EXECUTION**

Every controlling requirement, inherited audit class, known missing tranche, current validation failure, owner/legal decision, external blocker, and release gate has a disposition below. Execution may uncover a new defect, but it must be handled by the change-control rule in §23 rather than by restarting a repository-wide audit.

## 3. REPRODUCIBLE BASELINE

| Dimension | Reconciled truth |
|---|---|
| Durable source | `/Users/raiaanreza/DealFlow-Recovery/restart-seal-3ad1e9469b41` |
| Planning checkout | this repository; branch `codex/dealflow-release-closure-plan` |
| Product branch at seal | `codex/dealflow-final-master-20260716` |
| Commit | `3ad1e9469b413ec6636961d7716bcbf4e1a14c62` |
| Tree | `aa0c84cd23ef90d0c1021fe874e07a43794586a7` |
| Required ancestry | `042fed5d9080a2cd4ba3393420584b61d6f3eb7e` → `3ad1e9469b413ec6636961d7716bcbf4e1a14c62`; `3ab010b692d3870d59effed3022ec631c1006289` is also an ancestor |
| Seal verification | restart-bundle `SHA256SUMS` passed; source bundle and archive retained |
| Worktree used for validation | disposable detached clone `/private/tmp/dealflow-review-3ad1`; tracked source clean after validation |
| Runtime | Node `v24.14.1`, npm `11.11.0`, Next `16.2.10`, TypeScript `5.9.3` |
| Dependencies | `npm ci`; 434 packages; lock SHA-256 `c95f4be2a2fb44f87a401138ba6b2ec4085b6994a96d76ad2b0928945bee1d9b`; `npm audit --omit=dev` found 0 vulnerabilities |
| Database proof runtime | PostgreSQL `17.6`, isolated Unix socket, TCP disabled; official source archive digest `e0630a3600aea27511715563259ec2111cd5f4353a4b040e0be827f94cd7a8b0` |
| Migration identity | 115 ordered SQL files; digest `581f4a33126f65259939c1c307fa5c6f949c1956b4354db5889bc95625885849`; terminal migration `20260717060000_install_owner_decision_authority_grants.sql` |
| Integrated schema identity | schema `95521f13162e117ec65404952725a48d523b9dfed1256c918c5b9b03234956a8`; security `71902205082f696f14fdac21eec1275f782e0d928898d7ffff5f6e0a14284d07` |
| Application size | 1,082 deployable files; 114 build routes/pages |
| Current Vercel link | `.vercel/project.json` absent from source seal; restart bundle retains a separate `vercel-project.json` that is evidence input only |
| Current external truth | staging, provider, production, remote-base, domain, environment, worker, backup, and release-authority truth are unverified for this candidate |

Reproduce the current local baseline from a fresh clone with:

```bash
npm ci
npm audit --omit=dev
npm run lint
npm run typecheck
npm run build
npm run test:integrated-migration-chain-db
npm run test:authority
npm run test:privileged-tenancy
```

The integrated migration command requires the documented isolated PostgreSQL 17.6 test runtime. It must not fall back to a developer or shared database.

## 4. RELEASE SCOPE

### In scope

- Realtors and real-estate agents as direct customers; white-label partners and their isolated child accounts.
- Existing visual direction and established application information architecture; corrective UX work only.
- Signup/login/verification/recovery, usable MFA for high-risk actions, session lifecycle, paywall, Stripe activation, subscription lifecycle, $297 plan, initial $10 creative credit, $1 static and $5 video debit, top-up, refund/dispute reconciliation.
- Resumable realtor onboarding, versioned input lineage, creative/copy generation, campaign creation, DST-safe next 9:00 a.m. Eastern launch, authoritative campaign lifecycle, Meta launch/lead/reporting, safe optimizer, and live truthful dashboards.
- GHL Marketplace connection, preinstalled snapshot, fixed approved question slots, campaign-specific funnel/form publication, lead/contact/opportunity/workflow handoff, provider readback, uninstall/offboarding, and compatibility migration for existing DealFlow funnels.
- Website and Meta Instant Form lead capture, deduplication, delivery, canonical lead outcome/quality feedback, reporting freshness, and optimizer refusal on insufficient or stale data.
- Support ticket persistence, bounded secondary notification, callback/delivery lifecycle, privacy consent/DSAR/export/deletion/offboarding/anti-resurrection, EN/FR/ES, accessibility, tenant isolation, observability, recovery, and production-safe operations.
- Direct, partner-admin, partner-child, platform-admin, paid, unpaid, canceled, deleted, attacker, multilingual, mobile, accessibility, provider-failure, retry, ambiguity, and recovery journeys.

### Explicit non-goals

- Teams or advanced collaboration hierarchy beyond the current direct-customer and partner-child model.
- Growth Agent, Sales Copilot, Sales Brain, Revenue OS, and alternate experimental/admin surfaces; keep unreachable or explicitly quarantined unless separately approved.
- Lead-facing automated SMS, Meta CAPI, or browser Pixel without explicit consent/policy approval. Defaults: SMS disabled, CAPI disabled, Pixel opt-in only.
- A new UI redesign, unrelated architecture rewrite, production data cleanup without inventory/authority, or claims that real 7-day/30-day outcomes can be completed overnight.

### Systems of record and compatibility boundaries

| Domain | Authority |
|---|---|
| Payment/subscription/refund/dispute | Stripe; DealFlow stores immutable normalized receipts and reconciled entitlements |
| CRM, GHL funnel/form/workflow/contact/opportunity | GHL after capability/readback proof; DealFlow stores intent, mapping, receipts, and safe lifecycle projection |
| Advertising delivery and insights | Meta; DealFlow stores customer intent, controlled execution, receipts, freshness, and optimizer decisions |
| Product configuration/state/audit | Supabase/PostgreSQL |
| Deployment/runtime environment | Vercel project and protected environment metadata |
| Creative generation | Provider receipt plus canonical DealFlow asset ledger/storage identity |
| Support | DealFlow ticket/outbox is authoritative; external email is secondary |
| Existing DealFlow funnels | Preserve until tenant-by-tenant GHL migration is readback-confirmed; compatibility redirect only when mapped |

## 5. WHAT THE PREVIOUS AUDIT MISSED OR MISCLASSIFIED

| Finding | Correct disposition |
|---|---|
| The vanished 120-migration temp worktree was treated as completed successor work. | **NOT IMPLEMENTED in durable source.** Only 115 migrations are sealed. Recreate the five missing tranches from requirements and tests; never recover claims from a vanished checkout without source/provenance proof. |
| Later reporting, lead-outcome, privacy anti-resurrection, support callback, and provider-aware publication files were cited as current. | **NOT IMPLEMENTED.** The named files are absent from `3ad1e94`. |
| “Final suite” was treated as one runnable proof. | **PARTIALLY VERIFIED.** It mixes native PostgreSQL, Docker PostgreSQL, browser IPC, and Vercel-linked tests without an environment-aware orchestrator. |
| Four failing product-contract checks were reported as product defects. | **Three stale contract assertions plus one stale fixed-question assertion.** Current product uses centralized safe redirects, plural dual-signature GHL verification, atomic onboarding RPC, and approved-question validation. Update tests to current stronger contracts; do not weaken product code. |
| Six Vercel-related failures were treated generically. | **ENVIRONMENT-BLOCKED.** The recovered source intentionally lacks `.vercel/project.json`; establish explicit isolated staging/project identity and make tests consume a sanitized fixture or protected readback. |
| “MFA-gated deletion/privacy” was equated with usable MFA. | **NOT IMPLEMENTED end to end.** AAL2 checks exist, but enrollment, challenge, recovery, and user-facing completion are not proven. |
| GHL foundations and provider-disabled tests were called integration completion. | **PARTIALLY VERIFIED.** Lifecycle and fail-closed contracts are real; Marketplace/snapshot/funnel/form/lead/offboarding readback acceptance is absent. |
| Local Meta/Stripe/creative/Twilio/support contracts were treated as provider proof. | **PARTIALLY VERIFIED.** No safe-boundary current-candidate provider portfolio has run. |
| A fresh migration pass was considered sufficient. | **PARTIALLY VERIFIED.** Fresh, replay, foundation-extension, and 104→115 forward identity pass locally; production-style non-empty upgrade, restore, PITR, and actual production delta do not. |
| The prior 942-row ledger was treated as current implementation truth. | **Historical evidence only.** Its 111 implemented, 38 already-correct, 3 protected, 218 stale/superseded, 2 N/A, and 570 blocked successor rows are mapped in §10 to current work packages. |
| Existing CI was treated as release enforcement. | **NOT IMPLEMENTED.** CI covers install/audit/secret/lint/type/build/offline/security contracts, not the full two-round, migration, browser, provider, staging, recovery, or signed-release portfolio. |
| The 43 owner/legal choices were described as ordinary implementation gaps. | **DECISION REQUIRED / EXTERNAL-DEPENDENCY-BLOCKED.** Code correctly fails closed; signed authority is still mandatory. |
| Earlier hosted 58/60 and local 90/90 evidence was treated as reusable release proof. | **STALE for this candidate.** It is useful diagnostic history, not exact-current-candidate qualification. |

## 6. VERIFIED COMPLETE

Only the following is objectively verified for exact commit `3ad1e94`; this list does not imply release readiness.

| Capability | Implementation location | Validation/procedure | Result | Gate |
|---|---|---|---|---|
| Exact durable source | restart seal and Git object database | `shasum -a 256 -c SHA256SUMS`; Git commit/tree readback | pass | G01, G03 |
| Clean dependency install/security inventory | `package-lock.json` | `npm ci`; `npm audit --omit=dev`; `npm run test:supply-chain`; `npm run supply-chain:check` | pass; 0 vulnerabilities; legal review still required for 18 components | G05, G06, G11 partially |
| Static application qualification | application source | `npm run lint`; `npm run typecheck`; `npm run build` | pass; 114/114 pages built | G08, G09, G12 |
| 115-migration integrated chain | `supabase/migrations` | `npm run test:integrated-migration-chain-db` on isolated PostgreSQL 17.6 | fresh/replay/foundation/104→115 pass with stable schema/security digests | G21-G26 locally |
| Campaign lifecycle truth | `src/lib/services/campaign-lifecycle-state-machine.ts` and related services/routes | `npm run test:campaign-lifecycle` | pass; no fabricated provider IDs, transition/CAS/readback fencing | G29-G32 locally |
| GHL Marketplace fail-closed foundation | `src/lib/integrations/gohighlevel/*`, `src/lib/services/ghl-marketplace-runtime-service.ts` | `npm run test:ghl-marketplace-runtime`; full-chain disposable DB proof | pass with provider effects disabled | G34-G38 contract only |
| Meta optimizer safety | `src/lib/meta-optimization-execution-gate.ts`, optimization engine/services | `npm run test:optimization-evidence-safety`; `npm run test:continuous-reporting-optimizer`; `npm run test:meta-optimization-authority` | pass; production owner grant required | G17 contract only |
| Privacy/DSAR authority foundation | migration 114 and privacy services/routes | `npm run test:privacy-authority`; `npm run test:privacy-authority-db` | pass | G39-G43 partially |
| Owner authority fail-closed plane | `config/authority`, migration 115, `src/lib/authority/*` | `npm run authority:validate`; `npm run test:authority`; `npm run test:authority:runtime`; `npm run test:authority:grants-db` | pass; 43 unresolved, production authorization false | G47 fail-closed only |
| Privileged tenancy/static asset integrity | migration 113, tenancy matrix, static asset service | `npm run test:privileged-tenancy`; `npm run test:privileged-tenancy-db` | pass; 12 classes, 118 RLS tables, 114 forced-RLS, 0 unclassified | G40-G41 locally |
| Billing/claims boundaries | billing/Stripe services and advertising-claim contracts | `npm run test:unsupported-ad-claims`; `npm run test:advertising-claim-boundaries` plus targeted billing tests | pass locally | G04/G14 partially |
| Local network boundary | staging browser harness | Playwright Chromium/Firefox/WebKit install; `node scripts/staging/test-browser-context-network-boundary.mjs` | pass | G44 harness only |
| Zero-external-effects contract | release/staging proof scripts | zero-external-effects test | 61 controls pass | safety invariant, not provider proof |

## 7. CANONICAL MASTER IMPLEMENTATION PLAN

Work items are deliberately consolidated around root causes. Every P0/P1 finding must be closed inside one of these packages; creating a new package requires the change-control rule in §23.

### P0-01 — Establish one authoritative source, scope, and signed decision plane

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P0-01` |
| 2 | Title | Establish one authoritative source, release scope, and signed decision plane |
| 3 | Classification | P0 — release blocker |
| 4 | Current status | PARTIALLY VERIFIED / EXTERNAL-DEPENDENCY-BLOCKED |
| 5 | System domain | Source control, governance, release authority |
| 6 | User journey or business capability | Every supported journey; prevents releasing the wrong code or unauthorized policy |
| 7 | Release requirement | `PVD-FOUNDATION-001`, all `REL-*`, 43 owner/legal decisions |
| 8 | Observed current state | Exact local seal exists; authoritative private remote/base, branch protection, final scope signatures, and production owners are unproven |
| 9 | Evidence | restart seal commit/tree; owner-decision validator returns 43 unresolved and `productionReleaseAuthorized=false` |
| 10 | Exact gap or defect | No owner-controlled remote/promotion lineage or signed, effective policy packet binds one candidate, environments, providers, domains, owners, and limits |
| 11 | User or business impact | Wrong checkout, ambiguous scope, or unauthorized policy could reach customers |
| 12 | Failure or security impact | Self-authorized release, stale artifact deployment, uncontrolled provider effects |
| 13 | Root cause | Multiple historical checkouts and plans; protected governance never completed |
| 14 | Recommended long-term solution | Recover/establish one owner-controlled private remote; preserve ancestry; protect branch/tag/environments; sign the 43-row decision packet and scope inventory; quarantine alternatives |
| 15 | Why preferred | Keeps history and current architecture while making source and authority externally verifiable |
| 16 | Alternatives/tradeoffs | New repository loses provenance; unsigned prose cannot authorize; squashing removes audit lineage |
| 17 | Exact locations | `config/authority/dealflow-owner-decisions.v1.json`, `src/lib/authority/*`, `.github/workflows/*`, `docs/dealflow-completion/RELEASE_EVIDENCE_TRUST_POLICY.md`, protected remote configuration |
| 18 | Upstream dependencies | Owner access to Git host; decision owners; legal review |
| 19 | Downstream dependencies | All remaining packages, signed build, staging, production admission |
| 20 | Required implementation steps | Verify remote; push exact ancestry without force; set protection/CODEOWNERS/checks; sign decisions/defaults; record in detached evidence; prove alternative repos cannot deploy |
| 21 | Data-migration/compatibility impact | None directly; ambiguous legacy checkouts are preserved read-only or quarantined |
| 22 | Failure modes | Wrong base, missing objects, force-push, target-added trust key, expired signature, conflicting scope |
| 23 | Security/tenant isolation | Release credentials short-lived and scoped; decision grant owner-only, immutable, expiring, environment/candidate bound |
| 24 | Observability | Audit Git/runner policy changes; alert on branch/tag/environment bypass and candidate drift |
| 25 | Automated tests | authority static/runtime/DB grants, release-guard, source ancestry/content-digest tests |
| 26 | Manual/integration validation | Two-person review of remote identity, policy digest, owners, domains, provider accounts, safe defaults |
| 27 | Binary acceptance | One protected remote contains exact ancestry; all 43 rows have signed decision or accepted fail-closed default; release guard rejects any other source/candidate |
| 28 | Exact proof | `git merge-base --is-ancestor 042fed5... <candidate>`; `git fsck --strict`; `npm run authority:validate`; `npm run test:authority`; `npm run test:authority:runtime`; `npm run test:authority:grants-db`; `npm run test:release-guard` |
| 29 | Rollout requirements | No provider/production mutation; complete before final seal |
| 30 | Rollback/forward recovery | Revoke grant/signing capability; keep last protected refs; never redeploy an older checkout without compatibility review |
| 31 | Owner role | Product owner + release/security owner + legal/privacy owner |
| 32 | Relative size | M |
| 33 | Confidence | HIGH |
| 34 | Parallelization | Decision drafting can parallelize; remote and final signing are serial |
| 35 | Merge/deploy order | First; no deployment |
| 36 | Release gate satisfied | G01-G04, G11, G47, G59 |
| 37 | Residual risk | Compromised external owner account; mitigated by protected environments and two-person review |

### P0-02 — Recreate and integrate the missing durable successor tranche

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P0-02` |
| 2 | Title | Recreate the five missing schema/runtime tranches from current requirements |
| 3 | Classification | P0 — release blocker |
| 4 | Current status | NOT IMPLEMENTED |
| 5 | System domain | Database, privacy, support, campaigns, GHL, reporting |
| 6 | User journey/capability | Deletion, support delivery, campaign lifecycle, GHL funnel publication, lead outcomes/reporting |
| 7 | Release requirement | `PVD-DELETE-001`, `VISION-SUPPORT-001`, `CORE-CAMPAIGN-001`, `PVD-GHL-001`, `PVD-REPORT-001`, `PVD-LEAD-OUTCOME-FEEDBACK-001` |
| 8 | Observed current state | Candidate ends at migration 115; five claimed later migrations and five named runtime/component files are absent |
| 9 | Evidence | `ls supabase/migrations`; Git path checks against `3ad1e94` |
| 10 | Exact gap/defect | No durable dynamic deletion/anti-resurrection, support callback lifecycle, expanded campaign authority, provider-aware funnel publication, or canonical lead-outcome/reporting portfolio |
| 11 | User/business impact | Deletion may be incomplete, support state opaque, publication/reporting cannot meet promised journey |
| 12 | Failure/security impact | Data resurrection, duplicate/ambiguous provider effects, optimizer decisions on incomplete outcomes |
| 13 | Root cause | Work existed only in a vanished unsealed temp worktree and was never preserved as authoritative source |
| 14 | Recommended solution | Reimplement from controlling requirements and current architecture as additive migrations 116-120 plus connected runtime/tests; do not reconstruct from prose claims alone |
| 15 | Why preferred | Preserves durable provenance and validates behavior against current schema instead of importing unaudited temp state |
| 16 | Alternatives/tradeoffs | Dropping capabilities violates release vision; recovering unreachable Git objects is acceptable only if byte identity/provenance is independently proven and then fully reviewed |
| 17 | Exact locations | New successors to migrations 115; `src/lib/account-deletion/*`, `src/lib/services/account-deletion-service.ts`, `src/lib/integrations/support/*`, `src/lib/services/support-ticket-service.ts`, `src/lib/services/campaign-lifecycle-state-machine.ts`, `src/lib/integrations/gohighlevel/*`, `src/lib/services/ghl-*`, `src/lib/integrations/meta/reporting-contract.ts`, `src/lib/services/meta-reporting-worker-service.ts`, dashboard/result components located during implementation |
| 18 | Upstream dependencies | P0-01 scope/defaults; current 115 schema; exact KPI and retention decisions may remain fail-closed |
| 19 | Downstream dependencies | P0-05 through P0-12 |
| 20 | Required steps | Write invariant tests first; add additive migrations; connect services/routes/workers/UI; add idempotency/readback/reconciliation; prove forward 115→120 and non-empty data preservation |
| 21 | Data/compatibility impact | Add tables/columns/functions/indexes/policies only; preserve existing tickets, campaigns, leads, receipts, funnels, deletion requests; backfill deterministically with explicit unknown state |
| 22 | Failure modes | Partial backfill, duplicate callback/outcome, provider-accepted/response-lost, deleted record restored, old worker writes old state |
| 23 | Security/tenancy | RLS/forced RLS for all new data; service/owner grants explicit; signed callback verification; tenant-bound outcome/publication/deletion identities |
| 24 | Observability | Lifecycle transition events, ambiguity queues, callback/outcome dedupe metrics, deletion tombstone and anti-resurrection alerts |
| 25 | Automated tests | Fresh/replay/115→120/non-empty migration; concurrency; duplicate/out-of-order callbacks; provider ambiguity; RLS; anti-resurrection; reporting lineage |
| 26 | Manual/integration validation | Synthetic direct and partner tenants; failed/late provider callbacks; restore after deletion; dashboard freshness states |
| 27 | Binary acceptance | Exactly five reviewed additive migrations and connected runtime paths exist; no vanished-source dependency; all invariant and migration proofs pass twice |
| 28 | Exact proof | `npm run test:integrated-migration-chain-db`; successor tests added under `scripts/`; `npm run lint`; `npm run typecheck`; `npm run build`; `npm run test:dealflow-completion` |
| 29 | Rollout requirements | Feature/capability flags default closed; schema precedes dormant runtime; old workers drained before enabling writes |
| 30 | Rollback/recovery | Application cutback compatible with additive schema; capability kill switches; forward-only repair migration; never drop new data during rollback |
| 31 | Owner role | Backend/data lead + privacy owner + integration lead |
| 32 | Relative size | XL |
| 33 | Confidence | MEDIUM |
| 34 | Parallelization | Five bounded lanes after invariant/interface freeze; migration numbering and integration merge serial |
| 35 | Merge/deploy order | After P0-01 defaults, before final seal and staging |
| 36 | Release gate | G14, G18-G38, G52-G60 as applicable |
| 37 | Residual risk | Previously unobserved production shapes; controlled by read-only inventory and production-clone proof |

### P0-03 — Complete authentication, MFA, admin truth, and tenant isolation

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P0-03` |
| 2 | Title | Make auth and high-risk account operations usable, secure, and tenant-correct |
| 3 | Classification | P0 — release blocker |
| 4 | Current status | PARTIALLY VERIFIED |
| 5 | System domain | Auth, sessions, admin, tenancy |
| 6 | User journey/capability | Login/recovery, direct/partner access, account deletion/export, admin operations |
| 7 | Release requirement | `CORE-AUTH-001`, `CORE-ADMIN-001`, `CORE-SECURITY-DATA-001`, `SEC-PRIVILEGED-TENANCY-001` |
| 8 | Observed current state | PKCE/safe redirect/AAL2 gates and RLS foundations exist; MFA enrollment/challenge/recovery and current hosted tenant/admin journeys are unproven |
| 9 | Evidence | `src/lib/auth/safe-redirect.ts`; AAL2 checks; privileged tenancy tests pass; stale login test expects superseded helper |
| 10 | Exact gap/defect | High-risk flows can require AAL2 without a proven user path to obtain it; admin security score is not externally evidence-backed; cross-host cookies/redirects unproven |
| 11 | User/business impact | User cannot complete deletion/export or may be redirected incorrectly; support burden and lockout |
| 12 | Failure/security impact | Privilege escalation, cross-tenant data access, open redirects, weak recovery, fabricated security posture |
| 13 | Root cause | Enforcement was implemented before full enrollment/recovery/host acceptance |
| 14 | Recommended solution | Add Supabase-compatible MFA enrollment/challenge/recovery UI and recent-auth flow; centralize redirect policy; keep admin evidence unavailable unless sourced; exercise all privileged paths |
| 15 | Why preferred | Makes strong security reachable without bypasses and preserves one redirect/authority implementation |
| 16 | Alternatives/tradeoffs | Removing AAL2 weakens high-risk operations; admin-only manual bypass is unauditable; fake score is prohibited |
| 17 | Exact locations | `src/lib/auth/safe-redirect.ts`, login components/pages, account deletion/privacy components/routes, `src/lib/services/platform-operator-authority-service.ts`, admin pages, middleware located during implementation |
| 18 | Upstream dependencies | P0-01 domain/role decisions; Supabase auth test project |
| 19 | Downstream dependencies | All authenticated staging journeys and production cutover |
| 20 | Required steps | Map roles/hosts; implement enrollment/challenge/recovery/recent-auth; update stale redirect contract; prove session rotation/logout/revocation; make admin score unavailable absent evidence |
| 21 | Data/compatibility impact | Preserve existing users/sessions; store no raw factors; compatibility for non-MFA users with explicit enrollment state |
| 22 | Failure modes | Lost factor, expired challenge, duplicate submit, callback race, partner cookie scope, account takeover, lockout |
| 23 | Security/tenancy | AAL2/recent-auth for destructive/privileged actions; CSRF/state/PKCE; tenant-bound roles; no service-role browser exposure |
| 24 | Observability | Sanitized auth error codes, challenge/redirect latency, recovery and privileged-action audit events; never log tokens/email/password |
| 25 | Automated tests | unit redirect matrix; MFA state machine; role/tenant RLS; duplicate submit; cookie/host; admin authorization; deletion/export gate |
| 26 | Manual/integration validation | Chromium/Firefox/WebKit/mobile enrollment, login, recovery, deletion/export, direct and both partner hosts |
| 27 | Binary acceptance | Every supported user can enroll/challenge/recover and complete allowed high-risk action; unauthorized/cross-tenant attempts always fail; no fake admin evidence |
| 28 | Exact proof | `npm run test:auth-pkce`; updated accessibility/auth contract; `npm run test:platform-operator-authority`; DB authority/RLS tests; hosted browser auth portfolio 20/20 sequential attempts per required engine/host |
| 29 | Rollout requirements | Invite-only launch until WAF/rate-limit/recovery proof; QA bypass production-disabled |
| 30 | Rollback/recovery | Disable destructive action, not MFA enforcement; preserve sessions/factors; operator runbook for verified recovery |
| 31 | Owner role | Identity/security engineer + support owner |
| 32 | Relative size | L |
| 33 | Confidence | MEDIUM |
| 34 | Parallelization | UI/auth tests parallel with tenant matrix; final host proof serial after deployment |
| 35 | Merge/deploy order | Before P0-10 hosted portfolio |
| 36 | Release gate | G39-G45, G47-G52 |
| 37 | Residual risk | Provider auth outage/account recovery abuse; mitigated by rate limits, audit, and safe support procedure |

### P0-04 — Close activation, billing, credits, onboarding, and campaign lifecycle end to end

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P0-04` |
| 2 | Title | Make the paid-customer path deterministic from onboarding through scheduled launch |
| 3 | Classification | P0 — release blocker |
| 4 | Current status | PARTIALLY VERIFIED |
| 5 | System domain | Stripe, onboarding, entitlements, campaigns |
| 6 | User journey/capability | Pay $297, receive $10 credits, build campaign, select budget, launch next 9:00 a.m. ET |
| 7 | Release requirement | `CORE-ONBOARDING-001`, `CORE-CAMPAIGN-001`, `PVD-STRIPE-001`, `PVD-GOLDEN-001` |
| 8 | Observed current state | Atomic onboarding RPC, entitlement gates, hardened Stripe lifecycle, credits, and campaign lifecycle pass local contracts; provider/test-mode and hosted journeys are absent |
| 9 | Evidence | migrations 105-112; billing/campaign services; onboarding draft integrity and campaign lifecycle tests pass |
| 10 | Exact gap/defect | Stale tests assert old onboarding calls; exact pricing/refund/credit policy unsigned; no full current-candidate checkout→webhook→activation→launch proof |
| 11 | User/business impact | Paid user may not activate, may get wrong credits, or campaign may not launch at expected time |
| 12 | Failure/security impact | Double entitlement/credit, launch without payment, wrong budget/timezone, unreconciled refund/dispute |
| 13 | Root cause | Strong local components lack one provider-backed journey and owner policy |
| 14 | Recommended solution | Keep Stripe as payment truth; append-only receipt/reconciliation ledger; atomic onboarding consume; deterministic campaign ID; idempotent activation; IANA timezone schedule normalized to 9:00 a.m. America/New_York |
| 15 | Why preferred | Avoids distributed partial state and makes money/campaign transitions replay-safe |
| 16 | Alternatives/tradeoffs | Client-side activation and cron-only truth create races; hardcoded UTC fails DST; direct balance mutation loses auditability |
| 17 | Exact locations | `src/app/api/billing/*`, `src/app/api/stripe/webhook/route.ts`, `src/lib/billing/*`, `src/lib/integrations/stripe/*`, `src/app/api/onboarding/plan/route.ts`, `src/app/api/campaigns/*`, campaign services, migrations 109-112 |
| 18 | Upstream dependencies | OWNER-001/002; Stripe test authority; P0-03 auth |
| 19 | Downstream dependencies | GHL/Meta/creative provider paths, reporting, golden journeys |
| 20 | Required steps | Update stale tests; finalize policy; prove checkout/webhook replay/cancel/grace/refund/dispute; initial credit exactly once; generation debit/compensation; schedule/launch idempotency and provider ambiguity |
| 21 | Data/compatibility impact | Preserve subscription/credit/campaign history; append adjustments; backfill unknown Stripe objects without granting entitlement |
| 22 | Failure modes | Duplicate/out-of-order webhook, checkout abandoned, provider accepted then timeout, DST boundary, insufficient credits, concurrent generation |
| 23 | Security/tenancy | Signed Stripe webhooks; tenant/customer binding; server-side price/product allowlist; no client-authoritative credits |
| 24 | Observability | Payment/entitlement mismatch, credit reconciliation, launch schedule/attempt/ambiguity metrics and alerts |
| 25 | Automated tests | webhook order/replay, concurrent credits, entitlement matrix, onboarding atomicity, campaign transition/schedule/property tests |
| 26 | Manual/integration validation | Stripe test-mode direct/partner paid/unpaid/canceled flows and DST dates; readback in Stripe and DealFlow |
| 27 | Binary acceptance | Three identical webhook deliveries create one activation and one $10 grant; insufficient credit blocks; one scheduled launch occurs at next valid 9 a.m. ET; refunds/disputes reconcile per signed policy |
| 28 | Exact proof | `npm run test:onboarding-draft-integrity`; `npm run test:onboarding-draft-integrity-db`; billing/credit tests; `npm run test:campaign-lifecycle`; Stripe hosted acceptance procedures in §20 |
| 29 | Rollout requirements | Stripe test first; production product/price allowlist and capability closed until cutover |
| 30 | Rollback/recovery | Disable checkout/launch; preserve append-only receipts; reconcile forward; never delete financial history |
| 31 | Owner role | Billing/backend lead + product owner |
| 32 | Relative size | L |
| 33 | Confidence | HIGH for code, MEDIUM for provider/policy |
| 34 | Parallelization | Billing and campaign tests parallel; integrated journey serial |
| 35 | Merge/deploy order | After P0-01/P0-03; before provider golden journey |
| 36 | Release gate | G14, G27-G38, G44-G47 |
| 37 | Residual risk | Stripe/provider outage; mitigated by reconciler and fail-closed activation |

### P0-05 — Complete GHL provisioning, provider-aware publication, lead delivery, and legacy migration

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P0-05` |
| 2 | Title | Make GHL the proven funnel/CRM execution path without losing or duplicating leads |
| 3 | Classification | P0 — release blocker |
| 4 | Current status | PARTIALLY VERIFIED / EXTERNAL-DEPENDENCY-BLOCKED |
| 5 | System domain | GHL Marketplace, funnels/forms, CRM lead delivery |
| 6 | User journey/capability | Connect preinstalled GHL account, publish personalized funnel/form, receive lead/follow-up, partner embedding |
| 7 | Release requirement | `CORE-FUNNEL-001`, `PVD-GHL-001`, `PVD-GHL-COMMUNICATION-SAFETY-001`, `REL-LEGACY-FUNNEL-MIGRATION-001` |
| 8 | Observed current state | OAuth/install/refresh/uninstall, provisioning state machine, snapshot contracts, webhook dual-signature verification, form sweeps, lead outbox, and campaign scoping exist locally; provider-aware publication successor and live test-boundary readback are absent |
| 9 | Evidence | migrations 81/83/87/89/92/96/99/103/106/108; GHL services/routes; marketplace/runtime/DB tests pass with effects disabled |
| 10 | Exact gap/defect | No accepted Marketplace authority/snapshot/manifest, no current-candidate real funnel/form publication proof, no complete existing-funnel inventory/migration, and stale webhook test asserts the older singular verifier |
| 11 | User/business impact | Funnel may not publish to the correct location; lead may not arrive in GHL; partner child may see wrong branding/location |
| 12 | Failure/security impact | Cross-tenant write, hidden workflow communication, duplicate contact/opportunity, orphan funnel, lost lead |
| 13 | Root cause | Provider authority and readback were intentionally kept closed; later publication tranche was not durably sealed |
| 14 | Recommended solution | One capability-scoped GHL executor with fixed approved question slots, campaign-scoped manifests, durable intent/outbox, idempotency, provider readback/reconciliation, periodic inbound sweep, and tenant-by-tenant legacy cutover |
| 15 | Why preferred | Makes GHL authoritative while DealFlow remains auditable and safe under timeouts/uninstall/reconnect |
| 16 | Alternatives/tradeoffs | Dynamic custom fields increase drift; DealFlow-hosted dual-write extends ambiguity; direct synchronous publication cannot recover safely |
| 17 | Exact locations | `src/app/api/integrations/ghl/*`, `src/app/api/internal/ghl-*`, `src/lib/integrations/gohighlevel/*`, `src/lib/services/ghl-*`, `src/lib/leads/custom-question-contract.ts`, GHL migrations, new provider-aware publication successor |
| 18 | Upstream dependencies | OWNER-003/004/005/010; P0-02, P0-03, approved test location/snapshot |
| 19 | Downstream dependencies | P0-06 lead attribution/reporting, P0-10 golden journeys, legacy cutover |
| 20 | Required steps | Update dual-signature test; bind location/workspace; reconcile snapshot; publish/read back funnel/form/workflow; prove refresh/reconnect/uninstall; suppress hidden comms; inventory/migrate existing funnels one tenant at a time |
| 21 | Data/compatibility impact | Preserve old URLs/attribution/lead history; mapping states explicit; no destructive cutover until readback and dual observation pass |
| 22 | Failure modes | Token expires mid-write, provider accepts then times out, duplicate webhook/sweep, wrong location, partial funnel assets, uninstall with pending jobs |
| 23 | Security/tenancy | Capability bound to environment/provider account/location/workspace/tenant/campaign/expiry; signed webhooks; encrypted credentials; no raw token logs |
| 24 | Observability | Provision/publication/lead state transitions, readback latency, ambiguity/dead-letter queue, token refresh, hidden-communication denials |
| 25 | Automated tests | state machine, dual signature/replay, token rotation, wrong-tenant denials, publication idempotency/ambiguity, webhook+sweep dedupe, legacy mapping |
| 26 | Manual/integration validation | GHL isolated test locations for direct and partner children; inspect funnel/form/contact/opportunity/workflow and uninstall cleanup |
| 27 | Binary acceptance | One approved campaign creates exactly one correct GHL funnel/form mapping; duplicate/reordered events produce one CRM lead effect; wrong tenant/location is denied; legacy URL delivers exactly once during migration |
| 28 | Exact proof | `npm run test:ghl-marketplace-oauth`; `npm run test:ghl-marketplace-runtime`; `npm run test:ghl-production`; `npm run test:ghl-inbound-authority`; GHL disposable-DB tests; hosted procedures GHL-01..GHL-12 in §20 |
| 29 | Rollout requirements | Provider capability opens only in isolated staging then synthetic production canary; expires and closes in `finally` |
| 30 | Rollback/recovery | Disable executor; preserve mappings/receipts; keep old funnel authoritative until new readback; reconcile ambiguous dispatch before retry |
| 31 | Owner role | GHL integration owner + CRM operations owner |
| 32 | Relative size | XL |
| 33 | Confidence | MEDIUM |
| 34 | Parallelization | Provider contract, legacy inventory, and communication-safety lanes parallel; publication merge/cutover serial |
| 35 | Merge/deploy order | After P0-02/P0-04; before staging golden journey |
| 36 | Release gate | G33-G38, G42-G46, G60 |
| 37 | Residual risk | GHL API/snapshot drift; mitigated by manifest readback and capability closure |

### P0-06 — Complete Meta launch, lead capture, reporting, outcomes, and optimizer truth

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P0-06` |
| 2 | Title | Prove every Meta lead and metric, then optimize only from authoritative data |
| 3 | Classification | P0 — release blocker |
| 4 | Current status | PARTIALLY VERIFIED / EXTERNAL-DEPENDENCY-BLOCKED |
| 5 | System domain | Meta OAuth/ads/leadgen/insights, reporting, optimizer |
| 6 | User journey/capability | Connect account/Page/Pixel/form, launch, receive leads, view current results, safe optimization |
| 7 | Release requirement | `PVD-META-001`, `PVD-REPORT-001`, `PVD-OPTIMIZER-001`, `PVD-LEAD-OUTCOME-FEEDBACK-001` |
| 8 | Observed current state | OAuth/selections, PAUSED creation/authorized activation, Instant Form routing, webhook ingestion, website capture, reporting worker, freshness/optimizer gates, and authority checks exist; canonical outcome/reporting successor and provider acceptance are absent |
| 9 | Evidence | Meta routes/services/migrations 82/85/86/88/93/98; reporting/optimizer tests pass locally; provider effects disabled |
| 10 | Exact gap/defect | No current-candidate Meta test-asset launch/lead/reporting readback, no canonical lead outcome ledger/quality metrics, no signed optimizer policy/canary, and dashboard portfolio component is absent |
| 11 | User/business impact | Leads or metrics may not display; optimizer cannot reliably improve campaigns; retention promise fails |
| 12 | Failure/security impact | Lost/duplicate lead, wrong ad account/Pixel, budget overspend, optimization on stale/insufficient data, privacy violation |
| 13 | Root cause | Provider authority and owner KPI/policy were not supplied; the final reporting/outcome tranche was not preserved |
| 14 | Recommended solution | Canonical lead identity/outcome ledger; Meta readback-backed lifecycle; explicit freshness states; optimizer shadow by default, bounded owner-signed policy, minimum sample, cooldown, ceilings, kill switch, and pre-dispatch authority recheck |
| 15 | Why preferred | Separates provider truth from projections and prevents automated spend decisions on fabricated or stale metrics |
| 16 | Alternatives/tradeoffs | Client-only metrics are unreliable; blind retry can duplicate effects; immediate autonomous optimization is unsafe without observed policy proof |
| 17 | Exact locations | `src/app/api/integrations/meta/*`, `src/app/api/meta/*`, `src/app/api/lead-capture/route.ts`, `src/app/api/lead-tracking/browser-pixel/route.ts`, `src/lib/integrations/meta/*`, `src/lib/services/meta-*`, optimization engine, dashboard/results surfaces, new outcome/reporting successor |
| 18 | Upstream dependencies | OWNER-006/007/013/014; P0-02/P0-04/P0-05; safe Meta test assets |
| 19 | Downstream dependencies | P0-10 provider/golden/scale proof and production canary |
| 20 | Required steps | Add outcome ledger/quality definitions; wire dashboard portfolio; validate Page/Pixel/form scope; prove paused create→authorized activation; dedupe website/instant leads; read insights; shadow decisions; owner-signed bounded canary |
| 21 | Data/compatibility impact | Preserve leads/campaigns/insights; backfill outcome as `unknown`, never false zero; retain attribution lineage and raw-provider identifiers encrypted/limited |
| 22 | Failure modes | Webhook duplicate/out of order, lead-before-route, provider accepted/timeout, insights delay, currency mismatch, partial-day data, budget race |
| 23 | Security/tenancy | Signed webhooks/OAuth state; tenant/provider binding; Pixel opt-in; CAPI disabled until approved; least scopes; no raw lead PII in evidence |
| 24 | Observability | Lead received/deduped/delivered/outcome, insight freshness/lag/error, optimizer shadow/action/refusal, spend ceiling and ambiguity alerts |
| 25 | Automated tests | webhook/auth/dedupe, route ownership, reporting freshness, outcome lineage, minimum sample, budget/currency/cooldown/concurrency, kill-switch |
| 26 | Manual/integration validation | Safe Meta test assets; synthetic website and Instant Form leads; Graph readback; dashboard EN/FR/ES; optimizer shadow then approved canary |
| 27 | Binary acceptance | Every synthetic submission yields one tenant-correct lead and GHL effect; dashboard matches provider readback with freshness state; optimizer emits no action outside signed bounds and no unapproved spend |
| 28 | Exact proof | existing Meta/reporting/optimizer test scripts; `npm run test:continuous-reporting-optimizer`; `npm run test:meta-optimization-authority`; hosted META-01..META-15 procedures in §20 |
| 29 | Rollout requirements | Ads created PAUSED; shadow mode first; explicit low ceiling/expiry; one account/campaign canary at a time |
| 30 | Rollback/recovery | Kill switch; pause campaign; stop worker; reconcile provider state before retry; preserve leads/receipts |
| 31 | Owner role | Meta integration owner + media-buying owner + analytics owner |
| 32 | Relative size | XL |
| 33 | Confidence | MEDIUM |
| 34 | Parallelization | Outcome/reporting and provider/test lanes parallel after contracts; optimizer canary serial |
| 35 | Merge/deploy order | After P0-02/P0-05; before staging golden/scale |
| 36 | Release gate | G18-G20, G29-G38, G42-G46, G52 |
| 37 | Residual risk | Meta review/API/rate-limit drift; mitigated by readback, cache/freshness, and capability shutdown |

### P0-07 — Complete creative, support, and outbound communication lifecycles

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P0-07` |
| 2 | Title | Make paid generation and support delivery recoverable, cost-bounded, and communication-safe |
| 3 | Classification | P0 — release blocker |
| 4 | Current status | PARTIALLY VERIFIED / EXTERNAL-DEPENDENCY-BLOCKED |
| 5 | System domain | Creative providers/storage/credits; support; Twilio/email/GHL workflows |
| 6 | User journey/capability | Generate static/video assets, get support, receive only approved communications |
| 7 | Release requirement | `PVD-CREATIVE-001`, `PVD-CONTENT-RIGHTS-001`, `PVD-TWILIO-001`, `PVD-GHL-COMMUNICATION-SAFETY-001`, `VISION-SUPPORT-001` |
| 8 | Observed current state | Canonical static/video storage, paid dispatch recovery, content validation, support ticket/outbox, bounded external delivery, and internal lead notification exist; support callback and provider acceptance absent |
| 9 | Evidence | migrations 94/95/100/102; creative/support services; static asset integrity, external mail-sink, zero-effects tests pass |
| 10 | Exact gap/defect | No signed delivery callback/bounce/suppression lifecycle, approved support gateway/SLA, real no-cost provider readback, content-rights approval, or complete paid-cost reconciliation |
| 11 | User/business impact | Generation credit can remain ambiguous; support notification can fail silently; asset rights/support response uncertain |
| 12 | Failure/security impact | Double charge/generation, unsafe content, PII leak, duplicate SMS/email, communication without consent |
| 13 | Root cause | Provider/cost/legal authority missing and callback successor not sealed |
| 14 | Recommended solution | Durable one-use dispatch ledger with canonical asset digest; bounded provider call/readback/reconciler; authoritative internal support ticket; signed secondary-delivery callbacks; lead-facing communications disabled by default |
| 15 | Why preferred | Prevents money/communication effects from relying on transient HTTP responses |
| 16 | Alternatives/tradeoffs | Synchronous retry risks duplicates; external inbox as truth loses tickets; enabling lead SMS expands compliance scope |
| 17 | Exact locations | `src/app/api/campaigns/[id]/generate-*`, creative integrations/services, `src/app/(app)/support/page.tsx`, `src/lib/services/support-ticket-service.ts`, `src/lib/integrations/support/delivery-adapter.ts`, internal notification service, support migrations and new callback successor |
| 18 | Upstream dependencies | OWNER-008/009/010/011/018; P0-02/P0-04; safe provider/test recipients |
| 19 | Downstream dependencies | P0-10 provider/golden proof, production capability policy |
| 20 | Required steps | Finalize rights/cost/SLA; implement callback lifecycle; prove generation dispatch/readback/settlement/compensation; validate canonical bytes; test support persist-first delivery; prove suppression/STOP and hidden GHL workflow disabled |
| 21 | Data/compatibility impact | Preserve assets/tickets/credits; append callback/settlement events; do not overwrite provider ambiguity |
| 22 | Failure modes | Provider accepts then times out, malformed asset, storage failure after generation, callback spoof/replay, bounce, duplicate alert, cost overrun |
| 23 | Security/tenancy | Tenant-bound storage paths/digests; callback signatures/replay window; PII minimization; recipient allowlist; no secret/raw prompt leakage |
| 24 | Observability | Dispatch/provider/storage/settlement durations, ambiguous queue, cost ceilings, ticket/outbox/callback/bounce/suppression alerts |
| 25 | Automated tests | byte/content validation, dispatch concurrency/ambiguity, credit compensation, callback signature/replay/order, ticket persist-first, suppression/dedupe |
| 26 | Manual/integration validation | One approved static/video test per provider under ceiling; support test recipient callback; Twilio test boundary only if available |
| 27 | Binary acceptance | Each authorized generation settles once to a canonical asset or explicit recoverable failure; ticket survives all delivery failures; no unapproved/duplicate communication occurs |
| 28 | Exact proof | creative/storage/paid-dispatch tests; `npm run test:privileged-tenancy`; support delivery tests; hosted CREATIVE/SUPPORT/COMMS procedures in §20 |
| 29 | Rollout requirements | Provider capabilities per-account, cost-ceiling, expiry, synthetic-only; comms kill switch closed by default |
| 30 | Rollback/recovery | Disable provider/secondary delivery; keep tickets/assets/receipts; reconcile ambiguity; compensate credits by append-only adjustment |
| 31 | Owner role | Creative integration owner + support/compliance owner |
| 32 | Relative size | L |
| 33 | Confidence | MEDIUM |
| 34 | Parallelization | Creative and support lanes parallel; communication policy serial owner approval |
| 35 | Merge/deploy order | After P0-02/P0-04; before hosted provider portfolio |
| 36 | Release gate | G34-G38, G42-G46, G52, G60 |
| 37 | Residual risk | Provider licensing/API changes; mitigated by rights ledger and capability closure |

### P0-08 — Complete privacy, deletion, retention, export, and anti-resurrection

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P0-08` |
| 2 | Title | Make privacy requests and deletion complete across DealFlow and providers |
| 3 | Classification | P0 — release blocker |
| 4 | Current status | PARTIALLY VERIFIED / DECISION REQUIRED |
| 5 | System domain | Consent, DSAR, deletion, retention, provider offboarding, backups |
| 6 | User journey/capability | Grant/deny/withdraw consent; access/correct/export/delete account; preserve required financial records |
| 7 | Release requirement | `PRIVACY-COMPLIANCE-001`, `PVD-DELETE-001`, `CORE-SECURITY-DATA-001` |
| 8 | Observed current state | Consent/DSAR authority and account deletion/offboarding foundations pass local tests; dynamic deletion/anti-resurrection successor, legal policy, provider proof, MFA usability, and restore proof absent |
| 9 | Evidence | migrations 101/103/114/115; privacy/deletion services/routes; privacy authority tests pass |
| 10 | Exact gap/defect | No signed controller/processor/lawful-basis/retention/deletion policy, full data inventory/export proof, provider ambiguity closure, or verified deletion tombstone honored after restore |
| 11 | User/business impact | Customer rights request may be incomplete or unverifiable |
| 12 | Failure/security impact | Unauthorized processing, cross-tenant export, deleted PII resurrection, premature deletion of financial evidence |
| 13 | Root cause | Legal authority and full-system recovery semantics were intentionally not inferred; successor migration not sealed |
| 14 | Recommended solution | Purpose/versioned consent ledger; tenant-scoped export manifest; deletion state machine with legal holds, provider receipts/ambiguity, irreversible tombstone, backup exclusion/re-delete procedure, and signed retention policy |
| 15 | Why preferred | Balances erasure with required records and makes every system/provider action auditable/recoverable |
| 16 | Alternatives/tradeoffs | Immediate hard delete loses proof and can fail partially; indefinite retention violates minimization; backup deletion without tested restore is unverifiable |
| 17 | Exact locations | `src/app/api/privacy/requests/route.ts`, privacy pages/components, `src/lib/services/privacy-*`, `src/lib/account-deletion/*`, `src/lib/services/account-deletion-service.ts`, Meta/GHL deletion services, migrations 101/103/114 plus new successor |
| 18 | Upstream dependencies | OWNER-004/012/014, OWNER-PRIVACY-001..009; P0-02/P0-03; provider/recovery access |
| 19 | Downstream dependencies | P0-10 staging deletion journey; P0-11 restore/PITR; production release |
| 20 | Required steps | Sign data map/policy; implement missing successor; wire MFA/recent auth; prove access/correction/export/delete/legal hold/provider ambiguity; restore then anti-resurrection/re-delete proof |
| 21 | Data/compatibility impact | Classify every table/object/provider field; preserve minimum immutable financial/security receipts; tombstone deleted subjects across future restores |
| 22 | Failure modes | Provider timeout, partial deletion, legal hold race, export leakage, restore resurrection, duplicate request, revoked consent with queued effect |
| 23 | Security/tenancy | AAL2/recent auth; tenant-scoped export; encrypted artifact with expiry; owner-only policy grants; no raw PII in logs/evidence |
| 24 | Observability | Request SLA/state, export access/expiry, provider deletion receipts/ambiguity, tombstone match, prohibited post-withdrawal effect |
| 25 | Automated tests | RLS/cross-tenant export, consent version/withdrawal, deletion transitions/idempotency, legal hold, provider timeout, restore anti-resurrection |
| 26 | Manual/integration validation | Synthetic direct/partner DSAR and deletion across GHL/Meta/storage/auth; restore clone and verify no reactivation/effect |
| 27 | Binary acceptance | Authorized subject gets complete tenant-correct export; deletion reaches explicit terminal/ambiguous state per policy; restored backup cannot reactivate or redispatch deleted subject/effects |
| 28 | Exact proof | `npm run test:privacy-authority`; `npm run test:privacy-authority-db`; account deletion/provider tests; restore procedure `DR-01` in §22 |
| 29 | Rollout requirements | Requests enabled only after policy/owner/SLA/provider capabilities and support runbook are signed |
| 30 | Rollback/recovery | Pause new requests; never undo completed deletion; finish/reconcile forward; keep tombstones and minimal receipts |
| 31 | Owner role | Privacy/legal owner + data/backend owner |
| 32 | Relative size | XL |
| 33 | Confidence | MEDIUM |
| 34 | Parallelization | Data inventory/policy and runtime tests parallel; final restore proof serial |
| 35 | Merge/deploy order | Successor with P0-02; full proof after P0-03 and P0-11 recovery setup |
| 36 | Release gate | G27, G39-G43, G53-G56, G60 |
| 37 | Residual risk | Jurisdiction/provider retention changes; mitigated by versioned policy and subprocessor review |

### P0-09 — Repair proof contracts and make release qualification one deterministic command

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P0-09` |
| 2 | Title | Replace stale assertions and mixed-environment orchestration with exact deterministic release qualification |
| 3 | Classification | P0 — release blocker |
| 4 | Current status | PARTIALLY VERIFIED |
| 5 | System domain | Tests, CI, clean-room proof, supply chain |
| 6 | User journey/capability | All release journeys and engineering evidence |
| 7 | Release requirement | All 53 controlling requirements; `REL-SUPPLY-CHAIN-001`, `REL-SEAL-001` |
| 8 | Observed current state | Install/lint/type/build and many targeted tests pass; completion suite has 68 effective passes and 9 unresolved checks: 3 stale contracts plus 6 missing Vercel-link checks; final-critical mixes Docker/native/IPC modes |
| 9 | Evidence | exact local command outputs from reconciliation; CI workflow inspection |
| 10 | Exact gap/defect | No one command provisions required runtimes, chooses correct DB mode, supplies sanitized project identity, runs all tests twice, and emits an exact sealed manifest without retries/skips |
| 11 | User/business impact | False green/false red causes repeated audit loops and unsafe release decisions |
| 12 | Failure/security impact | Defect hidden by stale/partial proof, nondeterminism, environment drift, unsigned artifact |
| 13 | Root cause | Test portfolio grew across multiple hosts/modes without a canonical orchestrator; tests hardcoded implementation text rather than invariant behavior |
| 14 | Recommended solution | Behavior-based contract tests; environment-aware runner with preflight; pinned Node/npm/PostgreSQL/browser versions; sanitized Vercel project fixture/readback; two fresh independent zero-retry rounds; CI protected checks and signed evidence |
| 15 | Why preferred | Proves behavior and makes failures reproducible without weakening acceptance |
| 16 | Alternatives/tradeoffs | Skipping environment tests creates false completion; textual source assertions are brittle; one shared dirty checkout invalidates independence |
| 17 | Exact locations | failing scripts named by `test:dealflow-completion`/`test:final-master-delta`, `scripts/lib/native-postgres-test-adapter.mjs`, disposable DB harnesses, `package.json`, `.github/workflows/ci.yml`, `security-audit.yml`, release evidence scripts |
| 18 | Upstream dependencies | P0-02 final source/migrations; isolated test runtimes; P0-01 protected CI |
| 19 | Downstream dependencies | P0-10 staging, P0-11 signed release trust, every final gate |
| 20 | Required steps | Update four stale assertions to behavior; define Vercel identity input; unify DB adapters/preflight; add browser teardown; generate requirement→test manifest; enforce two rounds in CI; sign SBOM/provenance via protected runner |
| 21 | Data/compatibility impact | Disposable/synthetic only; refuse non-isolated DB/project/host |
| 22 | Failure modes | Wrong DB user/version, leaked env, browser residue, port/IPC denial, retry-assisted pass, test mutates provider, artifact differs between rounds |
| 23 | Security/tenancy | Secret scan; sanitized evidence; no prod credentials; negative network boundary; signed external trust only |
| 24 | Observability | Per-command duration/status/digest, process/container residue, nondeterminism diff, CI artifact retention |
| 25 | Automated tests | All package suites, 115→successor migration modes, four browser engines/device matrix, secret/license/SBOM/provenance |
| 26 | Manual/integration validation | Independent review of test-to-requirement mapping and failure injection; no acceptance weakening |
| 27 | Binary acceptance | One documented clean-room command runs every mandatory check twice on the same seal with 0 failure/skip/retry/nondeterminism/residue and independently validates evidence |
| 28 | Exact proof | `npm ci`; `npm run lint`; `npm run typecheck`; `npm run build`; `npm run test:dealflow-completion`; `npm run test:final-critical`; `npm run test:final-master-delta`; new `npm run release:qualify` twice |
| 29 | Rollout requirements | No deploy; protected CI must use immutable install and exact runtime |
| 30 | Rollback/recovery | Revert proof-only change only if prior invariant coverage is retained; test failure blocks promotion |
| 31 | Owner role | Release/test engineer + security reviewer |
| 32 | Relative size | L |
| 33 | Confidence | HIGH |
| 34 | Parallelization | Stale-test, DB-runner, browser, and CI lanes parallel; final two rounds serial |
| 35 | Merge/deploy order | After product packages merge; last tracked changes before seal |
| 36 | Release gate | G05-G20, G39-G46, G59-G60 |
| 37 | Residual risk | Hosted/provider-only defects remain; covered by P0-10 |

### P0-10 — Qualify one exact candidate in protected isolated staging

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P0-10` |
| 2 | Title | Run full hosted, provider, security, load, and recovery acceptance against isolated staging |
| 3 | Classification | P0 — release blocker |
| 4 | Current status | UNVERIFIED / EXTERNAL-DEPENDENCY-BLOCKED |
| 5 | System domain | Vercel staging, Supabase staging, providers, browser, scale |
| 6 | User journey/capability | Direct realtor, partner, admin, attacker, multilingual, paid/unpaid, provider failure and recovery |
| 7 | Release requirement | all `PVD-*`, core journey requirements, `VISION-SUPPORT-001`, `CORE-QUALITY-SCALE-001` |
| 8 | Observed current state | Local staging broker/contracts and earlier-candidate diagnostic evidence exist; exact current-candidate hosted deployment, 60/60 portfolio, safe provider readback, and scale/soak do not |
| 9 | Evidence | `.vercel/project.json` absent; no deployment/schema/env/provider identity bound to `3ad1e94` or successor |
| 10 | Exact gap/defect | No protected isolated project with exact env portfolio, fresh migration chain, aliases, synthetic tenants, provider capabilities, zero-residue proof, or performance evidence |
| 11 | User/business impact | Core journey can still fail only when hosted or provider-backed |
| 12 | Failure/security impact | Cross-tenant leakage, lead loss, duplicate effect, latency/timeout, wrong env/provider account |
| 13 | Root cause | Staging/provider authority and project identity were never fully completed for the durable candidate |
| 14 | Recommended solution | One ephemeral protected staging stack; exact build artifact; fresh and forward DB proofs; synthetic-only seeded roles; capability-by-capability provider acceptance; 60/60 browser portfolio; 300-tenant/burst/4-hour soak; automatic cleanup |
| 15 | Why preferred | Matches real topology while containing data, cost, communications, and spend |
| 16 | Alternatives/tradeoffs | Local mocks cannot prove providers/hosting; shared staging risks data/effects; production-first canary is too late for basic acceptance |
| 17 | Exact locations | staging broker/scripts, Vercel project/environment, Supabase isolated project, Playwright suites, provider acceptance adapters, release evidence output |
| 18 | Upstream dependencies | P0-01..P0-09; staging credentials/projects; signed test ceilings and recipients |
| 19 | Downstream dependencies | P0-11 production readiness and P0-12 cutover |
| 20 | Required steps | Create/link project; sync/readback env; deploy exact artifact; apply/verify schema; seed synthetic matrix; run provider-disabled portfolio; open providers sequentially; run security/failure/load/soak; cleanup and seal |
| 21 | Data/compatibility impact | Synthetic only; test fresh, last-released forward, non-empty compatibility, cleanup, and rollback/forward recovery |
| 22 | Failure modes | Env drift, alias/cookie mismatch, provider timeout, partial migration, stale worker, test residue, rate limit, load queue growth |
| 23 | Security/tenancy | Protected access gate, WAF/rate limits, tenant attack matrix, scoped expiring capabilities, no customer data, secret-free artifacts |
| 24 | Observability | Vercel/Supabase/provider request IDs, TTFB/RSC/API/DB/worker timings, queue/lead/billing/effect/error metrics, sanitized traces |
| 25 | Automated tests | Full hosted 60; RLS/security; provider acceptance; failure injection; performance/load/soak; cleanup/residue; artifact/env/schema identity |
| 26 | Manual/integration validation | Browser visual/accessibility/assistive-tech review; provider dashboards/readback; operator alert delivery/runbook drill |
| 27 | Binary acceptance | 60/60 hosted, 0 failure/skip/unexplained cancel/residue; all required providers readback-confirmed or explicitly disabled with dependent capability blocked; thresholds pass |
| 28 | Exact proof | staging broker one-shot command defined during P0-09; Playwright hosted portfolio; migration/fixture/RLS/provider/scale commands; independent evidence checksum/manifest validator |
| 29 | Rollout requirements | Isolated aliases only; zero production/shared/customer effects; capabilities close in `finally` |
| 30 | Rollback/recovery | Remove aliases; disable capabilities; stop workers; application cutback; additive forward DB repair; destroy synthetic stack after sealed evidence |
| 31 | Owner role | Release engineer + provider owners + security/QA owner |
| 32 | Relative size | XL |
| 33 | Confidence | MEDIUM |
| 34 | Parallelization | Provider-independent, security, and performance lanes after deploy; provider writes sequential |
| 35 | Merge/deploy order | After exact local seal; staging only |
| 36 | Release gate | G21-G60 except production-only G47/G53-G58 final variants |
| 37 | Residual risk | Production topology/data scale differs; addressed by P0-11 clone/truth/canary |

### P0-11 — Prove production truth, recovery, trust, environment, workers, domains, and operations

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P0-11` |
| 2 | Title | Establish pre-mutation production readiness and full-system recoverability |
| 3 | Classification | P0 — release blocker |
| 4 | Current status | UNVERIFIED / EXTERNAL-DEPENDENCY-BLOCKED |
| 5 | System domain | Production inventory, DR, release trust, Vercel/Supabase/domains/workers/monitoring |
| 6 | User journey/capability | Safe deployment and recovery for every customer/provider journey |
| 7 | Release requirement | `REL-SOURCE-001` through `REL-WHOLE-SYSTEM-DR-001` excluding cutover-only requirements |
| 8 | Observed current state | Guard/trust contracts exist fail-closed; actual production schema/env/deployment/aliases/workers/providers/backups/restore/trust root are absent |
| 9 | Evidence | release trust policy says `NO_GO`; no current production evidence manifests or protected external root |
| 10 | Exact gap/defect | No fresh read-only inventory, non-empty prod-style upgrade, backup/PITR/full restore, RPO/RTO, signed build/test/schema/visual/drain/env evidence, or staffed monitoring/runbook proof |
| 11 | User/business impact | Release could break existing customers with no proven recovery |
| 12 | Failure/security impact | Data loss, incompatible schema/app, old worker effects, domain misroute, self-signed release, undetected outage |
| 13 | Root cause | Production authority/infrastructure evidence was intentionally withheld from local implementation work |
| 14 | Recommended solution | Fresh sanitized read-only inventory; encrypted production-scale clone; backup/PITR/full-system restore; build-once signed artifact; protected external Ed25519 trust; exact env/drain/domain/monitoring attestations; dormant deployment with aliases detached |
| 15 | Why preferred | Separates proof from mutation and ensures release can be stopped/recovered before customer traffic |
| 16 | Alternatives/tradeoffs | Caller-authored JSON or repository key is self-authorization; rollback to old binary may be schema-incompatible; snapshot-only backup does not prove restore |
| 17 | Exact locations | release guard/evidence scripts and policy docs; protected CI/runner; Vercel/Supabase/domain/monitoring consoles; production runbooks/evidence store |
| 18 | Upstream dependencies | P0-01 signed owners/domains/RPO/RTO; P0-09 seal; P0-10 staging GO; read-only production authority |
| 19 | Downstream dependencies | P0-12 production authorization/cutover |
| 20 | Required steps | Capture inventory; classify tenants/funnels/jobs/mappings; clone data safely; prove upgrade/restore/anti-resurrection; configure trust/signers; build/sign once; deploy dormant; attest env/ingress/workers/aliases/monitoring/runbooks; run enforced guard |
| 21 | Data/compatibility impact | Read-only production capture first; clone redacted/controlled; preserve all existing entitlements/history; migration impact budgets and forward recovery |
| 22 | Failure modes | Stale backup, restore missing Auth/Storage, migration lock, old worker race, env mismatch, OAuth/webhook alias drift, alert not delivered |
| 23 | Security/tenancy | Least read-only access, no row data in evidence, encrypted clone, protected trust outside repo, two-person production controls |
| 24 | Observability | Deployment/schema/env/worker/domain drift, queue/provider/billing/lead/deletion SLOs, alert delivery and on-call acknowledgements |
| 25 | Automated tests | release guard/signatures, env schema/readback, worker drain, production-clone upgrade, restore checksums, domain/TLS/WAF, monitoring synthetic probes |
| 26 | Manual/integration validation | Restore drill; incident/forward-recovery drill; on-call/runbook walk-through; domain/provider ownership review |
| 27 | Binary acceptance | Same exact artifact passes protected guard `PRE_MUTATION_ADMISSION_PASS`; restore meets signed RPO/RTO; zero old workers; env/domains/alerts/owners all attested and fresh |
| 28 | Exact proof | `npm run test:release-guard`; protected release guard command; read-only inventory tools; clone migration portfolio; restore and monitoring drill procedures in §§21-22 |
| 29 | Rollout requirements | Dormant deployment only; aliases detached; effects closed; no schema mutation until separate authorization |
| 30 | Rollback/recovery | Application cutback compatible with additive schema; forward repair; restore only through proven procedure; capability closure first |
| 31 | Owner role | Release/security owner + DB owner + infra/monitoring/DR owners |
| 32 | Relative size | XL |
| 33 | Confidence | MEDIUM |
| 34 | Parallelization | Inventory, DR, trust, and observability lanes parallel after seal; guard integration serial |
| 35 | Merge/deploy order | After staging GO; before any production mutation |
| 36 | Release gate | G01-G04, G21-G28, G47-G59 |
| 37 | Residual risk | Unknown external outage; mitigated by canary, SLO stops, and forward recovery |

### P0-12 — Execute authorized cutover, canary, ramp, and real observation windows

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P0-12` |
| 2 | Title | Release one exact artifact through reversible ordered production gates |
| 3 | Classification | P0 — release blocker |
| 4 | Current status | EXTERNAL-DEPENDENCY-BLOCKED |
| 5 | System domain | Production deployment, migrations, aliases, providers, customer ramp |
| 6 | User journey/capability | Actual live product for approved realtors and partners |
| 7 | Release requirement | `REL-PRE-ALIAS-001`, `REL-ALIASES-001`, `REL-CANARY-001`, `REL-CUTOVER-001`, `REL-GOLDEN-001`, `REL-MONITOR-001`, `REL-RECOVERY-001`, `REL-SEAL-001` |
| 8 | Observed current state | No production authorization or current-candidate release exists |
| 9 | Evidence | authority validator false; production untouched |
| 10 | Exact gap/defect | Schema/runtime/provider/alias/customer ramp and observation gates have not executed |
| 11 | User/business impact | Product changes are not visible to real customers |
| 12 | Failure/security impact | Unsafe big-bang release, unbounded effects, incompatible rollback, missed 9 a.m. launch failure |
| 13 | Root cause | Correctly blocked by P0-01..P0-11 and explicit authorization boundary |
| 14 | Recommended solution | Separate exact production authorization; additive schema first; runtime with effects closed; synthetic canaries; internal-only aliases; golden journeys; gradual cohorts; 9 a.m./24h/7d/30d seals |
| 15 | Why preferred | Minimizes blast radius and preserves stop/recovery points between irreversible actions |
| 16 | Alternatives/tradeoffs | Big-bang is faster but unsafe; indefinitely delaying after all gates wastes validated evidence and lets it expire |
| 17 | Exact locations | protected deployment/migration workflows, release guard, aliases, capability policy, monitoring/runbooks, detached evidence store |
| 18 | Upstream dependencies | All P0-01..P0-11; exact owner authorization with ceilings/window/owners |
| 19 | Downstream dependencies | Production steady-state handoff and P2 work |
| 20 | Required steps | Authorize exact identity; backup; migrate; post-migration gate; deploy dormant; synthetic canaries; pre-alias gate; aliases internal-only; golden journeys; cohort ramp; observe; seal |
| 21 | Data/compatibility impact | Additive only; preserve legacy funnels until per-tenant readback cutover; no bulk destructive repair |
| 22 | Failure modes | Partial migration, alias split, old worker, provider ambiguity, lead/billing mismatch, SLO breach, rollback incompatibility |
| 23 | Security/tenancy | Only marked synthetic identities before ramp; WAF/rate limits; capability ceilings; privacy/tenant probes at every gate |
| 24 | Observability | Real-time release dashboard for auth, leads, billing, campaigns, providers, queues, errors, latency, spend, comms, tenant/security anomalies |
| 25 | Automated tests | Post-migration/post-deploy/pre-alias/post-alias smoke, synthetic golden, uptime/safety monitors, reconciliation jobs |
| 26 | Manual/integration validation | Staffed release call, provider readback, customer-cohort approval, 9 a.m. ET boundary, 24-hour review |
| 27 | Binary acceptance | Every gate passes for same identity; approved customers use product; zero P0/P1/SLO/financial/tenant/lead defect during 24h; later seals truthfully time-bound |
| 28 | Exact proof | procedures in §21; release guard; production-safe uptime monitor; reconciliations; signed `GO_LIVE_SEAL`, then 7/30-day seals |
| 29 | Rollout requirements | One capability/cohort at a time; stop thresholds pre-signed; no effect above ceiling |
| 30 | Rollback/recovery | Close capability, detach/route aliases, application cutback, forward migration repair, pause campaigns/comms, reconcile providers/financials |
| 31 | Owner role | Incident commander/release owner plus domain/provider owners |
| 32 | Relative size | L execution after prerequisites |
| 33 | Confidence | MEDIUM |
| 34 | Parallelization | Monitoring/reconciliation continuous; irreversible steps strictly serial |
| 35 | Merge/deploy order | Last |
| 36 | Release gate | G47-G60 and all earlier gates |
| 37 | Residual risk | Novel production defect; mitigated by canary/ramp/observability/recovery and stop authority |

### P1-01 — Close accessibility, localization, performance, documentation, and operator handoff

| # | Required field | Plan |
|---:|---|---|
| 1 | Unique ID | `P1-01` |
| 2 | Title | Make the released behavior usable and operable, not merely functional |
| 3 | Classification | P1 — required pre-release hardening |
| 4 | Current status | PARTIALLY VERIFIED |
| 5 | System domain | UI/UX, EN/FR/ES, performance, documentation, support operations |
| 6 | User journey/capability | Every critical customer/admin/support journey |
| 7 | Release requirement | `CORE-UI-001`, `PVD-LOCALIZATION-001`, `CORE-QUALITY-SCALE-001`, operations gates |
| 8 | Observed current state | UI direction/build/localization foundations exist; hosted accessibility, representative assistive technology, performance budgets, current docs/runbooks are unproven |
| 9 | Evidence | production build passes; prior local/browser contracts and route inventory; current docs contain superseded candidate counts |
| 10 | Exact gap/defect | No final WCAG 2.2 AA/keyboard/screen-reader/visual/performance matrix and no single current setup/env/provider/migration/test/deploy/recovery/operator documentation set |
| 11 | User/business impact | Confusing or inaccessible flows, poor mobile/slow-network experience, operator mistakes |
| 12 | Failure/security impact | Hidden error/recovery state, unsafe manual workaround, missed incident response |
| 13 | Root cause | Documentation and nonfunctional proof lagged repeated candidate changes |
| 14 | Recommended solution | Preserve design; remediate only evidence-backed issues; enforce budgets; complete EN/FR/ES copy/state parity; update docs/runbooks from final implementation and drill them |
| 15 | Why preferred | Avoids redesign while making the actual release understandable and supportable |
| 16 | Alternatives/tradeoffs | Deferring critical accessibility/recovery states blocks users; redesign adds scope/risk |
| 17 | Exact locations | app pages/components/i18n, Playwright/accessibility scripts, `README.md`, `docs/dealflow-completion/*`, new/current release/operator/runbook docs |
| 18 | Upstream dependencies | Final behavior from P0-02..P0-08; hosted deployment from P0-10 |
| 19 | Downstream dependencies | P0-11 ops proof and P0-12 cutover |
| 20 | Required steps | Matrix all states/locales/viewports; run axe/keyboard/screen-reader/visual/perf; fix defects; document setup/env/providers/schema/tests/deploy/recovery/support; drill runbooks |
| 21 | Data/compatibility impact | None except copy/version metadata; preserve URL/route compatibility |
| 22 | Failure modes | Missing translation, focus trap, unreadable error, hydration/slow API stall, stale runbook command |
| 23 | Security/tenancy | Docs contain no secrets/PII; error UI does not expose provider/internal details; localized consent legally approved |
| 24 | Observability | Web vitals, route/API/worker latency, client errors, locale/state breakdown, support diagnostic IDs |
| 25 | Automated tests | axe, keyboard, locale key parity, screenshot diff, mobile/slow-network, performance budgets, doc link/command validation |
| 26 | Manual/integration validation | VoiceOver plus representative browser/device review; support/operator runbook drill |
| 27 | Binary acceptance | Critical journeys pass WCAG checks and manual review in EN/FR/ES/mobile; budgets pass; every runbook command succeeds in correct environment |
| 28 | Exact proof | browser portfolio and accessibility/performance commands defined by P0-09; doc command validator; staged incident/support drills |
| 29 | Rollout requirements | Documentation/version sealed with same candidate; no UI redesign |
| 30 | Rollback/recovery | Revert isolated presentation regression; retain accurate current runbooks; performance feature flag only where behavior remains correct |
| 31 | Owner role | Frontend/accessibility owner + support/SRE/documentation owner |
| 32 | Relative size | L |
| 33 | Confidence | HIGH |
| 34 | Parallelization | Locales, accessibility, performance, and docs parallel after interface freeze |
| 35 | Merge/deploy order | Before final local seal; hosted manual proof after P0-10 deploy |
| 36 | Release gate | G44-G46, G52, G57-G60 |
| 37 | Residual risk | Device/provider UI drift; mitigated by monitoring and browser matrix |

## 8. CRITICAL PATH AND DEPENDENCY SEQUENCE

1. **Authority/source freeze — P0-01.** Recover the protected remote, freeze scope/interfaces, accept safe defaults, and assign owners. No application implementation starts from any source other than the exact durable descendant.
2. **Product closure — P0-02 through P0-08.** Recreate the missing tranche first. Auth/billing can proceed in parallel; GHL, Meta, creative/support, and privacy proceed against frozen contracts. Migrations are allocated and reviewed by one data owner in strict ascending order.
3. **Nonfunctional closure — P1-01.** Accessibility/localization/performance/docs lanes run after relevant UI/API contracts stop moving.
4. **Proof closure — P0-09.** Merge product lanes, repair stale tests, unify the environment-aware runner, run targeted checks, then exact full Round 1 and Round 2 in independent clean clones. Any tracked change restarts both rounds.
5. **Staging — P0-10.** Build once, deploy exact seal, prove migrations/schema/env/identity, run provider-disabled tests, then provider capabilities one at a time, then security/load/soak. A product defect returns only to its owning package and invalidates the seal; an external blocker does not trigger a broad audit.
6. **Production preflight — P0-11.** In parallel: read-only inventory, production-scale clone/migration impact, DR restore, external trust, and observability/runbooks. Converge on one dormant deployment and enforced `PRE_MUTATION_ADMISSION_PASS`.
7. **Authorized cutover — P0-12.** Schema → post-migration gate → runtime/effects closed → synthetic providers → pre-alias gate → aliases/internal-only → golden journeys → cohort ramp → 9 a.m./24h seal → real 7/30-day seals.

Merge order is P0-01 → P0-02 → P0-03/P0-04 → P0-05/P0-06/P0-07/P0-08 → P1-01 → P0-09 seal. Deployment order is isolated staging → dormant production → separately authorized cutover. Production is never a test environment.

## 9. REQUIREMENT TRACEABILITY MATRIX

`Status now` refers to exact durable commit `3ad1e94`, not a prior candidate.

| Requirement | Capability | Current evidence | Closure package | Binary proof owner |
|---|---|---|---|---|
| `CORE-ADMIN-001` | truthful, authorized admin | PARTIALLY VERIFIED | P0-03, P1-01 | admin/tenant browser + authority DB |
| `CORE-AUTH-001` | auth/session/recovery/MFA | PARTIALLY VERIFIED | P0-03 | auth/MFA/host matrix |
| `CORE-CAMPAIGN-001` | campaign lifecycle/launch | PARTIALLY VERIFIED | P0-02, P0-04, P0-06 | lifecycle + hosted launch/readback |
| `CORE-FUNNEL-001` | GHL funnel/form | PARTIALLY VERIFIED | P0-02, P0-05 | provider publication/readback |
| `CORE-ONBOARDING-001` | atomic onboarding lineage | PARTIALLY VERIFIED | P0-04, P0-05 | paid onboarding golden journey |
| `CORE-QUALITY-SCALE-001` | performance/load/soak | UNVERIFIED | P0-10, P1-01 | 300-tenant/burst/4h soak |
| `CORE-SECURITY-DATA-001` | security/privacy/data | PARTIALLY VERIFIED | P0-03, P0-08, P0-09 | RLS/DSAR/secret/security portfolio |
| `CORE-UI-001` | truthful usable UI | PARTIALLY VERIFIED | P1-01 | EN/FR/ES browser/accessibility matrix |
| `PRIVACY-COMPLIANCE-001` | consent/DSAR/legal | PARTIALLY VERIFIED / DECISION REQUIRED | P0-08 | signed policy + full-system proof |
| `PVD-CONTENT-RIGHTS-001` | creative rights/provenance | EXTERNAL-DEPENDENCY-BLOCKED | P0-07 | signed rights policy + provider asset proof |
| `PVD-CREATIVE-001` | static/video generation | PARTIALLY VERIFIED | P0-07, P0-10 | cost-bounded provider readback |
| `PVD-DELETE-001` | deletion/offboarding | PARTIALLY VERIFIED | P0-02, P0-08, P0-11 | provider + restore anti-resurrection |
| `PVD-FOUNDATION-001` | canonical product foundation | PARTIALLY VERIFIED | P0-01, P0-09 | exact protected seal/two rounds |
| `PVD-GHL-001` | GHL lifecycle/publication | PARTIALLY VERIFIED | P0-02, P0-05, P0-10 | Marketplace provider portfolio |
| `PVD-GHL-COMMUNICATION-SAFETY-001` | GHL/Twilio comm safety | PARTIALLY VERIFIED | P0-05, P0-07 | no-unapproved-effects proof |
| `PVD-GOLDEN-001` | full direct/partner journeys | UNVERIFIED | P0-10 | hosted 60/60 + provider readback |
| `PVD-LEAD-OUTCOME-FEEDBACK-001` | lead quality/outcome | NOT IMPLEMENTED | P0-02, P0-06 | outcome lineage and optimizer gate |
| `PVD-LOCALIZATION-001` | EN/FR/ES parity | PARTIALLY VERIFIED | P1-01, P0-10 | locale journey matrix |
| `PVD-META-001` | Meta OAuth/ads/leads | PARTIALLY VERIFIED | P0-06, P0-10 | safe provider portfolio |
| `PVD-OPTIMIZER-001` | bounded optimizer | PARTIALLY VERIFIED / DECISION REQUIRED | P0-06 | shadow + owner canary |
| `PVD-REPORT-001` | truthful live reporting | PARTIALLY VERIFIED | P0-02, P0-06 | provider-aligned freshness portfolio |
| `PVD-STRIPE-001` | billing/credits | PARTIALLY VERIFIED / DECISION REQUIRED | P0-04, P0-10 | Stripe test-mode ledger reconciliation |
| `PVD-TWILIO-001` | internal/test communication | EXTERNAL-DEPENDENCY-BLOCKED | P0-07, P0-10 | safe recipient/test proof or disabled |
| `PVD-WHITELABEL-001` | partner/child isolation/branding | PARTIALLY VERIFIED | P0-03, P0-05, P0-10 | two-partner hosted attack/golden matrix |
| `REL-ALIASES-001` | alias attachment | UNVERIFIED | P0-11, P0-12 | exact alias/deployment/TLS/readback |
| `REL-CANARY-001` | synthetic canary | UNVERIFIED | P0-11, P0-12 | signed ceiling + reconciled effects |
| `REL-CANARY-INGRESS-001` | stable callback ingress | UNVERIFIED | P0-11 | OAuth/webhook ingress proof |
| `REL-CAPABILITY-001` | scoped effect capabilities | PARTIALLY VERIFIED | P0-01, P0-11, P0-12 | signed scoped/expiring grant proof |
| `REL-CUTOVER-001` | ordered production cutover | UNVERIFIED | P0-12 | signed step-by-step cutover evidence |
| `REL-DEPLOYMENT-001` | exact artifact deployment | UNVERIFIED | P0-09, P0-11 | artifact/deployment identity |
| `REL-DOMAINS-001` | domain ownership/routing | UNVERIFIED / DECISION REQUIRED | P0-01, P0-11 | DNS/TLS/source ancestry/exclusion |
| `REL-DRAIN-001` | old worker/provider drain | UNVERIFIED | P0-11 | signed zero-old-worker evidence |
| `REL-ENV-001` | exact environment | UNVERIFIED | P0-10, P0-11 | key/type/target/scope readback, no values |
| `REL-GOLDEN-001` | production golden journeys | UNVERIFIED | P0-12 | post-alias synthetic golden proof |
| `REL-GUARD-001` | enforced release decision | PARTIALLY VERIFIED | P0-01, P0-11 | protected external guard `PASS` |
| `REL-LEGACY-FUNNEL-MIGRATION-001` | existing funnel migration | NOT IMPLEMENTED | P0-05, P0-12 | tenant-by-tenant dual observation |
| `REL-MIGRATION-001` | production migration | UNVERIFIED | P0-02, P0-11, P0-12 | exact delta/apply/history/readback |
| `REL-MIGRATION-IMPACT-001` | lock/data/latency impact | UNVERIFIED | P0-11 | production-scale clone budgets |
| `REL-MONITOR-001` | release monitoring | UNVERIFIED | P0-11, P0-12 | alert delivery and staffed SLO dashboard |
| `REL-OBS-001` | observability | PARTIALLY VERIFIED | all packages, P0-11 | logs/metrics/traces/runbook mapping |
| `REL-POST-ALIAS-GUARD-AND-RAMP-001` | gated cohort ramp | UNVERIFIED | P0-12 | post-alias guard + cohort receipts |
| `REL-POST-MIGRATION-GUARD-001` | runtime after schema | UNVERIFIED | P0-11, P0-12 | `POST_MIGRATION_RUNTIME_PASS` |
| `REL-PRE-ALIAS-001` | internal-only qualification | UNVERIFIED | P0-11, P0-12 | pre-alias protected URL portfolio |
| `REL-PROD-TRUTH-001` | current production inventory | UNVERIFIED | P0-11 | sanitized read-only truth bundle |
| `REL-RECOVERY-001` | rollback/forward recovery | UNVERIFIED | P0-11, P0-12 | application cutback/forward repair drill |
| `REL-SEAL-001` | immutable release evidence | UNVERIFIED | P0-09, P0-12 | independent checksums/signatures |
| `REL-SIGNED-PREREQUISITE-INDEX-001` | fresh prerequisite index | UNVERIFIED | P0-01, P0-11 | signed exact-candidate index |
| `REL-SOURCE-001` | authoritative source/ancestry | PARTIALLY VERIFIED | P0-01 | protected remote ancestry |
| `REL-SUPPLY-CHAIN-001` | SBOM/license/provenance | PARTIALLY VERIFIED | P0-01, P0-09 | legal approval + signed provenance |
| `REL-TRUST-001` | external release trust | NOT IMPLEMENTED operationally | P0-01, P0-11 | protected external root/signatures |
| `REL-WHOLE-SYSTEM-DR-001` | full backup/restore | UNVERIFIED | P0-08, P0-11 | Auth/Storage/DB/jobs/deploy/anti-resurrection restore |
| `SEC-PRIVILEGED-TENANCY-001` | bypass-path tenant isolation | PARTIALLY VERIFIED locally | P0-03, P0-10 | local + hosted privileged matrix |
| `VISION-SUPPORT-001` | support persistence/delivery/SLA | PARTIALLY VERIFIED / DECISION REQUIRED | P0-02, P0-07 | callback/provider/SLA proof |

Accounting: **53/53 requirements mapped exactly once to a primary closure package and proof.**

## 10. AUDIT-FINDING DISPOSITION MATRIX

### Historical 942-row ledger

The historical ledger remains immutable at the sealed audit bundle. Its rows are disposed by canonical status, not silently re-opened:

| Historical class | Rows | Final current disposition |
|---|---:|---|
| Implemented and verified | 111 | Retain as historical evidence; current-candidate claims must re-pass P0-09/P0-10 |
| Verified already correct | 38 | Retain; regression-covered by P0-09 |
| Verified protected invariant | 3 | Retain; re-prove in local/staging release portfolio |
| Stale/superseded with evidence | 218 | Do not implement; preserve audit history |
| Not applicable with evidence | 2 | Remains N/A unless scope changes |
| Blocked successor rows | 570 | Assigned to P0-01..P0-12/P1-01 by requirement/domain; none is treated complete from prose |

The 53 implementation-plan rows map one-to-one through §9. The 25 execution findings map to the packages below. The 16 historical out-of-scope rows map to OWNER-SCOPE decisions and remain quarantined by P0-01.

### Consolidated blocker disposition

| Prior blocker | Current disposition | Package |
|---|---|---|
| `BLK-PROOF-HOST-001` | local browser/PG proof now PARTIALLY VERIFIED; unified preflight still required | P0-09 |
| `BLK-LOCAL-SEAL-001` | exact restart seal exists; final successor two-round seal absent | P0-02, P0-09 |
| `BLK-HOSTED-001` | unchanged: exact candidate staging absent | P0-10 |
| `BLK-GHL-001` | local fail-closed foundation verified; provider/publication proof absent | P0-05, P0-10 |
| `BLK-KPI-001` | policy unsigned and canonical outcome tranche absent | P0-02, P0-06 |
| `BLK-SCALE-001` | unchanged: hosted scale/soak absent | P0-10 |
| `BLK-EXPORT-001` | local authority foundation verified; full export/legal/provider proof absent | P0-03, P0-08 |
| `BLK-SUPPORT-001` | callback successor/provider/SLA absent | P0-02, P0-07 |
| `BLK-FUNNEL-MIGRATION-001` | unchanged | P0-05, P0-12 |
| `BLK-SUPPLY-CHAIN-001` | local inventory passes; legal/signing/protected CI absent | P0-01, P0-09 |
| `BLK-PROVIDERS-001` | unchanged for current candidate | P0-10 |
| `BLK-PROD-TRUTH-001` | unchanged | P0-11 |
| `BLK-DR-001` | unchanged; local deletion foundation does not prove restore | P0-08, P0-11 |
| `BLK-RELEASE-TRUST-001` | guard contract exists; external operational trust absent | P0-01, P0-11 |
| `BLK-DOMAINS-OBS-001` | unchanged | P0-11 |
| `BLK-PRODUCTION-AUTH-001` | unchanged; separate exact authorization required | P0-12 |
| `BLK-OBSERVATION-001` | 9 a.m./24h/7d/30d require real elapsed time | P0-12 |
| Missing migrations/runtime tranche | five tranches NOT IMPLEMENTED | P0-02 |
| Stale source-text tests | four behavior assertions stale; product contract stronger | P0-09 |
| Missing Vercel identity | six tests ENVIRONMENT-BLOCKED | P0-09, P0-10 |
| Usable MFA | NOT IMPLEMENTED end to end | P0-03 |

## 11. USER-JOURNEY COVERAGE MATRIX

| Journey | Success path | Required failure/recovery proof | Current | Closure |
|---|---|---|---|---|
| Direct signup/login/recovery/MFA | verified session and correct redirect | invalid/expired/duplicate/canceled/lockout | PARTIALLY VERIFIED | P0-03/P0-10 |
| Unpaid onboarding/paywall | resumable form, no paid effects | refresh/back/duplicate/abandon | PARTIALLY VERIFIED | P0-04/P0-10 |
| Stripe activation | one activation + $10 credit | duplicate/out-of-order/refund/dispute/grace | PARTIALLY VERIFIED | P0-04/P0-10 |
| GHL connect/provision | correct location/snapshot/slots | refresh/reconnect/uninstall/partial/timeout | PARTIALLY VERIFIED | P0-05/P0-10 |
| Build funnel/copy/creative | campaign-scoped outputs | provider failure/malformed/insufficient credit | PARTIALLY VERIFIED | P0-05/P0-07/P0-10 |
| Meta connect/selections | correct account/Page/Pixel/form | denied scope/state replay/wrong tenant | PARTIALLY VERIFIED | P0-06/P0-10 |
| Scheduled launch | next 9 a.m. ET and provider readback | DST/duplicate/accepted-timeout/kill switch | PARTIALLY VERIFIED | P0-04/P0-06/P0-10 |
| Website lead | one durable lead + one GHL effect | retry/duplicate/outage/reconciliation | PARTIALLY VERIFIED | P0-05/P0-06/P0-10 |
| Instant Form lead | one routed lead + one GHL effect | lead-before-route/out-of-order/replay | PARTIALLY VERIFIED | P0-06/P0-10 |
| Reporting dashboard | provider-aligned current/stale/missing/failed | API delay/error/currency/partial day | PARTIALLY VERIFIED | P0-02/P0-06/P0-10 |
| Optimizer | shadow then bounded canary | insufficient sample/stale data/ceiling/concurrency | PARTIALLY VERIFIED | P0-06/P0-10 |
| Support | ticket persists and secondary delivery reconciles | email failure/bounce/replay/ambiguity | PARTIALLY VERIFIED | P0-02/P0-07/P0-10 |
| Privacy/export/delete | authorized complete request | wrong tenant/legal hold/provider timeout/restore | PARTIALLY VERIFIED | P0-03/P0-08/P0-11 |
| Partner admin/child/embed | branding/location/tenant correct | cross-partner cookie/host/role attack | PARTIALLY VERIFIED | P0-03/P0-05/P0-10 |
| EN/FR/ES + mobile/accessibility | equivalent journey/state | translation/focus/slow-network/error states | PARTIALLY VERIFIED | P1-01/P0-10 |
| Legacy funnel migration | preserved URL/attribution, one lead effect | cutback/dual-write/ambiguous map | NOT IMPLEMENTED | P0-05/P0-12 |

## 12. STATE-MACHINE COVERAGE MATRIX

| Machine | Required authoritative states | Invariants/failure handling | Current | Closure |
|---|---|---|---|---|
| Billing/activation | unpaid→checkout_pending→active/grace/canceled/refunded/disputed | Stripe receipt; idempotent activation/credits | PARTIALLY VERIFIED | P0-04 |
| Onboarding draft | draft→submitted→consumed | tenant/version/deterministic campaign; one consume | VERIFIED locally | P0-04 hosted |
| GHL install/provision | requested→working→ready/failed/ambiguous/revoked | ready only after mapping/snapshot/object readback | PARTIALLY VERIFIED | P0-05 |
| Campaign | draft→ready→scheduled→launching→active/failed/ambiguous/paused | legal transitions/CAS/provider ID/readback | VERIFIED locally | P0-02/P0-04/P0-06 hosted |
| Lead | received→deduped→routed→delivered/outcome/failed/ambiguous | one canonical lead/effect; replay safe | PARTIALLY VERIFIED | P0-02/P0-05/P0-06 |
| Reporting | missing→fetching→current/stale/failed | never persist/render missing as zero | PARTIALLY VERIFIED | P0-02/P0-06 |
| Optimizer | disabled→shadow→authorized→dispatching→confirmed/ambiguous/closed | sample/freshness/budget/cooldown/kill switch | PARTIALLY VERIFIED | P0-06 |
| Creative dispatch | requested→authorized→provider_pending→stored→settled/failed/ambiguous | one debit/asset; canonical bytes/readback | PARTIALLY VERIFIED | P0-07 |
| Support delivery | ticketed→queued→sent→delivered/bounced/suppressed/ambiguous | ticket authoritative; callback signed/deduped | PARTIALLY VERIFIED | P0-02/P0-07 |
| Consent/DSAR | requested→identity_verified→processing→fulfilled/rejected/expired | purpose/version/tenant/AAL2/audit | PARTIALLY VERIFIED | P0-08 |
| Deletion/offboarding | requested→held/processing→provider_pending→completed/ambiguous | legal retention/tombstone/no resurrection | PARTIALLY VERIFIED | P0-02/P0-08/P0-11 |
| Release | planned→sealed→staging_qualified→pre_mutation_pass→canary→live→steady | one identity; signed evidence; stop/forward recovery | NOT IMPLEMENTED operationally | P0-09..P0-12 |

## 13. ENVIRONMENT AND VALIDATION MATRIX

| Environment | Allowed data/effects | Required validation | Promotion rule | Current |
|---|---|---|---|---|
| Developer disposable | synthetic only; no network providers | unit/contracts/build/native+Docker PG/browser boundary | no promotion claim | substantial local PASS |
| Clean-room local Round 1 | synthetic, isolated runtimes, retries off | complete release portfolio and evidence seal | exact same commit/tree/lock/migrations as Round 2 | NOT RUN for final successor |
| Clean-room local Round 2 | independent clone/state | byte-identical complete portfolio | 0 diff/failure/skip/retry/residue | NOT RUN |
| Protected isolated staging | synthetic only; scoped test/sandbox provider effects | exact deploy/env/schema, 60/60, security/provider/load/soak/cleanup | `STAGING_GO` for same artifact | NOT RUN |
| Production read-only/preflight | row-count/schema/config metadata only; no writes | inventory, clone, migration impact, backups/restore/trust/env/drain/domains/monitoring | `PRE_MUTATION_ADMISSION_PASS` | NOT RUN |
| Dormant production | marked synthetic only, aliases detached/effects closed | post-migration/runtime/security/synthetic canaries | pre-alias guard | NOT RUN |
| Internal-only aliases | marked synthetic identities only | post-alias direct/partner golden/reconciliation | signed cohort authorization | NOT RUN |
| Customer canary/ramp | explicitly approved cohorts/capabilities/ceilings | SLO/security/lead/billing/provider/recovery monitoring | stop thresholds all green | NOT RUN |
| Steady state | approved production traffic | 24h then true 7d/30d outcome/incident/reconciliation reviews | signed seals, not backdated | NOT RUN |

## 14. RELEASE-GATE MATRIX

Every gate is binary at release time. `PARTIALLY VERIFIED` never counts as pass.

| Gate | Objective release condition | Current | Closure/evidence |
|---:|---|---|---|
| G01 | Authoritative source recovered and protected | PARTIALLY VERIFIED | P0-01 remote/protection evidence |
| G02 | Exact approved base and ancestry | PARTIALLY VERIFIED | protected remote merge-base/fsck |
| G03 | Final tracked tree clean and sealed | VERIFIED for 115 seal; not final successor | P0-09 final seal |
| G04 | Scope, owners, decisions, limits signed | EXTERNAL-DEPENDENCY-BLOCKED | P0-01 43-row packet |
| G05 | Clean dependency installation | VERIFIED | `npm ci` |
| G06 | Lockfiles reproducible | VERIFIED | lock digest + two clean installs |
| G07 | Formatting passes | NOT IMPLEMENTED as objective script | add/enforce `format:check` in P0-09 |
| G08 | Lint passes | VERIFIED for 115 seal | `npm run lint` rerun on final |
| G09 | Type checking passes | VERIFIED for 115 seal | `npm run typecheck` rerun on final |
| G10 | Static analysis passes | PARTIALLY VERIFIED | routes/security/CodeQL/secret/static portfolio |
| G11 | Dependency/security/license/SBOM/provenance pass | PARTIALLY VERIFIED | 0 audit vulns; sign/legal/protected CI missing |
| G12 | Production frontend build passes | VERIFIED for 115 seal | `npm run build` rerun on final |
| G13 | Backend/workers package/start | PARTIALLY VERIFIED | worker/scheduler startup in P0-10/11 |
| G14 | Full automated suite passes | UNVERIFIED | P0-09 two rounds |
| G15 | No unexplained release-critical skip | UNVERIFIED | zero-skip manifests |
| G16 | No unexplained environment block | UNVERIFIED | fix stale/Vercel/mixed-runner issues |
| G17 | Optimizer static validation passes | VERIFIED locally | rerun final + staging shadow |
| G18 | Changed-contract regression passes | UNVERIFIED | missing tranche + updated behavior contracts |
| G19 | Reporting contracts pass | PARTIALLY VERIFIED | successor/reporting portfolio |
| G20 | Lead-outcome contracts pass | NOT IMPLEMENTED | P0-02/P0-06 |
| G21 | Fresh database install passes | VERIFIED for 115 locally | final successor local + staging |
| G22 | Last-released-schema upgrade passes | PARTIALLY VERIFIED | 104→115 local; production-authoritative predecessor unknown |
| G23 | Migration replay passes | VERIFIED for 115 locally | final successor twice/staging |
| G24 | Foundation migration path passes | VERIFIED for 115 locally | final successor twice/staging |
| G25 | Forward migration path passes | PARTIALLY VERIFIED | final predecessor→successor + prod clone |
| G26 | Integrated migration identity passes | VERIFIED for 115 locally | successor schema/security digests |
| G27 | Existing data preserved | UNVERIFIED | non-empty production-style clone |
| G28 | Critical constraints/indexes correct | PARTIALLY VERIFIED | final DDL/replay/perf/load proof |
| G29 | Campaign lifecycle end to end | PARTIALLY VERIFIED | local contract pass; hosted provider proof absent |
| G30 | Provisioning begins `requested` | VERIFIED locally | DB trigger/default; staging readback |
| G31 | Illegal transitions rejected | VERIFIED locally | lifecycle property/DB tests |
| G32 | Activation idempotent | PARTIALLY VERIFIED | hosted Stripe/Meta/GHL duplicate proof |
| G33 | Provider-aware publication passes | NOT IMPLEMENTED | P0-02/P0-05 |
| G34 | Provider failure/timeout handling passes | PARTIALLY VERIFIED | real safe-boundary ambiguity/readback |
| G35 | Webhook auth/dedup passes | PARTIALLY VERIFIED | behavior test + provider callbacks |
| G36 | Duplicate job delivery safe | PARTIALLY VERIFIED | final DB/hosted concurrency |
| G37 | Retry/recovery behavior passes | PARTIALLY VERIFIED | provider ambiguity/reconciler |
| G38 | Concurrent execution safe | PARTIALLY VERIFIED | final load/concurrency portfolio |
| G39 | Authentication passes | PARTIALLY VERIFIED | usable MFA/recovery/host browser proof |
| G40 | Authorization passes | PARTIALLY VERIFIED | local pass + hosted attack matrix |
| G41 | Tenant isolation passes | PARTIALLY VERIFIED | local privileged proof + hosted multi-partner |
| G42 | Suppression/unsubscribe behavior passes | PARTIALLY VERIFIED | signed policy/provider callback proof |
| G43 | Duplicate communication prevention passes | PARTIALLY VERIFIED | hosted GHL/Twilio/support proof |
| G44 | Critical UI journeys pass | UNVERIFIED for final hosted candidate | 60/60 staging |
| G45 | Error/recovery UI states pass | UNVERIFIED | provider failure/slow/offline/browser matrix |
| G46 | Performance thresholds pass | UNVERIFIED | signed budgets + load/soak |
| G47 | Production configuration validated | UNVERIFIED | protected value-free env readback |
| G48 | Application startup passes | VERIFIED locally; production unverified | staging/dormant prod startup |
| G49 | Worker startup passes | UNVERIFIED hosted | worker identity/health/lease proof |
| G50 | Scheduler startup passes | UNVERIFIED hosted | 9 a.m. ET scheduling/claim proof |
| G51 | Health/readiness checks pass | UNVERIFIED hosted | protected URLs/worker/DB/provider-disabled checks |
| G52 | Critical logs/metrics/traces/alerts exist | UNVERIFIED operationally | alert delivery/runbook drill |
| G53 | Backups confirmed | UNVERIFIED | current inventory/backup metadata |
| G54 | Restore procedure validated | UNVERIFIED | full-system restore drill |
| G55 | Deployment procedure validated | UNVERIFIED | staging then dormant production |
| G56 | Rollback/forward recovery validated | UNVERIFIED | cutback + forward repair drills |
| G57 | Post-deploy smoke defined | PARTIALLY VERIFIED | bind exact commands/thresholds/owners |
| G58 | Release runbook complete | UNVERIFIED | P1-01/P0-11 operator drill |
| G59 | Final diff has no secrets/debug/bypass/conflicts/noise | VERIFIED for 115 seal only | final scan/review/seal |
| G60 | Every environment-blocked release test executed correctly | UNVERIFIED | P0-09/P0-10/P0-11 |

Release requires **G01-G60 = 60/60 PASS** for the same unexpired exact artifact and schema. Later 7/30-day steady-state claims are separate time-bound seals, not prerequisites to first controlled go-live after the 24-hour gate.

## 15. DATABASE AND MIGRATION PLAN

1. Freeze the exact 115-migration baseline digest and independently verify every ordered filename/content hash.
2. Allocate migrations 116-120 only after P0-02 invariants and ownership are reviewed. They must be additive, transactional where PostgreSQL permits, idempotent only where repeat semantics are explicit, and compatible with the 115 runtime until worker drain.
3. Test six paths on PostgreSQL 17.6:
   - empty database through final migration;
   - exact full replay with normalized schema/ACL/RLS identity;
   - recovered foundation plus all extensions;
   - 104→115 historical forward path retained as regression;
   - 115→final successor forward path;
   - last-authoritative-production schema/data shape → final successor on a controlled clone.
4. For non-empty proof, seed and preserve direct/partner tenants, users, subscriptions, credit entries, onboarding drafts, campaigns in every lifecycle state, GHL/Meta mappings, funnels, leads, outbox/jobs, creative assets, support tickets, consent/DSAR/deletion/legal-hold rows, provider receipts, ambiguous effects, and legacy compatibility routes.
5. Capture pre/post row counts and semantic invariants, not customer rows. Prove no silent default converts unknown provider/metric/outcome state to success or zero.
6. Measure lock waits, statement duration, WAL/storage growth, index build, backfill batches, worker compatibility, and cutover budget on a production-scale clone. Any threshold requires signed owner/SRE acceptance.
7. Deploy schema before dormant runtime. Drain old workers before opening new transitions. Run `POST_MIGRATION_RUNTIME_PASS` with effects closed.
8. Take and verify backup/PITR position before production mutation. Restore into an isolated environment and prove DB, Auth, Storage, jobs, deletion tombstones, and application compatibility.
9. Routine rollback is application cutback plus additive forward repair. Never reverse a committed data-bearing migration with destructive DDL during incident pressure.

Binary database acceptance: all paths produce the same expected final schema/security digest, existing semantic data is preserved, RLS/constraints/indexes pass, recovery meets signed RPO/RTO, and no old worker writes an obsolete state.

## 16. SECURITY, PRIVACY, AND TENANT-ISOLATION PLAN

- **Authentication:** PKCE/state/CSRF, safe redirects, session rotation/revocation, password recovery, MFA enrollment/challenge/recovery, recent-auth, rate limiting, abuse/WAF, and production-disabled QA bypasses.
- **Authorization:** explicit direct/partner-child/admin/operator capabilities; no role inferred from host, email, client state, or environment variable.
- **Tenant isolation:** re-run the 12-class privileged matrix across 118 current RLS tables, 114 forced-RLS tables, owner/service/security-definer/storage/cache/provider/job/admin paths, then update counts after final migrations. Add hostile direct SQL/API/browser tests for two direct tenants and two partner trees.
- **Secrets:** provider tokens encrypted at rest, scoped/rotated/revoked; no secrets in client bundles, logs, evidence, command arguments, screenshots, or repo. Run release scan on final diff/artifact.
- **Webhooks/callbacks:** raw-body verification, current+legacy GHL signature behavior where explicitly required, Stripe/Meta/support signatures, replay windows, dedupe, out-of-order handling, tenant/provider binding.
- **Privacy:** signed data map, controller/processor roles, lawful purpose, consent version/language, withdrawal propagation, retention/legal hold, DSAR identity, tenant-scoped expiring export, deletion provider receipts, backup anti-resurrection.
- **Admin truth:** unavailable evidence renders unavailable; no fabricated score. Operator grants are owner-only, candidate/environment/capability bound, immutable, expiring, and audited.
- **Supply chain:** exact Node/npm/lock, immutable install, SHA-pinned actions, CodeQL, vulnerability/license/secret scans, SBOM, signed build provenance, protected external release authority.

Stop release on any tenant crossing, privilege bypass, open redirect, secret/PII exposure, unsigned callback acceptance, prohibited post-withdrawal processing, or deletion resurrection.

## 17. PROVIDER, WEBHOOK, AND ASYNCHRONOUS-EXECUTION PLAN

Every external effect uses the same durable pattern:

`authorized intent → one-use dispatch/idempotency identity → bounded request → provider readback → immutable receipt → reconciliation → terminal confirmed/failed/ambiguous state`.

No timeout after dispatch is blindly retried. Ambiguity is reconciled against the provider before retry. Queues use leases/fencing, bounded attempts/backoff, dead-letter/operator recovery, fair tenant scheduling, and shutdown/drain. Duplicate/out-of-order webhooks/jobs must be harmless.

| Provider | Required authority/proof | Default/kill switch |
|---|---|---|
| Stripe | exact test/live products/prices, webhook replay/order, subscription/refund/dispute/credits reconciliation | no entitlement from client or unrecognized price; checkout capability closes independently |
| GHL | Marketplace app/location/snapshot/slot manifest, OAuth lifecycle, publication/readback, lead/workflow/offboarding | provider writes closed; hidden lead communications disabled |
| Meta | app/account/Page/Pixel/form/scopes, PAUSED creation, activation/readback, leadgen/reporting | no live spend; optimizer shadow; Pixel opt-in; CAPI disabled |
| Creative | account/model/rights/cost ceiling, canonical asset readback/storage/settlement | paid calls closed absent ceiling; stop on ambiguous charge/asset |
| Twilio | test infrastructure/recipient/consent/suppression | lead-facing SMS disabled; internal synthetic only if approved |
| Support gateway | approved mailbox/gateway/recipient/SLA, signed callback/bounce/suppression | internal ticket authoritative; external delivery secondary |

Provider evidence records sanitized account fingerprint, exact environment/candidate, capability, ceiling, expiry, request/receipt identities, readback, cleanup, cost/communication count, and zero customer/production effects in staging.

## 18. OUTBOUND COMMUNICATION AND COMPLIANCE PLAN

- Lead-facing automated SMS remains **disabled** unless OWNER-010 and OWNER-PRIVACY-008 explicitly approve jurisdictions, consent, quiet hours, STOP/suppression, sender registration, templates, retention, and monitoring.
- GHL snapshots/workflows must be inspected so no hidden SMS/email/call fires during test or launch. Disabled communication is proven by provider/workflow readback, not assumed from DealFlow code.
- Internal lead/support alerts require approved recipients, synthetic-only staging, one dispatch identity, suppression/dedupe, bounded retry, signed delivery/bounce callback, and audit receipts.
- Support tickets are committed before notification. Notification failure never deletes or hides the ticket.
- If email campaigns become release scope, SPF/DKIM/DMARC, unsubscribe, complaint/bounce/suppression, jurisdictional consent, and sender reputation become P0. They are otherwise out of scope.
- Evidence contains counts and sanitized IDs only—never message bodies, leads, phones, emails, or raw provider payloads.

## 19. OBSERVABILITY AND OPERATIONAL-READINESS PLAN

Create one release dashboard keyed by environment, tenant-safe aggregate, candidate, deployment, schema, worker generation, and provider capability. Minimum signals:

- auth success/failure/MFA/redirect/session latency;
- checkout/webhook/entitlement/credit mismatch and reconciliation age;
- onboarding/campaign transition counts, illegal transitions, 9 a.m. claim lag, ambiguous effects;
- GHL provision/publication/lead delivery/token refresh/sweep/DLQ latency;
- Meta launch/lead/report freshness/optimizer refusal/action/budget/currency/ambiguity;
- creative dispatch/storage/settlement/cost/ambiguity;
- support ticket/outbox/delivery/bounce/suppression/SLA;
- consent/DSAR/deletion/legal hold/provider ambiguity/tombstone/anti-resurrection;
- API/RSC/DB TTFB and duration, error rate, queue depth/age, worker leases/restarts, provider rate limit, resource/cost budgets;
- tenant/security/WAF/secret-scan anomalies, deployment/schema/env/domain/worker drift.

Each P0 signal has an SLO/threshold, alert destination, staffed owner, acknowledgment/escalation time, diagnostic query, kill switch, recovery runbook, and evidence retention. Before release, trigger representative alerts and prove delivery/acknowledgment. No dashboard metric may convert missing data to zero.

## 20. TEST AND CLEAN-ROOM VALIDATION PLAN

### Existing exact local commands

```bash
npm ci
npm audit --omit=dev
npm run lint
npm run typecheck
npm run build
npm run test:campaign-lifecycle
npm run test:ghl-marketplace-runtime
npm run test:privacy-authority
npm run test:privacy-authority-db
npm run authority:validate
npm run test:authority
npm run test:authority:runtime
npm run test:authority:grants-db
npm run test:meta-optimization-authority
npm run test:privileged-tenancy
npm run test:privileged-tenancy-db
npm run test:supply-chain
npm run supply-chain:check
npm run test:analytics:authority
npm run test:dealflow-completion
npm run test:final-critical
npm run test:final-master-delta
npm run test:integrated-migration-chain-db
```

P0-09 must add and document `format:check`, `release:qualify`, and `release:staging:qualify`; these names are planned interfaces and do not exist in the 115-migration seal. `release:qualify` must preflight/install exact runtimes, choose each test's declared isolated DB/browser mode, run the full portfolio with retries disabled, clean up, and seal evidence.

### Required portfolio

1. Unit/property tests for money, timezone/DST, transitions, dedupe, redirects, consent, limits, currencies, freshness.
2. Contract tests for routes, services, providers, webhooks, callbacks, schemas, environment and release evidence.
3. Disposable DB tests for fresh/replay/forward/non-empty, RLS/bypass, concurrency, constraints/indexes, partial failure.
4. Integration tests for auth→billing→onboarding→GHL/Meta/creative→lead→reporting/optimizer→support/privacy.
5. Browser tests on Chromium, Firefox, WebKit, mobile Chromium, mobile WebKit; direct and both partner hosts; EN/FR/ES; accessibility/error/recovery/slow-provider states.
6. Provider acceptance using only approved sandbox/test/synthetic boundaries and readback.
7. Security tests for attacker roles, CSRF/PKCE/state, webhook signatures/replay, WAF/rate limit, secret/client-bundle scans, storage paths, SSRF/open redirect.
8. Performance: signed per-route/worker budgets, 300 tenants, lead burst, creative queue, reporting/optimizer fair claims, 4-hour soak, no unbounded cost/queue growth.
9. Recovery: worker kill mid-operation, provider accept/timeout, duplicate/out-of-order events, DB/app partial deploy, old-worker drain, backup/PITR/full restore, deletion anti-resurrection.

Round 1 and Round 2 use independent clean clones and isolated state, same exact commit/tree/lock/migration/artifact, retries off, 0 failures/skips/unexplained warnings/nondeterminism/residue. Hosted staging then requires 60/60, 0 skipped, 0 unexplained cancellation, and independent evidence validation.

## 21. DEPLOYMENT AND CUTOVER PLAN

1. Seal and sign one exact artifact after two clean local rounds.
2. Deploy it to protected isolated staging; require `STAGING_GO`.
3. Capture production truth and prove recovery/trust; deploy same artifact to dormant protected production with aliases detached and effects closed.
4. Obtain separate authorization naming commit/tree/artifact/schema/domains/provider accounts/capabilities/ceilings/owners/window/stop thresholds.
5. Confirm fresh backup/PITR and restore evidence; freeze unrelated changes.
6. Apply only approved additive migration delta. Verify history/schema/constraints/indexes/data invariants and require `POST_MIGRATION_RUNTIME_PASS` with effects closed.
7. Start exact runtime/workers/scheduler; prove health, env, generation identity, and zero old workers.
8. Run synthetic provider canaries sequentially: Stripe → GHL → Meta → creative → support/Twilio → lead capture/reporting/optimizer → deletion. Close each capability after proof unless needed for next gate.
9. Require `PRE_ALIAS_PASS`, attach approved aliases in internal-only/synthetic mode, verify DNS/TLS/host/cookie/OAuth/webhook routing, then require `POST_ALIAS_RUNTIME_PASS`.
10. Run direct and both partner golden journeys and reconciliations. Migrate legacy funnels one tenant at a time only after mapping/readback.
11. Ramp approved cohorts in signed stages. Stop on any security/tenant/data/lead/billing/provider/queue/SLO/cost/communication threshold.
12. Monitor through first 9 a.m. Eastern boundary and 24 hours. Issue signed `GO_LIVE_SEAL`; later issue truthful 7-day/30-day steady-state seals.

No step inherits authority from a previous step; every mutation/effect checks the current signed capability and evidence freshness.

## 22. ROLLBACK AND FORWARD-RECOVERY PLAN

### Recovery order

1. Close the affected provider/communication/optimizer capability and stop cohort expansion.
2. Preserve immutable intent, receipts, logs, request IDs, schema/deployment/worker identities, and ambiguity state.
3. Drain/fence workers; reconcile provider and financial truth before retry.
4. If runtime-only defect and schema is backward-compatible, route to the last proven compatible artifact while retaining additive schema.
5. If schema/runtime mismatch, use pre-reviewed additive forward-repair migration and compatible dormant runtime. Do not destructively down-migrate data.
6. If domain/alias defect, detach or route aliases to the proven compatible deployment without changing provider ingress until callbacks are drained/reconciled.
7. If data corruption/loss, invoke the proven backup/PITR/full restore procedure to an isolated target first, validate, then execute owner-authorized recovery. Reapply deletion tombstones/anti-resurrection and reconcile external effects.
8. Run post-recovery security/tenant/lead/billing/provider checks before reopening any capability.

### Mandatory drills

- application cutback after schema migration;
- forward migration repair after injected failure;
- worker termination after provider acceptance but before receipt persistence;
- duplicate/out-of-order webhook/job replay;
- alias rollback with OAuth/webhook ingress continuity;
- full Auth/Storage/DB/job restore and deletion anti-resurrection;
- provider/financial reconciliation and support/operator handoff.

## 23. RISK REGISTER

| Risk | Probability/impact | Detection | Prevention/response | Owner |
|---|---|---|---|---|
| Wrong source/remote promoted | M/Critical | identity/ancestry drift | protected remote, signed tag/artifact, P0-01 | release owner |
| Missing successor behavior recreated incorrectly | M/Critical | invariant/migration/browser failures | tests-first, additive review, P0-02 | data/backend owner |
| Cross-tenant access | L/Critical | hostile RLS/API/browser tests, alerts | forced RLS, capability binding, stop release | security owner |
| Lead lost/duplicated | M/Critical | canonical lead/effect reconciliation | atomic capture, dedupe, outbox/readback | integrations owner |
| Duplicate/ambiguous provider effect | M/Critical | dispatch/receipt ambiguity queue | one-use identity, no blind retry, reconciler | provider owner |
| Billing/credit mismatch | M/Critical | Stripe-ledger reconciliation | append-only receipts, server allowlist | billing owner |
| Optimizer overspend/bad decision | M/Critical | shadow/ceiling/freshness alerts | signed policy, sample/cooldown/kill switch | media owner |
| Deletion/export/privacy failure | M/Critical | SLA/provider/tombstone checks | signed policy, AAL2, anti-resurrection | privacy owner |
| Old worker writes obsolete state | M/Critical | worker generation/drain evidence | fence/drain before capability | SRE owner |
| Migration lock/data loss | L/Critical | clone/lock/WAL/row invariants | additive/batched migration, backup/forward repair | DB owner |
| Environment/domain/provider misbinding | M/High | readback fingerprints and host probes | target/type/scope inventory, signed env | release owner |
| Hidden GHL/Twilio communication | M/Critical | provider/workflow readback | disable lead comms, suppression/dedupe | compliance owner |
| Provider API outage/drift | H/High | rate/error/readback metrics | bounded cache/timeouts, degrade truthfully | provider owner |
| Proof false green/stale evidence | M/Critical | digest/expiry/two-round diff | P0-09 protected runner/external trust | test/security owner |
| Alert/runbook failure | M/High | alert/drill evidence | staffed ownership and drills | on-call owner |
| Restore resurrects deleted data/effects | L/Critical | post-restore tombstone/effect checks | anti-resurrection/re-delete/reconcile | DR/privacy owners |
| Capacity/cost blowout | M/High | queue/latency/spend/storage alerts | signed budgets/load/soak/capabilities | SRE/finance owner |
| New P0/P1 found during execution | M/Variable | exact reproduction | assign to existing domain package; update this plan/evidence; invalidate seal only for tracked/runtime impact; no broad re-audit | coordinator |

Any new issue is classified with the same 37 fields, linked to one existing package, and validated through its affected gates. Only a new architecture/system-of-record or release-scope decision can add a package.

## 24. DECISIONS REQUIRED FROM ME

All 43 decisions are real owner/legal inputs. The recommendation is the execution default; any unsigned row continues to fail closed. Legal/privacy rows require qualified counsel/owner approval rather than engineering inference.

| ID | Decision | Recommendation/default |
|---|---|---|
| `OWNER-001` | Stripe products/prices | One owner-controlled monthly DealFlow product with exact `$297` price in test and live; promotion codes only; no alternate price grants entitlement |
| `OWNER-002` | Billing/tax/cancel/grace/refund/dispute/credits | Monthly cadence; Stripe tax only after nexus review; cancel end-of-period; signed grace/refund/dispute policy; one $10 initial grant; $1 static/$5 video; append-only compensation; fail closed until signed |
| `OWNER-003` | GHL authority/snapshot/locations | One owner-controlled Marketplace app/agency; one preinstalled approved snapshot per dedicated realtor location; fixed manifest/slots |
| `OWNER-004` | GHL ownership/export/offboarding | Customer portability; revoke DealFlow capability on offboarding; remove platform-managed assets per retention policy; preserve minimal audit receipts |
| `OWNER-005` | Fixed vs dynamic questions | **Fixed preinstalled approved GHL question slots**; personalization changes labels/options within the manifest |
| `OWNER-006` | Meta app/assets/scopes/budget | One owner-controlled app; customer-owned ad account/Page/Pixel/form; least scopes; PAUSED creation; minimal signed synthetic canary ceiling |
| `OWNER-007` | Optimizer rules/ceilings | Shadow mode first; currency-aware policy, minimum sample, cooldown, daily/lifetime ceilings, kill switch, owner canary |
| `OWNER-008` | Creative accounts/test cost | Owner-controlled providers; synthetic acceptance with a small exact total ceiling; capability expires automatically |
| `OWNER-009` | Content/commercial rights | Approve only providers/assets/fonts/music/likeness terms supporting commercial white-label use, retention/deletion, and no unauthorized training |
| `OWNER-010` | Twilio/lead SMS | **Lead-facing automated SMS disabled**; internal synthetic test only after consent/recipient/service approval |
| `OWNER-011` | Support gateway/SLA | DealFlow ticket is truth; `support@agentdealflow.io` as secondary destination if verified; immediate receipt, severity-based response/escalation SLA |
| `OWNER-012` | Retention/deletion SLA | Counsel-approved table/provider schedule; minimize product data; retain only legally required financial/security receipts; publish request SLA |
| `OWNER-013` | KPI definitions/targets | Adopt explicit activation/payment, launch, first lead, qualified lead, meaningful conversation, freshness, MRR/retention/churn definitions before dashboards/optimizer |
| `OWNER-014` | Pixel/CAPI consent | **CAPI disabled; browser Pixel explicit purpose/versioned opt-in only** until counsel/provider approval |
| `OWNER-015` | Production/partner domains | Approve `agentdealflow.io`, `www.agentdealflow.io`, `app.agentdealflow.io`, `clicktoscale.io`, `www.clicktoscale.io`; exclude unresolved internal/onboarding subdomains unless ancestry is proven |
| `OWNER-016` | Release/DB/provider/monitoring/recovery owners | Name one accountable person and backup for each role before production preflight |
| `OWNER-017` | RPO/RTO/on-call/DLQ SLA | Recommended starting targets: RPO ≤15 minutes, RTO ≤4 hours, P0 acknowledgment ≤15 minutes, ambiguous financial/provider effects ≤1 hour; owner must sign |
| `OWNER-018` | Canary effect ceilings | Pre-sign the smallest provider-specific synthetic ceiling, recipient, account, count, expiry, and automatic closure; zero open-ended spend/comms |
| `OWNER-019` | Production release authorization | Separate exact one-time authorization after `PRE_MUTATION_ADMISSION_PASS`; name artifact/schema/domains/providers/ceilings/window/owners |
| `OWNER-PRIVACY-001` | Controller/processor roles | Counsel-approved responsibility matrix for DealFlow, partner, realtor, GHL, Meta, Stripe, Twilio, creative/support vendors |
| `OWNER-PRIVACY-002` | Lawful bases | Purpose-by-purpose lawful basis and consent/contract/legitimate-interest record; unapproved processing disabled |
| `OWNER-PRIVACY-003` | Subprocessors/DPAs | Approved register, DPAs, owner, change notification, periodic review |
| `OWNER-PRIVACY-004` | Residency/transfers | Document regions, cross-border mechanism, restrictions, and customer disclosure before processing |
| `OWNER-PRIVACY-005` | DSAR identity/workflow | AAL2/recent-auth for self-service; documented supported/manual escalation for correction/access/export/delete |
| `OWNER-PRIVACY-006` | EN/FR/ES consent | Legally approved equivalent versioned copy; persist language/version/grant/withdrawal evidence |
| `OWNER-PRIVACY-007` | Breach notification | Name incident/privacy owners, jurisdiction timelines, evidence, approval and customer/authority communication procedure |
| `OWNER-PRIVACY-008` | SMS/email/phone rules | Keep lead communications disabled until jurisdiction, consent, quiet hours, suppression/STOP and registration are approved |
| `OWNER-PRIVACY-009` | Sale/training/secondary use | No lead-data sale, tenant commingling, unauthorized model training, or incompatible secondary use |
| `OWNER-SCOPE-001` | Overlapping repos | Preserve evidence, quarantine all non-authoritative deployment paths |
| `OWNER-SCOPE-002` | Broken linked worktree | Quarantine/delete only after archival verification; never treat as source |
| `OWNER-SCOPE-003` | Headless Next 16 branch | Quarantine as historical experiment |
| `OWNER-SCOPE-004` | Invalid wrapper repo | Quarantine; nested repos remain independent evidence only |
| `OWNER-SCOPE-005` | Non-Git runner/jobs prototype | Preserve documentation, block production execution |
| `OWNER-SCOPE-006` | Sales Brain copies | Classify future/internal and quarantine from release |
| `OWNER-SCOPE-007` | Revenue OS/Sales Brain untracked packages | Preserve separately; exclude from DealFlow source/artifact |
| `OWNER-SCOPE-008` | Generated/backup artifacts | Exclude from source truth and deployment; retain sealed evidence only |
| `OWNER-SCOPE-009` | Duplicate UI candidates | Canonical current UI only; alternates historical, no route merging without separate scope |
| `OWNER-SCOPE-010` | Alternate-only routes | Exclude unless current release requirement explicitly maps and is implemented/tested |
| `OWNER-SCOPE-011` | Large marketing homepage component | Preserve for this release if current production surface is required; refactor only as post-release bounded work after proof |
| `OWNER-SCOPE-012` | Legacy/result redirects | Keep only documented compatibility redirects with routing tests; deprecate after migration/traffic evidence |
| `OWNER-SCOPE-GROWTH-AGENT` | Growth Agent scope | **Internal/future, unreachable in this release** |
| `OWNER-SCOPE-SALES-COPILOT` | Sales Copilot scope | **Internal/future, unreachable in this release** |
| `OWNER-ADMIN-SECURITY-SURFACE` | Admin security score | **Remove or render unavailable unless backed by accepted current evidence; never fabricate** |

## 25. EXTERNAL OR ENVIRONMENT BLOCKERS

| Blocker | Exact unblock | Immediate validation after unblock |
|---|---|---|
| Owner/legal decisions | Sign the 43-row packet through owner-controlled authority | run authority static/runtime/DB grants; confirm dependent capability remains closed/open exactly as signed |
| Authoritative remote/protection | Owner Git access; remote/project/branch/environment controls | fetch/read-only ancestry, fsck, protection/API evidence, exact tag/artifact provenance |
| Isolated Vercel staging | Owner-controlled staging project and secure credential/session | value-free env inventory, exact project/branch/target/type scope, deploy/readback identity |
| Isolated Supabase staging | Owner project with DB/Auth/Storage access and synthetic-only boundary | fresh/forward migrations, schema/security digests, RLS/fixture/cleanup |
| GHL authority | Correct owner account, Marketplace app, test locations, approved snapshot/manifest | OAuth/install/refresh/publication/lead/offboarding readback portfolio |
| Meta authority | Correct app/test assets/account/Page/Pixel/form/scopes and canary budget | OAuth/selections/PAUSED create/leadgen/insights/shadow reconciliation |
| Stripe authority | Exact test products/prices/webhook endpoint; later separately approved live truth | checkout/webhook replay/cancel/refund/dispute/credits readback |
| Creative providers | Approved accounts/models/rights and test-cost ceiling | one static/video dispatch, asset/receipt/storage/credit reconciliation |
| Twilio/support gateway | Test service/recipient and approved support destination/callback | synthetic delivery/bounce/suppression/replay; ticket remains authoritative |
| Production read-only truth | Owner-granted least read-only access to Vercel/Supabase/domains/providers | sanitized inventory and exact-current deployment/schema/env/domain/worker proof |
| Backup/PITR/restore | Owner/DB authority and isolated restore target | full restore drill, RPO/RTO, anti-resurrection and application compatibility |
| Protected external trust/signing | External policy/key and protected runner outside candidate control | signed build/test/schema/visual/drain/env manifests and enforced guard |
| Staffed operations | Named release, DB, provider, monitoring, privacy, incident and recovery owners | alert delivery/ack, runbook and recovery drills |
| Real time | First 9 a.m. ET boundary, 24h, 7d, 30d must elapse | issue time-bound seals only after actual observation and reconciliation |

An unavailable provider with no safely isolated test boundary blocks only its dependent release capability; that capability must remain visibly disabled. It cannot be represented as tested.

## 26. GENUINE POST-RELEASE P2 ITEMS

| Item | Why safe to defer |
|---|---|
| Growth Agent, Sales Copilot, Sales Brain, Revenue OS | Explicitly unreachable and not part of realtor/partner core release |
| Teams/advanced collaboration | Current hierarchy supports direct realtor and partner child; no core journey depends on teams |
| Dynamic arbitrary GHL question creation | Fixed approved slots meet current journey and reduce provider drift |
| Lead-facing automated SMS | Disabled; core lead delivery/follow-up can operate through approved GHL snapshot/manual channels |
| Meta CAPI | Disabled; website/Instant Form capture and opt-in Pixel are the bounded release paths |
| Broader optimizer autonomy | Shadow and bounded canary meet safe release; wider automation requires mature real outcomes |
| New UI redesign | Current UI direction is accepted; only correctness/accessibility/performance fixes are required |
| Marketing homepage decomposition | Defer only if current page passes build/performance/security/accessibility; track bounded refactor separately |
| Removal of compatibility redirects | Defer until legacy funnel migration and traffic evidence show no dependency |
| Additional providers/channels/annual pricing | Outside signed product/provider scope and not needed for the $297 core journey |

## 27. FINAL DEFINITION OF DONE

DealFlow is done for this release only when every box is true for one exact artifact:

- [ ] P0-01 through P0-12 and P1-01 are closed with binary evidence; no unresolved P0/P1.
- [ ] Authoritative protected source/base/ancestry and final commit/tree/artifact/lock/migration digests are signed.
- [ ] All 43 decisions are signed or their accepted fail-closed defaults are proven; production authorization is separate and exact.
- [ ] Missing successor migrations/runtime are durably implemented and connected; no vanished/unsealed work is cited.
- [ ] Install, format, lint, typecheck, static/security/dependency/license/SBOM/provenance, build and complete suite pass.
- [ ] Clean-room Round 1 and Round 2 pass with zero failures/skips/retries/nondeterminism/residue.
- [ ] Fresh/replay/foundation/forward/last-production/non-empty migration, data preservation, constraints/indexes and integrated identities pass.
- [ ] Auth/MFA/recovery/admin/tenant isolation and attacker tests pass locally and hosted.
- [ ] Billing/onboarding/GHL/Meta/lead/reporting/optimizer/creative/support/privacy direct and partner journeys pass success/failure/recovery paths.
- [ ] Every provider required by enabled scope has safe-boundary readback evidence; unsupported capability is disabled and excluded explicitly.
- [ ] EN/FR/ES, desktop/mobile, accessibility, visual, slow-network, error/recovery and signed performance/load/soak thresholds pass.
- [ ] Production truth, environment, domains/ingress, worker/scheduler/health, monitoring/alerts/runbooks and owners are current and proven.
- [ ] Backup/PITR/full restore, anti-resurrection, application cutback and additive forward recovery meet signed RPO/RTO.
- [ ] Protected external trust validates signed build/test/schema/visual/drain/environment evidence and returns `PRE_MUTATION_ADMISSION_PASS`.
- [ ] Separately authorized schema/runtime/provider/alias cutover passes post-migration, pre-alias and post-alias guards.
- [ ] Synthetic canaries and direct/partner golden journeys reconcile; legacy funnels migrate without lead loss/duplication.
- [ ] Approved cohorts ramp with zero tenant/security/data/financial/lead/provider/SLO stop condition.
- [ ] First 9 a.m. ET and staffed 24-hour observation pass; `GO_LIVE_SEAL` independently validates.
- [ ] Real 7-day and 30-day reviews are issued only after elapsed time; limitations and P2 work remain truthful.
- [ ] Documentation, support diagnostics, release notes, evidence manifest/checksums and operator handoff match the final implementation.

## 28. IMMEDIATE NEXT EXECUTION STEP

After receiving the exact command `EXECUTE MASTER PLAN`, begin **P0-01 and the invariant-definition portion of P0-02**:

1. Reconfirm the durable `3ad1e94` seal and authoritative remote/ancestry.
2. Freeze scope, systems of record, migration numbers, interfaces, and safe defaults.
3. Produce the owner-decision packet for signature without blocking tests-first implementation of fail-closed behavior.
4. Write failing invariant tests for the five missing successor tranches.
5. Then execute continuously through the dependency sequence in §8, pausing only for an unavoidable external authority or a production mutation requiring the separate exact authorization.

Do not restart a broad audit. Do not deploy production under the planning or execution trigger alone.
