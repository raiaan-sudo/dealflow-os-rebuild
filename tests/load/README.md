# DealFlow Full-Stack Performance, Rate-Limit, and Reliability Suite

This suite proves DealFlow performance without unsafe production side effects.

Default target is staging, preview, or local. Production is allowed only for small read-only smoke and invalid/unsigned probes unless explicitly approved.

## Safety Defaults

Forbidden by default:

- production write load
- real Stripe checkout/session/charge
- real SMS/email
- real Meta mutation or launch
- real provider generation
- destructive DB writes
- customer data mutation
- real lead creation

Allowed by default:

- local/staging/preview load tests
- production read-only route smoke
- invalid payload probes
- unsigned webhook rejection probes
- mocked provider, SMS, Meta, and Stripe flows

## Commands

Safe production/read-only smoke:

```bash
PERFORMANCE_BASE_URL=https://app.agentdealflow.io npm run test:load:smoke
```

Safe invalid rate-limit probe:

```bash
PERFORMANCE_BASE_URL=https://app.agentdealflow.io npm run test:ratelimit
```

Staging load matrix:

```bash
PERFORMANCE_BASE_URL=https://staging.example.com npm run test:load:100
PERFORMANCE_BASE_URL=https://staging.example.com npm run test:load:300
PERFORMANCE_BASE_URL=https://staging.example.com npm run test:load:500
PERFORMANCE_BASE_URL=https://staging.example.com npm run test:load:1000
```

Full performance audit:

```bash
PERFORMANCE_BASE_URL=https://staging.example.com npm run test:performance:all
```

Write tests require explicit staging-only approval:

```bash
PERFORMANCE_BASE_URL=https://staging.example.com \
STRESS_TEST_ALLOW_WRITES=true \
SMS_MOCK_MODE=true \
TEST_CAMPAIGN_ID=<qa-campaign-id> \
npm run test:load:lead-capture
```

## Required Artifacts

Each run writes:

```text
performance-reports/YYYY-MM-DD/run-<timestamp>/
  executive-summary.md
  summary.json
  raw/
```

Use `summary.json` as the machine-readable source of truth.

## Acceptance Targets

- public pages p95 `< 1500ms`
- authenticated reads p95 `< 800ms`
- dashboard reads p95 `< 1500ms`
- onboarding writes p95 `< 1000ms`
- lead capture p95 `< 750ms`
- error rate `< 1%`
- no cross-tenant failures
- no secret leaks
- no launch/billing/provider/notification side effects

## Current Scope

The suite covers:

- public route smoke
- auth route smoke
- dashboard route load
- onboarding route load
- preview/launch read load
- invalid lead capture/rate-limit probe
- invalid webhook rejection probe
- k6 load/spike/soak/breakpoint hooks
- standardized report artifacts

Full 100-1000 VU proof requires:

- `k6` installed
- safe staging/preview target
- mocked provider/SMS/Meta/Stripe
- test auth users/tokens if authenticated API load is required
