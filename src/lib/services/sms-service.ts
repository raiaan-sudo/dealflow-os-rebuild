import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  isExplicitNonProductionDeployment,
  isProductionDeployment,
} from "@/lib/deployment-target";
import {
  assertTwilioRecipientAllowed,
  getTwilioTransportConfig,
  TwilioTransportPolicyError,
} from "@/lib/integrations/twilio/transport";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logOperationalEvent } from "@/lib/logging";
import { normalizePhone as normalizePhoneNumber } from "@/lib/phone";

type SendSmsParams = {
  to: string | null | undefined;
  body: string;
  purpose: "new_lead_alert" | "lead_reply_template" | string;
  leadId: string;
  agentId: string | null;
  tenantId: string;
};

type SmsStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed"
  | "operator_action_required";
type AdminClient = SupabaseClient<any>;

type SmsDeliveryClaim = {
  id: string;
  status: SmsStatus;
  provider_message_id?: string | null;
  request_digest?: string | null;
  delivery_locked_by?: string | null;
  delivery_lease_token?: string | null;
  delivery_lease_generation?: number | null;
};

class SmsProviderRejectedError extends Error {
  readonly code = "sms_provider_rejected";
}

class SmsProviderAmbiguousError extends Error {
  readonly code = "sms_provider_outcome_ambiguous";
}

export function normalizePhone(input: unknown, defaultCountry = "US") {
  return normalizePhoneNumber(input, defaultCountry);
}

function getAdminClientOrThrow() {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Supabase service-role client is not configured.");
  }

  return supabase as AdminClient;
}

function getTwilioConfig() {
  try {
    return {
      ...getTwilioTransportConfig(),
      policyError: null,
    };
  } catch (error) {
    return {
      mode: "disabled" as const,
      accountSid: null,
      authToken: null,
      messagingServiceSid: null,
      baseUrl: null,
      endpointMode: "disabled" as const,
      allowedTestRecipient: null,
      policyError:
        error instanceof Error ? error.message : "Twilio transport policy is invalid.",
    };
  }
}

function isInternalLeadSmsEnabled() {
  return process.env.INTERNAL_LEAD_SMS_ENABLED?.trim().toLowerCase() === "true";
}

function isSmsMockMode() {
  const explicitMock = process.env.SMS_MOCK_MODE?.trim().toLowerCase();
  const testMock = process.env.TEST_SMS_MODE?.trim().toLowerCase();

  return explicitMock === "true" || explicitMock === "mock" || testMock === "mock";
}

function isSmsMockModeAllowed() {
  return (
    isSmsMockMode() &&
    isExplicitNonProductionDeployment() &&
    !isProductionDeployment()
  );
}

export function getSmsOutboundPolicyStatus() {
  const config = getTwilioConfig();
  const hasTwilioConfig = Boolean(config.accountSid && config.authToken && config.messagingServiceSid);
  const mockModeRequested = isSmsMockMode();
  const mockMode = isSmsMockModeAllowed();

  return {
    automationEnabled: false,
    internalLeadNotificationsEnabled: isInternalLeadSmsEnabled() && (hasTwilioConfig || mockMode),
    complianceAckEnabled: process.env.SMS_COMPLIANCE_ACK === "true",
    hasTwilioConfig,
    mockMode,
    mockModeRequested,
    mockModeTargetBlocked: mockModeRequested && !mockMode,
    mockModeProductionBlocked:
      mockModeRequested && !mockMode && isProductionDeployment(),
    outboundLeadSmsEnabled: false,
  };
}

async function findExistingNotification(params: {
  tenantId: string;
  leadId: string;
  agentId: string | null;
  purpose: string;
}) {
  const supabase = getAdminClientOrThrow();
  let query = supabase
    .from("lead_notifications")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("lead_id", params.leadId)
    .eq("purpose", params.purpose)
    .limit(1);

  query = params.agentId ? query.eq("agent_id", params.agentId) : query.is("agent_id", null);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data as {
    id: string;
    status: SmsStatus;
    provider_message_id?: string | null;
    request_digest?: string | null;
  } | null;
}

function buildSmsRequestDigest(params: SendSmsParams) {
  return createHash("sha256")
    .update([
      params.tenantId,
      params.leadId,
      params.agentId ?? "unassigned",
      params.purpose,
      params.to?.trim() ?? "",
      params.body,
    ].join("\n"))
    .digest("hex");
}

async function createNotification(params: SendSmsParams, requestDigest: string) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await (supabase as any).rpc(
    "create_lead_notification_delivery_v2",
    {
      p_tenant_id: params.tenantId,
      p_lead_id: params.leadId,
      p_agent_id: params.agentId,
      p_purpose: params.purpose,
      p_request_digest: requestDigest,
    },
  );

  if (error) {
    throw error;
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    id: string;
    status: SmsStatus;
    provider_message_id?: string | null;
    request_digest?: string | null;
  } | null;

  if (!row?.id) {
    throw new Error("SMS delivery creation receipt was not returned.");
  }

  return row;
}

async function claimNotificationDelivery(params: {
  notificationId: string;
  requestDigest: string;
  workerId: string;
}) {
  const { data, error } = await (getAdminClientOrThrow() as any).rpc(
    "claim_lead_notification_delivery",
    {
      p_notification_id: params.notificationId,
      p_worker_id: params.workerId,
      p_request_digest: params.requestDigest,
      p_lease_ms: 120_000,
    },
  );

  if (error) {
    throw error;
  }

  const row = (Array.isArray(data) ? data[0] : data) as SmsDeliveryClaim | null;
  if (!row?.id) {
    throw new Error("SMS delivery claim was not returned.");
  }

  return row;
}

async function settleNotificationDelivery(params: {
  claim: SmsDeliveryClaim;
  workerId: string;
  status: "sent" | "failed" | "operator_action_required";
  providerMessageId?: string | null;
  errorMessage?: string | null;
}) {
  if (!params.claim.delivery_lease_token || !params.claim.delivery_lease_generation) {
    return false;
  }

  const { data, error } = await (getAdminClientOrThrow() as any).rpc(
    "settle_lead_notification_delivery",
    {
      p_notification_id: params.claim.id,
      p_worker_id: params.workerId,
      p_lease_token: params.claim.delivery_lease_token,
      p_lease_generation: params.claim.delivery_lease_generation,
      p_status: params.status,
      p_provider_message_id: params.providerMessageId ?? null,
      p_error_message: params.errorMessage ?? null,
    },
  );

  return !error && data === true;
}

async function postTwilioMessage(params: {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
  baseUrl: string;
  mode: "disabled" | "live" | "test" | "loopback";
  allowedTestRecipient: string | null;
  to: string;
  body: string;
}) {
  assertTwilioRecipientAllowed({
    mode: params.mode,
    to: params.to,
    allowedTestRecipient: params.allowedTestRecipient,
  });
  const body = new URLSearchParams({
    To: params.to,
    Body: params.body,
    MessagingServiceSid: params.messagingServiceSid,
  });
  let response: Response;
  try {
    response = await fetch(
      `${params.baseUrl}/2010-04-01/Accounts/${encodeURIComponent(params.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${params.accountSid}:${params.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
  } catch {
    throw new SmsProviderAmbiguousError(
      "Twilio transport ended without a provider receipt; operator reconciliation is required.",
    );
  }
  const data = (await response.json().catch(() => null)) as { sid?: string; message?: string } | null;

  if (!response.ok) {
    throw new SmsProviderRejectedError(data?.message || `Twilio returned ${response.status}`);
  }

  if (!data?.sid) {
    throw new SmsProviderAmbiguousError(
      "Twilio accepted the request without a message receipt; operator reconciliation is required.",
    );
  }

  return data.sid;
}

export async function sendSms(params: SendSmsParams) {
  const requestDigest = buildSmsRequestDigest(params);
  const existing = await findExistingNotification({
    tenantId: params.tenantId,
    leadId: params.leadId,
    agentId: params.agentId,
    purpose: params.purpose,
  });

  const notification = existing ?? (await createNotification(params, requestDigest));
  const workerId = `sms-delivery:${randomUUID()}`;
  const claim = await claimNotificationDelivery({
    notificationId: notification.id,
    requestDigest,
    workerId,
  });

  if (
    claim.status !== "sending" ||
    claim.delivery_locked_by !== workerId ||
    claim.request_digest !== requestDigest
  ) {
    return {
      notificationId: claim.id,
      status: claim.status,
      providerMessageId: claim.provider_message_id ?? null,
      duplicate: true,
    };
  }

  const to = params.to?.trim();
  const config = getTwilioConfig();

  if (!to || !to.startsWith("+")) {
    const settled = await settleNotificationDelivery({
      claim,
      workerId,
      status: "failed",
      errorMessage: "Assigned agent does not have a valid E.164 phone number.",
    });
    return {
      notificationId: notification.id,
      status: settled ? "failed" as const : "operator_action_required" as const,
      providerMessageId: null,
    };
  }

  if (!isInternalLeadSmsEnabled()) {
    const settled = await settleNotificationDelivery({
      claim,
      workerId,
      status: "failed",
      errorMessage: "Internal lead SMS notifications are disabled.",
    });
    return {
      notificationId: notification.id,
      status: settled ? "failed" as const : "operator_action_required" as const,
      providerMessageId: null,
    };
  }

  if (isSmsMockMode() && !isSmsMockModeAllowed()) {
    const settled = await settleNotificationDelivery({
      claim,
      workerId,
      status: "failed",
      errorMessage: "SMS mock mode requires an explicitly attested nonproduction deployment target.",
    });
    logOperationalEvent("sms.internal_lead_notification_blocked", {
      tenantId: params.tenantId,
      leadId: params.leadId,
      purpose: params.purpose,
      reason: isProductionDeployment()
        ? "sms_mock_mode_production_blocked"
        : "sms_mock_mode_target_unproven",
    });
    return {
      notificationId: notification.id,
      status: settled ? "failed" as const : "operator_action_required" as const,
      providerMessageId: null,
    };
  }

  if (isSmsMockModeAllowed()) {
    const providerMessageId = `mock_sms_${Date.now()}_${randomUUID()}`;
    const settled = await settleNotificationDelivery({
      claim,
      workerId,
      status: "sent",
      providerMessageId,
    });
    if (!settled) {
      return {
        notificationId: notification.id,
        status: "operator_action_required" as const,
        providerMessageId: null,
      };
    }
    logOperationalEvent("sms.internal_lead_notification_mocked", {
      tenantId: params.tenantId,
      leadId: params.leadId,
      agentId: params.agentId,
      purpose: params.purpose,
    });
    return { notificationId: notification.id, status: "sent" as const, providerMessageId };
  }

  if (
    config.policyError
    || config.mode === "disabled"
    || !config.accountSid
    || !config.authToken
    || !config.messagingServiceSid
    || !config.baseUrl
  ) {
    const settled = await settleNotificationDelivery({
      claim,
      workerId,
      status: "failed",
      errorMessage: config.policyError ?? "Twilio environment variables are not configured.",
    });
    logOperationalEvent("sms.internal_lead_notification_blocked", {
      tenantId: params.tenantId,
      leadId: params.leadId,
      purpose: params.purpose,
      reason: config.policyError ? "twilio_transport_policy_invalid" : "missing_twilio_env",
    });
    return {
      notificationId: notification.id,
      status: settled ? "failed" as const : "operator_action_required" as const,
      providerMessageId: null,
    };
  }

  try {
    const providerMessageId = await postTwilioMessage({
      accountSid: config.accountSid,
      authToken: config.authToken,
      messagingServiceSid: config.messagingServiceSid,
      baseUrl: config.baseUrl,
      mode: config.mode,
      allowedTestRecipient: config.allowedTestRecipient,
      to,
      body: params.body,
    });
    const settled = await settleNotificationDelivery({
      claim,
      workerId,
      status: "sent",
      providerMessageId,
    });

    if (!settled) {
      return {
        notificationId: notification.id,
        status: "operator_action_required" as const,
        providerMessageId: null,
      };
    }

    return { notificationId: notification.id, status: "sent" as const, providerMessageId };
  } catch (error) {
    const status = error instanceof SmsProviderRejectedError || error instanceof TwilioTransportPolicyError
      ? "failed"
      : "operator_action_required";
    const settled = await settleNotificationDelivery({
      claim,
      workerId,
      status,
      errorMessage:
        error instanceof Error ? error.message : "Twilio outcome requires reconciliation.",
    });
    return {
      notificationId: notification.id,
      status: settled ? status : "operator_action_required" as const,
      providerMessageId: null,
    };
  }
}

export async function sendSMS(
  toOrParams:
    | string
    | {
        to: string;
        body: string;
        leadId?: string | null;
        organizationId?: string | null;
      },
  body?: string,
  _options?: Record<string, unknown>,
) {
  const params =
    typeof toOrParams === "string"
      ? { to: toOrParams, body: body ?? "" }
      : toOrParams;

  logOperationalEvent("sms.lead_outbound_blocked", {
    reason: "lead_sms_automation_disabled",
    leadId: "leadId" in params ? params.leadId ?? null : null,
    organizationId: "organizationId" in params ? params.organizationId ?? null : null,
  });

  return {
    sent: false,
    blocked: true,
    sid: null,
    reason: "Outbound SMS to leads is disabled. Internal agent alerts use sendSms().",
  };
}

function safeCompare(candidate: string, expected: string) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  try {
    return timingSafeEqual(candidateBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export function validateTwilioWebhookSignature(params: {
  url: string;
  signature: string | null | undefined;
  formData: FormData | URLSearchParams;
}) {
  const token = getTwilioConfig().authToken;

  if (!token || !params.signature) {
    return false;
  }

  const sortedEntries = [...params.formData.entries()]
    .filter(([, value]) => typeof value === "string")
    .sort(([a], [b]) => a.localeCompare(b));
  const payload = sortedEntries.reduce((current, [key, value]) => `${current}${key}${value}`, params.url);
  const expected = createHmac("sha1", token).update(payload).digest("base64");

  return safeCompare(params.signature, expected);
}

export async function handleIncomingSMS(formData: URLSearchParams | FormData) {
  return {
    from: formData.get("From")?.toString() || "",
    to: formData.get("To")?.toString() || "",
    body: formData.get("Body")?.toString() || "",
    messageSid: formData.get("MessageSid")?.toString() || null,
  };
}

export async function updateSmsDeliveryStatus(params: {
  providerMessageId: string;
  status: string;
  errorMessage?: string | null;
}) {
  const statusMap: Record<string, SmsStatus> = {
    queued: "queued",
    sent: "sent",
    delivered: "delivered",
    undelivered: "undelivered",
    failed: "failed",
  };
  const mapped = statusMap[params.status] ?? null;

  if (!mapped) {
    return { updated: false };
  }

  const { data, error } = await (getAdminClientOrThrow() as any).rpc(
    "apply_lead_notification_delivery_status",
    {
      p_provider_message_id: params.providerMessageId,
      p_status: mapped,
      p_error_message: params.errorMessage ?? null,
    },
  );

  if (error) {
    throw error;
  }

  return { updated: data === true };
}
