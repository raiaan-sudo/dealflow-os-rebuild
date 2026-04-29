import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { getPublicAppUrl } from "@/lib/env";
import {
  getCampaignPayloadFromPlan,
  readCampaignPlanDocument,
  withCampaignPayload,
} from "@/lib/services/campaign-plan-document";
import { persistCampaignPlanDocumentUpdate } from "@/lib/services/campaign-plan-persistence-service";
import { getCampaignById, updateCampaignPublishState } from "@/lib/services/campaign-persistence";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { runTrackedSystemJob } from "@/lib/services/system-job-service";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getRateLimitKey,
} from "@/lib/api/rate-limit";

const requestSchema = z.object({
  campaignId: z.string().min(1),
});

type CampaignPayloadRecord = {
  selected_ad_id?: string;
  campaign_id?: string;
  destination_url?: string;
  business_profile?: Record<string, unknown>;
  offer?: Record<string, unknown>;
  funnel?: Record<string, unknown>;
  creatives?: Record<string, unknown>;
  targeting_plan?: Record<string, unknown>;
  budget_plan?: Record<string, unknown>;
  meta_ready_payload?: Record<string, unknown>;
};

function isRealEstateCampaign(params: {
  businessName?: string | null;
  clientName?: string | null;
  audience?: string | null;
  keyOffer?: string | null;
  intent?: string | null;
}) {
  const combined = [
    params.businessName,
    params.clientName,
    params.audience,
    params.keyOffer,
    params.intent,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /real estate|realtor|broker|brokerage|realty|house hunting|home ownership|mortgage/.test(
    combined,
  );
}

async function loadStoredPlan(campaignId: string): Promise<Record<string, unknown>> {
  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
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

  return readCampaignPlanDocument(row?.plan);
}

async function persistCampaignPayload(params: {
  campaignId: string;
  userId: string;
  payload: CampaignPayloadRecord;
}) {
  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  const currentPlan = await loadStoredPlan(params.campaignId);
  const nextPlan = withCampaignPayload(currentPlan, params.payload as unknown as Record<string, unknown>);

  await persistCampaignPlanDocumentUpdate({
    supabase,
    campaignId: params.campaignId,
    userId: params.userId,
    plan: nextPlan,
    source: "build_campaign_payload",
  });
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const { campaignId } = await parseJsonBody(request, requestSchema);
    const auth = await getAuthenticatedContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "build-campaign", `${auth.organizationId}:${auth.userId}:${campaignId}`),
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
      kind: "campaign_build",
      requestId,
      payload: {
        childJobIds: [],
        videoIndexes: [],
      },
      operation: async () => {
        const record = await getCampaignById(campaignId);

        if (!record) {
          throw new ApiError(404, "Campaign plan was not found.", "campaign_plan_not_found");
        }

        const storedPlan = await loadStoredPlan(campaignId);
        const existingPayload = getCampaignPayloadFromPlan(storedPlan) as CampaignPayloadRecord | null;

        const missingArtifacts: string[] = [];

        const hasCampaignPlan = Boolean(record.plan.business_name || record.campaign.name);
        const hasFunnel = Boolean(record.funnel?.headline || record.funnel?.sections?.length);
        const hasCreatives = Boolean(record.creatives.staticAds.length && record.creatives.copy.length);
        const hasTargeting = Boolean(record.plan.audience || record.strategy.audience || record.plan.targeting_summary);
        const hasBudget = Number(record.plan.monthly_budget ?? 0) > 0;

        if (!hasCampaignPlan) {
          missingArtifacts.push("campaign plan");
        }
        if (!hasFunnel) {
          missingArtifacts.push("funnel");
        }
        if (!hasCreatives) {
          missingArtifacts.push("creatives");
        }
        if (!hasTargeting) {
          missingArtifacts.push("targeting");
        }
        if (!hasBudget) {
          missingArtifacts.push("budget");
        }

        if (missingArtifacts.length > 0) {
          throw new ApiError(
            400,
            `Missing required artifacts: ${missingArtifacts.join(", ")}`,
            "campaign_artifacts_missing",
          );
        }

        const publishRecord = (
          await updateCampaignPublishState({
            campaignId,
            state: "published",
          })
        ).publish;

        const destinationUrl = publishRecord.slug
          ? `${getPublicAppUrl()}/f/${publishRecord.slug}`
          : null;

        if (!destinationUrl) {
          throw new ApiError(
            500,
            "Public funnel URL could not be created for this campaign.",
            "publish_destination_missing",
          );
        }

        const campaignPayload: CampaignPayloadRecord = {
          campaign_id: campaignId,
          selected_ad_id: existingPayload?.selected_ad_id,
          destination_url: destinationUrl,
          business_profile: {
            business_name: record.plan.business_name,
            client_name: record.plan.client_name,
            business_type: record.plan.primary_goal,
            location: record.plan.market,
            service: record.plan.offer,
          },
          offer: {
            summary: record.plan.offer_summary,
            key_offer: record.plan.offer,
            mechanism: record.plan.mechanism,
          },
          funnel: {
            funnel_type: record.funnel?.funnel_type ?? record.plan.funnel_type,
            pages: record.funnel?.sections ?? [],
            headlines: [record.funnel?.headline, record.funnel?.subheadline].filter(Boolean),
            cta: record.funnel?.cta ?? null,
            form_fields: record.funnel?.form_fields ?? [],
          },
          creatives: {
            primary_text_variations: record.creatives.staticAds.map((ad) => ad.primaryText),
            headlines: record.creatives.staticAds.map((ad) => ad.headline),
            creative_concepts: [
              ...record.creatives.staticAds.map((ad) => ad.visualConcept),
              ...record.creatives.videoAds.map((ad) => ad.title),
            ],
            ai_ugc_scripts: record.creatives.videoAds.map((ad) => ({
              id: ad.id,
              title: ad.title,
              script: ad.script,
              shot_list: ad.shotList,
            })),
          },
          targeting_plan: {
            summary: record.plan.targeting_summary,
            audience: record.plan.audience,
            market: record.plan.market,
            intent: record.plan.primary_goal,
            interests: isRealEstateCampaign({
              businessName: record.plan.business_name,
              clientName: record.plan.client_name,
              audience: record.plan.audience,
              keyOffer: record.plan.offer,
              intent: record.plan.primary_goal,
            })
              ? ["real estate", "house hunting", "home ownership", "mortgage loans"]
              : [],
            geo_radius_miles: isRealEstateCampaign({
              businessName: record.plan.business_name,
              clientName: record.plan.client_name,
              audience: record.plan.audience,
              keyOffer: record.plan.offer,
              intent: record.plan.primary_goal,
            })
              ? 15
              : null,
          },
          budget_plan: {
            monthly_budget: record.plan.monthly_budget,
            estimated_daily_budget: Math.max(1, Math.round((record.plan.monthly_budget ?? 0) / 30)),
          },
          meta_ready_payload: {
            objective: "LEAD_GENERATION",
            status: "PAUSED",
            campaign_name: `${record.plan.business_name} Lead Generation`,
          },
        };

        await persistCampaignPayload({
          campaignId,
          userId: auth.userId,
          payload: campaignPayload,
        });

        return campaignPayload;
      },
      summarizeResult: (campaignPayload) =>
        ({
          campaignId,
          hasDestinationUrl: Boolean(campaignPayload.destination_url),
          hasSelectedAd: Boolean(campaignPayload.selected_ad_id),
        }) as never,
    });

    return apiSuccess({
      ...output,
      job: {
        id: jobId,
        correlationId,
      },
    });
  } catch (error) {
    return handleApiError(error, "Build campaign");
  }
}
