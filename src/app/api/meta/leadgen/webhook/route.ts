import {
  ApiError,
  apiSuccess,
  handleApiError,
  parseTextBody,
} from "@/lib/api/route";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getHashedRateLimitIdentifier,
  getRateLimitKey,
  getRequestIp,
} from "@/lib/api/rate-limit";
import { isStrongSecretValue } from "@/lib/env";
import {
  META_LEADGEN_WEBHOOK_BODY_LIMIT_BYTES,
  parseMetaLeadgenWebhookPayload,
  timingSafeMetaVerifyTokenEquals,
  verifyMetaLeadgenWebhookSignature,
} from "@/lib/integrations/meta/leadgen-contract";
import { logOperationalEvent } from "@/lib/logging";
import { acceptMetaLeadgenWebhookEvent } from "@/lib/services/meta-leadgen-ingestion-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function consumeInvalidSignatureBucket(request: Request) {
  const ipHash = getHashedRateLimitIdentifier(getRequestIp(request));
  const rateLimit = await consumeRateLimit({
    key: getRateLimitKey(request, "meta-leadgen:invalid-signature", ipHash),
    limit: 20,
    windowMs: 60_000,
  });

  return rateLimit && !rateLimit.allowed
    ? buildRateLimitResponse(rateLimit.resetAt)
    : null;
}

export async function GET(request: Request) {
  try {
    const verifyToken = process.env.META_LEADGEN_VERIFY_TOKEN?.trim() ?? "";
    if (!isStrongSecretValue(verifyToken)) {
      throw new ApiError(
        503,
        "Meta leadgen webhook verification is not configured.",
        "meta_leadgen_verify_token_missing",
      );
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const suppliedToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // codeql[js/user-controlled-bypass] The request values do not grant
    // authority: the supplied token is compared in constant time with a
    // server-only strong secret, and the returned challenge is bounded and
    // emitted only after that secret-backed verification succeeds.
    if (
      mode !== "subscribe" ||
      !challenge ||
      challenge.length > 256 ||
      !timingSafeMetaVerifyTokenEquals(suppliedToken, verifyToken)
    ) {
      throw new ApiError(
        403,
        "Meta leadgen webhook verification was rejected.",
        "meta_leadgen_verification_rejected",
      );
    }

    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, "Meta leadgen webhook verification");
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const rawBody = await parseTextBody(request, {
      maxBytes: META_LEADGEN_WEBHOOK_BODY_LIMIT_BYTES,
      code: "meta_leadgen_body_too_large",
    });
    const appSecret = process.env.META_APP_SECRET?.trim() ?? "";
    if (!isStrongSecretValue(appSecret)) {
      throw new ApiError(
        503,
        "Meta leadgen webhook signing is not configured.",
        "meta_leadgen_app_secret_missing",
      );
    }

    if (
      !verifyMetaLeadgenWebhookSignature({
        rawBody,
        signatureHeader: request.headers.get("x-hub-signature-256"),
        appSecret,
      })
    ) {
      const limited = await consumeInvalidSignatureBucket(request);
      if (limited) {
        return limited;
      }
      throw new ApiError(
        401,
        "Meta leadgen webhook signature is invalid.",
        "meta_leadgen_signature_invalid",
      );
    }

    const events = parseMetaLeadgenWebhookPayload(rawBody);
    const results: Awaited<ReturnType<typeof acceptMetaLeadgenWebhookEvent>>[] = [];

    for (let index = 0; index < events.length; index += 5) {
      const chunk = events.slice(index, index + 5);
      results.push(
        ...(await Promise.all(
          chunk.map((event) =>
            acceptMetaLeadgenWebhookEvent({ event, requestId }),
          ),
        )),
      );
    }

    const counts = results.reduce<Record<string, number>>((summary, result) => {
      summary[result.disposition] = (summary[result.disposition] ?? 0) + 1;
      return summary;
    }, {});

    logOperationalEvent("meta_leadgen.webhook_delivery_accepted", {
      requestId,
      eventCount: events.length,
      dispositions: counts,
      communicationsEnabled: false,
      capiEnabled: false,
      providerMutationEnabled: false,
    });

    return apiSuccess({
      received: true,
      eventCount: events.length,
      queuedCount: results.filter((result) => result.queued).length,
      dispositions: counts,
      requestId,
    });
  } catch (error) {
    return handleApiError(error, "Meta leadgen webhook");
  }
}
