#!/usr/bin/env node

import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

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
const userId = required("user-id");
const partnerId = arg("partner") || "click_to_scale";
const stripeSubscriptionId = arg("stripe-subscription-id");
const source = arg("source") || "manual";

const payload = {
  source,
  workspaceId,
  userId,
  partnerId,
  stripeSubscriptionId,
  apply: true,
};
const idempotencyKey = createHash("sha256")
  .update([partnerId, workspaceId, stripeSubscriptionId ?? "manual", "ghl_provisioning"].join("|"))
  .digest("hex");

console.log(JSON.stringify({
  mode: apply ? "queue-system-job" : "dry-run",
  workspaceId,
  userId,
  partnerId,
  stripeSubscriptionId,
  idempotencyKey,
  payload,
  safety: {
    liveGhlWriteAttempted: false,
    note: "This script queues DealFlow's internal provisioning job only. The worker still requires GHL_AUTO_PROVISIONING_ENABLED=true and GHL_PROVISIONING_WRITES_ENABLED=true before external GHL writes.",
  },
}, null, 2));

if (!apply) {
  console.log("Dry run only. Add --apply to queue the internal provisioning system job.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceRole) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false },
});

const { data: existing, error: existingError } = await supabase
  .from("system_jobs")
  .select("id")
  .eq("organization_id", workspaceId)
  .eq("user_id", userId)
  .eq("idempotency_key", `ghl_workspace_provisioning:${partnerId}:${workspaceId}:${stripeSubscriptionId ?? "manual"}`)
  .maybeSingle();

if (existingError) {
  throw new Error(`system job lookup failed: ${existingError.message}`);
}

if (existing?.id) {
  console.log(JSON.stringify({ queued: true, reusedExisting: true, jobId: existing.id }, null, 2));
  process.exit(0);
}

const { data, error } = await supabase
  .from("system_jobs")
  .insert({
    organization_id: workspaceId,
    user_id: userId,
    campaign_id: null,
    kind: "ghl_workspace_provisioning",
    status: "pending",
    payload,
    idempotency_key: `ghl_workspace_provisioning:${partnerId}:${workspaceId}:${stripeSubscriptionId ?? "manual"}`,
    max_attempts: 3,
  })
  .select("id")
  .single();

if (error) {
  throw new Error(`system job insert failed: ${error.message}`);
}

console.log(JSON.stringify({ queued: true, reusedExisting: false, jobId: data.id }, null, 2));
