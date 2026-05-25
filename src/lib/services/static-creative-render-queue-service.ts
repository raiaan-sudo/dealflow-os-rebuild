import "server-only";

import { ApiError } from "@/lib/api/route";
import { logOperationalEvent, logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Database, Json } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateCampaignEntitlements } from "@/lib/services/campaign-entitlements";
import { getSavedCampaignDocumentFromRow } from "@/lib/services/canonical-campaign";
import {
  creativeIntakeIncludesStatic,
  getApprovedCreativeIntakeGenerationContext,
  hasSameCreativeIntakeGenerationContext,
} from "@/lib/services/creative-chat-intake-service";
import {
  STATIC_LAUNCH_MIN_CREATIVE_COUNT,
  isLaunchReadyStaticCreative,
} from "@/lib/services/creative-media-readiness";
import { createSystemJob } from "@/lib/services/system-job-service";

type QueueClient = SupabaseClient<Database>;
type CampaignPlanRow = Database["public"]["Tables"]["campaign_plans"]["Row"];
type BillingRow = Database["public"]["Tables"]["billing_subscriptions"]["Row"];

export type StaticRenderQueueReason =
  | "checkout_success"
  | "trial_activated"
  | "subscription_active"
  | "billing_recovered"
  | "manual_unlock"
  | "creative_brief_approved"
  | "creative_studio_visit";

export type StaticRenderQueueResult = {
  queued: boolean;
  reusedExistingJob: boolean;
  jobId: string | null;
  blockedReason: string | null;
  launchReadyCount: number;
  missingCount: number;
};

type EnsureStaticCreativeRenderQueuedParams = {
  campaignId: string;
  reason: StaticRenderQueueReason;
  supabase?: QueueClient;
  userId?: string | null;
  organizationId?: string | null;
  accessAlreadyConfirmed?: boolean;
};

function getQueueClient(params?: { supabase?: QueueClient }) {
  const client = params?.supabase ?? createAdminClient();

  if (!client) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  return client;
}

function emptyResult(blockedReason: string): StaticRenderQueueResult {
  return {
    queued: false,
    reusedExistingJob: false,
    jobId: null,
    blockedReason,
    launchReadyCount: 0,
    missingCount: STATIC_LAUNCH_MIN_CREATIVE_COUNT,
  };
}

function billingAllowsRender(row: BillingRow | null, accessAlreadyConfirmed?: boolean) {
  if (accessAlreadyConfirmed === true) {
    return true;
  }

  const entitlements = evaluateCampaignEntitlements({
    row: row
      ? {
          plan_tier: row.plan_tier,
          status: row.status ?? "inactive",
          current_period_end: row.current_period_end,
          cancel_at_period_end: row.cancel_at_period_end ?? false,
        }
      : null,
  });

  return entitlements.canLaunch;
}

function getStaticBriefContext(creativeIntake: NonNullable<ReturnType<typeof getApprovedCreativeIntakeGenerationContext>>) {
  return {
    staticBriefHash: creativeIntake.staticBriefHash,
    offerHash: creativeIntake.offerHash,
    ctaHash: creativeIntake.ctaHash,
    brandHash: creativeIntake.brandHash,
  };
}

function countLaunchReadyStaticAds(
  staticAds: unknown,
  creativeIntake: NonNullable<ReturnType<typeof getApprovedCreativeIntakeGenerationContext>>,
) {
  if (!Array.isArray(staticAds)) {
    return 0;
  }

  const context = getStaticBriefContext(creativeIntake);

  return staticAds.filter((creative) =>
    isLaunchReadyStaticCreative(creative as Parameters<typeof isLaunchReadyStaticCreative>[0], context),
  ).length;
}

function getActiveJobPayload(job: { payload?: Json | null }) {
  return job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
    ? (job.payload as Record<string, unknown>)
    : {};
}

export async function ensureStaticCreativeRenderQueuedForCampaign(
  params: EnsureStaticCreativeRenderQueuedParams,
): Promise<StaticRenderQueueResult> {
  const campaignId = params.campaignId.trim();

  if (!campaignId) {
    return emptyResult("campaign_id_missing");
  }

  const supabase = getQueueClient({ supabase: params.supabase });
  const { data: campaignRowRaw, error: campaignError } = await supabase
    .from("campaign_plans")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError) {
    throw new ApiError(500, campaignError.message, "campaign_fetch_failed");
  }

  const campaignRow = campaignRowRaw as CampaignPlanRow | null;

  if (!campaignRow) {
    return emptyResult("campaign_not_found");
  }

  if (params.userId && campaignRow.user_id !== params.userId) {
    return emptyResult("campaign_user_mismatch");
  }

  if (params.organizationId && campaignRow.organization_id !== params.organizationId) {
    return emptyResult("campaign_organization_mismatch");
  }

  const savedDocument = getSavedCampaignDocumentFromRow(campaignRow);
  const creativeIntake = getApprovedCreativeIntakeGenerationContext(savedDocument);

  if (!creativeIntake) {
    return emptyResult("creative_brief_review_required");
  }

  if (!creativeIntakeIncludesStatic(creativeIntake.generationPhase)) {
    return emptyResult("creative_brief_static_scope_required");
  }

  if (creativeIntake.outputMode !== "finished_ad") {
    return emptyResult("finished_ad_brief_required");
  }

  const { data: billingRaw, error: billingError } = await supabase
    .from("billing_subscriptions")
    .select("*")
    .eq("organization_id", campaignRow.organization_id)
    .maybeSingle();

  if (billingError) {
    throw new ApiError(500, billingError.message, "billing_subscription_fetch_failed");
  }

  if (!billingAllowsRender((billingRaw as BillingRow | null) ?? null, params.accessAlreadyConfirmed)) {
    return emptyResult("billing_or_trial_access_required");
  }

  const launchReadyCount = countLaunchReadyStaticAds(
    (savedDocument as { staticAds?: unknown } | null)?.staticAds,
    creativeIntake,
  );
  const missingCount = Math.max(0, STATIC_LAUNCH_MIN_CREATIVE_COUNT - launchReadyCount);

  if (missingCount === 0) {
    return {
      queued: false,
      reusedExistingJob: false,
      jobId: null,
      blockedReason: "launch_ready_floor_already_met",
      launchReadyCount,
      missingCount,
    };
  }

  const { data: activeJobsRaw, error: activeJobsError } = await supabase
    .from("system_jobs")
    .select("id,payload,status")
    .eq("organization_id", campaignRow.organization_id)
    .eq("user_id", campaignRow.user_id)
    .eq("campaign_id", campaignId)
    .eq("kind", "static_creative_generation")
    .in("status", ["pending", "processing"])
    .is("dead_lettered_at", null)
    .is("reviewed_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (activeJobsError) {
    throw new ApiError(500, activeJobsError.message, "static_render_active_job_lookup_failed");
  }

  const equivalentActiveJob = (Array.isArray(activeJobsRaw) ? activeJobsRaw : []).find((job) => {
    const payload = getActiveJobPayload(job as { payload?: Json | null });
    return hasSameCreativeIntakeGenerationContext(
      payload.creativeIntake as Parameters<typeof hasSameCreativeIntakeGenerationContext>[0],
      creativeIntake,
    );
  }) as { id?: string | null } | undefined;

  if (equivalentActiveJob?.id) {
    return {
      queued: false,
      reusedExistingJob: true,
      jobId: equivalentActiveJob.id,
      blockedReason: null,
      launchReadyCount,
      missingCount,
    };
  }

  const scope = [
    campaignRow.organization_id,
    campaignRow.user_id,
    campaignId,
    creativeIntake.staticBriefHash ?? creativeIntake.briefHash ?? "brief",
    creativeIntake.offerHash ?? "offer",
    creativeIntake.ctaHash ?? "cta",
    creativeIntake.brandHash ?? "brand",
    `window:${Math.floor(Date.now() / (10 * 60_000))}`,
  ].join(":");
  const idempotencyKey = `static_creative_generation:auto_finished_ad:${scope}`;
  const job = await createSystemJob({
    supabase,
    organizationId: campaignRow.organization_id,
    userId: campaignRow.user_id,
    campaignId,
    kind: "static_creative_generation",
    idempotencyKey,
    payload: {
      force: false,
      missingOnly: true,
      maxGenerations: 6,
      targetVariantCount: 6,
      promoteThreshold: STATIC_LAUNCH_MIN_CREATIVE_COUNT,
      outputMode: "finished_ad",
      provider: "higgsfield_marketing_studio",
      queueReason: params.reason,
      creativeIntake,
    },
  });

  const reusedExistingJob = job.idempotency_key === idempotencyKey && job.created_at
    ? Date.now() - Date.parse(job.created_at) > 5_000
    : false;

  logOperationalEvent("static_creative_render_auto_queue", {
    campaignId,
    organizationId: campaignRow.organization_id,
    userId: campaignRow.user_id,
    reason: params.reason,
    jobId: job.id,
    reusedExistingJob,
    launchReadyCount,
    missingCount,
  });

  if (reusedExistingJob) {
    logWarn("static_creative_render_auto_queue_reused_idempotent_job", {
      campaignId,
      jobId: job.id,
      reason: params.reason,
    });
  }

  return {
    queued: !reusedExistingJob,
    reusedExistingJob,
    jobId: job.id,
    blockedReason: null,
    launchReadyCount,
    missingCount,
  };
}
