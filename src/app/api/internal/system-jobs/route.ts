import { z } from "zod";
import {
  ApiError,
  apiSuccess,
  assertInternalSystemRequest,
  handleApiError,
  parseOptionalJsonBody,
} from "@/lib/api/route";
import { logError, logOperationalEvent } from "@/lib/logging";
import {
  runSystemJobWorkerBatch,
  runSystemJobWorkerKindBatch,
} from "@/lib/services/system-job-service";
import { runIsolatedSystemJobStages } from "@/lib/services/system-job-orchestrator";
import { processSupportNotificationOutbox } from "@/lib/services/support-ticket-service";
import { processScheduledCampaignLaunchBatch } from "@/lib/services/scheduled-campaign-launch-service";
import { processGhlProviderWorkerFromEnvironment } from "@/lib/services/ghl-provider-worker-service";
import {
  enqueueDueMetaReportingSyncJobs,
  refreshMetaReportingFreshnessAlerts,
} from "@/lib/services/meta-reporting-worker-service";
import { processMetaCampaignActivationFromEnvironment } from "@/lib/services/meta-campaign-activation-service";
import { processMetaOptimizationExecutionBatch } from "@/lib/services/meta-optimization-execution-service";
import { processScheduledAccountDeletionWork } from "@/lib/services/account-deletion-service";
import {
  buildRateLimitResponse,
  consumeRateLimit,
  getRateLimitKey,
} from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel must be given an explicit ceiling for this multi-worker route. The
// runner stops taking new claims one minute earlier so every claimed worker can
// settle its lease before the platform terminates the invocation.
export const maxDuration = 300;

const SYSTEM_JOBS_WORK_BUDGET_MS = 240_000;
const SYSTEM_JOBS_MIN_STAGE_BUDGET_MS = 30_000;

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
  const deadlineAt = startedAt + SYSTEM_JOBS_WORK_BUDGET_MS;
  const assertStageCanStart = (stage: string) => {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs < SYSTEM_JOBS_MIN_STAGE_BUDGET_MS) {
      logOperationalEvent("internal.system_jobs_runner.deadline_exhausted", {
        requestId,
        stage,
        remainingMs: Math.max(0, remainingMs),
      });
      throw new ApiError(
        503,
        "The system-job invocation reached its safe claim deadline; the next invocation will continue.",
        "system_jobs_safe_deadline_exhausted",
      );
    }
  };

  // Each bounded subsystem is isolated. A poison row or provider/config error
  // is recorded for its stage while independent lead, support, reporting, and
  // optimizer work continues. Authorization and the global safe deadline are
  // the only invocation-wide abort boundaries.
  const stages = await runIsolatedSystemJobStages([
    {
      name: "scheduled_meta_launch",
      run: () => processScheduledCampaignLaunchBatch({ maxClaims: 1 }),
    },
    {
      name: "meta_activation",
      run: () => processMetaCampaignActivationFromEnvironment({ maxClaims: 1 }),
    },
    {
      name: "ghl_provider",
      run: () => processGhlProviderWorkerFromEnvironment({
        maxProvisioningSteps: 1,
        maxLeadItems: 3,
        maxReconciliationItems: 1,
      }),
    },
    {
      name: "support_outbox",
      run: () => processSupportNotificationOutbox(5),
    },
    {
      name: "account_deletion",
      run: () => processScheduledAccountDeletionWork({ maxTasks: 5 }),
    },
    {
      name: "reporting_enqueue",
      run: () => enqueueDueMetaReportingSyncJobs(50),
    },
    {
      name: "reporting_worker",
      run: () => runSystemJobWorkerKindBatch({
        kind: "meta_reporting_sync",
        maxCycles: 25,
        concurrency: 5,
      }),
    },
    {
      name: "durable_system_jobs",
      run: () => runSystemJobWorkerBatch({
        maxCycles: Math.min(input.maxCycles ?? 5, 5),
        staleAfterMs: input.staleAfterMs,
      }),
    },
    {
      name: "reporting_freshness",
      run: () => refreshMetaReportingFreshnessAlerts(),
    },
    {
      name: "meta_optimization",
      run: () => processMetaOptimizationExecutionBatch({ maxClaims: 1 }),
    },
  ], {
    canStart: assertStageCanStart,
    onFailure: ({ stage, errorCode }) => {
      logOperationalEvent("internal.system_jobs_runner.stage_failed", {
        requestId,
        stage,
        errorCode,
      });
    },
  });
  const value = <T,>(stage: string, fallback: T) =>
    stages[stage]?.status === "passed"
      ? stages[stage].value as T
      : fallback;
  const scheduledLaunches = value("scheduled_meta_launch", {
    enabled: false,
    blockedReason: "stage_failed",
    claimedCount: 0,
    completedIds: [] as string[],
  });
  const metaActivations = value("meta_activation", {
    enabled: false,
    blockedReason: "stage_failed",
    claimedCount: 0,
    completedIds: [] as string[],
    operatorRequiredIds: [] as string[],
    finalizationRecovery: { examinedCount: 0, finalizedCount: 0, operatorRequiredCount: 0 },
  });
  const ghlProvider = value("ghl_provider", null as Awaited<ReturnType<typeof processGhlProviderWorkerFromEnvironment>> | null);
  const supportOutbox = value("support_outbox", {
    claimedCount: 0,
    deliveredIds: [] as string[],
  });
  const accountDeletion = value("account_deletion", {
    enabled: false,
    blockedReason: "stage_failed",
    workerId: null as string | null,
    claimed: 0,
    results: [] as Array<{ taskId: string; kind: string; outcome: string; code: string }>,
  });
  const reportingEnqueue = value("reporting_enqueue", { enqueuedCount: 0 });
  const reportingWorker = value("reporting_worker", {
    processedJobIds: [] as string[], resetCount: 0, cycles: 0, exhausted: false,
  });
  const result = value("durable_system_jobs", {
    processedJobIds: [] as string[], resetCount: 0, cycles: 0, exhausted: false,
  });
  const reportingFreshnessRows = value("reporting_freshness", 0);
  const metaOptimization = value("meta_optimization", {
    enabled: false,
    blockedReason: "stage_failed",
    claimedCount: 0,
    completedIds: [] as string[],
    operatorRequiredIds: [] as string[],
  });
  const outerFailedStages = Object.entries(stages)
    .filter(([, stage]) => stage.status === "failed")
    .map(([stage, result]) => ({ stage, errorCode: result.errorCode }));
  const ghlComponentFailures = ghlProvider
    ? (["provisioning", "personalization", "reconciliation", "delivery"] as const)
      .flatMap((component) => {
        const componentResult = ghlProvider[component] as unknown;
        if (!componentResult || typeof componentResult !== "object"
          || !("status" in componentResult)
          || componentResult.status !== "failed") return [];
        const candidateCode = "blockedReason" in componentResult
          && typeof componentResult.blockedReason === "string"
          ? componentResult.blockedReason.trim()
          : "";
        return [{
          stage: `ghl_provider.${component}`,
          errorCode: /^[a-z0-9_:-]{3,180}$/.test(candidateCode)
            ? candidateCode
            : `ghl_${component}_worker_failed`,
        }];
      })
    : [];
  const failedStages = [...outerFailedStages, ...ghlComponentFailures];
  const reconciliationSummary = ghlProvider
    && "summary" in ghlProvider.reconciliation
    && ghlProvider.reconciliation.summary
    && typeof ghlProvider.reconciliation.summary === "object"
    ? ghlProvider.reconciliation.summary
    : { outcomeCounts: {} as Record<string, number>, operatorActionCodes: [] as string[] };
  const reconciliationOperatorRequired = Number(
    reconciliationSummary.outcomeCounts.operator_action_required ?? 0,
  );
  const durationMs = Date.now() - startedAt;

  if (failedStages.length > 0) {
    logError("internal.system_jobs_runner.partial_failure", {
      requestId,
      durationMs,
      failedStages,
    });
  }
  if (reconciliationOperatorRequired > 0) {
    logError("internal.system_jobs_runner.ghl_reconciliation_operator_action_required", {
      requestId,
      count: reconciliationOperatorRequired,
      codes: reconciliationSummary.operatorActionCodes,
    });
  }

  logOperationalEvent("internal.system_jobs_runner.completed", {
    requestId,
    processedJobIds: result.processedJobIds,
    resetCount: result.resetCount,
    cycles: result.cycles,
    exhausted: result.exhausted,
    supportOutboxClaimed: supportOutbox.claimedCount,
    supportOutboxDelivered: supportOutbox.deliveredIds.length,
    accountDeletionEnabled: accountDeletion.enabled,
    accountDeletionBlockedReason: accountDeletion.blockedReason,
    accountDeletionClaimed: accountDeletion.claimed,
    accountDeletionSettled: accountDeletion.results.length,
    scheduledLaunchesEnabled: scheduledLaunches.enabled,
    scheduledLaunchesBlockedReason: scheduledLaunches.blockedReason,
    scheduledLaunchesClaimed: scheduledLaunches.claimedCount,
    scheduledLaunchesCompleted: scheduledLaunches.completedIds.length,
    reportingJobsEnqueued: reportingEnqueue.enqueuedCount,
    reportingFreshnessRows,
    reportingJobsProcessed: reportingWorker.processedJobIds.length,
    failedStageCount: failedStages.length,
    ghlEnvironment: ghlProvider?.environment ?? null,
    ghlProvisioningProcessed: ghlProvider?.provisioning.processed ?? 0,
    ghlProvisioningBlockedReason: ghlProvider && "blockedReason" in ghlProvider.provisioning
      ? ghlProvider.provisioning.blockedReason
      : null,
    ghlPersonalizationProcessed: ghlProvider?.personalization.processed ?? 0,
    ghlPersonalizationBlockedReason: ghlProvider && "blockedReason" in ghlProvider.personalization
      ? ghlProvider.personalization.blockedReason
      : null,
    ghlReconciliationProcessed: ghlProvider?.reconciliation.processed ?? 0,
    ghlReconciliationOutcomeCounts: reconciliationSummary.outcomeCounts,
    ghlReconciliationOperatorRequired: reconciliationOperatorRequired,
    ghlReconciliationOperatorActionCodes: reconciliationSummary.operatorActionCodes,
    ghlDeliveryProcessed: ghlProvider?.delivery.processed ?? 0,
    ghlDeliveryBlockedReason: ghlProvider && "blockedReason" in ghlProvider.delivery
      ? ghlProvider.delivery.blockedReason
      : null,
    metaActivationsEnabled: metaActivations.enabled,
    metaActivationsBlockedReason: metaActivations.blockedReason,
    metaActivationsClaimed: metaActivations.claimedCount,
    metaActivationsCompleted: metaActivations.completedIds.length,
    metaActivationsOperatorRequired: metaActivations.operatorRequiredIds.length,
    metaActivationAuthorizationsExamined: metaActivations.finalizationRecovery.examinedCount,
    metaActivationAuthorizationsFinalized: metaActivations.finalizationRecovery.finalizedCount,
    metaActivationAuthorizationsOperatorRequired: metaActivations.finalizationRecovery.operatorRequiredCount,
    metaOptimizationEnabled: metaOptimization.enabled,
    metaOptimizationBlockedReason: metaOptimization.blockedReason,
    metaOptimizationClaimed: metaOptimization.claimedCount,
    metaOptimizationCompleted: metaOptimization.completedIds.length,
    metaOptimizationOperatorRequired: metaOptimization.operatorRequiredIds.length,
    durationMs,
  });

  return apiSuccess(
    {
      success: failedStages.length === 0,
      requestId,
      durationMs,
      ...result,
      supportOutbox,
      accountDeletion,
      scheduledLaunches,
      reporting: {
        ...reportingEnqueue,
        worker: reportingWorker,
        freshnessRows: reportingFreshnessRows,
      },
      ghlProvider,
      metaActivations,
      metaOptimization,
      stages,
      failedStages,
    },
    {
      status: failedStages.length > 0 ? 503 : 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Internal-Job-Runner": "system-jobs",
        "X-Robots-Tag": "noindex",
        ...(failedStages.length > 0 ? { "Retry-After": "60" } : {}),
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
