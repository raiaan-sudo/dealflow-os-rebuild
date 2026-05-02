import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LaunchSuccessRecheckButton } from "@/components/campaign/launch/launch-success-recheck-button";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getMetaConnectionState, getDefaultMetaConnectionState } from "@/lib/integrations/meta/service";
import { getMetaCampaignSyncSnapshotForCampaign } from "@/lib/services/meta-campaign-sync-service";

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

type SummaryItem = {
  label: string;
  value: string;
};

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

function getMetaConfirmationLabel(params: { confirmedInMeta: boolean; hasFreshMetaConfirmation: boolean }) {
  if (params.confirmedInMeta) {
    return "Confirmed in Meta";
  }

  if (params.hasFreshMetaConfirmation) {
    return "Partially confirmed";
  }

  return "Estimated local state";
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
  const activeCampaign = await resolveActiveCampaignRecord(campaignId).catch(() => null);
  const plan = activeCampaign?.record ? canonicalCampaignToPlan(activeCampaign.record) : null;
  const metaConnection = await getMetaConnectionState().catch(() => getDefaultMetaConnectionState());
  const persistedCampaignId = plan?.runtime.campaignId ?? null;
  const persistedAdSetId = plan?.runtime.adSetId ?? plan?.runtime.metaAdSetIds?.[0] ?? null;
  const persistedAdId = plan?.runtime.adId ?? plan?.runtime.metaAdIds?.[0] ?? null;
  const resolvedSavedCampaignId = activeCampaign?.campaignId ?? campaignId ?? null;
  const resolvedMetaCampaignId = persistedCampaignId;
  const resolvedMetaAdSetId = persistedAdSetId;
  const resolvedMetaAdId = persistedAdId;
  const resolvedCampaignName = plan?.businessName ?? plan?.clientName ?? "Campaign";
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
    plan?.runtime.metaPushStatus === "published" || plan?.runtime.status === "live"
      ? "Live"
      : plan?.runtime.status === "launching"
        ? "Launching"
        : resolvedMetaCampaignId
          ? "Sent to Meta"
          : "Pending";
  const createdLocally =
    Boolean(resolvedSavedCampaignId) &&
    Boolean(resolvedMetaCampaignId) &&
    Boolean(resolvedMetaAdSetId) &&
    Boolean(resolvedMetaAdId);
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
  const partiallyConfirmed =
    Boolean(resolvedMetaCampaignId) &&
    !confirmedInMeta &&
    (syncSnapshot?.syncResult === "partial_success" ||
      syncErrors.length > 0 ||
      !hasFreshMetaConfirmation ||
      resolvedMetaAdSetId === null ||
      resolvedMetaAdId === null);
  const confirmationItems = [
    {
      label: "Created locally",
      value: createdLocally ? "Yes" : "Pending",
      tone: createdLocally ? "text-emerald-300" : "text-amber-300",
    },
    {
      label: "Confirmed in Meta",
      value: confirmedInMeta ? "Yes" : "Meta confirmation pending",
      tone: confirmedInMeta ? "text-emerald-300" : partiallyConfirmed ? "text-amber-300" : "text-muted-foreground",
    },
    {
      label: "Last confirmed in Meta",
      value: lastConfirmedAt
        ? new Date(lastConfirmedAt).toLocaleString("en-CA", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "No confirmation yet",
      tone: hasFreshMetaConfirmation ? "text-emerald-300" : "text-muted-foreground",
    },
  ];
  const metaConfirmationLabel = getMetaConfirmationLabel({
    confirmedInMeta,
    hasFreshMetaConfirmation,
  });
  const metaLink = buildMetaCampaignLink(resolvedMetaCampaignId, metaConnection.accountId);
  const summaryItems: SummaryItem[] = [
    { label: "Campaign name", value: resolvedCampaignName },
    { label: "Ad account", value: metaConnection.accountId ?? "No ad account selected" },
    { label: "Budget", value: resolvedBudget },
    { label: "Status", value: resolvedStatus },
  ];
  const idItems: SummaryItem[] = [
    { label: "Saved campaign ID", value: resolvedSavedCampaignId ?? "Pending" },
    { label: "Meta campaign ID", value: resolvedMetaCampaignId ?? "Pending" },
    { label: "Meta ad set ID", value: resolvedMetaAdSetId ?? "Pending" },
    { label: "Meta ad ID", value: resolvedMetaAdId ?? "Pending" },
  ];
  const verificationItems: SummaryItem[] = [
    {
      label: "Campaign status",
      value: String(syncSnapshot?.campaignStatus ?? plan?.runtime.metaPushStatus ?? "Pending"),
    },
    {
      label: "Ad set status",
      value: String(firstAdSetStatus || (resolvedMetaAdSetId ? "Saved locally" : "Pending")),
    },
    {
      label: "Ad status",
      value: String(firstAdStatus || (resolvedMetaAdId ? "Saved locally" : "Pending")),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-8">
      <PageHeader
        eyebrow="Launch"
        title="Campaign launched"
        description="The campaign has been sent to Meta. Review the launch summary below, then jump into Ads Manager or the dashboard."
      />

      <Card className="rounded-[24px] p-6 sm:p-8">
        <div className="space-y-6">
          <div className="rounded-[20px] border border-primary/20 bg-primary/10 p-5">
            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
              Launch complete
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{resolvedCampaignName}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              This page now reflects the saved launch record from the database. Review the confirmation state below before treating the campaign as fully live in Meta.
            </p>
            <div className="mt-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
              {metaConfirmationLabel}
            </div>
            {!confirmedInMeta ? (
              <div className="mt-4 space-y-3">
                <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Meta confirmation is stale or incomplete. Local launch records exist, but live Meta state should be treated as estimated until a fresh sync completes.
                </p>
                <p className="text-sm text-muted-foreground">{lastMetaSyncText}</p>
                <p className="text-sm text-amber-100">Use the refresh action below to request a fresh Meta confirmation.</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">{lastMetaSyncText}</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryItems.map((item) => (
              <div
                key={item.label}
                className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-3 text-sm font-medium leading-6">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {confirmationItems.map((item) => (
              <div
                key={item.label}
                className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {item.label}
                </p>
                <p className={`mt-3 text-sm font-medium leading-6 ${item.tone}`}>
                  {item.label === "Created locally" && createdLocally ? "✔ " : ""}
                  {item.label === "Confirmed in Meta" && confirmedInMeta ? "✔ " : ""}
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {idItems.map((item) => (
              <div
                key={item.label}
                className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-3 break-all text-sm leading-6">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {verificationItems.map((item) => (
              <div
                key={item.label}
                className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-3 text-sm leading-6">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <LaunchSuccessRecheckButton campaignId={resolvedSavedCampaignId} />
            {metaLink ? (
              <Button asChild>
                <Link href={metaLink} target="_blank" rel="noreferrer">
                  View in Meta
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link href={resolvedSavedCampaignId ? `/dashboard?campaignId=${encodeURIComponent(resolvedSavedCampaignId)}` : "/dashboard"}>
                Go to Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
