#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE_ID = "2e3b0144-23a9-483a-9e11-61173b4099c4";
const TARGET_PARTNER_ID = "1b22d077-1f54-4327-ba48-1b1b793488a1";
const TARGET_LOCATION_ID = "ehLH5WjzfEaztUXBDG3i";
const DEFAULT_PROOF_RUN_ID = "ghl_opportunity_v1_20260618_01";
const CONFIRMATION = "CONFIGURE_GHL_OPPORTUNITY_PROOF";
const DEFAULT_PIPELINE_ID = "pqz9gsHSW7EJj5w6W3xU";
const DEFAULT_STAGE_ID = "a61b9237-7d8a-4f95-80e0-ac64ba1b537f";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    apply: false,
    cleanup: false,
    proofRunId: DEFAULT_PROOF_RUN_ID,
    pipelineId: DEFAULT_PIPELINE_ID,
    stageId: DEFAULT_STAGE_ID,
    confirm: "",
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--cleanup") args.cleanup = true;
    else if (arg.startsWith("--proof-run-id=")) args.proofRunId = arg.slice("--proof-run-id=".length);
    else if (arg.startsWith("--pipeline-id=")) args.pipelineId = arg.slice("--pipeline-id=".length);
    else if (arg.startsWith("--stage-id=")) args.stageId = arg.slice("--stage-id=".length);
    else if (arg.startsWith("--confirm=")) args.confirm = arg.slice("--confirm=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  const modes = [args.dryRun, args.apply, args.cleanup].filter(Boolean).length;
  if (modes !== 1) {
    throw new Error("Choose exactly one mode: --dry-run, --apply, or --cleanup.");
  }

  return args;
}

function requireConfirmed(args) {
  if (args.confirm !== CONFIRMATION) {
    throw new Error(`Apply/cleanup requires --confirm=${CONFIRMATION}.`);
  }
}

function requireSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function maskId(value) {
  if (!value) return null;
  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : "***";
}

function assertGhlId(name, value) {
  if (!/^[A-Za-z0-9_-]{3,160}$/.test(value)) {
    throw new Error(`${name} must be a GHL-safe id.`);
  }
}

function mergeMetadata(existing, patch) {
  return {
    ...(existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {}),
    ...patch,
  };
}

async function loadMapping(supabase) {
  const { data, error } = await supabase
    .from("workspace_ghl_mapping")
    .select("workspace_id, partner_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled, metadata, updated_at")
    .eq("workspace_id", TARGET_WORKSPACE_ID)
    .eq("partner_id", TARGET_PARTNER_ID)
    .maybeSingle();

  if (error) throw new Error(`workspace_ghl_mapping lookup failed: ${error.message}`);
  if (!data) throw new Error("Target workspace_ghl_mapping row was not found.");
  if (data.ghl_location_id !== TARGET_LOCATION_ID) {
    throw new Error("Target mapping location does not match the approved GHL location.");
  }
  if (data.sync_enabled !== true) {
    throw new Error("Target mapping is not sync_enabled=true.");
  }

  return data;
}

async function updateMapping(supabase, values) {
  const { data, error } = await supabase
    .from("workspace_ghl_mapping")
    .update(values)
    .eq("workspace_id", TARGET_WORKSPACE_ID)
    .eq("partner_id", TARGET_PARTNER_ID)
    .select("workspace_id, partner_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled, metadata, updated_at")
    .maybeSingle();

  if (error) throw new Error(`workspace_ghl_mapping update failed: ${error.message}`);
  if (!data) throw new Error("Target workspace_ghl_mapping update returned no row.");
  return data;
}

function summarizeMapping(mapping) {
  return {
    workspaceId: mapping.workspace_id,
    partnerId: mapping.partner_id,
    locationId: mapping.ghl_location_id,
    pipelineId: mapping.ghl_pipeline_id,
    pipelineIdMasked: maskId(mapping.ghl_pipeline_id),
    stageId: mapping.ghl_stage_id,
    stageIdMasked: maskId(mapping.ghl_stage_id),
    syncEnabled: mapping.sync_enabled,
    metadata: mapping.metadata ?? {},
    updatedAt: mapping.updated_at ?? null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertGhlId("pipelineId", args.pipelineId);
  assertGhlId("stageId", args.stageId);

  const supabase = requireSupabase();
  const before = await loadMapping(supabase);
  const timestamp = new Date().toISOString();
  const previousPipelineId =
    before.metadata?.ghl_opportunity_v1_proof?.previous_pipeline_id ?? before.ghl_pipeline_id ?? null;
  const previousStageId =
    before.metadata?.ghl_opportunity_v1_proof?.previous_stage_id ?? before.ghl_stage_id ?? null;
  const audit = {
    proof_run_id: args.proofRunId,
    configured_for: "ghl_opportunity_v1_proof",
    previous_pipeline_id: previousPipelineId,
    previous_stage_id: previousStageId,
    selected_pipeline_id: args.pipelineId,
    selected_stage_id: args.stageId,
    selected_pipeline_name: "Buyer Funnel",
    selected_stage_name: "Lead",
    configured_at: timestamp,
    no_ghl_write: true,
    no_workflow_enrollment: true,
    no_provisioning: true,
  };

  if (args.dryRun) {
    console.log(JSON.stringify({
      mode: "dry-run",
      wouldMutate: false,
      target: {
        workspaceId: TARGET_WORKSPACE_ID,
        partnerId: TARGET_PARTNER_ID,
        locationId: TARGET_LOCATION_ID,
      },
      before: summarizeMapping(before),
      proposed: {
        ghl_pipeline_id: args.pipelineId,
        ghl_stage_id: args.stageId,
        metadataPatch: { ghl_opportunity_v1_proof: audit },
      },
      safety: {
        dbMutation: false,
        ghlWrite: false,
        provisioning: false,
        workflowEnrollment: false,
      },
    }, null, 2));
    return;
  }

  requireConfirmed(args);

  if (args.apply) {
    const after = await updateMapping(supabase, {
      ghl_pipeline_id: args.pipelineId,
      ghl_stage_id: args.stageId,
      metadata: mergeMetadata(before.metadata, { ghl_opportunity_v1_proof: audit }),
      updated_at: timestamp,
    });

    console.log(JSON.stringify({
      mode: "apply",
      mutationCount: 1,
      before: summarizeMapping(before),
      after: summarizeMapping(after),
      safety: {
        updatedTable: "workspace_ghl_mapping",
        ghlWrite: false,
        provisioning: false,
        workflowEnrollment: false,
      },
    }, null, 2));
    return;
  }

  const proof = before.metadata?.ghl_opportunity_v1_proof;
  if (!proof || proof.proof_run_id !== args.proofRunId) {
    throw new Error("Cleanup refused because current metadata does not match the proof_run_id.");
  }

  const cleanedMetadata = mergeMetadata(before.metadata, {
    ghl_opportunity_v1_proof_cleanup: {
      proof_run_id: args.proofRunId,
      cleaned_at: timestamp,
      restored_pipeline_id: proof.previous_pipeline_id ?? null,
      restored_stage_id: proof.previous_stage_id ?? null,
    },
  });
  delete cleanedMetadata.ghl_opportunity_v1_proof;

  const after = await updateMapping(supabase, {
    ghl_pipeline_id: proof.previous_pipeline_id ?? null,
    ghl_stage_id: proof.previous_stage_id ?? null,
    metadata: cleanedMetadata,
    updated_at: timestamp,
  });

  console.log(JSON.stringify({
    mode: "cleanup",
    mutationCount: 1,
    before: summarizeMapping(before),
    after: summarizeMapping(after),
    safety: {
      updatedTable: "workspace_ghl_mapping",
      ghlWrite: false,
      provisioning: false,
      workflowEnrollment: false,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
