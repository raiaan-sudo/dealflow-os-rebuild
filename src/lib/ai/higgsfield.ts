import { getHiggsfieldGenerationEnv, getPublicAppUrl } from "@/lib/env";
import { resolveProviderEndpoint } from "@/lib/integrations/provider-endpoint-policy";
import { isPublicNetworkAddress } from "@/lib/security/public-network-address";
import { lookup as lookupDns } from "node:dns/promises";
import { isIP } from "node:net";

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

function getConfig(options: { requireDispatchAuthorization: boolean }) {
  if (
    options.requireDispatchAuthorization &&
    process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION !== "true"
  ) {
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

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const testTransport =
    process.env.NODE_ENV === "test" &&
    process.env.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT === "true";
  const trustedSuffixes = [
    "blob.core.windows.net",
    "openai.com",
    "supabase.co",
    "supabase.in",
    "replicate.delivery",
  ];
  const trustedTestHost = testTransport && host.endsWith(".example.test");
  const trustedProviderHost = trustedSuffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
  let firstPartyHost = "";
  try {
    firstPartyHost = new URL(getPublicAppUrl()).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    firstPartyHost = "";
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.port ||
    parsed.protocol !== "https:" ||
    !host ||
    isIP(host) ||
    (!trustedProviderHost && !trustedTestHost && host !== firstPartyHost)
  ) {
    throw new HiggsfieldProviderUsageError(
      "Higgsfield source images must use a trusted canonical HTTPS asset host.",
      "released",
    );
  }

  return { url: parsed.toString(), host, skipDnsForTest: trustedTestHost };
}

async function verifyInputImageUrl(value: string | null | undefined) {
  const normalized = normalizeInputImageUrl(value);
  if (!normalized.skipDnsForTest) {
    const addresses = await lookupDns(normalized.host, { all: true, verbatim: true })
      .catch(() => []);
    if (
      addresses.length === 0 ||
      addresses.some((entry) => !isPublicNetworkAddress(entry.address))
    ) {
      throw new HiggsfieldProviderUsageError(
        "Higgsfield source image host could not be verified as public.",
        "released",
      );
    }
  }
  return normalized.url;
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

  const config = getConfig({ requireDispatchAuthorization: true });
  const inputImageUrl = await verifyInputImageUrl(request.inputImageUrl);
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
    const definitivelyRejected =
      response.status >= 400 &&
      response.status < 500 &&
      ![408, 409, 425, 429].includes(response.status);
    throw new HiggsfieldProviderUsageError(
      extractError(data) || `Higgsfield rejected the request with HTTP ${response.status}.`,
      definitivelyRejected ? "rejected" : "operator_action_required",
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
  // Reconciliation must stay available after dispatch even if the paid-create
  // switch is subsequently disabled. Credentials and endpoint policy remain
  // mandatory; this never authorizes a new generation.
  const config = getConfig({ requireDispatchAuthorization: false });
  let response: Response;
  let data: Record<string, unknown> | null;
  try {
    response = await fetch(
      `${config.baseUrl}/requests/${encodeURIComponent(normalizedId)}/status`,
      {
        method: "GET",
        headers: { Authorization: config.authorization },
        signal: AbortSignal.timeout(30_000),
      },
    );
    data = await parseJsonSafe(response);
  } catch (error) {
    throw new HiggsfieldProviderUsageError(
      error instanceof Error ? error.message : "Higgsfield status request failed.",
      "operator_action_required",
    );
  }
  if (!response.ok) {
    throw new HiggsfieldProviderUsageError(
      extractError(data) || `Higgsfield status request failed with HTTP ${response.status}.`,
      "operator_action_required",
    );
  }

  const returnedRequestId = safeText(data?.request_id);
  if (returnedRequestId && returnedRequestId !== normalizedId) {
    throw new HiggsfieldProviderUsageError(
      "Higgsfield status response did not match the requested generation identity.",
      "operator_action_required",
    );
  }

  const status = normalizeStatus(data?.status);
  const video =
    data?.video && typeof data.video === "object"
      ? (data.video as Record<string, unknown>)
      : null;

  const rawVideoUrl = safeText(video?.url);
  let videoUrl: string | null = null;
  if (rawVideoUrl) {
    try {
      const parsed = new URL(rawVideoUrl);
      const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
        parsed.hostname.toLowerCase(),
      );
      if (
        !parsed.username &&
        !parsed.password &&
        (parsed.protocol === "https:" ||
          (loopback && process.env.ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT === "true"))
      ) {
        videoUrl = parsed.toString();
      }
    } catch {
      videoUrl = null;
    }
  }

  if (status === "completed" && !videoUrl) {
    throw new HiggsfieldProviderUsageError(
      "Higgsfield reported completion without a safe credential-free video URL.",
      "operator_action_required",
    );
  }

  return {
    requestId: normalizedId,
    status,
    videoUrl,
    error: status === "failed" || status === "nsfw" ? extractError(data) || status : null,
    raw: data,
  };
}
