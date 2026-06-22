# DealFlow Pro Autopilot V1 Runbook

This runbook defines the production-safe posture for Pro Autopilot V1. It documents env names only, safe operating modes, proof boundaries, validation gates, and rollback. It does not authorize deployment, provider spend, SMS, Stripe charges, Meta activation, or destructive database work.

## Default Safe Posture

Pro Autopilot must fail closed by default.

- Manual mode is the default customer-safe posture.
- Assisted mode may stage recommendations and draft in-app actions for review.
- Autonomous mode may run only explicitly safe in-app actions after entitlement, same-origin, tenant, billing, route-security, RLS, and budget/cap checks pass.
- Missing env, missing provider readiness, missing billing entitlement, stale Meta proof, or missing dashboard/control-room visibility must block execution and leave an auditable blocked action.
- Routes must not be recommendation-only when claiming Pro Autopilot V1 execution readiness. If `/api/autonomy` or `/api/autonomy/run` still returns `executionMode: "recommendation_only"`, the launch gate is not complete.

## Env Names

Mention names only in reports. Never print values.

Autonomy feature flags:

- `AUTONOMY_EXECUTION_ENABLED`
- `AUTONOMY_AUTOPILOT_ENABLED`
- `AUTONOMY_META_MUTATIONS_ENABLED`
- `AUTONOMY_DRY_RUN_ONLY`
- `AUTONOMY_MAX_ACTIONS_PER_CAMPAIGN_PER_DAY`
- `AUTONOMY_MAX_META_MUTATIONS_PER_CAMPAIGN_PER_DAY`
- `AUTONOMY_ALLOW_BUDGET_INCREASES`
- `AUTONOMY_MAX_DAILY_BUDGET_INCREASE_PERCENT`
- `AUTONOMY_MAX_WEEKLY_BUDGET_INCREASE_PERCENT`
- `AUTONOMY_ALERTS_ENABLED`
- `AUTONOMY_PROVIDER_GENERATION_ENABLED`
- `AUTONOMY_FUNNEL_PUBLISHING_ENABLED`
- `AUTONOMY_AUDIENCE_CHANGES_ENABLED`
- `AUTONOMY_PROVIDER_CREDIT_SPEND_ENABLED`

Default values must keep the product in dry-run or assisted mode: no silent budget increases, provider generation off, Meta mutations off, funnel publishing off, audience changes off, and provider credit spend off unless explicitly enabled for the scoped proof.

Core app and internal runner:

- `NEXT_PUBLIC_APP_URL`
- `INTERNAL_SYSTEM_JOBS_SECRET`
- `CRON_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Scale monitor and alert routing:

- `SCALE_MONITOR_SMOKE_ENABLED`
- `SCALE_MONITOR_ALIAS_URLS`
- `SCALE_MONITOR_EXPECTED_DEPLOY_ID`
- `SCALE_MONITOR_SLACK_WEBHOOK_URL`
- `SCALE_MONITOR_ALERT_EMAIL_TO`

Billing and entitlement safety:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STARTER_PRICE_ID`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_GROWTH_PRICE_ID`
- `BILLING_CHECKOUT_SAFE_MODE`
- `ALLOW_BILLING_ADMIN_OVERRIDE`
- `BILLING_ADMIN_OVERRIDE_EMAILS`
- `ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE`
- `QA_BILLING_ACCEPTANCE_OVERRIDE_EMAILS`
- `QA_BILLING_ACCEPTANCE_OVERRIDE_USER_IDS`
- `QA_BILLING_ACCEPTANCE_OVERRIDE_ORG_IDS`
- `QA_BILLING_ACCEPTANCE_OVERRIDE_CAMPAIGN_IDS`
- `QA_BILLING_ACCEPTANCE_OVERRIDE_PLAN_TIERS`

Meta safety:

- `META_EXECUTION_MODE`
- `ALLOW_META_LIVE_LAUNCH`
- `META_DAILY_BUDGET_CAP_CENTS`
- `DEALFLOW_PLATFORM_LAUNCH_DOMAIN`
- `DEALFLOW_PLATFORM_FUNNEL_HOSTS`
- `DEALFLOW_PLATFORM_LAUNCH_DOMAIN_VERIFIED`
- `META_AD_ACCOUNT_ID`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI`
- `META_TOKEN_ENCRYPTION_KEY`
- `META_SCOPES`

Provider and creative safety:

- `MEDIA_GENERATION_PROVIDER`
- `MEDIA_GENERATION_FALLBACK_PROVIDER`
- `MARKETING_STUDIO_WORKER_ENABLED`
- `ALLOW_HIGGSFIELD_IMAGE_GENERATION`
- `ALLOW_HIGGSFIELD_VIDEO_GENERATION`
- `HIGGSFIELD_MARKETING_STUDIO_ENABLED`
- `HIGGSFIELD_MARKETING_STUDIO_MODE`
- `HIGGSFIELD_CLI_ENABLED`
- `HIGGSFIELD_CLI_PATH`
- `HIGGSFIELD_CONFIG_HOME`
- `HIGGSFIELD_CACHE_DIR`
- `HIGGSFIELD_OUTPUT_DIR`
- `MARKETING_STUDIO_WORKER_OUTPUT_DIR`
- `FINISHED_AD_VISION_QA_ENABLED`
- `HIGGSFIELD_IMAGE_DAILY_LIMIT`
- `HIGGSFIELD_VIDEO_DAILY_LIMIT`
- `GENERATION_CREDIT_OVERDRAFT_LIMIT_CENTS`
- `ALLOW_QA_GENERATION_CREDIT_OVERRIDE`
- `QA_GENERATION_CREDIT_OVERRIDE_EMAILS`
- `QA_GENERATION_CREDIT_OVERRIDE_USER_IDS`
- `QA_GENERATION_CREDIT_OVERRIDE_ORG_IDS`
- `QA_GENERATION_CREDIT_OVERRIDE_CAMPAIGN_IDS`
- `QA_GENERATION_CREDIT_OVERRIDE_MAX_CENTS`

Lead/SMS and support safety:

- `INTERNAL_LEAD_SMS_ENABLED`
- `SMS_MOCK_MODE`
- `TEST_SMS_MODE`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `FRESHDESK_DOMAIN`
- `FRESHDESK_API_KEY`
- `FRESHDESK_PRODUCT_ID`
- `FRESHDESK_GROUP_ID`

## Modes

Manual:

- Shows recommendations and current campaign state.
- Does not stage, approve, apply, retry, send, spend, or launch.

Assisted:

- May create or update app-owned recommendation and draft-action rows.
- May surface actions in the dashboard/control room.
- Requires a human approval path before any provider-facing or customer-facing side effect.

Autonomous:

- May execute only safe in-app actions explicitly listed in this runbook.
- Must record action status, blocked reason, expected outcome, actual outcome when available, and guardrail summary.
- Must fail closed when a requested action crosses into approval-required or never-allowed territory.

## Allowed Safe Actions

These actions are allowed without extra owner approval when entitlement, auth, tenant, route, RLS, and billing checks pass:

- Read campaign plans, latest Meta sync snapshots, aggregate performance, campaign value reports, provider usage summaries, and operator issue rows.
- Generate deterministic recommendations from existing app-owned data.
- Insert or update app-owned rows in `campaign_action_suggestions` and `campaign_draft_actions`.
- Mark app-owned autonomy actions as blocked, dismissed, or queued for approval.
- Refresh dashboard/control-room Autopilot state from durable app rows.
- Run local validation commands.
- Run safe production smoke using read-only GETs and intentionally invalid or unsigned POST probes only.

## Approval-Required Actions

These actions require explicit owner/operator approval for the exact scope and recipient/account/campaign:

- Running a capped Marketing Studio worker proof with provider calls.
- Retrying a provider, SMS, Stripe, Meta, lead side-effect, or dead-letter job.
- Sending internal lead-alert SMS.
- Creating a Freshdesk QA ticket.
- Running Stripe test proof or any Stripe object mutation.
- Creating paused Meta campaign/ad set/ad objects.
- Increasing any budget cap, daily provider cap, generation-credit overdraft, or Meta budget.
- Applying a customer-visible campaign edit that changes live traffic behavior.
- Applying a database backfill or repair outside local validation.

## Never-Allowed Actions

These are never allowed from Pro Autopilot V1 validation or monitoring:

- Expose secrets, tokens, API keys, private keys, customer PII, prospect PII, cookies, auth headers, provider payloads, or raw stack payloads.
- Submit real leads unless the owner has approved the exact QA campaign and recipient for that proof.
- Send lead-facing outbound SMS or email.
- Create live Stripe charges or customer billing mutations outside the approved Stripe flow.
- Activate Meta campaigns, ad sets, or ads, or increase live spend without explicit live-spend activation approval.
- Delete production data, truncate tables, disable RLS, bypass tenant checks, or weaken auth.
- Make `/api/internal/*` public.
- Trigger provider generation from GET requests or page render.
- Automatically retry side-effecting jobs after a failed proof.

## Scheduler Commands

Vercel Cron:

- `/api/internal/system-jobs` every minute.
- `/api/internal/scale-monitor` every 15 minutes.

Local/operator commands:

```bash
source /Users/raiaanreza/.nvm/nvm.sh && nvm use 20.20.2
node -v
npm run autonomy:evaluate -- --dry-run
npm run autonomy:evaluate -- --campaign-id=<campaign-id> --dry-run
npm run autonomy:evaluate -- --execute-assisted-approved
npm run autonomy:report -- --json
npm run test:autonomy-execution
npm run test:autonomy-dashboard
npm run routes:security
npm run schema:check
npm run smoke:offline
npm run operator:debt
npm run operator:scale-report
npm run test:scale-monitoring
git diff --check
git diff | rg -i "(api[_-]?key|secret|token|password|authorization:|bearer |sk_live|sk_test|hf_[a-z0-9])"
```

Provider worker proof commands are not routine scheduler commands. Run them only after explicit approval:

```bash
npm run worker:marketing-studio -- --dry-run
npm run worker:marketing-studio -- --max-jobs=1
```

## Production-Safe Proof Boundaries

Safe production proof may use:

- `GET /`
- `GET /login`
- `GET /privacy`
- `GET /terms`
- `GET /data-deletion`
- `GET /dashboard`
- `GET /f/<published-slug>`
- `GET /robots.txt`
- `GET /sitemap.xml`
- `GET /opengraph-image`
- invalid `POST /api/lead-capture`
- unsigned `POST /api/stripe/webhook`
- unsigned `POST /api/webhooks/twilio/status`
- unauthenticated `GET /api/internal/system-jobs`

Safe proof must not use real customer credentials, real leads, real SMS recipients, live provider generation, Stripe payment completion, Meta live activation, or destructive database operations.

## Dashboard And Control Room Surfacing

Before any Pro Autopilot V1 readiness claim:

- Customer dashboard must show Autopilot mode, recommendations, staged actions, executed actions, blocked actions, confidence, budget impact, blocked reason, and last execution/sync timestamp.
- `/admin/control-room` must show Autopilot queue/applied/blocked counts or a clearly labeled Autopilot health panel backed by durable rows.
- `/admin/command-center` and `/admin/issues` may summarize related issues, but they do not replace the required control-room surface.
- Empty, blocked, degraded, and stale-sync states must be visible without implying live execution.

## Validation Gates

Run the smallest honest suite for docs-only edits. Run the full suite before any deployment or Pro Autopilot readiness claim:

```bash
npm run routes:security
npm run schema:check
npm run smoke:offline
npm run rls:fixture-smoke
npm run rls:cross-tenant
npm run operator:debt
npm run test:scale-monitoring
npm run lint
npm run typecheck
npm run build
```

Expected Autopilot-specific proof:

- `campaign_action_suggestions` and `campaign_draft_actions` exist locally and remotely.
- RLS is enabled and forced on both tables.
- Member policies are scoped by `auth.uid() = user_id` and `private.is_current_user_org_member(organization_id)`.
- Service-role policies exist for backend-owned execution paths.
- `/api/autonomy` and `/api/autonomy/run` are protected routes, same-origin guarded for mutations, Pro-entitlement gated, and not recommendation-only.
- Dashboard and control-room Autopilot surfaces exist.
- Env docs list names only and do not include secret values.

## Rollback Plan

1. Disable side effects first by leaving generation, SMS, Meta live launch, support ticket, and billing safe-mode envs in their fail-closed posture.
2. If a bad production deployment shipped, promote the last known-good Vercel deployment.
3. Confirm safe smoke only:
   - `/login` returns `200`.
   - `/dashboard` redirects unauthenticated users.
   - `/f/<published-slug>` returns `200`.
   - invalid `/api/lead-capture` returns `400` or rate limit.
   - unsigned Stripe webhook returns `400`.
   - unsigned Twilio status webhook returns `401`.
   - unauthenticated internal runner returns `401`.
4. Run `npm run routes:security`, `npm run smoke:offline`, `npm run operator:debt`, and `npm run schema:check` from the rollback checkout when env is available.
5. Do not manually roll back additive schema migrations unless a separate audited database recovery plan exists.
