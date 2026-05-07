import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getPublishedCampaignBySlug } from "@/lib/services/campaign-persistence";
import { LeadCaptureForm } from "@/app/f/[slug]/lead-capture-form";
import { getMetaPixelIdForOrganization } from "@/lib/integrations/meta/conversions";
import { getCampaignEntitlementsForOrganization } from "@/lib/services/campaign-entitlements";

export const revalidate = 60;

const getCachedPublicFunnel = unstable_cache(
  async (slug: string) => {
    const record = await getPublishedCampaignBySlug(slug).catch(() => null);
    const metaPixelId = record?.campaign.organization_id
      ? await getMetaPixelIdForOrganization(record.campaign.organization_id)
      : null;

    return { record, metaPixelId };
  },
  ["public-funnel-page"],
  { revalidate: 60 },
);

export default async function PublicFunnelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const { record, metaPixelId } = await getCachedPublicFunnel(resolvedParams.slug);

  if (!record) {
    notFound();
  }

  const organizationId = record.campaign.organization_id ?? null;
  const entitlements = organizationId
    ? await getCampaignEntitlementsForOrganization({ organizationId }).catch(() => null)
    : null;
  const leadCaptureActive = entitlements?.canCaptureLeads !== false;
  const visibleSections = record.funnel.sections.filter((section) => section.visible !== false);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col gap-8 overflow-hidden px-5 py-10 sm:max-w-[calc(100vw-48px)] sm:px-6 lg:flex-row lg:items-start xl:max-w-[1100px]">
      <div className="min-w-0 flex-1 space-y-6">
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
            {record.campaign.name}
          </p>
          <h1 className="break-words text-3xl font-semibold text-white [overflow-wrap:anywhere] sm:text-4xl sm:tracking-[-0.05em]">
            {record.funnel.headline}
          </h1>
          <p className="max-w-[720px] break-words text-base leading-7 text-white/75 [overflow-wrap:anywhere] sm:text-lg sm:leading-8">
            {record.funnel.subheadline}
          </p>
        </div>

        <div className="space-y-4">
          {visibleSections.map((section) => (
            <section
              key={section.id ?? `${section.type}-${section.title}`}
              className="rounded-[24px] border border-white/8 bg-white/[0.03] p-6"
            >
              <h2 className="break-words text-xl font-semibold text-white [overflow-wrap:anywhere]">{section.title}</h2>
              <div className="mt-3 space-y-3">
                {section.content.map((item, index) => (
                  <p key={`${section.title}-${index}`} className="break-words text-sm leading-7 text-white/72 [overflow-wrap:anywhere]">
                    {item}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="w-full max-w-[380px] shrink-0 lg:sticky lg:top-8">
        {leadCaptureActive ? (
          <LeadCaptureForm
            campaignId={record.campaign.id}
            funnelSlug={record.publish.slug ?? resolvedParams.slug}
            formFields={record.funnel.form_fields ?? []}
            cta={record.funnel.cta || "Submit"}
            metaPixelId={metaPixelId}
          />
        ) : (
          <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
              Campaign paused
            </p>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">
              This campaign is not accepting leads right now.
            </h2>
            <p className="text-sm leading-6 text-white/70">
              The agent needs to reactivate DealFlow billing before this funnel can collect
              new inquiries.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
