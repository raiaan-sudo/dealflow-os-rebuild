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
  isMarketingStudioStaticGenerationJob,
  MARKETING_STUDIO_WORKER_DEFERRED_UNTIL,
  MARKETING_STUDIO_WORKER_RUNTIME,
  shouldDeferMarketingStudioStaticGenerationToWorker,
} from "@/lib/services/marketing-studio-worker-contract";
import type { CreativeIntakeGenerationContext } from "@/lib/services/creative-chat-intake-service";
import type { SubscriptionSuspensionJobPayload } from "@/lib/services/subscription-suspension-service";

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
  | "lead_side_effects"
  | "subscription_suspension";
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
const SYSTEM_JOB_LEASE_MS = 5 * 60_000;
const SYSTEM_JOB_STALE_BUFFER_MS = 60_000;
const MIN_STALE_PROCESSING_RESET_MS = SYSTEM_JOB_LEASE_MS + SYSTEM_JOB_STALE_BUFFER_MS;
const SUBSCRIPTION_GATED_JOB_KINDS = new Set<SystemJobKind>([
  "static_creative_generation",
  "video_generation",
  "video_generation_status",
  "meta_sync",
  "recommendation_generation",
]);

type SystemJobPayloadMap = {
  static_creative_generation: {
    force?: boolean;
    missingOnly?: boolean;
    maxGenerations?: number;
    creativeIntake?: CreativeIntakeGenerationContext | null;
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
    };
  };
  lead_side_effects: {
    requestId: string;
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
    metaConversion: {
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
  subscription_suspension: SubscriptionSuspensionJobPayload;
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

function hasActiveProcessingLease(job: SystemJobRecord) {
  if (job.status !== "processing" || !job.locked_by || !job.locked_until) {
    return false;
  }

  const lockedUntil = Date.parse(job.locked_until);
  return Number.isFinite(lockedUntil) && lockedUntil > Date.now();
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
  const deferToMarketingStudioWorker = isMarketingStudioStaticGenerationJob({
    kind: params.kind,
    payload: params.payload,
  });

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
      next_run_at: deferToMarketingStudioWorker ? MARKETING_STUDIO_WORKER_DEFERRED_UNTIL : null,
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

  await appendSystemJobLog({
    supabase,
    jobId: insertedJob.id,
    message: deferToMarketingStudioWorker
      ? "Marketing Studio finished-ad render queued for the dedicated CLI worker."
      : `${params.kind.replace(/_/g, " ")} job queued.`,
    details: deferToMarketingStudioWorker
      ? {
          runtime: MARKETING_STUDIO_WORKER_RUNTIME,
          deferredUntil: MARKETING_STUDIO_WORKER_DEFERRED_UNTIL,
        } as Json
      : undefined,
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
  const idempotencyKey = `lead_side_effects:${params.payload.lead.id}`;
  const insertPayload = {
    organization_id: params.organizationId,
    user_id: params.userId,
    campaign_id: params.campaignId,
    kind: "lead_side_effects",
    status: "pending",
    payload: params.payload as unknown as Json,
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
        return { id: existingRow.id };
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

  return row;
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

export async function getSystemJobLogs(jobId: string, userId?: string) {
  const supabase = getJobClient();
  const selection = userId ? "*, system_jobs!inner(user_id)" : "*";
  let query = supabase
    .from("system_job_logs")
    .select(selection)
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (userId) {
    query = query.eq("system_jobs.user_id", userId);
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
  const { data, error } = await (supabase as any).rpc("claim_next_system_job", {
    p_worker_id: workerId,
    p_lease_ms: SYSTEM_JOB_LEASE_MS,
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

export async function claimSystemJobByIdForWorker(params: {
  jobId: string;
  workerId: string;
  supabase?: SystemJobClient;
  ignoreNextRunAt?: boolean;
}) {
  const supabase = params.supabase ?? getJobClient();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + SYSTEM_JOB_LEASE_MS).toISOString();
  let query = supabase
    .from("system_jobs")
    .update({
      status: "processing",
      started_at: now.toISOString(),
      locked_by: params.workerId,
      locked_until: lockedUntil,
      error_message: null,
      last_error_code: null,
    } as never)
    .eq("id", params.jobId)
    .eq("status", "pending");

  if (params.ignoreNextRunAt !== true) {
    query = query.or(`next_run_at.is.null,next_run_at.lte.${now.toISOString()}`);
  }

  const { data, error } = await query.select("*").maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "system_job_claim_failed");
  }

  if (!data) {
    return null;
  }

  const claimedJob = parseSystemJob(data as SystemJobRow);

  await appendSystemJobLog({
    supabase,
    jobId: claimedJob.id,
    message: `${claimedJob.kind.replace(/_/g, " ")} job claimed by worker.`,
    details: {
      workerId: params.workerId,
      lockedUntil: claimedJob.locked_until ?? null,
    } as Json,
  });

  return claimedJob;
}

export async function resetStaleProcessingSystemJobs(staleAfterMs = 10 * 60_000) {
  const supabase = getJobClient();
  const effectiveStaleAfterMs = Math.max(staleAfterMs, MIN_STALE_PROCESSING_RESET_MS);
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - effectiveStaleAfterMs).toISOString();
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
    .lt("started_at", staleBefore)
    .or(`locked_until.is.null,locked_until.lt.${now}`)
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

  if (!hasActiveProcessingLease(job)) {
    throw new ApiError(
      409,
      "System job must be atomically claimed before processing.",
      "system_job_not_claimed",
    );
  }

  if (shouldDeferMarketingStudioStaticGenerationToWorker({
    kind: job.kind,
    payload: job.payload,
  })) {
    const deferredJob = await updateSystemJob(supabase, jobId, {
      status: "pending",
      started_at: null,
      completed_at: null,
      error_message: null,
      last_error_code: null,
      locked_by: null,
      locked_until: null,
      next_run_at: MARKETING_STUDIO_WORKER_DEFERRED_UNTIL,
    });

    await appendSystemJobLog({
      supabase,
      jobId,
      message: "Marketing Studio finished-ad render deferred to the dedicated CLI worker.",
      details: {
        runtime: MARKETING_STUDIO_WORKER_RUNTIME,
        deferredUntil: MARKETING_STUDIO_WORKER_DEFERRED_UNTIL,
      } as Json,
    });

    return deferredJob;
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
    let result: Json | undefined;

    if (
      processingJob.campaign_id &&
      SUBSCRIPTION_GATED_JOB_KINDS.has(processingJob.kind)
    ) {
      const { getCampaignEntitlementsForCampaign } = await import("@/lib/services/campaign-entitlements");
      const entitlements = await getCampaignEntitlementsForCampaign(processingJob.campaign_id);

      if (entitlements.requiresSuspension) {
        result = {
          skipped: true,
          reason: "subscription_inactive",
          campaignId: processingJob.campaign_id,
          billingState: entitlements.billingState,
        } as Json;
      }
    }

    if (result === undefined && processingJob.kind === "static_creative_generation") {
      const output = await regenerateStaticCreativeAssetsForUser(
        processingJob.campaign_id ?? "",
        processingJob.user_id,
        {
          force: Boolean((processingJob.payload as SystemJobPayloadMap["static_creative_generation"])?.force),
          missingOnly: Boolean((processingJob.payload as SystemJobPayloadMap["static_creative_generation"])?.missingOnly),
          maxGenerations:
            typeof (processingJob.payload as SystemJobPayloadMap["static_creative_generation"])?.maxGenerations === "number"
              ? (processingJob.payload as SystemJobPayloadMap["static_creative_generation"]).maxGenerations
              : undefined,
          creativeIntake:
            (processingJob.payload as SystemJobPayloadMap["static_creative_generation"])?.creativeIntake ?? null,
          providerUsageRunId: `${processingJob.id}:${processingJob.attempt_count ?? 0}`,
          supabase,
        },
      );

      result = {
        staticAds: output.creatives.staticAds,
        campaignId: processingJob.campaign_id,
      } as Json;
    } else if (result === undefined && processingJob.kind === "video_generation") {
      const output = await runVideoGenerationJob({
        supabase,
        userId: processingJob.user_id,
        campaignId: processingJob.campaign_id ?? "",
        payload: processingJob.payload as SystemJobPayloadMap["video_generation"],
        providerUsageRunId: `${processingJob.id}:${processingJob.attempt_count ?? 0}`,
      });

      result = output as unknown as Json;
    } else if (result === undefined && processingJob.kind === "video_generation_status") {
      const payload =
        processingJob.payload as SystemJobPayloadMap["video_generation_status"];
      const output = await pollVideoGenerationStatusJob({
        supabase,
        userId: processingJob.user_id,
        campaignId: processingJob.campaign_id ?? "",
        payload,
      });

      if (output.status === "processing") {
        const pollAttempt = Math.min((payload.pollAttempt ?? 0) + 1, 120);
        const nextRunAt = new Date(
          Date.now() + Math.min(5 * 60_000, 30_000 + pollAttempt * 15_000),
        ).toISOString();
        const pendingJob = await updateSystemJob(supabase, processingJob.id, {
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
          next_run_at: nextRunAt,
        });

        await appendSystemJobLog({
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
    } else if (result === undefined && processingJob.kind === "lead_capture_retry") {
      const payload = processingJob.payload as SystemJobPayloadMap["lead_capture_retry"];
      const { getPublicFunnelEntitlements } = await import("@/lib/services/campaign-entitlements");
      const entitlementContext = await getPublicFunnelEntitlements({
        campaignId: payload.leadCapture.campaignId,
        funnelSlug: payload.leadCapture.funnelId,
      });

      if (!entitlementContext.entitlements.canCaptureLeads) {
        result = {
          skipped: true,
          reason: "subscription_inactive",
          requestId: payload.requestId,
          campaignId: payload.leadCapture.campaignId,
          billingState: entitlementContext.entitlements.billingState,
        } as Json;
      } else {
        const { replayFailedPublicLeadCapture } = await import("@/lib/services/lead-handler-service");
        const replayResult = await replayFailedPublicLeadCapture({
          ...payload.leadCapture,
          source: payload.source,
          requestId: payload.requestId,
          reason: payload.reason,
        });

        let sideEffectJobId: string | null = null;
        if (replayResult.leadId && replayResult.campaignId && replayResult.organizationId) {
          const sideEffectJob = await queueLeadSideEffectsJob({
            organizationId: replayResult.organizationId,
            userId: processingJob.user_id,
            campaignId: replayResult.campaignId,
            payload: {
              requestId: payload.requestId,
              lead: {
                id: replayResult.leadId,
                organization_id: replayResult.organizationId,
                campaign_id: replayResult.campaignId,
                name: payload.leadCapture.name,
                email: payload.leadCapture.email,
                phone: payload.leadCapture.phone,
                phone_raw: payload.leadCapture.phone,
                source: payload.source,
                utm_source: payload.leadCapture.utmSource,
                utm_medium: payload.leadCapture.utmMedium,
                utm_campaign: payload.leadCapture.utmCampaign,
                ad_id: payload.leadCapture.adId,
                landing_page_url: payload.leadCapture.landingPageUrl,
              },
              metaConversion: {
                organizationId: replayResult.organizationId,
                leadId: replayResult.leadId,
                campaignId: replayResult.campaignId,
                eventSourceUrl: payload.leadCapture.landingPageUrl ?? payload.leadCapture.consentUrl,
                name: payload.leadCapture.name,
                email: payload.leadCapture.email,
                phone: payload.leadCapture.phone,
              },
            },
          });
          sideEffectJobId = sideEffectJob.id;
        }

        result = {
          ...replayResult,
          requestId: payload.requestId,
          retryReason: payload.reason,
          sideEffectJobId,
        } as Json;
      }
    } else if (result === undefined && processingJob.kind === "lead_side_effects") {
      const payload = processingJob.payload as SystemJobPayloadMap["lead_side_effects"];
      const { getCampaignEntitlementsForOrganization } = await import("@/lib/services/campaign-entitlements");
      const entitlements = await getCampaignEntitlementsForOrganization({
        organizationId: payload.lead.organization_id,
      });

      if (!entitlements.canCaptureLeads || !entitlements.canSendLeadAlerts) {
        result = {
          skipped: true,
          reason: "subscription_inactive",
          requestId: payload.requestId,
          leadId: payload.lead.id,
          organizationId: payload.lead.organization_id,
          billingState: entitlements.billingState,
        } as Json;
      } else {
      const { safeNotifyAssignedAgentOfNewLead } = await import("@/lib/services/internal-lead-notification-service");
      const { safeSendMetaLeadConversion } = await import("@/lib/integrations/meta/conversions");
      const [notificationResult, metaConversionResult] = await Promise.all([
        safeNotifyAssignedAgentOfNewLead(payload.lead),
        safeSendMetaLeadConversion(payload.metaConversion),
      ]);

      logOperationalEvent("lead_capture.side_effects_processed", {
        requestId: payload.requestId,
        leadId: payload.lead.id,
        organizationId: payload.lead.organization_id,
        jobId: processingJob.id,
        notificationResult,
        metaConversionResult,
      });

      result = {
        requestId: payload.requestId,
        leadId: payload.lead.id,
        notificationResult,
        metaConversionResult,
      } as Json;
      }
    } else if (result === undefined && processingJob.kind === "subscription_suspension") {
      const { runSubscriptionSuspensionJob } = await import("@/lib/services/subscription-suspension-service");
      result = await runSubscriptionSuspensionJob({
        job: processingJob as SystemJobRecord<"subscription_suspension">,
      });
    } else if (result === undefined && (
      processingJob.kind === "campaign_build" ||
      processingJob.kind === "funnel_generation" ||
      processingJob.kind === "creative_generation" ||
      processingJob.kind === "meta_sync" ||
      processingJob.kind === "recommendation_generation"
    )) {
      throw new ApiError(
        500,
        `${processingJob.kind} was queued as an inline-tracked job and cannot be replayed by the cron worker without a resumable processor.`,
        "system_job_inline_replay_unsupported",
      );
    } else if (result === undefined) {
      throw new ApiError(
        500,
        `Unsupported system job kind: ${String(processingJob.kind)}`,
        "system_job_kind_unsupported",
      );
    }

    const completedJob = await updateSystemJob(supabase, jobId, {
      status: "completed",
      completed_at: new Date().toISOString(),
      result: result as Json,
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
