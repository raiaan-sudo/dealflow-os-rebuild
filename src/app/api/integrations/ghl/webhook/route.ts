import { ApiError, apiSuccess, handleApiError, parseTextBody } from "@/lib/api/route";
import { resolveGhlLifecycleEnvironment } from "@/lib/integrations/gohighlevel";
import {
  GHL_WEBHOOK_BODY_LIMIT_BYTES,
  parseGhlLifecycleWebhook,
  verifyGhlWebhookSignatures,
} from "@/lib/integrations/gohighlevel/webhook-contract";
import { isGhlMarketplaceWebhookType } from "@/lib/integrations/gohighlevel/marketplace-runtime-contract";
import { logOperationalEvent } from "@/lib/logging";
import { acceptGhlLifecycleWebhook } from "@/lib/services/ghl-lifecycle-service";
import {
  acceptGhlMarketplaceRuntimeEvent,
  sanitizedGhlMarketplaceEvent,
} from "@/lib/services/ghl-marketplace-runtime-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const providerEnvironment = resolveGhlLifecycleEnvironment();
    const rawBody = await parseTextBody(request, { maxBytes: GHL_WEBHOOK_BODY_LIMIT_BYTES, code: "ghl_webhook_body_too_large" });
    if (!verifyGhlWebhookSignatures(rawBody, {
      ghl: request.headers.get("x-ghl-signature"),
      legacy: request.headers.get("x-wh-signature"),
    })) {
      throw new ApiError(401, "GHL webhook signature is invalid.", "ghl_webhook_signature_invalid");
    }
    let suppliedType = "";
    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      suppliedType = typeof parsed.type === "string" ? parsed.type : "";
    } catch {
      throw new ApiError(400, "GHL webhook JSON is invalid.", "ghl_webhook_json_invalid");
    }
    if (isGhlMarketplaceWebhookType(suppliedType)) {
      const acceptance = await acceptGhlMarketplaceRuntimeEvent(rawBody, providerEnvironment);
      logOperationalEvent("ghl_marketplace_webhook_accepted", {
        ...sanitizedGhlMarketplaceEvent(acceptance.event),
        outcome: acceptance.outcome,
        providerEnvironment,
        communicationsSent: false,
        providerMutationAttempted: false,
      });
      return apiSuccess({
        received: true,
        duplicateSafe: true,
        outcome: acceptance.outcome,
      });
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
