import { formatCurrency } from "@/lib/formatters";
import {
  getCampaignPlanById,
  getLatestCampaignPlan,
  persistCampaignPlan,
  type CampaignPlan,
  type CampaignRuntime,
} from "@/lib/services/campaign-plan-service";
import type { ExecutableCampaign } from "@/lib/services/campaign-execution-service";

export type CampaignRuntimeSnapshot = {
  plan: CampaignPlan;
  runtime: CampaignRuntime;
};

const STATUS_TIMINGS_MS = {
  activeToLearning: 12_000,
  learningToOptimizing: 24_000,
} as const;

type CampaignExperienceStatus =
  | "draft"
  | "built"
  | "paywall"
  | "preview"
  | "connected"
  | "launch_ready";

function hasDurableProviderTerminalTruth(runtime: CampaignRuntime) {
  return (
    runtime.status === "provider_paused" ||
    runtime.status === "live" ||
    runtime.metaPushStatus === "provider_paused" ||
    runtime.metaPushStatus === "published"
  );
}

function withRuntime(plan: CampaignPlan, runtime: CampaignRuntime): CampaignPlan {
  return {
    ...plan,
    runtime,
  };
}

function buildLaunchIds(campaign: ExecutableCampaign) {
  const numericSeed = campaign.name
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);

  return {
    campaignId: `CAM-${String(40000 + (numericSeed % 50000)).padStart(5, "0")}`,
    adSetId: `ADSET-${String(90000 + (numericSeed % 8000)).padStart(5, "0")}`,
    adId: `AD-${String(30000 + (numericSeed % 60000)).padStart(5, "0")}`,
  };
}

function getDailyBudget(campaign: ExecutableCampaign) {
  const monthlyBudgetText = campaign.adSets[0]?.budget ?? "$50/month";
  const monthlyBudget = Number(monthlyBudgetText.replace(/[^0-9.]/g, ""));
  const dailyBudget = Math.max(25, Math.round(monthlyBudget / 30));
  return `${formatCurrency(dailyBudget)}/day`;
}

function transitionRuntime(
  runtime: CampaignRuntime,
  updates: Partial<CampaignRuntime>,
): CampaignRuntime {
  return {
    ...runtime,
    ...updates,
    statusUpdatedAt: updates.statusUpdatedAt ?? new Date().toISOString(),
  };
}

export function deriveCampaignRuntime(plan: CampaignPlan) {
  const runtime = plan.runtime;

  if (
    !runtime.launchedAt ||
    runtime.status === "draft" ||
    runtime.status === "built" ||
    runtime.status === "paywall" ||
    runtime.status === "preview" ||
    runtime.status === "connected" ||
    runtime.status === "launch_ready" ||
    runtime.status === "launching" ||
    runtime.status === "live"
  ) {
    return runtime;
  }

  const elapsedMs = Date.now() - new Date(runtime.launchedAt).getTime();

  if (elapsedMs >= STATUS_TIMINGS_MS.learningToOptimizing && runtime.status !== "optimizing") {
    return transitionRuntime(runtime, {
      status: "optimizing",
      lastAction:
        runtime.lastOptimizationAction ??
        "AI updated campaign: optimizing targeting around the strongest response pattern.",
      lastOptimizationAt: runtime.lastOptimizationAt ?? new Date().toISOString(),
    });
  }

  if (elapsedMs >= STATUS_TIMINGS_MS.activeToLearning && runtime.status === "active") {
    return transitionRuntime(runtime, {
      status: "learning",
      lastAction: "Campaign entered learning mode while delivery stabilizes.",
    });
  }

  return runtime;
}

export async function getCampaignRuntimeSnapshot(campaignId?: string | null) {
  const plan = campaignId?.trim()
    ? await getCampaignPlanById(campaignId.trim())
    : await getLatestCampaignPlan();

  if (!plan) {
    return null;
  }

  const derivedRuntime = deriveCampaignRuntime(plan);

  if (JSON.stringify(derivedRuntime) !== JSON.stringify(plan.runtime)) {
    const persistedPlan = await persistCampaignPlan(withRuntime(plan, derivedRuntime));
    return {
      plan: persistedPlan,
      runtime: persistedPlan.runtime,
    } satisfies CampaignRuntimeSnapshot;
  }

  return {
    plan,
    runtime: plan.runtime,
  } satisfies CampaignRuntimeSnapshot;
}

export async function startCampaignLaunch() {
  const snapshot = await getCampaignRuntimeSnapshot();

  if (!snapshot) {
    return null;
  }

  const runtime = transitionRuntime(snapshot.runtime, {
    status: "launching",
    safetyState: "ready",
    lastAction: "Launch sequence started. Validating campaign deployment.",
  });

  const plan = await persistCampaignPlan(withRuntime(snapshot.plan, runtime));
  return { plan, runtime: plan.runtime };
}

export async function setCampaignExperienceStatus(
  status: CampaignExperienceStatus,
  options?: {
    campaignId?: string | null;
    lastAction?: string;
  },
) {
  const snapshot = await getCampaignRuntimeSnapshot(options?.campaignId);

  if (!snapshot) {
    return null;
  }

  if (hasDurableProviderTerminalTruth(snapshot.runtime)) {
    return snapshot;
  }

  const nextRuntime = transitionRuntime(snapshot.runtime, {
    status,
    safetyState: "ready",
    metaPushStatus: "not_pushed",
    launchedAt: null,
    lastAction:
      options?.lastAction ??
      (status === "built"
        ? "Campaign created."
        : status === "paywall"
          ? "Choose a plan before opening review."
        : status === "preview"
            ? "Campaign is ready to review."
            : status === "connected"
              ? "Ad account connected. Finish domain and tracking setup next."
              : status === "launch_ready"
                ? "Connection checks are complete. Launch setup is ready next."
                : "Campaign draft updated."),
  });

  const plan = await persistCampaignPlan(withRuntime(snapshot.plan, nextRuntime));
  return { plan, runtime: plan.runtime };
}

export async function completeCampaignLaunch(campaign: ExecutableCampaign) {
  const snapshot = await getCampaignRuntimeSnapshot();

  if (!snapshot) {
    return null;
  }

  const ids = buildLaunchIds(campaign);
  const runtime = transitionRuntime(snapshot.runtime, {
    status: "launching",
    safetyState: "ready",
    campaignId: ids.campaignId,
    adSetId: ids.adSetId,
    adId: ids.adId,
    budgetDaily: getDailyBudget(campaign),
    lastAction: "Campaign structure prepared. Waiting for Meta to confirm publish.",
  });

  const plan = await persistCampaignPlan(withRuntime(snapshot.plan, runtime));
  return { plan, runtime: plan.runtime };
}

export async function applyCampaignOptimization(actionTitle: string) {
  const snapshot = await getCampaignRuntimeSnapshot();

  if (!snapshot) {
    return null;
  }

  const runtime = transitionRuntime(snapshot.runtime, {
    status: "live",
    safetyState: "live",
    lastAction: `AI updated campaign: ${actionTitle}`,
    lastOptimizationAction: actionTitle,
    lastOptimizationAt: new Date().toISOString(),
  });

  const plan = await persistCampaignPlan(withRuntime(snapshot.plan, runtime));
  return { plan, runtime: plan.runtime };
}

export async function markMetaPublishing() {
  const snapshot = await getCampaignRuntimeSnapshot();

  if (!snapshot) {
    return null;
  }

  const runtime = transitionRuntime(snapshot.runtime, {
    metaPushStatus: "publishing",
    status: "launching",
    safetyState: "ready",
    metaLastMessage: "Preparing campaign objects for Meta Ads deployment.",
    lastAction: "Preparing Meta Ads deployment for approval.",
  });

  const plan = await persistCampaignPlan(withRuntime(snapshot.plan, runtime));
  return { plan, runtime: plan.runtime };
}

export async function updateMetaPublishResult(params: {
  status: "published" | "partial" | "failed";
  campaignId: string | null;
  adSetIds: string[];
  adIds: string[];
  message: string;
}) {
  const snapshot = await getCampaignRuntimeSnapshot();

  if (!snapshot) {
    return null;
  }

  const runtime = transitionRuntime(snapshot.runtime, {
    metaPushStatus: params.status,
    safetyState:
      params.status === "published"
        ? "live"
        : params.status === "partial"
          ? "failed"
          : "failed",
    metaLastMessage: params.message,
    campaignId: params.campaignId ?? snapshot.runtime.campaignId,
    adSetId: params.adSetIds[0] ?? snapshot.runtime.adSetId,
    adId: params.adIds[0] ?? snapshot.runtime.adId,
    metaAdSetIds: params.adSetIds,
    metaAdIds: params.adIds,
    lastAction:
      params.status === "published"
        ? "Campaign pushed to Meta Ads and confirmed live."
        : params.status === "partial"
          ? "Campaign push reached Meta Ads with partial completion."
          : "Campaign push to Meta Ads failed.",
    status:
      params.status === "published"
        ? "live"
        : params.status === "partial"
          ? "launching"
          : "launch_ready",
    launchedAt: params.status === "published" ? new Date().toISOString() : snapshot.runtime.launchedAt,
  });

  const plan = await persistCampaignPlan(withRuntime(snapshot.plan, runtime));
  return { plan, runtime: plan.runtime };
}

export async function updateCampaignExecutionGuardrails(params: {
  campaignId?: string | null;
  budgetDailyInput: number;
  launchMode: "test" | "live";
  safetyState: "ready" | "blocked";
  message: string;
}) {
  const snapshot = await getCampaignRuntimeSnapshot(params.campaignId);

  if (!snapshot) {
    return null;
  }

  const runtime = transitionRuntime(snapshot.runtime, {
    budgetDailyInput: params.budgetDailyInput,
    budgetDaily: `${formatCurrency(params.budgetDailyInput)}/day`,
    launchMode: params.launchMode,
    safetyState:
      snapshot.runtime.metaPushStatus === "provider_paused"
        ? "paused"
        : params.safetyState,
    lastAction: params.message,
  });

  const plan = await persistCampaignPlan(withRuntime(snapshot.plan, runtime));
  return { plan, runtime: plan.runtime };
}

export async function pauseCampaignExecution(campaignId?: string | null) {
  const snapshot = await getCampaignRuntimeSnapshot(campaignId);

  if (!snapshot) {
    return null;
  }

  const runtime = transitionRuntime(snapshot.runtime, {
    status:
      snapshot.runtime.metaPushStatus === "provider_paused"
        ? "provider_paused"
        : snapshot.runtime.metaPushStatus === "published"
          ? "live"
          : "launch_ready",
    safetyState: "paused",
    lastAction: "Campaign paused locally. No new launch or publish actions will run until resumed.",
  });

  const plan = await persistCampaignPlan(withRuntime(snapshot.plan, runtime));
  return { plan, runtime: plan.runtime };
}

export async function resumeCampaignExecution(campaignId?: string | null) {
  const snapshot = await getCampaignRuntimeSnapshot(campaignId);

  if (!snapshot) {
    return null;
  }

  if (
    snapshot.runtime.metaPushStatus === "provider_paused" ||
    snapshot.runtime.metaPushStatus === "published"
  ) {
    const runtime = transitionRuntime(snapshot.runtime, {
      status:
        snapshot.runtime.metaPushStatus === "provider_paused"
          ? "provider_paused"
          : "live",
      safetyState: "paused",
      lastAction:
        "Provider delivery state was not changed. A separately authorized provider action and fresh sync are required before delivery can be described as active.",
    });

    const plan = await persistCampaignPlan(withRuntime(snapshot.plan, runtime));
    return { plan, runtime: plan.runtime };
  }

  const runtime = transitionRuntime(snapshot.runtime, {
    status: "launch_ready",
    safetyState: "ready",
    lastAction: "Campaign resumed locally and is ready for launch actions again.",
  });

  const plan = await persistCampaignPlan(withRuntime(snapshot.plan, runtime));
  return { plan, runtime: plan.runtime };
}

export async function archiveCampaignExecution(campaignId?: string | null) {
  const snapshot = await getCampaignRuntimeSnapshot(campaignId);

  if (!snapshot) {
    return null;
  }

  const runtime = transitionRuntime(snapshot.runtime, {
    status: "draft",
    safetyState: "paused",
    metaPushStatus: "failed",
    lastAction: "Campaign archived locally and marked inactive.",
  });

  const plan = await persistCampaignPlan(withRuntime(snapshot.plan, runtime));
  return { plan, runtime: plan.runtime };
}
