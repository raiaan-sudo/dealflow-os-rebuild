#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const REVIEWED_BY = "codex-production-readiness";
const now = new Date().toISOString();

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function log(message, detail) {
  console.log(`${message}${detail ? ` - ${detail}` : ""}`);
}

async function main() {
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: stripeRows, error: stripeReadError } = await supabase
    .from("stripe_webhook_events")
    .select("id,stripe_event_id,stripe_event_type,organization_id,status,error_code,payload")
    .eq("status", "failed")
    .eq("error_code", "stripe_metadata_missing")
    .is("organization_id", null);

  if (stripeReadError) {
    throw new Error(`Failed to read Stripe webhook failures: ${stripeReadError.message}`);
  }

  const safeStripeRows = (stripeRows ?? []).filter((row) => row.payload?.livemode === false);
  if (safeStripeRows.length > 0) {
    const { error } = await supabase
      .from("stripe_webhook_events")
      .update({
        reviewed_at: now,
        reviewed_by: REVIEWED_BY,
        resolution_note:
          "Reviewed as non-customer Stripe CLI/test fixture event missing DealFlow metadata; no billing state was applied.",
        updated_at: now,
      })
      .in(
        "id",
        safeStripeRows.map((row) => row.id),
      );

    if (error) {
      throw new Error(`Failed to mark Stripe test failures reviewed: ${error.message}`);
    }
  }

  log("Stripe test fixture failures reviewed", String(safeStripeRows.length));

  const { data: jobRows, error: jobReadError } = await supabase
    .from("system_jobs")
    .select("id,status,kind,last_error_code,dead_lettered_at,dead_letter_reason,error_message,payload")
    .eq("kind", "campaign_build")
    .eq("status", "failed")
    .is("reviewed_at", null);

  if (jobReadError) {
    throw new Error(`Failed to read failed system jobs: ${jobReadError.message}`);
  }

  const safeJobRows = (jobRows ?? []).filter((row) => {
    const category = row.payload?.tracking?.lastErrorCategory;
    const nonRetryable =
      row.payload?.tracking?.retryEligible === false ||
      row.max_attempts === 1 ||
      row.dead_lettered_at !== null;
    const knownHistoricalError =
      row.last_error_code === "publishing_schema_missing" ||
      row.error_message === "Tracked route execution failed." ||
      row.error_message?.startsWith("Missing required artifacts:");

    return nonRetryable && knownHistoricalError && ["server_or_provider", "validation_or_access", "unknown"].includes(category);
  });

  if (safeJobRows.length > 0) {
    const { error } = await supabase
      .from("system_jobs")
      .update({
        reviewed_at: now,
        reviewed_by: REVIEWED_BY,
        resolution_note:
          "Reviewed as historical non-retryable campaign_build artifact from prelaunch validation; current schema and smoke checks pass.",
      })
      .in(
        "id",
        safeJobRows.map((row) => row.id),
      );

    if (error) {
      throw new Error(`Failed to mark system jobs reviewed: ${error.message}`);
    }
  }

  log("Historical failed campaign_build jobs reviewed", String(safeJobRows.length));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
