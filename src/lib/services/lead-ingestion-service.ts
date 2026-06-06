import {
  normalizeLeadPayload,
  scoreLeadQualification,
  type NormalizedLeadPayload,
} from "@/lib/services/lead-qualification-service";
import type { LeadFormTemplate } from "@/lib/services/lead-form-template-service";

export type LeadSource = "website_funnel" | "meta_instant_form" | "manual";

export type IngestedLead = {
  campaignId: string;
  organizationId: string;
  source: LeadSource;
  sourceLeadId: string | null;
  dedupeKey: string;
  payload: NormalizedLeadPayload;
  qualification: ReturnType<typeof scoreLeadQualification>;
};

function stableLeadIdentity(payload: NormalizedLeadPayload) {
  return (payload.phone ?? payload.email ?? payload.fullName ?? "unknown").toLowerCase().replace(/\s+/g, "");
}

export function buildLeadDedupeKey(params: {
  campaignId: string;
  source: LeadSource;
  sourceLeadId?: string | null;
  payload: NormalizedLeadPayload;
}) {
  if (params.sourceLeadId?.trim()) {
    return `${params.campaignId}:${params.source}:${params.sourceLeadId.trim()}`;
  }

  return `${params.campaignId}:${params.source}:${stableLeadIdentity(params.payload)}`;
}

export function ingestLeadForQualification(params: {
  campaignId: string;
  organizationId: string;
  source: LeadSource;
  sourceLeadId?: string | null;
  rawPayload: Record<string, unknown>;
  template: LeadFormTemplate;
}): IngestedLead {
  const payload = normalizeLeadPayload(params.rawPayload);
  const qualification = scoreLeadQualification({ payload, template: params.template });

  return {
    campaignId: params.campaignId,
    organizationId: params.organizationId,
    source: params.source,
    sourceLeadId: params.sourceLeadId ?? null,
    dedupeKey: buildLeadDedupeKey({
      campaignId: params.campaignId,
      source: params.source,
      sourceLeadId: params.sourceLeadId,
      payload,
    }),
    payload,
    qualification,
  };
}
