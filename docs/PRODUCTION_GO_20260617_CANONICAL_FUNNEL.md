# DealFlow Canonical Funnel Production Release Record

Date: 2026-06-17

## Verdict

FULL GO for the current safe customer-facing production scope with the canonical funnel enabled.

This verdict applies to the funnel source-of-truth rebuild and the public/customer-facing canonical funnel path. It does not claim that historical creative/ad assets saved before this release have been rewritten. One protected draft campaign still shows old copy inside selected creative test-set cards; that is outside the canonical funnel renderer and is listed below.

## Release Lineage

- Branch: `codex/operator-shell-reconcile-20260617`
- Commit: `c49de3169322cbc8a233dcca1b6407bb06a7a016`
- Production deploy: `dpl_2AbyARXKTQkij6HpsdtuFpqRzHAB`
- App alias: `https://app.agentdealflow.io`
- Previous FULL GO deploy before funnel rebuild: `dpl_5XGTh4HQetZgBgFDo1GNGfCA67nR`

## Root Cause

The old funnel appeared because DealFlow had more than one funnel rendering path and because some existing campaigns had stale saved funnel snapshots/copy:

- Public funnel rendering used its own route renderer.
- Internal review/preview surfaces used separate preview components.
- Onboarding final review used a separate mock preview path.
- Existing campaign data could contain old default copy such as `View homes that actually match your criteria` and `Get List`.

The fix was to centralize runtime rendering behind a canonical funnel resolver and shared renderer.

## Canonical Architecture

Primary files:

- `src/lib/funnels/canonical-funnel.ts`
- `src/components/funnels/canonical-funnel-renderer.tsx`
- `src/components/funnel/funnel-preview.tsx`
- `src/app/f/[slug]/page.tsx`
- `src/components/onboarding/prepaywall-campaign-preview.tsx`
- `src/lib/funnels/winning-template/build-winning-funnel.ts`
- `src/lib/funnels/winning-template/language.ts`
- `src/lib/funnels/winning-template/variants.ts`

Behavior:

- Existing saved funnels are rendered through the canonical winning template unless explicitly marked legacy.
- Public `/f/[slug]` resolves the campaign record through `buildCanonicalFunnelFromRecord`.
- Internal review/preview uses `FunnelPreview`, which resolves through `buildCanonicalFunnelFromPlan`.
- Onboarding final review uses `CanonicalFunnelRenderer` through the pre-paywall preview surface.
- The canonical renderer owns hero, lead capture placement, proof, process, FAQ/expectations, CTA, and footer layout.

## Routes Wired And Verified

- `/f/raiaan-broker-toronto-on-ccbfbfce`: PASS, public canonical funnel rendered.
- `/clicktoscale`: PASS, redirects to `/p/click-to-scale/start`.
- `/p/click-to-scale/start`: PASS, route loads. This is a partner auth/start route, not a funnel renderer.
- `/preview?campaignId=acbe135e-4eff-464f-9387-0a4e98c5bc43`: PASS for protected canonical preview shell through existing admin Chrome session.
- Review step: PASS by source wiring through `src/components/campaign/campaign-preview-review.tsx` -> `FunnelPreview` -> `CanonicalFunnelRenderer`.
- Onboarding final review: PASS by source wiring through `src/components/onboarding/prepaywall-campaign-preview.tsx` -> `CanonicalFunnelRenderer`.
- Launch readiness preview: PASS by source/static checks for launch stale snapshot guard and publish consistency. No live launch or Meta mutation was performed.

## Existing Campaign Proof

Campaign checked:

- `acbe135e-4eff-464f-9387-0a4e98c5bc43`

Read-only DB/source proof:

- Campaign exists.
- Publish state: `draft`.
- Public slug: `null`.
- Raw saved funnel/default campaign data contains legacy default copy.
- Funnel is not explicitly marked legacy.
- Canonical resolver output:
  - Template id: `real_estate_lead_quiz_v1`
  - Template locked: `true`
  - CTA: `Get My List`
  - Canonical output contains no legacy default copy.

Authenticated Chrome proof:

- `/preview?campaignId=acbe135e-4eff-464f-9387-0a4e98c5bc43` loaded in existing admin session.
- Preview page showed `Canonical funnel preview`.
- Preview page included `canonical funnel / Toronto, ON`.
- Mobile public funnel proof had no horizontal overflow.

Important caveat:

- The protected preview page still showed old copy in the selected creative test-set cards for this historical draft campaign:
  - `View homes that actually match your criteria`
  - `Get List`
- Those strings were visible runtime content from saved creative/ad assets, not from the canonical funnel renderer. Cleaning historical creative assets is a separate migration/content-remediation task and was intentionally out of scope for this funnel renderer release.

## Old Funnel Removal Proof

Production public funnel checked:

- `https://app.agentdealflow.io/f/raiaan-broker-toronto-on-ccbfbfce`

Confirmed present:

- `Get your free custom home list in Toronto, ON.`
- `Get My List`
- `Personalized plan`
- `Clear next steps`
- `Local market guidance`
- `Meet your advisor`

Confirmed absent from public funnel runtime HTML:

- `View homes that actually match your criteria`
- `Quick capture`
- `100% free`
- `No obligation`
- `Local real estate advisor`
- `Get List`
- duplicate `in Toronto, ON in Toronto, ON`
- duplicate `Verified local client Client review`

Repository scan result:

- Old default copy remains only inside regression-test deny-lists and stale-data fixtures.
- `FunnelPreviewMock` remains as an internal function name in onboarding preview, but its body renders `CanonicalFunnelRenderer`; it is not the old one-screen preview card layout.

## Browser And Artifact Evidence

Screenshots:

- Desktop public funnel: `/tmp/dealflow-canonical-funnel-desktop.png`
- Mobile public funnel: `/tmp/dealflow-canonical-funnel-mobile.png`
- Admin partners proof: `/tmp/dealflow-admin-partners-release-record.png`
- Protected preview proof: `/tmp/dealflow-preview-acbe135e-release-record.png`

Browser proof:

- Desktop public funnel: HTTP 200, canonical headline visible, CTA visible, no legacy text, no horizontal overflow, no failed app-owned requests.
- Mobile public funnel: HTTP 200, canonical headline visible, CTA visible, no legacy text, no horizontal overflow, no failed app-owned requests.
- Console noise observed during public funnel proof came from Cloudflare Turnstile iframe (`challenges.cloudflare.com`), not app-owned code.

## FULL GO Scope Regression

Confirmed:

- `https://app.agentdealflow.io` points to `dpl_2AbyARXKTQkij6HpsdtuFpqRzHAB`.
- `/dashboard` unauthenticated request redirects to `/login?reason=expired&redirectedFrom=%2Fdashboard`.
- `/admin/partners` unauthenticated request redirects to login.
- `/preview?campaignId=...` unauthenticated request redirects to login.
- `/api/campaigns/acbe135e-4eff-464f-9387-0a4e98c5bc43` unauthenticated request returns `401`.
- `/api/integrations/meta/status` unauthenticated request returns `401`.
- `/api/internal/qa-auth-session` without bearer returns `401`.
- `/api/internal/stripe-test-proof` without bearer returns `401`.
- `/api/admin/click-to-scale/ghl-lead-sync-proof` without auth returns `401`.
- Existing admin Chrome session showed:
  - Partners tab visible.
  - Workspace switcher visible.
  - Lisa Zhao Group workspace visible.
  - Admin shell visible.
  - No horizontal overflow.

Not proven in this pass:

- Normal-user browser session behavior, because no non-admin Chrome session was available and QA auth was not enabled.

## GHL / Stripe / Meta / Provider Safety

Explicit scope exclusions:

- No live GHL writes.
- No CRM sync wiring.
- No live Meta ad mutation.
- No provider spend.
- No real Stripe charge.

Safety proof:

- `safeSyncLeadToPartnerCrm` and `syncLeadToPartnerCrm` are not imported by app lead-capture or lead-side-effect runtime code.
- GHL proof routes remain authenticated/admin-only and same-origin guarded.
- Internal QA auth and Stripe proof harness routes require internal authorization and explicit env gates.
- Production env names for GHL provisioning flags exist, but values were not printed. Live behavior was verified through route fail-closed checks and source wiring rather than secret inspection.

## Commands Run

Validation suite:

```bash
source /Users/raiaanreza/.nvm/nvm.sh && nvm use 20.20.2
node -v
npm run typecheck
npm run build
npm run routes:security
npm run smoke:offline
npm run test:creative-chat-intake
npm run test:winning-funnel-template
npm run test:winning-funnel-migration
npm run test:funnel-public-render
npm run test:no-legacy-funnel-imports
git diff --check
```

All commands passed.

Production probes:

```bash
curl -sS https://app.agentdealflow.io/
curl -sS https://app.agentdealflow.io/f/raiaan-broker-toronto-on-ccbfbfce
curl -sS -D - https://app.agentdealflow.io/clicktoscale
curl -sS -L https://app.agentdealflow.io/clicktoscale
curl -sS https://app.agentdealflow.io/p/click-to-scale/start
curl -sS -D - https://app.agentdealflow.io/dashboard
curl -sS -D - https://app.agentdealflow.io/admin/partners
curl -sS -D - 'https://app.agentdealflow.io/preview?campaignId=acbe135e-4eff-464f-9387-0a4e98c5bc43'
curl -sS -D - https://app.agentdealflow.io/api/internal/qa-auth-session
curl -sS -D - https://app.agentdealflow.io/api/internal/stripe-test-proof
curl -sS -D - https://app.agentdealflow.io/api/admin/click-to-scale/ghl-lead-sync-proof
curl -sS -D - https://app.agentdealflow.io/api/integrations/meta/status
curl -sS -D - https://app.agentdealflow.io/api/campaigns/acbe135e-4eff-464f-9387-0a4e98c5bc43
```

## Rollback Note

If rollback is needed, the previous known FULL GO deploy before this funnel rebuild was:

- `dpl_5XGTh4HQetZgBgFDo1GNGfCA67nR`

Rollback should only be used if the canonical funnel creates a production blocker; otherwise the current deploy is the intended customer-facing release.
