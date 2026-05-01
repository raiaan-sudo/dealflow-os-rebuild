import { z } from "zod";
import {
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
  parseOptionalJsonBody,
  withRouteTimeout,
} from "@/lib/api/route";
import { logOperationalEvent } from "@/lib/logging";
import { runSystemJobWorkerBatch } from "@/lib/services/system-job-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const runnerInputSchema = z.object({
  maxCycles: z.number().int().min(1).max(5).optional(),
  staleAfterMs: z.number().int().min(60_000).max(60 * 60_000).optional(),
}).strict();

type RunnerInput = z.infer<typeof runnerInputSchema>;

function parseIntegerParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function inputFromQuery(request: Request): RunnerInput {
  const url = new URL(request.url);
  return runnerInputSchema.parse({
    maxCycles: parseIntegerParam(url.searchParams.get("maxCycles")),
    staleAfterMs: parseIntegerParam(url.searchParams.get("staleAfterMs")),
  });
}

async function runInternalSystemJobs(request: Request, input: RunnerInput) {
  assertInternalSystemRequest(request);

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const result = await withRouteTimeout(
    runSystemJobWorkerBatch({
      maxCycles: input.maxCycles ?? 3,
      staleAfterMs: input.staleAfterMs,
    }),
    {
      timeoutMs: 55_000,
      message: "Internal system job runner timed out.",
      code: "internal_runner_timeout",
    },
  );
  const durationMs = Date.now() - startedAt;

  logOperationalEvent("internal.system_jobs_runner.completed", {
    requestId,
    processedJobIds: result.processedJobIds,
    resetCount: result.resetCount,
    cycles: result.cycles,
    exhausted: result.exhausted,
    durationMs,
  });

  return apiSuccess(
    {
      success: true,
      requestId,
      durationMs,
      ...result,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Internal-Job-Runner": "system-jobs",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}

export async function GET(request: Request) {
  try {
    return await runInternalSystemJobs(request, inputFromQuery(request));
  } catch (error) {
    return handleApiError(error, "Internal system jobs runner");
  }
}

export async function POST(request: Request) {
  try {
    const input = await parseOptionalJsonBody(request, runnerInputSchema, {});
    return await runInternalSystemJobs(request, input);
  } catch (error) {
    return handleApiError(error, "Internal system jobs runner");
  }
}
