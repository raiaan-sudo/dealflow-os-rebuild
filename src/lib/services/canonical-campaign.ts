import { buildCreativeBrief } from "@/lib/ai/creative-brief";
import { inferCampaignIntent, type CampaignIntent } from "@/lib/campaign-intent";
import { readCampaignPlanDocumentWithDriftGuard } from "@/lib/services/campaign-plan-persistence-service";
import { readPersistedAssetGenerationState } from "@/lib/services/asset-generation-lifecycle";
import { normalizeCreativeStrategy } from "@/lib/services/campaign-creative-strategy";
import type {
  CampaignAd,
  CampaignCreatives,
  CampaignPlan,
  CampaignRuntime,
} from "@/lib/services/campaign-plan-service";
import { buildCampaign, type BuiltCampaign, type CampaignStrategyInput } from "@/lib/services/campaign-orchestrator";
import type { CanonicalCreativeItem, StaticCreativeAsset, VideoCreativeAsset } from "@/lib/services/creative-engine";
import type { FunnelBlueprint, FunnelSection, FunnelType } from "@/lib/services/funnel-engine";
import type {
  Campaign,
  CampaignCopy,
  CampaignCreative,
  CampaignFunnel,
  CampaignOptimization,
  CampaignPublishState,
  FullCampaignRecord,
} from "@/lib/types/campaign-records";
import type { Database } from "@/lib/supabase/types";

type CampaignPlanRow = Database["public"]["Tables"]["campaign_plans"]["Row"];

export type SavedCampaignDocument = {
  [key: string]: unknown;
  name?: unknown;
  plan?: Record<string, unknown> | null;
  strategy?: Partial<CampaignStrategyInput> | null;
  creatives?: unknown;
  staticAds?: unknown;
  videoAds?: unknown;
  assetGeneration?: unknown;
  items?: unknown;
  copy?: unknown;
  ads?: unknown;
  funnel?: Record<string, unknown> | null;
  launch?: {
    runtime?: Partial<CampaignRuntime> | null;
  } | null;
  results?: {
    optimizations?: unknown;
  } | null;
};

type CampaignPublishRecord = {
  state?: CampaignPublishState | null;
  slug?: string | null;
  stagedAt?: string | null;
  publishedAt?: string | null;
  stagedSnapshot?: SavedCampaignDocument | null;
  publishedSnapshot?: SavedCampaignDocument | null;
};

function normalizeAdAngle(value: unknown): CampaignAd["angle"] | undefined {
  return value === "pain" ||
    value === "authority"
    ? value
    : value === "opportunity" || value === "guarantee" || value === "urgency"
      ? "urgency"
      : value === "curiosity" || value === "contrarian"
        ? "exclusivity"
        : value === "speed"
          ? "speed"
          : undefined;
}

function normalizeStaticCreativeAngle(
  value: unknown,
): StaticCreativeAsset["angle"] {
  return value === "guarantee" ||
    value === "urgency" ||
    value === "contrarian" ||
    value === "opportunity" ||
    value === "authority"
    ? value
    : "opportunity";
}

function normalizeFunnelType(value: unknown, fallback: FunnelType): FunnelType {
  return value === "landing_page_form" ||
    value === "landing_page_survey" ||
    value === "landing_page_book_call"
    ? value
    : fallback;
}

function applySavedStaticGenerationLifecycle(
  staticAds: CampaignCreatives["staticAds"],
  savedDocument?: SavedCampaignDocument | null,
) {
  const lifecycle = readPersistedAssetGenerationState(savedDocument?.assetGeneration).staticAds;

  if (!lifecycle || lifecycle.status === "idle") {
    return staticAds;
  }

  return staticAds.map((ad) => {
    if (ad.imageGenerationState === "generated" || ad.imageGenerationState === "failed") {
      return ad;
    }

    if (lifecycle.status === "generating") {
      return {
        ...ad,
        imageGenerationState: "generating" as const,
        imageGenerationMessage:
          ad.imageGenerationMessage ?? "Image preview generation is still running for this creative.",
      };
    }

    if (lifecycle.status === "failed") {
      return {
        ...ad,
        imageGenerationState: "failed" as const,
        imageGenerationMessage:
          lifecycle.lastError ??
          ad.imageGenerationMessage ??
          "Image preview generation failed for this creative.",
      };
    }

    if (lifecycle.status === "unavailable") {
      return {
        ...ad,
        imageGenerationState: "unavailable" as const,
        imageGenerationMessage:
          lifecycle.lastError ??
          ad.imageGenerationMessage ??
          "This image preview is not ready yet.",
      };
    }

    return ad;
  });
}

function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasHiggsfieldFinishedStaticAds(value: CampaignCreatives["staticAds"]) {
  return value.filter((asset) => {
    const qa = asset.imageQa;
    const provider =
      asset.imageGenerationProvider === "higgsfield_marketing_studio" ||
      asset.generationMethod === "higgsfield_marketing_studio" ||
      asset.providerName === "higgsfield_marketing_studio";

    return (
      provider &&
      asset.qualityTier === "higgsfield_finished_ad" &&
      asset.generationMode === "finished_ad" &&
      asset.assetRole === "final_static_ad" &&
      asset.appComposedFinal !== true &&
      asset.storageNormalized === true &&
      Boolean(asset.imageUrl) &&
      qa?.mode === "finished_ad" &&
      qa.decision === "accept"
    );
  }).length >= 4;
}

function runtimeHasRecordedLaunch(value: Record<string, unknown> | null) {
  if (!value) {
    return false;
  }

  return Boolean(
    safeText(value.campaignId ?? value.campaign_id) ||
      safeText(value.adSetId ?? value.adset_id) ||
      safeText(value.adId ?? value.ad_id) ||
      safeText(value.metaPushStatus ?? value.meta_push_status) === "published" ||
      safeText(value.status) === "live",
  );
}

function pickBestLaunchRuntime(...candidates: Array<Record<string, unknown> | null>) {
  return candidates.find(runtimeHasRecordedLaunch) ?? candidates.find(Boolean) ?? null;
}

function isModernPersistedPlanDocument(value: Record<string, unknown>) {
  return Boolean(
    safeText(value.market) ||
      safeText(value.audience) ||
      safeText(value.business_name) ||
      Number(value.monthly_budget ?? 0) > 0,
  );
}

function funnelGoalFromPlan(value: Record<string, unknown>): CampaignStrategyInput["funnel_goal"] {
  const funnelType = safeText(value.funnel_type).toLowerCase();

  if (/book|call/.test(funnelType)) {
    return "book_call";
  }

  if (/form|lead/.test(funnelType)) {
    return "lead_form";
  }

  return "survey";
}

function adaptModernPersistedPlanDocument(value: Record<string, unknown>): SavedCampaignDocument {
  const creatives = safeRecord(value.creatives);
  const launch = safeRecord(value.launch);
  const rootRuntime = safeRecord(value.runtime);
  const launchRuntime = safeRecord(value.launch_runtime);
  const results = safeRecord(value.results);

  return {
    name: value.business_name ?? value.client_name ?? value.name,
    plan: value,
    strategy: {
      location: safeText(value.market),
      audience: safeText(value.audience),
      offer: safeText(value.offer_summary ?? value.key_offer),
      price_point: safeText(value.property_type) || undefined,
      market_type: inferCampaignIntent({
        intent: value.intent,
        marketType: value.intent,
        offer: safeText(value.offer_summary ?? value.key_offer),
        audience: safeText(value.audience),
        primaryGoal: safeText(value.primary_goal),
        mechanism: safeText(value.mechanism),
      }),
      funnel_goal: funnelGoalFromPlan(value),
    },
    creatives: value.creatives,
    staticAds: value.staticAds ?? creatives?.staticAds,
    videoAds: value.videoAds ?? creatives?.videoAds,
    creative_chat_intake: value.creative_chat_intake,
    selected_ad_id: value.selected_ad_id,
    selected_ad_ids: value.selected_ad_ids,
    selected_ugc_video_id: value.selected_ugc_video_id,
    selected_ugc_video_ids: value.selected_ugc_video_ids,
    campaign_payload: value.campaign_payload,
    assetGeneration: value.assetGeneration,
    items: value.items,
    copy: value.copy,
    ads: value.ads,
    funnel: safeRecord(value.funnel),
    launch: {
      runtime: (rootRuntime ??
        launchRuntime ??
        safeRecord(launch?.runtime)) as Partial<CampaignRuntime> | null,
    },
    results: results
      ? {
          optimizations: results.optimizations,
        }
      : null,
  };
}

function normalizeStrategyInput(
  value?: Partial<CampaignStrategyInput> | null,
  campaign?: Partial<Campaign> | null,
): CampaignStrategyInput {
  const location = safeText(value?.location ?? campaign?.location);
  const audience = safeText(value?.audience ?? campaign?.audience);
  const offer = safeText(value?.offer ?? campaign?.offer);
  const pricePoint = safeText(value?.price_point ?? campaign?.price_point);
  const marketType = inferCampaignIntent({
    intent: value?.market_type ?? campaign?.market_type,
    marketType: value?.market_type ?? campaign?.market_type,
    offer,
    audience,
  });
  const funnelGoal = value?.funnel_goal ?? campaign?.funnel_goal ?? "survey";

  return {
    location,
    audience,
    offer,
    price_point: pricePoint || undefined,
    market_type: marketType,
    funnel_goal:
      funnelGoal === "lead_form" || funnelGoal === "survey" || funnelGoal === "book_call"
        ? funnelGoal
        : "survey",
  };
}

function defaultRuntime(): CampaignRuntime {
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
    budgetDaily: null,
    budgetDailyInput: null,
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

function normalizeRuntime(value?: Partial<CampaignRuntime> | null): CampaignRuntime {
  const fallback = defaultRuntime();

  return {
    ...fallback,
    ...value,
    status: value?.status ?? fallback.status,
    safetyState: value?.safetyState ?? fallback.safetyState,
    launchMode: value?.launchMode ?? fallback.launchMode,
    metaPushStatus: value?.metaPushStatus ?? fallback.metaPushStatus,
    metaAdSetIds: safeArray<string>(value?.metaAdSetIds),
    metaAdIds: safeArray<string>(value?.metaAdIds),
    pausedAdIds: safeArray<string>(value?.pausedAdIds),
    queuedCampaignClones: safeArray<CampaignRuntime["queuedCampaignClones"][number]>(value?.queuedCampaignClones),
  };
}

function normalizeCreativeIdeas(
  value: unknown,
  built: BuiltCampaign,
  campaignId: string,
  createdAt: string,
  items?: CanonicalCreativeItem[],
): CampaignCreative[] {
  if ((items ?? []).length > 0) {
    return (items ?? []).map((item, index) => ({
      id: `${campaignId}-creative-${index}`,
      campaign_id: campaignId,
      hook: safeText(item.hook || item.overlayText),
      angle: safeText(item.angle || "opportunity"),
      format: safeText(item.format || "ugc"),
      concept: safeText(item.concept || item.title),
      visual_direction: safeText(item.visualDirection || item.imagePrompt),
      created_at: createdAt,
    }));
  }

  const source = safeArray<Record<string, unknown>>(value);
  const fallback = built.creatives;

  return (source.length > 0 ? source : fallback).map((creative, index) => ({
    id: `${campaignId}-creative-${index}`,
    campaign_id: campaignId,
    hook: safeText(creative.hook ?? fallback[index]?.hook),
    angle: safeText(creative.angle ?? fallback[index]?.angle ?? "opportunity"),
    format: safeText(creative.format ?? fallback[index]?.format ?? "talking_head"),
    concept: safeText(creative.concept ?? fallback[index]?.concept),
    visual_direction: safeText(creative.visual_direction ?? fallback[index]?.visual_direction),
    created_at: createdAt,
  }));
}

function normalizeCreativeItems(
  value: unknown,
  built: BuiltCampaign,
  staticAds: CampaignCreatives["staticAds"],
  videoAds: CampaignCreatives["videoAds"],
): CanonicalCreativeItem[] {
  const source = safeArray<CanonicalCreativeItem>(value);

  if (source.length > 0) {
    return source.map((item) => ({
      ...item,
      hook: safeText(item.hook),
      overlayText: safeText(item.overlayText),
      primaryText: safeText(item.primaryText),
      headline: safeText(item.headline),
      cta: safeText(item.cta),
      title: safeText(item.title),
      concept: safeText(item.concept),
      visualDirection: safeText(item.visualDirection),
      imagePrompt: safeText(item.imagePrompt),
      scriptLines: safeArray<string>(item.scriptLines),
      sceneDescriptions: safeArray<string>(item.sceneDescriptions),
      onScreenText: safeArray<string>(item.onScreenText),
      assetRefs: {
        imageUrl: item.assetRefs?.imageUrl ?? null,
        videoUrl: item.assetRefs?.videoUrl ?? null,
        thumbnailUrl: item.assetRefs?.thumbnailUrl ?? null,
        voiceUrl: item.assetRefs?.voiceUrl ?? null,
      },
    }));
  }

  const builtItems = safeArray<CanonicalCreativeItem>((built as BuiltCampaign & { items?: CanonicalCreativeItem[] }).items);
  if (builtItems.length > 0) {
    return builtItems;
  }

  const staticItems = staticAds.map((ad) => ({
    id: ad.id,
    kind: "static" as const,
    angle: ad.angle,
    format: "ugc" as const,
    title: ad.headline,
    hook: ad.hook,
    overlayText: ad.overlayText,
    primaryText: ad.primaryText,
    headline: ad.headline,
    cta: ad.cta,
    score: ad.score,
    recommended: ad.recommended,
    concept: ad.visualConcept,
    visualDirection: ad.visualConcept,
    imagePrompt: ad.imagePrompt,
    scriptLines: [ad.hook, ad.primaryText, ad.cta],
    sceneDescriptions: ["Hook frame", "Body frame", "CTA frame"],
    onScreenText: [ad.overlayText, ad.headline, ad.cta],
    assetRefs: {
      imageUrl: ad.imageUrl || null,
      videoUrl: null,
      thumbnailUrl: ad.imageUrl || null,
      voiceUrl: null,
    },
  }));
  const videoItems = videoAds.map((video, index) => ({
    id: video.id,
    kind: "video" as const,
    angle: index === 0 ? "authority" : "opportunity",
    format: video.conceptType === "founder_expert" ? "talking_head" as const : "ugc" as const,
    title: video.title,
    hook: video.hook,
    overlayText: video.onScreenText[0] || video.hook,
    primaryText: video.script.slice(0, -1).join(" "),
    headline: video.title,
    cta: video.cta,
    score: index === 0 ? 8.8 : 8.4,
    recommended: index === 0,
    concept: video.title,
    visualDirection: video.creatorStyle,
    imagePrompt: "",
    scriptLines: video.script,
    sceneDescriptions: video.shotList,
    onScreenText: video.onScreenText,
    assetRefs: {
      imageUrl: null,
      videoUrl: video.videoUrl || null,
      thumbnailUrl: null,
      voiceUrl: null,
    },
    creatorStyle: video.creatorStyle,
    voiceStyle: video.voiceStyle,
    conceptType: video.conceptType,
  }));

  return [...staticItems, ...videoItems];
}

function normalizeCopyAssets(
  value: unknown,
  built: BuiltCampaign,
  campaignId: string,
  createdAt: string,
  items?: CanonicalCreativeItem[],
): CampaignCopy[] {
  if ((items ?? []).length > 0) {
    return (items ?? []).map((item, index) => ({
      id: `${campaignId}-copy-${index}`,
      campaign_id: campaignId,
      hook: safeText(item.hook),
      primary_text: safeText(item.primaryText),
      script: safeText(item.scriptLines.join("\n")),
      headline: safeText(item.headline || item.title),
      cta: safeText(item.cta),
      created_at: createdAt,
    }));
  }

  const source = safeArray<Record<string, unknown>>(value);
  const fallback = built.copy;

  return (source.length > 0 ? source : fallback).map((copy, index) => ({
    id: `${campaignId}-copy-${index}`,
    campaign_id: campaignId,
    hook: safeText(copy.hook ?? fallback[index]?.hook),
    primary_text: safeText(copy.primary_text ?? fallback[index]?.primary_text),
    script: safeText(copy.script ?? fallback[index]?.script),
    headline: safeText(copy.headline ?? fallback[index]?.headline),
    cta: safeText(copy.cta ?? fallback[index]?.cta),
    created_at: createdAt,
  }));
}

function normalizeAds(
  value: unknown,
  plan?: Partial<CampaignPlan> | null,
  built?: BuiltCampaign | null,
): CampaignAd[] {
  const source = safeArray<Record<string, unknown>>(value).map((ad, index) => ({
    variant: safeText(ad.variant) || `Primary angle ${index + 1}`,
    angle: normalizeAdAngle(ad.angle),
    sourcePatternId: typeof ad.sourcePatternId === "string" ? ad.sourcePatternId : null,
    overlayText: safeText(ad.overlayText ?? ad.headline),
    headline: safeText(ad.headline),
    body: safeText(ad.body),
    cta: safeText(ad.cta),
    image: safeText(ad.image),
  }));

  if (source.length > 0) {
    return source;
  }

  const builtCopy = built?.copy ?? [];
  const builtIdeas = built?.creatives ?? [];

  if (builtCopy.length > 0) {
    return builtCopy.slice(0, 3).map((item, index) => ({
      variant: `Primary angle ${index + 1}`,
      angle: normalizeAdAngle(builtIdeas[index]?.angle),
      sourcePatternId: null,
      overlayText: safeText(item.hook ?? item.headline),
      headline: safeText(item.headline ?? item.hook),
      body: safeText(item.primary_text),
      cta: safeText(item.cta),
      image: safeText((plan?.ads ?? [])[index]?.image),
    }));
  }

  return safeArray<CampaignAd>(plan?.ads);
}

export function normalizeCanonicalFunnelSections(
  value: unknown,
  fallback: FunnelBlueprint["sections"],
): CampaignFunnel["sections"] {
  const source = safeArray<Partial<FunnelSection> & Record<string, unknown>>(value);
  const base = source.length > 0 ? source : fallback;

  return base.map((section, index) => ({
    id: safeText(section.id) || `${safeText(section.type) || "section"}-${index + 1}`,
    type:
      section.type === "hero" ||
      section.type === "trust_bar" ||
      section.type === "benefits" ||
      section.type === "proof_metrics" ||
      section.type === "social_proof" ||
      section.type === "market_snapshot" ||
      section.type === "objections" ||
      section.type === "process" ||
      section.type === "faq" ||
      section.type === "vsl" ||
      section.type === "image" ||
      section.type === "form" ||
      section.type === "closing_cta"
        ? section.type
        : "benefits",
    variant: safeText(section.variant) || "default",
    title: safeText(section.title) || "Section",
    content: safeArray<string>(section.content).map(String).map(safeText).filter(Boolean),
    visible: typeof section.visible === "boolean" ? section.visible : true,
    style: {
      spacing:
        section.style?.spacing === "compact" ||
        section.style?.spacing === "comfortable" ||
        section.style?.spacing === "spacious"
          ? section.style.spacing
          : "comfortable",
      width:
        section.style?.width === "full" ||
        section.style?.width === "content" ||
        section.style?.width === "narrow"
          ? section.style.width
          : "full",
      align:
        section.style?.align === "left" || section.style?.align === "center"
          ? section.style.align
          : "left",
      theme:
        section.style?.theme === "light" ||
        section.style?.theme === "dark" ||
        section.style?.theme === "accent"
          ? section.style.theme
          : "light",
    },
    media: section.media
      ? {
          kind: section.media.kind === "video" ? "video" : "image",
          assetId: safeText(section.media.assetId) || undefined,
          url: safeText(section.media.url) || undefined,
          label: safeText(section.media.label) || undefined,
          caption: safeText(section.media.caption) || undefined,
          thumbnailAssetId: safeText(section.media.thumbnailAssetId) || undefined,
          thumbnailUrl: safeText(section.media.thumbnailUrl) || undefined,
        }
      : null,
  }));
}

function normalizeFunnel(
  value: Record<string, unknown> | null | undefined,
  built: BuiltCampaign,
  campaignId: string,
  createdAt: string,
): CampaignFunnel {
  const source = value ?? {};

  return {
    funnel_type: normalizeFunnelType(source.funnel_type, built.funnel.funnel_type),
    headline: safeText(source.headline) || built.funnel.headline,
    subheadline: safeText(source.subheadline) || built.funnel.subheadline,
    cta: safeText(source.cta) || built.funnel.cta,
    sections: normalizeCanonicalFunnelSections(source.sections, built.funnel.sections),
    form_fields: Array.isArray(source.form_fields) ? source.form_fields.map(String) : built.funnel.form_fields,
    follow_up_action: safeText(source.follow_up_action) || built.funnel.follow_up_action,
    optimization_notes: Array.isArray(source.optimization_notes)
      ? source.optimization_notes.map(String)
      : built.funnel.optimization_notes,
  };
}

function normalizeOptimizations(value: unknown): CampaignOptimization[] {
  return safeArray<CampaignOptimization>(value).map((item) => ({
    ...item,
    ctr: Number(item.ctr ?? 0),
    cpc: Number(item.cpc ?? 0),
    cpl: Number(item.cpl ?? 0),
    frequency: Number(item.frequency ?? 0),
    spend: Number(item.spend ?? 0),
    leads: Number(item.leads ?? 0),
    lp_cvr: Number(item.lp_cvr ?? 0),
    reasons: safeArray<CampaignOptimization["reasons"][number]>(item.reasons),
    actions: safeArray<CampaignOptimization["actions"][number]>(item.actions),
  }));
}

export function normalizeCanonicalCampaign(params: {
  campaign: Partial<Campaign> & Pick<Campaign, "id" | "user_id">;
  savedDocument?: SavedCampaignDocument | null;
  builtCampaign?: BuiltCampaign | null;
  staticAds?: CampaignCreatives["staticAds"];
  videoAds?: CampaignCreatives["videoAds"];
  runtime?: Partial<CampaignRuntime> | null;
  optimizations?: CampaignOptimization[] | null;
  planRecord?: Partial<CampaignPlan> | null;
  publish?: CampaignPublishRecord | null;
}): FullCampaignRecord {
  const strategy = normalizeStrategyInput(params.savedDocument?.strategy, params.campaign);
  const built = params.builtCampaign ?? buildCampaign(strategy);
  const createdAt = params.campaign.created_at ?? new Date().toISOString();
  const updatedAt = params.campaign.updated_at ?? createdAt;
  const planRecord = params.planRecord ?? null;
  const planSource = params.savedDocument?.plan ?? {};
  const intent = inferCampaignIntent({
    intent: planSource.intent ?? planRecord?.intent ?? strategy.market_type,
    marketType: strategy.market_type,
    offer: safeText(planSource.offer ?? planRecord?.keyOffer ?? strategy.offer),
    audience: safeText(planSource.audience ?? planRecord?.audience ?? strategy.audience),
    primaryGoal: planRecord?.primaryGoal,
    mechanism: safeText(planSource.mechanism ?? planRecord?.mechanism),
  });
  const market = safeText(planSource.market ?? planRecord?.market ?? strategy.location);
  const audience = safeText(planSource.audience ?? planRecord?.audience ?? strategy.audience);
  const offer = safeText(planSource.offer ?? planRecord?.keyOffer ?? strategy.offer);
  const propertyType = safeText(planSource.property_type ?? planRecord?.propertyType) || "homes";
  const businessName = safeText(planSource.business_name ?? planRecord?.businessName);
  const clientName = safeText(planSource.client_name ?? planRecord?.clientName);
  const primaryGoal = safeText(planSource.primary_goal ?? planRecord?.primaryGoal);
  const timeline = safeText(planSource.timeline ?? planRecord?.timeline);
  const mechanism = safeText(planSource.mechanism ?? planRecord?.mechanism);
  const painPoints = Array.isArray(planSource.pain_points)
    ? planSource.pain_points.map(String)
    : planRecord?.painPoints ?? [];
  const monthlyBudget = Number(planSource.monthly_budget ?? planRecord?.monthlyBudget ?? 0);
  const creativeStrategy = normalizeCreativeStrategy(
    {
      campaignCategory: planSource.campaign_category ?? planRecord?.creativeStrategy?.campaignCategory,
      triggerCondition: planSource.trigger_condition ?? planRecord?.creativeStrategy?.triggerCondition,
      internalTension: planSource.internal_tension ?? planRecord?.creativeStrategy?.internalTension,
      mechanism: planSource.mechanism ?? planRecord?.creativeStrategy?.mechanism ?? planRecord?.mechanism,
      proofStyle: planSource.proof_style ?? planRecord?.creativeStrategy?.proofStyle,
      ctaStyle: planSource.cta_style ?? planRecord?.creativeStrategy?.ctaStyle,
      visualLogic: planSource.visual_logic ?? planRecord?.creativeStrategy?.visualLogic,
      overlayStyle: planSource.overlay_style ?? planRecord?.creativeStrategy?.overlayStyle,
      complianceNotes: planSource.compliance_notes ?? planRecord?.creativeStrategy?.complianceNotes,
    },
    {
      intent,
      audience,
      propertyType,
      keyOffer: offer,
      mechanism,
      primaryGoal,
      painPoints,
    },
  );
  const targetingSummary = safeText(planSource.targeting_summary ?? planRecord?.targetingSummary);
  const offerSummary = safeText(planSource.offer_summary ?? planRecord?.offerSummary);
  const summary = safeText(planSource.summary ?? planRecord?.summary);
  const funnelType = safeText(planSource.funnel_type ?? planRecord?.funnelType ?? built.funnel.funnel_type);
  const funnelSteps = Array.isArray(planSource.funnel_steps)
    ? planSource.funnel_steps.map(String)
    : planRecord?.funnelSteps ?? [];
  const documentStaticAds = safeArray<CampaignCreatives["staticAds"][number]>(
    params.savedDocument?.staticAds,
  );
  const persistedStaticAds = params.staticAds ?? [];
  const planRecordStaticAds = planRecord?.creatives?.staticAds ?? [];
  const savedStaticAds = hasHiggsfieldFinishedStaticAds(documentStaticAds)
    ? documentStaticAds
    : persistedStaticAds.length > 0
      ? persistedStaticAds
      : documentStaticAds.length > 0
        ? documentStaticAds
        : planRecordStaticAds;
  const savedVideoAds =
    params.videoAds ??
    safeArray<CampaignCreatives["videoAds"][number]>(params.savedDocument?.videoAds) ??
    planRecord?.creatives?.videoAds ??
    [];
  const items = normalizeCreativeItems(
    params.savedDocument?.items,
    built,
    savedStaticAds,
    savedVideoAds,
  );
  const staticAds = savedStaticAds.length > 0
    ? savedStaticAds
    : items
        .filter((item) => item.kind === "static")
        .map((item) => ({
          id: item.id,
          angle: normalizeStaticCreativeAngle(item.angle),
          imageUrl: item.assetRefs.imageUrl ?? "",
          imageGenerationState: item.assetRefs.imageUrl ? "generated" as const : "unavailable" as const,
          imageGenerationMessage: item.assetRefs.imageUrl ? null : "This image preview is not ready yet.",
          imageGenerationModel: null,
          visualConcept: item.concept,
          imagePrompt: item.imagePrompt,
          imagePromptConfig: null,
          preferredImageModel: "gpt-image-1.5" as const,
          visualPromptBrief: null,
          scoreBreakdown: null,
          hook: item.hook,
          overlayText: item.overlayText,
          primaryText: item.primaryText,
          headline: item.headline,
          cta: item.cta,
          score: item.score,
          recommended: item.recommended,
        }));
  const lifecycleAwareStaticAds = applySavedStaticGenerationLifecycle(staticAds, params.savedDocument);
  const videoAds = savedVideoAds.length > 0
    ? savedVideoAds
    : items
        .filter((item) => item.kind === "video")
        .map((item): VideoCreativeAsset => ({
          id: item.id,
          conceptType: item.conceptType ?? "customer_ugc",
          title: item.title,
          hook: item.hook,
          script: item.scriptLines,
          shotList: item.sceneDescriptions,
          onScreenText: item.onScreenText,
          videoUrl: item.assetRefs.videoUrl ?? undefined,
          videoGenerationState: item.assetRefs.videoUrl ? "generated" : "unavailable",
          videoGenerationMessage: item.assetRefs.videoUrl ? null : "This video preview is not ready yet.",
          providerAssetId: null,
          cta: item.cta,
          creatorStyle: item.creatorStyle ?? item.visualDirection,
          voiceStyle: item.voiceStyle ?? "clear and direct",
          avatarProfile: {
            id: "trusted_expert" as const,
            genderPresentation: "polished professional",
            ageRange: "30-45",
            stylePersona: "trusted real estate expert",
            energy: "calm and decisive",
            nicheFit: safeText(audience || market),
          },
          voiceProfile: {
            id: "authoritative" as const,
            tone: "authoritative and clear",
            accent: "local neutral",
            speed: "measured",
            authorityLevel: "high",
          },
        }));
  const ads = normalizeAds(params.savedDocument?.ads ?? planRecord?.ads ?? [], planRecord, built);

  return {
    campaign: {
      id: params.campaign.id,
      user_id: params.campaign.user_id,
      organization_id: params.campaign.organization_id ?? null,
      name: safeText(params.savedDocument?.name ?? params.campaign.name) || "Untitled Campaign",
      location: market || null,
      audience: audience || null,
      offer: offer || null,
      price_point: strategy.price_point ?? null,
      market_type: intent,
      funnel_goal: strategy.funnel_goal ?? null,
      created_at: createdAt,
      updated_at: updatedAt,
    },
    strategy,
    plan: {
      intent,
      market,
      audience,
      offer,
      property_type: propertyType,
      business_name: businessName,
      client_name: clientName,
      primary_goal: primaryGoal,
      timeline,
      mechanism,
      creative_strategy: creativeStrategy,
      pain_points: painPoints,
      monthly_budget: monthlyBudget,
      summary,
      targeting_summary: targetingSummary,
      offer_summary: offerSummary,
      funnel_type: funnelType,
      funnel_steps: funnelSteps,
    },
    funnel: normalizeFunnel(params.savedDocument?.funnel, built, params.campaign.id, createdAt),
    creatives: {
      items,
      ideas: normalizeCreativeIdeas(params.savedDocument?.creatives, built, params.campaign.id, createdAt, items),
      copy: normalizeCopyAssets(params.savedDocument?.copy, built, params.campaign.id, createdAt, items),
      ads: ads.length > 0 ? ads : planRecord?.ads ?? [],
      staticAds: lifecycleAwareStaticAds,
      videoAds,
    },
    launch: {
      runtime: normalizeRuntime(params.runtime ?? params.savedDocument?.launch?.runtime ?? planRecord?.runtime),
    },
    results: {
      optimizations: normalizeOptimizations(params.optimizations ?? params.savedDocument?.results?.optimizations ?? []),
    },
    publish: {
      state:
        params.publish?.state === "staged" || params.publish?.state === "published"
          ? params.publish.state
          : "draft",
      slug: safeText(params.publish?.slug) || null,
      stagedAt: params.publish?.stagedAt ?? null,
      publishedAt: params.publish?.publishedAt ?? null,
      hasStagedSnapshot: Boolean(params.publish?.stagedSnapshot),
      hasPublishedSnapshot: Boolean(params.publish?.publishedSnapshot),
    },
  };
}

export function canonicalCampaignToPlan(record: FullCampaignRecord): CampaignPlan {
  const runtime = normalizeRuntime(record.launch.runtime);
  const normalizedAds = record.creatives.items
    .filter((item) => item.kind === "static")
    .slice(0, 3)
    .map((item, index) => ({
      variant: item.title || `Primary angle ${index + 1}`,
      angle: normalizeAdAngle(item.angle),
      sourcePatternId: null,
      overlayText: safeText(item.overlayText || item.hook),
      headline: safeText(item.headline || item.title || item.hook),
      body: safeText(item.primaryText),
      cta: safeText(item.cta),
      image: safeText(item.assetRefs.imageUrl),
    }));
  const fallbackAds = normalizedAds.length > 0
    ? normalizedAds
    : record.creatives.ads.length > 0
      ? record.creatives.ads
      : record.creatives.copy.slice(0, 3).map((copy, index) => ({
          variant: `Primary angle ${index + 1}`,
          angle: normalizeAdAngle(record.creatives.ideas[index]?.angle),
          sourcePatternId: null,
          overlayText: safeText(copy.hook || copy.headline),
          headline: safeText(copy.headline || copy.hook),
          body: safeText(copy.primary_text),
          cta: safeText(copy.cta),
          image: "",
        }));

  return {
    id: record.campaign.id,
    organizationId: record.campaign.user_id,
    clientName: record.plan.client_name || "New client",
    businessName: record.plan.business_name || record.campaign.name,
    intent: record.plan.intent,
    market: record.plan.market,
    monthlyBudget: record.plan.monthly_budget,
    primaryGoal: record.plan.primary_goal,
    timeline: record.plan.timeline,
    audience: record.plan.audience,
    propertyType: record.plan.property_type,
    keyOffer: record.plan.offer,
    painPoints: record.plan.pain_points,
    mechanism: record.plan.mechanism,
    creativeStrategy: normalizeCreativeStrategy(record.plan.creative_strategy, {
      intent: record.plan.intent,
      audience: record.plan.audience,
      propertyType: record.plan.property_type,
      keyOffer: record.plan.offer,
      mechanism: record.plan.mechanism,
      primaryGoal: record.plan.primary_goal,
      painPoints: record.plan.pain_points,
    }),
    funnelType: record.plan.funnel_type,
    targetingSummary: record.plan.targeting_summary,
    offerSummary: record.plan.offer_summary,
    summary: record.plan.summary,
    funnelSteps: record.plan.funnel_steps,
    creativeBrief: buildCreativeBrief({
      location: record.plan.market,
      audience: record.plan.audience,
      property_type: record.plan.property_type,
      offer: record.plan.offer,
      mechanism: record.plan.mechanism,
      pain_points: record.plan.pain_points,
      desired_result: record.plan.primary_goal,
      market_type: record.plan.intent,
    }),
    creatives: {
      staticAds: record.creatives.staticAds,
      videoAds: record.creatives.videoAds,
    },
    ads: fallbackAds,
    funnel: {
      funnelType: record.funnel.funnel_type,
      headline: record.funnel.headline,
      subheadline: record.funnel.subheadline,
      cta: record.funnel.cta,
      sections: record.funnel.sections,
      formFields: record.funnel.form_fields,
      followUpAction: record.funnel.follow_up_action,
      optimizationNotes: record.funnel.optimization_notes,
    },
    runtime,
    createdAt: record.campaign.created_at,
  };
}

export function getSavedCampaignDocumentFromRow(row: CampaignPlanRow): SavedCampaignDocument | null {
  if (!row.plan || typeof row.plan !== "object" || Array.isArray(row.plan)) {
    return null;
  }

  const document = readCampaignPlanDocumentWithDriftGuard(row, "canonical_campaign_read") as Record<string, unknown>;
  const nestedPlan = safeRecord(document.plan);

  if (!nestedPlan && isModernPersistedPlanDocument(document)) {
    return adaptModernPersistedPlanDocument(document);
  }

  if (nestedPlan) {
    const strategy = safeRecord(document.strategy);

    if (
      isModernPersistedPlanDocument(nestedPlan) &&
      (!strategy ||
        (!safeText(strategy.location) &&
          !safeText(strategy.audience) &&
          !safeText(strategy.offer)))
    ) {
      const launch = safeRecord(document.launch);
      const nestedPlanRuntime = safeRecord(nestedPlan.runtime);
      const rootRuntime = safeRecord(document.runtime);
      const launchRuntime = safeRecord(document.launch_runtime);
      const existingLaunchRuntime = safeRecord(launch?.runtime);

      return {
        ...(document as unknown as SavedCampaignDocument),
        launch: {
          ...launch,
          runtime: pickBestLaunchRuntime(
            existingLaunchRuntime,
            nestedPlanRuntime,
            rootRuntime,
            launchRuntime,
          ),
        },
        strategy: adaptModernPersistedPlanDocument(nestedPlan).strategy,
      };
    }
  }

  return document as unknown as SavedCampaignDocument;
}
