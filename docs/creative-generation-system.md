# Creative Generation System

## Customer preview contract

Creative selection must always show a complete visual creative. Customers should never see a mostly blank gradient, raw provider state, rejected-image language, or a missing-background message as the primary experience.

When generated imagery is not available yet, failed, or withheld by quality checks, DealFlow renders an instant composed preview. That preview uses the same app-rendered headline, proof chips, CTA, category-specific layout, and media-buyer pattern that final generated imagery uses. Generated imagery may refresh in the background, but the customer can still inspect and choose the creative set immediately.

## Generated imagery contract

Generated static imagery is treated as a background asset only. It must not contain baked-in ad copy, fake captions, unreadable text, CTA buttons, or complete poster layouts. DealFlow owns the final copy, CTA, proof chips, and layout in deterministic UI code.

If a generated image fails the text-free background contract or the quality gate, it can be stored for review but must not be treated as launch-ready. Launch and selection gates must keep using the static visual QA decision before saving or launching selected creatives.

## Video review contract

AI UGC video concepts must be visible before render, selectable as a set, and playable when a video URL exists. Customer UI must not expose provider names, provider payloads, credentials, guard internals, or raw failure messages. Failed or unavailable video renders should present a retry-ready customer message.

## Regression checks

`npm run smoke:offline` must cover:

- instant composed previews exist when generated imagery is unavailable;
- generated background rejection copy stays customer-safe;
- carousel cards remain readable enough to inspect;
- full creative and full video review affordances exist;
- provider and internal generation jargon stays out of customer-facing creative selection.
