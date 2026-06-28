import {
  apiSuccess,
  handleApiError,
} from "@/lib/api/route";
import { assertInternalOperatorAccess } from "@/lib/services/internal-launch-monitor";
import { loadFulfillmentMonitorData } from "@/lib/services/fulfillment-monitor-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await assertInternalOperatorAccess();

    const data = await loadFulfillmentMonitorData({ limit: 25 });

    return apiSuccess({
      success: true,
      health: data.health,
      rowCount: data.rows.length,
      safety: {
        adminOnly: true,
        readOnlyHealthCheck: true,
        dbMutation: false,
        ghlContactWrite: false,
        ghlOpportunityWrite: false,
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
    return handleApiError(error, "Fulfillment health check");
  }
}
