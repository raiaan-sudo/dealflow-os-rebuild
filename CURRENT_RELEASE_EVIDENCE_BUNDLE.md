# Current release evidence bundle

`scripts/build-current-release-evidence.mjs` creates the final owner handoff from one exact, clean release source. It does not read or modify a historical audit bundle.

## Inputs

- Two distinct external `dealflow.final-verification.v3` directories.
- One sealed isolated-staging evidence directory.
- One sanitized `dealflow.release-checkpoint.v1` JSON record.
- Optionally, one sanitized `dealflow.production-release-attestation.v1` JSON record.
- A clean current Git worktree containing the exact source and migration portfolio named by every input.

The checkpoint record binds the earlier safe checkpoint to the final source:

```json
{
  "schemaVersion": "dealflow.release-checkpoint.v1",
  "status": "PASS",
  "checkpoint": {
    "status": "PASS",
    "commit": "<checkpoint commit>",
    "tree": "<checkpoint tree>",
    "bundleSha256": "<checkpoint bundle SHA-256>"
  },
  "finalSource": {
    "branch": "<final branch>",
    "commit": "<final commit>",
    "tree": "<final tree>",
    "trackedWorktreeSha256": "<final tracked-source SHA-256>",
    "trackedFileCount": 0,
    "dependencyLockSha256": "<package-lock SHA-256>"
  }
}
```

Run only after both final verification rounds and isolated staging are sealed:

```sh
npm run release:evidence:current -- \
  --round-one /absolute/external/final-round-1 \
  --round-two /absolute/external/final-round-2 \
  --staging /absolute/external/staging-evidence \
  --checkpoint-record /absolute/external/checkpoint-record.json \
  --output /absolute/external/current-release-bundle
```

Add `--production-attestation /absolute/external/production-attestation.json` only after controlled production proof exists. The attestation must bind the exact final source, migration portfolio and normalized staging schema digest. It must explicitly report every required production, provider and capability gate. Omitting the attestation is supported and correctly produces `NO_GO`.

## Fail-closed contract

The builder rejects a dirty source, identity or digest drift, incomplete local rounds, staging evidence not bound to those rounds, an unsealed staging directory, missing schema proof, symlinks, empty or dataless files, unhashed artifacts, probable secrets, full protected project references and probable customer records.

The output contains the executive verdict, exact nine-capability matrix, issue/blocker ledger, systems of record and three lead paths, source/checkpoint/schema/environment identities, all local and staging journey results, provider and production gate matrices, a machine-readable snapshot, recursively copied current proof, a manifest and `SHA256SUMS`. Directories are mode `0700`; regular files are mode `0600`.

Contract test:

```sh
npm run test:release-evidence-current
```
