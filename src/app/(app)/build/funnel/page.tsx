import Link from "next/link";
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
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;

  if (!campaignId) {
    redirect("/onboarding");
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
  const missingArtifacts: string[] = [];

  if (!record) {
    missingArtifacts.push("campaign record");
  }

  if (!funnel) {
    missingArtifacts.push("funnel");
  }

  if (!campaignPayload) {
    missingArtifacts.push("campaign payload");
  }

  if (missingArtifacts.length > 0) {
    return (
      <div className="mx-auto w-full max-w-[900px] space-y-8 p-6 sm:p-8">
        <WizardSteps current="funnel" />
        <PageHeader
          eyebrow="Build"
          title="Funnel artifacts are missing"
          description="This step needs a saved funnel and campaign payload before review can continue."
        />
        <ArtifactRecoveryPanel
          campaignId={campaignId}
          title="Recover the funnel step"
          description="The required funnel data is missing or incomplete. Regenerate the missing artifacts below, or go back to onboarding."
          missingArtifacts={missingArtifacts}
          recoverySteps={[
            ...(missingArtifacts.includes("funnel") ? (["generate-funnel"] as const) : []),
            ...(missingArtifacts.includes("campaign payload") ? (["build-campaign"] as const) : []),
          ]}
        />
      </div>
    );
  }

  if (!record) {
    redirect("/onboarding");
  }

  if (!funnel) {
    redirect("/onboarding");
  }

  const plan = canonicalCampaignToPlan(record);
  const ensuredFunnel = funnel;

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-8 p-6 sm:p-8">
      <WizardSteps current="funnel" />
      <PageHeader
        eyebrow="Build"
        title="Review your funnel"
        description="Check the core message and preview before moving to ad selection."
      />

      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Headline</h2>
          <p className="mt-1 text-2xl font-semibold text-foreground">{ensuredFunnel.headline ?? "No headline saved."}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Subheadline</h2>
          <p className="mt-1 text-base leading-7 text-foreground">{ensuredFunnel.subheadline ?? "No subheadline saved."}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">CTA</h2>
          <p className="mt-1 text-base font-semibold text-foreground">{ensuredFunnel.cta ?? "No CTA saved."}</p>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Live preview</h2>
        <FunnelPreview
          plan={plan}
          expectedOutcomes={getExpectedOutcomes(plan)}
          strategyWhy={getStrategyWhy(plan)}
        />
      </section>

      <details className="rounded-2xl border border-border bg-card p-6">
        <summary className="cursor-pointer text-sm font-medium text-foreground">Advanced</summary>
        <div className="mt-4 space-y-4">
          {Array.isArray(ensuredFunnel.sections) && ensuredFunnel.sections.length > 0 ? (
            ensuredFunnel.sections.map((section) => (
              <div key={section.id} className="rounded-lg border border-border p-4">
                <p><strong>ID:</strong> {section.id}</p>
                <p><strong>Type:</strong> {section.type}</p>
                <p><strong>Variant:</strong> {section.variant}</p>
                <p><strong>Title:</strong> {section.title}</p>
                <p><strong>Visible:</strong> {section.visible ? "yes" : "no"}</p>
                <div className="mt-3">
                  <p className="font-medium">Content</p>
                  {section.content.length > 0 ? (
                    <ul className="list-disc pl-6">
                      {section.content.map((item, index) => (
                        <li key={`${section.id}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No content</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No funnel sections generated.</p>
          )}
        </div>
      </details>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-between">
        <Button asChild size="lg" variant="secondary">
          <Link href="/onboarding">Back</Link>
        </Button>
        <Button asChild size="lg">
          <Link
            href={
              record?.campaign.id
                ? `/build/creatives?campaignId=${encodeURIComponent(record.campaign.id)}`
                : "/build/creatives"
            }
          >
            Looks good → Next
          </Link>
        </Button>
      </div>
    </div>
  );
}
