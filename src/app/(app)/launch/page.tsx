import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { LaunchMetaSelectionPanel } from "@/components/campaign/launch/launch-meta-selection-panel";
import { StaticCreativePreviewCard } from "@/components/campaign/static-creative-preview-card";
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
import { getRequestProductI18n } from "@/lib/i18n/server";
import { getProductIntlLocale, type ProductLocale } from "@/lib/i18n/config";

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

function formatLastVerified(value: string | null | undefined, locale: ProductLocale) {
  if (!value) {
    return new Intl.RelativeTimeFormat(getProductIntlLocale(locale), { numeric: "auto" }).format(0, "minute");
  }

  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60_000));

  if (diffMinutes <= 1) {
    return new Intl.RelativeTimeFormat(getProductIntlLocale(locale), { numeric: "auto" }).format(0, "minute");
  }

  return new Intl.RelativeTimeFormat(getProductIntlLocale(locale), { numeric: "auto" }).format(-diffMinutes, "minute");
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
  const { currency, dateTime, locale, t } = await getRequestProductI18n();
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
          eyebrow={t("nav.goLive")}
          title={t("launch.planMissing")}
          description={t("dashboard.empty.body")}
        />
        <EmptyState
          title={t("launch.noCampaign")}
          description={t("dashboard.empty.body")}
        />
        <div>
          <Button asChild>
            <Link href="/dashboard">{t("launch.openDashboard")}</Link>
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
  ];
  const selectedCreatives = plan.creatives.staticAds.filter((ad) => ad.id === selectedAdIds[0]);
  const selectedMetaAccount = metaConnection.availableAccounts.find((account) =>
    account.externalAccountId === metaConnection.accountId || account.id === metaConnection.accountId,
  );
  const approvedDailyBudgetMinor = savedRecord.plan.daily_budget_cents;
  const approvedCurrency = selectedMetaAccount?.currency?.trim().toUpperCase() ?? "";
  const activationApprovalReady =
    Number.isSafeInteger(approvedDailyBudgetMinor) &&
    approvedDailyBudgetMinor >= 100 &&
    (approvedCurrency === "USD" || approvedCurrency === "CAD");
  const metaStatusText = metaLaunchReady
    ? `Meta · ${formatLastVerified(metaPreflight?.checkedAt, locale)}`
    : metaVerificationTimedOut
      ? "Meta unavailable, try again"
      : metaSelectionInvalid
        ? "Meta selection invalid"
        : metaConnected
          ? "Selection required before launch"
          : "Meta connection required";
  const metaVerifiedAtText = metaPreflight?.checkedAt
    ? dateTime(metaPreflight.checkedAt)
    : t("common.notVerified");

  if (selectedCreatives.length === 0) {
    return (
      <PageShell>
        <WizardSteps current="launch" />
        <PageHeader
          eyebrow={t("nav.goLive")}
          title={t("launch.creativeRequired")}
          description={t("launch.noCreative")}
        />
        <EmptyState
          title={t("launch.noCreative")}
          description={t("launch.creativeRequired")}
        />
        <div>
          <Button asChild>
            <Link
              href={
                savedRecord?.campaign.id
                  ? `/build/creatives?campaignId=${encodeURIComponent(savedRecord.campaign.id)}`
                  : "/build/creatives"
              }
            >
              {t("common.back")}
            </Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <WizardSteps current="launch" />
      <PageHeader
        eyebrow={t("nav.goLive")}
        title={t("launch.finalReview")}
        description={t("launch.check")}
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
          Your campaign is ready. Activate billing before this workspace can launch to Meta.
        </div>
      ) : null}
      {billingOverride ? (
        <div className="rounded-[22px] border border-sky-400/15 bg-sky-400/10 px-5 py-4 text-sm font-medium text-sky-100">
          Admin override is active for this workspace. Launch is allowed without an active subscription.
        </div>
      ) : null}
      <Card className="p-5 sm:p-7">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="space-y-4">
            <div className="surface-subtle rounded-[22px] border border-white/10 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.campaign")}</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                {plan.businessName || `${plan.market} ${intentLabel} Campaign`}
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.audience")}</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {plan.audience || `${plan.market} ${intentLabel}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.budget")}</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {approvedCurrency === "USD" || approvedCurrency === "CAD"
                      ? currency(plan.monthlyBudget, approvedCurrency)
                      : t("common.unavailable")}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("launch.metaStatus")}</p>
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
                    : blockingReasons.length === 0
                  ? "Preflight passed. Save the Meta selections below, then use the launch button to attempt launch."
                  : `Before launch: ${blockingReasons.join(" • ")}.`}
              </p>
              {metaSelectionReady ? (
                <div className="mt-4 rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{t("launch.precheck")}</p>
                  <p className="mt-2 leading-6">
                    Token: {metaPreflight?.tokenValid ? "valid" : "not verified"} · Account:{" "}
                    {metaPreflight?.accountValid ? "valid" : "invalid"} · Page:{" "}
                    {metaPreflight?.pageValid ? "valid" : "invalid"} · Pixel:{" "}
                    {metaPreflight?.pixelValid ? "valid" : "invalid"}
                  </p>
                  <p className="mt-2 leading-6">Last verified at: {metaVerifiedAtText}</p>
                  <p className="mt-2 leading-6">{t("launch.metaMayChange")}</p>
                </div>
              ) : null}
            </div>
            <div className="surface-subtle rounded-[22px] border border-white/10 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("launch.metaSetup")}</p>
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
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("launch.primaryCreative")}</p>
            <div className="mt-4 grid gap-4">
              {selectedCreatives.map((selectedCreative) => (
                <StaticCreativePreviewCard
                  category={plan.creativeStrategy.campaignCategory}
                  compact
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("launch.check")}</p>
            <p className="mt-2 text-lg font-semibold">
              {billingLaunchAllowed ? t("launch.finalReview") : t("billing.activate")}
            </p>
            <p className="mt-2 max-w-[720px] text-sm leading-7 text-muted-foreground">
              {billingLaunchAllowed
                ? `Launch stays blocked until the saved token, ad account, page, and pixel all pass preflight validation. Last verified at: ${metaVerifiedAtText}. Meta state may change before launch.`
                : "Preview stays available before payment. Live Meta launch is blocked until billing is active for this workspace."}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row">
            <Button asChild variant="secondary" className="w-full lg:w-auto">
              <Link href={savedRecord?.campaign.id ? `/preview?campaignId=${savedRecord.campaign.id}` : "/preview"}>
                {t("common.back")}
              </Link>
            </Button>
            {billingLaunchAllowed && metaLaunchReady && activationApprovalReady ? (
              <Button asChild className="w-full lg:w-auto">
                <Link href={`/launching?${new URLSearchParams({
                  campaignId: savedRecord.campaign.id,
                }).toString()}`}>
                  {t("nav.goLive")}
                </Link>
              </Button>
            ) : !billingLaunchAllowed ? (
              <Button asChild className="w-full lg:w-auto">
                <Link href={savedRecord?.campaign.id ? `/paywall?campaignId=${encodeURIComponent(savedRecord.campaign.id)}` : "/paywall"}>
                  {t("billing.activate")}
                </Link>
              </Button>
            ) : (
              <Button className="w-full lg:w-auto" disabled>
                {billingLaunchAllowed && metaLaunchReady
                  ? "Budget or currency review required"
                  : "Ready to attempt launch"}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
