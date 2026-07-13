import { getHiggsfieldGenerationEnv } from "@/lib/env";
import { resolveProviderEndpoint } from "@/lib/integrations/provider-endpoint-policy";

export type HiggsfieldProviderUsageOutcome =
  | "released"
  | "rejected"
  | "operator_action_required";

export class HiggsfieldProviderUsageError extends Error {
  constructor(
    message: string,
    readonly providerUsageOutcome: HiggsfieldProviderUsageOutcome,
  ) {
    super(message);
    this.name = "HiggsfieldProviderUsageError";
  }
}

export type HiggsfieldStatusResult = {
  requestId: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "unknown";
  videoUrl: string | null;
  error: string | null;
  raw: Record<string, unknown> | null;
};

function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function parseJsonSafe(response: Response) {
  return response
    .json()
    .catch(() => null) as Promise<Record<string, unknown> | null>;
}

function extractError(data: Record<string, unknown> | null) {
  if (!data) return "";
  const detail = data.detail;
  if (typeof detail === "string") return detail.trim();
  if (detail && typeof detail === "object") {
    const message = safeText((detail as Record<string, unknown>).message);
    if (message) return message;
  }
  return safeText(data.message) || safeText(data.error);
}

function normalizeStatus(value: unknown): HiggsfieldStatusResult["status"] {
  const status = safeText(value).toLowerCase();
  if (
    status === "queued" ||
    status === "in_progress" ||
    status === "completed" ||
    status === "failed" ||
    status === "nsfw"
  ) {
    return status;
  }
  return "unknown";
}

function getConfig() {
  if (process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION !== "true") {
    throw new HiggsfieldProviderUsageError(
      "Higgsfield video generation is disabled until its paid-provider guard is explicitly enabled.",
      "released",
    );
  }

  const env = getHiggsfieldGenerationEnv();
  if (!env?.apiKey || !env.apiSecret || !env.credentialsValid) {
    throw new HiggsfieldProviderUsageError(
      "Higgsfield credentials are missing or invalid.",
      "released",
    );
  }

  if (env.apiKey.includes("***") || env.apiSecret.includes("***")) {
    throw new HiggsfieldProviderUsageError(
      "Higgsfield credentials appear masked or incomplete.",
      "released",
    );
  }

  return {
    authorization: `Key ${env.apiKey}:${env.apiSecret}`,
    baseUrl: resolveProviderEndpoint({
      provider: "higgsfield",
      baseUrl: env.baseUrl,
    }).baseUrl,
    model:
      env.model === "dop-lite" || env.model === "dop-standard"
        ? env.model
        : "dop-turbo",
  } as const;
}

function normalizeInputImageUrl(value: string | null | undefined) {
  let parsed: URL;
  try {
    parsed = new URL(safeText(value));
  } catch {
    throw new HiggsfieldProviderUsageError(
      "Higgsfield image-to-video generation requires an absolute source image URL.",
      "released",
    );
  }

  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    parsed.hostname.toLowerCase(),
  );
  if (
    parsed.username ||
    parsed.password ||
    (parsed.protocol !== "https:" &&
      !(
        loopback &&
        process.env.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT === "true"
      ))
  ) {
    throw new HiggsfieldProviderUsageError(
      "Higgsfield source images must use credential-free HTTPS URLs.",
      "released",
    );
  }

  return parsed.toString();
}

export function getHiggsfieldProviderUsageOutcome(error: unknown) {
  return error instanceof HiggsfieldProviderUsageError
    ? error.providerUsageOutcome
    : "operator_action_required";
}

export async function createHiggsfieldVideo(request: {
  prompt: string;
  inputImageUrl: string;
}) {
  const prompt = safeText(request.prompt);
  if (prompt.length < 10) {
    throw new HiggsfieldProviderUsageError("Video prompt is too short.", "released");
  }

  const config = getConfig();
  const inputImageUrl = normalizeInputImageUrl(request.inputImageUrl);
  let response: Response;
  let data: Record<string, unknown> | null;

  try {
    response = await fetch(`${config.baseUrl}/v1/image2video/dop`, {
      method: "POST",
      headers: {
        Authorization: config.authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
        input_images: [{ type: "image_url", image_url: inputImageUrl }],
        enhance_prompt: true,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    data = await parseJsonSafe(response);
  } catch (error) {
    throw new HiggsfieldProviderUsageError(
      error instanceof Error ? error.message : "Higgsfield dispatch failed.",
      "operator_action_required",
    );
  }

  if (!response.ok) {
    throw new HiggsfieldProviderUsageError(
      extractError(data) || `Higgsfield rejected the request with HTTP ${response.status}.`,
      "rejected",
    );
  }

  const requestId = safeText(data?.request_id);
  if (!requestId) {
    throw new HiggsfieldProviderUsageError(
      "Higgsfield accepted the request without returning a request_id.",
      "operator_action_required",
    );
  }

  return {
    requestId,
    status: normalizeStatus(data?.status),
    model: config.model,
    raw: data,
  };
}

export async function getHiggsfieldVideoStatus(requestId: string): Promise<HiggsfieldStatusResult> {
  const normalizedId = safeText(requestId);
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(normalizedId)) {
    throw new Error("Invalid Higgsfield request id.");
  }
  const config = getConfig();
  const response = await fetch(
    `${config.baseUrl}/requests/${encodeURIComponent(normalizedId)}/status`,
    {
      method: "GET",
      headers: { Authorization: config.authorization },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(
      extractError(data) || `Higgsfield status request failed with HTTP ${response.status}.`,
    );
  }

  const status = normalizeStatus(data?.status);
  const video =
    data?.video && typeof data.video === "object"
      ? (data.video as Record<string, unknown>)
      : null;

  return {
    requestId: normalizedId,
    status,
    videoUrl: safeText(video?.url) || null,
    error: status === "failed" || status === "nsfw" ? extractError(data) || status : null,
    raw: data,
  };
}
