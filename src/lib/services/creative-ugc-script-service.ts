import type { CampaignIntent } from "@/lib/campaign-intent";

export type CreativeUgcCampaignType = "seller" | "buyer" | "investor" | "commercial" | "mixed" | "unknown";
export type CreativeUgcAudienceKind = CreativeUgcCampaignType;

export type CreativeUgcScriptContext = {
  campaignType: CreativeUgcCampaignType;
  audience: string;
  market: string;
  offer: string;
  leadMagnet: string | null;
  cta: string;
  painPoint: string;
  mechanism: string;
  scriptAngle: string;
  rejectedReasons: string[];
  sourceContextHash: string;
};

export type CreativeUgcScriptDraft = {
  campaignType: CreativeUgcCampaignType;
  scriptAngle: string;
  hook: string;
  problem: string;
  mechanism: string;
  proof: string;
  offer: string;
  cta: string;
  body: string;
  fullScript: string;
  lines: string[];
  shotList: string[];
  onScreenText: string[];
  creatorDirection: string;
  complianceNotes: string[];
  rejectedReasons: string[];
  contextHash: string;
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
  sectionCount: number;
  maxWords: number;
};

const DEFAULT_OFFER = "Campaign Plan";
const CTA_SIGNAL_PATTERN = /\b(click|tap|book|schedule|call|message|speak with|learn more|get access|get started|see if|view homes|claim|start|answer a few|download|get your|see homes)\b/i;
const CTA_SIGNAL_GLOBAL_PATTERN = /\b(click|tap|book|schedule|call|message|speak with|learn more|get access|get started|see if|view homes|claim|start|answer a few|download|get your|see homes)\b/gi;

const UNSAFE_COPY_PATTERNS = [
  ["guaranteed_approval", /\bguaranteed\s+approval\b/i],
  ["guaranteed_financing", /\bguaranteed\s+financ/i],
  ["guaranteed_sale", /\bguaranteed\s+sale\b/i],
  ["guaranteed_roi", /\bguaranteed\s+roi\b/i],
  ["unsupported_guarantee", /\b(top dollar|best deal|risk[-\s]?free|guaranteed|guarantee)\b/i],
  ["fake_urgency", /\b(only\s+\d+\s+spots|act\s+now\s+or|last\s+chance|expires\s+today)\b/i],
  ["housing_protected_class_language", /\b(families only|family[-\s]?friendly|no kids|children|young professionals only|seniors only|safe for women|immigrant|race|religion|disab(?:led|ility)|nationality|gender|men only|women only|christian|muslim|jewish|asian|black|white|hispanic)\b/i],
  ["testimonial_unsubstantiated", /\b(i bought|i sold|we bought|we sold|my agent|they got me|they helped me buy|they helped me sell|as a client|real client|testimonial)\b/i],
] as const;

const BUYER_LANGUAGE_PATTERNS = [
  /\b(homebuyer|homebuyers|buying power|pre[-\s]?approval|credit score)\b/i,
  /\b(trying to buy|buy a home|buying a home|looking for homes|looking to buy)\b/i,
  /\b(view homes|see homes|homes that match|custom home list|home list|book a showing|showings?|home search|offer[-\s]?writing|wishlist)\b/i,
  /\b(off[-\s]?market|early access|private listings?|property shortlist|home shortlist|available properties|inventory)\b/i,
] as const;

const RESIDENTIAL_BUYER_MISMATCH_PATTERNS = [
  /\b(homebuyer|homebuyers|buying power|pre[-\s]?approval|credit score)\b/i,
  /\b(trying to buy|buy a home|buying a home|looking for homes|looking to buy)\b/i,
  /\b(view homes|see homes|homes that match|custom home list|home list|book a showing|showings?|home search|offer[-\s]?writing|wishlist)\b/i,
] as const;

const SELLER_LANGUAGE_PATTERNS = [
  /\b(seller|sellers|homeowner|homeowners|home value|home valuation)\b/i,
  /\b(sell your home|selling options|speed to sell|home sale plan|buyer demand report|seller net sheet)\b/i,
  /\b(before (?:they|you) list|before listing|listing strategy|listing consultation|seller conversation|what your home could|your home's value)\b/i,
] as const;

const INVESTOR_LANGUAGE_PATTERNS = [
  /\b(investor|investors|cash[-\s]?flow|cap rate|yield|roi|rental|deal flow|deals?|distressed|off[-\s]?market deal)\b/i,
] as const;

const COMMERCIAL_LANGUAGE_PATTERNS = [
  /\b(commercial|lease|leasing|tenant|office|retail|industrial|warehouse|space|site|tour|availability)\b/i,
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

function hasAnyPattern(value: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function scorePatterns(value: string, patterns: readonly RegExp[]) {
  return patterns.reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0);
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function splitScriptSections(lines: string[]) {
  const lineSections = lines.map((line) => safeText(line)).filter(Boolean);
  const text = lineSections.join(" ");
  const sentenceSections = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((section) => safeText(section))
    .filter((section) => section.split(/\s+/).filter(Boolean).length >= 3);

  return sentenceSections.length > lineSections.length ? sentenceSections : lineSections;
}

function hasActualMarket(value: string) {
  const text = safeText(value).toLowerCase();
  return Boolean(text) && !/^(your local market|local market|your market)$/.test(text);
}

function hasCustomerCta(params: { text: string; cta?: string | null }) {
  const text = safeText(params.text).toLowerCase();
  const cta = safeText(params.cta).toLowerCase();

  if (cta && text.includes(cta)) {
    return true;
  }

  return CTA_SIGNAL_PATTERN.test(text);
}

function countCtaSignals(text: string) {
  return (text.match(CTA_SIGNAL_GLOBAL_PATTERN) ?? []).length;
}

function hasOfferSignal(text: string, offer: string) {
  const normalizedText = safeText(text).toLowerCase();
  const normalizedOffer = safeText(offer).toLowerCase();
  if (!normalizedOffer || normalizedOffer === DEFAULT_OFFER.toLowerCase()) {
    return false;
  }

  if (normalizedText.includes(normalizedOffer)) {
    return true;
  }

  const offerWords = [...new Set(normalizedOffer
    .split(/[^a-z0-9+]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !["free", "with", "your", "this", "that", "plan"].includes(word)))];
  if (offerWords.length === 0) {
    return true;
  }

  const matchedWords = offerWords.filter((word) => normalizedText.includes(word));
  return matchedWords.length >= Math.min(2, offerWords.length);
}

function classifyExplicitCampaignType(value: unknown): CreativeUgcCampaignType | null {
  const text = safeText(value).toLowerCase();

  if (/\bmixed\b/.test(text)) return "mixed";
  if (/\bseller\b/.test(text)) return "seller";
  if (/\bbuyer\b/.test(text) || /\bapproval|refinance|mortgage\b/.test(text)) return "buyer";
  if (/\binvestor\b/.test(text)) return "investor";
  if (/\bcommercial\b/.test(text)) return "commercial";

  return null;
}

function classifyUgcCampaignType(params: {
  campaignType?: CampaignIntent | string | null;
  audience?: string | null;
  offer?: string | null;
  leadMagnet?: string | null;
  cta?: string | null;
  propertyType?: string | null;
}) {
  const explicit = classifyExplicitCampaignType(params.campaignType);

  if (explicit && explicit !== "mixed") {
    return explicit;
  }

  const audience = safeText(params.audience).toLowerCase();
  const offer = safeText(params.offer).toLowerCase();
  const leadMagnet = safeText(params.leadMagnet).toLowerCase();
  const cta = safeText(params.cta).toLowerCase();
  const propertyType = safeText(params.propertyType).toLowerCase();
  const customerText = `${audience} ${offer} ${leadMagnet} ${cta} ${propertyType}`;
  const scores = {
    seller: scorePatterns(customerText, SELLER_LANGUAGE_PATTERNS),
    buyer: scorePatterns(customerText, BUYER_LANGUAGE_PATTERNS),
    investor: scorePatterns(customerText, INVESTOR_LANGUAGE_PATTERNS),
    commercial: scorePatterns(customerText, COMMERCIAL_LANGUAGE_PATTERNS),
  };

  if (explicit === "mixed" || (scores.buyer > 0 && scores.seller > 0 && scores.buyer === scores.seller)) {
    return "mixed" as const;
  }

  const ranked = Object.entries(scores).sort((first, second) => second[1] - first[1]);
  const [winner, score] = ranked[0] ?? ["unknown", 0];

  return score > 0 ? (winner as Exclude<CreativeUgcCampaignType, "mixed" | "unknown">) : "unknown";
}

function cleanMechanismContext(params: {
  value?: string | null;
  audienceKind: CreativeUgcCampaignType;
}) {
  const text = safeText(params.value)
    .replace(/[.!?]\s+(?:delivered|powered|built)\s+through\b[\s\S]*$/i, "")
    .replace(/\b(?:delivered|powered|built)\s+through\b[\s\S]*$/i, "")
    .replace(/\bfor\s+home\s+buyers\s+searching\b[\s\S]*$/i, "")
    .replace(/\bbetter\s+houses\s+options\b/gi, "better home options")
    .trim();

  if (!text || text.length > 140) {
    return "";
  }

  if (params.audienceKind === "seller" && hasAnyPattern(text, BUYER_LANGUAGE_PATTERNS)) {
    return "";
  }

  if (params.audienceKind === "buyer" && hasAnyPattern(text, SELLER_LANGUAGE_PATTERNS)) {
    return "";
  }

  return text;
}

export function inferCreativeUgcAudienceKind(params: {
  campaignType?: CampaignIntent | string | null;
  audience?: string | null;
  offer?: string | null;
  leadMagnet?: string | null;
  cta?: string | null;
  propertyType?: string | null;
}) {
  return classifyUgcCampaignType(params);
}

export function resolveUgcScriptContext(params: {
  campaignType?: CampaignIntent | string | null;
  audience?: string | null;
  market?: string | null;
  offer?: string | null;
  leadMagnet?: string | null;
  cta?: string | null;
  propertyType?: string | null;
  hookAngle?: string | null;
}): CreativeUgcScriptContext {
  const campaignType = classifyUgcCampaignType(params);
  const audience = safeText(params.audience);
  const market = safeText(params.market);
  const offer = safeText(params.offer) || safeText(params.leadMagnet) || DEFAULT_OFFER;
  const leadMagnet = safeText(params.leadMagnet) || null;
  const cta = safeText(params.cta);
  const hookAngle = safeText(params.hookAngle).toLowerCase();
  const rejectedReasons = [
    campaignType === "unknown" ? "needs_campaign_classification" : null,
    campaignType === "mixed" && !cta ? "needs_primary_cta" : null,
    !audience ? "audience_missing" : null,
    !hasActualMarket(market) ? "market_missing" : null,
    !offer || offer === DEFAULT_OFFER ? "offer_missing" : null,
    !cta ? "cta_missing" : null,
  ].filter((item): item is string => Boolean(item));

  const typeContext: Record<CreativeUgcCampaignType, Omit<CreativeUgcScriptContext, "campaignType" | "audience" | "market" | "offer" | "leadMagnet" | "cta" | "rejectedReasons" | "sourceContextHash">> = {
    buyer: {
      painPoint: hookAngle.includes("budget") || hookAngle.includes("price")
        ? "buyers need a clearer read on budget, timing, and fit before they book showings"
        : hookAngle.includes("wasted")
          ? "buyers waste time on homes that do not match their must-haves"
          : "buyers miss better-fit homes when they rely only on crowded public listings",
      mechanism: `${offer} matches budget, timing, and must-haves so buyers can review better options without wasting time.`,
      scriptAngle: hookAngle || "early access",
    },
    seller: {
      painPoint: hookAngle.includes("price")
        ? "homeowners are often working from outdated estimates instead of real local demand"
        : hookAngle.includes("underpricing")
          ? "homeowners can leave money on the table when they guess at timing and demand"
          : "homeowners need clarity on value, timing, and buyer demand before they make a move",
      mechanism: `${offer} looks at local demand, recent comps, and what buyers are responding to right now.`,
      scriptAngle: hookAngle || "buyer demand",
    },
    investor: {
      painPoint: "investors can waste time on deals before the numbers, risk, and upside are clear",
      mechanism: `${offer} helps compare opportunities around fit, downside, and upside before capital moves.`,
      scriptAngle: hookAngle || "numbers first",
    },
    commercial: {
      painPoint: "commercial searches waste weeks when requirements, location, and availability are compared too late",
      mechanism: `${offer} narrows options around fit, location, timing, and requirements before tours start.`,
      scriptAngle: hookAngle || "site shortlist",
    },
    mixed: {
      painPoint: "mixed campaigns need one clear path before the viewer can act",
      mechanism: `${offer} gives one next step tied to the selected campaign goal.`,
      scriptAngle: hookAngle || "single primary CTA",
    },
    unknown: {
      painPoint: "campaign classification is needed before a script can be approved",
      mechanism: "Classify the campaign before writing buyer, seller, investor, or commercial copy.",
      scriptAngle: "needs classification",
    },
  };
  const selected = typeContext[campaignType];
  const sourceContextHash = stableHash(JSON.stringify({
    campaignType,
    audience,
    market,
    offer,
    leadMagnet,
    cta,
    propertyType: safeText(params.propertyType),
    scriptAngle: selected.scriptAngle,
  }));

  return {
    campaignType,
    audience,
    market,
    offer,
    leadMagnet,
    cta,
    painPoint: selected.painPoint,
    mechanism: selected.mechanism,
    scriptAngle: selected.scriptAngle,
    rejectedReasons,
    sourceContextHash,
  };
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
  leadMagnet?: string | null;
  cta?: string | null;
  propertyType?: string | null;
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
  const context = resolveUgcScriptContext({
    campaignType: params.campaignType,
    audience: params.audience,
    market: params.market,
    offer: offerTitle,
    leadMagnet: params.leadMagnet,
    cta: params.cta,
    propertyType: params.propertyType,
    hookAngle: params.hookAngle,
  });
  const market = context.market || "your local market";
  const audience = context.audience || "this audience";
  const cta = context.cta || "See if this is a fit";
  const targetDurationSeconds = normalizeDuration(params.targetDurationSeconds);
  const visualStyle = safeText(params.visualStyle) || "Talking-head with local captions";
  const mechanismContext = cleanMechanismContext({
    value: params.offerMechanism,
    audienceKind: context.campaignType,
  });
  const usableMechanismContext =
    mechanismContext && mechanismContext.toLowerCase() !== offerTitle.toLowerCase()
      ? mechanismContext
      : "";

  const scripts = {
    seller: {
      hook: `If you own a home in ${market}, there may be more buyer demand than you think.`,
      problem: context.painPoint,
      mechanism: usableMechanismContext || context.mechanism,
      proof: "That gives you a clearer read before you guess on price, timing, or the next move.",
      offer: offerTitle,
      cta,
    },
    buyer: {
      hook: `If you are trying to buy a home in ${market} right now, do not just scroll listings and hope.`,
      problem: context.painPoint,
      mechanism: usableMechanismContext || context.mechanism,
      proof: "That gives you a cleaner shortlist before you spend time on homes that do not fit.",
      offer: offerTitle,
      cta,
    },
    investor: {
      hook: `If you are looking for real estate deals in ${market}, this is what most people miss.`,
      problem: context.painPoint,
      mechanism: usableMechanismContext || context.mechanism,
      proof: "That gives you a clearer reason to review the deal before capital moves.",
      offer: offerTitle,
      cta,
    },
    commercial: {
      hook: `If you are comparing commercial space in ${market}, the wrong shortlist can waste weeks.`,
      problem: context.painPoint,
      mechanism: usableMechanismContext || context.mechanism,
      proof: "That gives you a clearer path before tours or negotiations start.",
      offer: offerTitle,
      cta,
    },
    mixed: {
      hook: `If you are looking at real estate options in ${market}, start with one clear next step.`,
      problem: context.painPoint,
      mechanism: usableMechanismContext || context.mechanism,
      proof: "That keeps the campaign focused on one action instead of mixing multiple paths.",
      offer: offerTitle,
      cta,
    },
    unknown: {
      hook: `This campaign needs buyer, seller, investor, or commercial classification before a UGC script can be approved.`,
      problem: context.painPoint,
      mechanism: context.mechanism,
      proof: "Once the campaign is classified, DealFlow can draft the right script.",
      offer: offerTitle,
      cta,
    },
  } as const;
  const selected = scripts[context.campaignType];
  const lines = [
    selected.hook,
    selected.problem,
    selected.offer,
    selected.mechanism,
    selected.proof,
    selected.cta,
  ].map((line) => safeText(line)).filter(Boolean);
  const body = lines.slice(1, -1).join(" ");
  const fullScript = lines.join(" ");
  const shotList = [
    "Direct-to-camera hook in the first two seconds",
    "Campaign-specific problem setup",
    "Offer title appears clearly",
    "Mechanism or proof line",
    "Direct CTA close",
  ];
  const onScreenText = [
    selected.hook.replace(/\.$/, ""),
    selected.offer,
    selected.cta,
  ];
  const complianceNotes = [
    "Housing ad copy must avoid protected-class targeting, exclusion, and unsupported guarantees.",
    "Creator delivery must not imply a real testimonial unless one is approved.",
  ];
  const hash = stableHash(JSON.stringify({
    campaignType: context.campaignType,
    audience,
    market,
    offer: selected.offer,
    leadMagnet: context.leadMagnet,
    cta: selected.cta,
    scriptAngle: context.scriptAngle,
    lines,
    shotList,
    onScreenText,
    targetDurationSeconds,
    visualStyle,
  }));

  return {
    ...selected,
    campaignType: context.campaignType,
    scriptAngle: context.scriptAngle,
    body,
    fullScript,
    lines,
    shotList,
    onScreenText,
    creatorDirection: `${safeText(params.creatorPersona) || "Local real estate creator"} speaking naturally in a vertical short-form format for ${audience}.`,
    complianceNotes,
    rejectedReasons: context.rejectedReasons,
    contextHash: context.sourceContextHash,
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
  market?: string | null;
  offerTitle?: string | null;
  leadMagnet?: string | null;
  cta?: string | null;
  propertyType?: string | null;
}) {
  const text = params.script.lines.join(" ").trim();
  const lower = text.toLowerCase();
  const expectedCta = safeText(params.cta) || params.script.cta;
  const context = resolveUgcScriptContext({
    campaignType: params.campaignType,
    audience: params.audience,
    market: params.market,
    offer: params.offerTitle || params.script.offer,
    leadMagnet: params.leadMagnet,
    cta: expectedCta,
    propertyType: params.propertyType,
    hookAngle: params.script.scriptAngle,
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
  const sectionCount = splitScriptSections(params.script.lines).length;
  const duplicateLineCount = params.script.lines
    .map((line) => line.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim())
    .filter(Boolean)
    .reduce((counts, line) => counts.set(line, (counts.get(line) ?? 0) + 1), new Map<string, number>());
  const maxWords = params.script.targetDurationSeconds <= 15
    ? 58
    : params.script.targetDurationSeconds <= 20
      ? 90
      : 125;
  const hook = safeText(params.script.lines[0] || params.script.hook).toLowerCase();
  const hookAudienceMatches =
    context.campaignType === "buyer"
      ? /\bbuyers?|homebuyers?|buy a home|buying a home|next home\b/.test(hook)
      : context.campaignType === "seller"
        ? /\bown|homeowners?|sellers?\b/.test(hook)
        : context.campaignType === "investor"
          ? /\binvestors?|deals?\b/.test(hook)
          : context.campaignType === "commercial"
            ? /\bcommercial|space|site\b/.test(hook)
            : context.campaignType === "mixed"
              ? true
              : false;
  const ctaMismatch =
    Boolean(expectedCta) &&
    (safeText(params.script.cta).toLowerCase() !== safeText(expectedCta).toLowerCase() ||
      !text.toLowerCase().includes(safeText(expectedCta).toLowerCase()));
  const reasons = [
    ...context.rejectedReasons,
    sectionCount < 3 ? "script_sections_missing" : null,
    !hasCustomerCta({ text, cta: expectedCta }) ? "cta_missing" : null,
    ctaMismatch ? "cta_mismatch" : null,
    countCtaSignals(text) > 4 ? "multiple_ctas" : null,
    repeatedOfferCount > 2 ? "offer_phrase_repeated" : null,
    [...duplicateLineCount.values()].some((count) => count > 1) ? "script_line_repeated" : null,
    wordCount > maxWords ? "script_too_long_for_duration" : null,
    offerTitle === DEFAULT_OFFER || !offerTitle ? "offer_missing" : null,
    offerTitle !== DEFAULT_OFFER && offerTitle && !hasOfferSignal(text, offerTitle) ? "offer_missing" : null,
    (!context.audience || !hasActualMarket(context.market) || !hookAudienceMatches || !hook.includes(context.market.toLowerCase().split(",")[0] ?? ""))
      ? "hook_missing_market_or_audience"
      : null,
    context.campaignType === "seller" && hasAnyPattern(text, BUYER_LANGUAGE_PATTERNS)
      ? "seller_buyer_language_mismatch"
      : null,
    context.campaignType === "buyer" && hasAnyPattern(text, SELLER_LANGUAGE_PATTERNS)
      ? "buyer_seller_language_mismatch"
      : null,
    context.campaignType === "investor" && (hasAnyPattern(text, SELLER_LANGUAGE_PATTERNS) || hasAnyPattern(text, RESIDENTIAL_BUYER_MISMATCH_PATTERNS))
      ? "investor_language_mismatch"
      : null,
    context.campaignType === "commercial" && (hasAnyPattern(text, SELLER_LANGUAGE_PATTERNS) || hasAnyPattern(text, RESIDENTIAL_BUYER_MISMATCH_PATTERNS))
      ? "commercial_language_mismatch"
      : null,
    /\b(provider|worker|queue|payload|qa accepted|launch-ready|system job)\b/i.test(text) ? "internal_jargon" : null,
    ...UNSAFE_COPY_PATTERNS.map(([code, pattern]) => pattern.test(text) ? code : null),
  ].filter((item): item is string => Boolean(item));
  const uniqueReasons = [...new Set(reasons)];

  return {
    accepted: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    wordCount,
    repeatedOfferCount,
    sectionCount,
    maxWords,
  };
}
