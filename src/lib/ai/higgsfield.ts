import {
  getHiggsfieldEnv,
  getMediaGenerationProvider,
  validateHiggsfieldEnv,
} from "@/lib/env";

export type HiggsfieldGenerationStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw"
  | "unknown";

export type HiggsfieldGenerationResult = {
  requestId: string | null;
  status: HiggsfieldGenerationStatus;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  providerModel: string;
  rawStatus?: HiggsfieldGenerationStatus | string | null;
};

export type HiggsfieldImageRequest = {
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio?: string | null;
  model?: string | null;
};

export type HiggsfieldVideoRequest = {
  prompt: string;
  script?: string | null;
  title?: string | null;
  aspectRatio?: string | null;
  model?: string | null;
};

type HiggsfieldResponseShape = {
  status?: string;
  request_id?: string;
  id?: string;
  images?: Array<{ url?: string | null }>;
  video?: { url?: string | null; thumbnail_url?: string | null } | null;
  jobs?: Array<{
    id?: string | null;
    status?: string | null;
    results?: {
      raw?: { url?: string | null; thumbnail_url?: string | null };
      min?: { url?: string | null };
    } | null;
  }>;
};

type HiggsfieldImageInput = {
  prompt: string;
  aspect_ratio?: string;
  resolution?: "1k" | "2k" | "4k";
  width_and_height?: string;
  quality?: "720p" | "1080p";
  batch_size?: 1 | 4;
  enhance_prompt?: boolean;
};

function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function normalizeStatus(value: unknown): HiggsfieldGenerationStatus {
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

function getHiggsfieldCredentials() {
  const env = getHiggsfieldEnv();

  if (getMediaGenerationProvider() !== "higgsfield") {
    return null;
  }

  if (!env?.credentials) {
    return null;
  }

  return env;
}

export function isHiggsfieldConfigured() {
  return Boolean(getHiggsfieldCredentials());
}

export function getHiggsfieldConfigValidation() {
  if (getMediaGenerationProvider() !== "higgsfield") {
    return {
      configured: false,
      missing: ["MEDIA_GENERATION_PROVIDER=higgsfield"],
    };
  }

  return validateHiggsfieldEnv();
}

async function createClient() {
  const env = getHiggsfieldCredentials();

  if (!env) {
    throw new Error("Higgsfield media generation is not configured.");
  }

  const { createHiggsfieldClient } = await import("@higgsfield/client/v2");

  return createHiggsfieldClient({
    credentials: env.credentials,
    baseURL: env.baseUrl,
    timeout: 120_000,
    maxRetries: 1,
    pollInterval: 2_500,
    maxPollTime: 240_000,
  });
}

function extractResult(
  response: HiggsfieldResponseShape,
  fallbackModel: string,
): HiggsfieldGenerationResult {
  const firstJob = response.jobs?.[0] ?? null;
  const rawUrl =
    response.images?.[0]?.url ??
    response.video?.url ??
    firstJob?.results?.raw?.url ??
    firstJob?.results?.min?.url ??
    null;
  const thumbnailUrl =
    response.video?.thumbnail_url ??
    firstJob?.results?.raw?.thumbnail_url ??
    firstJob?.results?.min?.url ??
    rawUrl ??
    null;
  const requestId =
    safeText(response.request_id) ||
    safeText(response.id) ||
    safeText(firstJob?.id) ||
    null;
  const rawStatus = response.status ?? firstJob?.status ?? null;

  return {
    requestId,
    status: normalizeStatus(rawStatus),
    fileUrl: rawUrl ? safeText(rawUrl) : null,
    thumbnailUrl: thumbnailUrl ? safeText(thumbnailUrl) : null,
    providerModel: fallbackModel,
    rawStatus,
  };
}

function buildPromptWithGuardrails(request: HiggsfieldImageRequest | HiggsfieldVideoRequest) {
  const prompt = safeText("script" in request ? request.prompt || request.script : request.prompt);
  const negativePrompt =
    "negativePrompt" in request ? safeText(request.negativePrompt) : "";

  return [
    prompt,
    "Create polished paid social ad creative for a real estate lead generation campaign.",
    "Use realistic composition, clean commercial lighting, premium but believable styling, and no embedded text.",
    negativePrompt ? `Avoid: ${negativePrompt}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function mapAspectRatioToSoulSize(aspectRatio: string) {
  if (aspectRatio === "9:16" || aspectRatio === "4:5") {
    return "1536x2048";
  }

  if (aspectRatio === "16:9") {
    return "2048x1152";
  }

  return "1536x1536";
}

function buildImageInput(model: string, request: HiggsfieldImageRequest): HiggsfieldImageInput {
  const aspectRatio = safeText(request.aspectRatio) || "1:1";
  const prompt = buildPromptWithGuardrails(request);

  if (model === "/v1/text2image/soul" || model === "text2image_soul_v2") {
    return {
      prompt,
      width_and_height: mapAspectRatioToSoulSize(aspectRatio),
      quality: "1080p",
      batch_size: 1,
      enhance_prompt: true,
    };
  }

  return {
    prompt,
    aspect_ratio: aspectRatio,
    resolution: "1k",
  };
}

export async function generateHiggsfieldImage(
  request: HiggsfieldImageRequest,
): Promise<HiggsfieldGenerationResult> {
  const env = getHiggsfieldCredentials();

  if (!env) {
    throw new Error("Higgsfield image generation is not configured.");
  }

  const model = safeText(request.model) || env.imageModel;
  const client = await createClient();
  const response = await client.subscribe(model, {
    input: buildImageInput(model, request),
    withPolling: true,
  });

  return extractResult(response as HiggsfieldResponseShape, model);
}

export async function createHiggsfieldVideo(
  request: HiggsfieldVideoRequest,
): Promise<HiggsfieldGenerationResult> {
  const env = getHiggsfieldCredentials();

  if (!env) {
    throw new Error("Higgsfield video generation is not configured.");
  }

  const model = safeText(request.model) || env.videoModel;
  const client = await createClient();
  const response = await client.subscribe(model, {
    input: {
      prompt: buildPromptWithGuardrails(request),
      aspect_ratio: safeText(request.aspectRatio) || "9:16",
      title: safeText(request.title) || "Campaign video ad",
      enhance_prompt: true,
    },
    withPolling: false,
  });

  return extractResult(response as HiggsfieldResponseShape, model);
}

export async function getHiggsfieldGenerationStatus(
  requestId: string,
): Promise<HiggsfieldGenerationResult> {
  const env = getHiggsfieldCredentials();
  const normalizedRequestId = safeText(requestId);

  if (!env) {
    throw new Error("Higgsfield media generation is not configured.");
  }

  if (!normalizedRequestId) {
    throw new Error("Missing Higgsfield request id.");
  }

  const response = await fetch(
    `${env.baseUrl.replace(/\/$/, "")}/requests/${encodeURIComponent(normalizedRequestId)}/status`,
    {
      method: "GET",
      headers: {
        Authorization: `Key ${env.credentials}`,
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const data = (await response.json().catch(() => null)) as HiggsfieldResponseShape | null;

  if (!response.ok) {
    throw new Error("Higgsfield status request failed.");
  }

  return extractResult(
    {
      ...(data ?? {}),
      request_id: data?.request_id ?? normalizedRequestId,
    },
    getHiggsfieldEnv()?.videoModel ?? "marketing_studio_video",
  );
}
