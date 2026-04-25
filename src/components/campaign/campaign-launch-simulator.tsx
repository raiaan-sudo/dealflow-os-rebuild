"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  LaunchActionPanel,
  LaunchGuidedFlowPanel,
  LaunchMetricsCardSet,
  LaunchPerformancePanel,
  PostLaunchStatePanel,
} from "@/components/campaign/launch/launch-sections";
import {
  LaunchConfirmDialog,
  LaunchStatusFeedback,
} from "@/components/campaign/launch/launch-detail-panels";
import {
  LAUNCH_STEPS,
  MAX_SAFE_DAILY_BUDGET,
  useLaunchSimulatorModel,
} from "@/components/campaign/launch/use-launch-simulator-model";
import {
  type DeployResult,
  fetchCampaignActions,
  fetchCampaignDrafts,
  fetchCreativePerformance,
  fetchMetaConnectionStatus,
  fetchRuntime,
  postRuntimeUpdate,
  syncCampaignStatus,
  updateCampaignAction,
  updateCampaignDraft,
} from "@/components/campaign/launch/launch-runtime-api";
import type { BillingPlanTier } from "@/lib/billing/plans";
import type {
  MetaCampaignSyncSnapshot,
  MetaConnectionState,
} from "@/lib/integrations/meta/types";
import type { CampaignActionSuggestion } from "@/lib/services/campaign-action-service";
import type { CampaignDraftAction } from "@/lib/services/campaign-draft-action-service";
import type { CreativePerformanceSummary } from "@/lib/services/creative-performance-service";
import type { ExecutableCampaign } from "@/lib/services/campaign-execution-service";
import type { CampaignLaunchRecord } from "@/lib/services/campaign-launch-audit-service";
import { GLOBAL_LEAD_CAPTURE_SCOPE, queueLeadCapture } from "@/lib/lead-capture";
import type {
  CampaignRuntime,
  ExpectedOutcomes,
} from "@/lib/services/campaign-plan-service";
import type { OperatorMode } from "@/lib/operator-mode";
import { getLaunchBlockingReasons } from "@/lib/services/launch-readiness";

type CampaignLaunchSimulatorProps = {
  campaign: ExecutableCampaign;
  expectedOutcomes: ExpectedOutcomes;
  initialRuntime: CampaignRuntime;
  metaConnection: MetaConnectionState;
  initialLaunchRecord: CampaignLaunchRecord | null;
  initialSyncSnapshot: MetaCampaignSyncSnapshot | null;
  initialActionSuggestions: CampaignActionSuggestion[];
  initialCreativeSummary: CreativePerformanceSummary | null;
  initialDraftActions: CampaignDraftAction[];
  planTier: BillingPlanTier;
  operatorMode: OperatorMode;
  focusMode?: boolean;
  launchRequirements: {
    campaignSaved: boolean;
    metaConnected: boolean;
    pixelReady: boolean;
    domainReady: boolean;
  };
};

export function CampaignLaunchSimulator({
  campaign,
  expectedOutcomes,
  initialRuntime,
  metaConnection,
  initialLaunchRecord,
  initialSyncSnapshot,
  initialActionSuggestions,
  initialCreativeSummary,
  initialDraftActions,
  planTier,
  operatorMode,
  focusMode = false,
  launchRequirements,
}: CampaignLaunchSimulatorProps) {
  const router = useRouter();
  const [runtime, setRuntime] = useState(initialRuntime);
  const [connectionState, setConnectionState] = useState(metaConnection);
  const [stepIndex, setStepIndex] = useState(() =>
    initialRuntime.status === "launching" ? 0 : LAUNCH_STEPS.length - 1,
  );
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [launchAudit, setLaunchAudit] = useState<CampaignLaunchRecord | null>(
    initialLaunchRecord,
  );
  const [syncSnapshot, setSyncSnapshot] = useState<MetaCampaignSyncSnapshot | null>(
    initialSyncSnapshot,
  );
  const [actionSuggestions, setActionSuggestions] = useState<CampaignActionSuggestion[]>(
    initialActionSuggestions,
  );
  const [creativeSummary, setCreativeSummary] = useState<CreativePerformanceSummary | null>(
    initialCreativeSummary,
  );
  const [draftActions, setDraftActions] = useState<CampaignDraftAction[]>(initialDraftActions);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState(initialRuntime.budgetDailyInput ?? 0);
  const [launchMode, setLaunchMode] = useState<"test" | "live">(
    initialRuntime.launchMode ?? "test",
  );
  const [syncing, setSyncing] = useState(false);
  const [activeOperation, setActiveOperation] = useState<"sync" | "deploy" | null>(null);
  const [slowOperationMessage, setSlowOperationMessage] = useState<string | null>(null);
  const launchLeadCaptureQueuedRef = useRef(false);
  const connectionPromotedRef = useRef(false);
  const demoMode = operatorMode === "demo";
  const campaignQuery = `campaignId=${encodeURIComponent(campaign.id)}`;
  const readyDrafts = useMemo(
    () =>
      draftActions.filter(
        (item) =>
          item.status === "draft" ||
          item.status === "awaiting_approval" ||
          item.status === "auto_prepared",
      ),
    [draftActions],
  );
  const appliedDrafts = useMemo(
    () => draftActions.filter((item) => item.status === "applied"),
    [draftActions],
  );
  const autoPreparedDrafts = useMemo(
    () => draftActions.filter((item) => item.status === "auto_prepared"),
    [draftActions],
  );
  const queuedCloneCount = runtime.queuedCampaignClones.length;
  const approvalDrafts = useMemo(
    () =>
      draftActions.filter(
        (item) => item.status === "draft" || item.status === "awaiting_approval",
      ),
    [draftActions],
  );

  useEffect(() => {
    setRuntime(initialRuntime);
  }, [initialRuntime]);

  useEffect(() => {
    setConnectionState(metaConnection);
  }, [metaConnection]);

  useEffect(() => {
    let active = true;

    async function refreshConnection() {
      try {
        const nextConnection = await fetchMetaConnectionStatus();

        if (!active) {
          return;
        }

        setConnectionState(nextConnection);
      } catch {
        return;
      }
    }

    void refreshConnection();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setLaunchAudit(initialLaunchRecord);
  }, [initialLaunchRecord]);

  useEffect(() => {
    setSyncSnapshot(initialSyncSnapshot);
  }, [initialSyncSnapshot]);

  useEffect(() => {
    setActionSuggestions(initialActionSuggestions);
  }, [initialActionSuggestions]);

  useEffect(() => {
    setCreativeSummary(initialCreativeSummary);
  }, [initialCreativeSummary]);

  useEffect(() => {
    setDraftActions(initialDraftActions);
  }, [initialDraftActions]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const result = await fetchRuntime();

        if (result.runtime) {
          setRuntime(result.runtime);
        }
      } catch {
        return;
      }
    }, 6000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!activeOperation) {
      setSlowOperationMessage(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      setSlowOperationMessage(
        activeOperation === "deploy"
          ? "Deployment is still running. Meta object creation can take a few seconds."
          : "Sync is still running. The latest delivery data is still being pulled in.",
      );
    }, 3000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeOperation]);

  useEffect(() => {
    const isMetaConnected =
      connectionState.connectionStatus === "connected" ||
      Boolean((connectionState as { connected?: boolean }).connected);
    const canPromoteLaunch =
      launchRequirements.campaignSaved &&
      isMetaConnected === true &&
      launchRequirements.pixelReady &&
      launchRequirements.domainReady;

    if (
      !canPromoteLaunch ||
      connectionPromotedRef.current ||
      runtime.status === "launch_ready" ||
      runtime.status === "launching" ||
      runtime.status === "live"
    ) {
      return;
    }

    connectionPromotedRef.current = true;

    void postRuntimeUpdate({
      action: "set_experience_status",
      experienceStatus: "launch_ready",
    })
      .then((result) => {
        if (result.runtime) {
          setRuntime(result.runtime);
        }
      })
      .catch(() => {
        connectionPromotedRef.current = false;
      });
  }, [
    connectionState,
    demoMode,
    launchRequirements.campaignSaved,
    launchRequirements.domainReady,
    launchRequirements.pixelReady,
    runtime.status,
  ]);

  useEffect(() => {
    if (runtime.status !== "launching") {
      return;
    }

    const timeout = window.setTimeout(async () => {
      if (stepIndex >= LAUNCH_STEPS.length - 1) {
        return;
      }

      setStepIndex((current) => current + 1);
    }, 900);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [runtime.status, stepIndex]);

  useEffect(() => {
    const isLive = runtime.metaPushStatus === "published";

    if (!isLive || launchLeadCaptureQueuedRef.current) {
      return;
    }

    launchLeadCaptureQueuedRef.current = true;
    queueLeadCapture(GLOBAL_LEAD_CAPTURE_SCOPE, "launched");
  }, [runtime.metaPushStatus]);

  const {
    metaConnected,
    canLaunch,
    isLive,
    isLaunching,
    launchSteps,
    canUseMetaLaunch,
    currentMessage,
    launchStatusLabel,
    estimatedPerformance,
    launchState,
    dataSourceState,
    shouldShowPerformanceNarrative,
    performanceSummary,
    canPushToMeta,
    canSyncMeta,
    budgetAboveThreshold,
    requiresBudget,
  } = useLaunchSimulatorModel({
    runtime,
    connectionState,
    creativeSummary,
    syncSnapshot,
    stepIndex,
    expectedOutcomes,
    planTier,
    budgetInput,
    launchMode,
    demoMode,
    campaignStatus: campaign.status,
    launchAuditMetaCampaignId: launchAudit?.metaCampaignId,
    launchRequirements,
  });

  const blockingRequirements = getLaunchBlockingReasons(launchRequirements).map((reason) =>
    reason === "Configure the Meta pixel"
      ? "Configure a Meta pixel"
      : reason === "Verify the launch domain"
        ? "Configure a verified launch domain"
        : reason,
  );

  async function syncGuardrails(nextBudget: number, nextMode: "test" | "live") {
    const blocked = nextMode === "live" && nextBudget > MAX_SAFE_DAILY_BUDGET;
    const message = blocked
      ? `Live launch blocked because the daily budget ${nextBudget} is above the safe threshold of ${MAX_SAFE_DAILY_BUDGET}.`
      : `Launch guardrails updated for ${nextMode} mode at ${nextBudget}/day.`;

    const result = await postRuntimeUpdate({
      action: "set_guardrails",
      budgetDailyInput: nextBudget,
      launchMode: nextMode,
      safetyState: blocked ? "blocked" : "ready",
      message,
    });

    if (result.runtime) {
      setRuntime(result.runtime);
    }
  }

  async function handleLaunch() {
    setError(null);

    if (!canLaunch) {
      setError(blockingRequirements[0] ?? "Launch requirements are not complete.");
      return;
    }

    try {
      setDeploying(true);
      const launchResult = await postRuntimeUpdate({ action: "launch" });

      if (launchResult.runtime) {
        setRuntime(launchResult.runtime);
      }

      router.push(
        `/launching?mode=${encodeURIComponent(demoMode ? "demo" : launchMode)}&${campaignQuery}`,
      );
    } catch (deployError) {
      setError(
        deployError instanceof Error
          ? deployError.message
          : "Campaign launch could not be completed.",
      );
    } finally {
      setDeploying(false);
      setActiveOperation(null);
    }
  }

  async function handlePause() {
    const result = await postRuntimeUpdate({ action: "pause_campaign" });
    if (result.runtime) {
      setRuntime(result.runtime);
    }
  }

  async function handleResume() {
    const result = await postRuntimeUpdate({ action: "resume_campaign" });
    if (result.runtime) {
      setRuntime(result.runtime);
    }
  }

  async function handleArchive() {
    const result = await postRuntimeUpdate({ action: "archive_campaign" });
    if (result.runtime) {
      setRuntime(result.runtime);
    }
  }

  function handleConnectAccount() {
    window.location.assign(`/api/integrations/meta/connect?${campaignQuery}`);
  }

  async function handleSync() {
    setSyncing(true);
    setActiveOperation("sync");
    setError(null);

    try {
      const snapshot = await syncCampaignStatus();
      setSyncSnapshot(snapshot);

      try {
        const summary = await fetchCreativePerformance();
        setCreativeSummary(summary);
      } catch {
        // Keep the synced snapshot visible even if summary hydration fails.
      }

      try {
        const actions = await fetchCampaignActions();
        setActionSuggestions(actions);
      } catch {
        // Keep the last known actions if recommendation refresh fails.
      }

      try {
        const drafts = await fetchCampaignDrafts();
        setDraftActions(drafts);
      } catch {
        // Keep the last known draft queue if draft refresh fails.
      }
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Campaign status could not be synced.",
      );
    } finally {
      setSyncing(false);
      setActiveOperation(null);
    }
  }

  async function handleActionUpdate(id: string, action: "approve" | "dismiss") {
    try {
      setActionFeedback(
        action === "approve" ? "Applying optimization..." : "Recommendation dismissed.",
      );
      if (action === "approve") {
        setActionSuggestions((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, status: "applying" as const }
              : item,
          ),
        );
      }
      const updated = await updateCampaignAction(id, action);
      const actions = await fetchCampaignActions();
      setActionSuggestions(
        actions.map((item) => (item.id === updated.id ? updated : item)),
      );
      const runtimeResult = await fetchRuntime();
      if (runtimeResult.runtime) {
        setRuntime(runtimeResult.runtime);
      }
      const summary = await fetchCreativePerformance();
      setCreativeSummary(summary);
      const drafts = await fetchCampaignDrafts();
      setDraftActions(drafts);
      if (action === "approve") {
        setActionFeedback("Optimization applied.");
      }
    } catch (actionError) {
      setActionFeedback(null);
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Campaign action could not be updated.",
      );
    }
  }

  async function handleDraftUpdate(id: string, action: "approve" | "dismiss") {
    try {
      setActionFeedback(
        action === "approve" ? "Queuing optimization..." : "Prepared action dismissed.",
      );
      const draft = await updateCampaignDraft(id, action);
      const drafts = await fetchCampaignDrafts();
      setDraftActions(
        drafts.map((item) => (item.id === draft.id ? draft : item)),
      );
      setActionFeedback(
        action === "approve"
          ? draft.status === "applied"
            ? "Optimization queued."
            : "Approval recorded."
          : "Prepared action dismissed.",
      );
    } catch (draftError) {
      setError(
        draftError instanceof Error
          ? draftError.message
          : "Draft action could not be updated.",
      );
    }
  }

  return (
    <Card className="relative p-6 sm:p-7">
      <LaunchConfirmDialog
        open={showConfirm}
        campaign={campaign}
        budgetInput={budgetInput}
        launchMode={launchMode}
        requiresBudget={requiresBudget}
        budgetAboveThreshold={budgetAboveThreshold}
        maxSafeDailyBudget={MAX_SAFE_DAILY_BUDGET}
        deploying={deploying}
        runtime={runtime}
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => void handleLaunch()}
      />

      <LaunchPerformancePanel
        shouldShowPerformanceNarrative={shouldShowPerformanceNarrative}
        performanceSummary={performanceSummary}
        launchState={launchState}
        dataSourceState={dataSourceState}
      />

      <LaunchActionPanel
        currentMessage={currentMessage}
        launchStatusLabel={launchStatusLabel}
        canLaunch={canLaunch}
        blockingRequirements={blockingRequirements}
        demoMode={demoMode}
        launchMode={launchMode}
        handleLaunch={() => void handleLaunch()}
        handleConnectAccount={handleConnectAccount}
        canPushToMeta={canPushToMeta}
        focusMode={focusMode}
        runtime={runtime}
      />

      {demoMode ? (
        <div className="mt-4 rounded-[20px] border border-primary/15 bg-primary/10 px-4 py-3 text-sm text-primary">
          Demo mode is active. Launch and sync use the mock Meta path so you can test the full workflow safely.
        </div>
      ) : null}

      <LaunchGuidedFlowPanel
        focusMode={focusMode}
        isLive={isLive}
        isLaunching={isLaunching}
        canLaunch={canLaunch}
        blockingRequirements={blockingRequirements}
        demoMode={demoMode}
        launchMode={launchMode}
        launchSteps={launchSteps}
        handleLaunch={() => void handleLaunch()}
        handleConnectAccount={handleConnectAccount}
        onViewResults={() => router.push(`/results?${campaignQuery}`)}
        onReviewCampaign={() => router.push(`/review?${campaignQuery}`)}
      />

      <PostLaunchStatePanel
        runtime={runtime}
        focusMode={focusMode}
        demoMode={demoMode}
        launchMode={launchMode}
        onViewResults={() => router.push(`/results?${campaignQuery}`)}
      />

      <LaunchMetricsCardSet
        focusMode={focusMode}
        runtime={runtime}
        connectionState={connectionState}
        launchRequirements={launchRequirements}
        planTier={planTier}
        budgetInput={budgetInput}
        launchMode={launchMode}
        launchStatusLabel={launchStatusLabel}
      />

      <LaunchStatusFeedback
        focusMode={focusMode}
        budgetInput={budgetInput}
        setBudgetInput={setBudgetInput}
        launchMode={launchMode}
        setLaunchMode={setLaunchMode}
        syncGuardrails={syncGuardrails}
        runtime={runtime}
        requiresBudget={requiresBudget}
        budgetAboveThreshold={budgetAboveThreshold}
        maxSafeDailyBudget={MAX_SAFE_DAILY_BUDGET}
        error={error}
        activeOperation={activeOperation}
        syncing={syncing}
        deploying={deploying}
        handleSync={() => void handleSync()}
        setShowConfirm={setShowConfirm}
        slowOperationMessage={slowOperationMessage}
        actionFeedback={actionFeedback}
        deployResult={deployResult}
      />
    </Card>
  );
}
