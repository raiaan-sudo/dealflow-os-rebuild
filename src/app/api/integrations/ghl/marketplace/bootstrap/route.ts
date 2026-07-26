import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  apiFailure,
  assertSameOriginRequest,
  parseJsonBody,
} from "@/lib/api/route";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getRateLimitKey,
} from "@/lib/api/rate-limit";
import { resolveGhlLifecycleEnvironment } from "@/lib/integrations/gohighlevel/lifecycle-gate";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import {
  createGhlMarketplaceBootstrapConnectBinding,
  GHL_MARKETPLACE_STATE_COOKIE,
} from "@/lib/services/ghl-marketplace-runtime-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  claimToken: z.string().min(128).max(4_096),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "ghl-marketplace-bootstrap"),
      limit: 6,
      windowMs: 10 * 60_000,
    });
    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }
    const [auth, body] = await Promise.all([
      getAuthenticatedContext(),
      parseJsonBody(request, bodySchema),
    ]);
    const binding = await createGhlMarketplaceBootstrapConnectBinding({
      claimToken: body.claimToken,
      userId: auth.userId,
      organizationId: auth.organizationId,
      providerEnvironment: resolveGhlLifecycleEnvironment(),
      returnPath: "/crm/connect?complete=1",
    });
    const response = NextResponse.json({
      status: "authorization_required",
      authorizationUrl: binding.installUrl,
    });
    response.cookies.set(GHL_MARKETPLACE_STATE_COOKIE, binding.state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integrations",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      return apiFailure(error.message, error.code, error.status);
    }
    return apiFailure(
      "The GHL workspace connection could not be started.",
      "ghl_marketplace_bootstrap_failed",
      500,
    );
  }
}
