import { getImageGenerationEnv, validateImageGenerationEnv } from "@/lib/env";
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

const IMAGE_GENERATION_TIMEOUT_MS = 45_000;
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

class UnsupportedImageProvider implements ImageGenerationProvider {
  id = "ai_image_generation";
  label = "AI Image Generation";
  vendor = "Unsupported";
  name = "unsupported";

  isConfigured() {
    return false;
  }

  validateConfig(): ProviderConfigValidation {
    return {
      configured: false,
      missingConfig: validateImageGenerationEnv().missing,
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
  const openAi = new OpenAiImageProvider();
  return openAi.isConfigured() ? openAi : new UnsupportedImageProvider();
}
