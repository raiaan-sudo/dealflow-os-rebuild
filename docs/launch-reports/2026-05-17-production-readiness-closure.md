# Production Readiness Closure - 2026-05-17

## Scope

This pass closed the remaining Codex-safe readiness blockers without mutating
Meta delivery, changing budgets, creating Stripe charges, submitting leads,
sending SMS/email, triggering providers, or creating Freshdesk tickets.

## Git Checkout Repair

The original checkout at `/Users/raiaanreza/Documents/New project/dealflow-os-rebuild`
reported object corruption:

- `git fetch --prune origin`: failed with unresolved deltas.
- `git fsck --no-reflogs`: failed with missing tree/blob/commit links.

A clean sibling clone was created at
`/Users/raiaanreza/Documents/New project/dealflow-os-rebuild-clean-readiness`.
The clean clone verified successfully:

- `git fetch --prune origin`
- `git fsck --no-reflogs`
- `git status --short --branch`
- HEAD `958b496695abdbf2cedee6faadcf4793cb9aacc5`

The two unrelated dirty files from the corrupt checkout were preserved under a
timestamped backup folder and were not overwritten:

- `docs/production-100-client-runbook.md`
- `scripts/smoke-test-system.md`

## Meta/App State Reconciliation

Read-only Meta proof showed the exact owner-approved objects are active:

- Campaign `120248208607670616`: `ACTIVE`
- Ad set `120248208608400616`: `ACTIVE`
- Ad `120248208609740616`: `ACTIVE`
- Daily budget: `300`
- Creative destination: `https://app.agentdealflow.io/f/raiaan-realty`

The app row for campaign `345dcc04-8e87-4ead-b71a-40236e2ef52e` still reported
paused before reconciliation. The new reconciliation script dry-ran first, then
updated only app-owned runtime/sync state for campaign 345:

- `campaign_plans.launch_status`: `paused` -> `live`
- `plan.runtime.status`: `paused` -> `live`
- `plan.runtime.safetyState`: `paused` -> `live`
- `plan.runtime.metaPushStatus`: `paused` -> `published`
- `plan.launch_runtime.status`: `paused` -> `live`
- `plan.launch_runtime.step_status`: `paused` -> `active`
- Inserted sync snapshot: `0c421ad3-6c5b-4e24-84bf-a731058a3fcc`

No Meta write endpoint was called.

## Operator Debt Coverage

`npm run operator:debt` now includes campaign 345 Meta/app drift checks:

- `metaReadOnlyVerificationErrors`
- `metaAppStatusDrift`
- `staleMetaSyncSnapshots`

After reconciliation all three values were `0`.

## Stripe Price Mapping

Code/UI source of truth remains:

- Starter: `$147/mo`
- Pro: `$297/mo`
- Growth: `$497/mo`

A static guard was added to prevent new app code from regressing to the legacy
`$97/mo` Starter price.

Stripe account read-only listing still shows an active recurring legacy
`$97/mo` Starter price object. Vercel production env names are present, but
`vercel env pull --environment=production` returned empty quoted values for
Stripe env entries in this environment, so exact production env-to-price-ID
mapping could not be proven from CLI without exposing or receiving env values.

Owner action: confirm in Vercel that `STRIPE_STARTER_PRICE_ID` points to the
active `$147/mo` Starter price, not the legacy `$97/mo` price.

## Turnstile / Trusted Types

Production browser reproduction showed Trusted Types, inline-script CSP, and
`401` console noise coming from Cloudflare Turnstile challenge frame URLs, not
from DealFlow-owned scripts. The app root CSP does not include a Trusted Types
directive, and the pages remained visible without layout overflow.

Classification: third-party Turnstile challenge-frame console noise, not a
confirmed DealFlow security misconfiguration. Fresh-account proof is still
blocked until a human legitimately completes Turnstile and any email
confirmation.

## Fresh Account Handoff

Use a brand-new customer-path email such as:

`raiaan+dealflow-fresh-audit-20260517@gmail.com`

Owner should complete:

1. Open `https://app.agentdealflow.io/login?mode=sign-up&redirectedFrom=%2Fwelcome%3Ffresh%3D1`.
2. Create the account with the fresh audit email.
3. Complete Turnstile legitimately.
4. Confirm email if Supabase requires confirmation.
5. Tell Codex when the fresh account can log in.

Codex should then verify onboarding, plan gating, paywall copy, dashboard,
builder, preview, launch gate, settings, and support modal from that fresh
customer path without submitting leads or creating charges.

## Freshdesk

Freshdesk ticket creation remains blocked until server-side production env has:

- `FRESHDESK_DOMAIN`
- `FRESHDESK_API_KEY`

No Freshdesk ticket was created in this pass.
