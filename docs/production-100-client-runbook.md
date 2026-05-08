# DealFlow OS 100-Client Controlled Beta Runbook

This runbook is for public self-serve launch operation. PITR and off-site backup upgrades are tracked as owner-managed follow-up work rather than code GO/NO-GO blockers for the current launch gate. It assumes production runs on Vercel, data is in Supabase, billing is Stripe, launch is Meta, and paid generation is guarded.

## Current Production Targets

- App/API host: `https://app.agentdealflow.io`
- Public marketing host: `https://www.agentdealflow.io`
- Current verified app production deployment: confirm with `vercel inspect https://app.agentdealflow.io` before any launch decision.
- Current root route contract: `https://app.agentdealflow.io/` serves the app public homepage with `200`; protected app routes redirect unauthenticated users to `/login`.
- Required app public pages: `/privacy`, `/terms`, `/data-deletion`, `/f/[slug]`
- Required app webhooks: `/api/stripe/webhook`, `/api/integrations/meta/callback`, `/api/sms/twilio`, `/api/webhooks/twilio/status`
- Public lead capture: `https://app.agentdealflow.io/api/lead-capture`
- Provider dashboards and webhook callbacks should point at `https://app.agentdealflow.io`, not the marketing host, unless a future DNS/project consolidation changes this contract.
- Operator monitor: `/admin/launch-monitor`
- Operator command center: `/admin/command-center`
- Operator issue radar: `/admin/issues`
- Customer success/support runbook: `docs/customer-success-support-runbook.md`
- Protected job runner: `/api/internal/system-jobs`
- Required operator access env: `INTERNAL_ADMIN_EMAILS`
- Optional billing-only override envs: `ALLOW_BILLING_ADMIN_OVERRIDE`, `BILLING_ADMIN_OVERRIDE_EMAILS`
- Required internal runner secret: `INTERNAL_SYSTEM_JOBS_SECRET` or `CRON_SECRET`
- Observability/alerting runbook: `docs/observability-alerting-runbook.md`

## Rollback

1. Open the Vercel project deployments page.
2. Promote the last known-good production deployment.
3. Confirm:
   - `/login` returns 200.
   - `/dashboard` redirects unauthenticated users.
   - `/f/<published-slug>` returns 200.
   - `/api/lead-capture` rejects invalid payloads with 400.
4. If the rollback follows a schema migration, do not roll back destructive schema changes manually. The current migration set is additive.

## Supabase Migration Recovery

The remote migration history has a legacy `20260426` entry that may appear as a local/remote mismatch. If `supabase db push --dry-run` fails with a missing remote migration version, run:

```bash
supabase migration repair --status reverted 20260426
supabase db push --dry-run --include-all
```

Only run `supabase db push --include-all` after the dry run lists only expected additive migrations.

## Supabase PITR Recovery

Current production backup state:

- Physical backups are enabled and completed daily.
- PITR is recommended for the mature public self-serve posture, but the current launch gate accepts the daily physical backup plus logical backup posture as the interim baseline.
- PITR cannot be enabled until the project is at least on Small compute.
- Public launch can defer PITR if daily Supabase physical backups are paired with a separate logical backup routine and owner accepts the documented same-day recovery gap.

Recommended PITR target:

- Compute: Small or larger.
- Recovery window: 7 days for launch baseline, unless customer contracts require 14 or 28 days.
- Owner cost approval: required because PITR and compute are billed add-ons.

Enablement path:

1. Supabase Dashboard -> Project -> Settings -> Compute and Disk.
2. Upgrade the database compute to Small or larger.
3. Supabase Dashboard -> Project -> Settings -> Add-ons -> Point in time recovery.
4. Select Enable PITR.
5. Select the approved retention window.
6. Confirm the billing change.
7. Verify with:

```bash
supabase backups list --project-ref fdzwbevvbqvyteapphxm -o json
```

Expected proof after enablement:

- `pitr_enabled: true`
- `physical_backup_data.earliest_physical_backup_date_unix` present
- `physical_backup_data.latest_physical_backup_date_unix` present
- recovery window documented in this runbook

Restore runbook:

1. Identify the incident timestamp in UTC from app logs, durable operator tables, and support reports.
2. Choose a restore timestamp immediately before the corruption or destructive write.
3. Pause write-heavy app paths or move traffic to a maintenance state before restoring.
4. Use the Supabase Dashboard PITR restore flow or the Management API restore endpoint with `recovery_time_target_unix`.
5. Expect database downtime during restore; duration depends on database size and WAL replay volume.
6. After restore, re-run schema, RLS, route security, operator debt, and safe production smoke checks before reopening public traffic.
7. Never restore over live production until the owner confirms the chosen timestamp and accepts data loss for writes after that timestamp.

## Lower-Cost Backup Posture

Use this posture only while the product is in controlled beta or a small customer rollout where the owner can tolerate recovery to the last backup window.

Target:

- Launch cap: up to about 50 closely supported client workspaces.
- Backup frequency: daily minimum; every 6 to 12 hours during active onboarding or launch windows.
- Storage: at least one destination outside Supabase, encrypted or access-restricted.
- Recovery objective: restore to the most recent logical/physical backup, not an arbitrary second before an incident.
- Current local backup proof: `.backups/supabase/fdzwbevvbqvyteapphxm-2026-05-02T195719Z` completed with `roles.sql.gz`, `schema.sql.gz`, `data.sql.gz`, and `manifest.json`.
- Current gap: the completed backup is local only until it is copied to an approved encrypted/restricted offsite destination.

Create a local logical backup:

```bash
DEALFLOW_BACKUP_ACK=production-data npm run backup:supabase
```

The command writes compressed SQL dumps and a manifest under `.backups/supabase/`. These files contain sensitive production data and are intentionally gitignored. Docker must be available because the Supabase CLI runs the matching `pg_dump` tooling in a container.

After creating a backup:

1. Move or sync the backup directory to the approved offsite destination.
2. Verify the manifest SHA-256 hashes after transfer.
3. Keep at least 7 daily backups and at least 4 weekly backups while PITR is deferred.
4. Never paste backup contents, customer data, auth data, or prospect data into tickets or chat.
5. Test restore on a non-production Supabase project before relying on the backup plan for public launch.

This backup posture is cheaper than PITR, but it does not protect against all same-day corruption or accidental deletion. The maximum data loss is the time since the last successful backup.

Required production tables/columns include:

- `campaign_plans.launch_status`
- `campaign_plans.lead_loop_verified`
- `campaign_plans.public_slug`
- `stripe_webhook_events.payload`
- `stripe_webhook_events.updated_at`
- `system_jobs.idempotency_key`
- `system_jobs.locked_by`
- `system_jobs.locked_until`
- `system_jobs.attempt_count`
- `system_jobs.max_attempts`
- `system_jobs.last_error_code`
- `system_jobs.dead_lettered_at`
- `system_jobs.dead_letter_reason`
- `provider_usage_limits`
- `meta_launch_locks`
- `lead_messages`
- `leads.dedupe_hash`
- `leads.consent_metadata`
- `leads.sms_opted_out_at`

## Stripe Webhook Recovery

1. In Stripe Dashboard, find the failed event.
2. Confirm the endpoint is:

```text
https://app.agentdealflow.io/api/stripe/webhook
```

3. Replay the event.
4. In Supabase, inspect `stripe_webhook_events` by `stripe_event_id`.
5. Expected states:
   - `processed`: event updated billing state.
   - `ignored`: event was valid but had no actionable subscription context.
   - `failed`: event was accepted but processing failed and needs operator review.

## Failed-Payment Recovery And Cancellation Intelligence

Stripe remains the payment source of truth for subscription cancellation, payment method updates, and billing portal actions. DealFlow should not run a custom cancellation mutation unless a separate owner-approved Stripe API flow is designed and audited.

App-side behavior:

1. `past_due` and `incomplete` subscriptions enter `payment_issue`.
   - Dashboard/settings show a payment warning.
   - New Meta launch and optimization/autonomy are blocked.
   - Existing funnel capture and internal lead alerts can continue during the payment-issue grace state.
   - The CTA sends the customer to Stripe Portal to update payment method.
2. `cancel_at_period_end = true` stays active until Stripe `current_period_end`.
   - Do not suspend during the paid period.
   - Operator should review the account before the period end and attempt a normal save conversation.
3. Ended, unpaid, expired, or canceled-after-period subscriptions enter suspended/read-only.
   - DealFlow-managed launch, funnel capture, lead alerts, optimization, and autonomy remain paused until Stripe returns to an active billing state.
4. The local manage/cancel entry in Settings may record an optional cancellation intent in `billing_cancellation_intents` before redirecting to Stripe Portal.
   - The reason capture must be skippable.
   - Do not slow, hide, or block Stripe Portal access.
   - Do not store card data, provider tokens, credentials, or secrets in the reason detail.
5. Operator visibility:
   - `/admin/issues` includes `billing_recovery` issues for `payment_issue`, `cancel_at_period_end`, and suspended billing states.
   - Use captured reason detail as internal customer-success context only.
   - Do not include private cancellation notes in external support messages unless the customer wrote them for that purpose.

Owner dashboard settings to verify in Stripe before public launch:

1. Dunning retry schedule is enabled and matches the desired grace policy.
2. Customer emails for failed payments and expiring cards are enabled.
3. Stripe Portal allows payment-method update and subscription cancellation.
4. Portal cancellation reason settings are configured if Stripe-native reason analytics are desired.

## Launch Customer-Success Operating Layer

Use `/admin/command-center` before and after traffic is opened. The command center includes a customer-success watchlist for the first 25 days of each campaign:

- onboarding review
- creative QA
- preview reviewed
- billing active
- Meta connected
- assets selected
- launch readiness
- lead loop verified
- day 7 check-in due
- day 14 value proof due
- day 25 renewal-risk review due

Support feedback is categorized through the in-app feedback widget as `confusing_ux`, `billing`, `onboarding`, `creative_quality`, `meta_connect`, `lead_funnel`, `bug`, or `cancellation_refund`. The route logs the category and safe presence flags only; it does not log raw feedback text or secrets.

Full customer-success SOP, canned responses, SLA expectations, escalation rules, and out-of-scope operating systems are documented in `docs/customer-success-support-runbook.md`.
6. Replaying the same event should not double-process because `stripe_event_id` is unique.

## Meta Launch Retry Recovery

1. Inspect the campaign in `campaign_plans`.
2. Check `plan.launch_runtime` for:
   - `campaign_id`
   - `adset_id`
   - `creative_id`
   - `ad_id`
   - `current_stage`
   - `status`
3. Retry launch from the UI or route only after confirming the campaign is not actively locked.
4. `meta_launch_locks` prevents concurrent duplicate launch attempts.
5. All launch-created Meta objects must remain `PAUSED`.
6. Daily budget cap is owner-configured. Leave `META_DAILY_BUDGET_CAP_CENTS` unset, `0`, `off`, `none`, or `unlimited` for no DealFlow cap; set a positive cent value only when an explicit launch cap is desired.

## Lead Retry Recovery

1. Inspect `system_jobs` for `kind = lead_capture_retry`.
2. Confirm only one retry job exists for the original request/contact. The retry queue uses an idempotency key and the lead insert path also dedupes by `leads.dedupe_hash`.
3. If a public lead was accepted with HTTP 202, verify the retry payload was durably written first.
4. Process or retry only if the payload contains campaign/funnel context plus at least one contact method.
5. A lead should only mark `lead_loop_verified` after a real saved lead exists.

## Stuck Job Recovery

1. Inspect `system_jobs` ordered by `created_at desc`.
2. Look for:
   - `status = failed`
   - stale `locked_until`
   - `attempt_count >= max_attempts`
   - repeated `last_error_code`
   - `dead_lettered_at is not null`
3. Retry only idempotent jobs.
4. Treat `dead_lettered_at is not null` as an operator-review state. Manual retry clears dead-letter fields but does not make unsafe jobs safe.
5. Unknown job kinds should fail loudly and should not be marked completed.

## Client Error Telemetry

DealFlow captures browser-side failures without a third-party browser SDK:

- `ClientErrorListener` records `window.error` and `unhandledrejection`.
- App/auth error boundaries record route render failures.
- `/api/client-errors` is public for login-page coverage, but it is same-origin guarded, rate-limited, body-size-limited, and server-scrubbed.
- `client_error_events` is force-RLS protected and writable only by the service role.
- `/admin/issues` surfaces unreviewed `client_error` rows so frontend crashes enter the same operator workflow as jobs, billing, provider usage, and customer-success issues.

Operator handling:

1. Review `client_error` in `/admin/issues` daily and after each deployment.
2. Treat repeated errors on `/login`, `/onboarding`, `/paywall`, `/dashboard`, `/preview`, `/settings`, or `/launch` as launch-critical until reproduced or explained.
3. Do not paste raw stack traces into external tools unless they have already been scrubbed of tokens, cookies, payment data, provider IDs, and PII.
4. Mark rows reviewed only after the root cause is patched, deployed, or intentionally accepted as a non-app browser/environment issue.

## Paid Generation Controls

Paid media generation must not run during normal onboarding or draft creative generation.

Controls:

- Video/HeyGen generation is disabled for beta.
- Static image generation must go through the guarded static generation route.
- Provider usage is tracked in `provider_usage_limits`.
- Each OpenAI image call reserves its own `provider_usage_events` row before the provider request and must be capped with `OPENAI_IMAGE_DAILY_LIMIT` during production tests.
- Customers fund paid image/video generation through generation-credit top-ups. The minimum top-up is `$20.00`; credit purchases are separate Stripe payment-mode checkout sessions and credits are granted only after the paid Stripe webhook is processed.
- Operator issues with source `provider_cost` mean one of three things needs review: daily provider quota is near/exceeded, daily provider cost is above the warning threshold, or a customer balance is below the minimum top-up and paid generation will block.
- Retries should reuse existing jobs/assets where possible.

Emergency disable:

1. Hide/disable the static generation UI entry point.
2. Keep video generation route returning `video_generation_disabled`.
3. Leave `ALLOW_OPENAI_IMAGE_GENERATION` and `ALLOW_HEYGEN_VIDEO_GENERATION` unset or set to any value other than `true`.
4. For a controlled image test, set `OPENAI_IMAGE_DAILY_LIMIT=1` before enabling `ALLOW_OPENAI_IMAGE_GENERATION=true`.
5. Remove provider API keys from production only if a hard stop is required.

Daily 100-client operating cadence:

1. Open `/admin/issues` and filter/review `provider_cost` before enabling paid generation for the day.
2. Check low-credit accounts before approving paid OpenAI/HeyGen proof work; do not run paid generation for accounts without funded credits.
3. Keep `OPENAI_IMAGE_DAILY_LIMIT` and `HEYGEN_VIDEO_DAILY_LIMIT` conservative until the owner has reviewed provider quota and gross margin.
4. Raise `OPERATOR_PROVIDER_DAILY_COST_WARNING_CENTS` only after the owner accepts the daily cost ceiling.

## Dirty Worktree / Merge Closure

The launch branch can be operationally ready while still being broad and dirty locally. Before merge/PR, make the review surgical:

1. Run `git status --short --branch` and save the output in the PR notes.
2. Review deletions separately from edits with `git diff --name-status` and confirm every deleted path is either proven dead, generated, ignored, or replaced.
3. Review Supabase migration files separately and confirm the deployed production project has applied the matching migration list.
4. Confirm no `.env*`, provider token, screenshot with private data, `node_modules.corrupt-*`, `supabase/.temp/*`, Playwright output, or generated recovery artifact is tracked.
5. Run `npm run lint`, `npm run typecheck`, `npm run build`, `npm run smoke:offline`, `npm run routes:security`, `npm run schema:check`, `npm run rls:fixture-smoke`, and `npm run operator:debt` from the exact branch being merged.
6. Do not normalize unrelated dirty files just to make the status cleaner. If a file is unrelated to launch, leave it for a separate review.

## Meta Emergency Disable

1. Hide or disable launch UI.
2. Keep `/api/campaigns/[id]/launch` protected by auth, billing gate, same-origin check, and Meta launch lock.
3. Remove Meta credentials from production only if launch must hard-stop.

## SMS Emergency Disable

1. Leave `TWILIO_OUTBOUND_SMS_ENABLED` unset or set to any value other than `true`.
2. Leave `SMS_COMPLIANCE_ACK` unset unless legal/compliance approval is complete.
3. Remove Twilio credentials only if a hard provider stop is required.
4. Keep inbound `/api/sms/twilio` signature validation enabled.
5. Preserve STOP/opt-out state in `leads.sms_opted_out_at`.
6. Surface operator follow-up instead of automated SMS.

## SMS Compliance Controls

Lead-facing outbound SMS automation is not part of this launch and must stay disabled. Internal agent lead-alert SMS may be enabled only after all of the following are true:

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` are configured server-side.
- `INTERNAL_LEAD_SMS_ENABLED=true`.
- The target agent has an `agent_profiles.phone_e164`, `active=true`, and `sms_notifications_enabled=true`.
- The send path records one `new_lead_alert` and one `lead_reply_template` row in `lead_notifications`.
- Load/stress tests use `SMS_MOCK_MODE=true` or `TEST_SMS_MODE=mock`; do not send bulk real SMS.

Lead-facing outbound SMS automation remains disabled unless a future compliance launch explicitly re-enables it with all of the following:

- `TWILIO_INBOUND_ORGANIZATION_ID` maps the inbound Twilio number to exactly one workspace, or a dedicated per-tenant inbound-number mapping table has been implemented.
- `TWILIO_OUTBOUND_SMS_ENABLED=true`.
- `SMS_COMPLIANCE_ACK=true`.
- The lead has explicit SMS consent stored in `leads.consent_metadata.sms`.
- The lead does not have `leads.sms_opted_out_at` set.

Inbound `/api/sms/twilio` must keep handling compliance keywords even when outbound automation is disabled:

- `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, and `QUIT` set `leads.sms_opted_out_at`.
- `START`, `UNSTOP`, and `SUBSCRIBE` clear the opt-out timestamp and store renewed consent metadata.
- `HELP` returns support/opt-out instructions.
- Twilio `MessageSid` is recorded on inbound `lead_messages.provider_message_id`; duplicate SIDs are treated as idempotent replays and do not trigger another automated reply.

## Signup Abuse Controls

Owner-only Supabase Auth settings are required before unrestricted signup:

1. Create a Cloudflare Turnstile site for `www.agentdealflow.io`.
2. Add the Turnstile keys to Vercel:
   - Vercel Dashboard → Project → Settings → Environment Variables.
   - Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for Production and Preview.
   - Add `TURNSTILE_SECRET_KEY` for Production and Preview.
   - Redeploy after adding both values.
3. Enable Supabase Auth CAPTCHA:
   - Supabase Dashboard → Project → Authentication → Bot and Abuse Protection.
   - Toggle Enable CAPTCHA protection.
   - Provider: Cloudflare Turnstile.
   - Site key: the same `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
   - Secret key: the same `TURNSTILE_SECRET_KEY`.
   - Save, then create one disposable signup to confirm account creation succeeds only after the challenge completes.
4. Require email confirmation before users can build campaigns:
   - Supabase Dashboard → Project → Authentication → Sign In / Providers → Email.
   - Enable Confirm email.
   - Save and verify the confirmation email works with the production redirect URL.
5. Configure Supabase Auth rate limits:
   - Supabase Dashboard → Project → Authentication → Rate Limits.
   - Keep password reset, signup confirmation, OTP, and token-refresh limits at or below Supabase defaults unless a real pilot requires higher limits.
   - Watch for `429` responses during the first public signup test before raising limits.
6. Restrict OAuth redirect URLs:
   - Supabase Dashboard → Project → Authentication → URL Configuration.
   - Site URL: `https://www.agentdealflow.io`.
   - Redirect URLs: production domain plus explicitly approved Vercel preview domains only.
7. For controlled beta, operate invite-only signup until CAPTCHA and email confirmation are enabled.
8. Review disposable-email controls before broad public launch.

App-side controls still apply after signup: onboarding, campaign build, generation, checkout, Meta sync, and public lead capture use durable rate limits. These controls are not a replacement for Supabase Auth abuse controls because attackers can call Auth endpoints directly with the public anon key.

## Vercel Firewall / WAF Baseline

Recommended Vercel account-level rules for public launch:

1. Enable Attack Challenge Mode only during an active attack:
   - Vercel Dashboard → Project → Firewall → Attack Challenge Mode → Enable.
   - Disable it after the incident to avoid unnecessary user friction.
2. Add WAF Custom Rules in monitor/log mode first, then enforce:
   - Rule: Challenge non-browser traffic for `/login`, `/f/*`, and `/api/lead-capture`.
   - Rule: Rate-limit or challenge repeated POSTs to `/api/billing/checkout`, `/api/onboarding/plan`, `/api/build-campaign`, `/api/generate-funnel`, `/api/generate-creatives`, and `/api/builder/*`.
   - Rule: Bypass provider webhook endpoints listed below so Stripe/Twilio/Meta are never served a browser challenge.
3. Exempt signed provider webhooks from challenge pages, but keep app-level signature validation:
   - `/api/stripe/webhook`
   - `/api/integrations/meta/callback`
   - `/api/sms/twilio`
4. Block or challenge obvious high-risk countries/IP ranges only after reviewing real traffic.
5. Keep `/api/internal/*` inaccessible except through the configured cron secret. Do not create public bypasses.
6. Confirm Vercel Firewall logs show no challenge/block events for Stripe, Meta, Supabase Auth callbacks, or public funnel visits before enforcing.

## Support Playbook

Use `/admin/issues` for durable issue records and `docs/observability-alerting-runbook.md` to distinguish live DB telemetry, log-only events, manual proof, and estimated command-center values before contacting customers.

### Failed checkout

- Confirm Stripe checkout route returns a session for the selected plan.
- Check Stripe Dashboard for session errors.
- Check `billing_subscriptions` after webhook delivery.
- For owner demos or QA billing bypass, prefer `BILLING_ADMIN_OVERRIDE_EMAILS` with `ALLOW_BILLING_ADMIN_OVERRIDE=true` instead of adding the user to `INTERNAL_ADMIN_EMAILS`. This grants billing/launch access without granting operator admin navigation.

### Failed launch

- Check dashboard/operator monitor at `/admin/launch-monitor`.
- Confirm the signed-in operator email is included in `INTERNAL_ADMIN_EMAILS`, or for billing-only demo bypass confirm the email is included in `BILLING_ADMIN_OVERRIDE_EMAILS` and `ALLOW_BILLING_ADMIN_OVERRIDE=true`.
- Inspect `plan.launch_runtime`.
- Inspect `meta_launch_locks`.
- Retry only after confirming no active lock and no active Meta objects were created.
- Escalate before retry if any Meta object is not `PAUSED`, if a configured budget cap does not match the owner-approved launch budget policy, or if the launch has already failed twice.

### Missing lead

- Check `leads` by email/phone.
- Check `dedupe_hash`.
- Check `system_jobs` for `lead_capture_retry`.
- Check Vercel logs for `lead_capture_failed`.

### Duplicate lead

- Confirm duplicate has same normalized campaign/contact dedupe hash.
- Confirm unique dedupe index exists.

### Meta connection expired

- Reconnect Meta OAuth.
- Re-run asset discovery.
- Re-select ad account, Page, and pixel.
- Re-run preflight.

### Webhook failed

- Replay event from provider dashboard.
- Confirm idempotency row exists.
- Do not manually create duplicate subscription state unless webhook recovery is impossible.

### Subscription ended or unpaid

- DealFlow does not hard-delete customer campaigns when billing ends.
- Canceled subscriptions remain fully operational until Stripe `current_period_end`.
- `past_due` and `incomplete` subscriptions enter a payment-issue grace state: existing funnels and internal alerts can keep working, but new Meta launches and optimization/autonomy are blocked.
- Ended, unpaid, expired, or canceled-after-period subscriptions enter the suspended/read-only state:
  - queue `subscription_suspension` system jobs from the Stripe subscription sync path
  - pause only DealFlow-managed Meta object IDs stored in the campaign plan runtime
  - disable public funnel lead capture before any lead row is created
  - skip internal lead alerts, Meta lead conversion side effects, generation, sync, and optimization jobs
  - keep the dashboard visible with a reactivation CTA
- Suspension is idempotent. Re-running the same subscription suspension job should not duplicate system work or delete customer data.
- Reactivation is Stripe-driven. Once billing returns to an active or valid grace state, launch/funnel/lead/job gates reopen. Operators may relaunch/resume managed Meta objects through the normal guarded launch flow.
- Do not manually pause unrelated Meta objects. If a stored ID is missing or Meta connection is unavailable, inspect the campaign plan and `system_job_logs` before retrying.

### Activation telemetry and first value

- Durable activation events live in `activation_events`. Treat the table as first-value telemetry, not a product analytics junk drawer.
- Allowed event names:
  - `signup_session_initialized`
  - `onboarding_started`
  - `onboarding_step_completed`
  - `onboarding_completed`
  - `campaign_plan_persisted`
  - `preview_generated_or_viewed`
  - `paywall_viewed`
  - `checkout_started`
  - `checkout_completed_or_reconciled`
  - `dashboard_viewed`
  - `meta_connect_started`
  - `meta_selection_completed`
  - `launch_ready`
- Metadata must use safe flags, enums, counts, route names, plan tiers, and IDs only. Never store raw email, phone, names, addresses, provider tokens, cookies, JWTs, API keys, credentials, or free-form customer PII in activation metadata.
- Event writes go through `recordActivationEvent` in `src/lib/services/activation-telemetry-service.ts`. Client-side wizard events use `/api/activation/events`, which requires auth and same-origin requests.
- Idempotency is `organization_id + event_key`. Repeated page views or retries should not create noisy duplicates for the same activation milestone.
- The activation milestone for the pre-payment "oh shit" moment is `preview_generated_or_viewed`.
- Operators should inspect `/admin/issues` or `/admin/command-center` for activation stalls:
  - incomplete onboarding
  - paid but no dashboard preview
  - campaign generated but no Meta connect
  - Meta connected but no launch readiness
- Customer-success action:
  - If onboarding is incomplete after 1 hour, inspect whether validation or campaign persistence failed.
  - If billing is active but no dashboard preview was viewed, check the Stripe success redirect and onboarding `campaignId` handoff.
  - If campaign generation succeeded but Meta was not started, follow up with a Meta connection checklist.
  - If Meta selection exists but launch readiness is absent, review billing, preflight, selected creative, and launch page blocking reasons.

### Weekly value reports and retention loop

- Customer-facing campaign progress reports live in the dashboard as "Weekly value report".
- Durable report snapshots live in `campaign_value_reports`.
- Reports are deterministic and provider-free. They must not call paid AI, Meta mutation routes, Stripe, SMS, or email delivery.
- Report contents summarize:
  - campaign and funnel status
  - static/video assets generated and selected creative
  - Meta connection, launch, sync, and campaign status
  - lead counts and lead-loop verification state without raw lead contact details
  - spend, impressions, clicks, leads, CTR, CPL, and appointment count when available
  - creative winner/underperformer insight when performance data exists
  - next recommended action
  - what DealFlow is monitoring next
- Report snapshots are generated opportunistically when the authenticated dashboard renders. This keeps the first implementation simple and avoids background delivery side effects.
- Operators should use `/admin/issues` for retention gaps:
  - no saved report for a generated campaign
  - report older than 8 days
- Customer-success cadence:
  - Review stale/no-report issue rows daily during launch week.
  - For new customers, verify the first report appears after onboarding/dashboard preview.
  - For launched campaigns, review the report before day 7 and confirm the next action is clear.
  - Do not send email reports until a dedicated safe email integration, unsubscribe/suppression handling, and sender policy are implemented.

### Stuck generation

- Check active jobs for campaign and kind.
- Confirm no paid generation route is retrying unnecessarily.
- Requeue only if existing generated state is incomplete.

## Standard Validation

Run before and after production deploys:

```bash
npm run lint
npm run typecheck
npm run build
npm run schema:check
npm run plan:writes:check
npm run plan:validate
npm run test:activation-telemetry
npm run test:campaign-value-report
npm run test:subscription-lifecycle
npm run smoke:offline
SMOKE_BASE_URL=https://app.agentdealflow.io SMOKE_TEST_FUNNEL_SLUG=<published-slug> SMOKE_TEST_CAMPAIGN_ID=<campaign-id> SMOKE_TEST_EMAIL=<unique-email> npm run smoke:staging
```

## 100-Client Load Validation

Run only against production-safe routes. Do not point load tests at paid generation, Stripe payment completion, or live Meta launch routes.

Recommended pre-beta profile:

```bash
LOAD_BASE_URL=https://app.agentdealflow.io LOAD_TEST_FUNNEL_SLUG=<published-slug> npm run load:routes
LOAD_BASE_URL=https://app.agentdealflow.io LOAD_TEST_ALLOW_WRITES=true LOAD_TEST_CAMPAIGN_ID=<campaign-id> npm run load:lead-capture
```

The lead-capture profile writes test leads. Use a published QA campaign only, keep request volume modest, and never point load tests at Stripe payment completion, paid generation, or live Meta launch routes. The script enforces the thresholds below by default and refuses more than `50` lead writes unless `LOAD_MAX_WRITE_REQUESTS` is explicitly raised for a QA campaign.

Controlled-beta thresholds:

- Public page and protected-route checks: `0` unexpected `5xx` responses.
- Lead capture: duplicate submissions must return safely without creating duplicate leads.
- p95 latency should remain below `1500ms` for public page checks and below `2500ms` for lead capture.
- Stop the test and roll back if the error rate exceeds `1%`, if Supabase rate limits are hit, or if Vercel function errors spike.
