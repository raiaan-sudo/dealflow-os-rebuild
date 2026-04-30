import crypto from "crypto";
import { ApiError, apiSuccess, handleApiError } from "@/lib/api/route";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VercelWebhookPayload = {
  id?: string;
  type?: string;
  createdAt?: string | number;
  payload?: {
    deployment?: {
      id?: string;
      url?: string;
      name?: string;
      state?: string;
      target?: string;
    };
    project?: {
      id?: string;
      name?: string;
    };
    error?: {
      code?: string;
      message?: string;
    };
  };
};

function getWebhookSecret() {
  return process.env.VERCEL_WEBHOOK_SECRET?.trim() || null;
}

function timingSafeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifyVercelSignature(rawBody: string, signature: string | null) {
  const secret = getWebhookSecret();

  if (!secret) {
    throw new ApiError(503, "Vercel webhook verification is not configured.", "vercel_webhook_secret_missing");
  }

  if (!signature) {
    throw new ApiError(401, "Missing Vercel webhook signature.", "vercel_webhook_signature_missing");
  }

  const expected = crypto.createHmac("sha1", secret).update(rawBody).digest("hex");

  if (!timingSafeEqual(signature, expected)) {
    throw new ApiError(401, "Invalid Vercel webhook signature.", "vercel_webhook_signature_invalid");
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    verifyVercelSignature(rawBody, request.headers.get("x-vercel-signature"));

    const event = JSON.parse(rawBody) as VercelWebhookPayload;
    const deployment = event.payload?.deployment;
    const project = event.payload?.project;
    const logPayload = {
      eventId: event.id ?? null,
      type: event.type ?? null,
      createdAt: event.createdAt ?? null,
      deploymentId: deployment?.id ?? null,
      deploymentUrl: deployment?.url ?? null,
      deploymentState: deployment?.state ?? null,
      target: deployment?.target ?? null,
      projectId: project?.id ?? null,
      projectName: project?.name ?? deployment?.name ?? null,
      errorCode: event.payload?.error?.code ?? null,
      errorMessage: event.payload?.error?.message ?? null,
    };

    if (event.type === "deployment.error") {
      logError("vercel.deployment.error", logPayload);
    } else if (event.type === "deployment.canceled") {
      logWarn("vercel.deployment.canceled", logPayload);
    } else {
      logOperationalEvent("vercel.deployment.event", logPayload);
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error, "Vercel webhook");
  }
}
