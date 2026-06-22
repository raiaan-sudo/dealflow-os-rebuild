# DealFlow Controlled Rollout Prep

Last updated: 2026-05-25

This runbook is for the first controlled users after the production audit. It does not authorize live Meta launch, real Stripe charges, SMS/email sends, provider generation, funnel publish, or destructive data changes during QA proof.

## Production State

- Product app: `https://app.agentdealflow.io`
- Current deploy: `dpl_6bUhpWb4FDsgvRXyzPjYf9CU2iQ2`
- Rollback target: `dpl_C2f3qszZwegcymJceNRNn79ieHXk`
- Expected branch: `codex/300-client-control-room`

## Rollback

Do not run rollback unless production is actually broken or the owner explicitly requests it.

```bash
cd "/Users/raiaanreza/Documents/New project/dealflow-os-rebuild-300client-clean"
source ~/.nvm/nvm.sh
nvm use 20.20.2
npx vercel rollback dpl_C2f3qszZwegcymJceNRNn79ieHXk --yes
npx vercel inspect app.agentdealflow.io
```

If the CLI rejects the deploy ID, promote `dpl_C2f3qszZwegcymJceNRNn79ieHXk` from the Vercel dashboard, then rerun `npx vercel inspect app.agentdealflow.io` and the safe production smoke probes.

## First 3-5 User Checklist

Run this for every controlled first user. Prefer known/internal agents, watch live or collect a screen recording, and check logs after each session.

- Signup succeeds.
- Login succeeds.
- Onboarding starts.
- Onboarding completes.
- Campaign is created.
- Buyer/seller campaign type matches the user's intent.
- UGC script can be approved only when it matches campaign intent.
- Creative readiness state is truthful.
- Preview loads and matches saved campaign state.
- Launch page gates are truthful.
- Billing/trial visibility is clear.
- Meta connection state is clear.
- Support fallback is available.
- Error logs are checked.
- Operator debt and scale report are checked after the session.

## Issue Intake SOP

Collect only operational troubleshooting data. Never ask customers for passwords, tokens, cookies, private account data, or browser session data.

- Customer email.
- Campaign ID.
- Screenshot or screen recording.
- Route/path.
- Timestamp and timezone.
- What they clicked immediately before the issue.
- Current deploy ID.
- Browser and device.
- Whether the issue blocks signup, onboarding, script approval, creative readiness, preview, launch gates, billing, or support.

## Support Fallback

Freshdesk is optional for the first controlled users unless the owner decides live ticket creation is required. If `FRESHDESK_DOMAIN` and `FRESHDESK_API_KEY` are missing, support stays in customer-safe fallback mode.

Manual fallback destinations for first-user issues:

- Owner phone.
- Slack.
- Owner email.
- Internal issue sheet.

If Freshdesk becomes required before broader rollout, configure only the required env names, do not print values, deploy if required, and submit exactly one authenticated QA support ticket.

## Controlled Rollout Sequence

1. Launch to 3-5 controlled users.
   - Known/internal agents only.
   - Watch live or require screen recording.
   - Check logs after each user.
   - Do not rely only on dashboards.

2. Expand to 10-20 users.
   - Only after first group has no P0 or P1 issues.
   - Track hesitation, drop-off, support messages, and campaign completion.

3. Open to setters/outbound.
   - Only after onboarding, UGC, creative readiness, billing, preview, and launch gates stay stable.

## Stop Conditions

Pause rollout immediately if any of these happen:

- Signup or login breaks.
- Onboarding cannot complete.
- Buyer/seller script intent mismatches.
- Creative readiness shows fake green state.
- Preview and Launch disagree.
- Billing/trial copy is misleading.
- Meta launch gate allows unsafe progress.
- Any real send, charge, publish, provider generation, or live Meta launch happens unexpectedly.

## Product Flow Polish Checks

Before moving from 3-5 users to 10-20 users, verify:

- Buyer vs seller selection is clear.
- Market, offer, CTA, and campaign goal are explicit.
- The post-onboarding next step is clear.
- Blocked states name the missing item, for example:
  - `Saved creative set missing`
  - `Select at least four launch-ready ads`
  - `Meta connection required before launch`
- Preview shows the same selected package Launch will use.
- Launch never reads stale or different creative state.

## Technical Hardening Queue

These are not first-user blockers, but they should be queued and tracked.

- Replace the timed-out safe E2E harness with a reliable authenticated journey command.
- Add authenticated E2E coverage for buyer journey, seller journey, UGC script approval, preview, launch gates, and billing visibility.
- Keep regression tests for buyer campaigns rejecting seller offers like home value reports and seller net sheets.
- Keep regression tests for seller campaigns rejecting buyer offers like early access listings and `View Homes`.
- Keep regression tests that scripts include hook, offer, mechanism, and CTA.
- Keep regression tests that Higgsfield finished ads render as final rasters.
- Keep regression tests that app-composed assets and background-only images cannot pass final readiness.
- Keep regression tests that root `plan.staticAds` wins over stale nested creative payload.
- Keep regression tests that fresh storage paths are used when image bytes change.
- Keep regression tests that UGC scripts match campaign type.
- Monitor CDN/stale-image risk: new generated final assets should use fresh storage paths.
- Resolve `src/lib/services/autonomy-execution-service 2.ts` later by keeping/renaming, deleting, or archiving it. Do not leave the mystery file untriaged long term.
