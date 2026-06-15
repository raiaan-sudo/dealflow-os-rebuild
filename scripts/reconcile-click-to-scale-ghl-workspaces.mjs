#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

function arg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : null;
}

const apply = process.argv.includes("--apply");
const partnerId = arg("partner") || "click_to_scale";
const limit = Number(arg("limit") || 100);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

const [{ data: attributions, error: attributionError }, { data: mappings, error: mappingError }] = await Promise.all([
  supabase
    .from("workspace_partner_attribution")
    .select("workspace_id, partner_id, active, updated_at")
    .eq("partner_id", partnerId)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(limit),
  supabase
    .from("workspace_ghl_mapping")
    .select("workspace_id, partner_id, ghl_location_id, sync_enabled, updated_at")
    .eq("partner_id", partnerId)
    .limit(limit),
]);

if (attributionError) {
  throw new Error(`workspace_partner_attribution fetch failed: ${attributionError.message}`);
}
if (mappingError) {
  throw new Error(`workspace_ghl_mapping fetch failed: ${mappingError.message}`);
}

const mappingByWorkspace = new Map((mappings ?? []).map((mapping) => [mapping.workspace_id, mapping]));
const missingMappings = [];
const disabledMappings = [];
const mapped = [];

for (const attribution of attributions ?? []) {
  const mapping = mappingByWorkspace.get(attribution.workspace_id);
  if (!mapping?.ghl_location_id) {
    missingMappings.push(attribution.workspace_id);
  } else if (!mapping.sync_enabled) {
    disabledMappings.push(attribution.workspace_id);
  } else {
    mapped.push(attribution.workspace_id);
  }
}

const queueResults = [];
if (apply && missingMappings.length > 0) {
  for (const workspaceId of missingMappings) {
    const idempotencyKey = `ghl_workspace_provisioning:${partnerId}:${workspaceId}:reconcile`;
    const { data: existing, error: existingError } = await supabase
      .from("system_jobs")
      .select("id, status")
      .eq("organization_id", workspaceId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingError) {
      throw new Error(`system job lookup failed for ${workspaceId}: ${existingError.message}`);
    }

    if (existing?.id) {
      queueResults.push({ workspaceId, reusedExisting: true, jobId: existing.id, status: existing.status });
      continue;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("system_jobs")
      .insert({
        organization_id: workspaceId,
        kind: "ghl_workspace_provisioning",
        status: "pending",
        payload: {
          source: "click_to_scale_reconcile",
          workspaceId,
          partnerId,
          stripeSubscriptionId: "reconcile",
          apply: true,
        },
        idempotency_key: idempotencyKey,
        max_attempts: 3,
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(`system job insert failed for ${workspaceId}: ${insertError.message}`);
    }

    queueResults.push({ workspaceId, reusedExisting: false, jobId: inserted.id, status: "pending" });
  }
}

console.log(JSON.stringify({
  ok: true,
  mode: apply ? "apply" : "dry-run",
  partnerId,
  counts: {
    activePartnerWorkspaces: attributions?.length ?? 0,
    mapped: mapped.length,
    missingMappings: missingMappings.length,
    disabledMappings: disabledMappings.length,
    queuedJobs: queueResults.length,
  },
  missingMappings,
  disabledMappings,
  queueResults,
  safety: {
    printedSecrets: false,
    calledGhl: false,
    mutatedDatabase: apply && queueResults.length > 0,
    externalWriteAttempted: false,
    note: "Apply mode queues internal provisioning jobs only. The worker and GHL write flags still control external GHL writes.",
  },
}, null, 2));
