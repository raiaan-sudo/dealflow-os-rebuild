import {
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
} from "@/lib/api/route";
import { logOperationalEvent } from "@/lib/logging";
import { processGhlPeriodicFormSweepFromEnvironment } from "@/lib/services/ghl-provider-worker-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The worker stops taking new claims one minute before the platform ceiling.
// Its database settlements use leases no longer than 120 seconds, while each
// individual GET-only provider read is bounded to 30 seconds.
export const maxDuration = 300;
export const GHL_FORM_SWEEP_WORK_BUDGET_MS = 240_000;

async function runGhlFormSweep(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    assertInternalSystemRequest(request);
  } catch (error) {
    logOperationalEvent("internal.ghl_form_sweep.authorization_rejected", {
      requestId,
      errorCode: error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "internal_unauthorized",
    });
    throw error;
  }

  const startedAtMs = Date.now();
  const deadlineAtMs = startedAtMs + GHL_FORM_SWEEP_WORK_BUDGET_MS;
  const result = await processGhlPeriodicFormSweepFromEnvironment({
    deadlineAtMs,
    workerId: `ghl-periodic-form-sweep:${requestId}`,
  });
  const finishedAtMs = Date.now();
  const healthSummary = "healthSummary" in result ? result.healthSummary : null;
  logOperationalEvent("internal.ghl_form_sweep.completed", {
    requestId,
    environment: result.environment,
    status: result.status,
    processed: result.processed,
    refreshed: result.refreshed,
    deadlineExhausted: "deadlineExhausted" in result
      ? result.deadlineExhausted
      : false,
    lagAlertCodes: "lagAlertCodes" in result ? result.lagAlertCodes : [],
    activeCursorCount: healthSummary?.activeCursorCount ?? 0,
    backfillActiveCount: healthSummary?.backfillActiveCount ?? 0,
    lagWarningCount: healthSummary?.lagWarningCount ?? 0,
    cursorOperatorRequiredCount: healthSummary?.cursorOperatorRequiredCount ?? 0,
    refreshOperatorRequiredCount: healthSummary?.refreshOperatorRequiredCount ?? 0,
    maxLagSeconds: healthSummary?.maxLagSeconds ?? 0,
    durationMs: finishedAtMs - startedAtMs,
  });
  return apiSuccess({
    requestId,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - startedAtMs,
    result,
  });
}

export async function GET(request: Request) {
  try {
    return await runGhlFormSweep(request);
  } catch (error) {
    return handleApiError(error, "GHL periodic form sweep");
  }
}

export async function POST(request: Request) {
  try {
    return await runGhlFormSweep(request);
  } catch (error) {
    return handleApiError(error, "GHL periodic form sweep");
  }
}
