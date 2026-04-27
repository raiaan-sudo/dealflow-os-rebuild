import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { BILLING_PLANS } from "@/lib/billing/plans";
import { getBillingSummary } from "@/lib/services/billing-service";

export default async function PaywallPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0 ? params.campaignId : null;
  const billing = await getBillingSummary().catch(() => null);
  const proPlan = BILLING_PLANS.pro;

  return (
    <div className="space-y-8">
      <WizardSteps current="launch" />
      <PageHeader
        eyebrow="Activate"
        title="Your campaign is ready"
        description="Preview stays free. An active subscription is required before this campaign can launch to Meta."
      />

      <Card className="p-6 sm:p-8">
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Launch access</p>
            <h2 className="mt-2 text-2xl font-semibold">Activate to launch</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              You can keep reviewing the campaign before payment. Live Meta launch is blocked until
              this workspace has an active {proPlan.name} subscription or an internal admin override.
            </p>
          </div>

          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Plan</p>
            <p className="mt-2 text-lg font-semibold">
              {proPlan.name} · {proPlan.priceLabel}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Includes live Meta launch access for this workspace.
            </p>
          </div>

          {billing?.launchOverride ? (
            <div className="rounded-[20px] border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              Internal admin override is active for this account. Launch is allowed without payment for testing or demos.
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <CheckoutButton planTier="pro" />
            <Button asChild variant="secondary">
              <Link href={campaignId ? `/preview?campaignId=${encodeURIComponent(campaignId)}` : "/preview"}>
                Back to preview
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
