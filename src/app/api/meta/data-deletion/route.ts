import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getMetaEnv, getPublicAppUrl } from "@/lib/env";
import { ApiError, apiFailure, parseTextBody } from "@/lib/api/route";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getHashedRateLimitIdentifier,
  getRateLimitKey,
  getRequestIp,
} from "@/lib/api/rate-limit";
import { logOperationalEvent, logWarn } from "@/lib/logging";

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

  return payload;
}

function getConfirmationCode(payload: MetaSignedRequestPayload, appId: string) {
  return createHash("sha256")
    .update(`${appId}:${payload.user_id ?? "unknown"}:${payload.issued_at ?? "unknown"}`)
    .digest("hex")
    .slice(0, 16);
}

async function consumeInvalidSignedRequestBucket(request: Request) {
  const ipHash = getHashedRateLimitIdentifier(getRequestIp(request));
  const rateLimit = await consumeRateLimit({
    key: getRateLimitKey(request, "meta-data-deletion:invalid-signed-request", ipHash),
    limit: 20,
    windowMs: 60_000,
  });

  if (rateLimit && !rateLimit.allowed) {
    return buildRateLimitResponse(rateLimit.resetAt);
  }

  return null;
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

    const payload = parseSignedRequest(signedRequest, env.appSecret);
    const appUrl = getPublicAppUrl();
    const confirmationCode = getConfirmationCode(payload, env.appId);
    const deletionUrl = new URL("/data-deletion", appUrl);
    deletionUrl.searchParams.set("code", confirmationCode);

    logOperationalEvent("meta_data_deletion_callback_received", {
      userHash: payload.user_id
        ? createHash("sha256").update(payload.user_id).digest("hex").slice(0, 12)
        : null,
      issuedAt: payload.issued_at ?? null,
      confirmationCode,
    });

    return NextResponse.json({
      url: deletionUrl.toString(),
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status >= 400 && error.status < 500) {
        const limited = await consumeInvalidSignedRequestBucket(request);
        if (limited) {
          return limited;
        }
      }

      logWarn("meta_data_deletion_callback_rejected", {
        code: error.code,
        status: error.status,
      });
      return apiFailure(error.message, error.code, error.status);
    }

    logWarn("meta_data_deletion_callback_rejected", {
      code: "invalid_signed_request",
    });
    return apiFailure("Signed request is invalid.", "invalid_signed_request", 400);
  }
}
