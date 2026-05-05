# AgentDealFlow Homepage

The public root route renders a software-first landing page for `agentdealflow.io`.

## Route Boundaries

- `/` is the public homepage.
- `/login` remains the auth route.
- `/login?mode=sign-up` opens the create-account tab for homepage CTAs.
- `/dashboard` and app routes remain protected by the existing proxy and app layout.
- `/f/[slug]` remains the public customer funnel route.

## Homepage Rules

- Primary CTA is direct software access. Do not add book-a-call CTAs.
- Pricing comes from `BILLING_PLANS` in `src/lib/billing/plans.ts`.
- Do not add testimonials, customer logos, guaranteed lead claims, ROI claims, or compliance claims until real proof exists.
- Founder/operator experience may be positioned as ex-agency operators who have managed over eight figures in ad spend, but only as team background, never as a customer outcome claim.
- AI positioning should stay concrete: custom-coded AI infrastructure supports campaign blueprinting, funnel assembly, creative direction, routing, launch checks, dashboard signal, and optimization logic with human oversight.
- Strong positioning line to preserve: built by ex-agency operators, not another lead vendor.
- Preserve the "not a passive KPI screen" framing when explaining the software depth.
- Active infrastructure scope should stay explicit: creative production, funnel assembly, lead capture, routing, dashboard visibility, optimization loops, and team oversight.
- Keep animations product-explanatory: command center, launch queue, rising chart, count-up metrics, and build progress.
- Preserve reduced-motion behavior for count-up and chart animations.

## Verification

Run:

```bash
npm run test:homepage
npm run lint
npm run typecheck
npm run build
```
