# Campaign 345 Paused Meta Launch Readiness

Date: 2026-05-15

Campaign: `345dcc04-8e87-4ead-b71a-40236e2ef52e`

Production deploy: `dpl_2vmsMDmnm6kYUNycoNU5yZUqrCxL`

Safety commit: `c4002f8c2f0b04838d6c95ac52db2ee8b0264c17`

Destination: `https://app.agentdealflow.io/f/raiaan-realty`

## Current State

Paused-only Meta launch is complete. DealFlow created or recovered exactly one deterministic launch object set:

- Meta campaign ID: `120248208607670616`
- Meta ad set ID: `120248208608400616`
- Meta creative ID: `1387185106767238`
- Meta ad ID: `120248208609740616`

Read-only Meta Graph verification showed:

- Campaign status: `PAUSED`
- Campaign configured status: `PAUSED`
- Campaign effective status: `PAUSED`
- Ad set status: `PAUSED`
- Ad set configured status: `PAUSED`
- Ad set effective status: `PAUSED`
- Ad status: `PAUSED`
- Ad configured status: `PAUSED`
- Ad effective status: `PAUSED`
- Ad set daily budget: `300` cents
- Creative destination: `https://app.agentdealflow.io/f/raiaan-realty`

No object is `ACTIVE`. DealFlow cannot start spend from this state.

## Budget Guardrail

The launch budget safety patch is deployed at `c4002f8c2f0b04838d6c95ac52db2ee8b0264c17`.

Effective launch budget:

- Campaign requested budget: `$3,000/month`
- Uncapped implied daily budget: `$100/day`
- DealFlow cap: `$3/day`
- Meta `daily_budget`: `300` cents

The server-side launch path applies the cap before sending the Meta ad set payload.

## Tracking And Live Activation

Tracking state remains intentionally blocked for live activation:

- `launch_domain`: `app.agentdealflow.io`
- `domain_verified`: `false`
- `tracking_status`: `partial`

Paused object creation is complete. Live delivery remains blocked until the owner explicitly approves activation and Meta account funding is acceptable.

Additional owner-session verification on 2026-05-15:

- Meta Business Suite, business portfolio `CMA Media`, shows root domain `agentdealflow.io` as `Verified`.
- The launch destination host is `app.agentdealflow.io`, which is a subdomain of the verified root.
- Opening Events Manager with the ad account context proved the selected pixel `1445523053467565` is accessible as `DealFlow OS QA Pixel`.
- Events Manager showed `PageView` as active for the launch domain, last received within the proof window.
- A Meta test-event-only server `Lead` event was sent to the selected pixel without submitting a DealFlow lead or triggering SMS/email.
- Events Manager showed the test `Lead` and `PageView` as `Processed` under `app.agentdealflow.io`.
- DealFlow tracking readiness was synced through `scripts/sync-meta-tracking-readiness.mjs`, which requires explicit operator enablement plus domain, PageView, Lead, campaign, domain, pixel, and ad-account checks.
- DealFlow now records `domain_verified=true` and `tracking_status=configured` for `launch_domain=app.agentdealflow.io`.

## Duplicate Protection

Exact deterministic-name lookup returned one object for each launch stage:

- Campaign exact-name matches: 1
- Ad set exact-name matches: 1
- Creative exact-name matches: 1
- Ad exact-name matches: 1

No duplicate Meta launch object set was found.

## Launch Locks And Operator Debt

Launch lock verification:

- Total launch lock rows for campaign: `0`
- Active launch locks: `0`
- Stale launch locks requiring cleanup: `0`

Operator debt after review:

- Unresolved failed jobs: `0`
- Unresolved dead-letter jobs: `0`
- Unresolved Stripe webhook failures: `0`
- Failed provider events: `0`
- Stale provider reservations: `0`

One post-launch `meta_sync` dead-letter artifact was reviewed as a benign status-sync race after direct read-only Meta verification proved the saved IDs and PAUSED statuses.

## Public Funnel Proof

Read-only GET:

- URL: `https://app.agentdealflow.io/f/raiaan-realty`
- Status: `200`
- Deployment marker: `dpl_2vmsMDmnm6kYUNycoNU5yZUqrCxL`

No lead form was submitted.

The app host and campaign funnel served the expected deployment marker. The marketing aliases were not modified during this pass.

## Meta Account Delivery Warnings

Read-only Ads Manager verification showed:

- Account overview reports `0 active campaigns`.
- The paused launch campaign has no active delivery from DealFlow.
- Meta displays a delivery warning: the total ad budget/funds are too low and suggests adding funds.
- No `Add funds`, publish, review, activate, budget, or delivery action was clicked.

This is an owner/payment-side live delivery blocker. It does not invalidate the paused object proof.

## DealFlow Readiness State After Sync

Read-only DB/app verification after the tracking sync:

- `launch_domain`: `app.agentdealflow.io`
- `domain_verified`: `true`
- `tracking_status`: `configured`
- `pixel_id`: `1445523053467565`
- `external_account_id`: `act_659800805610910`
- Evidence metadata recorded: selected pixel accessible, PageView test processed, Lead test processed.

Authenticated production Launch UI verification:

- Meta status: connected and verified just now.
- Meta preflight: ready.
- Tracking / live activation: ready.
- Effective budget: capped to `$3.00/day`.
- Static media gate: ready.
- UGC video gate: ready.
- Launch action copy still describes paused Meta launch behavior.
- No console errors observed.

## Validation Commands

Validated with Node 20:

- `node -v`: `v20.20.2`
- `npm run operator:debt`: pass, no unresolved operator debt
- `npm run test:launch-budget-tracking-safety`: pass
- `npm run smoke:offline`: pass
- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm run build`: pass
- `git diff --check`: pass
- Secret-pattern diff scan: pass, no secret values found in the diff

Additional focused validation:

- `scripts/sync-meta-tracking-readiness.mjs`: added as audited operator readiness sync path.
- `npm run test:launch-budget-tracking-safety`: covers the sync script fail-closed requirements.

## Owner Manual Meta Checklist

Before any live activation, the owner should verify inside Meta Business Manager:

1. Resolve the Meta Ads Manager funds warning before expecting delivery.
2. Confirm billing, spend limits, account limits, and account restrictions are acceptable in Meta.
3. Confirm campaign, ad set, and ad remain paused until final activation.
4. Do not manually activate the campaign, ad set, or ad until final live-spend approval is explicit.

## Rollback Or Pause Procedure

If any risk appears before live activation:

1. In Meta Ads Manager, confirm campaign `120248208607670616`, ad set `120248208608400616`, and ad `120248208609740616` are still `PAUSED`.
2. If any delivery object is not paused, set it to `PAUSED` in Meta immediately.
3. Do not delete objects unless a separate cleanup decision is made; deletion can erase auditability.
4. In DealFlow, keep live activation blocked until domain/tracking readiness is proven.
5. Rerun `npm run operator:debt` after any recovery action.

## Decision

- Paused launch: GO / completed.
- Live spending: NO-GO until owner resolves the Meta funds warning and gives explicit live-spend activation approval.
- Domain and tracking readiness: GO / evidence-backed.
