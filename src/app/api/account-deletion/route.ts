import { z } from "zod";
import {
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import {
  createAccountDeletionRequest,
  getCurrentAccountDeletionStatus,
  isAccountDeletionRequestAvailable,
} from "@/lib/services/account-deletion-service";
import { ACCOUNT_DELETION_SUPPORT_EMAIL } from "@/lib/account-deletion/account-deletion-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().trim().email().max(320),
  confirmationPhrase: z.string().max(80),
  idempotencyKey: z.string().min(16).max(128),
  identityMethod: z.literal("aal2"),
}).strict();

export async function GET() {
  try {
    const executionAvailable = await isAccountDeletionRequestAvailable();
    return Response.json({
      request: executionAvailable ? await getCurrentAccountDeletionStatus() : null,
      executionAvailable,
      supportEmail: ACCOUNT_DELETION_SUPPORT_EMAIL,
    });
  } catch (error) {
    return handleApiError(error, "Account deletion status");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const body = await parseJsonBody(request, requestSchema, {
      maxBytes: 8 * 1024,
      code: "deletion_request_body_too_large",
    });
    const result = await createAccountDeletionRequest({
      email: body.email,
      confirmationPhrase: body.confirmationPhrase,
      idempotencyKey: body.idempotencyKey,
      identity: { method: "aal2" },
    });
    return Response.json({ request: result }, { status: 202 });
  } catch (error) {
    return handleApiError(error, "Account deletion request");
  }
}
