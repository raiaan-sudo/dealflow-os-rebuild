import type { CampaignIntent } from "@/lib/campaign-intent";

export type CreativeUgcAudienceKind = "seller" | "buyer" | "investor" | "commercial" | "general";

export type CreativeUgcScriptDraft = {
  hook: string;
  problem: string;
  mechanism: string;
  proof: string;
  offer: string;
  cta: string;
  lines: string[];
  shotList: string[];
  onScreenText: string[];
  visualDirection: string;
  targetDurationSeconds: number;
  version: string;
  hash: string;
};

export type CreativeUgcScriptValidation = {
  accepted: boolean;
  reasons: string[];
  wordCount: number;
  repeatedOfferCount: number;
};

const DEFAULT_OFFER = "Campaign Plan";
const UNSAFE_COPY_PATTERNS = [
  ["guaranteed_approval", /\bguaranteed\s+approval\b/i],
  ["guaranteed_financing", /\bguaranteed\s+financ/i],
  ["guaranteed_sale", /\bguaranteed\s+sale\b/i],
  ["guaranteed_roi", /\bguaranteed\s+roi\b/i],
  ["fake_urgency", /\b(only\s+\d+\s+spots|act\s+now\s+or|last\s+chance|expires\s+today)\b/i],
  ["protected_class_steering", /\b(families only|no kids|young professionals only|safe for women|immigrant|race|religion)\b/i],
] as const;

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function sentenceCase(value: string) {
  const text = safeText(value);
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function normalizeDuration(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(30, Math.max(15, Math.round(value)))
    : 20;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function inferCreativeUgcAudienceKind(params: {
  campaignType?: CampaignIntent | string | null;
  audience?: string | null;
  offer?: string | null;
}) {
  const text = `${params.campaignType ?? ""} ${params.audience ?? ""} ${params.offer ?? ""}`.toLowerCase();

  if (/\b(seller|sell|listing|list|homeowner|expired)\b/.test(text)) {
    return "seller" as const;
  }
  if (/\b(investor|roi|cash flow|cap rate|deal)\b/.test(text)) {
    return "investor" as const;
  }
  if (/\b(commercial|lease|space|tenant)\b/.test(text)) {
    return "commercial" as const;
  }
  if (/\b(buyer|buy|pre[-\s]?con|preconstruction|homes?|shortlist|approval|credit)\b/.test(text)) {
    return "buyer" as const;
  }

  return "general" as const;
}

export function normalizeCreativeOfferTitle(params: {
  value?: string | null;
  campaignType?: CampaignIntent | string | null;
  audience?: string | null;
}) {
  const raw = safeText(params.value);
  const audienceKind = inferCreativeUgcAudienceKind({
    campaignType: params.campaignType,
    audience: params.audience,
    offer: raw,
  });
  let text = raw || DEFAULT_OFFER;

  text = text
    .replace(/^preview\s+/i, "")
    .replace(/\s+(this week|today|now)$/i, "")
    .trim();

  const firstSentence = text.split(/[.!?]\s+/)[0]?.trim();
  if (firstSentence && firstSentence.length <= 70) {
    text = firstSentence;
  }

  text = text
    .replace(/\b(delivered|powered|built)\s+through\b[\s\S]*$/i, "")
    .replace(/\bthrough\s+a\s+buyer\s+consultation\b[\s\S]*$/i, "")
    .replace(/\bfor\s+home\s+buyers\b[\s\S]*$/i, "")
    .replace(/\s+by\s+using\s+.+$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (audienceKind === "seller" && /\b14[-\s]?day\s+home\s+sale\s+plan\b/i.test(raw)) {
    return "14-Day Home Sale Plan";
  }

  if (audienceKind === "buyer" && /\b14[-\s]?day\s+home\s+sale\s+plan\b/i.test(text)) {
    return "Home Match Plan";
  }

  return sentenceCase(text || DEFAULT_OFFER).replace(/\.$/, "");
}

export function buildCreativeUgcScriptDraft(params: {
  campaignType?: CampaignIntent | string | null;
  audience?: string | null;
  market?: string | null;
  offerTitle?: string | null;
  offerMechanism?: string | null;
  cta?: string | null;
  targetDurationSeconds?: number | null;
  creatorPersona?: string | null;
  hookAngle?: string | null;
  visualStyle?: string | null;
}) {
  const offerTitle = normalizeCreativeOfferTitle({
    value: params.offerTitle,
    campaignType: params.campaignType,
    audience: params.audience,
  });
  const audienceKind = inferCreativeUgcAudienceKind({
    campaignType: params.campaignType,
    audience: params.audience,
    offer: offerTitle,
  });
  const market = safeText(params.market) || "your local market";
  const cta = safeText(params.cta) || "See if this is a fit";
  const targetDurationSeconds = normalizeDuration(params.targetDurationSeconds);
  const hookAngle = safeText(params.hookAngle).toLowerCase();
  const visualStyle = safeText(params.visualStyle) || "Talking-head with local captions";
  const mechanismContext = safeText(params.offerMechanism);

  const scripts = {
    seller: {
      hook: hookAngle.includes("price")
        ? `Most ${market} homeowners do not need another vague home value estimate.`
        : `Most ${market} homeowners wait too long before they know their real selling options.`,
      problem: "They need a clear plan for price, timing, demand, and the next move before they list.",
      mechanism: mechanismContext || `${offerTitle} shows the practical path for what could happen next.`,
      proof: "It gives you a cleaner read before you commit to the wrong listing strategy.",
      offer: offerTitle,
      cta,
    },
    buyer: {
      hook: `By the time most buyers see the obvious listings in ${market}, the best-fit options may already be gone.`,
      problem: "The issue is not effort. It is knowing which homes fit your timing, budget, and next step.",
      mechanism: mechanismContext || `${offerTitle} organizes the right matches before the search gets noisy.`,
      proof: "You get a clearer path before wasting time on the wrong homes.",
      offer: offerTitle,
      cta,
    },
    investor: {
      hook: `If you are only checking public listings in ${market}, the best deals may already be filtered out.`,
      problem: "The risk is chasing properties before the numbers, timing, and downside are clear.",
      mechanism: mechanismContext || `${offerTitle} helps compare opportunities around fit, risk, and upside.`,
      proof: "That gives you a cleaner reason to review the deal before capital moves.",
      offer: offerTitle,
      cta,
    },
    commercial: {
      hook: `The wrong ${market} space shortlist can waste weeks before you know what actually fits.`,
      problem: "Most searches break down when timing, requirements, and availability are compared too late.",
      mechanism: mechanismContext || `${offerTitle} narrows the options around fit, location, and timing.`,
      proof: "That gives you a clearer path before the search gets noisy.",
      offer: offerTitle,
      cta,
    },
    general: {
      hook: `Most people in ${market} do not need more noise. They need a clearer next step.`,
      problem: "The hard part is knowing which option is actually worth acting on.",
      mechanism: mechanismContext || `${offerTitle} turns the campaign into a simple decision path.`,
      proof: "That gives you a cleaner reason to move forward.",
      offer: offerTitle,
      cta,
    },
  } as const;
  const selected = scripts[audienceKind];
  const lines = [
    selected.hook,
    selected.problem,
    selected.mechanism,
    selected.proof,
    selected.offer,
    selected.cta,
  ].map((line) => safeText(line)).filter(Boolean);
  const shotList = [
    "Direct-to-camera hook in the first two seconds",
    "Simple local-market problem setup",
    "One clear mechanism caption",
    "Proof or confidence line",
    "Offer title on screen",
    "Direct CTA close",
  ];
  const onScreenText = [
    selected.hook.replace(/\.$/, ""),
    selected.offer,
    selected.cta,
  ];
  const hash = stableHash(JSON.stringify({ lines, shotList, onScreenText, targetDurationSeconds, visualStyle }));

  return {
    ...selected,
    lines,
    shotList,
    onScreenText,
    visualDirection: visualStyle,
    targetDurationSeconds,
    version: `ugc-script-${hash}`,
    hash,
  };
}

export function validateCreativeUgcScriptDraft(params: {
  script: CreativeUgcScriptDraft;
  campaignType?: CampaignIntent | string | null;
  audience?: string | null;
  offerTitle?: string | null;
}) {
  const text = params.script.lines.join(" ").trim();
  const lower = text.toLowerCase();
  const audienceKind = inferCreativeUgcAudienceKind({
    campaignType: params.campaignType,
    audience: params.audience,
    offer: params.offerTitle,
  });
  const offerTitle = normalizeCreativeOfferTitle({
    value: params.offerTitle || params.script.offer,
    campaignType: params.campaignType,
    audience: params.audience,
  });
  const normalizedOffer = offerTitle.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const repeatedOfferCount = normalizedOffer
    ? (lower.match(new RegExp(normalizedOffer, "g")) ?? []).length
    : 0;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const duplicateLineCount = params.script.lines
    .map((line) => line.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim())
    .filter(Boolean)
    .reduce((counts, line) => counts.set(line, (counts.get(line) ?? 0) + 1), new Map<string, number>());
  const maxWords = params.script.targetDurationSeconds <= 15
    ? 58
    : params.script.targetDurationSeconds <= 20
      ? 78
      : 115;
  const reasons = [
    params.script.lines.length < 4 ? "script_sections_missing" : null,
    !safeText(params.script.cta) ? "cta_missing" : null,
    repeatedOfferCount > 2 ? "offer_phrase_repeated" : null,
    [...duplicateLineCount.values()].some((count) => count > 1) ? "script_line_repeated" : null,
    wordCount > maxWords ? "script_too_long_for_duration" : null,
    audienceKind === "seller" && /\b(buyer shortlist|home buyers|pre[-\s]?approval|credit score|buying power)\b/i.test(text)
      ? "seller_buyer_language_mismatch"
      : null,
    audienceKind === "buyer" && /\b(list your home|before you list|listing strategy|home sale plan|sell your home)\b/i.test(text)
      ? "buyer_seller_language_mismatch"
      : null,
    ...UNSAFE_COPY_PATTERNS.map(([code, pattern]) => pattern.test(text) ? code : null),
    /\b(provider|worker|queue|payload|qa accepted|launch-ready)\b/i.test(text) ? "internal_jargon" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    accepted: reasons.length === 0,
    reasons,
    wordCount,
    repeatedOfferCount,
  };
}
