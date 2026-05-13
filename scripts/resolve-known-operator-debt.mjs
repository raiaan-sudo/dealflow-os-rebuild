#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const REVIEWED_BY = "codex-production-readiness";
const now = new Date().toISOString();
const KNOWN_VIDEO_GENERATION_DEBT = {
  jobId: "b1d337a9-b6ae-4c90-be40-7157b6bcb02f",
  providerEventId: "76cfe4df-a488-49ff-8f3f-c616889c5c34",
  campaignId: "a18d77f7-398b-4920-8d93-8332dfff2d44",
};

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
    .is("organization_id", null)
    .is("reviewed_at", null);

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

  const { data: metaSyncRows, error: metaSyncReadError } = await supabase
    .from("system_jobs")
    .select("id,status,kind,last_error_code,dead_lettered_at,error_message,payload")
    .eq("kind", "meta_sync")
    .eq("status", "failed")
    .not("dead_lettered_at", "is", null)
    .is("reviewed_at", null);

  if (metaSyncReadError) {
    throw new Error(`Failed to read failed Meta sync jobs: ${metaSyncReadError.message}`);
  }

  const safeMetaSyncRows = (metaSyncRows ?? []).filter((row) => {
    const category = row.payload?.tracking?.lastErrorCategory;
    const nonRetryable = row.payload?.tracking?.retryEligible === false;
    const knownHistoricalError =
      (row.last_error_code === "meta_not_connected" &&
        row.error_message === "Connect a Meta ad account before syncing status.") ||
      (row.last_error_code === "campaign_sync_snapshot_insert_failed" &&
        row.error_message?.includes("public.campaign_sync_snapshots"));

    return nonRetryable && knownHistoricalError && ["server_or_provider", "validation_or_access"].includes(category);
  });

  if (safeMetaSyncRows.length > 0) {
    const { error } = await supabase
      .from("system_jobs")
      .update({
        reviewed_at: now,
        reviewed_by: REVIEWED_BY,
        resolution_note:
          "Reviewed as historical non-retryable meta_sync artifact from prelaunch validation; Meta sync schema and smoke checks now pass.",
      })
      .in(
        "id",
        safeMetaSyncRows.map((row) => row.id),
      );

    if (error) {
      throw new Error(`Failed to mark Meta sync jobs reviewed: ${error.message}`);
    }
  }

  log("Historical failed meta_sync jobs reviewed", String(safeMetaSyncRows.length));

  const { data: supersededRenderRows, error: supersededRenderReadError } = await supabase
    .from("system_jobs")
    .select("id,status,kind,last_error_code,dead_lettered_at,error_message,payload")
    .eq("kind", "static_creative_generation")
    .eq("status", "failed")
    .eq("last_error_code", "superseded_static_render_retry")
    .is("reviewed_at", null);

  if (supersededRenderReadError) {
    throw new Error(`Failed to read superseded static render jobs: ${supersededRenderReadError.message}`);
  }

  const safeSupersededRenderRows = (supersededRenderRows ?? []).filter((row) => {
    return (
      row.dead_lettered_at !== null &&
      row.error_message === "Superseded by production render kickoff fix before provider execution." &&
      row.payload?.force === true
    );
  });

  if (safeSupersededRenderRows.length > 0) {
    const { error } = await supabase
      .from("system_jobs")
      .update({
        reviewed_at: now,
        reviewed_by: REVIEWED_BY,
        resolution_note:
          "Reviewed as superseded static render retry artifacts from the Higgsfield production kickoff fix; later render proof completed through the current path.",
      })
      .in(
        "id",
        safeSupersededRenderRows.map((row) => row.id),
      );

    if (error) {
      throw new Error(`Failed to mark superseded static render jobs reviewed: ${error.message}`);
    }
  }

  log("Superseded static render jobs reviewed", String(safeSupersededRenderRows.length));

  const { data: providerRows, error: providerReadError } = await supabase
    .from("provider_usage_events")
    .select("id,campaign_id,provider,operation,status,metadata")
    .eq("status", "failed")
    .eq("campaign_id", "a18d77f7-398b-4920-8d93-8332dfff2d44")
    .eq("provider", "higgsfield")
    .eq("operation", "image_generation");

  if (providerReadError) {
    throw new Error(`Failed to read failed provider usage events: ${providerReadError.message}`);
  }

  const safeProviderRows = (providerRows ?? []).filter((row) => !row.metadata?.operatorReviewedAt);
  for (const row of safeProviderRows) {
    const { error } = await supabase
      .from("provider_usage_events")
      .update({
        metadata: {
          ...(row.metadata ?? {}),
          operatorReviewedAt: now,
          operatorReviewedBy: REVIEWED_BY,
          operatorReviewNote:
            "Reviewed as failed Higgsfield image-generation test artifact for the owner campaign; current provider route remains covered by smoke/build checks.",
        },
        updated_at: now,
      })
      .eq("id", row.id);

    if (error) {
      throw new Error(`Failed to mark provider usage event reviewed: ${error.message}`);
    }
  }

  log("Failed provider usage events reviewed", String(safeProviderRows.length));

  const { data: videoJobRows, error: videoJobReadError } = await supabase
    .from("system_jobs")
    .select("id,status,kind,campaign_id,last_error_code,dead_lettered_at,error_message")
    .eq("id", KNOWN_VIDEO_GENERATION_DEBT.jobId)
    .eq("campaign_id", KNOWN_VIDEO_GENERATION_DEBT.campaignId)
    .eq("kind", "video_generation")
    .eq("status", "failed")
    .eq("last_error_code", "video_provider_request_failed")
    .not("dead_lettered_at", "is", null)
    .is("reviewed_at", null);

  if (videoJobReadError) {
    throw new Error(`Failed to read known failed video-generation job: ${videoJobReadError.message}`);
  }

  const safeVideoJobRows = (videoJobRows ?? []).filter((row) =>
    row.error_message ===
    "Video preview is temporarily unavailable. Your campaign can continue with static creatives while we resolve video rendering."
  );

  if (safeVideoJobRows.length > 0) {
    const { error } = await supabase
      .from("system_jobs")
      .update({
        reviewed_at: now,
        reviewed_by: REVIEWED_BY,
        resolution_note:
          "Reviewed after video-generation launch remediation: Higgsfield start path was updated to use the supported image-to-video endpoint, provider pre-job failures now release usage, completed videos normalize into app-owned storage, and the capped proof path is revalidated separately.",
      })
      .in(
        "id",
        safeVideoJobRows.map((row) => row.id),
      );

    if (error) {
      throw new Error(`Failed to mark known video-generation job reviewed: ${error.message}`);
    }
  }

  log("Known failed video-generation jobs reviewed", String(safeVideoJobRows.length));

  const { data: videoProviderRows, error: videoProviderReadError } = await supabase
    .from("provider_usage_events")
    .select("id,campaign_id,provider,operation,status,metadata")
    .eq("id", KNOWN_VIDEO_GENERATION_DEBT.providerEventId)
    .eq("campaign_id", KNOWN_VIDEO_GENERATION_DEBT.campaignId)
    .eq("provider", "higgsfield")
    .eq("operation", "video_generation")
    .eq("status", "failed");

  if (videoProviderReadError) {
    throw new Error(`Failed to read known failed video provider usage event: ${videoProviderReadError.message}`);
  }

  const safeVideoProviderRows = (videoProviderRows ?? []).filter((row) =>
    !row.metadata?.operatorReviewedAt &&
    row.metadata?.reason === "AI video generation failed."
  );

  for (const row of safeVideoProviderRows) {
    const { error } = await supabase
      .from("provider_usage_events")
      .update({
        metadata: {
          ...(row.metadata ?? {}),
          operatorReviewedAt: now,
          operatorReviewedBy: REVIEWED_BY,
          operatorReviewNote:
            "Reviewed after video-generation launch remediation. The failed row is preserved as historical provider evidence; the corrected path uses supported Higgsfield image-to-video input and releases/normalizes future attempts without leaving stale operator debt.",
        },
        updated_at: now,
      })
      .eq("id", row.id);

    if (error) {
      throw new Error(`Failed to mark known video provider usage event reviewed: ${error.message}`);
    }
  }

  log("Known failed video provider usage events reviewed", String(safeVideoProviderRows.length));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
