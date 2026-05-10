import { PageHeader } from "@/components/app/page-header";
import { CancellationIntentForm } from "@/components/billing/cancellation-intent-form";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { CreditTopUpButton } from "@/components/billing/credit-top-up-button";
import { PortalButton } from "@/components/billing/portal-button";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { getAppContext } from "@/lib/services/app-context";
import { getBillingSummary } from "@/lib/services/billing-service";
import { getCreditSummaryForCurrentUser } from "@/lib/services/credit-service";

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

function getBillingStatusCopy(billing: Awaited<ReturnType<typeof getBillingSummary>> | null) {
  if (!billing) {
    return {
      tone: "neutral",
      title: "Billing not active yet",
      detail: "Activate a subscription before launch, funnel capture, and billing management are available.",
    };
  }

  if (billing.requiresSuspension) {
    return {
      tone: "danger",
      title: "Subscription inactive",
      detail:
        "DealFlow-managed launch, funnel capture, lead alerts, and optimization are paused until billing is reactivated.",
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
      detail: `Access stays active until ${formatPeriodEnd(billing.currentPeriodEnd)}. Stripe Portal remains available for changes or reactivation.`,
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
  const campaignId =
    resolvedSearchParams && typeof resolvedSearchParams.campaignId === "string"
      ? resolvedSearchParams.campaignId
      : undefined;
  const [billing, credits, appContext] = await Promise.all([
    getBillingSummary().catch(() => null),
    getCreditSummaryForCurrentUser().catch(() => null),
    getAppContext().catch(() => null),
  ]);
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
              ["Plan tier", billing?.planTier ?? "starter"],
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
              amountCents={credits?.minimumTopUpCents ?? 2000}
              label={
                credits && credits.balance < 0
                  ? `Add ${credits.formattedMinimumTopUp ?? "$20.00"} credits`
                  : `Add ${credits?.formattedMinimumTopUp ?? "$20.00"} credits`
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
                ["Status", billing?.subscriptionStatus ?? "inactive"],
                ["Billing state", billing?.billingState?.replace(/_/g, " ") ?? "inactive"],
                ["Launch access", billing?.launchAllowed ? "Enabled" : "Not enabled"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[18px] border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </div>
            {billing?.currentPeriodEnd ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Paid-through date: {formatPeriodEnd(billing.currentPeriodEnd)}
              </p>
            ) : null}
          </div>

          <div className={`rounded-[20px] border p-4 text-sm ${statusToneClass(billingStatus.tone)}`}>
            <p className="font-semibold">{billingStatus.title}</p>
            <p className="mt-2 leading-6">{billingStatus.detail}</p>
          </div>

          {billing?.stripeCustomerId ? (
            <div className="space-y-5">
              <PortalButton label="Update payment method" />
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Manage or cancel subscription</p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Cancellation and payment changes happen in Stripe Portal. DealFlow records the reason only so support can reduce failed-payment churn and disputes.
                  </p>
                </div>
                <CancellationIntentForm />
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
