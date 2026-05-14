import {
  getHiggsfieldEnv,
  getHiggsfieldMarketingStudioEnv,
  getMediaGenerationFallbackProvider,
  getMediaGenerationProvider,
  getVideoGenerationEnv,
  validateHiggsfieldEnv,
  validateVideoGenerationEnv,
} from "@/lib/env";
import {
  createHiggsfieldVideo,
  generateHiggsfieldMarketingStudioVideo,
  getHiggsfieldMarketingStudioCliReadiness,
} from "@/lib/ai/higgsfield";
import { logWarn } from "@/lib/logging";
import type {
  ExecutionProvider,
  ProviderConfigValidation,
  ProviderConnectionStatus,
  ProviderFailure,
} from "@/lib/integrations/contracts";
import type { ProviderRenderRequest, ProviderRenderResult } from "@/lib/types/creative-assets";

export interface AvatarVideoProvider
  extends ExecutionProvider<ProviderRenderRequest, ProviderRenderResult, ProviderRenderResult> {
  name: string;
  createAvatarVideo(request: ProviderRenderRequest): Promise<ProviderRenderResult>;
}

function parseAvatarFailure(error: unknown): ProviderFailure {
  return {
    code: "avatar_video_provider_failed",
    message: error instanceof Error ? error.message : "Avatar video generation failed.",
    retryability: {
      retryable: true,
      strategy: "backoff",
    },
  };
}

function safeProviderDiagnostic(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage
    .replace(/https?:\/\/\S+/g, "[redacted-url]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted-token]")
    .trim();

  return message || "AI video generation failed.";
}

class UnsupportedAvatarProvider implements AvatarVideoProvider {
  id = "ai_video_generation";
  label = "AI Video Generation";
  vendor = "Unsupported";
  name = "unsupported";

  isConfigured() {
    return false;
  }

  validateConfig(): ProviderConfigValidation {
    const validation =
      getMediaGenerationProvider() === "higgsfield"
        ? validateHiggsfieldEnv()
        : validateVideoGenerationEnv();
    return {
      configured: false,
      missingConfig: validation.missing,
    };
  }

  async checkStatus(): Promise<ProviderConnectionStatus> {
    return {
      status: "disconnected",
      state: "not_configured",
      message: "Avatar video provider is not configured.",
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
      error: "Avatar video provider is not configured.",
    };
  }

  parseResult(raw: ProviderRenderResult): ProviderRenderResult {
    return raw;
  }

  async createAvatarVideo(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    return this.execute(request);
  }

  parseFailure(error: unknown): ProviderFailure {
    return parseAvatarFailure(error);
  }
}

class HeyGenAvatarProvider implements AvatarVideoProvider {
  id = "ai_video_generation";
  label = "AI Video Generation";
  vendor = "HeyGen";
  name = "heygen";

  isConfigured() {
    const env = getVideoGenerationEnv();
    return Boolean(env?.apiKey && env.avatarId && env.voiceId);
  }

  validateConfig(): ProviderConfigValidation {
    const validation = validateVideoGenerationEnv();
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
        ? "Avatar video generation provider is configured."
        : "Avatar video generation credentials are incomplete.",
    };
  }

  async execute(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    const env = getVideoGenerationEnv();
    const script = (request.script ?? "").trim();

    if (process.env.ALLOW_HEYGEN_VIDEO_GENERATION !== "true") {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        error: "HeyGen video generation is disabled for beta.",
      };
    }

    if (!env?.apiKey || !env.avatarId || !env.voiceId) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        error: "HeyGen is not configured.",
      };
    }

    if (!script) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "failed",
        fileUrl: null,
        thumbnailUrl: null,
        error: "Script is required for avatar video generation.",
      };
    }

    try {
      const response = await fetch(`${env.baseUrl.replace(/\/$/, "")}/v2/video/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": env.apiKey,
        },
        body: JSON.stringify({
          title: "Avatar video ad",
          avatar_id: env.avatarId,
          voice_id: env.voiceId,
          script,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = (await response.json().catch(() => null)) as
        | { data?: { video_id?: string; video_url?: string; url?: string } }
        | null;

      if (!response.ok) {
        return {
          ok: false,
          providerName: this.name,
          providerAssetId: null,
          status: "failed",
          fileUrl: null,
          thumbnailUrl: null,
          error: "Avatar video generation failed.",
        };
      }

      return {
        ok: true,
        providerName: this.name,
        providerAssetId: data?.data?.video_id ?? null,
        status: "ready",
        fileUrl: data?.data?.video_url ?? data?.data?.url ?? null,
        thumbnailUrl: null,
      };
    } catch (error) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "failed",
        fileUrl: null,
        thumbnailUrl: null,
        error: error instanceof Error ? error.message : "Avatar video generation failed.",
      };
    }
  }

  parseResult(raw: ProviderRenderResult): ProviderRenderResult {
    return raw;
  }

  async createAvatarVideo(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    return this.execute(request);
  }

  parseFailure(error: unknown): ProviderFailure {
    return parseAvatarFailure(error);
  }
}

class HiggsfieldVideoProvider implements AvatarVideoProvider {
  id = "ai_video_generation";
  label = "AI Video Generation";
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

    return {
      status: validation.configured ? "connected" : "disconnected",
      state: validation.configured ? "configured" : "not_configured",
      message: validation.configured
        ? "AI video generation provider is configured."
        : "AI video generation credentials are incomplete.",
    };
  }

  async execute(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    const env = getHiggsfieldEnv();
    const script = (request.script ?? request.prompt ?? "").trim();

    if (process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION !== "true") {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        error: "AI video rendering is not enabled for this workspace yet.",
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
        error: "AI video generation is not configured.",
      };
    }

    if (!script) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "failed",
        fileUrl: null,
        thumbnailUrl: null,
        error: "Script is required for AI video generation.",
      };
    }

    try {
      const result = await createHiggsfieldVideo({
        aspectRatio: request.aspectRatio ?? "9:16",
        model: env.videoModel,
        prompt: request.prompt ?? script,
        script,
        title: typeof request.title === "string" ? request.title : null,
        inputImageUrl: typeof request.inputImageUrl === "string" ? request.inputImageUrl : null,
      });

      return {
        ok: Boolean(result.requestId || result.fileUrl),
        providerName: this.name,
        providerAssetId: result.requestId,
        status: result.fileUrl && result.status === "completed" ? "ready" : "processing",
        fileUrl: result.fileUrl,
        thumbnailUrl: result.thumbnailUrl,
        metadata: {
          provider: this.name,
          model: env.videoModel,
          requestId: result.requestId,
          providerStatus: result.status,
        },
        error: null,
      };
    } catch (error) {
      const diagnostic = safeProviderDiagnostic(error);

      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "failed",
        fileUrl: null,
        thumbnailUrl: null,
        metadata: {
          provider: this.name,
          model: env.videoModel,
          providerError: diagnostic,
        },
        error:
          /credit|balance/i.test(diagnostic)
            ? "Video generation could not start because provider credits are unavailable."
            : diagnostic,
      };
    }
  }

  parseResult(raw: ProviderRenderResult): ProviderRenderResult {
    return raw;
  }

  async createAvatarVideo(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    return this.execute(request);
  }

  parseFailure(error: unknown): ProviderFailure {
    return parseAvatarFailure(error);
  }
}

class HiggsfieldMarketingStudioVideoProvider extends HiggsfieldVideoProvider {
  label = "Higgsfield Marketing Studio Video";
  vendor = "Higgsfield";
  name = "higgsfield_marketing_studio";

  isConfigured() {
    const studio = getHiggsfieldMarketingStudioEnv();
    const cli = getHiggsfieldMarketingStudioCliReadiness();

    return (
      getMediaGenerationProvider() === "higgsfield_marketing_studio" &&
      studio.enabled &&
      studio.mode === "cli" &&
      studio.cliEnabled &&
      cli.ready
    );
  }

  validateConfig(): ProviderConfigValidation {
    const studio = getHiggsfieldMarketingStudioEnv();
    const cli = getHiggsfieldMarketingStudioCliReadiness();
    const missingConfig = [
      getMediaGenerationProvider() === "higgsfield_marketing_studio"
        ? null
        : "MEDIA_GENERATION_PROVIDER=higgsfield_marketing_studio",
      studio.enabled ? null : "HIGGSFIELD_MARKETING_STUDIO_ENABLED=true",
      studio.mode === "cli" ? null : "HIGGSFIELD_MARKETING_STUDIO_MODE=cli",
      studio.cliEnabled ? null : "HIGGSFIELD_CLI_ENABLED=true",
      cli.ready ? null : cli.reason ?? "HIGGSFIELD_CLI_PATH=<installed executable>",
      studio.ugcVideoModel === "marketing_studio_video"
        ? null
        : "HIGGSFIELD_UGC_VIDEO_MODEL=marketing_studio_video",
    ].filter(Boolean) as string[];

    return {
      configured: missingConfig.length === 0,
      missingConfig,
    };
  }

  async checkStatus(): Promise<ProviderConnectionStatus> {
    const validation = this.validateConfig();
    const studio = getHiggsfieldMarketingStudioEnv();
    const cli = getHiggsfieldMarketingStudioCliReadiness();
    const usageGuardEnabled = process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION === "true";

    return {
      status: validation.configured && usageGuardEnabled ? "connected" : "disconnected",
      state: validation.configured ? "configured" : "not_configured",
      message: validation.configured && !usageGuardEnabled
        ? "Higgsfield Marketing Studio video is configured but disabled by the usage guard."
        : validation.configured
          ? "Higgsfield Marketing Studio video is configured and enabled."
          : cli.reason ?? "Higgsfield Marketing Studio video CLI gates are incomplete.",
      metadata: {
        usageGuardEnabled,
        marketingStudioEnabled: studio.enabled,
        cliEnabled: cli.enabled,
        cliReady: cli.ready,
        mode: studio.mode,
        model: studio.ugcVideoModel,
        fallbackProvider: getMediaGenerationFallbackProvider(),
      },
    };
  }

  async execute(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    const studio = getHiggsfieldMarketingStudioEnv();
    const script = (request.script ?? request.prompt ?? "").trim();

    if (process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION !== "true") {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        error: "AI video rendering is not enabled for this workspace yet.",
      };
    }

    if (!this.isConfigured()) {
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
          fallbackProvider: getMediaGenerationFallbackProvider(),
        },
        error: "Higgsfield Marketing Studio CLI video is not ready.",
      };
    }

    if (!script) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "failed",
        fileUrl: null,
        thumbnailUrl: null,
        error: "Script is required for AI video generation.",
      };
    }

    try {
      const result = await generateHiggsfieldMarketingStudioVideo({
        aspectRatio: request.aspectRatio ?? "9:16",
        model: studio.ugcVideoModel,
        prompt: request.prompt ?? script,
        script,
        title: typeof request.title === "string" ? request.title : null,
        inputImageUrl: typeof request.inputImageUrl === "string" ? request.inputImageUrl : null,
      });

      return {
        ok: result.status === "completed" && Boolean(result.fileUrl),
        providerName: this.name,
        providerAssetId: result.requestId,
        status: result.status === "completed" && result.fileUrl ? "ready" : "failed",
        fileUrl: result.fileUrl,
        thumbnailUrl: result.thumbnailUrl,
        metadata: {
          provider: this.name,
          model: studio.ugcVideoModel,
          requestId: result.requestId,
          providerStatus: result.status,
          generationLane: "marketing_studio_cli_video",
        },
        error: result.fileUrl ? null : "Higgsfield Marketing Studio video did not return a usable asset.",
      };
    } catch (error) {
      const diagnostic = safeProviderDiagnostic(error);

      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "failed",
        fileUrl: null,
        thumbnailUrl: null,
        metadata: {
          provider: this.name,
          model: studio.ugcVideoModel,
          providerError: diagnostic,
          generationLane: "marketing_studio_cli_video",
        },
        error:
          /credit|balance/i.test(diagnostic)
            ? "Video generation could not start because provider credits are unavailable."
            : diagnostic,
      };
    }
  }
}

export function getAvatarVideoProvider(): AvatarVideoProvider {
  const marketingStudio = new HiggsfieldMarketingStudioVideoProvider();
  const higgsfield = new HiggsfieldVideoProvider();
  const provider = getMediaGenerationProvider();

  if (provider === "higgsfield_marketing_studio") {
    if (marketingStudio.isConfigured()) {
      return marketingStudio;
    }

    if (getMediaGenerationFallbackProvider() === "higgsfield" && higgsfield.isConfigured()) {
      logWarn("Higgsfield Marketing Studio video falling back to API/SDK provider", {
        fallbackProvider: "higgsfield",
      });
      return higgsfield;
    }

    return new UnsupportedAvatarProvider();
  }

  if (provider === "higgsfield") {
    return higgsfield.isConfigured() ? higgsfield : new UnsupportedAvatarProvider();
  }

  const heyGen = new HeyGenAvatarProvider();
  return heyGen.isConfigured() ? heyGen : new UnsupportedAvatarProvider();
}
