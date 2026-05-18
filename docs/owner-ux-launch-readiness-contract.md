# Owner UX Launch-Readiness Contract

This contract captures the launch-readiness rules for the owner onboarding, paywall, and pre-checkout preview flow.

## Offer handling

- User-entered offer text stays editable, but generated preview/copy must use the normalized offer from `normalizeOfferForCampaign`.
- The normalizer is deterministic and must not call paid AI or any external provider.
- Obvious messy inputs should become polished campaign language before they appear in previews, CTAs, static copy, UGC scripts, paywall context, or final review.
- Examples:
  - `Guaranteed approvl for 600 n up credit` -> `Guaranteed Approval for 600+ Credit`
  - `guarenteed sale in 90 day` -> `Guaranteed Sale in 90 Days`
  - `full furnish your entire first floor` -> `Furnish Your Entire First Floor`
- The offer must remain first in hierarchy. Supporting strategy, market, budget, and inventory copy can explain the offer, but must not replace it.

## Plan positioning

- Starter is positioned as recommended optimization: DealFlow recommends the steps, and the agent approves and applies them.
- Pro is positioned as fully covered and self-optimizing: DealFlow monitors, guides, and keeps the full launch path covered with richer checks.
- Starter and Pro public self-serve checkout start with a 7-day free trial. Customer-facing paywall copy must say `$147/mo after 7-day free trial` for Starter and `$297/mo after 7-day free trial` for Pro.
- Trialing is a Stripe subscription state, not a paid-active state. Settings and billing status surfaces must show trialing/free-trial copy while preserving the correct Starter or Pro entitlements.
- Onboarding and paywall must share plan copy from `src/lib/billing/plan-presentation.ts` so pricing and positioning do not drift.

## Layout rules

- Onboarding at 100% browser zoom should feel close to the approved 75-80% browser zoom screenshots: centered, premium, compact, and not wall-to-wall.
- Side-by-side panels must use `min-w-0`, constrained max widths, compact previews, and capped heights where needed.
- Campaign preview panels should not horizontally overflow, clip off-screen, or make a paired column much longer than the decision panel beside it.
- Mock ad previews need a stable aspect ratio and clamped copy so they fit inside their visual card.
- Secondary details should be summarized or constrained instead of making the page scroll through repeated technical cards.

## Safety

- Preview, onboarding, and paywall screens must not create real leads, send SMS/email, run Stripe charges, mutate Meta, or trigger paid OpenAI image/HeyGen generation.
- Provider-generation language should stay explicit: checkout unlocks access, but paid generation remains credit-gated and deliberate.
