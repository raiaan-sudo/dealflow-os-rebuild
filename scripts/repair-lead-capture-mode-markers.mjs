#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const CONFIRMATION = "REPAIR_LEAD_CAPTURE_MODE_MARKERS";
const INSTANT_MODE = "volume_lead_form";
const INSTANT_FORM_TYPE = "instant_form";
const DESTINATION_KEYS = new Set([
  "campaigndestination",
  "conversionlocation",
  "destination",
  "destinationtype",
  "formtype",
  "leadcapturemode",
  "leaddestination",
  "metadestination",
  "trafficdestination",
]);
const NESTED_KEYS = new Set([
  "campaignpayload",
  "funnel",
  "metadata",
  "plan",
  "strategy",
]);

function parseArgs(argv) {
  const args = {
    apply: false,
    campaignId: null,
    confirm: null,
    dryRun: false,
    proofRunId: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--campaign-id=")) args.campaignId = arg.slice("--campaign-id=".length).trim() || null;
    else if (arg.startsWith("--confirm=")) args.confirm = arg.slice("--confirm=".length).trim() || null;
    else if (arg.startsWith("--proof-run-id=")) args.proofRunId = arg.slice("--proof-run-id=".length).trim() || null;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if ([args.dryRun, args.apply].filter(Boolean).length !== 1) {
    throw new Error("Choose exactly one mode: --dry-run or --apply.");
  }

  if (!args.proofRunId) {
    throw new Error("Missing required --proof-run-id=<id>.");
  }

  if (args.apply && args.confirm !== CONFIRMATION) {
    throw new Error(`Apply requires --confirm=${CONFIRMATION}.`);
  }

  return args;
}

function requireServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeValue(value) {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
    : "";
}

function readLeadCaptureMode(value, depth = 0) {
  const record = asRecord(value);
  if (!record || depth > 6) return null;

  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = rawKey.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (DESTINATION_KEYS.has(key)) {
      const normalized = normalizeValue(rawValue);
      if (normalized === INSTANT_MODE || normalized === INSTANT_FORM_TYPE || normalized === "meta_instant_form") {
        return INSTANT_MODE;
      }
    }

    if (NESTED_KEYS.has(key) && asRecord(rawValue)) {
      const nested = readLeadCaptureMode(rawValue, depth + 1);
      if (nested) return nested;
    }
  }

  return null;
}

function patchPlan(plan, proofRunId) {
  const now = new Date().toISOString();
  const source = asRecord(plan) ? structuredClone(plan) : {};
  const nestedPlan = asRecord(source.plan) ? { ...source.plan } : {};
  const funnel = asRecord(source.funnel) ? { ...source.funnel } : {};
  const campaignPayload = {
    ...(asRecord(source.campaign_payload) ?? {}),
    ...(asRecord(source.campaignPayload) ?? {}),
  };
  const previous = {
    leadCaptureMode: source.leadCaptureMode ?? null,
    lead_capture_mode: source.lead_capture_mode ?? null,
    planLeadCaptureMode: nestedPlan.leadCaptureMode ?? null,
    planLeadCaptureModeSnake: nestedPlan.lead_capture_mode ?? null,
    funnelLeadCaptureMode: funnel.leadCaptureMode ?? null,
    funnelLeadCaptureModeSnake: funnel.lead_capture_mode ?? null,
    campaignPayloadFormType: campaignPayload.form_type ?? campaignPayload.formType ?? null,
    campaignPayloadLeadCaptureMode: campaignPayload.lead_capture_mode ?? campaignPayload.leadCaptureMode ?? null,
  };

  return {
    ...source,
    leadCaptureMode: INSTANT_MODE,
    lead_capture_mode: INSTANT_MODE,
    plan: {
      ...nestedPlan,
      leadCaptureMode: INSTANT_MODE,
      lead_capture_mode: INSTANT_MODE,
    },
    funnel: {
      ...funnel,
      leadCaptureMode: INSTANT_MODE,
      lead_capture_mode: INSTANT_MODE,
    },
    campaignPayload: {
      ...campaignPayload,
      formType: INSTANT_FORM_TYPE,
      form_type: INSTANT_FORM_TYPE,
      leadCaptureMode: INSTANT_MODE,
      lead_capture_mode: INSTANT_MODE,
    },
    campaign_payload: {
      ...campaignPayload,
      formType: INSTANT_FORM_TYPE,
      form_type: INSTANT_FORM_TYPE,
      leadCaptureMode: INSTANT_MODE,
      lead_capture_mode: INSTANT_MODE,
    },
    leadCaptureModeRepair: {
      ...(asRecord(source.leadCaptureModeRepair) ?? {}),
      repaired_from_activation_events: true,
      proof_run_id: proofRunId,
      repaired_at: now,
      previous_values: previous,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = requireServiceRoleClient();

  let eventsQuery = supabase
    .from("activation_events")
    .select("campaign_id, organization_id, event_name, metadata, occurred_at")
    .not("campaign_id", "is", null)
    .in("event_name", ["campaign_plan_persisted", "onboarding_completed"]);

  if (args.campaignId) {
    eventsQuery = eventsQuery.eq("campaign_id", args.campaignId);
  }

  const { data: events, error: eventsError } = await eventsQuery;
  if (eventsError) throw eventsError;

  const candidateCampaignIds = Array.from(
    new Set(
      (events ?? [])
        .filter((event) => readLeadCaptureMode(event.metadata) === INSTANT_MODE)
        .map((event) => event.campaign_id)
        .filter(Boolean),
    ),
  );

  if (candidateCampaignIds.length === 0) {
    console.log(JSON.stringify({
      mode: args.apply ? "apply" : "dry-run",
      proofRunId: args.proofRunId,
      scannedActivationEvents: events?.length ?? 0,
      candidateCampaigns: 0,
      affectedCampaigns: [],
      mutationCount: 0,
    }, null, 2));
    return;
  }

  const { data: rows, error: rowsError } = await supabase
    .from("campaign_plans")
    .select("id, organization_id, plan")
    .in("id", candidateCampaignIds);

  if (rowsError) throw rowsError;

  const affected = (rows ?? [])
    .filter((row) => readLeadCaptureMode(row.plan) !== INSTANT_MODE)
    .map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      currentMode: readLeadCaptureMode(row.plan),
      patchedPlan: patchPlan(row.plan, args.proofRunId),
    }));

  let mutationCount = 0;
  if (args.apply) {
    for (const item of affected) {
      const { error } = await supabase
        .from("campaign_plans")
        .update({ plan: item.patchedPlan })
        .eq("id", item.id);

      if (error) throw error;
      mutationCount += 1;
    }
  }

  console.log(JSON.stringify({
    mode: args.apply ? "apply" : "dry-run",
    proofRunId: args.proofRunId,
    scannedActivationEvents: events?.length ?? 0,
    candidateCampaigns: candidateCampaignIds.length,
    affectedCampaigns: affected.map((item) => ({
      id: item.id,
      organization_id: item.organization_id,
      currentMode: item.currentMode,
      proposedMode: INSTANT_MODE,
      proposedPayloadFormType: INSTANT_FORM_TYPE,
    })),
    mutationCount,
    safety: {
      dryRunMutates: false,
      applyRequiresConfirmation: true,
      touchesCampaignPlansOnly: true,
      touchesMeta: false,
      touchesGhl: false,
      touchesStripe: false,
      queuesJobs: false,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
