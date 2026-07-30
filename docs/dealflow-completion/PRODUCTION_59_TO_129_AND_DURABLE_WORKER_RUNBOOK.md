# Production 59-to-129 migration and durable-worker runbook

This is the current authority for the exact successor candidate. Older migration
and worker documents are historical evidence only.

## Immutable release facts

- The tracked candidate contains exactly 129 ordered migration files.
- Production must begin at the exact first 59 versions; the only accepted delta
  is the final 70.
- `20260426000000_forward_foundation_bootstrap.sql` is first and supplies the
  authoritative foundation before dependent migrations.
- Production migration authority requires a fresh, externally signed
  Guard v5 `PRE_MUTATION_ADMISSION_PASS`, its separate purpose-scoped seventh
  Ed25519 envelope, an unexpired recovery point, an exact candidate commit/tree,
  and the broker's complete migration-portfolio digest.
- Meta remains disabled until its separate acceptance gate passes.

## Safe order

1. Keep both global controls `quiesced`. Confirm all superseded workers have
   zero active claims and cannot restart.
2. Create and verify the recovery point, PITR window, Auth/Storage recovery
   evidence, rollback boundary, and forward-recovery operator.
3. Run the broker in `rehearsal` mode against an isolated, synthetic,
   production-shaped database whose history is the exact first 59 versions.
4. Require exact 129-version replay, permissions/RLS/index/job checks, tenant
   isolation, timings, lock observations, WAL observations, and clean teardown.
5. Re-read production history. Stop on the first name, order, count, or project
   fingerprint mismatch.
6. Pin the exact PostgreSQL 17.6 `psql` regular file by SHA-256 before Keychain
   password retrieval. Bind both the database host and the project-specific
   pooler username/direct-host project ref to the protected project fingerprint.
7. Run `production-apply` once. The broker uses one advisory lock, a three-second
   lock timeout, a five-minute statement timeout, per-migration transactions,
   and stops at the first error. Never reverse schema by deploying old app code;
   use forward recovery from the exact observed version.
8. Verify all 129 exact versions, catalog/security invariants, and recovery
   position before deploying the app or enabling any worker.

## Durable worker

- Build `Dockerfile.worker` only from a digest-pinned Node image that reports
  Node `v24.14.1`.
- Bind the immutable source commit into the image and the read-only generation
  file. Runtime generation, release commit, and claim IDs must agree.
- Install `@higgsfield/cli` version `1.1.19` with its official installer and
  require the operator-pinned binary SHA-256 before the image can build.
- Mount OAuth state only from an encrypted, persistent, owner-only volume.
  Require its externally pinned encrypted-volume attestation. Never put OAuth
  state in the image, environment, logs, or ephemeral filesystem.
- OAuth expiry is health-checked. Expired or near-expiry authority blocks new
  claims and exposes only a sanitized operator-action status.
- Provider cost is capped at five credits per job in source, environment, and
  worker validation.
- Start with both global controls quiesced. Enable provider execution, then
  worker execution, only after the exact app/database/worker generations and
  health endpoint agree. A mismatch fails closed.
- `SIGTERM` immediately stops new claims, drains the in-flight cycle within the
  cooperative safe deadline, and never force-exits an ambiguous external effect.
  Provider operations retain bounded transport timeouts and durable
  idempotency/receipt reconciliation. The container allows a 600-second grace
  window before infrastructure intervention. Restart policy is `unless-stopped`.
- Vercel does not own generic provider/system work. Its retained one-minute GHL
  form sweep is deliberately separate and must remain healthy.

## Acceptance and rollback

Require two clean local qualification rounds, production-shaped rehearsal,
exact-candidate staging acceptance, recovery drill, zero-old-worker proof, and
production-safe synthetic canary proof for AgentDealFlow and ClickToScale.
Rollback may disable claims and route traffic to a compatible successor. It
must never run schema-incompatible old code. Any ambiguous provider receipt,
failed recovery check, tenant leak, financial mismatch, or generation mismatch
returns `NO_GO` and keeps both controls quiesced.
