import type { StaticCreativeAsset } from "@/lib/services/creative-engine";
import { STATIC_LAUNCH_MIN_CREATIVE_COUNT } from "@/lib/services/creative-media-readiness";

function campaignCreativeIndex(id: string | null | undefined, campaignId?: string | null) {
  if (!id) {
    return null;
  }

  const trimmedId = id.trim();
  const campaignPrefix = campaignId ? `${campaignId}-creative-` : null;

  if (campaignPrefix && trimmedId.startsWith(campaignPrefix)) {
    const index = Number.parseInt(trimmedId.slice(campaignPrefix.length), 10);
    return Number.isInteger(index) && index >= 0 ? index : null;
  }

  const suffixMatch = trimmedId.match(/(?:^|-)creative-(\d+)$/);
  if (!suffixMatch) {
    return null;
  }

  const suffixIndex = Number.parseInt(suffixMatch[1] ?? "", 10);
  return Number.isInteger(suffixIndex) && suffixIndex >= 0 ? suffixIndex : null;
}

function uniqueStaticAds(staticAds: StaticCreativeAsset[]) {
  const seenIds = new Set<string>();
  const uniqueAds: StaticCreativeAsset[] = [];

  for (const ad of staticAds) {
    if (!ad?.id || seenIds.has(ad.id)) {
      continue;
    }

    seenIds.add(ad.id);
    uniqueAds.push(ad);
  }

  return uniqueAds;
}

export function mergeStaticCreativeLaunchFloor(params: {
  campaignId?: string | null;
  planStaticAds?: StaticCreativeAsset[] | null;
  persistedStaticAds?: StaticCreativeAsset[] | null;
  minimumCount?: number;
}) {
  const planStaticAds = uniqueStaticAds(params.planStaticAds ?? []);
  const persistedStaticAds = uniqueStaticAds(params.persistedStaticAds ?? []);
  const minimumCount = Math.max(
    STATIC_LAUNCH_MIN_CREATIVE_COUNT,
    params.minimumCount ?? STATIC_LAUNCH_MIN_CREATIVE_COUNT,
  );

  if (persistedStaticAds.length === 0) {
    return planStaticAds;
  }

  if (planStaticAds.length === 0) {
    return persistedStaticAds;
  }

  const coveredPlanIds = new Set<string>();
  const coveredPlanIndexes = new Set<number>();
  const planIdToIndex = new Map(planStaticAds.map((ad, index) => [ad.id, index]));

  for (const ad of persistedStaticAds) {
    const exactIndex = planIdToIndex.get(ad.id);
    if (exactIndex !== undefined) {
      coveredPlanIds.add(ad.id);
      coveredPlanIndexes.add(exactIndex);
      continue;
    }

    const index = campaignCreativeIndex(ad.id, params.campaignId);
    if (index !== null && index < planStaticAds.length) {
      coveredPlanIndexes.add(index);
      coveredPlanIds.add(planStaticAds[index]?.id ?? "");
    }
  }

  const merged = [...persistedStaticAds];
  const mergedIds = new Set(merged.map((ad) => ad.id));

  for (const [index, ad] of planStaticAds.entries()) {
    if (coveredPlanIds.has(ad.id) || coveredPlanIndexes.has(index) || mergedIds.has(ad.id)) {
      continue;
    }

    merged.push(ad);
    mergedIds.add(ad.id);
  }

  return merged.length >= minimumCount ? merged : [...merged, ...planStaticAds.filter((ad) => !mergedIds.has(ad.id))];
}
