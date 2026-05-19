import { z } from "zod";
import {
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
  parseOptionalJsonBody,
} from "@/lib/api/route";
import {
  runScaleMonitor,
  runSyntheticScaleMonitorProof,
} from "@/lib/services/scale-monitor-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

const monitorInputSchema = z.object({
  synthetic: z.boolean().optional().default(false),
  includeSmoke: z.boolean().optional().default(true),
  includeSupportIncident: z.boolean().optional(),
  resolveAfterCleanChecks: z.number().int().min(1).max(10).optional(),
}).strict();

async function runInternalScaleMonitor(request: Request) {
  assertInternalSystemRequest(request);

  const result = await runScaleMonitor({
    mode: "scheduled",
  });

  return apiSuccess(result, {
    headers: {
      "Cache-Control": "no-store",
      "X-Internal-Scale-Monitor": "scheduled",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function GET(request: Request) {
  try {
    return await runInternalScaleMonitor(request);
  } catch (error) {
    return handleApiError(error, "Internal scale monitor");
  }
}

export async function POST(request: Request) {
  try {
    assertInternalSystemRequest(request);
    const input = await parseOptionalJsonBody(request, monitorInputSchema, {
      synthetic: false,
      includeSmoke: true,
    });

    if (input.synthetic) {
      return apiSuccess(await runSyntheticScaleMonitorProof(), {
        headers: {
          "Cache-Control": "no-store",
          "X-Internal-Scale-Monitor": "synthetic",
          "X-Robots-Tag": "noindex",
        },
      });
    }

    return apiSuccess(
      await runScaleMonitor({
        mode: "manual",
        includeSmoke: input.includeSmoke,
        includeSupportIncident: input.includeSupportIncident,
        resolveAfterCleanChecks: input.resolveAfterCleanChecks,
      }),
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Internal-Scale-Monitor": "manual",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "Internal scale monitor");
  }
}
