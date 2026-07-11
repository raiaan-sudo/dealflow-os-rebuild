# Reliability wave: FIND-002, FIND-003, FIND-004, FIND-041

Status: `HISTORICAL TRANCHE / LOCALLY VERIFIED / NOT DEPLOYED`

Current reconciliation: the concurrent typecheck/test-drift notes and local
Docker-availability blocker recorded below describe this tranche at execution
time and have been superseded by later integrated candidate work. Targeted and
disposable-database reliability suites subsequently passed. The current release
blocker is the repository-wide fresh migration failure at the first tracked
migration (`42P01`, missing `public.campaign_plans`), plus absent signed drain,
deployed-environment, provider, staging, and owner-policy evidence. See
`TEST_AND_PROOF_MATRIX.md` and `MIGRATION_AND_ROLLBACK.md`. Overall verdict:
`NO_GO`.

## Outcome

This wave closes the source-level failure modes behind the four assigned findings:

- **FIND-002 — renewable job ownership:** asynchronous worker claims now receive an unpredictable lease token and monotonic generation. The worker proves the lease is still live before starting, renews it every minute, and performs reschedule, retry, failure, and completion writes through a compare-and-set fence matching job ID, processing status, worker ID, token, generation, and unexpired `locked_until`. A superseded worker cannot mark a job complete.
- **FIND-003 — durable per-effect truth:** agent notification and Meta conversion are evaluated independently. Each child has durable status, attempt count, correlation ID, stable idempotency key, execution token, lease generation, structured result, retryability, and error truth. A returned failure value from either required child prevents parent completion. Successful children are reused; only failed retryable children run again. Exhausted or non-retryable required failures dead-letter the parent with the child summary in `system_jobs.result`.
- **FIND-004 / FIND-041 — deletion responsibility:** the signed Meta callback validates HMAC and algorithm as before, now also validates `issued_at` when supplied (24-hour maximum age and five-minute future skew), requires a subject, derives a stable signed-payload request hash, encrypts the provider subject reference, and atomically records an idempotent responsibility row. The route acknowledges only after the database accepts that row.

## Safety contract

- Meta deletion execution is explicitly default-off. Accepted callbacks enter `operator_required`; this code does not delete or anonymize records.
- No provider call, email, SMS, GHL call, deployment, production data write, or live migration was executed during validation.
- The canonical lead worker has two child effects: agent notification and Meta conversion. No GHL child or live GHL call was added. GHL lead-worker acceptance remains `BLOCKED_EXTERNAL`/not wired; the separate GHL foundation wave provides operator-side durable replay-state mechanics only.
- Both present children are required by default. A payload may explicitly narrow `requiredEffects`; optional child failure remains recorded but does not falsify parent success.
- Static creative paid-provider idempotency is stable across lease generations (`<job-id>:static_creative_generation`), reducing duplicate paid work if a worker loses ownership mid-call. HeyGen already uses a campaign/creative-stable idempotency key; Meta CAPI uses the stable lead event ID; notification persistence is lead/purpose keyed.
- Inline-only tracked job kinds are excluded from the asynchronous claim RPC. Stale recovery resets only rows with an expired durable lock, not long-running unleased inline work.

## Additive schema

Migration: `supabase/migrations/20260710234500_harden_jobs_lead_effects_meta_deletion.sql`

- Adds `lease_token`, `lease_generation`, and `lease_heartbeat_at` to `system_jobs`.
- Replaces `claim_next_system_job` with a supported-kind-only, tokenized, generation-incrementing claim.
- Adds service-role-only `renew_system_job_lease`.
- Adds service-role-only `system_job_effects` with per-child idempotency and execution fencing.
- Adds service-role-only `meta_data_deletion_requests` with encrypted subject reference, hash uniqueness, replay count, default-off execution, and operator-required state.
- Adds service-role-only `accept_meta_data_deletion_request` for atomic insert/replay acknowledgement.

Release ordering, if separately authorized later: apply the additive migration before releasing the application code. Rolling back application code can leave the additive columns/tables/functions in place; do not drop responsibility or effect rows containing operational evidence.

## Deterministic evidence

All checks used Node `v20.20.2` and made no network/provider calls.

| Check | Result | Coverage |
| --- | --- | --- |
| `node scripts/test-reliability-wave.mjs` | PASS | Lease renewal, expiry/generation loss, child partial failure, selective child retry, stable child reuse, duplicate deletion replay, stale/future callback rejection, acknowledgement ordering, schema/source contracts |
| Targeted ESLint over all changed reliability source/tests | PASS | Syntax and lint contract |
| `npm run typecheck` | PASS, then OTHER-WAVE INTEGRATION FAILURE on final rerun | The wave passed a full repository typecheck. A later rerun after concurrent work reported eight errors only in autonomy/optimizer/GHL provisioning files outside this wave; no reliability-owned file was named. |
| `npm run build` | PASS before later concurrent edits | Next.js 16.2.10 production compile, type pass, and 47 static pages |
| `node scripts/check-route-security.mjs` | PASS | Public Meta deletion method surface and existing route guards |
| `node scripts/test-internal-sms-notifications.mjs` | PRE-EXISTING TEST DRIFT | The script expects removed `ALLOW_PUBLIC_LEAD_NO_TURNSTILE`; failure is outside this wave and unrelated to changed files |
| `node scripts/smoke-test.mjs offline` | OTHER-WAVE FAILURE | Two Meta OAuth static assertions failed against concurrently changed Meta contract code; all system-job/lead checks in that suite passed |

## Current blocker reconciliation

Later network-disabled PostgreSQL fragment tests proved the fenced job/effect
contracts and the integrated typecheck returned green. The full repository
migration chain still cannot reach these candidate migrations because its first
tracked baseline migration references a missing foundational relation. No linked
or production Supabase command was attempted, and no provider effect was run.

## Required operator follow-through

- Build an authenticated operator workflow for `meta_data_deletion_requests` before claiming end-to-end deletion completion. It must verify identity/scope, execute or document lawful retention, update `responsibility_status`, and retain a sanitized audit trail.
- Do not claim GHL lead delivery from this wave. Lead-worker GHL dispatch remains blocked until a sanctioned provider capability, credential authority, worker, and acceptance proof exist.
- Monitor `system_job_effects` failures and parent dead letters after a separately authorized schema/application release.
- Treat `operator_required` as accepted responsibility, not completed deletion.
