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
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

export function resolveCampaignDeliveryMetricTruth(input: {
  campaignDeliveryMetrics?: DeliveryMetricInput | null;
  workspaceMetrics: WorkspaceMetricInput;
}) {
  const campaignMetrics = input.campaignDeliveryMetrics;
  const source = campaignMetrics ? "campaign_meta_snapshot" as const : "workspace_fallback" as const;
  const leads = campaignMetrics
    ? finiteNonnegative(campaignMetrics.leads)
    : finiteNonnegative(input.workspaceMetrics.totalLeads);
  const spend = campaignMetrics
    ? finiteNonnegative(campaignMetrics.spend)
    : finiteNonnegative(input.workspaceMetrics.totalSpend);
  return {
    source,
    leads,
    spend,
    impressions: campaignMetrics ? finiteNonnegative(campaignMetrics.impressions) : 0,
    clicks: campaignMetrics ? finiteNonnegative(campaignMetrics.clicks) : 0,
    cpl: leads > 0 ? spend / leads : 0,
  };
}
