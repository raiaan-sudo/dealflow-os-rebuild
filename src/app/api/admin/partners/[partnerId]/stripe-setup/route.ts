import { z } from "zod";
import { ApiError, assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import { setupPartnerStripeProducts } from "@/lib/white-label/partner-stripe-setup";
import { requirePlatformAdmin } from "@/lib/white-label/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const setupSchema = z.object({
  mode: z.enum(["test", "live"]),
  productName: z.string().min(2).max(120).optional(),
  checkoutHeadline: z.string().min(2).max(120).optional(),
  performanceLabel: z.string().min(2).max(120).optional(),
  baseAmountCents: z.number().int().positive().optional(),
  leadAmountCents: z.number().int().positive().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ partnerId: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const auth = await requirePlatformAdmin();
    const authScope = { user_id: auth.user.id };
    const { partnerId } = await params;
    if (!partnerId) {
      throw new ApiError(400, "Partner id is required.", "partner_id_required");
    }

    const body = await parseJsonBody(request, setupSchema);
    const result = await setupPartnerStripeProducts({
      partnerId,
      mode: body.mode,
      productName: body.productName,
      checkoutHeadline: body.checkoutHeadline,
      performanceLabel: body.performanceLabel,
      baseAmountCents: body.baseAmountCents,
      leadAmountCents: body.leadAmountCents,
    });

    return Response.json({
      success: true,
      actor: {
        userId: authScope.user_id,
      },
      setup: result,
    });
  } catch (error) {
    return handleApiError(error, "Partner Stripe setup");
  }
}
