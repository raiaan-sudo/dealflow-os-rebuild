import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { CampaignPublishPanel } from "@/components/campaign/campaign-publish-panel";
import { LaunchMetaSelectionPanel } from "@/components/campaign/launch/launch-meta-selection-panel";
import { CustomerVideoPlayer } from "@/components/campaign/customer-video-player";
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
import {
  getMetaDailyBudgetCapCents,
  isMetaDailyBudgetCapRequiredForProductionLaunch,
} from "@/lib/integrations/meta/budget-cap";
import {
  getSelectedAdIdsFromPlan,
  getSelectedUgcVideoIdsFromPlan,
  readCampaignPlanDocument,
} from "@/lib/services/campaign-plan-document";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { getBillingSummary, getBillingSummaryForCampaign } from "@/lib/services/billing-service";
import { getMetaQueryUiCopy } from "@/lib/integrations/meta/error-mapper";
import { getApprovedCreativeIntakeGenerationContext, isCreativeChatIntakeEnabled } from "@/lib/services/creative-chat-intake-service";
import {
  getStaticCreativeReadiness,
  getVideoReadinessLabel,
  getVideoReadinessMessage,
  isLaunchReadyVideoCreative,
  isPlayableVideoCreative,
} from "@/lib/services/creative-media-readiness";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
import {
  getMetaConnectionState,
  getDefaultMetaConnectionState,
  validateMetaLaunchSelections,
} from "@/lib/integrations/meta/service";
import { recordActivationEventForCurrentUser } from "@/lib/services/activation-telemetry-service";
import { getPublicAppUrl } from "@/lib/env";

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

function getPublicFunnelDestinationUrl(slug: string | null | undefined) {
  if (!slug) {
    return null;
  }

  try {
    return `${getPublicAppUrl()}/f/${encodeURIComponent(slug)}`;
  } catch {
    return null;
  }
}

function asPlainRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeFunnelText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

function getFunnelSnapshotSignature(value: unknown) {
  const record = asPlainRecord(value);
  const campaign = asPlainRecord(record?.campaign);
  const funnel = asPlainRecord(record?.funnel) ?? asPlainRecord(campaign?.funnel);

  if (!funnel) {
    return null;
  }

  return [
    normalizeFunnelText(funnel.headline),
    normalizeFunnelText(funnel.subheadline),
    normalizeFunnelText(funnel.cta),
  ].join("|");
}

function publishedFunnelSnapshotMatchesCurrentPlan(params: {
  currentPlan: unknown;
  publishedSnapshot: unknown;
}) {
  const currentSignature = getFunnelSnapshotSignature(params.currentPlan);
  const publishedSignature = getFunnelSnapshotSignature(params.publishedSnapshot);

  return Boolean(currentSignature && publishedSignature && currentSignature === publishedSignature);
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
    return "Activate billing before this workspace can launch to Meta. No Meta campaign objects will be created until launch access is active.";
  }

  if (billing.billingState === "payment_issue") {
    return "Update the payment method in Stripe Portal before launching. Existing funnel operations stay in warning mode, but new Meta launches are blocked while Stripe reports a payment issue.";
  }

  if (billing.requiresSuspension) {
    return "Billing is inactive. Managed campaign assets have been removed or are being removed, and launch remains unavailable until billing is reactivated.";
  }

  if (billing.cancelAtPeriodEnd) {
    return "This subscription is scheduled to cancel. Launch remains available during the paid period, and managed campaign assets will be removed when access ends unless billing is reactivated.";
  }

  return "Activate billing before this workspace can launch to Meta. The launch button stays disabled and no live ad launch runs until billing is active.";
}

function formatBudgetCap(valueCents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueCents / 100);
}

async function loadPersistedLaunchMediaSelection(campaignId: string | null) {
  if (!campaignId) {
	    return {
	      selectedAdIds: [],
	      selectedUgcVideoIds: [],
	      creativeIntakeContext: null,
	      publicFunnelSnapshotMatchesCurrentPlan: false,
	    };
	  }

  const supabase = await createRouteHandlerClient();

  if (!supabase) {
	    return {
	      selectedAdIds: [],
	      selectedUgcVideoIds: [],
	      creativeIntakeContext: null,
	      publicFunnelSnapshotMatchesCurrentPlan: false,
	    };
	  }

  const { data } = await supabase
    .from("campaign_plans")
    .select("plan,published_snapshot")
    .eq("id", campaignId)
    .maybeSingle();

  const row = (data as { plan?: unknown; published_snapshot?: unknown } | null) ?? null;
  const plan = readCampaignPlanDocument(row?.plan);

	  return {
	    selectedAdIds: getSelectedAdIdsFromPlan(plan),
	    selectedUgcVideoIds: getSelectedUgcVideoIdsFromPlan(plan),
	    creativeIntakeContext: isCreativeChatIntakeEnabled()
	      ? getApprovedCreativeIntakeGenerationContext(plan)
	      : null,
	    publicFunnelSnapshotMatchesCurrentPlan: publishedFunnelSnapshotMatchesCurrentPlan({
	      currentPlan: plan,
	      publishedSnapshot: row?.published_snapshot,
    }),
  };
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
  const [record, metaConnection, metaProviderState] = await Promise.all([
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
  ]);
  const plan = record ? canonicalCampaignToPlan(record) : null;
  const metaPreflight = await withTimeout(
    validateMetaLaunchSelections({
      destinationUrl: getPublicFunnelDestinationUrl(record?.publish.slug),
    }).catch(() => null),
    null,
    5_000,
  );
  const resolvedCampaignId = record?.campaign.id ?? requestedCampaignId;
  const launchReturnTo = resolvedCampaignId
    ? `/launch?campaignId=${encodeURIComponent(resolvedCampaignId)}`
    : "/launch";
  const billing = await withTimeout(
    resolvedCampaignId
      ? getBillingSummaryForCampaign(resolvedCampaignId).catch(() => null)
      : getBillingSummary().catch(() => null),
    null,
    2_500,
  );
  const metaReconnectHref = `/api/integrations/meta/connect?returnTo=${encodeURIComponent(launchReturnTo)}`;
  const cleanLaunchHref = launchReturnTo;
  const launchMediaSelection = await loadPersistedLaunchMediaSelection(resolvedCampaignId);
	  const selectedAdIds = launchMediaSelection.selectedAdIds;
	  const selectedUgcVideoIds = launchMediaSelection.selectedUgcVideoIds;
	  const creativeIntakeContext = launchMediaSelection.creativeIntakeContext;
	  const staticBriefReadinessContext = creativeIntakeContext
	    ? {
	        staticBriefHash: creativeIntakeContext.staticBriefHash,
	        offerHash: creativeIntakeContext.offerHash,
	        ctaHash: creativeIntakeContext.ctaHash,
	        brandHash: creativeIntakeContext.brandHash,
	      }
	    : null;
	  const publicFunnelSnapshotCurrent = launchMediaSelection.publicFunnelSnapshotMatchesCurrentPlan;
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
            <Link href="/onboarding">Start onboarding</Link>
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
  const metaSelectionReady =
    metaConnected &&
    Boolean(metaConnection.accountId) &&
    Boolean(metaConnection.pageId) &&
    Boolean(metaConnection.tracking.pixelId);
  const metaPreflightReady = metaPreflight?.ready ?? false;
  const metaLaunchReady = metaSelectionReady && metaPreflightReady;
  const billingLaunchAllowed = billing?.launchAllowed ?? false;
  const billingOverride = billing?.launchOverride ?? false;
  const billingQaOverride = billing?.launchOverrideSource === "qa_billing_acceptance";
  const billingBlockCopy = getBillingLaunchBlockCopy(billing);
  const billingReadyDetail = billingQaOverride
    ? "Owner/test billing acceptance override is active. No Stripe subscription is being claimed for this proof."
    : billingOverride
      ? "Internal billing override is active. No Stripe subscription is being claimed for this proof."
      : "Launch access active";
  const providerLaunchEnabled = process.env.ALLOW_META_LIVE_LAUNCH === "true";
  const budgetCapRequiredForLaunch = isMetaDailyBudgetCapRequiredForProductionLaunch();
  const metaVerificationTimedOut =
    metaPreflight === null &&
    (metaProviderState?.status.status === "connected" || metaSelectionReady || metaConnected);
  const metaSelectionInvalid =
    metaSelectionReady &&
    metaPreflight !== null &&
    !metaPreflightReady &&
    (
      !metaPreflight.tokenValid ||
      !metaPreflight.accountValid ||
      !metaPreflight.pageValid ||
      !metaPreflight.pixelValid
    );
  const metaTrackingPreflightBlocked =
    metaSelectionReady &&
    metaPreflight !== null &&
    !metaPreflightReady &&
    !metaSelectionInvalid;
  const blockingReasons = [
    ...(!record?.campaign.id ? ["Save the campaign first."] : []),
    ...(!billingLaunchAllowed ? ["Activate billing before launch."] : []),
    ...(!metaSelectionReady ? ["Save the Meta ad account, Page, and pixel before launch."] : []),
    ...(metaSelectionReady && !metaPreflightReady ? metaPreflight?.errors ?? ["Meta preflight failed."] : []),
    ...(!providerLaunchEnabled ? ["Final launch approval is pending."] : []),
  ];
  const selectedCreatives = plan.creatives.staticAds.filter((ad) => selectedAdIds.includes(ad.id));
  const staticReadiness = getStaticCreativeReadiness(plan.creatives.staticAds, selectedAdIds, staticBriefReadinessContext);
  const selectedCreativeMediaReady =
    staticReadiness.allSelectedReady;
  const savedCreativeSetMissing = selectedCreatives.length === 0;
  const isCurrentLaunchReadyUgcVideo = (video: (typeof plan.creatives.videoAds)[number]) =>
    video.conceptType === "customer_ugc" &&
    isLaunchReadyVideoCreative(video) &&
    (!creativeIntakeContext?.ugcScriptHash ||
      video.ugcScriptHash === creativeIntakeContext.ugcScriptHash ||
      video.scriptHash === creativeIntakeContext.ugcScriptHash);
  const dedupeVideoIds = (videos: typeof plan.creatives.videoAds) => {
    const seen = new Set<string>();
    return videos.filter((video) => {
      if (seen.has(video.id)) {
        return false;
      }

      seen.add(video.id);
      return true;
    });
  };
  const selectedUgcVideos = selectedUgcVideoIds.length > 0
    ? dedupeVideoIds(plan.creatives.videoAds
        .filter((video) => selectedUgcVideoIds.includes(video.id))
        .filter(isCurrentLaunchReadyUgcVideo)
        .sort((left, right) => selectedUgcVideoIds.indexOf(left.id) - selectedUgcVideoIds.indexOf(right.id)))
    : [];
  const launchReadyVideos = selectedUgcVideos;
  const fallbackDisplayVideos = dedupeVideoIds(plan.creatives.videoAds.filter(isCurrentLaunchReadyUgcVideo));
  const displayVideoAds = selectedUgcVideos.length > 0
    ? selectedUgcVideos
    : fallbackDisplayVideos.length > 0
      ? fallbackDisplayVideos
      : plan.creatives.videoAds;
  const videoMediaReady = launchReadyVideos.length > 0;
  const publicFunnelPublished =
    savedRecord.publish.state === "published" &&
    Boolean(savedRecord.publish.slug) &&
    savedRecord.publish.hasPublishedSnapshot &&
    publicFunnelSnapshotCurrent;
  if (!publicFunnelPublished) {
    blockingReasons.push(
      savedRecord.publish.state === "published" && savedRecord.publish.hasPublishedSnapshot && !publicFunnelSnapshotCurrent
        ? "Republish the public funnel because the live snapshot no longer matches the current campaign plan."
        : "Publish the public funnel before launch.",
    );
  }
  if (!selectedCreativeMediaReady) {
    blockingReasons.push("Finish rendering clean creative images before launch.");
  }
  if (!videoMediaReady) {
    blockingReasons.push("Approve a campaign-specific UGC video before launch.");
  }
  const dailyBudgetInput =
    plan.runtime.budgetDailyInput && plan.runtime.budgetDailyInput > 0
      ? plan.runtime.budgetDailyInput
      : Math.round(plan.monthlyBudget / 30);
  const dailyBudgetCents = Math.max(0, Math.round(dailyBudgetInput * 100));
  const budgetCapCents = getMetaDailyBudgetCapCents();
  const budgetCapApplied = budgetCapCents !== null;
  const budgetCapMissingForLaunch = providerLaunchEnabled && budgetCapRequiredForLaunch && budgetCapCents === null;
  const effectiveDailyBudgetCents = budgetCapCents !== null
    ? Math.min(dailyBudgetCents, budgetCapCents)
    : dailyBudgetCents;
  const budgetWasCapped = budgetCapCents !== null && dailyBudgetCents > budgetCapCents;
  const liveActivationBlocked = metaPreflight?.liveActivationBlocked ?? false;
  const launchRoomReady =
    billingLaunchAllowed &&
    metaLaunchReady &&
    selectedCreativeMediaReady &&
    videoMediaReady &&
    publicFunnelPublished &&
    !budgetCapMissingForLaunch &&
    providerLaunchEnabled;
  const readinessItems = [
    {
      label: "Billing",
      ready: billingLaunchAllowed,
      detail: billingLaunchAllowed ? billingReadyDetail : billingBlockCopy,
    },
    {
      label: "Meta connection",
      ready: metaConnected,
      detail: metaConnected ? "Workspace connected" : "Connect Meta before launch",
    },
    {
      label: "Ad account / Page / pixel",
      ready: metaSelectionReady,
      detail: metaSelectionReady
        ? "Saved selections ready"
        : "Select and save a valid ad account, Page, and pixel",
    },
    {
      label: "Meta preflight",
      ready: metaLaunchReady,
      detail: metaLaunchReady
        ? [
            `Meta checks verified ${formatLastVerified(metaPreflight?.checkedAt)}`,
            ...(metaPreflight?.warnings ?? []),
          ].join(" ")
        : metaSelectionReady
          ? (metaPreflight?.errors?.length ?? 0) > 0
            ? metaPreflight?.errors.join(" ")
            : "Saved selections need Meta verification before launch"
          : "Save the Meta selections first",
    },
    {
      label: "Creative media ready",
      ready: selectedCreativeMediaReady,
      detail:
        selectedCreativeMediaReady
          ? `${staticReadiness.selectionLabel}; ${staticReadiness.selectedReadyLabel}`
          : savedCreativeSetMissing
            ? `Saved creative set missing. Open Creative Studio and save at least ${staticReadiness.minimumRequiredCount} launch-ready static ads before launch.`
          : selectedCreatives.length > 0
            ? "Regenerate selected creatives until clean image renders are ready"
            : "Choose the creative test set first",
    },
    {
      label: "Video preview ready",
      ready: videoMediaReady,
      detail: videoMediaReady
        ? `${launchReadyVideos.length} campaign-specific UGC video ${launchReadyVideos.length === 1 ? "preview is" : "previews are"} launch-ready`
        : "Render or approve a campaign-specific UGC video before launch",
    },
    {
      label: "Funnel published",
      ready: publicFunnelPublished,
      detail: publicFunnelPublished
        ? `Published at /f/${savedRecord.publish.slug}`
        : savedRecord.publish.state === "published" && savedRecord.publish.hasPublishedSnapshot && !publicFunnelSnapshotCurrent
          ? "The public funnel is published, but its live snapshot is stale. Republish before sending paid traffic."
        : "Publish the public funnel before sending traffic",
    },
    {
      label: "Budget",
      ready: !budgetCapMissingForLaunch,
      statusLabel: budgetCapMissingForLaunch
        ? "Blocked"
        : budgetWasCapped
          ? "Capped"
          : budgetCapApplied
            ? undefined
            : "Unlimited",
      detail: budgetCapMissingForLaunch
        ? "Configure META_DAILY_BUDGET_CAP_CENTS before production Meta object creation. the platform will fail closed until a finite cap is present."
        : budgetWasCapped
        ? `Requested daily budget is ${formatBudgetCap(dailyBudgetCents)}; the launch will use the platform cap of ${formatBudgetCap(effectiveDailyBudgetCents)}/day unless support adjusts the cap.`
        : budgetCapCents !== null
          ? `Launch is capped at ${formatBudgetCap(budgetCapCents)}/day; requested daily budget is ${formatBudgetCap(dailyBudgetCents)}.`
          : `No platform budget cap is applied. Launch will use the requested daily budget of ${formatBudgetCap(dailyBudgetCents)}.`,
    },
    {
      label: "Tracking / live activation",
      ready: !liveActivationBlocked,
      statusLabel: liveActivationBlocked ? "Paused only" : undefined,
      detail: liveActivationBlocked
        ? `Paused Meta object creation may proceed with the verified destination preflight, but live activation is blocked until ${metaPreflight?.effectiveLaunchDomain ?? "the launch domain"} is verified and tracking is fully configured.`
        : "Launch domain and tracking are ready for live activation review.",
    },
    {
      label: "Launch approval",
      ready: providerLaunchEnabled,
      detail: providerLaunchEnabled
        ? "Final launch approval is enabled. Meta campaigns are still created paused for review."
        : "Final launch approval is pending, so Meta campaign objects will not be created yet.",
    },
  ];
  const metaStatusText = metaLaunchReady
    ? `Connected (last verified ${formatLastVerified(metaPreflight?.checkedAt)})`
    : metaVerificationTimedOut
      ? "Meta unavailable, try again"
      : metaSelectionInvalid
        ? "Meta selection invalid"
        : metaTrackingPreflightBlocked
          ? "Meta preflight blocked"
        : metaConnected
          ? "Selection required before launch"
      : "Meta connection required";
  const metaVerifiedAtText = formatVerifiedTimestamp(metaPreflight?.checkedAt);
  const launchBlockerActions = [
    ...(!billingLaunchAllowed
      ? [
          billing?.billingState === "payment_issue"
            ? "Update the payment method in Settings, then return here after Stripe confirms recovery."
            : billing?.requiresSuspension
              ? "Reactivate billing in Settings before launch, funnel capture, alerts, or optimization resume."
              : "Activate billing from Settings or the activation page before attempting launch.",
        ]
      : []),
    ...(!metaLaunchReady
      ? [
          metaSelectionReady
            ? metaSelectionInvalid
              ? "Meta selections were saved, but Meta can no longer verify the selected ad account, Page, or pixel. Re-save the selections or reconnect Meta if the check stays blocked."
              : "Meta selections were saved, but launch preflight has not passed yet. Configure the verified platform launch domain and publish the public funnel before attempting launch."
            : "Save the ad account, Facebook Page, and pixel in the Meta setup section.",
        ]
      : []),
    ...(!publicFunnelPublished ? ["Publish the public funnel snapshot so Meta has a live destination URL."] : []),
    ...(!selectedCreativeMediaReady
      ? [
          savedCreativeSetMissing
            ? `Open Creative Studio and save at least ${staticReadiness.minimumRequiredCount} launch-ready static ads before launch.`
            : "Return to Creatives and refresh unfinished previews before saving the launch set again.",
        ]
      : []),
    ...(!videoMediaReady
      ? ["Return to Creatives and render or approve a campaign-specific UGC video before launch."]
      : []),
    ...(!providerLaunchEnabled
      ? [
          "Final launch approval is pending. Meta campaign objects will not be created until support enables live launch approvals.",
        ]
      : []),
    ...(budgetCapMissingForLaunch
      ? ["Configure META_DAILY_BUDGET_CAP_CENTS before attempting a production Meta launch."]
      : []),
  ];

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

  return (
    <PageShell className="max-w-[1640px]">
      <WizardSteps current="launch" />
      <PageHeader
        eyebrow="Launch"
        title="Paused launch readiness review"
        description="Confirm the campaign, selected media, owner blockers, and paused Meta object readiness."
      />
      {metaConnectedFlag ? (
        <div className="rounded-[22px] border border-emerald-400/15 bg-emerald-400/10 px-5 py-4 text-sm font-medium text-emerald-100">
          Meta connection saved. Finish the required selections below to continue.
        </div>
      ) : null}
      {metaErrorCopy ? (
        <div className="rounded-[22px] border border-rose-400/15 bg-rose-400/10 px-5 py-4 text-sm text-rose-100">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-semibold">{metaErrorCopy.title}</p>
              <p className="mt-2 font-normal">
                {metaErrorCopy.message} {metaErrorCopy.action}
              </p>
              {metaRequestId ? (
                <p className="mt-2 text-xs text-rose-200/80">Reference: {metaRequestId}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Button asChild className="w-full sm:w-auto">
                <Link href={metaReconnectHref}>Reconnect Meta</Link>
              </Button>
              <Button asChild variant="secondary" className="w-full sm:w-auto">
                <Link href={cleanLaunchHref}>Clear message</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {discoveryIncomplete ? (
        <div className="rounded-[22px] border border-amber-400/15 bg-amber-400/10 px-5 py-4 text-sm font-medium text-amber-100">
          {discoveryIncomplete}
        </div>
      ) : null}
      {!billingLaunchAllowed ? (
        <div className="rounded-[22px] border border-amber-400/15 bg-amber-400/10 px-5 py-4 text-sm font-medium text-amber-100">
          Billing recovery is required before launch. {billingBlockCopy}
        </div>
      ) : null}
      {billingOverride ? (
        <div className="rounded-[22px] border border-sky-400/15 bg-sky-400/10 px-5 py-4 text-sm font-medium text-sky-100">
          {billingQaOverride
            ? "Owner/test billing acceptance is active for this campaign. Stripe subscription status is unchanged and no live charge is being claimed."
            : "Launch access is active for this workspace through an internal billing override."}
        </div>
      ) : null}
      {!launchRoomReady && launchBlockerActions.length > 0 ? (
        <Card className="border-amber-300/15 bg-amber-300/[0.055] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
                Why launch is blocked
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
                Finish these gates before paused setup
              </h2>
              <div className="mt-4 grid gap-2 text-sm leading-6 text-muted-foreground">
                {launchBlockerActions.map((action) => (
                  <p key={action}>- {action}</p>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                This page is a recovery checklist while blocked. Meta objects will not be created or recovered until every gate below is ready.
              </p>
              {selectedCreatives.length === 0 ? (
                <div className="mt-4">
                  <Button asChild>
                    <Link
                      href={
                        savedRecord?.campaign.id
                          ? `/build/creatives?campaignId=${encodeURIComponent(savedRecord.campaign.id)}`
                          : "/build/creatives"
                      }
                    >
                      Open Creative Studio
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
            <StatusPill tone="warning">Blocked</StatusPill>
          </div>
        </Card>
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
                    {formatBudgetCap(dailyBudgetCents)}/day
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    30-day estimate {formatBudgetCap(dailyBudgetCents * 30)}
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
                    : metaTrackingPreflightBlocked
                      ? "The saved Meta selections are valid, but launch preflight is blocked by the platform domain or destination requirements."
                    : launchRoomReady
                  ? "Preflight passed for paused Meta setup. Owner funds and live activation approval are still separate."
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
                  {selectedCreativeMediaReady
                    ? staticReadiness.selectionLabel
                    : savedCreativeSetMissing
                      ? "Saved creative set missing"
                    : `${selectedCreatives.length} selected, rendering needed`}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The first saved ad is the primary creative. The rest stay as review variants for comparison before launch. {staticReadiness.selectedReadyLabel}
                </p>
              </div>
              <span className="rounded-full border border-cyan-300/16 bg-cyan-300/[0.055] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
                Side-by-side review
              </span>
            </div>
            <div className="mt-4 grid items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {selectedCreatives.map((selectedCreative, index) => (
                <div className="space-y-2" key={selectedCreative.id}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {index === 0 ? "Primary creative" : `Review variant ${index}`}
                  </p>
                  <StaticCreativeSummaryCard
                    category={plan.creativeStrategy.campaignCategory}
                    cta={selectedCreative.cta}
                    headline={selectedCreative.headline}
                    imageGenerationMessage={selectedCreative.imageGenerationMessage}
                    imageGenerationProvider={selectedCreative.imageGenerationProvider}
                    imageGenerationState={selectedCreative.imageGenerationState}
                    imagePrompt={selectedCreative.imagePrompt}
                    imagePromptConfig={selectedCreative.imagePromptConfig}
	                    imageUrl={selectedCreative.imageUrl}
	                    storageNormalized={selectedCreative.storageNormalized}
	                    appComposedFinal={selectedCreative.appComposedFinal}
                    qualityTier={selectedCreative.qualityTier}
                    compositionVersion={selectedCreative.compositionVersion}
                    sourceBackgroundKind={selectedCreative.sourceBackgroundKind}
                    sourceBackgroundProvider={selectedCreative.sourceBackgroundProvider}
                    sourceBackgroundAssetId={selectedCreative.sourceBackgroundAssetId}
                    location={plan.market}
                    offer={plan.offerSummary || plan.keyOffer}
                    overlayText={selectedCreative.overlayText}
                    primaryText={selectedCreative.primaryText}
                    qualityGate={selectedCreative.qualityGate}
                    visualQualityGate={selectedCreative.visualQualityGate}
                    premiumQualityGate={selectedCreative.premiumQualityGate}
                    imageQa={selectedCreative.imageQa}
                    sourceImageQa={selectedCreative.sourceImageQa}
                    prominent
                    score={selectedCreative.score}
                    index={index}
                    selected
                    selectedCount={selectedCreatives.length}
                    visualPromptBrief={selectedCreative.visualPromptBrief}
                  />
                </div>
              ))}
            </div>
            {displayVideoAds.length > 0 ? (
              <div className="mt-5 border-t border-white/10 pt-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Video preview</p>
                    <h3 className="mt-2 text-sm font-semibold text-foreground">
                      {videoMediaReady ? "Campaign-specific UGC is ready" : "Video review needed"}
                    </h3>
                  </div>
                  <span className={videoMediaReady ? "text-sm font-semibold text-emerald-300" : "text-sm font-semibold text-amber-300"}>
                    {videoMediaReady ? "Ready" : "Blocked"}
                  </span>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {displayVideoAds.map((video, index) => (
                    <div className="rounded-[18px] border border-white/10 bg-black/18 p-3" key={video.id}>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-semibold text-foreground">
                          Video {index + 1}: {video.title || video.hook}
                        </p>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {getVideoReadinessLabel(video)}
                        </span>
                      </div>
                      {isPlayableVideoCreative(video) ? (
                        <div className="mx-auto max-w-[240px] overflow-hidden rounded-[14px] border border-white/10 bg-black">
                          <CustomerVideoPlayer
                            className="border-0"
                            controlsList="nodownload noplaybackrate"
                            disablePictureInPicture
                            playsInline
                            src={video.videoUrl}
                            title={video.title || video.hook}
                          />
                        </div>
                      ) : (
                        <div className="grid aspect-video place-items-center rounded-[14px] border border-dashed border-white/12 bg-black/22 p-4 text-center text-sm text-muted-foreground">
                          {getVideoReadinessMessage(video)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Card>
      <LaunchMetaSelectionPanel connection={metaConnection} campaignId={resolvedCampaignId} />
      {!publicFunnelPublished ? (
        <CampaignPublishPanel
          campaignId={savedRecord.campaign.id}
          campaignName={plan.businessName || `${plan.market} ${intentLabel} Campaign`}
          initialPublish={savedRecord.publish}
          compact
        />
      ) : null}
      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch readiness gates</p>
            <h2 className="mt-2 text-lg font-semibold">
              {launchRoomReady ? "All launch gates are ready" : "Launch gates still need attention"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              Paused setup remains blocked until billing, Meta selections, launch checks, selected creative,
              published funnel, and final owner approval all pass.
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
              {billingLaunchAllowed ? "Ready for paused setup review" : "Activate before setup"}
            </p>
            <p className="mt-2 max-w-[720px] text-sm leading-7 text-muted-foreground">
              {launchRoomReady
                ? `All launch gates passed for paused object setup. Owner funds and live activation approval remain separate. Last verified at: ${metaVerifiedAtText}. Meta state may change before activation.`
                : blockingReasons.length > 0
                  ? `Blocked: ${blockingReasons.join(" • ")}. No Meta object creation or recovery will run until these gates pass.`
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
                  Review paused setup
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
                Launch blocked
              </Button>
            )}
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
