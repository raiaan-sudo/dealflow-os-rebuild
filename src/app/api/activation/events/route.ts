import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { activationJourneyEventSchema } from "@/lib/onboarding-contract";
import { getAppContext } from "@/lib/services/app-context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const context = await getAppContext();

    if (!context) {
      return Response.json({ error: "Authentication is required." }, { status: 401 });
    }

    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "activation-journey-event", context.user.id),
      limit: 60,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const event = await parseJsonBody(request, activationJourneyEventSchema, {
      maxBytes: 8 * 1024,
      code: "activation_event_body_too_large",
    });
    const admin = createAdminClient();

    if (!admin) {
      return Response.json({ error: "Activation telemetry is unavailable." }, { status: 503 });
    }

    const { error } = await (admin as any).from("activation_journey_events").insert({
      organization_id: context.organization.id,
      user_id: context.user.id,
      event_name: event.eventName,
      idempotency_key: event.idempotencyKey,
      metadata: event.metadata as Json,
    });

    if (error && error.code !== "23505") {
      throw error;
    }

    return Response.json({
      accepted: true,
      duplicate: error?.code === "23505",
      eventName: event.eventName,
      affectsCommercialActivation: false,
      affectsEntitlement: false,
    });
  } catch (error) {
    return handleApiError(error, "Activation journey event");
  }
}
