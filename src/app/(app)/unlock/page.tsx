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
  const checkoutOverride = checkoutState === "override" && billing?.launchOverride === true;
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
      ? "Campaign activated"
      : launchAllowed
        ? "Launch access active"
        : "Checkout updated";
  const description = checkoutCancelled
    ? "No payment was completed. Return to Build when you are ready to activate the campaign."
    : checkoutOverride
      ? "Launch access is confirmed. DealFlow is ready to generate the creative test set and continue the campaign path."
      : launchAllowed
        ? "Launch access is confirmed. Continue the campaign path from your Build workspace."
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

  if (launchAllowed && !checkoutOverride && !reconciliationError) {
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
        {checkoutOverride ? (
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            <div className="rounded-[18px] border border-emerald-300/15 bg-emerald-300/[0.055] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/70">Plan</p>
              <p className="mt-2 font-semibold text-foreground">{plan ?? billing?.planTier ?? "pro"}</p>
            </div>
            <div className="rounded-[18px] border border-emerald-300/15 bg-emerald-300/[0.055] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/70">Status</p>
              <p className="mt-2 font-semibold text-foreground">Active</p>
            </div>
            <div className="rounded-[18px] border border-emerald-300/15 bg-emerald-300/[0.055] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/70">Next</p>
              <p className="mt-2 font-semibold text-foreground">Choose creatives</p>
            </div>
          </div>
        ) : (
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
            </p>
          </div>
        )}
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
