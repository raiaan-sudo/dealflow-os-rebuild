#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260615100000_create_ghl_provisioning_pipeline.sql", "utf8");
const configSeedMigration = readFileSync("supabase/migrations/20260615103000_seed_click_to_scale_ghl_provisioning_config.sql", "utf8");
const credentialRefMigration = readFileSync("supabase/migrations/20260615104000_update_click_to_scale_ghl_credential_ref.sql", "utf8");
const env = readFileSync("src/lib/env.ts", "utf8");
const ghlClient = readFileSync("src/lib/integrations/gohighlevel/client.ts", "utf8");
const provisioningService = readFileSync("src/lib/services/ghl-provisioning-service.ts", "utf8");
const systemJobs = readFileSync("src/lib/services/system-job-service.ts", "utf8");
const billingService = readFileSync("src/lib/services/billing-service.ts", "utf8");
const packageJson = readFileSync("package.json", "utf8");
const runbook = readFileSync("docs/click-to-scale-ghl-runbook.md", "utf8");
const schemaCheck = readFileSync("scripts/check-required-schema.mjs", "utf8");
const validateScript = readFileSync("scripts/validate-ghl-provisioning.mjs", "utf8");
const provisionScript = readFileSync("scripts/provision-ghl-workspace.mjs", "utf8");
const adminProofRoute = readFileSync("src/app/api/admin/click-to-scale/ghl-proof/route.ts", "utf8");

assert.match(migration, /create table if not exists public\.ghl_provisioning_jobs/);
assert.match(migration, /create table if not exists public\.ghl_provisioning_events/);
assert.match(migration, /create table if not exists public\.workspace_ghl_users/);
assert.match(migration, /create table if not exists public\.partner_ghl_template_config/);
assert.match(migration, /create table if not exists public\.partner_ghl_workflow_config/);
assert.match(migration, /ghl_provisioning_jobs_idempotency_unique/);
assert.match(migration, /workspace_ghl_users_workspace_partner_email_unique/);
assert.match(migration, /force row level security/);
assert.match(migration, /private\.is_current_user_org_member\(workspace_id\)/);
assert.match(migration, /auth\.role\(\) = 'service_role'/);
assert.match(migration, /workflow_not_selected_yet/);
assert.match(migration, /20260615100000/);

assert.match(configSeedMigration, /insert into public\.partner_ghl_config/);
assert.match(configSeedMigration, /'click_to_scale'/);
assert.match(configSeedMigration, /'CLICKTOSCALE_GHL_PRIVATE_INTEGRATION'/);
assert.match(configSeedMigration, /enabled = true/);
assert.match(configSeedMigration, /20260615103000/);
assert.match(credentialRefMigration, /'CLICKTOSCALE_GHL_PRIVATE_INTEGRATION'/);
assert.match(credentialRefMigration, /20260615104000/);

assert.match(env, /isGhlAutoProvisioningEnabled/);
assert.match(env, /GHL_AUTO_PROVISIONING_ENABLED/);
assert.match(env, /isGhlProvisioningWritesEnabled/);
assert.match(env, /GHL_PROVISIONING_WRITES_ENABLED/);
assert.match(env, /isGhlWorkflowEnrollmentEnabled/);

assert.match(ghlClient, /GhlLocationProvisioningPayload/);
assert.match(ghlClient, /replace\(\/\^Bearer\\s\+/);
assert.match(ghlClient, /createLocation/);
assert.match(ghlClient, /\/locations\//);
assert.match(ghlClient, /GhlUserProvisioningPayload/);
assert.match(ghlClient, /createUser/);
assert.match(ghlClient, /\/users\//);

assert.match(provisioningService, /buildGhlProvisioningIdempotencyKey/);
assert.match(provisioningService, /queueGhlWorkspaceProvisioningJob/);
assert.match(provisioningService, /provisionGhlWorkspaceForDealFlowWorkspace/);
assert.match(provisioningService, /readProvisioningIdentity/);
assert.match(provisioningService, /workspace_ghl_mapping/);
assert.match(provisioningService, /workspace_partner_attribution/);
assert.match(provisioningService, /workspace_ghl_users/);
assert.match(provisioningService, /partner_ghl_workflow_config|workflow_mapping_not_selected/);
assert.match(provisioningService, /isGhlProvisioningWritesEnabled/);
assert.match(provisioningService, /dry_run/);
assert.match(provisioningService, /ghl_auth_missing/);
assert.match(provisioningService, /ghl_company_id_missing/);
assert.match(provisioningService, /Click to Scale GoHighLevel company_id is required/);
assert.doesNotMatch(provisioningService, /console\.log\(.*token/i);

assert.match(systemJobs, /ghl_workspace_provisioning/);
assert.match(systemJobs, /GhlWorkspaceProvisioningPayload/);
assert.match(systemJobs, /queueGhlWorkspaceProvisioningSystemJob/);
assert.match(systemJobs, /provisionGhlWorkspaceForDealFlowWorkspace/);

assert.match(billingService, /queueGhlWorkspaceProvisioningSystemJob/);
assert.match(billingService, /ghl_provisioning_system_job_queued/);
assert.match(billingService, /ghl_provisioning_system_job_queue_failed/);
assert.match(billingService, /subscription\.status === "active"/);
assert.match(billingService, /partnerId && subscriptionUserId/);

assert.match(packageJson, /test:click-to-scale-ghl-provisioning/);
assert.match(packageJson, /ghl:validate-provisioning/);
assert.match(packageJson, /ghl:provision-workspace/);

assert.match(schemaCheck, /20260615104000/);
assert.match(schemaCheck, /20260615100000_create_ghl_provisioning_pipeline\.sql/);
assert.match(schemaCheck, /20260615103000_seed_click_to_scale_ghl_provisioning_config\.sql/);
assert.match(schemaCheck, /20260615104000_update_click_to_scale_ghl_credential_ref\.sql/);

assert.match(validateScript, /tokenPrinted: false/);
assert.match(validateScript, /liveGhlWriteAttempted: false/);
assert.match(provisionScript, /Dry run only/);
assert.match(provisionScript, /liveGhlWriteAttempted: false/);
assert.match(provisionScript, /GHL_PROVISIONING_WRITES_ENABLED=true/);
assert.match(adminProofRoute, /requirePlatformAdmin/);
assert.match(adminProofRoute, /assertSameOriginRequest/);
assert.match(adminProofRoute, /isQaProofEmail/);
assert.match(adminProofRoute, /GHL proof only allows QA\/test users/);
assert.match(adminProofRoute, /printedSecrets: false/);
assert.match(adminProofRoute, /externalWriteAttempted/);
assert.doesNotMatch(adminProofRoute, /return apiSuccess\([^]*token/i);

assert.match(runbook, /Automatic Workspace Provisioning/);
assert.match(runbook, /GHL_AUTO_PROVISIONING_ENABLED/);
assert.match(runbook, /GHL_PROVISIONING_WRITES_ENABLED/);
assert.match(runbook, /contacts\.readonly/);
assert.match(runbook, /contacts\.write/);
assert.match(runbook, /opportunities\.readonly/);
assert.match(runbook, /opportunities\.write/);
assert.match(runbook, /locations\.readonly/);
assert.match(runbook, /locations\.write/);
assert.match(runbook, /users\.readonly/);
assert.match(runbook, /users\.write/);
assert.match(runbook, /Do not select broad admin scopes/);
assert.match(runbook, /Workflow Enrollment/);
assert.match(runbook, /Do not enable workflow enrollment/);

console.log("Click to Scale GHL provisioning static tests passed.");
