import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import {
  getBillingSummary,
  reconcileBillingCheckoutSuccess,
} from "@/lib/services/billing-service";
import { recordActivationEventForCurrentUser } from "@/lib/services/activation-telemetry-service";

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
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0 ? params.campaignId : null;
  const plan =
    typeof params.plan === "string" && params.plan.length > 0 ? params.plan : null;
  const reconciliationError =
    checkoutState === "success" && checkoutSessionId
      ? await reconcileBillingCheckoutSuccess(checkoutSessionId)
          .then(() => null)
          .catch(() => "checkout_verification_failed")
      : null;
  const billing = await getBillingSummary().catch(() => null);
  const launchAllowed = billing?.launchAllowed ?? false;
  const checkoutCancelled = checkoutState === "cancelled";
  const checkoutOverride = checkoutState === "override";
  const dashboardHref = campaignId
    ? `/dashboard?campaignId=${encodeURIComponent(campaignId)}`
    : plan
      ? `/dashboard?plan=${encodeURIComponent(plan)}`
      : "/dashboard";
  const launchHref = campaignId ? `/launch?campaignId=${encodeURIComponent(campaignId)}` : "/launch";
  const paywallHref = `/paywall${campaignId ? `?campaignId=${encodeURIComponent(campaignId)}${plan ? `&plan=${encodeURIComponent(plan)}` : ""}` : plan ? `?plan=${encodeURIComponent(plan)}` : ""}`;
  const buildHref = campaignId
    ? `/builder?campaignId=${encodeURIComponent(campaignId)}`
    : "/builder";
  const creativesHref = campaignId
    ? `/build/creatives?campaignId=${encodeURIComponent(campaignId)}`
    : buildHref;
  const title = checkoutCancelled
    ? "Checkout cancelled"
    : checkoutOverride
      ? "Billing override active"
      : launchAllowed
        ? "Launch access active"
        : "Checkout updated";
  const description = checkoutCancelled
    ? "No payment was completed. Return to activation when you are ready, or keep reviewing the campaign package."
    : checkoutOverride
      ? "This test workspace can continue without Stripe payment. Use it to finish the owner review path."
      : launchAllowed
        ? "This workspace can now preview the saved campaign and continue toward Meta connection."
        : reconciliationError
          ? "Checkout returned successfully, but we could not verify the subscription yet. Refresh after Stripe finishes syncing."
          : "Billing is still processing. Refresh after Stripe finishes syncing the subscription.";

  if (checkoutState === "success" && checkoutSessionId && !reconciliationError) {
    await recordActivationEventForCurrentUser({
      eventName: "checkout_completed_or_reconciled",
      campaignId,
      source: "unlock_page",
      metadata: {
        route: "unlock",
        planTier: billing?.planTier ?? plan ?? "unknown",
        launchAllowed,
      },
      idempotencyKey: `checkout_completed_or_reconciled:${checkoutSessionId}`,
    }).catch(() => undefined);
  }

  if (checkoutCancelled) {
    redirect(buildHref);
  }

  if ((checkoutOverride || launchAllowed) && !reconciliationError) {
    redirect(creativesHref);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Billing"
        title={title}
        description={description}
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
          <p>Billing state: {billing?.billingState?.replace(/_/g, " ") ?? "inactive"}</p>
          {billing?.billingState === "payment_issue" ? (
            <p>Payment attention: update the payment method in Settings before attempting a new launch.</p>
          ) : null}
          {billing?.cancelAtPeriodEnd ? (
            <p>Cancellation: access remains active until the paid period ends.</p>
          ) : null}
          <p>
            Launch access: {launchAllowed ? "enabled" : "not enabled yet"}
            {billing?.launchOverride ? " (billing override)" : ""}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {checkoutCancelled ? (
            <>
              <Button asChild>
                <Link href={paywallHref}>Return to activation</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={buildHref}>Back to build</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild>
                <Link href={creativesHref}>Choose creatives</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={buildHref}>Back to build</Link>
              </Button>
            </>
          )}
        </div>
      </Card>
    </PageShell>
  );
}
