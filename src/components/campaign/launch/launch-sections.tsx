"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CampaignRuntime } from "@/lib/services/campaign-plan-service";
import type { MetaConnectionState } from "@/lib/integrations/meta/types";

function EnvironmentBadge({
  demoMode,
  launchMode,
}: {
  demoMode: boolean;
  launchMode: "test" | "live";
}) {
  const isLive = !demoMode && launchMode === "live";

  return (
    <Badge
      className={
        isLive
          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
          : "border-amber-400/20 bg-amber-400/10 text-amber-100"
      }
    >
      {demoMode ? "Demo environment" : launchMode === "test" ? "Test environment" : "Activation review"}
    </Badge>
  );
}

export function LaunchPerformancePanel({
  shouldShowPerformanceNarrative,
  performanceSummary,
  launchState,
  dataSourceState,
}: {
  shouldShowPerformanceNarrative: boolean;
  performanceSummary: {
    totalLeads: number;
    baselineLeadCount: number;
    baselineCpl: number | null;
    currentCpl: number | null;
    trendTone: { badge: string; arrow: string; label: string; accent: string };
    conversionMessage: string;
    trafficQualityMessage: string;
    stabilityMessage: string;
    aiSummary: string;
    winner: { headline: string; hook: string; angle: string } | null;
    currentClicks: number;
    currentImpressions: number;
    hasSyncedResults: boolean;
    cplDelta: number;
    trend: "improving" | "stable" | "declining";
  };
  launchState: string;
  dataSourceState: "disconnected" | "collecting" | "active";
}) {
  return (
    <div className="rounded-[28px] border border-white/8 bg-[#050810] p-5 shadow-[0_24px_80px_-56px_rgba(50,130,246,0.45)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Campaign Performance
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">
            {shouldShowPerformanceNarrative
              ? performanceSummary.totalLeads > 0
                ? `${performanceSummary.totalLeads} leads generated`
                : "Campaign is collecting data"
              : "No live data yet"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/70">
            {shouldShowPerformanceNarrative
              ? performanceSummary.aiSummary
              : "Launch and connect Meta to start collecting results. Performance reporting will appear once live delivery data is available."}
          </p>
        </div>
        <Badge className={shouldShowPerformanceNarrative ? performanceSummary.trendTone.badge : "border-white/10 bg-white/[0.06] text-white/85"}>
          {shouldShowPerformanceNarrative
            ? `${performanceSummary.trendTone.arrow} ${performanceSummary.trendTone.label}`
            : dataSourceState === "disconnected"
              ? "Disconnected"
              : dataSourceState === "collecting"
                ? "Collecting"
                : "Active"}
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Leads generated</p>
          <p className="mt-2 text-2xl font-semibold text-white">{shouldShowPerformanceNarrative ? performanceSummary.totalLeads : "—"}</p>
          <p className="mt-2 text-sm text-white/60">
            {shouldShowPerformanceNarrative
              ? performanceSummary.hasSyncedResults
                ? `Pulled from live campaign sync. Started at ${performanceSummary.baselineLeadCount} and moved to ${performanceSummary.totalLeads}.`
                : `Started at ${performanceSummary.baselineLeadCount} and moved to ${performanceSummary.totalLeads}.`
              : "No live lead data is available yet."}
          </p>
        </div>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Cost per lead</p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {shouldShowPerformanceNarrative && performanceSummary.currentCpl !== null ? `$${performanceSummary.currentCpl.toFixed(0)}` : "—"}
          </p>
          <p className={`mt-2 text-sm ${shouldShowPerformanceNarrative ? performanceSummary.trendTone.accent : "text-white/60"}`}>
            {shouldShowPerformanceNarrative && performanceSummary.currentCpl !== null && performanceSummary.baselineCpl !== null
              ? `${performanceSummary.trendTone.arrow} ${Math.abs(performanceSummary.cplDelta)}% vs launch baseline`
              : "Live delivery data will populate this once the campaign is running."}
          </p>
        </div>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Conversion trend</p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {shouldShowPerformanceNarrative ? performanceSummary.trendTone.label : "No live data yet"}
          </p>
          <p className="mt-2 text-sm text-white/60">
            {shouldShowPerformanceNarrative ? performanceSummary.conversionMessage : "Launch and connect Meta to start collecting results."}
          </p>
        </div>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Best performing ad</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {shouldShowPerformanceNarrative ? performanceSummary.winner?.headline ?? performanceSummary.winner?.hook ?? "No winner yet" : "No winner yet"}
          </p>
          <p className="mt-2 text-sm text-white/60">
            {shouldShowPerformanceNarrative && performanceSummary.winner
              ? `${performanceSummary.winner.angle} is the best-performing angle right now. Best hook: "${performanceSummary.winner.hook}".`
              : "Winner logic stays hidden until real live performance exists."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function LaunchActionPanel({
  currentMessage,
  launchStatusLabel,
  canLaunch,
  blockingRequirements,
  demoMode,
  launchMode,
  handleLaunch,
  handleConnectAccount,
  canPushToMeta,
  focusMode,
  runtime,
}: {
  currentMessage: string;
  launchStatusLabel: string;
  canLaunch: boolean;
  blockingRequirements: string[];
  demoMode: boolean;
  launchMode: "test" | "live";
  handleLaunch: () => void;
  handleConnectAccount: () => void;
  canPushToMeta: boolean;
  focusMode: boolean;
  runtime: CampaignRuntime;
}) {
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Launch control
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
            {runtime.status === "draft" ||
            runtime.status === "built" ||
            runtime.status === "preview" ||
            runtime.status === "launch_ready"
              ? "Paused launch setup"
              : "Campaign execution"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{currentMessage}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <EnvironmentBadge demoMode={demoMode} launchMode={launchMode} />
          <Badge className="border-white/10 bg-white/[0.06] text-white/85">{launchStatusLabel}</Badge>
          <Button size="lg" onClick={canLaunch ? handleLaunch : handleConnectAccount}>
            {canLaunch
              ? runtime.metaPushStatus === "published"
                ? "Publish confirmed"
                : "Create paused objects"
              : blockingRequirements[0] === "Connect a real Meta ad account"
                ? "Connect Ad Account"
                : "Launch Blocked"}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={canLaunch ? handleLaunch : handleConnectAccount}
            disabled={canLaunch ? !canPushToMeta : blockingRequirements[0] !== "Connect a real Meta ad account"}
          >
            {canLaunch ? "Review paused setup" : blockingRequirements[0] === "Connect a real Meta ad account" ? "Connect Meta" : "Finish setup"}
          </Button>
        </div>
      </div>

      {!canLaunch && blockingRequirements.length > 0 ? (
        <div className="mt-4 rounded-[20px] border border-amber-400/15 bg-amber-400/10 p-4 text-sm text-amber-100">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Launch requirements</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {blockingRequirements.map((requirement) => (
              <Badge key={requirement} className="border-amber-400/20 bg-amber-400/10 text-amber-100">
                {requirement}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {focusMode ? null : null}
    </>
  );
}

export function LaunchGuidedFlowPanel({
  focusMode,
  isLive,
  isLaunching,
  canLaunch,
  blockingRequirements,
  demoMode,
  launchMode,
  launchSteps,
  handleLaunch,
  handleConnectAccount,
  onViewResults,
  onReviewCampaign,
}: {
  focusMode: boolean;
  isLive: boolean;
  isLaunching: boolean;
  canLaunch: boolean;
  blockingRequirements: string[];
  demoMode: boolean;
  launchMode: "test" | "live";
  launchSteps: ReadonlyArray<{ label: string; detail: string; complete: boolean; current: boolean }>;
  handleLaunch: () => void;
  handleConnectAccount: () => void;
  onViewResults: () => void;
  onReviewCampaign: () => void;
}) {
  if (!focusMode) {
    return null;
  }

  return (
    <div className="mt-4 rounded-[24px] border border-primary/15 bg-primary/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Guided launch</p>
          <p className="mt-2 text-xl font-semibold">
            {isLive
              ? "Publish confirmed"
              : isLaunching
                ? "Creating paused Meta objects"
                : canLaunch
                  ? "Launch requirements met"
                  : "Finish launch requirements to continue"}
          </p>
        </div>
        <EnvironmentBadge demoMode={demoMode} launchMode={launchMode} />
      </div>
      <div className="mt-4 space-y-3">
        {launchSteps.map((step, index) => (
          <div key={step.label} className="flex flex-wrap items-start justify-between gap-3 rounded-[20px] border border-white/8 bg-black/20 p-4">
            <div className="min-w-0">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs ${
                step.complete
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                  : step.current
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : "border-white/10 bg-white/[0.04] text-white/65"
              }`}>
                {step.complete ? "✓" : index + 1}
              </div>
              <p className="mt-3 text-sm font-medium">{step.label}</p>
              <p className="mt-2 text-sm leading-7 text-white/60">{step.detail}</p>
            </div>
            <Badge className={step.complete ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : step.current ? "border-primary/20 bg-primary/10 text-primary" : "border-white/10 bg-white/[0.04] text-white/65"}>
              {step.complete ? "Complete" : step.current ? "Current" : "Pending"}
            </Badge>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {!isLive ? (
          <>
            <Button
              size="lg"
              onClick={canLaunch ? handleLaunch : handleConnectAccount}
              disabled={!canLaunch && blockingRequirements[0] !== "Connect a real Meta ad account"}
            >
              {canLaunch
                ? "Create paused objects"
                : blockingRequirements[0] === "Connect a real Meta ad account"
                  ? "Connect Meta Account"
                  : "Launch Blocked"}
            </Button>
            {!canLaunch && blockingRequirements.length > 0 ? (
              <p className="w-full text-center text-sm text-white/65">
                {blockingRequirements.join(" • ")}
              </p>
            ) : null}
          </>
        ) : null}
        {isLive ? (
          <>
            <Button size="lg" onClick={onViewResults}>
              Dashboard
            </Button>
            <Button size="lg" variant="secondary" onClick={onReviewCampaign}>
              Review
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function PostLaunchStatePanel({
  runtime,
  focusMode,
  demoMode,
  launchMode,
  onViewResults,
}: {
  runtime: CampaignRuntime;
  focusMode: boolean;
  demoMode: boolean;
  launchMode: "test" | "live";
  onViewResults?: () => void;
}) {
  if (runtime.metaPushStatus !== "published") {
    return null;
  }

  return (
    <div className={`mt-4 rounded-[24px] border border-emerald-400/15 bg-emerald-400/10 p-5 ${focusMode ? "overflow-hidden" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">
          Publish confirmed
        </p>
        <EnvironmentBadge demoMode={demoMode} launchMode={launchMode} />
      </div>
      <h3 className="mt-3 text-2xl font-semibold text-white">
        {focusMode ? "Campaign published" : "Publish confirmed"}
      </h3>
      <p className="mt-3 text-sm leading-7 text-emerald-50/85">
        Publish is confirmed. Delivery metrics and results should be treated as trustworthy only after a live sync reports real campaign data.
      </p>
      {onViewResults ? (
        <div className="mt-5">
          <Button size="sm" variant="secondary" onClick={onViewResults}>
            Dashboard
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function LaunchMetricsCardSet({
  focusMode,
  runtime,
  connectionState,
  launchRequirements,
  planTier,
  budgetInput,
  launchMode,
  launchStatusLabel,
}: {
  focusMode: boolean;
  runtime: CampaignRuntime;
  connectionState: MetaConnectionState;
  launchRequirements: {
    campaignSaved: boolean;
    metaConnected: boolean;
    pixelReady: boolean;
    domainReady: boolean;
  };
  planTier: string;
  budgetInput: number;
  launchMode: "test" | "live";
  launchStatusLabel: string;
}) {
  if (focusMode) {
    return null;
  }

  const safeConnectionStatus = (connectionState.connectionStatus || "disconnected")
    .toString()
    .replaceAll("_", " ");
  const safeMetaPushStatus = (runtime.metaPushStatus || "disconnected")
    .toString()
    .replaceAll("_", " ");
  const connectedAccountLabel = connectionState.accountName
    ? `${connectionState.accountName}${connectionState.accountId ? ` (${connectionState.accountId})` : ""}`
    : "No ad account selected";
  const selectedPixelLabel = connectionState.tracking.pixelId
    ? connectionState.tracking.pixelId
    : "No pixel selected";

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Campaign status</p>
        <p className="mt-2 text-sm font-medium">{launchStatusLabel}</p>
      </div>
      <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Campaign record</p>
        <p className="mt-2 text-sm font-medium">{launchRequirements.campaignSaved ? "Saved" : "Missing"}</p>
      </div>
      <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Meta ad account</p>
        <p className="mt-2 text-sm font-medium capitalize">
          {connectionState.connectionStatus === "connected" ? "Connected" : safeConnectionStatus}
        </p>
        <p className="mt-2 text-sm text-white/60">{connectedAccountLabel}</p>
      </div>
      <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Pixel</p>
        <p className="mt-2 text-sm font-medium">{launchRequirements.pixelReady ? "Ready" : "Missing"}</p>
        <p className="mt-2 text-sm text-white/60">{selectedPixelLabel}</p>
      </div>
      <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Domain</p>
        <p className="mt-2 text-sm font-medium">{launchRequirements.domainReady ? "Ready" : "Missing"}</p>
      </div>
      <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Meta publish</p>
        <p className="mt-2 text-sm font-medium capitalize">{safeMetaPushStatus}</p>
      </div>
      <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Budget / mode</p>
        <p className="mt-2 text-sm font-medium">{budgetInput || "Required"} · {launchMode}</p>
        <p className="mt-2 text-sm text-white/60 capitalize">{planTier} plan</p>
      </div>
    </div>
  );
}
