"use client";

import { CanonicalFunnelRenderer } from "@/components/funnels/canonical-funnel-renderer";
import { buildCanonicalFunnelFromPlan } from "@/lib/funnels/canonical-funnel";
import type { CampaignPlan, ExpectedOutcomes } from "@/lib/services/campaign-plan-service";

type FunnelPreviewProps = {
  plan: CampaignPlan;
  expectedOutcomes: ExpectedOutcomes;
  strategyWhy: string[];
  compact?: boolean;
};

export function FunnelPreview({
  plan,
  expectedOutcomes: _expectedOutcomes,
  strategyWhy: _strategyWhy,
  compact = false,
}: FunnelPreviewProps) {
  void _expectedOutcomes;
  void _strategyWhy;

  const funnel = buildCanonicalFunnelFromPlan(plan);

  return (
    <CanonicalFunnelRenderer
      brandLabel={plan.businessName || plan.clientName}
      campaignName={plan.primaryGoal || plan.keyOffer}
      compact={compact}
      funnel={funnel}
      market={plan.market}
      mode="preview"
    />
  );
}
