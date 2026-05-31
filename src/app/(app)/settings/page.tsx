import { PageHeader } from "@/components/app/page-header";
import { CancellationIntentForm } from "@/components/billing/cancellation-intent-form";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { CreditTopUpButton } from "@/components/billing/credit-top-up-button";
import { PortalButton } from "@/components/billing/portal-button";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { getAppContext } from "@/lib/services/app-context";
import { getBillingSummary, getBillingSummaryForCampaign } from "@/lib/services/billing-service";
import { getCreditSummaryForCurrentUser } from "@/lib/services/credit-service";
import { getPerformanceLeadUsageSummary } from "@/lib/services/performance-lead-billing-service";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";

type SettingsBillingSummary =
  | Awaited<ReturnType<typeof getBillingSummary>>
  | Awaited<ReturnType<typeof getBillingSummaryForCampaign>>;

function formatPeriodEnd(value: string | null | undefined) {
  if (!value) {
    return "the current billing period";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "the current billing period";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getBillingStatusCopy(billing: SettingsBillingSummary | null) {
  if (!billing) {
    return {
      tone: "neutral",
      title: "Billing not active yet",
      detail: "Activate a subscription before launch, funnel capture, and billing management are available.",
    };
  }

  if (billing.launchOverrideSource === "qa_billing_acceptance") {
    return {
      tone: "success",
      title: "Owner/test billing accepted",
      detail:
        "This campaign is using the scoped owner/test billing acceptance override. Stripe subscription status is unchanged; normal customers still need active billing.",
    };
  }

  if (billing.launchOverrideSource === "billing_admin_email") {
    return {
      tone: "success",
      title: "Internal billing override active",
      detail:
        "Launch access is enabled by an explicit internal billing override. Stripe subscription status is unchanged; normal customers still need active billing.",
    };
  }

  if (billing.requiresSuspension) {
    return {
      tone: "danger",
      title: "Subscription inactive",
      detail:
        "DealFlow-managed campaign assets have been removed or are being removed. Launch, funnel capture, lead alerts, and optimization stay unavailable until billing is reactivated.",
    };
  }

  if (billing.billingState === "payment_issue") {
    return {
      tone: "warning",
      title: "Payment method needs attention",
      detail:
        "Existing funnel and alert operations remain in warning mode, but new Meta launches are blocked until the payment issue is resolved.",
    };
  }

  if (billing.cancelAtPeriodEnd) {
    return {
      tone: "warning",
      title: "Subscription scheduled to cancel",
      detail: `Access remains active until ${formatPeriodEnd(billing.currentPeriodEnd)}. DealFlow-created campaign assets will be removed when access ends unless billing is reactivated.`,
    };
  }

  if (billing.subscriptionStatus === "trialing") {
    const trialEnd = billing.currentPeriodEnd ? ` until ${formatPeriodEnd(billing.currentPeriodEnd)}` : "";

    return {
      tone: "success",
      title: "Free trial active",
      detail: `Trial access is enabled for this workspace${trialEnd}. Stripe subscription status is trialing, not paid active.`,
    };
  }

  if (billing.launchAllowed) {
    return {
      tone: "success",
      title: "Subscription active",
      detail: "Launch access is enabled for this workspace.",
    };
  }

  return {
    tone: "neutral",
    title: "Launch access not active",
    detail: "Activate billing to unlock live Meta launch access.",
  };
}

function formatBillingStateLabel(billing: SettingsBillingSummary | null) {
  if (!billing) {
    return "inactive";
  }

  if (billing.subscriptionStatus === "trialing" && billing.billingState === "active") {
    return "trialing";
  }

  return billing.billingState?.replace(/_/g, " ") ?? "inactive";
}

function formatCurrencyFromCents(value: number) {
  return `$${(value / 100).toFixed(2)}`;
}

function statusToneClass(tone: string) {
  if (tone === "danger") {
    return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  }
  if (tone === "warning") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  }
  if (tone === "success") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  }
  return "border-white/10 bg-white/[0.04] text-muted-foreground";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedCampaignId =
    resolvedSearchParams && typeof resolvedSearchParams.campaignId === "string"
      ? resolvedSearchParams.campaignId
      : undefined;
  const resolvedCampaign = requestedCampaignId
    ? await resolveActiveCampaignRecord(requestedCampaignId).catch(() => null)
    : null;
  const campaignId = resolvedCampaign?.record?.campaign.id;
  const [billing, credits, appContext] = await Promise.all([
    campaignId
      ? getBillingSummaryForCampaign(campaignId).catch(() => null)
      : getBillingSummary().catch(() => null),
    getCreditSummaryForCurrentUser().catch(() => null),
    getAppContext().catch(() => null),
  ]);
  const performanceUsage =
    billing?.planTier === "performance" && appContext?.organization.id
      ? await getPerformanceLeadUsageSummary(appContext.organization.id).catch(() => null)
      : null;
  const billingStatus = getBillingStatusCopy(billing);
  const accountEmail = appContext?.profile?.email ?? appContext?.user.email ?? "Not available";
  const accountName =
    appContext?.profile?.full_name ??
    appContext?.user.email?.split("@")[0] ??
    "Workspace user";
  const workspaceName =
    appContext?.organization.name ??
    appContext?.businessProfile?.business_name ??
    "DealFlow workspace";
  const launchAccessLabel = billing?.launchAllowed
    ? billing.launchOverrideSource === "qa_billing_acceptance"
      ? "Enabled (owner/test override)"
      : billing.launchOverrideSource === "billing_admin_email"
        ? "Enabled (internal override)"
        : "Enabled"
    : "Not enabled";
  const billingPlanLabel = billing?.partnerPlanLabel ?? billing?.planTier ?? "starter";
  const billingProductLabel = billing?.partnerProductName ?? "DealFlow";

  return (
    <PageShell className="max-w-[1280px]">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage account identity, generation credits, subscription state, and payment settings from one workspace control panel."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Account</p>
          <h2 className="mt-2 text-xl font-semibold">Profile and workspace</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["Name", accountName],
              ["Email", accountEmail],
              ["Workspace", workspaceName],
              ["Plan", billingPlanLabel],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-[18px] border border-white/10 bg-white/[0.035] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                <p className="mt-2 truncate text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Campaign-facing agent name, brokerage, and phone are updated in the Build flow so lead alerts stay tied to the active campaign.
          </p>
        </Card>

        <Card className="p-5 sm:p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Credits</p>
            <h2 className="mt-2 text-xl font-semibold">Generation credits</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[18px] border border-cyan-300/16 bg-cyan-300/[0.055] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/72">Balance</p>
                <p className="mt-2 text-2xl font-semibold text-white">{credits?.formattedBalance ?? "$0.00"}</p>
                {credits?.creditOverride ? (
                  <p className="mt-2 text-xs font-semibold text-emerald-100">Billing override active</p>
                ) : credits && credits.balance < 0 ? (
                  <p className="mt-2 text-xs font-semibold text-amber-100">
                    {credits.formattedBalanceDue} due on next top-up
                  </p>
                ) : null}
              </div>
              <div className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Images</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {credits ? `$${(credits.imageGenerationCostCents / 100).toFixed(2)}` : "$1.00"} / asset
                </p>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">UGC video</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {credits ? `$${(credits.videoGenerationCostCents / 100).toFixed(2)}` : "$5.00"} / asset
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5">
            <CreditTopUpButton
              amountCents={credits?.minimumTopUpCents ?? 1000}
              label={
                credits && credits.balance < 0
                  ? `Add ${credits.formattedMinimumTopUp ?? "$10.00"} credits`
                  : `Add ${credits?.formattedMinimumTopUp ?? "$10.00"} credits`
              }
            />
          </div>
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Billing</p>
            <h2 className="mt-2 text-xl font-semibold">Subscription management</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Plan", billing?.planTier ?? "starter"],
                ["Product", billingProductLabel],
                ["Status", billing?.subscriptionStatus ?? "inactive"],
                ["Billing state", formatBillingStateLabel(billing)],
                ["Launch access", launchAccessLabel],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </div>
            {billing?.currentPeriodEnd ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {billing.subscriptionStatus === "trialing" ? "Trial ends" : "Paid-through date"}:{" "}
                {formatPeriodEnd(billing.currentPeriodEnd)}
              </p>
            ) : null}
          </div>

          <div className={`rounded-[20px] border p-4 text-sm ${statusToneClass(billingStatus.tone)}`}>
            <p className="font-semibold">{billingStatus.title}</p>
            <p className="mt-2 leading-6">{billingStatus.detail}</p>
          </div>

          {billing?.planTier === "performance" ? (
            <div className="rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.055] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/75">Performance usage</p>
              <h3 className="mt-2 text-lg font-semibold text-white">$97/mo base + $3 per qualified lead</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Billable leads", String(performanceUsage?.billableLeadCount ?? 0)],
                  ["Lead usage estimate", formatCurrencyFromCents(performanceUsage?.estimatedLeadChargesCents ?? 0)],
                  ["Base subscription", formatCurrencyFromCents(performanceUsage?.baseSubscriptionCents ?? 9700)],
                  [
                    "Current estimate",
                    formatCurrencyFromCents(
                      (performanceUsage?.baseSubscriptionCents ?? 9700) +
                        (performanceUsage?.estimatedLeadChargesCents ?? 0),
                    ),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[16px] border border-white/10 bg-white/[0.035] p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-cyan-50/80">
                Spam, duplicate, test, invalid, internal, and imported leads are skipped. Usage appears on the Stripe invoice after DealFlow reports the metered lead event.
              </p>
              {performanceUsage?.failedLeadCount || performanceUsage?.pendingLeadCount ? (
                <p className="mt-3 text-sm font-semibold text-amber-100">
                  Usage reporting needs review: {performanceUsage.pendingLeadCount} pending, {performanceUsage.failedLeadCount} failed.
                </p>
              ) : null}
              {performanceUsage?.latestReportedAt ? (
                <p className="mt-2 text-xs text-cyan-100/70">
                  Last reported usage: {formatPeriodEnd(performanceUsage.latestReportedAt)}
                </p>
              ) : null}
            </div>
          ) : null}

          {billing?.stripeCustomerId ? (
            <div className="space-y-5">
              <PortalButton label="Update payment method" />
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Manage or cancel subscription</p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Cancellation and payment changes happen in Stripe Portal. DealFlow records the reason only so support can reduce failed-payment churn and disputes. If the issue is lead quality, setup, or a temporary pause, leave a note here before opening Stripe so support can help recover the workspace.
                  </p>
                </div>
                <CancellationIntentForm />
                <div className="rounded-[20px] border border-cyan-300/16 bg-cyan-300/[0.055] p-4 text-sm leading-6 text-cyan-100">
                  Need help before cancelling? Keep the subscription active and contact support with the campaign name, billing email, and what outcome you expected. Stripe Portal is still the only place to cancel or reactivate billing.
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Activate a subscription before opening Stripe-hosted billing management for this workspace.
              </p>
              <CheckoutButton planTier="pro" label="Activate billing" campaignId={campaignId} />
            </div>
          )}
        </div>
      </Card>
    </PageShell>
  );
}
