import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import {
  mergeCampaignPlanDocument,
  readCampaignPlanDocument,
} from "@/lib/services/campaign-plan-document";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { persistCampaignPlanDocumentUpdate } from "@/lib/services/campaign-plan-persistence-service";
import type { CampaignAd } from "@/lib/services/campaign-plan-service";
import { persistCampaignPlan } from "@/lib/services/campaign-plan-service";
import { buildCreativeSystem } from "@/lib/services/creative-engine";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import {
  CREATIVE_CHAT_INTAKE_PLAN_KEY,
  isCreativeChatIntakeEnabled,
  isCreativeIntakeApproved,
  readCreativeChatIntakeFromPlan,
} from "@/lib/services/creative-chat-intake-service";
import { runTrackedSystemJob } from "@/lib/services/system-job-service";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getRateLimitKey,
} from "@/lib/api/rate-limit";

const requestSchema = z.object({
  campaignId: z.string().min(1),
});

function mapStaticAdToCampaignAd(ad: {
  id: string;
  angle: "guarantee" | "urgency" | "contrarian" | "opportunity" | "authority";
  overlayText: string;
  headline: string;
  primaryText: string;
  cta: string;
  imageUrl: string;
}): CampaignAd {
  return {
    variant: ad.angle,
    angle:
      ad.angle === "authority"
        ? "authority"
        : ad.angle === "contrarian"
          ? "pain"
          : ad.angle === "urgency"
            ? "urgency"
            : "approval",
    sourcePatternId: ad.id,
    overlayText: ad.overlayText,
    headline: ad.headline,
    body: ad.primaryText,
    cta: ad.cta,
    image: ad.imageUrl,
  };
}

async function persistSupplementalCreativeFields(params: {
  campaignId: string;
  strategy: Record<string, unknown>;
  items: unknown[];
  copy: unknown[];
  preservedCreativeIntake?: unknown;
}) {
  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", params.campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data as { plan?: unknown } | null) ?? null;

  const currentPlan = readCampaignPlanDocument(row?.plan);

  await persistCampaignPlanDocumentUpdate({
    supabase,
    campaignId: params.campaignId,
    plan: mergeCampaignPlanDocument(currentPlan, {
      strategy: params.strategy,
      items: params.items,
      copy: params.copy,
      ...(params.preservedCreativeIntake
        ? { [CREATIVE_CHAT_INTAKE_PLAN_KEY]: params.preservedCreativeIntake }
        : {}),
    }),
    source: "generate_creatives_metadata",
  });
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const { campaignId } = await parseJsonBody(request, requestSchema);
    const auth = await getAuthenticatedContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "generate-creatives", `${auth.organizationId}:${auth.userId}:${campaignId}`),
      limit: 10,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const requestId = crypto.randomUUID();
    const { output, jobId, correlationId } = await runTrackedSystemJob({
      organizationId: auth.organizationId,
      userId: auth.userId,
      campaignId,
      kind: "creative_generation",
      requestId,
      maxRetries: 1,
      payload: {
        source: "api.generate-creatives",
      },
      operation: async () => {
        const record = await getCampaignById(campaignId);

        if (!record) {
          throw new ApiError(404, "Campaign plan was not found.", "campaign_plan_not_found");
        }

        const plan = canonicalCampaignToPlan(record);
        const { data: intakeRowData } = isCreativeChatIntakeEnabled()
          ? await auth.supabase
              .from("campaign_plans")
              .select("plan")
              .eq("id", campaignId)
              .maybeSingle()
          : { data: null };
        const intakeRow = intakeRowData as { plan?: unknown } | null;
        const existingPlanDocument = readCampaignPlanDocument(intakeRow?.plan);
        const intake = readCreativeChatIntakeFromPlan(intakeRow?.plan);
        const approvedIntake = isCreativeIntakeApproved(intakeRow?.plan)
          ? intake
          : null;
        const approvedBrief = approvedIntake?.brief ?? null;
        // Onboarding must not trigger paid image/video generation. This endpoint
        // builds launch-review copy and creative drafts only; paid asset
        // generation stays behind explicit asset-generation routes with guards.
        const creativePackage = buildCreativeSystem({
          location: approvedBrief?.market || plan.market,
          audience: approvedBrief?.targetAudience || plan.audience,
          offer: approvedBrief?.offer || plan.offerSummary || plan.keyOffer,
          property_type: approvedBrief?.propertyType || plan.propertyType,
          mechanism: plan.mechanism,
          desired_result: plan.primaryGoal,
          pain_points: plan.painPoints,
          market_type: plan.intent,
          creative_strategy: plan.creativeStrategy,
          language_code: plan.languageCode,
        });

        const savedPlan = await persistCampaignPlan({
          ...plan,
          creativeBrief: creativePackage.brief,
          creatives: {
            staticAds: creativePackage.staticAds,
            videoAds: creativePackage.videoAds,
          },
          ads: creativePackage.staticAds.map(mapStaticAdToCampaignAd),
        });

        const strategy = {
          location: plan.market,
          audience: plan.audience,
          offer: plan.offerSummary || plan.keyOffer,
          price_point: undefined,
          market_type: plan.intent,
          funnel_goal: plan.funnelType === "landing_page_book_call"
            ? "book_call"
            : plan.funnelType === "landing_page_form"
              ? "lead_form"
              : "survey",
        };

        const copy = creativePackage.staticAds.map((ad) => ({
          hook: ad.hook,
          primary_text: ad.primaryText,
          script: "",
          headline: ad.headline,
          cta: ad.cta,
        }));

        await persistSupplementalCreativeFields({
          campaignId: savedPlan.id,
          strategy,
          items: creativePackage.items,
          copy,
          preservedCreativeIntake: existingPlanDocument[CREATIVE_CHAT_INTAKE_PLAN_KEY],
        });

        return {
          savedPlan,
          creativePackage,
        };
      },
      summarizeResult: ({ savedPlan, creativePackage }) =>
        ({
          campaignId: savedPlan.id,
          staticAds: creativePackage.staticAds.length,
          videoAds: creativePackage.videoAds.length,
        }) as never,
    });

    return apiSuccess({
      campaign_id: output.savedPlan.id,
      primary_text_variations: output.creativePackage.staticAds.map((ad) => ad.primaryText),
      headlines: output.creativePackage.staticAds.map((ad) => ad.headline),
      creative_concepts: [
        ...output.creativePackage.staticAds.map((ad) => ad.visualConcept),
        ...output.creativePackage.videoAds.map((ad) => ad.title),
      ],
      ai_ugc_scripts: output.creativePackage.videoAds.map((ad) => ({
        id: ad.id,
        title: ad.title,
        script: ad.script,
        shot_list: ad.shotList,
      })),
      job: {
        id: jobId,
        correlationId,
      },
    });
  } catch (error) {
    return handleApiError(error, "Generate creatives");
  }
}
