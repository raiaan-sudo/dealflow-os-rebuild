export const SYSTEM_JOB_LEASE_MS = 5 * 60_000;
export const SYSTEM_JOB_LEASE_HEARTBEAT_MS = 60_000;

export type SystemJobLease = {
  jobId: string;
  workerId: string;
  token: string;
  generation: number;
};

type LeaseBackedJob = {
  id?: unknown;
  status?: unknown;
  locked_by?: unknown;
  locked_until?: unknown;
  lease_token?: unknown;
  lease_generation?: unknown;
};

type SystemJobLeaseClient = {
  from: (relation: string) => any;
  rpc: (name: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

export class SystemJobLeaseLostError extends Error {
  readonly code = "system_job_lease_lost";

  constructor(message = "System job lease ownership was lost before the state transition.") {
    super(message);
    this.name = "SystemJobLeaseLostError";
  }
}

export async function runSystemJobLogBestEffort(params: {
  write: () => Promise<unknown>;
  onFailure?: (error: unknown) => void;
}) {
  try {
    await params.write();
    return true;
  } catch (error) {
    try {
      params.onFailure?.(error);
    } catch {
      // Logging diagnostics must never replace the durable job state transition.
    }
    return false;
  }
}

function asPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export function getSystemJobLease(row: LeaseBackedJob): SystemJobLease | null {
  const generation = asPositiveInteger(row.lease_generation);

  if (
    typeof row.id !== "string" ||
    typeof row.locked_by !== "string" ||
    typeof row.lease_token !== "string" ||
    !generation
  ) {
    return null;
  }

  return {
    jobId: row.id,
    workerId: row.locked_by,
    token: row.lease_token,
    generation,
  };
}

export function isSystemJobLeaseOwned(
  row: LeaseBackedJob,
  lease: SystemJobLease,
  nowMs = Date.now(),
) {
  const lockedUntilMs =
    typeof row.locked_until === "string" ? Date.parse(row.locked_until) : Number.NaN;

  return (
    row.id === lease.jobId &&
    row.status === "processing" &&
    row.locked_by === lease.workerId &&
    row.lease_token === lease.token &&
    asPositiveInteger(row.lease_generation) === lease.generation &&
    Number.isFinite(lockedUntilMs) &&
    lockedUntilMs > nowMs
  );
}

export async function renewSystemJobLease(params: {
  supabase: SystemJobLeaseClient;
  lease: SystemJobLease;
  leaseMs?: number;
}) {
  const leaseMs = Math.max(1_000, Math.trunc(params.leaseMs ?? SYSTEM_JOB_LEASE_MS));
  const { data, error } = await params.supabase.rpc("renew_system_job_lease", {
    p_job_id: params.lease.jobId,
    p_worker_id: params.lease.workerId,
    p_lease_token: params.lease.token,
    p_lease_generation: params.lease.generation,
    p_lease_ms: leaseMs,
  });

  if (error) {
    throw new Error(error.message || "System job lease renewal failed.");
  }

  if (data !== true) {
    throw new SystemJobLeaseLostError("System job lease renewal was rejected by the database.");
  }
}

export async function updateSystemJobIfLeaseOwned(params: {
  supabase: SystemJobLeaseClient;
  lease: SystemJobLease;
  input: Record<string, unknown>;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const { data, error } = await params.supabase
    .from("system_jobs")
    .update(params.input)
    .eq("id", params.lease.jobId)
    .eq("status", "processing")
    .eq("locked_by", params.lease.workerId)
    .eq("lease_token", params.lease.token)
    .eq("lease_generation", params.lease.generation)
    .gt("locked_until", now.toISOString())
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Fenced system job update failed.");
  }

  if (!data) {
    throw new SystemJobLeaseLostError();
  }

  return data;
}

type IntervalHandle = ReturnType<typeof setInterval>;

export function createSystemJobLeaseHeartbeat(params: {
  renew: () => Promise<void>;
  intervalMs?: number;
  schedule?: (callback: () => void, intervalMs: number) => IntervalHandle;
  cancel?: (handle: IntervalHandle) => void;
}) {
  const schedule = params.schedule ?? ((callback, intervalMs) => setInterval(callback, intervalMs));
  const cancel = params.cancel ?? ((handle) => clearInterval(handle));
  let timer: IntervalHandle | null = null;
  let renewal: Promise<void> | null = null;
  let lostError: Error | null = null;
  let stopped = false;

  const renewNow = async () => {
    if (stopped) {
      return;
    }

    if (lostError) {
      throw lostError;
    }

    if (renewal) {
      return renewal;
    }

    renewal = params
      .renew()
      .catch((error) => {
        lostError =
          error instanceof Error
            ? error
            : new SystemJobLeaseLostError("System job lease heartbeat failed.");
        throw lostError;
      })
      .finally(() => {
        renewal = null;
      });

    return renewal;
  };

  const start = () => {
    if (timer || stopped) {
      return;
    }

    timer = schedule(() => {
      void renewNow().catch(() => undefined);
    }, Math.max(1_000, Math.trunc(params.intervalMs ?? SYSTEM_JOB_LEASE_HEARTBEAT_MS)));
  };

  const stop = async () => {
    stopped = true;
    if (timer) {
      cancel(timer);
      timer = null;
    }
    await renewal?.catch(() => undefined);
  };

  const assertOwned = () => {
    if (lostError) {
      throw new SystemJobLeaseLostError(lostError.message);
    }
  };

  return {
    start,
    stop,
    renewNow,
    assertOwned,
    hasLostLease: () => Boolean(lostError),
  };
}
