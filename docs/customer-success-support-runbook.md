# DealFlow OS Customer Success And Support Runbook

This is the minimum viable operating layer for launch. It prevents early self-serve customers from disappearing into support chaos without building a full internal business OS.

## Client-Facing Support V1

Authenticated customers now have one native `Support` button in the DealFlow app shell. It is not rendered on public funnels or unauthenticated marketing pages. The button opens a modal with a category dropdown, required message field, detected campaign context when available, loading/error/success states, and a returned Freshdesk ticket ID when ticket creation succeeds.

Support V1 creates Freshdesk tickets server-side only:

- Route: `POST /api/support/ticket`
- Freshdesk endpoint: `POST https://<FRESHDESK_DOMAIN>/api/v2/tickets`
- Auth: Basic auth with `FRESHDESK_API_KEY` as username and `X` as password
- Required env names: `FRESHDESK_DOMAIN`, `FRESHDESK_API_KEY`
- Optional env names: `FRESHDESK_PRODUCT_ID`, `FRESHDESK_GROUP_ID`

The Freshdesk key must never appear in browser code, browser responses, logs, support ticket descriptions, screenshots, docs, or final reports. If Freshdesk env is missing or Freshdesk returns an unsafe/provider failure, customers see: `Support is temporarily unavailable. Please try again shortly.`

Customer-facing categories:

- `contact_support`: Contact support
- `report_bug`: Report a bug
- `billing_help`: Billing help
- `campaign_not_working`: Campaign not working
- `meta_connection_issue`: Meta/Facebook connection issue
- `creative_generation_issue`: Creative generation issue
- `ai_ugc_video_issue`: AI UGC video issue
- `launch_issue`: Launch issue
- `lead_delivery_issue`: Lead delivery issue
- `login_account_issue`: Login/account issue
- `other`: Other

Ticket context includes only safe fields: category, submitted notes, user email/user ID, organization ID/name, authorized campaign ID/name/slug/status, plan tier, billing state, launch override metadata, current URL, route, browser user agent, client `data-dpl-id`, server deploy/commit identifiers when available, and timestamps.

Ticket context must never include cookies, tokens, auth headers, API keys, signed media URLs, provider URLs, raw image/video URLs, Stripe payment details, browser storage, sensitive logs, or unrelated tenant data. `src/lib/support/support-ticket.ts` redacts credential-like strings, signed URLs, provider/media URLs, and long token-like values before payload creation.

Safe QA procedure:

1. Run `npm run test:support-freshdesk`.
2. Run route/security and build validation.
3. Verify the Support button appears only after authentication.
4. Open the modal and confirm categories, required message validation, and campaign context.
5. Confirm browser JS/HTML/network responses do not contain `FRESHDESK_API_KEY` or secret values.
6. Create exactly one QA ticket only when Freshdesk production env is configured and the owner explicitly approves the QA ticket. Mark the subject/message as QA.

## Support Categories

Use these categories everywhere support feedback is triaged:

- `confusing_ux`: the customer does not understand where to click, what happened, or what to do next.
- `billing`: checkout, payment method, failed payment, plan access, Stripe Portal, or invoice questions.
- `onboarding`: market, audience, offer, campaign mode, agent profile, or form completion questions.
- `creative_quality`: copy, image/template, offer, UGC concept, or preview quality issues.
- `meta_connect`: Meta OAuth, ad account, Page, pixel, permissions, or launch preflight issues.
- `lead_funnel`: public funnel, lead form consent, lead routing, internal lead alert, or funnel status issues.
- `bug`: broken button, crash, unexpected error, broken layout, or data mismatch.
- `cancellation_refund`: cancellation, refund, dispute risk, pause request, or save conversation.

Do not paste secrets, provider tokens, cookies, payment data, raw lead contact data, or private customer notes into external tools or customer replies.

## SLA Expectations

- Billing, cancellation/refund, launch blockers, and Meta/connect issues: same business day.
- Public funnel, lead/funnel, lead alert, and customer-visible bug issues: same business day.
- Creative quality and onboarding clarification: within one business day.
- Confusing UX and non-blocking polish: within two business days.
- Security, privacy, cross-tenant, provider-token, or payment-data exposure reports: immediate owner escalation.

If a customer is inside the first 25 days, treat every support issue as retention-sensitive.

## Canned Response Outlines

Use these as outlines, not rigid scripts.

### Confusing UX

1. Acknowledge the exact step that was confusing.
2. Give the next click or action in one sentence.
3. Ask for a screenshot only if the issue cannot be identified from the route or logs.
4. File the feedback as `confusing_ux` and note the route.

### Billing

1. Confirm Stripe is the billing source of truth.
2. Send the customer to Settings -> Stripe Portal for payment method, invoice, or cancellation actions.
3. Do not ask for card details.
4. If access looks wrong, check `billing_subscriptions`, Stripe webhook events, and `/admin/issues`.

### Onboarding

1. Identify the missing or weak input.
2. Give one concrete example answer the customer can adapt.
3. Confirm their campaign mode: buyer, seller, investor, or commercial.
4. Recheck preview quality after the input is corrected.

### Creative Quality

1. Identify whether the problem is offer, audience, visual, copy, CTA, or layout.
2. Confirm the intended market and campaign mode.
3. Use deterministic template fixes before paid provider generation.
4. Escalate paid AI/UGC proof only after owner approval and spend gates are confirmed.

### Meta/Connect

1. Confirm whether Meta is connected, assets are selected, and preflight passes.
2. Ask the customer to verify they have admin permissions on the ad account, Page, and pixel.
3. Do not request or accept Meta tokens manually.
4. Escalate repeated OAuth/preflight failures to engineering with route, request time, and non-secret error code.

### Lead/Funnel

1. Confirm the funnel URL, publish state, and subscription state.
2. Confirm phone consent copy is visible when phone capture is enabled.
3. Check lead loop verification and internal alert status.
4. Do not submit real customer leads for testing; use only approved QA flows.

### Cancellation/Refund

1. Keep the cancellation path simple and direct through Stripe Portal.
2. Ask the optional reason once; do not block cancellation if they skip.
3. Confirm what access remains until period end.
4. Escalate refund/dispute risk to the owner with plan, billing status, cancellation reason, and support history.

## Escalation Rules

Escalate immediately to engineering or owner when any of these are true:

- Possible cross-tenant data exposure.
- Secret, token, cookie, JWT, payment, or private provider credential exposure.
- Live Stripe charge, refund, or subscription state mismatch.
- Meta campaign/object mutation happened unexpectedly.
- Public funnel accepts leads when subscription should be suspended.
- SMS/email was sent unexpectedly.
- Customer cannot reach checkout, dashboard preview, Meta connect, or launch readiness.
- Day 25 renewal-risk review is due and the account has unresolved billing, support, or value-proof gaps.

## First 25-Day Customer-Success Checklist

The command center watchlist tracks these per campaign:

- Onboarding review.
- Creative QA.
- Preview reviewed.
- Billing active.
- Meta connected.
- Assets selected.
- Launch readiness.
- Lead loop verified.
- Day 7 check-in due.
- Day 14 value proof due.
- Day 25 renewal-risk review due.

Operating cadence:

1. Day 0: confirm onboarding, preview, billing, Meta connection, and launch-readiness blockers.
2. Day 1: verify the customer knows the next action and has no stuck support ticket.
3. Day 7: check in with campaign/funnel status, assets selected, lead loop status, and next action.
4. Day 14: show value proof: campaign status, assets built, funnel stats, lead status, and recommendations.
5. Day 25: review renewal risk: billing health, cancellation feedback, unresolved support issues, campaign status, and next-month action plan.

## Operator Workflow

1. Open `/admin/command-center`.
2. Review the Customer-success watchlist.
3. Open `/admin/issues` for `customer_success`, `billing_recovery`, `activation`, and `value_report` issues.
4. Prioritize blocked launch readiness, payment issues, and overdue first-25-day follow-ups.
5. Use this runbook for the response category and escalation path.
6. Record manual completion timestamps in `customer_success_checklists` only after the operator action is actually completed.

## 100-Client Operating Rhythm

Use this rhythm every business day once public self-serve traffic is open:

1. Morning: review `/admin/issues` for `customer_success`, `activation`, `billing_recovery`, `value_report`, and `provider_cost`; assign an owner to every high-severity item.
2. Midday: clear stuck onboarding and preview-quality issues before touching polish work.
3. Afternoon: verify launch-readiness, Meta selection, billing health, and lead-loop status for accounts inside their first 7 days.
4. End of day: update day 7, day 14, and day 25 checklist items only when the customer-success action actually happened.
5. Weekly: review campaign value reports for every active account and create a renewal-risk note for accounts with no lead-loop proof, unresolved support issues, or payment friction.

The checklist is not complete because a row exists. It is complete only when the operator has reviewed the account, taken the action, and left enough internal context for the next operator to understand the status.

## Out Of Scope

This launch layer intentionally does not build:

- EOD reports.
- Rep KPI dashboards.
- Commission systems.
- Full ticketing.
- Automated email/SMS customer success sequences.
- A complete internal business OS.

Those systems can be added later once the launch support loop shows which operational signals actually matter.
