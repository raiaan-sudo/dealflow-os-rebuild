import { PageHeader } from "@/components/app/page-header";
import { CampaignPreviewReview } from "@/components/campaign/campaign-preview-review";
import { EmptyState } from "@/components/ui/empty-state";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { resolveActiveCampaignRecord } from "@/lib/paywall-access";
import {
  getExpectedOutcomes,
  getStrategyWhy,
} from "@/lib/services/campaign-plan-service";
import {
  normalizeCampaign,
  validateCampaign,
} from "@/lib/services/campaign-validation";

export default async function PreviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const campaignId =
    typeof params.campaignId === "string" && params.campaignId.length > 0
      ? params.campaignId
      : null;
  const activeCampaign = await resolveActiveCampaignRecord(campaignId).catch(() => null);
  let record = activeCampaign?.record ?? null;
  let plan = record ? canonicalCampaignToPlan(record) : null;

  if (!plan) {
    return (
      <div className="space-y-6">
      <PageHeader
        eyebrow="Preview"
        title="Campaign preview unavailable"
        description="Complete onboarding first, then unlock review to see the campaign package."
      />
        <EmptyState
          title="No campaign available yet"
          description="Finish onboarding to create a campaign before opening review."
        />
      </div>
    );
  }

  const validated = validateCampaign({ plan });

  if (!validated) {
    return (
      <div className="space-y-6">
      <PageHeader
        eyebrow="Preview"
        title="Campaign preview unavailable"
        description="Some campaign details are still missing, so this review page could not load correctly."
      />
        <EmptyState
          title="Preview data incomplete"
          description="Some campaign details are missing. Update or regenerate the campaign, then return to review."
        />
      </div>
    );
  }

  const safeCampaign = normalizeCampaign(validated);
  const previewPlan = safeCampaign.plan;
  const expectedOutcomes = getExpectedOutcomes(previewPlan);
  const previewAds = previewPlan.creatives.staticAds;
  const previewVideos = previewPlan.creatives.videoAds;
  const brandName = previewPlan.businessName || "DealFlow AI";
  const campaignIdForFlow = record?.campaign.id ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Preview"
        title="Review your campaign package"
        description="Review the funnel, ads, and asset progress before moving into account connection."
      />

      <CampaignPreviewReview
        campaignId={campaignIdForFlow}
        plan={previewPlan}
        expectedOutcomes={expectedOutcomes}
        strategyWhy={getStrategyWhy(previewPlan)}
        brandName={brandName}
        previewAds={previewAds}
        previewVideos={previewVideos}
      />
    </div>
  );
}
