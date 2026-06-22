import { getAiEnv, getHiggsfieldMarketingStudioEnv, getMediaGenerationProvider } from "@/lib/env";
import { checkHiggsfieldMarketingStudioReadiness } from "@/lib/ai/higgsfield";
import { logOperationalEvent, logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Database, Json } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MARKETING_STUDIO_WORKER_RUNTIME,
  isMarketingStudioWorkerOwnedJob,
  isMarketingStudioWorkerRuntimeEnabled,
} from "@/lib/services/marketing-studio-worker-contract";

type SystemJobRow = Database["public"]["Tables"]["system_jobs"]["Row"];
type WorkerClient = SupabaseClient<Database>;
type SystemJobRecord = SystemJobRow & {
  payload: unknown;
};

class WorkerApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code: string) {
    super(message);
    this.name = "WorkerApiError";
    this.status = status;
    this.code = code;
  }
}

export type MarketingStudioWorkerReadiness = {
  ready: boolean;
  runtime: typeof MARKETING_STUDIO_WORKER_RUNTIME;
  checks: {
    workerEnabled: boolean;
    providerSelected: boolean;
    usageGuardEnabled: boolean;
    videoUsageGuardEnabled: boolean;
    studioEnabled: boolean;
    cliMode: boolean;
    cliEnabled: boolean;
    cliReady: boolean;
    ugcVideoModelConfigured: boolean;
    visionQaEnabled: boolean;
    visionQaConfigured: boolean;
  };
  missing: string[];
};

export type MarketingStudioWorkerBatchResult = {
  ready: boolean;
  dryRun: boolean;
  eligibleJobIds: string[];
  processedJobIds: string[];
  skippedReason: string | null;
};

function getWorkerClient() {
  const client = createAdminClient();

  if (!client) {
    throw new WorkerApiError(503, "Supabase service role is not configured.", "config_missing");
  }

  return client;
}

function parseJob(row: SystemJobRow) {
  return row as unknown as SystemJobRecord;
}

async function loadSystemJobProcessor() {
  return import("@/lib/services/system-job-service") as Promise<{
    appendSystemJobLog: typeof import("@/lib/services/system-job-service").appendSystemJobLog;
    claimSystemJobByIdForWorker: typeof import("@/lib/services/system-job-service").claimSystemJobByIdForWorker;
    processSystemJob: typeof import("@/lib/services/system-job-service").processSystemJob;
  }>;
}

function isExpiredLease(value: string | null) {
  return Boolean(value && Date.parse(value) <= Date.now());
}

export async function getMarketingStudioWorkerReadiness(): Promise<MarketingStudioWorkerReadiness> {
  const studio = getHiggsfieldMarketingStudioEnv();
  const cli = await checkHiggsfieldMarketingStudioReadiness();
  const ai = getAiEnv();
  const checks = {
    workerEnabled: isMarketingStudioWorkerRuntimeEnabled(),
    providerSelected: getMediaGenerationProvider() === "higgsfield_marketing_studio",
    usageGuardEnabled: process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION === "true",
    videoUsageGuardEnabled: process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION === "true",
    studioEnabled: studio.enabled === true,
    cliMode: studio.mode === "cli",
    cliEnabled: studio.cliEnabled === true,
    cliReady: cli.ready === true,
    ugcVideoModelConfigured: studio.ugcVideoModel === "marketing_studio_video",
    visionQaEnabled: process.env.FINISHED_AD_VISION_QA_ENABLED === "true",
    visionQaConfigured: Boolean(ai),
  };
  const missing = [
    checks.workerEnabled ? null : "MARKETING_STUDIO_WORKER_ENABLED=true",
    checks.providerSelected ? null : "MEDIA_GENERATION_PROVIDER=higgsfield_marketing_studio",
    checks.usageGuardEnabled ? null : "ALLOW_HIGGSFIELD_IMAGE_GENERATION=true",
    checks.videoUsageGuardEnabled ? null : "ALLOW_HIGGSFIELD_VIDEO_GENERATION=true",
    checks.studioEnabled ? null : "HIGGSFIELD_MARKETING_STUDIO_ENABLED=true",
    checks.cliMode ? null : "HIGGSFIELD_MARKETING_STUDIO_MODE=cli",
    checks.cliEnabled ? null : "HIGGSFIELD_CLI_ENABLED=true",
    checks.cliReady ? null : cli.reason ?? "HIGGSFIELD_CLI_PATH executable readiness",
    checks.ugcVideoModelConfigured ? null : "HIGGSFIELD_UGC_VIDEO_MODEL=marketing_studio_video",
    checks.visionQaEnabled ? null : "FINISHED_AD_VISION_QA_ENABLED=true",
    checks.visionQaConfigured ? null : "AI_API_KEY or OPENAI_API_KEY",
  ].filter(Boolean) as string[];

  return {
    ready: missing.length === 0,
    runtime: MARKETING_STUDIO_WORKER_RUNTIME,
    checks,
    missing,
  };
}

export async function listEligibleMarketingStudioWorkerJobs(params?: {
  supabase?: WorkerClient;
  limit?: number;
}) {
  const supabase = params?.supabase ?? getWorkerClient();
  const limit = Math.min(Math.max(Math.trunc(params?.limit ?? 1), 1), 10);
  const { data, error } = await supabase
    .from("system_jobs")
    .select("*")
    .in("kind", ["static_creative_generation", "video_generation"])
    .in("status", ["pending", "processing"])
    .is("dead_lettered_at", null)
    .is("reviewed_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new WorkerApiError(500, error.message, "marketing_studio_worker_job_list_failed");
  }

  return ((Array.isArray(data) ? data : []) as SystemJobRow[])
    .map(parseJob)
    .filter((job) => {
      if (!isMarketingStudioWorkerOwnedJob({ kind: job.kind, payload: job.payload })) {
        return false;
      }

      if (job.status === "processing" && job.locked_until && !isExpiredLease(job.locked_until)) {
        return false;
      }

      return true;
    })
    .slice(0, limit);
}

export async function runMarketingStudioWorkerBatch(params?: {
  supabase?: WorkerClient;
  maxJobs?: number;
  dryRun?: boolean;
}): Promise<MarketingStudioWorkerBatchResult> {
  const readiness = await getMarketingStudioWorkerReadiness();

  if (!readiness.ready) {
    return {
      ready: false,
      dryRun: params?.dryRun === true,
      eligibleJobIds: [],
      processedJobIds: [],
      skippedReason: `Marketing Studio worker is not ready: ${readiness.missing.join(", ")}`,
    };
  }

  const supabase = params?.supabase ?? getWorkerClient();
  const jobs = await listEligibleMarketingStudioWorkerJobs({
    supabase,
    limit: params?.maxJobs ?? 1,
  });
  const eligibleJobIds = jobs.map((job) => job.id);

  if (params?.dryRun === true) {
    return {
      ready: true,
      dryRun: true,
      eligibleJobIds,
      processedJobIds: [],
      skippedReason: null,
    };
  }

  const processedJobIds: string[] = [];
  const {
    appendSystemJobLog,
    claimSystemJobByIdForWorker,
    processSystemJob,
  } = await loadSystemJobProcessor();

  for (const job of jobs) {
    const workerId = `${MARKETING_STUDIO_WORKER_RUNTIME}:${crypto.randomUUID()}`;
    const claimedJob = await claimSystemJobByIdForWorker({
      supabase,
      jobId: job.id,
      workerId,
      ignoreNextRunAt: true,
    });

    if (!claimedJob) {
      continue;
    }

    await appendSystemJobLog({
      supabase,
      jobId: claimedJob.id,
      message: claimedJob.kind === "video_generation"
        ? "Marketing Studio CLI worker claimed UGC video render."
        : "Marketing Studio CLI worker claimed finished-ad render.",
      details: {
        runtime: MARKETING_STUDIO_WORKER_RUNTIME,
        workerId,
      } as Json,
    });

    const processed = await processSystemJob(claimedJob.id);
    processedJobIds.push(processed.id);
  }

  logOperationalEvent("marketing_studio_worker.batch_completed", {
    runtime: MARKETING_STUDIO_WORKER_RUNTIME,
    eligibleJobIds,
    processedJobIds,
    dryRun: false,
  });

  return {
    ready: true,
    dryRun: false,
    eligibleJobIds,
    processedJobIds,
    skippedReason: null,
  };
}

export async function logMarketingStudioWorkerReadiness() {
  const readiness = await getMarketingStudioWorkerReadiness();

  if (!readiness.ready) {
    logWarn("marketing_studio_worker.not_ready", {
      runtime: readiness.runtime,
      missing: readiness.missing,
      checks: readiness.checks,
    });
  }

  return readiness;
}
