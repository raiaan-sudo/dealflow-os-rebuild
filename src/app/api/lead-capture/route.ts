import { z } from "zod";
import {
  apiSuccess,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { createPublicLeadAndStartConversation } from "@/lib/services/lead-handler-service";

const leadCaptureSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z.string().trim().email("Enter a valid email address.").optional(),
  phone: z.string().trim().min(6).optional(),
  campaign_id: z.string().uuid().optional(),
  funnel_id: z.string().trim().min(1).optional(),
  stage: z.enum(["onboarding", "generated", "launched"]).optional(),
});

export async function POST(req: Request) {
  try {
    const payload = await parseJsonBody(req, leadCaptureSchema);
    const normalizedStage = payload.stage?.trim() ?? "generated";
    const phone = payload.phone?.trim() || `+1555${Date.now().toString().slice(-7)}`;
    const email = payload.email?.trim() || `${normalizedStage}.${Date.now()}@lead.local`;

    const lead = await createPublicLeadAndStartConversation({
      campaign_id: payload.campaign_id,
      funnel_id: payload.funnel_id,
      name: payload.name,
      email,
      phone,
      source: `lead_capture_${normalizedStage}`,
      notes: `Captured from lead capture flow at stage: ${normalizedStage}.`,
    });

    return apiSuccess({
      ok: true,
      success: true,
      lead_id: lead.id,
      id: lead.id,
    });
  } catch (error) {
    return handleApiError(error, "Lead capture");
  }
}
