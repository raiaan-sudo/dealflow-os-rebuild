import "server-only";

import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { readMetaOptimizationAuthority } from "@/lib/authority/owner-decision-authority";
import { getDeploymentTarget } from "@/lib/deployment-target";
import { assertCustomerApprovedMetaBudgetCents } from "@/lib/integrations/meta/budget-safety";
import { buildMetaGraphUrl, withMetaBearerToken } from "@/lib/integrations/meta/contract";
import { getMetaAccessToken } from "@/lib/integrations/meta/execution";
import { fetchMetaJson } from "@/lib/integrations/meta/request";
import type { MetaConnectionRecord } from "@/lib/integrations/meta/types";
import { evaluateMetaOptimizationExecutionGate } from "@/lib/meta-optimization-execution-gate";
import { createAdminClient } from "@/lib/supabase/admin";

type OptimizationEnvironment = "staging" | "production";
type OptimizationAction = "pause" | "budget";
type OptimizationObjectType = "campaign" | "adset";

type OptimizationClaim = {
  id: string;
  organizationId: string;
  userId: string;
  campaignId: string;
  environment: OptimizationEnvironment;
  policyAuthorizationId: string;
  approvedCurrency: "USD" | "CAD";
  providerAdAccountId: string;
  providerCampaignId: string;
  providerObjectType: OptimizationObjectType;
  providerObjectId: string;
  actionType: OptimizationAction;
  currentDailyBudgetMinor: number;
  intendedDailyBudgetMinor: number | null;
  customerDailyBudgetCeilingMinor: number;
  workerId: string;
  leaseToken: string;
  leaseGeneration: number;
  claimedControlGeneration: number;
};

export type MetaOptimizationProviderState = {
  accountId: string;
  campaignId: string;
  objectType: OptimizationObjectType;
  objectId: string;
  currency: "USD" | "CAD";
  configuredStatus: "ACTIVE" | "PAUSED";
  effectiveStatus: string;
  dailyBudgetMinor: number | null;
};

type OptimizationProvider = {
  readState(claim: OptimizationClaim): Promise<MetaOptimizationProviderState>;
  apply(
    claim: OptimizationClaim,
    executionToken: string,
    dispatchAuthorityNonce: string,
  ): Promise<{ providerReceiptId: string }>;
};

type OptimizationClient = {
  rpc(name: string, params?: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
  from(relation: string): any;
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeProviderId(value: unknown) {
  const result = String(value ?? "").trim().replace(/^act_/, "");
  return /^[0-9]{5,40}$/.test(result) ? result : "";
}

function parseClaim(value: unknown): OptimizationClaim | null {
  const row = recordValue(Array.isArray(value) ? value[0] : value);
  if (!row) return null;
  const claim = {
    id: String(row.id ?? ""),
    organizationId: String(row.organization_id ?? ""),
    userId: String(row.user_id ?? ""),
    campaignId: String(row.campaign_id ?? ""),
    environment: String(row.environment ?? "") as OptimizationEnvironment,
    policyAuthorizationId: String(row.policy_authorization_id ?? ""),
    approvedCurrency: String(row.approved_currency ?? "") as "USD" | "CAD",
    providerAdAccountId: normalizeProviderId(row.provider_ad_account_id),
    providerCampaignId: normalizeProviderId(row.provider_campaign_id),
    providerObjectType: String(row.provider_object_type ?? "") as OptimizationObjectType,
    providerObjectId: normalizeProviderId(row.provider_object_id),
    actionType: String(row.action_type ?? "") as OptimizationAction,
    currentDailyBudgetMinor: Number(row.current_daily_budget_minor),
    intendedDailyBudgetMinor: row.intended_daily_budget_minor === null ? null : Number(row.intended_daily_budget_minor),
    customerDailyBudgetCeilingMinor: Number(row.customer_daily_budget_ceiling_minor),
    workerId: String(row.worker_id ?? ""),
    leaseToken: String(row.lease_token ?? ""),
    leaseGeneration: Number(row.lease_generation),
    claimedControlGeneration: Number(row.claimed_control_generation),
  };
  if (
    !/^[0-9a-f-]{36}$/i.test(claim.id) ||
    !/^[0-9a-f-]{36}$/i.test(claim.organizationId) ||
    !/^[0-9a-f-]{36}$/i.test(claim.userId) ||
    !/^[0-9a-f-]{36}$/i.test(claim.campaignId) ||
    !/^[0-9a-f-]{36}$/i.test(claim.policyAuthorizationId) ||
    (claim.environment !== "staging" && claim.environment !== "production") ||
    (claim.approvedCurrency !== "USD" && claim.approvedCurrency !== "CAD") ||
    !claim.providerAdAccountId || !claim.providerCampaignId || !claim.providerObjectId ||
    !["campaign", "adset"].includes(claim.providerObjectType) ||
    !["pause", "budget"].includes(claim.actionType) ||
    !Number.isSafeInteger(claim.currentDailyBudgetMinor) ||
    !Number.isSafeInteger(claim.customerDailyBudgetCeilingMinor) ||
    claim.workerId.length < 8 ||
    !/^[0-9a-f-]{36}$/i.test(claim.leaseToken) ||
    !Number.isSafeInteger(claim.leaseGeneration) ||
    !Number.isSafeInteger(claim.claimedControlGeneration) || claim.claimedControlGeneration < 1
  ) {
    throw new ApiError(500, "Optimization claim is malformed.", "meta_optimization_claim_invalid");
  }
  return claim;
}

function assertClaimAuthority(
  claim: OptimizationClaim,
  gateAccountIds: readonly string[],
  gateEnvironment: OptimizationEnvironment,
  env: Record<string, string | undefined>,
) {
  if (claim.environment !== gateEnvironment || !gateAccountIds.includes(claim.providerAdAccountId)) {
    throw new ApiError(409, "Optimization claim is not bound to the approved Meta account and environment.", "meta_optimization_account_drift");
  }
  assertCustomerApprovedMetaBudgetCents(claim.currentDailyBudgetMinor, "Current Meta optimization daily budget", env);
  assertCustomerApprovedMetaBudgetCents(claim.customerDailyBudgetCeilingMinor, "Customer Meta optimization daily ceiling", env);
  if (claim.currentDailyBudgetMinor > claim.customerDailyBudgetCeilingMinor) {
    throw new ApiError(409, "The current Meta budget exceeds customer authority.", "meta_optimization_ceiling_drift");
  }
  if (claim.actionType === "pause") {
    if (claim.providerObjectType !== "campaign" || claim.providerObjectId !== claim.providerCampaignId || claim.intendedDailyBudgetMinor !== null) {
      throw new ApiError(409, "Pause intent authority is malformed.", "meta_optimization_intent_drift");
    }
    return;
  }
  const intended = claim.intendedDailyBudgetMinor;
  if (
    claim.providerObjectType !== "adset" || intended === null ||
    !Number.isSafeInteger(intended) ||
    intended !== Math.floor(claim.currentDailyBudgetMinor * 1.2) ||
    intended > claim.customerDailyBudgetCeilingMinor
  ) {
    throw new ApiError(409, "Budget intent exceeds exact customer or policy authority.", "meta_optimization_budget_drift");
  }
  assertCustomerApprovedMetaBudgetCents(intended, "Intended Meta optimization daily budget", env);
}

async function metaJson<T>(path: string, accessToken: string, fields: string) {
  const { response, data } = await fetchMetaJson<(T & { error?: { message?: string } }) | null>(
    buildMetaGraphUrl(path, { fields }),
    { purpose: "optimization", method: "GET", ...withMetaBearerToken(accessToken) },
  );
  if (!response.ok || !data) {
    throw new ApiError(502, "Meta optimization preflight did not return a definitive object.", "meta_optimization_provider_read_failed");
  }
  return data;
}

function createMetaOptimizationProvider(params: {
  connection: MetaConnectionRecord;
  gateAccountIds: readonly string[];
  gateEnvironment: OptimizationEnvironment;
  env: Record<string, string | undefined>;
}): OptimizationProvider {
  const accessToken = getMetaAccessToken(params.connection);
  return {
    async readState(claim) {
      assertClaimAuthority(claim, params.gateAccountIds, params.gateEnvironment, params.env);
      const account = await metaJson<{ id?: string; account_id?: string; currency?: string }>(
        `act_${claim.providerAdAccountId}`,
        accessToken,
        "id,account_id,currency",
      );
      const accountId = normalizeProviderId(account.account_id ?? account.id);
      const currency = String(account.currency ?? "").trim().toUpperCase();
      if (accountId !== claim.providerAdAccountId || currency !== claim.approvedCurrency) {
        throw new ApiError(409, "Meta account or currency drifted from customer authority.", "meta_optimization_provider_authority_drift");
      }
      const object = await metaJson<{
        id?: string; account_id?: string; campaign_id?: string; status?: string;
        effective_status?: string; daily_budget?: string | number;
      }>(claim.providerObjectId, accessToken, "id,account_id,campaign_id,status,effective_status,daily_budget");
      const objectId = normalizeProviderId(object.id);
      const objectAccountId = normalizeProviderId(object.account_id);
      const campaignId = claim.providerObjectType === "campaign"
        ? objectId
        : normalizeProviderId(object.campaign_id);
      const configuredStatus = String(object.status ?? "").trim().toUpperCase();
      const dailyBudgetMinor = claim.providerObjectType === "adset" ? Number(object.daily_budget) : null;
      if (
        objectId !== claim.providerObjectId || objectAccountId !== claim.providerAdAccountId ||
        campaignId !== claim.providerCampaignId ||
        (configuredStatus !== "ACTIVE" && configuredStatus !== "PAUSED") ||
        (claim.providerObjectType === "adset" && !Number.isSafeInteger(dailyBudgetMinor))
      ) {
        throw new ApiError(409, "Meta object hierarchy or state drifted from customer authority.", "meta_optimization_provider_object_drift");
      }
      return {
        accountId,
        campaignId,
        objectType: claim.providerObjectType,
        objectId,
        currency: currency as "USD" | "CAD",
        configuredStatus: configuredStatus as "ACTIVE" | "PAUSED",
        effectiveStatus: String(object.effective_status ?? "UNKNOWN").trim().toUpperCase(),
        dailyBudgetMinor,
      };
    },
    async apply(claim, executionToken, dispatchAuthorityNonce) {
      assertClaimAuthority(claim, params.gateAccountIds, params.gateEnvironment, params.env);
      if (
        !/^[0-9a-f-]{36}$/i.test(executionToken) ||
        !/^[0-9a-f-]{36}$/i.test(dispatchAuthorityNonce)
      ) {
        throw new ApiError(500, "Optimization effect token is invalid.", "meta_optimization_effect_token_invalid");
      }
      const payload = claim.actionType === "pause"
        ? { status: "PAUSED" }
        : { daily_budget: claim.intendedDailyBudgetMinor };
      const { response, data } = await fetchMetaJson<{ success?: boolean; id?: string; error?: { message?: string } } | null>(
        buildMetaGraphUrl(claim.providerObjectId),
        {
          purpose: "optimization",
          method: "POST",
          ...withMetaBearerToken(accessToken, { headers: { "Content-Type": "application/json" } }),
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok || data?.success !== true) {
        throw new ApiError(502, "Meta did not return a definitive optimization receipt.", "meta_optimization_provider_ambiguous");
      }
      const traceId = response.headers.get("x-fb-trace-id")?.trim();
      return {
        providerReceiptId: traceId
          ? `meta-trace:${traceId.slice(0, 160)}`
          : `meta-dispatch:${dispatchAuthorityNonce}`,
      };
    },
  };
}

function desiredStateMatches(claim: OptimizationClaim, state: MetaOptimizationProviderState) {
  return claim.actionType === "pause"
    ? state.configuredStatus === "PAUSED"
    : state.configuredStatus === "ACTIVE" &&
      state.effectiveStatus === "ACTIVE" &&
      state.dailyBudgetMinor === claim.intendedDailyBudgetMinor;
}

async function confirmProviderDispatch(
  client: OptimizationClient,
  claim: OptimizationClaim,
  executionToken: string,
) {
  const { data, error } = await client.rpc("confirm_meta_optimization_execution_dispatch", {
    p_intent_id: claim.id,
    p_worker_id: claim.workerId,
    p_lease_token: claim.leaseToken,
    p_lease_generation: claim.leaseGeneration,
    p_execution_token: executionToken,
  });
  if (error) {
    throw new ApiError(
      409,
      error.message ?? "Optimization dispatch authority was rejected.",
      "meta_optimization_dispatch_rejected",
    );
  }
  const dispatch = recordValue(Array.isArray(data) ? data[0] : data);
  const nonce = String(dispatch?.dispatch_authority_nonce ?? "");
  const authorityDigest = String(dispatch?.dispatch_authority_digest ?? "");
  const checkedAt = Date.parse(String(dispatch?.dispatch_authority_checked_at ?? ""));
  const controlGeneration = Number(dispatch?.dispatch_control_generation);
  if (
    !/^[0-9a-f-]{36}$/i.test(nonce) ||
    !/^[0-9a-f]{64}$/.test(authorityDigest) ||
    !Number.isFinite(checkedAt) ||
    controlGeneration !== claim.claimedControlGeneration
  ) {
    throw new ApiError(
      500,
      "Optimization dispatch authority receipt is invalid.",
      "meta_optimization_dispatch_receipt_invalid",
    );
  }
  return nonce;
}

async function resolveConnection(client: OptimizationClient, claim: OptimizationClaim) {
  const { data, error } = await client.from("marketing_accounts")
    .select("*")
    .eq("organization_id", claim.organizationId)
    .eq("platform", "meta_ads")
    .eq("status", "connected")
    .in("external_account_id", [claim.providerAdAccountId, `act_${claim.providerAdAccountId}`])
    .limit(2);
  const rows = Array.isArray(data) ? data : [];
  if (error || rows.length !== 1) {
    throw new ApiError(409, "The exact connected Meta sandbox account is unavailable.", "meta_optimization_connection_ambiguous");
  }
  return rows[0] as MetaConnectionRecord;
}

async function releasePreEffect(client: OptimizationClient, claim: OptimizationClaim, error: unknown) {
  const { data, error: rpcError } = await client.rpc("release_meta_optimization_execution_claim", {
    p_intent_id: claim.id,
    p_worker_id: claim.workerId,
    p_lease_token: claim.leaseToken,
    p_lease_generation: claim.leaseGeneration,
    p_outcome: !(error instanceof ApiError) || error.status >= 500 ? "retry" : "operator_required",
    p_error_code: error instanceof ApiError ? error.code : "meta_optimization_preflight_failed",
    p_error_message: "Optimization stopped safely before provider-effect arming.",
  });
  if (rpcError || data !== true) throw new ApiError(409, "Optimization pre-effect lease was lost.", "meta_optimization_release_failed");
}

async function settleArmed(params: {
  client: OptimizationClient;
  claim: OptimizationClaim;
  executionToken: string;
  outcome: "succeeded" | "operator_required";
  providerMutationPerformed: boolean;
  providerReceiptId: string | null;
  afterState: MetaOptimizationProviderState | null;
  errorCode?: string;
}) {
  const { data, error } = await params.client.rpc("settle_meta_optimization_execution_intent", {
    p_intent_id: params.claim.id,
    p_worker_id: params.claim.workerId,
    p_lease_token: params.claim.leaseToken,
    p_lease_generation: params.claim.leaseGeneration,
    p_execution_token: params.executionToken,
    p_outcome: params.outcome,
    p_provider_mutation_performed: params.providerMutationPerformed,
    p_provider_receipt_id: params.providerReceiptId,
    p_after_state: params.afterState,
    p_error_code: params.errorCode ?? null,
    p_error_message: params.outcome === "operator_required" ? "An armed Meta optimization effect requires operator reconciliation." : null,
  });
  if (error || data !== true) throw new ApiError(409, "Optimization armed-effect settlement failed.", "meta_optimization_settlement_failed");
}

export async function enqueueMetaOptimizationExecutionIntent(params: {
  organizationId: string;
  userId: string;
  campaignId: string;
  decisionId: string;
  actionType: OptimizationAction;
  actionReason: string;
  intendedDailyBudgetMinor: number | null;
}) {
  const target = getDeploymentTarget();
  if (target !== "staging" && target !== "production") return null;
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  const { data, error } = await (admin as any).rpc("enqueue_meta_optimization_execution_intent", {
    p_organization_id: params.organizationId,
    p_user_id: params.userId,
    p_campaign_id: params.campaignId,
    p_decision_id: params.decisionId,
    p_environment: target,
    p_action_type: params.actionType,
    p_action_reason: params.actionReason,
    p_intended_daily_budget_minor: params.intendedDailyBudgetMinor,
    p_idempotency_key: `optimizer-exec:${params.decisionId}:${params.actionType}`,
  });
  if (error) throw new ApiError(409, error.message ?? "Optimization intent was rejected.", "meta_optimization_enqueue_rejected");
  const record = recordValue(Array.isArray(data) ? data[0] : data);
  return record?.id ? String(record.id) : null;
}

export async function processMetaOptimizationExecutionBatch(params: {
  maxClaims?: number;
  environment?: Record<string, string | undefined>;
  client?: OptimizationClient;
  providerFactory?: (claim: OptimizationClaim) => Promise<OptimizationProvider>;
} = {}) {
  const env = params.environment ?? process.env;
  const gate = evaluateMetaOptimizationExecutionGate(
    env,
    await readMetaOptimizationAuthority(),
  );
  if (!gate.enabled) {
    return { enabled: false, blockedReason: gate.blockedReason, claimedCount: 0, completedIds: [] as string[], operatorRequiredIds: [] as string[] };
  }
  const client = params.client ?? (createAdminClient() as unknown as OptimizationClient | null);
  if (!client) return { enabled: false, blockedReason: "service_role_missing", claimedCount: 0, completedIds: [] as string[], operatorRequiredIds: [] as string[] };
  const completedIds: string[] = [];
  const operatorRequiredIds: string[] = [];
  let claimedCount = 0;
  const maxClaims = Math.min(3, Math.max(1, params.maxClaims ?? 1));

  for (let index = 0; index < maxClaims; index += 1) {
    const workerId = `meta-optimizer:${randomUUID()}`;
    const { data, error } = await client.rpc("claim_meta_optimization_execution_intent", {
      p_environment: gate.environment,
      p_worker_id: workerId,
      p_lease_seconds: 300,
    });
    if (error) throw new ApiError(500, error.message ?? "Optimization claim failed.", "meta_optimization_claim_failed");
    const claim = parseClaim(data);
    if (!claim) break;
    if (claim.workerId !== workerId) {
      throw new ApiError(500, "Optimization claim worker fencing is invalid.", "meta_optimization_worker_fence_invalid");
    }
    claimedCount += 1;
    let armed: Record<string, unknown> | null = null;
    let provider: OptimizationProvider | null = null;
    let providerDispatchAuthorized = false;
    try {
      assertClaimAuthority(claim, gate.accountIds, gate.environment, env);
      provider = params.providerFactory
        ? await params.providerFactory(claim)
        : createMetaOptimizationProvider({
            connection: await resolveConnection(client, claim),
            gateAccountIds: gate.accountIds,
            gateEnvironment: gate.environment,
            env,
          });
      const beforeState = await provider.readState(claim);
      if (
        claim.actionType === "budget" &&
        (beforeState.configuredStatus !== "ACTIVE" ||
          beforeState.effectiveStatus !== "ACTIVE" ||
          beforeState.dailyBudgetMinor !== claim.currentDailyBudgetMinor)
      ) {
        throw new ApiError(
          409,
          "Meta budget or effective delivery changed after the intent was created.",
          "meta_optimization_before_state_drift",
        );
      }
      const armResult = await client.rpc("arm_meta_optimization_execution_intent", {
        p_intent_id: claim.id,
        p_worker_id: claim.workerId,
        p_lease_token: claim.leaseToken,
        p_lease_generation: claim.leaseGeneration,
        p_before_state: beforeState,
      });
      if (armResult.error) throw new ApiError(409, armResult.error.message ?? "Optimization arming was rejected.", "meta_optimization_arm_rejected");
      armed = recordValue(Array.isArray(armResult.data) ? armResult.data[0] : armResult.data);
      const executionToken = String(armed?.execution_token ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(executionToken)) throw new ApiError(500, "Optimization arming receipt is invalid.", "meta_optimization_arm_receipt_invalid");

      // No asynchronous work is permitted between this repeated authority check
      // and the single provider write other than the write itself.
      const repeatedGate = evaluateMetaOptimizationExecutionGate(
        env,
        await readMetaOptimizationAuthority(),
      );
      if (
        !repeatedGate.enabled ||
        repeatedGate.environment !== claim.environment ||
        !repeatedGate.accountIds.includes(claim.providerAdAccountId)
      ) {
        throw new ApiError(409, "Optimization authority changed after arming.", "meta_optimization_post_arm_gate_changed");
      }
      assertClaimAuthority(claim, repeatedGate.accountIds, repeatedGate.environment, env);
      const dispatchAuthorityNonce = await confirmProviderDispatch(
        client,
        claim,
        executionToken,
      );
      // A durable one-use dispatch receipt makes every later provider outcome
      // ambiguous until reconciled. Never downgrade a post-dispatch failure to
      // a no-effect result, even if the provider call or settlement throws.
      providerDispatchAuthorized = true;
      let providerReceiptId: string | null = null;
      try {
        // The provider write is the first asynchronous operation after the
        // durable, one-use dispatch fence above.
        providerReceiptId = (
          await provider.apply(claim, executionToken, dispatchAuthorityNonce)
        ).providerReceiptId;
        const afterState = await provider.readState(claim);
        if (!desiredStateMatches(claim, afterState)) throw new Error("provider_state_not_reconciled");
        await settleArmed({ client, claim, executionToken, outcome: "succeeded", providerMutationPerformed: true, providerReceiptId, afterState });
        completedIds.push(claim.id);
      } catch {
        let afterState: MetaOptimizationProviderState | null = null;
        try { afterState = await provider.readState(claim); } catch { afterState = null; }
        if (afterState && desiredStateMatches(claim, afterState)) {
          await settleArmed({ client, claim, executionToken, outcome: "succeeded", providerMutationPerformed: true, providerReceiptId: providerReceiptId ?? "reconciled-after-ambiguous", afterState });
          completedIds.push(claim.id);
        } else {
          await settleArmed({ client, claim, executionToken, outcome: "operator_required", providerMutationPerformed: true, providerReceiptId, afterState, errorCode: "meta_optimization_provider_ambiguous" });
          operatorRequiredIds.push(claim.id);
        }
      }
    } catch (caughtError) {
      if (armed) {
        const executionToken = String(armed.execution_token ?? "");
        await settleArmed({
          client,
          claim,
          executionToken,
          outcome: "operator_required",
          providerMutationPerformed: providerDispatchAuthorized,
          providerReceiptId: null,
          afterState: null,
          errorCode: providerDispatchAuthorized
            ? "meta_optimization_post_dispatch_ambiguous"
            : "meta_optimization_post_arm_failure",
        });
        operatorRequiredIds.push(claim.id);
      } else {
        await releasePreEffect(client, claim, caughtError);
      }
    }
  }
  return { enabled: true, blockedReason: null, claimedCount, completedIds, operatorRequiredIds };
}
