import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260712223000_complete_ghl_activation_and_lifecycle_foundation.sql");
const displayNameFinalizationMigration = read(
  "supabase/migrations/20260713027000_add_ghl_location_display_name_finalization.sql",
);
const campaignPersonalizationMigration = read(
  process.env.DEALFLOW_GHL_CAMPAIGN_PERSONALIZATION_MIGRATION
    ?? "supabase/migrations/20260713014000_scope_ghl_personalization_to_campaign.sql",
);
const billing = read("src/lib/services/billing-service.ts");
const productionGate = read("src/lib/integrations/gohighlevel/production-gate.ts");
const lifecycleGate = read("src/lib/integrations/gohighlevel/lifecycle-gate.ts");
const adapter = read("src/lib/integrations/gohighlevel/sandbox-adapter.ts");
const webhook = read("src/lib/integrations/gohighlevel/webhook-contract.ts");
const webhookRoute = read("src/app/api/integrations/ghl/webhook/route.ts");
const lifecycleService = read("src/lib/services/ghl-lifecycle-service.ts");
const proxy = read("src/proxy.ts");
const workerRoute = read("src/app/api/internal/ghl-worker/route.ts");
const systemRunner = read("src/app/api/internal/system-jobs/route.ts");
const providerWorker = read("src/lib/services/ghl-provider-worker-service.ts");
const personalizationWorker = read("src/lib/services/ghl-personalization-service.ts");
const leadOutboxWorker = read("src/lib/services/ghl-sandbox-outbox-service.ts");
const leadEffectPolicy = read("src/lib/services/lead-effect-aggregation-service.ts");
const documentation = read("docs/dealflow-completion/GHL_PRODUCTION_OPERATING_CONTRACT.md");

const adapterAst = ts.createSourceFile(
  "sandbox-adapter.ts",
  adapter,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
let verifyFormsMethod = null;
function findVerifyFormsMethod(node) {
  if (
    ts.isMethodDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text === "verifyPreinstalledForms"
  ) {
    verifyFormsMethod = node;
  }
  ts.forEachChild(node, findVerifyFormsMethod);
}
findVerifyFormsMethod(adapterAst);
assert.ok(verifyFormsMethod, "the exact preinstalled-forms verifier must exist");
let hasOfficialFormsParameters = false;
let hasOfficialFormsRequest = false;
function inspectVerifyFormsContract(node) {
  if (
    ts.isNewExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === "URLSearchParams"
    && node.arguments?.length === 1
    && ts.isObjectLiteralExpression(node.arguments[0])
  ) {
    const names = new Set(node.arguments[0].properties.flatMap((property) =>
      ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        ? [property.name.text]
        : []
    ));
    hasOfficialFormsParameters = ["locationId", "skip", "limit"].every((name) => names.has(name));
  }
  if (
    ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "request"
    && node.arguments.length === 1
    && ts.isObjectLiteralExpression(node.arguments[0])
  ) {
    const properties = new Map(node.arguments[0].properties.flatMap((property) =>
      ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        ? [[property.name.text, property.initializer]]
        : []
    ));
    const method = properties.get("method");
    const version = properties.get("version");
    const path = properties.get("path");
    if (
      method && ts.isStringLiteral(method) && method.text === "GET"
      && version && ts.isStringLiteral(version) && version.text === "v3"
      && path && ts.isTemplateExpression(path) && path.head.text === "/forms/?"
    ) {
      hasOfficialFormsRequest = true;
    }
  }
  ts.forEachChild(node, inspectVerifyFormsContract);
}
inspectVerifyFormsContract(verifyFormsMethod);
assert.equal(hasOfficialFormsParameters, true, "forms verification must bind locationId plus bounded skip/limit pagination");
assert.equal(hasOfficialFormsRequest, true, "forms verification must use the official v3 GET /forms contract");

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
assert.match(campaignPersonalizationMigration, /prepare_ghl_campaign_personalization_v2/);
assert.match(migration, /claim_next_ghl_location_personalization_v1/);
assert.match(migration, /settle_ghl_location_personalization_v1/);
assert.match(campaignPersonalizationMigration, /resolve_ghl_ready_campaign_destination_v2/);
assert.match(campaignPersonalizationMigration, /campaign_id uuid null references public\.campaign_plans/);
assert.match(campaignPersonalizationMigration, /ghl_location_personalizations_campaign_unique/);
assert.match(campaignPersonalizationMigration, /ghl_location_personalizations_campaign_scope_unique/);
assert.match(campaignPersonalizationMigration, /ghl_location_personalizations_slot_unique/);
assert.match(campaignPersonalizationMigration, /campaignSlots/);
assert.match(campaignPersonalizationMigration, /customValueNames/);
assert.match(campaignPersonalizationMigration, /source_plan_fingerprint/);
assert.match(campaignPersonalizationMigration, /destination_contract_fingerprint/);
assert.match(
  campaignPersonalizationMigration,
  /create trigger ghl_campaign_personalization_receipts_append_only\s+before update or delete on public\.ghl_campaign_personalization_receipts\s+for each row execute function public\.ghl_reject_personalization_receipt_mutation_v2\(\)/s,
);
assert.match(campaignPersonalizationMigration, /lease_expired_uncertain/i);
assert.match(campaignPersonalizationMigration, /attempt_count/);
assert.match(campaignPersonalizationMigration, /max_attempts/);
assert.match(campaignPersonalizationMigration, /personalization_attempts_exhausted/);
assert.match(campaignPersonalizationMigration, /slot capacity is exhausted/i);
assert.match(campaignPersonalizationMigration, /supports exactly one campaign/i);
assert.match(campaignPersonalizationMigration, /adDestination' <> 'website'/);
assert.match(campaignPersonalizationMigration, /businessType' <> 'real_estate_realtor'/);
assert.match(campaignPersonalizationMigration, /headline/);
assert.match(campaignPersonalizationMigration, /primaryText/);
assert.match(campaignPersonalizationMigration, /selected_ad_id_value/);
assert.match(campaignPersonalizationMigration, /p_plan -> 'staticAds'/);
assert.match(campaignPersonalizationMigration, /selectedCreativeId/);
assert.match(campaignPersonalizationMigration, /agentName/);
assert.match(campaignPersonalizationMigration, /themePrimaryColor/);
assert.doesNotMatch(campaignPersonalizationMigration, /\/funnels\/|\/pages\/|\/forms\/[^?]/);
assert.match(migration, /claim_next_ghl_production_lead_outbox/);
assert.match(migration, /GHL lifecycle webhook idempotency conflict/);
assert.match(migration, /create table if not exists public\.ghl_lifecycle_object_states/);
assert.match(migration, /ghl_lifecycle_object_states_provider_unique/);
assert.match(migration, /lifecycle_event_id uuid null/);
assert.match(migration, /'lifecycle_reconciliation'/);
assert.match(migration, /ghl_lifecycle_out_of_order_event/);
assert.match(migration, /ghl_lifecycle_same_version_conflict/);
assert.match(migration, /ghl_lifecycle_unknown_lead_binding/);
assert.match(migration, /ghl_lifecycle_ambiguous_lead_binding/);
assert.match(migration, /ghl_lifecycle_appointment_status_unknown/);
assert.match(migration, /provider_status_value in \('new', 'confirmed', 'active'\) then 'booked'/);
assert.match(migration, /provider_status_value in \('completed', 'showed'\) then 'completed'/);
assert.match(migration, /provider_status_value = 'cancelled' then 'canceled'/);
assert.match(migration, /provider_status_value = 'noshow' then 'no_show'/);
assert.match(productionGate, /GHL_PRODUCTION_WRITES_ENABLED === "true"/);
assert.match(productionGate, /GHL_PRODUCTION_PROVISIONING_ENABLED/);
assert.match(productionGate, /GHL_PRODUCTION_LEAD_DELIVERY_ENABLED/);
assert.match(productionGate, /GHL_PRODUCTION_LIFECYCLE_WEBHOOK_ENABLED/);
assert.match(productionGate, /GHL_PRODUCTION_FORM_SUBMISSIONS_READ_ENABLED/);
assert.match(productionGate, /input\.deploymentTarget !== "production" \|\| input\.vercelEnv !== "production"/);
assert.match(adapter, /retryMode: "no-retry"/);
assert.match(adapter, /\/locations\/search\?\$\{search\.toString\(\)\}/);
assert.match(adapter, /companyId: this\.companyId/);
assert.match(adapter, /finalizeLocationDisplayName/);
assert.match(adapter, /method: "PUT"/);
assert.match(adapter, /cleanName/);
assert.match(adapter, /post_update/);
assert.match(displayNameFinalizationMigration, /'location_display_name_finalize'/);
assert.match(adapter, /\/contacts\/upsert/);
assert.match(adapter, /\/opportunities\/upsert/);
assert.match(adapter, /customValues/);
assert.doesNotMatch(adapter, /GHL sandbox provider/);
assert.match(webhook, /X-GHL-Signature|GHL_ED25519_PUBLIC_KEY/);
assert.match(webhook, /verify\(null/);
assert.match(webhook, /body\.messageId.*body\.emailMessageId/);
assert.match(webhook, /body\.conversationProviderId.*body\.conversationId/);
assert.match(webhook, /appointment\.dateUpdated \|\| body\.timestamp/);
assert.match(webhookRoute, /resolveGhlLifecycleEnvironment/);
assert.match(lifecycleGate, /assertGhlProductionAllowed/);
assert.match(lifecycleGate, /assertGhlSandboxAllowed/);
assert.match(lifecycleGate, /target === "production"/);
assert.match(lifecycleGate, /target === "staging"/);
assert.match(lifecycleGate, /gate\.exactIsolatedStagingHost !== true/);
assert.match(webhookRoute, /verifyGhlWebhookSignature\(rawBody/);
assert.match(webhookRoute, /projectionStatus: acceptance\.projectionStatus/);
assert.match(lifecycleService, /projectionStatus !== "reconciled"/);
assert.match(lifecycleService, /projectionStatus !== "operator_action_required"/);
assert.match(lifecycleService, /projectionStatus !== "reconciliation_pending"/);
assert.match(lifecycleService, /p_environment: environment/);
assert.match(lifecycleService, /ghl_lifecycle_projection_incomplete/);
assert.match(proxy, /"\/api\/integrations\/ghl\/webhook"/);
assert.match(workerRoute, /assertInternalSystemRequest/);
assert.match(workerRoute, /processGhlProviderWorkerFromEnvironment/);
assert.match(systemRunner, /processGhlProviderWorkerFromEnvironment/);
assert.match(providerWorker, /assertGhlDatabaseRuntimeControl/);
assert.doesNotMatch(providerWorker, /prepare_ghl_location_personalization_v1/);
assert.match(personalizationWorker, /prepare_ghl_campaign_personalization_v2/);
assert.match(personalizationWorker, /resolve_ghl_ready_campaign_destination_v2/);
assert.match(personalizationWorker, /provisioning_writes_enabled/);
assert.match(personalizationWorker, /applyCustomValues/);
assert.match(personalizationWorker, /verifyPreinstalledForms/);
assert.match(leadOutboxWorker, /select\("id,organization_id,campaign_id,first_name/);
assert.match(leadOutboxWorker, /from\("campaign_plans"\)/);
assert.match(leadOutboxWorker, /resolve_ghl_ready_campaign_destination_v2/);
assert.match(leadOutboxWorker, /p_campaign_id: campaignId/);
assert.match(leadOutboxWorker, /adDestination === "website"/);
assert.match(leadOutboxWorker, /meta_instant_form/);
assert.match(leadEffectPolicy, /evaluateGhlProductionGate/);
assert.match(documentation, /does not claim to publish snapshots, funnels, pages, forms/);
assert.doesNotMatch(migration, /Bearer\s+[A-Za-z0-9._-]{20,}/);
assert.doesNotMatch(campaignPersonalizationMigration, /Bearer\s+[A-Za-z0-9._-]{20,}/);

console.log("GHL production activation, exact campaign-scoped personalization, fencing, receipts, destination, and lifecycle contract passed (offline; provider writes disabled).\n");
