import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { CheckoutButton } from "@/components/billing/checkout-button";
import {
  PrepaywallCampaignPreviewFromStorage,
  type PrepaywallCampaignPreviewDraft,
} from "@/components/onboarding/prepaywall-campaign-preview";
import { BILLING_PLANS, normalizeBillingPlanTier } from "@/lib/billing/plans";
import { getBillingSummary } from "@/lib/services/billing-service";
import { recordActivationEventForCurrentUser } from "@/lib/services/activation-telemetry-service";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";

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
  const billing = await getBillingSummary().catch(() => null);
  const selectedPlan = BILLING_PLANS[selectedPlanTier];
  const selectedPreviewPlanTier = selectedPlanTier === "pro" ? "pro" : "starter";
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

  return (
    <PageShell className="max-w-[1360px]">
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

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="min-w-0 space-y-4">
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
                  <Link href="/preview">Back to preview</Link>
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

        <Card className="p-5 sm:p-6 xl:sticky xl:top-6">
          <div className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch access</p>
              <h2 className="mt-2 text-2xl font-semibold">Activate to launch</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                You can keep reviewing before payment. Live Meta launch is blocked until this workspace has an active {selectedPlan.name} subscription or a billing override.
              </p>
            </div>

            <div className="surface-subtle rounded-[20px] border border-white/10 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Plan</p>
              <p className="mt-2 text-lg font-semibold">
                {selectedPlan.name} · {selectedPlan.priceLabel}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Includes live Meta launch access for this workspace.
                {selectedPlanTier === "starter"
                  ? " Starter provides guided recommendations and launch access while keeping autonomous execution manual."
                  : " Pro adds autonomous operator controls behind launch guardrails."}
              </p>
            </div>

            <div className="rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.045] p-4 text-sm leading-6 text-cyan-50/80">
              Unlocks campaign build, funnel publishing, static creative generation, Meta connection and launch path. Paid AI image/video generation still uses credits after checkout.
            </div>

            {billing?.launchOverride ? (
              <div className="rounded-[20px] border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                Billing override is active for this account. Launch is allowed without payment for testing or demos.
              </div>
            ) : null}
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

            <div className="flex flex-col gap-3">
              {billing?.stripeCustomerId && (paymentIssue || suspended) ? (
                <Button asChild>
                  <Link href="/settings">Open billing settings</Link>
                </Button>
              ) : (
                hasServerPreview ? (
                  <CheckoutButton campaignId={checkoutCampaignId} planTier={selectedPlanTier} />
                ) : (
                  <Button type="button" disabled>
                    Build preview first
                  </Button>
                )
              )}
              <Button asChild variant="secondary">
                <Link href={checkoutCampaignId ? `/preview?campaignId=${encodeURIComponent(checkoutCampaignId)}` : "/preview"}>
                  Back to preview
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
