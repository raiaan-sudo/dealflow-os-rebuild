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
- Exact isolated staging renders every current Next Image directly with an explicit `unoptimized` prop, and an AST inventory gate rejects new import styles, spread attributes, false/dynamic values, or an unapproved importer. Its staging-only Next config also sets `images.unoptimized: true` and moves emitted optimizer URLs to the dedicated disabled path `/_dealflow-staging-image-optimizer-disabled`; the application proxy closes both that path and `/_next/image` as the primary hosted controls. The configured user-local pattern is a nonexistent sentinel, but Next may add its internal static-media allowance, so patterns are defense in depth only. Production receives no image-config override. The hosted proof uses `/staging-private-image-gate-proof-v2/<exact-commit>.png`, so each candidate has a fresh no-query cache key. The private source must return the exact DealFlow `404` before and after warming for no/invalid credentials and its fixed `200 image/png` only for valid header/cookie credentials. Both optimizer paths must return the exact DealFlow JSON `404` before and after warming for no, valid, and invalid credentials. The former public source must remain the exact DealFlow `404` in every credential mode. Its historical Vercel transform is accepted only when it exactly matches the known fixed benign r5 artifact (`134` bytes; SHA-256 `c3cd8dc9212528fc8c7798ec7feb4299b349f1b64f73272fa7098be58d02b682`) and is never treated as current security proof.

## Required preconditions

Run both exact final-verification rounds first. Each summary must be schema v3, Node 24, bound to the same clean commit/tree and exact migration portfolio, have every local command pass, and contain only the three allowlisted authenticated-hosted deferrals:

- `npm run rls:cross-tenant`
- `npm run rls:fixture-smoke`
- `npm run operator:debt`

The execution shell must contain the exact isolated staging Supabase authority, the existing staging Vercel authority, one strong Vercel automation-bypass secret for that isolated project, and freshly supplied staging-only QA password, partner-attribution signing secret, and internal-system secret. Secrets are accepted from process memory and sent to Vercel through stdin; they are never placed in arguments, hosted application environment variables, or evidence. The automation-bypass secret is sent only to an exact allowlisted staging alias with redirect following disabled. Browser proofs exchange it for one host-only `_vercel_jwt` cookie per exact staging origin, require Vercel's exact same-origin `307` cookie response, and never install the secret as a browser-wide header. Database-owner transfer uses the pinned Keychain entry, PostgreSQL 17.6, TLS `verify-full`, and the commit-bound `config/security/supabase-prod-ca-2021.crt` trust bundle (SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`). The public CA is the `Supabase Root 2021 CA` downloaded from Supabase's official certificate endpoint; its certificate fingerprint is `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA` and it expires April 26, 2031.

Every zero-external-effects flag must have the exact value enforced by `src/lib/safety/zero-external-effects.ts`. In particular, `STRIPE_FORCE_TEST_MODE`, both lead-load bypass flags, and all provider-write flags remain `false`.

`vercel.json` pins dependency installation to `npm ci --ignore-scripts --no-audit --no-fund`. This prevents Vercel's dependency-install phase from rewriting `package-lock.json` before the hosted source-identity prebuild verifies the exact uploaded portfolio. `package.json` pins Node `24.x`, the supported LTS major used by the exact local verification and hosted staging build portfolios.

## Execution

```bash
npm run staging:acceptance -- \
  --execute \
  --verify-existing-migrations \
  --deploy \
  --prior-migration-proof-dir /absolute/path/to/latest-sealed-103-run/migration-proof \
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
read-only schema mode. Exactly one mode is accepted. The pinned qibh project has
already completed its 102-to-103 forward transition, so subsequent acceptance
runs must use `--verify-existing-migrations` with the latest passing sealed
103-migration proof. `--apply-forward-migration` is retained only for the
completed one-time transition and must not be used for the current qibh state.

Without the required flags, that authorization, every required secure input, an exact clean branch/commit/tree, and both accepted round summaries, the runner performs no remote mutation.

## Fixed order

1. Verify local repo, Node, branch, commit, tree, tracked-file digest, migration portfolio, Supabase fingerprint, Vercel fingerprints, all safety flags, secure inputs, and both local verification rounds.
2. Provision the exact allowlisted isolated-staging Vercel environment through stdin and reject any unexpected existing variable name.
3. For the current qibh state, verify the exact committed 103-migration history, schema, catalog, ACLs, closed runtime controls, storage surface, and bounded synthetic auth surface without database mutation. Fresh apply is allowed only for a genuinely empty isolated project; the historical 102-to-103 forward mode remains a separate one-time path and never falls back to fresh apply on nonempty state.
4. Through a separate database-owner broker, install, tightly recover, or exactly reuse the qibh-only synthetic retention policy. Prove service-role SELECT-only access, zero table- or column-level writes, zero anon/authenticated/PUBLIC grants, exact policy values, and the actual relation owner.
5. Deploy the exact commit to the isolated Vercel staging project and verify deployment metadata. Assign each allowlisted app alias one at a time and prove the exact control-plane mapping. The monotonic, 180-second edge-propagation gate may retry only Vercel's exact `404 DEPLOYMENT_NOT_FOUND` surface. An alias that is not additionally protected must reach DealFlow's exact closed 404 gate. An alias protected by Vercel Authentication must first return the exact public `302 https://vercel.com/sso-api` shape, then reach DealFlow's exact closed 404 only when the automation-bypass header is sent to that same alias without the DealFlow gate secret. Raw redirect queries, nonces, bypass values, and cookies are never persisted. Recheck the candidate mapping before loading the DealFlow staging secret, then prove the unauthenticated, header, and cookie surfaces sequentially before assigning the next alias. Prove the real Next chunk remains gated, the release-bound private image source remains gated, and the staging optimizer cannot return image content even when an outer gate credential is supplied. Unexpected redirects, URL changes, public 200s, optimizer image responses, generic failures, mapping drift, and deadline exhaustion fail closed and trigger rollback.
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
