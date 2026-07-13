import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260712223000_complete_ghl_activation_and_lifecycle_foundation.sql");
const billing = read("src/lib/services/billing-service.ts");
const productionGate = read("src/lib/integrations/gohighlevel/production-gate.ts");
const adapter = read("src/lib/integrations/gohighlevel/sandbox-adapter.ts");
const webhook = read("src/lib/integrations/gohighlevel/webhook-contract.ts");
const workerRoute = read("src/app/api/internal/ghl-worker/route.ts");
const systemRunner = read("src/app/api/internal/system-jobs/route.ts");
const providerWorker = read("src/lib/services/ghl-provider-worker-service.ts");
const personalizationWorker = read("src/lib/services/ghl-personalization-service.ts");
const leadEffectPolicy = read("src/lib/services/lead-effect-aggregation-service.ts");
const documentation = read("docs/dealflow-completion/GHL_PRODUCTION_OPERATING_CONTRACT.md");

assert.match(billing, /request_ghl_provisioning_from_billing_activation_v1/);
const activationRecordIndex = billing.indexOf("await recordCommercialActivationWithInitialCredit");
const provisioningRequestIndex = billing.indexOf("await requestGhlProvisioningForQualifyingBillingActivation", activationRecordIndex);
assert.ok(activationRecordIndex > 0, "commercial activation must be durably recorded");
assert.ok(provisioningRequestIndex > activationRecordIndex, "GHL provisioning must occur only after durable commercial activation");
assert.equal(
  billing.slice(billing.indexOf("export async function syncBillingSubscriptionFromStripe"), activationRecordIndex)
    .includes("requestGhlProvisioningForQualifyingBillingActivation"),
  false,
  "subscription status alone must never request GHL provisioning",
);
assert.match(billing, /p_commercial_activation_id: input\.commercialActivationId/);
assert.match(migration, /commercial_activation_id uuid not null references public\.commercial_activations/);
assert.match(migration, /from public\.commercial_activations activation/);
assert.match(migration, /activation\.amount_paid_cents > 0/);
assert.doesNotMatch(migration, /subscription\.status in \('active', 'trialing'\)/);
assert.match(migration, /organization_record\.owner_user_id is distinct from p_user_id/);
assert.match(migration, /tenant_kind_value := case when organization_record\.partner_id is null then 'direct_realtor' else 'partner_child'/);
assert.match(migration, /owner_kind = 'platform'/);
assert.match(migration, /owner_kind = 'partner'/);
assert.match(migration, /installation_mode = 'preinstalled'/);
assert.match(migration, /ghl_billing_activation_event_unique/);
assert.match(migration, /state <> 'canceled'/);
assert.match(migration, /ghl_billing_commercial_activation_unique/);
assert.match(migration, /ghl_runtime_controls/);
assert.match(migration, /provisioning_writes_enabled boolean not null default false/);
assert.match(migration, /lead_writes_enabled boolean not null default false/);
assert.match(migration, /lifecycle_webhook_enabled boolean not null default false/);
assert.match(migration, /claim_next_ghl_provisioning_run_v1/);
assert.match(migration, /prepare_ghl_location_personalization_v1/);
assert.match(migration, /claim_next_ghl_location_personalization_v1/);
assert.match(migration, /settle_ghl_location_personalization_v1/);
assert.match(migration, /resolve_ghl_ready_destination_v1/);
assert.match(migration, /claim_next_ghl_production_lead_outbox/);
assert.match(migration, /GHL lifecycle webhook idempotency conflict/);
assert.match(productionGate, /GHL_PRODUCTION_WRITES_ENABLED === "true"/);
assert.match(productionGate, /GHL_PRODUCTION_PROVISIONING_ENABLED/);
assert.match(productionGate, /GHL_PRODUCTION_LEAD_DELIVERY_ENABLED/);
assert.match(productionGate, /GHL_PRODUCTION_LIFECYCLE_WEBHOOK_ENABLED/);
assert.match(productionGate, /input\.deploymentTarget !== "production" \|\| input\.vercelEnv !== "production"/);
assert.match(adapter, /retryMode: "no-retry"/);
assert.match(adapter, /\/contacts\/upsert/);
assert.match(adapter, /\/opportunities\/upsert/);
assert.match(adapter, /customValues/);
assert.match(adapter, /\/forms\/\?locationId=/);
assert.doesNotMatch(adapter, /GHL sandbox provider/);
assert.match(webhook, /X-GHL-Signature|GHL_ED25519_PUBLIC_KEY/);
assert.match(webhook, /verify\(null/);
assert.match(workerRoute, /assertInternalSystemRequest/);
assert.match(workerRoute, /processGhlProviderWorkerFromEnvironment/);
assert.match(systemRunner, /processGhlProviderWorkerFromEnvironment/);
assert.match(providerWorker, /assertGhlDatabaseRuntimeControl/);
assert.match(providerWorker, /prepare_ghl_location_personalization_v1/);
assert.match(personalizationWorker, /provisioning_writes_enabled/);
assert.match(personalizationWorker, /applyCustomValues/);
assert.match(personalizationWorker, /verifyPreinstalledForms/);
assert.match(leadEffectPolicy, /evaluateGhlProductionGate/);
assert.match(documentation, /does not claim to publish snapshots, funnels, pages, forms/);
assert.doesNotMatch(migration, /Bearer\s+[A-Za-z0-9._-]{20,}/);

console.log("GHL production activation, fencing, personalization, and lifecycle contract passed (offline; provider writes disabled).\n");
