import { ApiError } from "@/lib/api/route";
import { getAiEnv, getHiggsfieldMarketingStudioEnv, getMediaGenerationProvider } from "@/lib/env";
import { checkHiggsfieldMarketingStudioReadiness } from "@/lib/ai/higgsfield";
import { logOperationalEvent, logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Database, Json } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MARKETING_STUDIO_WORKER_RUNTIME,
  isMarketingStudioStaticGenerationPayload,
  isMarketingStudioWorkerRuntimeEnabled,
} from "@/lib/services/marketing-studio-worker-contract";
import {
  appendSystemJobLog,
  processSystemJob,
  type SystemJobRecord,
} from "@/lib/services/system-job-service";

type SystemJobRow = Database["public"]["Tables"]["system_jobs"]["Row"];
type WorkerClient = SupabaseClient<Database>;

export type MarketingStudioWorkerReadiness = {
  ready: boolean;
  runtime: typeof MARKETING_STUDIO_WORKER_RUNTIME;
  checks: {
    workerEnabled: boolean;
    providerSelected: boolean;
    usageGuardEnabled: boolean;
    studioEnabled: boolean;
    cliMode: boolean;
    cliEnabled: boolean;
    cliReady: boolean;
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
    throw new ApiError(503, "Supabase service role is not configured.", "config_missing");
  }

  return client;
}

function parseJob(row: SystemJobRow) {
  return row as unknown as SystemJobRecord<"static_creative_generation">;
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
    studioEnabled: studio.enabled === true,
    cliMode: studio.mode === "cli",
    cliEnabled: studio.cliEnabled === true,
    cliReady: cli.ready === true,
    visionQaEnabled: process.env.FINISHED_AD_VISION_QA_ENABLED === "true",
    visionQaConfigured: Boolean(ai),
  };
  const missing = [
    checks.workerEnabled ? null : "MARKETING_STUDIO_WORKER_ENABLED=true",
    checks.providerSelected ? null : "MEDIA_GENERATION_PROVIDER=higgsfield_marketing_studio",
    checks.usageGuardEnabled ? null : "ALLOW_HIGGSFIELD_IMAGE_GENERATION=true",
    checks.studioEnabled ? null : "HIGGSFIELD_MARKETING_STUDIO_ENABLED=true",
    checks.cliMode ? null : "HIGGSFIELD_MARKETING_STUDIO_MODE=cli",
    checks.cliEnabled ? null : "HIGGSFIELD_CLI_ENABLED=true",
    checks.cliReady ? null : cli.reason ?? "HIGGSFIELD_CLI_PATH executable readiness",
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
    .eq("kind", "static_creative_generation")
    .in("status", ["pending", "processing"])
    .is("dead_lettered_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new ApiError(500, error.message, "marketing_studio_worker_job_list_failed");
  }

  return ((Array.isArray(data) ? data : []) as SystemJobRow[])
    .map(parseJob)
    .filter((job) => {
      if (!isMarketingStudioStaticGenerationPayload(job.payload)) {
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

  for (const job of jobs) {
    await appendSystemJobLog({
      supabase,
      jobId: job.id,
      message: "Marketing Studio CLI worker claimed finished-ad render.",
      details: {
        runtime: MARKETING_STUDIO_WORKER_RUNTIME,
      } as Json,
    });

    const processed = await processSystemJob(job.id);
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
