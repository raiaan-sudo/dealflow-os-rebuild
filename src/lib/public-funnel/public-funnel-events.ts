import { logOperationalEvent, logWarn } from "@/lib/logging";

export function logBlockedLegacyPublicSections(params: {
  campaignId?: string | null;
  slug?: string | null;
  blockedSectionTypes: string[];
}) {
  if (params.blockedSectionTypes.length === 0) {
    return;
  }

  logOperationalEvent("public_funnel.legacy_sections_ignored", {
    campaignId: params.campaignId ?? null,
    slug: params.slug ?? null,
    blockedSectionTypes: Array.from(new Set(params.blockedSectionTypes)).sort(),
  });
}

export function logCanonicalPublicFunnelBuilt(params: {
  campaignId?: string | null;
  slug?: string | null;
  presetVersion: string;
}) {
  logOperationalEvent("public_funnel.canonical_built", {
    campaignId: params.campaignId ?? null,
    slug: params.slug ?? null,
    presetVersion: params.presetVersion,
  });
}

export function logCanonicalPublicFunnelInvalid(params: {
  campaignId?: string | null;
  slug?: string | null;
  reason: string;
}) {
  logWarn("public_funnel.canonical_invalid", {
    campaignId: params.campaignId ?? null,
    slug: params.slug ?? null,
    reason: params.reason,
  });
}

