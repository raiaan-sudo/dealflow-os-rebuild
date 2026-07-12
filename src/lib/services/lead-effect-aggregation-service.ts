import type { Json } from "@/lib/supabase/types";
import {
  evaluateGhlSandboxGate,
  ghlSandboxGateFromEnvironment,
} from "@/lib/integrations/gohighlevel";

export type LeadEffectKey = "agent_notification" | "meta_conversion" | "ghl_delivery";
export type LeadEffectStatus = "succeeded" | "failed";

export type LeadEffectOutcome = {
  key: LeadEffectKey;
  required: boolean;
  status: LeadEffectStatus;
  retryable: boolean;
  reason: string | null;
  attemptCount: number;
  reused: boolean;
  result: Json | null;
};

export type LeadEffectSummary = {
  requestId: string;
  leadId: string;
  allRequiredSucceeded: boolean;
  retryable: boolean;
  failedRequiredEffects: LeadEffectKey[];
  effects: LeadEffectOutcome[];
};

export type MetaCapiConsentEvidence = {
  granted: true;
  policyVersion: string;
  grantedAt: string;
  source: string;
};

export function hasValidMetaCapiConsent(
  consent: MetaCapiConsentEvidence | null | undefined,
  env: Record<string, string | undefined> = process.env,
) {
  const configuredPolicyVersion = env.META_CAPI_CONSENT_POLICY_VERSION?.trim() ?? "";
  const grantedAt = consent?.grantedAt ? new Date(consent.grantedAt).getTime() : Number.NaN;

  return Boolean(
    configuredPolicyVersion &&
      consent?.granted === true &&
      consent.policyVersion.trim() === configuredPolicyVersion &&
      consent.source.trim() &&
      Number.isFinite(grantedAt) &&
      grantedAt <= Date.now(),
  );
}

export function resolveLeadEffectPolicy(
  env: Record<string, string | undefined> = process.env,
  consent?: MetaCapiConsentEvidence | null,
) {
  const enabledEffects: LeadEffectKey[] = [];

  if (env.INTERNAL_LEAD_SMS_ENABLED?.trim().toLowerCase() === "true") {
    enabledEffects.push("agent_notification");
  }

  if (
    env.ALLOW_META_CAPI_EVENTS === "true" &&
    hasValidMetaCapiConsent(consent, env)
  ) {
    enabledEffects.push("meta_conversion");
  }

  if (evaluateGhlSandboxGate(ghlSandboxGateFromEnvironment(env)).allowed) {
    enabledEffects.push("ghl_delivery");
  }

  return {
    enabledEffects,
    requiredEffects: [...enabledEffects],
  };
}

type EffectsClient = {
  from: (relation: string) => any;
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

type PersistedEffectRow = {
  id: string;
  effect_key: LeadEffectKey;
  status: string;
  attempt_count: number;
  result: Json | null;
  required: boolean;
  retryable: boolean;
  error_code: string | null;
};

type EffectEvaluation = {
  succeeded: boolean;
  retryable: boolean;
  reason: string | null;
  operatorRequired?: boolean;
};

type ClaimedEffectRow = {
  effect_id: string;
  claim_disposition:
    | "claimed"
    | "reused_succeeded"
    | "reused_failed"
    | "operator_required";
  execution_token: string;
  attempt_count: number;
  status: string;
  result: Json | null;
  retryable: boolean;
  error_code: string | null;
};

export class LeadEffectsIncompleteError extends Error {
  readonly code = "lead_required_effects_incomplete";
  readonly summary: LeadEffectSummary;
  readonly retryable: boolean;

  constructor(summary: LeadEffectSummary) {
    super(
      `Required lead effects failed: ${summary.failedRequiredEffects.join(", ") || "unknown"}.`,
    );
    this.name = "LeadEffectsIncompleteError";
    this.summary = summary;
    this.retryable = summary.retryable;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asReason(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

function firstRpcRow<T>(value: unknown): T | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as T) : null;
}

export function evaluateAgentNotificationResult(result: unknown): EffectEvaluation {
  const record = asRecord(result);

  if (record.notified === true) {
    return { succeeded: true, retryable: false, reason: null };
  }

  const reason = asReason(record.reason, "agent_notification_failed");
  return {
    succeeded: false,
    retryable:
      reason === "notification_exception" ||
      reason === "sms_provider_failed" ||
      reason === "temporary_notification_failure",
    reason,
  };
}

export function evaluateMetaConversionResult(result: unknown): EffectEvaluation {
  const record = asRecord(result);

  if (record.sent === true) {
    return { succeeded: true, retryable: false, reason: null };
  }

  const reason = asReason(record.reason, "meta_conversion_failed");
  return {
    succeeded: false,
    retryable:
      reason === "meta_conversion_failed" ||
      reason === "meta_provider_timeout" ||
      reason === "meta_rate_limited",
    reason,
  };
}

export function evaluateGhlDeliveryResult(result: unknown): EffectEvaluation {
  const record = asRecord(result);
  if (record.queued === true) {
    return { succeeded: true, retryable: false, reason: null };
  }
  const reason = asReason(record.reason, "ghl_delivery_enqueue_failed");
  return {
    succeeded: false,
    retryable: reason === "ghl_delivery_enqueue_retryable",
    reason,
    operatorRequired: reason === "ghl_sandbox_mapping_not_ready"
      || reason === "ghl_mapping_authority_conflict",
  };
}

export function aggregateLeadEffectOutcomes(params: {
  requestId: string;
  leadId: string;
  outcomes: LeadEffectOutcome[];
}): LeadEffectSummary {
  const failedRequired = params.outcomes.filter(
    (outcome) => outcome.required && outcome.status !== "succeeded",
  );

  return {
    requestId: params.requestId,
    leadId: params.leadId,
    allRequiredSucceeded: failedRequired.length === 0,
    retryable: failedRequired.length > 0 && failedRequired.every((outcome) => outcome.retryable),
    failedRequiredEffects: failedRequired.map((outcome) => outcome.key),
    effects: params.outcomes,
  };
}

async function loadPersistedEffects(client: EffectsClient, jobId: string) {
  const { data, error } = await client
    .from("system_job_effects")
    .select("id,effect_key,status,attempt_count,result,required,retryable,error_code")
    .eq("system_job_id", jobId);

  if (error) {
    throw new Error(error.message || "Lead effect state could not be loaded.");
  }

  return new Map(
    ((Array.isArray(data) ? data : []) as PersistedEffectRow[]).map((row) => [
      row.effect_key,
      row,
    ]),
  );
}

async function executeEffect(params: {
  client: EffectsClient;
  jobId: string;
  organizationId: string;
  leadId: string;
  correlationId: string;
  workerId: string;
  leaseToken: string;
  leaseGeneration: number;
  key: LeadEffectKey;
  required: boolean;
  invoke: () => Promise<unknown>;
  evaluate: (result: unknown) => EffectEvaluation;
}): Promise<LeadEffectOutcome> {
  const { data: claimData, error: claimError } = await params.client.rpc(
    "claim_lead_system_job_effect",
    {
      p_system_job_id: params.jobId,
      p_organization_id: params.organizationId,
      p_lead_id: params.leadId,
      p_effect_key: params.key,
      p_required: params.required,
      p_correlation_id: params.correlationId,
      p_worker_id: params.workerId,
      p_parent_lease_token: params.leaseToken,
      p_parent_lease_generation: params.leaseGeneration,
    },
  );
  const claimed = firstRpcRow<ClaimedEffectRow>(claimData);

  if (claimError || !claimed?.effect_id || !claimed.execution_token) {
    throw new Error(
      claimError?.message || `Lead effect ${params.key} could not be atomically claimed.`,
    );
  }

  if (claimed.claim_disposition === "reused_succeeded") {
    return {
      key: params.key,
      required: params.required,
      status: "succeeded",
      retryable: false,
      reason: null,
      attemptCount: claimed.attempt_count,
      reused: true,
      result: claimed.result,
    };
  }

  if (
    claimed.claim_disposition === "operator_required" ||
    claimed.claim_disposition === "reused_failed"
  ) {
    return {
      key: params.key,
      required: params.required,
      status: "failed",
      retryable: claimed.claim_disposition === "reused_failed" && claimed.retryable,
      reason:
        claimed.error_code ||
        (claimed.claim_disposition === "operator_required"
          ? "provider_effect_outcome_uncertain"
          : "effect_failed"),
      attemptCount: claimed.attempt_count,
      reused: true,
      result: claimed.result,
    };
  }

  if (claimed.claim_disposition !== "claimed") {
    throw new Error(`Lead effect ${params.key} returned an invalid claim disposition.`);
  }

  const attemptCount = claimed.attempt_count;
  const executionToken = claimed.execution_token;

  let rawResult: unknown;
  let evaluation: EffectEvaluation;

  try {
    rawResult = await params.invoke();
    evaluation = params.evaluate(rawResult);
  } catch (error) {
    rawResult = {
      failed: true,
      reason: "provider_effect_outcome_uncertain",
      errorType: error instanceof Error ? error.name : "UnknownError",
    };
    evaluation = {
      succeeded: false,
      retryable: false,
      reason: "provider_effect_outcome_uncertain",
      operatorRequired: true,
    };
  }

  const result = toJson(rawResult);
  const terminalStatus = evaluation.succeeded
    ? "succeeded"
    : evaluation.operatorRequired
      ? "operator_required"
      : "failed";
  const { data: completionData, error: completionError } = await params.client.rpc(
    "settle_lead_system_job_effect",
    {
      p_effect_id: claimed.effect_id,
      p_system_job_id: params.jobId,
      p_worker_id: params.workerId,
      p_parent_lease_token: params.leaseToken,
      p_parent_lease_generation: params.leaseGeneration,
      p_execution_token: executionToken,
      p_status: terminalStatus,
      p_result: result,
      p_retryable: evaluation.retryable,
      p_error_code: evaluation.succeeded ? null : evaluation.reason,
      p_error_message: evaluation.succeeded ? null : evaluation.reason,
    },
  );
  const completed = firstRpcRow<{ id: string }>(completionData);

  if (completionError || !completed?.id) {
    throw new Error(
      completionError?.message ||
        `Lead effect ${params.key} execution was superseded before its result could be persisted.`,
    );
  }

  return {
    key: params.key,
    required: params.required,
    status: evaluation.succeeded ? "succeeded" : "failed",
    retryable: evaluation.retryable,
    reason: evaluation.reason,
    attemptCount,
    reused: false,
    result,
  };
}

export async function runDurableLeadEffects(params: {
  client: EffectsClient;
  jobId: string;
  organizationId: string;
  leadId: string;
  requestId: string;
  workerId: string;
  leaseToken: string;
  leaseGeneration: number;
  enabledEffects?: LeadEffectKey[];
  requiredEffects?: LeadEffectKey[];
  notifyAgent: () => Promise<unknown>;
  sendMetaConversion: () => Promise<unknown>;
  enqueueGhlDelivery: () => Promise<unknown>;
}) {
  const enabledEffects = new Set<LeadEffectKey>(params.enabledEffects ?? []);
  const requiredEffects = new Set<LeadEffectKey>(params.requiredEffects ?? []);
  const persisted = await loadPersistedEffects(params.client, params.jobId);
  const settledOutcomes = await Promise.allSettled([
    executeEffect({
      client: params.client,
      jobId: params.jobId,
      organizationId: params.organizationId,
      leadId: params.leadId,
      correlationId: params.requestId,
      workerId: params.workerId,
      leaseToken: params.leaseToken,
      leaseGeneration: params.leaseGeneration,
      key: "agent_notification",
      required: requiredEffects.has("agent_notification"),
      invoke: enabledEffects.has("agent_notification")
        ? params.notifyAgent
        : async () => ({ notified: false, skipped: true, reason: "effect_disabled_by_policy" }),
      evaluate: evaluateAgentNotificationResult,
    }),
    executeEffect({
      client: params.client,
      jobId: params.jobId,
      organizationId: params.organizationId,
      leadId: params.leadId,
      correlationId: params.requestId,
      workerId: params.workerId,
      leaseToken: params.leaseToken,
      leaseGeneration: params.leaseGeneration,
      key: "meta_conversion",
      required: requiredEffects.has("meta_conversion"),
      invoke: enabledEffects.has("meta_conversion")
        ? params.sendMetaConversion
        : async () => ({ sent: false, skipped: true, reason: "effect_disabled_by_policy" }),
      evaluate: evaluateMetaConversionResult,
    }),
    executeEffect({
      client: params.client,
      jobId: params.jobId,
      organizationId: params.organizationId,
      leadId: params.leadId,
      correlationId: params.requestId,
      workerId: params.workerId,
      leaseToken: params.leaseToken,
      leaseGeneration: params.leaseGeneration,
      key: "ghl_delivery",
      required: requiredEffects.has("ghl_delivery"),
      invoke: enabledEffects.has("ghl_delivery")
        ? params.enqueueGhlDelivery
        : async () => ({ queued: false, skipped: true, reason: "effect_disabled_by_policy" }),
      evaluate: evaluateGhlDeliveryResult,
    }),
  ]);
  const keys: LeadEffectKey[] = ["agent_notification", "meta_conversion", "ghl_delivery"];
  const outcomes = settledOutcomes.map((settled, index): LeadEffectOutcome => {
    if (settled.status === "fulfilled") {
      return settled.value;
    }

    const key = keys[index];
    const previous = persisted.get(key);
    return {
      key,
      required: requiredEffects.has(key),
      status: "failed",
      retryable: true,
      reason: "effect_state_persistence_failed",
      attemptCount: Math.max(0, previous?.attempt_count ?? 0) + 1,
      reused: false,
      result: {
        reason: "effect_state_persistence_failed",
        message:
          settled.reason instanceof Error
            ? settled.reason.message
            : "Lead effect state could not be persisted.",
      },
    };
  });
  const summary = aggregateLeadEffectOutcomes({
    requestId: params.requestId,
    leadId: params.leadId,
    outcomes,
  });

  if (!summary.allRequiredSucceeded) {
    throw new LeadEffectsIncompleteError(summary);
  }

  return summary;
}
