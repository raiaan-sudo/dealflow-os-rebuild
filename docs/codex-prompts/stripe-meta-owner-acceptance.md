# Stripe And Meta Owner Acceptance Prompt

## Goal

Verify owner-managed Stripe and Meta acceptance steps without creating charges or launching ads unless the owner explicitly authorizes a real acceptance action.

## Safety Rules

- Do not create Stripe charges.
- Do not create checkout sessions unless explicitly requested.
- Do not launch Meta ads.
- Do not create live Meta campaigns.
- Do not expose credentials, account IDs beyond what the UI already safely displays, or tokens.
- Do not classify owner-managed acceptance as an app technical blocker.

## Stripe Acceptance

- Verify displayed plan pricing: Starter `$147/mo`, Pro `$297/mo`.
- Verify checkout configuration only through safe UI/state checks unless owner requests a live test.
- Confirm billing gates and override behavior separately.

## Meta Acceptance

- Verify connection, ad account, Page, pixel, and domain acceptance state.
- Confirm launch payloads remain paused.
- Confirm missing owner selections are owner/manual gaps.

## Final Report Format

- Stripe acceptance state.
- Meta acceptance state.
- Technical blockers.
- Owner/manual gaps.
- GO/NO-GO for controlled beta and public self-serve.
