import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api/route";
import { isStrongSecretValue } from "@/lib/env";

export const SUPPORT_LIFECYCLE_BODY_LIMIT_BYTES = 64 * 1024;
export const SUPPORT_LIFECYCLE_MAX_CLOCK_SKEW_SECONDS = 300;

const callbackSchema = z.object({
  eventId: z.string().trim().regex(/^[A-Za-z0-9._:-]{8,300}$/),
  eventType: z.enum(["accepted", "delivered", "bounced", "complained", "suppressed"]),
  providerReceiptId: z.string().trim().min(1).max(300),
  occurredAt: z.string().datetime({ offset: true }),
}).strict();

export type SupportLifecycleCallback = z.infer<typeof callbackSchema> & {
  payloadDigest: string;
};

function signatureBuffer(value: string | null) {
  if (!value?.startsWith("sha256=")) return null;
  const digest = value.slice("sha256=".length);
  return /^[a-f0-9]{64}$/.test(digest) ? Buffer.from(digest, "hex") : null;
}

export function verifyAndParseSupportLifecycleCallback(params: {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  secret?: string | null;
  nowMs?: number;
}): SupportLifecycleCallback {
  const secret = params.secret?.trim() ?? process.env.SUPPORT_DELIVERY_CALLBACK_SECRET?.trim() ?? "";
  if (!isStrongSecretValue(secret)) {
    throw new ApiError(503, "Support delivery callback signing is not configured.", "support_callback_secret_missing");
  }
  const bodyBytes = Buffer.byteLength(params.rawBody, "utf8");
  if (bodyBytes === 0 || bodyBytes > SUPPORT_LIFECYCLE_BODY_LIMIT_BYTES) {
    throw new ApiError(413, "Support delivery callback body is invalid.", "support_callback_body_invalid");
  }
  const timestamp = Number(params.timestampHeader);
  const nowMs = params.nowMs ?? Date.now();
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowMs - timestamp * 1_000) > SUPPORT_LIFECYCLE_MAX_CLOCK_SKEW_SECONDS * 1_000
  ) {
    throw new ApiError(401, "Support delivery callback timestamp is invalid.", "support_callback_timestamp_invalid");
  }
  const supplied = signatureBuffer(params.signatureHeader);
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${params.rawBody}`, "utf8")
    .digest();
  if (!supplied || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ApiError(401, "Support delivery callback signature is invalid.", "support_callback_signature_invalid");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(params.rawBody);
  } catch {
    throw new ApiError(400, "Support delivery callback JSON is invalid.", "support_callback_json_invalid");
  }
  const result = callbackSchema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(400, "Support delivery callback payload is invalid.", "support_callback_payload_invalid");
  }
  if (Date.parse(result.data.occurredAt) > nowMs + SUPPORT_LIFECYCLE_MAX_CLOCK_SKEW_SECONDS * 1_000) {
    throw new ApiError(400, "Support delivery callback time is invalid.", "support_callback_event_time_invalid");
  }
  return {
    ...result.data,
    payloadDigest: createHmac("sha256", secret).update(params.rawBody, "utf8").digest("hex"),
  };
}
