# DealFlow Meta operating contract

Status: `INTEGRATED CANDIDATE / FINAL-SEAL PROOF NOT_YET_RUN / HOSTED PROVIDER ACCEPTANCE NOT_YET_RUN / PRODUCTION NO_GO`

Meta owns advertising delivery and provider-confirmed performance. DealFlow
owns customer intent, selected asset mappings, immutable launch inputs,
provider-object receipts, activation authorization, lead routing, reporting
observations, optimization decisions, and cross-system reconciliation.

## OAuth and asset authority

- OAuth state is one-time and bound to the initiating user and workspace.
- Return paths are local, normalized and allowlisted.
- The one-time authorization-code exchange is never retried after an ambiguous
  response.
- Tokens are encrypted; bearer authorization and the central exact permission
  set are used consistently.
- Account, page and pixel selection must be explicit and persisted under the
  exact tenant. Current session, cookie, query or first provider result is not
  authority.

Hosted test-account consent, token exchange, asset discovery, expiry, reconnect
and removed-member/cross-tenant negatives are `NOT_YET_RUN`.

## Destination and qualification independence

A campaign selects one capture destination:

- `website_funnel`: requires a current campaign-scoped ready GHL HTTPS
  destination; or
- `meta_instant_form`: requires an exact provider page/form/campaign route.

Qualification depth is a separate choice. It must not silently change the
capture destination. Neither destination may fall back to an unrelated legacy
DealFlow funnel when its required authority is missing.

## Provider object creation

Initial launch requires explicit customer action, an immutable launch-input
snapshot/digest, one selected primary creative, exact account/page/pixel,
customer budget, schedule, destination and qualification contract. Jobs use
renewable token/generation leases. Each provider POST is armed immediately
before dispatch and settles only through the matching durable receipt.

Campaign, ad set and ad are created and reread as PAUSED. Missing object IDs,
timeout/transport ambiguity, receipt-persistence failure, stale generation or
provider readback mismatch cannot be retried as if nothing happened; they enter
reconciliation or `operator_action_required`.

## Separate customer-authorized ACTIVE delivery

PAUSED creation is not ad delivery authority. ACTIVE delivery requires a
separate finalized customer preauthorization bound to:

- exact organization, campaign, Meta account and launch attempt;
- immutable launch-input digest and exact single-primary provider objects;
- daily/lifetime budget, currency and customer ceiling;
- current qualifying entitlement and customer authorization;
- configured/effective PAUSED receipts before activation;
- renewable activation lease, generation and one-use effect record; and
- provider reread immediately before each ordered ad, ad-set, then campaign
  activation.

Any preauthorization, launch, budget, entitlement, object, provider state,
kill-switch or lease drift stops before the next effect. A possible write with
no conclusive readback is operator reconciliation, not a blind retry. Direct
manual and scheduled paths use the same service and gates.

No Meta ACTIVE delivery or advertising spend is claimed.

## Launch timing

Launch intent is scheduled for 9:00 a.m. `America/New_York`, using timezone and
daylight-saving-aware conversion. At or before 9:00 a.m. Eastern the intent is
for that day; after 9:00 a.m. it is for the next calendar day. Weekends and
holidays are not skipped unless a later owner-approved policy version says so.

## Meta Instant Forms and native leads

- Form provisioning is a durable tenant/campaign/page-scoped saga with exact
  input and provider receipts.
- EN/FR/ES qualification questions come from the persisted campaign language.
- Webhook signature, freshness, dedupe and route authority are required before
  canonical lead persistence.
- One provider event becomes one canonical DealFlow lead. Unknown/ambiguous
  routes are reconciled; unauthorized side effects are suppressed.
- GHL contact/opportunity/tag/workflow delivery uses the canonical location
  mapping and exact campaign. It does not pretend a GHL website funnel captured
  a Meta Instant Form lead.

Hosted page/form/subscription/webhook/reconciliation acceptance is
`NOT_YET_RUN`; no live lead event is claimed.

## Reporting and results

Reporting schedules and sync jobs retain provider source time, attribution,
units/currency and freshness. Customer/operator states distinguish current,
delayed, stale, missing, partial, unavailable and failed. Missing values never
become numeric zero. Repeated hosted sync, restart, duplicate-window, timeout,
stale-lease and recovery proof is `NOT_YET_RUN`.

## Optimization

Policy `dealflow-realtor-optimization-v2` is the current contract. It requires
complete current Meta evidence, a finalized owner approval/consent record, exact
launched primary object lineage, effective ACTIVE delivery, currency and daily
budget ceiling, 24-hour cooldown, 20% per-action/rolling-day scale cap, and
clear global/account/campaign/emergency kill switches.

The executor revalidates every authority immediately before a one-use provider
dispatch. Expired or ambiguous armed effects require reconciliation. A budget
scale can settle only against effective ACTIVE delivery. Missing/stale/conflict
always yields HOLD. See `OPTIMIZATION_POLICY.md`.

Sandbox execution is `NOT_YET_RUN`. Production execution remains default-off
and requires owner-approved policy plus separately authorized Meta canary.

## Pixel/CAPI consent

Browser Pixel is default-off and has versioned allow/decline/revoke behavior.
CAPI remains suppressed until owner/legal-approved consent text, explicit form
collection, server-stamped evidence, expiry, withdrawal, deletion and retention
contracts exist and are deployed. A feature flag alone is never consent.

## Required acceptance evidence

For each hosted Meta path retain sanitized exact account/object fingerprints,
tenant/campaign/job identity, input/policy digest, idempotency/dispatch key,
pre/post provider states, receipt, timestamps, retry/reconcile outcome, kill
switches as booleans, browser/command result, cleanup, manifest and checksums.
Never retain access tokens, cookies, raw lead payloads or customer PII.

No live Meta provider action, ad launch, spend, customer-data read or production
mutation is authorized or proven by this document.
