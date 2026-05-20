# DealFlow Validation Runbook

Use this runbook to choose the smallest validation suite that honestly proves the change. Do not report skipped commands as passing.

## Runtime

- Required runtime: Node 20.
- Preferred local switch: `source /Users/raiaanreza/.nvm/nvm.sh && nvm use 20.20.2`.
- Always record `node -v` in final reports for launch, provider, deployment, or security work.

## Core Commands

```bash
node -v
npm run operator:debt
npm run operator:scale-report
npm run test:onboarding-daily-budget
npm run test:scale-monitoring
npm run smoke:offline
npm run routes:security
npm run schema:check
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev --audit-level=high
git diff --check
git diff | rg -i "(api[_-]?key|secret|token|password|authorization:|bearer |sk_live|sk_test|hf_[a-z0-9])"
```

The secret-pattern scan passes when the `rg` command finds no matches.

## Pro Autopilot V1 Validation

Use `docs/autonomy-pro-autopilot-v1.md` as the source of truth for safe posture, env names, approval boundaries, scheduler commands, production-safe proof, and rollback.

Run these checks before claiming Pro Autopilot V1 readiness:

```bash
npm run autonomy:evaluate -- --dry-run
npm run autonomy:evaluate -- --campaign-id=<campaign-id> --dry-run
npm run autonomy:evaluate -- --execute-assisted-approved
npm run autonomy:report -- --json
npm run test:onboarding-daily-budget
npm run test:autonomy-execution
npm run test:autonomy-dashboard
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
git diff --check
git diff | rg -i "(api[_-]?key|secret|token|password|authorization:|bearer |sk_live|sk_test|hf_[a-z0-9])"
```

Autopilot-specific pass criteria:

- Legacy recommendation tables `campaign_action_suggestions` and `campaign_draft_actions` still exist for backward-compatible recommendations.
- New Autopilot execution tables exist locally and remotely: `autonomy_runs`, `autonomy_actions`, `autonomy_action_audit_logs`, `autonomy_rollbacks`, `autonomy_experiments`, `campaign_performance_snapshots`, `autonomy_learning_memory`, `autonomy_alerts`, `campaign_autonomy_settings`, `autonomy_execution_locks`, and `autonomy_idempotency_records`.
- RLS is enabled and forced, with member policies scoped by `private.is_current_user_org_member(organization_id)` and service-role-only execution paths for locks/idempotency.
- `/api/autonomy` and `/api/autonomy/run` are protected, same-origin guarded for mutations, Pro-entitlement gated, and not returning `executionMode: "recommendation_only"`.
- Dashboard and `/admin/control-room` both surface Autopilot state.
- Env documentation lists env names only and never includes secret values.

## Creative And Provider Commands

```bash
npm run test:creative-media-readiness
npm run test:creative-chat-intake
npm run test:video-generation-safety
npm run test:marketing-studio-worker
npm run test:higgsfield-provider-selection
npm run test:static-creative-storage
npm run test:static-creative-image-qa
npm run test:static-ad-templates
npm run test:e2e:safe
```

Run these for Marketing Studio, Higgsfield, static creative, UGC video, storage, QA, Build / Preview / Launch readiness, or customer media control changes.

`npm run test:e2e:safe` uses `scripts/run-safe-e2e.mjs`, which removes `CODEX_CI` before Playwright starts and defaults to bundled Chromium. Use `SAFE_E2E_BROWSER_CHANNEL=chrome` only when the run specifically needs the user's Chrome channel. Authenticated proof requires `SAFE_E2E_QA_AUTH=true`, `QA_AUTH_HARNESS_ENABLED=true`, Supabase service-role proof env, and `INTERNAL_SYSTEM_JOBS_SECRET` or `CRON_SECRET`; skipped authenticated proof is not a pass. Safe E2E must intercept activation and client-error telemetry writes so local proof churn cannot create production operator debt.

## Billing, Meta, SMS, Security, And Cost Commands

```bash
npm run test:provider-cost-watch
npm run test:provider-usage-idempotency
npm run test:scale-readiness-report
npm run test:scale-monitoring
npm run test:billing-free-trial
npm run test:billing-recovery
npm run test:subscription-lifecycle
npm run test:internal-sms
npm run rls:cross-tenant
npm run rls:fixture-smoke
```

RLS tests may require configured Supabase service env names and fixture safety. If unavailable, mark them skipped with the missing env names only.

## When To Run Full Suite

Run the full relevant suite when:

- Deploying production.
- Claiming controlled beta or public self-serve readiness.
- Touching auth, billing, Meta, jobs, provider, storage, launch, or campaign persistence.
- Fixing a bug that previously caused a false PASS.
- Changing shared types, schema assumptions, or route guards.

## When To Run Focused Suite

Focused validation is acceptable for docs-only changes, isolated copy changes, or narrow test-only changes. Still run:

- `node -v`
- `npm run lint`
- `npm run typecheck`
- `npm run build` when feasible
- `git diff --check`
- diff secret-pattern scan

## Skipped Command Classification

Use one of these labels:

- `skipped - not relevant`: command covers untouched area.
- `skipped - missing env`: list env names only.
- `skipped - unsafe`: would create real-world side effects.
- `skipped - unavailable tooling`: explain missing binary/package.
- `skipped - user scope`: outside explicit request.

Never write `pass` for a skipped command.

## Safe Production Smoke Endpoints

Use read-only GETs and intentionally invalid/unsigned POSTs only:

```text
GET /
GET /login
GET /privacy
GET /terms
GET /data-deletion
GET /dashboard
GET /f/raiaan-broker-toronto-on-ccbfbfce
GET /robots.txt
GET /sitemap.xml
GET /opengraph-image
invalid POST /api/lead-capture
unsigned POST /api/stripe/webhook
unsigned POST /api/webhooks/twilio/status
unauthenticated /api/internal/system-jobs
```

Expected headers to verify:

- Content-Security-Policy present.
- Strict-Transport-Security present.
- X-Frame-Options present, normally `DENY`.
- X-Content-Type-Options `nosniff`.
- Referrer-Policy present.
