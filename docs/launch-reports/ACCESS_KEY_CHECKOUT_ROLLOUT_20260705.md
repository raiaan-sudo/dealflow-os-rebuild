# DealFlow Access-Key Checkout Rollout Proof - 2026-07-05

## Verdict

Access-key checkout, key reveal, signup claim, billing merge, and reuse rejection are implemented, migrated, deployed, and proven.

## Deployments

- Preview deployment: `dpl_4qHJHQWjVTx8SNiH5mmHFsMdd9FF`
- Initial production deployment: `dpl_3ndyo7h2U8tF1vo2uvFc31RH8WYb`
- Latest production deployment carrying the access-key implementation: `dpl_5ED84oEmiHzv83rQJQSLaJtqsN98`
- Production app route proof used `https://app.agentdealflow.io`
- Click-to-Scale route proof used `https://clicktoscale.io`

## Supabase

- Project ref: `fdzwbevvbqvyteapphxm`
- Applied migration: `20260705090000_create_billing_access_keys.sql`
- Verified tables:
  - `public.billing_access_keys`
  - `public.billing_access_key_events`
- RLS verified enabled on both access-key tables.
- Schema metadata verified as `20260705090000`.
- Migration history repaired for `20260705090000` only.
- Existing unrelated migration-history mismatches remain outside this rollout scope.

## Vercel Env

Added to Preview and Production:

- `ENABLE_ACCESS_KEY_CHECKOUT`
- `ACCESS_KEY_HASH_PEPPER`
- `ACCESS_KEY_REVEAL_ENCRYPTION_KEY`

No secret values were printed or committed.

## Preview Stripe Test E2E

Preview proof used Stripe test mode.

- Created Checkout Session: `cs_test_...`
- Paid with Stripe test card.
- Success page revealed one `df_test_...` key.
- Refreshing the success URL did not reveal the key again.
- Preclaimed the key.
- Created/confirmed a QA auth user with the claim token.
- Hit real `/dashboard` to trigger app bootstrap.
- Verified access key row:
  - `status = claimed`
  - claimed user matched QA user
  - claimed organization present
  - Stripe customer/subscription ids present
  - reveal ciphertext cleared
  - revealed timestamp present
- Verified `billing_subscriptions` row:
  - `status = active`
  - `plan_tier = pro`
  - organization matched claimed organization
  - user matched claimed user
  - Stripe subscription matched access key
- Reuse attempt failed with `400 access_key_unavailable`.
- QA Supabase artifacts were cleaned after proof:
  - `billing_subscriptions`
  - `billing_access_keys`
  - `business_profiles`
  - `organization_memberships`
  - `organizations`
  - `users`
  - `auth.users`

## Production Proof

Safe production GET/browser proof:

- `https://app.agentdealflow.io/access/checkout` -> `200`
- `https://app.agentdealflow.io/p/click-to-scale/checkout` -> `200`
- `https://app.agentdealflow.io/login?mode=sign-up` -> `200`
- `https://app.agentdealflow.io/access-key/cancel` -> `200`
- `https://clicktoscale.io/access/checkout` -> `200`
- `https://clicktoscale.io/p/click-to-scale/checkout` -> `200`
- Latest redeploy smoke after `dpl_5ED84oEmiHzv83rQJQSLaJtqsN98`:
  - `https://app.agentdealflow.io/access/checkout` -> `200`
  - `https://clicktoscale.io/access/checkout` -> `200`
  - `https://app.agentdealflow.io/login?mode=sign-up` -> `200`
  - `GET https://app.agentdealflow.io/api/access-keys/preclaim` -> `405`

Production API boundary proof:

- Invalid checkout plan -> `400 validation_error`
- Missing/cross-site origin -> `403 csrf_rejected`

Production live-mode dry proof:

- Created one live Checkout Session without payment: `cs_live_...`
- Verified response returned a live Stripe Checkout URL.
- Deleted the resulting pending access-key DB row immediately after proof.
- No live card payment was completed.

Production browser proof:

- Access-key pages rendered with no console errors.
- Access-key pages rendered with no page errors.

Production runtime logs:

- No `error` or `fatal` logs found for deployment `dpl_3ndyo7h2U8tF1vo2uvFc31RH8WYb`.
- Warning logs observed were intentional invalid/CSRF proof probes only.

## Validation Commands

Passed:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:access-key-checkout-signup`
- `npm run routes:security`
- `npm run test:stripe-price-guard`
- `npm run test:billing-free-trial`
- `npm run test:partner-branded-billing`
- `npm run test:subscription-lifecycle`
- `npm run test:signup-generation-credit-grant`
- `npm run test:public-self-serve-acceptance`
- `npm run test-white-label-foundation`
- `npm run test:ghl-iframe-embed-security`
- `npm run test:click-to-scale-ghl`
- `npm run schema:check`

Additional hygiene:

- Scoped tracked-file whitespace check passed.
- New-file whitespace check passed.
- No build/test/dev/deploy processes left running.

## Notes

- The full live-money purchase was intentionally not completed because that would charge a real card.
- Two Stripe test-mode subscriptions may still exist in Stripe test mode because Vercel Preview env pull did not expose a local test secret key for cleanup. Supabase QA rows from those tests were cleaned.
