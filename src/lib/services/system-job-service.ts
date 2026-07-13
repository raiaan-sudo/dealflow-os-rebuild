import { ApiError } from "@/lib/api/route";
import { retryRouteStep } from "@/lib/api/route";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Database, Json } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { regenerateStaticCreativeAssetsForUser } from "@/lib/services/campaign-persistence";
import {
  pollVideoGenerationStatusJob,
  type VideoGenerationJobPayload,
  type VideoGenerationStatusJobPayload,
  runVideoGenerationJob,
} from "@/lib/services/video-generation-job";
import {
  LeadEffectsIncompleteError,
  resolveLeadEffectPolicy,
  runDurableLeadEffects,
  type LeadEffectKey,
  type MetaCapiConsentEvidence,
} from "@/lib/services/lead-effect-aggregation-service";
import {
  createSystemJobLeaseHeartbeat,
  getSystemJobLease,
  renewSystemJobLease,
  runSystemJobLogBestEffort,
  SYSTEM_JOB_LEASE_MS,
  SystemJobLeaseLostError,
  type SystemJobLease,
  updateSystemJobIfLeaseOwned,
} from "@/lib/services/system-job-lease-service";

type SystemJobRow = Database["public"]["Tables"]["system_jobs"]["Row"];
type SystemJobLogRow = Database["public"]["Tables"]["system_job_logs"]["Row"];
type SystemJobClient = SupabaseClient<Database>;

export type SystemJobKind =
  | "static_creative_generation"
  | "video_generation"
  | "video_generation_status"
  | "campaign_build"
  | "funnel_generation"
  | "creative_generation"
  | "meta_sync"
  | "recommendation_generation"
  | "lead_capture_retry"
  | "meta_leadgen_reconciliation"
  | "meta_reporting_sync"
  | "lead_side_effects";
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
  video_generation_status: VideoGenerationStatusJobPayload;
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
      smsConsent?: boolean | null;
      smsConsentCopy?: string | null;
      consentUrl?: string | null;
      utmSource?: string | null;
      utmMedium?: string | null;
      utmCampaign?: string | null;
      adId?: string | null;
      landingPageUrl?: string | null;
      customAnswers?: Record<string, string>;
    };
  };
  meta_leadgen_reconciliation: {
    source: "meta_leadgen_webhook";
    requestId: string;
    eventId: string;
  };
  meta_reporting_sync: {
    source: "continuous_reporting_scheduler";
    reportingScheduleId: string;
    reportingRunKey: string;
  };
  lead_side_effects: {
    requestId: string;
    enabledEffects?: LeadEffectKey[];
    requiredEffects?: LeadEffectKey[];
    advertisingConsent?: MetaCapiConsentEvidence | null;
    lead: {
      id: string;
      organization_id: string;
      tenant_id?: string | null;
      campaign_id: string;
      campaign_name?: string | null;
      name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      phone?: string | null;
      phone_raw?: string | null;
      phone_e164?: string | null;
      source?: string | null;
      lead_type?: string | null;
      utm_source?: string | null;
      utm_medium?: string | null;
      utm_campaign?: string | null;
      ad_id?: string | null;
      landing_page_url?: string | null;
      created_at?: string | null;
    };
    metaConversion?: {
      organizationId: string;
      leadId: string;
      campaignId: string;
      eventSourceUrl?: string | null;
      eventTime?: string | null;
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      clientIp?: string | null;
      clientUserAgent?: string | null;
      fbp?: string | null;
      fbc?: string | null;
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
  lease_token?: string | null;
  lease_generation?: number;
  lease_heartbeat_at?: string | null;
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

type SystemJobLogWriteParams = {
  supabase?: SystemJobClient;
  jobId: string;
  level?: SystemJobLogLevel;
  message: string;
  details?: Json | null;
};

export async function appendSystemJobLog(params: SystemJobLogWriteParams) {
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

async function appendSystemJobLogBestEffort(params: SystemJobLogWriteParams) {
  return runSystemJobLogBestEffort({
    write: () => appendSystemJobLog(params),
    onFailure: (error) => {
      logWarn("system_job.log_write_failed", {
        jobId: params.jobId,
        level: params.level ?? "info",
        errorCode:
          error instanceof ApiError ? error.code : "system_job_log_write_unexpected",
      });
    },
  });
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
      .eq("organization_id", params.organizationId)
      .eq("user_id", params.userId)
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
        .eq("organization_id", params.organizationId)
        .eq("user_id", params.userId)
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

  await appendSystemJobLogBestEffort({
    supabase,
    jobId: insertedJob.id,
    message: `${params.kind.replace(/_/g, " ")} job queued.`,
  });

  return parseSystemJob(insertedJob) as SystemJobRecord<K>;
}

export async function queueLeadSideEffectsJob(params: {
  organizationId: string;
  userId: string;
  campaignId: string;
  payload: SystemJobPayloadMap["lead_side_effects"];
}) {
  const supabase = getJobClient();
  const effectPolicy = resolveLeadEffectPolicy(
    process.env,
    params.payload.advertisingConsent,
  );
  const { metaConversion, ...basePayload } = params.payload;
  const metaConversionEnabled = effectPolicy.enabledEffects.includes("meta_conversion");
  const payload = {
    ...basePayload,
    ...(metaConversionEnabled && metaConversion ? { metaConversion } : {}),
    enabledEffects: params.payload.enabledEffects ?? effectPolicy.enabledEffects,
    requiredEffects: params.payload.requiredEffects ?? effectPolicy.requiredEffects,
  };
  const idempotencyKey = `lead_side_effects:${params.payload.lead.id}`;
  const insertPayload = {
    organization_id: params.organizationId,
    user_id: params.userId,
    campaign_id: params.campaignId,
    kind: "lead_side_effects",
    status: "pending",
    payload: payload as unknown as Json,
    idempotency_key: idempotencyKey,
    max_attempts: 3,
  };
  const { data, error } = await supabase
    .from("system_jobs")
    .insert(insertPayload as never)
    .select("id")
    .single();

  if (error || !data) {
    const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : null;

    if (errorCode === "23505") {
      const { data: existing, error: existingError } = await supabase
        .from("system_jobs")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
        .eq("organization_id", params.organizationId)
        .eq("user_id", params.userId)
        .maybeSingle();

      const existingRow = existing as { id?: unknown } | null;

      if (!existingError && typeof existingRow?.id === "string") {
        return { id: existingRow.id, enabledEffects: payload.enabledEffects };
      }
    }

    throw new ApiError(
      500,
      error?.message ?? "Lead side effect job could not be queued.",
      "lead_side_effect_job_create_failed",
    );
  }

  const row = data as { id: string };
  logOperationalEvent("system_job.queued", {
    kind: "lead_side_effects",
    jobId: row.id,
    campaignId: params.campaignId,
    requestId: params.payload.requestId,
  });

  return { ...row, enabledEffects: payload.enabledEffects };
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

type SystemJobActorScope = {
  userId: string;
  organizationId: string;
};

export async function getSystemJob(
  jobId: string,
  actor?: string | SystemJobActorScope,
) {
  const supabase = getJobClient();
  let query = supabase.from("system_jobs").select("*").eq("id", jobId);

  if (typeof actor === "string") {
    query = query.eq("user_id", actor);
  } else if (actor) {
    query = query.eq("organization_id", actor.organizationId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "system_job_lookup_failed");
  }

  return data ? parseSystemJob(data as SystemJobRow) : null;
}

export async function listSystemJobs(params: {
  userId: string;
  organizationId?: string;
  campaignId?: string | null;
  statuses?: SystemJobStatus[];
  kind?: SystemJobKind;
}) {
  const supabase = getJobClient();
  let query = supabase
    .from("system_jobs")
    .select("*")
    .order("created_at", { ascending: false });

  query = params.organizationId
    ? query.eq("organization_id", params.organizationId)
    : query.eq("user_id", params.userId);

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

export async function getSystemJobLogs(
  jobId: string,
  actor?: string | SystemJobActorScope,
) {
  const supabase = getJobClient();
  const selection = actor ? "*, system_jobs!inner(user_id,organization_id)" : "*";
  let query = supabase
    .from("system_job_logs")
    .select(selection)
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (typeof actor === "string") {
    query = query.eq("system_jobs.user_id", actor);
  } else if (actor) {
    query = query.eq("system_jobs.organization_id", actor.organizationId);
  }

  const { data, error } = await query;

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
  const { data, error } = await (supabase as any).rpc("claim_next_system_job_v2", {
    p_worker_id: workerId,
    p_lease_ms: SYSTEM_JOB_LEASE_MS,
    p_protocol_version: 2,
  });

  if (error) {
    throw new ApiError(500, error.message, "system_job_claim_failed");
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    return null;
  }

  const claimedJob = parseSystemJob(row as SystemJobRow);

  await appendSystemJobLogBestEffort({
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
  void staleAfterMs;
  const expiredAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("system_jobs")
    .update({
      status: "pending",
      error_message: null,
      last_error_code: "system_job_stale_reset",
      started_at: null,
      locked_by: null,
      locked_until: null,
      lease_token: null,
      lease_heartbeat_at: null,
      next_run_at: new Date().toISOString(),
    } as never)
    .eq("status", "processing")
    .not("locked_until", "is", null)
    .lte("locked_until", expiredAt)
    .select("id");

  if (error) {
    throw new ApiError(500, error.message, "system_job_stale_reset_failed");
  }

  const resetRows = (Array.isArray(data) ? data : []) as Array<{ id: string }>;

  await Promise.all(
    resetRows.map((row) =>
      appendSystemJobLogBestEffort({
        supabase,
        jobId: row.id,
        level: "warning",
        message: "Stale processing job was reset to pending.",
      }),
    ),
  );

  return resetRows.length;
}

export async function retrySystemJob(
  jobId: string,
  actor: string | SystemJobActorScope,
) {
  const supabase = getJobClient();
  const currentJob = await getSystemJob(jobId, actor);

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
    lease_token: null,
    lease_heartbeat_at: null,
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

  await appendSystemJobLogBestEffort({
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

export async function processSystemJob(jobId: string, lease: SystemJobLease) {
  const supabase = getJobClient();
  const job = await getSystemJob(jobId);

  if (!job) {
    throw new ApiError(404, "Job not found.", "system_job_not_found");
  }

  if (job.status === "completed") {
    return job;
  }

  const persistedLease = getSystemJobLease(job);
  if (
    job.status !== "processing" ||
    !persistedLease ||
    persistedLease.jobId !== lease.jobId ||
    persistedLease.workerId !== lease.workerId ||
    persistedLease.token !== lease.token ||
    persistedLease.generation !== lease.generation
  ) {
    throw new ApiError(
      409,
      "System job is not owned by this worker lease.",
      "system_job_lease_lost",
    );
  }

  const processingJob = job;
  await renewSystemJobLease({
    supabase: supabase as any,
    lease,
    leaseMs: SYSTEM_JOB_LEASE_MS,
  }).catch((error) => {
    throw new ApiError(
      409,
      error instanceof Error ? error.message : "System job lease could not be renewed.",
      "system_job_lease_lost",
    );
  });
  const heartbeat = createSystemJobLeaseHeartbeat({
    renew: () =>
      renewSystemJobLease({
        supabase: supabase as any,
        lease,
        leaseMs: SYSTEM_JOB_LEASE_MS,
      }),
  });
  heartbeat.start();

  const fencedUpdate = async (input: Record<string, unknown>) => {
    await heartbeat.stop();
    heartbeat.assertOwned();
    const updated = await updateSystemJobIfLeaseOwned({
      supabase: supabase as any,
      lease,
      input,
    });
    return parseSystemJob(updated as SystemJobRow);
  };

  try {
    let result: Json;

    if (processingJob.kind === "static_creative_generation") {
      const output = await regenerateStaticCreativeAssetsForUser(
        processingJob.campaign_id ?? "",
        processingJob.user_id,
        {
          force: Boolean((processingJob.payload as SystemJobPayloadMap["static_creative_generation"])?.force),
          organizationId: processingJob.organization_id,
          // Provider debit and provider-request idempotency belong to the
          // logical job, not to a renewable worker lease. A reclaimed job must
          // encounter the same reservation after an ambiguous dispatch.
          providerUsageRunId: `${processingJob.id}:static_creative_generation`,
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
        organizationId: processingJob.organization_id,
        userId: processingJob.user_id,
        campaignId: processingJob.campaign_id ?? "",
        payload: processingJob.payload as SystemJobPayloadMap["video_generation"],
        providerUsageAttemptKey: `${processingJob.id}:video_generation`,
      });

      result = output as unknown as Json;
    } else if (processingJob.kind === "video_generation_status") {
      const payload =
        processingJob.payload as SystemJobPayloadMap["video_generation_status"];
      const output = await pollVideoGenerationStatusJob({
        supabase,
        organizationId: processingJob.organization_id,
        userId: processingJob.user_id,
        campaignId: processingJob.campaign_id ?? "",
        payload,
      });

      if (output.status === "processing") {
        const pollAttempt = Math.min((payload.pollAttempt ?? 0) + 1, 120);
        const nextRunAt = new Date(
          Date.now() + Math.min(5 * 60_000, 30_000 + pollAttempt * 15_000),
        ).toISOString();
        const pendingJob = await fencedUpdate({
          status: "pending",
          result: output as unknown as Json,
          payload: {
            ...payload,
            pollAttempt,
          } as unknown as Json,
          error_message: null,
          last_error_code: null,
          locked_by: null,
          locked_until: null,
          lease_token: null,
          lease_heartbeat_at: null,
          next_run_at: nextRunAt,
        });

        await appendSystemJobLogBestEffort({
          supabase,
          jobId: processingJob.id,
          message: "Video render is still processing at the provider; status poll rescheduled.",
          details: {
            providerAssetId: payload.providerAssetId,
            providerStatus: output.providerStatus,
            pollAttempt,
            nextRunAt,
          } as Json,
        });

        return pendingJob;
      }

      result = output as unknown as Json;
    } else if (processingJob.kind === "lead_capture_retry") {
      const payload = processingJob.payload as SystemJobPayloadMap["lead_capture_retry"];
      const { replayFailedPublicLeadCapture } = await import("@/lib/services/lead-handler-service");
      const replayResult = await replayFailedPublicLeadCapture({
        ...payload.leadCapture,
        expectedOrganizationId: processingJob.organization_id,
        expectedUserId: processingJob.user_id,
        expectedCampaignId: processingJob.campaign_id ?? "",
        source: payload.source,
        requestId: payload.requestId,
        reason: payload.reason,
      });

      result = {
        ...replayResult,
        requestId: payload.requestId,
        retryReason: payload.reason,
      } as Json;
    } else if (processingJob.kind === "meta_leadgen_reconciliation") {
      const payload =
        processingJob.payload as SystemJobPayloadMap["meta_leadgen_reconciliation"];
      if (!payload.eventId?.trim() || !payload.requestId?.trim()) {
        throw new ApiError(
          400,
          "Meta leadgen reconciliation payload is incomplete.",
          "meta_leadgen_reconciliation_payload_invalid",
        );
      }
      const { reconcileMetaLeadgenEvent } = await import(
        "@/lib/services/meta-leadgen-ingestion-service"
      );
      const output = await reconcileMetaLeadgenEvent({
        eventId: payload.eventId,
        requestId: payload.requestId,
        workerId: lease.workerId,
        terminalOnFailure:
          Math.max(1, processingJob.attempt_count ?? 1) >=
          Math.max(1, processingJob.max_attempts ?? 1),
      });
      result = output as unknown as Json;
    } else if (processingJob.kind === "meta_reporting_sync") {
      const { processMetaReportingSyncJob } = await import(
        "@/lib/services/meta-reporting-worker-service"
      );
      result = await processMetaReportingSyncJob({
        job: processingJob as SystemJobRecord<"meta_reporting_sync">,
        lease,
      }) as unknown as Json;
    } else if (processingJob.kind === "lead_side_effects") {
      const payload = processingJob.payload as SystemJobPayloadMap["lead_side_effects"];
      if (
        processingJob.organization_id !== payload.lead.organization_id ||
        (payload.metaConversion &&
          payload.metaConversion.organizationId !== payload.lead.organization_id) ||
        processingJob.campaign_id !== payload.lead.campaign_id
      ) {
        throw new ApiError(
          409,
          "Lead side-effect tenant or campaign scope does not match the claimed parent job.",
          "lead_side_effect_scope_mismatch",
        );
      }
      const currentPolicy = resolveLeadEffectPolicy(
        process.env,
        payload.advertisingConsent,
      );
      const enabledEffects = (payload.enabledEffects ?? currentPolicy.enabledEffects).filter(
        (effect) => currentPolicy.enabledEffects.includes(effect),
      );
      const requiredEffects = (payload.requiredEffects ?? currentPolicy.requiredEffects).filter(
        (effect) => currentPolicy.requiredEffects.includes(effect),
      );
      const { safeNotifyAssignedAgentOfNewLead } = await import("@/lib/services/internal-lead-notification-service");
      const { safeSendMetaLeadConversion } = await import("@/lib/integrations/meta/conversions");
      const { ghlProductionGateFromEnvironment, ghlSandboxGateFromEnvironment } = await import("@/lib/integrations/gohighlevel");
      const { enqueueGhlSandboxLeadDelivery } = await import("@/lib/services/ghl-sandbox-enqueue-service");
      const { enqueueGhlProductionLeadDelivery } = await import("@/lib/services/ghl-production-enqueue-service");
      const { getDeploymentTarget } = await import("@/lib/deployment-target");
      const effectSummary = await runDurableLeadEffects({
        client: supabase as any,
        jobId: processingJob.id,
        organizationId: payload.lead.organization_id,
        leadId: payload.lead.id,
        requestId: payload.requestId,
        workerId: lease.workerId,
        leaseToken: lease.token,
        leaseGeneration: lease.generation,
        enabledEffects,
        requiredEffects,
        notifyAgent: () => safeNotifyAssignedAgentOfNewLead(payload.lead),
        sendMetaConversion: () =>
          payload.metaConversion
            ? safeSendMetaLeadConversion({
                ...payload.metaConversion,
                advertisingConsent: payload.advertisingConsent ?? null,
              })
            : Promise.resolve({ sent: false, reason: "meta_capi_consent_missing" } as const),
        enqueueGhlDelivery: () => getDeploymentTarget(process.env) === "production"
          ? enqueueGhlProductionLeadDelivery({
            client: supabase as any,
            gate: ghlProductionGateFromEnvironment("lead_delivery", process.env),
            organizationId: payload.lead.organization_id,
            leadId: payload.lead.id,
          })
          : enqueueGhlSandboxLeadDelivery({
            client: supabase as any,
            gate: ghlSandboxGateFromEnvironment(process.env),
            organizationId: payload.lead.organization_id,
            leadId: payload.lead.id,
          }),
      });

      logOperationalEvent("lead_capture.side_effects_processed", {
        requestId: payload.requestId,
        leadId: payload.lead.id,
        organizationId: payload.lead.organization_id,
        jobId: processingJob.id,
        allRequiredSucceeded: effectSummary.allRequiredSucceeded,
        effects: effectSummary.effects.map((effect) => ({
          key: effect.key,
          status: effect.status,
          required: effect.required,
          attemptCount: effect.attemptCount,
          reused: effect.reused,
        })),
      });

      result = effectSummary as unknown as Json;
    } else if (
      processingJob.kind === "campaign_build" ||
      processingJob.kind === "funnel_generation" ||
      processingJob.kind === "creative_generation" ||
      processingJob.kind === "meta_sync" ||
      processingJob.kind === "recommendation_generation"
    ) {
      throw new ApiError(
        500,
        `${processingJob.kind} was queued as an inline-tracked job and cannot be replayed by the cron worker without a resumable processor.`,
        "system_job_inline_replay_unsupported",
      );
    } else {
      throw new ApiError(
        500,
        `Unsupported system job kind: ${String(processingJob.kind)}`,
        "system_job_kind_unsupported",
      );
    }

    const completedJob = await fencedUpdate({
      status: "completed",
      completed_at: new Date().toISOString(),
      result,
      error_message: null,
      last_error_code: null,
      locked_by: null,
      locked_until: null,
      lease_token: null,
      lease_heartbeat_at: null,
      next_run_at: null,
    });

    await appendSystemJobLogBestEffort({
      supabase,
      jobId,
      message: `${processingJob.kind.replace(/_/g, " ")} job completed.`,
      details: result,
    });

    return completedJob;
  } catch (error) {
    if (error instanceof SystemJobLeaseLostError || heartbeat.hasLostLease()) {
      await heartbeat.stop();
      logWarn("system_job.lease_lost", {
        jobId,
        kind: processingJob.kind,
        workerId: lease.workerId,
        leaseGeneration: lease.generation,
      });
      throw new ApiError(
        409,
        error instanceof Error ? error.message : "System job lease was lost.",
        "system_job_lease_lost",
      );
    }

    const message =
      error instanceof Error ? error.message : "Job processing failed.";
    const leadEffectFailure =
      error instanceof LeadEffectsIncompleteError ? error : null;
    const currentAttempt = Math.max(1, processingJob.attempt_count ?? 1);
    const maxAttempts = Math.max(1, processingJob.max_attempts ?? 1);
    const legacyAutoRetry = shouldAutoRetrySystemJob(processingJob, error);
    const leadEffectRetry = Boolean(
      leadEffectFailure?.retryable && currentAttempt < maxAttempts,
    );
    const metaLeadgenRetry = Boolean(
      processingJob.kind === "meta_leadgen_reconciliation" &&
      error instanceof ApiError &&
      error.status >= 500 &&
      currentAttempt < maxAttempts
    );
    const metaReportingRetry = Boolean(
      processingJob.kind === "meta_reporting_sync" &&
      (!(error instanceof ApiError) || error.status === 408 || error.status === 429 || error.status >= 500) &&
      currentAttempt < maxAttempts
    );
    const retryEligible = legacyAutoRetry || leadEffectRetry || metaLeadgenRetry || metaReportingRetry;

    if (retryEligible) {
      const retriedJob = await fencedUpdate({
        status: "pending",
        completed_at: null,
        started_at: null,
        error_message: message,
        last_error_code:
          leadEffectFailure?.code ??
          (error instanceof ApiError ? error.code : "system_job_transient_failure"),
        retry_count:
          processingJob.retry_count + (legacyAutoRetry || metaLeadgenRetry || metaReportingRetry ? 1 : 0),
        locked_by: null,
        locked_until: null,
        lease_token: null,
        lease_heartbeat_at: null,
        next_run_at: new Date(
          Date.now() + Math.min(
            metaReportingRetry ? 15 * 60_000 : 5 * 60_000,
            (metaReportingRetry ? 60_000 : 30_000) * 2 ** Math.max(0, currentAttempt - 1),
          ),
        ).toISOString(),
        result: leadEffectFailure?.summary
          ? (leadEffectFailure.summary as unknown as Json)
          : null,
      });

      await appendSystemJobLogBestEffort({
        supabase,
        jobId,
        level: "warning",
        message: `Job retry scheduled after transient failure: ${message}`,
        details: leadEffectFailure?.summary
          ? (leadEffectFailure.summary as unknown as Json)
          : null,
      });

      return retriedJob;
    }

    const failedJob = await fencedUpdate({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: message,
      last_error_code:
        leadEffectFailure?.code ??
        (error instanceof ApiError ? error.code : "system_job_processing_failed"),
      locked_by: null,
      locked_until: null,
      lease_token: null,
      lease_heartbeat_at: null,
      dead_lettered_at: new Date().toISOString(),
      dead_letter_reason: message,
      result: leadEffectFailure?.summary
        ? (leadEffectFailure.summary as unknown as Json)
        : null,
    });

    await appendSystemJobLogBestEffort({
      supabase,
      jobId,
      level: "error",
      message,
      details: leadEffectFailure?.summary
        ? (leadEffectFailure.summary as unknown as Json)
        : null,
    });

    return failedJob;
  } finally {
    await heartbeat.stop();
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

      await appendSystemJobLogBestEffort({
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

        await appendSystemJobLogBestEffort({
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

        await appendSystemJobLogBestEffort({
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

    const lease = getSystemJobLease(job);
    if (!lease) {
      throw new ApiError(
        500,
        "Claimed system job did not include a durable lease token and generation.",
        "system_job_claim_lease_missing",
      );
    }

    await processSystemJob(job.id, lease);
    processedJobIds.push(job.id);
  }

  return {
    processedJobIds,
    resetCount,
    cycles: maxCycles,
    exhausted: false,
  };
}
