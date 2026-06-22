import { NextResponse } from "next/server";
import { ApiError, assertSameOriginRequest, handleApiError } from "@/lib/api/route";
import { assertInternalOperatorAccess } from "@/lib/services/internal-launch-monitor";
import { acknowledgeOperatorDebtJob } from "@/lib/services/operator-debt-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeAction(value: FormDataEntryValue | null) {
  return value === "acknowledge" ? value : null;
}

function normalizeNote(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 1000) : "";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const operator = await assertInternalOperatorAccess();

    const { id } = await context.params;
    const jobId = id?.trim();
    if (!jobId) {
      throw new ApiError(400, "Operator debt job id is required.", "operator_debt_job_id_required");
    }

    const form = await request.formData();
    const action = normalizeAction(form.get("action"));
    if (action !== "acknowledge") {
      throw new ApiError(400, "Operator debt action must be acknowledge.", "operator_debt_action_required");
    }

    await acknowledgeOperatorDebtJob({
      id: jobId,
      actor: operator.user.email ?? operator.profile?.email ?? "internal_operator",
      note: normalizeNote(form.get("note")),
    });

    return NextResponse.redirect(new URL("/admin/control-room", request.url), 303);
  } catch (error) {
    return handleApiError(error, "Admin operator debt action");
  }
}
