import {
  isCommercialCampaignIntent,
  isInvestorCampaignIntent,
  isSellerCampaignIntent,
  type CampaignIntent,
} from "@/lib/campaign-intent";
import { getCategoryRulePack } from "@/lib/services/campaign-category-rule-packs";

export type CampaignCategory =
  | "buyer"
  | "seller"
  | "investor"
  | "commercial"
  | "precon"
  | "luxury";

export type CampaignCreativeStrategy = {
  campaignCategory: CampaignCategory;
  triggerCondition: string;
  internalTension: string;
  mechanism: string;
  proofStyle: string;
  ctaStyle: string;
  visualLogic: string[];
  overlayStyle: string[];
  complianceNotes: string[];
};

type StrategyDefaultsInput = {
  intent: CampaignIntent;
  audience?: string | null;
  propertyType?: string | null;
  keyOffer?: string | null;
  mechanism?: string | null;
  primaryGoal?: string | null;
  painPoints?: string[] | null;
};

type PartialCreativeStrategy = Partial<{
  campaignCategory: unknown;
  triggerCondition: unknown;
  internalTension: unknown;
  mechanism: unknown;
  proofStyle: unknown;
  ctaStyle: unknown;
  visualLogic: unknown;
  overlayStyle: unknown;
  complianceNotes: unknown;
}>;

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => safeText(item)).filter(Boolean) : [];
}

function matchesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function inferTriggerCondition(input: StrategyDefaultsInput, category: CampaignCategory) {
  const rulePack = getCategoryRulePack(category);
  const painPoints = (input.painPoints ?? []).map((item) => safeText(item).toLowerCase()).filter(Boolean);
  const haystack = [
    input.audience,
    input.propertyType,
    input.keyOffer,
    input.mechanism,
    ...painPoints,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const directPainMatch = rulePack.triggerConditions.find((candidate) =>
    painPoints.some((pain) => pain.includes(candidate.toLowerCase()) || candidate.toLowerCase().includes(pain)),
  );

  if (directPainMatch) {
    return directPainMatch;
  }

  const inferredByCategory =
    category === "buyer"
      ? matchesAny(haystack, [/\brent/, /\blease/, /\bpaying rent/])
        ? "renting frustration"
        : matchesAny(haystack, [/\bupsize/, /\bgrowing family/, /\bmore space/])
          ? "life upgrade"
          : "market uncertainty"
      : category === "seller"
        ? matchesAny(haystack, [/\bneighbors sell/, /\bstreet is selling/, /\bjust listed nearby/])
          ? "seeing neighbors sell"
          : matchesAny(haystack, [/\btiming/, /\bmarket timing/, /\bwrong time/])
            ? "concern about timing"
            : "area appreciation"
        : category === "investor"
          ? matchesAny(haystack, [/\bidle capital/, /\bcash sitting/, /\bmoney sitting/])
            ? "idle capital"
            : matchesAny(haystack, [/\byield/, /\bcash flow/, /\broi/])
              ? "looking for yield"
              : "comparing asset classes"
          : category === "commercial"
            ? matchesAny(haystack, [/\blease/, /\btenant/, /\bowner[-\s]?user/])
              ? "tenant or owner-user demand"
              : matchesAny(haystack, [/\bwarehouse/, /\bindustrial/, /\boffice/, /\bretail/])
                ? "asset-specific opportunity"
                : "business expansion"
          : category === "precon"
            ? matchesAny(haystack, [/\bafford resale/, /\bcan.t afford resale/, /\bresale/])
              ? "can't afford resale now"
              : matchesAny(haystack, [/\blow entry/, /\blower entry/, /\b10% down/, /\bdeposit/])
                ? "low entry desire"
                : "belief area will appreciate"
            : matchesAny(haystack, [/\bprivate/, /\boff-market/, /\bexclusive/])
              ? "desire for exclusivity"
              : matchesAny(haystack, [/\bidentity/, /\bstatus/, /\bwho they become/])
                ? "identity alignment"
                : "status signaling";

  return inferredByCategory || rulePack.triggerConditions[0] || "";
}

export function inferCampaignCategory(input: StrategyDefaultsInput): CampaignCategory {
  const haystack = [
    input.audience,
    input.propertyType,
    input.keyOffer,
    input.mechanism,
    input.primaryGoal,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    matchesAny(haystack, [
      /\bpre[\s-]?con\b/,
      /\bpreconstruction\b/,
      /\bnew build/,
      /\bassignment\b/,
      /\bdeposit structure\b/,
    ])
  ) {
    return "precon";
  }

  if (isSellerCampaignIntent(input.intent)) {
    return "seller";
  }

  if (
    matchesAny(haystack, [
      /\bluxury\b/,
      /\bpenthouse\b/,
      /\bexclusive\b/,
      /\bprivate access\b/,
      /\boff-market network\b/,
      /\bhigh[-\s]?net[-\s]?worth\b/,
    ])
  ) {
    return "luxury";
  }

  if (
    isCommercialCampaignIntent(input.intent) ||
    matchesAny(haystack, [
      /\bcommercial\b/,
      /\boffice\b/,
      /\bretail\b/,
      /\bindustrial\b/,
      /\bwarehouse\b/,
      /\bmixed[-\s]?use\b/,
      /\btenant\b/,
      /\blease\b/,
      /\bowner[-\s]?user\b/,
    ])
  ) {
    return "commercial";
  }

  if (
    isInvestorCampaignIntent(input.intent) ||
    matchesAny(haystack, [
      /\binvestor/,
      /\bcash flow\b/,
      /\byield\b/,
      /\broi\b/,
      /\bappreciation\b/,
      /\brental\b/,
    ])
  ) {
    return "investor";
  }

  return "buyer";
}

export function buildDefaultCreativeStrategy(
  input: StrategyDefaultsInput,
): CampaignCreativeStrategy {
  const campaignCategory = inferCampaignCategory(input);
  const rulePack = getCategoryRulePack(campaignCategory);

  return {
    campaignCategory,
    triggerCondition: inferTriggerCondition(input, campaignCategory),
    internalTension: safeText(input.painPoints?.[0]),
    mechanism: safeText(input.mechanism) || rulePack.approvedMechanismStyles[0] || "",
    proofStyle: rulePack.proofStyles[0] ?? "",
    ctaStyle: rulePack.defaultCtaStyle,
    visualLogic: [...rulePack.visualLogic],
    overlayStyle: [...rulePack.overlayLogic],
    complianceNotes: [],
  };
}

export function normalizeCreativeStrategy(
  value: PartialCreativeStrategy | null | undefined,
  defaults: StrategyDefaultsInput,
): CampaignCreativeStrategy {
  const fallback = buildDefaultCreativeStrategy(defaults);
  const category = safeText(value?.campaignCategory);

  return {
    campaignCategory:
      category === "buyer" ||
      category === "seller" ||
      category === "investor" ||
      category === "commercial" ||
      category === "precon" ||
      category === "luxury"
        ? category
        : fallback.campaignCategory,
    triggerCondition: safeText(value?.triggerCondition) || fallback.triggerCondition,
    internalTension: safeText(value?.internalTension) || fallback.internalTension,
    mechanism: safeText(value?.mechanism) || fallback.mechanism,
    proofStyle: safeText(value?.proofStyle) || fallback.proofStyle,
    ctaStyle: safeText(value?.ctaStyle) || fallback.ctaStyle,
    visualLogic: safeList(value?.visualLogic).length > 0 ? safeList(value?.visualLogic) : fallback.visualLogic,
    overlayStyle: safeList(value?.overlayStyle).length > 0 ? safeList(value?.overlayStyle) : fallback.overlayStyle,
    complianceNotes: safeList(value?.complianceNotes),
  };
}
