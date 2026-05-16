# Launch-State Cleanup Report - 2026-05-16

## Verdict

Codex-only launch-readiness cleanup was completed without touching Meta activation, billing, leads, SMS/email, provider generation, destructive database actions, or Freshdesk configuration.

Live paid launch remains **NO-GO** until the owner resolves the Meta funds warning and explicitly approves live-spend activation.

## Changes

- Authenticated app shell copy no longer labels the workspace as live while Meta delivery is paused.
- Launch controls now describe paused Meta object setup/recovery instead of implying immediate live delivery.
- Campaign plan selection normalization now recognizes selected static creative and UGC video IDs from root, nested saved-document, snake-case, and camel-case sources.
- Campaign save persistence now carries selected static creative and UGC video IDs forward when rebuilding the saved campaign document.
- Regression coverage was added for nested/camel-case selected creative persistence and sidebar paused-state wording.

## Freshdesk Boundary

Freshdesk live ticket creation was intentionally not configured or exercised. Support V1 still requires:

- `FRESHDESK_DOMAIN`
- `FRESHDESK_API_KEY`

Optional:

- `FRESHDESK_PRODUCT_ID`
- `FRESHDESK_GROUP_ID`

The customer-facing missing-env fallback remains: `Support is temporarily unavailable. Please try again shortly.`

## Owner-Only Blockers

1. Resolve the Meta Ads Manager funds warning.
2. Give explicit live-spend activation approval.
3. Add Freshdesk env later only if live ticket creation is needed.

## Safety Notes

This pass did not activate Meta ads, create Meta objects, call `/api/campaigns/[id]/launch`, create Stripe charges, submit real leads, send SMS/email, trigger paid/provider generation, expose secrets, or perform destructive database actions.
