import { getVoiceGenerationEnv, validateVoiceGenerationEnv } from "@/lib/env";
import type {
  ExecutionProvider,
  ProviderConfigValidation,
  ProviderConnectionStatus,
  ProviderFailure,
} from "@/lib/integrations/contracts";
import type { ProviderRenderRequest, ProviderRenderResult } from "@/lib/types/creative-assets";

export interface VoiceProvider
  extends ExecutionProvider<ProviderRenderRequest, ProviderRenderResult, ProviderRenderResult> {
  name: string;
  synthesizeSpeech(request: ProviderRenderRequest): Promise<ProviderRenderResult>;
}

function parseVoiceFailure(error: unknown): ProviderFailure {
  return {
    code: "voice_provider_failed",
    message: error instanceof Error ? error.message : "Voice generation failed.",
    retryability: {
      retryable: true,
      strategy: "backoff",
    },
  };
}

class UnsupportedVoiceProvider implements VoiceProvider {
  id = "ai_voice_generation";
  label = "AI Voice Generation";
  vendor = "Unsupported";
  name = "unsupported";

  isConfigured() {
    return false;
  }

  validateConfig(): ProviderConfigValidation {
    return {
      configured: false,
      missingConfig: validateVoiceGenerationEnv().missing,
    };
  }

  async checkStatus(): Promise<ProviderConnectionStatus> {
    return {
      status: "disconnected",
      state: "not_configured",
      message: "Voice generation provider is not configured.",
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
      error: "Voice provider is not configured.",
    };
  }

  parseResult(raw: ProviderRenderResult): ProviderRenderResult {
    return raw;
  }

  async synthesizeSpeech(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    return this.execute(request);
  }

  parseFailure(error: unknown): ProviderFailure {
    return parseVoiceFailure(error);
  }
}

class ElevenLabsVoiceProvider implements VoiceProvider {
  id = "ai_voice_generation";
  label = "AI Voice Generation";
  vendor = "ElevenLabs";
  name = "elevenlabs";

  isConfigured() {
    return Boolean(getVoiceGenerationEnv()?.apiKey);
  }

  validateConfig(): ProviderConfigValidation {
    const validation = validateVoiceGenerationEnv();
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
        ? "Voice generation provider is configured."
        : "Voice generation credentials are incomplete.",
    };
  }

  async execute(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    const env = getVoiceGenerationEnv();
    const apiKey = env?.apiKey;
    const voiceId = request.voiceProfile || env?.voiceId || "21m00Tcm4TlvDq8ikWAM";
    const modelId = env?.modelId || "eleven_multilingual_v2";
    const script = (request.script ?? "").trim();

    if (!apiKey) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: null,
        status: "unsupported",
        fileUrl: null,
        thumbnailUrl: null,
        error: "ElevenLabs is not configured.",
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
        error: "Script is required for voice generation.",
      };
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: script,
          model_id: modelId,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
          },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { detail?: { message?: string } } | null;
        return {
          ok: false,
          providerName: this.name,
          providerAssetId: voiceId,
          status: "failed",
          fileUrl: null,
          thumbnailUrl: null,
          error: data?.detail?.message ?? "ElevenLabs voice generation failed.",
        };
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const dataUrl = `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`;

      return {
        ok: true,
        providerName: this.name,
        providerAssetId: voiceId,
        status: "ready",
        fileUrl: dataUrl,
        thumbnailUrl: null,
        metadata: {
          voiceId,
          modelId,
        },
      };
    } catch (error) {
      return {
        ok: false,
        providerName: this.name,
        providerAssetId: voiceId,
        status: "failed",
        fileUrl: null,
        thumbnailUrl: null,
        error: error instanceof Error ? error.message : "ElevenLabs voice generation failed.",
      };
    }
  }

  parseResult(raw: ProviderRenderResult): ProviderRenderResult {
    return raw;
  }

  async synthesizeSpeech(request: ProviderRenderRequest): Promise<ProviderRenderResult> {
    return this.execute(request);
  }

  parseFailure(error: unknown): ProviderFailure {
    return parseVoiceFailure(error);
  }
}

export function getVoiceProvider(): VoiceProvider {
  const elevenLabs = new ElevenLabsVoiceProvider();
  return elevenLabs.isConfigured() ? elevenLabs : new UnsupportedVoiceProvider();
}
