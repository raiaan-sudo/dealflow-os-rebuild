import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  assertSameOriginRequest,
  handleApiError,
  parseOptionalJsonBody,
  parseRouteParams,
} from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { launchCampaignToMeta } from "@/app/api/campaigns/create/route";
import { assertMetaLaunchBillingAccess } from "@/lib/services/billing-service";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

const paramsSchema = z.object({
  id: z.string().min(1),
});

const retryBodySchema = z.object({
  meta_campaign_id: z.string().min(1).optional(),
  meta_adset_id: z.string().min(1).optional(),
  meta_creative_id: z.string().min(1).optional(),
  test_mode_interrupt_after: z.enum(["campaign", "ad_set", "creative"]).optional(),
});

type PersistedLaunchState = {
  campaign_id?: string | null;
  adset_id?: string | null;
  creative_id?: string | null;
  ad_id?: string | null;
  current_stage?: "campaign" | "adset" | "creative" | "ad" | null;
  status?: "in_progress" | "failed" | "completed" | null;
};

type LaunchResponsePayload = {
  campaign_id: string;
  adset_id: string;
  creative_id?: string;
  ad_id: string;
  already_launched?: boolean;
  stage?: "campaign" | "ad_set" | "creative" | "ad";
  error?: string;
};

const inFlightLaunches = new Map<string, Promise<LaunchResponsePayload>>();
const META_LAUNCH_LOCK_MS = 15 * 60_000;

function normalizeStage(
  stage: PersistedLaunchState["current_stage"] | LaunchResponsePayload["stage"] | undefined | null,
): LaunchResponsePayload["stage"] {
  if (stage === "adset") {
    return "ad_set";
  }

  return stage ?? "campaign";
}

async function loadPersistedLaunchState(campaignId: string): Promise<PersistedLaunchState | null> {
  const supabase = createAdminClient() ?? (await createRouteHandlerClient());

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data as { plan?: unknown } | null) ?? null;
  const plan =
    row?.plan && typeof row.plan === "object" && !Array.isArray(row.plan)
      ? (row.plan as Record<string, unknown>)
      : null;
  const launchRuntime =
    plan?.launch_runtime &&
    typeof plan.launch_runtime === "object" &&
    !Array.isArray(plan.launch_runtime)
      ? (plan.launch_runtime as PersistedLaunchState)
      : null;

  return launchRuntime;
}

async function acquireMetaLaunchLock(campaignId: string) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Supabase service role is required for durable Meta launch locking.");
  }

  const token = crypto.randomUUID();
  const lockedUntil = new Date(Date.now() + META_LAUNCH_LOCK_MS).toISOString();

  const inserted = await supabase
    .from("meta_launch_locks")
    .insert({
      campaign_id: campaignId,
      lock_token: token,
      locked_by: "campaign_launch_route",
      locked_until: lockedUntil,
    } as never)
    .select("*")
    .maybeSingle();

  if (!inserted.error && inserted.data) {
    return token;
  }

  const { data: existingRaw, error: existingError } = await supabase
    .from("meta_launch_locks")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const existing = existingRaw as { locked_until?: string | null } | null;
  const existingExpiry = existing?.locked_until ? new Date(existing.locked_until).getTime() : 0;

  if (existing && existingExpiry > Date.now()) {
    throw new ApiError(
      409,
      "A launch is already running for this campaign.",
      "meta_launch_lock_active",
    );
  }

  const { data: updatedRaw, error: updateError } = await supabase
    .from("meta_launch_locks")
    .update({
      lock_token: token,
      locked_by: "campaign_launch_route",
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("campaign_id", campaignId)
    .lte("locked_until", new Date().toISOString())
    .select("*")
    .maybeSingle();

  if (updateError || !updatedRaw) {
    throw new ApiError(
      409,
      "A launch is already running for this campaign.",
      "meta_launch_lock_active",
    );
  }

  return token;
}

async function releaseMetaLaunchLock(campaignId: string, token: string) {
  const supabase = createAdminClient();

  if (!supabase) {
    return;
  }

  await supabase
    .from("meta_launch_locks")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("lock_token", token);
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    assertSameOriginRequest(request);
    await assertMetaLaunchBillingAccess();
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "meta-launch", id),
      limit: 6,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const retryBody = await parseOptionalJsonBody(request, retryBodySchema, {});

    if (
      retryBody.test_mode_interrupt_after &&
      process.env.ALLOW_META_LAUNCH_INTERRUPTION_TESTS !== "true"
    ) {
      throw new ApiError(
        403,
        "Meta launch interruption testing is not enabled in this environment.",
        "meta_launch_interruption_disabled",
      );
    }
    const existingLaunch = inFlightLaunches.get(id);

    if (existingLaunch) {
      return NextResponse.json(await existingLaunch);
    }

    const record = await getCampaignById(id);
    const persistedLaunchState = await loadPersistedLaunchState(id);

    const existingCampaignId =
      persistedLaunchState?.campaign_id ?? record?.launch.runtime.campaignId ?? null;
    const existingAdSetId =
      persistedLaunchState?.adset_id ??
      record?.launch.runtime.adSetId ??
      record?.launch.runtime.metaAdSetIds?.[0] ??
      null;
    const existingCreativeId = persistedLaunchState?.creative_id ?? null;
    const existingAdId =
      persistedLaunchState?.ad_id ?? record?.launch.runtime.adId ?? record?.launch.runtime.metaAdIds?.[0] ?? null;

    if (
      persistedLaunchState?.status === "completed" &&
      existingCampaignId &&
      existingAdSetId &&
      existingAdId
    ) {
      return NextResponse.json({
        campaign_id: existingCampaignId,
        adset_id: existingAdSetId,
        creative_id: existingCreativeId ?? undefined,
        ad_id: existingAdId,
        already_launched: true,
      });
    }

    const launchLockToken = await acquireMetaLaunchLock(id);

    const resumeState = {
      metaCampaignId:
        persistedLaunchState?.campaign_id ?? retryBody.meta_campaign_id ?? null,
      metaAdSetId:
        persistedLaunchState?.adset_id ?? retryBody.meta_adset_id ?? null,
      metaCreativeId:
        persistedLaunchState?.creative_id ?? retryBody.meta_creative_id ?? null,
    };

    const launchPromise = (async () => {
      const response = await launchCampaignToMeta(id, resumeState, {
        testModeInterruptAfter:
          retryBody.test_mode_interrupt_after === "ad_set"
            ? "adset"
            : retryBody.test_mode_interrupt_after ?? null,
      });
      const data = (await response.json().catch(() => null)) as
        | (Partial<LaunchResponsePayload> & {
            campaign?: unknown;
            adset?: unknown;
            creative?: unknown;
            ad?: unknown;
          })
        | null;

      if (!response.ok || !data) {
        const inferredStage = normalizeStage(
          data?.stage ??
            persistedLaunchState?.current_stage ??
          (data?.campaign_id && data?.adset_id && data?.creative_id
            ? "ad"
            : data?.campaign_id && data?.adset_id
              ? "creative"
            : data?.campaign_id
                ? "ad_set"
                : "campaign"),
        );
        const launchError = new Error(data?.error || "Launch failed.") as Error & {
          stage?: LaunchResponsePayload["stage"];
          payload?: Partial<LaunchResponsePayload>;
        };
        launchError.stage = inferredStage;
        launchError.payload = {
          campaign_id: typeof data?.campaign_id === "string" ? data.campaign_id : undefined,
          adset_id: typeof data?.adset_id === "string" ? data.adset_id : undefined,
          creative_id: typeof data?.creative_id === "string" ? data.creative_id : undefined,
          ad_id: typeof data?.ad_id === "string" ? data.ad_id : undefined,
          error: typeof data?.error === "string" ? data.error : "Launch failed.",
          stage: inferredStage,
        };
        throw launchError;
      }

      if (!("campaign_id" in data) || !("adset_id" in data) || !("ad_id" in data)) {
        const launchError = new Error("Launch failed.") as Error & {
          stage?: LaunchResponsePayload["stage"];
          payload?: Partial<LaunchResponsePayload>;
        };
        launchError.stage = normalizeStage(persistedLaunchState?.current_stage ?? "campaign");
        launchError.payload = {
          error: "Launch failed.",
          stage: normalizeStage(persistedLaunchState?.current_stage ?? "campaign"),
        };
        throw launchError;
      }

      return {
        campaign_id: String(data.campaign_id),
        adset_id: String(data.adset_id),
        ad_id: String(data.ad_id),
        creative_id: typeof data.creative_id === "string" ? data.creative_id : undefined,
        stage: "ad" as const,
      };
    })();

    inFlightLaunches.set(id, launchPromise);

    try {
      return NextResponse.json(await launchPromise);
    } finally {
      inFlightLaunches.delete(id);
      await releaseMetaLaunchLock(id, launchLockToken).catch(() => undefined);
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "payload" in error &&
      error.payload &&
      typeof error.payload === "object"
    ) {
      return NextResponse.json(error.payload, { status: 500 });
    }

    return handleApiError(error, "Launch campaign");
  }
}
