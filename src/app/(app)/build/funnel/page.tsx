import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ArtifactRecoveryPanel } from "@/components/app/artifact-recovery-panel";
import { WizardSteps } from "@/components/app/wizard-steps";
import { Button } from "@/components/ui/button";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { FunnelPreview } from "@/components/funnel/funnel-preview";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getExpectedOutcomes, getStrategyWhy } from "@/lib/services/campaign-plan-service";
import { getRequestProductI18n } from "@/lib/i18n/server";

type MissingFunnelArtifact = "campaignRecord" | "funnel" | "campaignPayload";

async function loadStoredCampaignPayload(campaignId: string) {
  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    return null;
  }

  const row = (data as { plan?: unknown } | null) ?? null;

  return row?.plan && typeof row.plan === "object" && !Array.isArray(row.plan)
    ? (row.plan as Record<string, unknown>)
    : null;
}

export default async function BuildFunnelPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { href, t } = await getRequestProductI18n();
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;

  if (!campaignId) {
    redirect(href("/onboarding"));
  }

  const activeCampaign = await resolveActiveCampaignRecord(campaignId).catch(() => null);
  const record = activeCampaign?.record ?? null;
  const storedPlan = await loadStoredCampaignPayload(campaignId);
  const campaignPayload =
    storedPlan?.campaign_payload &&
    typeof storedPlan.campaign_payload === "object" &&
    !Array.isArray(storedPlan.campaign_payload)
      ? (storedPlan.campaign_payload as Record<string, unknown>)
      : null;
  const funnel = record?.funnel ?? null;
  const missingArtifacts: MissingFunnelArtifact[] = [];

  if (!record) {
    missingArtifacts.push("campaignRecord");
  }

  if (!funnel) {
    missingArtifacts.push("funnel");
  }

  if (!campaignPayload) {
    missingArtifacts.push("campaignPayload");
  }

  if (missingArtifacts.length > 0) {
    return (
      <div className="mx-auto w-full max-w-[900px] space-y-8 p-6 sm:p-8">
        <WizardSteps current="funnel" />
        <PageHeader
          eyebrow={t("build.eyebrow")}
          title={t("build.funnel.missingTitle")}
          description={t("build.funnel.missingDescription")}
        />
        <ArtifactRecoveryPanel
          campaignId={campaignId}
          title={t("build.funnel.recoverTitle")}
          description={t("build.funnel.recoverDescription")}
          missingArtifacts={missingArtifacts.map((artifact) =>
            t(`build.artifact.${artifact}`),
          )}
          recoverySteps={[
            ...(missingArtifacts.includes("funnel") ? (["generate-funnel"] as const) : []),
            ...(missingArtifacts.includes("campaignPayload") ? (["build-campaign"] as const) : []),
          ]}
        />
      </div>
    );
  }

  if (!record) {
    redirect(href("/onboarding"));
  }

  if (!funnel) {
    redirect(href("/onboarding"));
  }

  const plan = canonicalCampaignToPlan(record);
  const ensuredFunnel = funnel;

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-8 p-6 sm:p-8">
      <WizardSteps current="funnel" />
      <PageHeader
        eyebrow={t("build.eyebrow")}
        title={t("build.funnel.reviewTitle")}
        description={t("build.funnel.reviewDescription")}
      />

      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">{t("build.funnel.headline")}</h2>
          <p className="mt-1 text-2xl font-semibold text-foreground">{ensuredFunnel.headline ?? t("build.funnel.noHeadline")}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">{t("build.funnel.subheadline")}</h2>
          <p className="mt-1 text-base leading-7 text-foreground">{ensuredFunnel.subheadline ?? t("build.funnel.noSubheadline")}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">{t("build.funnel.cta")}</h2>
          <p className="mt-1 text-base font-semibold text-foreground">{ensuredFunnel.cta ?? t("build.funnel.noCta")}</p>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">{t("build.funnel.livePreview")}</h2>
        <FunnelPreview
          plan={plan}
          expectedOutcomes={getExpectedOutcomes(plan)}
          strategyWhy={getStrategyWhy(plan)}
        />
      </section>

      <details className="rounded-2xl border border-border bg-card p-6">
        <summary className="cursor-pointer text-sm font-medium text-foreground">{t("build.funnel.advanced")}</summary>
        <div className="mt-4 space-y-4">
          {Array.isArray(ensuredFunnel.sections) && ensuredFunnel.sections.length > 0 ? (
            ensuredFunnel.sections.map((section) => (
              <div key={section.id} className="rounded-lg border border-border p-4">
                <p><strong>{t("build.funnel.field.id")}:</strong> {section.id}</p>
                <p><strong>{t("build.funnel.field.type")}:</strong> {section.type}</p>
                <p><strong>{t("build.funnel.field.variant")}:</strong> {section.variant}</p>
                <p><strong>{t("build.funnel.field.title")}:</strong> {section.title}</p>
                <p><strong>{t("build.funnel.field.visible")}:</strong> {section.visible ? t("common.yes") : t("common.no")}</p>
                <div className="mt-3">
                  <p className="font-medium">{t("build.funnel.field.content")}</p>
                  {section.content.length > 0 ? (
                    <ul className="list-disc pl-6">
                      {section.content.map((item, index) => (
                        <li key={`${section.id}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t("build.funnel.noContent")}</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t("build.funnel.noSections")}</p>
          )}
        </div>
      </details>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-between">
        <Button asChild size="lg" variant="secondary">
          <Link href="/onboarding">{t("common.back")}</Link>
        </Button>
        <Button asChild size="lg">
          <Link
            href={
              record?.campaign.id
                ? `/build/creatives?campaignId=${encodeURIComponent(record.campaign.id)}`
                : "/build/creatives"
            }
          >
            {t("build.funnel.next")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
