# DealFlow provider acceptance boundaries

Status: `SOURCE CONTRACT INTEGRATED / ISOLATED STAGING PARTIALLY ACCEPTED / PRODUCTION NO_GO`

Configuration, a reachable hostname, an accepted queue row, and a local mock are
not provider acceptance. Every provider path must prove exact environment,
account, tenant, object, operation, idempotency, receipt and recovery authority.

## Central zero-external-effects gate

All browser and load acceptance runs must first pass the same centralized
server-side evaluator and, when hosted, the authenticated internal proof
endpoint. The evaluator requires the exact isolated target and safe values for
Stripe test mode, Meta/GHL/creative/Twilio/support write controls, real
communications, QA auth, telemetry, demo paths and test harnesses. A hosted run
must stop before navigation or load when this attestation is absent or differs.

`NODE_ENV=production` only describes a build. It is never deployment or provider
authority. `DEALFLOW_DEPLOYMENT_TARGET`, Vercel environment/host, Supabase
project identity, provider account and application/database gates must all
agree. Unknown or conflicting identity fails closed.

## Common write contract

Every externally consequential write requires:

1. exact deployment/project/host and provider environment;
2. exact tenant, campaign/job and provider-account binding;
3. explicit global and operation-specific application gates;
4. matching database runtime gate read immediately before dispatch;
5. current renewable lease/token/generation ownership;
6. immutable payload/input digest and one-use idempotency/dispatch authority;
7. no blind transport retry after a possible provider write;
8. durable provider object/receipt plus post-write readback where supported; and
9. bounded reconciliation or `operator_action_required` for ambiguity.

Secrets remain in the approved secret manager and are borrowed only for the
bounded request. They must not enter SQL, source, CLI arguments, evidence,
screenshots, logs or chat.

## Provider-specific boundaries

| Provider/path | Isolated staging boundary | Production boundary | Current proof |
|---|---|---|---|
| Stripe | Test keys/objects only; exact test mode and synthetic QA tenants; no live charge/refund | Live key/object attestation, exact price/product, signed webhook, owner-approved canary | Hosted staging `NOT_YET_RUN`; live `SKIPPED_SAFETY` |
| Meta OAuth/read | Designated test/sandbox account, exact permissions/assets, no ad delivery | Exact production app/account/page/pixel authority and token lifecycle | `NOT_YET_RUN` |
| Meta object creation | Synthetic campaign; create/read only under exact sandbox gates; provider objects remain PAUSED | Separately authorized canary with spend ceiling and signed environment/drain | `NOT_YET_RUN`; no Meta object is claimed |
| Meta ACTIVE delivery | Disabled in ordinary staging; any sandbox proof uses zero-spend/test boundary and exact customer preauthorization | Explicit owner release, exact budget/account/object lineage, ACTIVE readback, monitoring/stop plan | `SKIPPED_SAFETY` until a qualifying isolated boundary exists |
| Meta optimizer | Sandbox account only; policy-v2, fixed ceiling/cooldown/cap, exact ACTIVE test objects, one-use dispatch and reconcile | Signed owner policy, canary, kill switches, live account authority and spend controls | `NOT_YET_RUN`; production default-off |
| GHL | Marketplace sandbox/PIT or clearly isolated account; preinstalled snapshot/slot manifest; synthetic location/contact/opportunity; email/SMS disabled | Agency capability, exact installation/location/snapshot/slot, lifecycle webhook, offboarding policy and canary | `NOT_YET_RUN`; no live GHL record is claimed |
| Higgsfield/creative | Exact official OAuth CLI, synthetic source/prompt, bounded preflight cost, one provider job, exact CDN allowlist and no credit purchase | Approved production account, protected OAuth worker/config home or provider-issued service key, durable credit reservation, receipt/ambiguity proof and cost authority | 2026-07-22 isolated acceptance `PASS`: completed job, 5-credit estimate, exact 5-credit account delta, DealFlow status readback; production activation remains `NOT_PROVEN` |
| Twilio | Test infrastructure only, exact allowlisted test recipient, no real SMS/call; mock hard-blocked in production | Signed webhook, exact messaging service/from/to authority, compliance and canary | `NOT_YET_RUN`; no SMS sent |
| Support | `internal_operator_inbox` or zero-communication `staging_sink`; loopback mail sink only under exact test attestation | Owner-approved exact HTTPS idempotent gateway, destination, receipt, token and production flag | Staging `NOT_YET_RUN`; no email sent |
| Turnstile | Test/site key appropriate to isolated host; exact action and hostname | Non-test keys, exact production hosts/actions, provider verification evidence | Hosted `NOT_YET_RUN` |
| Pixel/CAPI | Browser Pixel consent UI may be tested without dispatch; CAPI stays suppressed without approved server consent evidence | Approved text/version, persisted evidence, expiry/revoke/withdrawal and retention; exact Meta gate | Production `BLOCKED_OWNER_AUTHORITY` |

## GHL-specific publication truth

DealFlow does not claim an undocumented API can publish arbitrary GHL snapshots,
funnels, forms or pages. The supported model is an owner-preinstalled approved
snapshot and manifest. A website campaign becomes ready only after its exact
non-overlapping campaign slot, custom-value mapping, required forms, HTTPS
destination and current source-plan fingerprint are verified. Meta Instant Form
leads use their own exact capture route and then the canonical GHL location.

## Support delivery truth

A committed support ticket is customer success even if notification delivery is
pending. `internal_operator_inbox` and `staging_sink` are database receipts, not
emails. External delivery can be called successful only after the exact gateway
returns its durable receipt and the outbox settles under the matching lease.

## Acceptance evidence

Provider acceptance must retain sanitized request class, exact non-secret
account/object fingerprints, tenant/campaign/job identity, input digest,
idempotency key, pre/post state, provider receipt, timestamps, retry/reconcile
outcome, cleanup state, command/browser result, manifest and checksums. It must
exclude raw credentials, cookies, PII, lead payloads and message bodies.

The single 2026-07-22 Higgsfield synthetic acceptance described above was
separately owner-authorized and used existing provider credits without a new
purchase. No other provider call, communication, charge, ad delivery,
production mutation or spend is authorized or claimed by this document.
