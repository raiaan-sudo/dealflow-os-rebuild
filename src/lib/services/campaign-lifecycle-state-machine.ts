import type {
  CampaignLifecycleStatus,
  CampaignRuntime,
} from "@/lib/services/campaign-plan-service";

export type CampaignExperienceStatus =
  | "draft"
  | "built"
  | "paywall"
  | "preview"
  | "connected"
  | "launch_ready";

export type ProviderObjectIdentity = {
  campaignId: string | null;
  adSetIds: string[];
  adIds: string[];
};

export class CampaignLifecycleTransitionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CampaignLifecycleTransitionError";
    this.code = code;
  }
}

const EXPERIENCE_ORDER: Record<CampaignExperienceStatus, number> = {
  draft: 0,
  built: 1,
  paywall: 2,
  preview: 3,
  connected: 4,
  launch_ready: 5,
};

const EXPERIENCE_STATUSES = new Set<CampaignLifecycleStatus>(
  Object.keys(EXPERIENCE_ORDER) as CampaignExperienceStatus[],
);

function lifecycleValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => lifecycleValuesEqual(value, right[index]))
    );
  }
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object"
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(rightRecord, key) &&
          lifecycleValuesEqual(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return false;
}

export function decideCampaignRuntimeWrite(params: {
  currentRuntime: Record<string, unknown>;
  targetRuntime: Record<string, unknown>;
  expectedStatusUpdatedAt: string | null;
}): "apply" | "idempotent" | "conflict" {
  const currentStatusUpdatedAt =
    typeof params.currentRuntime.statusUpdatedAt === "string"
      ? params.currentRuntime.statusUpdatedAt
      : null;
  if (currentStatusUpdatedAt === params.expectedStatusUpdatedAt) return "apply";

  const targetAlreadyApplied = Object.entries(params.targetRuntime).every(([key, value]) =>
    lifecycleValuesEqual(params.currentRuntime[key], value),
  );
  return targetAlreadyApplied ? "idempotent" : "conflict";
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function transition(
  runtime: CampaignRuntime,
  updates: Partial<CampaignRuntime>,
  at: string,
): CampaignRuntime {
  return {
    ...runtime,
    ...updates,
    statusUpdatedAt: at,
  };
}

export function hasProviderObjectIdentity(runtime: CampaignRuntime) {
  return Boolean(
    runtime.campaignId ||
      runtime.adSetId ||
      runtime.adId ||
      runtime.metaAdSetIds.length > 0 ||
      runtime.metaAdIds.length > 0,
  );
}

export function hasProviderDeliveryTruth(runtime: CampaignRuntime) {
  return (
    runtime.metaPushStatus === "provider_paused" ||
    runtime.metaPushStatus === "provider_processing" ||
    runtime.metaPushStatus === "published" ||
    runtime.metaPushStatus === "operator_action_required" ||
    runtime.status === "provider_paused" ||
    runtime.status === "provider_processing" ||
    runtime.status === "live" ||
    runtime.status === "active" ||
    runtime.status === "learning" ||
    runtime.status === "optimizing" ||
    runtime.status === "operator_action_required"
  );
}

export function setExperienceRuntime(params: {
  runtime: CampaignRuntime;
  status: CampaignExperienceStatus;
  at: string;
  lastAction: string;
}) {
  const { runtime, status } = params;

  if (hasProviderObjectIdentity(runtime) || hasProviderDeliveryTruth(runtime)) {
    throw new CampaignLifecycleTransitionError(
      "campaign_lifecycle_provider_truth_locked",
      "Provider-backed campaign state cannot be replaced by an experience-stage projection.",
    );
  }

  if (!EXPERIENCE_STATUSES.has(runtime.status)) {
    throw new CampaignLifecycleTransitionError(
      "campaign_lifecycle_transition_invalid",
      `Campaign state ${runtime.status} cannot transition to ${status}.`,
    );
  }

  const currentRank = EXPERIENCE_ORDER[runtime.status as CampaignExperienceStatus];
  const nextRank = EXPERIENCE_ORDER[status];
  if (nextRank < currentRank) {
    throw new CampaignLifecycleTransitionError(
      "campaign_lifecycle_regression_blocked",
      `Campaign state cannot regress from ${runtime.status} to ${status}.`,
    );
  }

  if (status === runtime.status) {
    return runtime;
  }

  return transition(
    runtime,
    {
      status,
      safetyState: "ready",
      metaPushStatus: "not_pushed",
      launchedAt: null,
      lastAction: params.lastAction,
    },
    params.at,
  );
}

export function markLaunchIntentRuntime(params: {
  runtime: CampaignRuntime;
  at: string;
  message: string;
}) {
  if (hasProviderDeliveryTruth(params.runtime)) {
    throw new CampaignLifecycleTransitionError(
      "campaign_lifecycle_provider_truth_locked",
      "A campaign with durable provider truth cannot be returned to launch dispatch.",
    );
  }

  if (params.runtime.status !== "launch_ready" && params.runtime.status !== "launching") {
    throw new CampaignLifecycleTransitionError(
      "campaign_lifecycle_launch_not_ready",
      "Campaign launch requires the canonical launch-ready state.",
    );
  }

  if (params.runtime.status === "launching" && params.runtime.metaPushStatus === "publishing") {
    return params.runtime;
  }

  return transition(
    params.runtime,
    {
      status: "launching",
      safetyState: "ready",
      metaPushStatus: "publishing",
      metaLastMessage: params.message,
      lastAction: params.message,
    },
    params.at,
  );
}

export function applyProviderDispatchResultRuntime(params: {
  runtime: CampaignRuntime;
  result: "provider_paused" | "partial" | "failed" | "operator_action_required";
  identity: ProviderObjectIdentity;
  at: string;
  message: string;
}) {
  const campaignId = params.identity.campaignId?.trim() || null;
  const adSetIds = uniqueNonEmpty(params.identity.adSetIds);
  const adIds = uniqueNonEmpty(params.identity.adIds);
  const hasAnyProviderIdentity = Boolean(campaignId || adSetIds.length || adIds.length);

  if (params.result === "provider_paused") {
    if (!campaignId || adSetIds.length === 0 || adIds.length === 0) {
      throw new CampaignLifecycleTransitionError(
        "campaign_lifecycle_provider_receipt_incomplete",
        "Provider-paused state requires a complete receipted provider object identity.",
      );
    }

    return transition(
      params.runtime,
      {
        status: "provider_paused",
        safetyState: "paused",
        metaPushStatus: "provider_paused",
        campaignId,
        adSetId: adSetIds[0],
        adId: adIds[0],
        metaAdSetIds: adSetIds,
        metaAdIds: adIds,
        metaLastMessage: params.message,
        lastAction: params.message,
        launchedAt: null,
      },
      params.at,
    );
  }

  if (
    params.result === "operator_action_required" ||
    params.result === "partial" ||
    hasAnyProviderIdentity
  ) {
    return transition(
      params.runtime,
      {
        status: "operator_action_required",
        safetyState: "failed",
        metaPushStatus: "operator_action_required",
        campaignId: campaignId ?? params.runtime.campaignId,
        adSetId: adSetIds[0] ?? params.runtime.adSetId,
        adId: adIds[0] ?? params.runtime.adId,
        metaAdSetIds: adSetIds.length > 0 ? adSetIds : params.runtime.metaAdSetIds,
        metaAdIds: adIds.length > 0 ? adIds : params.runtime.metaAdIds,
        metaLastMessage: params.message,
        lastAction: params.message,
      },
      params.at,
    );
  }

  return transition(
    params.runtime,
    {
      status: "launch_ready",
      safetyState: "failed",
      metaPushStatus: "failed",
      metaLastMessage: params.message,
      lastAction: params.message,
    },
    params.at,
  );
}

export function applyProviderReadbackRuntime(params: {
  runtime: CampaignRuntime;
  providerState: "active" | "processing" | "paused" | "operator_action_required";
  campaignId: string;
  activationAuthorized: boolean;
  at: string;
  message: string;
}) {
  const campaignId = params.campaignId.trim();
  if (!campaignId || !params.runtime.campaignId || params.runtime.campaignId !== campaignId) {
    throw new CampaignLifecycleTransitionError(
      "campaign_lifecycle_provider_identity_mismatch",
      "Provider readback does not match the receipted campaign identity.",
    );
  }

  if (params.providerState === "active" && params.activationAuthorized) {
    return transition(
      params.runtime,
      {
        status: "live",
        safetyState: "live",
        metaPushStatus: "published",
        metaLastMessage: params.message,
        lastAction: params.message,
        launchedAt: params.runtime.launchedAt ?? params.at,
      },
      params.at,
    );
  }

  if (params.providerState === "paused") {
    return transition(
      params.runtime,
      {
        status: "provider_paused",
        safetyState: "paused",
        metaPushStatus: "provider_paused",
        metaLastMessage: params.message,
        lastAction: params.message,
      },
      params.at,
    );
  }

  if (params.providerState === "processing" && params.activationAuthorized) {
    return transition(
      params.runtime,
      {
        status: "provider_processing",
        safetyState: "live",
        metaPushStatus: "provider_processing",
        metaLastMessage: params.message,
        lastAction: params.message,
        launchedAt: params.runtime.launchedAt ?? params.at,
      },
      params.at,
    );
  }

  return transition(
    params.runtime,
    {
      status: "operator_action_required",
      safetyState: "failed",
      metaPushStatus: "operator_action_required",
      metaLastMessage: params.message,
      lastAction: params.message,
    },
    params.at,
  );
}

export function applyOptimizationRuntime(params: {
  runtime: CampaignRuntime;
  at: string;
  actionTitle: string;
}) {
  if (
    params.runtime.metaPushStatus !== "published" ||
    !["live", "active", "learning", "optimizing"].includes(params.runtime.status)
  ) {
    throw new CampaignLifecycleTransitionError(
      "campaign_lifecycle_optimization_not_live",
      "Optimization requires verified active provider delivery truth.",
    );
  }

  return transition(
    params.runtime,
    {
      status: "optimizing",
      safetyState: "live",
      lastAction: `AI updated campaign: ${params.actionTitle}`,
      lastOptimizationAction: params.actionTitle,
      lastOptimizationAt: params.at,
    },
    params.at,
  );
}

export function pauseLocalRuntime(runtime: CampaignRuntime, at: string) {
  return transition(
    runtime,
    {
      safetyState: "paused",
      lastAction:
        "DealFlow automation paused locally. Provider delivery was not changed and remains governed by the last verified provider state.",
    },
    at,
  );
}

export function resumeLocalRuntime(runtime: CampaignRuntime, at: string) {
  const safetyState =
    runtime.metaPushStatus === "published"
      ? "live"
      : runtime.metaPushStatus === "provider_paused"
        ? "paused"
        : runtime.metaPushStatus === "provider_processing"
          ? "live"
        : runtime.metaPushStatus === "operator_action_required"
          ? "failed"
          : "ready";

  return transition(
    runtime,
    {
      safetyState,
      lastAction:
        runtime.metaPushStatus === "published"
          ? "DealFlow automation resumed against the last verified active provider state."
          : runtime.metaPushStatus === "provider_paused"
            ? "Provider delivery remains paused. A separately authorized provider action and fresh readback are required to activate it."
            : runtime.metaPushStatus === "provider_processing"
              ? "Provider activation remains authorized while review or delivery startup is still processing."
            : runtime.metaPushStatus === "operator_action_required"
              ? "Automation remains blocked until ambiguous provider state is reconciled."
              : "Campaign automation resumed locally and is ready for the next authorized action.",
    },
    at,
  );
}

export function archiveLocalRuntime(runtime: CampaignRuntime, at: string) {
  if (hasProviderObjectIdentity(runtime) || hasProviderDeliveryTruth(runtime)) {
    throw new CampaignLifecycleTransitionError(
      "campaign_lifecycle_archive_provider_blocked",
      "A provider-backed campaign cannot be archived by a local-only state change.",
    );
  }

  return transition(
    runtime,
    {
      status: "draft",
      safetyState: "paused",
      metaPushStatus: "not_pushed",
      campaignId: null,
      adSetId: null,
      adId: null,
      metaAdSetIds: [],
      metaAdIds: [],
      launchedAt: null,
      lastAction: "Campaign archived locally before any provider object was created.",
    },
    at,
  );
}
