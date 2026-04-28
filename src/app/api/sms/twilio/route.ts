import { ApiError, handleApiError } from "@/lib/api/route";
import {
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

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const formData = await request.formData();
    const signature = request.headers.get("x-twilio-signature");

    if (
      !validateTwilioWebhookSignature({
        url: request.url,
        signature,
        formData,
      })
    ) {
      throw new ApiError(401, "Invalid Twilio webhook signature.", "twilio_signature_invalid");
    }

    const payload = await handleIncomingSMS(formData);
    const result = await handleIncomingMessageByPhone(payload.from, payload.body, {
      messageSid: payload.messageSid,
    });

    logOperationalEvent("sms.inbound_processed", {
      requestId,
      fromPresent: Boolean(payload.from),
      messageSid: payload.messageSid,
      leadId: result.leadId,
      status: result.status,
      idempotentReplay: "idempotentReplay" in result ? result.idempotentReplay : false,
    });

    return twiml(result.response);
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
