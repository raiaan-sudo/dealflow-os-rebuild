#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

function arg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : null;
}

function required(name) {
  const value = arg(name);
  if (!value) {
    throw new Error(`Missing --${name}=...`);
  }
  return value;
}

const apply = process.argv.includes("--apply");
const workspaceId = required("workspace-id");
const locationId = required("location-id");
const pipelineId = arg("pipeline-id");
const stageId = arg("stage-id");
const credentialRef = arg("credential-ref") || "CLICKTOSCALE_GHL_PRIVATE_INTEGRATION";
const assignedBy = arg("assigned-by");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false },
});

const partnerConfig = {
  partner_id: "click_to_scale",
  display_name: "Click to Scale",
  product_name: "Click to Scale DealFlow",
  legal_fallback_name: "DealFlow",
  support_email: "support@agentdealflow.io",
  support_phone: null,
  primary_color: "#2DD4BF",
  secondary_color: "#05070D",
  accent_color: "#38BDF8",
  background_color: "#020617",
  logo_url: null,
  favicon_url: null,
  billing_owner: "dealflow",
  stripe_partner_metadata: "click_to_scale",
  ghl_enabled: true,
  ghl_default_pipeline_id: pipelineId,
  ghl_default_stage_id: stageId,
  ghl_default_tags: ["DealFlow", "Click to Scale", "New Lead"],
  sms_template: "click_to_scale_lead_alert",
  updated_at: new Date().toISOString(),
};

const ghlConfig = {
  partner_id: "click_to_scale",
  enabled: true,
  auth_type: "private_integration_token",
  encrypted_credential_ref: credentialRef,
  default_location_id: locationId,
  default_pipeline_id: pipelineId,
  default_stage_id: stageId,
  default_tags: ["DealFlow", "Click to Scale", "New Lead"],
  default_source: "DealFlow / Click to Scale",
  updated_at: new Date().toISOString(),
};

const mapping = {
  workspace_id: workspaceId,
  partner_id: "click_to_scale",
  ghl_location_id: locationId,
  ghl_pipeline_id: pipelineId,
  ghl_stage_id: stageId,
  sync_enabled: true,
  assigned_by: assignedBy,
  updated_at: new Date().toISOString(),
};

const attribution = {
  workspace_id: workspaceId,
  partner_id: "click_to_scale",
  source: "click_to_scale_setup",
  active: true,
  assigned_by: assignedBy,
  metadata: {
    billing_owner: "dealflow",
    crm_destination: "gohighlevel",
    notification_mode: "sms_alert_only",
  },
  updated_at: new Date().toISOString(),
};

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  partnerConfig: { ...partnerConfig, ghl_default_tags: partnerConfig.ghl_default_tags.length },
  ghlConfig: { ...ghlConfig, encrypted_credential_ref: credentialRef, default_tags: ghlConfig.default_tags.length },
  mapping,
  attribution,
}, null, 2));

if (!apply) {
  console.log("Dry run only. Add --apply to write partner/GHL config.");
  process.exit(0);
}

const { error: partnerError } = await supabase
  .from("partner_configs")
  .upsert(partnerConfig, { onConflict: "partner_id" });
if (partnerError) throw new Error(`partner_configs upsert failed: ${partnerError.message}`);

const { error: ghlError } = await supabase
  .from("partner_ghl_config")
  .upsert(ghlConfig, { onConflict: "partner_id" });
if (ghlError) throw new Error(`partner_ghl_config upsert failed: ${ghlError.message}`);

const { error: mappingError } = await supabase
  .from("workspace_ghl_mapping")
  .upsert(mapping, { onConflict: "workspace_id,partner_id" });
if (mappingError) throw new Error(`workspace_ghl_mapping upsert failed: ${mappingError.message}`);

const { error: attributionError } = await supabase
  .from("workspace_partner_attribution")
  .upsert(attribution, { onConflict: "workspace_id" });
if (attributionError) throw new Error(`workspace_partner_attribution upsert failed: ${attributionError.message}`);

console.log("Click to Scale GHL mapping configured.");
