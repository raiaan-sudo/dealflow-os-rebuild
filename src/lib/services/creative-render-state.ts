export const MARKETING_STUDIO_WORKER_RUNTIME = "marketing_studio_cli_worker";
export const MARKETING_STUDIO_WORKER_DEFERRED_UNTIL = "2099-01-01T00:00:00.000Z";

export type CreativeRenderState =
  | "concept_ready"
  | "queued"
  | "deferred_worker_required"
  | "processing"
  | "provider_processing"
  | "render_ready"
  | "render_failed"
  | "retry_available"
  | "operator_action_required";

export type CreativeRenderJobLike = {
  id?: string | null;
  kind?: string | null;
  status?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  next_run_at?: string | null;
  locked_by?: string | null;
  locked_until?: string | null;
  attempt_count?: number | null;
  retry_count?: number | null;
  max_attempts?: number | null;
  error_message?: string | null;
  last_error_code?: string | null;
};

export type CreativeRenderStateView = {
  state: CreativeRenderState;
  customerLabel: string;
  customerMessage: string;
  customerActionLabel: string | null;
  active: boolean;
  retryAvailable: boolean;
  operatorLabel: string;
  operatorMessage: string;
};

function parseTime(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isMarketingStudioWorkerDeferredRunAt(value?: string | null) {
  const parsed = parseTime(value);
  return parsed !== null && parsed >= Date.parse(MARKETING_STUDIO_WORKER_DEFERRED_UNTIL);
}

export function hasActiveRenderLease(job: CreativeRenderJobLike, now = Date.now()) {
  if (job.status !== "processing" || !job.locked_by || !job.locked_until) {
    return false;
  }

  const lockedUntil = parseTime(job.locked_until);
  return lockedUntil !== null && lockedUntil > now;
}

export function isStaleDeferredCreativeRenderJob(
  job: CreativeRenderJobLike,
  now = Date.now(),
  staleAfterMs = 15 * 60_000,
) {
  if (job.status !== "pending" || !isMarketingStudioWorkerDeferredRunAt(job.next_run_at)) {
    return false;
  }

  const createdAt = parseTime(job.created_at);
  return createdAt !== null && now - createdAt >= staleAfterMs;
}

export function classifyCreativeRenderJob(
  job: CreativeRenderJobLike | null | undefined,
  now = Date.now(),
): CreativeRenderStateView {
  if (!job) {
    return {
      state: "concept_ready",
      customerLabel: "Concept ready, render needed",
      customerMessage: "Script and concept are ready. Render the preview before treating it as playable media.",
      customerActionLabel: "Render preview",
      active: false,
      retryAvailable: false,
      operatorLabel: "concept_ready",
      operatorMessage: "No render job is active for this creative.",
    };
  }

  const retryCount = Number(job.retry_count ?? 0);
  const maxAttempts = Number(job.max_attempts ?? 1);
  const retryAvailable = retryCount < Math.max(1, maxAttempts) - 1;
  const deferred = isMarketingStudioWorkerDeferredRunAt(job.next_run_at);
  const staleDeferred = isStaleDeferredCreativeRenderJob(job, now);

  if (job.status === "completed") {
    return {
      state: "render_ready",
      customerLabel: "Render ready",
      customerMessage: "Rendered creative media is ready for review.",
      customerActionLabel: null,
      active: false,
      retryAvailable: false,
      operatorLabel: "render_ready",
      operatorMessage: "The render job completed.",
    };
  }

  if (job.status === "failed") {
    return {
      state: retryAvailable ? "retry_available" : "render_failed",
      customerLabel: retryAvailable ? "Render needs retry" : "Render failed",
      customerMessage: "Render needs retry.",
      customerActionLabel: retryAvailable ? "Retry render" : null,
      active: false,
      retryAvailable,
      operatorLabel: retryAvailable ? "retry_available" : "render_failed",
      operatorMessage: [
        `Job ${job.id ?? "unknown"} failed.`,
        job.last_error_code ? `code=${job.last_error_code}` : null,
        retryAvailable ? "retry is available" : "retry limit reached",
      ].filter(Boolean).join(" "),
    };
  }

  if (deferred) {
    return {
      state: staleDeferred ? "operator_action_required" : "deferred_worker_required",
      customerLabel: "Final media queued",
      customerMessage: "Final media is queued. We'll update this when rendering starts.",
      customerActionLabel: null,
      active: false,
      retryAvailable: false,
      operatorLabel: staleDeferred ? "operator_action_required" : "deferred_worker_required",
      operatorMessage: [
        `runtime=${MARKETING_STUDIO_WORKER_RUNTIME}`,
        `job=${job.id ?? "unknown"}`,
        `next_run_at=${job.next_run_at ?? "none"}`,
        staleDeferred ? "stale deferred job; verify worker readiness or requeue intentionally" : "waiting for dedicated worker",
      ].join(" "),
    };
  }

  if (job.kind === "video_generation_status") {
    return {
      state: "provider_processing",
      customerLabel: "Final media rendering",
      customerMessage: "Final media is rendering. We'll update this when it is ready for review.",
      customerActionLabel: null,
      active: true,
      retryAvailable: false,
      operatorLabel: "provider_processing",
      operatorMessage: `Provider polling job ${job.id ?? "unknown"} is active or scheduled.`,
    };
  }

  if (hasActiveRenderLease(job, now)) {
    return {
      state: "processing",
      customerLabel: "Rendering video...",
      customerMessage: "Rendering video...",
      customerActionLabel: null,
      active: true,
      retryAvailable: false,
      operatorLabel: "processing",
      operatorMessage: `Job ${job.id ?? "unknown"} is claimed by ${job.locked_by ?? "worker"} until ${job.locked_until ?? "unknown"}.`,
    };
  }

  if (job.status === "processing") {
    return {
      state: "operator_action_required",
      customerLabel: "Final media queued",
      customerMessage: "Final media is queued. We'll update this when rendering starts.",
      customerActionLabel: null,
      active: false,
      retryAvailable: false,
      operatorLabel: "operator_action_required",
      operatorMessage: `Processing job ${job.id ?? "unknown"} has no active worker lease.`,
    };
  }

  return {
    state: "queued",
    customerLabel: "Final media queued",
    customerMessage: "Final media is queued. We'll update this when rendering starts.",
    customerActionLabel: null,
    active: false,
    retryAvailable: false,
    operatorLabel: "queued",
    operatorMessage: `Job ${job.id ?? "unknown"} is queued for the normal worker lane.`,
  };
}
