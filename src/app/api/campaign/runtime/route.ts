import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import {
  archiveCampaignExecution,
  getCampaignRuntimeSnapshot,
  pauseCampaignExecution,
  resumeCampaignExecution,
  setCampaignExperienceStatus,
  updateCampaignExecutionGuardrails,
} from "@/lib/services/campaign-runtime-service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum([
    "refresh",
    "set_experience_status",
    "set_guardrails",
    "pause_campaign",
    "resume_campaign",
    "archive_campaign",
  ]),
  campaignId: z.string().uuid().optional(),
  experienceStatus: z
    .enum(["draft", "built", "paywall", "preview", "connected", "launch_ready"])
    .optional(),
  budgetDailyInput: z.number().optional(),
  launchMode: z.enum(["test", "live"]).optional(),
  safetyState: z.enum(["ready", "blocked"]).optional(),
  message: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");

    if (campaignId) {
      const record = await getCampaignById(campaignId);
      const plan = record ? canonicalCampaignToPlan(record) : null;

      return NextResponse.json({
        live: Boolean(plan),
        campaignId,
        runtime: plan?.runtime ?? null,
        placeholder: !plan,
        message: plan ? null : "Campaign runtime is not live for this campaign yet.",
      });
    }

    const snapshot = await getCampaignRuntimeSnapshot();
    return NextResponse.json({
      live: Boolean(snapshot),
      campaignId: snapshot?.plan.id ?? null,
      runtime: snapshot?.runtime ?? null,
      placeholder: !snapshot,
      message: snapshot ? null : "Campaign runtime is not live yet.",
    });
  } catch (error) {
    return handleApiError(error, "Campaign runtime");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const body = await parseJsonBody(request, bodySchema);
    let result: Awaited<ReturnType<typeof getCampaignRuntimeSnapshot>> | null = null;

    if (body.action !== "refresh" && !body.campaignId) {
      throw new ApiError(
        400,
        "A campaign ID is required for runtime mutations.",
        "campaign_runtime_campaign_required",
      );
    }

    if (body.action === "set_experience_status" && body.experienceStatus) {
      result = await setCampaignExperienceStatus(body.experienceStatus, {
        campaignId: body.campaignId,
        lastAction: body.message,
      });
    } else if (
      body.action === "set_guardrails" &&
      typeof body.budgetDailyInput === "number" &&
      body.launchMode &&
      body.safetyState
    ) {
      result = await updateCampaignExecutionGuardrails({
        campaignId: body.campaignId,
        budgetDailyInput: body.budgetDailyInput,
        launchMode: body.launchMode,
        safetyState: body.safetyState,
        message: body.message ?? "Launch guardrails updated.",
      });
    } else if (body.action === "pause_campaign") {
      result = await pauseCampaignExecution(body.campaignId);
    } else if (body.action === "resume_campaign") {
      result = await resumeCampaignExecution(body.campaignId);
    } else if (body.action === "archive_campaign") {
      result = await archiveCampaignExecution(body.campaignId);
    } else {
      result = await getCampaignRuntimeSnapshot(body.campaignId);
    }

    return NextResponse.json({
      live: Boolean(result),
      campaignId: result?.plan.id ?? null,
      runtime: result?.runtime ?? null,
      placeholder: !result,
      message: result ? null : "Campaign runtime is not live yet.",
    });
  } catch (error) {
    return handleApiError(error, "Campaign runtime");
  }
}
