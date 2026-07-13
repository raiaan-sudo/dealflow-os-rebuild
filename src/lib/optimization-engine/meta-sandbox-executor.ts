import { createHash } from "node:crypto";

export type MetaOptimizationAction =
  | { type: "pause"; campaignId: string }
  | { type: "budget"; campaignId: string; dailyBudget: number };

export type MetaOptimizationBeforeState = {
  campaignId: string;
  accountId: string;
  configuredStatus: string;
  dailyBudget: number;
  revision: string;
};

export type MetaOptimizationReceipt = {
  idempotencyKey: string;
  providerReceiptId: string;
  before: MetaOptimizationBeforeState;
  intended: MetaOptimizationAction;
  after: MetaOptimizationBeforeState | null;
  reconciled: boolean;
  rollback: { required: boolean; succeeded: boolean | null; reason: string | null };
};

export type MetaSandboxExecutorEnvironment = Record<string, string | undefined>;

export function getMetaSandboxOptimizationGate(
  env: MetaSandboxExecutorEnvironment,
  accountId: string,
) {
  if (env.DEALFLOW_DEPLOYMENT_TARGET === "production" || env.VERCEL_ENV === "production") {
    return { allowed: false as const, reason: "production_forbidden" };
  }
  if (!["staging", "preview", "test"].includes(env.DEALFLOW_DEPLOYMENT_TARGET ?? "")) {
    return { allowed: false as const, reason: "deployment_target_unattested" };
  }
  if (env.META_OPTIMIZATION_EXECUTION_MODE !== "sandbox") {
    return { allowed: false as const, reason: "sandbox_mode_disabled" };
  }
  if (env.ALLOW_META_SANDBOX_OPTIMIZATION !== "true") {
    return { allowed: false as const, reason: "sandbox_executor_disabled" };
  }
  if (!env.META_OPTIMIZATION_SANDBOX_ACCOUNT_ID?.trim()) {
    return { allowed: false as const, reason: "sandbox_account_missing" };
  }
  if (env.META_OPTIMIZATION_SANDBOX_ACCOUNT_ID.trim() !== accountId.trim()) {
    return { allowed: false as const, reason: "sandbox_account_mismatch" };
  }
  return { allowed: true as const, reason: null };
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function executeFencedMetaSandboxOptimization(params: {
  env: MetaSandboxExecutorEnvironment;
  organizationId: string;
  accountId: string;
  action: MetaOptimizationAction;
  expectedBefore: MetaOptimizationBeforeState;
  customerDailyBudgetCeiling: number;
  switches: { global: boolean; account: boolean; campaign: boolean; emergencyStop: boolean };
  repository: {
    findReceipt(idempotencyKey: string): Promise<MetaOptimizationReceipt | null>;
    appendReceipt(receipt: MetaOptimizationReceipt): Promise<void>;
  };
  provider: {
    read(campaignId: string): Promise<MetaOptimizationBeforeState>;
    mutate(input: {
      action: MetaOptimizationAction;
      expectedRevision: string;
      idempotencyKey: string;
    }): Promise<{ receiptId: string }>;
    rollback(input: {
      campaignId: string;
      expectedRevision: string;
      restore: MetaOptimizationBeforeState;
      idempotencyKey: string;
    }): Promise<{ receiptId: string }>;
  };
}): Promise<MetaOptimizationReceipt> {
  const gate = getMetaSandboxOptimizationGate(params.env, params.accountId);
  if (!gate.allowed) throw new Error(gate.reason);
  if (Object.values(params.switches).some(Boolean)) throw new Error("kill_switch_active");
  if (
    params.expectedBefore.accountId !== params.accountId ||
    params.expectedBefore.campaignId !== params.action.campaignId
  ) throw new Error("before_state_scope_mismatch");
  if (
    params.action.type === "budget" &&
    (!Number.isFinite(params.action.dailyBudget) ||
      params.action.dailyBudget <= 0 ||
      params.action.dailyBudget > params.customerDailyBudgetCeiling)
  ) throw new Error("customer_budget_ceiling_exceeded");

  const idempotencyKey = `meta-opt:${params.organizationId}:${digest({
    action: params.action,
    beforeRevision: params.expectedBefore.revision,
  })}`;
  const existing = await params.repository.findReceipt(idempotencyKey);
  if (existing) return existing;

  const observedBefore = await params.provider.read(params.action.campaignId);
  if (
    observedBefore.revision !== params.expectedBefore.revision ||
    observedBefore.accountId !== params.accountId ||
    observedBefore.campaignId !== params.action.campaignId
  ) throw new Error("compare_and_swap_precondition_failed");

  const mutation = await params.provider.mutate({
    action: params.action,
    expectedRevision: observedBefore.revision,
    idempotencyKey,
  });
  let observedAfter: MetaOptimizationBeforeState;
  try {
    observedAfter = await params.provider.read(params.action.campaignId);
  } catch {
    const unavailableReceipt: MetaOptimizationReceipt = {
      idempotencyKey,
      providerReceiptId: mutation.receiptId,
      before: observedBefore,
      intended: params.action,
      after: null,
      reconciled: false,
      rollback: {
        required: true,
        succeeded: false,
        reason: "post_mutation_state_unavailable_operator_required",
      },
    };
    await params.repository.appendReceipt(unavailableReceipt);
    return unavailableReceipt;
  }
  const afterMatches =
    params.action.type === "pause"
      ? observedAfter.configuredStatus === "PAUSED"
      : observedAfter.dailyBudget === params.action.dailyBudget;

  let rollback = { required: !afterMatches, succeeded: null as boolean | null, reason: null as string | null };
  if (!afterMatches) {
    try {
      await params.provider.rollback({
        campaignId: params.action.campaignId,
        expectedRevision: observedAfter.revision,
        restore: observedBefore,
        idempotencyKey: `${idempotencyKey}:rollback`,
      });
      const restored = await params.provider.read(params.action.campaignId);
      rollback = {
        required: true,
        succeeded:
          restored.configuredStatus === observedBefore.configuredStatus &&
          restored.dailyBudget === observedBefore.dailyBudget,
        reason: "post_mutation_reconciliation_mismatch",
      };
    } catch {
      rollback = {
        required: true,
        succeeded: false,
        reason: "rollback_ambiguous_operator_required",
      };
    }
  }

  const receipt: MetaOptimizationReceipt = {
    idempotencyKey,
    providerReceiptId: mutation.receiptId,
    before: observedBefore,
    intended: params.action,
    after: observedAfter,
    reconciled: afterMatches,
    rollback,
  };
  await params.repository.appendReceipt(receipt);
  return receipt;
}
