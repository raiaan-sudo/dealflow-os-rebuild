import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";

export type CategoryRulePack = {
  category: CampaignCategory;
  triggerConditions: string[];
  internalTensions: string[];
  winningAngles: string[];
  approvedHookStructures: string[];
  forbiddenHookPatterns: string[];
  approvedMechanismStyles: string[];
  proofStyles: string[];
  visualLogic: string[];
  overlayLogic: string[];
  antiPatterns: string[];
  explicitLowFrictionCtas: string[];
  defaultCtaStyle: string;
};

export const CATEGORY_RULE_PACKS: Record<CampaignCategory, CategoryRulePack> = {
  buyer: {
    category: "buyer",
    triggerConditions: [
      "renting frustration",
      "life upgrade",
      "market uncertainty",
    ],
    internalTensions: [
      "paying rent while better-fit homes move first",
      "not knowing if you can buy sooner than you think",
      "worrying you will miss the right home by waiting",
    ],
    winningAngles: [
      "hidden inventory",
      "affordability access",
      "upsize opportunity",
    ],
    approvedHookStructures: [
      "If you're looking to upsize in {market}, stop scrolling.",
      "Most buyers don't know this about {market} yet.",
      "Here's how people are getting into {propertyType} with less friction right now.",
    ],
    forbiddenHookPatterns: [
      "new listing alert",
      "what is your home worth",
      "dream home",
      "learn more",
    ],
    approvedMechanismStyles: [
      "off-market access system",
      "approval-first matching process",
      "property matching workflow before homes hit MLS",
    ],
    proofStyles: [
      "payment comparison overlay",
      "affordability certainty",
      "inventory access proof",
      "monthly payment anchor",
    ],
    visualLogic: [
      "warm lived-in interiors",
      "families using kitchens and backyards",
      "livable space over empty staging",
      "kitchen and backyard opportunity framing",
    ],
    overlayLogic: [
      "monthly payment overlays",
      "price anchors over adjectives",
      "opportunity-led location text",
      "under-budget affordability callouts",
    ],
    antiPatterns: [
      "generic empty listings",
      "agent-first branding",
      "demographic-only hooks",
      "cold luxury emptiness",
      "perfectly staged stock-photo interiors",
    ],
    explicitLowFrictionCtas: [
      "See Homes That Match",
      "See If You Qualify",
      "Check Monthly Payment Options",
    ],
    defaultCtaStyle: "curiosity",
  },
  seller: {
    category: "seller",
    triggerConditions: [
      "area appreciation",
      "seeing neighbors sell",
      "concern about timing",
    ],
    internalTensions: [
      "fear of underpricing before demand is tested",
      "uncertainty about whether this is the right time to sell",
      "worry that the wrong agent or wrong timing will cost real money",
    ],
    winningAngles: [
      "equity gap",
      "pricing risk",
      "timing mistake",
    ],
    approvedHookStructures: [
      "Before you sell your home in {market}, watch this.",
      "Most homeowners in {market} are making this mistake right now.",
      "If you're thinking about selling this year, don't list before this step.",
    ],
    forbiddenHookPatterns: [
      "what is your home worth",
      "sell your home fast",
      "free home evaluation",
      "learn more",
    ],
    approvedMechanismStyles: [
      "pre-market positioning strategy",
      "demand test before listing",
      "buyer attraction plan before going live",
    ],
    proofStyles: [
      "price comparison overlay",
      "equity delta proof",
      "timing certainty proof",
      "home value update comparison",
    ],
    visualLogic: [
      "clean suburban homes",
      "family-oriented exteriors",
      "map or demand indicators with pricing context",
      "zestimate-style price comparison boards",
    ],
    overlayLogic: [
      "price overlays",
      "before-versus-after sale numbers",
      "home-value comparison headlines",
      "location-led equity update banners",
    ],
    antiPatterns: [
      "generic luxury glamour shots",
      "pitchy agent hero visuals",
      "surface-level sell your home copy",
      "generic curb appeal without proof",
      "perfect listing-photo polish without local proof",
    ],
    explicitLowFrictionCtas: [
      "Get My Price Update",
      "See My Value Gap",
      "Check Pre-Listing Demand",
    ],
    defaultCtaStyle: "low_friction",
  },
  investor: {
    category: "investor",
    triggerConditions: [
      "idle capital",
      "comparing asset classes",
      "looking for yield",
    ],
    internalTensions: [
      "capital sitting still while better opportunities compound",
      "uncertainty about which market actually outperforms",
      "worry that you are underwriting the wrong deals",
    ],
    winningAngles: [
      "cash flow plus appreciation",
      "overlooked market data",
      "capital efficiency",
    ],
    approvedHookStructures: [
      "If your money is sitting in the bank, watch this.",
      "Here's what smart investors are doing in {market} right now.",
      "This {market} pocket is being overlooked by most investors.",
    ],
    forbiddenHookPatterns: [
      "new listing alert",
      "dream investment",
      "beautiful property",
      "learn more",
    ],
    approvedMechanismStyles: [
      "micro-market analysis system",
      "undervalued-area selection process",
      "long-term growth underwriting framework",
    ],
    proofStyles: [
      "ROI projection overlay",
      "rental yield comparison",
      "market data proof",
      "cash-flow plus appreciation comparison",
    ],
    visualLogic: [
      "clean dashboards with buildings",
      "market charts over lifestyle scenes",
      "logic-led financial visuals",
      "rent versus price comparison layouts",
    ],
    overlayLogic: [
      "ROI percentages",
      "yield overlays",
      "rent-versus-price comparisons",
      "micro-market data callouts",
    ],
    antiPatterns: [
      "emotional lifestyle framing",
      "generic luxury interiors",
      "vague appreciation promises",
      "property-beauty-first framing",
      "presentation-deck clutter",
    ],
    explicitLowFrictionCtas: [
      "See Available Cash-Flow Deals",
      "Review The Deal Breakdown",
      "See Yield By Area",
    ],
    defaultCtaStyle: "analysis",
  },
  precon: {
    category: "precon",
    triggerConditions: [
      "low entry desire",
      "can't afford resale now",
      "belief area will appreciate",
    ],
    internalTensions: [
      "wanting into the market without full resale-level cash today",
      "fear of waiting while future pricing moves up",
      "uncertainty about which projects have real upside versus brochure hype",
    ],
    winningAngles: [
      "lock today's price pay later",
      "low deposit leverage",
      "future area growth",
    ],
    approvedHookStructures: [
      "This is how people are buying real estate without paying full price today.",
      "You don't need a full down payment to secure this in {market}.",
      "Invest early before this part of {market} explodes.",
    ],
    forbiddenHookPatterns: [
      "new condo release",
      "register now",
      "exclusive opportunity",
      "learn more",
    ],
    approvedMechanismStyles: [
      "phased deposit structure",
      "interest-earning deposits",
      "assignment-ready purchase structure",
    ],
    proofStyles: [
      "timeline proof",
      "deposit schedule proof",
      "future-value comparison",
      "entry price versus future value proof",
    ],
    visualLogic: [
      "current versus future split scenes",
      "construction plus finished render",
      "development pins and infrastructure cues",
      "timeline-first pre-con layouts",
    ],
    overlayLogic: [
      "deposit and timeline graphics",
      "completion year anchors",
      "below-market payment framing",
      "10 percent down style entry anchors",
    ],
    antiPatterns: [
      "final render only",
      "generic condo glamour",
      "no timeline context",
      "no construction reality cues",
      "over-polished brochure rendering",
    ],
    explicitLowFrictionCtas: [
      "See Deposit Options",
      "View Completion Timeline",
      "Check Entry Pricing",
    ],
    defaultCtaStyle: "curiosity",
  },
  luxury: {
    category: "luxury",
    triggerConditions: [
      "status signaling",
      "identity alignment",
      "desire for exclusivity",
    ],
    internalTensions: [
      "wanting private access before the market sees it",
      "needing the property to match identity, not just price",
      "rejecting public-market sameness in favor of rarity",
    ],
    winningAngles: [
      "private access",
      "scarcity",
      "identity-led exclusivity",
    ],
    approvedHookStructures: [
      "This isn't for everyone.",
      "If you know, you know.",
      "Rare opportunity in {market} for the right buyer.",
    ],
    forbiddenHookPatterns: [
      "new listing alert",
      "luxury living",
      "exclusive deal",
      "learn more",
    ],
    approvedMechanismStyles: [
      "private access network",
      "off-market curation process",
      "curated listing circle",
    ],
    proofStyles: [
      "scarcity proof",
      "private access proof",
      "identity-aligned exclusivity",
    ],
    visualLogic: [
      "cinematic views and textures",
      "minimal text with premium composition",
      "lighting, skyline, marble, glass",
      "moody depth and shadow-led framing",
    ],
    overlayLogic: [
      "minimal text",
      "rare availability framing",
      "subtle location-led exclusivity",
      "quiet private-access cues",
    ],
    antiPatterns: [
      "overloaded text blocks",
      "cheap urgency language",
      "generic empty luxury rooms without mood",
      "discount-style promo overlays",
      "perfect showroom styling with no identity cue",
    ],
    explicitLowFrictionCtas: [
      "Request Private Access",
      "View The Private Release",
      "See If This Fits",
    ],
    defaultCtaStyle: "exclusive",
  },
};

export function getCategoryRulePack(category: CampaignCategory): CategoryRulePack {
  return CATEGORY_RULE_PACKS[category];
}
