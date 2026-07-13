import { ApiError } from "@/lib/api/route";
import { getMetaEnv, getPublicAppUrl } from "@/lib/env";
import { decryptSecret } from "@/lib/integrations/meta-crypto";
import {
  buildMetaGraphUrl,
  isMetaLiveWriteAllowed,
  withMetaBearerToken,
} from "@/lib/integrations/meta/contract";
import type { MetaConnectionRecord } from "@/lib/integrations/meta/types";
import { fetchMetaResponse } from "@/lib/integrations/meta/request";
import type {
  ExecutableAd,
  ExecutableAdSet,
  ExecutableCampaign,
} from "@/lib/services/campaign-execution-service";
import { assertCustomerApprovedMetaBudgetCents } from "@/lib/integrations/meta/budget-safety";

export type MetaCampaignPayload = {
  name: string;
  objective: string;
  status: "PAUSED";
  special_ad_categories: string[];
};

export type MetaAdSetPayload = {
  name: string;
  daily_budget: number;
  billing_event: "IMPRESSIONS";
  optimization_goal: "LEAD_GENERATION";
  bid_strategy: "LOWEST_COST_WITHOUT_CAP";
  targeting: {
    geo_locations: {
      countries: string[];
      custom_locations?: Array<{
        address_string: string;
        radius: number;
        distance_unit: "mile" | "kilometer";
      }>;
    };
    age_min: number;
    age_max: number;
    interests: Array<{ id: string; name: string }>;
  };
  promoted_object?: {
    pixel_id: string;
    custom_event_type: "LEAD";
  };
  tracking_specs?: Array<{
    action_type: string[];
    fb_pixel: string[];
  }>;
  status: "PAUSED";
};

export type MetaAdPayload = {
  name: string;
  status: "PAUSED";
  creative: {
    creative_id: string;
  };
};

export type MetaAdCreativePayload = {
  name: string;
  object_story_spec: {
    page_id: string;
    link_data: {
      message: string;
      name: string;
      image_hash?: string;
      picture?: string;
      link: string;
      call_to_action: {
        type: string;
        value: {
          link: string;
        };
      };
    };
  };
};

export function normalizeObjective(objective: string): MetaCampaignPayload["objective"] {
  if (objective.toLowerCase().includes("lead")) {
    return "OUTCOME_LEADS";
  }

  return "OUTCOME_LEADS";
}

function getInterestKeywords(adSet: ExecutableAdSet) {
  return [
    "real estate",
    "house hunting",
    "home ownership",
    "mortgage loans",
    "Zillow",
    "Realtor.com",
  ];
}

function getMetaObjectStatus(launchMode: "test" | "live"): "PAUSED" {
  void launchMode;
  return "PAUSED";
}

function inferCountryCode(location: string) {
  const normalized = location.toLowerCase();

  if (
    /\btoronto\b|\bontario\b|\bvancouver\b|\bcalgary\b|\bedmonton\b|\bmontreal\b|\bcanada\b/.test(
      normalized,
    )
  ) {
    return "CA";
  }

  return "US";
}

function getAgeRange(adSet: ExecutableAdSet) {
  const normalized = `${adSet.audience} ${adSet.targeting.audience}`.toLowerCase();

  if (normalized.includes("first-time")) {
    return { min: 24, max: 44 };
  }

  if (normalized.includes("investor")) {
    return { min: 28, max: 60 };
  }

  if (normalized.includes("downsiz")) {
    return { min: 45, max: 65 };
  }

  return { min: 25, max: 54 };
}

function toAbsoluteDestinationUrl(url: string) {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${getPublicAppUrl()}${url.startsWith("/") ? url : `/${url}`}`;
}

async function fetchMetaJson<T>(url: RequestInfo | URL, init?: RequestInit) {
  const response = await fetchMetaResponse(url, {
    purpose: "discovery",
    ...(init ?? {}),
  });
  const data = (await response.json().catch(() => null)) as
    | T
    | { error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new ApiError(
      502,
      data && typeof data === "object" && "error" in data
        ? data.error?.message ?? "Meta request failed."
        : "Meta request failed.",
      "meta_request_failed",
    );
  }

  return data as T;
}

async function resolveMetaInterests(params: {
  accessToken: string;
  accountId: string;
  keywords: string[];
  mode: "sandbox" | "live";
}) {
  if (params.mode === "sandbox") {
    return params.keywords.map((keyword, index) => ({
      id: `sandbox-interest-${index + 1}`,
      name: keyword,
    }));
  }

  const resolved = [];

  for (const keyword of params.keywords.slice(0, 3)) {
    const url = buildMetaGraphUrl("search", {
      type: "adinterest",
      q: keyword,
      limit: 1,
    });

    const result = await fetchMetaJson<{ data?: Array<{ id: string; name: string }> }>(
      url,
      withMetaBearerToken(params.accessToken),
    );
    const firstMatch = result.data?.[0];

    if (firstMatch?.id && firstMatch?.name) {
      resolved.push(firstMatch);
    }
  }

  return resolved;
}

async function createAdCreative(params: {
  accountId: string;
  accessToken: string;
  payload: MetaAdCreativePayload;
  mode: "sandbox" | "live";
}) {
  if (params.mode === "sandbox") {
    return {
      id: `sandbox-creative-${crypto.randomUUID()}`,
      payload: params.payload,
    };
  }

  assertMetaLiveWriteEnabled();
  const url = buildMetaGraphUrl(`act_${params.accountId}/adcreatives`);

  const response = await fetchMetaResponse(url, {
    purpose: "launch_create",
    method: "POST",
    ...withMetaBearerToken(params.accessToken, {
      headers: { "Content-Type": "application/json" },
    }),
    body: JSON.stringify(params.payload),
  });

  const data = (await response.json().catch(() => null)) as
    | { id?: string; error?: { message?: string } }
    | null;

  if (!response.ok || !data?.id) {
    throw new ApiError(
      502,
      data?.error?.message ?? "Meta ad creative creation failed.",
      "meta_adcreative_create_failed",
    );
  }

  return {
    id: data.id,
    payload: params.payload,
  };
}

export function mapCampaignToMetaPayload(
  campaign: ExecutableCampaign,
  launchMode: "test" | "live" = "test",
): MetaCampaignPayload {
  return {
    name: campaign.name,
    objective: normalizeObjective(campaign.objective),
    status: getMetaObjectStatus(launchMode),
    special_ad_categories: ["HOUSING"],
  };
}

export async function mapAdSetToMetaPayload(
  adSet: ExecutableAdSet,
  accessToken: string,
  accountId: string,
  pixelId: string,
  mode: "sandbox" | "live",
  launchMode: "test" | "live" = "test",
): Promise<MetaAdSetPayload> {
  if (!pixelId) {
    throw new ApiError(400, "Missing selected Meta assets", "missing_selected_meta_assets");
  }

  const numericBudget = Number(adSet.budget.replace(/[^0-9.]/g, ""));
  const computedDailyBudget = Math.max(1, Math.round((numericBudget / 30) * 100));
  const dailyBudget = assertCustomerApprovedMetaBudgetCents(computedDailyBudget);
  const ageRange = getAgeRange(adSet);
  const interests = await resolveMetaInterests({
    accessToken,
    accountId,
    keywords: getInterestKeywords(adSet),
    mode,
  });

  return {
    name: adSet.name,
    daily_budget: dailyBudget,
    billing_event: "IMPRESSIONS",
    optimization_goal: "LEAD_GENERATION",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: {
      geo_locations: {
        countries: [inferCountryCode(adSet.location)],
        custom_locations: [
          {
            address_string: adSet.location,
            radius: 25,
            distance_unit: "mile",
          },
        ],
      },
      age_min: ageRange.min,
      age_max: ageRange.max,
      interests,
    },
    promoted_object: {
      pixel_id: pixelId,
      custom_event_type: "LEAD",
    },
    tracking_specs: [
      {
        action_type: ["offsite_conversion"],
        fb_pixel: [pixelId],
      },
    ],
    status: getMetaObjectStatus(launchMode),
  };
}

function normalizeCta(cta: string) {
  const normalized = cta.toLowerCase();

  if (normalized.includes("learn")) {
    return "LEARN_MORE";
  }

  if (normalized.includes("book") || normalized.includes("call")) {
    return "BOOK_TRAVEL";
  }

  return "LEARN_MORE";
}

export async function mapAdToMetaPayload(
  ad: ExecutableAd,
  accessToken: string,
  accountId: string,
  pageId: string,
  mode: "sandbox" | "live",
  launchMode: "test" | "live" = "test",
): Promise<{ adPayload: MetaAdPayload; creativeId: string }> {
  if (!pageId) {
    throw new ApiError(400, "Missing selected Meta assets", "missing_selected_meta_assets");
  }

  const destinationUrl = toAbsoluteDestinationUrl(ad.destinationUrl);
  const creative = await createAdCreative({
    accountId,
    accessToken,
    mode,
    payload: {
      name: `${ad.name} creative`,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          message: ad.copy,
          name: ad.headline,
          picture: ad.creativeAsset.imageUrl,
          link: destinationUrl,
          call_to_action: {
            type: normalizeCta(ad.cta),
            value: {
              link: destinationUrl,
            },
          },
        },
      },
    },
  });

  return {
    creativeId: creative.id,
    adPayload: {
      name: ad.name,
      status: getMetaObjectStatus(launchMode),
      creative: {
        creative_id: creative.id,
      },
    },
  };
}

export function getMetaExecutionMode() {
  const env = getMetaEnv();

  if (!env) {
    throw new ApiError(503, "Meta Ads is not configured.", "meta_config_missing");
  }

  const executionMode: "sandbox" | "live" = env.executionMode === "live" ? "live" : "sandbox";

  if (executionMode === "live" && !isMetaLiveWriteAllowed()) {
    throw new ApiError(
      403,
      "Live Meta launch requires ALLOW_META_LIVE_LAUNCH=true. Use sandbox mode for non-mutating validation.",
      "meta_live_launch_disabled",
    );
  }

  return executionMode;
}

function assertMetaLiveWriteEnabled() {
  if (!isMetaLiveWriteAllowed()) {
    throw new ApiError(
      403,
      "Live Meta launch requires ALLOW_META_LIVE_LAUNCH=true. Use sandbox mode for non-mutating validation.",
      "meta_live_launch_disabled",
    );
  }
}

export function getMetaAccessToken(connection: MetaConnectionRecord) {
  const env = getMetaEnv();

  if (!env) {
    throw new ApiError(503, "Meta Ads is not configured.", "meta_config_missing");
  }

  if (!connection.access_token_encrypted) {
    throw new ApiError(400, "Connected Meta account is missing an access token.", "meta_not_connected");
  }

  return decryptSecret(connection.access_token_encrypted, env.encryptionKey);
}

export async function createCampaign(params: {
  accountId: string;
  accessToken: string;
  payload: MetaCampaignPayload;
  mode: "sandbox" | "live";
}) {
  if (params.mode === "sandbox") {
    return {
      id: `sandbox-campaign-${crypto.randomUUID()}`,
      payload: params.payload,
    };
  }

  assertMetaLiveWriteEnabled();
  const url = buildMetaGraphUrl(`act_${params.accountId}/campaigns`);

  const response = await fetchMetaResponse(url, {
    purpose: "launch_create",
    method: "POST",
    ...withMetaBearerToken(params.accessToken, {
      headers: { "Content-Type": "application/json" },
    }),
    body: JSON.stringify(params.payload),
  });

  const data = (await response.json().catch(() => null)) as
    | { id?: string; error?: { message?: string } }
    | null;

  if (!response.ok || !data?.id) {
    throw new ApiError(
      502,
      data?.error?.message ?? "Meta campaign creation failed.",
      "meta_campaign_create_failed",
    );
  }

  return {
    id: data.id,
    payload: params.payload,
  };
}

export async function createAdSet(params: {
  accountId: string;
  accessToken: string;
  payload: MetaAdSetPayload;
  campaignId: string;
  mode: "sandbox" | "live";
}) {
  if (params.mode === "sandbox") {
    return {
      id: `sandbox-adset-${crypto.randomUUID()}`,
      payload: params.payload,
      campaignId: params.campaignId,
    };
  }

  assertMetaLiveWriteEnabled();
  const url = buildMetaGraphUrl(`act_${params.accountId}/adsets`);

  const response = await fetchMetaResponse(url, {
    purpose: "launch_create",
    method: "POST",
    ...withMetaBearerToken(params.accessToken, {
      headers: { "Content-Type": "application/json" },
    }),
    body: JSON.stringify({
      ...params.payload,
      campaign_id: params.campaignId,
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | { id?: string; error?: { message?: string } }
    | null;

  if (!response.ok || !data?.id) {
    throw new ApiError(
      502,
      data?.error?.message ?? "Meta ad set creation failed.",
      "meta_adset_create_failed",
    );
  }

  return {
    id: data.id,
    payload: params.payload,
    campaignId: params.campaignId,
  };
}

export async function createAd(params: {
  accountId: string;
  accessToken: string;
  payload: MetaAdPayload;
  adSetId: string;
  mode: "sandbox" | "live";
}) {
  if (params.mode === "sandbox") {
    return {
      id: `sandbox-ad-${crypto.randomUUID()}`,
      payload: params.payload,
      adSetId: params.adSetId,
    };
  }

  assertMetaLiveWriteEnabled();
  const url = buildMetaGraphUrl(`act_${params.accountId}/ads`);

  const response = await fetchMetaResponse(url, {
    purpose: "launch_create",
    method: "POST",
    ...withMetaBearerToken(params.accessToken, {
      headers: { "Content-Type": "application/json" },
    }),
    body: JSON.stringify({
      ...params.payload,
      adset_id: params.adSetId,
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | { id?: string; error?: { message?: string } }
    | null;

  if (!response.ok || !data?.id) {
    throw new ApiError(
      502,
      data?.error?.message ?? "Meta ad creation failed.",
      "meta_ad_create_failed",
    );
  }

  return {
    id: data.id,
    payload: params.payload,
    adSetId: params.adSetId,
  };
}
