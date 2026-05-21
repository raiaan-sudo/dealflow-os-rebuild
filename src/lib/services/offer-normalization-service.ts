export type OfferCampaignMode = "buyer" | "seller" | "investor" | "commercial";
type OfferIntent = "approval" | "seller_guarantee" | "inventory" | "furnishing" | "generic";

export type NormalizedOfferResult = {
  rawOffer: string;
  normalizedOffer: string;
  cta: string;
  intent: OfferIntent;
  changed: boolean;
  coachNote: string;
  alternates: string[];
};

function cleanWhitespace(value: string) {
  return value.replace(/[“”]/g, "\"").replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
}

function titleCaseOffer(value: string) {
  const smallWords = new Set(["and", "or", "for", "in", "on", "to", "of", "the", "a", "an", "with"]);

  return cleanWhitespace(value)
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word, index) => {
      if (/^\d+\+$/.test(word)) return word;
      if (/^\$?\d+(?:k|m)?$/i.test(word)) return word.toUpperCase();
      if (word === "roi") return "ROI";
      if (word === "brrrr") return "BRRRR";
      if (word === "fico") return "FICO";
      if (index > 0 && smallWords.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function normalizeCommonOfferTypos(value: string) {
  return cleanWhitespace(value)
    .replace(/\bguar(?:a|e)?nte+d\b/gi, "Guaranteed")
    .replace(/\bguar(?:a|e)?ntee\b/gi, "Guarantee")
    .replace(/\bapprov(?:a|e)?l\b/gi, "Approval")
    .replace(/\baproval\b/gi, "Approval")
    .replace(/\bapproved\b/gi, "Approved")
    .replace(/\bpre\s*approved\b/gi, "Pre-Approved")
    .replace(/\bpre\s*approval\b/gi, "Pre-Approval")
    .replace(/\bcrdit\b/gi, "Credit")
    .replace(/\bfico\b/gi, "FICO")
    .replace(/\b(\d{3,4})\s*(?:n|and|&)\s*up\b/gi, "$1+")
    .replace(/\b(\d{3,4})\s*plus\b/gi, "$1+")
    .replace(/\b(\d{3,4})\s*\+\s*credit\b/gi, "$1+ Credit")
    .replace(/\b(\d{1,3})\s*day\b/gi, "$1-Day")
    .replace(/\b(\d{1,3})\s*days\b/gi, "$1 Days")
    .replace(/\bfull\s*furnish\b/gi, "Furnish")
    .replace(/\bfurnish your entire first floor\b/gi, "Furnish Your Entire First Floor");
}

function inferIntent(value: string, mode: OfferCampaignMode): OfferIntent {
  const normalized = value.toLowerCase();

  if (/approval|approved|credit|fico|mortgage|qualif/.test(normalized)) return "approval";
  if (/guarantee|guaranteed|90[-\s]?day|sale|sell|sold/.test(normalized) || mode === "seller") {
    return "seller_guarantee";
  }
  if (/furnish|renovation|first floor|staging/.test(normalized)) return "furnishing";
  if (/inventory|listing|shortlist|off-market|home list|deal list|space/.test(normalized)) return "inventory";
  return "generic";
}

function formatApprovalOffer(value: string) {
  const credit = value.match(/\b(\d{3,4})\+?\b/)?.[1];

  if (credit) {
    return `Home Options for ${credit}+ Credit`;
  }

  return titleCaseOffer(
    value
      .replace(/\bguaranteed?\b/gi, "")
      .replace(/\bapproval\b/gi, "Qualification")
      .replace(/\bapproved\b/gi, "Qualified")
      .replace(/\bpre-approved\b/gi, "Pre-Qualified")
      .replace(/\bpre-approval\b/gi, "Pre-Qualification"),
  );
}

function formatSellerGuaranteeOffer(value: string) {
  const timeline = value.match(/\b(\d{1,3})[-\s]*(?:day|days)\b/i)?.[1];

  if (timeline && /guarantee|guaranteed|sale|sell|sold/i.test(value)) {
    return `${timeline}-Day Home Sale Plan`;
  }

  return titleCaseOffer(value);
}

function buildCta(intent: OfferIntent, normalizedOffer: string, mode: OfferCampaignMode) {
  if (intent === "approval") {
    const credit = normalizedOffer.match(/\b(\d{3,4})\+/)?.[1];
    return credit ? `See ${credit}+ Credit Home Options` : "See Homes I May Qualify For";
  }

  if (intent === "seller_guarantee") {
    const timeline = normalizedOffer.match(/\b(\d{1,3}) Days\b/)?.[1];
    return timeline ? `Check My ${timeline}-Day Sale Plan` : "Check My Sale Plan";
  }

  if (intent === "furnishing") return "See My Furnishing Plan";
  if (mode === "commercial") return "Get My Space Shortlist";
  if (mode === "investor") return "Get My Deal Brief";
  if (/inventory|listing|shortlist|home list/i.test(normalizedOffer)) return "See Matching Homes";
  return `Get ${normalizedOffer}`;
}

function buildCoachNote(intent: OfferIntent, normalizedOffer: string, mode: OfferCampaignMode) {
  if (intent === "approval") {
    return "Guaranteed approval language is restricted, so DealFlow uses safer qualification wording while keeping the credit angle clear.";
  }
  if (intent === "seller_guarantee") {
    return "Lead with the sale plan first, then support it with timing and market proof.";
  }
  if (intent === "furnishing") {
    return "This is a strong concrete bonus; keep the outcome visible before the form.";
  }
  if (intent === "inventory") {
    return "The offer works best when it promises a filtered shortlist, not generic listings.";
  }
  return mode === "buyer"
    ? "Make the offer specific enough that a buyer knows what they get after opting in."
    : "Keep the offer concrete, local, and easy to act on.";
}

function buildAlternates(intent: OfferIntent, normalizedOffer: string, mode: OfferCampaignMode) {
  if (intent === "approval") {
    const credit = normalizedOffer.match(/\b(\d{3,4})\+/)?.[1] ?? "600";
    return [
      `Home Options for ${credit}+ Credit`,
      `See Homes You May Qualify For With ${credit}+ Credit`,
      `${credit}+ Credit Buyer Readiness Plan`,
    ];
  }

  if (intent === "seller_guarantee") {
    return [
      "90-Day Home Sale Plan",
      "Seller Timing and Demand Plan",
      "See If Your Home Fits a 90-Day Sale Plan",
    ];
  }

  if (intent === "furnishing") {
    return [
      "Furnish Your Entire First Floor",
      "First-Floor Furnishing Bonus",
      "Move-In Ready Furnishing Plan",
    ];
  }

  if (mode === "commercial") {
    return ["Available Spaces Shortlist", "Owner-User Opportunity List", "Commercial Space-Fit Shortlist"];
  }

  if (mode === "investor") {
    return ["Cash Flow Deal List", "Underwritten Deal Sheet", "Off-Market Investor Shortlist"];
  }

  return ["Private Inventory Preview", "Curated Home List", "Neighborhood Match Report"];
}

export function normalizeOfferForCampaign(
  rawOffer: string | null | undefined,
  mode: OfferCampaignMode = "buyer",
): NormalizedOfferResult {
  const raw = cleanWhitespace(rawOffer ?? "");
  const typoFixed = normalizeCommonOfferTypos(raw);
  const intent = inferIntent(typoFixed, mode);

  let normalizedOffer = titleCaseOffer(typoFixed);

  if (intent === "approval") {
    normalizedOffer = formatApprovalOffer(typoFixed);
  } else if (intent === "seller_guarantee") {
    normalizedOffer = formatSellerGuaranteeOffer(typoFixed);
  } else if (intent === "furnishing") {
    normalizedOffer = /first floor/i.test(typoFixed)
      ? "Furnish Your Entire First Floor"
      : titleCaseOffer(typoFixed);
  }

  if (!normalizedOffer) {
    normalizedOffer = mode === "seller" ? "Home Value and Sale Plan" : "Curated Home List";
  }

  const cta = buildCta(intent, normalizedOffer, mode);

  return {
    rawOffer: raw,
    normalizedOffer,
    cta,
    intent,
    changed: raw.length > 0 && raw !== normalizedOffer,
    coachNote: buildCoachNote(intent, normalizedOffer, mode),
    alternates: buildAlternates(intent, normalizedOffer, mode),
  };
}
