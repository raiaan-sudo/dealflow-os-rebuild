import { ApiError, apiSuccess, handleApiError, parseTextBody } from "@/lib/api/route";
import {
  assertGhlProductionAllowed,
  ghlProductionGateFromEnvironment,
} from "@/lib/integrations/gohighlevel";
import {
  GHL_WEBHOOK_BODY_LIMIT_BYTES,
  parseGhlLifecycleWebhook,
  verifyGhlWebhookSignature,
} from "@/lib/integrations/gohighlevel/webhook-contract";
import { logOperationalEvent } from "@/lib/logging";
import { acceptGhlLifecycleWebhook } from "@/lib/services/ghl-lifecycle-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertGhlProductionAllowed(ghlProductionGateFromEnvironment("lifecycle_webhook"));
    const rawBody = await parseTextBody(request, { maxBytes: GHL_WEBHOOK_BODY_LIMIT_BYTES, code: "ghl_webhook_body_too_large" });
    if (!verifyGhlWebhookSignature(rawBody, request.headers.get("x-ghl-signature"))) {
      throw new ApiError(401, "GHL webhook signature is invalid.", "ghl_webhook_signature_invalid");
    }
    const event = parseGhlLifecycleWebhook(rawBody);
    await acceptGhlLifecycleWebhook(event);
    logOperationalEvent("ghl_lifecycle_webhook_accepted", {
      eventType: event.eventType,
      providerEventId: event.providerEventId,
      providerLocationFingerprint: event.payloadFingerprint.slice(0, 12),
      communicationsSent: false,
      providerMutationAttempted: false,
    });
    return apiSuccess({ received: true, duplicateSafe: true });
  } catch (error) {
    return handleApiError(error, "GHL lifecycle webhook");
  }
}
