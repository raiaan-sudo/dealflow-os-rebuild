import { NextResponse } from "next/server";
import { ApiError, assertSameOriginRequest, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { createMetaFailureResponse } from "@/lib/integrations/meta/error-mapper";
import {
  getMetaConnectionState,
  selectMetaAdAccount,
  updateMetaLaunchSelections,
} from "@/lib/integrations/meta/service";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { isMetaProviderIncluded } from "@/lib/release/approved-launch-profile";

type SelectionBody = {
  externalAccountId?: string;
  pageId?: string;
  pixelId?: string;
};

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (!isMetaProviderIncluded()) {
      throw new ApiError(409, "Meta is not included in this release.", "meta_provider_excluded");
    }
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
          })
        : await selectMetaAdAccount(externalAccountId);

    if (!connection) {
      connection = await getMetaConnectionState();
    }

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
