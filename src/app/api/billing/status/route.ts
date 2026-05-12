import { handleApiError } from "@/lib/api/route";
import {
  canCreateAdditionalCampaign,
  getCampaignLimitPolicy,
} from "@/lib/billing/plans";
import { getBillingSummary } from "@/lib/services/billing-service";
import { listCampaignsForUser } from "@/lib/services/campaign-persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [billing, campaigns] = await Promise.all([
      getBillingSummary(),
      listCampaignsForUser().catch(() => []),
    ]);
    const campaignCount = campaigns.length;
    const limitPolicy = getCampaignLimitPolicy(billing.planTier);
    const canCreateAnother =
      billing.launchOverride ||
      canCreateAdditionalCampaign({
        planTier: billing.planTier,
        activeCampaignCount: campaignCount,
      });
    const hasUnlimitedCampaigns = billing.launchOverride || limitPolicy.includedActiveCampaigns === null;

    return Response.json(
      {
        planTier: billing.planTier,
        billingState: billing.billingState,
        subscriptionStatus: billing.subscriptionStatus,
        launchAllowed: billing.launchAllowed,
        launchOverride: billing.launchOverride,
        campaignCount,
        canCreateAdditionalCampaign: canCreateAnother,
        hasUnlimitedCampaigns,
        campaignLimitLabel: hasUnlimitedCampaigns ? "Unlimited active campaigns" : limitPolicy.label,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "Billing status");
  }
}
