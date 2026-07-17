import { ApiError } from "@/lib/api/route";
import { createHash } from "node:crypto";
import type { GhlLifecycleWebhook } from "@/lib/integrations/gohighlevel/webhook-contract";
import type { GhlLifecycleEnvironment } from "@/lib/integrations/gohighlevel/lifecycle-gate";
import { classifyGhlLifecycleOutcome } from "@/lib/integrations/gohighlevel/outcome-contract";
import { createAdminClient } from "@/lib/supabase/admin";

async function recordCanonicalOutcomeIfDefined(
  admin: any,
  event: GhlLifecycleWebhook,
  receipt: Record<string, unknown>,
) {
  const outcomeType = classifyGhlLifecycleOutcome(event);
  const organizationId = typeof receipt.organization_id === "string" ? receipt.organization_id : null;
  const leadId = typeof receipt.resolved_lead_id === "string" ? receipt.resolved_lead_id : null;
  const locationMappingId = typeof receipt.location_mapping_id === "string"
    ? receipt.location_mapping_id
    : null;
  const occurredAt = typeof receipt.received_at === "string"
    ? receipt.received_at
    : event.providerUpdatedAt;
  if (!outcomeType || !organizationId || !leadId || !locationMappingId || !occurredAt) {
    return { status: "not_applicable" as const, outcomeType };
  }
  const leadResult = await admin
    .from("leads")
    .select("campaign_id")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (leadResult.error || typeof leadResult.data?.campaign_id !== "string") {
    throw new ApiError(503, "GHL outcome lead lineage is unavailable.", "ghl_outcome_lead_lineage_unavailable");
  }
  const definitionResult = await admin
    .from("lead_outcome_definitions")
    .select("id,organization_id,definition_version,effective_at,expires_at")
    .eq("outcome_type", outcomeType)
    .lte("effective_at", occurredAt);
  if (definitionResult.error) {
    throw new ApiError(503, "Lead outcome authority could not be read.", "lead_outcome_authority_unavailable");
  }
  const definitions = (Array.isArray(definitionResult.data) ? definitionResult.data : [])
    .filter((row: Record<string, unknown>) =>
      (row.organization_id === null || row.organization_id === organizationId)
      && (typeof row.expires_at !== "string" || row.expires_at > occurredAt))
    .sort((left: Record<string, unknown>, right: Record<string, unknown>) => {
      const scope = Number(right.organization_id === organizationId) - Number(left.organization_id === organizationId);
      return scope || Number(right.definition_version ?? 0) - Number(left.definition_version ?? 0);
    });
  const definitionId = typeof definitions[0]?.id === "string" ? definitions[0].id : null;
  if (!definitionId) return { status: "definition_missing" as const, outcomeType };

  const idempotencyKey = `ghl-outcome:${createHash("sha256")
    .update(`${locationMappingId}:${event.providerEventId}:${outcomeType}`)
    .digest("hex")}`;
  const outcomeResult = await admin.rpc("record_lead_outcome_event_v1", {
    p_organization_id: organizationId,
    p_lead_id: leadId,
    p_campaign_id: leadResult.data.campaign_id,
    p_definition_id: definitionId,
    p_outcome_type: outcomeType,
    p_source_system: "ghl",
    p_source_event_id: event.providerEventId,
    p_idempotency_key: idempotencyKey,
    p_ghl_location_mapping_id: locationMappingId,
    p_ghl_contact_id: event.providerContactId,
    p_ghl_opportunity_id: event.eventType === "OpportunityStatusUpdate" ? event.providerObjectId : null,
    p_meta_ad_account_id: null,
    p_meta_campaign_id: null,
    p_meta_ad_id: null,
    p_meta_form_id: null,
    p_occurred_at: occurredAt,
    p_correction_of_event_id: null,
    p_correction_reason_code: null,
    p_payload_digest: event.payloadFingerprint,
  });
  if (outcomeResult.error) {
    throw new ApiError(503, "Lead outcome evidence could not be recorded.", "lead_outcome_record_failed");
  }
  return { status: "recorded" as const, outcomeType };
}

export async function acceptGhlLifecycleWebhook(
  event: GhlLifecycleWebhook,
  environment: GhlLifecycleEnvironment,
) {
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  const { data, error } = await (admin as any).rpc("ingest_ghl_lifecycle_webhook_v1", {
    p_provider_location_id: event.locationId,
    p_environment: environment,
    p_provider_event_id: event.providerEventId,
    p_event_type: event.eventType,
    p_provider_object_id: event.providerObjectId,
    p_provider_contact_id: event.providerContactId,
    p_provider_calendar_id: event.providerCalendarId,
    p_appointment_status: event.appointmentStatus,
    p_starts_at: event.startsAt,
    p_ends_at: event.endsAt,
    p_provider_updated_at: event.providerUpdatedAt,
    p_payload_fingerprint: event.payloadFingerprint,
  });
  if (error) {
    throw new ApiError(503, "GHL lifecycle receipt could not be durably processed.", "ghl_lifecycle_ingest_failed");
  }

  const receipt = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const projectionStatus = typeof receipt?.projection_status === "string"
    ? receipt.projection_status
    : "";
  if (
    projectionStatus !== "reconciliation_pending"
    && projectionStatus !== "reconciled"
    && projectionStatus !== "operator_action_required"
  ) {
    throw new ApiError(
      503,
      "GHL lifecycle receipt did not reach a durable terminal state.",
      "ghl_lifecycle_projection_incomplete",
    );
  }

  const outcome = projectionStatus === "reconciled"
    ? await recordCanonicalOutcomeIfDefined(admin, event, receipt ?? {})
    : { status: "not_applicable" as const, outcomeType: null };

  return {
    receipt,
    projectionStatus,
    projectionCode: typeof receipt?.projection_code === "string" ? receipt.projection_code : null,
    outcome,
  };
}
