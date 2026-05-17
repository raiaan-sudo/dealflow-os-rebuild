# Direct-Response Funnel Variant Engine

This document describes the DealFlow funnel V1 source-of-truth contract for generated public funnels. It is documentation and QA guidance only; the implementation lives in `src/lib/services/funnel-engine.ts`, public rendering lives in `src/app/f/[slug]/page.tsx`, and customer preview rendering lives in `src/components/funnel/funnel-preview.tsx`.

## Scope

- Variant engine: deterministic direct-response section structure for buyer, seller, investor, commercial, luxury, and pre-con campaigns.
- Public route: `/f/[slug]` renders the latest published funnel snapshot and captures leads through `LeadCaptureForm`.
- Launch safety: Meta launch must use the current published snapshot and fail closed if the campaign plan and public snapshot drift.

This V1 does not deploy, mutate production data, launch Meta, create Stripe sessions, send SMS/email, create provider jobs, or touch leads during QA.

## V1 10 Funnel Variants

The required direct-response funnel variants are:

1. Seller CMA / Home Value: address-first local valuation request with human-reviewed CMA positioning and no guaranteed value.
2. Seller Net Sheet / Equity Check: net proceeds and timeline planning with no guaranteed proceeds.
3. Buyer Homes Under Price: price-threshold list request with budget, area, and timeline matching, and no availability guarantee.
4. First-Time Buyer Plan: step-by-step buyer plan with optional financing/timeline qualifiers and no approval guarantee.
5. Relocation Starter Kit: moving-from, target-market, and timeline request with neutral neighborhood language.
6. Downsizing Guide: guide-style planning offer with empathetic copy and no protected-class targeting claims.
7. New Construction Incentive List: plans, prices, and incentive request that requires local builder verification.
8. Investor Deal Access: buy-box, budget, market, and strategy request with no return or ROI guarantee.
9. Open House / Showing Request: property or area-specific showing request with preferred time and contact fields.
10. Appointment Strategy Call: consultation-first next step for buyer or seller context.

## Required Conversion Module Order

Every enabled variant must generate these modules in order:

1. Hero / offer
2. Trust bar
3. Proof metrics
4. Market snapshot
5. How it works
6. Benefits
7. Objections / risk reversal
8. FAQ
9. Capture form
10. Closing CTA

Optional media modules, such as VSL and image proof blocks, may exist as hidden editor-ready sections. They do not replace the ten required direct-response modules.

## Form Modes

- `minimal`: full name plus one contact method. Use for strategy-call style offers where the next step is low-friction.
- `standard`: full name, phone, email, and one core qualifying field. Use for most buyer lists, guides, and starter kits.
- `highIntent`: standard fields plus offer-specific qualifiers such as address, budget, timeline, buy box, or moving-from. Use when the offer is strong enough to justify the extra questions.

The public form keeps consent language when phone, SMS, or email contact is collected. Buyer variants must not imply guaranteed property availability. Seller variants must not imply guaranteed sale price, value, or proceeds. Investor variants must not imply guaranteed returns. Relocation and downsizing variants must avoid steering or protected-class language.

## Choosing A Variant

- Use seller CMA when the ad hook is about value, pricing, or whether to sell.
- Use seller net sheet when the ad hook is about equity, proceeds, or timing.
- Use buyer homes under price when the ad hook contains a budget ceiling such as `$750,000`.
- Use first-time buyer plan when the prospect needs a guided process before touring.
- Use relocation, downsizing, new-construction, investor, showing, or appointment variants only when the ad hook names that offer clearly enough for page message match.

## Conversion Layout Contract

- The first viewport must support the promise, CTA, and lead capture path.
- Public funnels keep the lead form in the desktop hero area with a two-column layout and sticky lead-capture positioning.
- Internal previews keep a form-above-fold support panel labeled `Quick capture` so operators can verify the offer and form together.
- Mobile layouts may stack, but the CTA and form must remain reachable without burying conversion below every proof section.

## Required Content Modules

- Proof: use `proof_metrics` to show concrete, non-misleading reasons to trust the offer before commitment.
- How it works: use `process` to explain the mechanism in short steps.
- FAQ: use `faq` to answer the objections prospects ask before converting.
- Compliance: keep the public lead form consent copy, privacy link, terms link, and SMS consent requirements intact. Funnel copy must not promise guaranteed outcomes, financing, returns, or legal/regulated results unless separately approved.

## Snapshot Contract

The launch route must use the published public funnel snapshot as the source sent to traffic. If the current campaign plan and published snapshot disagree on headline, subheadline, or CTA, the route must fail closed with `published_funnel_snapshot_stale` before Meta preflight or object creation.
