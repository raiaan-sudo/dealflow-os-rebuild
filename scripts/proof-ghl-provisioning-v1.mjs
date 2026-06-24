#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_WORKSPACE_ID = "2e3b0144-23a9-483a-9e11-61173b4099c4";
const DEFAULT_PARTNER_ID = "1b22d077-1f54-4327-ba48-1b1b793488a1";
const DEFAULT_PROOF_RUN_ID = "ghl_provisioning_v1_20260618_01";
const CONFIRMATION = "PROVISION_GHL_V1";
const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "v3";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    validateOnly: false,
    apply: false,
    cleanup: false,
    liveRead: true,
    workspaceId: DEFAULT_WORKSPACE_ID,
    partnerId: DEFAULT_PARTNER_ID,
    proofRunId: DEFAULT_PROOF_RUN_ID,
    confirm: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--validate-only") args.validateOnly = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--cleanup") args.cleanup = true;
    else if (arg === "--no-live-read") args.liveRead = false;
    else if (arg.startsWith("--workspace-id=")) args.workspaceId = arg.slice("--workspace-id=".length);
    else if (arg.startsWith("--partner-id=")) args.partnerId = arg.slice("--partner-id=".length);
    else if (arg.startsWith("--proof-run-id=")) args.proofRunId = arg.slice("--proof-run-id=".length);
    else if (arg.startsWith("--confirm=")) args.confirm = arg.slice("--confirm=".length);
  }

  if (!args.dryRun && !args.validateOnly && !args.apply && !args.cleanup) {
    args.dryRun = true;
  }

  const selectedModes = [args.dryRun, args.validateOnly, args.apply, args.cleanup].filter(Boolean).length;
  if (selectedModes !== 1) {
    throw new Error("Choose exactly one mode: --dry-run, --validate-only, --apply, or --cleanup.");
  }

  return args;
}

function requireSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase env. Source NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return {
    host: new URL(url).host,
    client: createClient(url, key, { auth: { persistSession: false } }),
  };
}

function normalizeToken(value) {
  const token = value?.trim();
  if (!token) return null;
  return token.replace(/^Bearer\s+/i, "").trim() || null;
}

function tokenFromCredentialRef(ref) {
  const normalized = ref?.trim().replace(/[^A-Z0-9_]/gi, "_").toUpperCase();
  if (!normalized) return null;

  return (
    normalizeToken(process.env[normalized]) ||
    (normalized === "CLICKTOSCALE_GHL_PRIVATE_INTEGRATION"
      ? normalizeToken(process.env.GHL_CLICK_TO_SCALE_PRIVATE_INTEGRATION_TOKEN) ||
        normalizeToken(process.env.GHL_PRIVATE_INTEGRATION_TOKEN)
      : null)
  );
}

function maskExternalId(value) {
  if (!value || typeof value !== "string") return null;
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : "***";
}

function buildIdempotencyKey({ workspaceId, partnerId }) {
  return createHash("sha256")
    .update([partnerId, workspaceId, "gohighlevel", "provisioning_v1"].join("|"))
    .digest("hex");
}

function gateState() {
  return {
    GHL_AUTO_PROVISIONING_ENABLED: process.env.GHL_AUTO_PROVISIONING_ENABLED === "true",
    GHL_PROVISIONING_WRITES_ENABLED: process.env.GHL_PROVISIONING_WRITES_ENABLED === "true",
    GHL_WORKFLOW_ENROLLMENT_ENABLED: false,
    GHL_WORKFLOW_ENROLLMENT_RETIRED: true,
    GHL_CONTACT_WRITES_ENABLED: process.env.GHL_CONTACT_WRITES_ENABLED === "true",
    GHL_OPPORTUNITY_WRITES_ENABLED: process.env.GHL_OPPORTUNITY_WRITES_ENABLED === "true",
    INTERNAL_LEAD_SMS_ENABLED: process.env.INTERNAL_LEAD_SMS_ENABLED === "true",
  };
}

async function countRows(supabase) {
  const tables = [
    "partner_ghl_config",
    "workspace_ghl_mapping",
    "ghl_provisioning_jobs",
    "ghl_provisioning_events",
    "workspace_ghl_users",
    "lead_crm_sync_events",
    "leads",
    "system_jobs",
  ];
  const output = {};

  for (const table of tables) {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
    output[table] = error ? { count: null, error: error.message } : { count: count ?? 0, error: null };
  }

  return output;
}

function rowDelta(before, after) {
  return Object.fromEntries(
    Object.keys(after).map((table) => [
      table,
      (after[table].count ?? 0) - (before[table].count ?? 0),
    ]),
  );
}

async function readState(supabase, args) {
  const [
    { data: org, error: orgError },
    { data: partner, error: partnerError },
    { data: config, error: configError },
    { data: mapping, error: mappingError },
    { data: template, error: templateError },
  ] = await Promise.all([
    supabase.from("organizations").select("id, name, partner_id").eq("id", args.workspaceId).maybeSingle(),
    supabase.from("partners").select("id, slug, brand_name, status").eq("id", args.partnerId).maybeSingle(),
    supabase.from("partner_ghl_config").select("partner_id, enabled, encrypted_credential_ref, default_location_id, default_pipeline_id, default_stage_id, default_source").eq("partner_id", args.partnerId).maybeSingle(),
    supabase.from("workspace_ghl_mapping").select("workspace_id, partner_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled, metadata").eq("workspace_id", args.workspaceId).eq("partner_id", args.partnerId).maybeSingle(),
    supabase.from("partner_ghl_template_config").select("partner_id, snapshot_id, default_pipeline_name, default_stage_name").eq("partner_id", args.partnerId).maybeSingle(),
  ]);

  const firstError = orgError ?? partnerError ?? configError ?? mappingError ?? templateError;
  if (firstError) {
    throw new Error(firstError.message);
  }

  return { org, partner, config, mapping, template };
}

async function ghlRequest(token, path) {
  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_API_VERSION,
      Accept: "application/json",
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: response.status === 401 || response.status === 403 ? "ghl_auth_failed" : "ghl_read_failed",
      message: payload?.message || payload?.error || `GHL request failed with ${response.status}.`,
    };
  }

  return { ok: true, status: response.status, payload };
}

function findPipelineAndStage(payload, pipelineId, stageId) {
  const pipelines = Array.isArray(payload?.pipelines) ? payload.pipelines : [];
  const pipeline = pipelines.find((item) => (item.id || item._id) === pipelineId) ?? null;
  const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : [];
  const stage = stages.find((item) => (item.id || item._id) === stageId) ?? null;

  return {
    pipelineFound: !pipelineId || Boolean(pipeline),
    stageFound: !stageId || Boolean(stage),
    pipelineName: pipeline?.name || pipeline?.title || null,
    stageName: stage?.name || stage?.title || null,
  };
}

async function validateReadiness(state, args) {
  const locationId = state.mapping?.ghl_location_id || state.config?.default_location_id || null;
  const pipelineId = state.mapping?.ghl_pipeline_id || state.config?.default_pipeline_id || null;
  const stageId = state.mapping?.ghl_stage_id || state.config?.default_stage_id || null;
  const credentialRef = state.config?.encrypted_credential_ref || null;
  const missing = [
    state.org?.id ? null : "workspace",
    state.partner?.id ? null : "partner",
    state.config?.enabled === true ? null : "partner_ghl_config_enabled",
    credentialRef ? null : "credential_ref",
    state.mapping?.workspace_id ? null : "workspace_ghl_mapping",
    state.mapping?.sync_enabled === true ? null : "workspace_ghl_mapping_enabled",
    locationId ? null : "ghl_location_id",
    pipelineId ? null : "ghl_pipeline_id",
    stageId ? null : "ghl_stage_id",
  ].filter(Boolean);
  const token = tokenFromCredentialRef(credentialRef);
  const live = {
    attempted: false,
    credentialConfigured: Boolean(credentialRef),
    credentialAvailable: Boolean(token),
    locationReadable: null,
    pipelineReadable: null,
    stageReadable: null,
    errors: [],
  };

  if (args.liveRead && token && locationId) {
    live.attempted = true;
    const location = await ghlRequest(token, `/locations/${encodeURIComponent(locationId)}`);
    live.locationReadable = location.ok;
    if (!location.ok) live.errors.push({ area: "location", code: location.code, status: location.status, message: location.message });

    const pipelines = await ghlRequest(token, `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`);
    live.pipelineReadable = pipelines.ok;
    if (pipelines.ok) {
      const found = findPipelineAndStage(pipelines.payload, pipelineId, stageId);
      live.pipelineReadable = found.pipelineFound;
      live.stageReadable = found.stageFound;
      live.pipelineName = found.pipelineName;
      live.stageName = found.stageName;
    } else {
      live.stageReadable = false;
      live.errors.push({ area: "pipelines", code: pipelines.code, status: pipelines.status, message: pipelines.message });
    }

  }

  const liveFailures = [
    args.liveRead && live.credentialConfigured && !live.credentialAvailable ? "credential_env_missing" : null,
    args.liveRead && live.locationReadable === false ? "location_not_readable" : null,
    args.liveRead && live.pipelineReadable === false ? "pipeline_not_readable" : null,
    args.liveRead && live.stageReadable === false ? "stage_not_readable" : null,
  ].filter(Boolean);
  const ready = missing.length === 0 && liveFailures.length === 0;

  return {
    ready,
    status: ready ? "ready" : liveFailures.length > 0 ? "failed" : "needs_operator_action",
    missing,
    failures: liveFailures,
    model: state.mapping?.workspace_id ? "mapping_only" : "operator_assisted",
    locationIdMasked: maskExternalId(locationId),
    pipelineIdMasked: maskExternalId(pipelineId),
    stageIdMasked: maskExternalId(stageId),
    workflowEnrollmentRetired: true,
    credentialRefMasked: credentialRef ? "[configured-env-ref]" : null,
    idempotencyKey: buildIdempotencyKey(args),
    liveRead: live,
  };
}

async function cleanupProofRows(supabase, args) {
  if (args.confirm !== CONFIRMATION) {
    throw new Error(`Cleanup requires --confirm=${CONFIRMATION}.`);
  }

  const { data: jobs, error: jobLookupError } = await supabase
    .from("ghl_provisioning_jobs")
    .select("id")
    .contains("metadata", { proof_run_id: args.proofRunId });
  if (jobLookupError) throw new Error(jobLookupError.message);

  const jobIds = (jobs ?? []).map((job) => job.id);
  let eventsDeleted = 0;
  let jobsDeleted = 0;

  if (jobIds.length > 0) {
    const { data: eventRows, error: eventDeleteError } = await supabase
      .from("ghl_provisioning_events")
      .delete()
      .in("job_id", jobIds)
      .select("id");
    if (eventDeleteError) throw new Error(eventDeleteError.message);
    eventsDeleted = eventRows?.length ?? 0;
  }

  const { data: jobRows, error: jobDeleteError } = await supabase
    .from("ghl_provisioning_jobs")
    .delete()
    .contains("metadata", { proof_run_id: args.proofRunId })
    .select("id");
  if (jobDeleteError) throw new Error(jobDeleteError.message);
  jobsDeleted = jobRows?.length ?? 0;

  return { jobsDeleted, eventsDeleted };
}

async function applyProvisioningLedger(supabase, args, readiness) {
  if (args.confirm !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm=${CONFIRMATION}.`);
  }

  if (process.env.GHL_PROVISIONING_WRITES_ENABLED !== "true") {
    throw new Error("Apply requires GHL_PROVISIONING_WRITES_ENABLED=true.");
  }

  if (process.env.GHL_AUTO_PROVISIONING_ENABLED === "true") {
    throw new Error("This V1 harness does not perform full-auto GHL object creation.");
  }

  const now = new Date().toISOString();
  const metadata = {
    proof_run_id: args.proofRunId,
    model: readiness.model,
    readiness_status: readiness.status,
    missing: readiness.missing,
    failures: readiness.failures,
    no_ghl_location_write: true,
    no_ghl_user_write: true,
    no_pipeline_write: true,
    no_workflow_write: true,
    no_contact_write: true,
    no_opportunity_write: true,
    no_workflow_enrollment: true,
    no_sms_email: true,
    no_meta: true,
    no_stripe: true,
    no_provider: true,
  };
  const status = readiness.ready ? "succeeded" : "skipped";
  const { data: job, error: jobError } = await supabase
    .from("ghl_provisioning_jobs")
    .upsert({
      workspace_id: args.workspaceId,
      partner_id: args.partnerId,
      status,
      idempotency_key: readiness.idempotencyKey,
      attempt_count: 1,
      max_attempts: 3,
      last_error_code: readiness.ready ? null : "operator_action_required",
      last_error_message: readiness.ready ? null : "GHL provisioning V1 requires operator-prepared mapping/config before ready.",
      next_retry_at: null,
      metadata,
      updated_at: now,
    }, { onConflict: "idempotency_key" })
    .select("id, status")
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);

  const { data: eventRows, error: eventError } = await supabase
    .from("ghl_provisioning_events")
    .insert({
      job_id: job.id,
      workspace_id: args.workspaceId,
      partner_id: args.partnerId,
      step: "mapping_only_validation",
      status: readiness.ready ? "succeeded" : "skipped",
      external_id: null,
      error_code: readiness.ready ? null : "operator_action_required",
      error_message: readiness.ready ? null : readiness.missing.join(", ") || readiness.failures.join(", "),
      metadata,
    })
    .select("id");
  if (eventError) throw new Error(eventError.message);

  return {
    jobId: job.id,
    jobStatus: job.status,
    eventsInserted: eventRows?.length ?? 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { client: supabase, host } = requireSupabase();
  const before = await countRows(supabase);

  if (args.cleanup) {
    const cleanup = await cleanupProofRows(supabase, args);
    const after = await countRows(supabase);
    console.log(JSON.stringify({
      mode: "cleanup",
      projectHost: host,
      proofRunId: args.proofRunId,
      cleanup,
      rowDeltas: rowDelta(before, after),
    }, null, 2));
    return;
  }

  const state = await readState(supabase, args);
  const readiness = await validateReadiness(state, args);
  let applyResult = null;

  if (args.apply) {
    applyResult = await applyProvisioningLedger(supabase, args, readiness);
  }

  const after = await countRows(supabase);
  const output = {
    mode: args.apply ? "apply" : args.validateOnly ? "validate_only" : "dry_run",
    projectHost: host,
    proofRunId: args.proofRunId,
    target: {
      workspaceId: args.workspaceId,
      partnerId: args.partnerId,
    },
    gates: gateState(),
    readiness,
    currentState: {
      workspaceFound: Boolean(state.org?.id),
      workspaceName: state.org?.name ?? null,
      partnerFound: Boolean(state.partner?.id),
      partnerSlug: state.partner?.slug ?? null,
      partnerGhlConfigEnabled: state.config?.enabled === true,
      credentialRefMasked: state.config?.encrypted_credential_ref ? "[configured-env-ref]" : null,
      workspaceMappingEnabled: state.mapping?.sync_enabled === true,
      workflowConfigRequired: false,
      workflowEnrollmentRetired: true,
      templateSnapshotConfigured: Boolean(state.template?.snapshot_id),
    },
    applyResult,
    mutationCount: Object.values(rowDelta(before, after)).reduce((sum, value) => sum + Math.max(value, 0), 0),
    rowDeltas: rowDelta(before, after),
    safety: {
      dryRunDoesNotMutate: !args.apply,
      noGhlWrites: true,
      noContactWrite: true,
      noOpportunityWrite: true,
      noWorkflowEnrollment: true,
      noProvisioningObjectCreation: true,
      noSmsEmail: true,
      noMeta: true,
      noStripe: true,
      noProvider: true,
      tokensExposed: false,
      credentialRefsExposed: false,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
