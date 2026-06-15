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
const reason = arg("reason") || "ghl_user_invite_api_upgrade_pending";
const now = new Date().toISOString();

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function isReviewable(job) {
  const message = String(job.last_error_message ?? "");
  const code = String(job.last_error_code ?? "");
  const source = String(job.metadata?.source ?? "");

  return (
    job.partner_id === partnerId &&
    ["failed", "dead_letter"].includes(job.status) &&
    job.metadata?.accepted_deferred !== true &&
    source.includes("proof") &&
    (
      code === "ghl_auth_failed" ||
      message.includes("Unauthorized") ||
      message.includes("companyId can't be undefined") ||
      message.includes("property firstName should not exist") ||
      message.includes("does not have access to this feature")
    )
  );
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

const { data: jobs, error } = await supabase
  .from("ghl_provisioning_jobs")
  .select("id, workspace_id, partner_id, status, last_error_code, last_error_message, metadata, created_at")
  .eq("partner_id", partnerId)
  .in("status", ["failed", "dead_letter"])
  .order("created_at", { ascending: false })
  .limit(50);

if (error) {
  throw new Error(`ghl_provisioning_jobs fetch failed: ${error.message}`);
}

const reviewable = (jobs ?? []).filter(isReviewable);
const skipped = (jobs ?? []).filter((job) => !isReviewable(job));
const updated = [];

if (apply) {
  for (const job of reviewable) {
    const metadata = {
      ...(job.metadata ?? {}),
      reviewed: true,
      accepted_deferred: true,
      reviewed_at: now,
      review_reason: reason,
      review_scope: "click_to_scale_ghl_proof_cleanup",
    };

    const { error: updateError } = await supabase
      .from("ghl_provisioning_jobs")
      .update({
        metadata,
        updated_at: now,
      })
      .eq("id", job.id);

    if (updateError) {
      throw new Error(`ghl_provisioning_jobs update failed for ${job.id}: ${updateError.message}`);
    }

    updated.push(job.id);
  }
}

console.log(JSON.stringify({
  ok: true,
  mode: apply ? "apply" : "dry-run",
  partnerId,
  reason,
  reviewable: reviewable.map((job) => ({
    id: job.id,
    workspaceId: job.workspace_id,
    status: job.status,
    lastErrorCode: job.last_error_code,
    messageCategory: String(job.last_error_message ?? "").slice(0, 72),
  })),
  skippedCount: skipped.length,
  updated,
  safety: {
    printedSecrets: false,
    calledGhl: false,
    mutatedDatabase: apply && updated.length > 0,
    externalWriteAttempted: false,
  },
}, null, 2));
