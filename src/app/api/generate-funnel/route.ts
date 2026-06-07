import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { persistCampaignPlan } from "@/lib/services/campaign-plan-service";
import { generateFunnel } from "@/lib/services/funnel-engine";
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

function deriveFunnelGoal(funnelType?: string | null): "lead_form" | "survey" | "book_call" {
  if (funnelType === "landing_page_book_call") {
    return "book_call";
  }

  if (funnelType === "landing_page_form") {
    return "lead_form";
  }

  return "survey";
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const { campaignId } = await parseJsonBody(request, requestSchema);
    const auth = await getAuthenticatedContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "generate-funnel", `${auth.organizationId}:${auth.userId}:${campaignId}`),
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
      kind: "funnel_generation",
      requestId,
      payload: {
        source: "api.generate-funnel",
      },
      operation: async () => {
        const record = await getCampaignById(campaignId);

        if (!record) {
          throw new ApiError(404, "Campaign plan was not found.", "campaign_plan_not_found");
        }

        const plan = canonicalCampaignToPlan(record);
        const funnel = generateFunnel({
          location: plan.market,
          audience: plan.audience,
          offer: plan.offerSummary || plan.keyOffer,
          key_offer: plan.keyOffer,
          headline: plan.funnel?.headline,
          subheadline: plan.funnel?.subheadline,
          mechanism: plan.mechanism,
          pain_points: plan.painPoints,
          market_type: plan.intent,
          funnel_goal: deriveFunnelGoal(plan.funnelType),
          language_code: plan.languageCode,
        });

        const savedPlan = await persistCampaignPlan({
          ...plan,
          funnelType: funnel.funnel_type,
          funnel: {
            funnelType: funnel.funnel_type,
            headline: funnel.headline,
            subheadline: funnel.subheadline,
            cta: funnel.cta,
            sections: funnel.sections,
            formFields: funnel.form_fields,
            followUpAction: funnel.follow_up_action,
            optimizationNotes: funnel.optimization_notes,
          },
        });

        return {
          savedPlan,
          funnel,
        };
      },
      summarizeResult: ({ savedPlan, funnel }) =>
        ({
          campaignId: savedPlan.id,
          generatedSections: funnel.sections.length,
        }) as never,
    });

    return apiSuccess({
      campaign_id: output.savedPlan.id,
      funnel_pages: output.funnel.sections,
      headlines: [output.funnel.headline, output.funnel.subheadline].filter(Boolean),
      cta: output.funnel.cta,
      job: {
        id: jobId,
        correlationId,
      },
    });
  } catch (error) {
    return handleApiError(error, "Generate funnel");
  }
}
