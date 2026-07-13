# Isolated staging acceptance

This harness is the only supported one-pass path from an exact local release seal to the isolated DealFlow staging project. It is fail-closed and does not authorize production.

## Safety boundary

- Target application: `dealflow-os-rebuild-selfserve-clean.vercel.app` and its deployment-specific Vercel URL only.
- Target database: the fingerprint-pinned Supabase project with safe suffix `qibh` only.
- Data: seven clearly labeled synthetic roles and synthetic fixtures only.
- External effects: Meta, GHL, Stripe, Twilio, creative-provider, support-delivery, advertising-spend, and customer-communication actions remain disabled.
- Production/shared hosts, databases, provider credentials, customer data, live charges, live ads, communications, and production deployment are rejected.
- The staging project's Vercel production slot is used only because the entire Vercel project is isolated staging. Runtime identity must match the pinned staging project id and staging host attestation.

## Required preconditions

Run both exact final-verification rounds first. Each summary must be schema v3, Node 20, bound to the same clean commit/tree and exact migration portfolio, have every local command pass, and contain only the three allowlisted authenticated-hosted deferrals:

- `npm run rls:cross-tenant`
- `npm run rls:fixture-smoke`
- `npm run operator:debt`

The execution shell must contain the exact isolated staging Supabase authority, the existing staging Vercel authority, and freshly supplied staging-only QA password, partner-attribution signing secret, and internal-system secret. Secrets are accepted from process memory and sent to Vercel through stdin; they are never placed in arguments or evidence.

Every zero-external-effects flag must have the exact value enforced by `src/lib/safety/zero-external-effects.ts`. In particular, `STRIPE_FORCE_TEST_MODE`, both lead-load bypass flags, and all provider-write flags remain `false`.

## Execution

```bash
npm run staging:acceptance -- \
  --execute \
  --apply-migrations \
  --deploy \
  --evidence-dir /private/tmp/dealflow-staging-acceptance-evidence-<seal> \
  --round-one /absolute/path/to/round-1/verification-summary.json \
  --round-two /absolute/path/to/round-2/verification-summary.json
```

The additional authorization value is exact:

```text
DEALFLOW_STAGING_ACCEPTANCE_AUTHORIZATION=AUTHORIZE_ISOLATED_STAGING_ACCEPTANCE_V1
```

Without all three flags, that authorization, every required secure input, an exact clean branch/commit/tree, and both accepted round summaries, the runner performs no remote mutation.

## Fixed order

1. Verify local repo, Node, branch, commit, tree, tracked-file digest, migration portfolio, Supabase fingerprint, Vercel fingerprints, all safety flags, secure inputs, and both local verification rounds.
2. Provision the exact allowlisted isolated-staging Vercel environment through stdin and reject any unexpected existing variable name.
3. Apply the complete migration portfolio through the atomic fresh-staging broker and verify the exact committed final migration, commit, and tree.
4. Deploy the exact commit to the isolated Vercel staging project and verify deployment metadata.
5. Seed the deployment-bound white-label host and seven synthetic roles twice, proving idempotency and atomic partner attribution.
6. Run the exact authenticated RLS cross-tenant and fixture-smoke commands, verify fixture cleanup, and run the exact operator-debt command.
7. Prove zero external effects on both stable-direct and deployment-specific partner hosts.
8. Run all seven role journeys on Chromium desktop, Chromium mobile, Firefox, and WebKit with zero skips, fail-closed network boundaries, and tenant isolation.
9. Run GET-only hosted load against public routes and the internal zero-effects control. Hosted lead-capture POST load is deliberately forbidden; it remains a local-only proof.
10. Compare effect-bearing table counts, rescan evidence for protected values and probable credentials, set private permissions, write the machine-readable manifest, and seal every artifact with SHA-256 checksums.

## Verdict semantics

A successful harness run proves only the safe isolated-staging surfaces it actually exercised. It must return production `NO_GO` while any required worker, lead-delivery, GHL, Meta, Stripe, creative-provider, Twilio, support-delivery, reporting, or recovery journey remains `NOT_PROVEN` or `FAIL`. Seeded end states never count as journey proof, and missing provider credentials never count as a pass.

Static validation is available without remote work:

```bash
npm run test:staging-acceptance-contract
```
