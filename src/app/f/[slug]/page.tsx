import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getPublishedCampaignBySlug } from "@/lib/services/campaign-persistence";
import { LeadCaptureForm } from "@/app/f/[slug]/lead-capture-form";
import { getMetaPixelIdForOrganization } from "@/lib/integrations/meta/conversions";

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
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const resolvedParams = params instanceof Promise ? await params : params;
  const { record, metaPixelId } = await getCachedPublicFunnel(resolvedParams.slug);

  if (!record) {
    notFound();
  }

  const visibleSections = record.funnel.sections.filter((section) => section.visible !== false);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col gap-8 px-6 py-10 lg:flex-row lg:items-start">
      <div className="flex-1 space-y-6">
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
            {record.campaign.name}
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">
            {record.funnel.headline}
          </h1>
          <p className="max-w-[720px] text-lg leading-8 text-white/75">
            {record.funnel.subheadline}
          </p>
        </div>

        <div className="space-y-4">
          {visibleSections.map((section) => (
            <section
              key={section.id ?? `${section.type}-${section.title}`}
              className="rounded-[24px] border border-white/8 bg-white/[0.03] p-6"
            >
              <h2 className="text-xl font-semibold text-white">{section.title}</h2>
              <div className="mt-3 space-y-3">
                {section.content.map((item, index) => (
                  <p key={`${section.title}-${index}`} className="text-sm leading-7 text-white/72">
                    {item}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="w-full max-w-[380px] shrink-0 lg:sticky lg:top-8">
        <LeadCaptureForm
          campaignId={record.campaign.id}
          funnelSlug={record.publish.slug ?? resolvedParams.slug}
          formFields={record.funnel.form_fields ?? []}
          cta={record.funnel.cta || "Submit"}
          metaPixelId={metaPixelId}
        />
      </div>
    </div>
  );
}
