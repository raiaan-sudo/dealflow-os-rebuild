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
const failedProvisioningSql = `
select status, last_error_code, count(*)::int as count
from public.ghl_provisioning_jobs
where partner_id = '${partnerId}'
  and status in ('failed','dead_letter')
  and coalesce((metadata->>'accepted_deferred')::boolean, false) = false
group by status, last_error_code
order by status, last_error_code;
`;
const failedLeadSyncSql = `
select status, last_error_code, count(*)::int as count
from public.lead_crm_sync_events
where partner_id = '${partnerId}'
  and status in ('failed','dead_letter')
  and coalesce((metadata->>'accepted_deferred')::boolean, false) = false
group by status, last_error_code
order by status, last_error_code;
`;
const mappingHealthSql = `
select
  count(*) filter (where sync_enabled = true and nullif(trim(ghl_location_id), '') is not null)::int as enabled_mapped_count,
  count(*) filter (where sync_enabled = false)::int as disabled_count,
  count(*) filter (where sync_enabled = true and nullif(trim(ghl_location_id), '') is null)::int as enabled_missing_location_count
from public.workspace_ghl_mapping
where partner_id = '${partnerId}';
`;

const configResult = parseSupabaseJson(run("supabase", ["db", "query", "--linked", configSql]));
const failedJobsResult = parseSupabaseJson(run("supabase", ["db", "query", "--linked", failedJobsSql]));
const failedProvisioningResult = parseSupabaseJson(run("supabase", ["db", "query", "--linked", failedProvisioningSql]));
const failedLeadSyncResult = parseSupabaseJson(run("supabase", ["db", "query", "--linked", failedLeadSyncSql]));
const mappingHealthResult = parseSupabaseJson(run("supabase", ["db", "query", "--linked", mappingHealthSql]));
const envList = run("npx", ["vercel", "env", "ls", "production"]);

const config = configResult.rows?.[0] ?? null;
const mappingHealth = mappingHealthResult.rows?.[0] ?? {
  enabled_mapped_count: 0,
  disabled_count: 0,
  enabled_missing_location_count: 0,
};
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
  noUnacceptedFailedGhlProvisioningJobs: (failedProvisioningResult.rows ?? []).length === 0,
  noFailedLeadCrmSyncEvents: (failedLeadSyncResult.rows ?? []).length === 0,
  hasAtLeastOneEnabledMapping: Number(mappingHealth.enabled_mapped_count ?? 0) > 0,
  noEnabledMappingMissingLocation: Number(mappingHealth.enabled_missing_location_count ?? 0) === 0,
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
if (!checks.noUnacceptedFailedGhlProvisioningJobs) blockers.push("unaccepted_failed_ghl_provisioning_jobs");
if (!checks.noFailedLeadCrmSyncEvents) blockers.push("failed_lead_crm_sync_events");
if (!checks.hasAtLeastOneEnabledMapping) blockers.push("enabled_workspace_mapping_missing");
if (!checks.noEnabledMappingMissingLocation) blockers.push("enabled_workspace_mapping_location_missing");

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
  failedGhlProvisioningJobs: failedProvisioningResult.rows ?? [],
  failedLeadCrmSyncEvents: failedLeadSyncResult.rows ?? [],
  mappingHealth,
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
