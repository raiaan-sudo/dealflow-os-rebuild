import { ApiError } from "@/lib/api/route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/services/app-context";
import type { Json } from "@/lib/supabase/types";
import type { MetaLaunchInputBinding } from "@/lib/meta-launch-input-snapshot";

export type CampaignLaunchEvent = {
  id: string;
  label: string;
  status: "success" | "failed";
  target: string;
  detail: string;
  timestamp: string;
};

export type CampaignLaunchRecord = {
  id: string;
  campaignId: string | null;
  idempotencyKey: string;
  campaignName: string;
  accountName: string | null;
  launchMode: string;
  resultStatus: string;
  scheduledFor: string | null;
  metaCampaignId: string | null;
  metaAdSetIds: string[];
  metaCreativeId: string | null;
  metaAdIds: string[];
  executionMetadata: Record<string, unknown>;
  eventTimeline: CampaignLaunchEvent[];
  createdAt: string;
};

export type ManualCampaignLaunchClaim = CampaignLaunchRecord & {
  organizationId: string;
  userId: string;
  campaignId: string;
  attemptCount: number;
  workerId: string;
  leaseToken: string;
  leaseGeneration: number;
};

export type CampaignLaunchProviderReceiptStage =
  | "campaign"
  | "adset"
  | "creative"
  | "ad";

export type CampaignLaunchProviderMutationSettlement = {
  stage: CampaignLaunchProviderReceiptStage;
  objectKey: string;
  outcome: "receipted" | "explicit_provider_rejection";
  objectId: string | null;
  responseStatus: number;
  providerErrorCode?: string | null;
};

export class CampaignLaunchLeaseLostError extends Error {
  readonly code = "campaign_launch_lease_lost";

  constructor(message = "The campaign launch lease is no longer owned by this request.") {
    super(message);
    this.name = "CampaignLaunchLeaseLostError";
  }
}

export class CampaignLaunchOperatorActionRequiredError extends ApiError {
  readonly operatorActionId: string;

  constructor(params: { operatorActionId: string; code: string }) {
    super(
      409,
      "This campaign launch requires operator reconciliation before another provider attempt.",
      params.code,
    );
    this.name = "CampaignLaunchOperatorActionRequiredError";
    this.operatorActionId = params.operatorActionId;
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

function mapManualLaunchClaim(
  row: Record<string, unknown>,
  workerId: string,
): ManualCampaignLaunchClaim {
  const record = mapLaunchRecord(row);
  const attemptCount = asPositiveInteger(row.schedule_attempt_count);
  const leaseGeneration = asPositiveInteger(row.schedule_lease_generation);

  if (
    !record ||
    typeof row.organization_id !== "string" ||
    typeof row.user_id !== "string" ||
    typeof row.campaign_id !== "string" ||
    typeof row.schedule_locked_by !== "string" ||
    row.schedule_locked_by !== workerId ||
    typeof row.schedule_lease_token !== "string" ||
    !attemptCount ||
    !leaseGeneration
  ) {
    throw new CampaignLaunchLeaseLostError(
      "The database returned an incomplete manual campaign launch claim.",
    );
  }

  return {
    ...record,
    organizationId: row.organization_id,
    userId: row.user_id,
    campaignId: row.campaign_id,
    attemptCount,
    workerId,
    leaseToken: row.schedule_lease_token,
    leaseGeneration,
  };
}

function mapLaunchRecord(row: Record<string, unknown> | null): CampaignLaunchRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    campaignId: typeof row.campaign_id === "string" ? row.campaign_id : null,
    idempotencyKey: String(row.idempotency_key ?? ""),
    campaignName: String(row.campaign_name ?? ""),
    accountName: typeof row.account_name === "string" ? row.account_name : null,
    launchMode: String(row.launch_mode ?? ""),
    resultStatus: String(row.result_status ?? ""),
    scheduledFor: typeof row.scheduled_for === "string" ? row.scheduled_for : null,
    metaCampaignId:
      typeof row.meta_campaign_id === "string" ? row.meta_campaign_id : null,
    metaAdSetIds: Array.isArray(row.meta_ad_set_ids)
      ? row.meta_ad_set_ids.map(String)
      : [],
    metaCreativeId:
      typeof row.meta_creative_id === "string" ? row.meta_creative_id : null,
    metaAdIds: Array.isArray(row.meta_ad_ids) ? row.meta_ad_ids.map(String) : [],
    executionMetadata:
      row.execution_metadata && typeof row.execution_metadata === "object"
        ? (row.execution_metadata as Record<string, unknown>)
        : {},
    eventTimeline: Array.isArray(row.event_timeline)
      ? row.event_timeline.map((item, index) => {
          const event = item as Record<string, unknown>;
          return {
            id: String(event.id ?? `event-${index}`),
            label: String(event.label ?? "Event"),
            status: event.status === "failed" ? "failed" : "success",
            target: String(event.target ?? ""),
            detail: String(event.detail ?? ""),
            timestamp: String(event.timestamp ?? row.created_at ?? new Date().toISOString()),
          };
        })
      : [],
    createdAt: String(row.created_at),
  };
}

async function getCampaignLaunchContext() {
  const [context, supabase] = await Promise.all([getAppContext(), createClient()]);

  if (!context || !supabase) {
    throw new ApiError(401, "Authentication is required for this route.", "unauthorized");
  }

  return {
    context,
    supabase,
  };
}

async function getAuthoritativeCampaignOwner(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  organizationId: string;
  campaignId: string;
}) {
  const { data, error } = await (params.supabase as any)
    .from("campaign_plans")
    .select("id,user_id,organization_id")
    .eq("id", params.campaignId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "campaign_launch_owner_lookup_failed");
  }

  if (!data?.id || typeof data.user_id !== "string") {
    throw new ApiError(404, "Campaign not found.", "campaign_not_found");
  }

  return data.user_id;
}

export async function getLatestCampaignLaunchRecord() {
  const { context, supabase } = await getCampaignLaunchContext();
  const { data, error } = await supabase
    .from("campaign_launch_records")
    .select("*")
    .eq("organization_id", context.organization.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "campaign_launch_record_lookup_failed");
  }

  return mapLaunchRecord((data as Record<string, unknown> | null) ?? null);
}

export async function getCampaignLaunchRecordForCampaign(params: {
  campaignId?: string | null;
  campaignName: string;
  metaCampaignId?: string | null;
}) {
  const { context, supabase } = await getCampaignLaunchContext();

  const buildQuery = () =>
    supabase
      .from("campaign_launch_records")
      .select("*")
      .eq("organization_id", context.organization.id)
      .order("created_at", { ascending: false })
      .limit(1);

  if (params.campaignId) {
    const { data, error } = await buildQuery().eq("campaign_id", params.campaignId).maybeSingle();
    if (error) {
      throw new ApiError(500, error.message, "campaign_launch_record_lookup_failed");
    }
    return mapLaunchRecord((data as Record<string, unknown> | null) ?? null);
  }

  if (params.metaCampaignId) {
    const { data, error } = await buildQuery().eq("meta_campaign_id", params.metaCampaignId).maybeSingle();
    if (error) {
      throw new ApiError(500, error.message, "campaign_launch_record_lookup_failed");
    }
    return mapLaunchRecord((data as Record<string, unknown> | null) ?? null);
  }

  const { data, error } = await buildQuery().eq("campaign_name", params.campaignName).maybeSingle();
  if (error) {
    throw new ApiError(500, error.message, "campaign_launch_record_lookup_failed");
  }
  return mapLaunchRecord((data as Record<string, unknown> | null) ?? null);
}

export async function getCampaignLaunchRecordForInternalActor(params: {
  campaignId: string;
  organizationId: string;
  userId: string;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }
  const { data, error } = await (admin as any)
    .from("campaign_launch_records")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .eq("campaign_id", params.campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new ApiError(500, error.message, "campaign_launch_record_lookup_failed");
  }
  return mapLaunchRecord((data as Record<string, unknown> | null) ?? null);
}

export async function recordCampaignLaunch(params: {
  campaignId?: string | null;
  idempotencyKey?: string | null;
  campaignName: string;
  accountName: string | null;
  launchMode: string;
  resultStatus: string;
  scheduledFor?: string | null;
  metaCampaignId: string | null;
  metaAdSetIds: string[];
  metaCreativeId?: string | null;
  metaAdIds: string[];
  executionMetadata: Record<string, unknown>;
  eventTimeline: CampaignLaunchEvent[];
}) {
  // Campaign-scoped launch rows are durable work intents. They may only be
  // changed through the token+generation-fenced claim RPCs below. This helper
  // remains solely for the legacy, unscoped execution history path.
  if (params.campaignId) {
    throw new ApiError(
      500,
      "Campaign-scoped launch records require a fenced claim.",
      "campaign_launch_claim_required",
    );
  }

  const { context, supabase } = await getCampaignLaunchContext();
  const idempotencyKey =
    params.idempotencyKey?.trim() ||
    (params.metaCampaignId
      ? `meta_launch:${params.campaignId ?? "legacy"}:${params.metaCampaignId}`
      : `meta_launch_attempt:${params.campaignId ?? "legacy"}:${crypto.randomUUID()}`);
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { error } = await (admin as any).rpc("record_legacy_campaign_launch", {
    p_organization_id: context.organization.id,
    p_user_id: context.user.id,
    p_idempotency_key: idempotencyKey,
    p_campaign_name: params.campaignName,
    p_account_name: params.accountName,
    p_launch_mode: params.launchMode,
    p_result_status: params.resultStatus,
    p_scheduled_for: params.scheduledFor ?? null,
    p_meta_campaign_id: params.metaCampaignId,
    p_meta_ad_set_ids: params.metaAdSetIds as unknown as Json,
    p_meta_creative_id: params.metaCreativeId ?? null,
    p_meta_ad_ids: params.metaAdIds as unknown as Json,
    p_execution_metadata: params.executionMetadata as unknown as Json,
    p_event_timeline: params.eventTimeline as unknown as Json,
  });

  if (error) {
    throw new ApiError(500, error.message, "campaign_launch_record_insert_failed");
  }
}

export async function scheduleCampaignLaunch(params: {
  campaignId: string;
  campaignName: string;
  scheduledFor: string;
  timeZone: string;
}) {
  const { context, supabase } = await getCampaignLaunchContext();
  const scheduledAt = new Date(params.scheduledFor);

  if (!Number.isFinite(scheduledAt.getTime())) {
    throw new ApiError(400, "A valid launch schedule is required.", "campaign_launch_schedule_invalid");
  }

  const authoritativeUserId = await getAuthoritativeCampaignOwner({
    supabase,
    organizationId: context.organization.id,
    campaignId: params.campaignId,
  });
  const { data, error } = await (supabase as any).rpc("schedule_campaign_launch_intent", {
    p_organization_id: context.organization.id,
    p_campaign_id: params.campaignId,
    p_expected_campaign_owner_id: authoritativeUserId,
    p_campaign_name: params.campaignName,
    p_scheduled_for: scheduledAt.toISOString(),
    p_time_zone: params.timeZone,
  });
  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row) {
    throw new ApiError(
      500,
      error?.message ?? "Campaign launch schedule could not be saved.",
      "campaign_launch_schedule_insert_failed",
    );
  }

  const record = mapLaunchRecord(row as Record<string, unknown>);

  if (!record?.scheduledFor) {
    throw new ApiError(
      409,
      "The persisted launch intent does not contain a valid schedule.",
      "campaign_launch_schedule_invalid",
    );
  }

  if (record.resultStatus === "success") {
    throw new ApiError(
      409,
      "This campaign already has a durable successful provider launch receipt.",
      "campaign_already_launched",
    );
  }

  if (record.resultStatus === "operator_action_required") {
    throw new ApiError(
      409,
      "This campaign requires operator reconciliation before it can be scheduled again.",
      "campaign_launch_operator_action_required",
    );
  }

  return record;
}

export async function assertCampaignLaunchScheduleDue(params: {
  campaignId: string;
  now?: Date;
}) {
  const { context, supabase } = await getCampaignLaunchContext();
  const now = params.now ?? new Date();
  const { data, error } = await (supabase as any)
    .from("campaign_launch_records")
    .select("*")
    .eq("organization_id", context.organization.id)
    .eq("campaign_id", params.campaignId)
    .in("result_status", [
      "scheduled",
      "failed",
      "uncertain",
      "partial_success",
      "processing",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, error.message, "campaign_launch_schedule_lookup_failed");
  }

  const record = mapLaunchRecord((data as Record<string, unknown> | null) ?? null);

  if (!record) {
    const { data: terminalData, error: terminalError } = await (supabase as any)
      .from("campaign_launch_records")
      .select("id,result_status")
      .eq("organization_id", context.organization.id)
      .eq("campaign_id", params.campaignId)
      .eq("result_status", "operator_action_required")
      .maybeSingle();

    if (terminalError) {
      throw new ApiError(500, terminalError.message, "campaign_launch_schedule_lookup_failed");
    }
    if (terminalData?.id) {
      throw new ApiError(
        409,
        "This campaign launch requires operator reconciliation before another provider attempt.",
        "campaign_launch_operator_action_required",
      );
    }
  }

  if (!record?.scheduledFor) {
    throw new ApiError(
      409,
      "Schedule this campaign for the next 9:00 a.m. Eastern launch window before starting provider creation.",
      "campaign_launch_not_scheduled",
    );
  }

  if (new Date(record.scheduledFor).getTime() > now.getTime()) {
    throw new ApiError(
      409,
      `This campaign is scheduled for ${record.scheduledFor} and is not due yet.`,
      "campaign_launch_not_due",
    );
  }

  return record;
}

export async function claimManualCampaignLaunch(params: {
  launchId: string;
  campaignId: string;
  leaseMs: number;
}) {
  const { context, supabase } = await getCampaignLaunchContext();
  const authoritativeUserId = await getAuthoritativeCampaignOwner({
    supabase,
    organizationId: context.organization.id,
    campaignId: params.campaignId,
  });
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const workerId = `manual-launch:${crypto.randomUUID()}`;
  const { data, error } = await (admin as any).rpc("claim_manual_campaign_launch_record", {
    p_launch_id: params.launchId,
    p_organization_id: context.organization.id,
    p_campaign_id: params.campaignId,
    p_expected_campaign_owner_id: authoritativeUserId,
    p_worker_id: workerId,
    p_lease_ms: params.leaseMs,
  });
  const row = Array.isArray(data) ? data[0] : data;

  if (error) {
    throw new ApiError(
      500,
      error.message ?? "Campaign launch could not be claimed.",
      "campaign_launch_claim_failed",
    );
  }
  if (!row) {
    const { data: terminalData, error: terminalError } = await admin
      .from("campaign_launch_records")
      .select("id,result_status,schedule_last_error_code")
      .eq("id", params.launchId)
      .eq("organization_id", context.organization.id)
      .eq("campaign_id", params.campaignId)
      .maybeSingle();

    if (terminalError) {
      throw new ApiError(
        500,
        terminalError.message,
        "campaign_launch_claim_terminal_lookup_failed",
      );
    }

    const terminal = terminalData as {
      id?: unknown;
      result_status?: unknown;
      schedule_last_error_code?: unknown;
    } | null;
    if (
      terminal?.result_status === "operator_action_required" &&
      typeof terminal.id === "string"
    ) {
      const persistedCode = terminal.schedule_last_error_code;
      throw new CampaignLaunchOperatorActionRequiredError({
        operatorActionId: terminal.id,
        code:
          typeof persistedCode === "string" && /^[a-z0-9_]{3,80}$/.test(persistedCode)
            ? persistedCode
            : "campaign_launch_operator_action_required",
      });
    }

    throw new ApiError(
      409,
      "This launch intent is already owned, no longer due, or requires operator review.",
      "campaign_launch_claim_unavailable",
    );
  }

  return mapManualLaunchClaim(row as Record<string, unknown>, workerId);
}

export async function renewManualCampaignLaunchClaim(params: {
  claim: ManualCampaignLaunchClaim;
  leaseMs: number;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new CampaignLaunchLeaseLostError("The service-role client is unavailable for lease renewal.");
  }

  const { data, error } = await (admin as any).rpc("renew_campaign_launch_schedule_lease", {
    p_launch_id: params.claim.id,
    p_worker_id: params.claim.workerId,
    p_lease_token: params.claim.leaseToken,
    p_lease_generation: params.claim.leaseGeneration,
    p_lease_ms: params.leaseMs,
  });

  if (error || data !== true) {
    throw new CampaignLaunchLeaseLostError();
  }
}

export async function bindManualCampaignLaunchInputSnapshot(params: {
  claim: ManualCampaignLaunchClaim;
  binding: MetaLaunchInputBinding;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new CampaignLaunchLeaseLostError(
      "The service-role client is unavailable for launch-input binding.",
    );
  }

  const { data, error } = await (admin as any).rpc(
    "bind_campaign_launch_input_snapshot",
    {
      p_launch_id: params.claim.id,
      p_worker_id: params.claim.workerId,
      p_lease_token: params.claim.leaseToken,
      p_lease_generation: params.claim.leaseGeneration,
      p_launch_input_snapshot: params.binding.snapshot as unknown as Json,
      p_launch_input_digest: params.binding.digest,
    },
  );

  if (error || data !== true) {
    const { data: terminal } = await admin
      .from("campaign_launch_records")
      .select("result_status,schedule_last_error_code")
      .eq("id", params.claim.id)
      .eq("organization_id", params.claim.organizationId)
      .eq("campaign_id", params.claim.campaignId)
      .maybeSingle();
    const persistedCode = (terminal as {
      result_status?: unknown;
      schedule_last_error_code?: unknown;
    } | null)?.schedule_last_error_code;
    if (
      (terminal as { result_status?: unknown } | null)?.result_status ===
        "operator_action_required" &&
      typeof persistedCode === "string" &&
      /^[a-z0-9_]{3,80}$/.test(persistedCode)
    ) {
      throw new ApiError(
        409,
        "The immutable launch inputs changed. No further provider request is authorized.",
        persistedCode,
      );
    }
    throw new ApiError(
      409,
      "The immutable launch inputs changed or the fenced launch owner was superseded.",
      "campaign_launch_input_snapshot_rejected",
    );
  }
}

export function resolveCampaignLaunchProviderReceiptResume(
  rows: unknown,
  currentLeaseGeneration: number,
) {
  const generation = asPositiveInteger(currentLeaseGeneration);
  if (!generation) {
    throw new ApiError(
      422,
      "Campaign launch receipt generation is invalid.",
      "campaign_launch_provider_receipt_generation_invalid",
    );
  }

  const idsByStage = new Map<CampaignLaunchProviderReceiptStage, Set<string>>();
  for (const candidate of Array.isArray(rows) ? rows : []) {
    const row = candidate && typeof candidate === "object"
      ? (candidate as Record<string, unknown>)
      : null;
    const receiptGeneration = row ? asPositiveInteger(row.lease_generation) : null;
    const stage = row?.stage;
    const objectId = typeof row?.object_id === "string" ? row.object_id.trim() : "";

    if (
      !row ||
      !receiptGeneration ||
      typeof stage !== "string" ||
      !["campaign", "adset", "creative", "ad"].includes(stage) ||
      !objectId
    ) {
      throw new ApiError(
        422,
        "Campaign launch provider receipt is invalid.",
        "campaign_launch_provider_receipt_invalid",
      );
    }
    if (receiptGeneration > generation) {
      throw new ApiError(
        422,
        "Campaign launch provider receipt belongs to a future lease generation.",
        "campaign_launch_provider_receipt_future_generation",
      );
    }

    const ids = idsByStage.get(stage as CampaignLaunchProviderReceiptStage) ?? new Set<string>();
    ids.add(objectId);
    idsByStage.set(stage as CampaignLaunchProviderReceiptStage, ids);
  }

  for (const ids of idsByStage.values()) {
    if (ids.size > 1) {
      throw new ApiError(
        409,
        "Provider receipt recovery is ambiguous and requires operator review.",
        "campaign_launch_provider_receipt_ambiguous",
      );
    }
  }

  const one = (stage: CampaignLaunchProviderReceiptStage) =>
    Array.from(idsByStage.get(stage) ?? [])[0] ?? null;

  return {
    metaCampaignId: one("campaign"),
    metaAdSetId: one("adset"),
    metaCreativeId: one("creative"),
    metaAdId: one("ad"),
  };
}

export async function loadManualCampaignLaunchProviderResume(
  claim: ManualCampaignLaunchClaim,
) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  const { data, error } = await (admin as any)
    .from("campaign_launch_provider_receipts")
    .select("stage,object_id,lease_generation")
    .eq("launch_id", claim.id)
    .order("lease_generation", { ascending: false });

  if (error) {
    throw new ApiError(
      503,
      error.message ?? "Campaign launch provider receipts could not be loaded.",
      "campaign_launch_provider_receipt_lookup_failed",
    );
  }

  return resolveCampaignLaunchProviderReceiptResume(data, claim.leaseGeneration);
}

export async function recordManualCampaignLaunchProviderReceipt(params: {
  claim: ManualCampaignLaunchClaim;
  stage: CampaignLaunchProviderReceiptStage;
  objectId: string;
  responseStatus: number;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(503, "Supabase service role is not configured.", "service_role_missing");
  }

  // This deliberately runs before the post-response lease gate. The database
  // binds the immutable receipt to its generation, including a late response
  // from a superseded request, so recovery can fail closed on ambiguity.
  const { data, error } = await (admin as any).rpc("record_campaign_launch_provider_receipt", {
    p_launch_id: params.claim.id,
    p_lease_generation: params.claim.leaseGeneration,
    p_stage: params.stage,
    p_object_id: params.objectId,
    p_response_status: params.responseStatus,
  });

  if (error || typeof data !== "string") {
    throw new ApiError(
      503,
      error?.message ?? "Campaign launch provider receipt could not be saved.",
      "campaign_launch_provider_receipt_persist_failed",
    );
  }
}

export async function armManualCampaignLaunchProviderMutation(params: {
  claim: ManualCampaignLaunchClaim;
  stage: CampaignLaunchProviderReceiptStage;
  objectKey: string;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new CampaignLaunchLeaseLostError(
      "The service-role client is unavailable for provider-mutation arming.",
    );
  }

  const { data, error } = await (admin as any).rpc(
    "arm_campaign_launch_provider_mutation",
    {
      p_launch_id: params.claim.id,
      p_worker_id: params.claim.workerId,
      p_lease_token: params.claim.leaseToken,
      p_lease_generation: params.claim.leaseGeneration,
      p_stage: params.stage,
      p_object_key: params.objectKey,
    },
  );

  if (error || data !== true) {
    throw new CampaignLaunchLeaseLostError(
      error?.message ?? "The provider-mutation arm was rejected by its fencing check.",
    );
  }
}

export async function settleManualCampaignLaunchProviderMutation(params: {
  claim: ManualCampaignLaunchClaim;
  settlement: CampaignLaunchProviderMutationSettlement;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new ApiError(
      503,
      "The service-role client is unavailable for provider-mutation settlement.",
      "campaign_launch_provider_mutation_settlement_failed",
    );
  }

  const { data, error } = await (admin as any).rpc(
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
    throw new ApiError(
      503,
      error?.message ?? "The provider-mutation settlement was rejected.",
      "campaign_launch_provider_mutation_settlement_failed",
    );
  }
}

export async function persistManualCampaignLaunchRuntime(params: {
  claim: ManualCampaignLaunchClaim;
  state: Record<string, unknown>;
  message: string;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new CampaignLaunchLeaseLostError(
      "The service-role client is unavailable for launch-runtime persistence.",
    );
  }

  const { data, error } = await (admin as any).rpc(
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
    throw new CampaignLaunchLeaseLostError(
      error?.message ?? "The launch-runtime write was rejected by its fencing check.",
    );
  }
}

export async function completeManualCampaignLaunchClaim(params: {
  claim: ManualCampaignLaunchClaim;
  metaCampaignId: string;
  metaAdSetId: string;
  metaCreativeId: string;
  metaAdId: string;
  executionMetadata: Record<string, unknown>;
  event: CampaignLaunchEvent;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new CampaignLaunchLeaseLostError("The service-role client is unavailable for completion.");
  }

  const { data, error } = await (admin as any).rpc("complete_manual_campaign_launch_claim", {
    p_launch_id: params.claim.id,
    p_worker_id: params.claim.workerId,
    p_lease_token: params.claim.leaseToken,
    p_lease_generation: params.claim.leaseGeneration,
    p_meta_campaign_id: params.metaCampaignId,
    p_meta_ad_set_id: params.metaAdSetId,
    p_meta_creative_id: params.metaCreativeId,
    p_meta_ad_id: params.metaAdId,
    p_execution_metadata: params.executionMetadata,
    p_event: params.event,
  });

  if (error || data !== true) {
    throw new CampaignLaunchLeaseLostError(
      error?.message ?? "The manual launch completion was rejected by its fencing check.",
    );
  }
}

export async function failManualCampaignLaunchClaim(params: {
  claim: ManualCampaignLaunchClaim;
  errorCode: string;
  metaCampaignId: string | null;
  metaAdSetIds: string[];
  metaAdIds: string[];
  executionMetadata: Record<string, unknown>;
  event: CampaignLaunchEvent;
}) {
  const admin = createAdminClient();
  if (!admin) {
    return false;
  }

  const { data, error } = await (admin as any).rpc("fail_manual_campaign_launch_claim", {
    p_launch_id: params.claim.id,
    p_worker_id: params.claim.workerId,
    p_lease_token: params.claim.leaseToken,
    p_lease_generation: params.claim.leaseGeneration,
    p_error_code: params.errorCode,
    p_meta_campaign_id: params.metaCampaignId,
    p_meta_ad_set_ids: params.metaAdSetIds,
    p_meta_ad_ids: params.metaAdIds,
    p_execution_metadata: params.executionMetadata,
    p_event: params.event,
  });

  return !error && data === true;
}
