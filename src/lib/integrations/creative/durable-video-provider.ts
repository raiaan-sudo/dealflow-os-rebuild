import { ApiError } from "@/lib/api/route";
import {
  getHiggsfieldGenerationEnv,
  validateHiggsfieldGenerationEnv,
  validateVideoGenerationEnv,
} from "@/lib/env";
import type {
  ExecutionProvider,
  ProviderConfigValidation,
  ProviderConnectionStatus,
  ProviderFailure,
} from "@/lib/integrations/contracts";
import { buildConfigurationOnlyProviderStatus } from "@/lib/integrations/contracts";
import { getDurableVideoProvider } from "@/lib/ai/video-provider";

type DurableVideoIntegrationResult = {
  ok: false;
  providerName: "higgsfield" | "heygen" | "unconfigured";
  error: string;
};

class DurableVideoIntegrationProvider
  implements ExecutionProvider<unknown, DurableVideoIntegrationResult, DurableVideoIntegrationResult>
{
  id = "ai_video_generation";
  label = "AI Video Generation";
  vendor = "Higgsfield";

  isConfigured() {
    return getDurableVideoProvider() !== null;
  }

  validateConfig(): ProviderConfigValidation {
    const selected = getDurableVideoProvider();
    if (selected === "higgsfield") {
      const validation = validateHiggsfieldGenerationEnv();
      return {
        configured: validation.configured,
        missingConfig: validation.missing,
      };
    }
    if (selected === "heygen") {
      const validation = validateVideoGenerationEnv();
      return {
        configured: validation.configured,
        missingConfig: validation.missing,
      };
    }
    const higgsfield = getHiggsfieldGenerationEnv();
    return {
      configured: false,
      missingConfig: higgsfield
        ? validateHiggsfieldGenerationEnv().missing
        : [
            "HIGGSFIELD_CLI_ENABLED=true",
            "HIGGSFIELD_CLI_PATH",
            "HIGGSFIELD_CLI_SHA256",
            "HIGGSFIELD_CONFIG_HOME",
          ],
    };
  }

  async checkStatus(): Promise<ProviderConnectionStatus> {
    const selected = getDurableVideoProvider();
    return buildConfigurationOnlyProviderStatus({
      label:
        selected === "heygen"
          ? "HeyGen legacy video generation"
          : "Higgsfield durable video generation",
      validation: this.validateConfig(),
    });
  }

  async execute(): Promise<DurableVideoIntegrationResult> {
    throw new ApiError(
      409,
      "Video generation must run through the canonical durable provider-usage reservation job.",
      "provider_usage_reservation_required",
    );
  }

  parseResult(raw: DurableVideoIntegrationResult) {
    return raw;
  }

  parseFailure(error: unknown): ProviderFailure {
    return {
      code:
        error instanceof ApiError && error.code
          ? error.code
          : "durable_video_provider_failed",
      message: error instanceof Error ? error.message : "Video generation failed.",
      retryability: {
        retryable: false,
        strategy: "manual",
      },
    };
  }
}

export function getDurableVideoIntegrationProvider() {
  return new DurableVideoIntegrationProvider();
}
