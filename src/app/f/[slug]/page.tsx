import { notFound, redirect } from "next/navigation";
import { CanonicalFunnelRenderer } from "@/components/funnels/canonical-funnel-renderer";
import { LeadCaptureForm } from "@/app/f/[slug]/lead-capture-form";
import { buildCanonicalFunnelFromRecord } from "@/lib/funnels/canonical-funnel";
import { getMetaPixelIdForOrganization } from "@/lib/integrations/meta/conversions";
import { getPublishedCampaignBySlug } from "@/lib/services/campaign-persistence";
import { getCampaignEntitlementsForOrganization } from "@/lib/services/campaign-entitlements";

export const dynamic = "force-dynamic";

const LEGACY_PUBLIC_FUNNEL_SLUG_REDIRECTS: Record<string, string> = {
  "raiaan-realty": "raiaan-broker-toronto-on-ccbfbfce",
};

export default async function PublicFunnelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const redirectSlug = LEGACY_PUBLIC_FUNNEL_SLUG_REDIRECTS[resolvedParams.slug.toLowerCase()];

  if (redirectSlug) {
    redirect(`/f/${redirectSlug}`);
  }

  const record = await getPublishedCampaignBySlug(resolvedParams.slug).catch(() => null);

  if (!record) {
    notFound();
  }

  const organizationId = record.campaign.organization_id ?? null;
  const [metaPixelId, entitlements] = await Promise.all([
    organizationId ? getMetaPixelIdForOrganization(organizationId).catch(() => null) : null,
    organizationId
      ? getCampaignEntitlementsForOrganization({
          organizationId,
          campaignId: record.campaign.id,
          userId: record.campaign.user_id,
        }).catch(() => null)
      : null,
  ]);
  const leadCaptureActive = entitlements?.canCaptureLeads !== false;
  const funnel = buildCanonicalFunnelFromRecord(record);
  const brandLabel = funnel.agent?.brokerageName ?? record.plan.business_name ?? record.campaign.name;
  const cta = funnel.cta || "Get My List";

  return (
    <CanonicalFunnelRenderer
      brandLabel={brandLabel}
      campaignName={record.campaign.name}
      funnel={funnel}
      market={record.plan.market}
      mode="public"
      leadCaptureSlot={
        leadCaptureActive ? (
          <LeadCaptureForm
            campaignId={record.campaign.id}
            cta={cta}
            formFields={funnel.form_fields ?? []}
            funnelSlug={record.publish.slug ?? resolvedParams.slug}
            language={funnel.language}
            metaPixelId={metaPixelId}
          />
        ) : (
          <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-xs font-semibold uppercase text-primary/80">Campaign paused</p>
            <h2 className="text-2xl font-semibold text-white">This campaign is not accepting leads right now.</h2>
            <p className="text-sm leading-6 text-white/70">
              The agent needs to reactivate DealFlow billing before this funnel can collect new inquiries.
            </p>
          </div>
        )
      }
    />
  );
}
