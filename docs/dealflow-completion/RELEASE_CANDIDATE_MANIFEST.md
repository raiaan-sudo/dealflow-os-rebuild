# DealFlow release candidate manifest

Current verdict: `NO_GO`
Final implementation commit/tree: `PENDING_FINAL_SEAL / PENDING_FINAL_SEAL`
Migration inventory: `103`, ending at
`20260713028000_harden_account_deletion_retention_authority.sql`
Migration digest: `PENDING_FINAL_SEAL`
Staging deployment: `NOT_YET_RUN`
Production deployment: `NOT_YET_RUN`
Protected external production trust root: `NOT_YET_RUN`

## Immutable baseline

- baseline commit: `d37c50945ff7004d700301fc89c15eb9273dac5b`
- baseline tree: `1b641a447509dbcae6ca1c23b63520ebdb63c931`
- Vercel project: `dealflow-os-rebuild`
- retained baseline deployment: `dpl_J4Ksu4n7sjwdRv8tHBTa5ARDKg9E`
- canonical core domains: `agentdealflow.io`, `app.agentdealflow.io`,
  `www.agentdealflow.io`, `clicktoscale.io`, `www.clicktoscale.io`

The integrated candidate remains limited to the canonical repository.
`internal.agentdealflow.io`, `clicktoscale.agentdealflow.io`, and
`onboarding.agentdealflow.io` require independent source/deployment ancestry or
explicit exclusion from release.

## Candidate identity rule

Do not populate commit, tree, tracked-content, lockfile, migration, build, route,
test or browser digests until all source/document changes are committed and the
worktree is clean. Any later tracked change invalidates the identity and both
verification rounds.

The 80-migration foundation and earlier candidate counts, including the
99/102-migration checkpoints, are historical evidence. The current candidate
inventory is 103, but its exact final digest and
integrated proof are still pending.

## Release trust

Production release requires six exact-deployment signed evidence classes:
build, test, remote schema, visual/browser, zero-old-worker/provider drain, and
environment attestation. Signatures must come from authority pinned by a
protected external policy whose path and independently authorized digest are
outside the target repository. Target-added keys or caller-authored JSON cannot
authorize the target.

The evidence must agree on one commit/tree, deployment, project, domain set,
schema/migration digest, build/runtime and time window. Protected trust and all
six current manifests are `NOT_YET_RUN`.

## Mandatory `NO_GO` conditions currently present

- final clean seal and two exact-seal verification rounds are absent;
- exact 103-chain hosted staging migration and deployment are absent;
- zero-skip authenticated multi-role/white-label/EN-FR-ES acceptance is absent;
- provider sandbox/test acceptance is absent;
- production schema, backup/PITR and restore authority are absent;
- signed zero-old-worker/provider drain and exact environment are absent;
- independent-domain ancestry remains unresolved; and
- the projected GHL sweep/proof evidence volume lacks an approved
  partition/archive/retention/cost policy; and
- consent/retention/deletion, GHL lifecycle/offboarding, support destination/SLA
  and production optimizer authority require owner/legal approval.

The historical production baseline is not an automatic rollback after
protocol-contract migrations. Recovery beyond that boundary is reviewed and
forward-only.

No deploy, migration, alias, DNS, environment, provider, customer,
communication, billing, spend or shared-data mutation is authorized or claimed
by this manifest.
