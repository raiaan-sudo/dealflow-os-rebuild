import { createHash } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/lib/supabase/types";
import {
  mergeCampaignPlanDocument,
  readCampaignPlanDocument,
  type CampaignPlanDocument,
} from "@/lib/services/campaign-plan-document";
import { persistCampaignPlanDocumentUpdate } from "@/lib/services/campaign-plan-persistence-service";
import type { CampaignIntent } from "@/lib/campaign-intent";
import {
  buildCreativeUgcScriptDraft,
  normalizeCreativeOfferTitle,
  validateCreativeUgcScriptDraft,
  type CreativeUgcScriptDraft,
  type CreativeUgcScriptValidation,
} from "@/lib/services/creative-ugc-script-service";

export const CREATIVE_CHAT_INTAKE_VERSION = 1;
export const CREATIVE_CHAT_INTAKE_PLAN_KEY = "creative_chat_intake";

export type CreativeIntakeTargetAudience =
  | "sellers"
  | "buyers"
  | "first_time_buyers"
  | "investors"
  | "expired_listings"
  | "custom";

export type CreativeIntakeOffer =
  | "free_home_valuation"
  | "buyer_consultation"
  | "credit_preapproval_help"
  | "listing_consultation"
  | "custom";

export type CreativeIntakeBrand =
  | "remax"
  | "royal_lepage"
  | "exp"
  | "keller_williams"
  | "century_21"
  | "custom";

export type CreativeIntakeStyle =
  | "ugc"
  | "bold_poster_ad"
  | "luxury"
  | "local_expert"
  | "simple_direct_response"
  | "clean_local_expert"
  | "bold_offer_focused"
  | "premium_home_sale_guide";

export type CreativeIntakeApprovalStatus = "draft" | "approved" | "revision_requested";
export type CreativeIntakeOutputMode = "finished_ad" | "background_only";
export type CreativeIntakeGenerationPhase = "static" | "ugc_video" | "static_and_ugc";

export type CreativeIntakeAnswers = {
  targetAudience?: CreativeIntakeTargetAudience;
  customAudience?: string | null;
  offer?: CreativeIntakeOffer;
  customOffer?: string | null;
  offerTitle?: string | null;
  offerMechanism?: string | null;
  brokerageBrand?: CreativeIntakeBrand;
  customBrokerageBrand?: string | null;
  market?: string | null;
  creativeStyle?: CreativeIntakeStyle;
  staticStyle?: "clean_local_expert" | "bold_offer_focused" | "premium_home_sale_guide" | null;
  constraints?: string | null;
  cta?: string | null;
  platformPlacement?: string | null;
  propertyType?: string | null;
  outputMode?: CreativeIntakeOutputMode;
  generationPhase?: CreativeIntakeGenerationPhase;
  targetDurationSeconds?: number | null;
  creatorPersona?: string | null;
  hookAngle?: string | null;
  visualStyle?: string | null;
  pacing?: string | null;
  cameraStyle?: string | null;
  captionOverlayStyle?: string | null;
  referenceExamples?: string | null;
  goodBadExamples?: string | null;
  mustUseLanguage?: string | null;
  mustAvoid?: string | null;
  selectedUgcConceptId?: string | null;
  ugcDefaultStyleAccepted?: boolean;
  ugcApprovedScript?: string | null;
  ugcShotList?: string[] | null;
  ugcOnScreenText?: string[] | null;
  ugcScriptApprovedAt?: string | null;
  ugcScriptVersion?: string | null;
};

export type CreativeIntakeUgcConcept = {
  id: string;
  title: string;
  hook: string;
  script: string;
  shotList: string[];
  overlayPlan: string;
  cta: string;
};

export type CreativeIntakeComplianceExplanation = {
  field: "offer" | "cta" | "constraints";
  originalInput: string;
  blockedPhrase: string;
  reason: string;
  suggestedReplacement: string;
};

export type CreativeIntakeBrief = {
  targetAudience: string;
  offer: string;
  offerTitle: string;
  offerMechanism: string;
  campaignType?: string | null;
  market: string;
  brokerageBrand: string;
  customBrokerageBrand?: string | null;
  propertyType: string;
  creativeStyle: string;
  staticStyle: string;
  platformPlacement: string;
  cta: string;
  mustUseCopy: string[];
  complianceNotes: string[];
  softenedClaims: string[];
  complianceExplanations: CreativeIntakeComplianceExplanation[];
  outputMode: CreativeIntakeOutputMode;
  generationPhase: CreativeIntakeGenerationPhase;
  creativeBriefApprovedAt?: string | null;
  revisionNumber?: number | null;
  briefHash: string;
  staticBriefHash: string;
  offerHash: string;
  ctaHash: string;
  brandHash: string;
  ugcScriptHash: string | null;
  ugcStyleBrief?: {
    resolvedCampaignType?: string | null;
    scriptAngle?: string | null;
    sourceContextHash?: string | null;
    campaignTypeHash?: string | null;
    audienceHash?: string | null;
    marketHash?: string | null;
    offerHash?: string | null;
    leadMagnetHash?: string | null;
    ctaHash?: string | null;
    targetDurationSeconds: number;
    creatorPersona: string;
    hookAngle: string;
    visualStyle: string;
    pacing: string;
    cameraStyle: string;
    captionOverlayStyle: string;
    referenceExamples: string[];
    goodBadExamples: string[];
    mustUseLanguage: string[];
    mustAvoid: string[];
    defaultStyleAccepted: boolean;
    selectedConceptId: string | null;
    concepts: CreativeIntakeUgcConcept[];
    approvedScript: CreativeUgcScriptDraft;
    scriptValidation: CreativeUgcScriptValidation;
    scriptApprovedAt: string | null;
    scriptVersion: string;
  };
  completion: {
    complete: boolean;
    missing: string[];
  };
};

export type CreativeIntakePromptVersion = {
  revisionNumber: number;
  generatedPrompt: string;
  negativePrompt: string;
  sanitizedPreview: string;
  createdAt: string;
};

export type CreativeIntakeGenerationContext = {
  version: number;
  conversationId: string;
  campaignId: string;
  revisionNumber: number;
  approvedAt: string | null;
  outputMode: CreativeIntakeOutputMode;
  generationPhase: CreativeIntakeGenerationPhase;
  requiredOffer?: string | null;
  requiredOfferTitle?: string | null;
  requiredCta?: string | null;
  market?: string | null;
  targetAudience?: string | null;
  brokerageBrand?: string | null;
  campaignType?: string | null;
  propertyType?: string | null;
  staticStyle?: string | null;
  briefHash?: string | null;
  staticBriefHash?: string | null;
  offerHash?: string | null;
  ctaHash?: string | null;
  brandHash?: string | null;
  ugcScriptHash?: string | null;
  ugcStyleBrief?: CreativeIntakeBrief["ugcStyleBrief"] | null;
  promptVersion: CreativeIntakePromptVersion;
};

export type CreativeIntakeMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  createdAt: string;
};

export type CreativeIntakeRevisionSnapshot = {
  revisionNumber: number;
  approvalStatus: CreativeIntakeApprovalStatus;
  brief: CreativeIntakeBrief | null;
  promptVersion: CreativeIntakePromptVersion | null;
  createdAt: string;
  approvedAt?: string | null;
};

export type CreativeChatIntakeState = {
  version: number;
  conversationId: string;
  campaignId: string;
  approvalStatus: CreativeIntakeApprovalStatus;
  revisionNumber: number;
  answers: CreativeIntakeAnswers;
  brief: CreativeIntakeBrief | null;
  promptVersion: CreativeIntakePromptVersion | null;
  messages: CreativeIntakeMessage[];
  previousRevisions?: CreativeIntakeRevisionSnapshot[];
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
};

export type CreativeIntakeCampaignDefaults = {
  campaignId: string;
  market?: string | null;
  audience?: string | null;
  offer?: string | null;
  propertyType?: string | null;
  campaignType?: CampaignIntent | string | null;
  cta?: string | null;
  brand?: string | null;
  languageCode?: string | null;
};

const targetAudienceLabels: Record<CreativeIntakeTargetAudience, string> = {
  sellers: "Sellers",
  buyers: "Buyers",
  first_time_buyers: "First-time buyers",
  investors: "Investors",
  expired_listings: "Expired listings",
  custom: "Custom audience",
};

const offerLabels: Record<CreativeIntakeOffer, string> = {
  free_home_valuation: "Free home valuation",
  buyer_consultation: "Buyer consultation",
  credit_preapproval_help: "Credit or pre-approval help",
  listing_consultation: "Listing consultation",
  custom: "Custom offer",
};

const brandLabels: Record<CreativeIntakeBrand, string> = {
  remax: "RE/MAX",
  royal_lepage: "Royal LePage",
  exp: "eXp",
  keller_williams: "Keller Williams",
  century_21: "Century 21",
  custom: "Custom brokerage brand",
};

const styleLabels: Record<CreativeIntakeStyle, string> = {
  ugc: "UGC native social",
  bold_poster_ad: "Bold direct-response layout composed by DealFlow",
  luxury: "Luxury real estate",
  local_expert: "Local expert",
  simple_direct_response: "Simple direct-response",
  clean_local_expert: "Clean Local Expert",
  bold_offer_focused: "Bold Offer Focused",
  premium_home_sale_guide: "Premium Home Sale Guide",
};

export const creativeIntakeAnswersSchema = z.object({
  targetAudience: z.enum(["sellers", "buyers", "first_time_buyers", "investors", "expired_listings", "custom"]).optional(),
  customAudience: z.string().max(220).nullable().optional(),
  offer: z.enum(["free_home_valuation", "buyer_consultation", "credit_preapproval_help", "listing_consultation", "custom"]).optional(),
  customOffer: z.string().max(260).nullable().optional(),
  offerTitle: z.string().max(120).nullable().optional(),
  offerMechanism: z.string().max(320).nullable().optional(),
  brokerageBrand: z.enum(["remax", "royal_lepage", "exp", "keller_williams", "century_21", "custom"]).optional(),
  customBrokerageBrand: z.string().max(160).nullable().optional(),
  market: z.string().max(160).nullable().optional(),
  creativeStyle: z.enum(["ugc", "bold_poster_ad", "luxury", "local_expert", "simple_direct_response", "clean_local_expert", "bold_offer_focused", "premium_home_sale_guide"]).optional(),
  staticStyle: z.enum(["clean_local_expert", "bold_offer_focused", "premium_home_sale_guide"]).nullable().optional(),
  constraints: z.string().max(800).nullable().optional(),
  cta: z.string().max(80).nullable().optional(),
  platformPlacement: z.string().max(120).nullable().optional(),
  propertyType: z.string().max(160).nullable().optional(),
  outputMode: z.enum(["finished_ad", "background_only"]).optional(),
  generationPhase: z.enum(["static", "ugc_video", "static_and_ugc"]).optional(),
  targetDurationSeconds: z.coerce.number().int().min(15).max(30).nullable().optional(),
  creatorPersona: z.string().max(220).nullable().optional(),
  hookAngle: z.string().max(220).nullable().optional(),
  visualStyle: z.string().max(260).nullable().optional(),
  pacing: z.string().max(180).nullable().optional(),
  cameraStyle: z.string().max(180).nullable().optional(),
  captionOverlayStyle: z.string().max(220).nullable().optional(),
  referenceExamples: z.string().max(1200).nullable().optional(),
  goodBadExamples: z.string().max(1200).nullable().optional(),
  mustUseLanguage: z.string().max(800).nullable().optional(),
  mustAvoid: z.string().max(800).nullable().optional(),
  selectedUgcConceptId: z.string().max(120).nullable().optional(),
  ugcDefaultStyleAccepted: z.boolean().optional(),
  ugcApprovedScript: z.string().max(1600).nullable().optional(),
  ugcShotList: z.array(z.string().max(180)).max(8).nullable().optional(),
  ugcOnScreenText: z.array(z.string().max(120)).max(6).nullable().optional(),
  ugcScriptApprovedAt: z.string().max(80).nullable().optional(),
  ugcScriptVersion: z.string().max(120).nullable().optional(),
});

export function creativeIntakeIncludesStatic(phase?: CreativeIntakeGenerationPhase | string | null) {
  return phase === "static" || phase === "static_and_ugc";
}

export function creativeIntakeIncludesUgcVideo(phase?: CreativeIntakeGenerationPhase | string | null) {
  return phase === "ugc_video" || phase === "static_and_ugc";
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function sha256Short(value: unknown) {
  return createHash("sha256")
    .update(stableStringify(value))
    .digest("hex")
    .slice(0, 24);
}

function buildCreativeBriefHashSet(params: {
  campaignType?: string | null;
  offerTitle: string;
  cta: string;
  targetAudience: string;
  market: string;
  brokerageBrand: string;
  propertyType: string;
  staticStyle: string;
  ugcStyleBrief?: CreativeIntakeBrief["ugcStyleBrief"] | null;
}) {
  const ugcScriptHash = params.ugcStyleBrief
    ? sha256Short({
        lines: params.ugcStyleBrief.approvedScript.lines,
        shotList: params.ugcStyleBrief.approvedScript.shotList,
        onScreenText: params.ugcStyleBrief.approvedScript.onScreenText,
        version: params.ugcStyleBrief.scriptVersion,
        sourceContextHash: params.ugcStyleBrief.sourceContextHash ?? params.ugcStyleBrief.approvedScript.contextHash ?? null,
        resolvedCampaignType: params.ugcStyleBrief.resolvedCampaignType ?? params.ugcStyleBrief.approvedScript.campaignType ?? null,
      })
    : null;
  const offerHash = sha256Short({ offerTitle: params.offerTitle });
  const ctaHash = sha256Short({ cta: params.cta });
  const brandHash = sha256Short({ brokerageBrand: params.brokerageBrand });
  const staticBriefHash = sha256Short({
    offerTitle: params.offerTitle,
    cta: params.cta,
    targetAudience: params.targetAudience,
    market: params.market,
    brokerageBrand: params.brokerageBrand,
    propertyType: params.propertyType,
    staticStyle: params.staticStyle,
  });
  const briefHash = sha256Short({
    campaignType: params.campaignType ?? null,
    offerTitle: params.offerTitle,
    cta: params.cta,
    targetAudience: params.targetAudience,
    market: params.market,
    brokerageBrand: params.brokerageBrand,
    propertyType: params.propertyType,
    staticStyle: params.staticStyle,
    ugcTargetLength: params.ugcStyleBrief?.targetDurationSeconds ?? null,
    ugcCreatorPersona: params.ugcStyleBrief?.creatorPersona ?? null,
    ugcHookAngle: params.ugcStyleBrief?.hookAngle ?? null,
    ugcVisualStyle: params.ugcStyleBrief?.visualStyle ?? null,
    ugcSourceContextHash: params.ugcStyleBrief?.sourceContextHash ?? params.ugcStyleBrief?.approvedScript.contextHash ?? null,
    ugcScriptHash,
  });

  return {
    briefHash,
    staticBriefHash,
    offerHash,
    ctaHash,
    brandHash,
    ugcScriptHash,
  };
}

export function hydrateCreativeIntakeBriefHashes(
  brief: CreativeIntakeBrief,
  fallback?: { campaignType?: string | null; revisionNumber?: number | null; approvedAt?: string | null },
): CreativeIntakeBrief {
  const staticStyle = brief.staticStyle || brief.creativeStyle;
  const hashes = buildCreativeBriefHashSet({
    campaignType: brief.campaignType ?? fallback?.campaignType ?? null,
    offerTitle: brief.offerTitle || brief.offer,
    cta: brief.cta,
    targetAudience: brief.targetAudience,
    market: brief.market,
    brokerageBrand: brief.brokerageBrand,
    propertyType: brief.propertyType,
    staticStyle,
    ugcStyleBrief: brief.ugcStyleBrief ?? null,
  });

  return {
    ...brief,
    staticStyle,
    briefHash: brief.briefHash || hashes.briefHash,
    staticBriefHash: brief.staticBriefHash || hashes.staticBriefHash,
    offerHash: brief.offerHash || hashes.offerHash,
    ctaHash: brief.ctaHash || hashes.ctaHash,
    brandHash: brief.brandHash || hashes.brandHash,
    ugcScriptHash: brief.ugcScriptHash || hashes.ugcScriptHash,
    creativeBriefApprovedAt: brief.creativeBriefApprovedAt ?? fallback?.approvedAt ?? null,
    revisionNumber: brief.revisionNumber ?? fallback?.revisionNumber ?? null,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function messageId() {
  return crypto.randomUUID();
}

export function isCreativeChatIntakeEnabled() {
  return (
    process.env.CREATIVE_CHAT_INTAKE_ENABLED !== "false" &&
    process.env.NEXT_PUBLIC_ENABLE_CREATIVE_CHAT_INTAKE !== "false"
  );
}

function resolveAnswerLabel<T extends string>(
  value: T | undefined,
  labels: Record<T, string>,
  customValue?: string | null,
  fallback?: string | null,
) {
  if (value === "custom" && safeText(customValue)) {
    return safeText(customValue);
  }

  if (value && labels[value]) {
    return labels[value];
  }

  return safeText(fallback) || "";
}

function splitConstraints(value: string) {
  return value
    .split(/[.;\n]+/)
    .map((item) => safeText(item))
    .filter(Boolean)
    .slice(0, 8);
}

function splitReferenceLines(value: string) {
  return value
    .split(/[\n]+/)
    .map((item) => safeText(item))
    .filter(Boolean)
    .slice(0, 5);
}

function splitMultilineText(value: unknown) {
  return typeof value === "string"
    ? value.split(/\n+/).map((line) => safeText(line)).filter(Boolean)
    : [];
}

export function buildUgcConceptOptions(params: {
  market: string;
  targetAudience: string;
  offer: string;
  cta: string;
  persona: string;
  hookAngle: string;
  pacing: string;
  captionOverlayStyle: string;
}): CreativeIntakeUgcConcept[] {
  const market = safeText(params.market) || "your local market";
  const audience = safeText(params.targetAudience) || "buyers";
  const offer = safeText(params.offer) || "review options this week";
  const cta = safeText(params.cta) || "Book a 15-minute strategy call this week";
  const persona = safeText(params.persona) || "trusted local real estate guide";
  const hookAngle = safeText(params.hookAngle) || "buyers miss options before they hit public search";
  const pacing = safeText(params.pacing) || "fast hook, clear middle, calm CTA";
  const overlays = safeText(params.captionOverlayStyle) || "large readable captions";

  return [
    {
      id: "ugc-concept-market-myth",
      title: "Market myth opener",
      hook: `Most ${audience.toLowerCase()} in ${market} are missing homes before they ever hit their search alerts.`,
      script: `${persona} opens with the market myth, explains the buyer pain in plain language, shows how DealFlow filters matching homes and affordability context, then invites viewers to ${cta.toLowerCase()}.`,
      shotList: [
        "Creator opens direct-to-camera with a strong two-second hook.",
        "Cut to natural home or neighborhood context tied to the market.",
        "Show simple, readable captions for the mechanism and offer.",
        "Close with the CTA delivered calmly and clearly.",
      ],
      overlayPlan: `${overlays}; no tiny captions, no fake dashboards, no cropped CTA.`,
      cta,
    },
    {
      id: "ugc-concept-affordability-reality-check",
      title: "Affordability reality check",
      hook: `If your budget feels tight in ${market}, the next move is not guessing. It is checking the right matches this week.`,
      script: `${persona} frames the affordability problem, softens any qualification language, explains the ${offer.toLowerCase()} mechanism, and makes the viewer feel they can take one low-pressure next step.`,
      shotList: [
        "Creator starts with the affordability pain point.",
        "Cut to phone-camera walkthrough energy, not a polished stock montage.",
        "Use one proof/support caption and one CTA caption.",
        "End with the offer and the CTA in the final three seconds.",
      ],
      overlayPlan: `${overlays}; keep copy sparse and mobile-feed readable.`,
      cta,
    },
    {
      id: "ugc-concept-private-shortlist",
      title: "Private shortlist walkthrough",
      hook: `Before you scroll another listing site, get a sharper ${market} shortlist built around what actually fits.`,
      script: `${persona} uses ${pacing.toLowerCase()} to walk through the private shortlist angle, connects it to ${audience.toLowerCase()}, and closes with the campaign CTA without sounding like a generic sample ad.`,
      shotList: [
        "Creator opens in a natural real estate setting.",
        "Show movement through a home, street, or desk setup for context.",
        "Caption the shortlist mechanism and the timing context.",
        "End direct-to-camera with the CTA.",
      ],
      overlayPlan: `${overlays}; no listing-sheet UI, no fake app screens, no gibberish text.`,
      cta,
    },
  ];
}

export function softenRegulatedClaims(value: string) {
  const originalInput = safeText(value);
  let text = safeText(value);
  const softenedClaims: string[] = [];
  const explanations: Omit<CreativeIntakeComplianceExplanation, "field">[] = [];

  if (!text) {
    return { text, softenedClaims, explanations };
  }

  const replacements: Array<[RegExp, string | ((match: RegExpExecArray) => string), string, string]> = [
    [
      /\bguaranteed\s+approval\s+for\s+([0-9]{3}\+?)\s+credit\b/gi,
      (match) => `Home Options for ${match[1]} Credit`,
      "Softened credit approval guarantee.",
      "Guaranteed approval language is not allowed for housing or financing-related ads.",
    ],
    [
      /\bapproved\s+with\s+([0-9]{3}\+?)\s+credit\b/gi,
      (match) => `Home Options for ${match[1]} Credit`,
      "Softened credit approval claim.",
      "Approval claims must be framed as options or qualification review, not promised outcomes.",
    ],
	    [
	      /\bguaranteed\s+approval\b/gi,
	      "see what you may qualify for",
	      "Softened guaranteed approval language.",
	      "Guaranteed approval language is not allowed for housing or financing-related ads.",
	    ],
	    [
	      /\bguarantee(?:d)?\s+(?:to\s+)?sell\s+(?:your\s+)?home\s+(?:in|within)\s+(?:the\s+next\s+)?([0-9]{1,3})\s+days?\b/gi,
	      (match) => `${match[1]}-Day Home Sale Plan`,
	      "Softened guaranteed sale claim.",
	      "Guaranteed sale language is not allowed; the offer can describe a sale plan without promising the outcome.",
	    ],
	    [
	      /\bguaranteed\s+sale\b/gi,
	      "home sale plan",
	      "Softened guaranteed sale claim.",
	      "Guaranteed sale language is not allowed; the offer can describe a sale plan without promising the outcome.",
	    ],
	  ];

  for (const [pattern, replacement, note, reason] of replacements) {
    pattern.lastIndex = 0;
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      const firstMatch = matches[0];
      const suggestedReplacement =
        typeof replacement === "function" ? replacement(firstMatch) : replacement;
      text = text.replace(pattern, (...args) => {
        const match = args.slice(0, -2) as string[];
        return typeof replacement === "function"
          ? replacement(match as unknown as RegExpExecArray)
          : replacement;
      });
      softenedClaims.push(note);
      explanations.push({
        originalInput,
        blockedPhrase: firstMatch[0],
        reason,
        suggestedReplacement,
      });
    }
  }

  return { text, softenedClaims, explanations };
}

export function buildCreativeIntakeBrief(
  answers: CreativeIntakeAnswers,
  defaults: CreativeIntakeCampaignDefaults,
): CreativeIntakeBrief {
  const offerRaw = resolveAnswerLabel(answers.offer, offerLabels, answers.customOffer, defaults.offer);
  const offerTitle = normalizeCreativeOfferTitle({
    value: safeText(answers.offerTitle) || offerRaw,
    campaignType: defaults.campaignType,
    audience: defaults.audience,
  });
  const offerMechanism = safeText(answers.offerMechanism) || safeText(offerRaw);
  const ctaRaw = safeText(answers.cta) || safeText(defaults.cta) || "See My Options";
  const constraints = safeText(answers.constraints);
  const softenedOffer = softenRegulatedClaims(offerTitle);
  const softenedCta = softenRegulatedClaims(ctaRaw);
  const softenedConstraints = softenRegulatedClaims(constraints);
  const market = safeText(answers.market) || safeText(defaults.market);
  const targetAudience = resolveAnswerLabel(
    answers.targetAudience,
    targetAudienceLabels,
    answers.customAudience,
    defaults.audience,
  );
  const brokerageBrand = resolveAnswerLabel(
    answers.brokerageBrand,
    brandLabels,
    answers.customBrokerageBrand,
    defaults.brand,
  );
  const creativeStyle = answers.staticStyle
    ? styleLabels[answers.staticStyle]
    : answers.creativeStyle
      ? styleLabels[answers.creativeStyle]
      : "";
  const staticStyle = creativeStyle;
  const propertyType = safeText(answers.propertyType) || safeText(defaults.propertyType) || "real estate";
  const platformPlacement = safeText(answers.platformPlacement) || "Meta feed and story placements";
  const outputMode = answers.outputMode === "background_only" ? "background_only" : "finished_ad";
  const generationPhase = answers.generationPhase === "ugc_video" || answers.generationPhase === "static_and_ugc"
    ? answers.generationPhase
    : "static";
  const targetDurationSeconds =
    typeof answers.targetDurationSeconds === "number" && Number.isFinite(answers.targetDurationSeconds)
      ? Math.min(30, Math.max(15, Math.round(answers.targetDurationSeconds)))
      : 20;
  const offer = softenedOffer.text;
  const cta = softenedCta.text;
  const ugcReferenceExamples = splitReferenceLines(answers.referenceExamples ?? "");
  const ugcDefaultStyleAccepted = answers.ugcDefaultStyleAccepted === true;
  const selectedUgcConceptId = safeText(answers.selectedUgcConceptId) || null;
  const ugcPersona = safeText(answers.creatorPersona) || "trusted local real estate agent or relatable buyer guide";
  const ugcHookAngle = safeText(answers.hookAngle) || "first two seconds call out the buyer pain directly";
  const ugcPacing = safeText(answers.pacing) || "fast hook, clear middle, calm CTA";
  const ugcCaptionOverlayStyle = safeText(answers.captionOverlayStyle) || "large readable captions only when useful";
  const draftScript = buildCreativeUgcScriptDraft({
    campaignType: defaults.campaignType,
    audience: targetAudience,
    market,
    offerTitle: offer,
    offerMechanism,
    cta,
    propertyType,
    targetDurationSeconds,
    creatorPersona: ugcPersona,
    hookAngle: ugcHookAngle,
    visualStyle: safeText(answers.visualStyle) || "Talking-head with local captions",
  });
  const approvedScriptLines = splitMultilineText(answers.ugcApprovedScript).length > 0
    ? splitMultilineText(answers.ugcApprovedScript)
    : draftScript.lines;
  const approvedScript: CreativeUgcScriptDraft = {
    ...draftScript,
    lines: approvedScriptLines,
    hook: approvedScriptLines[0] || draftScript.hook,
    problem: approvedScriptLines[1] || draftScript.problem,
    offer: approvedScriptLines[2] || draftScript.offer,
    mechanism: approvedScriptLines[3] || draftScript.mechanism,
    proof: approvedScriptLines[4] || draftScript.proof,
    cta: approvedScriptLines[5] || draftScript.cta,
    body: approvedScriptLines.slice(1, -1).join(" ") || draftScript.body,
    fullScript: approvedScriptLines.join(" ") || draftScript.fullScript,
    shotList: Array.isArray(answers.ugcShotList) && answers.ugcShotList.length > 0
      ? answers.ugcShotList.map((line) => safeText(line)).filter(Boolean).slice(0, 8)
      : draftScript.shotList,
    onScreenText: Array.isArray(answers.ugcOnScreenText) && answers.ugcOnScreenText.length > 0
      ? answers.ugcOnScreenText.map((line) => safeText(line)).filter(Boolean).slice(0, 6)
      : draftScript.onScreenText,
    version: safeText(answers.ugcScriptVersion) || draftScript.version,
  };
  const scriptValidation = validateCreativeUgcScriptDraft({
    script: approvedScript,
    campaignType: defaults.campaignType,
    audience: targetAudience,
    market,
    offerTitle: offer,
    cta,
    propertyType,
  });
  const ugcConcepts = buildUgcConceptOptions({
    market,
    targetAudience,
    offer,
    cta,
    persona: ugcPersona,
    hookAngle: ugcHookAngle,
    pacing: ugcPacing,
    captionOverlayStyle: ugcCaptionOverlayStyle,
  });
  const ugcStyleBrief = creativeIntakeIncludesUgcVideo(generationPhase)
    ? {
        resolvedCampaignType: approvedScript.campaignType,
        scriptAngle: approvedScript.scriptAngle,
        sourceContextHash: approvedScript.contextHash,
        campaignTypeHash: sha256Short({ campaignType: defaults.campaignType ?? null }),
        audienceHash: sha256Short({ targetAudience }),
        marketHash: sha256Short({ market }),
        offerHash: sha256Short({ offer }),
        leadMagnetHash: sha256Short({ leadMagnet: offer }),
        ctaHash: sha256Short({ cta }),
        targetDurationSeconds,
        creatorPersona: ugcPersona,
        hookAngle: ugcHookAngle,
        visualStyle: safeText(answers.visualStyle) || "native vertical social video with real homebuyer context",
        pacing: ugcPacing,
        cameraStyle: safeText(answers.cameraStyle) || "phone-camera creator POV with natural movement",
        captionOverlayStyle: ugcCaptionOverlayStyle,
        referenceExamples: ugcReferenceExamples,
        goodBadExamples: splitReferenceLines(answers.goodBadExamples ?? ""),
        mustUseLanguage: splitConstraints(safeText(answers.mustUseLanguage)),
        mustAvoid: splitConstraints(safeText(answers.mustAvoid)),
        defaultStyleAccepted: ugcDefaultStyleAccepted,
        selectedConceptId: selectedUgcConceptId,
        concepts: ugcConcepts,
        approvedScript,
        scriptValidation,
        scriptApprovedAt: safeText(answers.ugcScriptApprovedAt) || null,
        scriptVersion: approvedScript.version,
      }
    : undefined;
  const missing = [
    targetAudience ? null : "target_audience",
    offer ? null : "offer",
    market ? null : "market",
    brokerageBrand ? null : "brokerage_brand",
    creativeStyle ? null : "creative_style",
    creativeIntakeIncludesUgcVideo(generationPhase) && !scriptValidation.accepted
      ? "ugc_script_quality"
      : null,
    creativeIntakeIncludesUgcVideo(generationPhase) && !safeText(answers.ugcScriptApprovedAt)
      ? "ugc_script_approval"
      : null,
  ].filter((item): item is string => Boolean(item));
  const hashes = buildCreativeBriefHashSet({
    campaignType: defaults.campaignType ?? null,
    offerTitle: offer,
    cta,
    targetAudience,
    market,
    brokerageBrand,
    propertyType,
    staticStyle,
    ugcStyleBrief,
  });
  const complianceExplanations: CreativeIntakeComplianceExplanation[] = [
    ...softenedOffer.explanations.map((item) => ({ ...item, field: "offer" as const })),
    ...softenedCta.explanations.map((item) => ({ ...item, field: "cta" as const })),
    ...softenedConstraints.explanations.map((item) => ({ ...item, field: "constraints" as const })),
  ];

  return {
    targetAudience,
    offer,
    offerTitle: offer,
    offerMechanism,
    campaignType: safeText(defaults.campaignType),
    market,
    brokerageBrand,
    customBrokerageBrand: answers.brokerageBrand === "custom" ? safeText(answers.customBrokerageBrand) : null,
    propertyType,
    creativeStyle,
    staticStyle,
    platformPlacement,
    cta,
    mustUseCopy: splitConstraints(softenedConstraints.text).filter((item) => !/disclaim|not guarantee|subject to/i.test(item)),
    complianceNotes: [
      ...splitConstraints(softenedConstraints.text).filter((item) => /disclaim|not guarantee|subject to|may qualify|approval|credit/i.test(item)),
      ...softenedOffer.softenedClaims,
      ...softenedCta.softenedClaims,
      ...softenedConstraints.softenedClaims,
    ].slice(0, 10),
    softenedClaims: [
      ...softenedOffer.softenedClaims,
      ...softenedCta.softenedClaims,
      ...softenedConstraints.softenedClaims,
    ],
    complianceExplanations,
    outputMode,
    generationPhase,
    creativeBriefApprovedAt: null,
    revisionNumber: null,
    briefHash: hashes.briefHash,
    staticBriefHash: hashes.staticBriefHash,
    offerHash: hashes.offerHash,
    ctaHash: hashes.ctaHash,
    brandHash: hashes.brandHash,
    ugcScriptHash: hashes.ugcScriptHash,
    ugcStyleBrief,
    completion: {
      complete: missing.length === 0,
      missing,
    },
  };
}

export function buildCreativeIntakePromptVersion(
  brief: CreativeIntakeBrief,
  revisionNumber: number,
): CreativeIntakePromptVersion {
  const approvedUgcScript = brief.ugcStyleBrief?.approvedScript ?? null;
  const ugcPromptSection = brief.ugcStyleBrief
    ? [
      "MARKETING STUDIO AI UGC VIDEO BRIEF.",
      "Render the approved customer-reviewed UGC script and shot list. Do not invent a new offer, rewrite the campaign strategy, or create alternate concepts.",
      `Target duration: ${brief.ugcStyleBrief.targetDurationSeconds} seconds, within the 15-30 second launch-quality range. Do not create a 5-second sample, teaser, reused stock clip, or placeholder.`,
      "Keep the first two seconds focused on the approved hook, then follow the approved problem, mechanism, proof, offer, and CTA sequence.",
      `Market/city context: ${brief.market}.`,
      `Audience: ${brief.targetAudience}.`,
      `Offer title: ${brief.offerTitle}.`,
      brief.offerMechanism ? `Internal mechanism context: ${brief.offerMechanism}.` : null,
      `CTA: ${brief.cta}.`,
      `Creator/agent persona: ${brief.ugcStyleBrief.creatorPersona}.`,
      `Hook angle: ${brief.ugcStyleBrief.hookAngle}.`,
      `Visual style: ${brief.ugcStyleBrief.visualStyle}.`,
      `Pacing: ${brief.ugcStyleBrief.pacing}.`,
      `Camera style: ${brief.ugcStyleBrief.cameraStyle}.`,
      `Caption/overlay style: ${brief.ugcStyleBrief.captionOverlayStyle}.`,
      approvedUgcScript
        ? `Approved script lines: ${approvedUgcScript.lines.join(" / ")}. Approved shot list: ${approvedUgcScript.shotList.join(" / ")}. On-screen text: ${approvedUgcScript.onScreenText.join(" / ")}. Script version: ${brief.ugcStyleBrief.scriptVersion}.`
        : "No approved UGC script exists; keep the brief in revision and do not render.",
      brief.ugcStyleBrief.referenceExamples.length > 0
        ? `Reference examples: ${brief.ugcStyleBrief.referenceExamples.join(" | ")}.`
        : "Reference examples: user accepted the default native social UGC style.",
      brief.ugcStyleBrief.goodBadExamples.length > 0
        ? `Good/bad output notes: ${brief.ugcStyleBrief.goodBadExamples.join(" | ")}.`
        : null,
      brief.ugcStyleBrief.mustUseLanguage.length > 0
        ? `Must-use language: ${brief.ugcStyleBrief.mustUseLanguage.join("; ")}.`
        : null,
      brief.ugcStyleBrief.mustAvoid.length > 0
        ? `Must-avoid constraints: ${brief.ugcStyleBrief.mustAvoid.join("; ")}.`
        : null,
      "Reject repetitive script delivery, generic creator output, awkward pacing, tiny overlays, mismatched CTAs, fake dashboards, fake listing sheets, unsupported guarantees, fake testimonials, invented logos, and anything that looks like a sample clip.",
    ].filter(Boolean).join(" ")
    : "";
  const staticPromptSection = brief.outputMode === "finished_ad"
    ? [
      "MARKETING STUDIO FINISHED AD CREATIVE.",
      "Create ONE polished finished real-estate social ad poster, not a chart, not a dashboard, not a listing sheet, not a web/app UI screenshot.",
	      "Use a clean premium poster layout with this exact hierarchy: short headline, exact approved offer, one concise proof/support line, and one clear CTA button or CTA bar.",
      "Media-buyer reference layout: one dominant hook area, one proof area, strong negative space, and a clear CTA-safe zone.",
      "Keep all text large and mobile-feed readable. Use generous safe margins on all sides, no tiny text, no cropped CTA, no overlapping panels, and no text over busy image detail.",
      `Market/city text that should appear: ${brief.market}.`,
      `Audience text context: ${brief.targetAudience}.`,
      `Required offer text that must be readable in the final raster: ${brief.offerTitle}.`,
      `Required CTA text that must be readable in the final raster: ${brief.cta}.`,
      `Brokerage or brand direction: ${brief.brokerageBrand}. Brand/logo text is optional; if exact brand rendering is uncertain, omit it. If brand text is used, spell it exactly and do not invent or approximate logos.`,
      `Property focus: ${brief.propertyType}.`,
      `Creative style: ${brief.creativeStyle}.`,
      `Approved creative brief hash: ${brief.staticBriefHash}.`,
      `Placement: ${brief.platformPlacement}.`,
      brief.mustUseCopy.length > 0 ? `Must-use copy: ${brief.mustUseCopy.join("; ")}.` : null,
      "The final image should look like a high-performing real estate Facebook/Instagram ad made in a marketing studio, with no spreadsheet/table/grid/data-panel visuals.",
      "Use clean typography, realistic real estate imagery, clear text hierarchy, and a direct-response CTA. Keep text short enough to be legible at mobile feed size.",
      "Do not create gibberish, pseudo text, misspell visible brokerage text, invent fake MLS/listing sheets, show dashboards, charts, tables, app UI, landing pages, data panels, tiny text, unreadable pricing cards, or broken text.",
      "Do not invent logos, guaranteed-approval claims, guaranteed financing, or any compliance-sensitive promise beyond the required offer text.",
      brief.complianceNotes.length > 0
        ? `Compliance guidance: ${brief.complianceNotes.join("; ")}.`
        : null,
    ].filter(Boolean).join(" ")
    : [
    "TEXT-FREE BACKGROUND ASSET ONLY.",
    "Create realistic premium real-estate source photography for DealFlow to compose into a finished ad later.",
    `Market: ${brief.market}.`,
    `Audience: ${brief.targetAudience}.`,
    `Offer context: ${brief.offer}.`,
    `Brokerage or brand direction: ${brief.brokerageBrand}.`,
    `Property focus: ${brief.propertyType}.`,
    `Creative style: ${brief.creativeStyle}.`,
    `Placement: ${brief.platformPlacement}.`,
    "Use visual context, lighting, environment, and subject choice to imply the offer; do not render the final ad.",
    "DealFlow will render the actual headline, CTA, proof chips, badges, labels, and layout after generation.",
    "Do not include readable text, pseudo text, typography, logos, watermarks, UI, dashboards, charts, tables, listing sheets, flyers, brochures, posters, CTA buttons, captions, forms, price cards, or finished-ad layouts.",
    brief.complianceNotes.length > 0
      ? `Compliance guidance: avoid hard guarantees and keep the visual supportive of this softened claim context: ${brief.complianceNotes.join("; ")}.`
      : null,
  ].filter(Boolean).join(" ");
  const generatedPrompt = brief.generationPhase === "ugc_video"
    ? ugcPromptSection
    : brief.generationPhase === "static_and_ugc"
      ? [
          "MARKETING STUDIO COMBINED STATIC + AI UGC BRIEF.",
          staticPromptSection,
          ugcPromptSection,
        ].filter(Boolean).join(" ")
      : staticPromptSection;
  const negativePrompt = [
    brief.outputMode === "finished_ad" ? null : "text",
    brief.outputMode === "finished_ad" ? null : "letters",
    brief.outputMode === "finished_ad" ? null : "numbers",
    "gibberish typography",
    "logo text",
    "watermark",
    brief.outputMode === "finished_ad" ? null : "finished ad",
    brief.outputMode === "finished_ad" ? null : "flyer",
    brief.outputMode === "finished_ad" ? null : "brochure",
    brief.outputMode === "finished_ad" ? null : "poster",
    "dashboard",
    "UI screenshot",
    "chart",
    "table",
    "listing sheet",
    brief.outputMode === "finished_ad" ? null : "CTA button",
    "fake caption",
    "fake price",
    "fake form fields",
  ].filter(Boolean).join("; ");

  return {
    revisionNumber,
    generatedPrompt,
    negativePrompt,
    sanitizedPreview: [
      `${brief.creativeStyle} creative for ${brief.targetAudience} in ${brief.market}`,
      `Offer: ${brief.offerTitle}`,
      `Brand direction: ${brief.brokerageBrand}`,
      brief.outputMode === "finished_ad" ? `CTA in raster: ${brief.cta}` : `CTA DealFlow will render: ${brief.cta}`,
      `Brief hash: ${brief.staticBriefHash}`,
      creativeIntakeIncludesUgcVideo(brief.generationPhase) && brief.ugcStyleBrief
        ? `UGC duration: ${brief.ugcStyleBrief.targetDurationSeconds}s`
        : null,
      approvedUgcScript ? `Approved UGC script: ${brief.ugcStyleBrief?.scriptVersion ?? approvedUgcScript.version}` : null,
    ].join(" | "),
    createdAt: nowIso(),
  };
}

export function createCreativeIntakeState(params: {
  campaignId: string;
  defaults: CreativeIntakeCampaignDefaults;
  answers?: CreativeIntakeAnswers;
}): CreativeChatIntakeState {
  const answers = creativeIntakeAnswersSchema.parse(params.answers ?? {});
  const brief = buildCreativeIntakeBrief(answers, params.defaults);
  const timestamp = nowIso();

  return {
    version: CREATIVE_CHAT_INTAKE_VERSION,
    conversationId: crypto.randomUUID(),
    campaignId: params.campaignId,
    approvalStatus: "draft",
    revisionNumber: 0,
    answers,
    brief,
    promptVersion: null,
    messages: buildMessagesFromAnswers(answers),
    createdAt: timestamp,
    updatedAt: timestamp,
    approvedAt: null,
  };
}

function buildMessagesFromAnswers(answers: CreativeIntakeAnswers): CreativeIntakeMessage[] {
  const timestamp = nowIso();
  const entries = [
    ["Who are you targeting?", resolveAnswerLabel(answers.targetAudience, targetAudienceLabels, answers.customAudience)],
    ["What offer are you promoting?", safeText(answers.offerTitle) || resolveAnswerLabel(answers.offer, offerLabels, answers.customOffer)],
    ["What brokerage or brand should this match?", resolveAnswerLabel(answers.brokerageBrand, brandLabels, answers.customBrokerageBrand)],
    ["What city or market is this for?", safeText(answers.market)],
    ["What creative style do you want?", answers.creativeStyle ? styleLabels[answers.creativeStyle] : ""],
    [
      "What are you creating now?",
      answers.generationPhase === "static_and_ugc"
        ? "Static ads and AI UGC video ads"
        : answers.generationPhase === "ugc_video"
          ? "AI UGC video ads"
          : "Static ads",
    ],
    ["Is the UGC script approved?", safeText(answers.ugcScriptApprovedAt) ? "UGC script approved" : ""],
    ["Any must-have copy or compliance constraints?", safeText(answers.constraints)],
  ].filter(([, answer]) => Boolean(answer));

  return entries.flatMap(([question, answer]) => [
    {
      id: messageId(),
      role: "assistant" as const,
      content: question,
      createdAt: timestamp,
    },
    {
      id: messageId(),
      role: "user" as const,
      content: answer,
      createdAt: timestamp,
    },
  ]);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function readCreativeChatIntakeFromPlan(planValue: unknown): CreativeChatIntakeState | null {
  const plan = readCampaignPlanDocument(planValue);
  const raw = asObject(plan[CREATIVE_CHAT_INTAKE_PLAN_KEY]);

  if (!raw || raw.version !== CREATIVE_CHAT_INTAKE_VERSION || typeof raw.campaignId !== "string") {
    return null;
  }

  const intake = raw as CreativeChatIntakeState;

  if (!intake.brief) {
    return intake;
  }

  return {
    ...intake,
    brief: hydrateCreativeIntakeBriefHashes(intake.brief, {
      campaignType: intake.brief.campaignType ?? null,
      revisionNumber: intake.revisionNumber,
      approvedAt: intake.approvedAt ?? null,
    }),
  };
}

export function isCreativeIntakeApproved(planValue: unknown) {
  return Boolean(getApprovedCreativeIntakeGenerationContext(planValue));
}

export function getApprovedCreativeIntakeGenerationContext(
  planValue: unknown,
): CreativeIntakeGenerationContext | null {
  const intake = readCreativeChatIntakeFromPlan(planValue);

  if (
    intake?.approvalStatus !== "approved" ||
    intake.brief?.completion.complete !== true ||
    !intake.promptVersion?.generatedPrompt
  ) {
    return null;
  }

  return {
    version: intake.version,
    conversationId: intake.conversationId,
    campaignId: intake.campaignId,
    revisionNumber: intake.revisionNumber,
    approvedAt: intake.approvedAt ?? null,
    outputMode: intake.brief.outputMode,
    generationPhase: intake.brief.generationPhase,
    requiredOffer: intake.brief.offer,
    requiredOfferTitle: intake.brief.offerTitle,
    requiredCta: intake.brief.cta,
    market: intake.brief.market,
    targetAudience: intake.brief.targetAudience,
    brokerageBrand: intake.brief.brokerageBrand,
    campaignType: intake.brief.campaignType ?? null,
    propertyType: intake.brief.propertyType,
    staticStyle: intake.brief.staticStyle ?? intake.brief.creativeStyle,
    briefHash: intake.brief.briefHash ?? null,
    staticBriefHash: intake.brief.staticBriefHash ?? null,
    offerHash: intake.brief.offerHash ?? null,
    ctaHash: intake.brief.ctaHash ?? null,
    brandHash: intake.brief.brandHash ?? null,
    ugcScriptHash: intake.brief.ugcScriptHash ?? null,
    ugcStyleBrief: intake.brief.ugcStyleBrief ?? null,
    promptVersion: intake.promptVersion,
  };
}

export function hasSameCreativeIntakeGenerationContext(
  left?: CreativeIntakeGenerationContext | null,
  right?: CreativeIntakeGenerationContext | null,
) {
  return Boolean(
    left &&
    right &&
    left.version === right.version &&
    left.conversationId === right.conversationId &&
    left.revisionNumber === right.revisionNumber &&
    left.outputMode === right.outputMode &&
    left.generationPhase === right.generationPhase &&
    (left.requiredOffer ?? null) === (right.requiredOffer ?? null) &&
    (left.requiredOfferTitle ?? null) === (right.requiredOfferTitle ?? null) &&
    (left.requiredCta ?? null) === (right.requiredCta ?? null) &&
    (left.staticBriefHash ?? null) === (right.staticBriefHash ?? null) &&
    (left.briefHash ?? null) === (right.briefHash ?? null) &&
    (left.ugcScriptHash ?? null) === (right.ugcScriptHash ?? null) &&
    JSON.stringify(left.ugcStyleBrief ?? null) === JSON.stringify(right.ugcStyleBrief ?? null) &&
    left.promptVersion.revisionNumber === right.promptVersion.revisionNumber &&
    left.promptVersion.createdAt === right.promptVersion.createdAt &&
    left.promptVersion.generatedPrompt === right.promptVersion.generatedPrompt,
  );
}

export function mergeCreativeChatIntakeIntoPlan(
  planValue: unknown,
  intake: CreativeChatIntakeState,
): CampaignPlanDocument {
  const plan = readCampaignPlanDocument(planValue);

  return mergeCampaignPlanDocument(plan, {
    [CREATIVE_CHAT_INTAKE_PLAN_KEY]: intake as unknown as Json,
  });
}

export async function persistCreativeChatIntake(params: {
  supabase: {
    from(table: "campaign_plans"): {
      select(columns: string): {
        eq(column: string, value: string): {
          maybeSingle(): Promise<{ data: { plan?: unknown; user_id?: string | null; organization_id?: string | null } | null; error: Error | null }>;
        };
      };
    };
  };
  campaignId: string;
  userId: string;
  organizationId: string;
  defaults: CreativeIntakeCampaignDefaults;
  answers?: CreativeIntakeAnswers;
  action: "save_answers" | "approve" | "revise";
  revisionMessage?: string | null;
}) {
  const { data, error } = await params.supabase
    .from("campaign_plans")
    .select("plan,user_id,organization_id")
    .eq("id", params.campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || (data.user_id !== params.userId && data.organization_id !== params.organizationId)) {
    throw new Error("Campaign not found.");
  }

  const existing = readCreativeChatIntakeFromPlan(data.plan);
  const mergedAnswers = {
    ...(existing?.answers ?? {}),
    ...(params.answers ?? {}),
  };
  const brief = buildCreativeIntakeBrief(mergedAnswers, params.defaults);
  const revisionNumber = params.action === "revise"
    ? (existing?.revisionNumber ?? 0) + 1
    : existing?.revisionNumber ?? 0;
  const timestamp = nowIso();
  const approved = params.action === "approve";
  const persistedBrief: CreativeIntakeBrief = {
    ...brief,
    revisionNumber,
    creativeBriefApprovedAt: approved ? timestamp : existing?.brief?.creativeBriefApprovedAt ?? null,
  };
  const promptVersion = approved
    ? buildCreativeIntakePromptVersion(persistedBrief, revisionNumber)
    : params.action === "revise"
      ? null
      : existing?.promptVersion ?? null;
  const revisionMessages =
    params.action === "revise" && safeText(params.revisionMessage)
      ? [
          {
            id: messageId(),
            role: "user" as const,
            content: safeText(params.revisionMessage),
            createdAt: timestamp,
          },
          {
            id: messageId(),
            role: "system" as const,
            content: "Revision saved. Review the updated brief before regenerating paid media.",
            createdAt: timestamp,
          },
        ]
      : [];
  const previousRevisions =
    params.action === "revise" && existing
      ? [
          ...(existing.previousRevisions ?? []),
          {
            revisionNumber: existing.revisionNumber,
            approvalStatus: existing.approvalStatus,
            brief: existing.brief,
            promptVersion: existing.promptVersion,
            createdAt: existing.updatedAt,
            approvedAt: existing.approvedAt ?? null,
          },
        ].slice(-12)
      : existing?.previousRevisions ?? [];
  const intake: CreativeChatIntakeState = {
    version: CREATIVE_CHAT_INTAKE_VERSION,
    conversationId: existing?.conversationId ?? crypto.randomUUID(),
    campaignId: params.campaignId,
    approvalStatus: approved ? "approved" : params.action === "revise" ? "revision_requested" : "draft",
    revisionNumber,
    answers: mergedAnswers,
    brief: persistedBrief,
    promptVersion,
    messages: [
      ...(existing?.messages ?? []),
      ...buildMessagesFromAnswers(params.answers ?? {}),
      ...revisionMessages,
    ].slice(-80),
    previousRevisions,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    approvedAt: approved ? timestamp : null,
  };

  if (approved && !persistedBrief.completion.complete) {
    throw new Error(`Creative brief is incomplete: ${persistedBrief.completion.missing.join(", ")}`);
  }

  await persistCampaignPlanDocumentUpdate({
    supabase: params.supabase as never,
    campaignId: params.campaignId,
    userId: params.userId,
    plan: mergeCreativeChatIntakeIntoPlan(data.plan, intake),
    source: "creative_chat_intake",
  });

  return intake;
}
