import { ApiError } from "@/lib/api/route";
import { retryRouteStep } from "@/lib/api/route";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";
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
  | "campaign_build"
  | "funnel_generation"
  | "creative_generation"
  | "meta_sync"
  | "recommendation_generation"
  | "lead_capture_retry";
export type SystemJobStatus = "pending" | "processing" | "completed" | "failed";
export type SystemJobLifecycleStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "retrying";
export type SystemJobLogLevel = "info" | "warning" | "error";
export type SystemJobWorkerCycleResult = {
  claimedJobId: string | null;
  resetCount: number;
};
export type SystemJobWorkerBatchResult = {
  processedJobIds: string[];
  resetCount: number;
  cycles: number;
  exhausted: boolean;
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
  funnel_generation: {
    source: string;
  };
  creative_generation: {
    source: string;
  };
  meta_sync: {
    source: string;
  };
  recommendation_generation: {
    source: string;
  };
  lead_capture_retry: {
    source: string;
    requestId: string;
    reason: string;
    leadCapture: {
      campaignId: string;
      funnelId: string | null;
      name: string;
      email: string | null;
      phone: string | null;
      stage: string;
      notes: string | null;
    };
  };
};

export type SystemJobTrackingPayload = {
  correlationId: string;
  requestId?: string | null;
  source: string;
  lifecycleStatus: SystemJobLifecycleStatus;
  attemptCount: number;
  maxRetries: number;
  lastErrorCategory: string | null;
  retryEligible: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type SystemJobRecord<K extends SystemJobKind = SystemJobKind> = Omit<SystemJobRow, "kind" | "status" | "payload" | "result"> & {
  kind: K;
  status: SystemJobStatus;
  payload: SystemJobPayloadMap[K] & {
    tracking?: SystemJobTrackingPayload;
  };
  result: Json | null;
  lifecycleStatus?: SystemJobLifecycleStatus;
  correlationId?: string | null;
  lastErrorCategory?: string | null;
  attempt_count?: number;
  max_attempts?: number;
};

function getJobClient() {
  const client = createAdminClient();

  if (!client) {
    throw new ApiError(503, "Supabase service role is not configured.", "config_missing");
  }

  return client;
}

function parseSystemJob(row: SystemJobRow) {
  const job = row as unknown as SystemJobRecord;
  const tracking =
    job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
      ? (job.payload.tracking as SystemJobTrackingPayload | undefined)
      : undefined;

  return {
    ...job,
    lifecycleStatus:
      tracking?.lifecycleStatus ??
      (job.status === "completed"
        ? "succeeded"
        : job.status === "failed"
          ? "failed"
          : job.status === "processing"
            ? "running"
            : "queued"),
    correlationId: tracking?.correlationId ?? null,
    lastErrorCategory: tracking?.lastErrorCategory ?? null,
  } as SystemJobRecord;
}

function isTransientJobError(error: unknown) {
  if (error instanceof ApiError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }

  if (error instanceof Error) {
    return error.name === "AbortError" || /timeout|timed out|rate limit|temporary|network/i.test(error.message);
  }

  return false;
}

function categorizeJobError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 400 || error.status === 401 || error.status === 403 || error.status === 404 || error.status === 422) {
      return "validation_or_access";
    }

    if (error.status === 408 || error.status === 429) {
      return "transient_provider";
    }

    if (error.status >= 500) {
      return "server_or_provider";
    }
  }

  if (error instanceof Error) {
    if (/timeout|timed out|rate limit|temporar|network/i.test(error.message)) {
      return "transient_provider";
    }
  }

  return "unknown";
}

function withTrackingPayload<K extends SystemJobKind>(
  payload: SystemJobPayloadMap[K],
  tracking: SystemJobTrackingPayload,
) {
  return {
    ...(payload ?? {}),
    tracking,
  } as SystemJobPayloadMap[K] & { tracking: SystemJobTrackingPayload };
}

function getJobTracking<K extends SystemJobKind>(job: SystemJobRecord<K>) {
  const payload =
    job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
      ? job.payload
      : null;

  return payload?.tracking ?? null;
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
  idempotencyKey?: string | null;
  maxAttempts?: number;
}) {
  const supabase = params.supabase ?? getJobClient();

  if (params.idempotencyKey?.trim()) {
    const { data: existingRaw, error: existingError } = await supabase
      .from("system_jobs")
      .select("*")
      .eq("idempotency_key", params.idempotencyKey.trim())
      .maybeSingle();

    if (existingError) {
      throw new ApiError(500, existingError.message, "system_job_idempotency_lookup_failed");
    }

    if (existingRaw) {
      return parseSystemJob(existingRaw as SystemJobRow) as SystemJobRecord<K>;
    }
  }

  const { data, error } = await supabase
    .from("system_jobs")
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      campaign_id: params.campaignId ?? null,
      kind: params.kind,
      status: "pending",
      payload: (params.payload ?? {}) as Json,
      idempotency_key: params.idempotencyKey?.trim() || null,
      max_attempts: params.maxAttempts ?? MAX_SYSTEM_JOB_RETRIES + 1,
    } as never)
    .select("*")
    .single();

  if (error || !data) {
    const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : null;
    if (params.idempotencyKey?.trim() && errorCode === "23505") {
      const { data: recoveredRaw, error: recoveredError } = await supabase
        .from("system_jobs")
        .select("*")
        .eq("idempotency_key", params.idempotencyKey.trim())
        .maybeSingle();

      if (!recoveredError && recoveredRaw) {
        return parseSystemJob(recoveredRaw as SystemJobRow) as SystemJobRecord<K>;
      }
    }

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

async function updateSystemJobTracking<K extends SystemJobKind>(params: {
  supabase: SystemJobClient;
  job: SystemJobRecord<K>;
  lifecycleStatus: SystemJobLifecycleStatus;
  attemptCount?: number;
  maxRetries?: number;
  lastErrorCategory?: string | null;
  retryEligible?: boolean;
  requestId?: string | null;
  source?: string;
  startedAt?: string | null;
  completedAt?: string | null;
}) {
  const currentTracking = getJobTracking(params.job);
  const nextTracking: SystemJobTrackingPayload = {
    correlationId: currentTracking?.correlationId ?? crypto.randomUUID(),
    requestId: params.requestId ?? currentTracking?.requestId ?? null,
    source: params.source ?? currentTracking?.source ?? params.job.kind,
    lifecycleStatus: params.lifecycleStatus,
    attemptCount: params.attemptCount ?? currentTracking?.attemptCount ?? 0,
    maxRetries: params.maxRetries ?? currentTracking?.maxRetries ?? 0,
    lastErrorCategory: params.lastErrorCategory ?? currentTracking?.lastErrorCategory ?? null,
    retryEligible: params.retryEligible ?? currentTracking?.retryEligible ?? false,
    createdAt: currentTracking?.createdAt ?? new Date().toISOString(),
    startedAt: params.startedAt ?? currentTracking?.startedAt ?? null,
    completedAt: params.completedAt ?? currentTracking?.completedAt ?? null,
  };

  return updateSystemJob(params.supabase, params.job.id, {
    payload: withTrackingPayload(params.job.payload, nextTracking) as unknown as Json,
  });
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
  const workerId = `vercel:${process.env.VERCEL_REGION ?? "local"}:${crypto.randomUUID()}`;
  const { data, error } = await (supabase as any).rpc("claim_next_system_job", {
    p_worker_id: workerId,
    p_lease_ms: 5 * 60_000,
  });

  if (error) {
    throw new ApiError(500, error.message, "system_job_claim_failed");
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    return null;
  }

  const claimedJob = parseSystemJob(row as SystemJobRow);

  await appendSystemJobLog({
    supabase,
    jobId: claimedJob.id,
    message: `${claimedJob.kind.replace(/_/g, " ")} job started.`,
    details: {
      workerId,
      lockedUntil: claimedJob.locked_until ?? null,
    } as Json,
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
      last_error_code: "system_job_stale_reset",
      started_at: null,
      locked_by: null,
      locked_until: null,
      next_run_at: new Date().toISOString(),
    } as never)
    .eq("status", "processing")
    .or(`locked_until.lte.${new Date().toISOString()},started_at.lt.${staleBefore}`)
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
    last_error_code: null,
    completed_at: null,
    started_at: null,
    locked_by: null,
    locked_until: null,
    next_run_at: new Date().toISOString(),
    dead_lettered_at: null,
    dead_letter_reason: null,
    retry_count: currentJob.retry_count + 1,
    result: null,
  });

  await updateSystemJobTracking({
    supabase,
    job: nextJob,
    lifecycleStatus: "retrying",
    attemptCount: nextJob.retry_count,
    maxRetries: MAX_SYSTEM_JOB_RETRIES,
    retryEligible: true,
  });

  await appendSystemJobLog({
    supabase,
    jobId,
    message: "Job retried.",
  });

  return nextJob;
}

function shouldAutoRetrySystemJob(job: SystemJobRecord, error: unknown) {
  if (job.kind === "video_generation") {
    return false;
  }

  if (job.retry_count >= MAX_SYSTEM_JOB_RETRIES || !(error instanceof ApiError)) {
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
          last_error_code: null,
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
    } else if (processingJob.kind === "lead_capture_retry") {
      const payload = processingJob.payload as SystemJobPayloadMap["lead_capture_retry"];
      const { replayFailedPublicLeadCapture } = await import("@/lib/services/lead-handler-service");
      const replayResult = await replayFailedPublicLeadCapture({
        ...payload.leadCapture,
        source: payload.source,
        requestId: payload.requestId,
        reason: payload.reason,
      });

      result = {
        ...replayResult,
        requestId: payload.requestId,
        retryReason: payload.reason,
      } as Json;
    } else if (
      processingJob.kind === "campaign_build" ||
      processingJob.kind === "funnel_generation" ||
      processingJob.kind === "creative_generation" ||
      processingJob.kind === "meta_sync" ||
      processingJob.kind === "recommendation_generation"
    ) {
      result = {
        childJobIds:
          ((processingJob.payload as SystemJobPayloadMap["campaign_build"])?.childJobIds ?? []) as string[],
      } as Json;
    } else {
      throw new ApiError(
        500,
        `Unsupported system job kind: ${String(processingJob.kind)}`,
        "system_job_kind_unsupported",
      );
    }

    const completedJob = await updateSystemJob(supabase, jobId, {
      status: "completed",
      completed_at: new Date().toISOString(),
      result,
      error_message: null,
      last_error_code: null,
      locked_by: null,
      locked_until: null,
      next_run_at: null,
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
        last_error_code: error instanceof ApiError ? error.code : "system_job_transient_failure",
        retry_count: processingJob.retry_count + 1,
        locked_by: null,
        locked_until: null,
        next_run_at: new Date(Date.now() + 60_000).toISOString(),
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
      last_error_code: error instanceof ApiError ? error.code : "system_job_processing_failed",
      locked_by: null,
      locked_until: null,
      dead_lettered_at: new Date().toISOString(),
      dead_letter_reason: message,
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

export async function runTrackedSystemJob<K extends SystemJobKind, T>(params: {
  organizationId: string;
  userId: string;
  campaignId?: string | null;
  kind: K;
  payload: SystemJobPayloadMap[K];
  requestId?: string | null;
  correlationId?: string;
  maxRetries?: number;
  shouldRetry?: (error: unknown) => boolean;
  operation: (context: {
    jobId: string;
    attempt: number;
    correlationId: string;
    requestId: string | null;
    supabase: SystemJobClient;
  }) => Promise<T>;
  summarizeResult?: (result: T) => Json;
}) {
  const supabase = getJobClient();
  const correlationId = params.correlationId ?? crypto.randomUUID();
  const maxRetries = params.maxRetries ?? 0;
  const createdAt = new Date().toISOString();
  const queuedTracking: SystemJobTrackingPayload = {
    correlationId,
    requestId: params.requestId ?? null,
    source: params.kind,
    lifecycleStatus: "queued",
    attemptCount: 0,
    maxRetries,
    lastErrorCategory: null,
    retryEligible: maxRetries > 0,
    createdAt,
    startedAt: null,
    completedAt: null,
  };

  const job = await createSystemJob({
    supabase,
    organizationId: params.organizationId,
    userId: params.userId,
    campaignId: params.campaignId ?? null,
    kind: params.kind,
    payload: withTrackingPayload(params.payload, queuedTracking),
    maxAttempts: maxRetries + 1,
  });

  logOperationalEvent("system_job.queued", {
    kind: params.kind,
    jobId: job.id,
    campaignId: params.campaignId ?? null,
    correlationId,
    requestId: params.requestId ?? null,
  });

  let attempt = 0;

  const result = await retryRouteStep(
    async () => {
      attempt += 1;
      const startedAt = new Date().toISOString();
      const runningJob = await updateSystemJob(supabase, job.id, {
        status: "processing",
        started_at: startedAt,
        completed_at: null,
        error_message: null,
        last_error_code: null,
      });

      await updateSystemJobTracking({
        supabase,
        job: runningJob as SystemJobRecord<K>,
        lifecycleStatus: attempt > 1 ? "retrying" : "running",
        attemptCount: attempt,
        maxRetries,
        requestId: params.requestId ?? null,
        source: params.kind,
        retryEligible: maxRetries > 0,
        startedAt,
      });

      await appendSystemJobLog({
        supabase,
        jobId: job.id,
        message: attempt > 1 ? `Retry attempt ${attempt} started.` : "Tracked route execution started.",
        details: {
          correlationId,
          requestId: params.requestId ?? null,
          attempt,
          kind: params.kind,
        } as Json,
      });

      logOperationalEvent("system_job.running", {
        kind: params.kind,
        jobId: job.id,
        correlationId,
        requestId: params.requestId ?? null,
        attempt,
      });

      try {
        const output = await params.operation({
          jobId: job.id,
          attempt,
          correlationId,
          requestId: params.requestId ?? null,
          supabase,
        });
        const completedAt = new Date().toISOString();
        const resultPayload = params.summarizeResult ? params.summarizeResult(output) : null;
        const completedJob = await updateSystemJob(supabase, job.id, {
          status: "completed",
          completed_at: completedAt,
          result: resultPayload,
          error_message: null,
          last_error_code: null,
          locked_by: null,
          locked_until: null,
          next_run_at: null,
        });

        await updateSystemJobTracking({
          supabase,
          job: completedJob as SystemJobRecord<K>,
          lifecycleStatus: "succeeded",
          attemptCount: attempt,
          maxRetries,
          requestId: params.requestId ?? null,
          source: params.kind,
          retryEligible: maxRetries > 0,
          startedAt,
          completedAt,
        });

        await appendSystemJobLog({
          supabase,
          jobId: job.id,
          message: "Tracked route execution completed.",
          details: {
            correlationId,
            requestId: params.requestId ?? null,
            attempt,
          } as Json,
        });

        logOperationalEvent("system_job.succeeded", {
          kind: params.kind,
          jobId: job.id,
          correlationId,
          requestId: params.requestId ?? null,
          attempt,
        });

        return { output, jobId: job.id, correlationId };
      } catch (error) {
        const category = categorizeJobError(error);
        const message = error instanceof Error ? error.message : "Tracked route execution failed.";
        const retryEligible = (params.shouldRetry ?? isTransientJobError)(error) && attempt <= maxRetries;
        const failedJob = await updateSystemJob(supabase, job.id, {
          status: retryEligible ? "pending" : "failed",
          error_message: message,
          last_error_code:
            error instanceof ApiError ? error.code : retryEligible ? "system_job_transient_failure" : "system_job_failed",
          completed_at: retryEligible ? null : new Date().toISOString(),
          locked_by: null,
          locked_until: null,
          next_run_at: retryEligible ? new Date(Date.now() + 60_000).toISOString() : null,
          dead_lettered_at: retryEligible ? null : new Date().toISOString(),
          dead_letter_reason: retryEligible ? null : message,
        });

        await updateSystemJobTracking({
          supabase,
          job: failedJob as SystemJobRecord<K>,
          lifecycleStatus: retryEligible ? "retrying" : "failed",
          attemptCount: attempt,
          maxRetries,
          lastErrorCategory: category,
          requestId: params.requestId ?? null,
          source: params.kind,
          retryEligible,
          startedAt,
          completedAt: retryEligible ? null : new Date().toISOString(),
        });

        await appendSystemJobLog({
          supabase,
          jobId: job.id,
          level: retryEligible ? "warning" : "error",
          message: retryEligible
            ? `Tracked route execution will retry after transient failure: ${message}`
            : `Tracked route execution failed: ${message}`,
          details: {
            correlationId,
            requestId: params.requestId ?? null,
            attempt,
            category,
            retryEligible,
          } as Json,
        });

        if (retryEligible) {
          logWarn("system_job.retrying", {
            kind: params.kind,
            jobId: job.id,
            correlationId,
            requestId: params.requestId ?? null,
            attempt,
            category,
            message,
          });
        } else {
          logError("system_job.failed", {
            kind: params.kind,
            jobId: job.id,
            correlationId,
            requestId: params.requestId ?? null,
            attempt,
            category,
            message,
          });
        }

        throw error;
      }
    },
    {
      retries: maxRetries,
      shouldRetry: params.shouldRetry ?? isTransientJobError,
    },
  );

  return result;
}

export async function runSystemJobWorkerCycle(options?: {
  staleAfterMs?: number;
}) : Promise<SystemJobWorkerCycleResult> {
  const result = await runSystemJobWorkerBatch({
    maxCycles: 1,
    staleAfterMs: options?.staleAfterMs,
  });

  return {
    claimedJobId: result.processedJobIds[0] ?? null,
    resetCount: result.resetCount,
  };
}

export async function runSystemJobWorkerBatch(options?: {
  maxCycles?: number;
  staleAfterMs?: number;
}) : Promise<SystemJobWorkerBatchResult> {
  const maxCycles = Math.min(Math.max(Math.trunc(options?.maxCycles ?? 1), 1), 5);
  const resetCount = await resetStaleProcessingSystemJobs(options?.staleAfterMs);
  const processedJobIds: string[] = [];

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const job = await claimNextPendingSystemJob();

    if (!job) {
      return {
        processedJobIds,
        resetCount,
        cycles: cycle,
        exhausted: true,
      };
    }

    await processSystemJob(job.id);
    processedJobIds.push(job.id);
  }

  return {
    processedJobIds,
    resetCount,
    cycles: maxCycles,
    exhausted: false,
  };
}
