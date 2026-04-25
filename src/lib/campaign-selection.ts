export function resolvePreferredCampaignId(params: {
  requestedCampaignId?: string | null;
  storedCampaignId?: string | null;
  fallbackCampaignId?: string | null;
}) {
  return params.requestedCampaignId ?? params.storedCampaignId ?? params.fallbackCampaignId ?? null;
}
