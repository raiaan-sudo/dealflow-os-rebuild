import type { CampaignIntent } from "@/lib/campaign-intent";

export type UnsupportedAdClaim = {
  code:
    | "guaranteed_outcome"
    | "agent_purchase_guarantee"
    | "no_payment_guarantee"
    | "guaranteed_approval"
    | "guaranteed_cash_flow"
    | "guaranteed_sale_timeline"
    | "risk_free_outcome"
    | "unverified_exclusivity"
    | "unverified_free_offer"
    | "unverified_testimonial"
    | "unverified_performance_metric"
    | "unverified_buyer_demand"
    | "unverified_response_time"
    | "unverified_scarcity"
    | "unverified_cash_offer";
  pattern: RegExp;
};

const UNSUPPORTED_AD_CLAIMS: readonly UnsupportedAdClaim[] = [
  { code: "guaranteed_outcome", pattern: /\b(?:guarantee(?:d|s)?|garanti(?:e|es|s)?|garantizad[oa]s?)\b/i },
  {
    code: "agent_purchase_guarantee",
    pattern: /\bor\s+(?:we|i)(?:['’]ll|\s+will)\s+buy\s+(?:it|the\s+(?:home|property))\b/i,
  },
  {
    code: "no_payment_guarantee",
    pattern: /\b(?:you|we|i)\s+(?:do\s+not|don['’]?t|will\s+not|won['’]?t)\s+pay\b|\b(?:vous\s+ne\s+payez\s+pas|sin\s+pagar|no\s+paga)\b/i,
  },
  {
    code: "no_payment_guarantee",
    pattern: /\bif\b.{0,100}\b(?:does\s+not|doesn['’]?t)\s+sell\b/i,
  },
  {
    code: "guaranteed_approval",
    pattern: /\b(?:get|be|become)\s+(?:pre[- ]?)?approved\b|\b(?:approbation\s+garantie|aprobaci[oó]n\s+garantizada)\b/i,
  },
  {
    code: "guaranteed_approval",
    pattern: /\b(?:approval|qualification)\s+(?:is\s+)?guaranteed\b/i,
  },
  {
    code: "guaranteed_approval",
    pattern: /\byou\s+do\s+not\s+need\s+(?:perfect\s+)?credit\b/i,
  },
  {
    code: "guaranteed_cash_flow",
    pattern: /\bcash[- ]?flow\s+positive\b|\b(?:flux\s+de\s+tr[eé]sorerie|flujo\s+de\s+caja)\s+positi(?:f|ve|vo|va)\b/i,
  },
  {
    code: "guaranteed_sale_timeline",
    pattern: /\b(?:sell|sells|sold)\s+(?:your\s+)?(?:home|property)\s+(?:in|within)\s+\d+\s*(?:days?|weeks?|months?)\b/i,
  },
  {
    code: "guaranteed_sale_timeline",
    pattern: /\b(?:home|property)\s+(?:will\s+)?sell\s+(?:in|within)\s+\d+\s*(?:days?|weeks?|months?)\b/i,
  },
  { code: "risk_free_outcome", pattern: /\b(?:no\s+downside|risk[- ]?free|sans\s+risque|sin\s+riesgo)\b/i },
  {
    code: "unverified_exclusivity",
    pattern: /\b(?:off[- ]market|before\s+(?:the\s+)?public|before\s+(?:the\s+)?listing\s+goes\s+public|private\s+(?:access|inventory|list)|early\s+access|hors\s+march[eé]|fuera\s+del\s+mercado|avant\s+le\s+public|antes\s+del\s+p[uú]blico)\b/i,
  },
  {
    code: "unverified_free_offer",
    pattern: /\b(?:free|100\s*%\s*free|no[- ]obligation|no\s+cost|zero\s+pressure|gratuit(?:e)?|gratis|sans\s+obligation|sin\s+obligaci[oó]n|sans\s+frais|sin\s+costo)\b/i,
  },
  {
    code: "unverified_testimonial",
    pattern: /\b(?:testimonial|case\s+study|one\s+(?:buyer|investor|homeowner|seller)|we\s+keep\s+seeing\s+the\s+same\s+story|real\s+results\s+from\s+real\s+clients)\b/i,
  },
  {
    code: "unverified_performance_metric",
    pattern: /(?:\b\d+(?:\.\d+)?\s*(?:leads?|appointments?|conversations?)\b|\b\d+(?:\.\d+)?\s*%\s*(?:conversion|close|lead|appointment)\b|[$£€]\s*\d+(?:\.\d+)?\s*(?:cpl|per\s+lead)\b)/i,
  },
  {
    code: "unverified_buyer_demand",
    pattern: /\b(?:qualified|serious|ready|right)[- ]buyers?\b|\bbuyer[- ](?:network|demand)\b|\bdemand[- ](?:proof|test)\b/i,
  },
  {
    code: "unverified_response_time",
    pattern: /\b(?:call|text|contact|respond|response|follow[- ]?up).{0,40}\b(?:(?:within|in)\s+)?\d+\s*(?:-|to)\s*\d+\s*minutes?\b/i,
  },
  {
    code: "unverified_scarcity",
    pattern: /\b(?:before\s+(?:everyone|other\s+buyers?|other\s+investors?)|before\s+(?:they|it)\s+(?:disappear|are\s+gone)|limited[- ](?:time|inventory)|only\s+\d+\s+(?:spots?|homes?|properties?))\b/i,
  },
  {
    code: "unverified_cash_offer",
    pattern: /\b(?:direct\s+)?cash\s+offer\b/i,
  },
];

export const ADVERTISING_CLAIM_POLICY_VERSION = "2026-07-16.1";

export const ADVERTISING_CLAIM_POLICY_MANIFEST = [
  ADVERTISING_CLAIM_POLICY_VERSION,
  ...UNSUPPORTED_AD_CLAIMS.map(({ code, pattern }) => `${code}:${pattern.source}/${pattern.flags}`),
].join("\n");

// Updated only with the manifest above. The focused policy test recomputes this SHA-256.
export const ADVERTISING_CLAIM_POLICY_DIGEST = "sha256:ca90b44a54f730d3af5b03575d59aa13a5913979f93ecb3bb7cb5f9f53895a1a";

export class AdvertisingClaimUnverifiedError extends Error {
  readonly code = "advertising_claim_unverified";
  readonly statusCode = 409;
  readonly policyVersion = ADVERTISING_CLAIM_POLICY_VERSION;
  readonly policyDigest = ADVERTISING_CLAIM_POLICY_DIGEST;
  readonly findings: string[];

  constructor(findings: string[], label = "advertising copy") {
    super(`${label} contains unverified advertising claims`);
    this.name = "AdvertisingClaimUnverifiedError";
    this.findings = Array.from(new Set(findings));
  }
}

function clean(value: unknown) {
  return (value ?? "").toString().replace(/\s+/g, " ").trim();
}

function locationSuffix(location?: string) {
  const normalized = clean(location);
  return normalized ? ` in ${normalized}` : "";
}

export function detectUnsupportedAdClaims(value: unknown) {
  const text = clean(value);

  if (!text) {
    return [];
  }

  return UNSUPPORTED_AD_CLAIMS.filter(({ pattern }) => pattern.test(text)).map(({ code }) => code);
}

export function hasUnsupportedAdClaim(value: unknown) {
  return detectUnsupportedAdClaims(value).length > 0;
}

export function evaluateAdvertisingClaimPolicy(value: unknown) {
  const findings = Array.from(new Set(detectUnsupportedAdClaims(value)));
  return {
    allowed: findings.length === 0,
    policyVersion: ADVERTISING_CLAIM_POLICY_VERSION,
    policyDigest: ADVERTISING_CLAIM_POLICY_DIGEST,
    findings,
  };
}

export function buildClaimSafeFallback(params?: {
  intent?: CampaignIntent;
  location?: string;
}) {
  const suffix = locationSuffix(params?.location);

  switch (params?.intent) {
    case "seller":
      return `Review a market-based home value and sale plan${suffix}`;
    case "investor":
      return `Review available investment opportunities with cash-flow and risk analysis${suffix}`;
    case "approval":
    case "refinance":
      return `Review homes and financing options you may qualify for${suffix}`;
    case "buyer":
      return `Review homes that may fit your goals and budget${suffix}`;
    default:
      return `Review available real estate opportunities${suffix}`;
  }
}

export function sanitizeAdClaimText(
  value: unknown,
  params?: {
    intent?: CampaignIntent;
    location?: string;
    fallback?: string;
  },
) {
  const text = clean(value);

  if (!text || !hasUnsupportedAdClaim(text)) {
    return text;
  }

  const requestedFallback = clean(params?.fallback);
  if (requestedFallback && !hasUnsupportedAdClaim(requestedFallback)) {
    return requestedFallback;
  }

  return buildClaimSafeFallback(params);
}

export function assertNoUnsupportedAdClaims(value: unknown, label = "advertising copy") {
  const claims = detectUnsupportedAdClaims(value);

  if (claims.length > 0) {
    throw new AdvertisingClaimUnverifiedError(claims, label);
  }
}
