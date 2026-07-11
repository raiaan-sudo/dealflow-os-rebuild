# DealFlow systems of record

Status: `CANDIDATE CONTRACT LOCKED / PRODUCTION ACCEPTANCE BLOCKED`
Overall verdict: `NO_GO`

This contract prevents browser, queue, metadata, or local intent from
impersonating a commercial, provider, tenant, consent, or completion fact.

| Fact | Authoritative system | DealFlow candidate responsibility | Never authoritative |
|---|---|---|---|
| Payment event/object mode | Stripe signed event plus current provider object | Enforce live/test runtime match; v2 claim; retrieve current subscription/payment; atomically project and settle | Redirect, client callback, metadata alone, unordered cached row |
| Historical commercial activation | DealFlow interpretation of one qualifying authoritative Stripe payment | Immutable exactly-once activation and initial grant | Onboarding complete, GHL ready, launch, first lead |
| Current plan/entitlement | Current recognized Stripe subscription item projected atomically to DealFlow billing/org state | Unknown/multiple/mismatched price fails closed; preserve separately from activation | Stale metadata, browser cache, org row updated independently |
| Credit balance | DealFlow organization+user ledger and atomic balance projection | Atomic reserve/consume/compensate with current membership and one durable reference; do not claim fully append-only retention until legacy user/org deletion FKs are replaced under an approved legal policy | Client arithmetic, user-only global balance |
| Provider-usage attempt | DealFlow v2 attempt ledger plus provider reconciliation | Reserve once; monotonic CAS settlement; ambiguity means reconcile, not refund; compensate once | Transport exception alone, late stale worker, mutable status overwrite |
| Access-key checkout/reveal | Authoritatively refreshed Stripe checkout/expanded customer/current subscription plus DealFlow tenant preclaim and a session-bound two-phase delivery claim | Reject unknown stored tiers; require the runtime-configured price for the allowed tier; before any settled-status return, bind the exact row, client reference, refreshed session, customer, subscription, unpaginated single quantity-one recurring price/plan, and partner snapshot; reconcile paid activation through an exact lease; claim ready only after a verified handoff; retain ciphertext until rendered delivery is acknowledged, then destroy it atomically | URL slug, incoming event expansion alone, internally repeated metadata, query/session alone, pre-render claim, repeat acknowledgement, test/live prefix inference from NODE_ENV |
| Active workspace | DealFlow authenticated membership and explicit/singular active-workspace contract | Carry exact organization/user through route, job, receipt, provider, billing, asset, and lead boundaries | Email, URL parameter, first membership, stale browser tab |
| Onboarding/config intent | DealFlow validated tenant-scoped server draft | Persist/propagate accepted fields only after explicit user action | Global/local browser storage, passive render |
| Meta OAuth connection | Meta tokens/assets accepted under one-time DealFlow user+workspace state | Zero-retry code exchange; encrypted token; persisted exact account/page/pixel selection | Cookie alone, return URL, mutable current session after callback begins |
| Meta launch intent | DealFlow campaign launch record | One campaign/attempt, due claim, immutable launch-input snapshot/digest, generation fence | Query-string success, button state, latest unrelated campaign |
| Meta provider object/status | Meta response plus DealFlow append-only lineage-bound receipt and per-stage pending-mutation fence | Arm the exact stage/object key immediately before POST; clear only through a matching durable receipt or bounded explicit provider rejection; ambiguous/time-out/receipt failure becomes operator reconciliation; require configured/effective PAUSED | Local intent, deterministic name alone, generic retry, parent pause inference, mutable runtime cache |
| Advertising delivery/performance | Meta provider-confirmed metrics/object state | Store source time, freshness, units, attribution, reconciliation | Missing coerced to zero, local `provider_paused`, optimistic UI |
| Meta native form route | DealFlow active page+form-to-campaign route constrained by persisted launch/selection identity | Resolve exactly one route and current tenant/campaign before lead persistence | First match, form name, mutable UI selection |
| Native lead event | Signed Meta event plus DealFlow dedupe/event ledger | Persist one canonical lead, suppress unauthorized effects, reconcile unknown/ambiguous route | Unsigned payload, provider lead ID without exact route, parent job success |
| CAPI/Pixel consent | Owner/legal-approved current policy plus exact user evidence/cookie and default-off gate | Pixel supports versioned allow/decline/revoke. CAPI remains suppressed until explicit form collection, server-stamped persisted evidence, expiry and withdrawal semantics are approved and implemented | Environment enablement alone, page view alone, stale policy cookie |
| Turnstile verification | Cloudflare response under exact production config/hostname/action | Reject test keys in production and verify before lead persistence | Token presence, request Origin alone |
| GHL mapping/readiness | Future GHL provider receipts under one proven workspace/install/location/snapshot mapping | Candidate models fake-only state/receipts; live ready requires sanctioned provider proof | Fake receipt, queued request, email, provider first result, HTTP `202` |
| CRM lifecycle | GHL after verified canonical lead handoff | Track contact/opportunity/workflow/appointment as independent durable effects | Parent job success, accepted local outbox |
| Generated asset | DealFlow immutable tenant/campaign storage identity plus provider receipt | Reserve usage, validate/store provenance, reconcile ambiguity, server-derived deletion | Caller path/bucket/metadata, queued URL |
| Jobs/effects | DealFlow v2 job/effect ledgers | Token+generation+expiry ownership, heartbeat, bounded retry, terminal/operator state | In-memory timeout, log line, v1 worker |
| SMS/compliance | Twilio-signed callback plus DealFlow monotonic receipt/atomic lead state | Exact tenant/destination, v2 receipt, STOP/START atomic settlement | Unsigned callback, late regressive status, provider SID alone |
| Support | DealFlow ticket/outbox/receipt | Ticket committed first; fenced notification; durable delivery receipt | Email send attempt or log alone |
| Optimization | DealFlow immutable versioned shadow decision using complete provider evidence | Canonical digest; `HOLD_NO_ACTION` on missing/stale/partial/conflict; no live action | LLM output, stale metrics, unapproved threshold |
| Deletion responsibility | Signed Meta request plus DealFlow durable request/status | Public sanitized responsibility state, replay/freshness, no false completion | Callback acknowledgment, confirmation URL, queued row alone |
| Release decision | Guard v4 plus protected external policy path/digest and six signed evidence manifests | Exact clean target/deployment, externally authorized candidate-policy digest, source/time/content digest, environment/drain agreement | Target-added key, caller-authored JSON, local preview, unsigned/self-signed evidence |

## Truth-state contract

Customer/operator states distinguish `confirmed`, `pending`, `retrying`,
`partial`, `stale`, `unavailable`, `failed`, `suppressed`,
`provider_paused`, `operator_action_required`, and `not_configured` as applicable.
Numeric `0` is a source-confirmed observation, never a fallback for missing,
failed, delayed, unauthorized, or unconfigured data.

## Separate activation/readiness milestones

1. qualifying commercial activation (immutable historical fact)
2. current Stripe plan/entitlement (reconciled fact)
3. onboarding/configuration completeness
4. GHL provisioning/readiness
5. Meta connection and selected assets
6. durable launch intent and immutable input lineage
7. provider-paused receipt completeness
8. first signed/deduplicated verified lead
9. CRM handoff/appointment lifecycle

No later setup failure rewrites historical activation, and no setup/readiness
state grants entitlement without authoritative payment truth.

## Open authority decisions

The candidate does not invent the multi-workspace selection UX, consent and
retention policy, deletion execution/SLA, GHL ownership/offboarding rules,
operator response targets, or customer communication policy. Those decisions
must be approved before production enablement.
