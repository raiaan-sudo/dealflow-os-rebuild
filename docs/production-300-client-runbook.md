# DealFlow 300-Client Operating Runbook

This runbook moves DealFlow from public self-serve readiness into `300 clients: GO with automated monitoring`.
It assumes no provider generation, SMS, Freshdesk ticket creation, Stripe charge, or Meta mutation is run from the monitoring layer.

Pro Autopilot V1 has its own execution-safety contract in `docs/autonomy-pro-autopilot-v1.md`. The 300-client monitor may observe Autopilot state, incidents, and blocked actions, but it must not convert recommendation, draft, or watch evidence into provider, SMS, Stripe, Meta, or destructive database side effects.

## Automated Monitoring Cadence

The required monitor runs automatically through Vercel Cron:

- `/api/internal/system-jobs` every minute for durable queue work.
- `/api/internal/scale-monitor` every 15 minutes for scale report, operator debt, safe smoke, incident creation, alert path recording, and auto-resolution.

The scale monitor uses the internal runner secret (`INTERNAL_SYSTEM_JOBS_SECRET` or `CRON_SECRET`) and writes only app-owned incident/run rows:

- Incident inbox: `/admin/incidents`
- Control room: `/admin/control-room`
- Pro Autopilot V1 runbook: `docs/autonomy-pro-autopilot-v1.md`
- Manual report: `npm run operator:scale-report -- --json`
- Debt proof: `npm run operator:debt`

The admin incident inbox is the required fail-closed alert channel. Optional email, Slack, or Freshdesk alert routing may be added only when the relevant env exists and the delivery path is explicitly approved. Missing external alert env must not drop incidents.

Auto-resolution policy:

- New `activeBlockers`, `currentWatch`, non-zero operator debt, smoke failures, Freshdesk unavailable state, client error spikes, queue age breaches, provider cap pressure, stale latest Meta snapshots, failed Stripe webhooks, and critical dead-letter jobs open or refresh incidents.
- A recurring resolved incident reopens with a higher recurrence count.
- An open/acknowledged incident auto-resolves only after consecutive clean scale-monitor checks.
- Historical reviewed rows do not reopen incidents unless they recur as current unreviewed evidence.
- Evidence rows are never deleted to make the monitor green.

Synthetic proof:

```bash
curl -sS -X POST "$NEXT_PUBLIC_APP_URL/api/internal/scale-monitor" \
  -H "Authorization: Bearer <internal-runner-secret>" \
  -H "Content-Type: application/json" \
  --data '{"synthetic":true}'
```

The synthetic proof creates and resolves a non-production incident and must not send SMS/email, create tickets, mutate Meta, create Stripe sessions, or trigger provider generation.

## Operator Review Cadence

Daily babysitting is no longer required when `/api/internal/scale-monitor` is registered and the incident inbox is checked by alert. Operators still perform a weekly review and a post-deploy review:

Run this after each production deploy, before major launch windows, and once weekly:

```bash
source /Users/raiaanreza/.nvm/nvm.sh && nvm use 20.20.2
npm run operator:scale-report
npm run operator:debt
```

Open the admin-only operational pages:

- `/admin/incidents`
- `/admin/control-room`
- `/admin/command-center`
- `/admin/issues`
- `/admin/launch-monitor`

The report is read-only. It must not send email, send SMS, create tickets, create Stripe sessions, trigger provider generation, or mutate Meta.

Daily classification order:

1. Run `npm run operator:scale-report -- --json`.
2. Run `npm run operator:debt`.
3. Classify `activeBlockers` before touching `currentWatch`.
4. Confirm `operator:debt` and `operator:scale-report` agree on active blockers.
5. Keep evidence rows. Never delete jobs, notifications, provider events, or sync snapshots to make a report green.

The report must classify every stale Meta snapshot, failed lead notification, and failed/dead-letter job as one of:

- `CLEARED`: no current row exists for the active risk.
- `HISTORICAL / REVIEWED`: timestamps, recurrence checks, and review fields or policy evidence prove the row is not an active customer-impacting issue.
- `CURRENT WATCH`: non-critical current issue that must remain visible but does not block 300-client operations.
- `ACTIVE BLOCKER`: current critical issue that blocks 300-client GO.

## 300-Client GO Rule

`300 clients: GO with automated monitoring` requires:

- Queue/dead-letter dashboard exists and shows lane health.
- Critical jobs are classified separately from heavy provider jobs.
- Heavy provider jobs have cap visibility and do not hide critical recovery work.
- Pro Autopilot mode, queued/staged/applied/blocked state, and blocked reasons are visible in the dashboard and `/admin/control-room`.
- Provider usage, cap pressure, stale reservations, and cost are visible.
- Billing lifecycle and Stripe webhook failures are visible.
- Lead saves, lead notification status, failed notification drift, and SMS policy are visible.
- Meta drift, stale sync snapshots, active launch locks, budget cap state, and spend availability are visible.
- Support/Freshdesk configuration state is visible and missing env degrades safely.
- First-party client errors are grouped by route/class without raw PII or secrets.
- Incident switches are documented and checked by operators.
- `npm run operator:debt`, route security, RLS checks, build, and production smoke pass before any production GO claim.

## Queue / Job Triage

Critical lane:

- `lead_capture_retry`
- `lead_side_effects`
- `subscription_suspension`
- Stripe/billing recovery job kinds when present

Heavy lane:

- `static_creative_generation`
- `video_generation`
- `video_generation_status`
- provider polling

Normal lane:

- Meta sync
- dashboard/status sync
- telemetry/support processing
- recommendation/autonomy support work

Rules:

- Review critical lane failures first.
- Heavy backlog is a WATCH condition, not a reason to retry broadly.
- Dead-letter jobs require operator review before retry.
- Stale processing jobs must respect active leases.
- Marketing Studio worker proofs stay capped and explicit; no automatic retries.
- `reviewed_at` failed/dead-letter jobs are historical evidence and must not inflate active lane counts.
- Current critical failed/dead-letter jobs are blockers until reviewed, resolved, or safely retried.
- Current heavy/provider failures are WATCH unless they are customer-impacting or recurring in the last 24 hours.
- Do not retry provider, SMS, Stripe, Meta, or lead side-effect jobs without explicit owner approval for that side effect.

## Provider Cost And Backpressure

Watch:

- provider events today and 7 days
- stale reserved provider events
- failed provider events
- `provider_usage_limits` above 70 percent
- generation credit balances below the top-up minimum
- daily provider cost warning thresholds

Do not raise caps casually. Raise caps only after:

- provider failures are clear
- no stale reservations exist
- customer billing/credit state is valid
- owner approves the increased spend exposure

## Billing Lifecycle

Daily checks:

- trialing, active, past_due, canceled/inactive
- trial ending soon
- checkout started versus completed/abandoned
- failed Stripe webhooks
- stale Stripe webhook processing
- unknown price errors

Stripe remains the source of truth. Use Stripe Portal for customer billing changes. The app must fail closed on unknown price IDs.

## Lead / SMS Reliability

Daily checks:

- leads today and 7 days
- `lead_capture_retry` queue
- `lead_notifications` by status
- failed or undelivered internal lead notifications
- saved lead with failed notification warning
- Twilio status callback health through safe unsigned production probes only

Lead save must continue even if internal SMS alerts are disabled or Twilio env is missing. Do not send SMS from this runbook.

Classification policy:

- `delivered_at` with stale non-delivered status is repairable through the status-normalization repair path.
- Failed notifications in the last 24 hours are `CURRENT WATCH` until lead save, assignment, and retry risk are reviewed.
- Failed notifications older than 24 hours with no recurrence in the last 24 hours, no delivered/failed status drift, and successful lead save/assignment evidence are `HISTORICAL / REVIEWED`.
- If `INTERNAL_LEAD_SMS_ENABLED` or Twilio env is unavailable, failed internal SMS rows are operational evidence, not permission to retry. Retrying would send SMS and requires explicit approval.
- Saved lead plus failed notification remains visible in the report even when classified historical.

## Meta Drift / Spend

Daily checks:

- active campaigns tracked by app sync snapshots
- failed or stale sync snapshots
- active launch locks
- budget cap env state by name
- spend availability and spend anomaly placeholder
- duplicate object warnings from app snapshots
- destination/domain readiness warnings where available

Do not create, edit, activate, or increase budget on Meta from this monitoring pass.

Classification policy:

- Freshness is judged by the latest app-owned snapshot per organization/user/Meta campaign, not by every old snapshot.
- Old stale snapshots are `HISTORICAL / REVIEWED` when superseded by a newer successful fresh snapshot.
- A latest stale snapshot is `CURRENT WATCH` until read-only Meta proof is clean and a fresh app-owned sync snapshot is inserted.
- A latest failed snapshot, read-only Meta proof failure, destination mismatch, budget mismatch, or app-vs-Meta runtime drift is an `ACTIVE BLOCKER`.
- Clear stale Meta only via read-only Meta verification plus an app-owned sync snapshot. Never mutate Meta delivery, object status, or budget from this runbook.
- A clean app-owned reconciliation snapshot must record `mutatesMeta: false` proof, fresh `synced_at`, expected ACTIVE object statuses, expected destination URL, and expected budget. Historical stale snapshots remain evidence and must not be deleted to make the report green.

## Support / Freshdesk

Daily checks:

- `FRESHDESK_DOMAIN` and `FRESHDESK_API_KEY` presence by name only
- support category/priority map coverage
- support ticket route remains auth, same-origin, and rate limited
- customer-safe fallback remains active when Freshdesk is unavailable

Macros/operators should route issues into:

- billing issue
- login/account issue
- launch issue
- Meta/Facebook issue
- creative generation issue
- AI UGC issue
- lead delivery issue

Do not create Freshdesk tickets unless a separate owner-approved QA ticket proof explicitly authorizes exactly one ticket.

## Client Error Triage

Daily checks:

- errors today and 7 days
- top routes/pages
- top error classes
- deploy association where present
- browser/device grouping where present
- recent unresolved errors

Client error telemetry must stay server-scrubbed. Do not export cookies, tokens, emails, phones, payment data, raw customer notes, provider URLs, or raw stack payloads outside internal engineering triage.

## Incident Switches

Document env names only:

- Provider generation disable: `ALLOW_HIGGSFIELD_IMAGE_GENERATION`, `ALLOW_HIGGSFIELD_VIDEO_GENERATION`, `MARKETING_STUDIO_WORKER_ENABLED`
- Meta live launch disable: `ALLOW_META_LIVE_LAUNCH`
- SMS sending disable while lead save continues: `INTERNAL_LEAD_SMS_ENABLED`
- Billing checkout safe mode: `BILLING_CHECKOUT_SAFE_MODE=true` makes subscription and credit checkout fail closed while billing monitoring is degraded.
- Billing override gates: Stripe price env names plus billing override env names in `.env.example`
- Support degradation mode: `FRESHDESK_DOMAIN`, `FRESHDESK_API_KEY`
- Provider cap emergency override: provider usage limit rows and generation credit env names; owner approval required before increasing spend exposure
- Queue/dead-letter recovery: `/api/internal/system-jobs` with `INTERNAL_SYSTEM_JOBS_SECRET` or `CRON_SECRET`
- Automated scale monitor: `/api/internal/scale-monitor` with `INTERNAL_SYSTEM_JOBS_SECRET` or `CRON_SECRET`

## Scale Readiness Table

| Tier | Status | Reason | Bottleneck | Unlocks next tier |
| --- | --- | --- | --- | --- |
| 25 clients | GO | Existing public self-serve, billing, launch gates, support widget, and operator issue radar are enough. | Owner acceptance and routine monitoring. | Daily operator cadence. |
| 50 clients | GO | Current durable jobs, webhooks, provider caps, and client-error intake cover this tier. | Manual support load. | Consistent support macros and daily report. |
| 100 clients | GO with monitoring | Existing 100-client runbook and operator debt checks support this tier. | Queue/provider visibility must be watched. | 300-client control room and daily report. |
| 200 clients | WATCH | Requires summarized queue, provider, billing, lead, Meta, support, and error visibility. | Operator visibility and triage cadence. | Control room clean plus report clean. |
| 300 clients | GO with automated monitoring | Scheduled monitor creates incidents, records safe alert paths, auto-resolves clean incidents, and keeps the control room/report available for review. | Physical worker fairness and deeper load proof for higher scale. | Dedicated worker isolation/load tests and external on-call delivery. |
| 500 clients | WATCH | Heavy provider backlog and support volume need stronger physical isolation and alert delivery. | Worker fairness, paging, staffing. | Dedicated queues/workers and external alert delivery. |
| 600 clients | NO-GO | Current internal monitoring is not enough for larger support and provider incident load. | On-call, load proof, support SLAs. | Formal incident response and queue isolation. |
| 1,000 clients | NO-GO | Requires sustained load tests, worker pool isolation, provider contracts, and external alerting/on-call. | Throughput, observability, staffing, vendor limits. | Production SRE posture and contracted provider capacity. |
