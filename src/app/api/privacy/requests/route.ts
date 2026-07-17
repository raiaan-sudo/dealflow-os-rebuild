import { z } from "zod";
import { assertSameOriginRequest, handleApiError, parseJsonBody } from "@/lib/api/route";
import {
  createPrivacyRequest,
  getPrivacyRequestOverview,
} from "@/lib/services/privacy-request-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  requestType: z.enum(["access", "correction", "export"]),
  idempotencyKey: z.string().min(16).max(128),
  correctionDetails: z.string().trim().max(2_000).optional(),
}).strict();

export async function GET() {
  try {
    return Response.json(await getPrivacyRequestOverview(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error, "Privacy request status");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const body = await parseJsonBody(request, requestSchema, {
      maxBytes: 4 * 1024,
      code: "privacy_request_body_too_large",
    });
    const result = await createPrivacyRequest(body);
    return Response.json({ request: result }, { status: 202 });
  } catch (error) {
    return handleApiError(error, "Privacy request");
  }
}
