# Canonical current versus approved desired state

Overall verdict: `NO_GO`
Canonical production baseline: `d37c50945ff7004d700301fc89c15eb9273dac5b`
Candidate deployment: `NOT EXECUTED`

The candidate contains substantial local remediation, but production still runs
the immutable baseline. “Implemented” below means present in the isolated
candidate and covered by the cited local/offline/disposable proof; it does not
mean deployed, migrated, provider-accepted, or production-verified.

| Area | Baseline truth | Candidate truth | Required desired proof / disposition |
|---|---|---|---|
| Provenance | Core domains map to Vercel deployment `dpl_J4Ksu4n7sjwdRv8tHBTa5ARDKg9E` at the baseline SHA | Isolated implementation commit `017f15f2bd1f4a22c1e3276f3ca01ff3a0de5128`, tree `477aa90a5407c52222a736e6e975e68e19ab3d5f`, descends from the baseline; the documentation seal is a docs-only descendant recorded by the external bundle manifest | Clean ancestry, hashes, two exact-seal verification rounds, and signed production evidence bundle |
| Release evidence | No authoritative execution gate | Guard v4 validates six signed evidence classes against a protected external policy path+digest outside the repository; the target policy is informational/digest-bound and target keys are ignored | Owner-approved external authority plus signed build/test/schema/visual/drain/environment manifests for one exact deployment |
| Migration | Tracked chain assumes `public.campaign_plans` already exists | Candidate adds fenced migrations and pre/post checks; full fresh replay still fails at baseline migration `20260426110000...`, statement 0, SQLSTATE `42P01` | Authoritative foundational schema, fresh/prior/idempotent replay, RLS/privilege negatives, mixed-version drain, and forward-recovery drill |
| Customer/workspace | Tenant authority was inconsistent at several boundaries | Composite tenant keys, current membership checks, campaign identity immutability, scoped jobs/assets/leads/credits, and service-role DML revocation were added | Authenticated multi-workspace selection/switch/stale-tab golden journey remains unproven and owner contract is open |
| Activation/onboarding | Material onboarding fields were dropped; passive render could persist/emit; activation/status routes were missing | Validated server draft, explicit-interaction persistence, tenant-scoped campaign identity, `/api/activation/events`, `/api/billing/status`, qualifying-payment activation, and initial-credit contracts exist | Full-chain DB proof, isolated authenticated browser journey, and production Stripe acceptance |
| Billing/Stripe | Metadata/order ambiguity could project stale plans; provider mode was not strictly fenced | Current-price/authoritative subscription retrieval, live/test runtime mode, v2 webhook claim fencing, atomic billing projection, durable top-up intents, and fail-closed ambiguity exist | Signed deployed mode/config attestation and live provider webhook/read acceptance; no live Stripe call occurred |
| Credits/provider usage | User-only scope and non-CAS settlement allowed replay/refund ambiguity | Organization+user scope, atomic v2 attempt reserve/settle, job-stable paid-provider idempotency, monotonic terminal state, ambiguity reconciliation, and exactly-once compensation were added | Legacy financial-ledger deletion/tenant-retention semantics require owner/legal approval and a migration; no real paid provider call or refund occurred |
| Access keys | Checkout/reveal ownership, immutable Stripe binding, configured tier-price authority, success-copy truth, partner-brand validation, and crash/replay boundaries were incomplete | Active stored partner resolution, strict stored tier plus configured-price match, unconditional authoritative checkout/customer refresh, exact row/session/customer/subscription/single-price binding before settled returns, independent verified-checkout/key-availability UI states, all-null-only recovery CAS, tenant preclaim, qualifying payment, session-bound reveal recovery, direct-DML denial, and validated live/test key prefix are implemented locally | Production checkout/reveal acceptance and owner policy for zero-dollar/manual invoice behavior remain blocked |
| GHL | No canonical executable GHL foundation | Candidate now has schema, fake-only adapter, tenant mapping, provisioning/outbox/receipt/operator states, and isolated DB tests | Real adapter, sanctioned agency capability, exact snapshot/version/required-object manifest, data/offboarding policy, and live acceptance are blocked |
| Meta OAuth | Hard-coded/versioned request drift, unsafe return/state gaps, generic retries, and a route-local scope set missing native-lead authority | Central contract, validated exact required scope set (including native lead retrieval), user/workspace one-time state, bearer tokens, strict return paths, long-lived extension sequencing, and zero-retry one-time code exchange exist | Real consent/scopes/account/page/pixel discovery and token exchange remain externally unverified |
| Meta launch | Local paused primitives existed, but schedule consumption, renewable ownership, exact receipt lineage, mutable retry inputs, ambiguous post-write retry safety, and manual terminalizer reachability were incomplete | Due claiming, renewable generation fences, immutable launch-input snapshot/digest, per-stage pre-POST mutation arming, expired-manual-crash terminalization with exact operator truth, operator-only ambiguous outcomes, exact creative cardinality, PAUSED receipts, and truthful `provider_paused` completion exist | No provider object was created; live/sandbox acceptance, signed environment gates, old-worker drain, and canary remain blocked |
| Meta native leadgen | No signed webhook, page/form route, durable dedupe, reconciliation, or explicit route-provisioning RBAC | Owner/active campaign-owner/exact-admin route authority is enforced in service and database; exact routing, signed ingestion, canonical lead persistence, effect suppression, bounded reconciliation, and disposable-database proof pass locally | Live Meta page/form/subscription/payload acceptance remains blocked |
| Meta CAPI/Pixel | Environment enablement could overstate consent/queue truth | Browser Pixel has a default-off versioned consent cookie/control. CAPI is also default-off and correctly suppresses every public lead because no approved server-stamped consent producer, expiry, or withdrawal model exists yet | Owner/legal consent text/version plus explicit form collection, persisted evidence, expiry/revocation/withdrawal, retention, deployed policy presence, and live acceptance remain blocked |
| Lead/security | Lead effects, retries, Turnstile, and tenant authority had gaps | Canonical campaign scope, parent/child lease fences, bounded terminalization, exact Turnstile host/action and non-test production-key policy, and no-write load path exist | Exact deployed Turnstile configuration attestation and provider/live journey are absent |
| Creative/jobs | Leases, effect truth, storage identity, and provider-usage settlement had replay/tenant gaps | v2-only leases, heartbeats, generation/token CAS, immutable storage identity, exact org propagation, terminal sweeps, and financial attempt fencing exist | Full migration replay plus real creative-provider ambiguity/idempotency acceptance remain blocked |
| SMS/support | Callback state and support delivery could report false/partial success | SMS v2 monotonic receipts and atomic compliance; durable support ticket/outbox/receipt with fenced delivery and operator terminal states exist | No SMS, email, or external notification was sent; Twilio/mailbox acceptance and owner SLA are blocked |
| Deletion/privacy | Meta callback acknowledged without durable public responsibility status | Signed request freshness/replay, durable responsibility, sanitized public status, and no-false-completion copy exist | Actual data inventory/deletion execution, provider handoff, retention exceptions, legal approval, and completion SLA are blocked |
| Optimizer/results | Missing metrics could become zero/action; decisions were not immutable | Source/freshness truth, canonical policy digest, append-only shadow decisions, and `HOLD_NO_ACTION` on missing authority are implemented | Owner-approved thresholds, attribution/minimum samples/cooldowns/scale caps, production metrics, and any live action remain blocked |
| Accessibility/visual | Login/title/focus/selection/truth defects were confirmed | Candidate local root/login desktop/mobile proof and contract fixes exist without horizontal overflow in the tested widths | Authenticated role/error states, screen readers, zoom, Firefox/WebKit, and complete visual matrix remain not proven |

## Release-blocking proof still absent

- Fresh, prior-shape, idempotent, RLS, privilege, mixed-version, and recovery
  migration proof for the complete chain.
- Cryptographically authoritative zero-old-worker drain covering every
  superseded protocol.
- Signed exact-deployment environment attestation for safe flags, Stripe live
  mode, Turnstile production configuration, Meta consent policy presence, and
  secret-strength policies.
- Authorized live/sandbox acceptance for Meta, GHL, Stripe, Twilio, and creative
  providers.
- Source ancestry for `internal.agentdealflow.io`,
  `clicktoscale.agentdealflow.io`, and `onboarding.agentdealflow.io`.
- Separately authorized isolated staging, canary, monitoring, and forward
  recovery exercise.
- Owner/legal decisions for workspace selection, consent, retention, deletion,
  GHL ownership/offboarding, operator SLAs, and customer communication.

No production/provider/customer/shared-database/configuration mutation is
authorized by this document.
