import { NextResponse } from "next/server";
import { ApiError, assertSameOriginRequest, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { createMetaFailureResponse } from "@/lib/integrations/meta/error-mapper";
import {
  getMetaConnectionState,
  getMetaConnectionStateForOrganization,
  selectMetaAdAccount,
  updateMetaLaunchSelections,
} from "@/lib/integrations/meta/service";
import { recordActivationEvent } from "@/lib/services/activation-telemetry-service";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { getCampaignById } from "@/lib/services/campaign-persistence";

type SelectionBody = {
  campaignId?: string;
  externalAccountId?: string;
  pageId?: string;
  pixelId?: string;
};

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "meta-selections", `${auth.organizationId}:${auth.userId}`),
      limit: 20,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = (await parseOptionalJsonBody(request, { parse: (input) => input }, null)) as SelectionBody | null;
    const campaignId = body?.campaignId?.trim() ?? "";
    const externalAccountId = body?.externalAccountId?.trim() ?? "";
    const pageId = body?.pageId?.trim() ?? "";
    const pixelId = body?.pixelId?.trim() ?? "";

    if (!externalAccountId) {
      return NextResponse.json(
        { error: "A Meta ad account selection is required." },
        { status: 400 },
      );
    }

    let targetOrganizationId = auth.organizationId;
    if (campaignId) {
      const record = await getCampaignById(campaignId);

      if (!record) {
        throw new ApiError(404, "Campaign not found.", "campaign_not_found");
      }

      targetOrganizationId = record.campaign.organization_id ?? auth.organizationId;
    }

    let connection =
      pageId && pixelId
        ? await updateMetaLaunchSelections({
            externalAccountId,
            organizationId: targetOrganizationId,
            pageId,
            pixelId,
          })
        : await selectMetaAdAccount(externalAccountId, {
            organizationId: targetOrganizationId,
          });

    if (!connection) {
      connection =
        targetOrganizationId === auth.organizationId
          ? await getMetaConnectionState()
          : await getMetaConnectionStateForOrganization(targetOrganizationId);
    }

    await recordActivationEvent({
      organizationId: targetOrganizationId,
      userId: auth.userId,
      eventName: "meta_selection_completed",
      source: "meta_selections_route",
      metadata: {
        route: "meta_selections",
        hasAdAccount: Boolean(externalAccountId),
        hasPage: Boolean(pageId),
        hasPixel: Boolean(pixelId),
      },
      idempotencyKey: `meta_selection_completed:${targetOrganizationId}:${externalAccountId}:${Boolean(pageId)}:${Boolean(pixelId)}`,
    }).catch(() => undefined);

    return NextResponse.json({ connection });
  } catch (error) {
    return createMetaFailureResponse({
      context: "selection",
      status: error instanceof ApiError ? error.status : 400,
      requestId,
      error,
    });
  }
}
