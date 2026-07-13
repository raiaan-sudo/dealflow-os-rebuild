import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import {
  getBillingSummary,
  reconcileBillingCheckoutSuccess,
} from "@/lib/services/billing-service";
import { getRequestProductI18n } from "@/lib/i18n/server";

export default async function UnlockPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getRequestProductI18n();
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
    <PageShell>
      <PageHeader
        eyebrow={t("unlock.eyebrow")}
        title={launchAllowed ? t("unlock.accessActive") : t("unlock.checkoutUpdated")}
        description={
          launchAllowed
            ? t("unlock.activeDescription")
            : checkoutState === "cancelled"
              ? t("unlock.cancelledDescription")
              : reconciliationError
                ? t("unlock.unverifiedDescription")
              : t("unlock.processingDescription")
        }
      />

      <Card className="p-6 sm:p-8">
        <div className="space-y-4 text-sm text-muted-foreground">
          {reconciliationError ? (
            <p>
              {t("unlock.verificationPending")}
            </p>
          ) : null}
          <p>{t("unlock.plan")}: {billing?.commerciallyActivated ? billing.planTier : t("unlock.notActivated")}</p>
          <p>{t("unlock.subscriptionStatus")}: {billing?.subscriptionStatus ?? t("unlock.inactive")}</p>
          <p>
            {t("unlock.launchAccess")}: {launchAllowed ? t("unlock.enabled") : t("unlock.notEnabled")}
            {billing?.launchOverride ? ` (${t("unlock.adminOverride")})` : ""}
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/launch">{t("unlock.goLaunch")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/paywall">{t("unlock.billingOptions")}</Link>
          </Button>
        </div>
      </Card>
    </PageShell>
  );
}
