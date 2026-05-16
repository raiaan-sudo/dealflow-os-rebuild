# Campaign 345 Lead Notification Proof - 2026-05-16

## Scope

- Requested campaign: `345dcc04-8e87-4ead-b71a-40236e2ef52e`
- Public funnel alias tested: `https://app.agentdealflow.io/f/raiaan-realty`
- Canonical funnel tested: `https://app.agentdealflow.io/f/raiaan-broker-toronto-on-ccbfbfce`
- QA marker: `raiaan+dealflow-lead-qa-20260516234616@gmail.com`
- QA submit timestamp: `2026-05-16T23:46:17.134Z`
- Recipient phone reporting: redacted, last 4 `8062`

## Result

The controlled public-funnel submission was performed exactly once and redirected to the thank-you route:

- Final browser URL: `/f/raiaan-broker-toronto-on-ccbfbfce/thank-you?submitted=1`
- Lead saved: yes
- Lead assignment created: yes
- Expected internal SMS notification rows created: yes
- Twilio send accepted: no
- Failure handling: passed; the lead remained saved and both notification failures were captured in `lead_notifications`.

## Saved Lead Evidence

- Lead ID: `bb74c8a4-6476-4fca-80fb-d20659a1362b`
- Saved campaign ID: `ccbfbfce-5070-4621-8ca4-d074d732b964`
- Saved organization ID: `a848a680-9dd1-45e7-84d1-65bcc9a6292a`
- Source: `lead_capture_launched`
- Phone: redacted, last 4 `8062`

Important campaign mapping finding:

- Requested app campaign `345dcc04-8e87-4ead-b71a-40236e2ef52e` has public slug `raiaan-realty`, launch status `paused`, organization `8b82dea3-54da-4ccb-accc-81931513436c`.
- The public alias redirects to canonical slug `raiaan-broker-toronto-on-ccbfbfce`.
- The canonical funnel resolves and saves leads under campaign `ccbfbfce-5070-4621-8ca4-d074d732b964`, organization `a848a680-9dd1-45e7-84d1-65bcc9a6292a`.
- No second lead was submitted to force campaign `345`; this proof preserved the exactly-one-lead safety rule.

## Notification Evidence

Lead assignment:

- Assignment ID: `474e83f6-5087-4018-a4e1-34093da0ac67`
- Agent ID: `72a79cf6-a233-4147-8fc9-9acb50617497`
- Status: `assigned`

Notification rows:

- `a7c964ef-696c-405c-88d6-4c1ba006fc3d`
  - Purpose: `new_lead_alert`
  - Channel/provider: `sms` / `twilio`
  - Status: `failed`
  - Error summary: `Internal lead SMS notifications are disabled.`
- `8ace230a-d1ff-4d13-981d-77e54670a63d`
  - Purpose: `lead_reply_template`
  - Channel/provider: `sms` / `twilio`
  - Status: `failed`
  - Error summary: `Internal lead SMS notifications are disabled.`

Production Vercel contains encrypted env names for `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, and `INTERNAL_LEAD_SMS_ENABLED`, but the production worker path behaved as if `INTERNAL_LEAD_SMS_ENABLED` is not exactly `true`.

## Side-Effect Audit

- Meta: no Meta API writes were performed.
- Stripe: no charge or checkout/session was created.
- Providers: no creative/provider generation was triggered.
- Freshdesk: no ticket was created or configured.
- Customer-facing SMS/email: no customer-facing outbound SMS/email was triggered by this proof.
- Internal SMS loop: exactly two expected notification rows were created for the saved lead.
- Operator debt after submit: clean.

## UI Fix Found During Proof

The thank-you page was rendering saved machine follow-up action keys such as `show_thank_you_page_call_5_15_minutes` as public copy. The model now maps saved follow-up keys to customer-safe next-step language while preserving real custom copy and booking URLs.

## Cleanup / Rollback

Do not delete the QA lead unless explicitly requested. If cleanup is later approved, scope deletion to lead ID `bb74c8a4-6476-4fca-80fb-d20659a1362b` and related assignment/notification rows only.

To roll back the thank-you copy fix, revert the commit that updates `src/lib/public-funnel-thank-you.ts` and `scripts/smoke-test.mjs`.

## Remaining Blockers

1. Decide whether `raiaan-realty` should continue redirecting to canonical campaign `ccbfbfce-5070-4621-8ca4-d074d732b964`, or repair the public funnel mapping so campaign `345dcc04-8e87-4ead-b71a-40236e2ef52e` receives its own leads.
2. Set production `INTERNAL_LEAD_SMS_ENABLED` to exactly `true` if internal SMS lead alerts should send live.
3. After those two items are resolved, run one new explicitly approved QA lead proof. Do not reuse this proof as a successful Twilio-send proof.
