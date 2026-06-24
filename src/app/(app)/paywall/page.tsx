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
import { getStripePlanPriceConfiguration } from "@/lib/integrations/stripe/service";
import {
  getPlanPresentationsForPartner,
  SELECTABLE_PLAN_TIERS,
  type SelectablePlanTier,
} from "@/lib/billing/plan-presentation";
import { getBillingSummary, getBillingSummaryForCampaign } from "@/lib/services/billing-service";
import { getAppContext } from "@/lib/services/app-context";
import { recordActivationEventForCurrentUser } from "@/lib/services/activation-telemetry-service";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPartnerPageMetadata } from "@/lib/white-label/metadata";
import { hasPartnerPricingConfiguration, parsePartnerPricingConfig } from "@/lib/white-label/partner-billing-config";
import { resolvePartnerContextFromHeaders } from "@/lib/white-label/resolver";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const partnerContext = await resolvePartnerContextFromHeaders();
  const brandName = partnerContext.branding.brandName;

  return buildPartnerPageMetadata(partnerContext, {
    title: partnerContext.nativeFallback ? "Campaign activation | DealFlow OS" : `${brandName} AI Ads Platform`,
    description: partnerContext.nativeFallback
      ? "Activate DealFlow Operator Launch for your campaign workspace."
      : `Activate ${brandName} AI Ads Platform for your campaign workspace.`,
    fallbackTitle: "Campaign activation | DealFlow OS",
    fallbackDescription: "Activate DealFlow Operator Launch for your campaign workspace.",
  });
}

function buildHomeHref(campaignId: string | null) {
  return campaignId ? `/builder?campaignId=${encodeURIComponent(campaignId)}` : "/onboarding";
}

async function loadPartnerPricingForCurrentWorkspace() {
  const context = await getAppContext().catch(() => null);
  const partnerId = context?.partner?.id ?? null;
  const admin = createAdminClient();

  if (!partnerId || !admin) {
    return null;
  }

  const { data } = await admin
    .from("partner_branding")
    .select("pricing_json")
    .eq("partner_id", partnerId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const pricing = parsePartnerPricingConfig((data as { pricing_json?: unknown } | null)?.pricing_json);
  return hasPartnerPricingConfiguration(pricing) ? pricing : null;
}

function toPreviewCampaignMode(intent: string): PrepaywallCampaignPreviewDraft["campaignMode"] {
  if (intent === "seller" || intent === "investor" || intent === "commercial") {
    return intent;
  }

  return "buyer";
}

async function loadPersistedPreviewDraft(
  campaignId: string | null,
  selectedPlanTier: "performance" | "starter" | "pro",
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
  const requestedPlanTier =
    typeof params.plan === "string" ? normalizeBillingPlanTier(params.plan) : "pro";
  const partnerPricing = await loadPartnerPricingForCurrentWorkspace();
  const planPresentations = getPlanPresentationsForPartner(partnerPricing);
  const availablePlanTiers: readonly SelectablePlanTier[] = SELECTABLE_PLAN_TIERS.filter((tier) =>
    Boolean(getStripePlanPriceConfiguration(tier, partnerPricing) ?? getStripePlanPriceConfiguration(tier, null)),
  );
  const displayedPlanTiers = availablePlanTiers.length > 0 ? availablePlanTiers : SELECTABLE_PLAN_TIERS;
  const selectedPlanTier = availablePlanTiers.includes(requestedPlanTier as SelectablePlanTier)
    ? requestedPlanTier
    : "pro";
  const billing = campaignId
    ? await getBillingSummaryForCampaign(campaignId).catch(() => getBillingSummary().catch(() => null))
    : await getBillingSummary().catch(() => null);
  const selectedPreviewPlanTier =
    selectedPlanTier === "pro" ? "pro" : selectedPlanTier === "performance" ? "performance" : "starter";
  const selectablePlanTier = selectedPreviewPlanTier;
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
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch access</p>
              <h2 className="mt-2 text-2xl font-semibold">Activate Operator Launch</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                New workspaces use one launch plan: $297/month for the campaign workspace, readiness checks,
                creative review, and operator-guided launch flow. Archived Performance and Starter plans remain
                available only to users already on them.
              </p>
            </div>
            <div className="mt-5">
              <PaywallPlanSelector
                campaignId={checkoutCampaignId}
                disabled={!hasServerPreview || availablePlanTiers.length === 0}
                initialPlanTier={selectablePlanTier}
                availablePlanTiers={displayedPlanTiers}
                launchOverride={billing?.launchOverride === true}
                planPresentations={planPresentations}
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
