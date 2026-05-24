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

function hasAcceptedPremiumFinalProvenance(input: StaticVisualContractInput) {
  return Boolean(
    input.qualityTier === "premium_final" &&
      input.premiumQualityGate?.accepted === true &&
      input.visualQualityGate?.accepted !== false &&
      input.sourceBackgroundKind === "higgsfield_visual_background" &&
      hasPremiumSourceProvider(input) &&
      safeText(input.sourceBackgroundAssetId),
  );
}

function hasAcceptedLegacyAppComposedFinalProvenance(input: StaticVisualContractInput) {
  return Boolean(
    input.appComposedFinal === true &&
      input.imageQa?.mode === "app_composed_final" &&
      input.imageQa.usable === true &&
      input.imageQa.decision === "accept" &&
      input.storageNormalized === true &&
      input.sourceBackgroundKind === "higgsfield_visual_background" &&
      hasPremiumSourceProvider(input),
  );
}

export function evaluateStaticVisualAssetDecision(
  input: StaticVisualContractInput,
): StaticVisualAssetDecision {
  if (!safeText(input.imageUrl)) {
    return {
      usable: false,
      reason: "No generated background image is available yet.",
    };
  }

  const premiumFinalAccepted = hasAcceptedPremiumFinalProvenance(input);
  const legacyAppComposedFinalAccepted = hasAcceptedLegacyAppComposedFinalProvenance(input);

  if (input.qualityGate?.accepted !== true && !premiumFinalAccepted && !legacyAppComposedFinalAccepted) {
    return {
      usable: false,
      reason: "This generated visual has not passed the creative quality gate yet and must be regenerated.",
    };
  }

  if (input.storageNormalized !== true) {
    return {
      usable: false,
      reason: "This visual needs to be stored in DealFlow before it can be used as a launch-ready creative.",
    };
  }

  if (input.appComposedFinal === true && input.imageQa?.mode === "app_composed_final") {
    if (!premiumFinalAccepted && !legacyAppComposedFinalAccepted) {
      return {
        usable: false,
        reason: "Premium launch ads are still being prepared. Draft previews cannot satisfy launch readiness.",
      };
    }

    return {
      usable: true,
      reason: null,
    };
  }

  if (input.imageQa && (input.imageQa.usable === false || input.imageQa.decision !== "accept")) {
    return {
      usable: false,
      reason: "This visual needs a cleaner background before it can be used as a launch-ready creative.",
    };
  }

  if (input.imageQa?.mode === "finished_ad") {
    return {
      usable: false,
      reason: "This provider-rendered ad is review-only; DealFlow must compose final launch-ready text and layout.",
    };
  }

  if (!hasTextFreeBackgroundContract(input)) {
    return {
      usable: false,
      reason: "This visual was generated before the text-free background contract and was withheld from the launch preview.",
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
    reason: "This text-free background is review-only until DealFlow composes the final launch-ready ad.",
  };
}
