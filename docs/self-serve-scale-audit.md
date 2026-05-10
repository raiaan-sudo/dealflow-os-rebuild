# DealFlow OS Self-Serve Scale Audit

Date: 2026-05-10
Scope: public self-serve launch readiness for 100, 200, 500, and 1,000 active customers.

## Current Evidence

- Launch-readiness checks are encoded in `scripts/smoke-test.mjs` and expected to run through `npm run smoke:offline`.
- Schema and route safety checks are available through `npm run schema:check` and `npm run routes:security`.
- Billing, publish, optimization, lead capture, and provider execution paths are guarded by campaign entitlements and rate limits.
- Meta launch execution remains paused by default; live activation requires explicit owner-controlled environment gates.
- Lead-facing SMS automation remains disabled by default and compliance-gated.
- Image/video provider work is routed through credit and provider usage guards; paid generation must remain opt-in and capped.

## 100-client readiness

Status: conditionally ready after the launch closure validation suite passes.

Required operating posture:

- Billing: Stripe subscription lifecycle, checkout return, portal return, and credit top-up webhooks must stay idempotent and monitored.
- Rate limits: public lead capture, auth-adjacent APIs, generation jobs, and webhook routes must keep durable buckets enabled.
- Higgsfield spend caps: daily image-generation limits and per-campaign credit reservations must be checked before enabling wider onboarding.
- Job queues: `system_jobs` must be monitored for stale pending jobs, failed provider jobs, dead-letter reasons, and retry volume.
- Observability: uptime smoke, client error telemetry, activation events, and internal launch monitor checks must be reviewed daily during rollout.
- Support: customer-success checklists and cancellation-intent events should be reviewed at least once per business day.
- RLS/auth: route security checks, membership policy hardening, and Supabase RLS fixtures must pass before launch windows.
- Webhooks: Stripe and Twilio webhooks must reject invalid signatures and oversized bodies without exposing payload internals.
- Launch risks: Meta selections, public funnel publishing, selected creative persistence, and billing override paths require browser proof.

## 200-client readiness

Status: not ready until queue observability and provider caps have owner-visible dashboards.

Required upgrades:

- Add daily owner reporting for provider usage events, provider usage limits, credit balances, and static creative failure rates.
- Set explicit Higgsfield spend caps per day, per workspace, and per campaign launch attempt.
- Add alert thresholds for public lead capture 4xx/5xx rate, Twilio webhook failures, Stripe webhook stale-event ignores, and Meta sync failures.
- Exercise subscription suspension and reactivation paths against inactive, past-due, canceled, and override-enabled organizations.
- Document support playbooks for failed generation, credit overdraft requests, Meta OAuth failures, and public funnel publish conflicts.

## 500-client readiness

Status: not ready without stronger queue isolation and support staffing.

Required upgrades:

- Separate high-cost provider jobs from low-cost telemetry, lead retry, activation, and reporting jobs so provider backlog cannot block core ops.
- Add worker concurrency caps by job kind and organization to prevent one workspace from starving the queue.
- Expand observability with dashboards for job age percentiles, failure classes, provider spend, launch attempts, and publish status drift.
- Add billing anomaly checks for duplicate checkout sessions, repeated webhook retries, and credit event mismatches.
- Run a safe load pass for public routes, lead validation rejection, auth redirects, and published funnel reads.
- Add a support escalation matrix for billing, Meta, provider generation, lead capture, and tenant-access issues.

## 1,000-client readiness

Status: not ready for broad self-serve without production operations hardening.

Required upgrades:

- Formalize incident response for provider outages, Stripe webhook lag, Supabase/RLS failures, Vercel deployment drift, and Meta API degradation.
- Add automated daily scale reports covering active customers, launches, spend, leads, queue health, failed jobs, and customer-success risk.
- Add budget enforcement at multiple layers: plan entitlement, campaign cap, provider usage limit, credit balance, and hard owner kill switch.
- Add replay-safe webhook and job tooling with operator audit logs for retries, overrides, and manual recoveries.
- Run authenticated browser proof for onboarding, checkout, creative selection, publish, launch gates, dashboard, cancellation, and reactivation.
- Review database indexes, retention, and partitioning for `system_jobs`, telemetry, provider usage, lead records, value reports, and Meta sync snapshots.

## GO/NO-GO Rules

- GO for limited public self-serve only when build, lint, typecheck, schema, route security, offline smoke, targeted media-buyer tests, public funnel smoke, and safe production probes pass.
- NO-GO if public funnel publishing drifts, selected creatives are missing, generated creative quality gates fail, billing webhooks fail, rate limiting fails open, or provider usage caps are not visible.
- NO-GO for 200+ customers until spend caps, queue health, provider failure visibility, and support playbooks are operational.
- NO-GO for 500+ customers until queue isolation, alerting, and safe load proof exist.
- NO-GO for 1,000 customers until daily operations reporting, incident response, and database retention/index reviews are complete.
