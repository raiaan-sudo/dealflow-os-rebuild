# Production Readiness Closure - 2026-05-17

## Scope

This closure pass used only safe local checks, read-only production probes, and
intentionally invalid/unsigned POST probes. It did not mutate Meta delivery,
change budgets, create Stripe charges or checkout sessions, submit real leads,
send SMS/email, trigger paid providers, expose secrets, or create Freshdesk
tickets.

Code work was performed only in:

`/Users/raiaanreza/Documents/New project/dealflow-os-rebuild-clean-readiness`

The preserved dirty checkout was not used for code changes:

`/Users/raiaanreza/Documents/New project/dealflow-os-rebuild-dirty-preserve-20260516235529`

## Baseline

- Clean checkout branch: `codex/production-readiness-hardening-pr`
- Production baseline commit: `fddca545abfce1ec8a0ffd1cfc98728a3a34339a`
- Production baseline deploy: `dpl_Gq5ng8mTWuPJQ7pbiak6mYbWYikW`
- Integrated local hardening commit: `e68f66ecaf5a65db8f33679efc89c5519b6083d5`

`git fetch --prune origin` and `git fsck --no-reflogs` passed in the clean
checkout.

## Production Smoke

Read-only production probes verified:

- `app.agentdealflow.io` and `www.agentdealflow.io` serve deploy marker
  `dpl_Gq5ng8mTWuPJQ7pbiak6mYbWYikW`.
- `agentdealflow.io` redirects to `https://www.agentdealflow.io/`.
- `/`, `/login`, `/privacy`, `/terms`, `/data-deletion`, `/robots.txt`,
  `/sitemap.xml`, `/opengraph-image`, and
  `/f/raiaan-broker-toronto-on-ccbfbfce` returned `200`.
- `/f/raiaan-realty` returned `307` to
  `/f/raiaan-broker-toronto-on-ccbfbfce`.
- `/f/raiaan-broker-toronto-on-ccbfbfce/thank-you` returned `200`.
- Unauthenticated `/dashboard` returned `307` to
  `/login?reason=expired&redirectedFrom=%2Fdashboard`.
- Invalid `POST /api/lead-capture` returned `400 validation_error`.
- Invalid `POST /api/client-errors` returned `403 csrf_rejected`.
- Unsigned `POST /api/stripe/webhook` returned `400 stripe_missing_signature`.
- Unsigned `POST /api/webhooks/twilio/status` returned
  `401 twilio_signature_invalid`.
- Unauthenticated `POST /api/support/ticket` returned `401`.
- Unauthenticated `GET /api/internal/system-jobs` returned `401`.

## Code Hardening

Stripe subscription sync now fails closed when a subscription webhook has an
unknown Stripe price ID and no valid `plan_tier` metadata. Previously an
unrecognized price could fall through to Starter. The guard protects the legacy
`$97/mo` price from being treated as new-customer Starter access unless it is
explicitly configured or carried by valid metadata.

Safe local browser proof now starts with `SCHEMA_VALIDATION_MODE=warn` only in
the Playwright-safe dev server. The production/default documented mode remains
`block`.

## Pricing

Code/UI pricing source of truth:

- Starter: `$147/mo`
- Pro: `$297/mo`
- Growth: `$497/mo`

Read-only Stripe listing confirmed monthly recurring prices exist at `$147`,
`$297`, `$497`, and legacy `$97`. Vercel production env names include
`STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, and
`STRIPE_GROWTH_PRICE_ID`, but this CLI could not decrypt values from
`vercel env pull`, so the exact encrypted production value behind
`STRIPE_STARTER_PRICE_ID` remains owner/access proof, not a code defect.

## Fresh Account

True fresh-account production proof remains owner-only because signup can
require Turnstile and email confirmation. The safe public browser proof passed,
and the authenticated Playwright journey is intentionally skipped unless the QA
auth harness and Supabase env are explicitly configured.

Fresh-account owner handoff:

1. Open `https://app.agentdealflow.io/login?mode=sign-up&redirectedFrom=%2Fwelcome%3Ffresh%3D1`.
2. Sign up with `raiaan+dealflow-fresh-audit-20260517@gmail.com`.
3. Complete Turnstile and email confirmation legitimately.
4. Re-run the authenticated safe journey without submitting leads, sending SMS,
   creating Stripe charges, or launching Meta.

## Freshdesk

Support V1 remains app-ready and tested. Production env names do not include:

- `FRESHDESK_DOMAIN`
- `FRESHDESK_API_KEY`

No Freshdesk ticket was created. Live ticket proof is blocked until those
server-side envs exist.

## Meta And Operator Debt

Static Meta/app drift tests passed for the approved objects:

- Campaign `120248208607670616`
- Ad set `120248208608400616`
- Ad `120248208609740616`
- Daily budget `300`

Live Graph/DB-backed `operator:debt` could not run in this shell because the
Vercel production env pull produced empty Supabase/Meta values locally. The
production env names exist in Vercel, but a production-env-capable shell is
required to re-prove:

- `metaReadOnlyVerificationErrors: 0`
- `metaAppStatusDrift: 0`
- `staleMetaSyncSnapshots: 0`
- lead notification drift counts
- unresolved failed jobs, dead letters, provider events, and Stripe failures

## Validation Summary

Passed locally under Node `v20.20.2`:

- `npm run launch:validate`
- `npm run routes:security`
- `npm run smoke:offline`
- `npm run test:launch-budget-tracking-safety`
- `npm run test:support-freshdesk`
- `npm run test:internal-sms`
- `npm run test:lead-notification-status`
- `npm run test:meta-app-state-drift`
- `npm run test:stripe-price-guard`
- `npm run test:billing-recovery`
- `npm run test:subscription-lifecycle`
- `npm run test:direct-response-funnels`
- `npm run test:creative-media-readiness`
- `npm run test:video-generation-safety`
- `npm run test:provider-usage-idempotency`
- `npm run test:customer-success`
- `npm run test:client-error-telemetry`
- `npm run test:activation-telemetry`
- `npm run test:campaign-value-report`
- `npm run test:media-buyer`
- `npm run test:media-buying-upgrades`
- `npm run test:media-buyer-regression`
- `npm run test:static-ad-templates`
- `npm run test:static-creative-image-qa`
- `npm run test:static-creative-storage`
- `npm run test:higgsfield-provider-selection`
- `npm run test:marketing-studio-worker`
- `npm run test:creative-chat-intake`
- `npm run test:manual-creative-upload`
- `npm run test:provider-cost-watch`
- `npm run test:public-funnel-thank-you`
- `npm run test:e2e:safe` public proof passed; authenticated proof skipped by
  env gate
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm audit --omit=dev --audit-level=high`
- `git diff --check`

Blocked locally by unavailable decrypted env values:

- `npm run schema:check`
- `npm run operator:debt`
- `npm run rls:cross-tenant`
- `npm run rls:fixture-smoke`

## Launch Verdict

Codex-executable code, security, UI-safe, support-app, billing-guard, and
production-smoke work is closed for this pass after the integrated changes are
deployed.

Broader public self-serve launch remains **NO-GO for true 100%** until the owner
or a production-env-capable shell completes:

1. Fresh account signup/login proof after Turnstile/email confirmation.
2. Exact Vercel Stripe env value mapping to `$147/$297/$497` active prices.
3. Freshdesk env setup and exactly one QA ticket, if Freshdesk live support is
   required.
4. DB-backed `operator:debt`, `schema:check`, and RLS proof with non-empty
   Supabase/Meta env values.
