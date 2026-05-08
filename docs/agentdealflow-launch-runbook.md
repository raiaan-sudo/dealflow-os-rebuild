# AgentDealFlow Launch Runbook

This runbook is the operator checklist for the public DealFlow OS homepage at
`https://www.agentdealflow.io`.

## Scope

- `/` serves the public homepage.
- `/login` redirects returning users to `https://app.agentdealflow.io/login`.
- Homepage signup/get-access CTAs route fresh users to `https://app.agentdealflow.io/onboarding`.
- `/dashboard`, `/builder`, `/preview`, `/launch`, `/settings`, `/paywall`, and admin routes stay protected.
- Homepage CTAs route into software access. There is no book-call path.
- Pricing mirrors `BILLING_PLANS` from `src/lib/billing/plans.ts`.

## Local Proof Commands

Run from `/Users/raiaanreza/Documents/dealflow-os-homepage` with Node 20:

```bash
npm run typecheck
npm run lint
npm run test:homepage
npm run build
npm run smoke:offline
npm run routes:security
npm run rls:cross-tenant
npm run rls:fixture-smoke
npm audit --audit-level=moderate
npm audit --omit=dev --audit-level=moderate
```

## Expected Production Smoke

Use safe checks only. Do not submit real leads, send SMS/email, create Stripe
sessions or charges, launch Meta ads, or run production mutations.

| Check | Expected |
| --- | --- |
| `GET /` | `200`, public homepage copy, no `/login` redirect |
| `GET /login` | redirect to `https://app.agentdealflow.io/login` |
| public signup CTA | navigates to `https://app.agentdealflow.io/onboarding` |
| `GET /dashboard` | redirect to `/login` |
| `GET /privacy` | `200` |
| `GET /terms` | `200` |
| `GET /data-deletion` | `200` |
| invalid `POST /api/lead-capture` | `400`, `validation_error` |
| unsigned `POST /api/webhooks/twilio/status` | `401`, `twilio_signature_invalid` |
| unsigned `POST /api/stripe/webhook` | `400`, `stripe_missing_signature` |

## Alias Drift Guard

Before launch announcements, verify the live root HTML includes the intended
`data-dpl-id` and that `GET /` does not redirect to `/login`.

```bash
node -e "fetch('https://www.agentdealflow.io/', { redirect: 'manual' }).then(async r => console.log(r.status, r.headers.get('location'), (await r.text()).match(/data-dpl-id=\"([^\"]+)/)?.[1]))"
```

## Browser QA

Check:

- Desktop `1440x1100`.
- Mobile `320x740`, `375x812`, `390x844`, and `430x932`.
- Reduced motion at one mobile breakpoint.
- No horizontal overflow.
- Hero, operator section, pricing, FAQ, footer, and CTAs remain readable.
- Console has no runtime errors.
- Signup CTAs point to `https://app.agentdealflow.io/onboarding`.

## Analytics

Vercel Analytics is loaded from the root layout. Homepage tracking is intentionally
PII-free:

- `homepage_scroll_depth` for 25, 50, 75, and 90 percent scroll milestones.
- `homepage_cta_click` for primary homepage CTAs.
- `homepage_pricing_cta_click` for pricing plan CTAs.
- `homepage_signin_click` for the header sign-in link.

## Rollback

If production drifts or a new deploy breaks the public homepage:

1. Identify the last known-good deployment with `vercel ls` or the Vercel dashboard.
2. Promote the known-good deployment back to production.
3. Re-run the production smoke checks above.
4. Confirm `/` returns `200` and the intended homepage copy.

## Owner Review

Owner/legal review is still required for:

- Final visual taste.
- Pricing/package strategy.
- Legal substance in privacy, terms, and data deletion pages.
- Real testimonials, logos, and case studies before adding proof sections.
