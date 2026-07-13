import { PageHeader } from "@/components/app/page-header";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { CreditTopUpButton } from "@/components/billing/credit-top-up-button";
import { PortalButton } from "@/components/billing/portal-button";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { getBillingSummary } from "@/lib/services/billing-service";
import { getCreditSummaryForCurrentUser } from "@/lib/services/credit-service";

export default async function SettingsPage() {
  const [billing, credits] = await Promise.all([
    getBillingSummary().catch(() => null),
    getCreditSummaryForCurrentUser().catch(() => null),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Workspace configuration is currently managed through onboarding, integrations, and billing flows."
        guidance="This page exists so the workspace settings entry point never dead-ends during launch validation."
      />

      <Card className="p-5 sm:p-7">
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">No direct settings changes are required right now.</p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Use Build to update campaign inputs, Go Live to connect Meta assets, and the billing gate to manage
            launch access. Operator-only launch visibility remains available in the internal monitor.
          </p>
        </div>
      </Card>

      <Card className="p-5 sm:p-7">
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Credits</p>
            <h2 className="mt-2 text-xl font-semibold">Generation credits</h2>
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <p>Balance: {credits?.formattedBalance ?? "$0.00"}</p>
              <p>Image generation: {credits ? `$${(credits.imageGenerationCostCents / 100).toFixed(2)}` : "$1.00"} per asset</p>
              <p>Video generation: {credits ? `$${(credits.videoGenerationCostCents / 100).toFixed(2)}` : "$5.00"} per asset</p>
            </div>
          </div>
          <CreditTopUpButton
            amountCents={credits?.minimumTopUpCents ?? 2500}
            label={`Add ${credits?.formattedMinimumTopUp ?? "$25.00"} credits`}
            disabled={!billing?.commerciallyActivated || !billing.launchAllowed}
          />
          {!billing?.commerciallyActivated || !billing.launchAllowed ? (
            <p className="text-sm leading-6 text-muted-foreground">
              Activate the $297 subscription before adding generation credits.
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="p-5 sm:p-7">
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Billing</p>
            <h2 className="mt-2 text-xl font-semibold">Subscription management</h2>
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <p>Plan: {billing?.commerciallyActivated ? billing.planTier : "Not activated"}</p>
              <p>Status: {billing?.subscriptionStatus ?? "inactive"}</p>
              <p>Launch access: {billing?.launchAllowed ? "enabled" : "not enabled"}</p>
            </div>
          </div>

          {billing?.stripeCustomerId ? (
            <PortalButton />
          ) : (
            <div className="space-y-3">
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Activate a subscription before opening Stripe-hosted billing management for this workspace.
              </p>
              <CheckoutButton label="Activate billing" />
            </div>
          )}
        </div>
      </Card>
    </PageShell>
  );
}
