import { z } from "zod";
import {
  apiSuccess,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { assertInternalOperatorAccess } from "@/lib/services/internal-launch-monitor";
import { retryFulfillmentCrmSync } from "@/lib/services/fulfillment-monitor-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  leadId: z.string().uuid(),
  confirmation: z.literal("RETRY_CRM_SYNC"),
  allowDeadLetter: z.boolean().optional().default(false),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    await assertInternalOperatorAccess();

    const body = await parseJsonBody(request, bodySchema);
    const result = await retryFulfillmentCrmSync({
      leadId: body.leadId,
      confirmation: body.confirmation,
      allowDeadLetter: body.allowDeadLetter,
    });

    return apiSuccess({
      success: true,
      action: "crm_sync_retry",
      result,
      safety: {
        adminOnly: true,
        sameOriginRequired: true,
        confirmationRequired: "RETRY_CRM_SYNC",
        crmSyncOnly: true,
        smsEmailSent: false,
        metaMutation: false,
        stripeBillingProviderAction: false,
        providerGeneration: false,
        provisioning: false,
        workflowEnrollment: false,
        tokensExposed: false,
        credentialRefsExposed: false,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return handleApiError(error, "Fulfillment CRM retry");
  }
}
