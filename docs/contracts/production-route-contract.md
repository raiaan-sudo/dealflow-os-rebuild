# DealFlow Production Route Contract

This contract defines the canonical production behavior for the DealFlow,
ClickToScale, and AgentDealFlow web surfaces. It exists to prevent old app
versions, legacy builder routes, or broad restore commits from silently
reappearing in production.

## Canonical Product State

- The current campaign build experience is `/onboarding`.
- `/builder` is a legacy compatibility route only. It must never render a page.
- Public customer funnels stay on `/f/[slug]` and remain public.
- ClickToScale app domains allow only the explicitly enumerated realtor journey
  inside GoHighLevel iframes, and only from exact configured HTTPS frame origins.
- Marketing homepage behavior is allowed only on explicitly marketing-owned
  domains.

## Domain Contract

| Domain | Root Behavior | App Routes | Public Funnels | Iframe Policy |
| --- | --- | --- | --- | --- |
| `clicktoscale.io` | `307` to `/onboarding` | Protected app | Public `/f/[slug]` allowed | GHL allowed |
| `www.clicktoscale.io` | `307` to `/onboarding` | Protected app | Public `/f/[slug]` allowed | GHL allowed |
| `clip2scale.io` | `307` to `/onboarding` | Protected app | Public `/f/[slug]` allowed | GHL allowed |
| `www.clip2scale.io` | `307` to `/onboarding` | Protected app | Public `/f/[slug]` allowed | GHL allowed |
| `agentdealflow.io` | `307` to `/onboarding` | Protected app | Public `/f/[slug]` allowed | Denied unless configured |
| `app.agentdealflow.io` | `307` to `/onboarding` | Protected app | Public `/f/[slug]` allowed | Denied unless configured |
| `www.agentdealflow.io` | Marketing homepage | Marketing-owned only | Public `/f/[slug]` allowed if routed | Denied unless configured |

## Route Contract

| Route | Auth State | Expected Behavior | Forbidden Behavior |
| --- | --- | --- | --- |
| `/` on app domains | Any | Redirect to `/onboarding` | Render marketing homepage |
| `/onboarding` | Logged out | Redirect to login | Render stale builder |
| `/onboarding` | Signed in | Render canonical onboarding | Render legacy builder |
| `/builder` | Any | Redirect/protect toward `/onboarding` | Render legacy builder |
| `/build/funnel` | Signed in with campaign | Review generated funnel artifacts | Render legacy builder editor |
| `/build/creatives` | Signed in with campaign | Select generated creatives | Render legacy builder editor |
| `/preview` | Signed in with campaign | Review final campaign package | Link back to `/builder` |
| `/paywall` | Signed in | Offer only the canonical Pro plan | Offer Starter or Growth acquisition |
| `/launch` | Signed in with campaign | Run launch readiness and scheduling | Bypass billing, tenant, or provider gates |
| `/results` | Signed in | Show the authenticated results surface | Render a cross-tenant campaign |
| `/settings` | Signed in | Show billing and credit truth | Permit unfenced top-ups |
| `/support` | Signed in | Record a durable tenant-scoped support ticket | Send an unauthenticated notification |
| `/dashboard` | Signed in | Show results/workspace state | Link back to `/builder` |
| `/f/[slug]` | Public | Render public lead funnel | Require auth or Turnstile |
| `/ui-direction` | Production | Hidden unless `UI_DIRECTION_PREVIEW=1` | Public product substitute |

## Legacy Builder Removal Contract

The following production legacy surfaces must not exist:

- `src/components/campaign/campaign-builder-workspace.tsx`
- `src/components/campaign/builder/*`
- `src/app/api/builder/command/route.ts`
- `src/app/api/builder/copy-assistant/route.ts`
- `src/app/api/builder/section-assistant/route.ts`

The following legacy markers must not appear in production source:

- `CampaignBuilderWorkspace`
- `Guided setup stays on by default`
- `/api/builder/command`
- `/api/builder/copy-assistant`
- `/api/builder/section-assistant`

## GoHighLevel Embed Contract

The only embeddable paths are `/onboarding`, `/campaign-built`, `/paywall`,
`/build/funnel`, `/build/creatives`, `/preview`, `/launch`, `/launching`,
`/launch-success`, `/unlock`, `/results`, `/dashboard`, `/settings`, and
`/support`. This set covers every route in the realtor build-to-results
journey. Their exact embedded `/login` continuations are allowed only on
ClickToScale app hosts. Every other route, including all admin routes, retains
`frame-ancestors 'none'` and `X-Frame-Options: DENY`.

Embedding does not grant access. Supabase authentication, workspace membership,
RLS, RPC tenant checks, and ordinary route authorization remain mandatory.
`GHL_IFRAME_ALLOWED_FRAME_ANCESTORS` must contain exact HTTPS origins; shared
GoHighLevel/LeadConnector origins, wildcards, paths, credentials, HTTP origins,
and empty configuration are rejected.

`Campaign Setup` can appear only as ordinary step naming in the current
onboarding flow. It must not appear inside a standalone legacy builder route.

## Release Gate

Every PR that touches app routes, middleware, layout navigation, public funnels,
campaign build surfaces, or deployment config must pass:

- `npm run test:production-route-contract`
- `npm run smoke:offline`
- `npm run routes:security`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

For production deployment or rollback, also run:

- `npm run test:production-route-contract -- --live`

## Rollback Rule

Vercel rollback is not a generic recovery action. Roll back only to a deployment
whose commit, route contract, and authenticated visual proof are known-good.
After any rollback, rerun the live route contract immediately.
