# Staging cron access-gate repair — 2026-07-24

## Demonstrated defect

The protected isolated-staging Vercel project invoked
`/api/internal/system-jobs` and `/api/internal/ghl-form-sweep` every minute.
Runtime evidence showed that both requests returned `404` from middleware.

The routes support `GET`, and their ordinary internal guard accepts the exact
configured Vercel Cron bearer secret. The request never reached that guard:
the outer isolated-staging access gate required DealFlow's private staging
header or cookie, neither of which Vercel Cron can attach.

This disabled every scheduled stage behind the shared runner, including
campaign launch, GHL provisioning and delivery, support delivery, account
deletion, reporting, optimization, and durable job recovery.

## Permanent correction

The outer staging gate now recognizes an exact `/api/internal/*` request only
when its existing internal-system bearer or key already matches a configured
strong internal secret. The normal internal-route branch validates the same
authorization again before forwarding the request.

Missing, weak, or incorrect credentials still receive the private staging
`404`. The change does not expose an internal route, weaken the production
boundary, authorize a provider effect, or add a new credential.

## Focused proof

- Correct Vercel-style bearer on an internal staging route reaches the ordinary
  internal authorization branch.
- Wrong bearer remains `404`.
- Missing internal secret remains `404`.
- Existing staging header/cookie, static asset, provider callback, GHL embed,
  private image, and production non-regression scenarios still pass.
- Route security, typecheck, lint, production build, complete staging broker
  contract, and final-verification-runner contract pass.

## External state

No production mutation, provider action, customer-data access, communication,
charge, advertising spend, or deployment was performed by this repair. Hosted
proof requires a new exact deployment after the corrected candidate is sealed.
