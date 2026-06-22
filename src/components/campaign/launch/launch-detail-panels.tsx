// @ts-nocheck
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  MetaCampaignSyncSnapshot,
} from "@/lib/integrations/meta/types";
import type { CampaignActionSuggestion } from "@/lib/services/campaign-action-service";
import type { CampaignDraftAction } from "@/lib/services/campaign-draft-action-service";
import type { CreativePerformanceSummary } from "@/lib/services/creative-performance-service";
import type { ExecutableCampaign } from "@/lib/services/campaign-execution-service";
import type { CampaignLaunchRecord } from "@/lib/services/campaign-launch-audit-service";
import type {
  CampaignRuntime,
  ExpectedOutcomes,
} from "@/lib/services/campaign-plan-service";
import type { DeployResult } from "@/components/campaign/launch/launch-runtime-api";

export function LaunchConfirmDialog({
  open,
  campaign,
  budgetInput,
  launchMode,
  requiresBudget,
  budgetAboveThreshold,
  maxSafeDailyBudget,
  deploying,
  runtime,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  campaign: ExecutableCampaign;
  budgetInput: number;
  launchMode: "test" | "live";
  requiresBudget: boolean;
  budgetAboveThreshold: boolean;
  maxSafeDailyBudget: number;
  deploying: boolean;
  runtime: CampaignRuntime;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[32px] bg-black/70 p-6 backdrop-blur-md">
      <div className="w-full max-w-3xl rounded-[28px] border border-white/10 bg-[#06080f] p-6 shadow-[0_32px_90px_-48px_rgba(0,0,0,0.95)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Confirm Meta deployment
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
          Review before pushing to Meta Ads
        </h3>
        <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Campaign</p>
            <p className="mt-2 text-sm font-medium">{campaign.name}</p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Budget</p>
            <p className="mt-2 text-sm font-medium">
              {budgetInput > 0 ? `${budgetInput}/day` : "Required before launch"}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Destination</p>
            <p className="mt-2 text-sm font-medium">{campaign.destinationUrl}</p>
          </div>
        </div>
        <div className="mt-4 rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Targeting summary</p>
          <div className="mt-3 space-y-2 text-sm leading-7 text-muted-foreground">
            {campaign.adSets.map((adSet) => (
              <p key={adSet.id}>
                {adSet.name}: {adSet.targeting.audience} in {adSet.targeting.location} for {adSet.targeting.propertyType} with {adSet.targeting.offer}.
              </p>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch mode</p>
          <p className="mt-2 text-sm font-medium capitalize">{launchMode}</p>
          {requiresBudget ? (
            <p className="mt-3 text-sm text-amber-200">
              Set a daily budget before launching to Meta Ads.
            </p>
          ) : budgetAboveThreshold && launchMode === "live" ? (
            <p className="mt-3 text-sm text-amber-200">
              High budget — confirm before proceeding. This live launch is above the safe threshold of {maxSafeDailyBudget}/day.
            </p>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {campaign.adSets.flatMap((adSet) => adSet.ads).slice(0, 3).map((ad) => (
            <div key={ad.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <div className="overflow-hidden rounded-[18px] border border-white/8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ad.creativeAsset.imageUrl}
                  alt={ad.creativeAsset.name}
                  className="aspect-[4/5] h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.src =
                      "https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop";
                  }}
                />
              </div>
              <p className="mt-3 text-sm font-medium">{ad.headline}</p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{ad.creative}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={deploying}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={deploying || runtime.safetyState === "blocked" || requiresBudget}
          >
            {deploying ? "Launching..." : "Confirm & Launch"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function LaunchStatusFeedback({
  focusMode,
  budgetInput,
  setBudgetInput,
  launchMode,
  setLaunchMode,
  syncGuardrails,
  runtime,
  requiresBudget,
  budgetAboveThreshold,
  maxSafeDailyBudget,
  error,
  activeOperation,
  syncing,
  deploying,
  handleSync,
  setShowConfirm,
  slowOperationMessage,
  actionFeedback,
  deployResult,
}: {
  focusMode: boolean;
  budgetInput: number;
  setBudgetInput: (value: number) => void;
  launchMode: "test" | "live";
  setLaunchMode: (value: "test" | "live") => void;
  syncGuardrails: (nextBudget: number, nextMode: "test" | "live") => Promise<void>;
  runtime: CampaignRuntime;
  requiresBudget: boolean;
  budgetAboveThreshold: boolean;
  maxSafeDailyBudget: number;
  error: string | null;
  activeOperation: "sync" | "deploy" | null;
  syncing: boolean;
  deploying: boolean;
  handleSync: () => void;
  setShowConfirm: (value: boolean) => void;
  slowOperationMessage: string | null;
  actionFeedback: string | null;
  deployResult: DeployResult | null;
}) {
  return (
    <>
      {!focusMode ? (
        <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
          <div className="grid gap-4 2xl:grid-cols-[0.9fr_0.5fr_1fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Daily budget input</p>
              <input
                type="number"
                min={1}
                value={budgetInput}
                onChange={(event) => setBudgetInput(Number(event.target.value || 0))}
                onBlur={() => void syncGuardrails(budgetInput, launchMode)}
                className="mt-3 h-12 w-full rounded-[18px] border border-white/8 bg-black/20 px-4 text-sm outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch mode</p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant={launchMode === "test" ? "default" : "secondary"}
                  onClick={() => {
                    setLaunchMode("test");
                    void syncGuardrails(budgetInput, "test");
                  }}
                >
                  Test
                </Button>
                <Button
                  size="sm"
                  variant={launchMode === "live" ? "default" : "secondary"}
                  onClick={() => {
                    setLaunchMode("live");
                    void syncGuardrails(budgetInput, "live");
                  }}
                >
                  Live
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Guardrail status</p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {runtime.safetyState === "blocked"
                  ? `Launch is blocked. Reduce the daily budget below ${maxSafeDailyBudget}/day or switch to test mode.`
                  : requiresBudget
                    ? "Set a daily budget before you push this campaign to Meta Ads."
                    : launchMode === "live" && budgetAboveThreshold
                      ? `High budget — confirm before proceeding. This live launch is above ${maxSafeDailyBudget}/day.`
                      : "Launch is within the current guardrails and ready for confirmation."}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-[20px] border border-red-500/15 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            {activeOperation === "sync" ? (
              <Button size="sm" variant="secondary" onClick={handleSync} disabled={syncing}>
                Retry sync
              </Button>
            ) : activeOperation === "deploy" ? (
              <Button size="sm" variant="secondary" onClick={() => setShowConfirm(true)} disabled={deploying}>
                Retry launch
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {slowOperationMessage ? (
        <div className="mt-4 rounded-[20px] border border-amber-400/15 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {slowOperationMessage}
        </div>
      ) : null}

      {actionFeedback ? (
        <div className="mt-4 rounded-[20px] border border-primary/15 bg-primary/10 px-4 py-3 text-sm text-primary">
          {actionFeedback}
        </div>
      ) : null}

      {deployResult ? (
        <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Meta deployment result
              </p>
              <p className="mt-2 text-xl font-semibold">
                {deployResult.mode === "live" ? "Live deployment created" : "Demo deployment created"}
              </p>
            </div>
            <Badge>{deployResult.mode === "live" ? "Live mode" : "Demo mode"}</Badge>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Campaign ID</p>
              <p className="mt-2 text-sm font-medium">{deployResult.campaignId}</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch flow</p>
              <p className="mt-2 text-sm font-medium">
                Deployment completed. The shared launch animation and success flow will take over next.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function CreativeLearningPanel({
  focusMode,
  creativeSummary,
  syncing,
}: {
  focusMode: boolean;
  creativeSummary: CreativePerformanceSummary | null;
  syncing: boolean;
}) {
  if (focusMode || (!creativeSummary && !syncing)) {
    return null;
  }

  return (
    <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Creative learning
          </p>
          <p className="mt-2 text-xl font-semibold">What the AI learned</p>
        </div>
        <Badge>{creativeSummary?.syncedAt ? new Date(creativeSummary.syncedAt).toLocaleString() : "Updating"}</Badge>
      </div>

      {creativeSummary ? (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            <div className="rounded-[20px] border border-emerald-400/15 bg-emerald-400/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">Winners</p>
              <p className="mt-2 text-2xl font-semibold text-white">{creativeSummary.winners.length}</p>
            </div>
            <div className="rounded-[20px] border border-amber-400/15 bg-amber-400/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-amber-200">Average</p>
              <p className="mt-2 text-2xl font-semibold text-white">{creativeSummary.average.length}</p>
            </div>
            <div className="rounded-[20px] border border-rose-400/15 bg-rose-400/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-rose-200">Underperformers</p>
              <p className="mt-2 text-2xl font-semibold text-white">{creativeSummary.underperformers.length}</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tested angles</p>
              <p className="mt-2 text-sm font-medium">
                {creativeSummary.testedAngles.length > 0
                  ? creativeSummary.testedAngles.map((item) => item.angle).join(", ")
                  : "No angle data yet"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Winning creatives</p>
              <div className="mt-3 space-y-3">
                {creativeSummary.winners.length > 0 ? creativeSummary.winners.map((item) => (
                  <div key={item.id} className="rounded-[18px] border border-white/8 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{item.hook}</p>
                      <Badge className="border-emerald-400/15 bg-emerald-400/10 text-emerald-300">{item.angle}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      CTR {(item.ctr * 100).toFixed(1)}% • CPL {item.cpl ? `${item.cpl}` : "n/a"} • {item.clicks} clicks
                    </p>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No winners yet. Current data is still inconclusive.</p>}
              </div>
            </div>

            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Underperformers</p>
              <div className="mt-3 space-y-3">
                {creativeSummary.underperformers.length > 0 ? creativeSummary.underperformers.map((item) => (
                  <div key={item.id} className="rounded-[18px] border border-white/8 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{item.hook}</p>
                      <Badge className="border-rose-400/15 bg-rose-400/10 text-rose-300">{item.angle}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      CTR {(item.ctr * 100).toFixed(1)}% • CPL {item.cpl ? `${item.cpl}` : "n/a"} • {item.clicks} clicks
                    </p>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No clear losers yet. The system is still collecting signal.</p>}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">AI learned</p>
            <div className="mt-3 space-y-2">
              {creativeSummary.learned.length > 0 ? creativeSummary.learned.map((item) => (
                <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
              )) : <p className="text-sm text-muted-foreground">The system needs more delivered data before it can call a pattern with confidence.</p>}
            </div>
          </div>
        </>
      ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={`creative-learning-${index}`} className="h-28 w-full rounded-[20px]" />
          ))}
        </div>
      )}
    </div>
  );
}

function formatDraftActionLabel(value: string) {
  if (value === "campaign_clone_test") {
    return "campaign clone test";
  }

  return value.replaceAll("_", " ");
}

function formatDraftProposedChange(proposedChange: Record<string, unknown>) {
  const allowedKeys = [
    "cloneName",
    "focus",
    "angle",
    "hook",
    "headline",
    "overlayText",
    "proposedAudience",
    "currentDailyBudget",
    "proposedDailyBudget",
    "proposedMonthlyBudget",
    "instruction",
  ] as const;

  return allowedKeys
    .map((key) => {
      const value = proposedChange[key];
      if (typeof value !== "string" && typeof value !== "number") {
        return null;
      }

      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (char) => char.toUpperCase());
      return `${label}: ${String(value)}`;
    })
    .filter((value): value is string => Boolean(value))
    .join(" • ");
}

function formatDraftStatusLabel(status: CampaignDraftAction["status"]) {
  switch (status) {
    case "auto_prepared":
      return "Auto-prepared";
    case "awaiting_approval":
      return "Needs approval";
    case "applied":
      return "Queued";
    default:
      return status
        .replaceAll("_", " ")
        .replace(/^./, (char) => char.toUpperCase());
  }
}

function getDraftStatusTone(status: CampaignDraftAction["status"]) {
  switch (status) {
    case "applied":
      return "border-emerald-400/15 bg-emerald-400/10 text-emerald-300";
    case "awaiting_approval":
      return "border-amber-400/15 bg-amber-400/10 text-amber-200";
    case "auto_prepared":
      return "border-primary/15 bg-primary/10 text-primary";
    case "dismissed":
      return "border-white/10 bg-white/[0.06] text-white/60";
    default:
      return "border-white/10 bg-white/[0.06] text-white/85";
  }
}

export function DraftActionQueuePanel({
  focusMode,
  draftActions,
  creativeSummary,
  approvalDrafts,
  appliedDrafts,
  autoPreparedDrafts,
  readyDrafts,
  queuedCloneCount,
  runtime,
  handleDraftUpdate,
}: {
  focusMode: boolean;
  draftActions: CampaignDraftAction[];
  creativeSummary: CreativePerformanceSummary | null;
  approvalDrafts: CampaignDraftAction[];
  appliedDrafts: CampaignDraftAction[];
  autoPreparedDrafts: CampaignDraftAction[];
  readyDrafts: CampaignDraftAction[];
  queuedCloneCount: number;
  runtime: CampaignRuntime;
  handleDraftUpdate: (id: string, action: "approve" | "dismiss") => void;
}) {
  if (focusMode || draftActions.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Prepared by Jarvis
          </p>
          <p className="mt-2 text-xl font-semibold">Draft next actions</p>
        </div>
        <Badge>{draftActions.length} queued</Badge>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {draftActions.map((draft) => (
          <div key={draft.id} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{formatDraftActionLabel(draft.actionType)}</p>
              <Badge className={getDraftStatusTone(draft.status)}>
                {formatDraftStatusLabel(draft.status)}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-7">{draft.sourceReason}</p>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              {draft.expectedImpact}
            </p>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              {formatDraftProposedChange(draft.proposedChange)}
            </p>
            {draft.status === "draft" ||
            draft.status === "awaiting_approval" ||
            draft.status === "auto_prepared" ? (
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => handleDraftUpdate(draft.id, "approve")}>
                  {draft.status === "auto_prepared" ? "Queue test" : "Approve"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleDraftUpdate(draft.id, "dismiss")}>
                  Dismiss
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[20px] border border-white/8 bg-black/20 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Experimentation queue</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Current winner</p>
            <p className="mt-2 text-sm">{creativeSummary?.winners[0]?.hook ?? "None yet"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Underperformers</p>
            <p className="mt-2 text-sm">{creativeSummary?.underperformers.length ?? 0}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Approval needed</p>
            <p className="mt-2 text-sm">{approvalDrafts.length}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Queued tests</p>
            <p className="mt-2 text-sm">{appliedDrafts.length}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Auto-prepared</p>
            <p className="mt-2 text-sm">{autoPreparedDrafts.length}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total ready</p>
            <p className="mt-2 text-sm">{readyDrafts.length}</p>
          </div>
        </div>
        {queuedCloneCount > 0 ? (
          <div className="mt-4 rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Queued campaign clones</p>
            <div className="mt-3 space-y-2">
              {runtime.queuedCampaignClones.map((clone) => (
                <div key={clone.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-white/80">
                  <span>{clone.name}</span>
                  <span className="text-xs text-muted-foreground">{clone.focus}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DeliverySyncPanel({
  focusMode,
  syncSnapshot,
  syncing,
}: {
  focusMode: boolean;
  syncSnapshot: MetaCampaignSyncSnapshot | null;
  syncing: boolean;
}) {
  if (focusMode) {
    return null;
  }

  return (
    <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Live delivery sync
          </p>
          <p className="mt-2 text-xl font-semibold">
            {syncSnapshot?.campaignStatus ?? "Sync campaign status after publish"}
          </p>
        </div>
        <Badge className="border-white/10 bg-white/[0.06] text-white/85">
          {syncSnapshot?.syncResult?.replaceAll("_", " ") ?? "not synced"}
        </Badge>
      </div>

      {syncSnapshot ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Last synced</p>
            <p className="mt-2 text-sm font-medium">
              {syncSnapshot.syncedAt ? new Date(syncSnapshot.syncedAt).toLocaleString() : "No sync yet"}
            </p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Campaign status</p>
            <p className="mt-2 text-sm font-medium">{syncSnapshot.campaignStatus ?? "Unavailable"}</p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Spend</p>
            <p className="mt-2 text-sm font-medium">${syncSnapshot.deliveryMetrics.spend.toFixed(2)}</p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Delivery</p>
            <p className="mt-2 text-sm font-medium">
              {`${syncSnapshot.deliveryMetrics.impressions.toLocaleString()} impressions · ${syncSnapshot.deliveryMetrics.clicks.toLocaleString()} clicks · ${syncSnapshot.deliveryMetrics.leads.toLocaleString()} leads`}
            </p>
          </div>
        </div>
      ) : syncing ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={`sync-summary-${index}`} className="h-24 w-full rounded-[20px]" />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-sm text-muted-foreground">No live delivery data yet. Run a sync after publish to load real campaign metrics.</p>
        </div>
      )}

      {syncSnapshot ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ad set status</p>
            <div className="mt-3 space-y-3">
              {syncSnapshot.adSetStatuses.length ? (
                syncSnapshot.adSetStatuses.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-white/85">{item.name}</span>
                    <Badge className="border-white/10 bg-white/[0.06] text-white/85">{item.status}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No ad set statuses have been synced yet.</p>
              )}
            </div>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ad status</p>
            <div className="mt-3 space-y-3">
              {syncSnapshot.adStatuses.length ? (
                syncSnapshot.adStatuses.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-white/85">{item.name}</span>
                    <Badge className="border-white/10 bg-white/[0.06] text-white/85">{item.status}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No ad statuses have been synced yet.</p>
              )}
            </div>
          </div>
        </div>
      ) : syncing ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-44 w-full rounded-[20px]" />
          <Skeleton className="h-44 w-full rounded-[20px]" />
        </div>
      ) : null}

      {syncSnapshot?.syncErrors.length ? (
        <div className="mt-4 rounded-[20px] border border-amber-400/15 bg-amber-400/10 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-200">Sync issues</p>
          <div className="mt-3 space-y-2 text-sm text-amber-50">
            {syncSnapshot.syncErrors.map((item, index) => (
              <p key={`${item.stage}-${item.target}-${index}`}>
                {item.stage.replaceAll("_", " ")}: {item.message}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OperatorSuggestionsPanel({
  focusMode,
  syncing,
  actionSuggestions,
  handleActionUpdate,
}: {
  focusMode: boolean;
  syncing: boolean;
  actionSuggestions: CampaignActionSuggestion[];
  handleActionUpdate: (id: string, action: "approve" | "dismiss") => void;
}) {
  if (focusMode) {
    return null;
  }

  return (
    <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Recommended next actions
          </p>
          <p className="mt-2 text-xl font-semibold">
            Operator suggestions based on live campaign state
          </p>
        </div>
        <Badge className="border-white/10 bg-white/[0.06] text-white/85">
          {actionSuggestions.filter((item) => item.status === "suggested").length} suggested
        </Badge>
      </div>

      <div className="mt-4 space-y-4">
        {syncing && actionSuggestions.length === 0 ? (
          <>
            <Skeleton className="h-40 w-full rounded-[20px]" />
            <Skeleton className="h-40 w-full rounded-[20px]" />
          </>
        ) : actionSuggestions.length > 0 ? (
          actionSuggestions.map((action) => (
            <div key={action.id} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{action.title}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {action.type.replaceAll("_", " ")}
                  </p>
                </div>
                <Badge className="border-white/10 bg-white/[0.06] text-white/85">
                  {action.status}
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{action.reason}</p>
              <div className="mt-3 rounded-[16px] border border-white/8 bg-white/[0.03] p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Expected improvement</p>
                <p className="mt-2 text-sm text-white/85">{action.expectedImpact}</p>
              </div>
              {action.status === "suggested" ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button size="sm" onClick={() => handleActionUpdate(action.id, "approve")}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleActionUpdate(action.id, "dismiss")}
                  >
                    Dismiss
                  </Button>
                </div>
              ) : action.status === "applying" ? (
                <div className="mt-4">
                  <p className="text-sm text-primary">Applying optimization...</p>
                </div>
              ) : action.status === "applied" ? (
                <div className="mt-4">
                  <p className="text-sm text-emerald-300">Optimization applied</p>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="text-sm text-muted-foreground">
              Sync the campaign after launch to generate the first round of operator suggestions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function LaunchAuditPanel({
  focusMode,
  launchAudit,
  campaign,
}: {
  focusMode: boolean;
  launchAudit: CampaignLaunchRecord | null;
  campaign: ExecutableCampaign;
}) {
  if (focusMode || !launchAudit) {
    return null;
  }

  return (
    <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Launch audit
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
            {launchAudit.campaignName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{launchAudit.launchMode === "live" ? "Live mode" : "Test mode"}</Badge>
          <Badge>{launchAudit.resultStatus.replaceAll("_", " ")}</Badge>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch timestamp</p>
          <p className="mt-2 text-sm font-medium">{new Date(launchAudit.createdAt).toLocaleString()}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account name</p>
          <p className="mt-2 text-sm font-medium">{launchAudit.accountName ?? "Meta Ads"}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Campaign ID</p>
          <p className="mt-2 text-sm font-medium">{launchAudit.metaCampaignId ?? "None"}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch result</p>
          <p className="mt-2 text-sm font-medium capitalize">{launchAudit.resultStatus.replaceAll("_", " ")}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Meta object IDs</p>
          <div className="mt-3 space-y-2 text-sm leading-7 text-muted-foreground">
            <p>Ad sets: {launchAudit.metaAdSetIds.length > 0 ? launchAudit.metaAdSetIds.join(", ") : "None"}</p>
            <p>Ads: {launchAudit.metaAdIds.length > 0 ? launchAudit.metaAdIds.join(", ") : "None"}</p>
          </div>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current object status</p>
          <div className="mt-3 space-y-2 text-sm leading-7 text-muted-foreground">
            <p>Campaign: {campaign.status}</p>
            {campaign.adSets.map((adSet) => (
              <p key={adSet.id}>
                {adSet.name}: {adSet.status}
              </p>
            ))}
            {campaign.adSets.flatMap((adSet) => adSet.ads).map((ad) => (
              <p key={ad.id}>
                {ad.name}: {ad.status}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[20px] border border-white/8 bg-black/20 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Action history</p>
        <div className="mt-4 space-y-3">
          {launchAudit.eventTimeline.map((event) => (
            <div key={event.id} className="flex items-start justify-between gap-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
              <div>
                <p className="text-sm font-medium">{event.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{event.target}</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{event.detail}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{event.status}</p>
                <p className="mt-2 text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LaunchProgressTimeline({
  runtime,
  stepIndex,
  metaAccountName,
}: {
  runtime: CampaignRuntime;
  stepIndex: number;
  metaAccountName?: string | null;
}) {
  const launchSteps = [
    "Connected to Meta Ads account",
    "Campaign ID generated",
    "Ad set created",
    "Creatives uploaded",
    "Launching ads...",
  ] as const;

  return (
    <div className="mt-6 grid gap-3">
      {launchSteps.map((step, index) => {
        const complete =
          runtime.status !== "draft" &&
          runtime.status !== "built" &&
          runtime.status !== "preview" &&
          runtime.status !== "launch_ready" &&
          (runtime.status !== "launching" || index < stepIndex);
        const current = runtime.status === "launching" && index === stepIndex;
        const stepDetail =
          step === "Connected to Meta Ads account"
            ? metaAccountName ?? "Meta Ads account connected"
            : step === "Campaign ID generated"
              ? runtime.campaignId ?? "Campaign ID will be assigned"
              : step === "Ad set created"
                ? runtime.adSetId ?? "Ad set will be assigned"
                : step === "Creatives uploaded"
                  ? runtime.adId ?? "Creative package will be assigned"
                  : "Ads placed into delivery";

        return (
          <div
            key={step}
            className="flex items-center justify-between rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4"
          >
            <div>
              <p className="text-sm">{step}</p>
              {complete || current ? (
                <p className="mt-1 text-xs text-muted-foreground">{stepDetail}</p>
              ) : null}
            </div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {complete ? "Complete" : current ? "Running" : "Queued"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DeploymentStatusPanel({
  runtime,
}: {
  runtime: CampaignRuntime;
}) {
  if (runtime.status !== "launching" && runtime.status !== "live") {
    return null;
  }

  return (
    <div className="mt-6 rounded-[24px] border border-emerald-400/15 bg-emerald-400/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
            Deployment status
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-emerald-50">
            {runtime.metaPushStatus === "published"
              ? "Live on Meta Ads"
              : runtime.status === "launching"
                ? "Campaign is deploying"
                : "Launch setup ready"}
          </p>
        </div>
        <Badge className="border-emerald-400/15 bg-emerald-400/10 text-emerald-200">
          {runtime.metaPushStatus === "published"
            ? "Published"
            : runtime.status === "launching"
              ? "Deploying"
              : "Ready for setup"}
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</p>
          <p className="mt-2 text-sm font-medium capitalize">{runtime.status}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Campaign ID</p>
          <p className="mt-2 text-sm font-medium">{runtime.campaignId ?? "Pending"}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Meta status</p>
          <p className="mt-2 text-sm font-medium capitalize">{runtime.metaPushStatus.replaceAll("_", " ")}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Budget</p>
          <p className="mt-2 text-sm font-medium">{runtime.budgetDaily ?? "Pending"}</p>
        </div>
      </div>
      {runtime.metaLastMessage ? (
        <p className="mt-4 text-sm leading-7 text-emerald-50/90">{runtime.metaLastMessage}</p>
      ) : null}
    </div>
  );
}

export function EstimatedPerformancePanel({
  estimatedPerformance,
}: {
  estimatedPerformance: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-3">
      {estimatedPerformance.map((item) => (
        <div key={item.label} className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
          <p className="mt-3 text-sm leading-7">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
