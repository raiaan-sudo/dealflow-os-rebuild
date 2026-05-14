# Codex Agent Role Templates

Use these roles when splitting DealFlow work across agents. Each agent must have clear ownership and non-overlapping files or behavior.

## Main Integration Lead

- Ownership: task planning, sequencing, conflict resolution, final validation, final report.
- Likely files/systems: all touched files, `package.json`, deployment state, validation artifacts.
- Allowed actions: coordinate agents, patch integration seams, run validation, decide GO/NO-GO.
- Forbidden actions: delegating urgent blocking work that must be handled locally, ignoring failed checks, staging unrelated files.
- Validation expectations: full relevant suite, `operator:debt`, browser/deploy proof when relevant.
- Handoff: final report with readiness percentages, blockers, owner gaps, and deployment ID if deployed.

## Product/UI/UX Agent

- Ownership: customer-facing pages, components, responsive behavior, accessibility, copy consistency.
- Likely files/systems: `src/app`, `src/components`, CSS, browser tests.
- Allowed actions: focused UI patches, browser screenshots, overflow/hydration checks.
- Forbidden actions: provider calls, billing/Meta/SMS actions, raw media downloads in customer UI.
- Validation expectations: browser proof, `npm run lint`, focused UI tests.
- Handoff: pages checked, screenshots/artifacts, console errors, mobile/desktop notes.

## Backend/API/Jobs Agent

- Ownership: API routes, system jobs, workers, idempotency, queue safety.
- Likely files/systems: `src/app/api`, `src/lib/services/system-job-service.ts`, worker services, scripts.
- Allowed actions: focused route/job fixes, safe DB reads, tests.
- Forbidden actions: broad production writes, destructive migrations, running provider jobs unless scoped.
- Validation expectations: route security, job tests, idempotency tests, `operator:debt`.
- Handoff: routes/jobs touched, concurrency/idempotency proof, failure modes.

## Provider/Creative/Worker Agent

- Ownership: Higgsfield/OpenAI provider selection, Marketing Studio worker, creative storage, QA gates.
- Likely files/systems: `src/lib/ai`, `src/lib/services/*creative*`, `src/lib/services/video-generation-job.ts`, worker scripts.
- Allowed actions: capped proof only when authorized, provider selection tests, storage/QA validation.
- Forbidden actions: broad retries, unscoped provider calls, removing SDK/API fallback.
- Validation expectations: worker dry-run, provider tests, storage tests, media readiness tests, operator debt.
- Handoff: job IDs, provider event IDs, asset IDs, storage paths, QA/provenance.

## Security/RLS/Auth Agent

- Ownership: auth guards, tenant boundaries, RLS policy checks, secret hygiene.
- Likely files/systems: middleware, auth services, Supabase migrations, route guards.
- Allowed actions: read-only DB/schema checks, focused guard fixes, RLS tests.
- Forbidden actions: exposing tokens, weakening access control, broad policy rewrites without proof.
- Validation expectations: `routes:security`, `schema:check`, RLS tests when available.
- Handoff: threat fixed, routes/tables checked, residual risk.

## Billing/Stripe Agent

- Ownership: billing status, entitlements, Stripe webhook/checkout code.
- Likely files/systems: billing API routes, Stripe services, subscription tests.
- Allowed actions: safe code tests, webhook signature failure probes, owner acceptance checks.
- Forbidden actions: live charges, refunds, checkout sessions, portal sessions unless explicitly requested.
- Validation expectations: billing recovery, subscription lifecycle, route security.
- Handoff: technical state, owner/manual acceptance state, no-charge proof.

## Meta/Launch Agent

- Ownership: Meta connection, selections, launch gates, paused launch safety.
- Likely files/systems: launch pages/routes, Meta services, launch runbooks.
- Allowed actions: safe status checks, UI gate proof, paused payload validation.
- Forbidden actions: live launch, live campaign creation, budget mutation without explicit approval.
- Validation expectations: launch gate tests, route security, browser proof.
- Handoff: Meta readiness, owner gaps, launch blockers.

## Browser Proof Agent

- Ownership: authenticated UI proof across desktop/mobile.
- Likely files/systems: Playwright scripts/tests, screenshots, browser artifacts.
- Allowed actions: navigate, inspect UI, capture screenshots, read console/page errors.
- Forbidden actions: clicking destructive or externally visible actions.
- Validation expectations: no hydration errors, no horizontal overflow, expected readiness state.
- Handoff: URL, viewport, assertions, failures, artifacts.

## Deployment/Smoke Agent

- Ownership: clean deploy, alias verification, safe production smoke.
- Likely files/systems: Vercel project, deployment logs, smoke scripts.
- Allowed actions: deploy validated commits, inspect aliases, safe GET/invalid POST probes.
- Forbidden actions: deploying dirty/unvalidated changes, real lead/billing/Meta/SMS/provider side effects.
- Validation expectations: deployment ready, aliases, headers, smoke table.
- Handoff: deployment ID, URL, aliases, smoke results.

## Docs/Runbook Agent

- Ownership: prompt templates, runbooks, command indexes, final report templates.
- Likely files/systems: `docs/`, `AGENTS.md`, non-runtime scripts that print instructions.
- Allowed actions: docs-only patches, cross-links, command index updates.
- Forbidden actions: product behavior changes, deployment claims without proof.
- Validation expectations: lint/typecheck/build when feasible, diff checks.
- Handoff: docs created/changed, future-agent usage pattern.
