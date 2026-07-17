type DeliveryMetricInput = {
  leads?: number | null;
  spend?: number | null;
  impressions?: number | null;
  clicks?: number | null;
};

type WorkspaceMetricInput = {
  totalLeads?: number | null;
  totalSpend?: number | null;
};

function finiteNonnegative(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

export function resolveCampaignDeliveryMetricTruth(input: {
  campaignDeliveryMetrics?: DeliveryMetricInput | null;
  workspaceMetrics: WorkspaceMetricInput;
}) {
  const campaignMetrics = input.campaignDeliveryMetrics;
  const source = campaignMetrics ? "campaign_meta_snapshot" as const : "missing" as const;
  const leads = campaignMetrics ? finiteNonnegative(campaignMetrics.leads) : null;
  const spend = campaignMetrics ? finiteNonnegative(campaignMetrics.spend) : null;
  return {
    source,
    leads,
    spend,
    impressions: campaignMetrics ? finiteNonnegative(campaignMetrics.impressions) : null,
    clicks: campaignMetrics ? finiteNonnegative(campaignMetrics.clicks) : null,
    cpl: leads !== null && spend !== null && leads > 0 ? spend / leads : null,
  };
}
