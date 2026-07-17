# DealFlow release candidate manifest

> **Superseded as current candidate truth on 2026-07-17.** Preserve this
> predecessor manifest. The current durable identity, gaps, and promotion gates
> are in [`../release/MASTER_RELEASE_PLAN.md`](../release/MASTER_RELEASE_PLAN.md).

> **Superseded predecessor manifest.** The unsealed successor has no final
> commit/tree manifest yet. Use
> [`FINAL_MASTER_SUCCESSOR_STATUS_20260716.md`](FINAL_MASTER_SUCCESSOR_STATUS_20260716.md)
> for current 115-migration / 91-command truth. Staging and production remain
> `NOT_YET_RUN`; production is not authorized.

Current verdict: `NO_GO`
Final implementation commit/tree: `PENDING_FINAL_SEAL / PENDING_FINAL_SEAL`
Migration inventory: `104`, ending at
`20260715010000_move_legacy_org_member_policies_private.sql`
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
99/102-migration checkpoints and the retained exact prior-103 staging pre-state,
are historical or predecessor evidence. The current candidate inventory is 104,
but its exact final digest and integrated proof are still pending.

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
- exact 104-chain hosted staging migration and deployment are absent; the
  forward-only 103-to-104 transition is implemented and pinned to the retained
  exact prior-103 proof, but has not executed;
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
