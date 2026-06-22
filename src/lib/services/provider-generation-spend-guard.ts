import { ApiError } from "@/lib/api/route";
import { logWarn } from "@/lib/logging";

export type ProviderGenerationOperation = "image_generation" | "video_generation";

type ProviderUsageEventCostRow = {
  estimated_cost: number | string | null;
  actual_cost: number | string | null;
};

const HARD_CAP_ENABLE_ENV = "PROVIDER_GENERATION_HARD_CAPS_ENABLED";
const KILL_SWITCH_ENV = "PROVIDER_GENERATION_KILL_SWITCH";
const DAILY_COST_CAP_ENV = "PROVIDER_GENERATION_DAILY_COST_CAP_CENTS";
const IMAGE_DAILY_CAP_ENV = "PROVIDER_GENERATION_IMAGE_DAILY_CAP";
const VIDEO_DAILY_CAP_ENV = "PROVIDER_GENERATION_VIDEO_DAILY_CAP";
const IMAGE_MAX_PER_REQUEST_ENV = "PROVIDER_GENERATION_IMAGE_MAX_PER_REQUEST";
const VIDEO_MAX_PER_REQUEST_ENV = "PROVIDER_GENERATION_VIDEO_MAX_PER_REQUEST";
const IMAGE_ESTIMATED_COST_ENV = "PROVIDER_GENERATION_IMAGE_ESTIMATED_COST_CENTS";
const VIDEO_ESTIMATED_COST_ENV = "PROVIDER_GENERATION_VIDEO_ESTIMATED_COST_CENTS";

function isEnabled(value: string | undefined) {
  return value === "true";
}

function parsePositiveInteger(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function operationEnv(operation: ProviderGenerationOperation) {
  return operation === "image_generation"
    ? {
        dailyCap: IMAGE_DAILY_CAP_ENV,
        maxPerRequest: IMAGE_MAX_PER_REQUEST_ENV,
        estimatedCost: IMAGE_ESTIMATED_COST_ENV,
      }
    : {
        dailyCap: VIDEO_DAILY_CAP_ENV,
        maxPerRequest: VIDEO_MAX_PER_REQUEST_ENV,
        estimatedCost: VIDEO_ESTIMATED_COST_ENV,
      };
}

function centsToDollars(cents: number) {
  return Number((cents / 100).toFixed(4));
}

function parseCostCents(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  const numeric = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 100) : 0;
}

function utcTodayStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function getConfiguredCaps(operation: ProviderGenerationOperation) {
  const env = operationEnv(operation);
  const dailyCountCap = parsePositiveInteger(process.env[env.dailyCap]);
  const maxPerRequest = parsePositiveInteger(process.env[env.maxPerRequest]);
  const estimatedCostCents = parsePositiveInteger(process.env[env.estimatedCost]);
  const dailyCostCapCents = parsePositiveInteger(process.env[DAILY_COST_CAP_ENV]);

  return {
    hardCapsEnabled: isEnabled(process.env[HARD_CAP_ENABLE_ENV]),
    killSwitchEnabled: isEnabled(process.env[KILL_SWITCH_ENV]),
    dailyCountCap,
    maxPerRequest,
    estimatedCostCents,
    dailyCostCapCents,
    envNames: {
      hardCapsEnabled: HARD_CAP_ENABLE_ENV,
      killSwitch: KILL_SWITCH_ENV,
      dailyCostCap: DAILY_COST_CAP_ENV,
      dailyCountCap: env.dailyCap,
      maxPerRequest: env.maxPerRequest,
      estimatedCost: env.estimatedCost,
    },
  };
}

export function isProviderGenerationLiveEnvEnabled(operation: ProviderGenerationOperation) {
  const mediaProvider = (process.env.MEDIA_GENERATION_PROVIDER ?? "openai").trim().toLowerCase();
  const higgsfieldSelected = mediaProvider === "higgsfield" || mediaProvider === "higgsfield_marketing_studio";

  if (operation === "image_generation") {
    return higgsfieldSelected
      ? process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION === "true"
      : process.env.ALLOW_OPENAI_IMAGE_GENERATION === "true";
  }

  return higgsfieldSelected
    ? process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION === "true"
    : process.env.ALLOW_HEYGEN_VIDEO_GENERATION === "true";
}

export function getProviderGenerationSpendGateSnapshot() {
  const imageCaps = getConfiguredCaps("image_generation");
  const videoCaps = getConfiguredCaps("video_generation");

  return {
    hardCapsEnabled: imageCaps.hardCapsEnabled,
    killSwitchEnabled: imageCaps.killSwitchEnabled,
    dailyCostCapCents: imageCaps.dailyCostCapCents,
    image: {
      liveEnvEnabled: isProviderGenerationLiveEnvEnabled("image_generation"),
      dailyCountCap: imageCaps.dailyCountCap,
      maxPerRequest: imageCaps.maxPerRequest,
      estimatedCostCents: imageCaps.estimatedCostCents,
    },
    video: {
      liveEnvEnabled: isProviderGenerationLiveEnvEnabled("video_generation"),
      dailyCountCap: videoCaps.dailyCountCap,
      maxPerRequest: videoCaps.maxPerRequest,
      estimatedCostCents: videoCaps.estimatedCostCents,
    },
    envNames: imageCaps.envNames,
  };
}

export function assertProviderGenerationHardCapsConfigured(params: {
  operation: ProviderGenerationOperation;
  requestedCount?: number | null;
}) {
  const requestedCount =
    typeof params.requestedCount === "number" && Number.isFinite(params.requestedCount)
      ? Math.max(1, Math.ceil(params.requestedCount))
      : 1;
  const caps = getConfiguredCaps(params.operation);

  if (caps.killSwitchEnabled) {
    throw new ApiError(
      409,
      "Provider generation is temporarily disabled by the operator kill switch.",
      "provider_generation_kill_switch_enabled",
    );
  }

  if (!caps.hardCapsEnabled) {
    throw new ApiError(
      409,
      "Provider generation requires explicit hard spend caps before paid generation can run.",
      "provider_generation_hard_caps_disabled",
    );
  }

  if (!caps.dailyCountCap || !caps.maxPerRequest || !caps.estimatedCostCents || !caps.dailyCostCapCents) {
    throw new ApiError(
      409,
      "Provider generation hard caps are incomplete. Daily count, request count, estimated cost, and daily cost caps must be configured.",
      "provider_generation_hard_caps_incomplete",
    );
  }

  if (requestedCount > caps.maxPerRequest) {
    throw new ApiError(
      429,
      `This request asks for ${requestedCount} paid generation${requestedCount === 1 ? "" : "s"}, above the configured per-request cap of ${caps.maxPerRequest}.`,
      "provider_generation_request_cap_exceeded",
    );
  }

  return {
    requestedCount,
    dailyCountCap: caps.dailyCountCap,
    maxPerRequest: caps.maxPerRequest,
    estimatedCostCents: caps.estimatedCostCents,
    estimatedCost: centsToDollars(caps.estimatedCostCents),
    dailyCostCapCents: caps.dailyCostCapCents,
  };
}

export async function assertProviderGenerationSpendAllowed(params: {
  admin: {
    from: (table: string) => unknown;
  } | null | undefined;
  provider: string;
  operation: ProviderGenerationOperation;
  userId: string;
  organizationId?: string | null;
  campaignId?: string | null;
  requestedCount?: number | null;
  estimatedCost?: number | null;
}) {
  const caps = assertProviderGenerationHardCapsConfigured({
    operation: params.operation,
    requestedCount: params.requestedCount,
  });

  if (!params.admin) {
    throw new ApiError(
      503,
      "Durable provider spend guard is unavailable.",
      "provider_spend_guard_unavailable",
    );
  }

  const requestedCostCents =
    typeof params.estimatedCost === "number" && Number.isFinite(params.estimatedCost) && params.estimatedCost > 0
      ? Math.round(params.estimatedCost * 100)
      : caps.estimatedCostCents * caps.requestedCount;
  const todayStart = utcTodayStart();
  const query = (params.admin as any)
    .from("provider_usage_events")
    .select("estimated_cost,actual_cost")
    .in("status", ["reserved", "consumed", "failed"])
    .gte("created_at", todayStart);
  const { data, error } = await query;

  if (error) {
    throw new ApiError(500, error.message, "provider_spend_guard_read_failed");
  }

  const currentCostCents = ((data ?? []) as ProviderUsageEventCostRow[]).reduce(
    (total, row) => total + parseCostCents(row.actual_cost ?? row.estimated_cost),
    0,
  );

  if (currentCostCents + requestedCostCents > caps.dailyCostCapCents) {
    logWarn("Provider generation hard spend cap blocked request", {
      provider: params.provider,
      operation: params.operation,
      userId: params.userId,
      organizationId: params.organizationId ?? null,
      campaignId: params.campaignId ?? null,
      currentCostCents,
      requestedCostCents,
      dailyCostCapCents: caps.dailyCostCapCents,
    });
    throw new ApiError(
      429,
      "The daily paid-generation spend cap has been reached. Operator review is required before more provider generation can run.",
      "provider_generation_daily_cost_cap_reached",
    );
  }

  return {
    ...caps,
    requestedCostCents,
    currentCostCents,
    nextCostCents: currentCostCents + requestedCostCents,
    estimatedCost: centsToDollars(requestedCostCents),
  };
}
