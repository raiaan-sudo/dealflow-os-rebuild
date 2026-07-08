# 2026-07-08 Autonomous Full-Stack Remediation Pass

Branch: `autonomous/full-stack-remediation-2026-07-08`

## Scope

This pass remediates the safe code, test, CI, and documentation gaps from the full-stack audit. It does not submit production leads, mutate Meta/Stripe/Twilio/GHL production systems, run destructive migrations, or deploy production.

## Closure Matrix

| Finding | Status | Disposition |
| --- | --- | --- |
| F001 public funnel telemetry 403 | Fixed in code, locally guarded | Trusted public aliases are included in centralized origin resolution; wildcard origins are ignored; `/api/client-errors` keeps same-origin, rate limit, bounded payload, event allowlist, and PII redaction. |
| F002 Meta instant-form mismatch | Fail-closed and contract-guarded | `instant_form` / `meta_instant_form` no longer silently proceeds to website-link ads. A pure question-mapping/hash contract exists for the future real leadgen implementation. |
| F003 homepage copy regression | Fixed | Test now asserts sign-in intent case-insensitively while still rejecting campaign-launch wording. |
| F004 performance | Guarded, follow-up remains | Lighthouse budgets remain in place and `perf:budgets` is CI-checkable. Login LCP needs a real before/after browser benchmark after deploy/staging. |
| F005 CRM skipped mapping | Guarded and visible | Fulfillment monitor/runbook/contract test keep CRM mapping status explicit. Lead capture remains independent of CRM sync. |
| F006 test-infra gaps | Improved | Added Playwright harness scaffold, browser harness guard, RLS static fixture guard, API/AuthZ/webhook contract guards, and provider mock/fail-closed tests. Live provider proof remains credential-blocked. |
| F007 CSP inline allowances | Guarded, phased hardening remains | Security header contract blocks accidental header regression. Full nonce/hash CSP removal of inline allowances remains a separate hardening project. |
| F008 load-test write safety | Fixed | Lead-write load tests now hard-block production writes unless explicit production confirmation, target env, dry-run off, and side-effect safety flags are set. |

## Files Changed

- `.env.example`: documents trusted funnel aliases and instant-form feature gate.
- `.github/workflows/ci.yml`: adds remediation contract gates.
- `package.json` / `package-lock.json`: adds scripts and Playwright dev dependency.
- `playwright.config.ts`, `tests/e2e/public-funnel.spec.ts`: repeatable public browser harness.
- `src/lib/api/route.ts`: centralized trusted origin resolver.
- `src/app/api/client-errors/route.ts`: telemetry event/source allowlist.
- `src/lib/integrations/meta/instant-form-contract.ts`: deterministic Meta instant-form question mapping/hash contract.
- `src/lib/integrations/meta/provider.ts`: fail-closed instant-form guard before publishing state.
- `src/lib/services/campaign-execution-service.ts`: destination-mode normalization and fail-closed launch validation.
- `src/lib/types/campaign-execution.ts`: explicit website/instant-form destination modes.
- `scripts/*.mjs`: regression guards for telemetry, Meta, CRM, load safety, API security, AuthZ, RLS, webhooks, browser harness, and performance budgets.
- `docs/follow-ups/*.md`: exact external proof steps.
- `docs/production-100-client-runbook.md`: load-write safety language.

## External Proof Blockers

The following remain intentionally blocked until approved test assets exist:

- Meta staging ad account/Page/pixel with Lead Ads Testing Tool access.
- Stripe test-mode keys and webhook endpoint for access-key checkout E2E.
- Twilio approved test phone/log access.
- GHL test location/pipeline/stage/contact write approval.
- Vercel log access for server-side production error proof.
- Seeded staging/local authenticated test account for full app journey.

Each blocked item is fail-closed or guarded by tests/docs so it does not silently appear complete.

## Required Final Gates

Run the final commands listed in the remediation report before merge. Do not deploy production unless all code-safe gates pass and any live side-effect proof uses approved test assets only.
