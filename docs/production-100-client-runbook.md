# DealFlow OS 100-Client Controlled Beta Runbook

This runbook is for controlled beta operation at roughly 100 active client workspaces. It assumes production runs on Vercel, data is in Supabase, billing is Stripe, launch is Meta, and paid generation is guarded.

## Current Production Targets

- App: `https://dealflow-os-rebuild.vercel.app`
- Required public pages: `/privacy`, `/terms`, `/f/[slug]`
- Required public webhooks: `/api/stripe/webhook`, `/api/integrations/meta/callback`, `/api/sms/twilio`
- Public lead capture: `/api/lead-capture`
- Operator monitor: `/admin/launch-monitor`
- Operator command center: `/admin/command-center`
- Required operator access env: `INTERNAL_ADMIN_EMAILS`

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
https://dealflow-os-rebuild.vercel.app/api/stripe/webhook
```

3. Replay the event.
4. In Supabase, inspect `stripe_webhook_events` by `stripe_event_id`.
5. Expected states:
   - `processed`: event updated billing state.
   - `ignored`: event was valid but had no actionable subscription context.
   - `failed`: event was accepted but processing failed and needs operator review.
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
6. Daily budget cap must remain at or below 100 cents unless the owner explicitly approves otherwise.

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

## Paid Generation Controls

Paid media generation must not run during normal onboarding or draft creative generation.

Controls:

- Video/HeyGen generation is disabled for beta.
- Static image generation must go through the guarded static generation route.
- Provider usage is tracked in `provider_usage_limits`.
- Retries should reuse existing jobs/assets where possible.

Emergency disable:

1. Hide/disable the static generation UI entry point.
2. Keep video generation route returning `video_generation_disabled`.
3. Remove provider API keys from production only if a hard stop is required.

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

Outbound SMS automation is default-off. To enable it, all of the following must be true:

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` are configured.
- `TWILIO_OUTBOUND_SMS_ENABLED=true`.
- `SMS_COMPLIANCE_ACK=true`.
- The lead has explicit SMS consent stored in `leads.consent_metadata.sms`.
- The lead does not have `leads.sms_opted_out_at` set.

Inbound `/api/sms/twilio` must keep handling compliance keywords even when outbound automation is disabled:

- `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, and `QUIT` set `leads.sms_opted_out_at`.
- `START`, `UNSTOP`, and `SUBSCRIBE` clear the opt-out timestamp and store renewed consent metadata.
- `HELP` returns support/opt-out instructions.
- Twilio `MessageSid` is recorded on inbound `lead_messages.provider_message_id`; duplicate SIDs are treated as idempotent replays and do not trigger another automated reply.

## Support Playbook

### Failed checkout

- Confirm Stripe checkout route returns a session for the selected plan.
- Check Stripe Dashboard for session errors.
- Check `billing_subscriptions` after webhook delivery.

### Failed launch

- Check dashboard/operator monitor at `/admin/launch-monitor`.
- Confirm the signed-in operator email is included in `INTERNAL_ADMIN_EMAILS`.
- Inspect `plan.launch_runtime`.
- Inspect `meta_launch_locks`.
- Retry only after confirming no active lock and no active Meta objects were created.
- Escalate before retry if any Meta object is not `PAUSED`, if the budget cap is above 100 cents/day, or if the launch has already failed twice.

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
npm run smoke:offline
SMOKE_BASE_URL=https://dealflow-os-rebuild.vercel.app SMOKE_TEST_FUNNEL_SLUG=<published-slug> SMOKE_TEST_CAMPAIGN_ID=<campaign-id> SMOKE_TEST_EMAIL=<unique-email> npm run smoke:staging
```

## 100-Client Load Validation

Run only against production-safe routes. Do not point load tests at paid generation, Stripe payment completion, or live Meta launch routes.

Recommended pre-beta profile:

```bash
LOAD_BASE_URL=https://dealflow-os-rebuild.vercel.app LOAD_TEST_FUNNEL_SLUG=<published-slug> npm run load:routes
LOAD_BASE_URL=https://dealflow-os-rebuild.vercel.app LOAD_TEST_ALLOW_WRITES=true LOAD_TEST_CAMPAIGN_ID=<campaign-id> npm run load:lead-capture
```

The lead-capture profile writes test leads. Use a published QA campaign only, keep request volume modest, and never point load tests at Stripe payment completion, paid generation, or live Meta launch routes.

Controlled-beta thresholds:

- Public page and protected-route checks: `0` unexpected `5xx` responses.
- Lead capture: duplicate submissions must return safely without creating duplicate leads.
- p95 latency should remain below `1500ms` for public page checks and below `2500ms` for lead capture.
- Stop the test and roll back if the error rate exceeds `1%`, if Supabase rate limits are hit, or if Vercel function errors spike.
