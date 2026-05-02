import { ApiError, handleApiError, parseTextBody } from "@/lib/api/route";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getHashedRateLimitIdentifier,
  getRateLimitKey,
  getRequestIp,
} from "@/lib/api/rate-limit";
import {
  getSmsOutboundPolicyStatus,
  handleIncomingSMS,
  validateTwilioWebhookSignature,
} from "@/lib/services/sms-service";
import { handleIncomingMessageByPhone } from "@/lib/services/lead-handler-service";
import { logError, logOperationalEvent } from "@/lib/logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function twiml(message?: string) {
  const body = message?.trim()
    ? `<Message>${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message>`
    : "";

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

function isComplianceKeyword(message: string) {
  return /^(stop|stopall|unsubscribe|cancel|end|quit|start|unstop|yes|help|info)$/i.test(message.trim());
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const ipHash = getHashedRateLimitIdentifier(getRequestIp(request));
    const inboundRateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "twilio:webhook:ip", ipHash),
      limit: 30,
      windowMs: 60_000,
    });

    if (inboundRateLimit && !inboundRateLimit.allowed) {
      return buildRateLimitResponse(inboundRateLimit.resetAt);
    }

    const rawBody = await parseTextBody(request, {
      maxBytes: 64 * 1024,
      code: "twilio_body_too_large",
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
      const invalidRateLimit = await consumeRateLimit({
        key: getRateLimitKey(request, "twilio:webhook:invalid", ipHash),
        limit: 10,
        windowMs: 60_000,
      });
      logOperationalEvent("sms.webhook_signature_rejected", {
        requestId,
        rateLimitRemaining: invalidRateLimit?.remaining ?? null,
      });
      if (invalidRateLimit && !invalidRateLimit.allowed) {
        return buildRateLimitResponse(invalidRateLimit.resetAt);
      }
      throw new ApiError(401, "Invalid Twilio webhook signature.", "twilio_signature_invalid");
    }

    const payload = await handleIncomingSMS(formData);
    const result = await handleIncomingMessageByPhone(payload.from, payload.body, {
      messageSid: payload.messageSid,
      organizationId: process.env.TWILIO_INBOUND_ORGANIZATION_ID?.trim() || null,
    });
    const policy = getSmsOutboundPolicyStatus();
    const canReply =
      isComplianceKeyword(payload.body) || (policy.automationEnabled && result.status !== "blocked");

    logOperationalEvent("sms.inbound_processed", {
      requestId,
      fromPresent: Boolean(payload.from),
      messageSid: payload.messageSid,
      leadId: result.leadId,
      status: result.status,
      replySuppressed: !canReply,
      idempotentReplay: "idempotentReplay" in result ? result.idempotentReplay : false,
    });

    return twiml(canReply ? result.response : undefined);
  } catch (error) {
    logError("Inbound SMS webhook failed", {
      requestId,
      message: error instanceof Error ? error.message : "Unknown SMS webhook failure",
      code: error instanceof ApiError ? error.code : "sms_webhook_failed",
    });

    if (error instanceof ApiError && error.status < 500) {
      return handleApiError(error, "Twilio SMS webhook");
    }

    return twiml("We could not process that message yet. Please try again later.");
  }
}
