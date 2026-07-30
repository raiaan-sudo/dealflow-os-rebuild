#!/usr/bin/env node

import { createServer } from "node:http";
import {
  HIGGSFIELD_MAX_PROVIDER_CREDITS_PER_JOB,
  inspectHiggsfieldCliHealth,
  type HiggsfieldCliConfig,
} from "../src/lib/ai/higgsfield-cli";
import { installVerifiedDurableWorkerRuntime } from "../src/lib/durable-worker-runtime-attestation";
import { getHiggsfieldGenerationEnv } from "../src/lib/env";
import { logError, logOperationalEvent } from "../src/lib/logging";
import {
  assertDurableWorkerCanClaim,
  DurableWorkerAuthorityError,
  higgsfieldDeferredJobReason,
  readDurableWorkerAuthority,
  verifyEncryptedOauthVolume,
  verifyImmutableWorkerGeneration,
  type DurableWorkerAuthority,
} from "../src/lib/services/durable-worker-authority";
import { processScheduledAccountDeletionWork } from "../src/lib/services/account-deletion-service";
import { processGhlProviderWorkerFromEnvironment } from "../src/lib/services/ghl-provider-worker-service";
import { processMetaCampaignActivationFromEnvironment } from "../src/lib/services/meta-campaign-activation-service";
import { processMetaOptimizationExecutionBatch } from "../src/lib/services/meta-optimization-execution-service";
import {
  enqueueDueMetaReportingSyncJobs,
  refreshMetaReportingFreshnessAlerts,
} from "../src/lib/services/meta-reporting-worker-service";
import { processScheduledCampaignLaunchBatch } from "../src/lib/services/scheduled-campaign-launch-service";
import { runIsolatedSystemJobStages } from "../src/lib/services/system-job-orchestrator";
import {
  runSystemJobWorkerBatch,
  runSystemJobWorkerKindBatch,
} from "../src/lib/services/system-job-service";
import { processSupportNotificationOutbox } from "../src/lib/services/support-ticket-service";

type WorkerState = {
  bootedAt: string;
  draining: boolean;
  tickInFlight: boolean;
  lastTickAt: string | null;
  lastSuccessfulTickAt: string | null;
  lastErrorCode: string | null;
  higgsfieldStatus: string;
  higgsfieldOperatorActionRequired: boolean;
  shutdownDeadlineExceeded: boolean;
};

const state: WorkerState = {
  bootedAt: new Date().toISOString(),
  draining: false,
  tickInFlight: false,
  lastTickAt: null,
  lastSuccessfulTickAt: null,
  lastErrorCode: null,
  higgsfieldStatus: "not_checked",
  higgsfieldOperatorActionRequired: false,
  shutdownDeadlineExceeded: false,
};

function safeErrorCode(error: unknown) {
  const candidate =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "durable_worker_tick_failed";
  return /^[a-z0-9_:-]{3,160}$/.test(candidate)
    ? candidate
    : "durable_worker_tick_failed";
}

function requiredHiggsfieldConfig(): HiggsfieldCliConfig | null {
  if (process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION !== "true") return null;
  const env = getHiggsfieldGenerationEnv();
  if (
    !env ||
    env.authMode !== "official_cli_oauth" ||
    !env.credentialsValid ||
    !env.cliPath ||
    !env.cliSha256 ||
    !env.configHome ||
    !env.cliEnabled ||
    env.maxProviderCredits === null ||
    env.maxProviderCredits > HIGGSFIELD_MAX_PROVIDER_CREDITS_PER_JOB
  ) {
    throw new DurableWorkerAuthorityError(
      "durable_worker_higgsfield_configuration_invalid",
      "The durable worker requires the exact official Higgsfield CLI OAuth configuration.",
    );
  }
  return {
    cliPath: env.cliPath,
    cliSha256: env.cliSha256,
    configHome: env.configHome,
    workspaceId: env.workspaceId,
    model: env.model,
    resolution: env.resolution,
    durationSeconds: env.durationSeconds,
    generateAudio: env.generateAudio,
    maxProviderCredits: env.maxProviderCredits,
  };
}

async function assertRuntimeCanClaim(authority: DurableWorkerAuthority) {
  assertDurableWorkerCanClaim(authority);
  await verifyImmutableWorkerGeneration(authority);
  await verifyEncryptedOauthVolume(authority);
}

async function refreshHiggsfieldHealth() {
  try {
    const higgsfield = requiredHiggsfieldConfig();
    if (!higgsfield) {
      state.higgsfieldStatus = "generation_disabled";
      state.higgsfieldOperatorActionRequired = false;
      return true;
    }
    const health = await inspectHiggsfieldCliHealth(higgsfield);
    state.higgsfieldStatus = health.status;
    state.higgsfieldOperatorActionRequired = health.operatorActionRequired;
    return health.ready && !health.operatorActionRequired;
  } catch (error) {
    state.higgsfieldStatus = safeErrorCode(error);
    state.higgsfieldOperatorActionRequired = true;
    logError("durable_worker.higgsfield_unavailable", {
      errorCode: state.higgsfieldStatus,
    });
    return false;
  }
}

async function runTick(authority: DurableWorkerAuthority) {
  await assertRuntimeCanClaim(authority);
  const safeTickDeadlineAt = Date.now() + 240_000;
  const higgsfieldReady = await refreshHiggsfieldHealth();
  if (process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION !== "true") {
    state.higgsfieldStatus = "generation_disabled";
    state.higgsfieldOperatorActionRequired = false;
  }
  const assertStageCanStart = () => {
    if (state.draining) {
      throw new DurableWorkerAuthorityError(
        "durable_worker_draining",
        "The durable worker is draining and cannot take another claim.",
      );
    }
    if (Date.now() >= safeTickDeadlineAt - 5_000) {
      throw new DurableWorkerAuthorityError(
        "system_jobs_safe_deadline_exhausted",
        "The safe worker-cycle deadline was exhausted before another stage could start.",
      );
    }
    assertDurableWorkerCanClaim(readDurableWorkerAuthority());
  };
  const workerIdentity = authority.workerIdentityPrefix;
  const stages = await runIsolatedSystemJobStages(
    [
      {
        name: "scheduled_meta_launch",
        run: () => processScheduledCampaignLaunchBatch({ maxClaims: 1 }),
      },
      {
        name: "meta_activation",
        run: () =>
          processMetaCampaignActivationFromEnvironment({ maxClaims: 1 }),
      },
      {
        name: "ghl_provider",
        run: () =>
          processGhlProviderWorkerFromEnvironment({
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
        run: () =>
          processScheduledAccountDeletionWork({
            maxTasks: 5,
            workerId: `${workerIdentity}:account-deletion`,
          }),
      },
      {
        name: "reporting_enqueue",
        run: () => enqueueDueMetaReportingSyncJobs(50),
      },
      {
        name: "reporting_worker",
        run: () =>
          runSystemJobWorkerKindBatch({
            kind: "meta_reporting_sync",
            maxCycles: 25,
            concurrency: 5,
            workerIdentityPrefix: workerIdentity,
          }),
      },
      {
        name: "durable_system_jobs",
        run: () =>
          runSystemJobWorkerBatch({
            maxCycles: 5,
            workerIdentityPrefix: workerIdentity,
            shouldDeferJob: (job) =>
              higgsfieldDeferredJobReason(job.kind, higgsfieldReady),
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
    ],
    {
      canStart: assertStageCanStart,
      onFailure: ({ stage, errorCode }) => {
        logError("durable_worker.stage_failed", { stage, errorCode });
      },
    },
  );
  const failedStages = Object.entries(stages)
    .filter(([, result]) => result.status === "failed")
    .map(([stage, result]) => ({ stage, errorCode: result.errorCode }));
  if (failedStages.length > 0) {
    const error = new DurableWorkerAuthorityError(
      "durable_worker_partial_failure",
      "One or more isolated durable-worker stages failed.",
    );
    Object.assign(error, { failedStages });
    throw error;
  }
  return { stageCount: Object.keys(stages).length };
}

function healthPayload(authority: DurableWorkerAuthority) {
  const recentSuccess =
    state.lastSuccessfulTickAt !== null &&
    Date.now() - Date.parse(state.lastSuccessfulTickAt) <=
      Math.max(60_000, authority.pollIntervalMs * 4);
  const ready =
    !state.draining &&
    authority.executionState === "active" &&
    authority.providerState === "active" &&
    recentSuccess &&
    state.lastErrorCode === null;
  return {
    schema: "dealflow.durable-worker-health.v1",
    live: true,
    ready,
    generation: authority.generation,
    instanceId: authority.instanceId,
    executionState: authority.executionState,
    providerState: authority.providerState,
    bootedAt: state.bootedAt,
    draining: state.draining,
    tickInFlight: state.tickInFlight,
    lastTickAt: state.lastTickAt,
    lastSuccessfulTickAt: state.lastSuccessfulTickAt,
    lastErrorCode: state.lastErrorCode,
    higgsfield: {
      status: state.higgsfieldStatus,
      operatorActionRequired: state.higgsfieldOperatorActionRequired,
      maxProviderCreditsPerJob: HIGGSFIELD_MAX_PROVIDER_CREDITS_PER_JOB,
    },
    shutdownDeadlineExceeded: state.shutdownDeadlineExceeded,
  };
}

function startHealthServer(authority: DurableWorkerAuthority) {
  const server = createServer((request, response) => {
    const payload = healthPayload(authority);
    const readinessRequest = request.url === "/health/ready";
    const recognized =
      readinessRequest ||
      request.url === "/health/live" ||
      request.url === "/health";
    const status = !recognized ? 404 : readinessRequest && !payload.ready ? 503 : 200;
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(
      `${JSON.stringify(
        recognized ? payload : { error: "not_found" },
      )}\n`,
    );
  });
  server.listen(authority.healthPort, "0.0.0.0");
  return server;
}

let wakeWaiter: (() => void) | null = null;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (wakeWaiter === finish) wakeWaiter = null;
      resolve();
    };
    timer = setTimeout(finish, ms);
    wakeWaiter = finish;
  });
}

async function main() {
  const authority = readDurableWorkerAuthority();
  await verifyImmutableWorkerGeneration(authority);
  await verifyEncryptedOauthVolume(authority);
  installVerifiedDurableWorkerRuntime(authority.generation);
  const healthServer = startHealthServer(authority);
  const shutdownGraceMs = Math.min(
    270_000,
    Math.max(
      30_000,
      Number(process.env.DEALFLOW_WORKER_SHUTDOWN_GRACE_MS ?? 240_000),
    ),
  );
  const startDrain = (signal: string) => {
    if (state.draining) return;
    state.draining = true;
    logOperationalEvent("durable_worker.draining", {
      signal,
      tickInFlight: state.tickInFlight,
    });
    wakeWaiter?.();
    const deadlineMonitor = setTimeout(() => {
      state.shutdownDeadlineExceeded = true;
      logError("durable_worker.shutdown_operator_action_required", {
        tickInFlight: state.tickInFlight,
      });
    }, shutdownGraceMs);
    deadlineMonitor.unref();
  };
  process.on("SIGTERM", () => startDrain("SIGTERM"));
  process.on("SIGINT", () => startDrain("SIGINT"));

  while (!state.draining) {
    const currentAuthority = readDurableWorkerAuthority();
    if (
      currentAuthority.executionState !== "active" ||
      currentAuthority.providerState !== "active"
    ) {
      state.lastErrorCode =
        currentAuthority.executionState !== "active"
          ? "durable_worker_quiesced"
          : "durable_provider_execution_quiesced";
      await wait(currentAuthority.pollIntervalMs);
      continue;
    }
    state.tickInFlight = true;
    state.lastTickAt = new Date().toISOString();
    try {
      const result = await runTick(currentAuthority);
      state.lastSuccessfulTickAt = new Date().toISOString();
      state.lastErrorCode = null;
      logOperationalEvent("durable_worker.tick_completed", {
        stageCount: result.stageCount,
        generation: currentAuthority.generation,
      });
    } catch (error) {
      state.lastErrorCode = safeErrorCode(error);
      logError("durable_worker.tick_failed", {
        errorCode: state.lastErrorCode,
        generation: currentAuthority.generation,
      });
    } finally {
      state.tickInFlight = false;
    }
    if (!state.draining) await wait(currentAuthority.pollIntervalMs);
  }

  while (state.tickInFlight) await new Promise((resolve) => setTimeout(resolve, 100));
  await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  logOperationalEvent("durable_worker.stopped", {
    generation: authority.generation,
  });
}

main().catch((error) => {
  logError("durable_worker.fatal", { errorCode: safeErrorCode(error) });
  process.exitCode = 1;
});
