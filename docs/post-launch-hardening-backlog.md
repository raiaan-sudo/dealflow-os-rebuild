# Post-Launch Hardening Backlog

This backlog is not a launch blocker by default. Promote items to blockers only when evidence shows they affect launch safety, payment integrity, customer trust, or data security.

## Security And Browser Policy

- Migrate CSP away from `unsafe-inline`.
  - Inventory inline scripts/styles required by Next/Vercel.
  - Add nonce/hash strategy.
  - Roll out in report-only mode first.
  - Promote to enforce after monitoring is clean.

## Media Access

- Build a private or signed media preview proxy for customer creative assets.
  - Keep app-owned `creative-assets` as source of truth.
  - Avoid exposing provider original URLs.
  - Preserve no-download UX while documenting browser-level limitations.

## Asset Hygiene

- Design a legacy failed asset cleanup strategy.
  - Identify rejected, failed, duplicate, and orphaned creative assets.
  - Never delete launch-ready assets without owner approval.
  - Prefer quarantine/archive state before deletion.

## Provider Monitoring

- Add provider usage and error monitors.
- Alert on failed/stale provider reservations.
- Track Higgsfield CLI readiness drift.
- Track fallback usage rate so fallback does not silently become primary.

## Billing And Meta Runbooks

- Maintain Stripe production runbook for webhook failures, checkout acceptance, portal access, and subscription state drift.
- Maintain Meta production runbook for account/Page/pixel/domain acceptance, paused launch payloads, and retry recovery.

## Operator Debt Monitor

- Run `npm run operator:debt` weekly and after deployments.
- Investigate any failed provider events, dead letters, unresolved failed jobs, Stripe failures, or stale reservations.

## GitHub Issue And PR Agent Workflow

- Convert recurring production findings into GitHub issues.
- Use focused branches and PR templates.
- Require validation evidence and owner/manual gap separation in PR summaries.

## Future Tooling Evaluation

- Evaluate OctoAlly, Ruflo, and Symphony later for workflow orchestration.
- Do not add them to the launch-critical path without a clear operational win.

## Support And Cancellation Polish

- Improve support handoff copy.
- Validate cancellation and billing portal UX with owner-approved Stripe-safe tests.
- Keep billing source of truth in Stripe.

## Funnel Copy Polish

- Continue market-specific copy tuning after launch.
- Preserve accepted funnel URL behavior.
- Avoid treating copy polish as a technical launch blocker unless conversion-critical or compliance-risky.
- Maintain `docs/outbound-copy-os/` as the durable source for cold call, SMS,
  voicemail, objection, offer, scoring, media-buyer feedback, and field-results
  copy improvements.
- Run `npm run copy:validate` after updating outbound copy workflows or prompt
  templates.
