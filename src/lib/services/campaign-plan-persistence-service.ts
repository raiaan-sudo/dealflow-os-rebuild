import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import type { CampaignIntent } from "@/lib/campaign-intent";
import type { CampaignPlan } from "@/lib/services/campaign-plan-service";
import { debugLog } from "@/lib/debug";
import type { PersistedAssetGenerationState } from "@/lib/services/asset-generation-lifecycle";
import { persistStaticCreativeAssets } from "@/lib/services/static-creative-asset-service";
import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";

type CampaignPlanRow = Database["public"]["Tables"]["campaign_plans"]["Row"];

export type PersistedCampaignPlanPayload = {
  client_name: string;
  business_name: string;
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
};

type MinimalPersistParams = {
  userId: string;
  ownerId?: string;
};

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
  return {
    ...buildCampaignPlanRecordBase(params),
    plan: params.payload as unknown as Json,
  };
}

async function persistCampaignPlanRow(params: PersistPlanParams) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase client could not be created.");
  }
  const client = supabase;

  const record = buildModernCampaignPlanRecord(params) as never;
  async function updateExistingCampaignPlan(existingCampaignId: string) {
    const updateResult = (await client
      .from("campaign_plans")
      .update(record)
      .eq("id", existingCampaignId)
      .eq("user_id", params.userId)
      .select("*")
      .single()) as {
      data: CampaignPlanRow | null;
      error: Error | null;
    };

    if (updateResult.error) {
      throw updateResult.error;
    }

    if (!updateResult.data) {
      throw new Error("DB write returned null");
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
    .single()) as {
    data: CampaignPlanRow | null;
    error: Error | null;
  };

  if (!insertResult.error && insertResult.data) {
    return insertResult.data as CampaignPlanRow;
  }

  if (!isLegacySingleCampaignConstraintError(insertResult.error)) {
    throw insertResult.error ?? new Error("DB write returned null");
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
    funnel?: CampaignPlan["funnel"] | GeneratedPreviewFunnel;
    runtime?: CampaignPlan["runtime"];
    assetGeneration?: PersistedAssetGenerationState;
  };
  runtime: CampaignPlan["runtime"];
}): PersistedCampaignPlanPayload {
  const { generatedPlan, runtime } = params;

  return {
    client_name: generatedPlan.clientName,
    business_name: generatedPlan.businessName,
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

  const result = (await supabase
    .from("campaign_plans")
    .insert(
      {
        ...buildCampaignPlanRecordBase(params),
        plan: { test: true } as unknown as Json,
      } as never,
    )
    .select("*")
    .single()) as {
    data: CampaignPlanRow | null;
    error: Error | null;
  };

  if (result.error) {
    throw result.error;
  }

  return result.data as CampaignPlanRow | null;
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
