# DealFlow Smoke Test System

This splits launch validation into:

- `offline` checks: code and route invariants that can run without live Meta access
- `staging` checks: safe HTTP checks against a deployed environment
- `manual real Meta` checks: browser/OAuth/Ads Manager validation that cannot be safely faked

## Environment variables

### Required for app runtime

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Meta OAuth/env variables already required by the app

### Optional for staging smoke test

- `SMOKE_BASE_URL`
  - Example: `https://staging.example.com`
- `SMOKE_TEST_FUNNEL_SLUG`
  - Real published funnel slug for public-route verification
- `SMOKE_TEST_CAMPAIGN_ID`
  - Real campaign plan ID for lead-capture validation
- `SMOKE_TEST_EMAIL`
  - Test email for email-only lead submit
- `SMOKE_TEST_PHONE`
  - Test phone for phone-only lead submit

## Commands

### Offline checks

```bash
npm run smoke:offline
```

What this validates:

- auth redirect preservation exists in code
- public funnel route remains public
- onboarding idempotency/resume/progress exists
- preview and launch both use persisted `selected_ad_id`
- launch execution validates and reuses existing Meta objects
- launch supports forced interruption mode
- lead form/client/API validation alignment exists
- public lead dedupe exists
- QA credential fallback is removed from public lead handling
- dashboard truth hooks exist

### Staging checks

```bash
SMOKE_BASE_URL=https://staging.example.com npm run smoke:staging
```

Optional full lead verification:

```bash
SMOKE_BASE_URL=https://staging.example.com \
SMOKE_TEST_FUNNEL_SLUG=my-funnel-slug \
SMOKE_TEST_CAMPAIGN_ID=00000000-0000-0000-0000-000000000000 \
SMOKE_TEST_EMAIL=smoke@example.com \
npm run smoke:staging
```

What this validates:

- login page reachable
- protected dashboard redirects when unauthenticated
- invalid lead payloads are rejected
- public funnel route is reachable if a real slug is supplied
- valid lead capture works if a real campaign ID plus contact detail is supplied
- duplicate lead submission returns safely

## Manual staging checks still required

These still require a real browser session and real Meta account:

1. Signup/login end to end with session persistence
2. Onboarding submit twice and confirm same `campaignId`
3. Resume onboarding after refresh
4. Funnel generation, creative generation, and campaign build
5. Select a non-recommended ad and confirm preview/launch match
6. Meta OAuth connect
7. Ad account/Page/pixel selection
8. Preflight invalid asset block
9. Real launch to Meta
10. Forced interruption + retry with no duplicate Meta objects
11. Launch success confirmation refresh
12. Dashboard lead-loop verification after a real captured lead

## Manual real Meta validation references

- General end-to-end smoke:
  - [/Users/raiaanreza/Documents/New project/dealflow-os-rebuild/scripts/smoke-test-checklist.md](/Users/raiaanreza/Documents/New%20project/dealflow-os-rebuild/scripts/smoke-test-checklist.md)
- Forced interruption and retry:
  - [/Users/raiaanreza/Documents/New project/dealflow-os-rebuild/scripts/meta-launch-idempotency-test.md](/Users/raiaanreza/Documents/New%20project/dealflow-os-rebuild/scripts/meta-launch-idempotency-test.md)
