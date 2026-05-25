import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { PaywallPlanSelector } from "@/components/billing/paywall-plan-selector";
import {
  PrepaywallCampaignPreviewFromStorage,
  type PrepaywallCampaignPreviewDraft,
} from "@/components/onboarding/prepaywall-campaign-preview";
import { normalizeBillingPlanTier } from "@/lib/billing/plans";
import { getBillingSummary, getBillingSummaryForCampaign } from "@/lib/services/billing-service";
import { recordActivationEventForCurrentUser } from "@/lib/services/activation-telemetry-service";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";

function buildHomeHref(campaignId: string | null) {
  return campaignId ? `/builder?campaignId=${encodeURIComponent(campaignId)}` : "/onboarding";
}

function toPreviewCampaignMode(intent: string): PrepaywallCampaignPreviewDraft["campaignMode"] {
  if (intent === "seller" || intent === "investor" || intent === "commercial") {
    return intent;
  }

  return "buyer";
}

async function loadPersistedPreviewDraft(
  campaignId: string | null,
  selectedPlanTier: "starter" | "pro",
): Promise<PrepaywallCampaignPreviewDraft | null> {
  if (!campaignId) {
    return null;
  }

  const activeCampaign = await resolveActiveCampaignRecord(campaignId).catch(() => null);
  const record = activeCampaign?.record ?? null;

  if (!record || record.campaign.id !== campaignId) {
    return null;
  }

  const plan = canonicalCampaignToPlan(record);

  return {
    campaignMode: toPreviewCampaignMode(plan.intent),
    market: plan.market,
    audience: plan.audience,
    propertyType: plan.propertyType,
    dailyBudget: String(plan.runtime.budgetDailyInput ?? Number((plan.monthlyBudget / 30).toFixed(2))),
    monthlyBudget: String(plan.monthlyBudget),
    offer: plan.keyOffer,
    agentCompanyName: plan.businessName,
    planTier: selectedPlanTier,
  };
}

export default async function PaywallPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0 ? params.campaignId : null;
  const selectedPlanTier =
    typeof params.plan === "string" ? normalizeBillingPlanTier(params.plan) : "starter";
  const billing = campaignId
    ? await getBillingSummaryForCampaign(campaignId).catch(() => getBillingSummary().catch(() => null))
    : await getBillingSummary().catch(() => null);
  const selectedPreviewPlanTier = selectedPlanTier === "pro" ? "pro" : "starter";
  const selectablePlanTier = selectedPlanTier === "pro" ? "pro" : "starter";
  const persistedPreviewDraft = await loadPersistedPreviewDraft(campaignId, selectedPreviewPlanTier);
  const paymentIssue = billing?.billingState === "payment_issue";
  const suspended = billing?.requiresSuspension === true;
  await recordActivationEventForCurrentUser({
    eventName: "paywall_viewed",
    campaignId,
    source: "paywall_page",
    metadata: {
      route: "paywall",
      planTier: selectedPlanTier,
      hasCampaignId: Boolean(campaignId),
    },
    idempotencyKey: `paywall_viewed:${campaignId ?? "workspace"}:${selectedPlanTier}`,
  }).catch(() => undefined);

  const hasServerPreview = Boolean(campaignId && persistedPreviewDraft);
  const checkoutCampaignId = hasServerPreview ? campaignId : null;
  const backHref = buildHomeHref(checkoutCampaignId);

  return (
    <PageShell className="max-w-[1240px] gap-4 py-5">
      <WizardSteps current="launch" />
      <PageHeader
        eyebrow="Activate"
        title={hasServerPreview ? "Activate the campaign you just built" : "Campaign activation"}
        description={
          hasServerPreview
            ? "Preview stays free. An active subscription is required before this campaign can launch to Meta."
            : "Finish onboarding first so DealFlow can attach checkout to a real campaign preview."
        }
      />

      <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(390px,0.86fr)_minmax(460px,1fr)]">
        <div className="min-w-0 space-y-4 xl:order-2">
          <Card className="p-5 sm:p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Choose launch access</p>
              <h2 className="mt-2 text-2xl font-semibold">Pick how DealFlow should optimize this launch</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                Starter gives you recommended optimizations to approve and apply. Pro adds recommendation-only autonomy checks and richer monitoring while execution stays approval-gated during beta. Paid image or video generation remains credit-gated after activation.
              </p>
            </div>
            <div className="mt-5">
              <PaywallPlanSelector
                campaignId={checkoutCampaignId}
                disabled={!hasServerPreview}
                initialPlanTier={selectablePlanTier}
                launchOverride={billing?.launchOverride === true}
              />
            </div>
          </Card>

          {paymentIssue ? (
            <div className="rounded-[20px] border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
              Stripe reports a payment issue. Update the payment method from Settings to restore live Meta launch access without creating a new checkout.
            </div>
          ) : null}
          {suspended ? (
            <div className="rounded-[20px] border border-rose-400/20 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100">
              Billing is inactive. DealFlow-managed launch, funnel capture, lead alerts, and optimization stay paused until billing is reactivated.
            </div>
          ) : null}
          {(billing?.stripeCustomerId && (paymentIssue || suspended)) ? (
            <Button asChild>
              <Link href="/settings">Open billing settings</Link>
            </Button>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4 xl:order-1">
          {!hasServerPreview ? (
            <Card className="p-5 sm:p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Campaign context needed</p>
              <h2 className="mt-2 text-xl font-semibold">Build the preview before activating</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                Checkout should be tied to a saved campaign. If you arrived here directly, go back through onboarding so the campaignId, plan, and preview package stay connected.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/onboarding">Start onboarding</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/builder">Back to build</Link>
                </Button>
              </div>
            </Card>
          ) : null}

          <PrepaywallCampaignPreviewFromStorage
            campaignId={campaignId}
            selectedPlanTier={selectedPreviewPlanTier}
            fallbackDraft={persistedPreviewDraft}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button asChild variant="secondary">
          <Link href={backHref}>
            Back to build
          </Link>
        </Button>
      </div>
    </PageShell>
  );
}
