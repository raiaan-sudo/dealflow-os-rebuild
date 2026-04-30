import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
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

type SmsStatus = "queued" | "sent" | "delivered" | "undelivered" | "failed";
type AdminClient = SupabaseClient<any>;

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
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID?.trim() || null,
    authToken: process.env.TWILIO_AUTH_TOKEN?.trim() || null,
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || null,
  };
}

function isInternalLeadSmsEnabled() {
  return process.env.INTERNAL_LEAD_SMS_ENABLED?.trim().toLowerCase() === "true";
}

function isSmsMockMode() {
  const explicitMock = process.env.SMS_MOCK_MODE?.trim().toLowerCase();
  const testMock = process.env.TEST_SMS_MODE?.trim().toLowerCase();

  return explicitMock === "true" || explicitMock === "mock" || testMock === "mock";
}

export function getSmsOutboundPolicyStatus() {
  const config = getTwilioConfig();
  const hasTwilioConfig = Boolean(config.accountSid && config.authToken && config.messagingServiceSid);
  const mockMode = isSmsMockMode();

  return {
    automationEnabled: false,
    internalLeadNotificationsEnabled: isInternalLeadSmsEnabled() && (hasTwilioConfig || mockMode),
    complianceAckEnabled: process.env.SMS_COMPLIANCE_ACK === "true",
    hasTwilioConfig,
    mockMode,
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

  return data as { id: string; status: SmsStatus; provider_message_id?: string | null } | null;
}

async function createNotification(params: SendSmsParams) {
  const supabase = getAdminClientOrThrow();
  const { data, error } = await supabase
    .from("lead_notifications")
    .insert({
      tenant_id: params.tenantId,
      lead_id: params.leadId,
      agent_id: params.agentId,
      channel: "sms",
      provider: "twilio",
      purpose: params.purpose,
      status: "queued",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as { id: string };
}

async function updateNotification(params: {
  id: string;
  status: SmsStatus;
  providerMessageId?: string | null;
  errorMessage?: string | null;
}) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: params.status,
    provider_message_id: params.providerMessageId ?? null,
    error_message: params.errorMessage ?? null,
    updated_at: now,
  };

  if (params.status === "sent") {
    patch.sent_at = now;
  }

  if (params.status === "failed") {
    patch.failed_at = now;
  }

  if (params.status === "delivered") {
    patch.delivered_at = now;
  }

  const { error } = await getAdminClientOrThrow()
    .from("lead_notifications")
    .update(patch)
    .eq("id", params.id);

  if (error) {
    throw error;
  }
}

async function postTwilioMessage(params: {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
  to: string;
  body: string;
}) {
  const body = new URLSearchParams({
    To: params.to,
    Body: params.body,
    MessagingServiceSid: params.messagingServiceSid,
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(params.accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${params.accountSid}:${params.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  const data = (await response.json().catch(() => null)) as { sid?: string; message?: string } | null;

  if (!response.ok) {
    throw new Error(data?.message || `Twilio returned ${response.status}`);
  }

  return data?.sid ?? null;
}

export async function sendSms(params: SendSmsParams) {
  const existing = await findExistingNotification({
    tenantId: params.tenantId,
    leadId: params.leadId,
    agentId: params.agentId,
    purpose: params.purpose,
  });

  if (existing && existing.status !== "failed") {
    return {
      notificationId: existing.id,
      status: existing.status,
      providerMessageId: existing.provider_message_id ?? null,
      duplicate: true,
    };
  }

  const notification = existing ?? (await createNotification(params));
  const to = params.to?.trim();
  const config = getTwilioConfig();

  if (!to || !to.startsWith("+")) {
    await updateNotification({
      id: notification.id,
      status: "failed",
      errorMessage: "Assigned agent does not have a valid E.164 phone number.",
    });
    return { notificationId: notification.id, status: "failed" as const, providerMessageId: null };
  }

  if (!isInternalLeadSmsEnabled()) {
    await updateNotification({
      id: notification.id,
      status: "failed",
      errorMessage: "Internal lead SMS notifications are disabled.",
    });
    return { notificationId: notification.id, status: "failed" as const, providerMessageId: null };
  }

  if (isSmsMockMode()) {
    const providerMessageId = `mock_sms_${Date.now()}_${randomUUID()}`;
    await updateNotification({
      id: notification.id,
      status: "sent",
      providerMessageId,
    });
    logOperationalEvent("sms.internal_lead_notification_mocked", {
      tenantId: params.tenantId,
      leadId: params.leadId,
      agentId: params.agentId,
      purpose: params.purpose,
    });
    return { notificationId: notification.id, status: "sent" as const, providerMessageId };
  }

  if (!config.accountSid || !config.authToken || !config.messagingServiceSid) {
    await updateNotification({
      id: notification.id,
      status: "failed",
      errorMessage: "Twilio environment variables are not configured.",
    });
    logOperationalEvent("sms.internal_lead_notification_blocked", {
      tenantId: params.tenantId,
      leadId: params.leadId,
      purpose: params.purpose,
      reason: "missing_twilio_env",
    });
    return { notificationId: notification.id, status: "failed" as const, providerMessageId: null };
  }

  try {
    const providerMessageId = await postTwilioMessage({
      accountSid: config.accountSid,
      authToken: config.authToken,
      messagingServiceSid: config.messagingServiceSid,
      to,
      body: params.body,
    });
    await updateNotification({
      id: notification.id,
      status: "sent",
      providerMessageId,
    });

    return { notificationId: notification.id, status: "sent" as const, providerMessageId };
  } catch (error) {
    await updateNotification({
      id: notification.id,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Twilio send failed.",
    });
    return { notificationId: notification.id, status: "failed" as const, providerMessageId: null };
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

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: mapped,
    error_message: params.errorMessage ?? null,
    updated_at: now,
  };

  if (mapped === "delivered") {
    patch.delivered_at = now;
  }

  if (mapped === "failed" || mapped === "undelivered") {
    patch.failed_at = now;
  }

  const { error } = await getAdminClientOrThrow()
    .from("lead_notifications")
    .update(patch)
    .eq("provider_message_id", params.providerMessageId);

  if (error) {
    throw error;
  }

  return { updated: true };
}
