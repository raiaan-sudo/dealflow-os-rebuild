# AgentDealFlow Homepage

The public root route renders a software-first landing page for `agentdealflow.io`.

## Route Boundaries

- `/` is the public homepage.
- `/login` redirects returning users to `https://app.agentdealflow.io/login`.
- Homepage signup/get-access CTAs route fresh users to `https://app.agentdealflow.io/onboarding`.
- `/dashboard` and app routes remain protected by the existing proxy and app layout.
- `/f/[slug]` remains the public customer funnel route.

## Homepage Rules

- Primary CTA is direct software access. Do not add book-a-call CTAs.
- Do not show public pricing on the homepage. Plan details and billing belong inside the authenticated software flow.
- Do not add testimonials, customer logos, guaranteed lead claims, ROI claims, or compliance claims until real proof exists.
- Founder/operator experience may be positioned as ex-agency operators who have managed over eight figures in ad spend, but only as team background, never as a customer outcome claim.
- AI positioning should stay concrete: custom-coded AI infrastructure supports campaign blueprinting, funnel assembly, creative direction, routing, launch checks, dashboard signal, and optimization logic with human oversight.
- Strong positioning line to preserve: built by ex-agency operators, not another lead vendor.
- Preserve the "not a passive KPI screen" framing when explaining the software depth.
- Active infrastructure scope should stay explicit: creative production, funnel assembly, lead capture, routing, dashboard visibility, optimization loops, and team oversight.
- Keep animations product-explanatory: command center, launch queue, rising chart, count-up metrics, and build progress.
- Preserve reduced-motion behavior for count-up and chart animations.

## Design Direction

- The first viewport is adapted from the Launch UI "Titanium" Figma reference: compact nav, centered badge, oversized gradient headline, paired CTAs, trust chips, and a framed product cockpit mockup rising from a soft glow.
- Treat Figma as visual direction, not source copy. Preserve DealFlow positioning, no-pricing policy, no fake proof, direct signup CTA, and SaaS route boundaries.
- Mobile first viewport should keep the primary signup CTA reachable at 320px width without horizontal overflow.
- Do not use scroll-driven overlapping panel transitions on the public homepage. If a transition harms readability or causes layered text/card overlap, replace it with a static, scannable section.

## Verification

Run:

```bash
npm run test:homepage
npm run lint
npm run typecheck
npm run build
```
