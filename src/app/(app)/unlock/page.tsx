import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import {
  getBillingSummary,
  getBillingSummaryForCampaign,
  reconcileBillingCheckoutSuccess,
} from "@/lib/services/billing-service";
import { recordActivationEventForCurrentUser } from "@/lib/services/activation-telemetry-service";
import {
  formatCreditCurrency,
  WELCOME_GENERATION_CREDIT_CENTS,
} from "@/lib/services/credit-service";
import { ensureStaticCreativeRenderQueuedForCampaign } from "@/lib/services/static-creative-render-queue-service";

function formatPlanName(value: string | null | undefined) {
  const normalized = (value ?? "pro").trim().toLowerCase();

  if (normalized === "starter") {
    return "Starter";
  }

  if (normalized === "growth") {
    return "Growth";
  }

  return "Pro";
}

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
  const billing = campaignId
    ? await getBillingSummaryForCampaign(campaignId).catch(() => getBillingSummary().catch(() => null))
    : await getBillingSummary().catch(() => null);
  const launchAllowed = billing?.launchAllowed ?? false;
  const checkoutCancelled = checkoutState === "cancelled";
  const checkoutOverride = checkoutState === "override" && billing?.launchOverride === true;
  const paidCheckoutActivated = checkoutState === "success" && launchAllowed && !reconciliationError;
  const activatedByCheckout =
    checkoutOverride || paidCheckoutActivated;
  const activatedPlanName = formatPlanName(plan ?? billing?.planTier);
  const activeCampaign = campaignId
    ? await resolveActiveCampaignRecord(campaignId).catch(() => null)
    : null;
  const staticCreativeCount = activeCampaign?.record?.creatives.staticAds.length ?? 0;
  const videoConceptCount = activeCampaign?.record?.creatives.videoAds.length ?? 0;
  const hasStaticCreatives = staticCreativeCount > 0;
  const paywallHref = `/paywall${campaignId ? `?campaignId=${encodeURIComponent(campaignId)}${plan ? `&plan=${encodeURIComponent(plan)}` : ""}` : plan ? `?plan=${encodeURIComponent(plan)}` : ""}`;
  const buildHref = campaignId
    ? `/builder?campaignId=${encodeURIComponent(campaignId)}`
    : "/builder";
  const creativesHref = campaignId
    ? `/build/creatives?campaignId=${encodeURIComponent(campaignId)}`
    : buildHref;
  const primaryCreativeLabel = hasStaticCreatives ? "Choose creative test set" : "Generate creatives";
  const title = checkoutCancelled
    ? "Checkout cancelled"
    : activatedByCheckout
      ? `Welcome to DealFlow OS ${activatedPlanName}`
      : launchAllowed
        ? "Launch access active"
        : "Checkout updated";
  const description = checkoutCancelled
    ? "No payment was completed and nothing was launched. You can return to activation, review the campaign, or keep building before trying again."
    : activatedByCheckout
      ? "Your campaign workspace is active. DealFlow is ready to prepare the creative test set and move you into final review."
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

  if (!checkoutCancelled && campaignId && launchAllowed && !reconciliationError) {
    await ensureStaticCreativeRenderQueuedForCampaign({
      campaignId,
      reason: activatedByCheckout ? "checkout_success" : "subscription_active",
      accessAlreadyConfirmed: true,
    }).catch(() => undefined);
  }

  if (!checkoutCancelled && launchAllowed && !activatedByCheckout && !reconciliationError) {
    redirect(creativesHref);
  }

  return (
    <PageShell className="max-w-[1180px] py-8">
      <PageHeader
        eyebrow={activatedByCheckout ? "Welcome" : "Billing"}
        title={title}
        description={description}
        guidance={activatedByCheckout ? "Next, DealFlow turns the campaign you just built into a creative test set." : undefined}
      />

      <Card className="p-6 sm:p-8">
        {checkoutCancelled ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-w-0 rounded-[26px] border border-amber-300/16 bg-amber-300/[0.055] p-5 sm:p-6">
              <StatusPill tone="warning">Not activated</StatusPill>
              <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                Checkout was cancelled before payment.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Your campaign draft is still available. DealFlow did not activate launch access, generate new paid media from this page, or create any Meta campaign objects.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  "Campaign draft preserved",
                  "No subscription change confirmed",
                  "No Meta launch attempted",
                  "Activation can be retried",
                ].map((item) => (
                  <div
                    className="flex min-w-0 items-center gap-3 rounded-[18px] border border-white/10 bg-black/18 p-3 text-sm font-medium text-foreground"
                    key={item}
                  >
                    <CheckCircle2 className="size-4 shrink-0 text-amber-100" />
                    <span className="min-w-0 line-clamp-1">{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <aside className="min-w-0 rounded-[26px] border border-white/10 bg-black/18 p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recovery</p>
              <h3 className="mt-3 text-xl font-semibold text-foreground">Continue when you are ready</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Return to activation to complete checkout, or go back to Build if you want to adjust the campaign first.
              </p>
              <div className="mt-5 flex flex-col gap-3">
                <Button asChild size="lg">
                  <Link href={paywallHref}>Return to activation</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href={buildHref}>Back to Build</Link>
                </Button>
              </div>
            </aside>
          </div>
        ) : activatedByCheckout ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-w-0 rounded-[26px] border border-cyan-300/16 bg-cyan-300/[0.055] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <StatusPill tone="success">Activated</StatusPill>
                  <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    Your campaign workspace is live.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                    DealFlow has the offer, market, audience, funnel, and launch path. The next step is the creative test set that will carry this campaign into review.
                  </p>
                </div>
                <div className="grid size-14 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                  <Sparkles className="size-6" />
                </div>
              </div>

              {paidCheckoutActivated ? (
                <div className="mt-5 rounded-[20px] border border-emerald-300/18 bg-emerald-300/[0.07] p-4">
                  <p className="text-sm font-semibold text-emerald-100">
                    {formatCreditCurrency(WELCOME_GENERATION_CREDIT_CENTS)} in generation credits added
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    We added the first creative top-up so this campaign can start rendering right away. Future paid renders use your available credit balance.
                  </p>
                </div>
              ) : null}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  "Campaign saved",
                  `${activatedPlanName} access active`,
                  "Funnel ready",
                  hasStaticCreatives ? `${staticCreativeCount} static creatives ready` : "Creative set ready to generate",
                  videoConceptCount > 0 ? `${videoConceptCount} video concepts prepared` : "Video concepts prepared after creative generation",
                  "Launch review next",
                ].map((item) => (
                  <div
                    className="flex min-w-0 items-center gap-3 rounded-[18px] border border-white/10 bg-black/18 p-3 text-sm font-medium text-foreground"
                    key={item}
                  >
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-200" />
                    <span className="min-w-0 line-clamp-1">{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <aside className="min-w-0 rounded-[26px] border border-white/10 bg-black/18 p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Next step</p>
              <h3 className="mt-3 text-xl font-semibold text-foreground">
                {hasStaticCreatives ? "Choose the creative test set" : "Generate your creatives"}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {hasStaticCreatives
                  ? "Pick the static ads DealFlow should carry into final preview."
                  : "Prepare static ads, copy angles, and video concepts from the campaign you just built."}
              </p>
              <div className="mt-5 flex flex-col gap-3">
                <Button asChild size="lg">
                  <Link href={creativesHref}>{primaryCreativeLabel}</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href={buildHref}>Back to Build</Link>
                </Button>
              </div>
            </aside>
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
                <Link href={creativesHref}>{primaryCreativeLabel}</Link>
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
