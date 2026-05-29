# DealFlow Engineering OS Mission Templates

Use these templates to keep future work deterministic. Each mission must classify risk, list forbidden actions, define required proof, and produce artifacts.

## Shared Safety Block

Forbidden unless explicitly approved:

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
- exposing secrets, tokens, cookies, localStorage, session data, signed URLs, or env values

## Bug Fix

- Mission type: `bug_fix`
- Default risk tier: R2
- Files to inspect: failing code path, tests, related services, route handlers, runbooks, recent commits
- Safe commands: focused repro, focused tests, `npm run lint`, `npm run typecheck`, `git diff --check`
- Forbidden actions: production mutation, deploy without approval, unrelated refactor
- Required tests: focused regression plus adjacent-path checks
- Required proof: failing-before evidence when safe, passing-after artifact, changed file list
- Approval gates: deploy, production data repair, external side effect
- Done criteria: root cause fixed, regression added or justified, timeout-wrapped validation recorded
- Final report: root cause, fix, tests, proof artifacts, remaining risk

## Feature Build

- Mission type: `feature_build`
- Default risk tier: R2
- Files to inspect: existing feature patterns, routes, components, service layer, tests, docs
- Safe commands: focused tests, build, lint, typecheck
- Forbidden actions: broad redesign unless requested, deploy without approval
- Required tests: unit/service/UI tests scaled to risk
- Required proof: local validation, screenshots for UI, docs if behavior changes
- Approval gates: production env, deploy, external integrations
- Done criteria: feature works, does not regress adjacent flows, validation artifacts exist
- Final report: behavior, files, tests, proof, follow-ups

## Production Audit

- Mission type: `production_audit`
- Default risk tier: R4
- Files to inspect: routes, auth, scripts, runbooks, deploy notes, operator reports
- Safe commands: read-only inspections, safe GETs, invalid/unsigned POST probes
- Forbidden actions: real lead, Stripe, SMS/email, Meta mutation, provider generation, destructive DB
- Required tests: route security, smoke, operator reports, focused high-risk tests
- Required proof: deploy ID, alias proof, smoke artifact, operator artifact, screenshot directory when browser proof is included
- Approval gates: any production mutation
- Done criteria: no P0/P1 unproven core path remains or NO-GO is reported
- Final report: GO/NO-GO, blockers, evidence, side-effect audit

## Deployment

- Mission type: `deployment`
- Default risk tier: R3
- Files to inspect: git status, commits, package scripts, CI status, deploy config, rollback docs
- Safe commands: predeploy validation, build, deploy dry-run where supported
- Forbidden actions: actual deploy without approval
- Required tests: `npm run validate:predeploy`, production smoke after approved deploy
- Required proof: commit SHA, deploy ID, alias target, rollback target, smoke artifact
- Approval gates: deploy, rollback, env mutation
- Done criteria: alias points to intended deploy and rollback path is documented
- Final report: deploy provenance, validation, smoke, rollback command

## Browser Proof

- Mission type: `browser_proof`
- Default risk tier: R4 for production, R2 for local
- Files to inspect: route/component code when bug is suspected
- Safe commands: browser navigation, screenshots, console inspection without reading cookies/localStorage
- Forbidden actions: provider generation, live launch, Stripe checkout, sends, customer mutations
- Required tests: route matrix, screenshots, console/hydration checks, mobile width when relevant
- Required proof: screenshot paths, route matrix, console result, side-effect audit
- Approval gates: authenticated browser actions that mutate production state
- Done criteria: every listed route has artifact-backed result
- Final report: route-by-route pass/fail with screenshots

## Worker Repair

- Mission type: `worker_runtime_repair`
- Default risk tier: R4
- Files to inspect: worker script, service contracts, job payloads, operator reports, supervisor config
- Safe commands: process inspection, dry-run, contract tests
- Forbidden actions: live job execution without approval, provider generation
- Required tests: worker contract, dry-run, stale worker guard, operator debt
- Required proof: worker fingerprint, dry-run artifact, no eligible unsafe jobs
- Approval gates: starting/stopping durable production workers, running jobs
- Done criteria: one intended worker path proven, stale path blocked
- Final report: fingerprint, readiness, job safety

## Data Repair

- Mission type: `data_repair`
- Default risk tier: R5 if production, R2 if local fixture
- Files to inspect: data model, ownership checks, repair script, audit logs
- Safe commands: dry-run inventory, read-only queries, fixture tests
- Forbidden actions: production write/delete without approval
- Required tests: dry-run, idempotency, ownership, rollback/audit evidence
- Required proof: dry-run counts, proposed mutations, approval record, post-apply verification when approved
- Approval gates: all production writes/deletes
- Done criteria: no ambiguous ownership and audit row exists
- Final report: before/after, mutation count, side-effect audit

## Security Review

- Mission type: `security_review`
- Default risk tier: R2/R4 depending target
- Files to inspect: route handlers, auth helpers, RLS, webhooks, storage, env usage, logging
- Safe commands: route security tests, dependency checks, static inspection, invalid probes
- Forbidden actions: exploit against production beyond safe probes, secret extraction
- Required tests: auth/ownership, webhook signature, same-origin guard, secret redaction
- Required proof: findings with file/line evidence, commands, probe artifacts
- Approval gates: destructive exploit validation or production mutation
- Done criteria: P0/P1 either fixed or blocked with exact reason
- Final report: findings first, severity, evidence, remediation

## Creative Readiness Bug

- Mission type: `creative_readiness_bug`
- Default risk tier: R2/R4
- Files to inspect: creative readiness contract, asset persistence, worker contract, UI surfaces, launch gates
- Safe commands: creative readiness tests, image QA tests, worker dry-run
- Forbidden actions: provider generation without scoped approval, launch mutation
- Required tests: app-composed blocked, finished-ad accepted, Preview/Launch agreement
- Required proof: selected asset IDs, readiness result, UI screenshots if visible
- Approval gates: provider generation, production DB repair
- Done criteria: fake readiness cannot recur
- Final report: root cause, contract fix, proof

## Billing / Stripe Review

- Mission type: `billing_stripe_review`
- Default risk tier: R4
- Files to inspect: billing service, Stripe webhook, paywall, settings, tests
- Safe commands: billing tests, unsigned webhook probes, local fixtures
- Forbidden actions: real charge/session/customer mutation without approval
- Required tests: trial, override, active, past due, canceled, webhook signature
- Required proof: state matrix, no-charge side-effect audit
- Approval gates: real Stripe action
- Done criteria: billing copy and gates match source of truth
- Final report: state results, risks, evidence

## Meta Launch Review

- Mission type: `meta_launch_review`
- Default risk tier: R4/R5
- Files to inspect: Meta OAuth, launch payload, targeting, preflight, tests, operator reports
- Safe commands: payload fixture tests, read-only OAuth/status, no-mutation probes
- Forbidden actions: campaign/ad/adset creation, budget/audience mutation, launch/activation unless approved
- Required tests: housing category, paused status, no broad country targeting, multi-ad opt-out, selections persist
- Required proof: sanitized app state, payload test artifact, launch gate screenshot
- Approval gates: any Meta mutation
- Done criteria: unsafe activation and broad targeting cannot happen
- Final report: Meta state, payload guardrails, side-effect audit

## Frontend / UX Pass

- Mission type: `frontend_ux_pass`
- Default risk tier: R2/R4
- Files to inspect: components, routes, CSS, design patterns, accessibility helpers
- Safe commands: build, lint, browser screenshots, accessibility checks
- Forbidden actions: unrelated redesign, external sends/mutations
- Required tests: desktop/mobile route matrix, no overflow, no dead primary actions, no broken media
- Required proof: screenshots, console result, viewport sizes
- Approval gates: production user actions
- Done criteria: UI defects fixed with focused proof
- Final report: routes, screenshots, fixes, residual risk

## Incident Response

- Mission type: `incident_response`
- Default risk tier: R4/R5
- Files to inspect: recent deploys, logs, operator reports, affected code, runbooks
- Safe commands: read-only logs, safe smoke, rollback planning
- Forbidden actions: rollback/deploy/production mutation without approval unless pre-authorized incident policy exists
- Required tests: repro, blast radius, rollback readiness, post-fix validation
- Required proof: timeline, impact, root cause, mitigation, prevention
- Approval gates: deploy, rollback, production write
- Done criteria: incident stabilized or exact blocker reported
- Final report: status, impact, root cause, fix, prevention

## Engineering OS Upgrade

- Mission type: `engineering_os_upgrade`
- Default risk tier: R2
- Files to inspect: package scripts, docs, tests, workflows, validation conventions, previous runbooks
- Safe commands: syntax checks, self-tests, proof verification, local validation
- Forbidden actions: deploy, push, production mutation, external side effects
- Required tests: runner self-test, proof verify, proof latest, git diff check, safe validation
- Required proof: generated artifacts and final report JSON
- Approval gates: CI secret changes, deploy, production actions
- Done criteria: tooling exists, scripts wired, docs written, artifacts valid
- Final report: files changed, commands, proof paths, acceptance table
