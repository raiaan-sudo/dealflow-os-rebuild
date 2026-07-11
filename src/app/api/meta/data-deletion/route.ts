import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getMetaEnv, getPublicAppUrl } from "@/lib/env";
import { ApiError, apiFailure, parseTextBody } from "@/lib/api/route";
import { encryptSecret } from "@/lib/integrations/meta-crypto";
import { logOperationalEvent, logWarn } from "@/lib/logging";
import {
  acceptMetaDeletionResponsibility,
  getMetaDeletionConfirmationCode,
  getMetaDeletionRequestHash,
  getMetaDeletionUserHash,
  validateMetaDeletionIssuedAt,
} from "@/lib/services/meta-deletion-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MetaSignedRequestPayload = {
  algorithm?: string;
  issued_at?: number;
  user_id?: string;
};

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function parseSignedRequest(signedRequest: string, appSecret: string) {
  const [encodedSignature, encodedPayload] = signedRequest.split(".");

  if (!encodedSignature || !encodedPayload) {
    throw new ApiError(400, "Signed request is malformed.", "invalid_signed_request");
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8")) as MetaSignedRequestPayload;
  const algorithm = payload.algorithm?.toUpperCase();

  if (algorithm !== "HMAC-SHA256") {
    throw new ApiError(400, "Signed request algorithm is unsupported.", "invalid_signed_request_algorithm");
  }

  const expectedSignature = createHmac("sha256", appSecret).update(encodedPayload).digest();
  const actualSignature = decodeBase64Url(encodedSignature);

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new ApiError(400, "Signed request signature is invalid.", "invalid_signed_request_signature");
  }

  return { payload, encodedPayload };
}

export async function GET() {
  const appUrl = getPublicAppUrl();

  return NextResponse.json({
    status: "ok",
    instructions_url: `${appUrl}/data-deletion`,
  });
}

export async function POST(request: Request) {
  try {
    const env = getMetaEnv();

    if (!env) {
      throw new ApiError(503, "Meta environment is not configured.", "meta_config_missing");
    }

    const body = await parseTextBody(request, {
      maxBytes: 32 * 1024,
      code: "meta_data_deletion_body_too_large",
    });
    const params = new URLSearchParams(body);
    const signedRequest = params.get("signed_request");

    if (!signedRequest) {
      throw new ApiError(400, "Missing Meta signed_request.", "missing_signed_request");
    }

    const { payload, encodedPayload } = parseSignedRequest(signedRequest, env.appSecret);
    if (typeof payload.user_id !== "string" || !payload.user_id.trim()) {
      throw new ApiError(
        400,
        "Signed request does not identify a Meta user.",
        "missing_signed_request_user",
      );
    }

    const freshnessStatus = validateMetaDeletionIssuedAt(payload.issued_at);
    const requestHash = getMetaDeletionRequestHash({
      appId: env.appId,
      encodedPayload,
    });
    const confirmationCode = getMetaDeletionConfirmationCode(requestHash);
    const userHash = getMetaDeletionUserHash(env.appId, payload.user_id);
    const responsibility = await acceptMetaDeletionResponsibility({
      requestHash,
      confirmationCode,
      userHash,
      userIdEncrypted: encryptSecret(payload.user_id, env.encryptionKey),
      issuedAt: payload.issued_at,
      freshnessStatus,
    });
    const appUrl = getPublicAppUrl();
    const deletionUrl = new URL("/data-deletion", appUrl);
    deletionUrl.searchParams.set("code", responsibility.confirmationCode);

    logOperationalEvent("meta_data_deletion_callback_received", {
      userHash: userHash.slice(0, 12),
      requestHash: requestHash.slice(0, 12),
      issuedAt: payload.issued_at ?? null,
      freshnessStatus,
      responsibilityStatus: responsibility.responsibilityStatus,
      replayed: responsibility.replayed,
    });

    return NextResponse.json({
      url: deletionUrl.toString(),
      confirmation_code: responsibility.confirmationCode,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      logWarn("meta_data_deletion_callback_rejected", {
        code: error.code,
        status: error.status,
      });
      return apiFailure(
        error.status >= 500
          ? "Deletion request responsibility is temporarily unavailable."
          : error.message,
        error.code,
        error.status,
      );
    }

    logWarn("meta_data_deletion_callback_rejected", {
      code: "invalid_signed_request",
    });
    return apiFailure("Signed request is invalid.", "invalid_signed_request", 400);
  }
}
