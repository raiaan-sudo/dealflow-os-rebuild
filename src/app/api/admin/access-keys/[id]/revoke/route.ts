import { NextResponse } from "next/server";
import { ApiError, assertSameOriginRequest, handleApiError } from "@/lib/api/route";
import { assertInternalOperatorAccess } from "@/lib/services/internal-launch-monitor";
import { revokeAccessKey } from "@/lib/services/access-key-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const operator = await assertInternalOperatorAccess();
    const { id } = await context.params;
    const accessKeyId = id?.trim();

    if (!accessKeyId) {
      throw new ApiError(400, "Access key id is required.", "access_key_id_required");
    }

    const form = await request.formData();
    const rawReason = form.get("reason");
    const reason = typeof rawReason === "string" ? rawReason.trim().slice(0, 500) : "";

    await revokeAccessKey({
      id: accessKeyId,
      actorUserId: operator.user.id,
      actorOrganizationId: operator.organization.id,
      reason,
    });

    return NextResponse.redirect(new URL("/admin/access-keys", request.url), 303);
  } catch (error) {
    return handleApiError(error, "Admin access key revoke");
  }
}
