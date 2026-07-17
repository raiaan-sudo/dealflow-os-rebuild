import { PageHeader } from "@/components/app/page-header";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { CreditTopUpButton } from "@/components/billing/credit-top-up-button";
import { PortalButton } from "@/components/billing/portal-button";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { AccountDeletionCard } from "@/components/settings/account-deletion-card";
import { PrivacyRequestCard } from "@/components/settings/privacy-request-card";
import { getBillingSummary } from "@/lib/services/billing-service";
import { getCreditSummaryForCurrentUser } from "@/lib/services/credit-service";
import { getRequestProductI18n } from "@/lib/i18n/server";

export default async function SettingsPage() {
  const { currency, dateTime, t } = await getRequestProductI18n();
  const [billing, credits] = await Promise.all([
    getBillingSummary().catch(() => null),
    getCreditSummaryForCurrentUser().catch(() => null),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow={t("settings.workspace")}
        title={t("settings.title")}
        description={t("settings.description")}
        guidance={t("settings.configurationBody")}
      />

      <Card className="p-5 sm:p-7">
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{t("settings.noChanges")}</p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("settings.configurationBody")}
          </p>
        </div>
      </Card>

      <Card className="p-5 sm:p-7">
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("billing.credits")}</p>
            <h2 className="mt-2 text-xl font-semibold">{t("billing.generationCredits")}</h2>
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <p>{t("settings.availableBalance")}: {currency((credits?.availableBalanceCents ?? credits?.balance ?? 0) / 100, "USD")}</p>
              <p>
                {t("settings.reservedBalance")}: {credits?.reservationStatus === "complete"
                  ? currency((credits.reservedBalanceCents ?? 0) / 100, "USD")
                  : t("settings.balanceUnavailable")}
              </p>
              <p>{t("settings.imageCost")}: {currency((credits?.imageGenerationCostCents ?? 100) / 100, "USD")} {t("settings.perAsset")}</p>
              <p>{t("settings.videoCost")}: {currency((credits?.videoGenerationCostCents ?? 500) / 100, "USD")} {t("settings.perAsset")}</p>
            </div>
          </div>
          <CreditTopUpButton
            amountCents={credits?.minimumTopUpCents ?? 2500}
            minimumAmountCents={credits?.minimumTopUpCents ?? 2500}
            maximumAmountCents={credits?.maximumTopUpCents ?? 100000}
            allowAmountSelection
            disabled={!billing?.commerciallyActivated || !billing.launchAllowed}
          />
          {!billing?.commerciallyActivated || !billing.launchAllowed ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {t("settings.activateCredits")}
            </p>
          ) : null}

          {credits?.activity?.length ? (
            <div className="border-t border-white/8 pt-5">
              <h3 className="text-sm font-semibold text-foreground">{t("billing.creditActivity")}</h3>
              <ul className="mt-3 divide-y divide-white/8" aria-label={t("billing.creditActivity")}>
                {credits.activity.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-foreground">
                        {entry.deltaCents >= 0 ? t("billing.creditAdded") : t("billing.creditUsed")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.reason.replaceAll("_", " ")} · {dateTime(entry.createdAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <p className={entry.deltaCents >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-foreground"}>
                      {entry.deltaCents >= 0 ? "+" : "−"}{currency(Math.abs(entry.deltaCents) / 100, "USD")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="p-5 sm:p-7">
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("billing.billing")}</p>
            <h2 className="mt-2 text-xl font-semibold">{t("billing.subscription")}</h2>
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <p>{t("settings.plan")}: {billing?.commerciallyActivated ? billing.planTier : t("settings.notActivated")}</p>
              <p>{t("common.status")}: {billing?.subscriptionStatus ?? t("settings.notActivated")}</p>
              <p>{t("settings.launchAccess")}: {billing?.launchAllowed ? t("settings.enabled") : t("settings.notEnabled")}</p>
            </div>
          </div>

          {billing?.stripeCustomerId ? (
            <PortalButton />
          ) : (
            <div className="space-y-3">
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {t("settings.portalHelp")}
              </p>
              <CheckoutButton label={t("settings.activateBilling")} />
            </div>
          )}
        </div>
      </Card>

      <PrivacyRequestCard />
      <AccountDeletionCard />
    </PageShell>
  );
}
