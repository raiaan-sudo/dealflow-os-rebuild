import { ApiError, apiSuccess, handleApiError, parseTextBody } from "@/lib/api/route";
import { resolveGhlLifecycleEnvironment } from "@/lib/integrations/gohighlevel";
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
    const providerEnvironment = resolveGhlLifecycleEnvironment();
    const rawBody = await parseTextBody(request, { maxBytes: GHL_WEBHOOK_BODY_LIMIT_BYTES, code: "ghl_webhook_body_too_large" });
    if (!verifyGhlWebhookSignature(rawBody, request.headers.get("x-ghl-signature"))) {
      throw new ApiError(401, "GHL webhook signature is invalid.", "ghl_webhook_signature_invalid");
    }
    const event = parseGhlLifecycleWebhook(rawBody);
    const acceptance = await acceptGhlLifecycleWebhook(event, providerEnvironment);
    logOperationalEvent("ghl_lifecycle_webhook_accepted", {
      eventType: event.eventType,
      providerLocationFingerprint: event.payloadFingerprint.slice(0, 12),
      projectionStatus: acceptance.projectionStatus,
      projectionCode: acceptance.projectionCode,
      providerEnvironment,
      communicationsSent: false,
      providerMutationAttempted: false,
    });
    return apiSuccess({
      received: true,
      duplicateSafe: true,
      projectionStatus: acceptance.projectionStatus,
    });
  } catch (error) {
    return handleApiError(error, "GHL lifecycle webhook");
  }
}
