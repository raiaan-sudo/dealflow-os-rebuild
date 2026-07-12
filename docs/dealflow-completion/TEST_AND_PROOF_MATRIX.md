# DealFlow test and proof matrix

Overall verdict: `NO_GO`
Status: `LOCAL COMPLETION CANDIDATE PASSING / CONTROLLED STAGING AND LIVE-PROVIDER ACCEPTANCE STILL REQUIRED`

## Proof profiles

- `STATIC_OFFLINE`: source/decision/contract checks; no network.
- `LOCAL_MOCK`: synthetic adapters with live-host rejection.
- `LOCAL_DB`: disposable local PostgreSQL/Supabase only; synthetic tenants;
  Docker remains the default, with an explicit Unix-socket-only PostgreSQL 17.6
  adapter documented in `NATIVE_POSTGRES_DISPOSABLE_TESTS.md` for environments
  where the Docker daemon is unavailable;
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

These results are local implementation-commit evidence, not production
acceptance. The external bundle runner repeats the complete portfolio twice on
the clean docs/bundle-only descendant seal and retains the exact command logs.

| Portfolio | Representative commands | Current local result | Limit |
|---|---|---|---|
| Type/lint | `npm run typecheck`; `npm run lint`; targeted ESLint | pass on the implementation commit | exact-seal repeat is external bundle evidence |
| Completion contracts | `npm run test:dealflow-completion`; reliability/security/accessibility/onboarding suites | 25/25 pass on the implementation commit | exact-seal repeat is external bundle evidence |
| Meta OAuth/contract/tenant | `node scripts/test-meta-contract-hardening.mjs`; `npm run test:meta-tenant-fencing` | pass, including the exact native-lead permission set and zero-retry code exchange; no network | no real OAuth/provider acceptance |
| Manual/scheduled launch | `npm run test:manual-launch-fencing`; `npm run test:manual-launch-reachability`; `npm run test:scheduler-disposable-db`; launch truth suite | pass including immutable input lineage, four-stage pre-POST mutation arming, expired-manual-crash route-to-SQL terminalizer reachability with zero provider dispatch, receipt/settlement failure terminalization, explicit-rejection-only retry, and stale-generation negatives | no Meta object created |
| GHL | tenant contract and `npm run test:ghl-disposable-db` | fake-only/disposable proof pass | no real adapter/provider action |
| Stripe/billing | onboarding/billing contract, `npm run test:stripe-runtime-mode`, `npm run test:stripe-webhook-disposable-db` | pass | no live Stripe read/webhook/checkout |
| Financial integrity | `npm run test:financial-integrity-disposable-db` | pass | no live billing/provider acceptance |
| Access-key security | checkout/activation, `npm run test:access-key-binding`, plus `npm run test:access-key-security-disposable-db` | pass, including invalid partner 404, invalid stored tier, configured tier-price mismatch, stale expanded checkout refresh, exact Stripe identity/price/plan/cardinality negatives, verified+available / verified+unavailable / unverified UI truth states, all-null-only recovery CAS, and two-phase reveal recovery | no live purchase/reveal |
| Campaign entitlement | `npm run test:campaign-entitlement-disposable-db` | pass | no staged mixed-worker release proof |
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
| Full fresh chain | `PASS`: all 80 migrations on PostgreSQL 17.6; frozen 11,407-row catalog/ACL oracle and digest `18279dd809f138d4d299e522bde850783d1d75dd0699b5bb87f28067164eb21a` match exactly | local migration blocker cleared |
| Authoritative-current adoption | `PASS`: foundation history adopted exactly once, then candidate migrations converged to the fresh-chain digest | local adoption proof complete |
| Representative May-2 schema upgrade | `PASS`: recovered project-bound structural fixture upgraded to the same semantic digest | local upgrade proof complete |
| Legacy and partial-collision rejection | `PASS`: foundation collisions plus malformed later table, table-metadata, column, and index collisions rejected before mutation | fail-closed local proof complete |
| Idempotent full replay | `PASS`: all 80 history entries skipped and zero structural mutation occurred | local idempotency proof complete |
| Sentinel preservation and unsafe conversion | `PASS`: supported sentinel converted/preserved; unsupported conversion rejected without mutation | local data-safety proof complete |
| Integrated RLS/private-schema/ACL proof | `PASS`: the pinned rowset/digest includes relation ownership/options/replica/partition metadata, schema/relation/sequence/routine/default privileges, type and column null/explicit/grant ACL states, and dense live-column order; mutation-sensitivity probes passed | local authorization-shape proof complete |
| Mixed old/new worker compatibility | `PASS`: old worker/new schema rejected safely; new worker/old schema path absent | signed deployed-worker drain still required before release |
| Forward-recovery drill | `PASS`: injected failure left zero partial mutation and forward recovery succeeded | local recovery proof complete |
| Two independent final databases | `PASS`: both matched every row of the frozen 11,407-row oracle and its independently recomputed semantic digest | deterministic local proof complete |
| Cleanup | `PASS`: zero disposable databases remained; remote-equivalent owner created/removed once | zero local proof residue |
| Destructive down rollback | intentionally not attempted | historical baseline is not claimed safe after contract boundary |

## Browser/accessibility/visual proof

- Fresh production-built loopback proof captured seven anonymous routes at
  `1440×900` and `390×844` (14 screenshots total): root, login, onboarding,
  privacy, terms, data deletion, and UI direction.
- All 14 route/viewport checks had a main landmark, zero horizontal overflow,
  and zero browser console errors/warnings. Onboarding failed closed to the
  setup-reason login route at both viewports.
- Invalid tiled full-page captures were excluded and recorded, not counted.
- Authenticated browser proof remains assigned to controlled staging because
  this checkout has no isolated Supabase Auth/PostgREST fixture; raw PostgreSQL
  alone cannot create a truthful signed-in browser session.
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
