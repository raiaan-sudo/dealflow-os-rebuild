import {
  getHiggsfieldMarketingStudioEnv,
  getHiggsfieldEnv,
  getImageGenerationEnv,
  getMediaGenerationProvider,
  validateHiggsfieldEnv,
  validateImageGenerationEnv,
} from "@/lib/env";
import {
  generateHiggsfieldImage,
  generateHiggsfieldMarketingStudioImage,
  getHiggsfieldMarketingStudioCliReadiness,
} from "@/lib/ai/higgsfield";
import { logWarn } from "@/lib/logging";
import type {
  ExecutionProvider,
  ProviderConfigValidation,
  ProviderConnectionStatus,
  ProviderFailure,
} from "@/lib/integrations/contracts";
import type {
  CreativeAssetFormat,
  ProviderRenderRequest,
  ProviderRenderResult,
} from "@/lib/types/creative-assets";

export interface ImageGenerationProvider
  extends ExecutionProvider<ProviderRenderRequest, ProviderRenderResult, ProviderRenderResult> {
  name: string;
  generateImage(request: ProviderRenderRequest): Promise<ProviderRenderResult>;
}

function mapAspectRatioToSize(format: CreativeAssetFormat) {
  if (format === "9:16") {
    return "1024x1536";
  }

  if (format === "16:9") {
    return "1536x1024";
  }

  return "1024x1024";
}

function parseImageFailure(error: unknown): ProviderFailure {
  return {
    code: "image_provider_failed",
    message: error instanceof Error ? error.message : "Image generation failed.",
    retryability: {
      retryable: true,
      strategy: "backoff",
    },
  };
}

const IMAGE_GENERATION_TIMEOUT_MS = 60_000;
const IMAGE_GENERATION_ATTEMPTS_PER_MODEL = 1;

function toDataUrl(base64: string) {
  return `data:image/png;base64,${base64}`;
}

function resolveImageUrl(
  payload: { url?: string; b64_json?: string; revised_prompt?: string } | null | undefined,
) {
  if (!payload) {
    return null;
  }

  if (payload.url?.trim()) {
    return payload.url.trim();
  }

  if (payload.b64_json?.trim()) {
    return toDataUrl(payload.b64_json.trim());
  }

  return null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "Image generation failed.";
}

function isTimeoutError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("aborterror")
  );
}

class OpenAiImageProvider implements ImageGenerationProvider {
  id = "ai_image_generation";
  label = "AI Image Generation";
  vendor = "OpenAI";
  name = "openai";

  isConfigured() {
    const env = getImageGenerationEnv();
    return Boolean(env && env.provider === "openai");
  }

  validateConfig(): ProviderConfigValidation {
    const validation = validateImageGenerationEnv();
    return {
      configured: validation.configured,
      missingConfig: validation.missing,
    };
  }

  async checkStatus(): Promise<ProviderConnectionStatus> {
    const validation = this.validateConfig();

    return {
      status: validation.configured ? "connected" : "disconnected",
      state: validation.configured ? "configured" : "not_configured",
      message: validation.configured
        ? "Image generation provider is configured."
        : "Image generation provider credentials are incomplete.",
    };
  }

  async execute(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    const env = getImageGenerationEnv();

    if (process.env.ALLOW_OPENAI_IMAGE_GENERATION !== "true") {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        error: "OpenAI image generation is disabled until the provider usage guard is explicitly enabled.",
      };
    }

    if (!env || env.provider !== "openai") {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        error: "OpenAI image generation is not configured.",
      };
    }

    if (!(request.prompt ?? "").trim()) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "failed",
        fileUrl: null,
        thumbnailUrl: null,
        error: "Image prompt is required.",
      };
    }

    const requestModel = request.model?.trim() || env.model;
    // One explicit guarded request should map to one paid provider call. Do not
    // silently retry across fallback models while debugging or during launch.
    const models = [requestModel];
    const prompt =
      [request.prompt?.trim(), request.negativePrompt?.trim() ? `Avoid: ${request.negativePrompt.trim()}.` : null]
        .filter(Boolean)
        .join(" ");

    let lastFailure: string | null = null;
    let fileUrl: string | null = null;
    let revisedPrompt: string | null = null;
    let resolvedModel: string | null = null;
    let retryCount = 0;

    for (const model of models) {
      for (let attempt = 0; attempt < IMAGE_GENERATION_ATTEMPTS_PER_MODEL; attempt += 1) {
        try {
          const response = await fetch(`${env.baseUrl.replace(/\/$/, "")}/images/generations`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.apiKey}`,
            },
            body: JSON.stringify({
              model,
              prompt,
              size: mapAspectRatioToSize(request.aspectRatio),
            }),
            signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS),
          });

          const data = (await response.json().catch(() => null)) as
            | { data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>; error?: { message?: string } }
            | null;

          const payload = data?.data?.[0] ?? null;
          const resolvedUrl = resolveImageUrl(payload);

          if (response.ok && resolvedUrl) {
            fileUrl = resolvedUrl;
            revisedPrompt = payload?.revised_prompt ?? null;
            resolvedModel = model;
            break;
          }

          lastFailure = data?.error?.message ?? `Image generation failed with status ${response.status}.`;
        } catch (error) {
          const timeoutError = isTimeoutError(error);
          lastFailure = timeoutError
            ? `OpenAI image generation timed out after ${IMAGE_GENERATION_TIMEOUT_MS}ms on ${model}.`
            : getErrorMessage(error);

          if (!timeoutError) {
            break;
          }

          retryCount += 1;

          continue;
        }

        if (fileUrl) {
          break;
        }

        if (attempt < IMAGE_GENERATION_ATTEMPTS_PER_MODEL - 1) {
          retryCount += 1;
        }
      }

      if (fileUrl) {
        break;
      }
    }

    return {
      ok: Boolean(fileUrl),
      providerName: this.name,
      providerAssetId: null,
      status: fileUrl ? "ready" : "failed",
      fileUrl,
      thumbnailUrl: fileUrl,
      metadata: {
        revisedPrompt,
        model: resolvedModel,
        retryCount,
      },
      error: fileUrl ? null : lastFailure ?? "Image provider did not return a URL.",
    };
  }

  parseResult(raw: ProviderRenderResult): ProviderRenderResult {
    return raw;
  }

  async generateImage(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    return this.execute(request);
  }

  parseFailure(error: unknown): ProviderFailure {
    return parseImageFailure(error);
  }
}

function mapAspectRatioToHiggsfield(format: CreativeAssetFormat | string | null | undefined) {
  if (format === "9:16" || format === "16:9" || format === "4:5" || format === "1:1") {
    return format;
  }

  return "1:1";
}

function isHiggsfieldImageGenerationEnabled() {
  return process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION === "true";
}

class HiggsfieldImageProvider implements ImageGenerationProvider {
  id = "ai_image_generation";
  label = "AI Image Generation";
  vendor = "Higgsfield";
  name = "higgsfield";

  isConfigured() {
    const env = getHiggsfieldEnv();
    const provider = getMediaGenerationProvider();
    return (provider === "higgsfield" || provider === "higgsfield_marketing_studio") && Boolean(env?.credentials);
  }

  validateConfig(): ProviderConfigValidation {
    const validation = validateHiggsfieldEnv();
    const provider = getMediaGenerationProvider();
    const higgsfieldSelected = provider === "higgsfield" || provider === "higgsfield_marketing_studio";

    return {
      configured: higgsfieldSelected && validation.configured,
      missingConfig:
        higgsfieldSelected
          ? validation.missing
          : ["MEDIA_GENERATION_PROVIDER=higgsfield"],
    };
  }

  async checkStatus(): Promise<ProviderConnectionStatus> {
    const validation = this.validateConfig();
    const usageGuardEnabled = isHiggsfieldImageGenerationEnabled();

    return {
      status: validation.configured && usageGuardEnabled ? "connected" : "disconnected",
      state: validation.configured ? "configured" : "not_configured",
      message: validation.configured && !usageGuardEnabled
        ? "Image generation provider is configured but disabled by the usage guard."
        : validation.configured
        ? "Image generation provider is configured and enabled."
        : "Image generation provider credentials are incomplete.",
      metadata: validation.configured
        ? {
            usageGuardEnabled,
            model: getHiggsfieldEnv()?.imageModel ?? null,
          }
        : undefined,
    };
  }

  async execute(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    const env = getHiggsfieldEnv();

    if (!isHiggsfieldImageGenerationEnabled()) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        error: "AI image generation is disabled until the provider usage guard is explicitly enabled.",
      };
    }

    const provider = getMediaGenerationProvider();
    if (!env?.credentials || (provider !== "higgsfield" && provider !== "higgsfield_marketing_studio")) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        error: "AI image generation is not configured.",
      };
    }

    if (!(request.prompt ?? "").trim()) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "failed",
        fileUrl: null,
        thumbnailUrl: null,
        error: "Image prompt is required.",
      };
    }

    try {
      const model = env.imageModel;
      const result = await generateHiggsfieldImage({
        aspectRatio: mapAspectRatioToHiggsfield(request.aspectRatio),
        model,
        prompt: request.prompt ?? "",
        negativePrompt: request.negativePrompt ?? null,
      });

      return {
        ok: result.status === "completed" && Boolean(result.fileUrl),
        providerName: this.name,
        providerAssetId: result.requestId,
        status: result.status === "completed" && result.fileUrl ? "ready" : result.status,
        fileUrl: result.fileUrl,
        thumbnailUrl: result.thumbnailUrl ?? result.fileUrl,
        metadata: {
          provider: this.name,
          model,
          requestId: result.requestId,
          providerStatus: result.status,
          qualityGateStatus: result.fileUrl ? "candidate_ready" : "not_ready",
          selectedCandidate: result.fileUrl ? true : null,
          candidateIndex: 0,
        },
        error: result.fileUrl ? null : "Image provider did not return a usable asset.",
      };
    } catch (error) {
      logWarn("Higgsfield image generation failed", {
        message: getErrorMessage(error),
        errorName: error instanceof Error ? error.name : typeof error,
        model: env.imageModel,
      });

      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "failed",
        fileUrl: null,
        thumbnailUrl: null,
        metadata: {
          provider: this.name,
          model: env.imageModel,
        },
        error:
          error instanceof Error && /credit|balance/i.test(error.message)
            ? "Image generation could not start because provider credits are unavailable."
            : "Image generation failed.",
      };
    }
  }

  parseResult(raw: ProviderRenderResult): ProviderRenderResult {
    return raw;
  }

  async generateImage(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    return this.execute(request);
  }

  parseFailure(error: unknown): ProviderFailure {
    return parseImageFailure(error);
  }
}

class HiggsfieldMarketingStudioImageProvider extends HiggsfieldImageProvider {
  label = "Higgsfield Marketing Studio";
  vendor = "Higgsfield";
  name = "higgsfield_marketing_studio";

  isConfigured() {
    const env = getHiggsfieldEnv();
    const studio = getHiggsfieldMarketingStudioEnv();
    const cliReadiness = getHiggsfieldMarketingStudioCliReadiness();
    return (
      getMediaGenerationProvider() === "higgsfield_marketing_studio" &&
      (Boolean(env?.credentials) || studio.mode === "cli") &&
      studio.enabled &&
      cliReadiness.ready
    );
  }

  validateConfig(): ProviderConfigValidation {
    const validation = validateHiggsfieldEnv();
    const studio = getHiggsfieldMarketingStudioEnv();
    const cliReadiness = getHiggsfieldMarketingStudioCliReadiness();
    const credentialMissing = studio.mode === "cli" ? [] : validation.missing;
    const missingConfig = [
      ...(getMediaGenerationProvider() === "higgsfield_marketing_studio"
        ? credentialMissing
        : ["MEDIA_GENERATION_PROVIDER=higgsfield_marketing_studio"]),
      ...(studio.enabled ? [] : ["HIGGSFIELD_MARKETING_STUDIO_ENABLED=true"]),
      ...(studio.mode === "cli" ? [] : ["HIGGSFIELD_MARKETING_STUDIO_MODE=cli"]),
      ...(studio.cliEnabled ? [] : ["HIGGSFIELD_CLI_ENABLED=true"]),
      ...(cliReadiness.ready ? [] : ["HIGGSFIELD_CLI_PATH=<installed executable>"]),
    ];

    return {
      configured:
        getMediaGenerationProvider() === "higgsfield_marketing_studio" &&
        (validation.configured || studio.mode === "cli") &&
        studio.enabled &&
        cliReadiness.ready,
      missingConfig,
    };
  }

  async checkStatus(): Promise<ProviderConnectionStatus> {
    const validation = this.validateConfig();
    const usageGuardEnabled = isHiggsfieldImageGenerationEnabled();
    const studio = getHiggsfieldMarketingStudioEnv();
    const cliReadiness = getHiggsfieldMarketingStudioCliReadiness();

    return {
      status: validation.configured && usageGuardEnabled ? "connected" : "disconnected",
      state: validation.configured ? "configured" : "not_configured",
      message: validation.configured && !usageGuardEnabled
        ? "Higgsfield Marketing Studio is configured but disabled by the usage guard."
        : validation.configured
        ? "Higgsfield Marketing Studio is configured and enabled."
        : cliReadiness.reason ?? "Higgsfield Marketing Studio credentials or gates are incomplete.",
      metadata: {
        usageGuardEnabled,
        marketingStudioEnabled: studio.enabled,
        cliEnabled: cliReadiness.enabled,
        cliReady: cliReadiness.ready,
        cliPath: cliReadiness.cliPath,
        cliResolved: Boolean(cliReadiness.resolvedPath),
        mcpStatus: cliReadiness.mcpStatus,
        mode: studio.mode,
        model: getHiggsfieldEnv()?.imageModel ?? "marketing_studio_image",
      },
    };
  }

  async execute(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    const env = getHiggsfieldEnv();

    if (!isHiggsfieldImageGenerationEnabled()) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        error: "AI image generation is disabled until the provider usage guard is explicitly enabled.",
      };
    }

    if (getMediaGenerationProvider() !== "higgsfield_marketing_studio") {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        error: "Higgsfield Marketing Studio generation is not configured.",
      };
    }

    const studio = getHiggsfieldMarketingStudioEnv();
    const cliReadiness = getHiggsfieldMarketingStudioCliReadiness();

    if (studio.enabled !== true) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        error: "Higgsfield Marketing Studio generation is disabled.",
      };
    }

    if (!cliReadiness.ready) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        metadata: {
          provider: this.name,
          mode: studio.mode,
          cliEnabled: cliReadiness.enabled,
          cliReady: cliReadiness.ready,
          mcpStatus: cliReadiness.mcpStatus,
        },
        error: cliReadiness.reason ?? "Higgsfield Marketing Studio CLI is not ready.",
      };
    }

    try {
      const model = env?.imageModel || "marketing_studio_image";
      const result = await generateHiggsfieldMarketingStudioImage({
        aspectRatio: mapAspectRatioToHiggsfield(request.aspectRatio),
        model,
        prompt: request.prompt ?? "",
        negativePrompt: request.negativePrompt ?? null,
      });

      return {
        ok: result.status === "completed" && Boolean(result.fileUrl),
        providerName: this.name,
        providerAssetId: result.requestId,
        status: result.status === "completed" && result.fileUrl ? "ready" : result.status,
        fileUrl: result.fileUrl,
        thumbnailUrl: result.thumbnailUrl ?? result.fileUrl,
        metadata: {
          provider: this.name,
          model,
          requestId: result.requestId,
          providerStatus: result.status,
          outputMode: "finished_ad",
          qualityGateStatus: result.fileUrl ? "candidate_ready" : "not_ready",
        },
        error: result.fileUrl ? null : "Higgsfield Marketing Studio did not return a usable asset.",
      };
    } catch (error) {
      logWarn("Higgsfield Marketing Studio image generation failed", {
        message: getErrorMessage(error),
        errorName: error instanceof Error ? error.name : typeof error,
        model: env?.imageModel ?? "marketing_studio_image",
      });

      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "failed",
        fileUrl: null,
        thumbnailUrl: null,
        metadata: {
          provider: this.name,
          model: env?.imageModel ?? "marketing_studio_image",
        },
        error:
          error instanceof Error && /credit|balance/i.test(error.message)
            ? "Image generation could not start because provider credits are unavailable."
            : "Image generation failed.",
      };
    }
  }
}

class UnsupportedImageProvider implements ImageGenerationProvider {
  id = "ai_image_generation";
  label = "AI Image Generation";
  vendor = "Unsupported";
  name = "unsupported";

  isConfigured() {
    return false;
  }

  validateConfig(): ProviderConfigValidation {
    const validation =
      getMediaGenerationProvider() === "higgsfield"
        ? validateHiggsfieldEnv()
        : validateImageGenerationEnv();
    return {
      configured: false,
      missingConfig: validation.missing,
    };
  }

  async checkStatus(): Promise<ProviderConnectionStatus> {
    return {
      status: "disconnected",
      state: "not_configured",
      message: "Image generation provider is not configured.",
    };
  }

  async execute(_request?: ProviderRenderRequest): Promise<ProviderRenderResult> {
    return {
      ok: false,
      providerName: this.name,
      providerAssetId: null,
      status: "unsupported",
      fileUrl: null,
      thumbnailUrl: null,
      error: "Image generation provider is not configured.",
    };
  }

  parseResult(raw: ProviderRenderResult): ProviderRenderResult {
    return raw;
  }

  async generateImage(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    return this.execute(request);
  }

  parseFailure(error: unknown): ProviderFailure {
    return parseImageFailure(error);
  }
}

export function getImageGenerationProvider(): ImageGenerationProvider {
  const marketingStudio = new HiggsfieldMarketingStudioImageProvider();
  if (getMediaGenerationProvider() === "higgsfield_marketing_studio") {
    return marketingStudio;
  }

  const higgsfield = new HiggsfieldImageProvider();
  if (getMediaGenerationProvider() === "higgsfield") {
    return higgsfield.isConfigured() ? higgsfield : new UnsupportedImageProvider();
  }

  const openAi = new OpenAiImageProvider();
  return openAi.isConfigured() ? openAi : new UnsupportedImageProvider();
}
