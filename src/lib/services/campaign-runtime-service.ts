import { ApiError } from "@/lib/api/route";
import { formatCurrency } from "@/lib/formatters";
import {
  getCampaignPlanById,
  getLatestCampaignPlan,
  type CampaignPlan,
  type CampaignRuntime,
} from "@/lib/services/campaign-plan-service";
import {
  applyOptimizationRuntime,
  applyProviderDispatchResultRuntime,
  applyProviderReadbackRuntime,
  archiveLocalRuntime,
  CampaignLifecycleTransitionError,
  markLaunchIntentRuntime,
  pauseLocalRuntime,
  resumeLocalRuntime,
  setExperienceRuntime,
  type CampaignExperienceStatus,
} from "@/lib/services/campaign-lifecycle-state-machine";
import { persistCampaignRuntimeTransition } from "@/lib/services/campaign-plan-persistence-service";
import { getAppContext } from "@/lib/services/app-context";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getCampaignByIdForInternalActor } from "@/lib/services/campaign-persistence";
import type { ExecutableCampaign } from "@/lib/services/campaign-execution-service";

export type CampaignRuntimeSnapshot = {
  plan: CampaignPlan;
  runtime: CampaignRuntime;
};

function getDailyBudget(campaign: ExecutableCampaign) {
  const monthlyBudgetText = campaign.adSets[0]?.budget ?? "$50/month";
  const monthlyBudget = Number(monthlyBudgetText.replace(/[^0-9.]/g, ""));
  const dailyBudget = Math.max(25, Math.round(monthlyBudget / 30));
  return `${formatCurrency(dailyBudget)}/day`;
}

function mapLifecycleError(error: unknown): never {
  if (error instanceof CampaignLifecycleTransitionError) {
    throw new ApiError(409, error.message, error.code);
  }
  throw error;
}

function applyLifecycleTransition(
  transition: () => CampaignRuntime,
): CampaignRuntime {
  try {
    return transition();
  } catch (error) {
    return mapLifecycleError(error);
  }
}

async function persistRuntime(params: {
  snapshot: CampaignRuntimeSnapshot;
  runtime: CampaignRuntime;
  source: string;
  internalActor?: { organizationId: string; userId: string };
}) {
  if (params.runtime === params.snapshot.runtime) {
    return params.snapshot;
  }

  const context = params.internalActor
    ? {
        organization: { id: params.internalActor.organizationId },
        user: { id: params.internalActor.userId },
      }
    : await getAppContext();
  if (!context) {
    throw new ApiError(401, "Authentication is required.", "unauthorized");
  }
  if (
    params.snapshot.plan.organizationId &&
    params.snapshot.plan.organizationId !== context.organization.id
  ) {
    throw new ApiError(403, "Campaign workspace access was denied.", "forbidden");
  }

  await persistCampaignRuntimeTransition({
    campaignId: params.snapshot.plan.id,
    organizationId: context.organization.id,
    userId: context.user.id,
    expectedStatusUpdatedAt: params.snapshot.runtime.statusUpdatedAt,
    runtime: params.runtime,
    source: params.source,
  });

  const plan = params.internalActor
    ? await getCampaignByIdForInternalActor({
        campaignId: params.snapshot.plan.id,
        organizationId: params.internalActor.organizationId,
        userId: params.internalActor.userId,
      }).then((record) => (record ? canonicalCampaignToPlan(record) : null))
    : await getCampaignPlanById(params.snapshot.plan.id);
  if (!plan) {
    throw new ApiError(
      409,
      "Campaign runtime was updated but could not be reloaded.",
      "campaign_runtime_reload_failed",
    );
  }
  return { plan, runtime: plan.runtime } satisfies CampaignRuntimeSnapshot;
}

/**
 * Runtime reads are deliberately side-effect free. Provider delivery, learning,
 * and optimization states may advance only from durable receipts/readback or
 * an actual optimization settlement, never from elapsed wall-clock time.
 */
export function deriveCampaignRuntime(plan: CampaignPlan) {
  return plan.runtime;
}

export async function getCampaignRuntimeSnapshot(campaignId?: string | null) {
  const plan = campaignId?.trim()
    ? await getCampaignPlanById(campaignId.trim())
    : await getLatestCampaignPlan();

  if (!plan) {
    return null;
  }

  return {
    plan,
    runtime: deriveCampaignRuntime(plan),
  } satisfies CampaignRuntimeSnapshot;
}

export async function startCampaignLaunch(campaignId?: string | null) {
  const snapshot = await getCampaignRuntimeSnapshot(campaignId);
  if (!snapshot) return null;

  const runtime = applyLifecycleTransition(() =>
    markLaunchIntentRuntime({
      runtime: snapshot.runtime,
      at: new Date().toISOString(),
      message: "Launch intent recorded. Waiting for the fenced provider dispatch worker.",
    }),
  );
  return persistRuntime({ snapshot, runtime, source: "campaign_runtime:start_launch" });
}

export async function setCampaignExperienceStatus(
  status: CampaignExperienceStatus,
  options?: {
    campaignId?: string | null;
    lastAction?: string;
  },
) {
  const snapshot = await getCampaignRuntimeSnapshot(options?.campaignId);
  if (!snapshot) return null;

  const lastAction =
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
              : "Campaign draft updated.");
  const runtime = applyLifecycleTransition(() =>
    setExperienceRuntime({
      runtime: snapshot.runtime,
      status,
      at: new Date().toISOString(),
      lastAction,
    }),
  );
  return persistRuntime({
    snapshot,
    runtime,
    source: "campaign_runtime:set_experience_status",
  });
}

export async function completeCampaignLaunch(
  campaign: ExecutableCampaign,
  campaignId?: string | null,
) {
  const snapshot = await getCampaignRuntimeSnapshot(campaignId);
  if (!snapshot) return null;

  const at = new Date().toISOString();
  const launching = applyLifecycleTransition(() =>
    markLaunchIntentRuntime({
      runtime: snapshot.runtime,
      at,
      message:
        "Campaign structure is prepared. No provider object ID or live state is inferred before durable provider receipts.",
    }),
  );
  const runtime: CampaignRuntime = {
    ...launching,
    budgetDaily: getDailyBudget(campaign),
    statusUpdatedAt: at,
  };
  return persistRuntime({ snapshot, runtime, source: "campaign_runtime:prepare_launch" });
}

export async function applyCampaignOptimization(
  actionTitle: string,
  campaignId?: string | null,
) {
  const snapshot = await getCampaignRuntimeSnapshot(campaignId);
  if (!snapshot) return null;

  const runtime = applyLifecycleTransition(() =>
    applyOptimizationRuntime({
      runtime: snapshot.runtime,
      at: new Date().toISOString(),
      actionTitle,
    }),
  );
  return persistRuntime({ snapshot, runtime, source: "campaign_runtime:optimization" });
}

export async function markMetaPublishing(campaignId?: string | null) {
  const snapshot = await getCampaignRuntimeSnapshot(campaignId);
  if (!snapshot) return null;

  const runtime = applyLifecycleTransition(() =>
    markLaunchIntentRuntime({
      runtime: snapshot.runtime,
      at: new Date().toISOString(),
      message: "Provider dispatch intent recorded. Awaiting durable PAUSED-object receipts.",
    }),
  );
  return persistRuntime({ snapshot, runtime, source: "campaign_runtime:meta_dispatch_intent" });
}

export async function updateMetaPublishResult(params: {
  status: "provider_paused" | "partial" | "failed" | "operator_action_required";
  campaignId: string | null;
  adSetIds: string[];
  adIds: string[];
  message: string;
  internalCampaignId?: string | null;
}) {
  const snapshot = await getCampaignRuntimeSnapshot(params.internalCampaignId);
  if (!snapshot) return null;

  const runtime = applyLifecycleTransition(() =>
    applyProviderDispatchResultRuntime({
      runtime: snapshot.runtime,
      result: params.status,
      identity: {
        campaignId: params.campaignId,
        adSetIds: params.adSetIds,
        adIds: params.adIds,
      },
      at: new Date().toISOString(),
      message: params.message,
    }),
  );
  return persistRuntime({ snapshot, runtime, source: "campaign_runtime:meta_dispatch_result" });
}

export async function reconcileCampaignProviderReadback(params: {
  internalCampaignId: string;
  metaCampaignId: string;
  providerState: "active" | "processing" | "paused" | "operator_action_required";
  activationAuthorized: boolean;
  readAt: string;
  message: string;
  internalActor?: { organizationId: string; userId: string };
}) {
  const snapshot = params.internalActor
    ? await getCampaignByIdForInternalActor({
        campaignId: params.internalCampaignId,
        organizationId: params.internalActor.organizationId,
        userId: params.internalActor.userId,
      }).then((record) => {
        const plan = record ? canonicalCampaignToPlan(record) : null;
        return plan ? ({ plan, runtime: plan.runtime } satisfies CampaignRuntimeSnapshot) : null;
      })
    : await getCampaignRuntimeSnapshot(params.internalCampaignId);
  if (!snapshot) return null;

  const runtime = applyLifecycleTransition(() =>
    applyProviderReadbackRuntime({
      runtime: snapshot.runtime,
      providerState: params.providerState,
      campaignId: params.metaCampaignId,
      activationAuthorized: params.activationAuthorized,
      at: params.readAt,
      message: params.message,
    }),
  );
  return persistRuntime({
    snapshot,
    runtime,
    source: "campaign_runtime:provider_readback",
    internalActor: params.internalActor,
  });
}

export async function updateCampaignExecutionGuardrails(params: {
  campaignId?: string | null;
  budgetDailyInput: number;
  launchMode: "test" | "live";
  safetyState: "ready" | "blocked";
  message: string;
}) {
  if (!Number.isFinite(params.budgetDailyInput) || params.budgetDailyInput <= 0) {
    throw new ApiError(
      400,
      "Daily budget must be a positive finite amount.",
      "campaign_budget_invalid",
    );
  }
  const snapshot = await getCampaignRuntimeSnapshot(params.campaignId);
  if (!snapshot) return null;

  const providerSafetyState =
    snapshot.runtime.metaPushStatus === "published"
      ? snapshot.runtime.safetyState
      : snapshot.runtime.metaPushStatus === "provider_paused"
        ? "paused"
        : snapshot.runtime.metaPushStatus === "provider_processing"
          ? snapshot.runtime.safetyState
        : snapshot.runtime.metaPushStatus === "operator_action_required"
          ? "failed"
          : params.safetyState;
  const runtime: CampaignRuntime = {
    ...snapshot.runtime,
    budgetDailyInput: params.budgetDailyInput,
    budgetDaily: `${formatCurrency(params.budgetDailyInput)}/day`,
    launchMode: params.launchMode,
    safetyState: providerSafetyState,
    lastAction: params.message,
    statusUpdatedAt: new Date().toISOString(),
  };
  return persistRuntime({ snapshot, runtime, source: "campaign_runtime:set_guardrails" });
}

export async function pauseCampaignExecution(campaignId?: string | null) {
  const snapshot = await getCampaignRuntimeSnapshot(campaignId);
  if (!snapshot) return null;

  const runtime = pauseLocalRuntime(snapshot.runtime, new Date().toISOString());
  return persistRuntime({ snapshot, runtime, source: "campaign_runtime:pause_local" });
}

export async function resumeCampaignExecution(campaignId?: string | null) {
  const snapshot = await getCampaignRuntimeSnapshot(campaignId);
  if (!snapshot) return null;

  const runtime = resumeLocalRuntime(snapshot.runtime, new Date().toISOString());
  return persistRuntime({ snapshot, runtime, source: "campaign_runtime:resume_local" });
}

export async function archiveCampaignExecution(campaignId?: string | null) {
  const snapshot = await getCampaignRuntimeSnapshot(campaignId);
  if (!snapshot) return null;

  const runtime = applyLifecycleTransition(() =>
    archiveLocalRuntime(snapshot.runtime, new Date().toISOString()),
  );
  return persistRuntime({ snapshot, runtime, source: "campaign_runtime:archive_local" });
}
