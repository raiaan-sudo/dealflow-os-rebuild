export const STATIC_CREATIVE_BACKGROUND_CONTRACT = "text_free_background_v2";

export type StaticCreativeImageQaDecision = "accept" | "reject" | "review";
export type StaticCreativeImageQaMode = "background_only" | "finished_ad" | "app_composed_final";

export type StaticCreativeImageQaReason =
  | "text_heavy"
  | "gibberish_text_detected"
  | "fake_ad_layout"
  | "flyer_or_brochure_layout"
  | "ui_or_dashboard_layout"
  | "chart_or_table_detected"
  | "listing_sheet_detected"
  | "button_or_fake_cta_detected"
  | "provider_returned_finished_ad"
  | "finished_ad_text_unverified"
  | "required_cta_missing"
  | "required_offer_missing"
  | "required_brand_missing"
  | "brand_misspelled"
  | "image_fetch_failed"
  | "qa_timeout"
  | "generic_template_asset"
  | "icon_house_asset"
  | "app_fallback_visual_not_launch_ready";

export type StaticCreativeImageQaResult = {
  usable: boolean;
  decision: StaticCreativeImageQaDecision;
  mode?: StaticCreativeImageQaMode;
  reasons: StaticCreativeImageQaReason[];
  textDensity?: number;
  layoutRisk?: number;
  detectedTextSamples?: string[];
};

type StaticCreativeImageQaMetadata = {
  usable?: boolean | null;
  decision?: StaticCreativeImageQaDecision | string | null;
  mode?: StaticCreativeImageQaMode | string | null;
  reasons?: string[] | null;
  textDensity?: number | null;
  layoutRisk?: number | null;
  detectedTextSamples?: string[] | null;
};

type StaticVisualContractInput = {
  imageUrl?: string | null;
  storageNormalized?: boolean | null;
  appComposedFinal?: boolean | null;
  qualityTier?: string | null;
  compositionVersion?: string | null;
  imageGenerationProvider?: string | null;
  sourceBackgroundKind?: string | null;
  sourceBackgroundProvider?: string | null;
  sourceBackgroundAssetId?: string | null;
  imagePrompt?: string | null;
  imagePromptConfig?: {
    prompt?: string | null;
    negativePrompt?: string | null;
  } | null;
  visualPromptBrief?: {
    visualAssetContract?: string | null;
    visualAssetRole?: string | null;
  } | null;
  qualityGate?: {
    accepted?: boolean | null;
  } | null;
  visualQualityGate?: {
    accepted?: boolean | null;
  } | null;
  premiumQualityGate?: {
    accepted?: boolean | null;
  } | null;
  imageQa?: StaticCreativeImageQaMetadata | null;
  sourceImageQa?: StaticCreativeImageQaMetadata | null;
};

export type StaticVisualAssetDecision = {
  usable: boolean;
  reason: string | null;
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedPrompt(input: StaticVisualContractInput, options?: { includeNegativePrompt?: boolean }) {
  return [
    input.imagePrompt,
    input.imagePromptConfig?.prompt,
    options?.includeNegativePrompt ? input.imagePromptConfig?.negativePrompt : null,
  ]
    .map((value) => safeText(value).toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function hasTextFreeBackgroundContract(input: StaticVisualContractInput) {
  const contract = safeText(input.visualPromptBrief?.visualAssetContract).toLowerCase();
  const role = safeText(input.visualPromptBrief?.visualAssetRole).toLowerCase();
  const prompt = normalizedPrompt(input);

  return (
    contract === STATIC_CREATIVE_BACKGROUND_CONTRACT ||
    role === "text_free_background" ||
    prompt.includes("text-free background asset only")
  );
}

export function hasLegacyFinishedAdPromptRisk(input: StaticVisualContractInput) {
  const prompt = normalizedPrompt(input);

  return /\b(finished,\s*high-converting|finished paid social|finished paid-social|ad creative frame|proof modules|dashboard grids|brochure-style ad layout|poster-like typography|cta-safe bottom)\b/.test(prompt);
}

function hasPremiumSourceProvider(input: StaticVisualContractInput) {
  const provider = safeText(input.sourceBackgroundProvider).toLowerCase();

  return provider === "higgsfield_marketing_studio" || provider === "higgsfield";
}

export function hasHiggsfieldFinishedAdProvenance(input: StaticVisualContractInput) {
  const provider = safeText(input.imageGenerationProvider).toLowerCase();
  const qualityTier = safeText(input.qualityTier).toLowerCase();

  return Boolean(
    provider === "higgsfield_marketing_studio" &&
      (qualityTier === "higgsfield_finished_ad" || qualityTier === "premium_finished_ad") &&
      input.appComposedFinal !== true &&
      input.compositionVersion !== "app_composed_static_v2" &&
      input.imageQa?.mode === "finished_ad" &&
      input.imageQa.decision === "accept" &&
      input.imageQa.usable !== false &&
      input.qualityGate?.accepted !== false &&
      input.visualQualityGate?.accepted !== false &&
      input.premiumQualityGate?.accepted !== false,
  );
}

export function evaluateStaticVisualAssetDecision(
  input: StaticVisualContractInput,
): StaticVisualAssetDecision {
  if (!safeText(input.imageUrl)) {
    return {
      usable: false,
      reason: "No finished Higgsfield ad image is available yet.",
    };
  }

  if (input.storageNormalized !== true) {
    return {
      usable: false,
      reason: "This visual needs to be stored in DealFlow before it can be used as a launch-ready creative.",
    };
  }

  if (input.appComposedFinal === true || input.compositionVersion === "app_composed_static_v2") {
    return {
      usable: false,
      reason: "Final launch-ready ads must be finished Higgsfield renders, not DealFlow-composed mockups.",
    };
  }

  if (input.imageQa?.mode === "finished_ad") {
    if (hasHiggsfieldFinishedAdProvenance(input)) {
      return {
        usable: true,
        reason: null,
      };
    }

    return {
      usable: false,
      reason: "This finished ad is review-only until it is a verified Higgsfield CLI render that passes QA.",
    };
  }

  if (input.imageQa && (input.imageQa.usable === false || input.imageQa.decision !== "accept")) {
    return {
      usable: false,
      reason: "This visual needs a cleaner finished Higgsfield render before it can be launch-ready.",
    };
  }

  if (input.sourceImageQa?.mode === "background_only" || hasPremiumSourceProvider(input)) {
    return {
      usable: false,
      reason: "Higgsfield background/source images are review-only and cannot satisfy launch readiness.",
    };
  }

  if (!hasTextFreeBackgroundContract(input)) {
    return {
      usable: false,
      reason: "Final launch ads must be finished Higgsfield CLI ad renders.",
    };
  }

  if (hasLegacyFinishedAdPromptRisk(input)) {
    return {
      usable: false,
      reason: "This visual was generated from an old full-ad prompt that can create fake text artifacts.",
    };
  }

  return {
    usable: false,
    reason: "Text-free backgrounds are review-only; final launch ads must be finished Higgsfield CLI renders.",
  };
}
