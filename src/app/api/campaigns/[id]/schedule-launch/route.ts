import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseRouteParams,
} from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { resolveCampaignDestinationContract } from "@/lib/campaign-destination";
import { getDeploymentTarget } from "@/lib/deployment-target";
import { getPublicAppUrl } from "@/lib/env";
import { getMetaWorkspaceCredentials } from "@/lib/integrations/meta/service";
import { getNextEligibleLaunchAt, LAUNCH_TIME_ZONE } from "@/lib/launch-schedule";
import { assertCampaignCanLaunch } from "@/lib/services/campaign-entitlements";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { preauthorizeMetaCampaignActivation } from "@/lib/services/meta-campaign-activation-authority-service";
import {
  getCampaignPayloadFromPlan,
  getSelectedAdIdFromPlan,
  readCampaignPlanDocument,
} from "@/lib/services/campaign-plan-document";
import { resolveGhlAwareWebsiteDestination } from "@/app/api/campaigns/create/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMetaLaunchInputBinding } from "@/lib/meta-launch-input-snapshot";
import { buildMetaInstantFormDefinition } from "@/lib/services/meta-instant-form-service";
import type { FullCampaignRecord } from "@/lib/types/campaign-records";
import { resolveCreativeContentSha256 } from "@/lib/creative-content-integrity";
import { assertMetaCreativeClaims } from "@/lib/advertising-claim-boundaries";

const paramsSchema = z.object({
  id: z.string().uuid(),
});
const authorizationSchema = z.object({
  approvedDailyBudgetMinor: z.number().int().min(100).max(100_000_000),
  approvedCurrency: z.enum(["USD", "CAD"]),
  reviewDigest: z.string().regex(/^[0-9a-f]{64}$/),
  confirmation: z.literal("SCHEDULE_AND_AUTHORIZE_META_CAMPAIGN_ACTIVATION"),
}).strict();

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeObjective(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "OUTCOME_LEADS" || normalized === "LEAD_GENERATION") return "OUTCOME_LEADS";
  if (["TRAFFIC", "AWARENESS", "ENGAGEMENT"].includes(normalized)) return `OUTCOME_${normalized}`;
  if (["OUTCOME_TRAFFIC", "OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT", "OUTCOME_SALES"].includes(normalized)) {
    return normalized;
  }
  return "OUTCOME_LEADS";
}

function inferCountryCode(location: string) {
  return /\btoronto\b|\bontario\b|\bvancouver\b|\bcalgary\b|\bedmonton\b|\bmontreal\b|\bcanada\b/i.test(location)
    ? "CA"
    : "US";
}

async function buildApprovalSnapshot(params: {
  campaign: FullCampaignRecord;
  organizationId: string;
  payload: Record<string, unknown> | null;
  destinationUrl: string;
  destinationContract: ReturnType<typeof resolveCampaignDestinationContract>;
  providerAdAccountId: string;
  approvedCurrency: string;
  providerPageId: string;
  providerPixelId: string;
  selectedAdId: string;
  approvedDailyBudgetMinor: number;
}) {
  const selectedStaticAd = params.campaign.creatives.staticAds.find(
    (ad) => ad.id === params.selectedAdId,
  );
  if (!selectedStaticAd) {
    throw new ApiError(409, "The selected creative changed before authorization.", "meta_activation_selected_ad_stale");
  }
  if (selectedStaticAd.imageGenerationState !== "generated" || !selectedStaticAd.imageUrl?.trim()) {
    throw new ApiError(
      409,
      "The selected creative is not fully generated and cannot be authorized for launch.",
      "meta_activation_selected_creative_not_ready",
    );
  }
  const selectedCopy = params.campaign.creatives.copy.find(
    (item) => item.headline === selectedStaticAd.headline || item.primary_text === selectedStaticAd.primaryText,
  );
  const creatives = params.payload?.creatives && typeof params.payload.creatives === "object"
    ? params.payload.creatives as Record<string, unknown>
    : null;
  const offer = params.payload?.offer && typeof params.payload.offer === "object"
    ? params.payload.offer as Record<string, unknown>
    : null;
  const targeting = params.payload?.targeting_plan && typeof params.payload.targeting_plan === "object"
    ? params.payload.targeting_plan as Record<string, unknown>
    : null;
  const businessProfile = params.payload?.business_profile && typeof params.payload.business_profile === "object"
    ? params.payload.business_profile as Record<string, unknown>
    : null;
  const metaReady = params.payload?.meta_ready_payload && typeof params.payload.meta_ready_payload === "object"
    ? params.payload.meta_ready_payload as Record<string, unknown>
    : null;
  const firstString = (value: unknown) => Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
  const primaryText = selectedStaticAd.primaryText
    ?? selectedCopy?.primary_text
    ?? firstString(creatives?.primary_text_variations)
    ?? params.campaign.plan.offer_summary
    ?? params.campaign.plan.summary;
  const headline = selectedStaticAd.headline
    ?? selectedCopy?.headline
    ?? firstString(creatives?.headlines)
    ?? (typeof offer?.key_offer === "string" ? offer.key_offer : null)
    ?? params.campaign.plan.offer
    ?? params.campaign.campaign.name;
  assertMetaCreativeClaims({
    primaryText,
    headline,
    overlayText: selectedStaticAd.overlayText,
    body: selectedStaticAd.hook,
    cta: selectedStaticAd.cta,
  });
  const location = (typeof targeting?.market === "string" ? targeting.market : null)
    ?? (typeof businessProfile?.location === "string" ? businessProfile.location : null)
    ?? params.campaign.strategy.location
    ?? params.campaign.plan.market;
  const formDefinitionDigest = params.destinationContract.adDestination === "meta_instant_form"
    ? buildMetaInstantFormDefinition(params.campaign).digest
    : null;

  const imageContentSha256 = await resolveCreativeContentSha256(selectedStaticAd.imageUrl.trim());
  return buildMetaLaunchInputBinding({
    organizationId: params.organizationId,
    campaignId: params.campaign.campaign.id,
    attemptId: sha256(`${params.organizationId}:${params.campaign.campaign.id}`).slice(0, 16),
    adAccountId: params.providerAdAccountId.replace(/^act_/, ""),
    accountCurrency: params.approvedCurrency,
    pageId: params.providerPageId,
    pixelId: params.providerPixelId,
    selectedAdId: params.selectedAdId,
    imageContentSha256,
    primaryText,
    headline,
    destinationUrl: params.destinationUrl,
    objective: normalizeObjective(metaReady?.objective ?? params.campaign.plan.primary_goal),
    countryCode: inferCountryCode(location),
    location,
    dailyBudgetMinor: String(params.approvedDailyBudgetMinor),
    captureExperience: params.destinationContract.captureExperience,
    adDestination: params.destinationContract.adDestination,
    providerFormId: null,
    formDefinitionDigest,
  }).snapshot;
}

async function resolveImmutableApprovalContract(params: {
  campaign: FullCampaignRecord;
  campaignId: string;
  organizationId: string;
  userId: string;
  publicSlug: string;
  providerAdAccountId: string;
  providerPageId: string;
  providerPixelId: string;
  approvedCurrency: string;
  approvedDailyBudgetMinor: number;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Launch authority is unavailable.", "meta_activation_authority_unavailable");
  }
  const { data, error } = await admin
    .from("campaign_plans")
    .select("plan")
    .eq("id", params.campaignId)
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error || !data) {
    throw new ApiError(409, error?.message ?? "The exact campaign plan is unavailable.", "meta_activation_plan_unavailable");
  }
  const document = readCampaignPlanDocument((data as { plan?: unknown }).plan);
  const payload = getCampaignPayloadFromPlan(document) as Record<string, unknown> | null;
  const selectedAdId = getSelectedAdIdFromPlan(document);
  if (!selectedAdId || !/^[A-Za-z0-9._:-]{1,200}$/.test(selectedAdId)) {
    throw new ApiError(409, "Select one exact creative before authorizing launch.", "meta_activation_selected_ad_missing");
  }
  const destinationContract = resolveCampaignDestinationContract({
    plan: document,
    campaign_payload: payload,
  });
  const fallbackDestinationUrl = typeof payload?.destination_url === "string"
    ? payload.destination_url.trim()
    : "";
  const expectedFallback = `${getPublicAppUrl()}/f/${params.publicSlug}`;
  if (!fallbackDestinationUrl || fallbackDestinationUrl !== expectedFallback) {
    throw new ApiError(409, "The published destination changed before authorization.", "meta_activation_destination_stale");
  }
  let destinationUrl = fallbackDestinationUrl;
  if (destinationContract.adDestination === "website") {
    const target = getDeploymentTarget();
    const environment = target === "production"
      ? "production" as const
      : ["staging", "preview", "test", "development"].includes(target)
        ? "sandbox" as const
        : null;
    if (!environment) {
      throw new ApiError(503, "GHL destination authority is unavailable.", "ghl_destination_authority_unavailable");
    }
    destinationUrl = await resolveGhlAwareWebsiteDestination({
      client: admin as any,
      organizationId: params.organizationId,
      campaignId: params.campaignId,
      environment,
      legacyDestinationUrl: fallbackDestinationUrl,
    });
  }
  const launchApprovalSnapshot = await buildApprovalSnapshot({
    campaign: params.campaign,
    organizationId: params.organizationId,
    payload,
    destinationUrl,
    destinationContract,
    providerAdAccountId: params.providerAdAccountId,
    approvedCurrency: params.approvedCurrency,
    providerPageId: params.providerPageId,
    providerPixelId: params.providerPixelId,
    selectedAdId,
    approvedDailyBudgetMinor: params.approvedDailyBudgetMinor,
  });
  return {
    providerAdAccountId: params.providerAdAccountId.replace(/^act_/, ""),
    providerPageId: params.providerPageId,
    providerPixelId: params.providerPixelId,
    selectedAdId,
    adDestination: destinationContract.adDestination,
    destinationUrlDigest: sha256(destinationUrl),
    launchApprovalSnapshot,
  };
}

async function resolveCurrentAuthorizationReview(
  id: string,
  record: FullCampaignRecord,
  now = new Date(),
) {
  if (!record.publish.slug) {
    throw new ApiError(
      409,
      "Publish the campaign funnel before scheduling Meta launch.",
      "campaign_funnel_not_published",
    );
  }
  const credentials = await getMetaWorkspaceCredentials();
  const approvedDailyBudgetMinor = record.plan.daily_budget_cents;
  const approvedCurrency = credentials.currency.trim().toUpperCase();
  if (
    !Number.isSafeInteger(approvedDailyBudgetMinor) ||
    approvedDailyBudgetMinor < 100 ||
    !/^(USD|CAD)$/.test(approvedCurrency)
  ) {
    throw new ApiError(
      409,
      "The saved budget or selected Meta account currency is not eligible for launch.",
      "meta_activation_approval_unavailable",
    );
  }
  const scheduledFor = getNextEligibleLaunchAt(now, LAUNCH_TIME_ZONE);
  const immutableApproval = await resolveImmutableApprovalContract({
    campaign: record,
    campaignId: id,
    organizationId: record.campaign.organization_id ?? credentials.workspaceId,
    userId: record.campaign.user_id,
    publicSlug: record.publish.slug,
    providerAdAccountId: credentials.adAccountId,
    providerPageId: credentials.pageId,
    providerPixelId: credentials.pixelId,
    approvedCurrency,
    approvedDailyBudgetMinor,
  });
  const reviewPayload = {
    version: 1,
    confirmation: "SCHEDULE_AND_AUTHORIZE_META_CAMPAIGN_ACTIVATION",
    campaignId: id,
    scheduledFor: scheduledFor.toISOString(),
    approvedDailyBudgetMinor,
    approvedCurrency,
    ...immutableApproval,
  };
  return {
    scheduledFor,
    approvedDailyBudgetMinor,
    approvedCurrency,
    immutableApproval,
    customerApprovalDigest: sha256(JSON.stringify(reviewPayload)),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    assertSameOriginRequest(request);
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const record = await getCampaignById(id);
    if (!record) {
      throw new ApiError(404, "Campaign not found.", "campaign_not_found");
    }
    await assertCampaignCanLaunch(id);
    const review = await resolveCurrentAuthorizationReview(id, record);
    const snapshot = review.immutableApproval.launchApprovalSnapshot;
    const selectedCreative = record.creatives.staticAds.find(
      (creative) => creative.id === review.immutableApproval.selectedAdId,
    );
    return apiSuccess({
      campaignId: id,
      campaignName: record.campaign.name,
      reviewDigest: review.customerApprovalDigest,
      scheduledFor: review.scheduledFor.toISOString(),
      timeZone: LAUNCH_TIME_ZONE,
      approvedDailyBudgetMinor: review.approvedDailyBudgetMinor,
      approvedCurrency: review.approvedCurrency,
      provider: snapshot.provider,
      creative: {
        selectedAdId: review.immutableApproval.selectedAdId,
        headline: selectedCreative?.headline ?? record.campaign.name,
        imageContentSha256: snapshot.creative.image_content_sha256,
      },
      destination: {
        type: snapshot.destination.ad_destination,
        url: snapshot.destination_url,
        host: snapshot.destination_host,
        formDefinitionDigest: snapshot.destination.form_definition_digest,
      },
      delivery: snapshot.delivery,
      providerMutationPerformed: false,
    });
  } catch (error) {
    return handleApiError(error, "Review campaign launch authorization");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string>> | Record<string, string> },
) {
  try {
    assertSameOriginRequest(request);
    const { id } = await parseRouteParams(context.params, paramsSchema);
    const authorizationRequest = authorizationSchema.parse(await request.json());
    const record = await getCampaignById(id);

    if (!record) {
      throw new ApiError(404, "Campaign not found.", "campaign_not_found");
    }
    await assertCampaignCanLaunch(id);

    // This reads tenant-scoped prerequisites only. It does not call Meta or
    // perform a provider mutation.
    const review = await resolveCurrentAuthorizationReview(id, record);
    const {
      approvedDailyBudgetMinor,
      approvedCurrency,
      scheduledFor,
      immutableApproval,
      customerApprovalDigest,
    } = review;
    if (
      authorizationRequest.approvedDailyBudgetMinor !== approvedDailyBudgetMinor ||
      authorizationRequest.approvedCurrency !== approvedCurrency ||
      authorizationRequest.reviewDigest !== customerApprovalDigest
    ) {
      throw new ApiError(
        409,
        "The launch approval no longer matches the exact saved budget or selected Meta account currency. Review the launch page again.",
        "meta_activation_approval_stale",
      );
    }

    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "meta-launch-schedule", id),
      limit: 6,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const activationAuthorization = await preauthorizeMetaCampaignActivation({
      campaignId: id,
      campaignName: record.campaign.name,
      scheduledFor: scheduledFor.toISOString(),
      timeZone: LAUNCH_TIME_ZONE,
      approvedDailyBudgetMinor,
      approvedCurrency,
      ...immutableApproval,
      customerApprovalDigest,
      idempotencyKey: `meta_activation:${id}:${Math.floor(scheduledFor.getTime() / 1000)}`,
    });

    return apiSuccess({
      campaignId: id,
      scheduleId: activationAuthorization.launchRecordId,
      status: "scheduled",
      scheduledFor: activationAuthorization.scheduledFor,
      timeZone: LAUNCH_TIME_ZONE,
      activationAuthorization: {
        authorizationId: activationAuthorization.authorizationId,
        status: activationAuthorization.status,
        approvedDailyBudgetMinor: activationAuthorization.approvedDailyBudgetMinor,
        approvedCurrency: activationAuthorization.approvedCurrency,
      },
      providerMutationPerformed: false,
    });
  } catch (error) {
    return handleApiError(error, "Schedule campaign launch");
  }
}
