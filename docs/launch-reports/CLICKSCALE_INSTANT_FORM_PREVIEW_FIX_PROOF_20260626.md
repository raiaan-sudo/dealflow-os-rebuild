# ClickToScale Instant Form Preview Fix Proof - 2026-06-26

## Summary

Verified the affected ClickToScale preview campaign no longer renders the wrong funnel preview state after the canonical lead capture mode persistence fix and production repair.

## Production Deploy

- Deploy: `dpl_EZAM74Xus4vvqoaAdXt6k5YV8PNi`
- Commit: `36c763f7baea732ca13dce9710b94037806f3c71`
- Campaign: `73c4c225-b999-468d-93d5-21fb6a78a28c`
- Host verified: `https://clicktoscale.io`

## Browser Proof

Route opened in Chrome:

`https://clicktoscale.io/preview?campaignId=73c4c225-b999-468d-93d5-21fb6a78a28c`

Verified visible UI:

- `Selected funnel`: absent
- `Canonical funnel preview`: absent
- `Meta Instant Form preview`: present
- `META INSTANT FORM SETUP`: present
- `Facebook and Instagram`: present
- `3 creatives selected`: present

Screenshot:

`docs/launch-reports/clicktoscale-instant-form-preview-proof-20260626/clicktoscale-instant-form-preview-fixed.png`

Final deploy screenshot:

`docs/launch-reports/clicktoscale-instant-form-preview-proof-20260626/clicktoscale-instant-form-preview-final-deploy.png`

## DB Repair Verification

Post-repair dry-run:

- scanned activation events: `402`
- candidate campaigns: `10`
- affected campaigns: `0`
- mutation count: `0`

Safety flags:

- dry-run mutates: `false`
- apply requires confirmation: `true`
- touches campaign_plans only: `true`
- touches Meta: `false`
- touches GHL: `false`
- touches Stripe: `false`
- queues jobs: `false`

## Final Result

The reported instant-form campaign no longer falls back to the public funnel preview UI. The preview now renders the native Meta Instant Form destination state.
