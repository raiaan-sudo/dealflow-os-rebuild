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

export type StaticVisualContractInput = {
  imageUrl?: string | null;
  storageNormalized?: boolean | null;
  appComposedFinal?: boolean | null;
  qualityTier?: string | null;
  compositionVersion?: string | null;
  imageGenerationProvider?: string | null;
  sourceBackgroundKind?: string | null;
  sourceBackgroundProvider?: string | null;
  sourceBackgroundAssetId?: string | null;
  generationMethod?: string | null;
  providerName?: string | null;
  generationMode?: string | null;
  assetRole?: string | null;
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
    score?: number | null;
    hardFailures?: string[] | null;
    improvementHints?: string[] | null;
    notes?: string[] | null;
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

export type StaticCreativeLaunchBlockerReason =
  | "missing_image"
  | "storage_not_app_owned"
  | "provider_url_exposed"
  | "brief_hash_mismatch"
  | "cta_hash_mismatch"
  | "offer_hash_mismatch"
  | "brand_hash_mismatch"
  | "buyer_seller_mismatch"
  | "image_corrupt"
  | "gibberish_text"
  | "required_cta_missing"
  | "required_offer_missing"
  | "compliance_blocker"
  | "unsupported_guarantee"
  | "fake_testimonial"
  | "protected_class_language"
  | "not_finished_higgsfield_render"
  | "app_composed_not_launch_approved"
  | "background_source_not_final"
  | "legacy_finished_ad_prompt_risk"
  | "image_qa_failed";

export type StaticCreativeQualityAdvisoryReason =
  | "offer_needs_risk_reversal"
  | "hook_could_be_stronger"
  | "cta_friction"
  | "media_buyer_score_below_ideal"
  | "optional_polish_variant";

export type StaticCreativeLaunchSafetyGate = {
  passed: boolean;
  blockers: StaticCreativeLaunchBlockerReason[];
  checkedAt: string;
};

export type StaticCreativeQualityAdvisory = {
  score: number | null;
  notes: string[];
  reasons: StaticCreativeQualityAdvisoryReason[];
  checkedAt: string;
  canImproveLater: boolean;
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

function hasHiggsfieldFinishedAdBaseProvenance(input: StaticVisualContractInput) {
  const provider = safeText(input.imageGenerationProvider).toLowerCase();
  const generationMethod = safeText(input.generationMethod).toLowerCase();
  const providerName = safeText(input.providerName).toLowerCase();
  const generationMode = safeText(input.generationMode).toLowerCase();
  const assetRole = safeText(input.assetRole).toLowerCase();
  const qualityTier = safeText(input.qualityTier).toLowerCase();

  return Boolean(
    provider === "higgsfield_marketing_studio" &&
      generationMethod === "higgsfield_marketing_studio" &&
      providerName === "higgsfield_marketing_studio" &&
      generationMode === "finished_ad" &&
      assetRole === "final_static_ad" &&
      (qualityTier === "higgsfield_finished_ad" || qualityTier === "premium_finished_ad") &&
      input.appComposedFinal !== true &&
      input.compositionVersion !== "app_composed_static_v2" &&
      input.imageQa?.mode === "finished_ad" &&
      input.visualQualityGate?.accepted !== false &&
      input.premiumQualityGate?.accepted !== false,
  );
}

export function hasHiggsfieldFinishedAdProvenance(input: StaticVisualContractInput) {
  return Boolean(
    hasHiggsfieldFinishedAdBaseProvenance(input) &&
      input.imageQa?.mode === "finished_ad" &&
      input.imageQa.decision === "accept" &&
      input.imageQa.usable !== false,
  );
}

function checkedAt() {
  return new Date().toISOString();
}

function launchBlockersForImageQa(input: StaticVisualContractInput): StaticCreativeLaunchBlockerReason[] {
  const reasons = input.imageQa?.reasons ?? [];
  const blockers = new Set<StaticCreativeLaunchBlockerReason>();

  for (const reason of reasons) {
    if (reason === "gibberish_text_detected") blockers.add("gibberish_text");
    if (reason === "required_cta_missing") blockers.add("required_cta_missing");
    if (reason === "required_offer_missing") blockers.add("required_offer_missing");
    if (reason === "brand_misspelled" || reason === "required_brand_missing") blockers.add("compliance_blocker");
    if (reason === "image_fetch_failed" || reason === "qa_timeout") blockers.add("image_corrupt");
    if (
      reason === "ui_or_dashboard_layout" ||
      reason === "chart_or_table_detected" ||
      reason === "listing_sheet_detected"
    ) {
      blockers.add("not_finished_higgsfield_render");
    }
    if (
      reason === "generic_template_asset" ||
      reason === "icon_house_asset" ||
      reason === "app_fallback_visual_not_launch_ready"
    ) {
      blockers.add("app_composed_not_launch_approved");
    }
  }

  if (
    blockers.size === 0 &&
    input.imageQa &&
    reasons.length === 0 &&
    (input.imageQa.usable === false || input.imageQa.decision !== "accept")
  ) {
    blockers.add("image_qa_failed");
  }

  return [...blockers];
}

function launchBlockersForQualityGate(input: StaticVisualContractInput): StaticCreativeLaunchBlockerReason[] {
  const notes = [
    ...(input.qualityGate?.hardFailures ?? []),
    ...(input.qualityGate?.notes ?? []),
  ]
    .map((note) => safeText(note).toLowerCase())
    .filter(Boolean);
  const blockers = new Set<StaticCreativeLaunchBlockerReason>();

  for (const note of notes) {
    if (/protected class|discriminat|housing category|fair housing|ethnic|religion|families|seniors|immigrants/.test(note)) {
      blockers.add("protected_class_language");
    }
    if (/guarantee|guaranteed|guarantees|approval guaranteed|roi guaranteed/.test(note)) {
      blockers.add("unsupported_guarantee");
    }
    if (/testimonial|fake proof|fake customer|fabricated/.test(note)) {
      blockers.add("fake_testimonial");
    }
    if (/compliance|regulatory|illegal|policy violation/.test(note)) {
      blockers.add("compliance_blocker");
    }
    if (/gibberish|unreadable/.test(note)) {
      blockers.add("gibberish_text");
    }
    if (/missing cta|required cta/.test(note)) {
      blockers.add("required_cta_missing");
    }
    if (/missing offer|required offer/.test(note)) {
      blockers.add("required_offer_missing");
    }
    if (/buyer\/seller mismatch|seller\/buyer mismatch|wrong campaign|buyer copy on seller|seller copy on buyer/.test(note)) {
      blockers.add("buyer_seller_mismatch");
    }
  }

  return [...blockers];
}

export function evaluateStaticCreativeLaunchSafety(
  input: StaticVisualContractInput,
): StaticCreativeLaunchSafetyGate {
  const blockers: StaticCreativeLaunchBlockerReason[] = [];

  if (!safeText(input.imageUrl)) {
    blockers.push("missing_image");
  }

  if (input.storageNormalized !== true) {
    blockers.push("storage_not_app_owned");
  }

  if (input.appComposedFinal === true || input.compositionVersion === "app_composed_static_v2") {
    blockers.push("app_composed_not_launch_approved");
  }

  blockers.push(...launchBlockersForQualityGate(input));

  if (input.imageQa?.mode === "finished_ad") {
    blockers.push(...launchBlockersForImageQa(input));

    if (hasHiggsfieldFinishedAdBaseProvenance(input)) {
      return {
        passed: blockers.length === 0,
        blockers: [...new Set(blockers)],
        checkedAt: checkedAt(),
      };
    }

    blockers.push("not_finished_higgsfield_render");
    return {
      passed: false,
      blockers: [...new Set(blockers)],
      checkedAt: checkedAt(),
    };
  }

  blockers.push(...launchBlockersForImageQa(input));

  if (input.sourceImageQa?.mode === "background_only" || hasPremiumSourceProvider(input)) {
    blockers.push("background_source_not_final");
  }

  if (!hasTextFreeBackgroundContract(input)) {
    blockers.push("not_finished_higgsfield_render");
  }

  if (hasLegacyFinishedAdPromptRisk(input)) {
    blockers.push("legacy_finished_ad_prompt_risk");
  }

  if (blockers.length === 0) {
    blockers.push("not_finished_higgsfield_render");
  }

  return {
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    checkedAt: checkedAt(),
  };
}

function blockerMessage(reason: StaticCreativeLaunchBlockerReason | undefined) {
  switch (reason) {
    case "missing_image":
      return "No finished ad image is available yet.";
    case "storage_not_app_owned":
      return "This visual needs to be stored in DealFlow before it can be used as a launch-ready creative.";
    case "app_composed_not_launch_approved":
      return "This draft needs final approval before it can be selected for launch.";
    case "not_finished_higgsfield_render":
      return "This draft needs a finished render before it can be selected for launch.";
    case "background_source_not_final":
      return "This background image is review-only and cannot satisfy launch readiness.";
    case "legacy_finished_ad_prompt_risk":
      return "This visual was generated from an old full-ad prompt that can create fake text artifacts.";
    case "gibberish_text":
      return "This visual has unreadable text and needs another finished render.";
    case "required_cta_missing":
      return "This visual is missing the required CTA.";
    case "required_offer_missing":
      return "This visual is missing the required offer.";
    case "image_corrupt":
      return "This visual could not be verified as a usable image.";
    case "compliance_blocker":
    case "unsupported_guarantee":
    case "fake_testimonial":
    case "protected_class_language":
      return "This visual needs review for compliance before launch.";
    default:
      return "This visual needs another finished render before it can be launch-ready.";
  }
}

export function evaluateStaticVisualAssetDecision(
  input: StaticVisualContractInput,
): StaticVisualAssetDecision {
  const gate = evaluateStaticCreativeLaunchSafety(input);

  if (gate.passed) {
    return {
      usable: true,
      reason: null,
    };
  }

  return {
    usable: false,
    reason: blockerMessage(gate.blockers[0]),
  };
}

function advisoryReasonForNote(note: string): StaticCreativeQualityAdvisoryReason {
  const normalized = note.toLowerCase();

  if (/risk\s*reversal|offer could be stronger|offer strength/.test(normalized)) {
    return "offer_needs_risk_reversal";
  }

  if (/hook/.test(normalized)) {
    return "hook_could_be_stronger";
  }

  if (/cta|friction/.test(normalized)) {
    return "cta_friction";
  }

  if (/media buyer|score|below ideal/.test(normalized)) {
    return "media_buyer_score_below_ideal";
  }

  return "optional_polish_variant";
}

export function evaluateStaticCreativeQualityAdvisory(
  input: StaticVisualContractInput,
): StaticCreativeQualityAdvisory {
  const notes = [
    ...(input.qualityGate?.hardFailures ?? []),
    ...(input.qualityGate?.improvementHints ?? []),
    ...(input.qualityGate?.notes ?? []),
  ]
    .map((note) => safeText(note))
    .filter(Boolean);
  const reasons = [...new Set(notes.map(advisoryReasonForNote))];

  return {
    score: typeof input.qualityGate?.score === "number" ? input.qualityGate.score : null,
    notes,
    reasons,
    checkedAt: checkedAt(),
    canImproveLater: notes.length > 0 || input.qualityGate?.accepted === false,
  };
}
