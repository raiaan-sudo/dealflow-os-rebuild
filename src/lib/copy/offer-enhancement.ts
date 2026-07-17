import type { CampaignIntent } from "@/lib/campaign-intent";
import {
  buildClaimSafeFallback,
  hasUnsupportedAdClaim,
  sanitizeAdClaimText,
} from "@/lib/copy/claim-safety";

export type OfferMarketType = CampaignIntent;

export type ExtractedOfferData = {
  creditScore: string | null;
  hasCreditContext: boolean;
  hasGuarantee: boolean;
  timeline: string | null;
  audience: string | null;
  pricePoint: string | null;
  inventoryDetails: {
    bedrooms: number | null;
    bathrooms: number | null;
    units: number | null;
  };
  raw: string;
};

function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function toTitleCase(value: string) {
  return safeText(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeMoneyValue(value: string) {
  const normalized = safeText(value).toLowerCase().replace(/[$,\s]/g, "");

  if (!normalized) {
    return "";
  }

  if (/^\d+(?:\.\d+)?m$/.test(normalized)) {
    const number = Number(normalized.slice(0, -1));
    return `$${number}M`;
  }

  if (/^\d+(?:\.\d+)?k$/.test(normalized)) {
    const number = Number(normalized.slice(0, -1));
    return `$${number}k`;
  }

  if (/^\d{4,}$/.test(normalized)) {
    const numericValue = Number(normalized);

    if (numericValue >= 1000) {
      return `$${Math.round(numericValue / 1000)}k`;
    }
  }

  return value.startsWith("$") ? value : `$${normalized}`;
}

export function formatAudience(audience: string) {
  return safeText(audience)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

export function extractOfferData(offer: string): ExtractedOfferData {
  const raw = safeText(offer);
  const text = raw.toLowerCase();
  const timelineMatch = text.match(
    /((?:in\s+)?\d+\s*(?:days?|weeks?|months?)(?:\s+or\s+less)?)/i,
  );
  const audienceMatch = text.match(
    /(first[\s-]*time buyers?|homeowners?|buyers?|sellers?|investors?|landlords?)/i,
  );
  const pricingMatch = text.match(
    /(?:under|below|up to|less than|underneath|from)\s+\$?\s*(\d+(?:\.\d+)?\s*[km]?)|\$+\s*(\d+(?:\.\d+)?\s*[km]?)/i,
  );
  const explicitCreditMatch = text.match(
    /(\d{3,4})\+?\s*(?:credit score|credit|fico)|credit(?: score)?\s*(?:of|above|at|over)?\s*(\d{3,4})/i,
  );
  const bedroomMatch = text.match(/(\d+)\s*(?:bed|beds|bedroom|bedrooms|bd)\b/i);
  const bathroomMatch = text.match(/(\d+)\s*(?:bath|baths|bathroom|bathrooms|ba)\b/i);
  const unitMatch = text.match(/(\d+)\s*(?:unit|units)\b/i);
  const pricingValue = pricingMatch?.[1] ?? pricingMatch?.[2] ?? null;
  const explicitCreditValue = explicitCreditMatch?.[1] ?? explicitCreditMatch?.[2] ?? null;

  return {
    creditScore: explicitCreditValue ? explicitCreditValue : null,
    hasCreditContext: Boolean(explicitCreditValue) || /credit|approval|approved|mortgage|fico|pre-approv|qualif/i.test(text),
    hasGuarantee: text.includes("guarantee") || text.includes("guaranteed"),
    timeline: timelineMatch ? timelineMatch[1].replace(/^in\s+/i, "").trim() : null,
    audience: audienceMatch ? audienceMatch[1] : null,
    pricePoint: pricingValue ? normalizeMoneyValue(pricingValue) : null,
    inventoryDetails: {
      bedrooms: bedroomMatch ? Number(bedroomMatch[1]) : null,
      bathrooms: bathroomMatch ? Number(bathroomMatch[1]) : null,
      units: unitMatch ? Number(unitMatch[1]) : null,
    },
    raw,
  };
}

function buildBuyerApprovalVariations(data: ExtractedOfferData) {
  const credit = data.creditScore ? `${data.creditScore}+` : "lower";

  return [
    `Review Condo Options for Buyers with ${credit} Credit`,
    `Explore a Buyer Readiness Plan for ${credit} Credit`,
    `Check Available Homes You May Qualify for with ${credit} Credit`,
  ];
}

function buildInventoryLabel(data: ExtractedOfferData) {
  const parts: string[] = [];

  if (data.inventoryDetails.bedrooms) {
    parts.push(`${data.inventoryDetails.bedrooms} bed`);
  }

  if (data.inventoryDetails.bathrooms) {
    parts.push(`${data.inventoryDetails.bathrooms} bath`);
  }

  if (parts.length === 0) {
    return "homes";
  }

  return parts.join(" ");
}

export function generateOfferVariations(
  rawOffer: string,
  marketType: OfferMarketType = "buyer",
): string[] {
  const cleaned = safeText(rawOffer).toLowerCase();
  const extracted = extractOfferData(rawOffer);

  if (!cleaned) {
    return marketType === "seller"
      ? [
          "Get a Market-Based Home Value and Sale Plan",
          "Review Your Home’s Pricing and Market-Positioning Plan",
          "See How to Position Your Home Before You List",
        ]
      : [
          "See Better Properties Before the Public Does",
          "Get Access to Homes Most Buyers Miss",
          "Check Available Homes Before Prices Move Again",
        ];
  }

  if ((cleaned.includes("guarantee") || cleaned.includes("sell")) && marketType === "seller") {
    const timeline = extracted.timeline ? `${extracted.timeline} ` : "";
    return [
      `Review a ${timeline}Home Sale Plan`.replace(/\s+/g, " ").trim(),
      "Get a Market-Based Home Value and Sale Plan",
      "See How Pricing and Market Conditions Could Shape Your Sale Plan",
    ];
  }

  if (/off market buyers|buyer network/.test(cleaned) && marketType === "seller") {
    return [
      "Access Our Off-Market Buyer Network and Sell to Serious Buyers Faster",
      "We Put Your Home in Front of Qualified Off-Market Buyers",
      "Skip Weak Showings and Reach Serious Buyers Faster",
    ];
  }

  if (marketType === "buyer" && extracted.hasCreditContext) {
    return buildBuyerApprovalVariations(extracted);
  }

  if (/cashflow|cash flow/.test(cleaned) && marketType === "investor") {
    return [
      "See Cashflow Properties Before the Public Does",
      "Find Cashflow Deals That Still Make Sense",
      "Claim the Cashflow Property List Before It’s Gone",
    ];
  }

  if (/off-market/.test(cleaned) && marketType !== "seller") {
    return [
      "See Off-Market Properties Before the Public Does",
      "Get Access to Off-Market Deals Before They Disappear",
      "Claim the Off-Market List Before It Hits the Market",
    ];
  }

  if (marketType === "buyer" && extracted.pricePoint) {
    const inventoryLabel = buildInventoryLabel(extracted);
    return [
      `See ${inventoryLabel} under ${extracted.pricePoint}`,
      `Check ${inventoryLabel} below ${extracted.pricePoint}`,
      `Find better-fit ${inventoryLabel} under ${extracted.pricePoint}`,
    ];
  }

  return [toTitleCase(cleaned)];
}

function scoreOfferVariation(value: string) {
  const normalized = safeText(value).toLowerCase();
  const unsafePenalty = hasUnsupportedAdClaim(normalized) ? -20 : 0;
  const benefit = /sale plan|access|cashflow|may qualify|buyers|under \$|\$\d/.test(normalized) ? 3 : 0;
  const clarity = normalized.length <= 80 ? 2 : 1;

  return unsafePenalty + benefit + clarity;
}

export function enhanceOffer(
  rawOffer: string,
  marketType: OfferMarketType = "buyer",
): string {
  const extracted = extractOfferData(rawOffer);

  if (marketType === "buyer" && extracted.hasCreditContext && extracted.creditScore) {
    return `Review Condo Options for Buyers with ${extracted.creditScore}+ Credit`;
  }

  const variations = generateOfferVariations(rawOffer, marketType);
  const selected = [...variations].sort((left, right) => scoreOfferVariation(right) - scoreOfferVariation(left))[0];
  return sanitizeAdClaimText(selected, {
    intent: marketType,
    fallback: buildClaimSafeFallback({ intent: marketType }),
  });
}
