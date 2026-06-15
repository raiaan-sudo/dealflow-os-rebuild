#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

const repoRoot = process.cwd();
nextEnv.loadEnvConfig(repoRoot);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(text, marker, label) {
  if (!text.includes(marker)) {
    throw new Error(`${label} missing marker: ${marker}`);
  }
}

function envPresent(name) {
  return Boolean(process.env[name]?.trim());
}

const migration = read("supabase/migrations/20260615100000_create_ghl_provisioning_pipeline.sql");
const service = read("src/lib/services/ghl-provisioning-service.ts");
const billing = read("src/lib/services/billing-service.ts");
const systemJobs = read("src/lib/services/system-job-service.ts");

[
  "create table if not exists public.ghl_provisioning_jobs",
  "create table if not exists public.ghl_provisioning_events",
  "create table if not exists public.workspace_ghl_users",
  "create table if not exists public.partner_ghl_template_config",
  "create table if not exists public.partner_ghl_workflow_config",
  "force row level security",
  "private.is_current_user_org_member(workspace_id)",
  "schema_version', '20260615100000'",
].forEach((marker) => assertIncludes(migration, marker, "provisioning migration"));

[
  "GhlWorkspaceProvisioningPayload",
  "buildGhlProvisioningIdempotencyKey",
  "queueGhlWorkspaceProvisioningJob",
  "provisionGhlWorkspaceForDealFlowWorkspace",
  "isGhlProvisioningWritesEnabled",
  "workflow_mapping_not_selected",
  "ghl_auth_missing",
].forEach((marker) => assertIncludes(service, marker, "provisioning service"));

assertIncludes(billing, "queueGhlWorkspaceProvisioningSystemJob", "billing service");
assertIncludes(systemJobs, "ghl_workspace_provisioning", "system job service");

const result = {
  ok: true,
  env: {
    supabaseUrl: envPresent("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRole: envPresent("SUPABASE_SERVICE_ROLE_KEY"),
    ghlToken:
      envPresent("CLICKTOSCALE_GHL_PRIVATE_INTEGRATION") ||
      envPresent("GHL_CLICK_TO_SCALE_PRIVATE_INTEGRATION_TOKEN") ||
      envPresent("GHL_PRIVATE_INTEGRATION_TOKEN"),
    autoProvisioningEnabled: process.env.GHL_AUTO_PROVISIONING_ENABLED === "true",
    provisioningWritesEnabled: process.env.GHL_PROVISIONING_WRITES_ENABLED === "true",
    workflowEnrollmentEnabled: process.env.GHL_WORKFLOW_ENROLLMENT_ENABLED === "true",
  },
  safety: {
    tokenPrinted: false,
    liveGhlWriteAttempted: false,
  },
};

console.log(JSON.stringify(result, null, 2));
