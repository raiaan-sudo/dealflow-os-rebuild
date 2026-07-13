import { z } from "zod";
import {
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
  parseOptionalJsonBody,
} from "@/lib/api/route";
import { logOperationalEvent } from "@/lib/logging";
import { runSystemJobWorkerBatch } from "@/lib/services/system-job-service";
import { processSupportNotificationOutbox } from "@/lib/services/support-ticket-service";
import { processScheduledCampaignLaunchBatch } from "@/lib/services/scheduled-campaign-launch-service";
import { processGhlProviderWorkerFromEnvironment } from "@/lib/services/ghl-provider-worker-service";
import {
  enqueueDueMetaReportingSyncJobs,
  refreshMetaReportingFreshnessAlerts,
} from "@/lib/services/meta-reporting-worker-service";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getRateLimitKey,
} from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const requestId = crypto.randomUUID();
  const authRateLimit = await consumeRateLimit({
    key: getRateLimitKey(request, "internal-system-jobs-auth"),
    limit: 20,
    windowMs: 5 * 60_000,
  });
  if (authRateLimit && !authRateLimit.allowed) {
    logOperationalEvent("internal.system_jobs_runner.rate_limited", { requestId });
    return buildRateLimitResponse(authRateLimit.resetAt);
  }
  try {
    assertInternalSystemRequest(request);
  } catch (error) {
    logOperationalEvent("internal.system_jobs_runner.authorization_rejected", {
      requestId,
      errorCode:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "internal_unauthorized",
    });
    throw error;
  }

  const startedAt = Date.now();
  const [reportingEnqueue, reportingFreshnessRows] = await Promise.all([
    enqueueDueMetaReportingSyncJobs(25),
    refreshMetaReportingFreshnessAlerts(),
  ]);
  const [result, supportOutbox, scheduledLaunches, ghlProvider] = await Promise.all([
    runSystemJobWorkerBatch({
      maxCycles: input.maxCycles ?? 5,
      staleAfterMs: input.staleAfterMs,
    }),
    processSupportNotificationOutbox(25),
    processScheduledCampaignLaunchBatch({ maxClaims: 5 }),
    processGhlProviderWorkerFromEnvironment({
      maxProvisioningSteps: 5,
      maxLeadItems: 10,
    }),
  ]);
  const durationMs = Date.now() - startedAt;

  logOperationalEvent("internal.system_jobs_runner.completed", {
    requestId,
    processedJobIds: result.processedJobIds,
    resetCount: result.resetCount,
    cycles: result.cycles,
    exhausted: result.exhausted,
    supportOutboxClaimed: supportOutbox.claimedCount,
    supportOutboxDelivered: supportOutbox.deliveredIds.length,
    scheduledLaunchesEnabled: scheduledLaunches.enabled,
    scheduledLaunchesBlockedReason: scheduledLaunches.blockedReason,
    scheduledLaunchesClaimed: scheduledLaunches.claimedCount,
    scheduledLaunchesCompleted: scheduledLaunches.completedIds.length,
    reportingJobsEnqueued: reportingEnqueue.enqueuedCount,
    reportingFreshnessRows,
    ghlEnvironment: ghlProvider.environment,
    ghlProvisioningProcessed: ghlProvider.provisioning.processed,
    ghlProvisioningBlockedReason: "blockedReason" in ghlProvider.provisioning
      ? ghlProvider.provisioning.blockedReason
      : null,
    ghlPersonalizationProcessed: ghlProvider.personalization.processed,
    ghlPersonalizationBlockedReason: "blockedReason" in ghlProvider.personalization
      ? ghlProvider.personalization.blockedReason
      : null,
    ghlDeliveryProcessed: ghlProvider.delivery.processed,
    ghlDeliveryBlockedReason: "blockedReason" in ghlProvider.delivery
      ? ghlProvider.delivery.blockedReason
      : null,
    durationMs,
  });

  return apiSuccess(
    {
      success: true,
      requestId,
      durationMs,
      ...result,
      supportOutbox,
      scheduledLaunches,
      reporting: {
        ...reportingEnqueue,
        freshnessRows: reportingFreshnessRows,
      },
      ghlProvider,
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
