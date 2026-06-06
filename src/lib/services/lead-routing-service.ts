import type { IngestedLead } from "@/lib/services/lead-ingestion-service";
import type { LeadDeliveryDestination } from "@/lib/services/lead-capture-strategy-service";

export type LeadRoutingDecision = {
  destination: LeadDeliveryDestination;
  shouldNotifyOperator: boolean;
  shouldQueueDelivery: boolean;
  reasons: string[];
};

export function getLeadRoutingDecision(params: {
  lead: IngestedLead;
  destination: LeadDeliveryDestination;
}): LeadRoutingDecision {
  const reasons = [params.lead.qualification.qualified ? "qualified_lead" : "needs_review"];

  return {
    destination: params.destination,
    shouldNotifyOperator: !params.lead.qualification.qualified,
    shouldQueueDelivery: params.lead.qualification.qualified,
    reasons,
  };
}
