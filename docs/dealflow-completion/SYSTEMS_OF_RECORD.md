# DealFlow systems of record

Status: `INTEGRATED CANDIDATE CONTRACT / FINAL SEAL PENDING / PRODUCTION NOT PROVEN`
Overall verdict: `NO_GO`

This contract prevents a browser, queue row, log, redirect, metadata field, or
local intention from impersonating a payment, tenant, provider, consent,
delivery, or completion fact.

| Fact | Authoritative system | DealFlow responsibility | Never authoritative |
|---|---|---|---|
| New-customer product | DealFlow versioned commercial contract: Pro at `$297/month` | Expose only Pro for new acquisition; keep Starter/Growth read-compatible only for explicitly reconciled legacy records | Query string, old design-preview copy, cached UI, unverified Stripe metadata |
| Payment and subscription | Stripe signed event plus freshly retrieved exact-mode provider objects | Match live/test mode, customer, session, subscription, quantity-one recurring price, currency and product; claim/reconcile atomically | Redirect, success page, event ordering, local subscription status alone |
| Historical activation | One qualifying positive Stripe payment interpreted by DealFlow into immutable `commercial_activations` | Exactly-once activation plus exactly-once `$10` initial credit; never rewrite on later setup failure | Onboarding completion, subscription projection alone, GHL readiness, launch, first lead |
| Current entitlement | Current recognized Stripe subscription projected atomically to DealFlow | Unknown/multiple/mismatched price or unresolved legacy state fails closed | Cached org row, browser plan, stale webhook metadata |
| Credits/provider usage | DealFlow organization+user ledger, durable reservation/attempt, and provider reconciliation | Reserve `$1` static / `$5` video, settle or compensate once, reconcile ambiguity, block generation at zero | Client arithmetic, provider transport error, mutable balance copy |
| Active workspace and role | Current Supabase authentication plus DealFlow membership/RLS | Carry exact organization/user/role through every route, RPC, job, receipt, provider, asset, campaign and lead | Email, first membership, URL ID, stale tab, partner branding |
| Partner/brand host | One unique active, verified, SSL-active `partner_domains` row joined to an active partner and sanitized branding | Create short-lived signed exact-host attribution; keep auth/tenant/billing/RLS authority independent | Host header without server lookup, caller slug/header/query, shared GHL vendor origin |
| Onboarding and language intent | Validated persisted DealFlow campaign plan | Propagate audience, market, offer, brand, creative, qualification, destination and normalized EN/FR/ES language | Generated copy alone, browser local storage, unsupported language string |
| GHL installation/location | Exact active tenant/environment installation, canonical location mapping, manifest and provider receipts | Enforce direct versus partner-child ownership and one routable location per tenant/environment | Email match, first provider result, legacy projection alone, local queued state |
| GHL website destination | Exact ready campaign personalization record for organization + campaign + environment + manifest slot + source-plan fingerprint | Verify non-overlapping slot, exact forms/custom-value names, HTTPS destination, current revision, append-only receipt | Location-global custom values, a different campaign's URL, HTTP `202`, fake receipt |
| GHL CRM lifecycle | GHL provider state after verified canonical handoff | Track contact, opportunity, tag/workflow and appointment effects independently with idempotency and receipts | Parent lead job success, accepted outbox, website destination readiness |
| Meta OAuth connection | Meta token/assets accepted under one-time DealFlow user+workspace state | Zero-retry code exchange, encrypted token, exact account/page/pixel selection | Cookie, return URL, current session after callback begins |
| Meta launch input | Immutable DealFlow launch-input snapshot and customer launch intent | Bind campaign, destination, budget, creative, provider account and schedule to one digest/attempt | Latest mutable campaign state, button state, query success |
| Meta provider object | Meta response/readback plus append-only DealFlow lineage receipt and armed-effect record | Require exact campaign/ad-set/ad IDs, primary creative, configured/effective PAUSED state, lease/generation ownership and ambiguity reconciliation | Deterministic name, parent pause inference, transport success without receipt |
| Meta ACTIVE delivery authority | Finalized customer preauthorization plus exact provider/launch/object/budget lineage and current provider readback | Revalidate immediately before each ordered effect; require one-use dispatch; settle receipts; ambiguity becomes operator work | Launch completion, PAUSED receipt, optimizer decision, stale activation intent |
| Advertising metrics | Meta provider-confirmed observations | Store source time, attribution, units/currency, freshness and reconciliation state | Missing coerced to zero, local estimate, stale cache, optimistic UI |
| Optimization decision | DealFlow immutable policy-v2 evaluation bound to complete current Meta evidence, owner consent and budget authority | HOLD on missing/stale/conflict; bind exact launched primary object and effective ACTIVE delivery; record reason/input/before/intended/after/reconcile | LLM suggestion, unapproved threshold, old metrics, launch intent alone |
| Meta Instant Form route | Exact active page/form/campaign mapping constrained by selected account/page and launch lineage | Provision/reconcile one form route and persist one signed/deduplicated canonical lead | Form name, first match, current UI selection |
| Lead record | DealFlow canonical persisted lead after verified website/Meta input | Persist before effects; record source/route; deliver independently and idempotently to GHL | Funnel success page, provider callback acknowledgement, parent job state |
| Public language experience | Persisted normalized campaign-plan language | Keep funnel, metadata, HTML/content language, form, consent, thank-you, and Meta form qualification aligned | Browser locale, generated asset metadata alone |
| Generated asset | DealFlow immutable tenant/campaign storage identity plus provider receipt | Validate payload/bytes/provenance, reserve usage, reconcile ambiguity, select exactly one primary for publication | Caller path/bucket, remote URL alone, queued generation |
| Jobs/effects | DealFlow v2 lease/effect ledgers | Token+generation+expiry ownership, heartbeat, one-use dispatch, bounded retry and terminal/operator states | In-memory promise, timeout, log line, expired worker |
| Turnstile | Cloudflare verification under exact host/action/non-test production configuration | Verify before public lead persistence and fail closed on missing/mismatch | Token presence, request Origin alone |
| Pixel/CAPI consent | Owner/legal-approved current policy plus exact versioned user evidence | Browser Pixel allow/decline/revoke; suppress CAPI until server-stamped consent/expiry/withdrawal authority exists | Feature flag, page view, stale cookie, checkbox without retained evidence |
| SMS/compliance | Twilio-signed callback plus monotonic DealFlow receipt | Exact tenant/destination, atomic STOP/START state, deny regressive callbacks | Unsigned request, provider SID, late lower state |
| Support | DealFlow ticket/outbox/receipt; external gateway receipt only when enabled | Commit ticket first, return correlation ID, fence delivery, use zero-communication staging sink, reconcile ambiguous external dispatch | Email attempt/log, UI success, external endpoint configured without receipt |
| Deletion responsibility | Signed provider request plus durable DealFlow request/status and approved policy | Freshness/replay defense, sanitized public state, no false completion | Callback acknowledgement, confirmation URL, queued request alone |
| Staging safety | Central zero-external-effects evaluator plus hosted proof endpoint and exact environment identity | Require test mode, disabled real writes/communications/spend, synthetic records and exact host/project | `NODE_ENV`, local env file, test name, operator assertion alone |
| Release decision | Protected external release trust plus exact clean seal, six signed manifests, staging acceptance and owner authority | Bind source/build/test/schema/visual/drain/environment/canary evidence to one deployment | Target-added key, unsigned JSON, historical pass, staging pass alone |

## Truth-state contract

UI and operator records distinguish `confirmed`, `pending`, `retrying`,
`partial`, `delayed`, `stale`, `missing`, `unavailable`, `failed`, `suppressed`,
`provider_paused`, `uncertain`, `operator_action_required`, and
`not_configured`. Numeric zero is a source-confirmed observation, never a
fallback for missing evidence.

## Independent milestones

1. qualifying commercial activation;
2. current Stripe entitlement;
3. onboarding/campaign configuration;
4. GHL installation and campaign destination readiness;
5. Meta connection and selected assets;
6. immutable launch intent and 9 a.m. Eastern schedule;
7. exact PAUSED provider-object receipts;
8. separate customer-authorized ACTIVE delivery;
9. first verified/deduplicated lead;
10. GHL contact/opportunity/workflow/appointment lifecycle; and
11. current Meta reporting plus safe optimization eligibility.

No later setup failure rewrites activation. No setup/readiness state grants
entitlement. No optimizer result grants initial ad-spend authority.

## Owner/legal authority still open

Production enablement still requires approved consent/retention/deletion terms,
GHL ownership/export/offboarding, support destination and SLA, customer
communications, provider credentials/account ownership, and the production
optimizer policy. None is inferred from source code or local tests.
