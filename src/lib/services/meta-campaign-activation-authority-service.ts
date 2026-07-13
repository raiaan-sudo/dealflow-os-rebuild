import "server-only";

import { ApiError } from "@/lib/api/route";
import { getAppContext } from "@/lib/services/app-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

type RpcRecord = Record<string, unknown>;

function firstRecord(value: unknown): RpcRecord | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" ? candidate as RpcRecord : null;
}

function requiredString(record: RpcRecord | null, key: string) {
  const value = record?.[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(500, "Activation authority returned an invalid result.", "meta_activation_authority_result_invalid");
  }
  return value.trim();
}

export async function preauthorizeMetaCampaignActivation(params: {
  campaignId: string;
  campaignName: string;
  scheduledFor: string;
  timeZone: string;
  approvedDailyBudgetMinor: number;
  approvedCurrency: string;
  providerAdAccountId: string;
  providerPageId: string;
  providerPixelId: string;
  selectedAdId: string;
  adDestination: "website" | "meta_instant_form";
  destinationUrlDigest: string;
  launchApprovalSnapshot: Record<string, unknown>;
  customerApprovalDigest: string;
  idempotencyKey: string;
}) {
  const context = await getAppContext();
  if (!context) throw new ApiError(401, "Authentication is required.", "unauthorized");
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  const { data, error } = await (admin as any).rpc("schedule_and_preauthorize_meta_campaign_activation", {
    p_organization_id: context.organization.id,
    p_customer_user_id: context.user.id,
    p_campaign_id: params.campaignId,
    p_campaign_name: params.campaignName,
    p_scheduled_for: params.scheduledFor,
    p_time_zone: params.timeZone,
    p_approved_daily_budget_minor: params.approvedDailyBudgetMinor,
    p_approved_currency: params.approvedCurrency,
    p_provider_ad_account_id: params.providerAdAccountId,
    p_provider_page_id: params.providerPageId,
    p_provider_pixel_id: params.providerPixelId,
    p_selected_ad_id: params.selectedAdId,
    p_ad_destination: params.adDestination,
    p_destination_url_digest: params.destinationUrlDigest,
    p_launch_approval_snapshot: params.launchApprovalSnapshot,
    p_customer_approval_digest: params.customerApprovalDigest,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) {
    throw new ApiError(409, error.message ?? "Activation preauthorization was rejected.", "meta_activation_preauthorization_rejected");
  }
  const record = firstRecord(data);
  return {
    authorizationId: requiredString(record, "id"),
    status: requiredString(record, "status"),
    launchRecordId: requiredString(record, "launch_record_id"),
    scheduledFor: requiredString(record, "scheduled_for"),
    approvedDailyBudgetMinor: Number(record?.approved_daily_budget_minor),
    approvedCurrency: requiredString(record, "approved_currency"),
  };
}

export async function getMetaCampaignActivationAuthorizationStatus(campaignId: string) {
  const [context, client] = await Promise.all([getAppContext(), createRouteHandlerClient()]);
  if (!context) throw new ApiError(401, "Authentication is required.", "unauthorized");
  if (!client) throw new ApiError(503, "Supabase is not configured.", "config_missing");
  const { data, error } = await (client as any).rpc("get_meta_campaign_activation_authorization_status", {
    p_organization_id: context.organization.id,
    p_campaign_id: campaignId,
  });
  if (error) {
    throw new ApiError(500, error.message ?? "Activation authorization status was unavailable.", "meta_activation_status_unavailable");
  }
  const record = firstRecord(data);
  if (!record) return null;
  return {
    authorizationId: requiredString(record, "authorization_id"),
    status: requiredString(record, "authorization_status"),
    launchRecordId: requiredString(record, "launch_record_id"),
    activationIntentId: typeof record.activation_intent_id === "string" ? record.activation_intent_id : null,
    scheduledFor: requiredString(record, "scheduled_for"),
    approvedDailyBudgetMinor: Number(record.approved_daily_budget_minor),
    approvedCurrency: requiredString(record, "approved_currency"),
    customerAuthorizedAt: requiredString(record, "customer_authorized_at"),
    lastErrorCode: typeof record.last_error_code === "string" ? record.last_error_code : null,
  };
}

export async function cancelMetaCampaignActivationPreauthorization(campaignId: string, authorizationId: string) {
  const [context, client] = await Promise.all([getAppContext(), createRouteHandlerClient()]);
  if (!context) throw new ApiError(401, "Authentication is required.", "unauthorized");
  if (!client) throw new ApiError(503, "Supabase is not configured.", "config_missing");
  const { data, error } = await (client as any).rpc("cancel_meta_campaign_activation_preauthorization", {
    p_authorization_id: authorizationId,
    p_organization_id: context.organization.id,
    p_campaign_id: campaignId,
  });
  if (error) {
    throw new ApiError(409, error.message ?? "Activation cancellation was rejected.", "meta_activation_cancellation_rejected");
  }
  return data === true;
}

export type MetaActivationFinalizationResult = {
  status: "not_authorized" | "finalized" | "operator_required";
  authorizationId: string | null;
  activationIntentId: string | null;
  errorCode: string | null;
};

export async function finalizeMetaActivationPreauthorizationAfterPausedLaunch(params: {
  organizationId: string;
  userId: string;
  campaignId: string;
  launchRecordId: string;
}): Promise<MetaActivationFinalizationResult> {
  const admin = createAdminClient();
  if (!admin) throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  const { data, error } = await (admin as any).rpc("finalize_meta_campaign_activation_preauthorization", {
    p_organization_id: params.organizationId,
    p_user_id: params.userId,
    p_campaign_id: params.campaignId,
    p_launch_record_id: params.launchRecordId,
  });
  if (error) {
    throw new ApiError(500, error.message ?? "Activation finalization failed safely.", "meta_activation_finalization_failed");
  }
  const record = firstRecord(data);
  const status = requiredString(record, "finalization_status");
  if (status !== "not_authorized" && status !== "finalized" && status !== "operator_required") {
    throw new ApiError(500, "Activation finalization returned an invalid state.", "meta_activation_finalization_invalid");
  }
  return {
    status,
    authorizationId: typeof record?.authorization_id === "string" ? record.authorization_id : null,
    activationIntentId: typeof record?.activation_intent_id === "string" ? record.activation_intent_id : null,
    errorCode: typeof record?.error_code === "string" ? record.error_code : null,
  };
}

export async function recoverMetaActivationPreauthorizations(limit = 20) {
  const admin = createAdminClient();
  if (!admin) return { examinedCount: 0, finalizedCount: 0, operatorRequiredCount: 0 };
  const { data, error } = await (admin as any).rpc("finalize_due_meta_campaign_activation_preauthorizations", {
    p_limit: limit,
  });
  if (error) {
    throw new ApiError(500, error.message ?? "Activation finalization recovery failed safely.", "meta_activation_recovery_failed");
  }
  const record = firstRecord(data);
  return {
    examinedCount: Number(record?.examined_count ?? 0),
    finalizedCount: Number(record?.finalized_count ?? 0),
    operatorRequiredCount: Number(record?.operator_required_count ?? 0),
  };
}
