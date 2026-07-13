import "server-only";

import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import type {
  ApprovedOptimizationPolicy,
  OptimizationEvidenceDecision,
  OptimizationEvidenceMetrics,
  OptimizationSourceStatus,
} from "@/lib/optimization-engine/safety-policy";
import { OPTIMIZATION_POLICY_CONTRACT_VERSION } from "@/lib/optimization-engine/safety-policy";
import { getAppContext } from "@/lib/services/app-context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

function canonicalizeForDigest(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeForDigest);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, entryValue]) => [key, canonicalizeForDigest(entryValue)]),
    );
  }

  return value;
}

function digest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalizeForDigest(value)))
    .digest("hex");
}

export async function recordOptimizationDecision(params: {
  campaignId: string;
  sourceStatus: OptimizationSourceStatus;
  sourceTimestamp: string | null;
  metrics: OptimizationEvidenceMetrics | null;
  evidence: OptimizationEvidenceDecision;
  approvedPolicy: ApprovedOptimizationPolicy | null;
  lastProviderMutationAt?: string | null;
  proposedActions: string[];
  internalActor?: { organizationId: string; userId: string };
}) {
  const admin = createAdminClient();
  const context = params.internalActor
    ? {
        organization: { id: params.internalActor.organizationId },
        user: { id: params.internalActor.userId },
      }
    : await getAppContext();

  if (!context || !admin) {
    throw new ApiError(
      503,
      "Optimization decision persistence is unavailable.",
      "optimization_decision_store_unavailable",
    );
  }

  const policyContract = {
    version: OPTIMIZATION_POLICY_CONTRACT_VERSION,
    approvedPolicy: params.approvedPolicy,
    lastProviderMutationAt: params.lastProviderMutationAt ?? null,
    evaluatedAuthority: {
      policyApprovalId: params.evidence.policyApprovalId,
      proposalMode: params.evidence.proposalMode,
      providerMutationAllowed: params.evidence.canExecuteProviderMutation,
    },
  };
  const inputSnapshot = {
    sourceTimestamp: params.sourceTimestamp,
    metrics: params.metrics,
  };
  const policyDigest = digest(policyContract);
  const idempotencyKey = `optimization:${params.campaignId}:${digest({
    sourceStatus: params.sourceStatus,
    inputSnapshot,
    evidence: params.evidence,
    policyDigest,
    proposedActions: params.proposedActions,
  })}`;
  const proposedAction =
    params.proposedActions.length > 0
      ? params.proposedActions.join(" | ")
      : "HOLD_NO_ACTION";
  const insertPayload = {
    organization_id: context.organization.id,
    campaign_id: params.campaignId,
    policy_id: params.evidence.policyApprovalId ?? "UNAPPROVED_HOLD",
    policy_digest: policyDigest,
    idempotency_key: idempotencyKey,
    mode: "shadow",
    source_status: params.sourceStatus,
    source_timestamp: params.sourceTimestamp,
    input_snapshot: inputSnapshot as unknown as Json,
    authority_checks: {
      ...params.evidence,
      policyContract,
    } as unknown as Json,
    proposed_action: proposedAction,
    reasons: params.evidence.blockers as unknown as Json,
    before_state: { metrics: params.metrics } as unknown as Json,
    intended_state: {
      decisionState: params.evidence.decisionState,
      proposedActions: params.proposedActions,
    } as unknown as Json,
    simulated_result: {
      persistenceMode: "immutable_insert",
      liveActionPerformed: false,
    } as unknown as Json,
    live_action_performed: false,
    recovery_status: "not_required",
  };
  const { data: inserted, error: insertError } = await (admin as any)
    .from("optimization_decisions")
    .upsert(
      insertPayload,
      {
        onConflict: "organization_id,idempotency_key",
        ignoreDuplicates: true,
      },
    )
    .select("id,idempotency_key,created_at")
    .maybeSingle();

  if (insertError) {
    throw new ApiError(
      500,
      insertError.message ?? "Optimization decision could not be persisted.",
      "optimization_decision_persist_failed",
    );
  }

  let data = inserted;
  if (!data?.id) {
    const { data: existing, error: existingError } = await (admin as any)
      .from("optimization_decisions")
      .select("id,idempotency_key,created_at")
      .eq("organization_id", context.organization.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingError || !existing?.id) {
      throw new ApiError(
        500,
        existingError?.message ?? "Optimization decision replay could not be reconciled.",
        "optimization_decision_reconcile_failed",
      );
    }
    data = existing;
  }

  return {
    id: String(data.id),
    idempotencyKey: String(data.idempotency_key ?? idempotencyKey),
    createdAt: String(data.created_at),
    liveActionPerformed: false as const,
  };
}
