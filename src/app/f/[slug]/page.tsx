import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getPublishedCampaignBySlug } from "@/lib/services/campaign-persistence";
import { getMetaPixelIdForOrganization } from "@/lib/integrations/meta/conversions";
import { CanonicalPublicFunnelPage } from "@/app/f/[slug]/canonical-public-funnel-page";
import {
  buildCanonicalPublicFunnel,
  getValidatedPublicFunnel,
} from "@/lib/public-funnel/canonical-public-funnel";

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

  const publicFunnel = getValidatedPublicFunnel(record) ?? buildCanonicalPublicFunnel(record);

  return (
    <CanonicalPublicFunnelPage
      funnel={{
        ...publicFunnel,
        slug: publicFunnel.slug || record.publish.slug || resolvedParams.slug,
        tracking: {
          ...publicFunnel.tracking,
          metaPixelId,
        },
      }}
    />
  );
}
