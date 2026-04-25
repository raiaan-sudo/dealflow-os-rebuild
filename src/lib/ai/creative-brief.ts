import {
  inferCampaignIntent,
  isInvestorCampaignIntent,
  isSellerCampaignIntent,
  type CampaignIntent,
} from "@/lib/campaign-intent";

export type CreativeBriefInput = {
  location?: string;
  audience?: string;
  property_type?: string;
  offer?: string;
  key_offer?: string;
  mechanism?: string;
  pain_points?: string[];
  desired_result?: string;
  market_type?: CampaignIntent;
};

export type CreativeBrief = {
  location: string;
  audience: string;
  propertyType: string;
  keyOffer: string;
  mechanism: string;
  painPoints: string[];
  tone: string;
  angles: string[];
  hooks: string[];
  visualDirection: string;
  scriptStyle: string;
};

function safeText(input: unknown): string {
  if (input === null || input === undefined) {
    return "";
  }

  return String(input).trim();
}

function safeLower(input: unknown): string {
  return safeText(input).toLowerCase();
}

function safeArray(input: unknown): string[] {
  return Array.isArray(input) ? input.map((item) => safeText(item)).filter(Boolean) : [];
}

function toTitleCase(value: string) {
  return safeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferMarketType(params: {
  audience: string;
  propertyType: string;
  provided?: CampaignIntent;
}) {
  return inferCampaignIntent({
    intent: params.provided,
    marketType: params.provided,
    audience: params.audience,
    offer: params.propertyType,
  });
}

function transformOffer(params: {
  keyOffer: string;
  marketType: CampaignIntent;
}) {
  const offer = safeText(params.keyOffer);

  if (!offer) {
    return isSellerCampaignIntent(params.marketType)
      ? "Get your home sold with a stronger plan"
      : isInvestorCampaignIntent(params.marketType)
        ? "See stronger investor-grade opportunities"
      : "Get access to better deals";
  }

  return enhanceOffer(offer, params.marketType);
}

function transformMechanism(params: {
  mechanism: string;
  marketType: CampaignIntent;
}) {
  const mechanism = safeText(params.mechanism);
  const normalized = safeLower(mechanism);

  if (!mechanism) {
    return isSellerCampaignIntent(params.marketType)
      ? "With a seller-focused launch system, we connect you with qualified buyers"
      : isInvestorCampaignIntent(params.marketType)
        ? "With an investor-focused deal flow system, we surface stronger opportunities faster"
      : "With a deal-focused system, we help you move faster";
  }

  if (/off market buyers/.test(normalized)) {
    return "With access to our off-market buyer network, we connect you directly with serious buyers";
  }

  if (isSellerCampaignIntent(params.marketType) && /approval|mortgage|buyer/.test(normalized)) {
    return "With a seller-focused launch system, we position your home in front of qualified buyers";
  }

  return mechanism;
}

function enforceAudienceLanguage(params: {
  value: string;
  marketType: CampaignIntent;
  offer: string;
  location: string;
}) {
  const value = safeText(params.value);

  if (isSellerCampaignIntent(params.marketType)) {
    if (/buyer leads|find properties|get access to deals|buy in/i.test(value)) {
      return `Sell your home with a stronger plan in ${params.location}`;
    }
    return value;
  }

  if (/sell your home|get your home sold|qualified buyers/i.test(value)) {
    return `Get access to deals in ${params.location}`;
  }

  return value;
}

function inferTone(params: {
  audience: string;
  marketType: CampaignIntent;
}) {
  if (isSellerCampaignIntent(params.marketType)) {
    return "confident, direct, reassuring";
  }

  if (isInvestorCampaignIntent(params.marketType)) {
    return "sharp, fast, opportunity-led";
  }

  if (/first|new|starter/i.test(params.audience)) {
    return "clear, urgent, encouraging";
  }

  return "direct, urgent, helpful";
}

function inferPainPoints(params: {
  painPoints: string[];
  marketType: CampaignIntent;
}) {
  if ((params.painPoints ?? []).length > 0) {
    return params.painPoints;
  }

  if (isSellerCampaignIntent(params.marketType)) {
    return ["guessing your next move"];
  }

  if (isInvestorCampaignIntent(params.marketType)) {
    return ["missing the best deals"];
  }

  return ["getting beat by faster buyers"];
}

function inferAngles(params: {
  location: string;
  audience: string;
  keyOffer: string;
  painPoints: string[];
  marketType: CampaignIntent;
}) {
  const market = toTitleCase(params.location);
  const pain = params.painPoints[0] ?? "missing the right opportunity";
  const offer = safeText(params.keyOffer) || "off-market access";

  if (isSellerCampaignIntent(params.marketType)) {
    return [
      offer,
      `Most sellers in ${market} never reach the right buyers`,
      `The best seller opportunities in ${market} move when the launch is sharp`,
    ];
  }

  if (isInvestorCampaignIntent(params.marketType)) {
    return [
      `See stronger investor opportunities in ${market}`,
      `Most investors in ${market} miss the best deals`,
      `${market} cash-flow opportunities move faster than most investors expect`,
    ];
  }

  return [
    `Get ${offer} in ${market}`,
    `Stop ${pain}`,
    `${market} moves faster than most buyers expect`,
  ];
}

function inferHooks(params: {
  location: string;
  audience: string;
  keyOffer: string;
  painPoints: string[];
  marketType: CampaignIntent;
}) {
  const market = toTitleCase(params.location);
  const year = new Date().getFullYear();
  const offer = safeLower(params.keyOffer);
  const requirement =
    /approval|credit|mortgage/i.test(offer)
      ? "perfect credit"
      : /deposit|down/i.test(offer)
        ? "20% down"
        : "the usual process";

  if (isSellerCampaignIntent(params.marketType)) {
    return [
      `Nobody is talking about ${offer || "this seller edge"}`,
      `If you're selling in ${market}, watch this`,
      "You don’t need stale listing tactics anymore",
    ];
  }

  if (isInvestorCampaignIntent(params.marketType)) {
    return [
      `Investors in ${market}: stop missing the best opportunities`,
      `If you're investing in ${market}, watch this`,
      "The strongest investor deals move before most people even see them",
    ];
  }

  return [
    `Nobody is talking about ${offer || "this"}`,
    `If you're buying in ${year}, watch this`,
    `You don't need ${requirement} anymore`,
  ];
}

function inferVisualDirection(params: {
  location: string;
  propertyType: string;
}) {
  const market = toTitleCase(params.location);
  const propertyType = safeLower(params.propertyType);

  if (/condo/.test(propertyType)) {
    return `${market} condo visuals with modern, urban, clean framing`;
  }

  if (/luxury/.test(propertyType)) {
    return `${market} luxury property visuals with polished, editorial framing`;
  }

  if (/detached|family|suburb/.test(propertyType)) {
    return `${market} family-home visuals with warm, modern neighborhood framing`;
  }

  return `${market} real estate visuals with modern, local-market framing`;
}

function inferScriptStyle(params: {
  marketType: CampaignIntent;
  audience: string;
}) {
  if (isSellerCampaignIntent(params.marketType)) {
    return "authority";
  }

  if (/first|new|starter/i.test(params.audience)) {
    return "UGC";
  }

  return "UGC";
}

export function buildCreativeBrief(input?: CreativeBriefInput | null): CreativeBrief {
  const raw: Partial<CreativeBriefInput> = input ?? {};
  const location = safeText(raw.location) || "your market";
  const audience = safeText(raw.audience) || "motivated local buyers";
  const propertyType = safeText(raw.property_type) || "homes";
  const marketType = inferMarketType({
    audience,
    propertyType,
    provided: raw.market_type,
  });
  const keyOffer = transformOffer({
    keyOffer: safeText(raw.key_offer) || safeText(raw.offer) || "a stronger buying opportunity",
    marketType,
  });
  const mechanism = transformMechanism({
    mechanism: safeText(raw.mechanism),
    marketType,
  });
  const painPoints = inferPainPoints({
    painPoints: safeArray(raw.pain_points),
    marketType,
  });

  return {
    location,
    audience: enforceAudienceLanguage({
      value: audience,
      marketType,
      offer: keyOffer,
      location,
    }),
    propertyType,
    keyOffer,
    mechanism,
    painPoints,
    tone: inferTone({ audience, marketType }),
    angles: inferAngles({ location, audience, keyOffer, painPoints, marketType }),
    hooks: inferHooks({ location, audience, keyOffer, painPoints, marketType }),
    visualDirection: inferVisualDirection({ location, propertyType }),
    scriptStyle: inferScriptStyle({ marketType, audience }),
  };
}
import { enhanceOffer } from "@/lib/copy/offer-enhancement";
