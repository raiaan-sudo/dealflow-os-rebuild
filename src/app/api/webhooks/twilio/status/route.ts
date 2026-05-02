import { ApiError, apiSuccess, handleApiError, parseTextBody } from "@/lib/api/route";
import {
  updateSmsDeliveryStatus,
  validateTwilioWebhookSignature,
} from "@/lib/services/sms-service";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getHashedRateLimitIdentifier,
  getRateLimitKey,
  getRequestIp,
} from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function consumeInvalidSignatureBucket(request: Request) {
  const ipHash = getHashedRateLimitIdentifier(getRequestIp(request));
  const rateLimit = await consumeRateLimit({
    key: getRateLimitKey(request, "twilio-status:invalid-signature", ipHash),
    limit: 30,
    windowMs: 60_000,
  });

  if (rateLimit && !rateLimit.allowed) {
    return buildRateLimitResponse(rateLimit.resetAt);
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const rawBody = await parseTextBody(request, {
      maxBytes: 8 * 1024,
      code: "twilio_status_body_too_large",
    });
    const formData = new URLSearchParams(rawBody);
    const signature = request.headers.get("x-twilio-signature");

    if (
      !validateTwilioWebhookSignature({
        url: request.url,
        signature,
        formData,
      })
    ) {
      const limited = await consumeInvalidSignatureBucket(request);

      if (limited) {
        return limited;
      }

      throw new ApiError(401, "Invalid Twilio webhook signature.", "twilio_signature_invalid");
    }

    const providerMessageId = formData.get("MessageSid")?.toString() || formData.get("SmsSid")?.toString() || "";
    const status = formData.get("MessageStatus")?.toString() || formData.get("SmsStatus")?.toString() || "";
    const errorMessage = formData.get("ErrorMessage")?.toString() || null;

    if (!providerMessageId || !status) {
      throw new ApiError(400, "MessageSid and status are required.", "twilio_status_invalid");
    }

    const result = await updateSmsDeliveryStatus({
      providerMessageId,
      status,
      errorMessage,
    });

    return apiSuccess({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error, "Twilio status webhook");
  }
}
