# DealFlow Engineering OS V1

## Purpose

Engineering OS V1 makes DealFlow engineering work deterministic, timeout-controlled, evidence-backed, and safer to resume after context loss. It does not replace engineering judgment. It gives every mission a repeatable validation path, proof artifact registry, severity model, approval gates, and CI contract.

V1 is intentionally small:

- command timeout wrapper
- proof artifact writer, verifier, and summarizer
- predeploy validation runner
- postdeploy safe-probe runner
- GitHub Actions CI
- mission classification helper
- operating doctrine and mission templates

V1 intentionally does not build:

- a web dashboard
- production mutation automation
- provider generation automation
- deploy/rollback automation without approval
- browser proof automation for authenticated customer sessions
- secret or environment management

## Command Timeout Model

All long-running validation commands should run through `scripts/run-with-timeout.mjs`. The runner classifies every result as one of:

- `pass`
- `fail`
- `timeout`
- `skipped`
- `not_run`

Skipped is never treated as passed. Timeout is never silently downgraded.

Default timeout policy:

| Command Type | Timeout |
| --- | ---: |
| `lint` | 180s |
| `typecheck` | 300s |
| `build` | 600s |
| `smoke:offline` | 300s |
| `routes:security` | 180s |
| focused tests | 300s |
| operator reports | 120s |
| browser proof | 900s |
| full predeploy | 1800s |

Examples:

```bash
npm run proof:self-test
npm run validate:predeploy -- --mission-id local-predeploy-$(date +%s)
npm run validate:postdeploy -- --mission-id safe-smoke-$(date +%s) --base-url https://app.agentdealflow.io
```

## Proof Registry Model

Proof artifacts live under:

```text
data/engineering-proof-artifacts/YYYY-MM-DD/
```

Recommended structure:

```text
proof-*.json
stdout/
stderr/
screenshots/
proof-summary.json
final-report.json
```

Every proof artifact records:

- mission ID
- command
- status
- duration
- timeout
- stdout/stderr artifact paths
- repo context
- environment
- deploy ID when applicable
- route and screenshot references when applicable
- side-effect classification
- redaction state
- notes

## Proof Artifact Schema

Each proof JSON follows artifact version `1.0`:

```json
{
  "artifact_version": "1.0",
  "proof_id": "string",
  "mission_id": "string",
  "created_at": "ISO timestamp",
  "started_at": "ISO timestamp|null",
  "finished_at": "ISO timestamp|null",
  "repo_path": "string|null",
  "git_remote_url_redacted": "string|null",
  "commit_sha": "string|null",
  "branch": "string|null",
  "package_manager": "npm|pnpm|yarn|unknown",
  "node_version": "string|null",
  "npm_version": "string|null",
  "environment": "local|preview|production|ci",
  "validation_suite": "string|null",
  "script_name": "string|null",
  "command": "string",
  "status": "pass|fail|timeout|skipped|not_run",
  "duration_ms": 0,
  "timeout_ms": 0,
  "timed_out": false,
  "exit_code": 0,
  "signal": "string|null",
  "stdout_path": "string|null",
  "stderr_path": "string|null",
  "deploy_id": "string|null",
  "routes_checked": [],
  "screenshots": [],
  "side_effects": "none|documented",
  "redaction_applied": true,
  "notes": "string"
}
```

Validate artifacts with:

```bash
npm run proof:verify
```

Summarize latest artifacts with:

```bash
npm run proof:latest
```

## Validation Commands

### Predeploy

```bash
npm run validate:predeploy -- --mission-id <mission-id>
```

The predeploy suite uses existing repo scripts:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run smoke:offline`
- `npm run routes:security`
- optional creative/billing/support tests if present
- `git diff --check`

Missing optional scripts are recorded as `skipped` with `script_not_defined`. Required failures make the suite fail.

### Postdeploy Safe Probes

```bash
npm run validate:postdeploy -- --mission-id <mission-id> --base-url https://app.agentdealflow.io
```

Safe postdeploy probes may use:

- read-only GETs
- intentionally invalid lead capture POSTs
- unsigned webhook POSTs
- unauthenticated internal route probes

Safe postdeploy probes must never:

- submit a real lead
- create Stripe checkout/session/charge
- send SMS/email
- create a Freshdesk ticket
- mutate Meta
- publish a funnel
- run provider generation
- mutate customer data

If no deploy URL is configured or provided, postdeploy records `not_run` with `deploy_target_missing`.

## CI Contract

`.github/workflows/ci.yml` runs:

- checkout
- Node `20.20.2`
- deterministic install with `npm ci` when `package-lock.json` exists
- `npm run validate:predeploy`
- proof summary and verification
- proof artifact upload

CI rules:

- least-privilege `contents: read`
- duplicate branch runs cancel in progress
- no deploy
- no production secrets
- no provider, Stripe, Meta, SMS/email, Freshdesk, or production mutation
- fail closed when required validation fails

## Mission Classification

Mission types:

- `bug_fix`
- `feature_build`
- `production_audit`
- `deployment`
- `browser_proof`
- `data_repair`
- `worker_runtime_repair`
- `security_review`
- `performance_accessibility_pass`
- `prompt_spec_creation`
- `incident_response`
- `creative_readiness_bug`
- `billing_stripe_review`
- `meta_launch_review`
- `frontend_ux_pass`
- `engineering_os_upgrade`

Risk tiers:

| Tier | Meaning | Default Permission |
| --- | --- | --- |
| R0 | read-only docs/prompt/research | proceed |
| R1 | local code/docs only | proceed |
| R2 | local code plus tests | proceed |
| R3 | deploy-capable, no production mutation | validate before deploy; deploy requires approval |
| R4 | production read-only/safe probes | safe probes only |
| R5 | production mutation or external side effect | explicit approval required |

Use:

```bash
npm run engineering:classify -- --mission-type meta_launch_review
```

## Severity Definitions

| Severity | Definition |
| --- | --- |
| P0 | Security breach, data loss, unauthorized charge/send/launch, cross-tenant access, destructive production impact, secret exposure. |
| P1 | Core customer journey broken, launch-blocking workflow failure, incorrect billing/Meta/creative readiness state, stale worker processing live jobs, production deploy mismatch, CI unable to run required safety gates. |
| P2 | Important hardening, proof gap, reliability issue, operator script instability, incomplete browser/mobile proof, monitoring gap, missing artifact coverage. |
| P3 | Cleanup, polish, documentation improvement, non-blocking UX improvement, future optimization. |

## Approval Gates

Explicit approval is required for:

- deploy
- rollback
- production DB write
- provider generation
- Stripe action
- Meta action
- SMS/email send
- Freshdesk ticket
- QA auth env add/remove/update
- worker job execution
- destructive command
- public/customer-facing action
- changing live configuration

## Artifact Redaction Policy

Artifacts must redact:

- tokens
- cookies
- authorization headers
- service-role keys
- Stripe keys
- Meta tokens
- Supabase secrets
- Vercel tokens
- private keys
- session data
- customer credentials

Do not inspect browser cookies, localStorage, sessionStorage, auth tokens, or saved passwords unless explicitly authorized.

## Dirty Worktree Policy

- Do not overwrite unrelated user changes.
- Do not revert unrelated user changes.
- Do not delete unrelated files.
- Do not format unrelated files.
- Do not touch untracked files unless they are part of the mission.
- If a needed file has unrelated edits, make the smallest scoped change.
- If unrelated changes make the task impossible, report the conflict instead of reverting.

## Final Report Evidence Standard

Every final claim must be one of:

- `CONFIRMED` with proof artifact, command, file, screenshot, deploy ID, or log reference
- `NOT PROVEN`
- `SKIPPED` with reason
- `BLOCKED` with reason

No production claim is complete without commit, branch, deploy ID, alias proof, and rollback target when a deployment occurred.
