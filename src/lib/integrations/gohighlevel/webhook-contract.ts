import { createHash, createPublicKey, verify } from "node:crypto";
import { ApiError } from "@/lib/api/route";

export const GHL_WEBHOOK_BODY_LIMIT_BYTES = 128 * 1024;
export const GHL_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalDate(value: unknown) {
  const candidate = string(value);
  if (!candidate) return null;
  const milliseconds = Date.parse(candidate);
  if (!Number.isFinite(milliseconds)) throw new ApiError(400, "GHL webhook date is invalid.", "ghl_webhook_date_invalid");
  return new Date(milliseconds).toISOString();
}

export function verifyGhlWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  publicKey: string | ReturnType<typeof createPublicKey> = GHL_ED25519_PUBLIC_KEY,
) {
  if (!signatureHeader || signatureHeader.length > 512) return false;
  try {
    const signature = Buffer.from(signatureHeader, "base64");
    if (signature.length !== 64) return false;
    return verify(null, Buffer.from(rawBody, "utf8"), typeof publicKey === "string" ? createPublicKey(publicKey) : publicKey, signature);
  } catch {
    return false;
  }
}

export type GhlLifecycleWebhook = ReturnType<typeof parseGhlLifecycleWebhook>;

export function parseGhlLifecycleWebhook(rawBody: string) {
  let body: JsonRecord;
  try { body = record(JSON.parse(rawBody)); } catch { throw new ApiError(400, "GHL webhook JSON is invalid.", "ghl_webhook_json_invalid"); }
  const eventType = string(body.type);
  if (!["AppointmentCreate", "AppointmentUpdate", "AppointmentDelete", "ContactUpdate", "OpportunityStatusUpdate", "OutboundMessage"].includes(eventType)) {
    throw new ApiError(400, "GHL webhook event type is unsupported.", "ghl_webhook_type_unsupported");
  }
  const appointment = record(body.appointment);
  const locationId = string(body.locationId);
  const providerObjectId = eventType.startsWith("Appointment")
    ? string(appointment.id)
    : eventType === "OutboundMessage"
      ? string(body.messageId)
      : string(body.id);
  if (!/^[A-Za-z0-9_-]{3,180}$/.test(locationId) || !/^[A-Za-z0-9_-]{3,180}$/.test(providerObjectId)) {
    throw new ApiError(400, "GHL webhook provider identity is invalid.", "ghl_webhook_identity_invalid");
  }
  const payloadFingerprint = createHash("sha256").update(rawBody).digest("hex");
  const eventTimestamp = string(appointment.dateUpdated) || string(appointment.dateAdded) || string(body.dateAdded) || string(body.timestamp);
  const suppliedEventId = string(body.webhookId);
  const providerEventId = suppliedEventId && /^[A-Za-z0-9:_-]{3,240}$/.test(suppliedEventId)
    ? suppliedEventId
    : `${eventType}:${providerObjectId}:${eventTimestamp || payloadFingerprint}`;
  return {
    locationId,
    providerEventId,
    eventType,
    providerObjectId,
    providerContactId: string(appointment.contactId) || string(body.contactId) || null,
    providerCalendarId: string(appointment.calendarId) || null,
    appointmentStatus: string(appointment.appointmentStatus) || string(body.status) || null,
    startsAt: optionalDate(appointment.startTime),
    endsAt: optionalDate(appointment.endTime),
    providerUpdatedAt: optionalDate(eventTimestamp),
    payloadFingerprint,
  };
}
