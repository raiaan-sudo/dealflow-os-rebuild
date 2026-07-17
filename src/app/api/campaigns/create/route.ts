import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiError, assertSameOriginRequest } from "@/lib/api/route";
import { getPublicAppUrl } from "@/lib/env";
import {
  getCampaignPayloadFromPlan,
  getLaunchRuntimeFromPlan,
  readCampaignPlanDocument,
} from "@/lib/services/campaign-plan-document";
import { logMetaError, mapMetaError } from "@/lib/integrations/meta/error-mapper";
import { fetchMetaJson } from "@/lib/integrations/meta/request";
import {
  buildMetaGraphUrl,
  withMetaBearerToken,
} from "@/lib/integrations/meta/contract";
import {
  getMetaWorkspaceCredentials,
  getMetaWorkspaceCredentialsForOrganization,
  validateMetaLaunchSelectionsForOrganization,
  type MetaWorkspaceCredentials,
} from "@/lib/integrations/meta/service";
import { assertMetaLaunchBillingAccessForOrganization } from "@/lib/services/billing-service";
import {
  getCampaignById,
  getCampaignByIdForInternalActor,
} from "@/lib/services/campaign-persistence";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  buildMetaLaunchInputBinding,
  type MetaLaunchInputBinding,
} from "@/lib/meta-launch-input-snapshot";
import { resolveCampaignDestinationContract } from "@/lib/campaign-destination";
import {
  buildMetaInstantFormDefinition,
  ensureMetaInstantForm,
} from "@/lib/services/meta-instant-form-service";
import {
  prepareGhlCampaignPersonalization,
  resolveReadyGhlDestination,
} from "@/lib/services/ghl-personalization-service";
import { getDeploymentTarget } from "@/lib/deployment-target";
import {
  getMetaDailyBudgetHardCeilingCents,
  resolveExactCustomerApprovedMetaDailyBudgetCents,
} from "@/lib/integrations/meta/budget-safety";
import { resolveCreativeContentSha256 } from "@/lib/creative-content-integrity";
import { assertMetaCreativeClaims } from "@/lib/advertising-claim-boundaries";
import { AdvertisingClaimUnverifiedError } from "@/lib/copy/claim-safety";

type LaunchResumePayload = {
  metaCampaignId?: string | null;
  metaAdSetId?: string | null;
  metaCreativeId?: string | null;
  metaAdId?: string | null;
};

type LaunchStage = "campaign" | "adset" | "creative" | "ad";
type LaunchStepStatus = "pending" | "creating" | "created" | "validating" | "retrying" | "failed";
type ForcedInterruptStage = "campaign" | "adset" | "creative" | null;
type ProviderMutationSettlement = {
  stage: LaunchStage;
  objectKey: string;
  outcome: "receipted" | "explicit_provider_rejection";
  objectId: string | null;
  responseStatus: number;
  providerErrorCode?: string | null;
};

export type InternalMetaLaunchActor = {
  organizationId: string;
  userId: string;
};

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

type PersistLaunchStateWriter = (
  state: PersistedLaunchState,
  message: string,
) => Promise<void>;

type CampaignPayloadRecord = {
  selected_ad_id?: string;
  selected_ad_ids?: string[];
  destination_url?: string;
  ad_destination?: string;
  campaign_destination?: string;
  capture_experience?: string;
  lead_capture_mode?: string;
  daily_budget_cents?: number;
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
    daily_budget_cents?: number;
  };
  meta_ready_payload?: {
    objective?: string;
    campaign_name?: string;
  };
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
    return `${rawMessage} The configured hard ceiling is ${getMetaDailyBudgetHardCeilingCents()} cents/day; choose a valid customer-approved budget or deliberately change that ceiling before retrying.`;
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

function getExplicitMetaProviderRejectionCode(
  data: Record<string, unknown> | null,
  responseStatus: number,
) {
  if (![400, 401, 403, 404, 405, 410, 422].includes(responseStatus)) {
    return null;
  }

  const error =
    data && typeof data.error === "object" && data.error && !Array.isArray(data.error)
      ? (data.error as Record<string, unknown>)
      : null;
  if (!error) {
    return null;
  }

  const rawCode = error.code ?? error.error_subcode ?? error.type;
  const hasExplicitProviderError =
    (rawCode !== null && rawCode !== undefined) ||
    (typeof error.message === "string" && error.message.trim().length > 0);
  if (!hasExplicitProviderError) {
    return null;
  }

  const normalized = String(rawCode ?? "meta_provider_rejected")
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .slice(0, 100);
  return normalized || "meta_provider_rejected";
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

async function loadSavedCampaignPayload(campaignId: string): Promise<CampaignPayloadRecord | null> {
  const supabase = createAdminClient() ?? (await createRouteHandlerClient());

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("campaign_plans")
    .select("plan")
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

  const row = (data as { plan?: unknown } | null) ?? null;

  return readCampaignPlanDocument(row?.plan);
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

function toExactMinorDailyBudget(input: {
  payload?: CampaignPayloadRecord | null;
  canonicalDailyBudgetCents?: number | null;
  legacyDailyBudgetDollars?: number | null;
}) {
  return String(resolveExactCustomerApprovedMetaDailyBudgetCents({
    canonicalDailyBudgetCents: input.canonicalDailyBudgetCents,
    payloadDailyBudgetCents: input.payload?.daily_budget_cents,
    payloadBudgetPlanDailyBudgetCents: input.payload?.budget_plan?.daily_budget_cents,
    legacyDailyBudgetDollars: input.legacyDailyBudgetDollars,
  }));
}

function isPublicFunnelUrl(value: string) {
  try {
    const url = new URL(value);
    return /^\/f\/[^/]+$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function getGhlDestinationEnvironment() {
  const target = getDeploymentTarget();
  if (target === "production") return "production" as const;
  if (["staging", "preview", "test", "development"].includes(target)) {
    return "sandbox" as const;
  }
  return null;
}

function isSecureHostedDestinationUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

type GhlDestinationEnvironment = "sandbox" | "production";
type GhlAuthorityRow = Record<string, unknown>;

function asGhlAuthorityRows(value: unknown): GhlAuthorityRow[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is GhlAuthorityRow => Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );
  }

  return value && typeof value === "object" ? [value as GhlAuthorityRow] : [];
}

function hasLegacyCommercialActivationAuthority(rows: GhlAuthorityRow[]) {
  return rows.some((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {};
    return (
      metadata.legacy_commercial_activation_reconciled === true ||
      metadata.legacy_commercial_activation_reconciled === "true"
    );
  });
}

/**
 * Resolve the exact website destination without allowing a commercially
 * activated or GHL-provisioned workspace to silently fall back to DealFlow's
 * legacy hosted funnel. Every authority lookup is organization fenced, and
 * environment-specific GHL records are additionally environment fenced.
 */
export async function resolveGhlAwareWebsiteDestination(input: {
  client: any;
  organizationId: string;
  campaignId: string;
  environment: GhlDestinationEnvironment;
  legacyDestinationUrl: string;
}) {
  if (!input.client || !input.organizationId || !input.campaignId || !input.environment) {
    throw new ApiError(
      503,
      "GHL destination authority is unavailable for this launch.",
      "ghl_destination_authority_unavailable",
    );
  }

  const [commercialActivation, legacyBilling, activationRequests, provisioningRuns] = await Promise.all([
    input.client
      .from("commercial_activations")
      .select("id")
      .eq("organization_id", input.organizationId)
      .limit(1),
    input.client
      .from("billing_subscriptions")
      .select("metadata")
      .eq("organization_id", input.organizationId)
      .limit(1),
    input.client
      .from("ghl_billing_activation_requests")
      .select("id,status,blocker_code")
      .eq("organization_id", input.organizationId)
      .eq("environment", input.environment),
    input.client
      .from("ghl_provisioning_runs")
      .select("id,state,last_error_code")
      .eq("organization_id", input.organizationId)
      .eq("environment", input.environment),
  ]);

  if (
    commercialActivation.error ||
    legacyBilling.error ||
    activationRequests.error ||
    provisioningRuns.error
  ) {
    throw new ApiError(
      503,
      "GHL destination authority could not be verified. Retry after the workspace connection is available.",
      "ghl_destination_authority_lookup_failed",
    );
  }

  const commercialRows = asGhlAuthorityRows(commercialActivation.data);
  const legacyBillingRows = asGhlAuthorityRows(legacyBilling.data);
  const requestRows = asGhlAuthorityRows(activationRequests.data);
  const runRows = asGhlAuthorityRows(provisioningRuns.data);
  const commerciallyActivated =
    commercialRows.length > 0 || hasLegacyCommercialActivationAuthority(legacyBillingRows);
  const ghlRequired = commerciallyActivated || requestRows.length > 0 || runRows.length > 0;

  if (ghlRequired && runRows.some((candidate) => candidate.state === "ready")) {
    try {
      await prepareGhlCampaignPersonalization({
        client: input.client,
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        environment: input.environment,
      });
    } catch {
      throw new ApiError(
        409,
        "The campaign-specific GHL funnel contract could not be prepared safely.",
        "ghl_campaign_personalization_blocked",
      );
    }
  }

  let readyDestination: Awaited<ReturnType<typeof resolveReadyGhlDestination>>;
  try {
    readyDestination = await resolveReadyGhlDestination({
      client: input.client,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      environment: input.environment,
    });
  } catch {
    throw new ApiError(
      503,
      "GHL destination readiness could not be verified. Retry after the workspace connection is available.",
      "ghl_destination_resolution_failed",
    );
  }

  if (readyDestination) {
    if (!isSecureHostedDestinationUrl(readyDestination.destinationUrl)) {
      throw new ApiError(
        409,
        "The verified GHL destination is not a valid HTTPS URL.",
        "ghl_destination_invalid",
      );
    }
    return readyDestination.destinationUrl;
  }

  if (!ghlRequired) {
    return input.legacyDestinationUrl;
  }

  const blockedRequest = requestRows.some((row) => row.status === "blocked_configuration");
  const blockedRun = runRows.some((row) =>
    row.state === "operator_action_required" || row.state === "canceled",
  );
  if (blockedRequest || blockedRun) {
    throw new ApiError(
      409,
      "GHL setup is blocked and must be resolved before this website campaign can launch.",
      "ghl_destination_blocked",
    );
  }

  if (requestRows.length > 0 || runRows.length > 0) {
    throw new ApiError(
      409,
      "GHL setup is still in progress. Wait for the verified GHL destination before launching.",
      "ghl_destination_pending",
    );
  }

  throw new ApiError(
    409,
    "This paid workspace requires GHL provisioning before a website campaign can launch.",
    "ghl_destination_provisioning_required",
  );
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
}) {
  const suffix = `DF-${params.organizationId.slice(0, 8)}-${params.campaignId.slice(0, 8)}-${params.attemptId.slice(0, 8)}-${params.stage}`;
  const stageLabel = {
    campaign: "DealFlow Campaign",
    adset: "DealFlow Ad Set",
    creative: "DealFlow Creative",
    ad: "DealFlow Ad",
  }[params.stage];
  return `${stageLabel} | ${suffix}`;
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
  expectedParentField?: "account_id" | "campaign_id" | "adset_id";
  expectedParentId?: string | null;
  requestId?: string;
}) {
  let after: string | null = null;
  const seenCursors = new Set<string>();
  const matchingIds = new Set<string>();

  for (let page = 0; page < 20; page += 1) {
    const url = buildMetaGraphUrl(
      `act_${params.externalAccountId.replace(/^act_/, "")}/${params.edge}`,
      {
        fields: params.fields,
        limit: 100,
        ...(after ? { after } : {}),
      },
    );
    const { response, data } = await fetchMetaJson<
      {
        data?: Array<Record<string, unknown>>;
        paging?: { cursors?: { after?: unknown } };
        error?: { message?: string };
      } | null
    >(url, {
      purpose: "launch_lookup",
      requestId: params.requestId,
      ...withMetaBearerToken(params.accessToken, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }),
    });

    if (!response.ok) {
      throw new ApiError(
        502,
        data?.error?.message ?? `Meta ${params.edge} lookup failed.`,
        "meta_lookup_failed",
      );
    }

    for (const item of data?.data ?? []) {
      if (typeof item.name !== "string" || item.name.trim() !== params.name) {
        continue;
      }

      if (params.expectedParentField && params.expectedParentId) {
        const actualParent = String(item[params.expectedParentField] ?? "")
          .trim()
          .replace(/^act_/, "");
        const expectedParent = params.expectedParentId.trim().replace(/^act_/, "");
        if (actualParent !== expectedParent) {
          continue;
        }
      }

      if (typeof item.id === "string" && item.id.trim()) {
        matchingIds.add(item.id.trim());
      }
    }

    if (matchingIds.size > 1) {
      throw new ApiError(
        422,
        `Meta returned multiple ${params.edge} with the same deterministic recovery identity.`,
        "meta_lookup_ambiguous",
      );
    }

    const nextAfter = data?.paging?.cursors?.after;
    if (typeof nextAfter !== "string" || !/^[\x21-\x7E]{1,500}$/.test(nextAfter)) {
      return Array.from(matchingIds)[0] ?? null;
    }
    if (seenCursors.has(nextAfter)) {
      throw new ApiError(
        502,
        `Meta ${params.edge} lookup returned a repeated pagination cursor.`,
        "meta_lookup_pagination_invalid",
      );
    }
    seenCursors.add(nextAfter);
    after = nextAfter;
  }

  throw new ApiError(
    502,
    `Meta ${params.edge} lookup exceeded the bounded pagination window.`,
    "meta_lookup_pagination_limit",
  );
}

async function fetchMetaObjectById(params: {
  accessToken: string;
  objectId: string;
  fields: string;
  requestId?: string;
}) {
  const url = buildMetaGraphUrl(params.objectId, {
    fields: params.fields,
  });

  const { response, data } = await fetchMetaJson<
    | (Record<string, unknown> & {
        error?: { message?: string; code?: number; error_subcode?: number };
      })
    | null
  >(url, {
    purpose: "launch_lookup",
    requestId: params.requestId,
    ...withMetaBearerToken(params.accessToken, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }),
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
  return typeof value === "string" && value.trim().toUpperCase() === "PAUSED";
}

async function updateMetaObjectPaused(params: {
  accessToken: string;
  objectId: string;
  requestId?: string;
  assertProviderMutationAllowed?: () => void | Promise<void>;
}) {
  await params.assertProviderMutationAllowed?.();
  const body = new URLSearchParams({ status: "PAUSED" });
  const { response, data } = await fetchMetaJson<{ success?: boolean; error?: { message?: string } } | null>(
    buildMetaGraphUrl(params.objectId),
    {
      purpose: "launch_create",
      requestId: params.requestId,
      ...withMetaBearerToken(params.accessToken, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }),
    },
  );
  await params.assertProviderMutationAllowed?.();

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
  assertProviderMutationAllowed?: () => void | Promise<void>;
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

  if (isPausedMetaStatus(current.status)) {
    return;
  }

  await updateMetaObjectPaused(params);

  const updated = await fetchMetaObjectById({
    accessToken: params.accessToken,
    objectId: params.objectId,
    fields: "id,status,effective_status",
    requestId: params.requestId,
  });

  if (!isPausedMetaStatus(updated?.status)) {
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

async function persistPendingLaunchRequestWithWriter(params: {
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
  writer: PersistLaunchStateWriter;
}) {
  await params.writer(
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

async function persistStageStateWithWriter(params: {
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
  writer: PersistLaunchStateWriter;
}) {
  await params.writer(
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

export async function launchCampaignToMeta(
  campaignId: string,
  resume: LaunchResumePayload = {},
  options: {
    testModeInterruptAfter?: ForcedInterruptStage;
    internalActor?: InternalMetaLaunchActor;
    assertProviderMutationAllowed?: () => void | Promise<void>;
    bindLaunchInputSnapshot: (binding: MetaLaunchInputBinding) => Promise<void>;
    recordProviderReceipt?: (receipt: {
      stage: LaunchStage;
      objectId: string;
      responseStatus: number;
    }) => Promise<void>;
    armProviderMutation: (mutation: {
      stage: LaunchStage;
      objectKey: string;
    }) => Promise<void>;
    settleProviderMutation: (settlement: ProviderMutationSettlement) => Promise<void>;
    persistLaunchState: PersistLaunchStateWriter;
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
    ad_id: resume.metaAdId?.trim() || null,
  };
  let persistedLaunchStateForFailure: PersistedLaunchState | null = null;
  let requestedObjectType: PersistedLaunchState["requested_object_type"] = null;
  let requestedObjectName: string | null = null;
  let ownershipVerified = false;
  let pendingProviderMutation: { stage: LaunchStage; objectKey: string } | null = null;

  const armProviderMutation = async (stage: LaunchStage, objectKey: string) => {
    await options.armProviderMutation({ stage, objectKey });
    pendingProviderMutation = { stage, objectKey };
  };
  const settleProviderMutation = async (settlement: ProviderMutationSettlement) => {
    await options.settleProviderMutation(settlement);
    pendingProviderMutation = null;
  };
  const getProviderFailureContract = () =>
    pendingProviderMutation
      ? {
          code: "meta_provider_create_outcome_ambiguous",
          operatorActionRequired: true,
          status: 409,
        }
      : {
          code: "meta_provider_request_rejected",
          operatorActionRequired: false,
          status: null,
        };

  const writeFencedLaunchState: PersistLaunchStateWriter = async (state, message) => {
    // Terminal success is committed atomically by the manual/scheduled
    // completion RPC after all four immutable 2xx provider receipts match.
    // Writing it here would make mutable plan truth precede durable settlement.
    if (state.status === "completed") {
      return;
    }
    await options.persistLaunchState(state, message);
  };

  const persistLaunchState = async (
    targetCampaignId: string,
    state: PersistedLaunchState,
    message: string,
  ) => {
    if (targetCampaignId !== campaignId) {
      throw new ApiError(
        500,
        "Launch state writer was invoked for the wrong campaign.",
        "campaign_launch_runtime_target_mismatch",
      );
    }
    await writeFencedLaunchState(state, message);
  };
  const persistPendingLaunchRequest = (
    params: Omit<Parameters<typeof persistPendingLaunchRequestWithWriter>[0], "writer">,
  ) => persistPendingLaunchRequestWithWriter({ ...params, writer: writeFencedLaunchState });
  const persistStageState = (
    params: Omit<Parameters<typeof persistStageStateWithWriter>[0], "writer">,
  ) => persistStageStateWithWriter({ ...params, writer: writeFencedLaunchState });

  try {
    const record = options?.internalActor
      ? await getCampaignByIdForInternalActor({
          campaignId,
          organizationId: options.internalActor.organizationId,
          userId: options.internalActor.userId,
        })
      : await getCampaignById(campaignId);

    if (!record) {
      throw new ApiError(404, "Campaign plan was not found.", "campaign_plan_not_found");
    }

    ownershipVerified = true;
    const campaignOwnerId = await loadCampaignOwnerId(campaignId);
    if (options?.internalActor && campaignOwnerId !== options.internalActor.organizationId) {
      throw new ApiError(
        403,
        "The scheduled launch actor does not own this campaign.",
        "scheduled_launch_actor_mismatch",
      );
    }
    await assertMetaLaunchBillingAccessForOrganization(
      options?.internalActor?.organizationId ?? campaignOwnerId,
      { allowSessionOverride: !options?.internalActor },
    );
    assertMetaLiveLaunchEnabled();
    const credentials: MetaWorkspaceCredentials = options?.internalActor
      ? await getMetaWorkspaceCredentialsForOrganization(options.internalActor.organizationId)
      : await getMetaWorkspaceCredentials();
    const storedPayload = await loadSavedCampaignPayload(campaignId);
    const currentPlan = await loadCampaignPlanDocument(campaignId);
    const destinationContract = resolveCampaignDestinationContract({
      plan: currentPlan,
      campaign_payload: storedPayload,
    });
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
      ad_id:
        lastKnownIds.ad_id ??
        persistedLaunchState?.ad_id?.trim() ??
        null,
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
    const dailyBudget = toExactMinorDailyBudget({
      payload: storedPayload,
      canonicalDailyBudgetCents: record.plan.daily_budget_cents,
      legacyDailyBudgetDollars:
        storedPayload?.budget_plan?.estimated_daily_budget ??
        (record.plan.monthly_budget ?? 0) / 30,
    });
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
    if (selectedStaticAd.imageGenerationState !== "generated" || !selectedStaticAd.imageUrl?.trim()) {
      throw new ApiError(
        409,
        "The selected creative is not fully generated and cannot be launched.",
        "meta_selected_creative_not_ready",
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
    assertMetaCreativeClaims({
      primaryText,
      headline,
      overlayText: selectedStaticAd.overlayText,
      body: selectedStaticAd.hook,
      cta: selectedStaticAd.cta,
    });
    const publicSlug = record.publish.slug?.trim() ?? "";
    const expectedDestinationUrl = publicSlug
      ? `${getPublicAppUrl()}/f/${publicSlug}`
      : "";
    const fallbackDestinationUrl = storedPayload?.destination_url?.trim() ?? "";

    if (
      !publicSlug ||
      !fallbackDestinationUrl ||
      fallbackDestinationUrl !== expectedDestinationUrl ||
      !isPublicFunnelUrl(fallbackDestinationUrl)
    ) {
      throw new ApiError(
        400,
        "Missing public destination URL",
        "missing_public_destination_url",
      );
    }

    let destinationUrl = fallbackDestinationUrl;
    if (destinationContract.adDestination === "website") {
      const environment = getGhlDestinationEnvironment();
      const admin = createAdminClient();
      if (!environment || !admin) {
        throw new ApiError(
          503,
          "GHL destination authority is unavailable for this launch.",
          "ghl_destination_authority_unavailable",
        );
      }
      destinationUrl = await resolveGhlAwareWebsiteDestination({
        client: admin as any,
        organizationId: workspaceId,
        campaignId,
        environment,
        legacyDestinationUrl: fallbackDestinationUrl,
      });
    }

    const instantFormDefinition = destinationContract.adDestination === "meta_instant_form"
      ? buildMetaInstantFormDefinition(record)
      : null;
    const imageContentSha256 = await resolveCreativeContentSha256(selectedStaticAd.imageUrl.trim());

    const launchInputBinding = buildMetaLaunchInputBinding({
        organizationId: workspaceId,
        campaignId,
        attemptId: activeAttemptId,
        adAccountId: externalAccountId,
        accountCurrency: credentials.currency,
        pageId,
        pixelId,
        selectedAdId,
        imageContentSha256,
        primaryText,
        headline,
        destinationUrl,
        objective,
        countryCode,
        location,
        dailyBudgetMinor: dailyBudget,
        captureExperience: destinationContract.captureExperience,
        adDestination: destinationContract.adDestination,
        providerFormId: null,
        formDefinitionDigest: instantFormDefinition?.digest ?? null,
      });
    await options.bindLaunchInputSnapshot(launchInputBinding);
    const providerContract = launchInputBinding.snapshot.provider_contract;

    // Complete the exact read-only account, hierarchy, currency, pixel, and
    // destination preflight before Instant Form or Page-subscription writes.
    // The checked credential snapshot is the same one frozen above.
    const preflight = await validateMetaLaunchSelectionsForOrganization({
      organizationId: options?.internalActor?.organizationId ?? workspaceId,
      credentials,
      destinationUrl,
    });
    if (!preflight.ready) {
      throw new ApiError(
        400,
        preflight.errors[0] ?? "Meta launch preflight failed.",
        "meta_launch_preflight_failed",
      );
    }

    const instantForm =
      destinationContract.adDestination === "meta_instant_form"
        ? await ensureMetaInstantForm({
            organizationId: workspaceId,
            userId: record.campaign.user_id,
            campaign: record,
            marketingAccountId: credentials.connectionId,
            pageId,
            userAccessToken: credentials.accessToken,
            expectedDefinitionDigest: instantFormDefinition!.digest,
            assertProviderMutationAllowed: options.assertProviderMutationAllowed,
          })
        : null;

    const adImageUrl = selectedStaticAd.imageUrl || null;
    const campaignMetaName = buildDeterministicMetaName({
      organizationId: workspaceId,
      campaignId,
      attemptId: activeAttemptId,
      stage: "campaign",
    });
    const adSetMetaName = buildDeterministicMetaName({
      organizationId: workspaceId,
      campaignId,
      attemptId: activeAttemptId,
      stage: "adset",
    });
    const creativeMetaName = buildDeterministicMetaName({
      organizationId: workspaceId,
      campaignId,
      attemptId: activeAttemptId,
      stage: "creative",
    });
    const adMetaName = buildDeterministicMetaName({
      organizationId: workspaceId,
      campaignId,
      attemptId: activeAttemptId,
      stage: "ad",
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
        await options.recordProviderReceipt?.({
          stage: "campaign",
          objectId: lastKnownIds.campaign_id,
          responseStatus: 200,
        });
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
        fields: "id,name,account_id",
        name: campaignMetaName,
        expectedParentField: "account_id",
        expectedParentId: externalAccountId,
        requestId,
      });
      campaignData = lastKnownIds.campaign_id ? { id: lastKnownIds.campaign_id, recovered: true } : null;
      if (lastKnownIds.campaign_id) {
        await options?.recordProviderReceipt?.({
          stage: "campaign",
          objectId: lastKnownIds.campaign_id,
          responseStatus: 200,
        });
      }
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
        objective: providerContract.campaign.objective,
        status: "PAUSED",
        special_ad_categories: JSON.stringify(providerContract.campaign.special_ad_categories),
        special_ad_category_country: JSON.stringify(providerContract.campaign.special_ad_category_country),
        is_adset_budget_sharing_enabled: String(providerContract.campaign.is_adset_budget_sharing_enabled),
      });
      await options?.assertProviderMutationAllowed?.();
      await armProviderMutation("campaign", campaignObjectKey);
      const { response: campaignResponse, data: campaignResponseData } = await fetchMetaJson<Record<string, unknown> | null>(
        buildMetaGraphUrl(`act_${externalAccountId}/campaigns`),
        {
          purpose: "launch_create",
          requestId,
          ...withMetaBearerToken(credentials.accessToken, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: campaignBody.toString(),
          }),
        },
      );
      campaignData = campaignResponseData;
      lastKnownIds.campaign_id =
        campaignData && typeof campaignData.id === "string" ? campaignData.id : null;
      if (lastKnownIds.campaign_id) {
        await options?.recordProviderReceipt?.({
          stage: "campaign",
          objectId: lastKnownIds.campaign_id,
          responseStatus: campaignResponse.status,
        });
        if (campaignResponse.ok) {
          await settleProviderMutation({
            stage: "campaign",
            objectKey: campaignObjectKey,
            outcome: "receipted",
            objectId: lastKnownIds.campaign_id,
            responseStatus: campaignResponse.status,
          });
        }
        if (!options?.recordProviderReceipt) {
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
            message: "Captured the Meta campaign receipt before post-response authorization checks.",
          });
        }
      }
      if (!lastKnownIds.campaign_id) {
        const providerErrorCode = getExplicitMetaProviderRejectionCode(
          campaignData,
          campaignResponse.status,
        );
        if (providerErrorCode) {
          await settleProviderMutation({
            stage: "campaign",
            objectKey: campaignObjectKey,
            outcome: "explicit_provider_rejection",
            objectId: null,
            responseStatus: campaignResponse.status,
            providerErrorCode,
          });
        }
      }
      await options?.assertProviderMutationAllowed?.();

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
        const failureContract = getProviderFailureContract();
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
            code: failureContract.code,
            operatorActionRequired: failureContract.operatorActionRequired,
            requestId,
          },
          {
            status:
              failureContract.status ??
              (campaignResponse.ok ? 500 : campaignResponse.status),
          },
        );
      }
    }

    if (lastKnownIds.campaign_id) {
      await ensureDirectMetaObjectPaused({
        accessToken: credentials.accessToken,
        objectId: lastKnownIds.campaign_id,
        requestId,
        assertProviderMutationAllowed: options?.assertProviderMutationAllowed,
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
        await options.recordProviderReceipt?.({
          stage: "adset",
          objectId: lastKnownIds.adset_id,
          responseStatus: 200,
        });
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
        expectedParentField: "campaign_id",
        expectedParentId: lastKnownIds.campaign_id,
        requestId,
      });
      adSetData = lastKnownIds.adset_id ? { id: lastKnownIds.adset_id, recovered: true } : null;
      if (lastKnownIds.adset_id) {
        await options?.recordProviderReceipt?.({
          stage: "adset",
          objectId: lastKnownIds.adset_id,
          responseStatus: 200,
        });
      }
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
        billing_event: providerContract.ad_set.billing_event,
        optimization_goal: providerContract.ad_set.optimization_goal,
        daily_budget: providerContract.ad_set.daily_budget_minor,
        bid_strategy: providerContract.ad_set.bid_strategy,
        targeting: JSON.stringify(providerContract.ad_set.targeting),
        status: "PAUSED",
      });
      if (destinationContract.adDestination === "meta_instant_form") {
        adSetBody.set("destination_type", providerContract.ad_set.destination_type!);
        adSetBody.set("promoted_object", JSON.stringify(providerContract.ad_set.promoted_object));
      } else {
        adSetBody.set("promoted_object", JSON.stringify(providerContract.ad_set.promoted_object));
        adSetBody.set("tracking_specs", JSON.stringify(providerContract.ad_set.tracking_specs));
      }
      await options?.assertProviderMutationAllowed?.();
      await armProviderMutation("adset", adSetObjectKey);
      const { response: adSetResponse, data: adSetResponseData } = await fetchMetaJson<Record<string, unknown> | null>(
        buildMetaGraphUrl(`act_${externalAccountId}/adsets`),
        {
          purpose: "launch_create",
          requestId,
          ...withMetaBearerToken(credentials.accessToken, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: adSetBody.toString(),
          }),
        },
      );
      adSetData = adSetResponseData;
      lastKnownIds.adset_id =
        adSetData && typeof adSetData.id === "string" ? adSetData.id : null;
      if (lastKnownIds.adset_id) {
        await options?.recordProviderReceipt?.({
          stage: "adset",
          objectId: lastKnownIds.adset_id,
          responseStatus: adSetResponse.status,
        });
        if (adSetResponse.ok) {
          await settleProviderMutation({
            stage: "adset",
            objectKey: adSetObjectKey,
            outcome: "receipted",
            objectId: lastKnownIds.adset_id,
            responseStatus: adSetResponse.status,
          });
        }
        if (!options?.recordProviderReceipt) {
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
            message: "Captured the Meta ad set receipt before post-response authorization checks.",
          });
        }
      }
      if (!lastKnownIds.adset_id) {
        const providerErrorCode = getExplicitMetaProviderRejectionCode(
          adSetData,
          adSetResponse.status,
        );
        if (providerErrorCode) {
          await settleProviderMutation({
            stage: "adset",
            objectKey: adSetObjectKey,
            outcome: "explicit_provider_rejection",
            objectId: null,
            responseStatus: adSetResponse.status,
            providerErrorCode,
          });
        }
      }
      await options?.assertProviderMutationAllowed?.();

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
        const failureContract = getProviderFailureContract();
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
            code: failureContract.code,
            operatorActionRequired: failureContract.operatorActionRequired,
            requestId,
            adset: adSetData,
          },
          {
            status:
              failureContract.status ??
              (adSetResponse.ok ? 500 : adSetResponse.status),
          },
        );
      }
    }

    if (lastKnownIds.adset_id) {
      await ensureDirectMetaObjectPaused({
        accessToken: credentials.accessToken,
        objectId: lastKnownIds.adset_id,
        requestId,
        assertProviderMutationAllowed: options?.assertProviderMutationAllowed,
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
      link: providerContract.creative.link,
      name: headline,
      call_to_action: {
        type: providerContract.creative.call_to_action_type,
        value:
          destinationContract.adDestination === "meta_instant_form"
            ? { lead_gen_form_id: instantForm!.providerFormId }
            : { link: providerContract.creative.cta_link },
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
        await options.recordProviderReceipt?.({
          stage: "creative",
          objectId: lastKnownIds.creative_id,
          responseStatus: 200,
        });
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
      if (lastKnownIds.creative_id) {
        await options?.recordProviderReceipt?.({
          stage: "creative",
          objectId: lastKnownIds.creative_id,
          responseStatus: 200,
        });
      }
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
      });
      await options?.assertProviderMutationAllowed?.();
      await armProviderMutation("creative", creativeObjectKey);
      const { response: creativeResponse, data: creativeResponseData } = await fetchMetaJson<Record<string, unknown> | null>(
        buildMetaGraphUrl(`act_${externalAccountId}/adcreatives`),
        {
          purpose: "launch_create",
          requestId,
          ...withMetaBearerToken(credentials.accessToken, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: creativeBody.toString(),
          }),
        },
      );
      creativeData = creativeResponseData;
      lastKnownIds.creative_id =
        creativeData && typeof creativeData.id === "string" ? creativeData.id : null;
      if (lastKnownIds.creative_id) {
        await options?.recordProviderReceipt?.({
          stage: "creative",
          objectId: lastKnownIds.creative_id,
          responseStatus: creativeResponse.status,
        });
        if (creativeResponse.ok) {
          await settleProviderMutation({
            stage: "creative",
            objectKey: creativeObjectKey,
            outcome: "receipted",
            objectId: lastKnownIds.creative_id,
            responseStatus: creativeResponse.status,
          });
        }
        if (!options?.recordProviderReceipt) {
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
            message: "Captured the Meta creative receipt before post-response authorization checks.",
          });
        }
      }
      if (!lastKnownIds.creative_id) {
        const providerErrorCode = getExplicitMetaProviderRejectionCode(
          creativeData,
          creativeResponse.status,
        );
        if (providerErrorCode) {
          await settleProviderMutation({
            stage: "creative",
            objectKey: creativeObjectKey,
            outcome: "explicit_provider_rejection",
            objectId: null,
            responseStatus: creativeResponse.status,
            providerErrorCode,
          });
        }
      }
      await options?.assertProviderMutationAllowed?.();

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
        const failureContract = getProviderFailureContract();
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
            code: failureContract.code,
            operatorActionRequired: failureContract.operatorActionRequired,
            requestId,
            creative: creativeData,
          },
          {
            status:
              failureContract.status ??
              (creativeResponse.ok ? 500 : creativeResponse.status),
          },
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
    let adStatusCode = 200;
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
        await options.recordProviderReceipt?.({
          stage: "ad",
          objectId: lastKnownIds.ad_id,
          responseStatus: 200,
        });
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
        expectedParentField: "adset_id",
        expectedParentId: lastKnownIds.adset_id,
        requestId,
      });
      adData = lastKnownIds.ad_id ? { id: lastKnownIds.ad_id, recovered: true } : null;
      if (lastKnownIds.ad_id) {
        await options?.recordProviderReceipt?.({
          stage: "ad",
          objectId: lastKnownIds.ad_id,
          responseStatus: 200,
        });
      }
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
      });
      await options?.assertProviderMutationAllowed?.();
      await armProviderMutation("ad", adObjectKey);
      const { response: adResponse, data: adResponseData } = await fetchMetaJson<Record<string, unknown> | null>(
        buildMetaGraphUrl(`act_${externalAccountId}/ads`),
        {
          purpose: "launch_create",
          requestId,
          ...withMetaBearerToken(credentials.accessToken, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: adBody.toString(),
          }),
        },
      );
      adData = adResponseData;
      lastKnownIds.ad_id =
        adData && typeof adData.id === "string" ? adData.id : null;
      adStatusCode = adResponse.status;
      if (lastKnownIds.ad_id) {
        await options?.recordProviderReceipt?.({
          stage: "ad",
          objectId: lastKnownIds.ad_id,
          responseStatus: adResponse.status,
        });
        if (adResponse.ok) {
          await settleProviderMutation({
            stage: "ad",
            objectKey: adObjectKey,
            outcome: "receipted",
            objectId: lastKnownIds.ad_id,
            responseStatus: adResponse.status,
          });
        }
        if (!options?.recordProviderReceipt) {
          await persistStageState({
            campaignId,
            ids: lastKnownIds,
            stage: "ad",
            overallStatus: "in_progress",
            stepStatus: "created",
            attemptId: activeAttemptId,
            requestedObjectType,
            requestedObjectName,
            requestedObjectKey: adObjectKey,
            workspaceId,
            message: "Captured the Meta ad receipt before post-response authorization checks.",
          });
        }
      }
      if (!lastKnownIds.ad_id) {
        const providerErrorCode = getExplicitMetaProviderRejectionCode(
          adData,
          adResponse.status,
        );
        if (providerErrorCode) {
          await settleProviderMutation({
            stage: "ad",
            objectKey: adObjectKey,
            outcome: "explicit_provider_rejection",
            objectId: null,
            responseStatus: adResponse.status,
            providerErrorCode,
          });
        }
      }
      await options?.assertProviderMutationAllowed?.();
    }

    const adResponseAccepted =
      Boolean(lastKnownIds.ad_id) && adStatusCode >= 200 && adStatusCode < 300;

    if (adResponseAccepted && lastKnownIds.ad_id) {
      await ensureDirectMetaObjectPaused({
        accessToken: credentials.accessToken,
        objectId: lastKnownIds.ad_id,
        requestId,
        assertProviderMutationAllowed: options?.assertProviderMutationAllowed,
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

    const adFailureContract = adResponseAccepted ? null : getProviderFailureContract();
    return NextResponse.json(
      {
        campaign_id: lastKnownIds.campaign_id,
        adset_id: lastKnownIds.adset_id,
        creative_id: lastKnownIds.creative_id,
        ad_id: lastKnownIds.ad_id,
        ad_destination: destinationContract.adDestination,
        provider_form_id: instantForm?.providerFormId ?? null,
        stage: "ad",
        error:
          !adResponseAccepted
            ? buildStageFailureMessage(getMetaErrorMessage(adData, "Ad creation failed."), "ad")
            : undefined,
        code: adFailureContract?.code,
        operatorActionRequired: adFailureContract?.operatorActionRequired ?? false,
        requestId,
        campaign: campaignData,
        adset: adSetData,
        creative: creativeData,
        ad: adData,
      },
      {
        status: adResponseAccepted
          ? 200
          : adFailureContract?.status ?? adStatusCode,
      },
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "scheduled_launch_lease_lost" ||
        error.code === "campaign_launch_lease_lost")
    ) {
      throw error;
    }

    const providerOutcomeAmbiguous = pendingProviderMutation !== null;
    const advertisingClaimRejected = error instanceof AdvertisingClaimUnverifiedError;
    const originalErrorCode =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[a-z0-9_]{3,80}$/.test(error.code)
        ? error.code
        : null;
    const evidencePersistenceError = originalErrorCode && [
      "campaign_launch_provider_receipt_persist_failed",
      "scheduled_launch_provider_receipt_persist_failed",
      "campaign_launch_provider_mutation_settlement_failed",
      "scheduled_launch_provider_mutation_settlement_failed",
    ].includes(originalErrorCode);
    const safeErrorCode = providerOutcomeAmbiguous
      ? evidencePersistenceError
        ? originalErrorCode
        : "meta_provider_create_outcome_ambiguous"
      : error instanceof ApiError
        ? error.code
        : advertisingClaimRejected
          ? error.code
        : "provider_launch_failed";
    const safeErrorMessage = providerOutcomeAmbiguous
      ? `The Meta ${currentStage} create outcome is ambiguous. Automatic recreation is stopped until operator reconciliation.`
      : error instanceof Error
        ? error.message
        : "Campaign create failed.";

    logMetaError({
      context: "launch",
      requestId,
      error,
      message: safeErrorMessage,
      extra: { stage: currentStage, campaignId },
    });
    const clientError = advertisingClaimRejected
      ? safeErrorMessage
      : buildStageFailureMessage(safeErrorMessage, currentStage);
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

    if (ownershipVerified && !advertisingClaimRejected) {
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
          error: safeErrorMessage,
          updated_at: new Date().toISOString(),
        },
        safeErrorMessage,
      ).catch(() => null);
    }

    return NextResponse.json(
      {
        error: clientError,
        code: safeErrorCode,
        requestId,
        operatorActionRequired: providerOutcomeAmbiguous || safeErrorCode === "meta_lookup_ambiguous",
        retryEligible:
          !providerOutcomeAmbiguous && error instanceof ApiError
            ? error.status === 408 || error.status === 429 || error.status >= 500
            : false,
      },
      {
        status: providerOutcomeAmbiguous
          ? 409
          : error instanceof ApiError
            ? error.status
            : advertisingClaimRejected
              ? error.statusCode
              : 500,
      },
    );
  }
}

export async function POST(request: Request) {
  assertSameOriginRequest(request);
  return NextResponse.json(
    {
      error: "This legacy launch route is disabled. Use the campaign launch endpoint so schedule, tenancy, locking, tracking, and durable receipt gates cannot be bypassed.",
      code: "legacy_campaign_create_launch_disabled",
    },
    { status: 404 },
  );
}
