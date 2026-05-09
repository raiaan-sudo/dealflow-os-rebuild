import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, ExternalLink, ReceiptText, RotateCw, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { LaunchSuccessRecheckButton } from "@/components/campaign/launch/launch-success-recheck-button";
import { LaunchReceiptCopyButton } from "@/components/campaign/launch/launch-receipt-copy-button";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getMetaConnectionState, getDefaultMetaConnectionState } from "@/lib/integrations/meta/service";
import { getMetaCampaignSyncSnapshotForCampaign } from "@/lib/services/meta-campaign-sync-service";
import { getCampaignLaunchRecordForCampaign } from "@/lib/services/campaign-launch-audit-service";

function buildMetaCampaignLink(metaCampaignId: string | null, adAccountId: string | null) {
  if (!metaCampaignId) {
    return null;
  }

  const params = new URLSearchParams();

  if (adAccountId) {
    params.set("act", adAccountId.replace(/^act_/, ""));
  }

  params.set("selected_campaign_ids", metaCampaignId);

  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?${params.toString()}`;
}

function currency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

const META_CONFIRMATION_FRESHNESS_MS = 30 * 60 * 1000;

function getLastConfirmedAt(syncSnapshot: Awaited<ReturnType<typeof getMetaCampaignSyncSnapshotForCampaign>> | null) {
  const candidate =
    typeof syncSnapshot?.syncedAt === "string"
      ? syncSnapshot.syncedAt
      : typeof syncSnapshot?.lastSyncedAt === "string"
        ? syncSnapshot.lastSyncedAt
        : null;

  return candidate;
}

function isFreshMetaConfirmation(lastConfirmedAt: string | null) {
  if (!lastConfirmedAt) {
    return false;
  }

  const timestamp = new Date(lastConfirmedAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= META_CONFIRMATION_FRESHNESS_MS;
}

function formatRelativeSyncAge(value: string | null) {
  if (!value) {
    return "No Meta sync yet";
  }

  const diffSeconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));

  if (diffSeconds <= 1) {
    return "Last Meta sync: just now";
  }

  if (diffSeconds < 60) {
    return `Last Meta sync: ${diffSeconds} seconds ago`;
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  return `Last Meta sync: ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Pending";
  }

  return new Date(value).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function maskId(value: string | null) {
  if (!value) {
    return "Pending";
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function getConfirmationState(params: {
  confirmedInMeta: boolean;
  hasFreshMetaConfirmation: boolean;
  hasMetaCampaignId: boolean;
  syncErrors: unknown[];
}) {
  if (params.confirmedInMeta) {
    return {
      label: "Confirmed in Meta",
      tone: "success" as const,
      icon: CheckCircle2,
      detail: "DealFlow has a fresh Meta confirmation for the campaign, ad set, and ad.",
    };
  }

  if (params.hasMetaCampaignId && params.hasFreshMetaConfirmation && params.syncErrors.length === 0) {
    return {
      label: "Waiting for Meta confirmation",
      tone: "warning" as const,
      icon: Clock3,
      detail: "Meta accepted the campaign ID. Ad set, ad, or delivery status may still be catching up.",
    };
  }

  return {
    label: "Needs recheck",
    tone: "warning" as const,
    icon: RotateCw,
    detail: "Run a fresh Meta status check before treating delivery status as final.",
  };
}

export default async function LaunchSuccessPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;
  const paramMetaCampaignId =
    typeof params.metaCampaignId === "string" && params.metaCampaignId.length > 0
      ? params.metaCampaignId
      : null;
  const activeCampaign = await resolveActiveCampaignRecord(campaignId).catch(() => null);
  const plan = activeCampaign?.record ? canonicalCampaignToPlan(activeCampaign.record) : null;
  const metaConnection = await getMetaConnectionState().catch(() => getDefaultMetaConnectionState());
  const persistedCampaignId = plan?.runtime.campaignId ?? null;
  const persistedAdSetId = plan?.runtime.adSetId ?? plan?.runtime.metaAdSetIds?.[0] ?? null;
  const persistedAdId = plan?.runtime.adId ?? plan?.runtime.metaAdIds?.[0] ?? null;
  const resolvedSavedCampaignId = activeCampaign?.campaignId ?? campaignId ?? null;
  const resolvedMetaCampaignId = persistedCampaignId ?? paramMetaCampaignId;
  const resolvedMetaAdSetId = persistedAdSetId;
  const resolvedMetaAdId = persistedAdId;
  const resolvedCampaignName = plan?.businessName ?? plan?.clientName ?? "Campaign";
  const launchRecord =
    plan || resolvedMetaCampaignId
      ? await getCampaignLaunchRecordForCampaign({
          campaignName: resolvedCampaignName,
          metaCampaignId: resolvedMetaCampaignId,
        }).catch(() => null)
      : null;
  const syncSnapshot =
    plan && resolvedMetaCampaignId
      ? await getMetaCampaignSyncSnapshotForCampaign({
          campaignName: resolvedCampaignName,
          metaCampaignId: resolvedMetaCampaignId,
        }).catch(() => null)
      : null;
  const syncedAdSetStatuses = Array.isArray(syncSnapshot?.adSetStatuses)
    ? syncSnapshot.adSetStatuses
    : [];
  const syncedAdStatuses = Array.isArray(syncSnapshot?.adStatuses)
    ? syncSnapshot.adStatuses
    : [];
  const syncErrors = Array.isArray(syncSnapshot?.syncErrors) ? syncSnapshot.syncErrors : [];
  const firstAdSetStatus =
    syncedAdSetStatuses[0] && typeof syncedAdSetStatuses[0] === "object" && "status" in syncedAdSetStatuses[0]
      ? String(syncedAdSetStatuses[0].status ?? "")
      : null;
  const firstAdStatus =
    syncedAdStatuses[0] && typeof syncedAdStatuses[0] === "object" && "status" in syncedAdStatuses[0]
      ? String(syncedAdStatuses[0].status ?? "")
      : null;
  const resolvedBudget =
    plan?.runtime.budgetDailyInput && plan.runtime.budgetDailyInput > 0
      ? `${currency(plan.runtime.budgetDailyInput)}/day`
      : plan?.monthlyBudget && plan.monthlyBudget > 0
        ? `${currency(plan.monthlyBudget)}/month`
        : "Budget not recorded";
  const resolvedStatus =
    syncSnapshot?.campaignStatus ??
    launchRecord?.resultStatus ??
    (plan?.runtime.metaPushStatus === "published" || plan?.runtime.status === "live"
      ? "Sent to Meta"
      : plan?.runtime.status === "launching"
        ? "Launching"
        : resolvedMetaCampaignId
          ? "Sent to Meta"
          : "Pending");
  const lastConfirmedAt = getLastConfirmedAt(syncSnapshot);
  const hasFreshMetaConfirmation = isFreshMetaConfirmation(lastConfirmedAt);
  const lastMetaSyncText = formatRelativeSyncAge(lastConfirmedAt);
  const confirmedInMeta =
    Boolean(resolvedMetaCampaignId) &&
    syncSnapshot?.syncResult === "success" &&
    Boolean(syncSnapshot.campaignStatus) &&
    syncedAdSetStatuses.length > 0 &&
    syncedAdStatuses.length > 0 &&
    hasFreshMetaConfirmation;
  const confirmation = getConfirmationState({
    confirmedInMeta,
    hasFreshMetaConfirmation,
    hasMetaCampaignId: Boolean(resolvedMetaCampaignId),
    syncErrors,
  });
  const ConfirmationIcon = confirmation.icon;
  const metaLink = buildMetaCampaignLink(resolvedMetaCampaignId, metaConnection.accountId);
  const dashboardHref = resolvedSavedCampaignId
    ? `/dashboard?campaignId=${encodeURIComponent(resolvedSavedCampaignId)}`
    : "/dashboard";
  const launchSettingsHref = resolvedSavedCampaignId
    ? `/launch?campaignId=${encodeURIComponent(resolvedSavedCampaignId)}`
    : "/launch";
  const reviewHref = resolvedSavedCampaignId
    ? `/preview?campaignId=${encodeURIComponent(resolvedSavedCampaignId)}`
    : "/preview";
  const launchTime =
    launchRecord?.createdAt ??
    plan?.runtime.launchedAt ??
    plan?.runtime.statusUpdatedAt ??
    lastConfirmedAt;
  const receiptItems: Array<{ label: string; value: string }> = [
    { label: "Campaign name", value: resolvedCampaignName },
    { label: "Ad account", value: String(metaConnection.accountName ?? metaConnection.accountId ?? launchRecord?.accountName ?? "No ad account selected") },
    { label: "Budget", value: resolvedBudget },
    { label: "Status", value: String(resolvedStatus) },
    { label: "Launch time", value: formatDateTime(launchTime ?? null) },
  ];
  const verificationItems = [
    { label: "Meta campaign", value: resolvedMetaCampaignId ? maskId(resolvedMetaCampaignId) : "Pending" },
    { label: "Ad set status", value: String(firstAdSetStatus || (resolvedMetaAdSetId ? "Sent to Meta" : "Pending")) },
    { label: "Ad status", value: String(firstAdStatus || (resolvedMetaAdId ? "Sent to Meta" : "Pending")) },
  ];

  return (
    <div className="mx-auto w-full max-w-[1180px] px-3 py-4 sm:px-6">
      <Card className="rounded-[32px] border-emerald-300/20 bg-[radial-gradient(circle_at_50%_0%,rgba(52,211,153,0.18),transparent_32%),linear-gradient(140deg,rgba(6,12,24,0.98),rgba(8,13,29,0.94))] p-5 shadow-[0_44px_140px_-86px_rgba(52,211,153,0.78)] sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="success">Campaign launched</StatusPill>
              <StatusPill tone={confirmation.tone}>{confirmation.label}</StatusPill>
              <StatusPill tone="info">Paused delivery control</StatusPill>
            </div>
            <div className="mt-6 flex items-start gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/10 text-emerald-100">
                <CheckCircle2 className="size-7" />
              </span>
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-5xl">
                  Campaign launched
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Your campaign is now in Meta. Delivery will begin once Meta completes review and the paused campaign is activated.
                </p>
              </div>
            </div>

            <div className="mt-7 rounded-[26px] border border-white/10 bg-white/[0.045] p-5">
              <div className="flex items-start gap-3">
                <span className="rounded-full border border-white/10 bg-black/20 p-2 text-emerald-100">
                  <ConfirmationIcon className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Confirmation status
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-foreground">{confirmation.label}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{confirmation.detail}</p>
                  {!confirmedInMeta ? (
                    <p className="mt-3 text-sm leading-6 text-amber-100">
                      {lastMetaSyncText}. Meta can take a short window to return all object statuses after a paused campaign is created.
                    </p>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-emerald-100">{lastMetaSyncText}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg">
                <Link href={dashboardHref}>
                  View dashboard
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              {metaLink ? (
                <Button asChild size="lg" variant="secondary">
                  <Link href={metaLink} target="_blank" rel="noreferrer">
                    View in Meta
                    <ExternalLink className="size-4" />
                  </Link>
                </Button>
              ) : null}
              <LaunchSuccessRecheckButton campaignId={resolvedSavedCampaignId} />
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild variant="secondary">
                <Link href={reviewHref}>Review campaign</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={launchSettingsHref}>Go to launch settings</Link>
              </Button>
            </div>
          </div>

          <div className="min-w-0 rounded-[28px] border border-white/10 bg-black/20 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Launch receipt</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  {resolvedCampaignName}
                </h2>
              </div>
              <ReceiptText className="size-6 shrink-0 text-cyan-100" />
            </div>

            <div className="mt-5 grid gap-3">
              {receiptItems.map((item) => (
                <div key={item.label} className="rounded-[18px] border border-white/8 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                  <p className="mt-2 break-words text-sm font-medium leading-6 text-foreground">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.06] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/70">Meta campaign ID</p>
                  <p className="mt-2 break-all text-sm font-semibold text-foreground">{maskId(resolvedMetaCampaignId)}</p>
                </div>
                <LaunchReceiptCopyButton value={resolvedMetaCampaignId} label="Copy ID" />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {verificationItems.map((item) => (
                <div key={item.label} className="rounded-[18px] border border-white/8 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                  <p className="mt-2 break-words text-sm font-medium leading-6 text-foreground">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-[20px] border border-emerald-300/16 bg-emerald-300/[0.06] p-4 text-sm leading-6 text-emerald-50/90">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                <p>
                  DealFlow keeps the campaign paused after creation. Activation stays controlled from Meta and your launch settings.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
