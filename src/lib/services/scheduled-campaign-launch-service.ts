import "server-only";

import { launchCampaignToMeta } from "@/app/api/campaigns/create/route";
import { ApiError } from "@/lib/api/route";
import {
  getScheduledLaunchExecutionGate,
  getScheduledLaunchRetryDecision,
} from "@/lib/scheduled-launch-gate";
import { getCampaignByIdForInternalActor } from "@/lib/services/campaign-persistence";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MetaLaunchInputBinding } from "@/lib/meta-launch-input-snapshot";
import type { CampaignLaunchProviderMutationSettlement } from "@/lib/services/campaign-launch-audit-service";
import { finalizeMetaActivationPreauthorizationAfterPausedLaunch } from "@/lib/services/meta-campaign-activation-authority-service";
import { transitionCanonicalCampaignLifecycleBySystem } from "@/lib/services/canonical-campaign-lifecycle-service";

const SCHEDULED_LAUNCH_LEASE_MS = 30 * 60_000;
const SCHEDULED_LAUNCH_HEARTBEAT_MS = 60_000;
const SCHEDULED_LAUNCH_LIMIT = 5;

type ScheduledLaunchClient = {
  from: (relation: string) => any;
  rpc: (name: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

export type ScheduledCampaignLaunchClaim = {
  id: string;
  organizationId: string;
  userId: string;
  campaignId: string;
  campaignName: string;
  idempotencyKey: string;
  scheduledFor: string;
  attemptCount: number;
  workerId: string;
  leaseToken: string;
  leaseGeneration: number;
};

export type ScheduledCampaignLaunchDispatchResult = {
  metaCampaignId: string;
  metaAdSetIds: string[];
  metaCreativeId: string;
  metaAdIds: string[];
  executionMetadata: Record<string, unknown>;
};

type DispatchContext = {
  assertLeaseAndGates: () => Promise<void>;
  client: ScheduledLaunchClient;
};

type ScheduledCampaignLaunchDispatcher = (
  claim: ScheduledCampaignLaunchClaim,
  context: DispatchContext,
) => Promise<ScheduledCampaignLaunchDispatchResult>;

type ScheduledProviderReceiptStage = "campaign" | "adset" | "creative" | "ad";

class ScheduledLaunchLeaseLostError extends Error {
  readonly code = "scheduled_launch_lease_lost";

  constructor(message = "The scheduled launch lease is no longer owned by this worker.") {
    super(message);
    this.name = "ScheduledLaunchLeaseLostError";
  }
}

class ScheduledLaunchOperatorActionError extends Error {
  readonly code: string;

  constructor(code = "scheduled_launch_operator_action_required") {
    super(code);
    this.name = "ScheduledLaunchOperatorActionError";
    this.code = code;
  }
}

class ScheduledLaunchDispatchError extends Error {
  readonly code: string;
  readonly httpStatus: number | null;

  constructor(code: string, httpStatus: number | null) {
    super(code);
    this.name = "ScheduledLaunchDispatchError";
    this.code = code;
    this.httpStatus = httpStatus;
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

function mapScheduledLaunchClaim(
  row: Record<string, unknown>,
  workerId: string,
): ScheduledCampaignLaunchClaim {
  const attemptCount = asPositiveInteger(row.schedule_attempt_count);
  const leaseGeneration = asPositiveInteger(row.schedule_lease_generation);

  if (
    typeof row.id !== "string" ||
    typeof row.organization_id !== "string" ||
    typeof row.user_id !== "string" ||
    typeof row.campaign_id !== "string" ||
    typeof row.campaign_name !== "string" ||
    typeof row.idempotency_key !== "string" ||
    typeof row.scheduled_for !== "string" ||
    typeof row.schedule_locked_by !== "string" ||
    row.schedule_locked_by !== workerId ||
    typeof row.schedule_lease_token !== "string" ||
    !attemptCount ||
    !leaseGeneration
  ) {
    throw new ScheduledLaunchLeaseLostError("The database returned an incomplete scheduled launch claim.");
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    idempotencyKey: row.idempotency_key,
    scheduledFor: row.scheduled_for,
    attemptCount,
    workerId,
    leaseToken: row.schedule_lease_token,
    leaseGeneration,
  };
}

async function renewScheduledLaunchLease(
  client: ScheduledLaunchClient,
  claim: ScheduledCampaignLaunchClaim,
) {
  const { data, error } = await client.rpc("renew_campaign_launch_schedule_lease", {
    p_launch_id: claim.id,
    p_worker_id: claim.workerId,
    p_lease_token: claim.leaseToken,
    p_lease_generation: claim.leaseGeneration,
    p_lease_ms: SCHEDULED_LAUNCH_LEASE_MS,
  });

  if (error || data !== true) {
    throw new ScheduledLaunchLeaseLostError();
  }
}

async function assertScheduledActivationAuthority(
  client: ScheduledLaunchClient,
  claim: ScheduledCampaignLaunchClaim,
) {
  const { data, error } = await client.rpc("assert_meta_campaign_activation_preauthorization", {
    p_launch_record_id: claim.id,
    p_organization_id: claim.organizationId,
    p_user_id: claim.userId,
    p_campaign_id: claim.campaignId,
  });
  if (error || data !== true) {
    throw new ScheduledLaunchDispatchError("meta_activation_preauthorization_missing", 409);
  }
}

async function acquireMetaLaunchLock(
  client: ScheduledLaunchClient,
  claim: ScheduledCampaignLaunchClaim,
) {
  const token = crypto.randomUUID();
  const lockedUntil = new Date(Date.now() + SCHEDULED_LAUNCH_LEASE_MS).toISOString();
  const inserted = await client
    .from("meta_launch_locks")
    .insert({
      campaign_id: claim.campaignId,
      lock_token: token,
      locked_by: `scheduled_launch:${claim.workerId}`,
      locked_until: lockedUntil,
    })
    .select("campaign_id")
    .maybeSingle();

  if (!inserted.error && inserted.data) {
    return token;
  }

  const updated = await client
    .from("meta_launch_locks")
    .update({
      lock_token: token,
      locked_by: `scheduled_launch:${claim.workerId}`,
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", claim.campaignId)
    .lte("locked_until", new Date().toISOString())
    .select("campaign_id")
    .maybeSingle();

  if (updated.error || !updated.data) {
    throw new ApiError(
      409,
      "A launch is already running for this campaign.",
      "meta_launch_lock_active",
    );
  }

  return token;
}

async function renewMetaLaunchLock(
  client: ScheduledLaunchClient,
  claim: ScheduledCampaignLaunchClaim,
  token: string,
) {
  const { data, error } = await client
    .from("meta_launch_locks")
    .update({
      locked_until: new Date(Date.now() + SCHEDULED_LAUNCH_LEASE_MS).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", claim.campaignId)
    .eq("lock_token", token)
    .gt("locked_until", new Date().toISOString())
    .select("campaign_id")
    .maybeSingle();

  if (error || !data) {
    throw new ScheduledLaunchLeaseLostError("The campaign-level Meta launch lock was lost.");
  }
}

async function releaseMetaLaunchLock(
  client: ScheduledLaunchClient,
  claim: ScheduledCampaignLaunchClaim,
  token: string,
) {
  await client
    .from("meta_launch_locks")
    .delete()
    .eq("campaign_id", claim.campaignId)
    .eq("lock_token", token);
}

async function completeScheduledLaunch(
  client: ScheduledLaunchClient,
  claim: ScheduledCampaignLaunchClaim,
  result: ScheduledCampaignLaunchDispatchResult,
) {
  const timestamp = new Date().toISOString();
  const { data, error } = await client.rpc("complete_campaign_launch_schedule_claim", {
    p_launch_id: claim.id,
    p_worker_id: claim.workerId,
    p_lease_token: claim.leaseToken,
    p_lease_generation: claim.leaseGeneration,
    p_meta_campaign_id: result.metaCampaignId,
    p_meta_ad_set_ids: result.metaAdSetIds,
    p_meta_creative_id: result.metaCreativeId,
    p_meta_ad_ids: result.metaAdIds,
    p_execution_metadata: {
      ...result.executionMetadata,
      source: "scheduled_campaign_launch_worker",
      providerObjectsCreatedPaused: true,
      scheduleAttemptCount: claim.attemptCount,
    },
    p_event: {
      id: `scheduled-launch-complete:${claim.leaseGeneration}`,
      label: "Scheduled provider launch completed",
      status: "success",
      target: claim.campaignName,
      detail: "The due provider object set was created in PAUSED state and fenced receipt persistence completed.",
      timestamp,
    },
  });

  if (error || data !== true) {
    throw new ScheduledLaunchLeaseLostError("The completed launch receipt was rejected by the fencing check.");
  }
}

function getSafeErrorCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[a-z0-9_]{3,80}$/.test(error.code)
  ) {
    return error.code;
  }

  return "scheduled_launch_dispatch_failed";
}

function getErrorHttpStatus(error: unknown) {
  if (error instanceof ScheduledLaunchDispatchError) {
    return error.httpStatus;
  }

  if (error instanceof ApiError) {
    return error.status;
  }

  return null;
}

async function releaseScheduledLaunchAfterFailure(
  client: ScheduledLaunchClient,
  claim: ScheduledCampaignLaunchClaim,
  error: unknown,
) {
  const errorCode = getSafeErrorCode(error);
  const operatorRequiredError = [
    "meta_provider_create_outcome_ambiguous",
    "scheduled_launch_provider_receipt_persist_failed",
    "scheduled_launch_provider_mutation_settlement_failed",
    "campaign_launch_provider_receipt_persist_failed",
    "campaign_launch_provider_mutation_settlement_failed",
    "meta_lookup_ambiguous",
    "meta_activation_preauthorization_missing",
  ].includes(errorCode);
  const decision = operatorRequiredError
    ? { status: "operator_action_required" as const, retryDelayMs: null }
    : getScheduledLaunchRetryDecision({
        attemptCount: claim.attemptCount,
        httpStatus: getErrorHttpStatus(error),
      });
  const timestamp = new Date().toISOString();
  const nextAttemptAt = decision.retryDelayMs
    ? new Date(Date.now() + decision.retryDelayMs).toISOString()
    : null;
  const { data, error: releaseError } = await client.rpc(
    "release_campaign_launch_schedule_claim",
    {
      p_launch_id: claim.id,
      p_worker_id: claim.workerId,
      p_lease_token: claim.leaseToken,
      p_lease_generation: claim.leaseGeneration,
      p_result_status: decision.status,
      p_next_attempt_at: nextAttemptAt,
      p_error_code: errorCode,
      p_execution_metadata: {
        source: "scheduled_campaign_launch_worker",
        scheduleAttemptCount: claim.attemptCount,
        lastScheduleErrorCode: errorCode,
        providerMutationOutcome: operatorRequiredError
          ? "operator_reconciliation_required"
          : decision.status === "scheduled"
            ? "retryable_before_ambiguous_provider_mutation"
            : "operator_review_required",
      },
      p_event: {
        id: `scheduled-launch-failed:${claim.leaseGeneration}`,
        label: "Scheduled provider launch did not complete",
        status: "failed",
        target: claim.campaignName,
        detail:
          decision.status === "scheduled"
            ? `Safe retry retained for ${nextAttemptAt}. Error code: ${errorCode}.`
            : `Launch intent retained for operator review. Error code: ${errorCode}.`,
        timestamp,
      },
    },
  );

  if (releaseError || data !== true) {
    throw new ScheduledLaunchLeaseLostError("The failed launch intent could not be released by its fenced owner.");
  }

  return {
    errorCode,
    status: decision.status,
    nextAttemptAt,
  };
}

async function loadScheduledProviderReceiptResume(
  client: ScheduledLaunchClient,
  claim: ScheduledCampaignLaunchClaim,
) {
  const { data, error } = await client
    .from("campaign_launch_provider_receipts")
    .select("stage,object_id,lease_generation")
    .eq("launch_id", claim.id)
    .order("lease_generation", { ascending: false });

  if (error) {
    throw new ScheduledLaunchDispatchError("scheduled_launch_provider_receipt_lookup_failed", 503);
  }

  return resolveScheduledProviderReceiptResume(data, claim.leaseGeneration);
}

export function resolveScheduledProviderReceiptResume(
  rows: unknown,
  currentLeaseGeneration: number,
) {
  const safeCurrentGeneration = asPositiveInteger(currentLeaseGeneration);
  if (!safeCurrentGeneration) {
    throw new ScheduledLaunchDispatchError("scheduled_launch_provider_receipt_generation_invalid", 422);
  }

  const idsByStage = new Map<ScheduledProviderReceiptStage, Set<string>>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const leaseGeneration = row && typeof row === "object"
      ? asPositiveInteger((row as Record<string, unknown>).lease_generation)
      : null;
    if (
      !row ||
      typeof row !== "object" ||
      !leaseGeneration ||
      typeof row.stage !== "string" ||
      typeof row.object_id !== "string" ||
      !["campaign", "adset", "creative", "ad"].includes(row.stage)
    ) {
      throw new ScheduledLaunchDispatchError("scheduled_launch_provider_receipt_invalid", 422);
    }
    if (leaseGeneration > safeCurrentGeneration) {
      throw new ScheduledLaunchDispatchError("scheduled_launch_provider_receipt_future_generation", 422);
    }
    const stage = row.stage as ScheduledProviderReceiptStage;
    const objectId = row.object_id.trim();
    if (!objectId) {
      throw new ScheduledLaunchDispatchError("scheduled_launch_provider_receipt_invalid", 422);
    }
    const ids = idsByStage.get(stage) ?? new Set<string>();
    ids.add(objectId);
    idsByStage.set(stage, ids);
  }

  for (const ids of idsByStage.values()) {
    if (ids.size > 1) {
      throw new ScheduledLaunchDispatchError("scheduled_launch_provider_receipt_ambiguous", 422);
    }
  }

  const one = (stage: ScheduledProviderReceiptStage) =>
    Array.from(idsByStage.get(stage) ?? [])[0] ?? null;
  return {
    metaCampaignId: one("campaign"),
    metaAdSetId: one("adset"),
    metaCreativeId: one("creative"),
    metaAdId: one("ad"),
  };
}

async function recordScheduledProviderReceipt(params: {
  client: ScheduledLaunchClient;
  claim: ScheduledCampaignLaunchClaim;
  stage: "campaign" | "adset" | "creative" | "ad";
  objectId: string;
  responseStatus: number;
}) {
  const { data, error } = await params.client.rpc("record_campaign_launch_provider_receipt", {
    p_launch_id: params.claim.id,
    p_lease_generation: params.claim.leaseGeneration,
    p_stage: params.stage,
    p_object_id: params.objectId,
    p_response_status: params.responseStatus,
  });

  if (error || typeof data !== "string") {
    throw new ScheduledLaunchDispatchError("scheduled_launch_provider_receipt_persist_failed", 503);
  }
}

async function armScheduledProviderMutation(params: {
  client: ScheduledLaunchClient;
  claim: ScheduledCampaignLaunchClaim;
  stage: ScheduledProviderReceiptStage;
  objectKey: string;
}) {
  const { data, error } = await params.client.rpc("arm_campaign_launch_provider_mutation", {
    p_launch_id: params.claim.id,
    p_worker_id: params.claim.workerId,
    p_lease_token: params.claim.leaseToken,
    p_lease_generation: params.claim.leaseGeneration,
    p_stage: params.stage,
    p_object_key: params.objectKey,
  });

  if (error || data !== true) {
    throw new ScheduledLaunchLeaseLostError(
      error?.message ?? "The provider-mutation arm was rejected by its fencing check.",
    );
  }
}

async function settleScheduledProviderMutation(params: {
  client: ScheduledLaunchClient;
  claim: ScheduledCampaignLaunchClaim;
  settlement: CampaignLaunchProviderMutationSettlement;
}) {
  const { data, error } = await params.client.rpc(
    "settle_campaign_launch_provider_mutation",
    {
      p_launch_id: params.claim.id,
      p_worker_id: params.claim.workerId,
      p_lease_token: params.claim.leaseToken,
      p_lease_generation: params.claim.leaseGeneration,
      p_stage: params.settlement.stage,
      p_object_key: params.settlement.objectKey,
      p_outcome: params.settlement.outcome,
      p_object_id: params.settlement.objectId,
      p_response_status: params.settlement.responseStatus,
      p_provider_error_code: params.settlement.providerErrorCode ?? null,
    },
  );

  if (error || data !== true) {
    throw new ScheduledLaunchDispatchError(
      "scheduled_launch_provider_mutation_settlement_failed",
      503,
    );
  }
}

async function bindScheduledLaunchInputSnapshot(params: {
  client: ScheduledLaunchClient;
  claim: ScheduledCampaignLaunchClaim;
  binding: MetaLaunchInputBinding;
}) {
  const { data, error } = await params.client.rpc("bind_campaign_launch_input_snapshot", {
    p_launch_id: params.claim.id,
    p_worker_id: params.claim.workerId,
    p_lease_token: params.claim.leaseToken,
    p_lease_generation: params.claim.leaseGeneration,
    p_launch_input_snapshot: params.binding.snapshot,
    p_launch_input_digest: params.binding.digest,
  });

  if (error || data !== true) {
    const terminal = await params.client
      .from("campaign_launch_records")
      .select("result_status,schedule_last_error_code")
      .eq("id", params.claim.id)
      .eq("organization_id", params.claim.organizationId)
      .eq("campaign_id", params.claim.campaignId)
      .maybeSingle();
    if (terminal.data?.result_status === "operator_action_required") {
      const persistedCode = terminal.data.schedule_last_error_code;
      throw new ScheduledLaunchOperatorActionError(
        typeof persistedCode === "string" && /^[a-z0-9_]{3,80}$/.test(persistedCode)
          ? persistedCode
          : undefined,
      );
    }
    throw new ScheduledLaunchDispatchError("scheduled_launch_input_snapshot_rejected", 409);
  }
}

async function persistScheduledCampaignLaunchRuntime(params: {
  client: ScheduledLaunchClient;
  claim: ScheduledCampaignLaunchClaim;
  state: Record<string, unknown>;
  message: string;
}) {
  const { data, error } = await params.client.rpc(
    "persist_campaign_launch_runtime_claim",
    {
      p_launch_id: params.claim.id,
      p_worker_id: params.claim.workerId,
      p_lease_token: params.claim.leaseToken,
      p_lease_generation: params.claim.leaseGeneration,
      p_launch_runtime: params.state,
      p_message: params.message,
    },
  );

  if (error || data !== true) {
    throw new ScheduledLaunchLeaseLostError(
      error?.message ?? "The scheduled launch-runtime write was rejected by its fencing check.",
    );
  }
}

async function dispatchScheduledCampaignLaunch(
  claim: ScheduledCampaignLaunchClaim,
  context: DispatchContext,
): Promise<ScheduledCampaignLaunchDispatchResult> {
  const gate = getScheduledLaunchExecutionGate();
  if (!gate.allowed) {
    throw new ScheduledLaunchDispatchError(gate.reason ?? "scheduled_launch_disabled", 503);
  }

  await context.assertLeaseAndGates();
  const campaign = await getCampaignByIdForInternalActor({
    campaignId: claim.campaignId,
    organizationId: claim.organizationId,
    userId: claim.userId,
  });

  if (!campaign) {
    throw new ScheduledLaunchDispatchError("scheduled_launch_actor_mismatch", 403);
  }

  const resume = await loadScheduledProviderReceiptResume(context.client, claim);
  let launchInputDigest: string | null = null;

  const response = await launchCampaignToMeta(
    claim.campaignId,
    resume,
    {
      internalActor: {
        organizationId: claim.organizationId,
        userId: claim.userId,
      },
      assertProviderMutationAllowed: context.assertLeaseAndGates,
      bindLaunchInputSnapshot: async (binding) => {
        await bindScheduledLaunchInputSnapshot({
          client: context.client,
          claim,
          binding,
        });
        launchInputDigest = binding.digest;
      },
      recordProviderReceipt: (receipt) =>
        recordScheduledProviderReceipt({
          client: context.client,
          claim,
          ...receipt,
        }),
      armProviderMutation: (mutation) =>
        armScheduledProviderMutation({
          client: context.client,
          claim,
          ...mutation,
        }),
      settleProviderMutation: (settlement) =>
        settleScheduledProviderMutation({
          client: context.client,
          claim,
          settlement,
        }),
      persistLaunchState: (state, message) =>
        persistScheduledCampaignLaunchRuntime({
          client: context.client,
          claim,
          state,
          message,
        }),
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        campaign_id?: unknown;
        adset_id?: unknown;
        creative_id?: unknown;
        ad_id?: unknown;
        code?: unknown;
      }
    | null;

  if (
    !response.ok ||
    typeof payload?.campaign_id !== "string" ||
    typeof payload.adset_id !== "string" ||
    typeof payload.creative_id !== "string" ||
    typeof payload.ad_id !== "string"
  ) {
    throw new ScheduledLaunchDispatchError(
      typeof payload?.code === "string" && /^[a-z0-9_]{3,80}$/.test(payload.code)
        ? payload.code
        : response.status === 409
          ? "scheduled_launch_provider_conflict"
          : "scheduled_launch_provider_failed",
      response.status,
    );
  }

  await context.assertLeaseAndGates();
  if (!launchInputDigest) {
    throw new ScheduledLaunchDispatchError("scheduled_launch_input_snapshot_missing", 409);
  }

  return {
    metaCampaignId: payload.campaign_id,
    metaAdSetIds: [payload.adset_id],
    metaCreativeId: payload.creative_id,
    metaAdIds: [payload.ad_id],
    executionMetadata: {
      scheduledFor: claim.scheduledFor,
      launchInputDigest,
    },
  };
}

export async function processScheduledCampaignLaunchBatch(params?: {
  maxClaims?: number;
  client?: ScheduledLaunchClient;
  dispatch?: ScheduledCampaignLaunchDispatcher;
}) {
  const gate = getScheduledLaunchExecutionGate();

  // No claim is taken while either kill switch is closed. Scheduled intent is
  // therefore untouched under the default configuration and in test runs.
  if (!gate.allowed) {
    return {
      enabled: false,
      blockedReason: gate.reason,
      claimedCount: 0,
      completedIds: [] as string[],
      retryingIds: [] as string[],
      operatorActionIds: [] as string[],
    };
  }

  const client = params?.client ?? (createAdminClient() as ScheduledLaunchClient | null);
  if (!client) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const workerId = `scheduled-launch:${crypto.randomUUID()}`;
  const maxClaims = Math.min(
    25,
    Math.max(1, Math.trunc(params?.maxClaims ?? SCHEDULED_LAUNCH_LIMIT)),
  );
  const { data, error } = await client.rpc("claim_due_campaign_launch_records", {
    p_worker_id: workerId,
    p_limit: maxClaims,
    p_lease_ms: SCHEDULED_LAUNCH_LEASE_MS,
  });

  if (error) {
    throw new ApiError(
      500,
      error.message ?? "Due scheduled launches could not be claimed.",
      "scheduled_launch_claim_failed",
    );
  }

  const claims = (Array.isArray(data) ? data : []).map((row) =>
    mapScheduledLaunchClaim(row as Record<string, unknown>, workerId),
  );
  const completedIds: string[] = [];
  const retryingIds: string[] = [];
  const operatorActionIds: string[] = [];
  const dispatch = params?.dispatch ?? dispatchScheduledCampaignLaunch;

  for (const claim of claims) {
    let metaLockToken: string | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    try {
      await renewScheduledLaunchLease(client, claim);
      await assertScheduledActivationAuthority(client, claim);
      metaLockToken = await acquireMetaLaunchLock(client, claim);
      const assertLeaseAndGates = async () => {
        const currentGate = getScheduledLaunchExecutionGate();
        if (!currentGate.allowed) {
          throw new ScheduledLaunchDispatchError(
            currentGate.reason ?? "scheduled_launch_disabled",
            503,
          );
        }
        await renewScheduledLaunchLease(client, claim);
        await assertScheduledActivationAuthority(client, claim);
        await renewMetaLaunchLock(client, claim, metaLockToken!);
      };
      heartbeat = setInterval(() => {
        void assertLeaseAndGates().catch(() => undefined);
      }, SCHEDULED_LAUNCH_HEARTBEAT_MS);

      await transitionCanonicalCampaignLifecycleBySystem({
        organizationId: claim.organizationId,
        campaignId: claim.campaignId,
        toState: "publishing",
        reasonCode: "scheduled_provider_publish_started",
        evidence: {
          launchRecordId: claim.id,
          leaseGeneration: claim.leaseGeneration,
          scheduledFor: claim.scheduledFor,
        },
        idempotencyKey: `provider-publish:${claim.id}:${claim.leaseGeneration}`,
        client,
      });
      const result = await dispatch(claim, { assertLeaseAndGates, client });
      await assertLeaseAndGates();
      await completeScheduledLaunch(client, claim, result);
      await transitionCanonicalCampaignLifecycleBySystem({
        organizationId: claim.organizationId,
        campaignId: claim.campaignId,
        toState: "provider_paused",
        reasonCode: "provider_object_set_created_paused",
        evidence: {
          launchRecordId: claim.id,
          leaseGeneration: claim.leaseGeneration,
          providerObjectsCreatedPaused: true,
        },
        idempotencyKey: `provider-paused:${claim.id}:${claim.leaseGeneration}`,
        client,
      });
      await finalizeMetaActivationPreauthorizationAfterPausedLaunch({
        organizationId: claim.organizationId,
        userId: claim.userId,
        campaignId: claim.campaignId,
        launchRecordId: claim.id,
      });
      completedIds.push(claim.id);
    } catch (dispatchError) {
      if (dispatchError instanceof ScheduledLaunchOperatorActionError) {
        operatorActionIds.push(claim.id);
        continue;
      }
      if (dispatchError instanceof ScheduledLaunchLeaseLostError) {
        // A superseded worker must not write a result or release another
        // worker's intent. Deterministic provider names make recovery safe.
        continue;
      }

      const released = await releaseScheduledLaunchAfterFailure(
        client,
        claim,
        dispatchError,
      ).catch(() => null);
      if (released?.status === "scheduled") {
        retryingIds.push(claim.id);
      } else if (released?.status === "operator_action_required") {
        await transitionCanonicalCampaignLifecycleBySystem({
          organizationId: claim.organizationId,
          campaignId: claim.campaignId,
          toState: "operator_required",
          reasonCode: "provider_publish_operator_action_required",
          evidence: {
            launchRecordId: claim.id,
            leaseGeneration: claim.leaseGeneration,
            errorCode:
              dispatchError && typeof dispatchError === "object" && "code" in dispatchError
                ? String(dispatchError.code)
                : "provider_publish_failed",
          },
          idempotencyKey: `provider-operator:${claim.id}:${claim.leaseGeneration}`,
          client,
        }).catch(() => undefined);
        operatorActionIds.push(claim.id);
      }
    } finally {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      if (metaLockToken) {
        await releaseMetaLaunchLock(client, claim, metaLockToken).catch(() => undefined);
      }
    }
  }

  return {
    enabled: true,
    blockedReason: null,
    claimedCount: claims.length,
    completedIds,
    retryingIds,
    operatorActionIds,
  };
}
