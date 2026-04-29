import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getBillingSummary,
  reconcileBillingCheckoutSuccess,
} from "@/lib/services/billing-service";

export default async function UnlockPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const checkoutState =
    typeof params.checkout === "string" && params.checkout.length > 0 ? params.checkout : null;
  const checkoutSessionId =
    typeof params.session_id === "string" && params.session_id.length > 0 ? params.session_id : null;
  const reconciliationError =
    checkoutState === "success" && checkoutSessionId
      ? await reconcileBillingCheckoutSuccess(checkoutSessionId)
          .then(() => null)
          .catch(() => "checkout_verification_failed")
      : null;
  const billing = await getBillingSummary().catch(() => null);
  const launchAllowed = billing?.launchAllowed ?? false;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Billing"
        title={launchAllowed ? "Launch access active" : "Checkout updated"}
        description={
          launchAllowed
            ? "This workspace can now launch campaigns to Meta."
            : checkoutState === "cancelled"
              ? "Checkout was cancelled before activation completed."
              : reconciliationError
                ? "Checkout returned successfully, but we could not verify the subscription yet. Refresh after Stripe finishes syncing."
              : "Billing is still processing. Refresh after Stripe finishes syncing the subscription."
        }
      />

      <Card className="p-6 sm:p-8">
        <div className="space-y-4 text-sm text-muted-foreground">
          {reconciliationError ? (
            <p>
              Verification status: Stripe has not confirmed this subscription for the workspace yet.
            </p>
          ) : null}
          <p>Plan: {billing?.planTier ?? "starter"}</p>
          <p>Subscription status: {billing?.subscriptionStatus ?? "inactive"}</p>
          <p>
            Launch access: {launchAllowed ? "enabled" : "not enabled yet"}
            {billing?.launchOverride ? " (admin override)" : ""}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/launch">Go to launch</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/paywall">View billing options</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
