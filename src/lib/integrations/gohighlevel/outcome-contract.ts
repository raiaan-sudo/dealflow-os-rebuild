import type { GhlLifecycleWebhook } from "@/lib/integrations/gohighlevel/webhook-contract";

export type CanonicalGhlOutcome =
  | "appointment_booked"
  | "appointment_attended"
  | "opportunity_created"
  | "qualified"
  | "disqualified"
  | "closed_won"
  | "closed_lost";

export function classifyGhlLifecycleOutcome(event: GhlLifecycleWebhook): CanonicalGhlOutcome | null {
  const status = event.appointmentStatus?.trim().toLowerCase().replaceAll(/[-\s]+/g, "_") ?? "";
  if (event.eventType === "AppointmentCreate") {
    return ["cancelled", "canceled", "deleted", "invalid"].includes(status)
      ? null
      : "appointment_booked";
  }
  if (event.eventType === "AppointmentUpdate") {
    if (["attended", "showed", "completed", "complete"].includes(status)) return "appointment_attended";
    if (["booked", "confirmed", "new", "scheduled"].includes(status)) return "appointment_booked";
    return null;
  }
  if (event.eventType === "OpportunityStatusUpdate") {
    if (["won", "closed_won"].includes(status)) return "closed_won";
    if (["lost", "closed_lost", "abandoned"].includes(status)) return "closed_lost";
    if (status === "qualified") return "qualified";
    if (status === "disqualified") return "disqualified";
    if (["open", "new", "created"].includes(status)) return "opportunity_created";
  }
  return null;
}
