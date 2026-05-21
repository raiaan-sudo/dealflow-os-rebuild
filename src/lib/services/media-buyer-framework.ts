import type { CampaignCategory } from "@/lib/services/campaign-creative-strategy";

export type MediaBuyerCoreStep =
  | "pattern_interrupt"
  | "internal_problem"
  | "mechanism"
  | "proof_outcome"
  | "low_friction_cta";

export type MediaBuyerCategoryStrategy = {
  category: CampaignCategory;
  psychology: string[];
  triggerConditions: string[];
  internalTensions: string[];
  winningAngles: string[];
  approvedHookPatterns: string[];
  forbiddenHookPatterns: string[];
  mechanismStyles: string[];
  proofStyles: string[];
  visualLogic: string[];
  overlayLogic: string[];
  lowFrictionCtas: string[];
  antiPatterns: string[];
};

export type MediaBuyerCampaignPackage = {
  id: string;
  category: CampaignCategory;
  angle: string;
  keywords: string[];
  hook: string;
  primaryText: string;
  headline: string;
  cta: string;
  funnelHeadline: string;
  funnelSubheadline: string;
  formFields: string[];
  creativeDirection: string;
  complianceNotes: string[];
};

export type OfferQualityEvaluation = {
  accepted: boolean;
  score: number;
  components: {
    specificOutcome: number;
    numberOrQuantifier: number;
    timeframe: number;
    riskReversal: number;
    mechanismClarity: number;
    audienceSpecificity: number;
    lowFrictionNextStep: number;
  };
  hardFailures: string[];
  improvementHints: string[];
  safeOffer: string;
};

export type CreativeQualityEvaluation = {
  accepted: boolean;
  score: number;
  components: {
    offerStrength: number;
    hookStrength: number;
    mechanismClarity: number;
    proofStrength: number;
    visualSpecificity: number;
    ctaFriction: number;
    categoryFit: number;
    antiGenericRisk: number;
    mediaBuyerReference: number;
    previewReadability: number;
  };
  hardFailures: string[];
  improvementHints: string[];
};

export const MEDIA_BUYER_CORE_STRUCTURE: MediaBuyerCoreStep[] = [
  "pattern_interrupt",
  "internal_problem",
  "mechanism",
  "proof_outcome",
  "low_friction_cta",
];

export const MEDIA_BUYER_CATEGORY_STRATEGIES: Record<
  CampaignCategory,
  MediaBuyerCategoryStrategy
> = {
	  seller: {
    category: "seller",
    psychology: [
      "fear of underpricing",
      "fear of bad timing",
      "fear of choosing the wrong agent",
      "ego that the home may be worth more than expected",
      "risk aversion before listing",
    ],
    triggerConditions: [
      "living in home 5+ years",
      "area appreciation",
      "seeing neighbors sell",
      "thinking about selling this year",
    ],
    internalTensions: [
      "not knowing if listing now is the right move",
      "fear of losing money before the home is even listed",
      "worry that demand was never tested before pricing",
    ],
	    winningAngles: [
	      "hidden equity check",
	      "buyer demand before listing",
	      "neighbor sale comparison",
	      "market timing window",
	      "downsizing opportunity report",
	      "sell versus renovate decision",
	    ],
	    approvedHookPatterns: [
	      "Before you list in {market}, check your true home value range.",
	      "Buyers are shifting fast in {market}; this affects your price.",
	      "If you're thinking about selling this year, don't list before this step.",
	      "What your neighbor just sold for may change your next move.",
	    ],
    forbiddenHookPatterns: [
      "what is your home worth",
      "sell your home fast",
      "free home evaluation",
      "attention homeowners",
      "learn more",
    ],
    mechanismStyles: [
      "pre-market positioning strategy",
      "demand test before listing",
      "buyer attraction plan before going live",
    ],
	    proofStyles: [
	      "neighborhood sale comparison report",
	      "equity delta proof",
	      "timing certainty proof",
	      "buyer demand indicators",
	      "days-on-market trend",
	    ],
	    visualLogic: [
	      "map overlays",
	      "neighborhood sale comparison reports",
	      "before-after price numbers",
	      "clean suburban homes",
	      "demand indicators",
    ],
    overlayLogic: [
      "price overlays",
      "home-value update banners",
      "numbers before adjectives",
      "location-led equity proof",
    ],
	    lowFrictionCtas: [
	      "Get My Equity Report",
	      "Get My Price Range",
	      "Check Pre-Listing Demand",
	      "Check My Timing",
	    ],
    antiPatterns: [
      "empty luxury shots",
      "pitchy agent hero visuals",
      "generic curb appeal",
      "agent-first bragging",
    ],
  },
	  buyer: {
    category: "buyer",
    psychology: [
      "fear of missing out",
      "confusion and overwhelm",
      "hope for upgrade",
      "affordability anxiety",
    ],
    triggerConditions: [
      "renting frustration",
      "life upgrade",
      "market uncertainty",
      "looking to upsize",
    ],
    internalTensions: [
      "not knowing what is still affordable",
      "getting beat before the best homes go public",
      "worrying that waiting means missing the right home",
    ],
	    winningAngles: [
	      "hidden inventory access",
	      "budget-matched home shortlist",
	      "early access listings",
	      "true buying power",
	      "neighborhood match report",
	      "move-up strategy",
	    ],
	    approvedHookPatterns: [
	      "Most buyers do not know what they can actually afford in {market}.",
	      "Before the best homes hit public sites, check this first.",
	      "Here's how to get a better-fit home shortlist in {market}.",
	      "Before they hit public sites, check this first.",
	    ],
    forbiddenHookPatterns: [
      "new listing alert",
      "dream home",
      "attention buyers",
      "learn more",
    ],
	    mechanismStyles: [
	      "curated home shortlist",
	      "affordability breakdown",
	      "property matching workflow before homes hit MLS",
	      "neighborhood match report",
	    ],
	    proofStyles: [
	      "monthly payment anchor",
	      "affordability comparison",
	      "inventory access proof",
	      "early-access proof",
    ],
    visualLogic: [
      "walkthrough clips",
      "warm livable interiors",
      "family using space",
      "backyard and kitchen focus",
    ],
    overlayLogic: [
      "price anchors",
      "monthly payment overlays",
      "under-budget callouts",
      "early-access callouts",
    ],
	    lowFrictionCtas: [
	      "Get My Home List",
	      "See Homes That Match",
	      "Check My Budget Range",
	      "Get Early Access",
	    ],
    antiPatterns: [
      "overly staged empty homes",
      "property-only listing ads",
      "agent-first branding",
      "generic lifestyle stock shots",
    ],
  },
  precon: {
    category: "precon",
    psychology: [
      "timeline arbitrage",
      "risk-aware upside",
      "low-entry leverage",
      "belief that the area will develop",
    ],
    triggerConditions: [
      "cannot afford resale now",
      "low entry desire",
      "belief market will go up",
    ],
    internalTensions: [
      "wanting into the market without full resale-level cash today",
      "fear of waiting while future pricing moves up",
      "uncertainty about which projects have real upside",
    ],
    winningAngles: [
      "lock today's price and pay later",
      "10 percent down with future completion",
      "area developing toward future value",
    ],
    approvedHookPatterns: [
      "This is how people are buying real estate without paying full price today.",
      "You don't need a full down payment to secure this in {market}.",
      "Invest early before this area changes.",
    ],
    forbiddenHookPatterns: [
      "new condo release",
      "register now",
      "exclusive opportunity",
      "learn more",
    ],
    mechanismStyles: [
      "phased deposit structure",
      "interest-earning deposit path",
      "assignment-ready purchase structure",
    ],
    proofStyles: [
      "deposit schedule proof",
      "completion timeline proof",
      "current-versus-future value proof",
    ],
    visualLogic: [
      "current versus future split scenes",
      "construction plus finished render",
      "development pins",
      "timeline graphics",
    ],
    overlayLogic: [
      "2026 to 2028 timeline",
      "10 percent deposit callout",
      "below-market entry pricing",
      "completion year anchor",
    ],
    lowFrictionCtas: [
      "Get The List",
      "View Deposit Options",
      "Check Entry Pricing",
    ],
    antiPatterns: [
      "final render only",
      "brochure-only glamour",
      "no timeline context",
      "generic condo promo",
    ],
  },
  luxury: {
    category: "luxury",
    psychology: [
      "status signaling",
      "exclusivity",
      "identity alignment",
      "desire for uniqueness",
    ],
    triggerConditions: [
      "high income or wealth",
      "social positioning",
      "desire for uniqueness",
    ],
    internalTensions: [
      "wanting private access before everyone else sees it",
      "needing the property to match identity",
      "rejecting public-market sameness",
    ],
    winningAngles: [
      "not publicly available",
      "only a few units like this",
      "designed for a certain type of buyer",
    ],
    approvedHookPatterns: [
      "This isn't for everyone.",
      "If you know, you know.",
      "Rare opportunity in {market}.",
    ],
    forbiddenHookPatterns: [
      "new listing alert",
      "luxury living",
      "exclusive deal",
      "learn more",
    ],
    mechanismStyles: [
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
      "penthouse views",
      "marble glass skyline",
      "night city lighting",
      "subtle motion feel",
    ],
    overlayLogic: [
      "minimal text",
      "quiet private access cue",
      "rare availability",
      "subtle location-led exclusivity",
    ],
    lowFrictionCtas: [
      "Request Private Access",
      "View The Private Release",
      "See If This Fits",
    ],
    antiPatterns: [
      "overloaded text",
      "discount-style promo overlays",
      "cheap urgency language",
      "generic empty luxury rooms",
    ],
  },
	  investor: {
    category: "investor",
    psychology: [
      "return",
      "risk mitigation",
      "data-backed decisions",
      "asset-class comparison",
    ],
    triggerConditions: [
      "capital sitting idle",
      "looking for yield",
      "comparing asset classes",
    ],
    internalTensions: [
      "capital sitting still while better opportunities compound",
      "not knowing which market actually outperforms",
      "underwriting the wrong deals",
    ],
	    winningAngles: [
	      "cash-flow screening list",
	      "under-market properties",
	      "rent-to-price ratio map",
	      "cap rate breakdown by neighborhood",
	      "off-market deals",
	      "BRRRR-ready properties",
	      "multifamily yield opportunities",
	    ],
	    approvedHookPatterns: [
	      "Which neighborhoods actually still cash flow?",
	      "Where investors are quietly outperforming right now.",
	      "We pre-screen deals so you do not waste time.",
	      "This pocket of {market} is being overlooked by most investors.",
	    ],
    forbiddenHookPatterns: [
      "dream investment",
      "beautiful property",
      "new listing alert",
      "learn more",
    ],
	    mechanismStyles: [
	      "cash-flow deal screening list",
	      "micro-market analysis system",
	      "undervalued-area selection process",
	      "rent-to-price ratio map",
	      "underwritten deal sheet",
	    ],
    proofStyles: [
      "ROI projection overlay",
      "rental yield comparison",
      "rent-versus-price comparison",
      "cash-flow plus appreciation proof",
    ],
    visualLogic: [
      "clean dashboards",
      "charts plus buildings",
      "ROI projections",
      "rent versus price comparisons",
    ],
    overlayLogic: [
      "ROI percentages",
      "rental yield overlays",
      "micro-market data callouts",
      "cash-flow numbers",
    ],
	    lowFrictionCtas: [
	      "Get Deal Flow",
	      "See Available Cash-Flow Deals",
	      "Review The Deal Breakdown",
	      "See ROI Map",
	    ],
    antiPatterns: [
      "emotional lifestyle shots",
      "generic luxury interiors",
      "vague appreciation promises",
      "property-beauty-first framing",
    ],
  },
  commercial: {
    category: "commercial",
    psychology: [
      "operational fit",
      "timing risk",
      "location economics",
      "space requirement clarity",
    ],
    triggerConditions: [
      "business expansion",
      "tenant or owner-user demand",
      "asset-specific opportunity",
    ],
    internalTensions: [
      "not knowing which spaces truly fit the operating plan",
      "worrying that lease or purchase timing will create costly friction",
      "chasing listings that look available but fail the requirement check",
    ],
    winningAngles: [
      "space-fit analysis",
      "availability before competitors move",
      "location economics",
    ],
    approvedHookPatterns: [
      "If your business needs space in {market}, start here.",
      "Most commercial searches in {market} miss this step.",
      "Here's how operators are finding better-fit {propertyType} right now.",
    ],
    forbiddenHookPatterns: [
      "dream office",
      "beautiful property",
      "generic availability",
      "learn more",
    ],
    mechanismStyles: [
      "commercial space-fit analysis",
      "tenant and owner-user qualification workflow",
      "market availability screening system",
    ],
    proofStyles: [
      "space-fit comparison",
      "availability map",
      "lease versus purchase proof",
      "operating-cost comparison",
    ],
    visualLogic: [
      "clean commercial maps",
      "office retail or industrial exteriors",
      "space planning checklists",
      "operator-focused dashboards",
    ],
    overlayLogic: [
      "square-footage callouts",
      "location requirement chips",
      "availability and timing cues",
      "lease or purchase fit labels",
    ],
    lowFrictionCtas: [
      "See Matching Spaces",
      "Review Available Options",
      "Check Space Fit",
    ],
    antiPatterns: [
      "residential lifestyle framing",
      "generic skyline glamour",
      "agent-first branding",
      "vague investment promises",
    ],
  },
};

export const MEDIA_BUYER_CAMPAIGN_PACKAGES: Partial<Record<CampaignCategory, MediaBuyerCampaignPackage[]>> = {
  seller: [
    {
      id: "seller-equity-discovery",
      category: "seller",
      angle: "Equity discovery",
      keywords: ["equity", "value", "price", "worth", "snapshot", "report", "range"],
      hook: "You might be sitting on more equity than you think.",
      primaryText:
        "Home values in your area have shifted recently. This report shows what your home could realistically sell for today based on local sales and buyer demand, not generic estimate sites.",
      headline: "See Your True Home Value Range",
      cta: "Get Report",
      funnelHeadline: "Unlock your home's current value range",
      funnelSubheadline: "Get a data-backed price range and buyer demand snapshot specific to your neighborhood.",
      formFields: ["Property address", "Property type", "Selling timeline"],
      creativeDirection: "Map blur with home pins, recent sale markers, and an equity range reveal.",
      complianceNotes: [
        "Use estimated range language, not exact sale-price promises.",
        "Avoid guaranteed sale price claims.",
      ],
    },
    {
      id: "seller-buyer-demand-pressure",
      category: "seller",
      angle: "Buyer demand pressure",
      keywords: ["demand", "buyers", "multiple", "pre-listing", "match"],
      hook: "Before you list, check how buyer demand has shifted.",
      primaryText:
        "Some homeowners are seeing stronger offers depending on timing, pricing, and demand. Check what buyer interest could look like before you list.",
      headline: "Check Buyer Demand for Your Home",
      cta: "See Demand",
      funnelHeadline: "See if buyers are actively looking for homes like yours",
      funnelSubheadline: "Get a market-informed demand snapshot before making a listing decision.",
      formFields: ["Property address", "Interest level", "Preferred timeline"],
      creativeDirection: "Buyer avatar cluster, neighborhood map, and active-search demand overlay.",
      complianceNotes: [
        "Say buyer demand insights, not guaranteed buyers.",
        "Avoid overpromising active buyers for a specific property.",
      ],
    },
    {
      id: "seller-timing-window",
      category: "seller",
      angle: "Timing window strategy",
      keywords: ["timing", "window", "market", "30-day", "sell vs", "renovate", "downsizing"],
      hook: "The selling window in your area may be changing.",
      primaryText:
        "Neighborhood-level conditions shift quickly. See whether now or later looks stronger based on current trends, buyer demand, and your selling timeline.",
      headline: "Is Now the Right Time to Sell?",
      cta: "Check Timing",
      funnelHeadline: "Understand your optimal selling window",
      funnelSubheadline: "Review data-backed timing signals for your exact area before deciding when to list.",
      formFields: ["Property address", "Timeline", "Reason for interest"],
      creativeDirection: "Timeline graph, sold-sign trend, and market shift detected overlay.",
      complianceNotes: [
        "Frame timing as market-informed guidance.",
        "Avoid fear-heavy or guaranteed outcome claims.",
      ],
    },
  ],
  buyer: [
    {
      id: "buyer-affordability-reality-check",
      category: "buyer",
      angle: "Affordability reality check",
      keywords: ["afford", "budget", "payment", "approval", "pre-approval", "range"],
      hook: "Most buyers do not know what they can actually afford today.",
      primaryText:
        "Most buyers overestimate or underestimate their buying power. Get a clear breakdown of which homes match your budget in the areas you care about.",
      headline: "See Your Real Buying Power",
      cta: "Check Now",
      funnelHeadline: "Understand your true budget range",
      funnelSubheadline: "See homes and payment paths that fit your budget before wasting weekends on the wrong listings.",
      formFields: ["Budget range", "Preferred location", "Timeline"],
      creativeDirection: "Payment slider UI, budget-fit map pins, and simple affordability range cards.",
      complianceNotes: [
        "Do not imply guaranteed approval.",
        "Keep financing language as educational and criteria-based.",
      ],
    },
    {
      id: "buyer-early-access-homes",
      category: "buyer",
      angle: "Early access homes",
      keywords: ["early", "access", "private", "hidden", "off-market", "before"],
      hook: "Before the best homes hit public sites, check this first.",
      primaryText:
        "Get early-access matches based on your criteria before the strongest options become obvious to every buyer in the market.",
      headline: "Get Early Access Listings",
      cta: "View Homes",
      funnelHeadline: "Access homes before the general market sees them",
      funnelSubheadline: "Get a curated preview of potential matches based on current availability and your buying criteria.",
      formFields: ["Budget range", "Preferred areas", "Property type"],
      creativeDirection: "Blurred listing cards, coming-soon tags, and clean map clusters.",
      complianceNotes: [
        "Avoid fake exclusivity claims.",
        "Use potential matches and early-access language when inventory is not guaranteed.",
      ],
    },
    {
      id: "buyer-curated-match-list",
      category: "buyer",
      angle: "Curated match list",
      keywords: ["curated", "shortlist", "home list", "matches", "neighborhood", "relocation", "move-up"],
      hook: "Here's how to get a better-fit home shortlist without the noise.",
      primaryText:
        "See a shortlist of homes shaped around your budget, lifestyle, and preferred areas. Less noise, clearer matches, and a faster next step.",
      headline: "See Your Home Matches",
      cta: "Get List",
      funnelHeadline: "View homes that actually match your criteria",
      funnelSubheadline: "Get a focused home shortlist based on your preferred location, price range, and buying timeline.",
      formFields: ["Budget range", "Locations", "Must-haves"],
      creativeDirection: "Clean listing grid, neighborhood shortlist, and matched-home cards.",
      complianceNotes: [
        "Avoid implying every listed home is available.",
        "Keep claims tied to criteria-based curation.",
      ],
    },
  ],
  investor: [
    {
      id: "investor-cash-flow-filter",
      category: "investor",
      angle: "Cash flow filter",
      keywords: ["cash-flow", "cash flow", "rental", "yield", "deal flow", "screen"],
      hook: "Cash-flow positive properties still exist, but they need filtering.",
      primaryText:
        "We filter noisy listings and surface opportunities with stronger rent-to-price fundamentals, clearer assumptions, and a better reason to underwrite.",
      headline: "See Cash Flow Deals",
      cta: "Get Deals",
      funnelHeadline: "View pre-screened cash flow opportunities",
      funnelSubheadline: "Review opportunities filtered around rent, price, and investor-fit signals before wasting time on weak deals.",
      formFields: ["Budget range", "Investment type", "Location preference"],
      creativeDirection: "Spreadsheet-style deal cards, rent estimates, and deal-fit score overlays.",
      complianceNotes: [
        "Use estimated cash-flow scenarios, not guaranteed ROI.",
        "Do not promise passive income or no-risk investments.",
      ],
    },
    {
      id: "investor-off-market-access",
      category: "investor",
      angle: "Off-market access",
      keywords: ["off-market", "pre-market", "private", "early", "alert"],
      hook: "Some of the strongest investment opportunities do not stay public for long.",
      primaryText:
        "Get a private investor list shaped around your criteria so you can review pre-market and off-market opportunities before they become overexposed.",
      headline: "Access Off-Market Deals",
      cta: "View Deals",
      funnelHeadline: "Get early access investor opportunities",
      funnelSubheadline: "See private and pre-market deal flow filtered around your acquisition criteria.",
      formFields: ["Budget range", "Location preference", "Investment type"],
      creativeDirection: "Blurred private deal cards, investor-only list preview, and limited-data overlays.",
      complianceNotes: [
        "Avoid unsupported exclusive inventory claims.",
        "Use early access and criteria-based filtering language.",
      ],
    },
    {
      id: "investor-roi-map-intelligence",
      category: "investor",
      angle: "ROI map intelligence",
      keywords: ["roi", "map", "ratio", "cap rate", "rent-to-price", "hot zones", "underwritten"],
      hook: "Where investors are quietly outperforming right now.",
      primaryText:
        "See rent-to-price ratios, investor pockets, and deal-fit signals so you can compare neighborhoods before committing time or capital.",
      headline: "See ROI Hot Zones",
      cta: "View Map",
      funnelHeadline: "Discover high-performing investment areas",
      funnelSubheadline: "Review market-based investment signals by area before choosing which opportunities to underwrite.",
      formFields: ["Budget range", "Strategy", "Cash-flow goal"],
      creativeDirection: "Heatmap, rent-to-price ratios, and investor dashboard overlays.",
      complianceNotes: [
        "Use market-based and estimated language.",
        "Avoid guaranteed returns, guaranteed profit, or no-risk claims.",
      ],
    },
  ],
  precon: [
    {
      id: "precon-deposit-entry",
      category: "precon",
      angle: "Deposit entry",
      keywords: ["deposit", "entry", "pre-con", "preconstruction", "new build", "completion"],
      hook: "Pre-construction entry can look different when the deposit path is clear.",
      primaryText:
        "Review new-build opportunities by deposit structure, completion timing, and buyer fit before the next release gets broader attention.",
      headline: "See Deposit-Friendly New Builds",
      cta: "View Deposit Options",
      funnelHeadline: "Compare deposit and completion paths",
      funnelSubheadline: "See new-build opportunities filtered by entry path, timing, and preferred area.",
      formFields: ["Budget range", "Preferred area", "Target completion timing"],
      creativeDirection: "Construction-progress source photo with clean buyer decision context and app-rendered deposit chips.",
      complianceNotes: [
        "Do not imply guaranteed appreciation.",
        "Use availability and timing language only when verified.",
      ],
    },
    {
      id: "precon-current-future-clarity",
      category: "precon",
      angle: "Current versus future clarity",
      keywords: ["current", "future", "completion", "timeline", "release", "phase"],
      hook: "The real question is not just price. It is timing, entry, and fit.",
      primaryText:
        "Compare where a project sits today, what completion timing could mean, and whether the entry structure fits your buying plan.",
      headline: "Check The New-Build Timeline",
      cta: "See Timeline Fit",
      funnelHeadline: "Understand which release timing fits your plan",
      funnelSubheadline: "Compare completion windows, entry structure, and area fit before choosing a pre-con path.",
      formFields: ["Timeline", "Budget range", "Preferred property type"],
      creativeDirection: "New-build exterior or buyer consultation source photo with DealFlow-rendered timeline proof.",
      complianceNotes: [
        "Avoid exact delivery guarantees unless sourced from the builder.",
        "Keep future-value language educational and scenario-based.",
      ],
    },
    {
      id: "precon-release-shortlist",
      category: "precon",
      angle: "Release shortlist",
      keywords: ["release", "shortlist", "new build", "condo", "townhome", "inventory"],
      hook: "Before the next release gets noisy, shortlist the options that actually fit.",
      primaryText:
        "Get a focused list of new-build opportunities shaped around your budget, property type, timeline, and preferred area.",
      headline: "Get The Pre-Con Shortlist",
      cta: "Get The Shortlist",
      funnelHeadline: "Get a pre-con shortlist matched to your criteria",
      funnelSubheadline: "Review new-build options by budget, area, property type, and expected timeline.",
      formFields: ["Budget range", "Preferred area", "Property type"],
      creativeDirection: "Buyer reviewing new-build options in a sales-center or home setting, without documents or readable signage.",
      complianceNotes: [
        "Do not imply private inventory unless confirmed.",
        "Avoid fake builder/project names.",
      ],
    },
  ],
  commercial: [
    {
      id: "commercial-space-fit",
      category: "commercial",
      angle: "Space fit",
      keywords: ["space", "fit", "requirements", "office", "retail", "industrial", "warehouse"],
      hook: "The wrong commercial space costs more than the rent.",
      primaryText:
        "Compare available options against your operating requirements, location needs, size, and timing before committing to the wrong fit.",
      headline: "Check Commercial Space Fit",
      cta: "Check Space Fit",
      funnelHeadline: "Find commercial spaces that fit your operating needs",
      funnelSubheadline: "Review space options by use case, size, location, budget, and timing.",
      formFields: ["Use case", "Target size", "Preferred area"],
      creativeDirection: "Commercial walkthrough source photo with app-rendered requirement chips and no fake interface.",
      complianceNotes: [
        "Use availability language only when inventory is current.",
        "Avoid guaranteeing tenant outcomes or business performance.",
      ],
    },
    {
      id: "commercial-location-requirements",
      category: "commercial",
      angle: "Location requirements",
      keywords: ["location", "corridor", "trade area", "access", "parking", "visibility"],
      hook: "Location only works when it matches the way your business operates.",
      primaryText:
        "Review commercial options by access, visibility, parking, trade area, and layout fit before spending time on weak matches.",
      headline: "Review Better-Fit Locations",
      cta: "Review Options",
      funnelHeadline: "Compare locations against your requirements",
      funnelSubheadline: "Get a focused review of spaces that better match your access, visibility, and operating needs.",
      formFields: ["Business type", "Location needs", "Timeline"],
      creativeDirection: "Street-level commercial exterior or operator walkthrough source photo with app-rendered fit labels.",
      complianceNotes: [
        "Do not imply traffic counts or revenue impact unless verified.",
        "Avoid fake maps, fake pins, and fake dashboards.",
      ],
    },
    {
      id: "commercial-lease-purchase-clarity",
      category: "commercial",
      angle: "Lease versus purchase clarity",
      keywords: ["lease", "purchase", "owner-user", "buy", "rent", "compare"],
      hook: "Before you lease or buy, compare the path that fits your next move.",
      primaryText:
        "See options through the lens of lease terms, purchase fit, operating needs, and timing so the next step is easier to judge.",
      headline: "Compare Lease And Purchase Fit",
      cta: "Compare Fit",
      funnelHeadline: "Compare commercial lease and purchase options",
      funnelSubheadline: "Review which route fits your operating plan, budget, and timing before committing.",
      formFields: ["Lease or purchase", "Budget range", "Target size"],
      creativeDirection: "Operator and advisor reviewing a commercial space, with DealFlow-rendered lease/purchase proof chips.",
      complianceNotes: [
        "Avoid financing guarantees.",
        "Keep cost comparison language scenario-based.",
      ],
    },
  ],
  luxury: [
    {
      id: "luxury-private-access",
      category: "luxury",
      angle: "Private access",
      keywords: ["private", "rare", "off-market", "exclusive", "waterfront", "penthouse"],
      hook: "The strongest private opportunities are reviewed before they become obvious.",
      primaryText:
        "Request a curated private-access review shaped around your preferred area, property style, timing, and fit.",
      headline: "Request Private Access",
      cta: "Request Private Access",
      funnelHeadline: "Request a private-access review",
      funnelSubheadline: "See rare-fit opportunities and private review paths shaped around your buying criteria.",
      formFields: ["Preferred area", "Property style", "Target range"],
      creativeDirection: "Restrained premium property or lifestyle source photo with app-rendered private-access CTA.",
      complianceNotes: [
        "Avoid unsupported exclusivity claims.",
        "Do not imply access to a specific private listing unless confirmed.",
      ],
    },
    {
      id: "luxury-fit-consultation",
      category: "luxury",
      angle: "Fit consultation",
      keywords: ["fit", "consultation", "criteria", "curated", "high-net", "search"],
      hook: "A rare-property search should start with fit, not noise.",
      primaryText:
        "Compare your criteria against available and private-path opportunities before broad-market search creates too much noise.",
      headline: "See What Actually Fits",
      cta: "Check Fit",
      funnelHeadline: "Clarify your rare-property criteria",
      funnelSubheadline: "Get a focused review of area, lifestyle, timing, and property-fit signals.",
      formFields: ["Preferred area", "Must-haves", "Timeline"],
      creativeDirection: "Premium consultation or property-review source photo with generous negative space and no readable documents.",
      complianceNotes: [
        "Keep claims restrained and criteria-based.",
        "Avoid luxury clichés and fake scarcity.",
      ],
    },
    {
      id: "luxury-scarcity-window",
      category: "luxury",
      angle: "Scarcity window",
      keywords: ["scarcity", "limited", "rare", "window", "release", "private"],
      hook: "When the right rare-fit opportunity appears, the review window is short.",
      primaryText:
        "Request a private review path that helps you compare fit, timing, and next steps before the opportunity gets broader exposure.",
      headline: "Review Rare-Fit Opportunities",
      cta: "Request Review",
      funnelHeadline: "Review rare-fit opportunities privately",
      funnelSubheadline: "See whether current private-access options match your area, timing, and property criteria.",
      formFields: ["Target area", "Target range", "Timeline"],
      creativeDirection: "Cinematic property detail or lifestyle source photo with DealFlow-rendered scarcity and review CTA.",
      complianceNotes: [
        "Do not fabricate scarcity.",
        "Avoid naming specific properties without verified permission.",
      ],
    },
  ],
};

const CATEGORY_SAFE_OFFERS: Record<CampaignCategory, string> = {
  seller: "Get a Home Equity Snapshot Report before you list",
  buyer: "Get a Curated Home List matched to your budget",
  precon: "View deposit and completion options before prices move",
  luxury: "Request private access to rare listings",
  investor: "Get a Cash Flow Deal List matched to your criteria",
  commercial: "Get commercial spaces matched to your operating requirements",
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: unknown) {
  return safeText(value).toLowerCase();
}

function stripNegativePromptGuidance(value: string) {
  return value
    .replace(/\bavoid\b[^.?!]*(?:[.?!]|$)/gi, " ")
    .replace(/\bdo not\b[^.?!]*(?:[.?!]|$)/gi, " ")
    .replace(/\bno\s+(?:fake|gibberish|pseudo|unreadable|tiny|cropped|overlapping|distorted|watermark|dashboard|ui|listing|table|chart|logo|guaranteed)[^.?!]*(?:[.?!]|$)/gi, " ")
    .replace(/\bnot\b\s+(?:a\s+|an\s+|the\s+)?[^.?!]*(?:[.?!]|$)/gi, " ")
    .replace(/\bwithout\b[^.?!]*(?:[.?!]|$)/gi, " ")
    .replace(/\bover showroom polish\b/gi, "over synthetic polish")
    .replace(/\s+/g, " ")
    .trim();
}

function clampScore(value: number) {
  return Math.max(0, Math.min(10, Number(value.toFixed(2))));
}

function containsAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => {
    const normalized = normalize(pattern).replace(/[^\w\s$%+-]+/g, " ").trim();
    return normalized.length > 2 && text.includes(normalized);
  });
}

function hasNumberOrQuantifier(text: string) {
  return (
    /\d|\$|%|\b(one|two|three|four|five|six|seven|eight|nine|ten|few|multiple|under|over|below|above|list|shortlist|range|snapshot|breakdown|report|map|early|private|curated)\b/.test(text)
  );
}

function hasTimeframe(text: string) {
  return /\b(today|now|daily|weekly|month|monthly|year|days?|weeks?|30|60|90|202\d|completion|deadline|before|early)\b/.test(text);
}

function hasRiskReversal(text: string, category: CampaignCategory) {
  if (category === "luxury") {
    return /\b(private|request|limited|rare|not publicly available|preview)\b/.test(text);
  }

  return /\b(guarantee|free|no obligation|without|before|off-market|private access|qualify|review|priority|low deposit|below-market|under|list|preview|refund|work for free)\b/.test(text);
}

function hasMechanismSignal(text: string) {
  return /\b(system|process|strategy|framework|network|filter|matching|access|pre-market|demand test|phased|micro-market|underwriting|sequence|workflow|structure)\b/.test(text);
}

function hasLowFrictionStep(text: string) {
  return /\b(see|view|get|check|request|access|qualify|review|preview|list|breakdown)\b/.test(text);
}

function hasAudienceSpecificity(text: string, category: CampaignCategory) {
  const categoryTerms: Record<CampaignCategory, RegExp> = {
    seller: /\b(seller|homeowners?|home|listing|pre-list|property price|price-and-demand|value)\b/,
    buyer: /\b(buyer|home|homes|upsize|monthly payment|afford|access)\b/,
    precon: /\b(pre-con|precon|new build|deposit|completion|assignment|construction)\b/,
    luxury: /\b(luxury|private|rare|penthouse|exclusive|high-net|curated)\b/,
    investor: /\b(investor|roi|yield|cash-flow|cash flow|rental|deal|underwriting)\b/,
    commercial: /\b(commercial|office|retail|industrial|warehouse|tenant|lease|owner-user|space|sq ft|square feet)\b/,
  };

  return categoryTerms[category].test(text);
}

function countVagueWords(text: string) {
  const matches = text.match(/\b(more|better|quality|grow|growth|leads|solutions?|service|help)\b/g);
  return matches?.length ?? 0;
}

function isB2BAgentAudience(audience: string) {
  return /\b(agent|realtor|broker|real estate professional|team leader)\b/.test(normalize(audience));
}

function containsB2BAgentOfferLeak(text: string) {
  return /\b(listing appointments?|homeowner appointments?|seller leads?|buyer leads?|realtors?|agents?|pay again|work for free|ad spend|lead quality)\b/.test(text);
}

function containsUnsafeGuarantee(text: string) {
  return /\b(guaranteed?\s+(?:approval|approved|financing|mortgage|loan|income|deals?|roi|profit|revenue|return|buyers?|appointments?|availability|showings?))\b/.test(text) ||
    /\bguaranteed?\b.{0,32}\b(?:600\+?\s*credit|credit\s*score|fico|approval|approved|financing|mortgage|loan)\b/.test(text);
}

function containsUnsafeHousingOrUrgencyClaim(text: string) {
  return (
    /\b(?:only|perfect|ideal|best)\s+for\s+(?:families|singles|young professionals|christians|muslims|seniors|retirees|students|immigrants|newcomers)\b/.test(text) ||
    /\b(?:no|not for|avoid)\s+(?:families|children|kids|students|seniors|immigrants|newcomers|section\s*8)\b/.test(text) ||
    /\b(?:safe|good)\s+(?:family\s+)?neighbou?rhood\b/.test(text) ||
    /\b(?:last chance|act now|only \d+ (?:spots?|homes?) left|expires today)\b/.test(text) ||
    /\b(?:buyers?|investors?)\s+(?:are\s+)?(?:lined up|waiting|guaranteed|ready to buy)\b/.test(text)
  );
}

function hasMediaBuyerReferenceLogic(text: string) {
  return (
    /\bmedia-buyer reference pattern\b/.test(text) ||
    /\bmedia-buyer source imagery logic\b/.test(text) ||
    /\btext-free background asset only\b/.test(text) ||
    /\bone dominant hook area\b/.test(text) ||
    /\bone proof area\b/.test(text) ||
    /\bclear cta-safe\b/.test(text) ||
    /\bdirect-response layout\b/.test(text) ||
    /\bdealflow will place exact text later\b/.test(text)
  );
}

function hasUnusablePreviewState(text: string) {
  return /\b(unreadable|gibberish|pseudo text|pseudo-readable|fake text|fake ui|fake pricing|covered text|text covered|covered by overlay|awkward crop|awkward preview|cropped headline|cut off headline|low-resolution|low resolution|watermark|warped phone|distorted hands|distorted architecture)\b/.test(text);
}

function hasGenericStockRisk(text: string) {
  return /\b(generic stock|stock photo|stock-photo|stock-photo-looking|empty luxury shot|generic empty|brochure-only|brochure style|showroom staging|generic realtor marketing)\b/.test(text);
}

function componentScore(condition: boolean, strong = 10, weak = 0) {
  return condition ? strong : weak;
}

export function getMediaBuyerCategoryStrategy(category: CampaignCategory) {
  return MEDIA_BUYER_CATEGORY_STRATEGIES[category];
}

export function getCategorySafeOffer(category: CampaignCategory) {
  return CATEGORY_SAFE_OFFERS[category];
}

export function getMediaBuyerCampaignPackages(category: CampaignCategory) {
  return MEDIA_BUYER_CAMPAIGN_PACKAGES[category] ?? [];
}

export function selectMediaBuyerCampaignPackage(
  category: CampaignCategory,
  context?: {
    offer?: string | null;
    audience?: string | null;
    propertyType?: string | null;
    mechanism?: string | null;
  },
) {
  const packages = getMediaBuyerCampaignPackages(category);
  if (packages.length === 0) return null;

  const haystack = normalize(
    [context?.offer, context?.audience, context?.propertyType, context?.mechanism].filter(Boolean).join(" "),
  );

  if (!haystack) return packages[0] ?? null;

  return [...packages]
    .map((pkg, index) => ({
      pkg,
      index,
      score: pkg.keywords.reduce((total, keyword) => (haystack.includes(normalize(keyword)) ? total + 1 : total), 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.pkg ?? packages[0] ?? null;
}

export function evaluateOfferQuality(params: {
  category: CampaignCategory;
  offer: string;
  mechanism?: string | null;
  audience?: string | null;
  cta?: string | null;
}): OfferQualityEvaluation {
  const category = params.category;
  const offer = safeText(params.offer);
  const audience = safeText(params.audience);
  const cta = safeText(params.cta);
  const text = normalize([offer, params.mechanism, audience, cta].filter(Boolean).join(" "));
  const b2bAgentCampaign = isB2BAgentAudience(audience);
  const components = {
    specificOutcome: componentScore(hasAudienceSpecificity(text, category)),
    numberOrQuantifier: componentScore(hasNumberOrQuantifier(text), 10, 3),
    timeframe: componentScore(hasTimeframe(text), 10, 3),
    riskReversal: componentScore(hasRiskReversal(text, category), 10, 4),
    mechanismClarity: componentScore(hasMechanismSignal(text), 10, 2),
    audienceSpecificity: componentScore(hasAudienceSpecificity(text, category), 10, 4),
    lowFrictionNextStep: componentScore(hasLowFrictionStep(text), 10, 5),
  };
  const hardFailures: string[] = [];
  const improvementHints: string[] = [];

  if (!offer) {
    hardFailures.push("Offer is missing.");
    improvementHints.push(`Use a category-safe offer such as: ${CATEGORY_SAFE_OFFERS[category]}.`);
  }

  if (!hasNumberOrQuantifier(text)) {
    hardFailures.push("Offer needs a number, price, percentage, or quantifier.");
    improvementHints.push("Add a concrete number, price anchor, percentage, or quantity.");
  }

  if (!hasTimeframe(text)) {
    hardFailures.push("Offer needs a timeframe or timing context.");
    improvementHints.push("Add a timeframe such as 30-90 days, this month, completion year, or before listing.");
  }

  if (!hasRiskReversal(text, category)) {
    hardFailures.push("Offer needs risk reversal, access, or a lower-friction promise.");
    improvementHints.push("Add low-risk language such as no obligation, preview, qualify, private access, or below-market access.");
  }

  if (!hasMechanismSignal(text)) {
    hardFailures.push("Offer needs a named mechanism or process.");
    improvementHints.push("Name the process that makes the offer believable.");
  }

  if (!hasAudienceSpecificity(text, category)) {
    hardFailures.push(`Offer is not specific enough for ${category} campaigns.`);
    improvementHints.push(`Tie the offer to ${category} psychology and the selected market.`);
  }

  if (countVagueWords(text) >= 2) {
    hardFailures.push("Offer uses too many vague performance words.");
    improvementHints.push("Replace vague words with a specific outcome, proof point, or next step.");
  }

  if (!b2bAgentCampaign && containsB2BAgentOfferLeak(text)) {
    hardFailures.push("Consumer-facing campaign contains B2B agent-acquisition language.");
    improvementHints.push(`Use consumer-facing language instead: ${CATEGORY_SAFE_OFFERS[category]}.`);
  }

  if (containsUnsafeGuarantee(text)) {
    hardFailures.push("Offer contains unsafe guaranteed approval, financing, sale, ROI, or buyer-outcome language.");
    improvementHints.push("Use qualification, review, access, or estimate language without promising approval, financing, ROI, buyers, or sales.");
  }

  if (containsUnsafeHousingOrUrgencyClaim(text)) {
    hardFailures.push("Offer contains unsafe urgency, fake buyer, or housing steering language.");
    improvementHints.push("Use factual availability, audience-neutral eligibility, and customer-controlled timing language.");
  }

  const rawScore =
    components.specificOutcome * 0.17 +
    components.numberOrQuantifier * 0.12 +
    components.timeframe * 0.12 +
    components.riskReversal * 0.14 +
    components.mechanismClarity * 0.18 +
    components.audienceSpecificity * 0.14 +
    components.lowFrictionNextStep * 0.13 -
    Math.min(3, countVagueWords(text) * 0.8) -
    (containsUnsafeGuarantee(text) ? 4 : 0) -
    (containsUnsafeHousingOrUrgencyClaim(text) ? 4 : 0) -
    (!b2bAgentCampaign && containsB2BAgentOfferLeak(text) ? 4 : 0);
  const score = clampScore(rawScore);

  return {
    accepted: score >= 7 && hardFailures.length === 0,
    score,
    components,
    hardFailures,
    improvementHints,
    safeOffer:
      !b2bAgentCampaign && containsB2BAgentOfferLeak(text)
        ? CATEGORY_SAFE_OFFERS[category]
        : offer || CATEGORY_SAFE_OFFERS[category],
  };
}

export function evaluateCreativeQuality(params: {
  category: CampaignCategory;
  offer: string;
  mechanism?: string | null;
  audience?: string | null;
  hook?: string | null;
  primaryText?: string | null;
  headline?: string | null;
  overlayText?: string | null;
  cta?: string | null;
  visualConcept?: string | null;
  imagePrompt?: string | null;
  scriptLines?: string[] | null;
}): CreativeQualityEvaluation {
  const strategy = MEDIA_BUYER_CATEGORY_STRATEGIES[params.category];
  const offerQuality = evaluateOfferQuality({
    category: params.category,
    offer: params.offer,
    mechanism: params.mechanism,
    audience: params.audience,
    cta: params.cta,
  });
  const hook = normalize(params.hook);
  const cta = normalize(params.cta);
  const imagePromptForScoring = stripNegativePromptGuidance(safeText(params.imagePrompt));
  const combined = normalize(
    [
      params.hook,
      params.primaryText,
      params.headline,
      params.overlayText,
      params.cta,
      params.visualConcept,
      imagePromptForScoring,
      ...(params.scriptLines ?? []),
    ].join(" "),
  );
  const script = normalize((params.scriptLines ?? []).join(" "));
  const hardFailures: string[] = [...offerQuality.hardFailures];
  const improvementHints: string[] = [...offerQuality.improvementHints];
  const blockedHook =
    containsAny(hook, strategy.forbiddenHookPatterns) ||
    /^(attention realtors|attention homeowners|looking for motivated sellers|we help businesses grow|learn more)\b/.test(hook);
  const longIntro = /^(hi|hey|hello),?\s+(my name is|i am|i'm)\b/.test(script || hook);
  const noFirstHook = (params.scriptLines?.[0] ?? params.hook ?? "").trim().length < 12;
  const genericPropertyFirst =
    /\b(beautiful property|stunning home|dream home|new listing alert|luxury living|exclusive opportunity)\b/.test(combined);
  const agentFirst = /\b(top agent|award-winning agent|our team|my clients|i'm an agent|i am an agent)\b/.test(combined);
  const overlyPolished = /\b(overly polished|cinematic only|brochure|showroom|stock photo|generic luxury)\b/.test(combined);
  const imagePrompt = normalize(safeText(params.imagePrompt));
  const mediaBuyerReferenceReady =
    !imagePrompt || hasMediaBuyerReferenceLogic(imagePrompt) || hasMediaBuyerReferenceLogic(combined);
  const unusablePreviewState = hasUnusablePreviewState(combined);
  const genericStockRisk = hasGenericStockRisk(combined);
  const unsafeClaim = containsUnsafeGuarantee(combined) || containsUnsafeHousingOrUrgencyClaim(combined);

  if (blockedHook) hardFailures.push("Hook matches a blocked/generic media-buyer pattern.");
  if (longIntro) hardFailures.push("Script starts with a slow self-introduction.");
  if (noFirstHook) hardFailures.push("Creative needs a stronger first-three-seconds hook.");
  if (genericPropertyFirst) hardFailures.push("Creative is property-first or generic instead of decision-point-first.");
  if (agentFirst) hardFailures.push("Creative is agent-first instead of audience-tension-first.");
  if (overlyPolished) hardFailures.push("Creative leans too polished/generic for cold traffic.");
  if (!mediaBuyerReferenceReady) hardFailures.push("Image prompt is missing media-buyer layout reference logic.");
  if (genericStockRisk) hardFailures.push("Creative risks looking like generic stock-photo real estate output.");
  if (unusablePreviewState) hardFailures.push("Creative preview has a detectable readability or overlay/crop issue.");
  if (unsafeClaim) hardFailures.push("Creative contains unsafe guarantee, fake urgency, fake buyer, or housing steering language.");

  if (blockedHook) improvementHints.push("Rewrite the hook as a situation or decision moment, not an obvious marketing callout.");
  if (genericPropertyFirst) improvementHints.push("Lead with the internal tension, mechanism, or proof instead of the property itself.");
  if (agentFirst) improvementHints.push("Remove agent bragging and make the audience's decision point the opening.");
  if (!mediaBuyerReferenceReady) improvementHints.push("Add a concrete media-buyer reference layout with hook, proof, negative space, and CTA-safe zones.");
  if (genericStockRisk) improvementHints.push("Replace stock-photo-looking direction with a specific decision moment, proof artifact, or native UGC frame.");
  if (unusablePreviewState) improvementHints.push("Repair the layout so text remains readable and no overlay, crop, or image artifact covers the creative.");
  if (unsafeClaim) improvementHints.push("Rewrite regulated or housing-sensitive copy as conditional review, estimate, availability, or qualification language.");

  const hasPatternInterrupt = /\b(before|most|if you|still|nobody|you don't|by the time|this is how|here's how|stop|watch|isn't for everyone)\b/.test(hook);
  const hasMechanism = hasMechanismSignal(normalize([params.mechanism, combined].join(" ")));
  const hasProof =
    /\d|\$|%|roi|yield|payment|price|value|timeline|before|after|proof|deposit|completion/.test(combined) ||
    containsAny(combined, strategy.proofStyles);
  const visualSpecific =
    containsAny(combined, strategy.visualLogic) ||
    /\b(map|chart|dashboard|timeline|kitchen|backyard|construction|skyline|marble|yield|roi|price comparison)\b/.test(combined);
  const categoryFit =
    containsAny(combined, strategy.triggerConditions) ||
    containsAny(combined, strategy.internalTensions) ||
    containsAny(combined, strategy.winningAngles) ||
    containsAny(combined, strategy.mechanismStyles);
  const antiGenericRisk = clampScore(
    (blockedHook ? 4 : 0) +
      (genericPropertyFirst ? 3 : 0) +
      (agentFirst ? 3 : 0) +
      (overlyPolished ? 2 : 0) +
      (containsAny(combined, strategy.antiPatterns) ? 3 : 0) +
      (unsafeClaim ? 5 : 0) +
      (/generic|vague|learn more|contact us|click here/.test(combined) ? 2 : 0),
  );
  const components = {
    offerStrength: offerQuality.score,
    hookStrength: clampScore((hasPatternInterrupt ? 8 : 4) + (blockedHook ? -5 : 0)),
    mechanismClarity: clampScore(hasMechanism ? 8.5 : 3),
    proofStrength: clampScore(hasProof ? 8 : 3.5),
    visualSpecificity: clampScore(visualSpecific ? 8 : 4),
    ctaFriction: clampScore(hasLowFrictionStep(cta) && !/book a call|learn more|contact us/.test(cta) ? 8.5 : 4),
    categoryFit: clampScore(categoryFit ? 8.5 : 4),
    antiGenericRisk,
    mediaBuyerReference: clampScore(mediaBuyerReferenceReady ? 9 : 2),
    previewReadability: clampScore(unusablePreviewState ? 1.5 : 8.5),
  };
  const score = clampScore(
    (components.offerStrength +
      components.hookStrength +
      components.mechanismClarity +
      components.proofStrength +
      components.visualSpecificity +
      components.ctaFriction +
      components.categoryFit +
      components.mediaBuyerReference +
      components.previewReadability +
      (10 - components.antiGenericRisk)) /
      10,
  );

  if (score < 7) {
    improvementHints.push("Regenerate or repair this creative until the media-buyer quality score is at least 7.");
  }

  return {
    accepted: score >= 7 && hardFailures.length === 0,
    score,
    components,
    hardFailures: Array.from(new Set(hardFailures)),
    improvementHints: Array.from(new Set(improvementHints)),
  };
}
