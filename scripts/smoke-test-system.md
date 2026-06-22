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

### Safe browser E2E checks

```bash
npm run test:e2e:safe
```

Default behavior:

- Starts the local app on `127.0.0.1:3100` unless `SAFE_E2E_BASE_URL` is set.
- Uses the installed Chrome channel through Playwright.
- Disables screenshots, videos, and traces so private session data is not persisted as artifacts.
- Covers public login/legal pages and protected-route redirects without authentication.
- Does not submit leads, send SMS/email, create Stripe sessions, call paid AI generation, or mutate Meta.

Authenticated safe journey:

```bash
SAFE_E2E_QA_AUTH=true \
QA_AUTH_HARNESS_ENABLED=true \
QA_EMAIL=qa-user@example.com \
QA_AUTH_PROOF_SECRET=<configured qa proof secret> \
npm run test:e2e:safe
```

The authenticated path uses `/api/internal/qa-auth-session`, which is protected by a dedicated QA proof bearer secret, also accepts the internal runner secret for compatibility, and is disabled unless `QA_AUTH_HARNESS_ENABLED=true`.

When enabled, it validates:

- QA auth session creation.
- Onboarding page load.
- Required-field validation.
- Buyer, seller, investor, and commercial preview-mode rendering.
- Starter `$147/mo` and Pro `$297/mo` paywall copy.
- Dashboard preview reachability.
- Launch setup reachability and blocked launch state.
- No live provider action warning in onboarding.

Do not enable the authenticated path against production unless the QA harness is intentionally enabled for a short owner-approved proof window and disabled again afterward.

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

These still require owner/provider dashboard proof even after the safe browser E2E check:

1. Real signup/login with the intended production auth provider settings.
2. Real Stripe checkout proof in test mode or an owner-approved no-charge path.
3. Real Meta OAuth connect.
4. Real ad account/Page/pixel selection.
5. Preflight invalid asset block with real Meta permissions.
6. Final active Meta proof gate only after owner approval.
7. Dashboard lead-loop verification after an approved QA lead-capture proof.

## Manual real Meta validation references

- General end-to-end smoke:
  - [/Users/raiaanreza/Documents/New project/dealflow-os-rebuild/scripts/smoke-test-checklist.md](/Users/raiaanreza/Documents/New%20project/dealflow-os-rebuild/scripts/smoke-test-checklist.md)
- Forced interruption and retry:
  - [/Users/raiaanreza/Documents/New project/dealflow-os-rebuild/scripts/meta-launch-idempotency-test.md](/Users/raiaanreza/Documents/New%20project/dealflow-os-rebuild/scripts/meta-launch-idempotency-test.md)
