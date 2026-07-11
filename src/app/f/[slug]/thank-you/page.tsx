import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getMetaPixelIdForOrganization } from "@/lib/integrations/meta/conversions";
import { getPublishedCampaignBySlug } from "@/lib/services/campaign-persistence";
import { buildPublicFunnelThankYouViewModel } from "@/lib/public-funnel-thank-you";
import { ThankYouConversionTracker } from "@/app/f/[slug]/thank-you/thank-you-conversion-tracker";
import { MetaPixelConsentControl } from "@/components/privacy/meta-pixel-consent-control";
import {
  isMetaPixelTrackingAllowed,
  getMetaPixelConsentPolicyVersion,
  META_PIXEL_CONSENT_COOKIE,
} from "@/lib/meta-pixel-consent";

export const dynamic = "force-dynamic";

const LEGACY_PUBLIC_FUNNEL_SLUG_REDIRECTS: Record<string, string> = {
  "raiaan-realty": "raiaan-broker-toronto-on-ccbfbfce",
};

export default async function PublicFunnelThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const redirectSlug = LEGACY_PUBLIC_FUNNEL_SLUG_REDIRECTS[resolvedParams.slug.toLowerCase()];

  if (redirectSlug) {
    redirect(`/f/${redirectSlug}/thank-you`);
  }

  const record = await getPublishedCampaignBySlug(resolvedParams.slug).catch(() => null);

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
      ? await getMetaPixelIdForOrganization(record.campaign.organization_id)
      : null;
  const view = buildPublicFunnelThankYouViewModel({
    record,
    slug: resolvedParams.slug,
  });
  const submitted = resolvedSearchParams.submitted === "1";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[920px] flex-col justify-center px-5 py-10 sm:px-6">
      {metaPixelConsentPolicyVersion ? (
        <MetaPixelConsentControl
          currentCookieValue={metaPixelConsentCookie}
          policyVersion={metaPixelConsentPolicyVersion}
        />
      ) : null}
      <ThankYouConversionTracker
        campaignId={record.campaign.id}
        metaPixelId={metaPixelId}
        shouldTrack={submitted}
      />
      <section className="space-y-8">
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
            {view.businessName}
          </p>
          <h1 className="max-w-[760px] text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
            {view.headline}
          </h1>
          <p className="max-w-[720px] text-base leading-7 text-white/75 sm:text-lg sm:leading-8">
            We received your details for <span className="font-semibold text-white">{view.offerContext}</span>.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              Next step
            </p>
            <p className="mt-3 text-sm leading-6 text-white/72">
              {view.expectation}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              Watch for us
            </p>
            <p className="mt-3 text-sm leading-6 text-white/72">
              Keep an eye on your phone and email. If you opted into texts, replies can include follow-up coordination about this request.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              Privacy
            </p>
            <p className="mt-3 text-sm leading-6 text-white/72">
              Your details are used for this inquiry and follow-up. Consent is not a condition of purchase.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {view.primaryLink ? (
            <a
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
              href={view.primaryLink.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {view.primaryLink.label}
            </a>
          ) : null}
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/12 px-5 text-sm font-semibold text-white hover:bg-white/8"
            href={view.secondaryLink.href}
          >
            {view.secondaryLink.label}
          </Link>
        </div>
      </section>
    </main>
  );
}
