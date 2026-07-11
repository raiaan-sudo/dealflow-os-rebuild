# DealFlow test and proof matrix

Overall verdict: `NO_GO`
Status: `TARGETED CANDIDATE PROOF PASSING / FINAL EXACT-COMMIT PORTFOLIO PENDING / EXTERNAL PROOF BLOCKED`

## Proof profiles

- `STATIC_OFFLINE`: source/decision/contract checks; no network.
- `LOCAL_MOCK`: synthetic adapters with live-host rejection.
- `LOCAL_DB`: disposable local PostgreSQL/Supabase only; synthetic tenants;
  network disabled.
- `READ_ONLY_PUBLIC`: anonymous GET/navigation/screenshot only.
- `BLOCKED_EXTERNAL`: needs separately authorized provider, deployed environment,
  staging, shared schema, or owner/legal authority.
- `SKIPPED_SAFETY`: would mutate production/customer/provider/shared data, send a
  communication, or spend money.

## Immutable baseline proof

| Command/evidence | Result |
|---|---|
| `npm ci` | pass; 426 packages; zero reported vulnerabilities at baseline |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run build` | pass in fully materialized checkout; 47 static pages |
| registered baseline offline suites | pass |
| legacy internal-SMS direct script | baseline stale lexical assertion failed; later candidate test was updated and passed |
| canonical production source/deployment ancestry | pass for core domains at baseline SHA/deployment |
| independent subdomain source ancestry | blocked for three surfaces |

## Candidate targeted proof already observed

These results are local candidate evidence, not production acceptance. They must
be rerun after the final integration commit before bundle sealing.

| Portfolio | Representative commands | Current local result | Limit |
|---|---|---|---|
| Type/lint | `npm run typecheck`; `npm run lint`; targeted ESLint | pass on landed tranches | final integrated rerun pending |
| Completion contracts | `npm run test:dealflow-completion`; reliability/security/accessibility/onboarding suites | pass before latest integration; affected suites rerun per tranche | full exact-commit run pending |
| Meta OAuth/contract/tenant | `node scripts/test-meta-contract-hardening.mjs`; `npm run test:meta-tenant-fencing` | pass, including the exact native-lead permission set and zero-retry code exchange; no network | no real OAuth/provider acceptance |
| Manual/scheduled launch | `npm run test:manual-launch-fencing`; `npm run test:manual-launch-reachability`; `npm run test:scheduler-disposable-db`; launch truth suite | pass including immutable input lineage, four-stage pre-POST mutation arming, expired-manual-crash route-to-SQL terminalizer reachability with zero provider dispatch, receipt/settlement failure terminalization, explicit-rejection-only retry, and stale-generation negatives | no Meta object created |
| GHL | tenant contract and `npm run test:ghl-disposable-db` | fake-only/disposable proof pass | no real adapter/provider action |
| Stripe/billing | onboarding/billing contract, `npm run test:stripe-runtime-mode`, `npm run test:stripe-webhook-disposable-db` | pass | no live Stripe read/webhook/checkout |
| Financial integrity | `npm run test:financial-integrity-disposable-db` | pass | historical target preflight/full chain blocked |
| Access-key security | checkout/activation, `npm run test:access-key-binding`, plus `npm run test:access-key-security-disposable-db` | pass, including invalid partner 404, invalid stored tier, configured tier-price mismatch, stale expanded checkout refresh, exact Stripe identity/price/plan/cardinality negatives, verified+available / verified+unavailable / unverified UI truth states, all-null-only recovery CAS, and two-phase reveal recovery | no live purchase/reveal |
| Campaign entitlement | `npm run test:campaign-entitlement-disposable-db` | pass | full migration chain blocked |
| Jobs/lead effects | reliability plus `npm run test:lead-effect-fencing-db` | pass | provider idempotency not live-tested |
| Creative/lead tenant scope | creative storage/retry and creative-lead disposable suites | pass | no paid creative provider execution |
| SMS | internal SMS plus `npm run test:sms-receipts` | pass | no Twilio callback/SMS |
| Support | support contract and `npm run test:support-outbox-disposable-db` | pass | no mailbox communication |
| Optimizer | `node scripts/test-optimization-evidence-safety.mjs` | pass; shadow/HOLD contract | no owner-approved live policy/action |
| Release evidence | `npm run test:release-guard` | pass; target self-authorization, unsigned/self-signed evidence, external digest mismatch, and unauthorized rotation rejected; protected external runtime test authority/rotation accepted | production external trust root/env/drain absent |
| Native Meta leadgen | `npm run test:meta-leadgen` (contract plus disposable DB) | pass, including owner/active campaign-owner/exact-admin allow, ordinary/removed/cross-tenant deny, and actor-less RPC removal | no live page/form subscription/event |
| Client IP/rate-limit authority | `npm run test:client-ip-contract`; `npm run routes:security` | pass for normalized Vercel-controlled identity and unknown-production fail-closed fallback | a future non-Vercel proxy needs its own explicit trusted-hop contract |

## Fresh migration and recovery proof

| Required check | Result | Release effect |
|---|---|---|
| Full fresh chain | `FAIL`: first tracked migration, statement 0, SQLSTATE `42P01`, missing `public.campaign_plans` | `NO_GO` |
| Representative prior-schema replay | not executed; authoritative prior shape unavailable | `NO_GO` |
| Idempotent full replay | not executable after fresh failure | `NO_GO` |
| Integrated RLS/privilege/constraint suite | candidate fragments pass; repository-wide chain unavailable | `NO_GO` |
| Mixed old/new worker compatibility and signed zero drain | not executed/attested | `NO_GO` |
| Forward-recovery drill | not executed | `NO_GO` |
| Destructive down rollback | intentionally not attempted | historical baseline is not claimed safe after contract boundary |

## Browser/accessibility/visual proof

- Valid candidate anonymous root/login desktop and mobile captures were retained.
- Tested viewport widths include 320, 390, 768, 1024, 1440, and 1920; no
  horizontal overflow was observed and the checked console was empty.
- Invalid tiled full-page captures were excluded and recorded, not counted.
- Authenticated browser proof is blocked because no authorized isolated
  Supabase/auth fixture was available.
- Screen-reader, 200% zoom, reduced motion, Firefox/WebKit, customer roles,
  degraded workers, billing, support, workspace switching, and provider journeys
  remain not proven.

## Final exact-commit portfolio still required

1. Clean install plus `lint`, `typecheck`, and production `build` twice where
   reproducibility is claimed.
2. Every registered offline and disposable-database candidate suite, including
   native leadgen, Stripe mode, financial integrity, access reveal, release
   evidence, and legacy safe regressions.
3. Ledger/status/ID/proof-field validation and JSON/JSONL/CSV/PNG parse checks.
4. Exact commit/tree/lockfile/migration/build/test/visual hashes.
5. Independent security/launch review against the final diff.

Even a fully passing local final portfolio cannot override the migration,
signed drain/environment, live-provider, staging/domain, or owner/legal
blockers. The final verdict remains `NO_GO`.

## Safety exclusions

No production/shared database write, provider record, CRM/customer record,
Stripe object, SMS/email, Meta/GHL/Twilio/creative action, deployment, config
change, or spend was performed for test proof.
