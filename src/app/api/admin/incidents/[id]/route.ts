import { NextResponse } from "next/server";
import { ApiError, assertSameOriginRequest, handleApiError } from "@/lib/api/route";
import { assertInternalOperatorAccess } from "@/lib/services/internal-launch-monitor";
import { updateScaleMonitorIncidentStatus } from "@/lib/services/scale-monitor-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeAction(value: FormDataEntryValue | null) {
  return value === "acknowledge" || value === "resolve" ? value : null;
}

function normalizeNote(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    await assertInternalOperatorAccess();

    const { id } = await context.params;
    const incidentId = id?.trim();
    if (!incidentId) {
      throw new ApiError(400, "Incident id is required.", "incident_id_required");
    }

    const form = await request.formData();
    const action = normalizeAction(form.get("action"));
    if (!action) {
      throw new ApiError(400, "Incident action is required.", "incident_action_required");
    }

    await updateScaleMonitorIncidentStatus({
      id: incidentId,
      action,
      actor: "internal_operator",
      note: normalizeNote(form.get("note")),
    });

    return NextResponse.redirect(new URL("/admin/incidents", request.url), 303);
  } catch (error) {
    return handleApiError(error, "Admin incident action");
  }
}
