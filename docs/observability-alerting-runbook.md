# DealFlow OS Observability And Alerting Runbook

This runbook separates durable operator issue sources from log-only signals so launch support does not treat estimates as live telemetry.

## Durable Issue Coverage

The internal issue radar reads durable database state through `/admin/command-center` and `/admin/issues`.

- `system_jobs`: failed jobs, dead-lettered jobs, stale processing locks, `attempt_count`, `max_attempts`, `last_error_code`, `dead_lettered_at`, and `dead_letter_reason`.
- `stripe_webhook_events`: failed Stripe events, signature-verification failures, processing failures, replay idempotency, and stale subscription event handling.
- `provider_usage_events`: failed provider calls and provider reservations older than 30 minutes.
- `provider_usage_limits`, `provider_usage_events`, and `user_credits`: provider quota pressure, daily paid-generation cost warnings, and customer generation-credit balances below the `$20.00` minimum top-up, surfaced as `provider_cost`.
- `client_error_events`: first-party browser errors, unhandled promise rejections, and route error-boundary failures captured through `/api/client-errors` after server-side scrubbing.
- `campaign_plans`: row/plan consistency drift and missing critical launch fields.
- `campaign_action_suggestions` and `campaign_draft_actions`: Pro Autopilot recommendation, staged-action, applied-action, dismissed-action, and blocked-action state. Treat these rows as app-owned operational evidence; they are not proof that provider, SMS, Stripe, or Meta side effects ran.
- `billing_subscriptions` plus `billing_cancellation_intents`: payment-issue accounts, subscriptions scheduled to cancel, suspended-after-period workspaces, and local cancellation reason capture before Stripe Portal handoff.
- `customer_success_checklists`: first-25-day onboarding, creative QA, billing, Meta, launch-readiness, lead-loop, and renewal-risk follow-up state.
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
- High: `billing_subscriptions.status in (past_due, incomplete, unpaid)` or suspended billing state in `/admin/issues`.
- High: customer-success checklist risk level `blocked` or `at_risk` in `/admin/issues`.
- High: `provider_usage_events.status = failed`.
- High: `provider_cost` issue where daily quota is exhausted, daily provider cost is at least 2x the configured warning threshold, or the customer generation-credit balance is `$0.00`.
- High: repeated `client_error` issue on a launch-critical route such as `/login`, `/onboarding`, `/paywall`, `/dashboard`, `/settings`, `/preview`, or `/launch`.
- High: Pro Autopilot route or job evidence shows an attempted side effect while the route is still recommendation-only, while billing is inactive, while same-origin/auth/tenant checks fail, or while `ALLOW_META_LIVE_LAUNCH`/provider/SMS gates remain disabled.
- Medium: `billing_subscriptions.cancel_at_period_end = true` before period end; review captured cancellation intent and save-risk notes.
- Medium: overdue day 7, day 14, or day 25 customer-success follow-up.
- Medium: `provider_usage_events.status = reserved` for more than 30 minutes.
- Medium: `provider_cost` issue where daily quota is above 80%, daily provider cost is above `OPERATOR_PROVIDER_DAILY_COST_WARNING_CENTS`, or customer generation-credit balance is below the `$20.00` minimum top-up.
- Medium: any unreviewed `client_error` issue in `/admin/issues`.
- Medium: campaign plan consistency mismatch or missing critical fields.
- Medium: Pro Autopilot produces blocked actions without dashboard and `/admin/control-room` surfacing.
- Medium: repeated `rate_limit.blocked` or `lead_capture.spam_rejected` logs for the same IP/contact in a short window.

Creative Studio render-state alerts should distinguish active jobs from evidence. Pending or processing Marketing Studio rows without `reviewed_at` or `dead_lettered_at` are active queue state; reviewed, dead-lettered, or superseded rows are historical evidence. A customer-visible stale `Queued for render worker` state when worker dry-run has no eligible jobs is a product defect and should be fixed in the render-state mapping, not cleared by deleting evidence rows.

Recommended destinations:

- Vercel Log Drains for structured app logs.
- Axiom is the preferred DealFlow OS Vercel log-drain destination unless an existing centralized logging provider is already in use.
- Supabase SQL scheduled checks or dashboard alerts for durable table conditions.
- Stripe Dashboard webhook alerting for delivery failures.
- Meta app dashboard alerts for callback/OAuth failures.

## Vercel Log Drain Baseline

Production is not at full self-serve posture until the Vercel project has an external log drain for `www.agentdealflow.io`.

Current setup:

- Provider: Axiom.
- Dataset: `axiom-audit`.
- Dataset retention: 30 days.
- Vercel drain: `drn_sGlKLXygAF7I4AJC`.
- Vercel project: `prj_3FUgh87aRdp4sNDrYzOEsXDyQERm`.
- Drain endpoint: `https://api.axiom.co/v1/datasets/axiom-audit/ingest`.
- Token: Axiom API token `dealflow-vercel-log-drain`; do not store it in the repo or print it in logs.

Active drain scope:

1. One Vercel drain is scoped to the production project with:
   - project: `dealflow-os-rebuild`
   - domain to probe: `www.agentdealflow.io`
   - schemas: logs
   - encoding: JSON
2. Trigger safe production probes only:
   - `GET /`
   - `GET /login`
   - `GET /f/<published-slug>`
   - invalid `POST /api/lead-capture` expecting `400`
   - unsigned `POST /api/webhooks/twilio/status` expecting `401`
3. Confirm logs arrive in Axiom and are searchable by deployment, host, route, status, and structured event name.

Current safe production probe contract as of 2026-05-07:

- Active app production deployment for `app.agentdealflow.io`: verify with `vercel inspect https://app.agentdealflow.io` at the start of each probe run.
- Public marketing host `www.agentdealflow.io` is a separate public-site deployment; app and provider probes should target `app.agentdealflow.io`.
- `GET /`: `200` public homepage for the current public-homepage production deployment.
- `GET /login`: `200`.
- `GET /onboarding`: unauthenticated redirect to login with `redirectedFrom=%2Fonboarding`.
- `GET /f/codex-fresh-realty-austin-tx-029b02a7`: `200` when the QA funnel remains published.
- invalid `POST /api/client-errors`: rejected by the same-origin/auth guard.
- invalid `POST /api/lead-capture`: `400 validation_error`.
- unsigned `POST /api/stripe/webhook`: `400 stripe_missing_signature`.
- unsigned `POST /api/webhooks/twilio/status`: `401 twilio_signature_invalid`.
- unauthenticated `POST /api/internal/system-jobs`: `401`.

Route-contract note:

- The current production deployment intentionally exposes a public homepage at `/`.
- Older app-only closure probes expected `/` to redirect to `/login`; keep that contract only when validating an app-gated deployment variant.
- Before redeploying from this checkout, confirm whether the public homepage should remain live, because a local app-only build may restore the older `/` to `/login` behavior.

Historical verification evidence from initial setup:

- Axiom direct ingest probe returned `ingested: 1`, `failed: 0`.
- Vercel drain validation returned HTTP `200`.
- Vercel drain list returned one project-scoped drain with log schema `v1` and an authorization header present.
- Safe production probes returned:
  - `GET /`: `307` to `/login`
  - `GET /login`: `200`
  - `GET /f/exp-realty-burlington-0c3107fa`: `200`
  - invalid `POST /api/lead-capture`: `400`
  - unsigned `POST /api/webhooks/twilio/status`: `401`
- Axiom query for `['axiom-audit']` showed searchable production log rows for `www.agentdealflow.io`, deployment `dpl_AgTvCVYkaPmf8t5mdgtNP8EXLf7D`, `environment: production`, and the probed routes.

## Axiom Alert Monitor Setup

Requested alert destination:

- Email: `raiaan@scaleholdings.co`
- Do not use SMS for alerts.

Creation status as of 2026-05-02:

- Created through Axiom API using a local, uncommitted personal access token with `X-AXIOM-ORG-ID: dealflow-rcej`.
- Email notifier: `DealFlow OS Production Email Alerts` (`4h2TYMpI4ajGeQrJAC`) to `raiaan@scaleholdings.co`.
- Axiom API did not expose a documented safe notifier-test endpoint during closure verification (`/v2/notifiers/{id}/test` and `/send-test` returned not found), so no synthetic test email was sent through an unsupported endpoint.
- Safe production probes were run after monitor creation and the monitor queries stayed quiet for expected invalid lead-capture `400` and unsigned Twilio status `401` probes.

Created monitors:

- `DealFlow OS Production 5xx Spike`: `xPJx62V85QJ7FnW8NV`
- `DealFlow OS Production Function Errors`: `gspZlBO5HR4CPgggNC`
- `DealFlow OS Production Webhook Failures`: `rfVFyNhqhAPEEUyeia`
- `DealFlow OS Production Auth/Billing Route Errors`: `yinnpKrzSUw7fmgUpG`
- `DealFlow OS Production Sustained Latency Spike`: `NebzAKFaJTBj4pFGZc`

Verified production log field mapping:

- Host: `host`
- Route/path: `path`, with `proxy.path` fallback
- Status: `statusCode`, with `proxy.statusCode` fallback
- Severity/message: `level`, `message`
- Duration: no populated duration field was present during closure verification; the latency monitor uses future-compatible `column_ifexists(...)` fallbacks and remains quiet until route duration data is available.
- API-created monitor APL uses this field mapping. The Function Errors monitor also excludes expected invalid lead-capture and unsigned Twilio-status probe rows unless they become 5xx failures, so the closure probes do not create false alerts.

Axiom's monitor API accepts monitor definitions at `/v2/monitors` with fields such as `name`, `type`, `aplQuery`, `notifierIds`, `intervalMinutes`, `rangeMinutes`, `operator`, `threshold`, and positive-run trigger controls. Axiom notifiers define where monitor output is delivered, including email destinations. Verify the exact Vercel log-drain field names in Axiom before creating these monitors; earlier setup confirmed production rows were searchable by host, route, status, deployment, and structured event name.

Use these monitor names and thresholds for dataset `axiom-audit` after confirming field names:

### DealFlow OS Production 5xx Spike

Purpose: alert on production 5xx spikes for `www.agentdealflow.io`.

APL template:

```apl
['axiom-audit']
| where host == "www.agentdealflow.io"
| where toint(status) >= 500
| summarize error_count = count() by bin(_time, 5m)
```

Monitor settings:

- Type: `Threshold`
- Column: `error_count`
- Operator: `AboveOrEqual`
- Threshold: `3`
- Interval: `5` minutes
- Range: `10` minutes
- Trigger: `2` positive runs out of `3`
- Notifier: email notifier for `raiaan@scaleholdings.co`

### DealFlow OS Production Function Errors

Purpose: alert on application/function exceptions and structured error events.

APL template:

```apl
['axiom-audit']
| where host == "www.agentdealflow.io"
| where severity in ("error", "fatal") or level in ("error", "fatal") or message has_any ("Unhandled", "Error:", "failed")
| summarize error_count = count() by bin(_time, 5m), route
```

Monitor settings:

- Type: `Threshold`
- Column: `error_count`
- Operator: `AboveOrEqual`
- Threshold: `2`
- Interval: `5` minutes
- Range: `10` minutes
- Notify by group: enabled for `route`
- Trigger: `2` positive runs out of `3`
- Notifier: email notifier for `raiaan@scaleholdings.co`

### DealFlow OS Production Webhook Failures

Purpose: alert on Stripe/Twilio webhook route failures and signature-processing errors.

APL template:

```apl
['axiom-audit']
| where host == "www.agentdealflow.io"
| where route has_any ("/api/stripe/webhook", "/api/sms/twilio", "/api/webhooks/twilio/status")
   or event has_any ("stripe_webhook", "sms.webhook", "twilio")
| where toint(status) >= 500
   or event has_any ("signature_verification_failed", "webhook_failed", "sms.webhook_signature_rejected")
   or message has_any ("signature_verification_failed", "webhook failed", "webhook_signature_rejected")
| summarize failure_count = count() by bin(_time, 5m), route
```

Monitor settings:

- Type: `Threshold`
- Column: `failure_count`
- Operator: `AboveOrEqual`
- Threshold: `1`
- Interval: `5` minutes
- Range: `10` minutes
- Notify by group: enabled for `route`
- Trigger: `1` positive run out of `1`
- Notifier: email notifier for `raiaan@scaleholdings.co`

### DealFlow OS Production Auth/Billing Route Errors

Purpose: alert on login/auth and billing/checkout/portal/webhook route errors.

APL template:

```apl
['axiom-audit']
| where host == "www.agentdealflow.io"
| where route has_any ("/login", "/api/billing", "/api/stripe/webhook")
   or event has_any ("billing_", "checkout_", "stripe_webhook", "auth")
| where toint(status) >= 400
   or severity in ("error", "fatal")
   or level in ("error", "fatal")
| summarize error_count = count() by bin(_time, 5m), route
```

Monitor settings:

- Type: `Threshold`
- Column: `error_count`
- Operator: `AboveOrEqual`
- Threshold: `2`
- Interval: `5` minutes
- Range: `10` minutes
- Notify by group: enabled for `route`
- Trigger: `2` positive runs out of `3`
- Notifier: email notifier for `raiaan@scaleholdings.co`

### DealFlow OS Production Sustained Latency Spike

Purpose: alert on sustained p95 route latency spikes.

APL template:

```apl
['axiom-audit']
| where host == "www.agentdealflow.io"
| extend duration_ms = todouble(coalesce(duration_ms, req_duration_ms, vercel.duration, ['X-DealFlow-Route-Duration-Ms']))
| where isnotnull(duration_ms)
| summarize p95_ms = percentile(duration_ms, 95) by bin(_time, 5m), route
```

Monitor settings:

- Type: `Threshold`
- Column: `p95_ms`
- Operator: `AboveOrEqual`
- Threshold: `2500`
- Interval: `5` minutes
- Range: `15` minutes
- Notify by group: enabled for `route`
- Trigger: `3` positive runs out of `3`
- Notifier: email notifier for `raiaan@scaleholdings.co`

After creating the notifier and monitors:

1. Send one Axiom email test notification to `raiaan@scaleholdings.co`.
2. Run a safe production probe set only:
   - `GET /`
   - `GET /login`
   - `GET /f/<published-slug>`
   - invalid `POST /api/lead-capture` expecting `400`
   - unsigned `POST /api/webhooks/twilio/status` expecting `401`
3. Confirm that the monitors stay quiet for expected safe-probe 400/401 responses and only alert on the configured failure patterns.
4. Record the notifier ID and monitor IDs in this runbook without recording the Axiom token.

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
- Affected organization ID, user ID, campaign ID, partner ID, and lead IDs where relevant.
- Whether the issue is isolated to one tenant or could affect cross-tenant data isolation.
- Issue radar row reference from `/admin/issues`.
- Durable row IDs for jobs, webhooks, provider usage, leads, or campaign plans.
- UTC timestamps and the most recent structured log event names.
- Whether the customer experienced billing, launch, lead capture, SMS, or generation impact.
- Whether any provider action could create charges, Meta objects, or outbound SMS.
- Immediate rollback, disablement, or restore path for the affected route, job kind, campaign, or integration.

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

- Supabase Auth signup policy, email confirmation, CAPTCHA/Turnstile, auth rate limits, and approved redirect URLs. Exact setup path: Supabase Dashboard → Project → Authentication → Bot and Abuse Protection / Rate Limits / URL Configuration.
- Vercel Firewall/WAF rules and log-drain destinations. Exact setup path: Vercel Dashboard → Project → Firewall for WAF/Attack Challenge Mode, and Project → Settings → Log Drains for external log destinations.
- Stripe webhook endpoint health alerts and production webhook signing secret rotation.
- Meta app alerting, OAuth review status, and Ads account spending controls.
- Twilio messaging service compliance review, inbound number ownership, and opt-out audit settings.
- External incident destination setup such as Slack, PagerDuty, or email routing.
