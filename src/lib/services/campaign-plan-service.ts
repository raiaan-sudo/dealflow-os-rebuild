import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { formatCurrency } from "@/lib/formatters";
import {
  inferCampaignIntent,
  isBuyerLikeCampaignIntent,
  isCommercialCampaignIntent,
  isInvestorCampaignIntent,
  isSellerCampaignIntent,
  type CampaignIntent,
} from "@/lib/campaign-intent";
export type { CampaignIntent } from "@/lib/campaign-intent";
import {
  buildCreativeMessages,
  buildMarketingContext,
  buildMediaBuyingCopy,
  ensureCopyContext,
} from "@/lib/copy/marketing-transform";
import {
  fillPattern,
  selectAdHooks,
  selectFunnelFramework,
  selectOfferStructure,
  selectTargetingStrategy,
} from "@/lib/knowledge/real-estate";
import { getAppContext } from "@/lib/services/app-context";
import {
  buildCreativeBrief,
  type CreativeBrief,
} from "@/lib/ai/creative-brief";
import {
  generateCreativePackage,
  type StaticCreativeAsset,
  type VideoCreativeAsset,
} from "@/lib/services/creative-engine";
import {
  getCreativeIntelligenceProfile,
  type CreativeAngle,
  type CreativeIntelligenceProfile,
} from "@/lib/services/creative-intelligence-service";
import { getTargetingIntelligenceProfile, type TargetingIntelligenceProfile } from "@/lib/services/targeting-intelligence-service";
import type { Database } from "@/lib/supabase/types";
import {
  buildPersistedCampaignPlanPayload,
  insertCampaignPlan,
  type PersistedCampaignPlanPayload,
} from "@/lib/services/campaign-plan-persistence-service";
import { canonicalCampaignToPlan } from "@/lib/services/canonical-campaign";
import { getLatestCampaignRecord } from "@/lib/services/campaign-persistence";
import { debugLog } from "@/lib/debug";
import {
  normalizeCreativeStrategy,
  type CampaignCreativeStrategy,
} from "@/lib/services/campaign-creative-strategy";
export type { CampaignCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import { getCategoryRulePack } from "@/lib/services/campaign-category-rule-packs";
import { buildMarketingOptimizationBlueprint } from "@/lib/optimization-engine";
import {
  normalizeLeadCaptureStrategy,
  type LeadCaptureStrategy,
} from "@/lib/services/lead-capture-strategy-service";
import {
  getCampaignLanguageProfile,
  localizeCampaignText,
  localizeCampaignTextList,
  normalizeCampaignLanguage,
  type CampaignLanguage,
} from "@/lib/services/campaign-language";

type CampaignPlanRow = Database["public"]["Tables"]["campaign_plans"]["Row"];

export type OnboardingInput = {
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
  leadCaptureStrategy?: Partial<LeadCaptureStrategy> | null;
};

export type CampaignAd = {
  variant: string;
  angle?: CreativeAngle;
  sourcePatternId?: string | null;
  overlayText: string;
  headline: string;
  body: string;
  cta: string;
  image: string;
};

export type CampaignCreatives = {
  staticAds: StaticCreativeAsset[];
  videoAds: VideoCreativeAsset[];
};

function hasCachedCreatives(creatives?: CampaignCreatives | null) {
  return Boolean(
    creatives &&
      Array.isArray(creatives.staticAds) &&
      creatives.staticAds.length > 0 &&
      Array.isArray(creatives.videoAds) &&
      creatives.videoAds.length > 0,
  );
}

export type CampaignLifecycleStatus =
  | "draft"
  | "built"
  | "paywall"
  | "preview"
  | "connected"
  | "launch_ready"
  | "launching"
  | "live"
  | "active"
  | "learning"
  | "optimizing";

export type UserFacingCampaignStatus = "built" | "ready" | "connected" | "live";
export type CampaignExperienceStage =
  | "draft"
  | "built"
  | "paywall"
  | "preview"
  | "launch_ready"
  | "launching"
  | "live";

export type QueuedCampaignClone = {
  id: string;
  name: string;
  status: "draft" | "queued";
  reason: string;
  focus: string;
  createdAt: string;
  clonedFromCampaignId: string;
};

export type CampaignRuntime = {
  status: CampaignLifecycleStatus;
  safetyState: "ready" | "blocked" | "live" | "paused" | "failed";
  launchMode: "test" | "live";
  lastAction: string | null;
  statusUpdatedAt: string | null;
  launchedAt: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  budgetDaily: string | null;
  budgetDailyInput: number | null;
  lastOptimizationAction: string | null;
  lastOptimizationAt: string | null;
  metaPushStatus: "not_pushed" | "publishing" | "published" | "partial" | "failed";
  metaAdSetIds: string[];
  metaAdIds: string[];
  pausedAdIds: string[];
  queuedCampaignClones: QueuedCampaignClone[];
  metaLastMessage: string | null;
};

export type CampaignPlan = {
  id: string;
  organizationId: string;
  clientName: string;
  businessName: string;
  languageCode: CampaignLanguage;
  campaignLanguage: ReturnType<typeof getCampaignLanguageProfile>;
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
  creativeStrategy: CampaignCreativeStrategy;
  funnelType: string;
  targetingSummary: string;
  offerSummary: string;
  summary: string;
  funnelSteps: string[];
  creativeBrief: CreativeBrief;
  creatives: CampaignCreatives;
  ads: CampaignAd[];
  leadCaptureStrategy?: LeadCaptureStrategy;
  funnel: {
    funnelType: string;
    headline: string;
    subheadline: string;
    cta: string;
    sections: {
      id: string;
      type:
        | "hero"
        | "trust_bar"
        | "benefits"
        | "proof_metrics"
        | "social_proof"
        | "market_snapshot"
        | "objections"
        | "process"
        | "faq"
        | "vsl"
        | "image"
        | "form"
        | "closing_cta";
      variant: string;
      title: string;
      content: string[];
      visible: boolean;
      style: {
        spacing: "compact" | "comfortable" | "spacious";
        width: "full" | "content" | "narrow";
        align: "left" | "center";
        theme: "light" | "dark" | "accent";
      };
      media?: {
        kind: "video" | "image";
        assetId?: string;
        url?: string;
        thumbnailAssetId?: string;
        thumbnailUrl?: string;
        label?: string;
        caption?: string;
      } | null;
    }[];
    formFields: string[];
    followUpAction: string;
    optimizationNotes: string[];
  };
  runtime: CampaignRuntime;
  createdAt: string;
};

function buildPlanFunnel(params: {
  funnelType: string;
  headline?: string | null;
  subheadline?: string | null;
  cta?: string | null;
  sections?: CampaignPlan["funnel"]["sections"];
  formFields?: string[];
  followUpAction?: string | null;
  optimizationNotes?: string[];
  ads?: CampaignAd[];
  keyOffer?: string;
  market?: string;
  summary?: string;
  languageCode?: CampaignLanguage | string | null;
}) {
  const languageCode = normalizeCampaignLanguage(params.languageCode);
  const ads = Array.isArray(params.ads) ? params.ads : [];
  const sections = Array.isArray(params.sections)
    ? params.sections.map((section, index) => ({
        id: typeof section?.id === "string" && section.id ? section.id : `${section?.type ?? "section"}-${index + 1}`,
        type: section?.type ?? "benefits",
        variant: typeof section?.variant === "string" && section.variant ? section.variant : "default",
        title: section?.title?.trim() || "Section",
        content: Array.isArray(section?.content) ? section.content.filter(Boolean) : [],
        visible: typeof section?.visible === "boolean" ? section.visible : true,
        style: {
          spacing: section?.style?.spacing ?? "comfortable",
          width: section?.style?.width ?? "full",
          align: section?.style?.align ?? "left",
          theme: section?.style?.theme ?? "light",
        },
        media: section?.media ?? null,
      }))
    : [];
  return {
    funnelType: params.funnelType || "landing_page_survey",
    headline: localizeCampaignText(params.headline?.trim() || ads[0]?.headline?.trim() || params.keyOffer?.trim() || `Explore ${params.market ?? "your market"} opportunities`, languageCode),
    subheadline:
      localizeCampaignText(
        params.subheadline?.trim() ||
          params.summary?.trim() ||
          ads[0]?.body?.trim() ||
          "See the core campaign promise and first-step experience.",
        languageCode,
      ),
    cta: localizeCampaignText(params.cta?.trim() || ads[0]?.cta?.trim() || "Book My Strategy Call", languageCode),
    sections,
    formFields: localizeCampaignTextList(Array.isArray(params.formFields) && params.formFields.length > 0 ? params.formFields : ["name", "email", "phone"], languageCode),
    followUpAction: localizeCampaignText(params.followUpAction?.trim() || "Send the next-step response and qualify interest.", languageCode),
    optimizationNotes: localizeCampaignTextList(Array.isArray(params.optimizationNotes) ? params.optimizationNotes : [], languageCode),
  };
}

export type MockLead = {
  id: string;
  name: string;
  stage: string;
  source: string;
  intent: CampaignIntent;
};

export type ExpectedOutcomes = {
  leadsPerMonth: string;
  costPerLeadRange: string;
  conversionExpectation: string;
};

type PersistedPlanPayload = PersistedCampaignPlanPayload;

function getDefaultCampaignRuntime(dailyBudgetInput?: number | null): CampaignRuntime {
  const normalizedDailyBudget =
    typeof dailyBudgetInput === "number" && Number.isFinite(dailyBudgetInput) && dailyBudgetInput > 0
      ? Number(dailyBudgetInput.toFixed(2))
      : null;

  return {
    status: "built",
    safetyState: "ready",
    launchMode: "test",
    lastAction: "Campaign created and ready for review.",
    statusUpdatedAt: new Date().toISOString(),
    launchedAt: null,
    campaignId: null,
    adSetId: null,
    adId: null,
    budgetDaily: normalizedDailyBudget !== null ? `${formatCurrency(normalizedDailyBudget)}/day` : null,
    budgetDailyInput: normalizedDailyBudget,
    lastOptimizationAction: null,
    lastOptimizationAt: null,
    metaPushStatus: "not_pushed",
    metaAdSetIds: [],
    metaAdIds: [],
    pausedAdIds: [],
    queuedCampaignClones: [],
    metaLastMessage: null,
  };
}

export function getUserFacingCampaignStatus(params: {
  runtime: CampaignRuntime;
  isMetaConnected: boolean;
  hasReviewed?: boolean;
}): UserFacingCampaignStatus {
  if (params.runtime.metaPushStatus === "published") {
    return "live";
  }

  if (params.isMetaConnected) {
    return "connected";
  }

  return params.hasReviewed === false ? "built" : "ready";
}

export function getCampaignExperienceStage(params: {
  plan: CampaignPlan | null;
  isMetaConnected: boolean;
}): CampaignExperienceStage {
  if (!params.plan) {
    return "draft";
  }

  if (params.plan.runtime.status === "built") {
    return "built";
  }

  if (params.plan.runtime.status === "paywall") {
    return "paywall";
  }

  if (params.plan.runtime.status === "preview") {
    return "preview";
  }

  if (
    params.plan.runtime.status === "launch_ready" ||
    params.plan.runtime.status === "connected"
  ) {
    return "launch_ready";
  }

  if (
    params.plan.runtime.status === "live" ||
    params.plan.runtime.metaPushStatus === "published"
  ) {
    return "live";
  }

  if (params.plan.runtime.status === "launching") {
    return "launching";
  }

  if (params.isMetaConnected) {
    return "launch_ready";
  }

  return "built";
}

function normalizeCampaignRuntime(value: unknown): CampaignRuntime {
  const runtime =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const defaultRuntime = getDefaultCampaignRuntime();

  return {
    status:
      runtime.status === "built" ||
      runtime.status === "paywall" ||
      runtime.status === "preview" ||
      runtime.status === "connected" ||
      runtime.status === "launch_ready" ||
      runtime.status === "launching" ||
      runtime.status === "live" ||
      runtime.status === "active" ||
      runtime.status === "learning" ||
      runtime.status === "optimizing"
        ? runtime.status
        : defaultRuntime.status,
    safetyState:
      runtime.safetyState === "blocked" ||
      runtime.safetyState === "live" ||
      runtime.safetyState === "paused" ||
      runtime.safetyState === "failed"
        ? runtime.safetyState
        : "ready",
    launchMode: runtime.launchMode === "live" ? "live" : "test",
    lastAction:
      typeof runtime.lastAction === "string"
        ? runtime.lastAction
        : defaultRuntime.lastAction,
    statusUpdatedAt:
      typeof runtime.statusUpdatedAt === "string"
        ? runtime.statusUpdatedAt
        : defaultRuntime.statusUpdatedAt,
    launchedAt: typeof runtime.launchedAt === "string" ? runtime.launchedAt : null,
    campaignId:
      typeof runtime.campaignId === "string" ? runtime.campaignId : null,
    adSetId: typeof runtime.adSetId === "string" ? runtime.adSetId : null,
    adId: typeof runtime.adId === "string" ? runtime.adId : null,
    budgetDaily:
      typeof runtime.budgetDaily === "string" ? runtime.budgetDaily : null,
    budgetDailyInput:
      typeof runtime.budgetDailyInput === "number"
        ? runtime.budgetDailyInput
        : null,
    lastOptimizationAction:
      typeof runtime.lastOptimizationAction === "string"
        ? runtime.lastOptimizationAction
        : null,
    lastOptimizationAt:
      typeof runtime.lastOptimizationAt === "string"
        ? runtime.lastOptimizationAt
        : null,
    metaPushStatus:
      runtime.metaPushStatus === "publishing" ||
      runtime.metaPushStatus === "published" ||
      runtime.metaPushStatus === "partial" ||
      runtime.metaPushStatus === "failed"
        ? runtime.metaPushStatus
        : "not_pushed",
    metaAdSetIds: Array.isArray(runtime.metaAdSetIds)
      ? runtime.metaAdSetIds.map(String)
      : [],
    metaAdIds: Array.isArray(runtime.metaAdIds) ? runtime.metaAdIds.map(String) : [],
    pausedAdIds: Array.isArray(runtime.pausedAdIds) ? runtime.pausedAdIds.map(String) : [],
    queuedCampaignClones: Array.isArray(runtime.queuedCampaignClones)
      ? runtime.queuedCampaignClones
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object",
          )
          .map((item) => ({
            id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
            name:
              typeof item.name === "string" && item.name.trim().length > 0
                ? item.name
                : "Queued campaign clone",
            status: item.status === "queued" ? "queued" : "draft",
            reason:
              typeof item.reason === "string"
                ? item.reason
                : "Prepared from the current winning pattern.",
            focus:
              typeof item.focus === "string" && item.focus.trim().length > 0
                ? item.focus
                : "Creative follow-up test",
            createdAt:
              typeof item.createdAt === "string"
                ? item.createdAt
                : new Date().toISOString(),
            clonedFromCampaignId:
              typeof item.clonedFromCampaignId === "string"
                ? item.clonedFromCampaignId
                : "",
          }))
      : [],
    metaLastMessage:
      typeof runtime.metaLastMessage === "string" ? runtime.metaLastMessage : null,
  };
}

function buildPlanPayloadFromPlan(plan: CampaignPlan): PersistedPlanPayload {
  return buildPersistedCampaignPlanPayload({
    generatedPlan: {
      clientName: plan.clientName,
      businessName: plan.businessName,
      languageCode: plan.languageCode,
      intent: plan.intent,
      market: plan.market,
      monthlyBudget: plan.monthlyBudget,
      primaryGoal: plan.primaryGoal,
      timeline: plan.timeline,
      audience: plan.audience,
      propertyType: plan.propertyType,
      keyOffer: plan.keyOffer,
      painPoints: plan.painPoints,
      mechanism: plan.mechanism,
      creativeStrategy: plan.creativeStrategy,
      funnelType: plan.funnelType,
      targetingSummary: plan.targetingSummary,
      offerSummary: plan.offerSummary,
      summary: plan.summary,
      funnelSteps: plan.funnelSteps,
      creativeBrief: plan.creativeBrief,
      creatives: plan.creatives,
      ads: withAdImageFallback(plan.ads),
      funnel: plan.funnel,
    },
    runtime: plan.runtime,
  });
}

function buildPlanFromGenerated(
  generated: Awaited<ReturnType<typeof generateCampaignPlan>>,
  organizationId: string,
): CampaignPlan {
  const optimizationBlueprint = buildMarketingOptimizationBlueprint({
    audience: generated.creativeStrategy.campaignCategory,
    location: generated.market,
    budget: Number((generated.monthlyBudget / 30).toFixed(2)),
    offer: generated.keyOffer,
  });

  return {
    id: `local-${organizationId}`,
    organizationId,
    clientName: generated.clientName,
    businessName: generated.businessName,
    languageCode: normalizeCampaignLanguage(generated.languageCode),
    campaignLanguage: getCampaignLanguageProfile(generated.languageCode),
    intent: generated.intent,
    market: generated.market,
    monthlyBudget: generated.monthlyBudget,
    primaryGoal: generated.primaryGoal,
    timeline: generated.timeline,
    audience: generated.audience,
    propertyType: generated.propertyType,
    keyOffer: generated.keyOffer,
    painPoints: generated.painPoints,
    mechanism: generated.mechanism,
    creativeStrategy: generated.creativeStrategy,
    funnelType: generated.funnelType,
    targetingSummary: generated.targetingSummary,
    offerSummary: generated.offerSummary,
    summary: generated.summary,
    funnelSteps: generated.funnelSteps,
    creativeBrief: generated.creativeBrief,
    creatives: generated.creatives,
    ads: withAdImageFallback(generated.ads),
    leadCaptureStrategy: normalizeLeadCaptureStrategy(generated.leadCaptureStrategy, {
      intent: generated.intent,
    }),
    funnel: generated.funnel
      ? buildPlanFunnel({
          funnelType: generated.funnelType,
          headline: generated.funnel.headline,
          subheadline: generated.funnel.subheadline,
          cta: generated.funnel.cta,
          formFields: optimizationBlueprint.funnelConfig.structure.formFields,
          followUpAction: optimizationBlueprint.funnelConfig.followUpAction,
          optimizationNotes: optimizationBlueprint.optimizationNotes,
          ads: generated.ads,
          keyOffer: generated.keyOffer,
          market: generated.market,
          summary: generated.summary,
          languageCode: generated.languageCode,
        })
      : buildPlanFunnel({
          funnelType: generated.funnelType,
          formFields: optimizationBlueprint.funnelConfig.structure.formFields,
          followUpAction: optimizationBlueprint.funnelConfig.followUpAction,
          optimizationNotes: optimizationBlueprint.optimizationNotes,
          ads: generated.ads,
          keyOffer: generated.keyOffer,
          market: generated.market,
          summary: generated.summary,
          languageCode: generated.languageCode,
        }),
    runtime: getDefaultCampaignRuntime(),
    createdAt: new Date().toISOString(),
  };
}

function mapPayloadToPlan(
  row: { id: string; owner_id: string; created_at: string },
  payload: PersistedPlanPayload,
): CampaignPlan {
  return {
    id: row.id,
    organizationId: row.owner_id,
    clientName: payload.client_name,
    businessName: payload.business_name,
    languageCode: normalizeCampaignLanguage(payload.language_code),
    campaignLanguage: getCampaignLanguageProfile(payload.language_code),
    intent: payload.intent,
    market: payload.market,
    monthlyBudget: payload.monthly_budget,
    primaryGoal: payload.primary_goal,
    timeline: payload.timeline,
    audience: payload.audience,
    propertyType: payload.property_type,
    keyOffer: payload.key_offer,
    painPoints: Array.isArray(payload.pain_points) ? payload.pain_points.map(String) : [],
    mechanism: payload.mechanism,
    creativeStrategy: normalizeCreativeStrategy(
      {
        campaignCategory: payload.campaign_category,
        triggerCondition: payload.trigger_condition,
        internalTension: payload.internal_tension,
        mechanism: payload.mechanism,
        proofStyle: payload.proof_style,
        ctaStyle: payload.cta_style,
        visualLogic: payload.visual_logic,
        overlayStyle: payload.overlay_style,
        complianceNotes: payload.compliance_notes,
      },
      {
        intent: payload.intent,
        audience: payload.audience,
        propertyType: payload.property_type,
        keyOffer: payload.key_offer,
        mechanism: payload.mechanism,
        primaryGoal: payload.primary_goal,
        painPoints: Array.isArray(payload.pain_points) ? payload.pain_points.map(String) : [],
      },
    ),
    funnelType: payload.funnel_type,
    targetingSummary: payload.targeting_summary,
    offerSummary: payload.offer_summary,
    summary: payload.summary,
    funnelSteps: Array.isArray(payload.funnel_steps) ? payload.funnel_steps.map(String) : [],
    creativeBrief:
      payload.creative_brief && typeof payload.creative_brief === "object"
        ? (payload.creative_brief as CreativeBrief)
        : buildCreativeBrief({
            location: payload.market,
            audience: payload.audience,
            property_type: payload.property_type,
            offer: payload.key_offer,
            mechanism: payload.mechanism,
            pain_points: payload.pain_points,
            desired_result: payload.primary_goal,
            market_type: payload.intent,
            language_code: payload.language_code,
          }),
    creatives:
      payload.creatives && typeof payload.creatives === "object"
        ? {
            staticAds: Array.isArray((payload.creatives as Record<string, unknown>).staticAds)
              ? ((payload.creatives as Record<string, unknown>).staticAds as StaticCreativeAsset[])
              : Array.isArray((payload.creatives as Record<string, unknown>).static)
                ? ((payload.creatives as Record<string, unknown>).static as StaticCreativeAsset[])
              : [],
            videoAds: Array.isArray((payload.creatives as Record<string, unknown>).videoAds)
              ? ((payload.creatives as Record<string, unknown>).videoAds as VideoCreativeAsset[])
              : Array.isArray((payload.creatives as Record<string, unknown>).video)
                ? ((payload.creatives as Record<string, unknown>).video as VideoCreativeAsset[])
              : [],
          }
        : { staticAds: [], videoAds: [] },
    ads: Array.isArray(payload.ads)
      ? withAdImageFallback(
          payload.ads.map((item) => ({
            variant: String((item as Record<string, unknown>).variant ?? "Primary angle"),
            angle: typeof (item as Record<string, unknown>).angle === "string"
              ? ((item as Record<string, unknown>).angle as CreativeAngle)
              : undefined,
            sourcePatternId:
              typeof (item as Record<string, unknown>).sourcePatternId === "string"
                ? String((item as Record<string, unknown>).sourcePatternId)
                : null,
            overlayText: String((item as Record<string, unknown>).overlayText ?? (item as Record<string, unknown>).headline ?? ""),
            headline: String((item as Record<string, unknown>).headline ?? ""),
            body: String((item as Record<string, unknown>).body ?? ""),
            cta: String((item as Record<string, unknown>).cta ?? ""),
            image: String((item as Record<string, unknown>).image ?? ""),
          })),
        )
      : [],
    leadCaptureStrategy: normalizeLeadCaptureStrategy(
      payload.lead_capture_strategy && typeof payload.lead_capture_strategy === "object"
        ? (payload.lead_capture_strategy as Partial<LeadCaptureStrategy>)
        : {
            lead_capture_goal: payload.lead_capture_goal,
            capture_method: payload.capture_method,
            form_friction_level: payload.form_friction_level,
            lead_form_template_id: payload.lead_form_template_id,
            meta_lead_form_id: payload.meta_lead_form_id,
            funnel_id: payload.funnel_id,
            privacy_policy_url: payload.privacy_policy_url,
            terms_url: payload.terms_url,
            sms_consent_enabled: payload.sms_consent_enabled,
            lead_delivery_destination: payload.lead_delivery_destination,
            special_ad_category: payload.special_ad_category,
            lead_capture_status: payload.lead_capture_status,
            lead_capture_ready_at: payload.lead_capture_ready_at,
            lead_capture_last_error: payload.lead_capture_last_error,
          },
      {
        intent: payload.intent,
      },
    ),
    funnel: payload.funnel && typeof payload.funnel === "object"
      ? payload.funnel
      : buildPlanFunnel({
      funnelType: payload.funnel_type,
      ads: Array.isArray(payload.ads)
        ? payload.ads.map((item) => ({
            variant: String((item as Record<string, unknown>).variant ?? "Primary angle"),
            angle: typeof (item as Record<string, unknown>).angle === "string"
              ? ((item as Record<string, unknown>).angle as CreativeAngle)
              : undefined,
            sourcePatternId:
              typeof (item as Record<string, unknown>).sourcePatternId === "string"
                ? String((item as Record<string, unknown>).sourcePatternId)
                : null,
            overlayText: String((item as Record<string, unknown>).overlayText ?? (item as Record<string, unknown>).headline ?? ""),
            headline: String((item as Record<string, unknown>).headline ?? ""),
            body: String((item as Record<string, unknown>).body ?? ""),
            cta: String((item as Record<string, unknown>).cta ?? ""),
            image: String((item as Record<string, unknown>).image ?? ""),
          }))
        : [],
      keyOffer: payload.key_offer,
      market: payload.market,
      summary: payload.summary,
      languageCode: payload.language_code,
    }),
    runtime: normalizeCampaignRuntime(payload.runtime),
    createdAt: row.created_at,
  };
}

function getLegacyPayload(row: Record<string, unknown>): PersistedPlanPayload | null {
  if (typeof row.client_name !== "string" || typeof row.business_name !== "string") {
    return null;
  }

  const legacyPainPoints = Array.isArray(row.pain_points) ? row.pain_points.map(String) : [];
  const legacyIntent = inferCampaignIntent({
    intent: row.intent,
    offer: row.key_offer,
    audience: row.audience,
    primaryGoal: row.primary_goal,
    mechanism: row.mechanism,
  });

  return {
    version: 1,
    client_name: String(row.client_name),
    business_name: String(row.business_name),
    language_code: "en",
    campaign_language: getCampaignLanguageProfile("en"),
    intent: legacyIntent,
    market: String(row.market ?? ""),
    monthly_budget: Number(row.monthly_budget ?? 0),
    primary_goal: String(row.primary_goal ?? ""),
    timeline: String(row.timeline ?? ""),
    audience: String(row.audience ?? "home buyers"),
    property_type: String(row.property_type ?? "homes"),
    key_offer: String(row.key_offer ?? ""),
    pain_points: legacyPainPoints,
    mechanism: String(row.mechanism ?? ""),
    campaign_category: normalizeCreativeStrategy(undefined, {
      intent: legacyIntent,
      audience: String(row.audience ?? "home buyers"),
      propertyType: String(row.property_type ?? "homes"),
      keyOffer: String(row.key_offer ?? ""),
      mechanism: String(row.mechanism ?? ""),
      primaryGoal: String(row.primary_goal ?? ""),
      painPoints: legacyPainPoints,
    }).campaignCategory,
    trigger_condition: String(row.primary_goal ?? ""),
    internal_tension: String(legacyPainPoints[0] ?? ""),
    proof_style: "",
    cta_style: "low_friction",
    visual_logic: [],
    overlay_style: [],
    compliance_notes: [],
    funnel_type: String(row.funnel_type ?? ""),
    targeting_summary: String(row.targeting_summary ?? ""),
    offer_summary: String(row.offer_summary ?? ""),
    summary: String(row.summary ?? ""),
    funnel_steps: Array.isArray(row.funnel_steps) ? row.funnel_steps.map(String) : [],
    creative_brief: buildCreativeBrief({
      location: String(row.market ?? ""),
      audience: String(row.audience ?? "home buyers"),
      property_type: String(row.property_type ?? "homes"),
      offer: String(row.key_offer ?? ""),
      mechanism: String(row.mechanism ?? ""),
      pain_points: Array.isArray(row.pain_points) ? row.pain_points.map(String) : [],
      desired_result: String(row.primary_goal ?? ""),
      market_type: inferCampaignIntent({
        intent: row.intent,
        offer: row.key_offer,
        audience: row.audience,
        primaryGoal: row.primary_goal,
        mechanism: row.mechanism,
      }),
      language_code: "en",
    }),
    creatives: { staticAds: [], videoAds: [] },
    ads: Array.isArray(row.ads)
      ? withAdImageFallback(
          row.ads.map((item) => ({
            variant: String((item as Record<string, unknown>).variant ?? "Primary angle"),
            angle: typeof (item as Record<string, unknown>).angle === "string"
              ? ((item as Record<string, unknown>).angle as CreativeAngle)
              : undefined,
            sourcePatternId:
              typeof (item as Record<string, unknown>).sourcePatternId === "string"
                ? String((item as Record<string, unknown>).sourcePatternId)
                : null,
            overlayText: String((item as Record<string, unknown>).overlayText ?? (item as Record<string, unknown>).headline ?? ""),
            headline: String((item as Record<string, unknown>).headline ?? ""),
            body: String((item as Record<string, unknown>).body ?? ""),
            cta: String((item as Record<string, unknown>).cta ?? ""),
            image: String(
              (item as Record<string, unknown>).image ??
                (item as Record<string, unknown>).image_url ??
                "",
            ),
          })),
        )
      : [],
    runtime: getDefaultCampaignRuntime(),
  };
}

async function resolvePlanOwner() {
  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    return {
      supabase: null,
      organizationId: null,
      userId: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      organizationId: null,
      userId: null,
    };
  }

  try {
    const context = await getAppContext();

    const organizationId = context?.organization.id ?? user.id;
    const resolvedUserId = context?.user.id ?? user.id;
    debugLog("campaign-plan-owner", {
      organizationId,
      userId: resolvedUserId,
      fallbackToUser: !context?.organization?.id,
    });

    return {
      supabase,
      organizationId,
      userId: resolvedUserId,
    };
  } catch {
    debugLog("campaign-plan-owner", {
      organizationId: null,
      userId: user.id,
      fallbackToUser: true,
    });
    return {
      supabase,
      organizationId: null,
      userId: user.id,
    };
  }
}

function getSelectedCreativePatterns(profile: CreativeIntelligenceProfile | null) {
  if (!profile) {
    return [];
  }

  return profile.patterns.slice(0, 5);
}

function cleanSentence(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim().replace(/[.!?]+$/g, "");

  if (!normalized) {
    return "";
  }

  return `${normalized}.`;
}

function canReuseCampaignAssets(input: OnboardingInput, plan: CampaignPlan | null) {
  if (!plan) {
    return false;
  }

  if (normalizeCampaignLanguage(plan.languageCode) !== normalizeCampaignLanguage(input.languageCode)) {
    return false;
  }

  return (
    plan.intent === input.intent &&
    plan.market.trim().toLowerCase() === input.market.trim().toLowerCase() &&
    plan.audience.trim().toLowerCase() === input.audience.trim().toLowerCase() &&
    plan.propertyType.trim().toLowerCase() === input.propertyType.trim().toLowerCase() &&
    plan.keyOffer.trim().toLowerCase() === input.keyOffer.trim().toLowerCase() &&
    plan.mechanism.trim().toLowerCase() === input.mechanism.trim().toLowerCase()
  );
}

export async function generateCampaignPlan(
  input: OnboardingInput,
  intelligenceProfile: CreativeIntelligenceProfile | null = null,
  targetingProfile: TargetingIntelligenceProfile | null = null,
  cachedAssets?: {
    creativeBrief?: CreativeBrief | null;
    creatives?: CampaignCreatives | null;
  },
  options?: {
    deferAssetGeneration?: boolean;
  },
) {
  const languageCode = normalizeCampaignLanguage(input.languageCode);
  const context = buildMarketingContext(input);
  const isBuyer = isBuyerLikeCampaignIntent(context.intent);
  const isInvestor = isInvestorCampaignIntent(context.intent);
  const audience = context.audience;
  const propertyType = context.propertyType;
  const keyOffer = context.keyOffer;
  const mechanism = context.mechanism;
  const painPoints = context.painPoints;
  const audienceLabel = audience;
  const propertyLabel = propertyType;
  const offerLabel = keyOffer;
  const mechanismLabel = mechanism;
  const painLine = painPoints.join(", ");
  const creativeStrategy = normalizeCreativeStrategy(
    {
      mechanism: mechanismLabel,
      triggerCondition: input.primaryGoal,
      internalTension: painPoints[0] ?? "",
    },
    {
      intent: context.intent,
      audience: audienceLabel,
      propertyType: propertyLabel,
      keyOffer: offerLabel,
      mechanism: mechanismLabel,
      primaryGoal: input.primaryGoal,
      painPoints,
    },
  );
  const categoryRulePack = getCategoryRulePack(creativeStrategy.campaignCategory);
  const optimizationBlueprint = buildMarketingOptimizationBlueprint({
    audience: creativeStrategy.campaignCategory,
    location: context.market,
    budget: Number((input.monthlyBudget / 30).toFixed(2)),
    offer: offerLabel,
  });
  const marketContext = `${context.market} ${propertyLabel}`.trim();
  const knowledgeSource = {
    intent: context.intent,
    audience: audienceLabel,
    propertyType: propertyLabel,
    keyOffer: offerLabel,
    market: context.market,
    mechanism: mechanismLabel,
  };
  const knowledgeContext = {
    audience: audienceLabel,
    propertyType: propertyLabel,
    keyOffer: offerLabel,
    market: context.market,
    mechanism: mechanismLabel,
  };
  const funnelFramework = selectFunnelFramework(knowledgeSource);
  const targetingStrategy = selectTargetingStrategy(knowledgeSource);
  const offerStructure = selectOfferStructure(knowledgeSource);
  const hookLibrary = selectAdHooks(knowledgeSource);
  const selectedPatterns = getSelectedCreativePatterns(intelligenceProfile);
  const commonAngles = intelligenceProfile?.commonAngles ?? [];
  const provenAudience = targetingProfile?.recommendedAudience ?? intelligenceProfile?.topAudiences?.[0] ?? null;
  const provenLocation = targetingProfile?.recommendedLocation ?? intelligenceProfile?.topLocations?.[0] ?? null;
  const topTargetingPattern =
    targetingProfile?.recommendedTargetingPattern ?? intelligenceProfile?.topTargetingPatterns?.[0] ?? null;
  const leadAngle =
    commonAngles[0] ??
    selectedPatterns[0]?.angle ??
    categoryRulePack.winningAngles[0] ??
    hookLibrary[0]?.adAngle ??
    "approval";
  const leadHook =
    selectedPatterns[0]?.hook ??
    fillPattern(
      categoryRulePack.approvedHookStructures[0] ??
        hookLibrary[0]?.pattern ??
        "{audience} need {keyOffer}.",
      knowledgeContext,
    );
  const funnelType = `${funnelFramework.name} ${optimizationBlueprint.funnelConfig.type.replace("_", " ")}`;
  const targetingSummary = [
    fillPattern(targetingStrategy.summaryPattern, knowledgeContext),
    provenAudience ? `The strongest audience segment so far is ${provenAudience}.` : null,
    provenLocation ? `The best-performing location so far is ${provenLocation}.` : null,
    topTargetingPattern ? `The strongest imported targeting pattern so far is ${topTargetingPattern}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const offerSummary = fillPattern(offerStructure.summaryPattern, knowledgeContext);
  const primaryPain = painPoints[0] ?? null;
  const leadCopy = buildMediaBuyingCopy(
    context,
    selectedPatterns[0]?.hook ?? "",
    creativeStrategy,
  );
  const funnelHeadline = leadCopy.headline;
  const funnelSubheadline = leadCopy.subheadline;
  const funnelCta = leadCopy.cta;
  const funnelSteps = [
    ...funnelFramework.bodySteps.map((step) => fillPattern(step, knowledgeContext)),
    `Lead with a ${leadAngle} promise using "${leadHook}" so the page and ads stay consistent for ${audienceLabel}.`,
  ];
  const creativePatterns = (
    selectedPatterns.length > 0
      ? selectedPatterns
      : categoryRulePack.approvedHookStructures.slice(0, 4).map((pattern, index) => ({
          id: `${creativeStrategy.campaignCategory}-rule-${index + 1}`,
          hook: fillPattern(pattern, knowledgeContext),
          angle: (hookLibrary[index]?.adAngle ?? "opportunity") as CreativeAngle,
          audience: audienceLabel,
          offer: offerLabel,
          notes: `${categoryRulePack.winningAngles[index] ?? categoryRulePack.winningAngles[0] ?? "media-buying"} pattern from category rules.`,
        }))
  ).slice(0, 4);
  const creativePackage =
    options?.deferAssetGeneration
      ? {
          brief:
            cachedAssets?.creativeBrief ??
            buildCreativeBrief({
              location: context.market,
              audience: audienceLabel,
              property_type: propertyLabel,
              offer: offerLabel,
              mechanism: mechanismLabel,
              desired_result: input.primaryGoal,
              pain_points: painPoints,
              market_type: context.intent,
              language_code: languageCode,
            }),
          staticAds: [] as StaticCreativeAsset[],
          videoAds: [] as VideoCreativeAsset[],
        }
      :
    hasCachedCreatives(cachedAssets?.creatives)
      ? {
          brief:
            cachedAssets?.creativeBrief ??
            buildCreativeBrief({
              location: context.market,
              audience: audienceLabel,
              property_type: propertyLabel,
              offer: offerLabel,
              mechanism: mechanismLabel,
              desired_result: input.primaryGoal,
              pain_points: painPoints,
              market_type: context.intent,
              language_code: languageCode,
            }),
          staticAds: cachedAssets?.creatives?.staticAds ?? [],
          videoAds: cachedAssets?.creatives?.videoAds ?? [],
        }
      : await generateCreativePackage({
          location: context.market,
          audience: audienceLabel,
          property_type: propertyLabel,
          offer: offerLabel,
          mechanism: mechanismLabel,
          desired_result: input.primaryGoal,
          pain_points: painPoints,
          market_type: context.intent,
          language_code: languageCode,
          creative_strategy: creativeStrategy,
        });
  const ads: CampaignAd[] = creativePatterns.map((pattern, index) => {
    const staticAsset = creativePackage.staticAds[index] ?? creativePackage.staticAds[0] ?? null;
    const angle = pattern.angle;
    const variant = pattern.notes ? `${capitalize(angle)} angle` : "Primary angle";
    const creativeMessages = staticAsset
      ? {
          hook: staticAsset.overlayText,
          headline: staticAsset.headline,
          body: staticAsset.primaryText,
        }
      : buildCreativeMessages(context, pattern.hook, angle);

    return {
      variant: staticAsset ? toVariantLabel(staticAsset.angle) : variant,
      angle,
      sourcePatternId: "id" in pattern ? pattern.id : null,
      overlayText:
        index === 0
          ? keyOffer
          : creativeMessages.hook,
      headline:
        index === 0
          ? keyOffer
          : creativeMessages.headline,
      body:
        index === 0
          ? cleanSentence(`${keyOffer}. ${mechanismLabel} is built for ${audienceLabel} in ${context.market}${primaryPain ? ` who are dealing with ${primaryPain.replace(/\?$/, "").toLowerCase()}` : ""}.`)
          : creativeMessages.body,
      cta: funnelCta,
      image: staticAsset?.imageUrl || "",
    };
  });

  const normalizedAds = withAdImageFallback(ads).map((ad) => ({
    ...ad,
    overlayText: localizeCampaignText(ad.overlayText, languageCode),
    headline: localizeCampaignText(ad.headline, languageCode),
    body: localizeCampaignText(ad.body, languageCode),
    cta: localizeCampaignText(ad.cta, languageCode),
  }));

  return {
    ...input,
    languageCode,
    campaignLanguage: getCampaignLanguageProfile(languageCode),
    audience: audienceLabel,
    propertyType: propertyLabel,
    keyOffer: offerLabel,
    painPoints,
    mechanism: mechanismLabel,
    funnelType,
    targetingSummary: localizeCampaignText(ensureCopyContext(targetingSummary, {
      audience: audienceLabel,
      propertyType: propertyLabel,
      keyOffer: offerLabel,
      market: context.market,
    }), languageCode),
    offerSummary: localizeCampaignText(ensureCopyContext(offerSummary, {
      audience: audienceLabel,
      propertyType: propertyLabel,
      keyOffer: offerLabel,
      market: context.market,
    }), languageCode),
    summary: isBuyer
      ? localizeCampaignText(ensureCopyContext(`Built from the ${funnelFramework.name} framework for ${audienceLabel} looking for ${marketContext}. The message opens on a situation-based pattern interrupt, names the internal problem, positions ${mechanismLabel} as the mechanism, and uses proof to reduce uncertainty before the next step. Creative direction is anchored in ${leadAngle} hooks that already show up across high-performing patterns.`, {
          audience: audienceLabel,
          propertyType: propertyLabel,
          keyOffer: offerLabel,
          market: context.market,
        }), languageCode)
      : localizeCampaignText(ensureCopyContext(`Built from the ${funnelFramework.name} framework for ${audienceLabel} in ${context.market}. The message opens on a situation-based pattern interrupt, names the internal problem, positions ${mechanismLabel} as the mechanism, and uses proof to reduce uncertainty before the next step. Creative direction is anchored in ${leadAngle} hooks that are already recurring in high-performing seller patterns.`, {
          audience: audienceLabel,
          propertyType: propertyLabel,
          keyOffer: offerLabel,
          market: context.market,
        }), languageCode),
    creativeStrategy: {
      ...creativeStrategy,
      mechanism:
        creativeStrategy.mechanism ||
        categoryRulePack.approvedMechanismStyles[0] ||
        mechanismLabel,
      proofStyle:
        creativeStrategy.proofStyle || categoryRulePack.proofStyles[0] || "",
      visualLogic:
        creativeStrategy.visualLogic.length > 0
          ? creativeStrategy.visualLogic
          : [...categoryRulePack.visualLogic],
      overlayStyle:
        creativeStrategy.overlayStyle.length > 0
          ? creativeStrategy.overlayStyle
          : [...categoryRulePack.overlayLogic],
    },
    funnelSteps: funnelSteps.map((step) =>
      localizeCampaignText(ensureCopyContext(step, {
        audience: audienceLabel,
        propertyType: propertyLabel,
        keyOffer: offerLabel,
        market: context.market,
      }), languageCode),
    ),
    creativeBrief: creativePackage.brief,
    creatives: {
      staticAds: creativePackage.staticAds,
      videoAds: creativePackage.videoAds,
    },
    ads: normalizedAds,
    funnel: {
      headline: localizeCampaignText(funnelHeadline, languageCode),
      subheadline: cleanSentence(localizeCampaignText(funnelSubheadline, languageCode)),
      cta: localizeCampaignText(funnelCta, languageCode),
      formFields: localizeCampaignTextList(optimizationBlueprint.funnelConfig.structure.formFields, languageCode),
      followUpAction: localizeCampaignText(optimizationBlueprint.funnelConfig.followUpAction, languageCode),
      optimizationNotes: localizeCampaignTextList(optimizationBlueprint.optimizationNotes, languageCode),
    },
  };
}

export async function createFallbackCampaignPlan(
  input: OnboardingInput,
  organizationId = "local-preview",
) {
  return buildPlanFromGenerated(await generateCampaignPlan(input), organizationId);
}

export async function saveGeneratedCampaignPlan(params: {
  userId: string;
  ownerId: string;
  generatedPlan: Awaited<ReturnType<typeof generateCampaignPlan>>;
}) {
  const requestedDailyBudget = Number((params.generatedPlan.monthlyBudget / 30).toFixed(2));

  return insertCampaignPlan({
    userId: params.userId,
    ownerId: params.ownerId,
    payload: buildPersistedCampaignPlanPayload({
      generatedPlan: params.generatedPlan,
      runtime: getDefaultCampaignRuntime(requestedDailyBudget),
    }),
  });
}

function mapRow(row: CampaignPlanRow | null): CampaignPlan | null {
  if (!row) {
    return null;
  }

  const rowRecord = row as unknown as Record<string, unknown>;
  const payload =
    row.plan && typeof row.plan === "object"
      ? (row.plan as PersistedPlanPayload)
      : getLegacyPayload(rowRecord);

  if (!payload) {
    return null;
  }

  return mapPayloadToPlan(
    {
      id: row.id,
      owner_id: row.owner_id ?? String(rowRecord.organization_id ?? ""),
      created_at: row.created_at,
    },
    payload,
  );
}

export async function getLatestCampaignPlan() {
  const record = await getLatestCampaignRecord().catch(() => null);
  return record ? canonicalCampaignToPlan(record) : null;
}

export async function saveCampaignPlan(input: OnboardingInput) {
  const { supabase, organizationId, userId } = await resolvePlanOwner();

  if (!organizationId || !userId || !supabase) {
    throw new Error("Authentication is required before saving a campaign plan.");
  }

  const [intelligenceProfile, targetingProfile] = await Promise.all([
    getCreativeIntelligenceProfile(input).catch(() => null),
    getTargetingIntelligenceProfile().catch(() => null),
  ]);
  const existingPlan = await getLatestCampaignPlan().catch(() => null);
  const reusableAssets = canReuseCampaignAssets(input, existingPlan) && existingPlan
    ? {
        creativeBrief: existingPlan.creativeBrief,
        creatives: existingPlan.creatives,
      }
    : undefined;
  const generated = await generateCampaignPlan(
    input,
    intelligenceProfile,
    targetingProfile,
    reusableAssets,
    {
      deferAssetGeneration: true,
    },
  );
  return saveGeneratedCampaignPlan({
    userId,
    ownerId: organizationId,
    generatedPlan: generated,
  });
}

export async function persistCampaignPlan(plan: CampaignPlan) {
  const { supabase, organizationId, userId } = await resolvePlanOwner();

  if (!organizationId || !userId) {
    throw new Error("Authentication is required before updating a campaign plan.");
  }

  const normalizedPlan: CampaignPlan = {
    ...plan,
    organizationId,
    languageCode: normalizeCampaignLanguage(plan.languageCode),
    campaignLanguage: getCampaignLanguageProfile(plan.languageCode),
    ads: withAdImageFallback(plan.ads),
    funnel: buildPlanFunnel({
      funnelType: plan.funnel?.funnelType ?? plan.funnelType,
      headline: plan.funnel?.headline,
      subheadline: plan.funnel?.subheadline,
      cta: plan.funnel?.cta,
      sections: plan.funnel?.sections,
      formFields: plan.funnel?.formFields,
      followUpAction: plan.funnel?.followUpAction,
      optimizationNotes: plan.funnel?.optimizationNotes,
      ads: plan.ads,
      keyOffer: plan.keyOffer,
      market: plan.market,
      summary: plan.summary,
      languageCode: plan.languageCode,
    }),
    runtime: normalizeCampaignRuntime(plan.runtime),
    leadCaptureStrategy: normalizeLeadCaptureStrategy(plan.leadCaptureStrategy, {
      intent: plan.intent,
      funnelId: plan.leadCaptureStrategy?.funnel_id ?? plan.id,
    }),
  };

  if (!supabase) {
    throw new Error("Campaign plan database client could not be created.");
  }

  return insertCampaignPlan({
    campaignId: normalizedPlan.id || undefined,
    userId,
    ownerId: organizationId,
    payload: buildPlanPayloadFromPlan(normalizedPlan),
  });
}

export function getMockLeads(plan: CampaignPlan): MockLead[] {
  const source = isSellerCampaignIntent(plan.intent)
    ? "Seller lead ads"
    : isCommercialCampaignIntent(plan.intent)
      ? "Commercial lead ads"
    : isInvestorCampaignIntent(plan.intent)
      ? "Investor lead ads"
      : "Buyer lead ads";
  const stages = isSellerCampaignIntent(plan.intent)
    ? ["Valuation request", "Listing call booked", "Pricing review", "Prep checklist", "Active follow-up"]
    : isCommercialCampaignIntent(plan.intent)
      ? ["Space inquiry", "Requirements confirmed", "Shortlist review", "Tour pending", "Active follow-up"]
    : isInvestorCampaignIntent(plan.intent)
      ? ["Deal inquiry", "Criteria confirmed", "Underwriting review", "Tour pending", "Active follow-up"]
      : ["New inquiry", "Consult booked", "Financing review", "Tour pending", "Active follow-up"];

  return stages.map((stage, index) => ({
    id: `${plan.id}-${index + 1}`,
    name: `${capitalize(plan.audience)} lead ${index + 1}`,
    stage,
    source,
    intent: plan.intent,
  }));
}

function capitalize(value: string) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function withAdImageFallback(ads: CampaignAd[]): CampaignAd[] {
  return ads.map((ad) => ({
    ...ad,
    variant: ad.variant || "Primary angle",
    angle: ad.angle,
    sourcePatternId: ad.sourcePatternId ?? null,
    overlayText: ad.overlayText || ad.headline,
    image: ad.image || "",
  }));
}

function toVariantLabel(angle: StaticCreativeAsset["angle"]) {
  if (angle === "guarantee" || angle === "opportunity") {
    return "Offer angle";
  }

  if (angle === "contrarian") {
    return "Pain angle";
  }

  if (angle === "authority") {
    return "Authority angle";
  }

  return "Urgency angle";
}

export function getStrategyWhy(plan: CampaignPlan) {
  if (isCommercialCampaignIntent(plan.intent)) {
    return [
      `The funnel is built to turn commercial real estate interest in ${plan.market} into qualified space-fit conversations.`,
      "The targeting stays centered on operators, tenants, and owner-users so the campaign filters for business requirements instead of broad property curiosity.",
      "The offer works because it promises a clearer shortlist and faster fit check before the agent spends time on mismatched opportunities.",
    ];
  }

  if (isInvestorCampaignIntent(plan.intent)) {
    return [
      `The funnel is built to surface investor-grade opportunities in ${plan.market} before the wider market competes them away.`,
      "The targeting stays centered on acquisition-minded investors and deal-focused audiences, which keeps the message tied to cash flow, speed, and opportunity quality.",
      "The offer works because it promises clearer deal flow and faster filtering, which is what investor audiences care about first.",
    ];
  }

  if (isBuyerLikeCampaignIntent(plan.intent)) {
    return [
      `The funnel is built to capture active buyers in ${plan.market} and move them into a consultation before interest cools off.`,
      "The targeting stays focused on in-market shoppers and relocation audiences, which keeps the message tied to current purchase intent instead of broad awareness.",
      "The offer is low-friction and practical, so it gives serious buyers a clear reason to raise their hand without forcing a hard commitment too early.",
    ];
  }

  return [
    `The funnel is built to convert homeowner curiosity in ${plan.market} into booked valuation conversations while timing is still favorable.`,
    "The targeting focuses on likely movers, downsizers, and equity-driven sellers, which keeps the campaign centered on people with a real listing decision ahead of them.",
    "The offer works because it promises immediate clarity on price, timing, and listing strategy, which is usually the fastest path to a seller conversation.",
  ];
}

export function getExpectedOutcomes(plan: CampaignPlan): ExpectedOutcomes {
  const spendFactor = Math.max(1, Math.round(plan.monthlyBudget / 1500));

  if (isCommercialCampaignIntent(plan.intent)) {
    const baseLeads = 7 + spendFactor * 2;
    const lowCpl = 110 + spendFactor * 5;
    const highCpl = lowCpl + 34;
    const lowConversion = 8 + spendFactor;
    const highConversion = lowConversion + 3;

    return {
      leadsPerMonth: `${baseLeads}-${baseLeads + 4}`,
      costPerLeadRange: `${formatCurrency(lowCpl)}-${formatCurrency(highCpl)}`,
      conversionExpectation: `${lowConversion}-${highConversion}% of leads progressing into qualified commercial consultations`,
    };
  }

  if (isInvestorCampaignIntent(plan.intent)) {
    const baseLeads = 10 + spendFactor * 3;
    const lowCpl = 85 + spendFactor * 4;
    const highCpl = lowCpl + 26;
    const lowConversion = 9 + spendFactor;
    const highConversion = lowConversion + 3;

    return {
      leadsPerMonth: `${baseLeads}-${baseLeads + 5}`,
      costPerLeadRange: `${formatCurrency(lowCpl)}-${formatCurrency(highCpl)}`,
      conversionExpectation: `${lowConversion}-${highConversion}% of leads progressing into investor calls or deal reviews`,
    };
  }

  if (isBuyerLikeCampaignIntent(plan.intent)) {
    const baseLeads = 18 + spendFactor * 6;
    const lowCpl = 55 + spendFactor * 3;
    const highCpl = lowCpl + 20;
    const lowConversion = 12 + spendFactor;
    const highConversion = lowConversion + 4;

    return {
      leadsPerMonth: `${baseLeads}-${baseLeads + 8}`,
      costPerLeadRange: `${formatCurrency(lowCpl)}-${formatCurrency(highCpl)}`,
      conversionExpectation: `${lowConversion}-${highConversion}% of leads progressing into booked consultations`,
    };
  }

  const baseLeads = 12 + spendFactor * 4;
  const lowCpl = 70 + spendFactor * 4;
  const highCpl = lowCpl + 24;
  const lowConversion = 10 + spendFactor;
  const highConversion = lowConversion + 3;

  return {
    leadsPerMonth: `${baseLeads}-${baseLeads + 6}`,
    costPerLeadRange: `${formatCurrency(lowCpl)}-${formatCurrency(highCpl)}`,
    conversionExpectation: `${lowConversion}-${highConversion}% of leads progressing into valuation appointments`,
  };
}

export function getNextActions(plan: CampaignPlan) {
  const nextAngle = getCategoryRulePack(plan.creativeStrategy.campaignCategory).winningAngles[0] ?? "next angle";
  const firstAction = isSellerCampaignIntent(plan.intent)
    ? "Connect the ad account and publish the seller valuation campaign."
    : isCommercialCampaignIntent(plan.intent)
      ? "Connect the ad account and publish the commercial space-fit campaign."
    : isInvestorCampaignIntent(plan.intent)
      ? "Connect the ad account and publish the investor acquisition campaign."
      : "Connect the ad account and publish the buyer consultation campaign.";

  return [
    firstAction,
    `Keep the landing page headline, form, and first ad aligned to ${plan.creativeStrategy.mechanism} and ${plan.creativeStrategy.proofStyle}.`,
    `Prepare a ${nextAngle} test and a fast follow-up workflow so the next optimization cycle can rotate angle quality without breaking response speed.`,
  ];
}
