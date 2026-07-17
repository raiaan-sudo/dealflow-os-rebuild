import { createHash, createPublicKey, verify } from "node:crypto";
import { ApiError } from "@/lib/api/route";

export const GHL_WEBHOOK_BODY_LIMIT_BYTES = 128 * 1024;
export const GHL_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;
export const GHL_LEGACY_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;
export const GHL_LEGACY_SIGNATURE_CUTOFF_MS = Date.parse("2026-09-01T00:00:00.000Z");

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function boundedString(value: unknown, maximum: number, field: string) {
  const candidate = string(value);
  if (candidate.length > maximum) {
    throw new ApiError(400, `GHL webhook ${field} is too long.`, "ghl_webhook_field_too_long");
  }
  return candidate;
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

export function verifyGhlWebhookSignatures(
  rawBody: string,
  headers: { ghl: string | null; legacy: string | null },
  options: {
    now?: Date;
    ed25519PublicKey?: string | ReturnType<typeof createPublicKey>;
    legacyPublicKey?: string | ReturnType<typeof createPublicKey>;
  } = {},
) {
  // A present current signature is authoritative. Never downgrade to the
  // legacy signature when an attacker supplies an invalid current header.
  if (headers.ghl) {
    return verifyGhlWebhookSignature(
      rawBody,
      headers.ghl,
      options.ed25519PublicKey ?? GHL_ED25519_PUBLIC_KEY,
    );
  }
  if (
    !headers.legacy ||
    (options.now ?? new Date()).getTime() >= GHL_LEGACY_SIGNATURE_CUTOFF_MS ||
    headers.legacy.length > 2_048
  ) return false;
  try {
    return verify(
      "sha256",
      Buffer.from(rawBody, "utf8"),
      options.legacyPublicKey ?? GHL_LEGACY_RSA_PUBLIC_KEY,
      Buffer.from(headers.legacy, "base64"),
    );
  } catch {
    return false;
  }
}

export type GhlLifecycleWebhook = ReturnType<typeof parseGhlLifecycleWebhook>;

export function parseGhlLifecycleWebhook(rawBody: string) {
  let body: JsonRecord;
  try { body = record(JSON.parse(rawBody)); } catch { throw new ApiError(400, "GHL webhook JSON is invalid.", "ghl_webhook_json_invalid"); }
  const eventType = string(body.type);
  if (!["AppointmentCreate", "AppointmentUpdate", "AppointmentDelete", "ContactCreate", "ContactUpdate", "OpportunityStatusUpdate", "OutboundMessage"].includes(eventType)) {
    throw new ApiError(400, "GHL webhook event type is unsupported.", "ghl_webhook_type_unsupported");
  }
  const appointment = record(body.appointment);
  const locationId = string(body.locationId);
  const payloadFingerprint = createHash("sha256").update(rawBody).digest("hex");
  const eventTimestamp = boundedString(
    eventType.startsWith("Appointment")
      ? appointment.dateUpdated || body.timestamp || appointment.dateAdded || body.dateAdded
      : eventType === "ContactUpdate"
        // ContactUpdate.dateAdded is the contact creation time, not an update
        // version. Using it would make unrelated updates appear concurrent.
        ? body.timestamp
        : body.timestamp || body.dateAdded,
    100,
    "timestamp",
  );
  const suppliedEventId = string(body.webhookId);
  const validSuppliedEventId = suppliedEventId && /^[A-Za-z0-9:_-]{3,240}$/.test(suppliedEventId)
    ? suppliedEventId
    : "";
  const outboundDirectId = string(body.messageId) || string(body.emailMessageId);
  const outboundConversationId = string(body.conversationProviderId) || string(body.conversationId);
  const outboundFallbackId = validSuppliedEventId
    ? `outbound_${createHash("sha256").update(validSuppliedEventId).digest("hex")}`
    : outboundConversationId
      ? `outbound_${createHash("sha256").update(`${outboundConversationId}:${eventTimestamp || payloadFingerprint}`).digest("hex")}`
      : "";
  const providerObjectId = eventType.startsWith("Appointment")
    ? string(appointment.id)
    : eventType === "OutboundMessage"
      ? outboundDirectId || outboundFallbackId
      : string(body.id);
  if (!/^[A-Za-z0-9_-]{3,180}$/.test(locationId) || !/^[A-Za-z0-9_-]{3,180}$/.test(providerObjectId)) {
    throw new ApiError(400, "GHL webhook provider identity is invalid.", "ghl_webhook_identity_invalid");
  }
  const providerEventId = validSuppliedEventId
    ? validSuppliedEventId
    : `${eventType}:${createHash("sha256").update(`${providerObjectId}:${eventTimestamp || payloadFingerprint}`).digest("hex")}`;
  const providerContactId = eventType === "ContactCreate" || eventType === "ContactUpdate"
    ? providerObjectId
    : boundedString(appointment.contactId || body.contactId, 180, "contact identity") || null;
  return {
    locationId,
    providerEventId,
    eventType,
    providerObjectId,
    providerContactId,
    providerCalendarId: boundedString(appointment.calendarId, 180, "calendar identity") || null,
    appointmentStatus: boundedString(appointment.appointmentStatus || body.status, 180, "status") || null,
    startsAt: optionalDate(appointment.startTime),
    endsAt: optionalDate(appointment.endTime),
    providerUpdatedAt: optionalDate(eventTimestamp),
    payloadFingerprint,
  };
}
