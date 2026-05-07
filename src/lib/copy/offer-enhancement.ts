import { isCommercialCampaignIntent, type CampaignIntent } from "@/lib/campaign-intent";

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
    /(first[\s-]*time buyers?|homeowners?|buyers?|sellers?|investors?|landlords?|tenants?|owner[-\s]*users?|business owners?)/i,
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
    `Get Approved for a Condo with Just a ${credit} Credit Score`,
    `Buy Sooner with a ${credit} Credit Score`,
    `Check Available Homes You Can Qualify for with ${credit} Credit`,
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
    if (isCommercialCampaignIntent(marketType)) {
      return [
        "See Better-Fit Commercial Spaces Faster",
        "Get a Commercial Space Shortlist Built Around Your Requirements",
        "Find the Right Office, Retail, or Industrial Fit Before You Waste Another Tour",
      ];
    }

    return marketType === "seller"
      ? [
          "We Guarantee Your Home Sells in 90 Days — Or We’ll Buy It",
          "Sell Your Home in 90 Days — Guaranteed",
          "If Your Home Doesn’t Sell in 90 Days, We’ll Buy It",
          "90-Day Home Sale Guarantee — Or You Don’t Pay",
        ]
      : [
          "See Better Properties Before the Public Does",
          "Get Access to Homes Most Buyers Miss",
          "Check Available Homes Before Prices Move Again",
        ];
  }

  if ((cleaned.includes("guarantee") || cleaned.includes("sell")) && marketType === "seller") {
    return [
      "We Guarantee Your Home Sells in 90 Days — Or We’ll Buy It",
      "Sell Your Home in 90 Days — Guaranteed",
      "If Your Home Doesn’t Sell in 90 Days, We’ll Buy It",
      "90-Day Home Sale Guarantee — Or You Don’t Pay",
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

  if (isCommercialCampaignIntent(marketType)) {
    if (/lease|tenant|space|office|retail|industrial|warehouse|commercial/.test(cleaned)) {
      return [
        "See Better-Fit Commercial Spaces Faster",
        "Get a Commercial Space Shortlist Built Around Your Requirements",
        "Find the Right Office, Retail, or Industrial Fit Before You Waste Another Tour",
      ];
    }

    return [
      `${toTitleCase(cleaned)} Commercial Fit Brief`,
      `See Matching Commercial Options for ${toTitleCase(cleaned)}`,
      `Shortlist Better Commercial Options Around ${toTitleCase(cleaned)}`,
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
  const guarantee = /guarantee|guaranteed/.test(normalized) ? 4 : 0;
  const riskReversal = /or we['’]ll buy it|don’t pay|if your home doesn’t sell/.test(normalized) ? 5 : 0;
  const benefit = /sell|approved|access|cashflow|commercial|space|lease|shortlist|qualify|buyers|under \$|\$\d/.test(normalized) ? 3 : 0;
  const clarity = normalized.length <= 80 ? 2 : 1;

  return guarantee + riskReversal + benefit + clarity;
}

export function enhanceOffer(
  rawOffer: string,
  marketType: OfferMarketType = "buyer",
): string {
  const extracted = extractOfferData(rawOffer);

  if (marketType === "buyer" && extracted.hasCreditContext && extracted.creditScore) {
    return `Get Approved for a Condo with Just a ${extracted.creditScore}+ Credit Score`;
  }

  const variations = generateOfferVariations(rawOffer, marketType);
  return [...variations].sort((left, right) => scoreOfferVariation(right) - scoreOfferVariation(left))[0] ?? "";
}
