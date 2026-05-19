# Codex Command Index

Use Node 20 for every command.

```bash
source /Users/raiaanreza/.nvm/nvm.sh && nvm use 20.20.2
node -v
```

## Common Validation

```bash
npm run operator:debt
npm run operator:scale-report
npm run test:onboarding-daily-budget
npm run test:scale-monitoring
npm run routes:security
npm run smoke:offline
npm run schema:check
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev --audit-level=high
git diff --check
git diff | rg -i "(api[_-]?key|secret|token|password|authorization:|bearer |sk_live|sk_test|hf_[a-z0-9])"
```

## Pro Autopilot V1

Primary runbook:

- `docs/autonomy-pro-autopilot-v1.md`

Readiness commands:

```bash
npm run autonomy:evaluate -- --dry-run
npm run autonomy:evaluate -- --campaign-id=<campaign-id> --dry-run
npm run autonomy:evaluate -- --execute-assisted-approved
npm run autonomy:report -- --json
npm run test:autonomy-execution
npm run test:autonomy-dashboard
npm run test:onboarding-daily-budget
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

Required proof boundaries:

- Do not deploy from this command index.
- Safe production proof is read-only GET plus intentionally invalid or unsigned POST only.
- `/api/autonomy` and `/api/autonomy/run` must not return `executionMode: "recommendation_only"` for a Pro Autopilot readiness claim.
- New Autopilot tables must include `autonomy_runs`, `autonomy_actions`, `autonomy_action_audit_logs`, `autonomy_rollbacks`, `autonomy_experiments`, `campaign_performance_snapshots`, `autonomy_learning_memory`, `autonomy_alerts`, `campaign_autonomy_settings`, `autonomy_execution_locks`, and `autonomy_idempotency_records`.
- Dashboard and `/admin/control-room` must both surface Autopilot state.
- Env reports must list names only and never values.

## Creative And Provider

```bash
npm run test:creative-media-readiness
npm run test:creative-chat-intake
npm run test:video-generation-safety
npm run test:marketing-studio-worker
npm run test:higgsfield-provider-selection
npm run test:static-creative-storage
npm run test:static-creative-image-qa
npm run test:static-ad-templates
npm run test:provider-cost-watch
npm run test:provider-usage-idempotency
npm run test:scale-readiness-report
npm run test:scale-monitoring
```

## Worker Dry-Run

Use env names only in reports. Do not print values.

```bash
MARKETING_STUDIO_WORKER_ENABLED=true \
MEDIA_GENERATION_PROVIDER=higgsfield_marketing_studio \
HIGGSFIELD_MARKETING_STUDIO_ENABLED=true \
HIGGSFIELD_MARKETING_STUDIO_MODE=cli \
HIGGSFIELD_CLI_ENABLED=true \
HIGGSFIELD_CLI_PATH="<path>" \
HIGGSFIELD_CONFIG_HOME="<config-home>" \
HIGGSFIELD_CACHE_DIR="<cache-dir>" \
HIGGSFIELD_UGC_VIDEO_MODEL=marketing_studio_video \
ALLOW_HIGGSFIELD_IMAGE_GENERATION=true \
ALLOW_HIGGSFIELD_VIDEO_GENERATION=true \
FINISHED_AD_VISION_QA_ENABLED=true \
npm run worker:marketing-studio -- --dry-run
```

## Capped Marketing Studio Worker Proof

Only run after explicit authorization.

```bash
npm run worker:marketing-studio -- --max-jobs=1
```

Rules:

- Confirm exactly one eligible scoped job first.
- No automatic retry.
- Stop on first outcome.
- Record job ID, provider usage event ID, provider job/result ID, asset ID, storage path, and QA/provenance.

## Safe Production Smoke

Use read-only GETs and intentionally invalid/unsigned POST probes:

```text
GET https://app.agentdealflow.io/
GET https://app.agentdealflow.io/login
GET https://app.agentdealflow.io/privacy
GET https://app.agentdealflow.io/terms
GET https://app.agentdealflow.io/data-deletion
GET https://app.agentdealflow.io/dashboard
GET https://app.agentdealflow.io/f/raiaan-broker-toronto-on-ccbfbfce
GET https://app.agentdealflow.io/robots.txt
GET https://app.agentdealflow.io/sitemap.xml
GET https://app.agentdealflow.io/opengraph-image
invalid POST https://app.agentdealflow.io/api/lead-capture
unsigned POST https://app.agentdealflow.io/api/stripe/webhook
unsigned POST https://app.agentdealflow.io/api/webhooks/twilio/status
unauthenticated GET https://app.agentdealflow.io/api/internal/system-jobs
```

## Billing, Meta, SMS, And RLS

```bash
npm run test:billing-recovery
npm run test:billing-free-trial
npm run test:subscription-lifecycle
npm run test:internal-sms
npm run rls:cross-tenant
npm run rls:fixture-smoke
```

## Outbound Copy OS

Use this for docs-only cold call, SMS, voicemail, objection, offer, and
copy-scoring work. It is print-only and must not send messages, create
campaigns, run provider generation, or mutate production data.

```bash
npm run copy:validate
```

Primary docs:

- `docs/outbound-copy-os/README.md`
- `docs/outbound-copy-os/compliance-guardrails.md`
- `docs/outbound-copy-os/cold-call-framework.md`
- `docs/outbound-copy-os/cold-sms-framework.md`
- `docs/outbound-copy-os/copy-scoring-rubric.md`
- `docs/outbound-copy-os/prompts/`
- `docs/outbound-copy-os/examples/`

## Artifacts

- Playwright safe proof output: `test-results/`
- Vercel deployment inspect output: CLI terminal or Vercel project page.
- Generated screenshots should be placed under a task-specific temp or artifact directory, not committed unless requested.

## Env Names

Mention env names only, never values. Common proof env names:

- `MARKETING_STUDIO_WORKER_ENABLED`
- `MEDIA_GENERATION_PROVIDER`
- `MEDIA_GENERATION_FALLBACK_PROVIDER`
- `HIGGSFIELD_MARKETING_STUDIO_ENABLED`
- `HIGGSFIELD_MARKETING_STUDIO_MODE`
- `HIGGSFIELD_CLI_ENABLED`
- `HIGGSFIELD_CLI_PATH`
- `HIGGSFIELD_CONFIG_HOME`
- `HIGGSFIELD_CACHE_DIR`
- `HIGGSFIELD_UGC_VIDEO_MODEL`
- `ALLOW_HIGGSFIELD_IMAGE_GENERATION`
- `ALLOW_HIGGSFIELD_VIDEO_GENERATION`
- `FINISHED_AD_VISION_QA_ENABLED`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTERNAL_SYSTEM_JOBS_SECRET`
- `DEALFLOW_PLATFORM_LAUNCH_DOMAIN`
- `DEALFLOW_PLATFORM_FUNNEL_HOSTS`
- `DEALFLOW_PLATFORM_LAUNCH_DOMAIN_VERIFIED`
- `ALLOW_QA_GENERATION_CREDIT_OVERRIDE`
- `QA_GENERATION_CREDIT_OVERRIDE_EMAILS`
- `QA_GENERATION_CREDIT_OVERRIDE_USER_IDS`
- `QA_GENERATION_CREDIT_OVERRIDE_ORG_IDS`
- `QA_GENERATION_CREDIT_OVERRIDE_CAMPAIGN_IDS`
- `QA_GENERATION_CREDIT_OVERRIDE_MAX_CENTS`
- `ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE`
- `QA_BILLING_ACCEPTANCE_OVERRIDE_EMAILS`
- `QA_BILLING_ACCEPTANCE_OVERRIDE_USER_IDS`
- `QA_BILLING_ACCEPTANCE_OVERRIDE_ORG_IDS`
- `QA_BILLING_ACCEPTANCE_OVERRIDE_CAMPAIGN_IDS`
- `QA_BILLING_ACCEPTANCE_OVERRIDE_PLAN_TIERS`
