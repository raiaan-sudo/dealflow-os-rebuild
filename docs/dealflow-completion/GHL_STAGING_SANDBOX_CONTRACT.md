# DealFlow GHL staging sandbox contract

Status: `IMPLEMENTED_LOCAL / PROVIDER_ACCEPTANCE_NOT_YET_RUN / PRODUCTION_DENIED`

## Boundary

The HTTPS adapter runs only when every gate agrees:

- provider environment is exactly `sandbox`;
- the explicit DealFlow deployment target is `staging`, `preview`, or `test`;
- Vercel does not attest the deployment as production (this overrides any
  conflicting repository-controlled target);
- the current Supabase project ref exactly matches the separately configured
  staging ref;
- the database is explicitly attested as isolated;
- the exact `DEALFLOW_GHL_SANDBOX_ONLY_V1` attestation is present;
- provider writes are explicitly enabled; and
- the provider origin is exactly `https://services.leadconnectorhq.com`.

An optimized Next build may use `NODE_ENV=production`; that build mode is not
deployment authority. Unknown targets and actual production deployments fail
closed even if another flag is accidentally enabled. The fake
adapter remains loopback-only and its existing gate was not weakened.

The database stores `env:GHL_SANDBOX_*_TOKEN` references only. The resolver
borrows the corresponding secret in memory for one callback. Tokens are never
returned by adapter results, written to receipts, or accepted from arbitrary
environment-variable names.

## Canonical authority

`ghl_location_mappings` is the only routing authority. The legacy
`workspace_ghl_mapping` and `partner_ghl_config` rows are compatibility
projections. Enqueue and worker claims fail closed if either legacy projection
disagrees with the canonical active sandbox location.

An active route also requires an active realtor tenant, active sandbox
installation, nonempty credential reference, approved snapshot manifest, exact
snapshot verification, and exact required-object verification.

## Lead delivery

After the canonical lead is persisted, the existing durable
`lead_side_effects` job claims a third child effect, `ghl_delivery`. That child
effect idempotently enqueues four PII-free provider effects:

1. contact upsert;
2. opportunity upsert;
3. tag application; and
4. workflow enrollment.

The provider worker fetches lead PII only after a fenced claim. Non-contact
effects cannot be claimed until the contact receipt has succeeded. Every
provider attempt is settled through the existing append-only receipt and
fencing protocol. Blind transport retries are forbidden for writes; uncertain
outcomes require reconciliation. Safe reads use bounded retry, timeout,
response-size, `429`, and exact-host controls.

## Snapshot and funnel limitation

GHL's supported Snapshots API exposes list/share/status operations but no
sanctioned snapshot-push endpoint. The adapter therefore accepts only an
already-installed sandbox snapshot and verifies its provider status and exact
required objects. A request for programmatic snapshot push becomes
`ghl_snapshot_push_api_unavailable` and requires operator action.

GHL funnel and form APIs do not expose the write contract required to publish a
fully generated DealFlow funnel. Funnel publication remains
`BLOCKED_EXTERNAL`; this implementation does not misrepresent a local request
or a status read as publication.

## Required staging values

```dotenv
GHL_PROVIDER_ENVIRONMENT=sandbox
DEALFLOW_DEPLOYMENT_TARGET=staging
GHL_PROVIDER_BASE_URL=https://services.leadconnectorhq.com
GHL_SANDBOX_WRITES_ENABLED=true
GHL_SANDBOX_ISOLATED_DATABASE=true
GHL_SANDBOX_ISOLATED_SUPABASE_PROJECT_REF=<exact isolated project ref>
GHL_SANDBOX_PROVIDER_ATTESTATION=DEALFLOW_GHL_SANDBOX_ONLY_V1
GHL_SANDBOX_AGENCY_TOKEN=<sandbox PIT in secret storage>
```

The installation row must reference the secret as
`env:GHL_SANDBOX_AGENCY_TOKEN`. Never put the token in SQL, source, logs,
receipts, screenshots, or evidence artifacts.

## Verification

Run:

```bash
npm run test:ghl-sandbox
node scripts/test-ghl-tenant-provisioning.mjs
npm run test:ghl-disposable-db
npm run typecheck
```

Provider acceptance must use only a HighLevel Marketplace sandbox/PIT, clearly
labeled synthetic records, disabled email/SMS, and no real customer data.
