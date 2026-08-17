# DealFlow GHL staging sandbox contract

> **Contract retained; execution status superseded.** Apply this safety boundary
> only with the current successor overlay in
> [`FINAL_MASTER_SUCCESSOR_STATUS_20260716.md`](FINAL_MASTER_SUCCESSOR_STATUS_20260716.md).
> Marketplace install/token/lifecycle acceptance is `NOT_YET_RUN`; production
> remains denied.

Status: `INTEGRATED CANDIDATE / FINAL-SEAL PROOF NOT_YET_RUN / PROVIDER ACCEPTANCE NOT_YET_RUN / PRODUCTION DENIED`

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

For a website campaign, route readiness additionally requires one exact
organization/campaign/environment personalization revision, a unique
manifest-declared campaign slot, the current source-plan fingerprint, exact
required-form verification, and a ready HTTPS destination receipt. Root-only
legacy personalization can bind one campaign only; a second campaign must fail
closed rather than reuse or overwrite the first campaign's values.

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
fencing protocol. Blind transport retries are forbidden for writes; dispatched
`408`, `429`, `5xx`, and transport-ambiguous outcomes require reconciliation.
Safe reads use bounded retry, timeout, response-size, `408`, `429`, and
exact-host controls.

## Snapshot and funnel limitation

GHL's v3 Create Sub-Account API accepts `snapshotId`. The adapter binds the
exact approved provider snapshot to the immutable create request/outbox/receipt,
sends one no-retry create POST, and then verifies snapshot status plus exact
required objects. GHL exposes no sanctioned standalone snapshot-push endpoint
for an existing location; that unsupported mode becomes
`ghl_snapshot_push_api_unavailable` and requires operator action.

GHL funnel and form APIs do not expose the write contract required to publish a
fully generated DealFlow funnel. The supported path uses a preinstalled
approved template and exact campaign slots with non-overlapping custom-value
names, form IDs, and HTTPS destinations. Arbitrary funnel publication remains
`BLOCKED_EXTERNAL`; this implementation does not misrepresent a local request
or successful snapshot copy/status read as publication. Copied funnels may
remain provider drafts until separately proven published.

## Operator-repaired required-object replay

When a preinstalled snapshot or its final inventory check proves required
objects missing, the run remains terminal and no blind worker retry occurs.
After an operator creates the exact missing objects, the service-role-only
`replay_ghl_operator_repaired_provisioning_v1` function may reopen only the
matching `snapshot_install` or `required_objects_verify` operation. The
function requires the exact organization/run pair, an unleased terminal run,
the matching unleased operator-required outbox, an append-only receipt with the
same blocker code, and the matching unresolved operator request. It preserves
the failed receipt, resolves the operator request, reopens the immutable outbox
identity, and returns the run to its exact verification state. It performs no
provider call; the normal database kill switch and sandbox/production gate
still control the later worker claim. Anonymous and authenticated roles have
no execute authority.

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
GHL_SANDBOX_INBOUND_FORMS_BINDINGS_JSON=[{"organizationId":"<synthetic staging uuid>","mappingId":"<synthetic mapping uuid>","providerLocationId":"<sandbox location id>","credentialRef":"env:GHL_SANDBOX_LOCATION_ACCOUNT_1_TOKEN"}]
GHL_SANDBOX_INBOUND_FORMS_AUTHORIZATION=DEALFLOW_GHL_SANDBOX_INBOUND_FORMS_EXACT_V1
GHL_SANDBOX_INBOUND_FORM_RECONCILIATION_ENABLED=true
GHL_SANDBOX_INBOUND_FORM_SWEEP_ENABLED=true
GHL_SANDBOX_LOCATION_ACCOUNT_1_TOKEN=<location-scoped forms.readonly token in secret storage>
```

Marketplace connect/callback, rotating refresh, and company-to-location token
exchange add a second exact gate. Staging must use only a labeled synthetic
HighLevel account and set
`GHL_MARKETPLACE_PROVIDER_EFFECTS_ENABLED=true`,
`GHL_MARKETPLACE_PROVIDER_ATTESTATION=DEALFLOW_GHL_MARKETPLACE_EXACT_V1`, and
`GHL_MARKETPLACE_SYNTHETIC_ACCOUNT_ATTESTATION=DEALFLOW_GHL_MARKETPLACE_SYNTHETIC_ACCOUNT_V1`.
The app/client configuration, exact callback/install URLs, scope set, and
AES-256-GCM key/version come from secret-managed `GHL_MARKETPLACE_*` values in
`.env.example`; credential plaintext must never be persisted or captured.
New white-label Marketplace configuration must use the neutral callback path
`/api/integrations/crm/marketplace/callback`; the legacy path containing `ghl`
is retained only for compatibility because HighLevel rejects branding
references in new white-label redirect URLs.
The custom-page live and testing URL is the neutral bootstrap path
`/crm/embed`. The legacy `/ghl/embed` bootstrap remains a compatibility alias;
both paths use the same signed-context exchange, verified partner-host binding,
and capability-scoped frame policy.

The installation row must reference the secret as
`env:GHL_SANDBOX_AGENCY_TOKEN`. Never put the token in SQL, source, logs,
receipts, screenshots, or evidence artifacts.

After the synthetic campaign personalization is ready, bind and verify the
independent Sub-Account token with:

```bash
npx tsx scripts/configure-ghl-inbound-forms-authority.ts sandbox
```

This commits both staging database gates closed, proves zero old reconciliation
and periodic-sweep claims, then
performs only GET provider scope checks before one exact-set binding transaction
durably records the zero-customer response evidence for the exact resulting
credential generation/form set and atomically reopens the requested gates. It
never falls back to the agency token. A successful
run must report `providerMutationAttempted:false`, the exact synthetic mapping,
and a non-secret credential-reference fingerprint. The runtime switch cannot
open if any eligible staging mapping lacks an exact verified binding.

For an immediate provider-independent stop, set
`GHL_SANDBOX_INBOUND_FORM_RECONCILIATION_ENABLED=false` and
`GHL_SANDBOX_INBOUND_FORM_SWEEP_ENABLED=false`, then run the same command. The
exact authorization is still required, but bindings may be empty
and no provider or credential call occurs before the database switch closes.

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
The acceptance result for the integrated 104-migration candidate is
`NOT_YET_RUN`.
