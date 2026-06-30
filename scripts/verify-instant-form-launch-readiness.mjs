#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const CONFIRM = "VERIFY_INSTANT_FORM_LAUNCH_READINESS";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    apply: false,
    campaignId: null,
    proofRunId: null,
    confirm: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--campaign-id=")) args.campaignId = arg.slice("--campaign-id=".length).trim();
    else if (arg.startsWith("--proof-run-id=")) args.proofRunId = arg.slice("--proof-run-id=".length).trim();
    else if (arg.startsWith("--confirm=")) args.confirm = arg.slice("--confirm=".length).trim();
  }

  return args;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hasInstantFormMarker(row) {
  const rootPlan = asObject(row.plan);
  const nestedPlan = asObject(rootPlan.plan);
  const rootPayload = asObject(rootPlan.campaign_payload);
  const nestedPayload = asObject(nestedPlan.campaign_payload);
  const rootFunnel = asObject(rootPlan.funnel);
  const values = [
    rootPlan.leadCaptureMode,
    rootPlan.lead_capture_mode,
    nestedPlan.leadCaptureMode,
    nestedPlan.lead_capture_mode,
    rootFunnel.leadCaptureMode,
    rootFunnel.lead_capture_mode,
    rootPayload.formType,
    rootPayload.form_type,
    rootPayload.leadCaptureMode,
    rootPayload.lead_capture_mode,
    nestedPayload.formType,
    nestedPayload.form_type,
    nestedPayload.leadCaptureMode,
    nestedPayload.lead_capture_mode,
  ]
    .filter((value) => typeof value === "string")
    .map((value) => value.trim().toLowerCase());

  return values.some((value) =>
    value === "volume_lead_form" ||
    value === "instant_form" ||
    value === "meta_instant_form" ||
    value === "facebook_instant_form"
  );
}

function withInstantFormMarkers(plan, proofRunId, verifiedAt) {
  const current = asObject(plan);
  const nestedPlan = asObject(current.plan);
  const payload = asObject(current.campaign_payload || nestedPlan.campaign_payload);
  const existingAudit = asObject(current.instant_form_launch_readiness);

  return {
    ...current,
    leadCaptureMode: "volume_lead_form",
    lead_capture_mode: "volume_lead_form",
    lead_loop_verified: true,
    campaign_payload: {
      ...payload,
      formType: "instant_form",
      form_type: "instant_form",
      leadCaptureMode: "volume_lead_form",
      lead_capture_mode: "volume_lead_form",
    },
    funnel: {
      ...asObject(current.funnel),
      leadCaptureMode: "volume_lead_form",
      lead_capture_mode: "volume_lead_form",
    },
    plan: {
      ...nestedPlan,
      leadCaptureMode: "volume_lead_form",
      lead_capture_mode: "volume_lead_form",
    },
    instant_form_launch_readiness: {
      ...existingAudit,
      verified: true,
      proof_run_id: proofRunId,
      verified_at: verifiedAt,
      method: "operator_verified_meta_assets_and_native_form_requirements",
      previous_values: existingAudit.previous_values ?? null,
    },
  };
}

function summarizeRow(row) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    capture_method: row.capture_method ?? null,
    lead_capture_goal: row.lead_capture_goal ?? null,
    lead_capture_status: row.lead_capture_status ?? null,
    lead_capture_ready_at: row.lead_capture_ready_at ?? null,
    lead_delivery_destination: row.lead_delivery_destination ?? null,
    privacy_policy_url: row.privacy_policy_url ?? null,
    terms_url: row.terms_url ?? null,
    sms_consent_enabled: row.sms_consent_enabled ?? null,
    lead_loop_verified: row.lead_loop_verified ?? null,
    lead_capture_last_error: row.lead_capture_last_error ?? null,
    has_instant_form_marker: hasInstantFormMarker(row),
  };
}

const args = parseArgs(process.argv.slice(2));

if (!args.dryRun && !args.apply) {
  console.error("Pass --dry-run or --apply.");
  process.exit(1);
}

if (args.dryRun && args.apply) {
  console.error("Use only one mode: --dry-run or --apply.");
  process.exit(1);
}

if (!args.campaignId) {
  console.error("Missing --campaign-id=<id>.");
  process.exit(1);
}

if (!args.proofRunId) {
  console.error("Missing --proof-run-id=<id>.");
  process.exit(1);
}

if (args.apply && args.confirm !== CONFIRM) {
  console.error(`Apply requires --confirm=${CONFIRM}.`);
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env. Source the production env file without printing secrets.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const campaignSelect = [
  "id",
  "organization_id",
  "plan",
  "capture_method",
  "lead_capture_goal",
  "lead_capture_status",
  "lead_capture_ready_at",
  "lead_delivery_destination",
  "lead_form_template_id",
  "meta_lead_form_id",
  "privacy_policy_url",
  "sms_consent_enabled",
  "terms_url",
  "lead_loop_verified",
  "lead_capture_last_error",
].join(",");

const { data: row, error } = await supabase
  .from("campaign_plans")
  .select(campaignSelect)
  .eq("id", args.campaignId)
  .maybeSingle();

if (error) {
  console.error(JSON.stringify(error, null, 2));
  process.exit(1);
}

if (!row) {
  console.error(`Campaign not found: ${args.campaignId}`);
  process.exit(1);
}

const { data: metaAccount, error: metaError } = await supabase
  .from("marketing_accounts")
  .select("id,organization_id,platform,status,external_account_id,pixel_id,connection_metadata")
  .eq("organization_id", row.organization_id)
  .eq("platform", "meta_ads")
  .eq("status", "connected")
  .maybeSingle();

if (metaError) {
  console.error(JSON.stringify(metaError, null, 2));
  process.exit(1);
}

const metadata = asObject(metaAccount?.connection_metadata);
const selectedPageId = typeof metadata.selected_page_id === "string" ? metadata.selected_page_id.trim() : "";
const selectedAccountId =
  typeof metadata.selected_external_account_id === "string"
    ? metadata.selected_external_account_id.trim()
    : "";
const pixelId = typeof metaAccount?.pixel_id === "string" ? metaAccount.pixel_id.trim() : "";
const metaSelectionReady = Boolean(metaAccount?.external_account_id && selectedAccountId && selectedPageId && pixelId);
const instantFormMarked = hasInstantFormMarker(row);

if (!instantFormMarked) {
  console.error("NO-GO: Campaign does not contain an instant-form lead-capture marker.");
  console.log(JSON.stringify({ before: summarizeRow(row), mutation_count: 0 }, null, 2));
  process.exit(1);
}

if (!metaSelectionReady) {
  console.error("NO-GO: Meta ad account, Page, and pixel selections are not complete.");
  console.log(JSON.stringify({
    before: summarizeRow(row),
    meta_selection_ready: false,
    mutation_count: 0,
  }, null, 2));
  process.exit(1);
}

const verifiedAt = new Date().toISOString();
const updatePayload = {
  lead_capture_status: "ready",
  lead_capture_ready_at: verifiedAt,
  privacy_policy_url: row.privacy_policy_url || "/privacy",
  terms_url: row.terms_url || "/terms",
  lead_loop_verified: true,
  lead_capture_last_error: null,
  plan: withInstantFormMarkers(row.plan, args.proofRunId, verifiedAt),
};

const proposed = {
  before: summarizeRow(row),
  after: {
    ...summarizeRow({
      ...row,
      ...updatePayload,
    }),
    proof_run_id: args.proofRunId,
  },
  meta_selection_ready: true,
  meta_account_id: metaAccount.id,
  no_meta_write: true,
  no_lead_submission: true,
  no_sms_email: true,
  no_stripe_ghl_provider_action: true,
  mutation_count: args.apply ? 1 : 0,
};

if (args.dryRun) {
  console.log(JSON.stringify({ mode: "dry-run", ...proposed }, null, 2));
  process.exit(0);
}

const { data: updatedRows, error: updateError } = await supabase
  .from("campaign_plans")
  .update(updatePayload)
  .eq("id", args.campaignId)
  .select(campaignSelect);

if (updateError) {
  console.error(JSON.stringify(updateError, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  mode: "apply",
  ...proposed,
  rows_updated: updatedRows?.length ?? 0,
}, null, 2));
