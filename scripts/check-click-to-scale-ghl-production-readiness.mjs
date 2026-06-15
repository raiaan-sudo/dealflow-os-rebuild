#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function run(command, args) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseSupabaseJson(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Supabase CLI did not return a JSON object.");
  }

  return JSON.parse(output.slice(start, end + 1));
}

function hasVercelEnv(envListOutput, name) {
  return new RegExp(`(^|\\n)\\s*${name}\\s+Encrypted\\s+`, "m").test(envListOutput);
}

function boolFromVercelPresence(envListOutput, name) {
  return hasVercelEnv(envListOutput, name);
}

const partnerId = "click_to_scale";
const configSql = `
select
  partner_id,
  enabled,
  encrypted_credential_ref,
  company_id,
  default_location_id,
  default_pipeline_id,
  default_stage_id
from public.partner_ghl_config
where partner_id = '${partnerId}';
`;
const failedJobsSql = `
select kind, status, last_error_code, count(*)::int as count
from public.system_jobs
where kind = 'ghl_workspace_provisioning'
  and status in ('failed','dead_letter')
  and reviewed_at is null
group by kind, status, last_error_code
order by kind, status, last_error_code;
`;

const configResult = parseSupabaseJson(run("supabase", ["db", "query", "--linked", configSql]));
const failedJobsResult = parseSupabaseJson(run("supabase", ["db", "query", "--linked", failedJobsSql]));
const envList = run("npx", ["vercel", "env", "ls", "production"]);

const config = configResult.rows?.[0] ?? null;
const checks = {
  partnerConfigExists: Boolean(config),
  partnerConfigEnabled: config?.enabled === true,
  credentialRefIsExpected: config?.encrypted_credential_ref === "CLICKTOSCALE_GHL_PRIVATE_INTEGRATION",
  productionTokenEnvPresent: hasVercelEnv(envList, "CLICKTOSCALE_GHL_PRIVATE_INTEGRATION"),
  autoProvisioningFlagPresent: boolFromVercelPresence(envList, "GHL_AUTO_PROVISIONING_ENABLED"),
  writeFlagPresent: boolFromVercelPresence(envList, "GHL_PROVISIONING_WRITES_ENABLED"),
  workflowFlagPresent: boolFromVercelPresence(envList, "GHL_WORKFLOW_ENROLLMENT_ENABLED"),
  companyIdConfigured: Boolean(config?.company_id?.trim()),
  noUnreviewedFailedProvisioningJobs: (failedJobsResult.rows ?? []).length === 0,
};

const blockers = [];
if (!checks.partnerConfigExists) blockers.push("partner_ghl_config_missing");
if (!checks.partnerConfigEnabled) blockers.push("partner_ghl_config_disabled");
if (!checks.credentialRefIsExpected) blockers.push("credential_ref_mismatch");
if (!checks.productionTokenEnvPresent) blockers.push("production_token_env_missing");
if (!checks.autoProvisioningFlagPresent) blockers.push("auto_provisioning_flag_missing");
if (!checks.writeFlagPresent) blockers.push("write_flag_missing");
if (!checks.workflowFlagPresent) blockers.push("workflow_flag_missing");
if (!checks.companyIdConfigured) blockers.push("ghl_company_id_missing");
if (!checks.noUnreviewedFailedProvisioningJobs) blockers.push("unreviewed_failed_provisioning_jobs");

const report = {
  ok: blockers.length === 0,
  partnerId,
  checks,
  blockers,
  config: config
    ? {
        partnerId: config.partner_id,
        enabled: config.enabled,
        credentialRef: config.encrypted_credential_ref,
        companyIdConfigured: Boolean(config.company_id?.trim()),
        defaultLocationConfigured: Boolean(config.default_location_id?.trim()),
        defaultPipelineConfigured: Boolean(config.default_pipeline_id?.trim()),
        defaultStageConfigured: Boolean(config.default_stage_id?.trim()),
      }
    : null,
  failedJobs: failedJobsResult.rows ?? [],
  safety: {
    printedSecrets: false,
    mutatedDatabase: false,
    calledGhl: false,
    changedVercel: false,
  },
};

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exitCode = 1;
}
