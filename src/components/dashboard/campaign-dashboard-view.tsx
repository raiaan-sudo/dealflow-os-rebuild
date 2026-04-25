// @ts-nocheck
"use client";

import {
  getCampaignIntentLabel,
  isInvestorCampaignIntent,
  isSellerCampaignIntent,
} from "@/lib/campaign-intent";
import { AutonomyActionsFeed } from "@/components/dashboard/autonomy-actions-feed";
import { AutonomyModeControl } from "@/components/dashboard/autonomy-mode-control";
import { Card } from "@/components/ui/card";
import type { MetaConnectionState } from "@/lib/integrations/meta/types";
import type { Database } from "@/lib/supabase/types";
import type {
  CampaignPlan,
  ExpectedOutcomes,
} from "@/lib/services/campaign-plan-service";
import type { CampaignAnalysisResult } from "@/lib/services/ai-optimizer";
import type { CreativePerformanceSummary } from "@/lib/services/creative-performance-service";
import type { MetaCampaignSyncSnapshot } from "@/lib/integrations/meta/types";
import type { CampaignLaunchRecord } from "@/lib/services/campaign-launch-audit-service";
import type { AutonomySnapshot } from "@/lib/services/autonomy-engine";
import type { DashboardMetrics } from "@/lib/services/dashboard-service";

type AppointmentSummary = Pick<
  Database["public"]["Tables"]["appointments"]["Row"],
  "status" | "scheduled_at"
>;

type RecentLead = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  "id" | "first_name" | "last_name" | "status" | "source" | "estimated_value" | "created_at"
>;

type RecentAppointment = Pick<
  Database["public"]["Tables"]["appointments"]["Row"],
  "id" | "scheduled_at" | "status" | "appointment_type" | "created_at"
>;

type RecentDeal = Pick<
  Database["public"]["Tables"]["deals"]["Row"],
  "id" | "title" | "status" | "stage" | "estimated_value" | "closed_value" | "created_at"
>;

type Props = {
  plan: CampaignPlan;
  metaConnection: MetaConnectionState;
  syncSnapshot?: MetaCampaignSyncSnapshot | null;
  expectedOutcomes: ExpectedOutcomes;
  nextActions: string[];
  optimizerResult: CampaignAnalysisResult;
  workspaceMetrics: DashboardMetrics;
  bookingSummary?: AppointmentSummary | null;
  recentLeads?: RecentLead[];
  recentAppointments?: RecentAppointment[];
  recentDeals?: RecentDeal[];
  creativePerformanceSummary?: CreativePerformanceSummary | null;
  launchRecord?: CampaignLaunchRecord | null;
  autonomySnapshot?: AutonomySnapshot | null;
};

function currency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

type LaunchState = "draft" | "ready" | "live" | "paused";
type DataSourceState = "disconnected" | "collecting" | "active";

function getLaunchState(plan: CampaignPlan): LaunchState {
  if (plan.runtime.safetyState === "paused") {
    return "paused";
  }

  if (plan.runtime.metaPushStatus === "published" || plan.runtime.status === "live") {
    return "live";
  }

  if (plan.runtime.status === "launch_ready" || plan.runtime.status === "connected") {
    return "ready";
  }

  return "draft";
}

function getDataSourceState(params: {
  metaConnection: MetaConnectionState;
  syncSnapshot?: MetaCampaignSyncSnapshot | null;
  creativePerformanceSummary?: CreativePerformanceSummary | null;
}): DataSourceState {
  if (params.metaConnection.connectionStatus !== "connected") {
    return "disconnected";
  }

  const metrics = params.syncSnapshot?.deliveryMetrics;
  const hasLiveVolume = Boolean(
    metrics &&
    (
      Number(metrics.impressions ?? 0) > 0 ||
      Number(metrics.clicks ?? 0) > 0 ||
      Number(metrics.leads ?? 0) > 0 ||
      Number(metrics.spend ?? 0) > 0
    ),
  );
  const hasRankedPerformance = Boolean(params.creativePerformanceSummary?.rankedCreatives?.length);

  if (!hasLiveVolume && !hasRankedPerformance) {
    return "collecting";
  }

  if (Number(metrics?.leads ?? 0) > 0 || hasRankedPerformance) {
    return "active";
  }

  return "collecting";
}

export function CampaignDashboardView({
  plan,
  metaConnection,
  syncSnapshot = null,
  expectedOutcomes,
  nextActions,
  optimizerResult,
  workspaceMetrics,
  bookingSummary = null,
  recentLeads = [],
  recentAppointments = [],
  recentDeals = [],
  creativePerformanceSummary = null,
  launchRecord = null,
  autonomySnapshot = null,
}: Props) {
  const launchState = getLaunchState(plan);
  const dataSourceState = getDataSourceState({
    metaConnection,
    syncSnapshot,
    creativePerformanceSummary,
  });
  const hasLivePerformance = launchState === "live" && dataSourceState === "active";
  const liveMetrics = syncSnapshot?.deliveryMetrics;
  const displayedLeads = hasLivePerformance
    ? Number(liveMetrics?.leads ?? 0)
    : Number(workspaceMetrics.totalLeads ?? 0);
  const displayedAppointments = Number(workspaceMetrics.appointmentsBooked ?? 0);
  const displayedSpend = hasLivePerformance
    ? Number(liveMetrics?.spend ?? 0)
    : Number(workspaceMetrics.totalSpend ?? 0);
  const displayedCpl =
    displayedLeads > 0 ? displayedSpend / Math.max(displayedLeads, 1) : 0;
  const displayedAppointmentRate = `${Math.round(
    Number(workspaceMetrics.leadToAppointmentRate ?? 0) * 100,
  )}%`;
  const rankedTopCreative = creativePerformanceSummary?.rankedCreatives?.[0] ?? null;
  const strategySummary = optimizerResult.strategySummary ?? [];
  const testingRecommendations = optimizerResult.testingRecommendations ?? [];
  const regenerationSuggestions = optimizerResult.regenerationSuggestions ?? [];
  const topPerformer =
    (rankedTopCreative
      ? plan.ads.find((ad) => {
          const headlineMatches =
            normalizeText(ad.headline) === normalizeText(rankedTopCreative.headline);
          const overlayMatches =
            normalizeText(ad.overlayText) === normalizeText(rankedTopCreative.hook);
          const bodyMatches =
            normalizeText(ad.body) === normalizeText(rankedTopCreative.headline);

          return headlineMatches || overlayMatches || bodyMatches;
        })
      : null) ??
    null;
  const statusText =
    dataSourceState === "disconnected"
      ? "Disconnected"
      : launchState !== "live" || dataSourceState === "collecting"
        ? "Collecting"
        : "Active";
  const smsPrompt = dataSourceState === "active"
    ? isSellerCampaignIntent(plan.intent)
      ? "Saved seller follow-up logic is available for connected lead handling."
      : isInvestorCampaignIntent(plan.intent)
        ? "Saved investor follow-up logic is available for connected lead handling."
        : "Saved buyer follow-up logic is available for connected lead handling."
    : "No live follow-up activity is being reported yet.";
  const bookingText = bookingSummary?.scheduled_at
    ? `Next booking: ${new Date(bookingSummary.scheduled_at).toLocaleString("en-CA", {
        dateStyle: "medium",
        timeStyle: "short",
      })}`
    : "No booking record yet.";
  const runtimeMetaCampaignId = plan.runtime.campaignId ?? null;
  const runtimeMetaAdSetIds = Array.isArray(plan.runtime.metaAdSetIds) ? plan.runtime.metaAdSetIds : [];
  const runtimeMetaAdIds = Array.isArray(plan.runtime.metaAdIds) ? plan.runtime.metaAdIds : [];
  const resolvedMetaCampaignId =
    syncSnapshot?.metaCampaignId ?? launchRecord?.metaCampaignId ?? runtimeMetaCampaignId;
  const resolvedAdSetCount =
    syncSnapshot?.metaAdSetIds.length ??
    launchRecord?.metaAdSetIds.length ??
    runtimeMetaAdSetIds.length;
  const resolvedAdCount =
    syncSnapshot?.metaAdIds.length ??
    launchRecord?.metaAdIds.length ??
    runtimeMetaAdIds.length;
  const lineageItems = [
    { label: "Saved campaign", value: plan.id || "Unavailable" },
    { label: "Launch status", value: launchRecord?.resultStatus || plan.runtime.metaPushStatus || "Not launched" },
    { label: "Meta campaign", value: resolvedMetaCampaignId || "Not assigned" },
    { label: "Meta ad sets", value: String(resolvedAdSetCount) },
    { label: "Meta ads", value: String(resolvedAdCount) },
    {
      label: "Last live sync",
      value: syncSnapshot?.syncedAt
        ? new Date(syncSnapshot.syncedAt).toLocaleString("en-CA", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "No live sync yet",
    },
  ];
  const campaignSummaryItems = [
    { label: "Campaign", value: plan.businessName || "Untitled campaign" },
    { label: "Intent", value: getCampaignIntentLabel(plan.intent) },
    { label: "Market", value: plan.market || "Not set" },
    { label: "Audience", value: plan.audience || "Not set" },
    { label: "Stage", value: plan.runtime.status || "draft" },
    { label: "Meta connection", value: metaConnection.accountName || "Not connected" },
  ];
  const metaStatusText = metaConnection.hasAccessToken ? "Connected" : "Disconnected";
  const metaAccountText =
    metaConnection.accountName ||
    metaConnection.availableAccounts[0]?.name ||
    "No ad account linked";
  const metaPixelText = metaConnection.tracking.pixelId || "No pixel linked";

  const metrics = [
    { label: "Total leads", value: String(displayedLeads) },
    { label: "Total appointments", value: String(displayedAppointments) },
    { label: "Spend", value: currency(displayedSpend) },
    { label: "Cost per lead", value: currency(displayedCpl) },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm font-medium text-muted-foreground">{statusText}</p>

      {!hasLivePerformance ? (
        <Card className="rounded-[24px] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Live reporting</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
            {dataSourceState === "disconnected" ? "Disconnected" : "Collecting"}
          </h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {dataSourceState === "disconnected"
              ? "Launch and connect Meta to start collecting results."
              : launchState !== "live"
                ? "Launch the campaign to begin collecting delivery data."
                : "Meta is connected and delivery is underway, but there is not enough live data yet to report performance."}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.9fr))]">
        <Card className="rounded-[24px] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Data source
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
            {dataSourceState === "disconnected"
              ? "Disconnected"
              : dataSourceState === "collecting"
                ? "Collecting"
                : "Active"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {dataSourceState === "disconnected"
              ? "Meta is not connected, so no live metrics can be reported."
              : dataSourceState === "collecting"
                ? "Delivery is running, but results are still below the threshold for trustworthy reporting."
                : "Live delivery data is available and results are grounded in synced metrics."}
          </p>
        </Card>
        <Card className="rounded-[24px] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Meta connection
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{metaStatusText}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {metaConnection.hasAccessToken
              ? "Workspace token is stored and available for Meta account operations."
              : "No Meta access token is stored for this workspace."}
          </p>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>Account: {metaConnection.hasAccessToken ? metaAccountText : "Not available"}</p>
            <p>Pixel: {metaConnection.hasAccessToken ? metaPixelText : "Not available"}</p>
          </div>
        </Card>
        {metrics.slice(0, 2).map((metric) => (
          <Card key={metric.label} className="rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {metric.label}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{metric.value}</p>
          </Card>
        ))}
      </div>

      <Card className="rounded-[24px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current campaign</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Saved campaign context</h3>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {campaignSummaryItems.map((item) => (
            <div key={item.label} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
              <p className="mt-3 break-words text-sm leading-6">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-[24px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Campaign lineage</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Actual launch and sync records</h3>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {lineageItems.map((item) => (
            <div key={item.label} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
              <p className="mt-3 break-words text-sm leading-6">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-[24px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Optimization guidance</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Strategy-aware next moves</h3>
          </div>
          <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {optimizerResult.status}
          </div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-4">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Strategy lock</p>
              <div className="mt-3 space-y-2">
                {strategySummary.map((item) => (
                  <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Why the system is saying this</p>
                <div className="mt-3 space-y-2">
                  {optimizerResult.reasons.length > 0 ? optimizerResult.reasons.map((reason) => (
                    <p key={reason} className="text-sm leading-7 text-muted-foreground">{reason}</p>
                  )) : (
                    <p className="text-sm leading-7 text-muted-foreground">No critical warning is active. Keep monitoring live performance and protect the current mechanism.</p>
                  )}
                </div>
              </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recommended actions</p>
                <div className="mt-3 space-y-2">
                  {optimizerResult.actions.map((action) => (
                    <p key={action} className="text-sm leading-7 text-muted-foreground">{action}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Testing recommendations</p>
              <div className="mt-3 space-y-2">
                {testingRecommendations.map((item) => (
                  <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Regeneration guidance</p>
              <div className="mt-3 space-y-2">
                {regenerationSuggestions.map((item) => (
                  <p key={item} className="text-sm leading-7 text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Queued next steps</p>
              <div className="mt-3 space-y-2">
                {nextActions.map((action) => (
                  <p key={action} className="text-sm leading-7 text-muted-foreground">{action}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {metrics.slice(2).map((metric) => (
          <Card key={metric.label} className="rounded-[24px] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {metric.label}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{metric.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {metric.label === "Spend"
                ? hasLivePerformance
                  ? "Synced live campaign spend."
                  : "Workspace spend from campaign snapshots."
                : `Workspace lead-to-appointment rate: ${displayedAppointmentRate}.`}
            </p>
          </Card>
        ))}
      </div>

      {autonomySnapshot ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.3fr)]">
          <AutonomyModeControl
            mode={autonomySnapshot.mode}
            systemStatus={autonomySnapshot.systemStatus}
            alert={autonomySnapshot.alert}
            executionSyncedAt={autonomySnapshot.executionSyncedAt}
            queuedCount={autonomySnapshot.executionQueue.length}
            appliedCount={autonomySnapshot.appliedExecutionActions.length}
            blockedCount={autonomySnapshot.blockedExecutionActions.length}
          />
          <AutonomyActionsFeed
            mode={autonomySnapshot.mode}
            pendingActions={autonomySnapshot.pendingActions}
            recentActions={autonomySnapshot.recentActions}
            executionQueue={autonomySnapshot.executionQueue}
            appliedExecutionActions={autonomySnapshot.appliedExecutionActions}
            blockedExecutionActions={autonomySnapshot.blockedExecutionActions}
          />
        </div>
      ) : null}

      {hasLivePerformance && topPerformer ? (
        <Card className="rounded-[24px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current top performer</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{topPerformer.headline}</h3>
            </div>
            {dataSourceState === "active" && rankedTopCreative ? (
              <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                🔥 Best performer
              </div>
            ) : null}
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="overflow-hidden rounded-[20px] border border-white/8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={topPerformer.image}
                alt={topPerformer.headline}
                className="aspect-[16/11] h-full w-full object-cover"
              />
            </div>
            <div className="space-y-3 rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-sm font-semibold text-white/90">{topPerformer.overlayText}</p>
              <p className="text-sm leading-6 text-muted-foreground">{topPerformer.body}</p>
              {dataSourceState === "active" && rankedTopCreative ? (
                <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    Combined {rankedTopCreative.combinedScore.toFixed(1)}
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    CTR {rankedTopCreative.ctr.toFixed(2)}%
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    CPL {rankedTopCreative.cpl !== null ? currency(rankedTopCreative.cpl) : "—"}
                  </span>
                </div>
              ) : null}
              <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {topPerformer.cta}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="rounded-[24px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Follow-up</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Lead follow-up</h3>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">SMS</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{smsPrompt}</p>
          </div>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Booking</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{bookingText}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-[24px] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recent leads</p>
          <div className="mt-5 space-y-3">
            {recentLeads.length > 0 ? recentLeads.map((lead) => {
              const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || "Unnamed lead";
              return (
                <div key={lead.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold">{fullName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {lead.status || "new"}{lead.source ? ` • ${lead.source}` : ""}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {lead.estimated_value ? `Value ${currency(lead.estimated_value)}` : "No estimated value"} • {new Date(lead.created_at).toLocaleDateString("en-CA")}
                  </p>
                </div>
              );
            }) : (
              <p className="text-sm leading-7 text-muted-foreground">No leads have been captured for this workspace yet.</p>
            )}
          </div>
        </Card>

        <Card className="rounded-[24px] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recent appointments</p>
          <div className="mt-5 space-y-3">
            {recentAppointments.length > 0 ? recentAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold">{appointment.appointment_type || "Appointment"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{appointment.status || "scheduled"}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {appointment.scheduled_at
                    ? new Date(appointment.scheduled_at).toLocaleString("en-CA", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : new Date(appointment.created_at).toLocaleDateString("en-CA")}
                </p>
              </div>
            )) : (
              <p className="text-sm leading-7 text-muted-foreground">No appointments have been booked for this workspace yet.</p>
            )}
          </div>
        </Card>

        <Card className="rounded-[24px] p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recent deals</p>
          <div className="mt-5 space-y-3">
            {recentDeals.length > 0 ? recentDeals.map((deal) => (
              <div key={deal.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold">{deal.title || "Untitled deal"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {deal.status || "active"}{deal.stage ? ` • ${deal.stage}` : ""}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {deal.closed_value
                    ? `Closed ${currency(deal.closed_value)}`
                    : deal.estimated_value
                      ? `Pipeline ${currency(deal.estimated_value)}`
                      : "No value recorded"} • {new Date(deal.created_at).toLocaleDateString("en-CA")}
                </p>
              </div>
            )) : (
              <p className="text-sm leading-7 text-muted-foreground">No deals have been created for this workspace yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default CampaignDashboardView;
