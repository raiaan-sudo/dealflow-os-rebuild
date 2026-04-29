# DealFlow OS Observability And Alerting Runbook

This runbook separates durable operator issue sources from log-only signals so launch support does not treat estimates as live telemetry.

## Durable Issue Coverage

The internal issue radar reads durable database state through `/admin/command-center` and `/admin/issues`.

- `system_jobs`: failed jobs, dead-lettered jobs, stale processing locks, `attempt_count`, `max_attempts`, `last_error_code`, `dead_lettered_at`, and `dead_letter_reason`.
- `stripe_webhook_events`: failed Stripe events, signature-verification failures, processing failures, replay idempotency, and stale subscription event handling.
- `provider_usage_events`: failed provider calls and provider reservations older than 30 minutes.
- `campaign_plans`: row/plan consistency drift and missing critical launch fields.
- `leads`: saved lead evidence, dedupe state, consent metadata, opt-out state, and `lead_loop_verified` confirmation through the launch monitor.
- `lead_messages`: inbound Twilio `MessageSid` idempotency and STOP/START/HELP handling.

If an issue is not backed by one of these records, label it as operator proof, manual observation, or log-only until a durable row exists.

## Log-Only Operator Events

Structured logs are useful for correlation, but they are not the source of truth for support decisions unless matched to durable rows.

- `system_job.queued`, `system_job.running`, `system_job.succeeded`, `system_job.failed`, `system_job.retrying`
- `lead_capture.succeeded`, `lead_capture.spam_rejected`
- `rate_limit.blocked`
- `sms.webhook_signature_rejected`, `sms.inbound_processed`
- `stripe_webhook_duplicate_ignored`, `stripe_webhook_processed`
- `checkout_session_stale`, `checkout_success_reconciled`
- `campaign_plan_consistency_mismatch`, `campaign_plan_consistency_correction`, `campaign_plan_critical_field_changed`
- `provider_usage_reserve_failed`, `provider_usage_limit_reached`, `provider_usage_guard_unavailable`
- `product_feedback_received`

Enable production info-level structured logs only when needed:

```bash
ENABLE_STRUCTURED_INFO_LOGS=true
```

Error logs still emit without this flag.

## Alert Hooks

Create provider alerts against the durable sources first, then use logs for context.

- Critical: any `system_jobs.dead_lettered_at is not null`.
- Critical: any `stripe_webhook_events.error_code = signature_verification_failed`.
- High: `system_jobs.status = failed` grouped by `last_error_code`.
- High: `system_jobs.status = processing` with expired `locked_until`.
- High: `stripe_webhook_events.status = failed` within the last 24 hours.
- High: `provider_usage_events.status = failed`.
- Medium: `provider_usage_events.status = reserved` for more than 30 minutes.
- Medium: campaign plan consistency mismatch or missing critical fields.
- Medium: repeated `rate_limit.blocked` or `lead_capture.spam_rejected` logs for the same IP/contact in a short window.

Recommended destinations:

- Vercel Log Drains for structured app logs.
- Supabase SQL scheduled checks or dashboard alerts for durable table conditions.
- Stripe Dashboard webhook alerting for delivery failures.
- Meta app dashboard alerts for callback/OAuth failures.

## Command Center Truthfulness

Command center values must be labeled by source:

- `live DB`: direct counts from durable records.
- `manual proof`: operator-recorded evidence that should be rechecked before a launch window.
- `operator score`: readiness score derived from a checklist or proof run, not a service-level objective.
- `estimated`: projection or scale assumption that is not current telemetry.
- `blocked`: intentionally disabled by compliance or owner-only settings.

Never describe estimated scale readiness, prior proof, or manual browser checks as live automated monitoring.

## Support Escalation

For customer-impacting issues, collect this packet before escalation:

- Workspace, campaign ID, user email, and public funnel slug if relevant.
- Issue radar row reference from `/admin/issues`.
- Durable row IDs for jobs, webhooks, provider usage, leads, or campaign plans.
- UTC timestamps and the most recent structured log event names.
- Whether the customer experienced billing, launch, lead capture, SMS, or generation impact.
- Whether any provider action could create charges, Meta objects, or outbound SMS.

Escalate to owner approval before:

- Retrying a launch when any Meta object is not `PAUSED`.
- Raising campaign budget above the controlled beta cap.
- Enabling outbound SMS automation.
- Replaying payment events manually outside the provider dashboard.
- Retrying paid generation without a matching provider usage record and budget guard.

## Legal And Compliance Hooks

- Public legal pages must remain available at `/privacy` and `/terms`.
- SMS automation stays blocked until `TWILIO_OUTBOUND_SMS_ENABLED=true`, `SMS_COMPLIANCE_ACK=true`, credentials are set, and per-lead SMS consent exists.
- STOP/START/HELP processing must stay active even when outbound automation is disabled.
- Support responses must avoid promising Meta approval, delivery volume, exact lead volume, or guaranteed ROI.
- Treat exported issue logs as internal diagnostics. Do not include secrets, provider tokens, raw payment payloads, or private customer notes in external support messages.

## Owner-Only Settings Still Required

These settings need account owner access and are not controlled by code:

- Supabase Auth signup policy, email confirmation, CAPTCHA/Turnstile, auth rate limits, and approved redirect URLs.
- Vercel Firewall/WAF rules and log-drain destinations.
- Stripe webhook endpoint health alerts and production webhook signing secret rotation.
- Meta app alerting, OAuth review status, and Ads account spending controls.
- Twilio messaging service compliance review, inbound number ownership, and opt-out audit settings.
- External incident destination setup such as Slack, PagerDuty, or email routing.
