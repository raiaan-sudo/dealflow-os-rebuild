import { ApiError } from "@/lib/api/route";
import {
  getMetaEnv,
  hasMetaEnv,
  validateMetaEnv,
} from "@/lib/env";
import type {
  ExecutionProvider,
  ProviderConfigValidation,
  ProviderConnectionStatus,
  ProviderFailure,
} from "@/lib/integrations/contracts";
import { normalizeIntegrationStatus } from "@/lib/integrations/contracts";
import {
  createMetaConnectionUrl,
} from "@/lib/services/meta-ads-service";
import {
  executeFullAutopilotLaunch,
} from "@/lib/services/campaign-execution-service";
import {
  prepareCampaignDeployment,
} from "@/lib/services/meta-campaign-execution-service";
import {
  getDefaultMetaConnectionState,
  getMetaConnectionState,
} from "@/lib/integrations/meta/service";
import {
  markMetaPublishing,
  updateMetaPublishResult,
} from "@/lib/services/campaign-runtime-service";

export type MetaMarketingDeployPayload = {
  campaignId?: string;
  meta_ad_account_id?: string;
  objective?: "LEADS" | "TRAFFIC" | "CONVERSIONS";
  destination_url?: string;
  daily_budget?: number;
  lifetime_budget?: number;
  budget_type?: "daily" | "lifetime";
  start_immediately?: boolean;
  cta_type?: string;
  pixel_id?: string;
  form_type?: "landing_page" | "instant_form";
};

export type MetaMarketingExecuteRequest = {
  launchMode?: "test" | "live";
  userId?: string | null;
  payload?: MetaMarketingDeployPayload | null;
};

type MetaMarketingRawResult =
  {
    mode: "test" | "live";
    campaignId: string;
    executionId: string | null;
    adSetCount: number;
    adCount: number;
  };

export type MetaMarketingParsedResult = {
  success: true;
  mode: "test" | "live";
  campaignId: string;
  executionId: string | null;
  adSetCount: number;
  adCount: number;
};

export type MetaTrackingExecuteRequest = {
  action?: "check";
};

type MetaTrackingRawResult = {
  pixelId: string | null;
  domain: string | null;
  verifyToken: string | null;
};

export type MetaTrackingParsedResult = MetaTrackingRawResult & {
  success: boolean;
};

function parseMetaFailure(error: unknown): ProviderFailure {
  if (error instanceof ApiError) {
    return {
      code: error.code ?? "meta_provider_failed",
      message: error.message,
      retryability: {
        retryable: error.status >= 500,
        strategy: error.status >= 500 ? "backoff" : "manual",
      },
      details: {
        status: error.status,
      },
    };
  }

  return {
    code: "meta_provider_failed",
    message: error instanceof Error ? error.message : "Meta provider request failed.",
    retryability: {
      retryable: true,
      strategy: "backoff",
    },
  };
}

class MetaMarketingProvider
  implements
    ExecutionProvider<
      MetaMarketingExecuteRequest,
      MetaMarketingRawResult,
      MetaMarketingParsedResult
    >
{
  id = "meta_marketing_api";
  label = "Meta Marketing API";
  vendor = "Meta";

  isConfigured() {
    return Boolean(getMetaEnv());
  }

  validateConfig(): ProviderConfigValidation {
    const validation = validateMetaEnv();
    return {
      configured: validation.configured,
      missingConfig: validation.missing,
    };
  }

  async checkStatus(): Promise<ProviderConnectionStatus> {
    if (!this.isConfigured()) {
      return {
        status: "disconnected",
        state: "not_configured",
        message: "Meta Marketing API credentials are not configured yet.",
      };
    }

    const connection = await getMetaConnectionState().catch(() => getDefaultMetaConnectionState());

    return {
      status: normalizeIntegrationStatus(connection.connectionStatus),
      state:
        connection.connectionStatus === "connected"
          ? "connected"
          : connection.connectionStatus === "connecting"
            ? "connecting"
            : connection.connectionStatus === "partial"
              ? "degraded"
            : connection.connectionStatus === "connection_failed"
              ? "failed"
              : "configured",
      message: connection.readinessMessage,
      externalAccountId: connection.accountId,
      externalAccountName: connection.accountName,
      updatedAt: connection.lastSyncAt ?? connection.connectedAt,
      metadata: {
        connectionStatus: connection.connectionStatus,
      },
    };
  }

  async connect() {
    const connectionUrl = await createMetaConnectionUrl();
    return {
      success: true,
      status: "pending" as const,
      state: "connecting" as const,
      message: "Meta authorization URL generated.",
      connectionUrl,
    };
  }

  async execute(request: MetaMarketingExecuteRequest): Promise<MetaMarketingRawResult> {
    const launchMode = "test";
    const payload = request.payload ?? null;

    if (!hasMetaEnv()) {
      throw new ApiError(
        503,
        "Meta Marketing API credentials are not configured yet.",
        "meta_not_configured",
      );
    }

    if (
      request.userId &&
      payload?.campaignId &&
      payload.meta_ad_account_id &&
      payload.objective &&
      payload.destination_url &&
      payload.budget_type
    ) {
      await markMetaPublishing(payload.campaignId);
      const result = await executeFullAutopilotLaunch(payload.campaignId, request.userId, {
        campaignId: payload.campaignId,
        objective: payload.objective,
        mode: "test",
        metadata: {
          meta_ad_account_id: payload.meta_ad_account_id,
          destination_url: payload.destination_url,
          daily_budget: payload.daily_budget,
          lifetime_budget: payload.lifetime_budget,
          budget_type: payload.budget_type,
          start_immediately: payload.start_immediately,
          cta_type: payload.cta_type,
          pixelId: payload.pixel_id,
          formType: payload.form_type,
        },
      });

      return {
        mode: "test",
        campaignId: result.metaCampaignId ?? result.execution.id,
        executionId: result.execution.id,
        adSetCount: (result.adSets || []).length,
        adCount: (result.ads || []).length,
      };
    }

    await markMetaPublishing();
    const result = await prepareCampaignDeployment({ launchMode });
    const campaignId = result.campaign?.id;

    if (!campaignId) {
      throw new ApiError(
        502,
        "Meta deploy completed without a campaign ID.",
        "meta_campaign_id_missing",
      );
    }

    return {
      mode: "test",
      campaignId,
      executionId: null,
      adSetCount: result.adSets.length,
      adCount: result.ads.length,
    };
  }

  parseResult(raw: MetaMarketingRawResult): MetaMarketingParsedResult {
    return {
      success: true,
      mode: raw.mode,
      campaignId: raw.campaignId,
      executionId: raw.executionId,
      adSetCount: raw.adSetCount,
      adCount: raw.adCount,
    };
  }

  parseFailure(error: unknown): ProviderFailure {
    return parseMetaFailure(error);
  }
}

class MetaTrackingProvider
  implements
    ExecutionProvider<
      MetaTrackingExecuteRequest,
      MetaTrackingRawResult,
      MetaTrackingParsedResult
    >
{
  id = "meta_tracking";
  label = "Meta Pixel + Domain";
  vendor = "Meta";

  isConfigured() {
    return true;
  }

  validateConfig(): ProviderConfigValidation {
    return {
      configured: true,
      missingConfig: [],
    };
  }

  async checkStatus(): Promise<ProviderConnectionStatus> {
    const connection = await getMetaConnectionState().catch(() => getDefaultMetaConnectionState());
    const tracking = connection.tracking;
    const missingFields = tracking.missingFields;

    if (connection.connectionStatus !== "connected" || !connection.accountId) {
      return {
        status: "disconnected",
        state: "not_configured",
        message: "Connect a Meta ad account before finishing workspace tracking setup.",
        metadata: {
          workspaceScoped: true,
          trackingStatus: tracking.trackingStatus,
          hasVerifyToken: Boolean(tracking.verificationToken),
          domainVerified: tracking.domainVerified,
          missingFields: ["ad account", ...missingFields],
        },
      };
    }

    const trackingStatus = tracking.trackingStatus;
    const trackingConfigured = trackingStatus === "configured";
    const trackingMessage =
      trackingConfigured
        ? "This workspace has its own Meta pixel and launch domain ready for launch tracking."
        : trackingStatus === "partial"
          ? `This workspace still needs ${missingFields.join(" and ")} before launch tracking is ready.`
          : "Add this workspace's Meta pixel and launch domain before launch.";

    return {
      status: trackingConfigured ? "connected" : trackingStatus === "partial" ? "pending" : "disconnected",
      state: trackingConfigured ? "connected" : trackingStatus === "partial" ? "degraded" : "not_configured",
      message: trackingMessage,
      updatedAt: tracking.updatedAt,
      metadata: {
        workspaceScoped: true,
        trackingStatus,
        pixelId: tracking.pixelId,
        launchDomain: tracking.launchDomain,
        hasVerifyToken: Boolean(tracking.verificationToken),
        domainVerified: tracking.domainVerified,
        missingFields,
      },
    };
  }

  async execute(): Promise<MetaTrackingRawResult> {
    const connection = await getMetaConnectionState().catch(() => getDefaultMetaConnectionState());

    return {
      pixelId: connection.tracking.pixelId,
      domain: connection.tracking.launchDomain,
      verifyToken: connection.tracking.verificationToken,
    };
  }

  parseResult(raw: MetaTrackingRawResult): MetaTrackingParsedResult {
    return {
      success: Boolean(raw.pixelId || raw.domain),
      ...raw,
    };
  }

  parseFailure(error: unknown): ProviderFailure {
    return parseMetaFailure(error);
  }
}

const metaMarketingProvider = new MetaMarketingProvider();
const metaTrackingProvider = new MetaTrackingProvider();

export function getMetaMarketingProvider() {
  return metaMarketingProvider;
}

export function getMetaTrackingProvider() {
  return metaTrackingProvider;
}
