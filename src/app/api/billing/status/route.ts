import { handleApiError } from "@/lib/api/route";
import { getAppContext } from "@/lib/services/app-context";
import { getBillingSummary } from "@/lib/services/billing-service";
import { getCommercialActivationSummaryForCurrentUser } from "@/lib/services/credit-service";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [context, billing, activation] = await Promise.all([
      getAppContext(),
      getBillingSummary(),
      getCommercialActivationSummaryForCurrentUser(),
    ]);

    if (!context) {
      return Response.json({ error: "Authentication is required." }, { status: 401 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return Response.json({ error: "Billing status is unavailable." }, { status: 503 });
    }

    const { count, error } = await (admin as any)
      .from("campaign_plans")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organization.id);

    if (error) {
      throw error;
    }

    const campaignCount = typeof count === "number" ? count : 0;
    const creationBillingActive = ["active", "trialing"].includes(billing.subscriptionStatus);
    const hasUnlimitedCampaigns =
      creationBillingActive && (billing.planTier === "pro" || billing.planTier === "growth");
    const canCreateAdditionalCampaign = campaignCount === 0 || hasUnlimitedCampaigns;

    return Response.json({
      planTier: billing.planTier,
      billingState: billing.billingState,
      subscriptionStatus: billing.subscriptionStatus,
      launchAllowed: billing.launchAllowed,
      launchOverride: billing.launchOverride,
      campaignCount,
      canCreateAdditionalCampaign,
      hasUnlimitedCampaigns,
      canUseExistingLaunchAccess: billing.launchAllowed,
      campaignLimitLabel: hasUnlimitedCampaigns ? "Unlimited campaigns" : "One preview campaign",
      commercialActivation: activation,
      truthBoundary: {
        activationIsHistorical: true,
        entitlementIsCurrent: true,
        setupReadinessIsSeparate: true,
      },
    });
  } catch (error) {
    return handleApiError(error, "Billing status");
  }
}
