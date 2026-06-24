#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const migration = read("supabase/migrations/20260617170000_create_partner_ghl_integration.sql");
const ghlClient = read("src/lib/integrations/gohighlevel/client.ts");
const mappingRepairRoute = read("src/app/api/admin/click-to-scale/ghl-mapping-repair/route.ts");
const leadSyncProofRoute = read("src/app/api/admin/click-to-scale/ghl-lead-sync-proof/route.ts");
const crmSyncService = read("src/lib/services/partner-crm-sync-service.ts");
const provisioningService = read("src/lib/services/ghl-provisioning-service.ts");
const crmSyncDbProof = read("scripts/proof-partner-crm-sync-db.mjs");
const ghlProvisioningProof = read("scripts/proof-ghl-provisioning-v1.mjs");
const ghlOpportunityConfigProof = read("scripts/configure-ghl-opportunity-proof.mjs");
const systemJobService = read("src/lib/services/system-job-service.ts");
const leadSideEffectsCrmProofRoute = read("src/app/api/internal/lead-side-effects-crm-proof/route.ts");
const partnerCrmSyncDryProofRoute = read("src/app/api/internal/partner-crm-sync-dry-proof/route.ts");
const partnerCrmSyncLiveContactProofRoute = read("src/app/api/internal/partner-crm-sync-live-contact-proof/route.ts");
const fulfillmentMonitorService = read("src/lib/services/fulfillment-monitor-service.ts");
const fulfillmentMonitorPage = read("src/app/(app)/admin/fulfillment-monitor/page.tsx");
const fulfillmentMonitorRetryRoute = read("src/app/api/admin/fulfillment-monitor/crm-retry/route.ts");
const fulfillmentMonitorHealthRoute = read("src/app/api/admin/fulfillment-monitor/health/route.ts");
const env = read("src/lib/env.ts");
const schemaCheck = read("scripts/check-required-schema.mjs");
const packageJson = read("package.json");
const leadSideEffectsBranch =
  systemJobService.match(/processingJob\.kind === "lead_side_effects"[\s\S]*?processingJob\.kind === "performance_lead_billing"/)?.[0] ?? "";
const leadSideEffectsHelper =
  systemJobService.match(/export async function runLeadSideEffects[\s\S]*?function getJobClient/)?.[0] ?? "";

assert.equal(
  existsSync("src/lib/partners/partner-config.ts"),
  false,
  "Batch 3A must not add the stale hardcoded partner-config registry",
);

for (const table of [
  "partner_ghl_config",
  "workspace_ghl_mapping",
  "lead_crm_sync_events",
  "ghl_provisioning_jobs",
  "ghl_provisioning_events",
  "workspace_ghl_users",
  "partner_ghl_template_config",
  "partner_ghl_workflow_config",
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `${table} must exist`);
}

assert.match(
  migration,
  /partner_id uuid not null references public\.partners \(id\)/,
  "partner-level GHL tables must reference current partners(id)",
);
assert.doesNotMatch(
  migration,
  /create table if not exists public\.partner_configs/,
  "adapted schema must not recreate the stale text-keyed partner_configs registry",
);
assert.match(
  migration,
  /workspace_id uuid not null references public\.organizations \(id\)/,
  "workspace mappings must reference organizations safely",
);
assert.match(migration, /lead_id uuid not null references public\.leads \(id\)/);
assert.match(migration, /force row level security/);
assert.match(migration, /auth\.role\(\) = 'service_role'/);
assert.match(migration, /ghl_integration_schema_version/);

assert.match(ghlClient, /services\.leadconnectorhq\.com/);
assert.match(ghlClient, /const GHL_API_VERSION = "v3"/);
assert.match(ghlClient, /getGhlPrivateTokenFromCredentialRef/);
assert.match(ghlClient, /CLICKTOSCALE_GHL_PRIVATE_INTEGRATION/);
assert.match(ghlClient, /GHL_CLICK_TO_SCALE_PRIVATE_INTEGRATION_TOKEN/);
assert.match(ghlClient, /GHL_PRIVATE_INTEGRATION_TOKEN/);
assert.match(ghlClient, /upsertContact/);
assert.match(ghlClient, /createOpportunity/);
assert.match(ghlClient, /"\/opportunities\/"/);
assert.match(ghlClient, /pipelineId: payload\.pipelineId/);
assert.match(ghlClient, /pipelineStageId: payload\.stageId/);
assert.match(ghlClient, /status: payload\.status \?\? "open"/);
assert.doesNotMatch(ghlClient, /stageId: payload\.stageId/);
assert.match(ghlClient, /createLocation/);
assert.match(ghlClient, /createUser/);
assert.match(ghlClient, /getLocation/);
assert.match(ghlClient, /getPipelines/);
assert.match(ghlClient, /getWorkflows/);

for (const route of [mappingRepairRoute, leadSyncProofRoute]) {
  assert.match(route, /requirePlatformAdmin/);
  assert.match(route, /assertSameOriginRequest\(request\)/);
  assert.match(route, /apply: z\.boolean\(\)\.optional\(\)\.default\(false\)/);
  assert.match(route, /throw new ApiError\(409/);
  assert.match(route, /calledGhl: false/);
  assert.match(route, /mutatedDatabase: false/);
  assert.doesNotMatch(route, /new GoHighLevelClient|upsertContact|createOpportunity|createLocation|createUser/);
}

assert.match(env, /isGhlAutoProvisioningEnabled/);
assert.match(env, /GHL_AUTO_PROVISIONING_ENABLED/);
assert.match(env, /isGhlContactWritesEnabled/);
assert.match(env, /GHL_CONTACT_WRITES_ENABLED/);
assert.match(env, /isGhlOpportunityWritesEnabled/);
assert.match(env, /GHL_OPPORTUNITY_WRITES_ENABLED/);
assert.match(env, /isGhlProvisioningWritesEnabled/);
assert.match(env, /GHL_PROVISIONING_WRITES_ENABLED/);
assert.match(env, /isGhlWorkflowEnrollmentEnabled/);
assert.match(env, /GHL_WORKFLOW_ENROLLMENT_ENABLED/);

assert.match(schemaCheck, /validatePartnerGhlLocalSchemaContract/);
assert.match(schemaCheck, /20260617170000_create_partner_ghl_integration\.sql/);
assert.match(schemaCheck, /GHL partner foreign keys use current partners table/);

function modelIdempotencyKey({ partnerId, workspaceId, leadId, destination = "gohighlevel" }) {
  return createHash("sha256")
    .update([partnerId, workspaceId, leadId, destination].join("|"))
    .digest("hex");
}

const workspaceId = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";
const partnerA = "33333333-3333-4333-8333-333333333333";
const partnerB = "44444444-4444-4444-8444-444444444444";
assert.equal(
  modelIdempotencyKey({ partnerId: partnerA, workspaceId, leadId }),
  modelIdempotencyKey({ partnerId: partnerA, workspaceId, leadId }),
  "same partner/workspace/lead/destination must produce deterministic idempotency",
);
assert.notEqual(
  modelIdempotencyKey({ partnerId: partnerA, workspaceId, leadId }),
  modelIdempotencyKey({ partnerId: partnerB, workspaceId, leadId }),
  "same lead/workspace under different partners must not collapse to one duplicate identity",
);

assert.match(crmSyncService, /export function buildPartnerCrmSyncIdempotencyKey/);
assert.match(crmSyncService, /params\.partnerId, params\.workspaceId, params\.leadId, params\.destination \?\? GHL_DESTINATION/);
assert.match(crmSyncService, /export function buildGhlContactPayload/);
assert.match(crmSyncService, /export function buildGhlOpportunityPayload/);
assert.match(crmSyncService, /export async function readWorkspaceGhlConfig/);
assert.match(crmSyncService, /export async function syncLeadToPartnerCrm/);
assert.match(crmSyncService, /export async function safeSyncLeadToPartnerCrm/);
assert.match(crmSyncService, /export function classifyPartnerCrmSyncFailure/);
assert.match(crmSyncService, /status: "failed" as const/);
assert.match(crmSyncService, /status: "dead_letter" as const/);
assert.match(crmSyncService, /\.from\("organizations"\)[\s\S]*\.select\("id, partner_id"\)/);
assert.match(crmSyncService, /\.from\("workspace_ghl_mapping"\)/);
assert.match(crmSyncService, /\.from\("workspace_ghl_mapping"\)[\s\S]*\.select\("partner_id"\)[\s\S]*\.eq\("workspace_id", params\.workspaceId\)[\s\S]*\.eq\("sync_enabled", true\)[\s\S]*\.limit\(2\)/);
assert.match(crmSyncService, /partnerResolutionSource/);
assert.match(crmSyncService, /partnerResolutionSource = "workspace_mapping"/);
assert.match(crmSyncService, /ghl_mapping_ambiguous/);
assert.match(crmSyncService, /\.from\("partner_ghl_config"\)/);
assert.match(crmSyncService, /\.from\("lead_crm_sync_events"\)/);
assert.match(crmSyncService, /status: "processing"/);
assert.match(crmSyncService, /status: "skipped"/);
assert.match(crmSyncService, /event\?\.status === "synced"/);
assert.match(crmSyncService, /reason: "already_synced"/);
assert.match(crmSyncService, /reason: "crm_not_configured"/);
assert.match(crmSyncService, /reason: "ghl_auth_missing"/);
assert.match(crmSyncService, /reason: "ghl_contact_writes_disabled"/);
assert.match(crmSyncService, /new GoHighLevelClient/);
assert.match(crmSyncService, /\.upsertContact\(contactPayload\)/);
assert.match(crmSyncService, /contact_upserted/);
assert.match(crmSyncService, /opportunitySkipped = true/);
assert.match(crmSyncService, /workflow_enrollment: false/);
assert.match(crmSyncService, /workflow_enrollment_retired/);
assert.doesNotMatch(crmSyncService, /readPartnerGhlWorkflowConfig/);
assert.doesNotMatch(crmSyncService, /maybeEnrollContactInWorkflow/);
assert.doesNotMatch(crmSyncService, /isGhlWorkflowEnrollmentEnabled/);
assert.doesNotMatch(crmSyncService, /\.from\("partner_ghl_workflow_config"\)/);
assert.doesNotMatch(crmSyncService, /\.addContactToWorkflow\(\{/);
assert.doesNotMatch(crmSyncService, /workflow_enrollment_disabled|workflow_config_missing|workflow_waiting_for_opportunity_sync|workflow_enrolled|workflow_enrollment_failed/);
assert.match(crmSyncService, /provisioning: false/);
assert.match(crmSyncService, /dryRun = options\.dryRun !== false/);
assert.match(crmSyncService, /isGhlContactWritesEnabled/);
assert.match(crmSyncService, /isGhlOpportunityWritesEnabled/);
assert.match(crmSyncService, /writeEventLedger = options\.writeEventLedger !== false/);
assert.match(crmSyncService, /catch \(error\)/);
assert.match(crmSyncService, /\.createOpportunity\(opportunityPayload\)/);
assert.match(crmSyncService, /pipeline_or_stage_missing/);
assert.match(crmSyncService, /ghl_opportunity_create_failed/);
assert.match(crmSyncService, /contact_and_opportunity_synced/);
assert.match(crmSyncService, /opportunity_id_present: Boolean\(opportunityId\)/);
assert.doesNotMatch(crmSyncService, /@\/lib\/partners\/partner-config/);
assert.doesNotMatch(crmSyncService, /\.createLocation\(|\.createUser\(/);
assert.doesNotMatch(crmSyncService, /stripe|safeSendMetaLeadConversion|safeNotifyAssignedAgentOfNewLead|provider/i);

assert.match(provisioningService, /export function buildGhlProvisioningIdempotencyKey/);
assert.match(provisioningService, /export async function evaluateGhlProvisioningReadiness/);
assert.match(provisioningService, /export async function loadGhlProvisioningOverview/);
assert.match(provisioningService, /\.from\("workspace_ghl_mapping"\)/);
assert.match(provisioningService, /\.from\("partner_ghl_config"\)/);
assert.doesNotMatch(provisioningService, /\.from\("partner_ghl_workflow_config"\)/);
assert.match(provisioningService, /\.from\("ghl_provisioning_jobs"\)/);
assert.match(provisioningService, /\.from\("workspace_ghl_users"\)/);
assert.match(provisioningService, /getGhlPrivateTokenFromCredentialRef/);
assert.match(provisioningService, /\.getLocation\(/);
assert.match(provisioningService, /\.getPipelines\(/);
assert.doesNotMatch(provisioningService, /\.getWorkflows\(/);
assert.match(provisioningService, /workflowEnrollmentRetired/);
assert.match(provisioningService, /Workflow enrollment is retired/);
assert.match(provisioningService, /mapping_only/);
assert.match(provisioningService, /operator_assisted/);
assert.match(provisioningService, /full_auto/);
assert.match(provisioningService, /isGhlAutoProvisioningEnabled/);
assert.match(provisioningService, /isGhlProvisioningWritesEnabled/);
assert.match(provisioningService, /dbMutation: false/);
assert.match(provisioningService, /ghlLocationWrite: false/);
assert.match(provisioningService, /ghlUserWrite: false/);
assert.match(provisioningService, /ghlPipelineWrite: false/);
assert.match(provisioningService, /ghlWorkflowWrite: false/);
assert.match(provisioningService, /tokensExposed: false/);
assert.match(provisioningService, /credentialRefsExposed: false/);
assert.doesNotMatch(provisioningService, /@\/lib\/partners\/partner-config/);
assert.doesNotMatch(provisioningService, /\.createLocation\(|\.createUser\(|\.upsertContact\(|\.createOpportunity\(|\.addContactToWorkflow\(/);
assert.doesNotMatch(provisioningService, /safeNotifyAssignedAgentOfNewLead|safeSendMetaLeadConversion|new Stripe|providerUsage|higgsfield|openai/i);

assert.match(leadSideEffectsBranch, /processingJob\.kind === "lead_side_effects"/);
assert.match(leadSideEffectsBranch, /runLeadSideEffects\(\{/);
assert.match(leadSideEffectsBranch, /jobId: processingJob\.id/);
assert.match(leadSideEffectsHelper, /export async function runLeadSideEffects/);
assert.match(leadSideEffectsHelper, /safeNotifyAssignedAgentOfNewLead/);
assert.match(leadSideEffectsHelper, /safeSendMetaLeadConversion/);
assert.match(leadSideEffectsHelper, /safeSyncLeadToPartnerCrm/);
assert.match(leadSideEffectsHelper, /const \[notificationResult, metaConversionResult, crmSyncResult\] = await Promise\.all/);
assert.match(leadSideEffectsHelper, /safeSyncLeadToPartnerCrm\(payload\.lead,\s*\{[\s\S]*?dryRun:\s*false[\s\S]*?source:\s*"lead_side_effects"[\s\S]*?requestId:\s*payload\.requestId[\s\S]*?systemJobId:\s*jobId[\s\S]*?\}\)\.catch/);
assert.match(leadSideEffectsHelper, /crmSyncResult/);
assert.match(leadSideEffectsHelper, /notificationResult/);
assert.match(leadSideEffectsHelper, /metaConversionResult/);
assert.doesNotMatch(leadSideEffectsBranch, /GHL_PROVISIONING_WRITES_ENABLED\s*=\s*true|GHL_WORKFLOW_ENROLLMENT_ENABLED\s*=\s*true/);
assert.doesNotMatch(leadSideEffectsBranch, /createLocation|createUser|workflow|enrollment|new Stripe|providerUsage|higgsfield|openai/i);
assert.doesNotMatch(leadSideEffectsHelper, /GHL_PROVISIONING_WRITES_ENABLED\s*=\s*true|GHL_WORKFLOW_ENROLLMENT_ENABLED\s*=\s*true/);
assert.doesNotMatch(leadSideEffectsHelper, /createLocation|createUser|workflow|enrollment|new Stripe|providerUsage|higgsfield|openai/i);

assert.match(packageJson, /"proof:partner-crm-sync-db": "node \.\/scripts\/proof-partner-crm-sync-db\.mjs"/);
assert.match(packageJson, /"proof:lead-side-effects-crm-dry": "node \.\/scripts\/proof-lead-side-effects-crm-dry\.mjs"/);
assert.match(packageJson, /"proof:configure-ghl-opportunity": "node \.\/scripts\/configure-ghl-opportunity-proof\.mjs"/);
assert.match(packageJson, /"proof:ghl-provisioning-v1": "node \.\/scripts\/proof-ghl-provisioning-v1\.mjs"/);
assert.match(ghlProvisioningProof, /--dry-run/);
assert.match(ghlProvisioningProof, /--validate-only/);
assert.match(ghlProvisioningProof, /--apply/);
assert.match(ghlProvisioningProof, /--cleanup/);
assert.match(ghlProvisioningProof, /PROVISION_GHL_V1/);
assert.match(ghlProvisioningProof, /GHL_PROVISIONING_WRITES_ENABLED/);
assert.match(ghlProvisioningProof, /GHL_AUTO_PROVISIONING_ENABLED/);
assert.match(ghlProvisioningProof, /noGhlWrites: true/);
assert.match(ghlProvisioningProof, /noContactWrite: true/);
assert.match(ghlProvisioningProof, /noOpportunityWrite: true/);
assert.match(ghlProvisioningProof, /noWorkflowEnrollment: true/);
assert.match(ghlProvisioningProof, /tokensExposed: false/);
assert.match(ghlProvisioningProof, /credentialRefsExposed: false/);
assert.doesNotMatch(ghlProvisioningProof, /createLocation\(|createUser\(|upsertContact\(|createOpportunity\(|addContactToWorkflow\(/);
assert.doesNotMatch(ghlProvisioningProof, /from ["']stripe|safeNotifyAssignedAgentOfNewLead|safeSendMetaLeadConversion|providerUsage|higgsfield|openai/i);
assert.match(ghlOpportunityConfigProof, /TARGET_WORKSPACE_ID = "2e3b0144-23a9-483a-9e11-61173b4099c4"/);
assert.match(ghlOpportunityConfigProof, /TARGET_PARTNER_ID = "1b22d077-1f54-4327-ba48-1b1b793488a1"/);
assert.match(ghlOpportunityConfigProof, /DEFAULT_PIPELINE_ID = "pqz9gsHSW7EJj5w6W3xU"/);
assert.match(ghlOpportunityConfigProof, /DEFAULT_STAGE_ID = "a61b9237-7d8a-4f95-80e0-ac64ba1b537f"/);
assert.match(ghlOpportunityConfigProof, /CONFIGURE_GHL_OPPORTUNITY_PROOF/);
assert.match(ghlOpportunityConfigProof, /--dry-run/);
assert.match(ghlOpportunityConfigProof, /--apply/);
assert.match(ghlOpportunityConfigProof, /--cleanup/);
assert.match(ghlOpportunityConfigProof, /\.from\("workspace_ghl_mapping"\)/);
assert.match(ghlOpportunityConfigProof, /\.eq\("workspace_id", TARGET_WORKSPACE_ID\)/);
assert.match(ghlOpportunityConfigProof, /\.eq\("partner_id", TARGET_PARTNER_ID\)/);
assert.match(ghlOpportunityConfigProof, /ghl_opportunity_v1_proof/);
assert.match(ghlOpportunityConfigProof, /previous_pipeline_id/);
assert.match(ghlOpportunityConfigProof, /no_ghl_write: true/);
assert.match(ghlOpportunityConfigProof, /no_workflow_enrollment: true/);
assert.match(ghlOpportunityConfigProof, /no_provisioning: true/);
assert.doesNotMatch(ghlOpportunityConfigProof, /new GoHighLevelClient|\.upsertContact\(|\.createOpportunity\(|\.createLocation\(|\.createUser\(/);
assert.doesNotMatch(ghlOpportunityConfigProof, /from "stripe"|from 'stripe'|safeNotifyAssignedAgentOfNewLead|safeSendMetaLeadConversion|providerUsage|higgsfield|openai/i);
assert.match(leadSideEffectsCrmProofRoute, /assertInternalSystemRequest/);
assert.match(leadSideEffectsCrmProofRoute, /assertProofRequest/);
assert.match(leadSideEffectsCrmProofRoute, /LEAD_SIDE_EFFECTS_CRM_PROOF_ENABLED/);
assert.match(leadSideEffectsCrmProofRoute, /LEAD_SIDE_EFFECTS_CRM_PROOF_SECRET/);
assert.match(leadSideEffectsCrmProofRoute, /runLeadSideEffects/);
assert.match(leadSideEffectsCrmProofRoute, /proof_ghl_writes_disabled_stub/);
assert.match(leadSideEffectsCrmProofRoute, /processedRealSystemJob: false/);
assert.match(leadSideEffectsCrmProofRoute, /createdRealLead: false/);
assert.match(leadSideEffectsCrmProofRoute, /createdSystemJob: false/);
assert.match(leadSideEffectsCrmProofRoute, /liveGhlCall: false/);
assert.match(leadSideEffectsCrmProofRoute, /smsEmailSent: false/);
assert.match(leadSideEffectsCrmProofRoute, /metaMutation: false/);
assert.match(leadSideEffectsCrmProofRoute, /stripeBillingProviderAction: false/);
assert.match(leadSideEffectsCrmProofRoute, /provisioning: false/);
assert.match(leadSideEffectsCrmProofRoute, /workflowEnrollment: false/);
assert.doesNotMatch(leadSideEffectsCrmProofRoute, /new GoHighLevelClient|\.upsertContact\(|\.createOpportunity\(|\.createLocation\(|\.createUser\(/);
assert.doesNotMatch(leadSideEffectsCrmProofRoute, /from "stripe"|from 'stripe'|new Stripe|providerUsage|generationCredit|higgsfield|openai/i);
assert.match(partnerCrmSyncDryProofRoute, /assertInternalSystemRequest/);
assert.match(partnerCrmSyncDryProofRoute, /PARTNER_CRM_SYNC_DRY_PROOF_ENABLED/);
assert.match(partnerCrmSyncDryProofRoute, /PARTNER_CRM_SYNC_DRY_PROOF_SECRET/);
assert.match(partnerCrmSyncDryProofRoute, /assertProofRequest/);
assert.match(partnerCrmSyncDryProofRoute, /readWorkspaceGhlConfig/);
assert.match(partnerCrmSyncDryProofRoute, /safeSyncLeadToPartnerCrm/);
assert.match(partnerCrmSyncDryProofRoute, /dryRun: true/);
assert.match(partnerCrmSyncDryProofRoute, /writeEventLedger: false/);
assert.match(partnerCrmSyncDryProofRoute, /liveGhlCall: false/);
assert.match(partnerCrmSyncDryProofRoute, /createdRealLead: false/);
assert.match(partnerCrmSyncDryProofRoute, /createdSystemJob: false/);
assert.match(partnerCrmSyncDryProofRoute, /tokensExposed: false/);
assert.match(partnerCrmSyncDryProofRoute, /credentialRefsExposed: false/);
assert.doesNotMatch(partnerCrmSyncDryProofRoute, /getGhlPrivateTokenFromCredentialRef|new GoHighLevelClient|\.upsertContact\(|\.createOpportunity\(|\.createLocation\(|\.createUser\(/);
assert.doesNotMatch(partnerCrmSyncDryProofRoute, /from "stripe"|from 'stripe'|new Stripe|providerUsage|generationCredit|higgsfield|openai|safeNotifyAssignedAgentOfNewLead|safeSendMetaLeadConversion/i);
assert.match(partnerCrmSyncLiveContactProofRoute, /assertInternalSystemRequest/);
assert.match(partnerCrmSyncLiveContactProofRoute, /PARTNER_CRM_SYNC_LIVE_CONTACT_PROOF_ENABLED/);
assert.match(partnerCrmSyncLiveContactProofRoute, /GHL_CONTACT_WRITES_ENABLED/);
assert.match(partnerCrmSyncLiveContactProofRoute, /GHL_OPPORTUNITY_WRITES_ENABLED/);
assert.match(partnerCrmSyncLiveContactProofRoute, /INTERNAL_LEAD_SMS_ENABLED/);
assert.match(partnerCrmSyncLiveContactProofRoute, /GHL_AUTO_PROVISIONING_ENABLED/);
assert.match(partnerCrmSyncLiveContactProofRoute, /GHL_PROVISIONING_WRITES_ENABLED/);
assert.match(partnerCrmSyncLiveContactProofRoute, /GHL_WORKFLOW_ENROLLMENT_ENABLED/);
assert.doesNotMatch(partnerCrmSyncLiveContactProofRoute, /WORKFLOW_V1_PROOF_RUN_ID/);
assert.doesNotMatch(partnerCrmSyncLiveContactProofRoute, /qa\+ghl-workflow-v1-20260618@example\.com/);
assert.doesNotMatch(partnerCrmSyncLiveContactProofRoute, /workflowRetry|runWorkflowRetryProof|addContactToWorkflow/);
assert.match(partnerCrmSyncLiveContactProofRoute, /GHL workflow enrollment must remain disabled for this proof/);
assert.match(partnerCrmSyncLiveContactProofRoute, /readWorkspaceGhlConfig/);
assert.match(partnerCrmSyncLiveContactProofRoute, /safeSyncLeadToPartnerCrm/);
assert.match(partnerCrmSyncLiveContactProofRoute, /dryRun: false/);
assert.match(partnerCrmSyncLiveContactProofRoute, /writeEventLedger: true/);
assert.match(partnerCrmSyncLiveContactProofRoute, /publicLeadCreated: false/);
assert.match(partnerCrmSyncLiveContactProofRoute, /processedRealSystemJob: false/);
assert.match(partnerCrmSyncLiveContactProofRoute, /smsEmailSent: false/);
assert.match(partnerCrmSyncLiveContactProofRoute, /metaMutation: false/);
assert.match(partnerCrmSyncLiveContactProofRoute, /stripeBillingProviderAction: false/);
assert.match(partnerCrmSyncLiveContactProofRoute, /providerGeneration: false/);
assert.match(partnerCrmSyncLiveContactProofRoute, /opportunityWriteGate: "GHL_OPPORTUNITY_WRITES_ENABLED"/);
assert.match(partnerCrmSyncLiveContactProofRoute, /opportunityCreation: Boolean/);
assert.match(partnerCrmSyncLiveContactProofRoute, /provisioning: false/);
assert.match(partnerCrmSyncLiveContactProofRoute, /workflowEnrollment: false/);
assert.match(partnerCrmSyncLiveContactProofRoute, /workflowEnrollmentRetired: true/);
assert.match(partnerCrmSyncLiveContactProofRoute, /workflow_enrollment_retired/);
assert.match(partnerCrmSyncLiveContactProofRoute, /tokensExposed: false/);
assert.match(partnerCrmSyncLiveContactProofRoute, /credentialRefsExposed: false/);
assert.doesNotMatch(partnerCrmSyncLiveContactProofRoute, /\.upsertContact\(|\.createOpportunity\(|\.createLocation\(|\.createUser\(/);
assert.doesNotMatch(partnerCrmSyncLiveContactProofRoute, /from "stripe"|from 'stripe'|new Stripe|providerUsage|generationCredit|higgsfield|openai|safeNotifyAssignedAgentOfNewLead|safeSendMetaLeadConversion/i);

assert.match(fulfillmentMonitorPage, /assertInternalOperatorAccess/);
assert.match(fulfillmentMonitorPage, /loadFulfillmentMonitorData/);
assert.match(fulfillmentMonitorPage, /CrmRetryButton/);
assert.match(fulfillmentMonitorPage, /Fulfillment monitor/);
assert.match(fulfillmentMonitorPage, /performance billing/i);
assert.match(fulfillmentMonitorPage, /CRM \/ GHL/);
assert.match(fulfillmentMonitorPage, /Workflow enrollment/);
assert.match(fulfillmentMonitorPage, /retired/);
assert.doesNotMatch(fulfillmentMonitorPage, /getGhlPrivateTokenFromCredentialRef|new GoHighLevelClient|\.upsertContact\(|\.createOpportunity\(|\.createLocation\(|\.createUser\(/);

assert.match(fulfillmentMonitorRetryRoute, /assertSameOriginRequest/);
assert.match(fulfillmentMonitorRetryRoute, /assertInternalOperatorAccess/);
assert.match(fulfillmentMonitorRetryRoute, /RETRY_CRM_SYNC/);
assert.match(fulfillmentMonitorRetryRoute, /retryFulfillmentCrmSync/);
assert.match(fulfillmentMonitorRetryRoute, /crmSyncOnly: true/);
assert.match(fulfillmentMonitorRetryRoute, /smsEmailSent: false/);
assert.match(fulfillmentMonitorRetryRoute, /metaMutation: false/);
assert.match(fulfillmentMonitorRetryRoute, /stripeBillingProviderAction: false/);
assert.match(fulfillmentMonitorRetryRoute, /providerGeneration: false/);
assert.match(fulfillmentMonitorRetryRoute, /provisioning: false/);
assert.match(fulfillmentMonitorRetryRoute, /workflowEnrollment: false/);
assert.match(fulfillmentMonitorRetryRoute, /tokensExposed: false/);
assert.match(fulfillmentMonitorRetryRoute, /credentialRefsExposed: false/);
assert.doesNotMatch(fulfillmentMonitorRetryRoute, /safeNotifyAssignedAgentOfNewLead|safeSendMetaLeadConversion|new Stripe|providerUsage|higgsfield|openai|createLocation|createUser/i);

assert.match(fulfillmentMonitorHealthRoute, /assertInternalOperatorAccess/);
assert.match(fulfillmentMonitorHealthRoute, /loadFulfillmentMonitorData/);
assert.match(fulfillmentMonitorHealthRoute, /readOnlyHealthCheck: true/);
assert.match(fulfillmentMonitorHealthRoute, /dbMutation: false/);
assert.match(fulfillmentMonitorHealthRoute, /ghlContactWrite: false/);
assert.match(fulfillmentMonitorHealthRoute, /ghlOpportunityWrite: false/);
assert.match(fulfillmentMonitorHealthRoute, /provisioning: false/);
assert.match(fulfillmentMonitorHealthRoute, /workflowEnrollment: false/);
assert.match(fulfillmentMonitorHealthRoute, /tokensExposed: false/);
assert.match(fulfillmentMonitorHealthRoute, /credentialRefsExposed: false/);
assert.doesNotMatch(fulfillmentMonitorHealthRoute, /safeSyncLeadToPartnerCrm|new GoHighLevelClient|\.upsertContact\(|\.createOpportunity\(/);

assert.match(fulfillmentMonitorService, /lead_crm_sync_events/);
assert.match(fulfillmentMonitorService, /workspace_ghl_mapping/);
assert.match(fulfillmentMonitorService, /partner_ghl_config/);
assert.match(fulfillmentMonitorService, /lead_billing_events/);
assert.match(fulfillmentMonitorService, /safeSyncLeadToPartnerCrm/);
assert.match(fulfillmentMonitorService, /buildPartnerCrmSyncIdempotencyKey/);
assert.match(fulfillmentMonitorService, /dead_letter_confirmation_required/);
assert.match(fulfillmentMonitorService, /source: "fulfillment_monitor_retry"/);
assert.match(fulfillmentMonitorService, /no_sms_email: true/);
assert.match(fulfillmentMonitorService, /no_meta_mutation: true/);
assert.match(fulfillmentMonitorService, /no_stripe_billing_provider_action: true/);
assert.match(fulfillmentMonitorService, /provisioning: false/);
assert.match(fulfillmentMonitorService, /workflow_enrollment: false/);
assert.match(fulfillmentMonitorService, /credentialConfigured: Boolean/);
assert.doesNotMatch(fulfillmentMonitorService, /getGhlPrivateTokenFromCredentialRef|new GoHighLevelClient|\.upsertContact\(|\.createOpportunity\(|\.createLocation\(|\.createUser\(/);
assert.doesNotMatch(fulfillmentMonitorService, /safeNotifyAssignedAgentOfNewLead|safeSendMetaLeadConversion|from "stripe"|from 'stripe'|new Stripe|providerUsage|higgsfield|openai/i);
assert.match(crmSyncDbProof, /--dry-run/);
assert.match(crmSyncDbProof, /--apply/);
assert.match(crmSyncDbProof, /--cleanup/);
assert.match(crmSyncDbProof, /APPLY_PARTNER_CRM_SYNC_DB_PROOF/);
assert.match(crmSyncDbProof, /proof_run_id/);
assert.match(crmSyncDbProof, /no_ghl_calls: true/);
assert.match(crmSyncDbProof, /no_sms: true/);
assert.match(crmSyncDbProof, /no_meta: true/);
assert.match(crmSyncDbProof, /no_stripe: true/);
assert.match(crmSyncDbProof, /no_provider: true/);
assert.match(crmSyncDbProof, /wouldMutate: false/);
assert.match(crmSyncDbProof, /requireConfirmed\(args\)/);
assert.match(crmSyncDbProof, /Apply\/cleanup requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/);
assert.match(crmSyncDbProof, /noTokenRequired: true/);
assert.doesNotMatch(crmSyncDbProof, /new GoHighLevelClient|\.upsertContact\(|\.createOpportunity\(|\.createLocation\(|\.createUser\(/);
assert.doesNotMatch(crmSyncDbProof, /GHL_CLICK_TO_SCALE_PRIVATE_INTEGRATION_TOKEN|GHL_PRIVATE_INTEGRATION_TOKEN/);
assert.doesNotMatch(crmSyncDbProof, /lead-side-effect|leadSideEffect|safeNotifyAssignedAgentOfNewLead|safeSendMetaLeadConversion/i);
assert.doesNotMatch(crmSyncDbProof, /from "stripe"|from 'stripe'|new Stripe|providerUsage|generationCredit|higgsfield|openai/i);

console.log("Click-to-Scale GHL adapted schema static test passed.");
