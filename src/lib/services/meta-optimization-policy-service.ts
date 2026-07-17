import "server-only";

import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/route";
import { readMetaOptimizationAuthority } from "@/lib/authority/owner-decision-authority";
import { evaluateMetaOptimizationExecutionGate } from "@/lib/meta-optimization-execution-gate";
import type { ApprovedOptimizationPolicy } from "@/lib/optimization-engine/safety-policy";
import { getAppContext } from "@/lib/services/app-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

type RpcRecord = Record<string, unknown>;

export type MetaOptimizationPolicyStatus = {
  authorizationId: string;
  status: "active" | "revoked" | "operator_required";
  approvedCurrency: "USD" | "CAD";
  currentDailyBudgetMinor: number;
  customerDailyBudgetCeilingMinor: number;
  executionEnabled: boolean;
  killSwitchActive: boolean;
  runtimeExecutionEnabled: boolean;
  customerAuthorizedAt: string;
};

export type ActiveMetaOptimizationPolicy = MetaOptimizationPolicyStatus & {
  organizationId: string;
  userId: string;
  campaignId: string;
  providerAdAccountId: string;
  providerCampaignId: string;
  providerAdSetId: string;
  lastProviderMutationAt: string | null;
  scaleAppliedLast24HoursPercent: number;
  scaleWindowStartedAt: string | null;
  approvedPolicy: ApprovedOptimizationPolicy;
};

function firstRecord(value: unknown): RpcRecord | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === "object" ? (record as RpcRecord) : null;
}

function stringValue(record: RpcRecord, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integerValue(record: RpcRecord, key: string) {
  const value = Number(record[key]);
  return Number.isSafeInteger(value) ? value : null;
}

function parseStatus(record: RpcRecord | null, runtimeExecutionEnabled = false): MetaOptimizationPolicyStatus | null {
  if (!record) return null;
  const authorizationId = stringValue(record, "authorization_id") ?? stringValue(record, "id");
  const status = stringValue(record, "authorization_status") ?? stringValue(record, "status");
  const approvedCurrency = stringValue(record, "approved_currency");
  const currentDailyBudgetMinor = integerValue(record, "current_daily_budget_minor");
  const customerDailyBudgetCeilingMinor = integerValue(record, "customer_daily_budget_ceiling_minor");
  const customerAuthorizedAt = stringValue(record, "customer_authorized_at");
  if (
    !authorizationId ||
    !["active", "revoked", "operator_required"].includes(status ?? "") ||
    !["USD", "CAD"].includes(approvedCurrency ?? "") ||
    currentDailyBudgetMinor === null ||
    customerDailyBudgetCeilingMinor === null ||
    !customerAuthorizedAt
  ) {
    throw new ApiError(500, "Optimization policy authority returned an invalid result.", "meta_optimization_policy_result_invalid");
  }
  return {
    authorizationId,
    status: status as MetaOptimizationPolicyStatus["status"],
    approvedCurrency: approvedCurrency as MetaOptimizationPolicyStatus["approvedCurrency"],
    currentDailyBudgetMinor,
    customerDailyBudgetCeilingMinor,
    executionEnabled: record.execution_enabled === true,
    killSwitchActive:
      record.global_kill_switch === true ||
      record.account_kill_switch === true ||
      record.campaign_kill_switch === true ||
      record.emergency_stop === true,
    runtimeExecutionEnabled,
    customerAuthorizedAt,
  };
}

export async function authorizeMetaOptimizationPolicy(params: {
  campaignId: string;
  customerDailyBudgetCeilingMinor: number;
  approvedCurrency: "USD" | "CAD";
}) {
  const context = await getAppContext();
  if (!context) throw new ApiError(401, "Authentication is required.", "unauthorized");
  if (!Number.isSafeInteger(params.customerDailyBudgetCeilingMinor) || params.customerDailyBudgetCeilingMinor < 100) {
    throw new ApiError(400, "Enter a valid daily budget ceiling.", "meta_optimization_budget_ceiling_invalid");
  }
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  const { data, error } = await (admin as any).rpc("authorize_meta_optimization_policy", {
    p_organization_id: context.organization.id,
    p_customer_user_id: context.user.id,
    p_campaign_id: params.campaignId,
    p_customer_daily_budget_ceiling_minor: params.customerDailyBudgetCeilingMinor,
    p_approved_currency: params.approvedCurrency,
    p_confirmation: "ENABLE_AUTONOMOUS_META_OPTIMIZATION",
    p_idempotency_key: `optimization-policy:${params.campaignId}:${randomUUID()}`,
  });
  if (error) {
    throw new ApiError(409, error.message ?? "Optimization authorization was rejected.", "meta_optimization_policy_rejected");
  }
  const record = firstRecord(data);
  if (!record) throw new ApiError(500, "Optimization authorization returned no receipt.", "meta_optimization_policy_receipt_missing");
  return {
    authorizationId: stringValue(record, "id"),
    status: stringValue(record, "status"),
    approvedCurrency: stringValue(record, "approved_currency"),
    currentDailyBudgetMinor: integerValue(record, "current_daily_budget_minor"),
    customerDailyBudgetCeilingMinor: integerValue(record, "customer_daily_budget_ceiling_minor"),
    customerAuthorizedAt: stringValue(record, "customer_authorized_at"),
  };
}

export async function getMetaOptimizationPolicyStatus(campaignId: string) {
  const [context, client] = await Promise.all([getAppContext(), createRouteHandlerClient()]);
  if (!context) throw new ApiError(401, "Authentication is required.", "unauthorized");
  if (!client) throw new ApiError(503, "Supabase is not configured.", "config_missing");
  const { data, error } = await (client as any).rpc("get_meta_optimization_policy_status", {
    p_organization_id: context.organization.id,
    p_campaign_id: campaignId,
  });
  if (error) throw new ApiError(500, error.message ?? "Optimization status is unavailable.", "meta_optimization_status_unavailable");
  const gate = evaluateMetaOptimizationExecutionGate(
    process.env,
    await readMetaOptimizationAuthority(),
  );
  let runtimeExecutionEnabled = false;
  if (gate.enabled) {
    const admin = createAdminClient();
    if (admin) {
      const { data: control, error: controlError } = await (admin as any)
        .from("meta_optimization_runtime_controls")
        .select("provider_mode,execution_writes_enabled,global_kill_switch")
        .eq("environment", gate.environment)
        .maybeSingle();
      if (controlError) {
        throw new ApiError(500, controlError.message, "meta_optimization_runtime_status_unavailable");
      }
      runtimeExecutionEnabled =
        control?.execution_writes_enabled === true &&
        control?.global_kill_switch === false &&
        control?.provider_mode === (gate.environment === "staging" ? "sandbox" : "live");
    }
  }
  return parseStatus(firstRecord(data), runtimeExecutionEnabled);
}

export async function revokeMetaOptimizationPolicy(campaignId: string, authorizationId: string) {
  const [context, client] = await Promise.all([getAppContext(), createRouteHandlerClient()]);
  if (!context) throw new ApiError(401, "Authentication is required.", "unauthorized");
  if (!client) throw new ApiError(503, "Supabase is not configured.", "config_missing");
  const { data, error } = await (client as any).rpc("revoke_meta_optimization_policy", {
    p_organization_id: context.organization.id,
    p_campaign_id: campaignId,
    p_authorization_id: authorizationId,
    p_confirmation: "DISABLE_AUTONOMOUS_META_OPTIMIZATION",
  });
  if (error) throw new ApiError(409, error.message ?? "Optimization revocation was rejected.", "meta_optimization_revocation_rejected");
  return data === true;
}

export async function getActiveMetaOptimizationPolicyForCampaign(params: {
  organizationId: string;
  userId: string;
  campaignId: string;
}): Promise<ActiveMetaOptimizationPolicy | null> {
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  const { data: controls, error: controlsError } = await (admin as any)
    .from("optimization_campaign_controls")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .eq("campaign_id", params.campaignId)
    .maybeSingle();
  if (controlsError) throw new ApiError(500, controlsError.message, "meta_optimization_policy_lookup_failed");
  if (!controls?.active_policy_authorization_id) return null;
  const { data: policy, error: policyError } = await (admin as any)
    .from("meta_optimization_policy_authorizations")
    .select("*")
    .eq("id", controls.active_policy_authorization_id)
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .eq("campaign_id", params.campaignId)
    .eq("status", "active")
    .maybeSingle();
  if (policyError) throw new ApiError(500, policyError.message, "meta_optimization_policy_lookup_failed");
  if (!policy || policy.status !== "active") return null;
  const currentDailyBudgetMinor = Number(controls.last_known_daily_budget_minor);
  const customerDailyBudgetCeilingMinor = Number(policy.customer_daily_budget_ceiling_minor);
  if (!Number.isSafeInteger(currentDailyBudgetMinor) || !Number.isSafeInteger(customerDailyBudgetCeilingMinor)) {
    throw new ApiError(500, "Optimization budget authority is invalid.", "meta_optimization_budget_authority_invalid");
  }
  const currency = String(policy.approved_currency);
  if (currency !== "USD" && currency !== "CAD") {
    throw new ApiError(500, "Optimization currency authority is invalid.", "meta_optimization_currency_authority_invalid");
  }
  return {
    authorizationId: String(policy.id),
    status: "active",
    approvedCurrency: currency,
    currentDailyBudgetMinor,
    customerDailyBudgetCeilingMinor,
    executionEnabled: controls.execution_enabled === true,
    killSwitchActive:
      controls.global_kill_switch === true || controls.account_kill_switch === true ||
      controls.campaign_kill_switch === true || controls.emergency_stop === true,
    runtimeExecutionEnabled: false,
    customerAuthorizedAt: String(policy.customer_authorized_at),
    organizationId: params.organizationId,
    userId: params.userId,
    campaignId: params.campaignId,
    providerAdAccountId: String(policy.provider_ad_account_id),
    providerCampaignId: String(policy.provider_campaign_id),
    providerAdSetId: String(policy.provider_ad_set_id),
    lastProviderMutationAt: controls.last_provider_mutation_at ? String(controls.last_provider_mutation_at) : null,
    scaleAppliedLast24HoursPercent: Number(controls.scale_applied_last_24h_percent ?? 0),
    scaleWindowStartedAt: controls.scale_window_started_at ? String(controls.scale_window_started_at) : null,
    approvedPolicy: {
      version: "dealflow-realtor-optimization-v2",
      approvalId: String(policy.id),
      approvedAt: String(policy.customer_authorized_at),
      authority: "owner_approved",
      maximumObservationAgeMinutes: Number(policy.maximum_observation_age_minutes),
      minimumImpressions: Number(policy.minimum_impressions),
      minimumClicks: Number(policy.minimum_clicks),
      minimumSpend: Number(policy.minimum_spend_minor) / 100,
      minimumLeadsForCplDecision: Number(policy.minimum_leads_for_cpl),
      attributionWindowDays: 7,
      cooldownMinutes: Number(policy.cooldown_minutes),
      maximumBudgetIncreasePercent: Number(policy.maximum_budget_increase_percent),
      maximumBudgetDecreasePercent: Number(policy.maximum_budget_decrease_percent),
      maximumDailyScalePercent: Number(policy.maximum_daily_scale_percent),
      customerDailyBudgetCeiling: customerDailyBudgetCeilingMinor / 100,
    },
  };
}
