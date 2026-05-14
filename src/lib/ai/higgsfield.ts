import { accessSync, constants as fsConstants } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  getHiggsfieldEnv,
  getHiggsfieldMarketingStudioEnv,
  getMediaGenerationProvider,
  validateHiggsfieldEnv,
} from "@/lib/env";
import { fetchStaticCreativeProviderImage } from "@/lib/services/static-creative-storage-normalization";

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
  inputImageUrl?: string | null;
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

type HiggsfieldVideoInput = {
  model: "dop-lite" | "dop-turbo" | "dop-standard";
  prompt: string;
  input_images: Array<{
    type: "image_url";
    image_url: string;
  }>;
  motions?: Array<{
    id: string;
    strength: number;
  }>;
  enhance_prompt?: boolean;
};

const HIGGSFIELD_SOUL_TEXT_TO_IMAGE_ENDPOINT = "/v1/text2image/soul";
const HIGGSFIELD_IMAGE_TO_VIDEO_ENDPOINT = "/v1/image2video/dop";
const HIGGSFIELD_MARKETING_STUDIO_IMAGE_MODEL = "marketing_studio_image";
const HIGGSFIELD_MARKETING_STUDIO_VIDEO_MODEL = "marketing_studio_video";
const DEFAULT_HIGGSFIELD_VIDEO_MODEL = "dop-turbo";

export type HiggsfieldCliReadiness = {
  enabled: boolean;
  ready: boolean;
  mode: "cli" | "api_adapter";
  cliPath: string;
  resolvedPath: string | null;
  reason: string | null;
  mcpStatus: "future_only";
};

function isHiggsfieldProviderSelected() {
  const provider = getMediaGenerationProvider();
  return provider === "higgsfield" || provider === "higgsfield_marketing_studio";
}

function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function resolveExecutablePath(command: string) {
  const value = safeText(command);

  if (!value) {
    return null;
  }

  const candidates = value.includes("/")
    ? [value]
    : (process.env.PATH ?? "")
        .split(path.delimiter)
        .filter(Boolean)
        .map((entry) => path.join(entry, value));

  for (const candidate of candidates) {
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

export function buildHiggsfieldCliEnvironment(sourceEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allowedKeys = new Set([
    "NODE_ENV",
    "PATH",
    "HOME",
    "TMPDIR",
    "HF_CREDENTIALS",
    "HF_API_KEY",
    "HF_API_SECRET",
    "HIGGSFIELD_BASE_URL",
    "HIGGSFIELD_CONFIG_HOME",
    "HIGGSFIELD_CACHE_DIR",
    "HIGGSFIELD_OUTPUT_DIR",
    "MARKETING_STUDIO_WORKER_OUTPUT_DIR",
  ]);
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: sourceEnv.NODE_ENV ?? "production",
  };

  for (const key of allowedKeys) {
    const value = sourceEnv[key];
    if (typeof value === "string" && value.trim()) {
      env[key] = value;
    }
  }

  return env;
}

export function getHiggsfieldMarketingStudioCliReadiness(): HiggsfieldCliReadiness {
  const studioEnv = getHiggsfieldMarketingStudioEnv();
  const resolvedPath = resolveExecutablePath(studioEnv.cliPath);
  const mode = studioEnv.mode === "cli" ? "cli" : "api_adapter";

  if (mode !== "cli") {
    return {
      enabled: studioEnv.cliEnabled,
      ready: false,
      mode,
      cliPath: studioEnv.cliPath,
      resolvedPath,
      reason: "Higgsfield Marketing Studio API adapter mode is future-only until an official endpoint is configured.",
      mcpStatus: "future_only",
    };
  }

  if (!studioEnv.cliEnabled) {
    return {
      enabled: false,
      ready: false,
      mode,
      cliPath: studioEnv.cliPath,
      resolvedPath,
      reason: "HIGGSFIELD_CLI_ENABLED must be true for Marketing Studio generation.",
      mcpStatus: "future_only",
    };
  }

  if (!resolvedPath) {
    return {
      enabled: true,
      ready: false,
      mode,
      cliPath: studioEnv.cliPath,
      resolvedPath: null,
      reason: "HIGGSFIELD_CLI_PATH was not found or is not executable.",
      mcpStatus: "future_only",
    };
  }

  return {
    enabled: true,
    ready: true,
    mode,
    cliPath: studioEnv.cliPath,
    resolvedPath,
    reason: null,
    mcpStatus: "future_only",
  };
}

export async function checkHiggsfieldMarketingStudioReadiness(): Promise<HiggsfieldCliReadiness> {
  const readiness = getHiggsfieldMarketingStudioCliReadiness();

  if (!readiness.ready || !readiness.resolvedPath) {
    return readiness;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        readiness.resolvedPath ?? readiness.cliPath,
        ["--version"],
        {
          timeout: 8_000,
          maxBuffer: 128 * 1024,
          encoding: "utf8",
          env: buildHiggsfieldCliEnvironment(),
        },
        (error: Error | null) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        },
      );
    });
  } catch {
    return {
      ...readiness,
      ready: false,
      reason: "Higgsfield Marketing Studio CLI version check failed.",
    };
  }

  return readiness;
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

  if (!isHiggsfieldProviderSelected()) {
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
  const studioEnv = getHiggsfieldMarketingStudioEnv();

  if (!isHiggsfieldProviderSelected()) {
    return {
      configured: false,
      missing: ["MEDIA_GENERATION_PROVIDER=higgsfield or higgsfield_marketing_studio"],
    };
  }

  if (
    getMediaGenerationProvider() === "higgsfield_marketing_studio" &&
    studioEnv.enabled &&
    studioEnv.mode === "cli" &&
    studioEnv.cliEnabled
  ) {
    return {
      configured: true,
      missing: [],
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

async function createLegacyClient() {
  const env = getHiggsfieldCredentials();

  if (!env) {
    throw new Error("Higgsfield media generation is not configured.");
  }

  const { HiggsfieldClient } = await import("@higgsfield/client");

  return new HiggsfieldClient({
    apiKey: env.apiKey ?? undefined,
    apiSecret: env.apiSecret ?? undefined,
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
  const imageGuardrails = [
    prompt,
    "Generate a clean text-free photographic background asset only.",
    "DealFlow will add the exact headline, proof, CTA, and layout after generation.",
    "Do not create a finished ad, flyer, poster, collage, infographic, dashboard, UI screen, card stack, pricing table, chart, map label, CTA button, logo, watermark, or typography.",
    "No readable text, pseudo-text, glyphs, fake words, fake numbers, fake UI labels, fake captions, fake pricing, or document/screen text.",
    negativePrompt ? `Avoid: ${negativePrompt}.` : null,
  ];

  if (!("script" in request)) {
    return imageGuardrails.filter(Boolean).join(" ");
  }

  return [
    prompt,
    "Create a polished native social AI UGC video for a real estate lead generation campaign.",
    "Use realistic composition, clean commercial lighting, premium but believable styling, and no provider/internal jargon.",
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

function resolveImageEndpoint(model: string) {
  const normalized = safeText(model);

  if (normalized === HIGGSFIELD_MARKETING_STUDIO_IMAGE_MODEL) {
    throw new Error("Marketing Studio image generation is available only through the verified CLI provider path.");
  }

  if (
    normalized === "text2image_soul_v2" ||
    normalized === "higgsfield_soul" ||
    normalized === "soul_cinematic" ||
    normalized === "soul_location"
  ) {
    return HIGGSFIELD_SOUL_TEXT_TO_IMAGE_ENDPOINT;
  }

  if (normalized.startsWith("/") || normalized.includes("/")) {
    return normalized;
  }

  throw new Error("Higgsfield image model must be a supported alias or explicit endpoint path.");
}

function buildImageInput(endpoint: string, request: HiggsfieldImageRequest): HiggsfieldImageInput {
  const aspectRatio = safeText(request.aspectRatio) || "1:1";
  const prompt = buildPromptWithGuardrails(request);

  if (endpoint === HIGGSFIELD_SOUL_TEXT_TO_IMAGE_ENDPOINT) {
    return {
      prompt,
      width_and_height: mapAspectRatioToSoulSize(aspectRatio),
      quality: "1080p",
      batch_size: 1,
      enhance_prompt: false,
    };
  }

  return {
    prompt,
    aspect_ratio: aspectRatio,
    resolution: "1k",
  };
}

function resolveVideoEndpointAndModel(model: string) {
  const normalized = safeText(model);

  if (normalized === HIGGSFIELD_IMAGE_TO_VIDEO_ENDPOINT) {
    return {
      endpoint: HIGGSFIELD_IMAGE_TO_VIDEO_ENDPOINT,
      model: DEFAULT_HIGGSFIELD_VIDEO_MODEL,
    };
  }

  if (
    normalized === "dop-lite" ||
    normalized === "dop-turbo" ||
    normalized === "dop-standard"
  ) {
    return {
      endpoint: HIGGSFIELD_IMAGE_TO_VIDEO_ENDPOINT,
      model: normalized,
    };
  }

  if (
    !normalized ||
    normalized === "marketing_studio_video" ||
    normalized === "ugc_video" ||
    normalized === "soul_cast" ||
    normalized === "seedance_2_0"
  ) {
    return {
      endpoint: HIGGSFIELD_IMAGE_TO_VIDEO_ENDPOINT,
      model: DEFAULT_HIGGSFIELD_VIDEO_MODEL,
    };
  }

  if (normalized.startsWith("/")) {
    throw new Error("Higgsfield video endpoint is not supported for DealFlow UGC generation.");
  }

  throw new Error("Higgsfield video model must be a supported DealFlow alias or DoP model.");
}

function buildVideoInput(request: HiggsfieldVideoRequest, model: string): HiggsfieldVideoInput {
  const inputImageUrl = safeText(request.inputImageUrl);

  if (!inputImageUrl) {
    throw new Error("Higgsfield image-to-video generation requires a ready source creative image.");
  }

  return {
    model: model as HiggsfieldVideoInput["model"],
    prompt: buildPromptWithGuardrails(request),
    input_images: [
      {
        type: "image_url",
        image_url: inputImageUrl,
      },
    ],
    enhance_prompt: true,
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
  const endpoint = resolveImageEndpoint(model);
  const input = buildImageInput(endpoint, request);
  const response =
    endpoint === HIGGSFIELD_SOUL_TEXT_TO_IMAGE_ENDPOINT
      ? await (await createLegacyClient()).generate(endpoint, input, { withPolling: true })
      : await (await createClient()).subscribe(endpoint, {
          input,
          withPolling: true,
        });

  return extractResult(response as HiggsfieldResponseShape, model);
}

type HiggsfieldCliAssetCandidate = {
  value: string;
  score: number;
  path: string;
};

function looksLikeHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function looksLikeLocalFilePath(value: string) {
  return value.startsWith("file://") || value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value);
}

function looksLikeImageReference(value: string) {
  return /\.(png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(value);
}

function looksLikeVideoReference(value: string) {
  return /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(value);
}

function collectCliAssetCandidates(
  value: unknown,
  pathLabel = "$",
  candidates: HiggsfieldCliAssetCandidate[] = [],
) {
  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return candidates;
    }

    const isUrl = looksLikeHttpUrl(trimmed);
    const isLocal = looksLikeLocalFilePath(trimmed);

    if (isUrl || isLocal) {
      const normalizedPath = pathLabel.toLowerCase();
      const score =
        (looksLikeVideoReference(trimmed) ? 55 : 0) +
        (looksLikeImageReference(trimmed) ? 50 : 0) +
        (/download|file|image|video|output|asset|result|url/.test(normalizedPath) ? 20 : 0) +
        (/thumb|thumbnail/.test(normalizedPath) ? -5 : 0) +
        (/status|page|web|dashboard/.test(normalizedPath) ? -25 : 0) +
        (isLocal ? 15 : 0);

      candidates.push({
        value: trimmed,
        score,
        path: pathLabel,
      });
      return candidates;
    }

    for (const match of trimmed.matchAll(/https?:\/\/[^\s"',)]+/gi)) {
      const url = match[0];
      candidates.push({
        value: url,
        score:
          (looksLikeVideoReference(url) ? 50 : 0) +
          (looksLikeImageReference(url) ? 45 : 0) +
          (/download|file|image|video|output|asset|result|url/.test(pathLabel.toLowerCase()) ? 15 : 0),
        path: pathLabel,
      });
    }

    return candidates;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectCliAssetCandidates(item, `${pathLabel}[${index}]`, candidates));
    return candidates;
  }

  if (value && typeof value === "object") {
    for (const [key, nextValue] of Object.entries(value)) {
      collectCliAssetCandidates(nextValue, `${pathLabel}.${key}`, candidates);
    }
  }

  return candidates;
}

function findCliRequestId(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const id = findCliRequestId(item);

      if (id) {
        return id;
      }
    }

    return null;
  }

  const record = value as Record<string, unknown>;
  const direct =
    (typeof record.id === "string" ? record.id : null) ??
    (typeof record.request_id === "string" ? record.request_id : null) ??
    (typeof record.requestId === "string" ? record.requestId : null) ??
    (typeof record.generation_id === "string" ? record.generation_id : null) ??
    (typeof record.generationId === "string" ? record.generationId : null) ??
    null;

  if (direct) {
    return direct;
  }

  for (const nextValue of Object.values(record)) {
    const id = findCliRequestId(nextValue);

    if (id) {
      return id;
    }
  }

  return null;
}

export function extractHiggsfieldCliGenerationAssets(value: unknown): {
  fileUrl: string | null;
  thumbnailUrl: string | null;
  requestId: string | null;
} {
  const candidates = collectCliAssetCandidates(value)
    .filter((candidate, index, all) => all.findIndex((item) => item.value === candidate.value) === index)
    .sort((a, b) => b.score - a.score);
  const primary = candidates[0]?.value ?? null;
  const thumbnail =
    candidates.find((candidate) => /thumb|thumbnail/i.test(candidate.path))?.value ??
    candidates.find((candidate) => candidate.value !== primary)?.value ??
    primary;

  return {
    fileUrl: primary,
    thumbnailUrl: thumbnail ?? null,
    requestId: findCliRequestId(value),
  };
}

async function generateMarketingStudioImageWithCli(
  request: HiggsfieldImageRequest,
  model: string,
): Promise<HiggsfieldGenerationResult> {
  const cliReadiness = await checkHiggsfieldMarketingStudioReadiness();

  if (!cliReadiness.ready || !cliReadiness.resolvedPath) {
    throw new Error(cliReadiness.reason ?? "Higgsfield Marketing Studio CLI is not ready.");
  }
  const cliPath = cliReadiness.resolvedPath;

  const args = [
    "--json",
    "generate",
    "create",
    model,
    "--prompt",
    request.prompt,
    "--wait",
  ];

  if (request.aspectRatio) {
    args.push("--aspect_ratio", request.aspectRatio);
  }

  const runCli = (nextArgs: string[], timeout = 240_000) => new Promise<string>((resolve, reject) => {
    execFile(
      cliPath,
      nextArgs,
      {
        timeout,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
        env: buildHiggsfieldCliEnvironment(),
      },
      (error: Error | null, nextStdout: string) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(nextStdout);
      },
    );
  });
  const stdout = await runCli(args);
  let parsed: unknown = stdout;

  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = stdout;
  }

  let extracted = extractHiggsfieldCliGenerationAssets(parsed);

  if (!extracted.fileUrl && extracted.requestId) {
    const lookupStdout = await runCli(["--json", "generate", "get", extracted.requestId], 30_000);
    let lookupParsed: unknown = lookupStdout;

    try {
      lookupParsed = JSON.parse(lookupStdout);
    } catch {
      lookupParsed = lookupStdout;
    }

    const lookupExtracted = extractHiggsfieldCliGenerationAssets(lookupParsed);
    extracted = {
      fileUrl: lookupExtracted.fileUrl,
      thumbnailUrl: lookupExtracted.thumbnailUrl,
      requestId: lookupExtracted.requestId ?? extracted.requestId,
    };
  }

  return {
    requestId: extracted.requestId,
    status: extracted.fileUrl ? "completed" : "unknown",
    fileUrl: extracted.fileUrl,
    thumbnailUrl: extracted.thumbnailUrl,
    providerModel: model,
    rawStatus: "cli",
  };
}

function extensionForCliImageInput(contentType: string) {
  if (contentType.includes("png")) {
    return "png";
  }

  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return "jpg";
  }

  if (contentType.includes("webp")) {
    return "webp";
  }

  return "img";
}

async function prepareMarketingStudioCliImageInput(inputImageUrl: string) {
  const source = safeText(inputImageUrl);

  if (!source) {
    throw new Error("Higgsfield Marketing Studio video requires a ready static source image.");
  }

  if (looksLikeLocalFilePath(source)) {
    return source.startsWith("file://") ? new URL(source).pathname : source;
  }

  const fetched = await fetchStaticCreativeProviderImage(source, {
    accept: "image/png,image/jpeg,image/webp",
    contentTypePrefix: "image/",
    errorPrefix: "Marketing Studio video source image",
  });
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "dealflow-higgsfield-source-"));
  const filePath = path.join(outputDir, `source.${extensionForCliImageInput(fetched.contentType)}`);
  await writeFile(filePath, fetched.bytes);
  return filePath;
}

async function generateMarketingStudioVideoWithCli(
  request: HiggsfieldVideoRequest,
  model: string,
): Promise<HiggsfieldGenerationResult> {
  const cliReadiness = await checkHiggsfieldMarketingStudioReadiness();

  if (!cliReadiness.ready || !cliReadiness.resolvedPath) {
    throw new Error(cliReadiness.reason ?? "Higgsfield Marketing Studio CLI is not ready.");
  }

  if (!safeText(request.inputImageUrl)) {
    throw new Error("Higgsfield Marketing Studio video requires a ready static source image.");
  }

  const cliPath = cliReadiness.resolvedPath;
  const sourceImagePath = await prepareMarketingStudioCliImageInput(request.inputImageUrl ?? "");
  const args = [
    "--json",
    "generate",
    "create",
    model,
    "--prompt",
    buildPromptWithGuardrails(request),
    "--aspect_ratio",
    safeText(request.aspectRatio) || "9:16",
    "--duration",
    "15",
    "--mode",
    "ugc",
    "--resolution",
    "720p",
    "--start-image",
    sourceImagePath,
    "--wait",
  ];

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      cliPath,
      args,
      {
        timeout: 15 * 60_000,
        maxBuffer: 2 * 1024 * 1024,
        encoding: "utf8",
        env: buildHiggsfieldCliEnvironment(),
      },
      (error: Error | null, nextStdout: string) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(nextStdout);
      },
    );
  });
  let parsed: unknown = stdout;

  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = stdout;
  }

  const extracted = extractHiggsfieldCliGenerationAssets(parsed);

  return {
    requestId: extracted.requestId,
    status: extracted.fileUrl ? "completed" : "unknown",
    fileUrl: extracted.fileUrl,
    thumbnailUrl: extracted.thumbnailUrl,
    providerModel: model,
    rawStatus: "cli",
  };
}

export async function generateHiggsfieldMarketingStudioImage(
  request: HiggsfieldImageRequest,
): Promise<HiggsfieldGenerationResult> {
  const env = getHiggsfieldCredentials();
  const studioEnv = getHiggsfieldMarketingStudioEnv();

  const model = safeText(request.model) || env?.imageModel || HIGGSFIELD_MARKETING_STUDIO_IMAGE_MODEL;
  const cliReadiness = await checkHiggsfieldMarketingStudioReadiness();

  if (studioEnv.mode === "cli" && cliReadiness.ready) {
    return generateMarketingStudioImageWithCli(request, model);
  }

  if (!env) {
    throw new Error("Higgsfield Marketing Studio generation is not configured.");
  }

  throw new Error(
    cliReadiness.reason ??
      "Higgsfield Marketing Studio API adapter mode is future-only until an official endpoint is configured.",
  );
}

export async function generateHiggsfieldMarketingStudioVideo(
  request: HiggsfieldVideoRequest,
): Promise<HiggsfieldGenerationResult> {
  const studioEnv = getHiggsfieldMarketingStudioEnv();
  const env = getHiggsfieldEnv();
  const model = safeText(request.model) || env?.ugcVideoModel || HIGGSFIELD_MARKETING_STUDIO_VIDEO_MODEL;
  const cliReadiness = await checkHiggsfieldMarketingStudioReadiness();

  if (studioEnv.mode === "cli" && cliReadiness.ready) {
    if (model !== HIGGSFIELD_MARKETING_STUDIO_VIDEO_MODEL) {
      throw new Error("Higgsfield Marketing Studio CLI video requires HIGGSFIELD_UGC_VIDEO_MODEL=marketing_studio_video.");
    }

    return generateMarketingStudioVideoWithCli(request, model);
  }

  throw new Error(
    cliReadiness.reason ??
      "Higgsfield Marketing Studio video API adapter mode is future-only until an official endpoint is configured.",
  );
}

export async function createHiggsfieldVideo(
  request: HiggsfieldVideoRequest,
): Promise<HiggsfieldGenerationResult> {
  const env = getHiggsfieldCredentials();

  if (!env) {
    throw new Error("Higgsfield video generation is not configured.");
  }

  const requestedModel = safeText(request.model) || env.videoModel;
  const { endpoint, model } = resolveVideoEndpointAndModel(requestedModel);
  const response = await (await createLegacyClient()).generate(
    endpoint,
    buildVideoInput(request, model),
    { withPolling: false },
  );

  return extractResult(response as HiggsfieldResponseShape, endpoint);
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
