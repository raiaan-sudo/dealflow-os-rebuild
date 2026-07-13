import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { PageHeader } from "@/components/app/page-header";
import { WizardSteps } from "@/components/app/wizard-steps";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { BILLING_PLANS } from "@/lib/billing/plans";
import { getBillingSummary } from "@/lib/services/billing-service";
import { getRequestProductI18n } from "@/lib/i18n/server";

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
  const { t } = await getRequestProductI18n();

  return (
    <PageShell>
      <WizardSteps current="launch" />
      <PageHeader
        eyebrow={t("billing.activateEyebrow")}
        title={t("billing.campaignReady")}
        description={t("billing.paywallDescription")}
      />

      <Card className="p-6 sm:p-8">
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("billing.launchAccess")}</p>
            <h2 className="mt-2 text-2xl font-semibold">{t("billing.activate")}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              {t("billing.paywallBody")}
            </p>
          </div>

          <div className="surface-subtle rounded-[20px] border border-white/10 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("common.plan")}</p>
            <p className="mt-2 text-lg font-semibold">
              {proPlan.name} · {proPlan.priceLabel}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("billing.planIncludes")}
            </p>
          </div>

          {billing?.launchOverride ? (
            <div className="rounded-[20px] border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              Internal admin override is active for this account. Launch is allowed without payment for testing or demos.
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <CheckoutButton />
            <Button asChild variant="secondary">
              <Link href={campaignId ? `/preview?campaignId=${encodeURIComponent(campaignId)}` : "/preview"}>
                {t("billing.backPreview")}
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
