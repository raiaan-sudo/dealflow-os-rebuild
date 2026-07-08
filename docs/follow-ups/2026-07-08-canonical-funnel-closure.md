# Canonical Funnel Closure Follow-Ups - 2026-07-08

These items are non-blocking. The canonical public funnel production issue remains closed.

## Add approved production-safe browser form test phone for DealFlow lead-capture QA

The canonical funnel production issue is closed. Remaining browser-form telemetry proof requires an approved internal production-safe phone number. Do not use customer numbers or invented numbers.

Acceptance criteria:

- Approved internal test phone exists.
- Browser form submission is performed on a safe QA-approved production funnel.
- `lead_form_viewed` recorded.
- `lead_form_started` recorded.
- `lead_form_submit_attempted` recorded.
- `lead_capture_client_success` recorded.
- `/api/lead-capture` success.
- Lead appears in DB.
- Lead is dashboard-visible.
- Attribution preserved.
- CAPI/Twilio sent or explicit failure reason captured.
- No PII leaks into client-error telemetry.

## Add test-lead tagging/exclusion for production QA submissions

Production QA lead exists from canonical funnel release proof. It should remain auditable but should not pollute customer-facing reporting.

Known QA lead:

`23b516e0-5375-46fb-b58f-7fa1bf5c2ce3`

Acceptance criteria:

- Schema-safe way to mark/test-tag QA leads.
- Customer-facing reporting can exclude QA leads.
- Internal audit can still find QA leads.
- No real leads are hidden.
- No production data is deleted.
