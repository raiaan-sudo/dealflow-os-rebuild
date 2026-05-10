export const STATIC_CREATIVE_BACKGROUND_CONTRACT = "text_free_background_v2";

type StaticVisualContractInput = {
  imageUrl?: string | null;
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
};

export type StaticVisualAssetDecision = {
  usable: boolean;
  reason: string | null;
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedPrompt(input: StaticVisualContractInput) {
  return [
    input.imagePrompt,
    input.imagePromptConfig?.prompt,
    input.imagePromptConfig?.negativePrompt,
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
    usable: true,
    reason: null,
  };
}
