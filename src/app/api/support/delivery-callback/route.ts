import { ApiError, apiSuccess, handleApiError, parseTextBody } from "@/lib/api/route";
import {
  SUPPORT_LIFECYCLE_BODY_LIMIT_BYTES,
  verifyAndParseSupportLifecycleCallback,
} from "@/lib/integrations/support/lifecycle-callback";
import { logOperationalEvent } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const rawBody = await parseTextBody(request, {
      maxBytes: SUPPORT_LIFECYCLE_BODY_LIMIT_BYTES,
      code: "support_callback_body_too_large",
    });
    const event = verifyAndParseSupportLifecycleCallback({
      rawBody,
      signatureHeader: request.headers.get("x-dealflow-support-signature"),
      timestampHeader: request.headers.get("x-dealflow-support-timestamp"),
    });
    const admin = createAdminClient();
    if (!admin) {
      throw new ApiError(503, "Support delivery callback persistence is unavailable.", "support_callback_store_unavailable");
    }
    const { data, error } = await (admin as any).rpc("record_support_delivery_callback_v1", {
      p_provider_event_id: event.eventId,
      p_provider_event_type: event.eventType,
      p_provider_receipt_id: event.providerReceiptId,
      p_event_occurred_at: event.occurredAt,
      p_payload_digest: event.payloadDigest,
      p_request_id: requestId,
    });
    if (error) {
      throw new ApiError(503, "Support callback could not be persisted.", "support_callback_persist_failed");
    }
    const result = Array.isArray(data) ? data[0] : data;
    logOperationalEvent("support.delivery_lifecycle_recorded", {
      requestId,
      eventType: event.eventType,
      replayed: result?.replayed === true,
      lifecycleState: result?.lifecycle_state ?? "unknown",
      communicationSent: false,
      providerMutationAttempted: false,
    });
    return apiSuccess({ received: true, duplicateSafe: true, requestId });
  } catch (error) {
    return handleApiError(error, "Support delivery callback");
  }
}
