import { getVideoGenerationEnv, validateVideoGenerationEnv } from "@/lib/env";
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

class UnsupportedAvatarProvider implements AvatarVideoProvider {
  id = "ai_video_generation";
  label = "AI Video Generation";
  vendor = "Unsupported";
  name = "unsupported";

  isConfigured() {
    return false;
  }

  validateConfig(): ProviderConfigValidation {
    return {
      configured: false,
      missingConfig: validateVideoGenerationEnv().missing,
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

export function getAvatarVideoProvider(): AvatarVideoProvider {
  const heyGen = new HeyGenAvatarProvider();
  return heyGen.isConfigured() ? heyGen : new UnsupportedAvatarProvider();
}
