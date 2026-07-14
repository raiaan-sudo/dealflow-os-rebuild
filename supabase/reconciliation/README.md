# DealFlow schema reconciliation authority

This directory contains the frozen, sanitized catalog authority used to reconstruct DealFlow's missing migration lineage. It contains schema metadata only. It does not contain customer rows, credentials, connection strings, or recovered historical SQL bodies.

## Authority model

- `authoritative-public-catalog.v1.json` is the normalized public-schema authority captured twice from the owner-controlled DealFlow project.
- `private-schema-authority.v1.json` is the normalized private-schema R2 authority captured twice with byte-identical results. The private schema contains only `private.is_current_user_org_member(uuid)` and its schema/routine privileges; it contains no private tables, views, types, sequences, triggers, or policies.
- `authoritative-current-catalog.v1.json` combines the public and private authorities without inventing missing objects.
- `may2-baseline-catalog.v1.json` and `may2-project-bound-schema.sql` preserve the earlier sanitized May-2 baseline used only to determine forward deltas.
- `catalog-assertion-queries.v1.json` freezes the read-only `pg_catalog` queries used by the exact current-shape gate.
- `forward-equivalent-lineage-map.v1.json` classifies every generated migration as new forward reconstruction, never recovered history.
- `migration-provenance.v1.json` maps every generated logical statement bundle to its migration identity and SHA-256 digest.
- `final-local-catalog-and-acl-rowset.v1.json` freezes the exact normalized 11,407-row PostgreSQL 17.6 final catalog/ACL oracle, including relation metadata and null/explicit/granted type and column ACL states.
- `final-local-catalog-and-acl-golden.v1.json` pins the rowset file, payload, row count, surface counts, authority digest, and independently recomputed compact structural digest.

The generator refuses a current authority without a valid combined public/private digest. Generated migration headers explicitly state `original_body_status=NOT_RECOVERED`. Four unavailable tenant-specific data migrations remain intentional tenant-neutral no-ops; the reconstruction never fabricates partner, customer, provider, credential, billing, or branding rows.

## Deterministic verification

Run with Node 24:

```sh
node scripts/generate-forward-migration-portfolio.mjs --check
node scripts/schema/check-forward-reconstruction.mjs
```

Normal schema verification compares three independently created final databases
row-for-row to the frozen oracle and never refreshes it. Oracle maintenance is
an explicit exceptional workflow: `--capture-golden-rowset-candidate` requires
an absolute path outside the repository, produces `CANDIDATE_NOT_APPROVED`, and
cannot be used by the final runner. After an intentional catalog/authorization
change, require two matching PostgreSQL 17.6 databases, review the object-level
diff and declared authority supersessions, install and pin the reviewed
file/payload/count digests, and then rerun normal frozen verification. Only that
subsequent run may pass. A digest-only change is not sufficient review.

To rebuild the frozen authority files, use `scripts/schema/bootstrap-authority-fixtures.mjs` with the sealed public capture, sealed May-2 inputs, and both R2 private capture passes. The migration generator's former `--refresh` path is deliberately disabled so public and private authority cannot be refreshed independently.

No file in this directory authorizes deployment, remote migration application, provider actions, or production mutation.
