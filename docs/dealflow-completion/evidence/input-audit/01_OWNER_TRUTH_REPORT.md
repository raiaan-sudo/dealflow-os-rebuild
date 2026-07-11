# DealFlow owner truth report

Status: AUDIT INCOMPLETE | Overall readiness: NO-GO

## What DealFlow objectively is today

DealFlow is a multi-surface Next.js/Supabase SaaS implementation for real-estate campaign planning, funnel/creative generation, public lead capture, billing/credits, Meta connection and launch, lead notifications/Meta CAPI/GHL sync, reporting/optimization, asynchronous jobs, operator tooling, and two expansion suites labeled Growth Agent and Sales Copilot. Public acquisition is split among a Vercel marketing site, Vercel app/apex behavior, protected internal host, and two Cloudflare-hosted ClickToScale/onboarding surfaces. Code breadth is real; source-to-deployment lineage, live tenant/database/provider correctness, and end-to-end readiness are not proven.

## Canonical source conclusions

- 11 Git working-directory candidates were discovered: 8 valid HEADs, 2 extant contexts without a valid HEAD, and 1 orphaned worktree. The normalized inventory has 18 repository/package/module records and 12 package manifests.
- REPO-001 at /Users/raiaanreza/Documents/New project/dealflow-os-rebuild is the strongest app-source candidate, but it is not canonical truth: local HEAD 958b496695abdbf2cedee6faadcf4793cb9aacc5, branch codex/production-readiness-hardening-pr, 535 modified + 1 deleted + 125 untracked paths, and its observed remote branch tip differs.
- REPO-010 is the strongest marketing-source candidate; its local HEAD differs from the observed remote tip and exact live deployment linkage is unavailable.
- No canonical source was found for the Cloudflare ClickToScale or onboarding surfaces. REPO-011 is only a plausible internal-host source.
- No exact source commit -> hosting project -> deployment -> domain chain is proven. FIND-038 is a release-blocking traceability finding.

## Deployment, domain, and environment truth

- Six live hosts were mapped: app, apex, www, clicktoscale, internal, and onboarding under agentdealflow.io.
- Four returned Vercel-served behavior; two returned Cloudflare-served behavior. Three local Vercel project records exist, but authenticated project/domain linkage was blocked.
- app and apex redirect through onboarding to login; www serves the marketing homepage; internal returns 401; ClickToScale and onboarding serve separate public pages.
- A single public marker dpl_J4Ksu4n7sjwdRv8tHBTa5ARDKg9E appeared on www HTML and final login HTML. Marker equality does not prove a shared deployment or source commit.
- 128 unique environment key names were inventoried: 111 source-referenced, 93 documented in .env.example, 76 in both, 35 source-only, and 17 example-only. Values/configured state were intentionally not read.

## Architecture in plain language

The browser talks to Next.js App Router pages and 55 API routes. Supabase provides authentication, Postgres, storage, and service-role server access. Stripe controls billing; Meta supports OAuth, Ads, sync and CAPI; Twilio handles SMS; GHL receives CRM records; several AI/media providers generate copy and creatives. A minutely Vercel cron claims system jobs. Marketing Studio generation is deliberately excluded from that cron and expects a separate worker whose live deployment is not proven. This architecture crosses anonymous, authenticated, workspace, operator, internal-secret, provider-webhook, service-role, and worker trust boundaries.

## Normalized scope counts

| Item | Count | Definition |
| --- | --- | --- |
| Repository/package/module records | 18 | 11 Git candidates; 12 package manifests; supporting modules included |
| Primary retained file/module rows | 934 | 672 authoritative/non-generated; 262 explicit generated/stale exclusions |
| Primary entrypoints | 173 | 55 pages + 55 API routes + 61 CLI/test scripts + middleware + cron |
| Unique UI route patterns | 71 | 55 primary + 16 candidate-only; 147 instances across four candidates |
| Feature records | 40 | Each carries behavior/status/tier/owner question |
| UI action families | 39 | Cover 70 action-bearing primary UI files and 383 raw control occurrences |
| Workflows / rules / state machines | 18 / 32 / 16 | Forward and reverse trace anchors |
| Data entities / integrations / config keys / roles | 41 / 12 / 128 / 9 | Live configured/schema state is separate |
| Test entrypoints | 93 | 0 passed, 0 failed, 93 SKIPPED_SAFETY |
| Findings / blockers / evidence items | 56 / 22 / 68 | No silent remainder in required ledgers |

## What is confirmed working—and only within the named scope

- Six public hosts had current DNS/TLS/HTTP behavior mapped with low-volume read-only requests. This proves reachability/redirect/header behavior at the audit timestamp, not product workflows.
- The 28-record safe GET probe confirmed selected marketing/legal/auth/protected/public-funnel/internal-guard routes; the internal system-job GET rejected unauthenticated access with 401.
- The in-app Chromium browser rendered the marketing page, login, a public funnel, and a protected-dashboard redirect. Marketing showed no horizontal overflow at 320, 360, 375, 390, 414, 768, 1024, 1280, 1440, or 1920 CSS pixels. Nine sanitized screenshots were retained.
- Selected security controls are present in source: signed webhooks/state, encrypted Meta token storage, request bounds, same-origin helpers, media SSRF/private-IP/redirect/byte/type controls, RLS hardening migrations, internal-secret routes, Stripe/Twilio signatures, and provider-usage/credit constructs.
- No console warning/error was observed on the three root-browser public pages; this does not cover authenticated/error/provider states.

## Confirmed broken or contradicted

| id | severity | title | impact | status |
| --- | --- | --- | --- | --- |
| FIND-001 | P1 | Launch success can be fabricated from query parameters | False customer confirmation, support disputes, and decisions based on a non-event. | CONFIRMED |
| FIND-002 | P1 | Five-minute job lease has no heartbeat | Duplicate creative/provider work, CRM effects, communications, or spend. | CONFIRMED |
| FIND-003 | P1 | Lead side effects lack durable per-effect completion truth | Lost alerts/conversions/CRM sync, misleading completion, or duplicates if manually retried. | CONFIRMED |
| FIND-004 | P1 | Meta data-deletion callback acknowledges without deleting or queuing | Privacy requests can be acknowledged without execution evidence. | CONFIRMED |
| FIND-006 | P1 | GHL mapping lacks database tenant-exclusivity invariants | Service-role misconfiguration can route or co-mingle customer CRM data. | CONFIRMED |
| FIND-009 | P1 | Meta access tokens are sent in Graph query strings | Tokens can enter URL logs, traces, proxy telemetry, or error reports. | CONFIRMED |
| FIND-010 | P1 | Command center can show false calm and hard-coded readiness | Owners can make launch/incident decisions on invented or stale confidence. | CONFIRMED |
| FIND-011 | P1 | Public client telemetry crosses into an operator Codex prompt | Operator deception and unsafe code/action suggestions. | CONFIRMED |
| FIND-033 | P1 | Live public funnel exposes internal template scaffolding and broken copy | Conversion loss, brand damage, prospect confusion, and launch credibility risk. | CONFIRMED |
| FIND-038 | P1 | Canonical source and exact deployed commit are not proven | Auditing or fixing the wrong checkout and releasing stale/divergent code. | NOT_PROVEN |

## Code-only, deployed-but-unproven, configured-but-unusable, and documented-only

- Code-only: most authenticated campaign, billing, launch, lead downstream, Growth Agent, Sales Copilot, admin and provider workflows. Source existence is Tier C, not execution proof.
- Deployed/reachable but workflow-unproven: marketing/app/apex/legal/login/public funnel/internal guard and the two Cloudflare pages.
- Configuration-name-only: all 128 environment keys; values, account identity, enabled flags and production policy are not asserted.
- Schema/migration-only: 43 migration names with 29 hydrated and 14 dataless bodies at snapshot; deployed schema/RLS is not asserted.
- Documented-only or historical: worker runbooks, stale launch proof, readiness copy, prior domain behavior and operating-knowledge packages unless corroborated elsewhere.

## Severity distribution

| severity | count |
| --- | --- |
| P0 | 0 |
| P1 | 14 |
| P2 | 34 |
| P3 | 8 |

## Readiness by product area

| Product area | Verdict | Basis |
| --- | --- | --- |
| Marketing/www | CONDITIONAL_NO_GO | Reachable/responsive in IAB at 10 widths; current source commit unproven; broad CSP, skip-link and performance proof gaps. |
| App identity/onboarding | NO_GO | Recovery fragment, open redirect, unscoped PII draft, missing authenticated matrix. |
| Campaign builder/funnel | NO_GO | Source-rich but write path untested; live public funnel quality is unacceptable for launch. |
| Creative generation | NO_GO | Provider/worker/runtime and test state unproven; temp/DTO/worker gaps. |
| Billing/credits | NOT_PROVEN_NO_GO | Source controls exist; no live schema/Stripe lifecycle/concurrency proof. |
| Meta launch | NO_GO | False success, URL token, version/scope and provider proof gaps. |
| Lead capture/CRM/communications | NO_GO | Parent completion can hide child failure; GHL mapping/retry/idempotency concerns; no safe POST. |
| Jobs/workers | NO_GO | Lease heartbeat absent; active-workspace scope gap; dedicated worker unproven. |
| Operations/admin | NO_GO | False-calm/hard-coded readiness and prompt-injection path. |
| Growth Agent/Sales Copilot | CODE_ONLY_NOT_PROVEN | Route/action inventory exists; product scope, entitlements and end-to-end utility not proven. |
| Data/tenancy/privacy | NO_GO | Live RLS/schema blocked; deletion flow missing; mixed tenancy. |
| Overall | NO_GO / AUDIT INCOMPLETE | Multiple P1 launch/privacy/reliability/source-traceability findings plus exact proof blockers. |

## Simplification candidates—not owner decisions

| ID | Class | Candidate | Status |
| --- | --- | --- | --- |
| DEBT-001 | duplicate | Eleven app/checkouts plus non-Git copies share overlapping DealFlow source lineage. | CONFIRMED |
| DEBT-002 | orphan | REPO-007 linked worktree points to an absent /private/tmp Git directory. | CONFIRMED |
| DEBT-003 | legacy/experiment | REPO-008 Next 16 test branch has no valid local or remote head. | CONFIRMED |
| DEBT-004 | container | REPO-009 wrapper Git repo has no valid head/index and only contains nested repos. | CONFIRMED |
| DEBT-005 | legacy | REPO-012 dealflow-os-local is a non-Git runner/jobs prototype. | CANDIDATE |
| DEBT-006 | duplicate docs | Sales Brain exists as nested untracked docs and a separate 28-file copy; exact equality not proven. | CANDIDATE |
| DEBT-007 | untracked docs | Revenue OS and Sales Brain knowledge packages are untracked inside the primary dirty checkout. | CONFIRMED |
| DEBT-008 | generated/stale | 262 of 934 primary inventory rows are generated, backup, or prior-output artifacts explicitly excluded from source truth. | CONFIRMED |
| DEBT-009 | duplicate routes | Across four UI candidates, 124 page instances collapse to 71 unique patterns plus 53 duplicate instances. | CONFIRMED |
| DEBT-010 | candidate-only surface | Sixteen routes exist only in alternate UI candidates, including SEO and control-room surfaces. | CONFIRMED |

## Tests and live proof actually completed

- Product tests: 0 passed, 0 failed, 93 manifest test entrypoints SKIPPED_SAFETY; 10 primary tests/ files also blocked by placeholders at snapshot.
- Static/read-only audit checks: repository/deployment/UI/env CSV parsing, inventory arithmetic, targeted source review, secret-pattern scans, Git baseline/closeout comparison, DNS/TLS/HTTP checks, browser DOM/console/overflow checks, and final bundle validation.
- Live HTTP: 6 domains mapped; 7 top-level public route timing probes; 28 selected safe GET route records in the root probe. No POST/form/provider/auth flow was invoked.
- Browser: 4 public/anonymous journeys including protected redirect, 3 rendered public pages, 14 route-viewport observations, 10 marketing widths, 9 screenshots, 1 Chromium-family engine, 0 authenticated roles, 0 Firefox/WebKit, 0 screen-reader, and 0 Core Web Vital results.

## Top 10 owner decisions/actions

| ID | Decision/question | Related |
| --- | --- | --- |
| DEC-001 | Name the canonical source for app, marketing, internal, ClickToScale and onboarding, including branch/commit and archive disposition. | FIND-038; FIND-039; repository inventory |
| DEC-002 | Approve domain intent: should apex be app-gated or redirect to www, and which domain owns acquisition versus product? | FIND-054; DEP-001..003 |
| DEC-003 | Define the authoritative tenant/resource model across organizations, campaigns, assets, jobs, logs and partner CRM mappings. | FIND-005; FIND-006; FIND-012 |
| DEC-004 | Define a campaign launch receipt and the exact customer-visible launched/failed/unknown states. | FIND-001; FLOW-010 |
| DEC-005 | Choose the queue lease, per-effect idempotency, retry, dead-letter and reconciliation contract for paid/provider work. | FIND-002; FIND-003; FIND-017; FIND-043 |
| DEC-006 | Approve the data-deletion inventory, retention exceptions, SLA, status model and privacy/legal owner. | FIND-004; FIND-041 |
| DEC-007 | Decide whether Marketing Studio is a live supported feature and identify its supervised worker/SLO owner. | FIND-025 |
| DEC-008 | Decide whether the live funnel is test data or customer-facing; approve a publication quality gate and rollback owner. | FIND-033 |
| DEC-009 | Approve an isolated fixture environment for test execution, cross-tenant RLS, authenticated browser and provider sandbox proof. | FIND-037; FIND-045; FIND-046; FIND-053 |
| DEC-010 | Make release gates canonical: CI location, branch protection, immutable actions, security/accessibility tests and source-to-deploy provenance. | FIND-016; FIND-038; FIND-052 |

## Exact blockers and skipped-safety areas

| ID | Area | Status | Exact blocker |
| --- | --- | --- | --- |
| BLK-001 | iCloud placeholders | BLOCKED | 85 authoritative primary paths were BLOCKED_CONTENT_NOT_LOCAL at the 934-row snapshot; 322 rows total were dataless including generated/excluded artifacts. |
| BLK-002 | Automatic hydration side effect | CONFIRMED_CAVEAT | Reading placeholders automatically changed local byte/metadata state for source/Git files without content or Git commands writing them. |
| BLK-003 | Primary dirty worktree | BLOCKED | REPO-001 baseline and closeout: 0 staged, 535 modified, 1 deleted, 125 untracked; user changes preserved. |
| BLK-004 | Git completeness | BLOCKED | Eight Git candidates had status blocked/not applicable by dataless indexes/objects or invalid worktree state. |
| BLK-005 | Canonical source | NOT_PROVEN | No owner-approved canonical checkout/branch/commit was available; multiple commits and same-HEAD manifest drift exist. |
| BLK-006 | Deployment lineage | BLOCKED | Vercel CLI/auth unavailable; unauthenticated deployment inspection returned 403; marker does not identify commit. |
| BLK-007 | Cloudflare surface lineage | BLOCKED | ClickToScale and onboarding domains are live but no source/project/config linkage was discoverable. |
| BLK-008 | Production environment values | SKIPPED_SAFETY | Only environment key names were inventoried; no values, enabled flags, account IDs, or secrets were read. |
| BLK-009 | Live database schema/RLS | SKIPPED_SAFETY | No production/shared database query or cross-tenant fixture was authorized; 14 migration bodies were dataless at snapshot. |
| BLK-010 | Provider behavior | SKIPPED_SAFETY | No Meta, Stripe, Twilio, GHL, Higgsfield, OpenAI, HeyGen, ElevenLabs, Freshdesk or Supabase mutation/auth call was made. |
| BLK-011 | Marketing Studio worker runtime | NOT_PROVEN | Architecture requires a dedicated long-running worker; hosting/supervision/health was not found. |
| BLK-012 | Authenticated UI | SKIPPED_SAFETY | No safe pre-existing fixture session was supplied; product pages can write telemetry/storage on render. |
| BLK-013 | Role/tenant matrix runtime | SKIPPED_SAFETY | No admin, member, former-member, multi-workspace, paid-plan, provider-connected or error-state sessions were exercised. |
| BLK-014 | Cross-browser and assistive technology | BLOCKED | IAB Chromium only; Firefox/WebKit, keyboard-only, screen reader and 200/400 percent zoom were not run. |
| BLK-015 | Core Web Vitals | BLOCKED | No LCP, CLS, INP, long-task or network-waterfall evidence was captured. |
| BLK-016 | Test execution | SKIPPED_SAFETY | 93 manifest test entrypoints were classified but all skipped; existing configs/scripts can write builds, reports, sessions, DB/provider/customer state. |
| BLK-017 | Primary test files | BLOCKED | 10 of 13 primary tests/ files were dataless at inventory snapshot. |
| BLK-018 | Safe POST probes | SKIPPED_SAFETY | No invalid/unsigned POST was sent because exact current transitive side-effect isolation was not closed. |
| BLK-019 | Legal/compliance conclusions | NOT_PROVEN | Technical privacy/security mechanics were reviewed; legal adequacy and certification were out of scope. |
| BLK-020 | Current Meta support lifecycle | NOT_PROVEN | Code version/scope drift is confirmed; authoritative current Meta Graph support was not established inside the source subaudit. |
| BLK-021 | Backups/generated output | EXCLUDED | Backup bodies, local environment values, .next, vendor dependencies and most .vercel output were excluded as non-authoritative or sensitive. |
| BLK-022 | Customer/private data | SKIPPED_SAFETY | No customer rows, provider records, cookies, personal browser state, or raw production logs were accessed. |

## Final verdict

NO-GO and AUDIT INCOMPLETE. This is not a generic recommendation. The precise release blockers are FIND-001/002/003/004/006/009/010/011/025/033/038/043/046 plus their acceptance proof, with all P2 accessibility/auth/configuration/tenant controls addressed according to owner risk policy. No source content or external system was intentionally mutated; automatic iCloud hydration is the disclosed exception at the local cache/metadata layer.

