import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, assertSameOriginRequest, parseJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { getPublicAppUrl } from "@/lib/env";
import {
  buildCampaignPlanCriticalFieldPatch,
  getCampaignPayloadFromPlan,
  getLaunchRuntimeFromPlan,
  readCampaignPlanDocument,
  withLaunchRuntime,
} from "@/lib/services/campaign-plan-document";
import { logMetaError, mapMetaError } from "@/lib/integrations/meta/error-mapper";
import {
  applyMetaDailyBudgetCapCents,
  getMetaDailyBudgetCapCents,
} from "@/lib/integrations/meta/budget-cap";
import { fetchMetaJson } from "@/lib/integrations/meta/request";
import {
  getMetaWorkspaceCredentials,
  validateMetaLaunchSelections,
  type MetaWorkspaceCredentials,
} from "@/lib/integrations/meta/service";
import { assertMetaLaunchBillingAccessForOrganization } from "@/lib/services/billing-service";
import { getCampaignById } from "@/lib/services/campaign-persistence";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { slugify } from "@/lib/utils";

const requestSchema = z.object({
  campaignId: z.string().min(1),
  metaCampaignId: z.string().min(1).optional(),
  metaAdSetId: z.string().min(1).optional(),
  metaCreativeId: z.string().min(1).optional(),
  testModeInterruptAfter: z.enum(["campaign", "ad_set", "creative"]).optional(),
});

type LaunchResumePayload = {
  metaCampaignId?: string | null;
  metaAdSetId?: string | null;
  metaCreativeId?: string | null;
};

type LaunchStage = "campaign" | "adset" | "creative" | "ad";
type LaunchStepStatus = "pending" | "creating" | "created" | "validating" | "retrying" | "failed";
type ForcedInterruptStage = "campaign" | "adset" | "creative" | null;

type PersistedLaunchState = {
  campaign_id: string | null;
  adset_id: string | null;
  creative_id: string | null;
  ad_id: string | null;
  current_stage: LaunchStage;
  status: "pending" | "in_progress" | "failed" | "completed";
  step_status?: LaunchStepStatus | null;
  attempt_id?: string | null;
  requested_object_type?: "campaign" | "adset" | "creative" | "ad" | null;
  requested_object_name?: string | null;
  requested_object_key?: string | null;
  workspace_id?: string | null;
  error?: string | null;
  updated_at: string;
};

type CampaignPayloadRecord = {
  selected_ad_id?: string;
  selected_ad_ids?: string[];
  destination_url?: string;
  business_profile?: {
    business_name?: string;
    service?: string;
    location?: string;
  };
  offer?: {
    summary?: string;
    key_offer?: string;
  };
  funnel?: {
    cta?: string;
  };
  creatives?: {
    primary_text_variations?: string[];
    headlines?: string[];
    creative_concepts?: string[];
  };
  targeting_plan?: {
    summary?: string;
    audience?: string;
    market?: string;
    intent?: string;
  };
  budget_plan?: {
    monthly_budget?: number;
    estimated_daily_budget?: number;
  };
  meta_ready_payload?: {
    objective?: string;
    campaign_name?: string;
  };
};

type CampaignPlanStorageRow = {
  plan?: unknown;
  public_slug?: string | null;
  publish_state?: string | null;
  published_snapshot?: unknown;
  staged_snapshot?: unknown;
};

function assertMetaLiveLaunchEnabled() {
  if (process.env.ALLOW_META_LIVE_LAUNCH !== "true") {
    throw new ApiError(
      503,
      "Live Meta launch is disabled. Set ALLOW_META_LIVE_LAUNCH=true only after running the PAUSED retry proof.",
      "meta_live_launch_disabled",
    );
  }
}

function buildStageFailureMessage(rawMessage: string, stage: LaunchStage) {
  if (/budget is too low|budget must be more than/i.test(rawMessage)) {
    const capCents = getMetaDailyBudgetCapCents();
    return capCents === null
      ? `${rawMessage} No DealFlow budget cap is applied, so this is a Meta account minimum-budget requirement.`
      : `${rawMessage} Current safety cap is ${capCents} cents/day, so launch is blocked until you choose an ad account whose minimum fits the cap or approve a higher daily cap.`;
  }

  const diagnostic = mapMetaError({
    context: "launch",
    message: rawMessage,
  });
  const stageLabel =
    stage === "adset" ? "ad set" : stage === "creative" ? "creative" : stage;
  return `${stageLabel[0]!.toUpperCase()}${stageLabel.slice(1)} creation failed. ${diagnostic.userMessage} ${diagnostic.recommendedAction}`.trim();
}

function getMetaErrorMessage(data: Record<string, unknown> | null, fallback: string) {
  const error =
    data && typeof data.error === "object" && data.error
      ? (data.error as Record<string, unknown>)
      : null;

  if (!error) {
    return fallback;
  }

  const userTitle = typeof error.error_user_title === "string" ? error.error_user_title.trim() : "";
  const userMessage = typeof error.error_user_msg === "string" ? error.error_user_msg.trim() : "";
  const message = typeof error.message === "string" ? error.message.trim() : "";

  return [userTitle, userMessage || message].filter(Boolean).join(": ") || fallback;
}

function inferCountryCode(location: string) {
  const normalized = location.toLowerCase();

  if (
    /\btoronto\b|\bontario\b|\bvancouver\b|\bcalgary\b|\bedmonton\b|\bmontreal\b|\bcanada\b/.test(
      normalized,
    )
  ) {
    return "CA";
  }

  return "US";
}

function inferAgeRange(audience: string, targetingSummary: string) {
  const normalized = `${audience} ${targetingSummary}`.toLowerCase();

  if (normalized.includes("first-time")) {
    return { min: 24, max: 44 };
  }

  if (normalized.includes("investor")) {
    return { min: 28, max: 60 };
  }

  if (normalized.includes("downsiz")) {
    return { min: 45, max: 65 };
  }

  return { min: 25, max: 54 };
}

function buildGeoTargeting(location: string) {
  void location;
  return {};
}

async function loadSavedCampaignPayload(campaignId: string): Promise<CampaignPayloadRecord | null> {
  const supabase = createAdminClient() ?? (await createRouteHandlerClient());

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("plan,public_slug,publish_state,published_snapshot,staged_snapshot")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data as { plan?: unknown } | null) ?? null;
  return (getCampaignPayloadFromPlan(row?.plan) as CampaignPayloadRecord | null) ?? null;
}

async function loadCampaignPlanDocument(campaignId: string) {
  const supabase = createAdminClient() ?? (await createRouteHandlerClient());

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data as CampaignPlanStorageRow | null) ?? null;
  const document = readCampaignPlanDocument(row?.plan);
  const publicSlug = getRecoverablePublicSlug(row, document);

  return publicSlug && !document.public_slug
    ? readCampaignPlanDocument({ ...document, public_slug: publicSlug })
    : document;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNestedText(value: unknown, path: string[]) {
  let current: unknown = value;

  for (const key of path) {
    const record = asRecord(current);

    if (!record) {
      return "";
    }

    current = record[key];
  }

  return typeof current === "string" ? current.trim() : "";
}

function getRecoverablePublicSlug(
  row: CampaignPlanStorageRow | null,
  document: Record<string, unknown>,
) {
  const publishState = typeof row?.publish_state === "string" ? row.publish_state : "";
  const publishedSnapshot = asRecord(row?.published_snapshot);
  const stagedSnapshot = asRecord(row?.staged_snapshot);
  const snapshot = publishedSnapshot ?? stagedSnapshot;
  const publishedOrStaged = publishState === "published" || publishState === "staged";
  const candidates = [
    typeof row?.public_slug === "string" ? row.public_slug : "",
    typeof document.public_slug === "string" ? document.public_slug : "",
    getNestedText(snapshot, ["publish", "slug"]),
    getNestedText(snapshot, ["public_slug"]),
    getNestedText(snapshot, ["slug"]),
    publishedOrStaged ? getNestedText(snapshot, ["campaign", "name"]) : "",
    publishedOrStaged ? getNestedText(document, ["name"]) : "",
  ];

  for (const candidate of candidates) {
    const slug = slugify(candidate);

    if (slug) {
      return slug;
    }
  }

  return null;
}

async function loadCampaignOwnerId(campaignId: string) {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Supabase service role is not configured.");
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("owner_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as { owner_id?: string | null } | null;
  const ownerId = typeof row?.owner_id === "string" ? row.owner_id : null;

  if (!ownerId) {
    throw new ApiError(404, "Campaign plan was not found.", "campaign_plan_not_found");
  }

  return ownerId;
}

function getPersistedLaunchState(plan: Record<string, unknown>): PersistedLaunchState | null {
  return (getLaunchRuntimeFromPlan(plan) as PersistedLaunchState | null) ?? null;
}

async function persistLaunchState(
  campaignId: string,
  state: PersistedLaunchState,
  message: string,
) {
  const supabase = createAdminClient() ?? (await createRouteHandlerClient());

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const currentPlan = await loadCampaignPlanDocument(campaignId);
  const currentRuntime =
    currentPlan.runtime && typeof currentPlan.runtime === "object" && !Array.isArray(currentPlan.runtime)
      ? (currentPlan.runtime as Record<string, unknown>)
      : {};

  const nextMetaAdSetIds = state.adset_id ? [state.adset_id] : [];
  const nextMetaAdIds = state.ad_id ? [state.ad_id] : [];
  const nextRuntime = {
    ...currentRuntime,
    campaignId: state.campaign_id ?? currentRuntime.campaignId ?? null,
    adSetId: state.adset_id ?? currentRuntime.adSetId ?? null,
    adId: state.ad_id ?? currentRuntime.adId ?? null,
    metaAdSetIds: nextMetaAdSetIds.length > 0 ? nextMetaAdSetIds : currentRuntime.metaAdSetIds ?? [],
    metaAdIds: nextMetaAdIds.length > 0 ? nextMetaAdIds : currentRuntime.metaAdIds ?? [],
    metaPushStatus:
      state.status === "completed"
        ? "published"
        : state.status === "failed"
          ? "failed"
          : "publishing",
    status:
      state.status === "completed"
        ? "live"
        : state.status === "failed"
          ? "launch_ready"
          : "launching",
    metaLastMessage: message,
    lastAction: message,
    launchedAt: state.status === "completed" ? new Date().toISOString() : currentRuntime.launchedAt ?? null,
    statusUpdatedAt: state.updated_at,
  };

  const nextPlan = withLaunchRuntime(
    currentPlan,
    state as unknown as Record<string, unknown>,
    nextRuntime,
  );

  const { error } = await supabase
    .from("campaign_plans")
    .update(buildCampaignPlanCriticalFieldPatch(nextPlan) as never)
    .eq("id", campaignId);

  if (error) {
    throw error;
  }
}

function normalizeObjective(value?: string | null) {
  const normalized = (value ?? "").toUpperCase();

  if (normalized === "OUTCOME_LEADS" || normalized === "LEAD_GENERATION") {
    return "OUTCOME_LEADS";
  }

  if (normalized === "TRAFFIC" || normalized === "AWARENESS" || normalized === "ENGAGEMENT") {
    return `OUTCOME_${normalized}`;
  }

  if (
    normalized === "OUTCOME_TRAFFIC" ||
    normalized === "OUTCOME_AWARENESS" ||
    normalized === "OUTCOME_ENGAGEMENT" ||
    normalized === "OUTCOME_SALES"
  ) {
    return normalized;
  }

  return "OUTCOME_LEADS";
}

function toMinorDailyBudget(value?: number | null) {
  const normalized = Number(value ?? 0);
  const fallbackCents = getMetaDailyBudgetCapCents() ?? 200;

  if (!Number.isFinite(normalized) || normalized <= 0) {
    return String(fallbackCents);
  }

  return String(applyMetaDailyBudgetCapCents(Math.round(normalized * 100)));
}

function isPublicFunnelUrl(value: string) {
  try {
    const url = new URL(value);
    return /^\/f\/[^/]+$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function buildLaunchAttemptId(params: {
  existingAttemptId?: string | null;
  workspaceId: string;
  campaignId: string;
}) {
  const existing = params.existingAttemptId?.trim();

  if (existing) {
    return existing;
  }

  return createHash("sha256")
    .update(`${params.workspaceId}:${params.campaignId}`)
    .digest("hex")
    .slice(0, 16);
}

function buildDeterministicMetaName(params: {
  organizationId: string;
  campaignId: string;
  attemptId: string;
  stage: LaunchStage;
  baseName: string;
}) {
  const suffix = `DF-${params.organizationId.slice(0, 8)}-${params.campaignId.slice(0, 8)}-${params.attemptId.slice(0, 8)}-${params.stage}`;
  return `${params.baseName} | ${suffix}`.trim();
}

function buildLaunchObjectKey(params: {
  organizationId: string;
  campaignId: string;
  attemptId: string;
  stage: LaunchStage;
}) {
  return `${params.organizationId}:${params.campaignId}:${params.attemptId}:${params.stage}`;
}

function shouldAllowForcedInterruption() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_META_LAUNCH_TEST_MODE === "true";
}

async function fetchMetaObjectByName(params: {
  accessToken: string;
  externalAccountId: string;
  edge: "campaigns" | "adsets" | "adcreatives" | "ads";
  fields: string;
  name: string;
  requestId?: string;
}) {
  const url = new URL(
    `https://graph.facebook.com/v18.0/act_${params.externalAccountId.replace(/^act_/, "")}/${params.edge}`,
  );
  url.searchParams.set("fields", params.fields);
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", params.accessToken);

  const { response, data } = await fetchMetaJson<
    { data?: Array<Record<string, unknown>>; error?: { message?: string } } | null
  >(url.toString(), {
    purpose: "launch_lookup",
    requestId: params.requestId,
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new ApiError(
      502,
      data?.error?.message ?? `Meta ${params.edge} lookup failed.`,
      "meta_lookup_failed",
    );
  }

  const match =
    data?.data?.find(
      (item) => typeof item.name === "string" && item.name.trim() === params.name,
    ) ?? null;

  return match && typeof match.id === "string" ? match.id : null;
}

async function fetchMetaObjectById(params: {
  accessToken: string;
  objectId: string;
  fields: string;
  requestId?: string;
}) {
  const url = new URL(`https://graph.facebook.com/v18.0/${params.objectId}`);
  url.searchParams.set("fields", params.fields);
  url.searchParams.set("access_token", params.accessToken);

  const { response, data } = await fetchMetaJson<
    | (Record<string, unknown> & {
        error?: { message?: string; code?: number; error_subcode?: number };
      })
    | null
  >(url.toString(), {
    purpose: "launch_lookup",
    requestId: params.requestId,
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const message = data?.error?.message ?? "Meta object lookup failed.";
    const code = data?.error?.code ?? null;

    if (
      response.status === 404 ||
      code === 100 ||
      code === 803 ||
      /unsupported get request|does not exist|cannot find|unknown path/i.test(message)
    ) {
      return null;
    }

    throw new ApiError(502, message, "meta_lookup_failed");
  }

  return data;
}

function isPausedMetaStatus(value: unknown) {
  return typeof value === "string" && value.toUpperCase().includes("PAUSED");
}

async function updateMetaObjectPaused(params: {
  accessToken: string;
  objectId: string;
  requestId?: string;
}) {
  const body = new URLSearchParams({
    status: "PAUSED",
    access_token: params.accessToken,
  });
  const { response, data } = await fetchMetaJson<{ success?: boolean; error?: { message?: string } } | null>(
    `https://graph.facebook.com/v18.0/${params.objectId}`,
    {
      purpose: "launch_create",
      requestId: params.requestId,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );

  if (!response.ok || data?.success !== true) {
    throw new ApiError(
      502,
      data?.error?.message ?? `Meta object ${params.objectId} could not be set to PAUSED.`,
      "meta_status_update_failed",
    );
  }
}

async function ensureDirectMetaObjectPaused(params: {
  accessToken: string;
  objectId: string;
  requestId?: string;
}) {
  const current = await fetchMetaObjectById({
    accessToken: params.accessToken,
    objectId: params.objectId,
    fields: "id,status,effective_status",
    requestId: params.requestId,
  });

  if (!current) {
    throw new ApiError(502, "Meta object could not be verified after creation/recovery.", "meta_lookup_failed");
  }

  if (isPausedMetaStatus(current.status) || isPausedMetaStatus(current.effective_status)) {
    return;
  }

  await updateMetaObjectPaused(params);

  const updated = await fetchMetaObjectById({
    accessToken: params.accessToken,
    objectId: params.objectId,
    fields: "id,status,effective_status",
    requestId: params.requestId,
  });

  if (!isPausedMetaStatus(updated?.status) && !isPausedMetaStatus(updated?.effective_status)) {
    throw new ApiError(
      502,
      `Meta object ${params.objectId} could not be verified PAUSED after creation/recovery.`,
      "meta_paused_verification_failed",
    );
  }
}

async function validateExistingMetaObject(params: {
  accessToken: string;
  objectId: string;
  fields: string;
  expectedName: string;
  expectedParentField?: "account_id" | "campaign_id" | "adset_id";
  expectedParentId?: string | null;
  requestId?: string;
}) {
  const data = await fetchMetaObjectById({
    accessToken: params.accessToken,
    objectId: params.objectId,
    fields: params.fields,
    requestId: params.requestId,
  });

  if (!data) {
    return {
      valid: false,
      reason: "Stored Meta object no longer exists.",
    };
  }

  if (typeof data.name !== "string" || data.name.trim() !== params.expectedName.trim()) {
    return {
      valid: false,
      reason: "Stored Meta object name no longer matches the expected launch object.",
    };
  }

  if (params.expectedParentField && params.expectedParentId) {
    const parentValue = data[params.expectedParentField];
    if (typeof parentValue !== "string" || parentValue.trim() !== params.expectedParentId.trim()) {
      return {
        valid: false,
        reason: `Stored Meta object is linked to the wrong ${params.expectedParentField}.`,
      };
    }
  }

  return {
    valid: true,
    reason: null,
  };
}

async function persistPendingLaunchRequest(params: {
  campaignId: string;
  attemptId: string;
  stage: LaunchStage;
  objectName: string;
  objectKey: string;
  workspaceId: string;
  currentIds: {
    campaign_id: string | null;
    adset_id: string | null;
    creative_id: string | null;
    ad_id: string | null;
  };
}) {
  await persistLaunchState(
    params.campaignId,
    {
      ...params.currentIds,
      current_stage: params.stage,
      status: "pending",
      step_status: "pending",
      attempt_id: params.attemptId,
      requested_object_type: params.stage,
      requested_object_name: params.objectName,
      requested_object_key: params.objectKey,
      workspace_id: params.workspaceId,
      error: null,
      updated_at: new Date().toISOString(),
    },
    `Prepared ${params.stage} creation request. Waiting for Meta response.`,
  );
}

async function persistStageState(params: {
  campaignId: string;
  ids: {
    campaign_id: string | null;
    adset_id: string | null;
    creative_id: string | null;
    ad_id: string | null;
  };
  stage: LaunchStage;
  overallStatus: PersistedLaunchState["status"];
  stepStatus: LaunchStepStatus;
  attemptId: string | null;
  requestedObjectType: PersistedLaunchState["requested_object_type"];
  requestedObjectName: string | null;
  requestedObjectKey: string | null;
  workspaceId: string | null;
  error?: string | null;
  message: string;
}) {
  await persistLaunchState(
    params.campaignId,
    {
      ...params.ids,
      current_stage: params.stage,
      status: params.overallStatus,
      step_status: params.stepStatus,
      attempt_id: params.attemptId,
      requested_object_type: params.requestedObjectType,
      requested_object_name: params.requestedObjectName,
      requested_object_key: params.requestedObjectKey,
      workspace_id: params.workspaceId,
      error: params.error ?? null,
      updated_at: new Date().toISOString(),
    },
    params.message,
  );
}

function normalizeForcedInterruptStage(
  value: string | null | undefined,
): ForcedInterruptStage {
  if (value === "campaign" || value === "adset" || value === "creative") {
    return value;
  }

  if (value === "ad_set") {
    return "adset";
  }

  return null;
}

function maybeThrowForcedInterrupt(params: {
  enabledStage: ForcedInterruptStage;
  currentStage: LaunchStage;
}) {
  if (params.enabledStage && params.enabledStage === params.currentStage) {
    throw new ApiError(
      503,
      `Forced interruption after ${params.currentStage} creation.`,
      "forced_launch_interruption",
    );
  }
}

async function launchCampaignToMeta(
  campaignId: string,
  resume: LaunchResumePayload = {},
  options?: {
    testModeInterruptAfter?: ForcedInterruptStage;
  },
) {
  const requestId = crypto.randomUUID();
  let activeAttemptId: string | null = null;
  let currentStage: LaunchStage = "campaign";
  let workspaceId: string | null = null;
  let lastKnownIds = {
    campaign_id: resume.metaCampaignId?.trim() || null,
    adset_id: resume.metaAdSetId?.trim() || null,
    creative_id: resume.metaCreativeId?.trim() || null,
    ad_id: null as string | null,
  };
  let persistedLaunchStateForFailure: PersistedLaunchState | null = null;
  let requestedObjectType: PersistedLaunchState["requested_object_type"] = null;
  let requestedObjectName: string | null = null;
  let ownershipVerified = false;

  try {
    const record = await getCampaignById(campaignId);

    if (!record) {
      throw new ApiError(404, "Campaign plan was not found.", "campaign_plan_not_found");
    }

    ownershipVerified = true;
    const campaignOwnerId = await loadCampaignOwnerId(campaignId);
    await assertMetaLaunchBillingAccessForOrganization(campaignOwnerId);
    assertMetaLiveLaunchEnabled();
    const credentials: MetaWorkspaceCredentials = await getMetaWorkspaceCredentials();
    const storedPayload = await loadSavedCampaignPayload(campaignId);
    const currentPlan = await loadCampaignPlanDocument(campaignId);
    const persistedLaunchState = getPersistedLaunchState(currentPlan);
    persistedLaunchStateForFailure = persistedLaunchState;

    workspaceId = credentials.workspaceId;
    activeAttemptId = buildLaunchAttemptId({
      existingAttemptId: persistedLaunchState?.attempt_id,
      workspaceId,
      campaignId,
    });
    const forcedInterruptStage =
      shouldAllowForcedInterruption() ? options?.testModeInterruptAfter ?? null : null;
    lastKnownIds = {
      campaign_id:
        lastKnownIds.campaign_id ??
        persistedLaunchState?.campaign_id?.trim() ??
        null,
      adset_id:
        lastKnownIds.adset_id ??
        persistedLaunchState?.adset_id?.trim() ??
        null,
      creative_id:
        lastKnownIds.creative_id ??
        persistedLaunchState?.creative_id?.trim() ??
        null,
      ad_id: persistedLaunchState?.ad_id?.trim() ?? null,
    };

    const externalAccountId = credentials.adAccountId.replace(/^act_/, "");
    const campaignName =
      storedPayload?.meta_ready_payload?.campaign_name ??
      record.campaign.name ??
      record.plan.business_name ??
      "DealFlow Campaign";
    const objective = normalizeObjective(storedPayload?.meta_ready_payload?.objective ?? record.plan.primary_goal);
    const location =
      storedPayload?.targeting_plan?.market ??
      storedPayload?.business_profile?.location ??
      record.strategy.location ??
      record.plan.market;
    const countryCode = inferCountryCode(location);
    const audience = storedPayload?.targeting_plan?.audience ?? record.strategy.audience ?? record.plan.audience;
    const targetingSummary =
      storedPayload?.targeting_plan?.summary ?? record.plan.targeting_summary ?? "";
    void audience;
    void targetingSummary;
    const dailyBudget = toMinorDailyBudget(
      storedPayload?.budget_plan?.estimated_daily_budget ??
      Math.round((record.plan.monthly_budget ?? 0) / 30),
    );
    const pixelId = credentials.pixelId?.trim() || null;
    const pageId = credentials.pageId?.trim() || null;

    if (!externalAccountId || !pageId || !pixelId) {
      throw new ApiError(400, "Missing selected Meta assets", "missing_selected_meta_assets");
    }

    const selectedAdId = storedPayload?.selected_ad_id ?? null;

    if (!selectedAdId) {
      throw new ApiError(
        400,
        "No selected ad is saved for this campaign. Choose an ad before launching.",
        "selected_ad_missing",
      );
    }

    const selectedStaticAd =
      record.creatives.staticAds.find((ad) => ad.id === selectedAdId) ?? null;

    if (!selectedStaticAd) {
      throw new ApiError(
        400,
        "The selected ad could not be found in the saved campaign creatives.",
        "selected_ad_not_found",
      );
    }

    const selectedCopy =
      record.creatives.copy.find(
        (item) =>
          item.headline === selectedStaticAd.headline ||
          item.primary_text === selectedStaticAd.primaryText,
      ) ?? null;
    const primaryText =
      selectedStaticAd.primaryText ??
      selectedCopy?.primary_text ??
      storedPayload?.creatives?.primary_text_variations?.[0] ??
      record.plan.offer_summary ??
      record.plan.summary;
    const headline =
      selectedStaticAd.headline ??
      selectedCopy?.headline ??
      storedPayload?.creatives?.headlines?.[0] ??
      storedPayload?.offer?.key_offer ??
      record.plan.offer ??
      record.campaign.name;
    const creativeConcept =
      selectedStaticAd.visualConcept ??
      storedPayload?.creatives?.creative_concepts?.[0] ??
      record.plan.summary;
    const publicSlug = record.publish.slug?.trim() || currentPlan.public_slug?.trim() || "";
    const expectedDestinationUrl = publicSlug
      ? `${getPublicAppUrl()}/f/${publicSlug}`
      : "";
    const destinationUrl = publicSlug ? expectedDestinationUrl : "";

    if (!publicSlug || !destinationUrl || !isPublicFunnelUrl(destinationUrl)) {
      throw new ApiError(
        400,
        "Missing public destination URL",
        "missing_public_destination_url",
      );
    }

    const preflight = await validateMetaLaunchSelections({ destinationUrl });

    if (!preflight.ready) {
      throw new ApiError(
        400,
        preflight.errors[0] ?? "Meta launch preflight failed.",
        "meta_launch_preflight_failed",
      );
    }

    const adImageUrl = selectedStaticAd.imageUrl || null;
    const campaignMetaName = buildDeterministicMetaName({
      organizationId: workspaceId,
      campaignId,
      attemptId: activeAttemptId,
      stage: "campaign",
      baseName: campaignName,
    });
    const adSetMetaName = buildDeterministicMetaName({
      organizationId: workspaceId,
      campaignId,
      attemptId: activeAttemptId,
      stage: "adset",
      baseName: `${campaignName} | ${audience || "Core audience"}`.trim(),
    });
    const creativeMetaName = buildDeterministicMetaName({
      organizationId: workspaceId,
      campaignId,
      attemptId: activeAttemptId,
      stage: "creative",
      baseName: creativeConcept || headline,
    });
    const adMetaName = buildDeterministicMetaName({
      organizationId: workspaceId,
      campaignId,
      attemptId: activeAttemptId,
      stage: "ad",
      baseName: `${campaignName} | ${headline}`.trim(),
    });
    const campaignObjectKey = buildLaunchObjectKey({
      organizationId: workspaceId,
      campaignId,
      attemptId: activeAttemptId,
      stage: "campaign",
    });
    const adSetObjectKey = buildLaunchObjectKey({
      organizationId: workspaceId,
      campaignId,
      attemptId: activeAttemptId,
      stage: "adset",
    });
    const creativeObjectKey = buildLaunchObjectKey({
      organizationId: workspaceId,
      campaignId,
      attemptId: activeAttemptId,
      stage: "creative",
    });
    const adObjectKey = buildLaunchObjectKey({
      organizationId: workspaceId,
      campaignId,
      attemptId: activeAttemptId,
      stage: "ad",
    });

    let campaignData: Record<string, unknown> | null = null;
    currentStage = "campaign";
    requestedObjectType = "campaign";
    requestedObjectName = campaignMetaName;

    if (lastKnownIds.campaign_id) {
      await persistStageState({
        campaignId,
        ids: lastKnownIds,
        stage: "campaign",
        overallStatus: "in_progress",
        stepStatus: "validating",
        attemptId: activeAttemptId,
        requestedObjectType,
        requestedObjectName,
        requestedObjectKey: campaignObjectKey,
        workspaceId,
        message: "Validating saved Meta campaign before reusing it.",
      });
      const validation = await validateExistingMetaObject({
        accessToken: credentials.accessToken,
        objectId: lastKnownIds.campaign_id,
        fields: "id,name,account_id",
        expectedName: campaignMetaName,
        expectedParentField: "account_id",
        expectedParentId: externalAccountId,
        requestId,
      });
      if (!validation.valid) {
        lastKnownIds.campaign_id = null;
        await persistStageState({
          campaignId,
          ids: lastKnownIds,
          stage: "campaign",
          overallStatus: "in_progress",
          stepStatus: "retrying",
          attemptId: activeAttemptId,
          requestedObjectType,
          requestedObjectName,
          requestedObjectKey: campaignObjectKey,
          workspaceId,
          error: validation.reason,
          message: `Stored Meta campaign could not be reused. ${validation.reason} Retrying safely.`,
        });
      } else {
        await persistStageState({
          campaignId,
          ids: lastKnownIds,
          stage: "campaign",
          overallStatus: "in_progress",
          stepStatus: "created",
          attemptId: activeAttemptId,
          requestedObjectType,
          requestedObjectName,
          requestedObjectKey: campaignObjectKey,
          workspaceId,
          message: "Existing Meta campaign validated and reused.",
        });
      }
    }

    if (!lastKnownIds.campaign_id) {
      await persistPendingLaunchRequest({
        campaignId,
        attemptId: activeAttemptId,
        stage: "campaign",
        objectName: campaignMetaName,
        objectKey: campaignObjectKey,
        workspaceId,
        currentIds: lastKnownIds,
      });
      lastKnownIds.campaign_id = await fetchMetaObjectByName({
        accessToken: credentials.accessToken,
        externalAccountId,
        edge: "campaigns",
        fields: "id,name",
        name: campaignMetaName,
        requestId,
      });
      campaignData = lastKnownIds.campaign_id ? { id: lastKnownIds.campaign_id, recovered: true } : null;
    }

    if (lastKnownIds.campaign_id && campaignData?.recovered === true) {
      await persistStageState({
        campaignId,
        ids: lastKnownIds,
        stage: "campaign",
        overallStatus: "in_progress",
        stepStatus: "created",
        attemptId: activeAttemptId,
        requestedObjectType,
        requestedObjectName,
        requestedObjectKey: campaignObjectKey,
        workspaceId,
        message: "Recovered existing Meta campaign by deterministic idempotency name.",
      });
    }

    if (!lastKnownIds.campaign_id) {
      await persistStageState({
        campaignId,
        ids: lastKnownIds,
        stage: "campaign",
        overallStatus: "in_progress",
        stepStatus: "creating",
        attemptId: activeAttemptId,
        requestedObjectType,
        requestedObjectName,
        requestedObjectKey: campaignObjectKey,
        workspaceId,
        message: "Creating Meta campaign.",
      });
      const campaignBody = new URLSearchParams({
        name: campaignMetaName,
        objective,
        status: "PAUSED",
        special_ad_categories: JSON.stringify(["HOUSING"]),
        special_ad_category_country: JSON.stringify([countryCode]),
        is_adset_budget_sharing_enabled: "false",
        access_token: credentials.accessToken,
      });
      const { response: campaignResponse, data: campaignResponseData } = await fetchMetaJson<Record<string, unknown> | null>(
        `https://graph.facebook.com/v18.0/act_${externalAccountId}/campaigns`,
        {
          purpose: "launch_create",
          requestId,
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: campaignBody.toString(),
        },
      );
      campaignData = campaignResponseData;
      lastKnownIds.campaign_id =
        campaignData && typeof campaignData.id === "string" ? campaignData.id : null;

      if (!campaignResponse.ok || !lastKnownIds.campaign_id) {
        const rawErrorMessage = getMetaErrorMessage(campaignData, "Campaign creation failed.");
        logMetaError({
          context: "launch",
          requestId,
          error: rawErrorMessage,
          message: rawErrorMessage,
          extra: { stage: "campaign", campaignId },
        });
        const clientError = buildStageFailureMessage(rawErrorMessage, "campaign");
        await persistStageState({
          campaignId,
          ids: { ...lastKnownIds, campaign_id: null },
          stage: "campaign",
          overallStatus: "failed",
          stepStatus: "failed",
          attemptId: activeAttemptId,
          requestedObjectType,
          requestedObjectName,
          requestedObjectKey: campaignObjectKey,
          workspaceId,
          error: rawErrorMessage,
          message: "Meta campaign creation failed.",
        });
        return NextResponse.json(
          {
            ...campaignData,
            stage: "campaign",
            error: clientError,
            requestId,
          },
          { status: campaignResponse.ok ? 500 : campaignResponse.status },
        );
      }
    }

    if (lastKnownIds.campaign_id) {
      await ensureDirectMetaObjectPaused({
        accessToken: credentials.accessToken,
        objectId: lastKnownIds.campaign_id,
        requestId,
      });
    }

    await persistLaunchState(
      campaignId,
      {
        ...lastKnownIds,
        current_stage: "campaign",
        status: "in_progress",
        step_status: "created",
        attempt_id: activeAttemptId,
        requested_object_type: "campaign",
        requested_object_name: campaignMetaName,
        requested_object_key: campaignObjectKey,
        workspace_id: workspaceId,
        error: null,
        updated_at: new Date().toISOString(),
      },
      "Meta campaign created. Saving progress before ad set creation.",
    );
    maybeThrowForcedInterrupt({
      enabledStage: forcedInterruptStage,
      currentStage: "campaign",
    });

    let adSetData: Record<string, unknown> | null = null;
    currentStage = "adset";
    requestedObjectType = "adset";
    requestedObjectName = adSetMetaName;

    if (lastKnownIds.adset_id) {
      await persistStageState({
        campaignId,
        ids: lastKnownIds,
        stage: "adset",
        overallStatus: "in_progress",
        stepStatus: "validating",
        attemptId: activeAttemptId,
        requestedObjectType,
        requestedObjectName,
        requestedObjectKey: adSetObjectKey,
        workspaceId,
        message: "Validating saved Meta ad set before reusing it.",
      });
      const validation = await validateExistingMetaObject({
        accessToken: credentials.accessToken,
        objectId: lastKnownIds.adset_id,
        fields: "id,name,campaign_id",
        expectedName: adSetMetaName,
        expectedParentField: "campaign_id",
        expectedParentId: lastKnownIds.campaign_id,
        requestId,
      });
      if (!validation.valid) {
        lastKnownIds.adset_id = null;
        await persistStageState({
          campaignId,
          ids: lastKnownIds,
          stage: "adset",
          overallStatus: "in_progress",
          stepStatus: "retrying",
          attemptId: activeAttemptId,
          requestedObjectType,
          requestedObjectName,
          requestedObjectKey: adSetObjectKey,
          workspaceId,
          error: validation.reason,
          message: `Stored Meta ad set could not be reused. ${validation.reason} Retrying safely.`,
        });
      } else {
        await persistStageState({
          campaignId,
          ids: lastKnownIds,
          stage: "adset",
          overallStatus: "in_progress",
          stepStatus: "created",
          attemptId: activeAttemptId,
          requestedObjectType,
          requestedObjectName,
          requestedObjectKey: adSetObjectKey,
          workspaceId,
          message: "Existing Meta ad set validated and reused.",
        });
      }
    }

    if (!lastKnownIds.adset_id) {
      await persistPendingLaunchRequest({
        campaignId,
        attemptId: activeAttemptId,
        stage: "adset",
        objectName: adSetMetaName,
        objectKey: adSetObjectKey,
        workspaceId,
        currentIds: lastKnownIds,
      });
      lastKnownIds.adset_id = await fetchMetaObjectByName({
        accessToken: credentials.accessToken,
        externalAccountId,
        edge: "adsets",
        fields: "id,name,campaign_id",
        name: adSetMetaName,
        requestId,
      });
      adSetData = lastKnownIds.adset_id ? { id: lastKnownIds.adset_id, recovered: true } : null;
    }

    if (lastKnownIds.adset_id && adSetData?.recovered === true) {
      await persistStageState({
        campaignId,
        ids: lastKnownIds,
        stage: "adset",
        overallStatus: "in_progress",
        stepStatus: "created",
        attemptId: activeAttemptId,
        requestedObjectType,
        requestedObjectName,
        requestedObjectKey: adSetObjectKey,
        workspaceId,
        message: "Recovered existing Meta ad set by deterministic idempotency name.",
      });
    }

    if (!lastKnownIds.adset_id) {
      await persistStageState({
        campaignId,
        ids: lastKnownIds,
        stage: "adset",
        overallStatus: "in_progress",
        stepStatus: "creating",
        attemptId: activeAttemptId,
        requestedObjectType,
        requestedObjectName,
        requestedObjectKey: adSetObjectKey,
        workspaceId,
        message: "Creating Meta ad set.",
      });
      const adSetBody = new URLSearchParams({
        name: adSetMetaName,
        campaign_id: lastKnownIds.campaign_id!,
        billing_event: "IMPRESSIONS",
        optimization_goal: objective === "OUTCOME_TRAFFIC" ? "LINK_CLICKS" : "OFFSITE_CONVERSIONS",
        daily_budget: dailyBudget,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting: JSON.stringify({
          geo_locations: {
            countries: [countryCode],
            ...buildGeoTargeting(location),
          },
        }),
        status: "PAUSED",
        access_token: credentials.accessToken,
      });
      adSetBody.set(
        "promoted_object",
        JSON.stringify({
          pixel_id: pixelId,
          custom_event_type: "LEAD",
        }),
      );
      adSetBody.set(
        "tracking_specs",
        JSON.stringify([
          {
            action_type: ["offsite_conversion"],
            fb_pixel: [pixelId],
          },
        ]),
      );
      const { response: adSetResponse, data: adSetResponseData } = await fetchMetaJson<Record<string, unknown> | null>(
        `https://graph.facebook.com/v18.0/act_${externalAccountId}/adsets`,
        {
          purpose: "launch_create",
          requestId,
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: adSetBody.toString(),
        },
      );
      adSetData = adSetResponseData;
      lastKnownIds.adset_id =
        adSetData && typeof adSetData.id === "string" ? adSetData.id : null;

      if (!adSetResponse.ok || !lastKnownIds.adset_id) {
        const rawErrorMessage = getMetaErrorMessage(adSetData, "Ad set creation failed.");
        logMetaError({
          context: "launch",
          requestId,
          error: rawErrorMessage,
          message: rawErrorMessage,
          extra: { stage: "adset", campaignId },
        });
        const clientError = buildStageFailureMessage(rawErrorMessage, "adset");
        await persistStageState({
          campaignId,
          ids: { ...lastKnownIds, adset_id: null },
          stage: "adset",
          overallStatus: "failed",
          stepStatus: "failed",
          attemptId: activeAttemptId,
          requestedObjectType,
          requestedObjectName,
          requestedObjectKey: adSetObjectKey,
          workspaceId,
          error: rawErrorMessage,
          message: "Meta ad set creation failed.",
        });
        return NextResponse.json(
          {
            campaign_id: lastKnownIds.campaign_id,
            adset_id: null,
            ad_id: null,
            stage: "ad_set",
            error: clientError,
            requestId,
            adset: adSetData,
          },
          { status: adSetResponse.ok ? 500 : adSetResponse.status },
        );
      }
    }

    if (lastKnownIds.adset_id) {
      await ensureDirectMetaObjectPaused({
        accessToken: credentials.accessToken,
        objectId: lastKnownIds.adset_id,
        requestId,
      });
    }

    await persistLaunchState(
      campaignId,
      {
        ...lastKnownIds,
        current_stage: "adset",
        status: "in_progress",
        step_status: "created",
        attempt_id: activeAttemptId,
        requested_object_type: "adset",
        requested_object_name: adSetMetaName,
        requested_object_key: adSetObjectKey,
        workspace_id: workspaceId,
        error: null,
        updated_at: new Date().toISOString(),
      },
      "Meta ad set created. Saving progress before creative creation.",
    );
    maybeThrowForcedInterrupt({
      enabledStage: forcedInterruptStage,
      currentStage: "adset",
    });

    const linkData: Record<string, unknown> = {
      message: primaryText,
      link: destinationUrl,
      name: headline,
      call_to_action: {
        type: "LEARN_MORE",
        value: {
          link: destinationUrl,
        },
      },
    };

    if (adImageUrl) {
      linkData.picture = adImageUrl;
    }

    let creativeData: Record<string, unknown> | null = null;
    currentStage = "creative";
    requestedObjectType = "creative";
    requestedObjectName = creativeMetaName;

    if (lastKnownIds.creative_id) {
      await persistStageState({
        campaignId,
        ids: lastKnownIds,
        stage: "creative",
        overallStatus: "in_progress",
        stepStatus: "validating",
        attemptId: activeAttemptId,
        requestedObjectType,
        requestedObjectName,
        requestedObjectKey: creativeObjectKey,
        workspaceId,
        message: "Validating saved Meta creative before reusing it.",
      });
      const validation = await validateExistingMetaObject({
        accessToken: credentials.accessToken,
        objectId: lastKnownIds.creative_id,
        fields: "id,name,account_id",
        expectedName: creativeMetaName,
        expectedParentField: "account_id",
        expectedParentId: externalAccountId,
        requestId,
      });
      if (!validation.valid) {
        lastKnownIds.creative_id = null;
        await persistStageState({
          campaignId,
          ids: lastKnownIds,
          stage: "creative",
          overallStatus: "in_progress",
          stepStatus: "retrying",
          attemptId: activeAttemptId,
          requestedObjectType,
          requestedObjectName,
          requestedObjectKey: creativeObjectKey,
          workspaceId,
          error: validation.reason,
          message: `Stored Meta creative could not be reused. ${validation.reason} Retrying safely.`,
        });
      } else {
        await persistStageState({
          campaignId,
          ids: lastKnownIds,
          stage: "creative",
          overallStatus: "in_progress",
          stepStatus: "created",
          attemptId: activeAttemptId,
          requestedObjectType,
          requestedObjectName,
          requestedObjectKey: creativeObjectKey,
          workspaceId,
          message: "Existing Meta creative validated and reused.",
        });
      }
    }

    if (!lastKnownIds.creative_id) {
      await persistPendingLaunchRequest({
        campaignId,
        attemptId: activeAttemptId,
        stage: "creative",
        objectName: creativeMetaName,
        objectKey: creativeObjectKey,
        workspaceId,
        currentIds: lastKnownIds,
      });
      lastKnownIds.creative_id = await fetchMetaObjectByName({
        accessToken: credentials.accessToken,
        externalAccountId,
        edge: "adcreatives",
        fields: "id,name",
        name: creativeMetaName,
        requestId,
      });
      creativeData = lastKnownIds.creative_id ? { id: lastKnownIds.creative_id, recovered: true } : null;
    }

    if (lastKnownIds.creative_id && creativeData?.recovered === true) {
      await persistStageState({
        campaignId,
        ids: lastKnownIds,
        stage: "creative",
        overallStatus: "in_progress",
        stepStatus: "created",
        attemptId: activeAttemptId,
        requestedObjectType,
        requestedObjectName,
        requestedObjectKey: creativeObjectKey,
        workspaceId,
        message: "Recovered existing Meta creative by deterministic idempotency name.",
      });
    }

    if (!lastKnownIds.creative_id) {
      await persistStageState({
        campaignId,
        ids: lastKnownIds,
        stage: "creative",
        overallStatus: "in_progress",
        stepStatus: "creating",
        attemptId: activeAttemptId,
        requestedObjectType,
        requestedObjectName,
        requestedObjectKey: creativeObjectKey,
        workspaceId,
        message: "Creating Meta creative.",
      });
      const creativeBody = new URLSearchParams({
        name: creativeMetaName,
        object_story_spec: JSON.stringify({
          page_id: pageId,
          link_data: linkData,
        }),
        access_token: credentials.accessToken,
      });
      const { response: creativeResponse, data: creativeResponseData } = await fetchMetaJson<Record<string, unknown> | null>(
        `https://graph.facebook.com/v18.0/act_${externalAccountId}/adcreatives`,
        {
          purpose: "launch_create",
          requestId,
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: creativeBody.toString(),
        },
      );
      creativeData = creativeResponseData;
      lastKnownIds.creative_id =
        creativeData && typeof creativeData.id === "string" ? creativeData.id : null;

      if (!creativeResponse.ok || !lastKnownIds.creative_id) {
        const rawErrorMessage = getMetaErrorMessage(creativeData, "Creative creation failed.");
        logMetaError({
          context: "launch",
          requestId,
          error: rawErrorMessage,
          message: rawErrorMessage,
          extra: { stage: "creative", campaignId },
        });
        const clientError = buildStageFailureMessage(rawErrorMessage, "creative");
        await persistStageState({
          campaignId,
          ids: { ...lastKnownIds, creative_id: null },
          stage: "creative",
          overallStatus: "failed",
          stepStatus: "failed",
          attemptId: activeAttemptId,
          requestedObjectType,
          requestedObjectName,
          requestedObjectKey: creativeObjectKey,
          workspaceId,
          error: rawErrorMessage,
          message: "Meta creative creation failed.",
        });
        return NextResponse.json(
          {
            campaign_id: lastKnownIds.campaign_id,
            adset_id: lastKnownIds.adset_id,
            creative_id: null,
            ad_id: null,
            stage: "creative",
            error: clientError,
            requestId,
            creative: creativeData,
          },
          { status: creativeResponse.ok ? 500 : creativeResponse.status },
        );
      }
    }

    await persistLaunchState(
      campaignId,
      {
        ...lastKnownIds,
        current_stage: "creative",
        status: "in_progress",
        step_status: "created",
        attempt_id: activeAttemptId,
        requested_object_type: "creative",
        requested_object_name: creativeMetaName,
        requested_object_key: creativeObjectKey,
        workspace_id: workspaceId,
        error: null,
        updated_at: new Date().toISOString(),
      },
      "Meta creative created. Saving progress before ad creation.",
    );
    maybeThrowForcedInterrupt({
      enabledStage: forcedInterruptStage,
      currentStage: "creative",
    });

    let adData: Record<string, unknown> | null = null;
    currentStage = "ad";
    requestedObjectType = "ad";
    requestedObjectName = adMetaName;

    if (lastKnownIds.ad_id) {
      await persistStageState({
        campaignId,
        ids: lastKnownIds,
        stage: "ad",
        overallStatus: "in_progress",
        stepStatus: "validating",
        attemptId: activeAttemptId,
        requestedObjectType,
        requestedObjectName,
        requestedObjectKey: adObjectKey,
        workspaceId,
        message: "Validating saved Meta ad before reusing it.",
      });
      const validation = await validateExistingMetaObject({
        accessToken: credentials.accessToken,
        objectId: lastKnownIds.ad_id,
        fields: "id,name,adset_id",
        expectedName: adMetaName,
        expectedParentField: "adset_id",
        expectedParentId: lastKnownIds.adset_id,
        requestId,
      });
      if (!validation.valid) {
        lastKnownIds.ad_id = null;
        await persistStageState({
          campaignId,
          ids: lastKnownIds,
          stage: "ad",
          overallStatus: "in_progress",
          stepStatus: "retrying",
          attemptId: activeAttemptId,
          requestedObjectType,
          requestedObjectName,
          requestedObjectKey: adObjectKey,
          workspaceId,
          error: validation.reason,
          message: `Stored Meta ad could not be reused. ${validation.reason} Retrying safely.`,
        });
      } else {
        await persistStageState({
          campaignId,
          ids: lastKnownIds,
          stage: "ad",
          overallStatus: "completed",
          stepStatus: "created",
          attemptId: activeAttemptId,
          requestedObjectType,
          requestedObjectName,
          requestedObjectKey: adObjectKey,
          workspaceId,
          message: "Existing Meta ad validated and reused.",
        });
      }
    }

    if (!lastKnownIds.ad_id) {
      await persistPendingLaunchRequest({
        campaignId,
        attemptId: activeAttemptId,
        stage: "ad",
        objectName: adMetaName,
        objectKey: adObjectKey,
        workspaceId,
        currentIds: lastKnownIds,
      });
      lastKnownIds.ad_id = await fetchMetaObjectByName({
        accessToken: credentials.accessToken,
        externalAccountId,
        edge: "ads",
        fields: "id,name,adset_id",
        name: adMetaName,
        requestId,
      });
      adData = lastKnownIds.ad_id ? { id: lastKnownIds.ad_id, recovered: true } : null;
    }

    if (lastKnownIds.ad_id && adData?.recovered === true) {
      await persistStageState({
        campaignId,
        ids: lastKnownIds,
        stage: "ad",
        overallStatus: "completed",
        stepStatus: "created",
        attemptId: activeAttemptId,
        requestedObjectType,
        requestedObjectName,
        requestedObjectKey: adObjectKey,
        workspaceId,
        message: "Recovered existing Meta ad by deterministic idempotency name.",
      });
    }

    let adStatusCode = 200;

    if (!lastKnownIds.ad_id) {
      await persistStageState({
        campaignId,
        ids: lastKnownIds,
        stage: "ad",
        overallStatus: "in_progress",
        stepStatus: "creating",
        attemptId: activeAttemptId,
        requestedObjectType,
        requestedObjectName,
        requestedObjectKey: adObjectKey,
        workspaceId,
        message: "Creating Meta ad.",
      });
      const adBody = new URLSearchParams({
        name: adMetaName,
        adset_id: lastKnownIds.adset_id!,
        creative: JSON.stringify({ creative_id: lastKnownIds.creative_id }),
        status: "PAUSED",
        access_token: credentials.accessToken,
      });
      const { response: adResponse, data: adResponseData } = await fetchMetaJson<Record<string, unknown> | null>(
        `https://graph.facebook.com/v18.0/act_${externalAccountId}/ads`,
        {
          purpose: "launch_create",
          requestId,
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: adBody.toString(),
        },
      );
      adData = adResponseData;
      lastKnownIds.ad_id =
        adData && typeof adData.id === "string" ? adData.id : null;
      adStatusCode = adResponse.status;
    }

    if (lastKnownIds.ad_id) {
      await ensureDirectMetaObjectPaused({
        accessToken: credentials.accessToken,
        objectId: lastKnownIds.ad_id,
        requestId,
      });

      await persistLaunchState(
        campaignId,
        {
          ...lastKnownIds,
          current_stage: "ad",
          status: "completed",
          step_status: "created",
          attempt_id: activeAttemptId,
          requested_object_type: "ad",
          requested_object_name: adMetaName,
          requested_object_key: adObjectKey,
          workspace_id: workspaceId,
          error: null,
          updated_at: new Date().toISOString(),
        },
        "Meta ad created and launch completed.",
      );
    } else {
      const rawErrorMessage = getMetaErrorMessage(adData, "Ad creation failed.");
      logMetaError({
        context: "launch",
        requestId,
        error: rawErrorMessage,
        message: rawErrorMessage,
        extra: { stage: "ad", campaignId },
      });
      await persistLaunchState(
        campaignId,
        {
          ...lastKnownIds,
          ad_id: null,
          current_stage: "ad",
          status: "failed",
          step_status: "failed",
          attempt_id: activeAttemptId,
          requested_object_type: "ad",
          requested_object_name: adMetaName,
          requested_object_key: adObjectKey,
          workspace_id: workspaceId,
          error: rawErrorMessage,
          updated_at: new Date().toISOString(),
        },
        "Meta ad creation failed after campaign, ad set, and creative were created.",
      );
    }

    return NextResponse.json(
      {
        campaign_id: lastKnownIds.campaign_id,
        adset_id: lastKnownIds.adset_id,
        creative_id: lastKnownIds.creative_id,
        ad_id: lastKnownIds.ad_id,
        stage: "ad",
        error:
          !lastKnownIds.ad_id
            ? buildStageFailureMessage(getMetaErrorMessage(adData, "Ad creation failed."), "ad")
            : undefined,
        requestId,
        campaign: campaignData,
        adset: adSetData,
        creative: creativeData,
        ad: adData,
      },
      { status: lastKnownIds.ad_id ? 200 : adStatusCode },
    );
  } catch (error) {
    logMetaError({
      context: "launch",
      requestId,
      error,
      message: error instanceof Error ? error.message : "Campaign create failed.",
      extra: { stage: currentStage, campaignId },
    });
    const clientError = buildStageFailureMessage(
      error instanceof Error ? error.message : "Campaign create failed.",
      currentStage,
    );
    const failureAttemptId = activeAttemptId ?? persistedLaunchStateForFailure?.attempt_id ?? null;
    const failureWorkspaceId = workspaceId ?? persistedLaunchStateForFailure?.workspace_id ?? null;
    const failureRequestedObjectType =
      requestedObjectType ?? persistedLaunchStateForFailure?.requested_object_type ?? null;
    const failureRequestedObjectName =
      requestedObjectName ?? persistedLaunchStateForFailure?.requested_object_name ?? null;
    const failureRequestedObjectKey =
      failureRequestedObjectType && failureAttemptId && failureWorkspaceId
        ? buildLaunchObjectKey({
            organizationId: failureWorkspaceId,
            campaignId,
            attemptId: failureAttemptId,
            stage: failureRequestedObjectType,
          })
        : persistedLaunchStateForFailure?.requested_object_key ?? null;
    const failureStage =
      activeAttemptId || !persistedLaunchStateForFailure?.current_stage
        ? currentStage
        : persistedLaunchStateForFailure.current_stage;

    if (ownershipVerified) {
      await persistLaunchState(
        campaignId,
        {
          ...lastKnownIds,
          current_stage: failureStage,
          status: "failed",
          step_status: "failed",
          attempt_id: failureAttemptId,
          requested_object_type: failureRequestedObjectType,
          requested_object_name: failureRequestedObjectName,
          requested_object_key: failureRequestedObjectKey,
          workspace_id: failureWorkspaceId,
          error: error instanceof Error ? error.message : "Campaign create failed.",
          updated_at: new Date().toISOString(),
        },
        error instanceof Error ? error.message : "Campaign create failed.",
      ).catch(() => null);
    }

    return NextResponse.json(
      {
        error: clientError,
        requestId,
        retryEligible:
          error instanceof ApiError
            ? error.status === 408 || error.status === 429 || error.status >= 500
            : false,
      },
      { status: error instanceof ApiError ? error.status : 500 },
    );
  }
}

export async function POST(request: Request) {
  assertSameOriginRequest(request);
  const { campaignId, metaCampaignId, metaAdSetId, metaCreativeId, testModeInterruptAfter } = await parseJsonBody(request, requestSchema);
  const rateLimit = await consumeRateLimit({
    key: getRateLimitKey(request, "campaign-create-launch", campaignId),
    limit: 6,
    windowMs: 60_000,
  });

  if (rateLimit && !rateLimit.allowed) {
    return buildRateLimitResponse(rateLimit.resetAt);
  }

  return launchCampaignToMeta(campaignId, {
    metaCampaignId,
    metaAdSetId,
    metaCreativeId,
  }, {
    testModeInterruptAfter: normalizeForcedInterruptStage(testModeInterruptAfter),
  });
}
