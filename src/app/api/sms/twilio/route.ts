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

function twiml(message?: string, status = 200) {
  const body = message?.trim()
    ? `<Message>${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message>`
    : "";

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

const PERMANENT_TENANT_MAPPING_ERROR_CODES = new Set([
  "sms_tenant_mapping_invalid",
  "sms_tenant_mapping_ambiguous",
  "sms_tenant_mapping_unresolved",
  "sms_tenant_mapping_missing",
]);

function isComplianceKeyword(message: string) {
  return /^(stop|stopall|unsubscribe|cancel|end|quit|start|unstop|yes|help|info)$/i.test(message.trim());
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeInboundNumber(value: string) {
  const normalized = value.trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

function normalizeOrganizationId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function parseInboundNumberOrganizationMap(rawValue: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new ApiError(
      503,
      "Inbound SMS number-to-tenant mapping is invalid.",
      "sms_tenant_mapping_invalid",
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError(
      503,
      "Inbound SMS number-to-tenant mapping is invalid.",
      "sms_tenant_mapping_invalid",
    );
  }

  const mapping = new Map<string, string>();
  for (const [rawNumber, rawOrganizationId] of Object.entries(parsed)) {
    const number = normalizeInboundNumber(rawNumber);
    const organizationId = normalizeOrganizationId(rawOrganizationId);

    if (!number || !organizationId) {
      throw new ApiError(
        503,
        "Inbound SMS number-to-tenant mapping is invalid.",
        "sms_tenant_mapping_invalid",
      );
    }

    const existingOrganizationId = mapping.get(number);
    if (existingOrganizationId && existingOrganizationId !== organizationId) {
      throw new ApiError(
        503,
        "Inbound SMS number-to-tenant mapping is ambiguous.",
        "sms_tenant_mapping_ambiguous",
      );
    }

    mapping.set(number, organizationId);
  }

  return mapping;
}

function resolveInboundOrganizationId(to: string) {
  const rawMapping = process.env.TWILIO_INBOUND_NUMBER_ORGANIZATION_MAP?.trim() ?? "";
  const rawLegacyOrganizationId = process.env.TWILIO_INBOUND_ORGANIZATION_ID?.trim() ?? "";

  if (rawMapping && rawLegacyOrganizationId) {
    throw new ApiError(
      503,
      "Inbound SMS tenant mapping has more than one authority.",
      "sms_tenant_mapping_ambiguous",
    );
  }

  if (rawMapping) {
    const number = normalizeInboundNumber(to);
    if (!number) {
      throw new ApiError(
        503,
        "Inbound SMS destination cannot be mapped to a tenant.",
        "sms_tenant_mapping_unresolved",
      );
    }

    const organizationId = parseInboundNumberOrganizationMap(rawMapping).get(number);
    if (!organizationId) {
      throw new ApiError(
        503,
        "Inbound SMS destination is not mapped to a tenant.",
        "sms_tenant_mapping_unresolved",
      );
    }

    return organizationId;
  }

  const legacyOrganizationId = normalizeOrganizationId(rawLegacyOrganizationId);
  if (rawLegacyOrganizationId && !legacyOrganizationId) {
    throw new ApiError(
      503,
      "Inbound SMS tenant mapping is invalid.",
      "sms_tenant_mapping_invalid",
    );
  }

  if (!legacyOrganizationId) {
    throw new ApiError(
      503,
      "Inbound SMS tenant mapping is not configured.",
      "sms_tenant_mapping_missing",
    );
  }

  return legacyOrganizationId;
}

function handleTwilioWebhookError(error: unknown) {
  if (
    error instanceof ApiError &&
    PERMANENT_TENANT_MAPPING_ERROR_CODES.has(error.code)
  ) {
    // Tenant ambiguity is permanent until configuration changes. Acknowledge
    // without sending any message from an unresolved workspace.
    return twiml();
  }

  if (error instanceof ApiError && error.status < 500) {
    return handleApiError(error, "Twilio SMS webhook");
  }

  // Transient processing/storage failures must remain retryable at Twilio.
  // The body stays empty so no customer-facing message is emitted.
  return twiml(undefined, error instanceof ApiError ? Math.max(500, error.status) : 503);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
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
      const ipHash = getHashedRateLimitIdentifier(getRequestIp(request));
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
    const organizationId = resolveInboundOrganizationId(payload.to);
    const authenticatedRateLimitIdentifier = getHashedRateLimitIdentifier(
      `${formData.get("AccountSid")?.toString() ?? "unknown-account"}:${payload.to}`,
    );
    const inboundRateLimit = await consumeRateLimit({
      key: getRateLimitKey(
        request,
        "twilio:webhook:authenticated-destination",
        authenticatedRateLimitIdentifier,
      ),
      limit: 120,
      windowMs: 60_000,
    });

    if (inboundRateLimit && !inboundRateLimit.allowed) {
      return buildRateLimitResponse(inboundRateLimit.resetAt);
    }

    const result = await handleIncomingMessageByPhone(payload.from, payload.body, {
      messageSid: payload.messageSid,
      organizationId,
    });
    const policy = getSmsOutboundPolicyStatus();
    const canReply =
      Boolean(result.response.trim()) &&
      !result.blocked &&
      (isComplianceKeyword(payload.body) || policy.automationEnabled);

    logOperationalEvent("sms.inbound_processed", {
      requestId,
      fromPresent: Boolean(payload.from),
      messageSid: payload.messageSid,
      leadId: result.leadId,
      status: result.status,
      blocked: result.blocked === true,
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

    return handleTwilioWebhookError(error);
  }
}
