import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { getPublishedCampaignBySlug } from "@/lib/services/campaign-persistence";
import { LeadCaptureForm } from "@/app/f/[slug]/lead-capture-form";
import { PublicFunnelDocumentLanguage } from "@/app/f/[slug]/public-funnel-document-language";
import { MetaPixelConsentControl } from "@/components/privacy/meta-pixel-consent-control";
import { getMetaPixelIdForCampaign } from "@/lib/integrations/meta/conversions";
import {
  isMetaPixelTrackingAllowed,
  getMetaPixelConsentPolicyVersion,
  META_PIXEL_CONSENT_COOKIE,
} from "@/lib/meta-pixel-consent";
import {
  buildOfferFirstBody,
  buildOfferFirstHeadline,
  textPreservesOfferConcept,
} from "@/lib/copy/offer-consistency";
import {
  getPublicFunnelLanguage,
  getPublicFunnelOpenGraphLocale,
  getPublicFunnelPageCopy,
  normalizePublicMetadataText,
} from "@/lib/public-funnel-language";

export const revalidate = 60;

const getCachedPublicFunnel = unstable_cache(
  async (slug: string) => {
    const record = await getPublishedCampaignBySlug(slug).catch(() => null);
    return { record };
  },
  ["public-funnel-page"],
  { revalidate: 60 },
);

type PublicFunnelPageProps = {
  params: Promise<{ slug: string }> | { slug: string };
};

export async function generateMetadata({
  params,
}: PublicFunnelPageProps): Promise<Metadata> {
  const resolvedParams = params instanceof Promise ? await params : params;
  const { record } = await getCachedPublicFunnel(resolvedParams.slug);

  if (!record) {
    return {
      title: { absolute: "Page not found" },
      robots: { index: false, follow: false },
    };
  }

  const language = getPublicFunnelLanguage(record);
  const copy = getPublicFunnelPageCopy(language);
  const title = normalizePublicMetadataText(
    record.funnel.headline,
    copy.metadataFallbackTitle,
    70,
  );
  const description = normalizePublicMetadataText(
    record.funnel.subheadline,
    copy.metadataFallbackDescription,
    160,
  );
  const canonicalPath = `/f/${encodeURIComponent(record.publish.slug ?? resolvedParams.slug)}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "website",
      title,
      description,
      locale: getPublicFunnelOpenGraphLocale(language),
      url: canonicalPath,
    },
    other: { "content-language": language },
  };
}

export default async function PublicFunnelPage({
  params,
}: PublicFunnelPageProps) {
  const resolvedParams = params instanceof Promise ? await params : params;
  const { record } = await getCachedPublicFunnel(resolvedParams.slug);

  if (!record) {
    notFound();
  }

  const cookieStore = await cookies();
  const metaPixelConsentCookie = cookieStore.get(META_PIXEL_CONSENT_COOKIE)?.value ?? null;
  const metaPixelConsentPolicyVersion =
    process.env.ALLOW_META_PIXEL_EVENTS === "true"
      ? getMetaPixelConsentPolicyVersion() ?? ""
      : "";
  const metaPixelAllowed = isMetaPixelTrackingAllowed({
    cookieValue: metaPixelConsentCookie,
  });
  const metaPixelId =
    metaPixelAllowed && record.campaign.organization_id
      ? await getMetaPixelIdForCampaign({
          organizationId: record.campaign.organization_id,
          campaignId: record.campaign.id,
        })
      : null;

  const visibleSections = record.funnel.sections.filter((section) => section.visible !== false);
  const offer = textPreservesOfferConcept(record.plan.offer_summary, record.plan.offer)
    ? record.plan.offer_summary
    : record.plan.offer || record.plan.offer_summary;
  const headline =
    buildOfferFirstHeadline({
      headline: record.funnel.headline,
      offer,
      market: record.strategy.location,
    }) || record.funnel.headline;
  const subheadline =
    buildOfferFirstBody({
      body: record.funnel.subheadline,
      offer,
    }) || record.funnel.subheadline;
  const language = getPublicFunnelLanguage(record);
  const copy = getPublicFunnelPageCopy(language);

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col gap-8 px-6 py-10 lg:flex-row lg:items-start"
      data-public-funnel-language={language}
      dir="ltr"
      lang={language}
    >
      <PublicFunnelDocumentLanguage language={language} />
      {metaPixelConsentPolicyVersion ? (
        <MetaPixelConsentControl
          currentCookieValue={metaPixelConsentCookie}
          language={language}
          policyVersion={metaPixelConsentPolicyVersion}
        />
      ) : null}
      <div className="flex-1 space-y-6">
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
            {record.campaign.name}
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">
            {headline}
          </h1>
          <p className="max-w-[720px] text-lg leading-8 text-white/75">
            {subheadline}
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
          customQuestions={record.funnel.customLeadFormQuestions ?? []}
          cta={record.funnel.cta || copy.defaultCta}
          language={language}
          metaPixelId={metaPixelId}
        />
      </div>
    </main>
  );
}
