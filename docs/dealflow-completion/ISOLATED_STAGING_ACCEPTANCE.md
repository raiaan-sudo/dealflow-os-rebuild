# Isolated staging acceptance

This harness is the only supported one-pass path from an exact local release seal to the isolated DealFlow staging project. It is fail-closed and does not authorize production.

## Safety boundary

- Target application: `dealflow-os-rebuild-selfserve-clean.vercel.app` and its deployment-specific Vercel URL only.
- Target database: the fingerprint-pinned Supabase project with safe suffix `qibh` only.
- Data: ten clearly labeled synthetic roles, two isolated white-label partners,
  their child tenants, and synthetic fixtures only.
- External effects: Meta, GHL, Stripe, Twilio, creative-provider, support-delivery, advertising-spend, and customer-communication actions remain disabled.
- Production/shared hosts, databases, provider credentials, customer data, live charges, live ads, communications, and production deployment are rejected.
- The staging project's Vercel production slot is used only because the entire Vercel project is isolated staging. Runtime identity must match the pinned staging project id and staging host attestation.

## Required preconditions

Run both exact final-verification rounds first. Each summary must be schema v3, Node 20, bound to the same clean commit/tree and exact migration portfolio, have every local command pass, and contain only the three allowlisted authenticated-hosted deferrals:

- `npm run rls:cross-tenant`
- `npm run rls:fixture-smoke`
- `npm run operator:debt`

The execution shell must contain the exact isolated staging Supabase authority, the existing staging Vercel authority, and freshly supplied staging-only QA password, partner-attribution signing secret, and internal-system secret. Secrets are accepted from process memory and sent to Vercel through stdin; they are never placed in arguments or evidence. Database-owner transfer uses the pinned Keychain entry, PostgreSQL 17.6, TLS `verify-full`, and the commit-bound `config/security/supabase-prod-ca-2021.crt` trust bundle (SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`). The public CA is the `Supabase Root 2021 CA` downloaded from Supabase's official certificate endpoint; its certificate fingerprint is `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA` and it expires April 26, 2031.

Every zero-external-effects flag must have the exact value enforced by `src/lib/safety/zero-external-effects.ts`. In particular, `STRIPE_FORCE_TEST_MODE`, both lead-load bypass flags, and all provider-write flags remain `false`.

## Execution

```bash
npm run staging:acceptance -- \
  --execute \
  --apply-forward-migration \
  --deploy \
  --prior-migration-proof-dir /private/tmp/dealflow-staging-acceptance-evidence-e776f38/migration-proof \
  --evidence-dir /private/tmp/dealflow-staging-acceptance-evidence-<seal> \
  --round-one /absolute/path/to/round-1/verification-summary.json \
  --round-two /absolute/path/to/round-2/verification-summary.json
```

The additional authorization value is exact:

```text
DEALFLOW_STAGING_ACCEPTANCE_AUTHORIZATION=AUTHORIZE_ISOLATED_STAGING_ACCEPTANCE_V1
```

For a genuinely empty isolated project, `--apply-migrations` is the fresh atomic
mode and forbids a prior proof. `--verify-existing-migrations` is the exact
read-only schema mode. Exactly one mode is accepted; the current qibh path uses
the pinned 102-to-103 forward mode above.

Without the required flags, that authorization, every required secure input, an exact clean branch/commit/tree, and both accepted round summaries, the runner performs no remote mutation.

## Fixed order

1. Verify local repo, Node, branch, commit, tree, tracked-file digest, migration portfolio, Supabase fingerprint, Vercel fingerprints, all safety flags, secure inputs, and both local verification rounds.
2. Provision the exact allowlisted isolated-staging Vercel environment through stdin and reject any unexpected existing variable name.
3. Prove the pinned exact 102-migration qibh state, apply only migration 103 and its history receipt in one outer transaction, and verify the exact 103-history/schema/ACL result. Never fall back to a fresh apply on nonempty state.
4. Through a separate database-owner broker, install, tightly recover, or exactly reuse the qibh-only synthetic retention policy. Prove service-role SELECT-only access, zero table- or column-level writes, zero anon/authenticated/PUBLIC grants, exact policy values, and the actual relation owner.
5. Deploy the exact commit to the isolated Vercel staging project and verify deployment metadata.
6. Seed the deployment-bound white-label hosts and ten synthetic roles twice, proving idempotency and atomic partner attribution.
7. Run the exact authenticated RLS cross-tenant and fixture-smoke commands, verify fixture cleanup, and run the exact operator-debt command.
8. Prove zero external effects on stable direct and both deployment-bound partner hosts.
9. Run all ten role journeys on Chromium desktop, Chromium mobile, Firefox, and WebKit with zero skips, fail-closed network boundaries, and tenant isolation.
10. Run GET-only hosted load against public routes and the internal zero-effects control. Hosted lead-capture POST load is deliberately forbidden; it remains a local-only proof.
11. Compare effect-bearing table counts, rescan evidence for protected values and probable credentials, set private permissions, write the machine-readable manifest, and seal every artifact with SHA-256 checksums.

## Verdict semantics

A successful harness run proves only the safe isolated-staging surfaces it actually exercised. It must return production `NO_GO` while any required worker, lead-delivery, GHL, Meta, Stripe, creative-provider, Twilio, support-delivery, reporting, or recovery journey remains `NOT_PROVEN` or `FAIL`. Seeded end states never count as journey proof, and missing provider credentials never count as a pass.

Static validation is available without remote work:

```bash
npm run test:staging-acceptance-contract
```
