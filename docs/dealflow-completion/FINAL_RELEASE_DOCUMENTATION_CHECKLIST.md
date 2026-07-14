# DealFlow final-release documentation checklist

Current verdict: `NO_GO`

Root must fill every field from retained evidence after the applicable gate.
Do not estimate, copy a working-tree identity, or replace missing proof with a
local/historical pass. Until filled, use exactly `PENDING_FINAL_SEAL` for source
identity and `NOT_YET_RUN` for execution proof.

## 1. Final source seal

- Commit: `PENDING_FINAL_SEAL`
- Tree: `PENDING_FINAL_SEAL`
- Branch: `PENDING_FINAL_SEAL`
- Baseline ancestry result: `NOT_YET_RUN`
- Clean worktree result: `NOT_YET_RUN`
- Tracked-file count/digest: `PENDING_FINAL_SEAL`
- Lockfile digest: `PENDING_FINAL_SEAL`
- Migration count/final file/digest: `103` /
  `20260713028000_harden_account_deletion_retention_authority.sql` /
  `PENDING_FINAL_SEAL`
- Node/PostgreSQL exact runtimes: `NOT_YET_RUN`

## 2. Local verification

- Round 1 summary path/hash/result: `NOT_YET_RUN`
- Round 2 summary path/hash/result: `NOT_YET_RUN`
- Same-seal comparison: `NOT_YET_RUN`
- Install/audit/secret-scan/lint/typecheck/build: `NOT_YET_RUN`
- Complete contract/database/browser/load counts and failures: `NOT_YET_RUN`
- 103-chain schema/ACL/RLS/determinism/forward-recovery result: `NOT_YET_RUN`
- Unresolved P0/P1/warnings/skips: `NOT_YET_RUN`

## 3. Isolated staging

- Supabase fingerprint/safe suffix and schema identity: `NOT_YET_RUN`
- Vercel project/host/deployment/commit/tree: `NOT_YET_RUN`
- Zero-external-effects attestation: `NOT_YET_RUN`
- 103-migration apply/history/idempotency/digest: `NOT_YET_RUN`
- Synthetic fixture identities/counts/cleanup: `NOT_YET_RUN`
- Authenticated zero-skip browser matrix: `NOT_YET_RUN`
- Direct/partner/admin/attacker, suspended/deletion, and EN/FR/ES journeys: `NOT_YET_RUN`
- GHL/Meta/Stripe-test/creative/Twilio/support/deletion-provider boundaries: `NOT_YET_RUN`
- Repeated jobs, lead/load, ambiguity/recovery: `NOT_YET_RUN`
- Staging evidence directory/manifest/checksums: `NOT_YET_RUN`

## 4. Production preflight and authority

- Exact production project/schema/migration identity: `NOT_YET_RUN`
- Backup/PITR/restore evidence: `NOT_YET_RUN`
- Signed zero-old-worker/provider drain: `NOT_YET_RUN`
- Protected external trust policy/digest: `NOT_YET_RUN`
- Signed exact-deployment environment attestation: `NOT_YET_RUN`
- Domain/source ancestry and exclusions: `NOT_YET_RUN`
- Owner approvals: consent/retention/deletion, GHL lifecycle/offboarding and
  sweep/proof evidence partition/archive/capacity/cost policy,
  support destination/SLA, provider accounts, optimizer policy: `NOT_YET_RUN`
- Production release authorization text/time/scope: `NOT_YET_RUN`

## 5. Canary, release, and post-release

- Canary deployment/schema/provider scope and stop conditions: `NOT_YET_RUN`
- Production deployment/commit/tree/domains: `NOT_YET_RUN`
- Migration result and post-schema digest: `NOT_YET_RUN`
- App/golden journey/lead/results/support/provider proof: `NOT_YET_RUN`
- Monitoring window and zero-error/warning/stuck-job result: `NOT_YET_RUN`
- Forward-recovery or rollback decision/evidence: `NOT_YET_RUN`
- Final secret/customer-data scan, manifest and checksums: `NOT_YET_RUN`
- Final GO/NO_GO, signer and timestamp: `NO_GO / NOT_YET_RUN`

No production or provider success may be documented until the corresponding
retained evidence path, digest, exact identity and result are filled here.
