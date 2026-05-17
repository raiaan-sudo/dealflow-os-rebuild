# Direct-Response Funnel Variant Engine

This document describes the DealFlow funnel V1 source-of-truth contract for generated public funnels. It is documentation and QA guidance only; the implementation lives in `src/lib/services/funnel-engine.ts`, public rendering lives in `src/app/f/[slug]/page.tsx`, and customer preview rendering lives in `src/components/funnel/funnel-preview.tsx`.

## Scope

- Variant engine: deterministic direct-response section structure for buyer, seller, investor, commercial, luxury, and pre-con campaigns.
- Public route: `/f/[slug]` renders the latest published funnel snapshot and captures leads through `LeadCaptureForm`.
- Launch safety: Meta launch must use the current published snapshot and fail closed if the campaign plan and public snapshot drift.

This V1 does not deploy, mutate production data, launch Meta, create Stripe sessions, send SMS/email, create provider jobs, or touch leads during QA.

## V1 10 Variant List

The required direct-response funnel variant list is:

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
