import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { logError, logOperationalEvent, logWarn } from "@/lib/logging";
import type { Database, Json } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignIntent } from "@/lib/campaign-intent";
import type { CampaignPlan } from "@/lib/services/campaign-plan-service";
import { debugLog } from "@/lib/debug";
import type { PersistedAssetGenerationState } from "@/lib/services/asset-generation-lifecycle";
import { persistStaticCreativeAssets } from "@/lib/services/static-creative-asset-service";
import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";
import {
  normalizeLeadCaptureStrategy,
  type LeadCaptureStrategy,
} from "@/lib/services/lead-capture-strategy-service";
import {
  getCampaignLanguageProfile,
  type CampaignLanguage,
} from "@/lib/services/campaign-language";
import {
  buildCampaignPlanCriticalFieldPatch,
  CURRENT_CAMPAIGN_PLAN_VERSION,
  getLaunchStatusFromPlan,
  getLeadLoopVerifiedFromPlan,
  getPublicSlugFromPlan,
  readCampaignPlanDocument,
  toCampaignPlanJson,
} from "@/lib/services/campaign-plan-document";

type CampaignPlanRow = Database["public"]["Tables"]["campaign_plans"]["Row"];
type CampaignPlanClient = SupabaseClient<Database>;

export const CAMPAIGN_PLAN_CRITICAL_FIELD_AUTHORITY = {
  launch_status: "plan_json",
  lead_loop_verified: "plan_json",
  public_slug: "plan_json",
} as const;

export type PersistedCampaignPlanPayload = {
  version: number;
  client_name: string;
  business_name: string;
  language_code: CampaignLanguage;
  campaign_language?: Record<string, unknown>;
  intent: CampaignIntent;
  market: string;
  monthly_budget: number;
  primary_goal: string;
  timeline: string;
  audience: string;
  property_type: string;
  key_offer: string;
  pain_points: string[];
  mechanism: string;
  campaign_category: CampaignCategory;
  trigger_condition: string;
  internal_tension: string;
  proof_style: string;
  cta_style: string;
  visual_logic: string[];
  overlay_style: string[];
  compliance_notes: string[];
  funnel_type: string;
  targeting_summary: string;
  offer_summary: string;
  summary: string;
  funnel_steps: CampaignPlan["funnelSteps"];
  creative_brief: CampaignPlan["creativeBrief"];
  creatives: CampaignPlan["creatives"];
  ads: CampaignPlan["ads"];
  lead_capture_strategy?: LeadCaptureStrategy;
  lead_capture_goal?: LeadCaptureStrategy["lead_capture_goal"];
  capture_method?: LeadCaptureStrategy["capture_method"];
  form_friction_level?: LeadCaptureStrategy["form_friction_level"];
  lead_form_template_id?: string | null;
  meta_lead_form_id?: string | null;
  funnel_id?: string | null;
  privacy_policy_url?: string | null;
  terms_url?: string | null;
  sms_consent_enabled?: boolean;
  lead_delivery_destination?: LeadCaptureStrategy["lead_delivery_destination"];
  special_ad_category?: LeadCaptureStrategy["special_ad_category"];
  lead_capture_status?: LeadCaptureStrategy["lead_capture_status"];
  lead_capture_ready_at?: string | null;
  lead_capture_last_error?: string | null;
  funnel?: CampaignPlan["funnel"];
  runtime: CampaignPlan["runtime"];
};

type GeneratedPreviewFunnel = Pick<CampaignPlan["funnel"], "headline" | "subheadline" | "cta">;

export type NormalizedDbError = {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
};

type PersistPlanParams = {
  campaignId?: string;
  userId: string;
  ownerId: string;
  payload: PersistedCampaignPlanPayload;
  allowLegacySingleCampaignUpdate?: boolean;
};

type MinimalPersistParams = {
  userId: string;
  ownerId?: string;
};

type CampaignPlanCriticalFieldSnapshot = {
  launch_status: string | null;
  lead_loop_verified: boolean;
  public_slug: string | null;
};

export type CampaignPlanConsistencyStatus = {
  fields: CampaignPlanCriticalFieldSnapshot;
  rowMatchesPlan: boolean;
  mismatchedFields: Array<keyof CampaignPlanCriticalFieldSnapshot>;
  missingCriticalFields: string[];
};

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readCriticalFieldsFromRow(row: Partial<CampaignPlanRow> | null | undefined): CampaignPlanCriticalFieldSnapshot {
  return {
    launch_status: normalizeNullableString(row?.launch_status),
    lead_loop_verified: row?.lead_loop_verified === true,
    public_slug: normalizeNullableString(row?.public_slug),
  };
}

function readCriticalFieldsFromPlan(plan: unknown): CampaignPlanCriticalFieldSnapshot {
  return {
    launch_status: getLaunchStatusFromPlan(plan),
    lead_loop_verified: getLeadLoopVerifiedFromPlan(plan),
    public_slug: getPublicSlugFromPlan(plan),
  };
}

function criticalFieldValuesEqual(
  previous: CampaignPlanCriticalFieldSnapshot,
  next: CampaignPlanCriticalFieldSnapshot,
) {
  return (
    previous.launch_status === next.launch_status &&
    previous.lead_loop_verified === next.lead_loop_verified &&
    previous.public_slug === next.public_slug
  );
}

function getMismatchedCriticalFields(
  rowValues: CampaignPlanCriticalFieldSnapshot,
  planValues: CampaignPlanCriticalFieldSnapshot,
) {
  return (["launch_status", "lead_loop_verified", "public_slug"] as const).filter(
    (field) => rowValues[field] !== planValues[field],
  );
}

function requiresPublicSlugForLaunchStatus(status: string | null) {
  const normalized = status?.trim().toLowerCase() ?? "";
  return ["live", "paused", "launched", "launching", "published"].includes(normalized);
}

function getMissingCriticalFields(values: CampaignPlanCriticalFieldSnapshot) {
  const missing: string[] = [];

  if (!values.launch_status) {
    missing.push("launch_status");
  }

  if (requiresPublicSlugForLaunchStatus(values.launch_status) && !values.public_slug) {
    missing.push("public_slug");
  }

  return missing;
}

function logCriticalFieldNulls(params: {
  campaignId: string;
  source: string;
  values: CampaignPlanCriticalFieldSnapshot;
}) {
  const missingFields = getMissingCriticalFields(params.values);

  if (missingFields.length === 0) {
    return;
  }

  logWarn("campaign_plan_critical_field_missing", {
    campaignId: params.campaignId,
    source: params.source,
    missingFields,
    mismatchCount: 0,
    correctionCount: 0,
    values: params.values,
  });
}

function logConsistencyMetric(params: {
  event: "campaign_plan_consistency_mismatch" | "campaign_plan_consistency_correction";
  campaignId: string;
  source: string;
  mismatchedFields: Array<keyof CampaignPlanCriticalFieldSnapshot>;
  correctionCount: number;
}) {
  logOperationalEvent(params.event, {
    campaignId: params.campaignId,
    source: params.source,
    mismatchCount: params.mismatchedFields.length,
    correctionCount: params.correctionCount,
    mismatchedFields: params.mismatchedFields,
  });
}

function logCriticalFieldDrift(params: {
  campaignId: string;
  source: string;
  rowValues: CampaignPlanCriticalFieldSnapshot;
  planValues: CampaignPlanCriticalFieldSnapshot;
}) {
  if (criticalFieldValuesEqual(params.rowValues, params.planValues)) {
    logCriticalFieldNulls({
      campaignId: params.campaignId,
      source: params.source,
      values: params.planValues,
    });
    return;
  }

  const mismatchedFields = getMismatchedCriticalFields(params.rowValues, params.planValues);

  logWarn("campaign_plan_critical_field_drift_detected", {
    campaignId: params.campaignId,
    source: params.source,
    authority: CAMPAIGN_PLAN_CRITICAL_FIELD_AUTHORITY,
    rowValues: params.rowValues,
    planValues: params.planValues,
    mismatchedFields,
    mismatchCount: mismatchedFields.length,
  });

  logConsistencyMetric({
    event: "campaign_plan_consistency_mismatch",
    campaignId: params.campaignId,
    source: params.source,
    mismatchedFields,
    correctionCount: 0,
  });

  logCriticalFieldNulls({
    campaignId: params.campaignId,
    source: params.source,
    values: params.planValues,
  });
}

function logCriticalFieldChanges(params: {
  campaignId: string;
  source: string;
  previousValues: CampaignPlanCriticalFieldSnapshot;
  nextValues: CampaignPlanCriticalFieldSnapshot;
}) {
  for (const field of ["launch_status", "lead_loop_verified", "public_slug"] as const) {
    if (params.previousValues[field] === params.nextValues[field]) {
      continue;
    }

    logOperationalEvent("campaign_plan_critical_field_changed", {
      campaignId: params.campaignId,
      source: params.source,
      field,
      previousValue: params.previousValues[field],
      newValue: params.nextValues[field],
      authority: CAMPAIGN_PLAN_CRITICAL_FIELD_AUTHORITY[field],
    });
  }
}

async function loadCampaignPlanRecordForPersistence(params: {
  supabase: CampaignPlanClient;
  campaignId: string;
  userId?: string | null;
}) {
  let query = params.supabase
    .from("campaign_plans")
    .select("*")
    .eq("id", params.campaignId);

  if (params.userId) {
    query = query.eq("user_id", params.userId);
  }

  const result = (await query.maybeSingle()) as {
    data: CampaignPlanRow | null;
    error: Error | null;
  };

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

export function readCampaignPlanDocumentWithDriftGuard(
  row: Partial<CampaignPlanRow> & { id: string; plan?: unknown },
  source: string,
) {
  let normalizedPlan;

  try {
    normalizedPlan = readCampaignPlanDocument(row.plan);
  } catch (error) {
    logError("campaign_plan_validation_patch_failed", {
      campaignId: row.id,
      source,
      stage: "read",
      error: error instanceof Error ? error.message : "Unknown validation failure",
    });
    throw error;
  }

  logCriticalFieldDrift({
    campaignId: row.id,
    source,
    rowValues: readCriticalFieldsFromRow(row),
    planValues: readCriticalFieldsFromPlan(normalizedPlan),
  });
  return normalizedPlan;
}

export function getCampaignPlanConsistencyStatus(
  row: Partial<CampaignPlanRow> & { plan?: unknown },
): CampaignPlanConsistencyStatus {
  const fields = readCriticalFieldsFromPlan(row.plan);
  const rowFields = readCriticalFieldsFromRow(row);
  const mismatchedFields = getMismatchedCriticalFields(rowFields, fields);

  return {
    fields,
    rowMatchesPlan: mismatchedFields.length === 0,
    mismatchedFields: [...mismatchedFields],
    missingCriticalFields: getMissingCriticalFields(fields),
  };
}

function preserveExistingCriticalFieldsForPlanUpdate(
  normalizedPlan: ReturnType<typeof readCampaignPlanDocument>,
  existingRow: CampaignPlanRow,
) {
  const existing = readCriticalFieldsFromRow(existingRow);

  if (!normalizedPlan.public_slug && existing.public_slug) {
    return readCampaignPlanDocument({
      ...normalizedPlan,
      public_slug: existing.public_slug,
    });
  }

  return normalizedPlan;
}

export async function persistCampaignPlanDocumentUpdate(params: {
  supabase: CampaignPlanClient;
  campaignId: string;
  userId?: string | null;
  plan: unknown;
  source: string;
  existingRow?: CampaignPlanRow | null;
}) {
  // Authoritative contract:
  // - campaign_plans.plan is the source of truth
  // - row-level critical fields are derived projections only
  // - all campaign plan mutations must flow through this helper
  let normalizedPlan;

  try {
    normalizedPlan = readCampaignPlanDocument(params.plan);
  } catch (error) {
    logError("campaign_plan_validation_patch_failed", {
      campaignId: params.campaignId,
      source: params.source,
      stage: "write_normalize",
      error: error instanceof Error ? error.message : "Unknown validation failure",
    });
    throw error;
  }

  const writeClient = createAdminClient() ?? params.supabase;
  const existingRow =
    params.existingRow ??
    (await loadCampaignPlanRecordForPersistence({
      supabase: writeClient,
      campaignId: params.campaignId,
      userId: params.userId ?? null,
    }));

  if (!existingRow) {
    throw new Error("Campaign plan row could not be found for persistence.");
  }

  normalizedPlan = preserveExistingCriticalFieldsForPlanUpdate(normalizedPlan, existingRow);

  let patch;

  try {
    patch = buildCampaignPlanCriticalFieldPatch(normalizedPlan);
  } catch (error) {
    logError("campaign_plan_validation_patch_failed", {
      campaignId: params.campaignId,
      source: params.source,
      stage: "write_patch",
      error: error instanceof Error ? error.message : "Unknown critical field patch failure",
    });
    throw error;
  }

  const previousValues = readCriticalFieldsFromRow(existingRow);
  const nextValues = readCriticalFieldsFromPlan(normalizedPlan);

  logCriticalFieldDrift({
    campaignId: params.campaignId,
    source: `${params.source}:before_save`,
    rowValues: previousValues,
    planValues: readCriticalFieldsFromPlan(existingRow.plan),
  });

  logCriticalFieldChanges({
    campaignId: params.campaignId,
    source: params.source,
    previousValues,
    nextValues,
  });

  const correctedFields = getMismatchedCriticalFields(previousValues, nextValues);
  if (correctedFields.length > 0) {
    logConsistencyMetric({
      event: "campaign_plan_consistency_correction",
      campaignId: params.campaignId,
      source: params.source,
      mismatchedFields: correctedFields,
      correctionCount: correctedFields.length,
    });
  }

  let query = writeClient
    .from("campaign_plans")
    .update(patch as never)
    .eq("id", params.campaignId);

  if (params.userId) {
    query = query.eq("user_id", params.userId);
  }

  const result = (await query.select("*").maybeSingle()) as {
    data: CampaignPlanRow | null;
    error: Error | null;
  };

  if (result.error) {
    throw result.error;
  }

  if (result.data) {
    return result.data as CampaignPlanRow;
  }

  const recoveredRow = await loadCampaignPlanRecordForPersistence({
    supabase: writeClient,
    campaignId: params.campaignId,
    userId: params.userId ?? null,
  });

  if (!recoveredRow) {
    throw new Error("Campaign plan update succeeded but no row could be recovered.");
  }

  return recoveredRow as CampaignPlanRow;
}

function isLegacySingleCampaignConstraintError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code ?? "") : "";
  const message = "message" in error ? String(error.message ?? "") : "";

  return (
    code === "23505" &&
    /campaign_plans_user_id_unique|campaign_plans.*user_id.*unique|duplicate key value/i.test(
      message,
    )
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === "object") {
    const message =
      "message" in error && typeof error.message === "string" ? error.message.trim() : "";
    const code = "code" in error && typeof error.code === "string" ? error.code.trim() : "";
    const details =
      "details" in error && typeof error.details === "string" ? error.details.trim() : "";
    const combined = [message, code, details].filter(Boolean).join(" | ");

    if (combined) {
      return combined;
    }
  }

  return "Unknown error";
}

function mapPlanRow(
  row: CampaignPlanRow,
  payload: PersistedCampaignPlanPayload,
): CampaignPlan {
  const ads = Array.isArray(payload.ads) ? payload.ads : [];
  const funnel = normalizePersistedFunnel({
    funnel: payload.funnel,
    funnelType: payload.funnel_type,
    ads,
    keyOffer: payload.key_offer,
    summary: payload.summary,
  });

  return {
    id: row.id,
    organizationId: row.owner_id ?? row.user_id,
    clientName: payload.client_name,
    businessName: payload.business_name,
    languageCode: payload.language_code,
    campaignLanguage: getCampaignLanguageProfile(payload.language_code),
    intent: payload.intent,
    market: payload.market,
    monthlyBudget: payload.monthly_budget,
    primaryGoal: payload.primary_goal,
    timeline: payload.timeline,
    audience: payload.audience,
    propertyType: payload.property_type,
    keyOffer: payload.key_offer,
    painPoints: payload.pain_points,
    mechanism: payload.mechanism,
    creativeStrategy: {
      campaignCategory: payload.campaign_category,
      triggerCondition: payload.trigger_condition,
      internalTension: payload.internal_tension,
      mechanism: payload.mechanism,
      proofStyle: payload.proof_style,
      ctaStyle: payload.cta_style,
      visualLogic: Array.isArray(payload.visual_logic) ? payload.visual_logic : [],
      overlayStyle: Array.isArray(payload.overlay_style) ? payload.overlay_style : [],
      complianceNotes: Array.isArray(payload.compliance_notes) ? payload.compliance_notes : [],
    },
    funnelType: payload.funnel_type,
    targetingSummary: payload.targeting_summary,
    offerSummary: payload.offer_summary,
    summary: payload.summary,
    funnelSteps: payload.funnel_steps,
    creativeBrief: payload.creative_brief,
    creatives: payload.creatives,
    ads,
    funnel:
      funnel && typeof funnel === "object"
        ? funnel
        : {
            funnelType: payload.funnel_type,
            headline: ads[0]?.headline ?? payload.offer_summary ?? payload.key_offer,
            subheadline: payload.summary,
            cta: ads[0]?.cta ?? "Book My Strategy Call",
            sections: [],
            formFields: ["name", "email", "phone"],
            followUpAction: "Send the next-step response and qualify interest.",
            optimizationNotes: [],
          },
    runtime: payload.runtime,
    createdAt: row.created_at,
  };
}

function buildCampaignPlanRecordBase(params: PersistPlanParams | MinimalPersistParams) {
  return {
    owner_id: params.ownerId ?? params.userId,
    organization_id: params.ownerId ?? params.userId,
    user_id: params.userId,
  };
}

function normalizePersistedFunnel(params: {
  funnel?: CampaignPlan["funnel"] | GeneratedPreviewFunnel;
  funnelType: string;
  ads: CampaignPlan["ads"];
  keyOffer: string;
  summary: string;
}): CampaignPlan["funnel"] | undefined {
  const { funnel, funnelType, ads, keyOffer, summary } = params;

  if (!funnel || typeof funnel !== "object") {
    return undefined;
  }

  if (
    "sections" in funnel &&
    Array.isArray(funnel.sections) &&
    "formFields" in funnel &&
    Array.isArray(funnel.formFields) &&
    "followUpAction" in funnel &&
    typeof funnel.followUpAction === "string" &&
    "optimizationNotes" in funnel &&
    Array.isArray(funnel.optimizationNotes)
  ) {
    return {
      ...funnel,
      funnelType: funnel.funnelType || funnelType,
    };
  }

  return {
    funnelType,
    headline: funnel.headline?.trim() || ads[0]?.headline || keyOffer,
    subheadline: funnel.subheadline?.trim() || summary,
    cta: funnel.cta?.trim() || ads[0]?.cta || "Book My Strategy Call",
    sections: [],
    formFields: ["name", "email", "phone"],
    followUpAction: "Send the next-step response and qualify interest.",
    optimizationNotes: [],
  };
}

function buildModernCampaignPlanRecord(params: PersistPlanParams) {
  const normalizedPlan = readCampaignPlanDocument(params.payload);

  return {
    ...buildCampaignPlanRecordBase(params),
    ...buildCampaignPlanCriticalFieldPatch(normalizedPlan),
  };
}

async function persistCampaignPlanRow(params: PersistPlanParams) {
  const supabase = createAdminClient() ?? (await createClient());

  if (!supabase) {
    throw new Error("Supabase client could not be created.");
  }
  const client = supabase;

  const record = buildModernCampaignPlanRecord(params) as never;
  async function findLatestCampaignPlanRow() {
    const existingResult = (await client
      .from("campaign_plans")
      .select("*")
      .eq("user_id", params.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()) as {
        data: CampaignPlanRow | null;
        error: Error | null;
      };

    if (existingResult.error) {
      throw existingResult.error;
    }

    if (!existingResult.data) {
      throw new Error("Campaign plan write succeeded but no row could be recovered.");
    }

    return existingResult.data as CampaignPlanRow;
  }

  async function findCampaignPlanRowById(campaignId: string) {
    const existingResult = (await client
      .from("campaign_plans")
      .select("*")
      .eq("id", campaignId)
      .eq("user_id", params.userId)
      .eq("organization_id", params.ownerId)
      .maybeSingle()) as {
        data: CampaignPlanRow | null;
        error: Error | null;
      };

    if (existingResult.error) {
      throw existingResult.error;
    }

    if (!existingResult.data) {
      throw new Error("Campaign plan write succeeded but no row could be recovered.");
    }

    return existingResult.data as CampaignPlanRow;
  }

  async function updateExistingCampaignPlan(existingCampaignId: string) {
    const updateResult = (await client
      .from("campaign_plans")
      .update(record)
      .eq("id", existingCampaignId)
      .eq("user_id", params.userId)
      .eq("organization_id", params.ownerId)
      .select("*")
      .maybeSingle()) as {
      data: CampaignPlanRow | null;
      error: Error | null;
    };

    if (updateResult.error) {
      throw updateResult.error;
    }

    if (!updateResult.data) {
      return findCampaignPlanRowById(existingCampaignId);
    }

    return updateResult.data as CampaignPlanRow;
  }

  if (params.campaignId) {
    return updateExistingCampaignPlan(params.campaignId);
  }

  const insertResult = (await client
    .from("campaign_plans")
    .insert(record)
    .select("*")
    .maybeSingle()) as {
    data: CampaignPlanRow | null;
    error: Error | null;
  };

  if (!insertResult.error && insertResult.data) {
    return insertResult.data as CampaignPlanRow;
  }

  if (!insertResult.error && !insertResult.data) {
    const latestRow = await findLatestCampaignPlanRow();
    if (latestRow.id === params.campaignId || params.allowLegacySingleCampaignUpdate) {
      return updateExistingCampaignPlan(latestRow.id);
    }

    throw new Error("Campaign plan insert returned no row; refusing to update an existing campaign implicitly.");
  }

  if (!isLegacySingleCampaignConstraintError(insertResult.error)) {
    throw insertResult.error ?? new Error("DB write returned null");
  }

  if (!params.allowLegacySingleCampaignUpdate) {
    throw new Error("Fresh campaign creation is blocked by a legacy single-campaign database constraint.");
  }

  const existingResult = (await client
    .from("campaign_plans")
    .select("id")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()) as {
      data: Pick<CampaignPlanRow, "id"> | null;
      error: Error | null;
    };

  if (existingResult.error) {
    throw existingResult.error;
  }

  if (!existingResult.data?.id) {
    throw insertResult.error ?? new Error("Campaign plan could not be recovered.");
  }

  return updateExistingCampaignPlan(existingResult.data.id);
}

export function buildPersistedCampaignPlanPayload(params: {
  generatedPlan: {
    clientName: string;
    businessName: string;
    languageCode?: CampaignLanguage | string | null;
    intent: CampaignIntent;
    market: string;
    monthlyBudget: number;
    primaryGoal: string;
    timeline: string;
    audience: string;
    propertyType: string;
    keyOffer: string;
    painPoints: string[];
    mechanism: string;
    creativeStrategy: CampaignPlan["creativeStrategy"];
    funnelType: string;
    targetingSummary: string;
    offerSummary: string;
    summary: string;
    funnelSteps: CampaignPlan["funnelSteps"];
    creativeBrief: CampaignPlan["creativeBrief"];
    creatives: CampaignPlan["creatives"];
    ads: CampaignPlan["ads"];
    leadCaptureStrategy?: CampaignPlan["leadCaptureStrategy"] | Partial<LeadCaptureStrategy> | null;
    funnel?: CampaignPlan["funnel"] | GeneratedPreviewFunnel;
    runtime?: CampaignPlan["runtime"];
    assetGeneration?: PersistedAssetGenerationState;
  };
  runtime: CampaignPlan["runtime"];
}): PersistedCampaignPlanPayload {
  const { generatedPlan, runtime } = params;
  const languageProfile = getCampaignLanguageProfile(generatedPlan.languageCode);
  const leadCaptureStrategy = generatedPlan.leadCaptureStrategy
    ? normalizeLeadCaptureStrategy(generatedPlan.leadCaptureStrategy, {
        intent: generatedPlan.intent,
      })
    : null;

  return {
    version: CURRENT_CAMPAIGN_PLAN_VERSION,
    client_name: generatedPlan.clientName,
    business_name: generatedPlan.businessName,
    language_code: languageProfile.code,
    campaign_language: languageProfile,
    intent: generatedPlan.intent,
    market: generatedPlan.market,
    monthly_budget: generatedPlan.monthlyBudget,
    primary_goal: generatedPlan.primaryGoal,
    timeline: generatedPlan.timeline,
    audience: generatedPlan.audience,
    property_type: generatedPlan.propertyType,
    key_offer: generatedPlan.keyOffer,
    pain_points: generatedPlan.painPoints,
    mechanism: generatedPlan.mechanism,
    campaign_category: generatedPlan.creativeStrategy.campaignCategory,
    trigger_condition: generatedPlan.creativeStrategy.triggerCondition,
    internal_tension: generatedPlan.creativeStrategy.internalTension,
    proof_style: generatedPlan.creativeStrategy.proofStyle,
    cta_style: generatedPlan.creativeStrategy.ctaStyle,
    visual_logic: generatedPlan.creativeStrategy.visualLogic,
    overlay_style: generatedPlan.creativeStrategy.overlayStyle,
    compliance_notes: generatedPlan.creativeStrategy.complianceNotes,
    funnel_type: generatedPlan.funnelType,
    targeting_summary: generatedPlan.targetingSummary,
    offer_summary: generatedPlan.offerSummary,
    summary: generatedPlan.summary,
    funnel_steps: generatedPlan.funnelSteps,
    creative_brief: generatedPlan.creativeBrief,
    creatives: generatedPlan.creatives,
    ads: generatedPlan.ads,
    ...(leadCaptureStrategy
      ? {
          lead_capture_strategy: leadCaptureStrategy,
          lead_capture_goal: leadCaptureStrategy.lead_capture_goal,
          capture_method: leadCaptureStrategy.capture_method,
          form_friction_level: leadCaptureStrategy.form_friction_level,
          lead_form_template_id: leadCaptureStrategy.lead_form_template_id,
          meta_lead_form_id: leadCaptureStrategy.meta_lead_form_id,
          funnel_id: leadCaptureStrategy.funnel_id,
          privacy_policy_url: leadCaptureStrategy.privacy_policy_url,
          terms_url: leadCaptureStrategy.terms_url,
          sms_consent_enabled: leadCaptureStrategy.sms_consent_enabled,
          lead_delivery_destination: leadCaptureStrategy.lead_delivery_destination,
          special_ad_category: leadCaptureStrategy.special_ad_category,
          lead_capture_status: leadCaptureStrategy.lead_capture_status,
          lead_capture_ready_at: leadCaptureStrategy.lead_capture_ready_at,
          lead_capture_last_error: leadCaptureStrategy.lead_capture_last_error,
        }
      : {}),
    ...(generatedPlan.assetGeneration
      ? { assetGeneration: generatedPlan.assetGeneration }
      : {}),
    funnel: normalizePersistedFunnel({
      funnel: generatedPlan.funnel,
      funnelType: generatedPlan.funnelType,
      ads: generatedPlan.ads,
      keyOffer: generatedPlan.keyOffer,
      summary: generatedPlan.summary,
    }),
    runtime,
  };
}

export function normalizeDbError(error: unknown): NormalizedDbError {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      message:
        typeof record.message === "string"
          ? record.message
          : "Unknown database error.",
      code: typeof record.code === "string" ? record.code : null,
      details: typeof record.details === "string" ? record.details : null,
      hint: typeof record.hint === "string" ? record.hint : null,
    };
  }

  return {
    message: error instanceof Error ? error.message : "Unknown database error.",
    code: null,
    details: null,
    hint: null,
  };
}

export async function insertMinimalCampaignPlan(params: MinimalPersistParams) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase client could not be created.");
  }

  const minimalPlan = readCampaignPlanDocument({ test: true });

  const result = (await supabase
    .from("campaign_plans")
    .insert(
      {
        ...buildCampaignPlanRecordBase(params),
        ...buildCampaignPlanCriticalFieldPatch(minimalPlan),
      } as never,
    )
    .select("*")
    .maybeSingle()) as {
    data: CampaignPlanRow | null;
    error: Error | null;
  };

  if (result.error) {
    throw result.error;
  }

  if (result.data) {
    return result.data as CampaignPlanRow | null;
  }

  const fallbackResult = (await supabase
    .from("campaign_plans")
    .select("*")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()) as {
    data: CampaignPlanRow | null;
    error: Error | null;
  };

  if (fallbackResult.error) {
    throw fallbackResult.error;
  }

  return fallbackResult.data as CampaignPlanRow | null;
}

export async function insertCampaignPlan(params: PersistPlanParams) {
  const row = await persistCampaignPlanRow(params);
  const supabase = await createClient();

  if (supabase) {
    try {
      await persistStaticCreativeAssets({
        supabase,
        userId: params.userId,
        campaignId: row.id,
        staticAds: params.payload.creatives.staticAds,
      });
    } catch (error) {
      debugLog("campaign-plan-static-assets-failed", {
        message: getErrorMessage(error),
      });
    }
  }

  return mapPlanRow(row, params.payload);
}
