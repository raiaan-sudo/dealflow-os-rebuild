import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { CampaignLaunchSimulator } from "@/components/campaign/campaign-launch-simulator";
import { CampaignPublishPanel } from "@/components/campaign/campaign-publish-panel";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusPill, getStatusTone } from "@/components/ui/status-pill";
import { getCampaignIntentLabel } from "@/lib/campaign-intent";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { getIntegrationProviderState } from "@/lib/integrations/provider-registry";
import {
  getDefaultMetaConnectionState,
  getMetaConnectionState,
} from "@/lib/integrations/meta/service";
import { getBillingSummary } from "@/lib/services/billing-service";
import { getCampaignLaunchRecordForCampaign } from "@/lib/services/campaign-launch-audit-service";
import { buildExecutableCampaign } from "@/lib/services/campaign-execution-service";
import { getLaunchBlockingReasons, getLaunchRequirements } from "@/lib/services/launch-readiness";
import { getMetaCampaignSyncSnapshotForCampaign } from "@/lib/services/meta-campaign-sync-service";
import { getExpectedOutcomes } from "@/lib/services/campaign-plan-service";

function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs: number) {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export default async function LaunchAliasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedCampaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;
  const metaConnectedFlag = params.meta_connected === "1";
  const metaError =
    typeof params.meta_error === "string" && params.meta_error.length > 0
      ? params.meta_error
      : null;
  const [record, metaConnection, billingSummary, metaProviderState, metaTrackingState] = await Promise.all([
    withTimeout(
      resolveActiveCampaignRecord(requestedCampaignId)
        .then((resolved) => resolved?.record ?? null)
        .catch(() => null),
      null,
      4_000,
    ),
    withTimeout(
      getMetaConnectionState().catch(() => getDefaultMetaConnectionState()),
      getDefaultMetaConnectionState(),
      2_500,
    ),
    withTimeout(
      getBillingSummary().catch(() => ({
        planTier: "starter" as const,
        subscriptionStatus: "inactive",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      })),
      {
        planTier: "starter" as const,
        subscriptionStatus: "inactive",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      2_500,
    ),
    withTimeout(
      getIntegrationProviderState("meta_marketing_api").catch(() => null),
      null,
      2_000,
    ),
    withTimeout(
      getIntegrationProviderState("meta_tracking").catch(() => null),
      null,
      2_000,
    ),
  ]);
  const plan = record ? canonicalCampaignToPlan(record) : null;

  if (!plan) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Launch"
          title="Campaign plan not found"
          description="Build a campaign before moving into launch."
        />
        <EmptyState
          title="No campaign is ready to launch"
          description="Complete onboarding first, then return here to connect and launch."
        />
        <div>
          <Button asChild>
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const savedRecord = record;
  const metaCampaignId = plan.runtime.campaignId ?? null;
  const [launchRecord, syncSnapshot] = await Promise.all([
    withTimeout(
      getCampaignLaunchRecordForCampaign({
        campaignName: plan.businessName,
        metaCampaignId,
      }).catch(() => null),
      null,
      1_500,
    ),
    withTimeout(
      getMetaCampaignSyncSnapshotForCampaign({
        campaignName: plan.businessName,
        metaCampaignId,
      }).catch(() => null),
      null,
      1_500,
    ),
  ]);

  if (!savedRecord) {
    return null;
  }

  const intentLabel = getCampaignIntentLabel(plan.intent, { capitalized: true });
  const metaConnected =
    metaConnection.connectionStatus === "connected" &&
    Boolean(metaConnection.accountId);
  const launchRequirements = getLaunchRequirements({
    campaignSaved: Boolean(record?.campaign.id),
    metaConnected,
    metaTrackingState,
  });
  const blockingReasons = getLaunchBlockingReasons(launchRequirements);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Go Live"
        title="Ready to launch this campaign?"
        description="Review the campaign, confirm account, domain, and tracking readiness, then move into launch."
      />
      <div className="rounded-[22px] border border-primary/15 bg-primary/[0.05] px-5 py-4 text-sm font-medium text-primary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            {blockingReasons.length === 0
              ? "Launch setup is clear to open. Review the campaign one last time, then move into go-live."
              : `Launch stays blocked until you finish: ${blockingReasons.join(" • ")}.`}
          </span>
          <StatusPill tone={launchRequirements.metaConnected && plan.runtime.launchMode === "live" ? "success" : "warning"}>
            {launchRequirements.metaConnected
              ? plan.runtime.launchMode === "live"
                ? "Live environment"
                : "Test environment"
              : "Meta blocked"}
          </StatusPill>
        </div>
      </div>
      {metaConnectedFlag ? (
        <div className="rounded-[22px] border border-emerald-400/15 bg-emerald-400/10 px-5 py-4 text-sm font-medium text-emerald-100">
          Meta ad account connected. Finish the remaining tracking and domain requirements here before launch.
        </div>
      ) : null}
      {metaError ? (
        <div className="rounded-[22px] border border-rose-400/15 bg-rose-400/10 px-5 py-4 text-sm font-medium text-rose-100">
          Meta connection failed: {metaError}
        </div>
      ) : null}
      <Card className="p-5 sm:p-7">
        <div className="space-y-3">
          {[
            {
              label: "Step 1",
              title: "Review the campaign",
              detail: "Check the saved funnel, creatives, and offer before launch.",
              status: null,
            },
            {
              label: "Step 2",
              title: "Connect the ad account",
              detail: metaProviderState?.status.message ?? "Connect the ad account that this campaign will launch from.",
              status: (
                <StatusPill tone={getStatusTone(metaProviderState?.status.status ?? "disconnected")}>
                  {(metaProviderState?.status.status ?? "disconnected").replaceAll("_", " ")}
                </StatusPill>
              ),
            },
            {
              label: "Step 3",
              title: "Verify domain and tracking",
              detail: metaTrackingState?.status.message ?? "Confirm the launch domain and pixel before live delivery.",
              status: (
                <StatusPill tone={getStatusTone(metaTrackingState?.status.status ?? "disconnected")}>
                  {(metaTrackingState?.status.status ?? "disconnected").replaceAll("_", " ")}
                </StatusPill>
              ),
            },
            {
              label: "Step 4",
              title: "Launch campaign",
              detail: "Only proceed once the saved campaign, ad account, pixel, and domain are all ready.",
              status: null,
            },
          ].map((step) => (
            <div key={step.label} className="flex flex-wrap items-start justify-between gap-3 rounded-[20px] border border-white/8 bg-white/[0.03] p-4 lg:flex-nowrap">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{step.label}</p>
                <p className="mt-3 text-sm font-semibold">{step.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.detail}</p>
              </div>
              {step.status}
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5 sm:p-7">
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Campaign</p>
            <p className="mt-3 text-sm font-semibold">{plan.market} {intentLabel} Campaign</p>
          </div>
          <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Offer</p>
            <p className="mt-3 text-sm font-semibold">{plan.keyOffer}</p>
          </div>
          <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Expected lead flow</p>
            <p className="mt-3 text-sm font-semibold">{getExpectedOutcomes(plan).leadsPerMonth}</p>
          </div>
        </div>
      </Card>
      <CampaignLaunchSimulator
        metaConnection={metaConnection}
        initialLaunchRecord={launchRecord}
        initialSyncSnapshot={syncSnapshot}
        initialActionSuggestions={[]}
        initialCreativeSummary={null}
        initialDraftActions={[]}
        planTier={billingSummary.planTier}
        operatorMode="live"
        initialRuntime={plan.runtime}
        campaign={buildExecutableCampaign(plan)}
        expectedOutcomes={getExpectedOutcomes(plan)}
        focusMode
        launchRequirements={launchRequirements}
      />
      <CampaignPublishPanel
        campaignId={savedRecord.campaign.id}
        initialPublish={savedRecord.publish}
        campaignName={savedRecord.campaign.name}
        compact
      />
      <Card className="p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Creative review</p>
            <p className="mt-2 text-lg font-semibold">Open campaign review</p>
            <p className="mt-2 max-w-[720px] text-sm leading-7 text-muted-foreground">
              Review the saved funnel, ads, and media before returning here to launch.
            </p>
          </div>
          <Button asChild variant="secondary" className="w-full lg:w-auto">
            <Link href={savedRecord?.campaign.id ? `/review?campaignId=${savedRecord.campaign.id}` : "/review"}>
              Open Review
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
