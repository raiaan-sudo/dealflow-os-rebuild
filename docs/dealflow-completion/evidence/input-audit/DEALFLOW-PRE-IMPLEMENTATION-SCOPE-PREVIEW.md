# DealFlow Pre-Implementation Scope Preview

## Approval status

- Owner decisions: `LOCKED`
- Scope preview: `OWNER APPROVED`
- Read-only continuation: `INTEGRATED AS PHASE 0 OF THE MASTER EXECUTION`
- Implementation master prompt: `ISSUED_NOT_EXECUTED`
- Code changes: `AUTHORIZED ONLY WHEN THE OWNER PASTES THE MASTER PROMPT INTO AN EXECUTION TASK`
- Deployment or production mutation: `NOT AUTHORIZED`

## Executive Summary

- **This is a completion-and-hardening program, not a rebuild.** We will preserve DealFlow's current UI, onboarding direction, paywall, and working infrastructure while fixing the unreliable connections and adding the approved GHL operating model.
- **The first protection is proving the correct current version.** Codex will not be allowed to build from, merge, restore, or deploy an older or unverified DealFlow checkout. The canonical repository, commit, schema, domain, and deployment ancestry must be proven before implementation.
- **The customer journey will become one dependable system.** Payment, GHL provisioning, onboarding, generation, Meta launch, tracking, lead delivery, reporting, and optimization will be connected by durable state and truthful customer-visible outcomes.
- **The future Codex run will be autonomous but bounded.** Up to five sub-agents may work in parallel, but one lead agent controls integration. Code and tests may be prepared autonomously; deployments and real Meta, GHL, Stripe, customer-data, messaging, DNS, environment, or production-database mutations remain separate approval boundaries.

## The operating model now locked

### Customer and GHL model

- DealFlow remains exclusively for realtors, with white-label partners as the secondary distribution model.
- Every new realtor receives their own DealFlow-provided GoHighLevel account/location.
- The approved, versioned DealFlow snapshot is already installed before the connected experience begins.
- Ordinary customers see a simple realtor-first product. Tenant ownership, partner management, and administrative hierarchy exist securely underneath but remain invisible unless relevant.
- Advanced team, brokerage, and multi-seat collaboration are not current priorities.

### Activation

- A customer becomes active when payment succeeds.
- Meta connection, GHL readiness, launch readiness, first campaign, and first verified lead may be tracked as operational milestones, but they do not redefine activation.

### Systems of record

- Meta owns provider-confirmed advertising delivery and performance metrics.
- GHL owns CRM contacts, opportunities, pipeline, appointments, and follow-up lifecycle after verified ingestion.
- Stripe owns subscription and payment truth.
- DealFlow owns onboarding and configuration intent, generated assets, funnel/campaign workflow, launch receipts, background-job state, optimization decisions, cross-system mappings, and the unified customer experience.

### Autonomous optimization

- DealFlow may pause, cut, scale, or reallocate advertising autonomously within the customer's approved budget and the approved optimization policy.
- Codex must first recover the existing CTR, CPL, budget, cut, scale, and related instructions; remove contradictions and duplicate logic; add minimum-data requirements, cooldowns, caps, and emergency stops; and prove the behavior through simulation.
- Numerical thresholds will not be guessed. If existing instructions conflict materially or lack provenance, the only legal result is `HOLD / NO_ACTION`; the conflict is returned in the rulebook and live provider action remains disabled.
- Every optimizer decision needs its inputs, reason, authority check, before/after state, idempotency, audit history, and recovery path.

### Product-preservation rule

- Preserve the current UI structure, visual language, navigation, onboarding experience, paywall direction, and all proven working infrastructure.
- UI changes require a documented bug, accessibility requirement, truthful-state correction, or approved GHL workflow.
- No redesign, broad rewrite, speculative framework migration, dependency-wide upgrade, or unrelated cleanup is included.

## What the overall program will cover

### 1. Lock the real current DealFlow and prevent regression

Codex will identify the one authoritative repository, branch, commit, remote, schema state, environment contract, and live deployment chain. It will capture protected routes, product behavior, and visual baselines before changing anything.

The program will then add release controls that reject stale checkouts, missing protected changes, unverified build ancestry, schema mismatches, failing tests, and unexplained visual or behavioral differences. A rollback will always mean restoring the exact verified prior deployment—not deploying some arbitrary older folder.

**Outcome:** Codex cannot accidentally take DealFlow backward or claim that a different checkout represents production.

### 2. Build the complete realtor and white-label GHL lifecycle

The system will reliably create or assign the correct GHL account/location, verify the installed snapshot version, maintain exclusive tenant-to-location mappings, support white-label ownership boundaries, handle reconnects, and recover safely from partial provisioning failures.

The existing partner-embedded DealFlow experience will be preserved. Advanced team collaboration remains outside scope.

**Outcome:** every realtor gets the correct ready-to-use GHL environment without seeing the underlying account complexity or risking cross-customer data exposure.

### 3. Preserve onboarding while making every generated output trustworthy

The onboarding experience stays visually and structurally intact. Codex will prove that every material answer is validated, persisted, and propagated into the correct offer, funnel, headline, copy, static creative, video creative, targeting context, and campaign setup.

Generation and publication will use truthful draft, preview, processing, failed, retrying, completed, credit-reserved, and published states. Provider failure may never appear as customer-visible success.

**Outcome:** customers keep the onboarding experience they like, and the output consistently reflects what they entered.

### 4. Move the funnel lifecycle into GHL and make launch truthful

DealFlow will create, publish, version, and reconcile funnels inside the correct GHL location. Existing funnels will move through a compatibility-tested canary migration rather than a mass destructive cutover.

The Meta connection and launch path will validate the account, page, pixel, permissions, API compatibility, funnel/form destination, budget, and other prerequisites. Launches will use the approved 9:00 a.m. Eastern scheduling rule with daylight-saving-safe time handling. The UI will show success only after a durable server-side launch receipt confirms provider acceptance.

**Outcome:** a customer can move from personalized assets to a real, correctly configured campaign without fake success, stale prerequisites, or an untracked partial launch.

### 5. Make every lead traceable from submission to follow-up

GHL funnel submissions and supported Meta instant-form leads will use one observable delivery model. Every valid lead will be persisted, deduplicated, attributed, mapped to the correct realtor, delivered to the correct GHL location, tagged, connected to the intended snapshot workflows, and reconciled.

Each downstream effect will have its own durable completion state, idempotency key, attempts, timeout, retry policy, and operator-visible terminal state. The parent lead may not be marked fully complete while required delivery steps have silently failed.

**Outcome:** DealFlow can prove whether each lead was received, stored, attributed, sent, accepted, retried, duplicated, or blocked.

### 6. Make Results truthful and optimization genuinely autonomous

The Results experience will reconcile Meta performance, GHL lead lifecycle, and DealFlow operational records. It will distinguish current, delayed, stale, unavailable, estimated, and confirmed data; unavailable data will never be converted into a trustworthy zero.

The scattered optimization instructions will become one versioned decision engine with minimum-data gates, evaluation timing, CTR/CPL rules, pause and reallocation logic, scaling limits, budget ceilings, cooldowns, insufficient-data behavior, a kill switch, explainability, and rollback.

**Outcome:** customers see what is actually happening, and DealFlow optimizes campaigns only when the evidence and authority allow it.

### 7. Finish the commercial and support foundation

The existing `$297` paywall and pricing journey will be preserved. The program will prove subscription activation, discounts, entitlement changes, failed-payment recovery, cancellation behavior, `$10` starting generation credit, `$5` videos, `$1` static creatives, atomic credit reservation, safe top-ups, failed-generation refunds, and zero-credit enforcement.

The in-product support control will reliably create one durable ticket, route it to the approved support destination, include useful technical context without secrets, and expose failure rather than silently dropping the request.

**Outcome:** payment activation, credits, entitlements, and support behave consistently under retries and concurrent use.

### 8. Permanently fix the security and reliability foundation

Codex will address tenant isolation, token handling, credential leakage in URLs/logs, deletion truth, prompt/telemetry trust boundaries, provider timeouts, job leases and heartbeats, duplicate work, retries, dead-letter/operator states, monitoring, and recovery.

The design standard is root-cause correction: database constraints, durable state machines, transaction boundaries, idempotency, explicit failures, tests, and documentation. Quick patches, swallowed errors, fabricated success states, and hard-coded readiness are prohibited.

**Outcome:** integration failures become recoverable and visible instead of turning into silent data loss or false customer confidence.

### 9. Polish the UI surgically and prove the complete product

The current design remains. Work is limited to broken funnel copy, inaccurate or misleading states, document titles, focus behavior, dialogs, live status announcements, selection semantics, mobile usability, and other audit-backed finish-quality issues.

The finished candidate must pass direct-realtor and white-label journeys from successful payment through GHL readiness, personalized assets, Meta launch, lead capture, CRM delivery, Results, and bounded optimization. It must also pass security, tenant, billing, credit, failure-injection, visual, accessibility, build, schema, migration, and rollback checks.

**Outcome:** the product looks like DealFlow, works like the promised DealFlow, and carries evidence that the changes did not break what already worked.

## How the autonomous Codex run will be controlled

### One lead integrator, up to five focused agents

The lead Codex agent alone owns the final plan, shared issue ledger, integration order, conflict resolution, and final verdict. Up to five concurrent roles may cover:

1. Canonical source, architecture, and protected baselines.
2. Backend, data, jobs, Meta, GHL, Stripe, and lead delivery.
3. Frontend, preserved UI, truthful states, accessibility, and visual regression.
4. Reliability, security, tenant isolation, adversarial cases, and failure injection.
5. Independent verification of the integrated candidate without approving its own work.

Agents receive explicit ownership and acceptance criteria. Overlapping changes require lead-agent coordination. No sub-agent may deploy, mutate production, weaken a guardrail, or independently declare the product release-ready.

### Safe execution boundaries

- Work only from a newly created branch/worktree based on the proven canonical baseline.
- Preserve user changes; no reset, force operation, broad formatter pass, destructive cleanup, or unrelated refactor.
- Implement in small, testable batches and run regression gates before integrating dependent work.
- Use local fixtures, mocks, provider sandboxes, and synthetic tenants/leads.
- No push, merge, deployment, DNS change, environment change, production migration, customer-data mutation, Meta spend/action, GHL customer mutation, Stripe charge/refund, or customer communication without separate explicit approval.
- Database changes must be backward-compatible and reversible wherever possible. Any irreversible operation requires a tested backup/restore plan and owner approval.
- Blocked evidence remains blocked; Codex may not convert uncertainty into a pass.

### Mandatory stop conditions

Codex must stop instead of improvising if it cannot prove the canonical source or live commit, encounters conflicting unexplained user changes, requires a production/customer mutation for proof, needs a destructive or irreversible action, cannot prove tenant/payment/lead integrity, exposes a secret, creates a new regression, or would need to weaken a control to finish.

## What “done” will mean

The future implementation run is done only when it returns:

- A requirement-to-change ledger mapping every approved need and audit finding to its final disposition.
- Root cause and permanent fix for every addressed defect.
- Exact changed files and local commits or patch sets.
- Exact test commands and results, including pre-existing failures separated from new failures.
- End-to-end behavioral evidence and before/after visual proof.
- Canonical baseline, target build, domain, schema, and deployment mapping.
- Security, tenant, provider, billing, credit, lead, optimization, rollback, and recovery evidence.
- Separate confirmed, assumed, not proven, skipped, and blocked lists.
- A deployment-ready release manifest and exact rollback plan.

The autonomous run will produce a deployment-ready candidate. It will not deploy that candidate unless Raiaan separately authorizes the exact release after reviewing the evidence.

## Explicitly outside this program

- Serving industries other than real estate.
- A major redesign or rebrand.
- Advanced team, brokerage, or multi-seat collaboration.
- Replacing GoHighLevel with a DealFlow-built CRM.
- DealFlow taking ownership of customer Meta accounts, calendars, or Stripe accounts.
- Unlimited autonomous budget increases.
- Promoting Growth Agent, Sales Copilot, or unrelated experimental systems into the core product without separate approval.
- Destructive mass migration of existing funnels or customer data.
- Deploying anything during the read-only continuation stage.

## The remaining controlled unknown

The exact autonomous-optimization rulebook is not yet normalized. The read-only continuation audit will recover every existing rule and training instruction, identify contradictions, and produce one matrix covering thresholds, minimum data, cut/scale behavior, caps, cooldowns, and emergency stops.

This does not need to interrupt the later autonomous code run. The engine can be implemented and fully simulated behind a disabled production-action gate. Live provider action remains off until the resulting rulebook and release evidence are approved.

## Extremely simplified version

- Lock the correct current version so DealFlow cannot go backward.
- Keep the current UI and infrastructure; improve it instead of rebuilding it.
- Give every realtor a ready-to-use GHL account with the snapshot installed.
- Make payment, onboarding, funnel creation, Meta launch, and lead delivery work as one reliable journey.
- Make Results accurate and optimization actually work within strict limits.
- Permanently fix billing, credits, support, security, background jobs, and integration failures.
- Prove the direct-realtor and white-label journeys before any controlled release.
- Let Codex build autonomously, but never let it deploy or touch live customer/provider systems without approval.

## How the approved master execution proceeds

1. Its read-only Phase 0 proves the canonical source/deployment chain, captures protected baselines, recovers the optimizer rulebook, and designs the safe fixture environment.
2. Once the canonical gate passes, the same run continues automatically into implementation; it does not stop for another prompt or green light.
3. Codex completes implementation, tests, documentation, independent verification, release packaging, and rollback preparation.
4. The run returns a deployment-ready candidate plus proof—not a surprise production deployment.
