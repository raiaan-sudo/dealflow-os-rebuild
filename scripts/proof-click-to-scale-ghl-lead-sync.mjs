#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

function arg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : null;
}

const workspaceId = arg("workspace-id");
const leadId = arg("lead-id");
const partnerId = arg("partner") || "click_to_scale";

function mask(value) {
  if (!value) return null;
  return `${String(value).slice(0, 6)}...${String(value).slice(-4)}`;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for local proof. If local secrets are unavailable, use the admin-only production proof route instead.`);
  }
  return value;
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

let resolvedWorkspaceId = workspaceId;
if (!resolvedWorkspaceId) {
  const { data, error } = await supabase
    .from("workspace_ghl_mapping")
    .select("workspace_id")
    .eq("partner_id", partnerId)
    .eq("sync_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`workspace_ghl_mapping lookup failed: ${error.message}`);
  }
  resolvedWorkspaceId = data?.workspace_id ?? null;
}

if (!resolvedWorkspaceId) {
  throw new Error("No enabled Click to Scale workspace mapping found. Pass --workspace-id=<uuid>.");
}

const { data: mapping, error: mappingError } = await supabase
  .from("workspace_ghl_mapping")
  .select("workspace_id, partner_id, ghl_location_id, ghl_pipeline_id, ghl_stage_id, sync_enabled")
  .eq("workspace_id", resolvedWorkspaceId)
  .eq("partner_id", partnerId)
  .maybeSingle();

if (mappingError) {
  throw new Error(`workspace_ghl_mapping fetch failed: ${mappingError.message}`);
}
if (!mapping?.ghl_location_id || !mapping.sync_enabled) {
  throw new Error("Workspace has no enabled GHL location mapping.");
}

const { data: existingLead, error: leadError } = leadId
  ? await supabase
      .from("leads")
      .select("id, organization_id, email, source, metadata")
      .eq("id", leadId)
      .eq("organization_id", resolvedWorkspaceId)
      .maybeSingle()
  : { data: null, error: null };

if (leadError) {
  throw new Error(`lead lookup failed: ${leadError.message}`);
}

console.log(JSON.stringify({
  ok: true,
  mode: "local-preflight",
  partnerId,
  workspaceId: resolvedWorkspaceId,
  leadId: existingLead?.id ?? null,
  locationIdMasked: mask(mapping.ghl_location_id),
  pipelineConfigured: Boolean(mapping.ghl_pipeline_id && mapping.ghl_stage_id),
  localTokenConfigured: Boolean(process.env.CLICKTOSCALE_GHL_PRIVATE_INTEGRATION?.trim()),
  nextStep: "Use the admin-only production route for live proof when local GHL/Supabase secrets are not available.",
  safety: {
    printedSecrets: false,
    calledGhl: false,
    mutatedDatabase: false,
    externalWriteAttempted: false,
  },
}, null, 2));
