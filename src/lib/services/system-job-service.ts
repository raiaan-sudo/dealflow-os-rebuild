import { ApiError } from "@/lib/api/route";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Database, Json } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { regenerateStaticCreativeAssetsForUser } from "@/lib/services/campaign-persistence";
import {
  type VideoGenerationJobPayload,
  runVideoGenerationJob,
} from "@/lib/services/video-generation-job";

type SystemJobRow = Database["public"]["Tables"]["system_jobs"]["Row"];
type SystemJobLogRow = Database["public"]["Tables"]["system_job_logs"]["Row"];
type SystemJobClient = SupabaseClient<Database>;

export type SystemJobKind =
  | "static_creative_generation"
  | "video_generation"
  | "campaign_build";
export type SystemJobStatus = "pending" | "processing" | "completed" | "failed";
export type SystemJobLogLevel = "info" | "warning" | "error";
export type SystemJobWorkerCycleResult = {
  claimedJobId: string | null;
  resetCount: number;
};

const MAX_SYSTEM_JOB_RETRIES = 1;

type SystemJobPayloadMap = {
  static_creative_generation: {
    force?: boolean;
  };
  video_generation: VideoGenerationJobPayload;
  campaign_build: {
    childJobIds?: string[];
    videoIndexes?: number[];
  };
};

export type SystemJobRecord<K extends SystemJobKind = SystemJobKind> = Omit<SystemJobRow, "kind" | "status" | "payload" | "result"> & {
  kind: K;
  status: SystemJobStatus;
  payload: SystemJobPayloadMap[K];
  result: Json | null;
};

function getJobClient() {
  const client = createAdminClient();

  if (!client) {
    throw new ApiError(503, "Supabase service role is not configured.", "config_missing");
  }

  return client;
}

function parseSystemJob(row: SystemJobRow) {
  return row as unknown as SystemJobRecord;
}

export async function appendSystemJobLog(params: {
  supabase?: SystemJobClient;
  jobId: string;
  level?: SystemJobLogLevel;
  message: string;
  details?: Json | null;
}) {
  const supabase = params.supabase ?? getJobClient();
  const { error } = await supabase.from("system_job_logs").insert({
    job_id: params.jobId,
    level: params.level ?? "info",
    message: params.message,
    details: params.details ?? null,
  } as never);

  if (error) {
    throw new ApiError(500, error.message, "system_job_log_create_failed");
  }
}

export async function createSystemJob<K extends SystemJobKind>(params: {
  supabase?: SystemJobClient;
  organizationId: string;
  userId: string;
  campaignId?: string | null;
  kind: K;
  payload: SystemJobPayloadMap[K];
}) {
  const supabase = params.supabase ?? getJobClient();
  const { data, error } = await supabase
    .from("system_jobs")
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      campaign_id: params.campaignId ?? null,
      kind: params.kind,
      status: "pending",
      payload: (params.payload ?? {}) as Json,
    } as never)
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError(
      500,
      error?.message ?? "System job could not be created.",
      "system_job_create_failed",
    );
  }

  const insertedJob = data as unknown as SystemJobRow;

  await appendSystemJobLog({
    supabase,
    jobId: insertedJob.id,
    message: `${params.kind.replace(/_/g, " ")} job queued.`,
  });

  return parseSystemJob(insertedJob) as SystemJobRecord<K>;
}

export async function getSystemJob(jobId: string, userId?: string) {
  const supabase = getJobClient();
  const query = userId
    ? supabase.from("system_jobs").select("*").eq("id", jobId).eq("user_id", userId)
    : supabase.from("system_jobs").select("*").eq("id", jobId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "system_job_lookup_failed");
  }

  return data ? parseSystemJob(data as SystemJobRow) : null;
}

export async function listSystemJobs(params: {
  userId: string;
  campaignId?: string | null;
  statuses?: SystemJobStatus[];
  kind?: SystemJobKind;
}) {
  const supabase = getJobClient();
  let query = supabase
    .from("system_jobs")
    .select("*")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false });

  if (params.campaignId) {
    query = query.eq("campaign_id", params.campaignId);
  }

  if (params.kind) {
    query = query.eq("kind", params.kind);
  }

  if (params.statuses && params.statuses.length > 0) {
    query = query.in("status", params.statuses);
  }

  const { data, error } = await query;

  if (error) {
    throw new ApiError(500, error.message, "system_job_list_failed");
  }

  return Array.isArray(data) ? data.map((row) => parseSystemJob(row as SystemJobRow)) : [];
}

export async function getSystemJobLogs(jobId: string) {
  const supabase = getJobClient();
  const { data, error } = await supabase
    .from("system_job_logs")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiError(500, error.message, "system_job_log_list_failed");
  }

  return Array.isArray(data) ? (data as SystemJobLogRow[]) : [];
}

async function updateSystemJob(
  supabase: SystemJobClient,
  jobId: string,
  input: Database["public"]["Tables"]["system_jobs"]["Update"],
) {
  const { data, error } = await supabase
    .from("system_jobs")
    .update(input as never)
    .eq("id", jobId)
    .select("*")
    .single();

  if (error || !data) {
    throw new ApiError(
      500,
      error?.message ?? "System job could not be updated.",
      "system_job_update_failed",
    );
  }

  return parseSystemJob(data as SystemJobRow);
}

export async function claimNextPendingSystemJob() {
  const supabase = getJobClient();
  const { data, error } = await supabase
    .from("system_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "system_job_claim_lookup_failed");
  }

  if (!data) {
    return null;
  }

  const candidate = data as SystemJobRow;
  const claimed = await supabase
    .from("system_jobs")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
      completed_at: null,
      error_message: null,
    } as never)
    .eq("id", candidate.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimed.error) {
    throw new ApiError(500, claimed.error.message, "system_job_claim_failed");
  }

  if (!claimed.data) {
    return null;
  }

  const claimedJob = parseSystemJob(claimed.data as SystemJobRow);

  await appendSystemJobLog({
    supabase,
    jobId: claimedJob.id,
    message: `${claimedJob.kind.replace(/_/g, " ")} job started.`,
  });

  return claimedJob;
}

export async function resetStaleProcessingSystemJobs(staleAfterMs = 10 * 60_000) {
  const supabase = getJobClient();
  const staleBefore = new Date(Date.now() - staleAfterMs).toISOString();
  const { data, error } = await supabase
    .from("system_jobs")
    .update({
      status: "pending",
      error_message: null,
      started_at: null,
    } as never)
    .eq("status", "processing")
    .lt("started_at", staleBefore)
    .select("id");

  if (error) {
    throw new ApiError(500, error.message, "system_job_stale_reset_failed");
  }

  const resetRows = (Array.isArray(data) ? data : []) as Array<{ id: string }>;

  await Promise.all(
    resetRows.map((row) =>
      appendSystemJobLog({
        supabase,
        jobId: row.id,
        level: "warning",
        message: "Stale processing job was reset to pending.",
      }).catch(() => null),
    ),
  );

  return resetRows.length;
}

export async function retrySystemJob(jobId: string, userId: string) {
  const supabase = getJobClient();
  const currentJob = await getSystemJob(jobId, userId);

  if (!currentJob) {
    throw new ApiError(404, "Job not found.", "system_job_not_found");
  }

  if (currentJob.retry_count >= MAX_SYSTEM_JOB_RETRIES) {
    throw new ApiError(409, "This job has already used its only retry.", "system_job_retry_limit");
  }

  const nextJob = await updateSystemJob(supabase, jobId, {
    status: "pending",
    error_message: null,
    completed_at: null,
    started_at: null,
    retry_count: currentJob.retry_count + 1,
    result: null,
  });

  await appendSystemJobLog({
    supabase,
    jobId,
    message: "Job retried.",
  });

  return nextJob;
}

function shouldAutoRetrySystemJob(job: SystemJobRecord, error: unknown) {
  if (job.kind !== "video_generation" || job.retry_count >= MAX_SYSTEM_JOB_RETRIES) {
    return false;
  }

  if (!(error instanceof ApiError)) {
    return false;
  }

  return [
    "video_generation_timeout",
    "video_provider_request_failed",
    "video_provider_status_failed",
  ].includes(error.code);
}

export async function processSystemJob(jobId: string) {
  const supabase = getJobClient();
  const job = await getSystemJob(jobId);

  if (!job) {
    throw new ApiError(404, "Job not found.", "system_job_not_found");
  }

  if (job.status === "completed") {
    return job;
  }

  const processingJob =
    job.status === "processing"
      ? job
      : await updateSystemJob(supabase, jobId, {
          status: "processing",
          started_at: new Date().toISOString(),
          error_message: null,
        });

  try {
    let result: Json;

    if (processingJob.kind === "static_creative_generation") {
      const output = await regenerateStaticCreativeAssetsForUser(
        processingJob.campaign_id ?? "",
        processingJob.user_id,
        {
          force: Boolean((processingJob.payload as SystemJobPayloadMap["static_creative_generation"])?.force),
          supabase,
        },
      );

      result = {
        staticAds: output.creatives.staticAds,
        campaignId: processingJob.campaign_id,
      } as Json;
    } else if (processingJob.kind === "video_generation") {
      const output = await runVideoGenerationJob({
        supabase,
        userId: processingJob.user_id,
        campaignId: processingJob.campaign_id ?? "",
        payload: processingJob.payload as SystemJobPayloadMap["video_generation"],
      });

      result = output as unknown as Json;
    } else {
      result = {
        childJobIds:
          ((processingJob.payload as SystemJobPayloadMap["campaign_build"])?.childJobIds ?? []) as string[],
      } as Json;
    }

    const completedJob = await updateSystemJob(supabase, jobId, {
      status: "completed",
      completed_at: new Date().toISOString(),
      result,
    });

    await appendSystemJobLog({
      supabase,
      jobId,
      message: `${processingJob.kind.replace(/_/g, " ")} job completed.`,
      details: result,
    });

    return completedJob;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Job processing failed.";

    if (shouldAutoRetrySystemJob(processingJob, error)) {
      const retriedJob = await updateSystemJob(supabase, jobId, {
        status: "pending",
        completed_at: null,
        started_at: null,
        error_message: message,
        retry_count: processingJob.retry_count + 1,
        result: null,
      });

      await appendSystemJobLog({
        supabase,
        jobId,
        level: "warning",
        message: `Job retry scheduled after transient failure: ${message}`,
      });

      return retriedJob;
    }

    const failedJob = await updateSystemJob(supabase, jobId, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: message,
    });

    await appendSystemJobLog({
      supabase,
      jobId,
      level: "error",
      message,
    });

    return failedJob;
  }
}

export async function runSystemJobWorkerCycle(options?: {
  staleAfterMs?: number;
}) : Promise<SystemJobWorkerCycleResult> {
  const resetCount = await resetStaleProcessingSystemJobs(options?.staleAfterMs);
  const job = await claimNextPendingSystemJob();

  if (!job) {
    return {
      claimedJobId: null,
      resetCount,
    };
  }

  await processSystemJob(job.id);

  return {
    claimedJobId: job.id,
    resetCount,
  };
}
