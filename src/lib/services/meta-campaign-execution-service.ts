import { ApiError } from "@/lib/api/route";
import {
  createAd,
  createAdSet,
  createCampaign,
  getMetaAccessToken,
  getMetaExecutionMode,
  mapAdSetToMetaPayload,
  mapAdToMetaPayload,
  mapCampaignToMetaPayload,
  type MetaAdPayload,
  type MetaAdSetPayload,
  type MetaCampaignPayload,
} from "@/lib/integrations/meta/execution";
import type {
  MetaConnectionRecord,
  MetaConnectionMetadata,
  MetaDeployStatus,
  MetaLaunchMode,
} from "@/lib/integrations/meta/types";
import { createClient } from "@/lib/supabase/server";
import {
  recordCampaignLaunch,
  type CampaignLaunchEvent,
} from "@/lib/services/campaign-launch-audit-service";
import { logError, logInfo } from "@/lib/logging";
import { buildExecutableCampaign, type ExecutableAd, type ExecutableAdSet, type ExecutableCampaign } from "@/lib/services/campaign-execution-service";
import { getLatestCampaignPlan } from "@/lib/services/campaign-plan-service";
import { updateMetaPublishResult } from "@/lib/services/campaign-runtime-service";
import { getAppContext } from "@/lib/services/app-context";
import { assertExecutableMetaCampaignClaims } from "@/lib/advertising-claim-boundaries";

export type DeploymentResult = {
  mode: "sandbox" | "live";
  launchMode: MetaLaunchMode;
  status: MetaDeployStatus;
  campaign: {
    internal: ExecutableCampaign;
    apiPayload: MetaCampaignPayload;
    id: string | null;
  } | null;
  adSets: Array<{
    internal: ExecutableAdSet;
    apiPayload: MetaAdSetPayload;
    id: string;
  }>;
  ads: Array<{
    internal: ExecutableAd;
    apiPayload: MetaAdPayload;
    id: string;
    adSetName: string;
  }>;
  errors: Array<{
    stage: "campaign" | "ad_set" | "ad";
    message: string;
    target: string;
  }>;
};

async function getMetaConnectionForExecution() {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for this route.", "unauthorized");
  }

  const { data } = await supabase
    .from("marketing_accounts")
    .select("*")
    .eq("organization_id", context.organization.id)
    .eq("platform", "meta_ads")
    .eq("status", "connected")
    .maybeSingle();

  const row = data as MetaConnectionRecord | null;

  if (!row?.external_account_id || !row.access_token_encrypted) {
    throw new ApiError(400, "Connect a Meta ad account before attempting deployment.", "meta_not_connected");
  }

  const metadata =
    row.connection_metadata && typeof row.connection_metadata === "object" && !Array.isArray(row.connection_metadata)
      ? (row.connection_metadata as MetaConnectionMetadata)
      : null;
  const selectedAccountId =
    metadata?.selected_external_account_id && typeof metadata.selected_external_account_id === "string"
      ? metadata.selected_external_account_id
      : null;
  const selectedPageId =
    metadata?.selected_page_id && typeof metadata.selected_page_id === "string"
      ? metadata.selected_page_id
      : null;
  const selectedPixelId =
    typeof row.pixel_id === "string" && row.pixel_id.trim().length > 0
      ? row.pixel_id
      : metadata?.pixel_id && typeof metadata.pixel_id === "string"
        ? metadata.pixel_id
        : null;

  if (!selectedAccountId || !selectedPageId || !selectedPixelId) {
    throw new ApiError(400, "Missing selected Meta assets", "missing_selected_meta_assets");
  }

  if (row.external_account_id !== selectedAccountId) {
    throw new ApiError(400, "Missing selected Meta assets", "missing_selected_meta_assets");
  }

  logInfo("Meta deployment connection resolved", {
    connection_status: row.status,
    account_id: selectedAccountId,
    account_name: row.account_name,
  });

  return {
    organizationId: context.organization.id,
    connection: row,
    accessToken: getMetaAccessToken(row),
    executionMode: getMetaExecutionMode(),
    selectedPageId,
    selectedPixelId,
    selectedAccountId,
  };
}

function getResultStatus(result: DeploymentResult): MetaDeployStatus {
  if (!result.campaign?.id) {
    return "failed";
  }

  if (result.errors.length > 0) {
    return "partial_success";
  }

  return "success";
}

function getResultMessage(result: DeploymentResult) {
  if (result.status === "success") {
    return `Campaign, ad sets, and ads were pushed to Meta Ads in ${result.launchMode === "live" ? "live" : "test"} mode.`;
  }

  if (result.status === "partial_success") {
    return "Campaign created, but one or more downstream objects failed during deployment.";
  }

  return "Campaign deployment to Meta Ads failed before publish completed.";
}

export async function prepareCampaignDeployment(params?: {
  launchMode?: MetaLaunchMode;
}) {
  const plan = await getLatestCampaignPlan();

  if (!plan) {
    throw new ApiError(400, "Generate a campaign plan before preparing deployment.", "campaign_plan_missing");
  }

  const executableCampaign = buildExecutableCampaign(plan);
  assertExecutableMetaCampaignClaims(executableCampaign);
  const { connection, accessToken, executionMode, selectedAccountId, selectedPageId, selectedPixelId } =
    await getMetaConnectionForExecution();
  const launchMode = params?.launchMode === "live" ? "live" : "test";
  const accountId = selectedAccountId;

  logInfo("Meta deployment launch check", {
    connection_status: connection.status,
    account_id: accountId,
    launch_mode: launchMode,
  });

  if (!accountId) {
    throw new ApiError(400, "Connected Meta account is missing an ad account ID.", "meta_not_connected");
  }

  const campaignPayload = mapCampaignToMetaPayload(executableCampaign, launchMode);
  const apiMode = executionMode;
  const result: DeploymentResult = {
    mode: apiMode,
    launchMode,
    status: "failed",
    campaign: null,
    adSets: [],
    ads: [],
    errors: [],
  };
  const events: CampaignLaunchEvent[] = [];

  try {
    const createdCampaign = await createCampaign({
      accountId,
      accessToken,
      payload: campaignPayload,
      mode: apiMode,
    });

    result.campaign = {
      internal: executableCampaign,
      apiPayload: campaignPayload,
      id: createdCampaign.id,
    };
    events.push({
      id: `event-campaign-${Date.now()}`,
      label: "Created campaign",
      status: "success",
      target: executableCampaign.name,
      detail: `Campaign created with ID ${createdCampaign.id}.`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Meta campaign creation failed.";
    logError("Meta campaign creation failed", {
      campaignName: executableCampaign.name,
      launchMode,
      executionMode: apiMode,
      message,
    });
    result.errors.push({
      stage: "campaign",
      target: executableCampaign.name,
      message,
    });
    events.push({
      id: `event-campaign-${Date.now()}`,
      label: "Created campaign",
      status: "failed",
      target: executableCampaign.name,
      detail: message,
      timestamp: new Date().toISOString(),
    });
    result.status = "failed";

    await updateMetaPublishResult({
      status: "failed",
      campaignId: null,
      adSetIds: [],
      adIds: [],
      message: getResultMessage(result),
    });

    await recordCampaignLaunch({
      campaignName: executableCampaign.name,
      accountName: connection.account_name,
      launchMode: executionMode,
      resultStatus: result.status,
      metaCampaignId: null,
      metaAdSetIds: [],
      metaAdIds: [],
      executionMetadata: {
        launchMode,
        campaign: campaignPayload,
        adSets: [],
        ads: [],
        errors: result.errors,
      },
      eventTimeline: events,
    });

    return result;
  }

  for (const adSet of executableCampaign.adSets) {
    const adSetPayload = await mapAdSetToMetaPayload(
      adSet,
      accessToken,
      accountId,
      selectedPixelId,
      apiMode,
      launchMode,
    );

    try {
      const createdAdSet = await createAdSet({
        accountId,
        accessToken,
        payload: adSetPayload,
        campaignId: result.campaign.id!,
        mode: apiMode,
      });

      result.adSets.push({
        internal: adSet,
        apiPayload: adSetPayload,
        id: createdAdSet.id,
      });
      events.push({
        id: `event-adset-${createdAdSet.id}`,
        label: "Created ad set",
        status: "success",
        target: adSet.name,
        detail: `Ad set created with ID ${createdAdSet.id}.`,
        timestamp: new Date().toISOString(),
      });

      for (const ad of adSet.ads) {
        const { adPayload, creativeId } = await mapAdToMetaPayload(
          ad,
          accessToken,
          accountId,
          selectedPageId,
          apiMode,
          launchMode,
        );

        try {
          events.push({
            id: `event-creative-${Date.now()}-${ad.id}`,
            label: "Uploaded creatives",
            status: "success",
            target: ad.name,
            detail: `Creative asset prepared for ${ad.name} with creative ID ${creativeId}.`,
            timestamp: new Date().toISOString(),
          });
          const createdAd = await createAd({
            accountId,
            accessToken,
            payload: adPayload,
            adSetId: createdAdSet.id,
            mode: apiMode,
          });

          result.ads.push({
            internal: ad,
            apiPayload: adPayload,
            id: createdAd.id,
            adSetName: adSet.name,
          });
          events.push({
            id: `event-ad-${createdAd.id}`,
            label: "Published ad",
            status: "success",
            target: ad.name,
            detail: `Ad created with ID ${createdAd.id}.`,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Meta ad creation failed.";
          logError("Meta ad creation failed", {
            adName: ad.name,
            adSetName: adSet.name,
            message,
          });
          result.errors.push({
            stage: "ad",
            target: ad.name,
            message,
          });
          events.push({
            id: `event-ad-${Date.now()}-${ad.id}`,
            label: "Published ad",
            status: "failed",
            target: ad.name,
            detail: message,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Meta ad set creation failed.";
      logError("Meta ad set creation failed", {
        adSetName: adSet.name,
        campaignId: result.campaign?.id,
        message,
      });
      result.errors.push({
        stage: "ad_set",
        target: adSet.name,
        message,
      });
      events.push({
        id: `event-adset-${Date.now()}-${adSet.id}`,
        label: "Created ad set",
        status: "failed",
        target: adSet.name,
        detail: message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  result.status = getResultStatus(result);

  await updateMetaPublishResult({
    status:
      result.status === "success"
        ? "provider_paused"
        : result.status === "partial_success"
          ? "partial"
          : "failed",
    campaignId: result.campaign?.id ?? null,
    adSetIds: result.adSets.map((item) => item.id),
    adIds: result.ads.map((item) => item.id),
    message: getResultMessage(result),
  });

  await recordCampaignLaunch({
    campaignName: executableCampaign.name,
    accountName: connection.account_name,
    launchMode,
    resultStatus: result.status,
    metaCampaignId: result.campaign?.id ?? null,
    metaAdSetIds: result.adSets.map((item) => item.id),
    metaAdIds: result.ads.map((item) => item.id),
    executionMetadata: {
      launchMode,
      campaign: result.campaign,
      adSets: result.adSets,
      ads: result.ads,
      errors: result.errors,
    },
    eventTimeline: events,
  });

  return result;
}
