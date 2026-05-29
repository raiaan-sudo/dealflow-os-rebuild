import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getBillingSummary } from "@/lib/services/billing-service";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import {
  getCampaignById,
  getLatestCampaignRecord,
} from "@/lib/services/campaign-persistence";
import type { FullCampaignRecord } from "@/lib/types/campaign-records";

export type PaywallPlan = "starter" | "pro" | "growth";

export const PAYWALL_ACTIVE_COOKIE = "has_active_plan";
export const PAYWALL_PLAN_COOKIE = "selected_plan";
export const PREVIEW_COMPLETE_COOKIE = "has_completed_preview";
export const ACTIVE_CAMPAIGN_COOKIE = "active_campaign_id";

function isValidPlan(value: string | undefined): value is PaywallPlan {
  return value === "starter" || value === "pro" || value === "growth";
}

export function buildCampaignScopedPath(path: string, campaignId?: string | null) {
  if (!campaignId) {
    return path;
  }

  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("campaignId", campaignId);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

async function getStoredCampaignId() {
  const cookieStore = await cookies();
  const rawCampaignId = cookieStore.get(ACTIVE_CAMPAIGN_COOKIE)?.value;
  return typeof rawCampaignId === "string" && rawCampaignId.length > 0 ? rawCampaignId : null;
}

export async function resolveActiveCampaignRecord(
  requestedCampaignId?: string | null,
): Promise<{
  campaignId: string | null;
  record: FullCampaignRecord | null;
}> {
  const storedCampaignId = await getStoredCampaignId();
  const requestedRecord = requestedCampaignId
    ? await getCampaignById(requestedCampaignId).catch(() => null)
    : null;

  if (requestedRecord) {
    return {
      campaignId: requestedRecord.campaign.id,
      record: requestedRecord,
    };
  }

  if (requestedCampaignId) {
    return {
      campaignId: null,
      record: null,
    };
  }

  const storedRecord = storedCampaignId
    ? await getCampaignById(storedCampaignId).catch(() => null)
    : null;
  const latestRecord = storedRecord ? null : await getLatestCampaignRecord().catch(() => null);

  const resolvedRecord = storedRecord ?? latestRecord;

  return {
    campaignId: resolvedRecord?.campaign.id ?? null,
    record: resolvedRecord,
  };
}

export async function getPaywallAccessState(requestedCampaignId?: string | null) {
  const cookieStore = await cookies();
  const rawPlan = cookieStore.get(PAYWALL_PLAN_COOKIE)?.value;
  const resolvedCampaign = await resolveActiveCampaignRecord(requestedCampaignId);
  const billing = await getBillingSummary().catch(() => null);
  const campaignPlan = resolvedCampaign.record
    ? canonicalCampaignToPlan(resolvedCampaign.record)
    : null;
  const hasCompletedPreview =
    campaignPlan?.runtime.status === "preview" ||
    campaignPlan?.runtime.status === "connected" ||
    campaignPlan?.runtime.status === "launch_ready" ||
    campaignPlan?.runtime.status === "launching" ||
    campaignPlan?.runtime.status === "live" ||
    cookieStore.get(PREVIEW_COMPLETE_COOKIE)?.value === "true";

  return {
    hasActivePlan: billing?.launchAllowed ?? false,
    hasCompletedPreview,
    selectedPlan: billing?.launchAllowed
      ? billing.planTier
      : isValidPlan(rawPlan)
        ? rawPlan
        : null,
    activeCampaignId: resolvedCampaign.campaignId,
    campaignStatus: campaignPlan?.runtime.status ?? null,
    billingOverride: billing?.launchOverride ?? false,
    subscriptionStatus: billing?.subscriptionStatus ?? "inactive",
  };
}

export async function requireActivePlan(campaignId?: string | null) {
  const access = await getPaywallAccessState(campaignId);

  if (access.campaignStatus === "built" && !access.hasCompletedPreview) {
    redirect(buildCampaignScopedPath("/campaign-built", access.activeCampaignId ?? campaignId ?? null));
  }

  if (!access.hasActivePlan || !access.selectedPlan) {
    redirect(buildCampaignScopedPath("/paywall", access.activeCampaignId ?? campaignId ?? null));
  }

  return access;
}

export async function requirePreviewCompletion(campaignId?: string | null) {
  const access = await getPaywallAccessState(campaignId);

  if (access.campaignStatus === "built" && !access.hasCompletedPreview) {
    redirect(buildCampaignScopedPath("/campaign-built", access.activeCampaignId ?? campaignId ?? null));
  }

  if (!access.hasCompletedPreview) {
    redirect(buildCampaignScopedPath("/preview", access.activeCampaignId ?? campaignId ?? null));
  }

  return access;
}
