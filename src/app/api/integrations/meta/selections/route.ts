import { NextResponse } from "next/server";
import { ApiError, assertSameOriginRequest, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { createMetaFailureResponse } from "@/lib/integrations/meta/error-mapper";
import {
  getMetaConnectionState,
  selectMetaAdAccount,
  updateMetaLaunchSelections,
} from "@/lib/integrations/meta/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordActivationEvent } from "@/lib/services/activation-telemetry-service";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { isInternalAdminEmail } from "@/lib/env";

type SelectionBody = {
  externalAccountId?: string;
  pageId?: string;
  pixelId?: string;
  campaignId?: string | null;
};

async function resolveSelectionOrganizationId(params: {
  campaignId?: string | null;
  fallbackOrganizationId: string;
  userId: string;
  userEmail?: string | null;
}) {
  const campaignId = params.campaignId?.trim();

  if (!campaignId) {
    return params.fallbackOrganizationId;
  }

  const admin = createAdminClient();

  if (!admin) {
    throw new ApiError(503, "Supabase is not configured.", "config_missing");
  }

  const { data: campaign, error } = await admin
    .from("campaign_plans")
    .select("id,user_id,owner_id,organization_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (error || !campaign) {
    throw new ApiError(404, "Campaign not found.", "campaign_not_found");
  }

  const campaignRecord = campaign as {
    user_id?: string | null;
    owner_id?: string | null;
    organization_id?: string | null;
  };
  const userOwnsCampaign =
    campaignRecord.user_id === params.userId || campaignRecord.owner_id === params.userId;
  const sameWorkspace = campaignRecord.organization_id === params.fallbackOrganizationId;
  const platformAdmin = isInternalAdminEmail(params.userEmail ?? null);

  if (!userOwnsCampaign && !sameWorkspace && !platformAdmin) {
    throw new ApiError(403, "You do not have access to this campaign.", "campaign_access_denied");
  }

  return campaignRecord.organization_id ?? params.fallbackOrganizationId;
}

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
    const externalAccountId = body?.externalAccountId?.trim() ?? "";
    const pageId = body?.pageId?.trim() ?? "";
    const pixelId = body?.pixelId?.trim() ?? "";
    const targetOrganizationId = await resolveSelectionOrganizationId({
      campaignId: body?.campaignId,
      fallbackOrganizationId: auth.organizationId,
      userId: auth.userId,
      userEmail: auth.context.user.email ?? auth.context.profile?.email ?? null,
    });

    if (!externalAccountId) {
      return NextResponse.json(
        { error: "A Meta ad account selection is required." },
        { status: 400 },
      );
    }

    let connection =
      pageId && pixelId
        ? await updateMetaLaunchSelections({
            externalAccountId,
            pageId,
            pixelId,
            organizationId: targetOrganizationId,
          })
        : await selectMetaAdAccount(externalAccountId, targetOrganizationId);

    if (!connection) {
      connection = await getMetaConnectionState();
    }

    await recordActivationEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      eventName: "meta_selection_completed",
      source: "meta_selections_route",
      metadata: {
        route: "meta_selections",
        hasAdAccount: Boolean(externalAccountId),
        hasPage: Boolean(pageId),
        hasPixel: Boolean(pixelId),
        campaignScoped: Boolean(body?.campaignId),
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
