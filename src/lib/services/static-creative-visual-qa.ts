export const STATIC_CREATIVE_BACKGROUND_CONTRACT = "text_free_background_v2";

export type StaticCreativeImageQaDecision = "accept" | "reject" | "review";

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
  | "image_fetch_failed"
  | "qa_timeout";

export type StaticCreativeImageQaResult = {
  usable: boolean;
  decision: StaticCreativeImageQaDecision;
  reasons: StaticCreativeImageQaReason[];
  textDensity?: number;
  layoutRisk?: number;
  detectedTextSamples?: string[];
};

type StaticCreativeImageQaMetadata = {
  usable?: boolean | null;
  decision?: StaticCreativeImageQaDecision | string | null;
  reasons?: string[] | null;
  textDensity?: number | null;
  layoutRisk?: number | null;
  detectedTextSamples?: string[] | null;
};

type StaticVisualContractInput = {
  imageUrl?: string | null;
  storageNormalized?: boolean | null;
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

export function evaluateStaticVisualAssetDecision(
  input: StaticVisualContractInput,
): StaticVisualAssetDecision {
  if (!safeText(input.imageUrl)) {
    return {
      usable: false,
      reason: "No generated background image is available yet.",
    };
  }

  if (input.qualityGate?.accepted === false) {
    return {
      usable: false,
      reason: "This generated visual failed the creative quality gate and must be regenerated.",
    };
  }

  if (input.imageQa && (input.imageQa.usable === false || input.imageQa.decision !== "accept")) {
    return {
      usable: false,
      reason: "This visual needs a cleaner background before it can be used as a launch-ready creative.",
    };
  }

  if (!hasTextFreeBackgroundContract(input)) {
    return {
      usable: false,
      reason: "This visual was generated before the text-free background contract and was withheld from the launch preview.",
    };
  }

  if (input.storageNormalized === false) {
    return {
      usable: false,
      reason: "This visual needs to be stored in DealFlow before it can be used as a launch-ready creative.",
    };
  }

  if (hasLegacyFinishedAdPromptRisk(input)) {
    return {
      usable: false,
      reason: "This visual was generated from an old full-ad prompt that can create fake text artifacts.",
    };
  }

  return {
    usable: true,
    reason: null,
  };
}
