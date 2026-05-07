import { z } from "zod";
import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import {
  parseActivationEventName,
  recordActivationEvent,
} from "@/lib/services/activation-telemetry-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activationEventSchema = z.object({
  eventName: z.string().min(1).transform(parseActivationEventName),
  campaignId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).max(160).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const auth = await getAuthenticatedContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "activation-events", `${auth.organizationId}:${auth.userId}`),
      limit: 80,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const body = await parseJsonBody(request, activationEventSchema, {
      maxBytes: 16 * 1024,
      code: "activation_event_body_too_large",
    });
    await recordActivationEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      eventName: "signup_session_initialized",
      source: "activation_route",
      metadata: {
        route: "activation_events",
      },
      idempotencyKey: `signup_session_initialized:${auth.userId}`,
    }).catch(() => undefined);
    const result = await recordActivationEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      campaignId: body.campaignId ?? null,
      eventName: body.eventName,
      source: "client",
      metadata: body.metadata,
      idempotencyKey: body.idempotencyKey,
    });

    return Response.json({ success: true, recorded: result.recorded });
  } catch (error) {
    return handleApiError(error, "Activation event");
  }
}
