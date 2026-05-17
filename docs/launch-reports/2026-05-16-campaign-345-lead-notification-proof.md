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

## Follow-Up Proof After SMS Enablement - 2026-05-17

### Scope

- Owner-approved additional QA lead count: exactly one.
- Submitted QA marker: `raiaan+dealflow-lead-qa-20260516224507@gmail.com`
- Browser submit result: redirected to `/f/raiaan-broker-toronto-on-ccbfbfce/thank-you?submitted=1`.
- Lead phone: intentionally omitted from the public form during this proof to avoid exposing the configured owner/test phone through browser automation logs. The internal SMS proof uses the configured agent notification recipient, redacted last 4 `8062`.
- No additional lead submissions were attempted after the successful thank-you redirect.

### SMS Enablement Result

- Production `INTERNAL_LEAD_SMS_ENABLED` was updated to exactly `true`.
- Production env pull verification reported `INTERNAL_LEAD_SMS_ENABLED_exact_true=true` with value length `4`.
- Twilio env names remained present in production. Secret values were not printed.

### Campaign Mapping Decision

Classification: intentional split.

`/f/raiaan-realty` is the public ad/funnel alias, but the application route redirects it to canonical slug `/f/raiaan-broker-toronto-on-ccbfbfce` before campaign lookup. Lead capture therefore saves leads under canonical campaign `ccbfbfce-5070-4621-8ca4-d074d732b964`, organization `a848a680-9dd1-45e7-84d1-65bcc9a6292a`.

Campaign `345dcc04-8e87-4ead-b71a-40236e2ef52e` remains the historical/intended Meta planning campaign with restored paused launch runtime state, but it is not the mechanical public lead-capture campaign for the current `raiaan-realty` redirect flow.

### Saved Lead Evidence

- Lead ID: `4d13bc58-4339-47a7-a8b4-4dcc2b91da04`
- Created at: `2026-05-17T02:45:24.144+00:00`
- Saved campaign ID: `ccbfbfce-5070-4621-8ca4-d074d732b964`
- Saved organization/tenant ID: `a848a680-9dd1-45e7-84d1-65bcc9a6292a`
- Saved user ID: `14c0efb4-8006-4924-814e-3cd353eb3341`
- Source: `lead_capture_launched`
- Landing page URL: `https://app.agentdealflow.io/f/raiaan-broker-toronto-on-ccbfbfce`
- Duplicate count for this QA marker: `1`

### Assignment Evidence

- Assignment ID: `3da4af5e-5a86-433b-bfb0-194e19c2a586`
- Agent ID: `72a79cf6-a233-4147-8fc9-9acb50617497`
- Status: `assigned`
- Agent profile: active, SMS notifications enabled, recipient phone redacted last 4 `8062`.

### Internal SMS Notification Evidence

Two expected internal SMS rows were created:

- `c9e456b6-5f2c-4ab4-8f00-602ab326559e`
  - Purpose: `new_lead_alert`
  - Channel/provider: `sms` / `twilio`
  - Provider message SID: present, redacted `SM...87de`
  - `sent_at`: `2026-05-17T02:45:47.905+00:00`
  - `delivered_at`: `2026-05-17T02:45:48.928+00:00`
  - Error: none
- `a89d8cab-7d08-4269-bef6-380eec056082`
  - Purpose: `lead_reply_template`
  - Channel/provider: `sms` / `twilio`
  - Provider message SID: present, redacted `SM...bb77`
  - `sent_at`: `2026-05-17T02:45:48.108+00:00`
  - `delivered_at`: `2026-05-17T02:45:49.051+00:00`
  - Error: none

The previous blocker string `Internal lead SMS notifications are disabled.` did not appear on either new notification row.

Operational note: both rows still showed `status: queued` even though `provider_message_id`, `sent_at`, and `delivered_at` were populated. This is not a delivery blocker, but the status column should be normalized in a follow-up so reporting does not understate delivered notifications.

### Operator Debt And Side-Effect Audit

- `npm run operator:debt`: clean after submit.
- System jobs runner probe: `200`, no pending cycles to process after Vercel post-submit side effects.
- System jobs rows for the new lead: none; side effects completed through the production post-submit path.
- Invalid lead capture safe probe after proof: `400`, body code `validation_error`.
- Meta: no Meta API writes were performed.
- Stripe: no charge, checkout, or session was created.
- Providers: no creative/provider generation was triggered.
- Freshdesk: no ticket was created or configured.
- Customer-facing SMS/email: none intentionally triggered; the form was submitted email-only and SMS consent remained unchecked.
- Internal SMS loop: exactly two expected internal notification rows were created for the saved lead.

### Production Route Proof

- `https://app.agentdealflow.io/`: `200`, deploy marker `dpl_7KFe93Ck81Aizs4BKcmyL81jjdkS`
- `https://www.agentdealflow.io/`: `200`, deploy marker `dpl_7KFe93Ck81Aizs4BKcmyL81jjdkS`
- `https://agentdealflow.io/`: `307` to `https://www.agentdealflow.io/`
- `https://app.agentdealflow.io/f/raiaan-realty`: `307` to canonical slug
- `https://app.agentdealflow.io/f/raiaan-broker-toronto-on-ccbfbfce`: `200`

### Remaining Follow-Up

1. Normalize `lead_notifications.status` when Twilio callbacks or send timestamps prove delivery; the new QA rows have delivered timestamps but still report `queued`.
2. Direct Twilio REST status fetch could not be completed locally because the CLI env pull did not reveal sensitive Twilio values. Production callback evidence and DB delivery timestamps are present.
3. Keep the QA lead unless a scoped cleanup is explicitly requested. If cleanup is approved later, scope it to lead ID `4d13bc58-4339-47a7-a8b4-4dcc2b91da04` and related assignment/notification rows only.
