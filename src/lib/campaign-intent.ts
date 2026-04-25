export const CAMPAIGN_INTENTS = [
  "buyer",
  "seller",
  "investor",
  "approval",
  "refinance",
  "other",
] as const;

export type CampaignIntent = (typeof CAMPAIGN_INTENTS)[number];

type InferCampaignIntentInput = {
  intent?: unknown;
  marketType?: unknown;
  offer?: unknown;
  audience?: unknown;
  primaryGoal?: unknown;
  mechanism?: unknown;
};

function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function safeLower(value: unknown) {
  return safeText(value).toLowerCase();
}

export function isCampaignIntent(value: unknown): value is CampaignIntent {
  return CAMPAIGN_INTENTS.includes(safeLower(value) as CampaignIntent);
}

export function normalizeCampaignIntent(
  value: unknown,
  fallback: CampaignIntent = "buyer",
): CampaignIntent {
  const normalized = safeLower(value);

  if (isCampaignIntent(normalized)) {
    return normalized;
  }

  if (/mortgage|credit|approval|approved|qualify|financ/.test(normalized)) {
    return "approval";
  }

  if (/refi|refinanc/.test(normalized)) {
    return "refinance";
  }

  if (/invest|cash ?flow|off-market|rental|multifamily|cap rate/.test(normalized)) {
    return "investor";
  }

  if (/seller|homeowner|listing|valuation|sell/.test(normalized)) {
    return "seller";
  }

  if (/buyer|buy|first[- ]time|move[- ]up|downsiz/.test(normalized)) {
    return "buyer";
  }

  return fallback;
}

export function inferCampaignIntent(input: InferCampaignIntentInput): CampaignIntent {
  const providedIntent = normalizeCampaignIntent(
    input.intent ?? input.marketType,
    "other",
  );

  if (providedIntent !== "other") {
    return providedIntent;
  }

  const combined = [
    input.offer,
    input.audience,
    input.primaryGoal,
    input.mechanism,
  ]
    .map(safeLower)
    .filter(Boolean)
    .join(" ");

  if (/mortgage|credit|approval|approved|qualify|pre-approval|preapproval/.test(combined)) {
    return "approval";
  }

  if (/refi|refinanc|lower rate|renewal/.test(combined)) {
    return "refinance";
  }

  if (/invest|cash ?flow|off-market|rental|income property|multifamily|cap rate/.test(combined)) {
    return "investor";
  }

  if (/seller|homeowner|listing|valuation|sell|home value/.test(combined)) {
    return "seller";
  }

  if (/buyer|buy|first[- ]time|move[- ]up|downsiz|condo|home search/.test(combined)) {
    return "buyer";
  }

  return "buyer";
}

export function isSellerCampaignIntent(intent: CampaignIntent) {
  return intent === "seller";
}

export function isInvestorCampaignIntent(intent: CampaignIntent) {
  return intent === "investor";
}

export function isBuyerLikeCampaignIntent(intent: CampaignIntent) {
  return intent === "buyer" || intent === "approval" || intent === "refinance" || intent === "other";
}

export function getCampaignIntentLabel(
  intent: CampaignIntent,
  options?: {
    plural?: boolean;
    capitalized?: boolean;
  },
) {
  const plural = options?.plural ?? false;
  const capitalized = options?.capitalized ?? false;

  let label = "buyers";

  if (intent === "seller") {
    label = plural ? "sellers" : "seller";
  } else if (intent === "investor") {
    label = plural ? "investors" : "investor";
  } else if (intent === "approval") {
    label = plural ? "approval leads" : "approval lead";
  } else if (intent === "refinance") {
    label = plural ? "refinance leads" : "refinance lead";
  } else if (intent === "other") {
    label = plural ? "prospects" : "prospect";
  } else {
    label = plural ? "buyers" : "buyer";
  }

  if (!capitalized) {
    return label;
  }

  return label.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getCampaignIntentSummary(intent: CampaignIntent) {
  if (intent === "seller") {
    return "seller acquisition";
  }

  if (intent === "investor") {
    return "investor deal flow";
  }

  if (intent === "approval") {
    return "approval lead generation";
  }

  if (intent === "refinance") {
    return "refinance lead generation";
  }

  if (intent === "other") {
    return "lead generation";
  }

  return "buyer lead generation";
}
