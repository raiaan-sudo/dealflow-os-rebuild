import { ApiError } from "@/lib/api/route";
import type { GhlLifecycleWebhook } from "@/lib/integrations/gohighlevel/webhook-contract";
import { createAdminClient } from "@/lib/supabase/admin";

export async function acceptGhlLifecycleWebhook(event: GhlLifecycleWebhook) {
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  const { data, error } = await (admin as any).rpc("ingest_ghl_lifecycle_webhook_v1", {
    p_provider_location_id: event.locationId,
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
  if (error) throw new ApiError(409, error.message, "ghl_lifecycle_ingest_failed");
  return data;
}
