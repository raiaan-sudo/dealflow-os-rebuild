import { z } from "zod";
import { apiSuccess, ApiError, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { logOperationalEvent, logWarn } from "@/lib/logging";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { getBillingSummary, getBillingSummaryForCampaign } from "@/lib/services/billing-service";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { createFreshdeskTicket } from "@/lib/support/freshdesk";
import {
  buildFreshdeskTicketPayload,
  supportTicketRequestSchema,
  type SupportTicketBuildContext,
} from "@/lib/support/support-ticket";

const SUPPORT_UNAVAILABLE_MESSAGE = "Support is temporarily unavailable. Please try again shortly.";

function normalizeNullableString(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getUserEmail(auth: Awaited<ReturnType<typeof getAuthenticatedContext>>) {
  return normalizeNullableString(auth.context.user.email) ?? normalizeNullableString(auth.context.profile?.email);
}

function getDeploymentContext() {
  return {
    deploymentId:
      normalizeNullableString(process.env.VERCEL_DEPLOYMENT_ID) ??
      normalizeNullableString(process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID),
    commitSha: normalizeNullableString(process.env.VERCEL_GIT_COMMIT_SHA),
    environment: normalizeNullableString(process.env.VERCEL_ENV) ?? normalizeNullableString(process.env.NODE_ENV),
  };
}

async function getAuthorizedCampaignContext(campaignId: string | null | undefined) {
  if (!campaignId) {
    return null;
  }

  const record = await getCampaignById(campaignId);

  if (!record) {
    throw new ApiError(404, "Campaign was not found.", "campaign_not_found");
  }

  return record;
}

async function getSafeBillingContext(campaignId: string | null | undefined) {
  try {
    return campaignId ? await getBillingSummaryForCampaign(campaignId) : await getBillingSummary();
  } catch (error) {
    logWarn("Support ticket billing context unavailable", {
      code: error instanceof ApiError ? error.code : "billing_context_unavailable",
      status: error instanceof ApiError ? error.status : null,
    });
    return null;
  }
}

function buildSupportContext(
  auth: Awaited<ReturnType<typeof getAuthenticatedContext>>,
  body: z.infer<typeof supportTicketRequestSchema>,
  campaign: Awaited<ReturnType<typeof getAuthorizedCampaignContext>>,
  billing: Awaited<ReturnType<typeof getSafeBillingContext>>,
): SupportTicketBuildContext {
  const route = normalizeNullableString(body.context.route) ?? normalizeNullableString(body.context.pathname);

  return {
    category: body.category,
    message: body.message,
    user: {
      userId: auth.userId,
      userEmail: getUserEmail(auth),
      organizationId: auth.organizationId,
      organizationName: normalizeNullableString(auth.context.organization.name),
    },
    campaign: {
      campaignId: campaign?.campaign.id ?? body.campaignId ?? null,
      campaignName: campaign?.campaign.name ?? null,
      campaignSlug: campaign?.publish.slug ?? null,
      campaignStatus: campaign?.launch.runtime.status ?? null,
      publishState: campaign?.publish.state ?? null,
    },
    billing: {
      planTier: billing?.planTier ?? null,
      subscriptionStatus: billing?.subscriptionStatus ?? null,
      billingState: billing?.billingState ?? null,
      launchAllowed: billing?.launchAllowed ?? null,
      launchOverride: billing?.launchOverride ?? null,
      launchOverrideSource: billing?.launchOverrideSource ?? null,
    },
    page: {
      currentUrl: normalizeNullableString(body.context.currentUrl),
      route,
      userAgent: normalizeNullableString(body.context.userAgent),
      dataDplId: normalizeNullableString(body.context.dataDplId),
      clientTimestamp: normalizeNullableString(body.context.timestamp),
      serverTimestamp: new Date().toISOString(),
    },
    deployment: getDeploymentContext(),
  };
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "support-ticket", `${auth.organizationId}:${auth.userId}`),
      limit: 5,
      windowMs: 10 * 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = await parseJsonBody(request, supportTicketRequestSchema);
    const campaign = await getAuthorizedCampaignContext(body.campaignId);
    const billing = await getSafeBillingContext(campaign?.campaign.id ?? body.campaignId);
    const supportContext = buildSupportContext(auth, body, campaign, billing);
    const payload = buildFreshdeskTicketPayload(supportContext);
    const result = await createFreshdeskTicket(payload);

    if (!result.success) {
      logWarn("Support ticket was not created", {
        userId: auth.userId,
        organizationId: auth.organizationId,
        category: body.category,
        campaignId: campaign?.campaign.id ?? body.campaignId ?? null,
        errorCode: result.code,
        status: result.status,
      });
      throw new ApiError(503, SUPPORT_UNAVAILABLE_MESSAGE, "support_unavailable");
    }

    logOperationalEvent("support_ticket_created", {
      userId: auth.userId,
      organizationId: auth.organizationId,
      category: body.category,
      campaignId: campaign?.campaign.id ?? body.campaignId ?? null,
      ticketId: result.ticketId,
      freshdeskStatus: result.status,
    });

    return apiSuccess({
      success: true,
      ticketId: result.ticketId,
    });
  } catch (error) {
    return handleApiError(error, "Support ticket");
  }
}
