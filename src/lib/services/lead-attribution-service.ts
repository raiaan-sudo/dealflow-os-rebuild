import type { CaptureMethod, LeadCaptureGoal } from "@/lib/services/lead-capture-strategy-service";

export type LeadAttribution = {
  campaignId: string;
  organizationId: string;
  captureMethod: CaptureMethod;
  leadCaptureGoal: LeadCaptureGoal;
  source: string;
  utmSource: string | null;
  utmCampaign: string | null;
  metaLeadFormId: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function buildLeadAttribution(params: {
  campaignId: string;
  organizationId: string;
  captureMethod: CaptureMethod;
  leadCaptureGoal: LeadCaptureGoal;
  source?: string | null;
  query?: Record<string, unknown> | null;
  metaLeadFormId?: string | null;
}): LeadAttribution {
  return {
    campaignId: params.campaignId,
    organizationId: params.organizationId,
    captureMethod: params.captureMethod,
    leadCaptureGoal: params.leadCaptureGoal,
    source: clean(params.source) ?? params.captureMethod,
    utmSource: clean(params.query?.utm_source),
    utmCampaign: clean(params.query?.utm_campaign),
    metaLeadFormId: clean(params.metaLeadFormId),
  };
}
