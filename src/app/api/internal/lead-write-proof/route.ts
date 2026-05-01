import { z } from "zod";
import {
  ApiError,
  assertInternalSystemRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { logOperationalEvent } from "@/lib/logging";
import { handleLeadCaptureRequest } from "@/app/api/lead-capture/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const internalLeadWriteProofSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  campaignId: z.string().uuid(),
  notes: z.string().trim().max(1000).optional(),
  stage: z.enum(["onboarding", "generated", "launched"]).optional(),
  load_test: z.literal(true),
}).strict();

function getLoadProofSecret() {
  return process.env.LEAD_CAPTURE_LOAD_TEST_SECRET?.trim() ?? "";
}

function assertFakeLead(payload: z.infer<typeof internalLeadWriteProofSchema>) {
  const validName = payload.name.startsWith("Load Test");
  const validEmail = payload.email.toLowerCase().endsWith("@example.com");

  if (!validName || !validEmail) {
    throw new ApiError(403, "Internal lead-write proof only accepts fake test leads.", "lead_write_proof_fake_only");
  }
}

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);

    if (process.env.LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED !== "true") {
      throw new ApiError(503, "Internal lead-write proof is not enabled.", "lead_write_proof_disabled");
    }

    const loadProofSecret = getLoadProofSecret();
    if (loadProofSecret.length < 32) {
      throw new ApiError(503, "Internal lead-write proof secret is not configured.", "lead_write_proof_secret_missing");
    }

    const payload = await parseJsonBody(request, internalLeadWriteProofSchema, {
      maxBytes: 16 * 1024,
      code: "lead_write_proof_body_too_large",
    });
    assertFakeLead(payload);

    logOperationalEvent("lead_write_proof.accepted", {
      campaignId: payload.campaignId,
      emailDomain: "example.com",
    });

    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    headers.set("x-dealflow-load-test-secret", loadProofSecret);

    return handleLeadCaptureRequest(new Request(request.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...payload,
        load_test: true,
        stage: payload.stage ?? "generated",
        notes: payload.notes ?? "Internal production-region lead-write proof.",
      }),
    }));
  } catch (error) {
    return handleApiError(error, "Internal lead-write proof");
  }
}
