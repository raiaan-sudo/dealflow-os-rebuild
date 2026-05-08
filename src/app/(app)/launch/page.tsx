import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { LaunchMetaSelectionPanel } from "@/components/campaign/launch/launch-meta-selection-panel";
import { StaticCreativeSummaryCard } from "@/components/campaign/static-creative-preview-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { StatusPill, getStatusTone } from "@/components/ui/status-pill";
import { getCampaignIntentLabel } from "@/lib/campaign-intent";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { getIntegrationProviderState } from "@/lib/integrations/provider-registry";
import { getSelectedAdIdsFromPlan, readCampaignPlanDocument } from "@/lib/services/campaign-plan-document";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { getBillingSummary } from "@/lib/services/billing-service";
import { getMetaQueryUiCopy } from "@/lib/integrations/meta/error-mapper";
import {
  getDefaultMetaConnectionState,
  getMetaConnectionState,
  validateMetaLaunchSelections,
} from "@/lib/integrations/meta/service";
import { getLaunchBlockingReasons, getLaunchRequirements } from "@/lib/services/launch-readiness";
import { recordActivationEventForCurrentUser } from "@/lib/services/activation-telemetry-service";

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

function formatLastVerified(value: string | null | undefined) {
  if (!value) {
    return "not verified yet";
  }

  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60_000));

  if (diffMinutes <= 1) {
    return "just now";
  }

  return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
}

function formatVerifiedTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Not verified yet";
  }

  return new Date(value).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getBillingLaunchBlockCopy(billing: Awaited<ReturnType<typeof getBillingSummary>> | null) {
  if (!billing) {
    return "Activate billing before this workspace can launch to Meta.";
  }

  if (billing.billingState === "payment_issue") {
    return "Update the payment method in Stripe Portal before launching. Existing funnel operations stay in warning mode, but new Meta launches are blocked while Stripe reports a payment issue.";
  }

  if (billing.requiresSuspension) {
    return "Billing is inactive, so DealFlow-managed launch, funnel capture, alerts, and optimization are paused until the subscription is reactivated.";
  }

  if (billing.cancelAtPeriodEnd) {
    return "This subscription is scheduled to cancel. Launch remains available during the paid period, but reactivation is required after the period ends.";
  }

  return "Activate billing before this workspace can launch to Meta.";
}

const DEFAULT_META_DAILY_BUDGET_CAP_CENTS = 200;

function getUiMetaDailyBudgetCapCents() {
  const configuredCap = Number(process.env.META_DAILY_BUDGET_CAP_CENTS ?? DEFAULT_META_DAILY_BUDGET_CAP_CENTS);

  if (!Number.isFinite(configuredCap) || configuredCap <= 0) {
    return DEFAULT_META_DAILY_BUDGET_CAP_CENTS;
  }

  return Math.min(Math.floor(configuredCap), DEFAULT_META_DAILY_BUDGET_CAP_CENTS);
}

function formatBudgetCap(valueCents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueCents / 100);
}

async function loadPersistedSelectedAdIds(campaignId: string | null) {
  if (!campaignId) {
    return [];
  }

  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", campaignId)
    .maybeSingle();

  const row = (data as { plan?: unknown } | null) ?? null;
  return getSelectedAdIdsFromPlan(readCampaignPlanDocument(row?.plan));
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
  const metaWarning =
    typeof params.meta_warning === "string" && params.meta_warning.length > 0
      ? params.meta_warning
      : null;
  const metaRequestId =
    typeof params.meta_request_id === "string" && params.meta_request_id.length > 0
      ? params.meta_request_id
      : null;
  const [record, metaConnection, metaProviderState, metaTrackingState, metaPreflight, billing] = await Promise.all([
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
      getIntegrationProviderState("meta_marketing_api").catch(() => null),
      null,
      2_000,
    ),
    withTimeout(
      getIntegrationProviderState("meta_tracking").catch(() => null),
      null,
      2_000,
    ),
    withTimeout(
      validateMetaLaunchSelections().catch(() => null),
      null,
      5_000,
    ),
    withTimeout(
      getBillingSummary().catch(() => null),
      null,
      2_500,
    ),
  ]);
  const plan = record ? canonicalCampaignToPlan(record) : null;
  const resolvedCampaignId = record?.campaign.id ?? requestedCampaignId;
  const selectedAdIds = await loadPersistedSelectedAdIds(resolvedCampaignId);
  const metaErrorCopy = getMetaQueryUiCopy(metaError, "oauth_callback");
  const discoveryIncomplete =
    metaWarning === "asset_discovery_incomplete"
      ? "Meta connected, but some assets could not be verified yet. Reconnect Meta or refresh the launch page before selecting assets."
      : null;

  if (!plan) {
    return (
      <PageShell>
        <WizardSteps current="launch" />
        <PageHeader
          eyebrow="Launch"
          title="Campaign plan not found"
          description="Build a campaign before moving into launch."
        />
        <EmptyState
          title="No campaign is available for launch"
          description="Complete onboarding first, then return here to connect and launch."
        />
        <div>
          <Button asChild>
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const savedRecord = record;
  if (!savedRecord) {
    return null;
  }

  const intentLabel = getCampaignIntentLabel(plan.intent, { capitalized: true });
  const metaConnected =
    metaConnection.connectionStatus === "connected" &&
    Boolean(metaConnection.accountId);
  const metaPreflightReady = metaPreflight?.ready ?? false;
  const metaSelectionReady =
    metaConnected &&
    Boolean(metaConnection.accountId) &&
    Boolean(metaConnection.pageId) &&
    Boolean(metaConnection.tracking.pixelId);
  const metaLaunchReady = metaSelectionReady && metaPreflightReady;
  const billingLaunchAllowed = billing?.launchAllowed ?? false;
  const billingOverride = billing?.launchOverride ?? false;
  const billingBlockCopy = getBillingLaunchBlockCopy(billing);
  const providerLaunchEnabled = process.env.ALLOW_META_LIVE_LAUNCH === "true";
  const metaVerificationTimedOut =
    metaPreflight === null &&
    (metaProviderState?.status.status === "connected" || metaSelectionReady || metaConnected);
  const metaSelectionInvalid = metaSelectionReady && metaPreflight !== null && !metaPreflightReady;
  const launchRequirements = getLaunchRequirements({
    campaignSaved: Boolean(record?.campaign.id),
    metaConnected: metaLaunchReady,
    metaTrackingState,
  });
  const blockingReasons = [
    ...(!billingLaunchAllowed ? ["Activate billing before launch."] : []),
    ...getLaunchBlockingReasons(launchRequirements),
    ...(metaSelectionReady && !metaPreflightReady ? metaPreflight?.errors ?? ["Meta preflight failed."] : []),
    ...(!providerLaunchEnabled ? ["Provider launch switch is off."] : []),
  ];
  const selectedCreatives = plan.creatives.staticAds.filter((ad) => selectedAdIds.includes(ad.id));
  const publicFunnelPublished =
    savedRecord.publish.state === "published" &&
    Boolean(savedRecord.publish.slug) &&
    savedRecord.publish.hasPublishedSnapshot;
  if (!publicFunnelPublished) {
    blockingReasons.push("Publish the public funnel before launch.");
  }
  const dailyBudgetInput =
    plan.runtime.budgetDailyInput && plan.runtime.budgetDailyInput > 0
      ? plan.runtime.budgetDailyInput
      : Math.round(plan.monthlyBudget / 30);
  const dailyBudgetCents = Math.max(0, Math.round(dailyBudgetInput * 100));
  const budgetCapCents = getUiMetaDailyBudgetCapCents();
  const budgetCapApplied = budgetCapCents > 0;
  const effectiveDailyBudgetCents = budgetCapApplied
    ? Math.min(dailyBudgetCents, budgetCapCents)
    : dailyBudgetCents;
  const budgetWasCapped = budgetCapApplied && dailyBudgetCents > budgetCapCents;
  const launchRoomReady =
    billingLaunchAllowed &&
    metaLaunchReady &&
    selectedCreatives.length > 0 &&
    publicFunnelPublished &&
    budgetCapApplied &&
    providerLaunchEnabled;
  const readinessItems = [
    {
      label: "Billing",
      ready: billingLaunchAllowed,
      detail: billingLaunchAllowed ? "Launch access active" : billingBlockCopy,
    },
    {
      label: "Meta connection",
      ready: metaConnected,
      detail: metaConnected ? "Workspace connected" : "Connect Meta before launch",
    },
    {
      label: "Ad account / Page / pixel",
      ready: metaLaunchReady,
      detail: metaLaunchReady
        ? "Saved selections passed preflight"
        : "Select and save a valid ad account, Page, and pixel",
    },
    {
      label: "Creative selected",
      ready: selectedCreatives.length > 0,
      detail:
        selectedCreatives.length > 0
          ? `${selectedCreatives.length} selected creative${selectedCreatives.length === 1 ? "" : "s"} saved`
          : "Choose the creative test set first",
    },
    {
      label: "Funnel published",
      ready: publicFunnelPublished,
      detail: publicFunnelPublished
        ? `Published at /f/${savedRecord.publish.slug}`
        : "Publish the public funnel before sending traffic",
    },
    {
      label: "Budget cap",
      ready: budgetCapApplied,
      statusLabel: budgetWasCapped ? "Capped" : undefined,
      detail: budgetWasCapped
        ? `Requested daily budget is ${formatBudgetCap(dailyBudgetCents)}; the launch will use the provider cap of ${formatBudgetCap(effectiveDailyBudgetCents)}/day unless the owner raises the cap.`
        : `Provider launch is capped at ${formatBudgetCap(budgetCapCents)}/day; requested daily budget is ${formatBudgetCap(dailyBudgetCents)}.`,
    },
    {
      label: "Launch switch",
      ready: providerLaunchEnabled,
      detail: providerLaunchEnabled
        ? "Provider launch switch is on; Meta objects are still created PAUSED."
        : "Provider launch switch is off, so the route will not create Meta objects.",
    },
  ];
  const metaStatusText = metaLaunchReady
    ? `Connected (last verified ${formatLastVerified(metaPreflight?.checkedAt)})`
    : metaVerificationTimedOut
      ? "Meta unavailable, try again"
      : metaSelectionInvalid
        ? "Meta selection invalid"
        : metaConnected
          ? "Selection required before launch"
      : "Meta connection required";
  const metaVerifiedAtText = formatVerifiedTimestamp(metaPreflight?.checkedAt);

  if (launchRoomReady) {
    await recordActivationEventForCurrentUser({
      eventName: "launch_ready",
      campaignId: resolvedCampaignId,
      source: "launch_page",
      metadata: {
        route: "launch",
        selectedCreativeCount: selectedAdIds.length,
        billingLaunchAllowed,
        metaPreflightReady,
      },
      idempotencyKey: `launch_ready:${resolvedCampaignId ?? "unknown"}`,
    }).catch(() => undefined);
  }

  if (selectedCreatives.length === 0) {
    return (
      <PageShell>
        <WizardSteps current="launch" />
        <PageHeader
          eyebrow="Launch"
          title="Selected creative required"
          description="Choose an ad in creatives before launch can continue."
        />
        <EmptyState
          title="Choose the creative test set first"
          description="Your build workspace will send you to the next campaign step."
        />
        <div>
          <Button asChild>
            <Link
              href={
                savedRecord?.campaign.id
                  ? `/builder?campaignId=${encodeURIComponent(savedRecord.campaign.id)}`
                  : "/builder"
              }
            >
              Back to build
            </Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-[1640px]">
      <WizardSteps current="launch" />
      <PageHeader
        eyebrow="Launch"
        title="Final review before launch"
        description="Confirm the campaign, check the selected ad, and launch when everything looks right."
      />
      {metaConnectedFlag ? (
        <div className="rounded-[22px] border border-emerald-400/15 bg-emerald-400/10 px-5 py-4 text-sm font-medium text-emerald-100">
          Meta connection saved. Finish the required selections below to continue.
        </div>
      ) : null}
      {metaErrorCopy ? (
        <div className="rounded-[22px] border border-rose-400/15 bg-rose-400/10 px-5 py-4 text-sm font-medium text-rose-100">
          <p>{metaErrorCopy.title}</p>
          <p className="mt-2 font-normal">
            {metaErrorCopy.message} {metaErrorCopy.action}
          </p>
          {metaRequestId ? (
            <p className="mt-2 text-xs text-rose-200/80">Reference: {metaRequestId}</p>
          ) : null}
        </div>
      ) : null}
      {discoveryIncomplete ? (
        <div className="rounded-[22px] border border-amber-400/15 bg-amber-400/10 px-5 py-4 text-sm font-medium text-amber-100">
          {discoveryIncomplete}
        </div>
      ) : null}
      {!billingLaunchAllowed ? (
        <div className="rounded-[22px] border border-amber-400/15 bg-amber-400/10 px-5 py-4 text-sm font-medium text-amber-100">
          Your campaign is ready. {billingBlockCopy}
        </div>
      ) : null}
      {billingOverride ? (
        <div className="rounded-[22px] border border-sky-400/15 bg-sky-400/10 px-5 py-4 text-sm font-medium text-sky-100">
          Admin override is active for this workspace. Launch is allowed without an active subscription.
        </div>
      ) : null}
      <Card className="p-5 sm:p-7">
        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <div className="surface-subtle rounded-[22px] border border-white/10 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Campaign</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                {plan.businessName || `${plan.market} ${intentLabel} Campaign`}
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Audience</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {plan.audience || `${plan.market} ${intentLabel}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Budget</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    ${plan.monthlyBudget.toLocaleString()}/month
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Meta status</p>
                  <div className="mt-2 flex items-center gap-2">
                <StatusPill tone={getStatusTone(metaProviderState?.status.status ?? "disconnected")}>
                      {metaStatusText}
                    </StatusPill>
                  </div>
                </div>
              </div>
              <p className="mt-5 text-sm leading-7 text-muted-foreground">
                {metaVerificationTimedOut
                  ? "Meta is slow right now. We retried automatically, but validation still timed out. Try again or refresh this page."
                  : metaSelectionInvalid
                    ? "The saved Meta selection is no longer valid. Re-select the ad account, Page, and pixel before launch."
                    : launchRoomReady
                  ? "Preflight passed. Save the Meta selections below, then use the launch button to attempt launch."
                  : `Before launch: ${blockingReasons.join(" • ")}.`}
              </p>
              {metaSelectionReady ? (
                <div className="mt-4 rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Pre-launch check</p>
                  <p className="mt-2 leading-6">
                    Token: {metaPreflight?.tokenValid ? "valid" : "not verified"} · Account:{" "}
                    {metaPreflight?.accountValid ? "valid" : "invalid"} · Page:{" "}
                    {metaPreflight?.pageValid ? "valid" : "invalid"} · Pixel:{" "}
                    {metaPreflight?.pixelValid ? "valid" : "invalid"}
                  </p>
                  <p className="mt-2 leading-6">Last verified at: {metaVerifiedAtText}</p>
                  <p className="mt-2 leading-6">Meta state may change before launch.</p>
                </div>
              ) : null}
            </div>
            <div className="surface-subtle rounded-[22px] border border-white/10 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Meta setup</p>
              <p className="mt-3 text-sm font-semibold">
                {metaConnected
                  ? metaConnection.accountName || "Workspace linked"
                  : "Connect Meta to continue"}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Choose the exact ad account, Facebook Page, and pixel for this launch. The campaign
                will only use the values saved here.
              </p>
            </div>
          </div>
          <div className="surface-subtle rounded-[22px] border border-white/10 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Selected creative test set</p>
                <h2 className="mt-2 text-lg font-semibold text-foreground">
                  {selectedCreatives.length} creatives ready
                </h2>
              </div>
              <span className="rounded-full border border-cyan-300/16 bg-cyan-300/[0.055] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
                Side-by-side review
              </span>
            </div>
            <div className="mt-4 grid items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {selectedCreatives.map((selectedCreative, index) => (
                <StaticCreativeSummaryCard
                  category={plan.creativeStrategy.campaignCategory}
                  cta={selectedCreative.cta}
                  headline={selectedCreative.headline}
                  imageGenerationMessage={selectedCreative.imageGenerationMessage}
                  imageGenerationState={selectedCreative.imageGenerationState}
                  imageUrl={selectedCreative.imageUrl}
                  location={plan.market}
                  key={selectedCreative.id}
                  offer={plan.offerSummary || plan.keyOffer}
                  overlayText={selectedCreative.overlayText}
                  primaryText={selectedCreative.primaryText}
                  qualityGate={selectedCreative.qualityGate}
                  score={selectedCreative.score}
                  index={index}
                  selected
                  selectedCount={selectedCreatives.length}
                  visualPromptBrief={selectedCreative.visualPromptBrief}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>
      <LaunchMetaSelectionPanel connection={metaConnection} campaignId={resolvedCampaignId} />
      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch readiness gates</p>
            <h2 className="mt-2 text-lg font-semibold">
              {launchRoomReady ? "All launch gates are ready" : "Launch gates still need attention"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              Launch remains blocked until billing, Meta selections, selected creative, published funnel,
              budget cap, and the provider launch switch all pass.
            </p>
          </div>
          <StatusPill tone={launchRoomReady ? "success" : "warning"}>
            {launchRoomReady ? "Ready" : "Blocked"}
          </StatusPill>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {readinessItems.map((item) => (
            <div
              key={item.label}
              className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <span className={item.ready && item.statusLabel !== "Capped" ? "text-sm font-semibold text-emerald-300" : "text-sm font-semibold text-amber-300"}>
                  {item.statusLabel ?? (item.ready ? "Ready" : "Blocked")}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch check</p>
            <p className="mt-2 text-lg font-semibold">
              {billingLaunchAllowed ? "Ready to attempt launch" : "Activate to launch"}
            </p>
            <p className="mt-2 max-w-[720px] text-sm leading-7 text-muted-foreground">
              {launchRoomReady
                ? `Launch stays blocked until the saved token, ad account, page, and pixel all pass preflight validation. Last verified at: ${metaVerifiedAtText}. Meta state may change before launch.`
                : blockingReasons.length > 0
                  ? `Blocked: ${blockingReasons.join(" • ")}.`
                  : billingBlockCopy}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row">
            <Button asChild variant="secondary" className="w-full lg:w-auto">
              <Link href={savedRecord?.campaign.id ? `/preview?campaignId=${savedRecord.campaign.id}` : "/preview"}>
                Back
              </Link>
            </Button>
            {launchRoomReady ? (
              <Button asChild className="w-full lg:w-auto">
                <Link href={`/launching?campaignId=${encodeURIComponent(savedRecord.campaign.id)}&launchIntent=ready`}>
                  Ready to attempt launch
                </Link>
              </Button>
            ) : !billingLaunchAllowed ? (
              <Button asChild className="w-full lg:w-auto">
                <Link href={savedRecord?.campaign.id ? `/paywall?campaignId=${encodeURIComponent(savedRecord.campaign.id)}` : "/paywall"}>
                  Activate to launch
                </Link>
              </Button>
            ) : (
              <Button className="w-full lg:w-auto" disabled>
                Ready to attempt launch
              </Button>
            )}
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
