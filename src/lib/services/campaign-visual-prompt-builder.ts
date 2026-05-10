import type { ImagePromptConfig } from "@/lib/types/creative-assets";
import type {
  CampaignCategory,
  CampaignCreativeStrategy,
} from "@/lib/services/campaign-creative-strategy";
import { getCategoryRulePack } from "@/lib/services/campaign-category-rule-packs";

export type OpenAiImageModel = "gpt-image-1.5" | "gpt-image-1";

export type StaticVisualPromptBrief = {
  category: CampaignCategory;
  mediaBuyerReferencePattern: string;
  triggerCondition: string;
  internalTension: string;
  mechanism: string;
  proofStyle: string;
  visualLogic: string[];
  overlayLogic: string[];
  forbiddenPatterns: string[];
  preferredModel: OpenAiImageModel;
  visualConcept: string;
  promptConfig: ImagePromptConfig;
};

type BuildStaticVisualPromptInput = {
  location: string;
  audience: string;
  propertyType: string;
  keyOffer: string;
  angle: string;
  strategy: CampaignCreativeStrategy;
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function listToSentence(values: string[]) {
  return values.filter(Boolean).join("; ");
}

function inferAspectRatio(category: CampaignCategory): ImagePromptConfig["aspectRatio"] {
  return category === "luxury" ? "16:9" : "1:1";
}

function buildVisualConcept(input: BuildStaticVisualPromptInput) {
  return `${input.location} ${input.strategy.campaignCategory} ${input.angle} creative focused on ${input.keyOffer}`;
}

function inferMediaBuyerReferencePattern(input: BuildStaticVisualPromptInput) {
  const category = input.strategy.campaignCategory;
  const haystack = [
    input.angle,
    input.keyOffer,
    input.audience,
    input.propertyType,
    input.strategy.proofStyle,
    ...input.strategy.visualLogic,
    ...input.strategy.overlayStyle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/ugc|pov|creator|native social|walkthrough|testimonial|customer/.test(haystack)) {
    return "native UGC proof frame";
  }

  if (category === "precon") {
    if (/event|deposit|interest|completion|timeline|construction|future|current/.test(haystack)) {
      return "precon deposit, event, and construction-progress ad";
    }

    return "precon new-build incentive ad";
  }

  if (category === "investor") {
    return /map|area|micro|yield|rent|roi|cash/.test(haystack)
      ? "investor ROI map and data dashboard"
      : "investor deal-analysis proof board";
  }

  if (category === "seller") {
    return /2019|202[0-9]|\$|price|value|worth|equity|before|after/.test(haystack)
      ? "seller home-value comparison ad"
      : "seller neighborhood demand and valuation ad";
  }

  if (category === "buyer") {
    return /listing|alert|bed|bath|closing|under|payment|afford|home list/.test(haystack)
      ? "buyer listing-alert and affordability collage"
      : "buyer lifestyle plus payment-proof ad";
  }

  if (category === "commercial") {
    return "commercial map, space-fit, and requirement-proof ad";
  }

  return "premium private-access real estate ad";
}

function buildMediaBuyerReferenceTail(pattern: string, category: CampaignCategory) {
  const shared =
    "Use a real media-buyer direct-response layout: one dominant hook area, one proof area, one clear CTA-safe bottom or side area, and strong negative space for DealFlow text composition. Think polished Facebook/Instagram paid-social creative, not stock photography.";

  if (pattern === "native UGC proof frame") {
    return `${shared} Reference pattern: native social/UGC proof frame with a believable creator or customer POV, handheld walkthrough energy, phone-camera realism, and a clear decision moment. Leave space for caption bars and proof chips. Avoid influencer glamour, fake testimonial screenshots, cartoon avatars, and overproduced studio lighting.`;
  }

  if (pattern === "precon deposit, event, and construction-progress ad") {
    return `${shared} Reference pattern: pre-construction campaign creative with high-rise exterior or construction-progress imagery, a dark translucent headline slab, bold yellow or white proof modules, deposit/timeline/event cues, and optional circular agent/profile placement area. Show both development reality and future upside. Do not copy any provided brand, project name, logo, cartoon avatar, or exact event details.`;
  }

  if (pattern === "precon new-build incentive ad") {
    return `${shared} Reference pattern: new-build incentive creative with bold red or black banner hierarchy, home exterior/new-build imagery, incentive modules such as closing-cost help or below-market rate proof, and a clean lower CTA zone. Keep it sharp and readable, not a brochure render.`;
  }

  if (pattern === "investor ROI map and data dashboard" || pattern === "investor deal-analysis proof board") {
    return `${shared} Reference pattern: investor proof collage with city or building imagery, map pins, rent/price/yield cards, ROI panels, simple bar or line chart elements, and underwriting-style proof blocks. Make numbers visually structured but do not invent final copy into the image.`;
  }

  if (pattern === "seller home-value comparison ad") {
    return `${shared} Reference pattern: seller valuation ad with aerial/neighborhood or home imagery, red or white value banners, before/after price comparison zones, map/value proof, and a bottom CTA/input-bar area. The visual should instantly communicate price movement and homeowner curiosity.`;
  }

  if (pattern === "seller neighborhood demand and valuation ad") {
    return `${shared} Reference pattern: seller homeowner ad with neighborhood aerial imagery, red location-led callout bar, demand/value proof badge, and a simple property-price-update CTA zone. Keep it direct-response and local, not generic curb appeal.`;
  }

  if (pattern === "buyer listing-alert and affordability collage") {
    return `${shared} Reference pattern: buyer/new-listing ad with a clean photo grid, bold alert banner, price/location/bed/bath placeholder modules, affordability or closing-cost proof blocks, and a strong CTA zone. Make it feel like a high-performing listing alert, not a bland MLS card.`;
  }

  if (pattern === "buyer lifestyle plus payment-proof ad") {
    return `${shared} Reference pattern: buyer lifestyle-plus-proof creative with warm family/interior/backyard imagery, payment/rent/mortgage comparison cards, map or checklist proof, and a clean CTA zone. Balance emotion with affordability evidence.`;
  }

  if (category === "commercial") {
    return `${shared} Reference pattern: commercial operator creative with map pins, space-fit cards, lease/purchase comparison modules, exterior/property context, and requirement-proof labels. Keep it utilitarian and decision-led.`;
  }

  return `${shared} Reference pattern: restrained premium private-access composition with cinematic property depth, minimal proof chips, and a quiet CTA zone.`;
}

function isApprovalFocusedVisual(input: BuildStaticVisualPromptInput) {
  const haystack = [
    input.audience,
    input.keyOffer,
    input.strategy.mechanism,
    input.strategy.triggerCondition,
    input.strategy.internalTension,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return input.strategy.campaignCategory === "buyer"
    && /approv|qualif|credit|mortgage|pre-approv|down payment|deposit|financ/.test(haystack);
}

export function buildStaticVisualPromptBrief(
  input: BuildStaticVisualPromptInput,
): StaticVisualPromptBrief {
  const rulePack = getCategoryRulePack(input.strategy.campaignCategory);
  const category = input.strategy.campaignCategory;
  const approvalFocused = isApprovalFocusedVisual(input);
  const ugcStyle = /contrarian|testimonial|pov|ugc|creator|customer/i.test(input.angle);
  const mediaBuyerReferencePattern = inferMediaBuyerReferencePattern(input);
  const mediaBuyerReferenceTail = buildMediaBuyerReferenceTail(mediaBuyerReferencePattern, category);
  const categoryPromptTail =
    category === "luxury"
      ? "Use a single hero composition with cinematic restraint, premium materials, skyline or view depth, and almost no infographic clutter. Keep overlays subtle, sparse, and exclusive. Avoid dashboard grids, busy comparison boards, and discount-style panels."
      : category === "precon"
        ? "Use a clean split between present-day construction reality and the future finished vision. Show timeline or deposit structure cues in a restrained panel, not a cluttered brochure layout. Include development context or infrastructure cues without turning it into a noisy flyer."
        : approvalFocused
          ? "Favor approval-first buyer visuals: pre-approval paperwork, mortgage/credit coaching moments, calculator or payment comparison cues, and buyers reviewing the right shortlist after financing clarity. Avoid generic listing-only or showroom-perfect interiors."
        : category === "buyer"
          ? "Favor one strong lived-in interior or backyard moment with just enough payment or affordability proof to support the opportunity. Avoid turning the image into a busy flyer collage."
          : category === "seller"
            ? "Favor a before-versus-after value story, neighborhood map proof, or value-update comparison with clear pricing context. Avoid generic curb-appeal-only compositions."
            : category === "commercial"
              ? "Favor clean maps, space-fit checklists, building exteriors, and operator-focused comparison panels. Avoid residential lifestyle framing and generic skyline glamour."
        : "Favor charts, maps, and yield proof that feel like a real investor brief, not a lifestyle brochure.";
  const ugcPromptTail = ugcStyle
    ? "This is a UGC-style ad frame: make it feel like a polished native social creative with a relatable creator POV, phone-shot authenticity, a decision moment, and clear proof context. Show a believable creator, customer, or agent in a real home/market setting without celebrity likeness. Keep faces natural, hands normal, and the frame premium enough for paid social. Avoid cheap selfie clutter, meme styling, influencer glamour, and fake testimonial screenshots."
    : "";
  const prompt = [
    `Create a premium paid-social real estate ad visual for ${input.location}.`,
    `Audience context: ${input.audience}.`,
    `Category psychology: ${approvalFocused ? "buyer approval-first" : category}.`,
    `Winning angle direction: ${listToSentence(rulePack.winningAngles)}.`,
    `Trigger condition: ${safeText(input.strategy.triggerCondition) || rulePack.triggerConditions[0] || "market opportunity"}.`,
    `Internal tension: ${safeText(input.strategy.internalTension) || "uncertainty about the right move"}.`,
    `Mechanism to visualize: ${safeText(input.strategy.mechanism)}.`,
    `Proof style to imply: ${safeText(input.strategy.proofStyle) || rulePack.proofStyles[0] || "certainty"}.`,
    `Primary visual logic: ${listToSentence(input.strategy.visualLogic)}.`,
    `Overlay logic to support later composition: ${listToSentence(input.strategy.overlayStyle)}.`,
    `Property focus: ${input.propertyType}. Offer focus: ${input.keyOffer}.`,
    `Creative angle: ${input.angle}.`,
    `Media-buyer reference pattern: ${mediaBuyerReferencePattern}.`,
    mediaBuyerReferenceTail,
    `Make the result look like a finished, high-converting paid social creative frame, not a generic stock photo and not an empty template.`,
    `Use realistic composition, high instruction adherence, premium real-estate advertising quality, sharp lighting, and an obvious conversion-focused visual hierarchy.`,
    `Leave clean negative space or panel areas where DealFlow can place copy later, but make the image itself visually complete and worth reviewing on its own. The rendered image should not be hidden behind a placeholder-style template.`,
    `Prefer proof cues, maps, dashboards, timelines, payment anchors, value comparisons, buyer shortlist moments, or market-decision context when the category calls for them.`,
    `Make the scene feel context-rich and believable rather than stock-perfect. Prefer lived-in realism, slight asymmetry, local cues, and decision-context details over showroom polish.`,
    ugcPromptTail,
    categoryPromptTail,
    `Do not render final ad copy into the image itself.`,
  ].filter(Boolean).join(" ");

  return {
    category,
    mediaBuyerReferencePattern,
    triggerCondition: safeText(input.strategy.triggerCondition) || rulePack.triggerConditions[0] || "",
    internalTension: safeText(input.strategy.internalTension),
    mechanism: safeText(input.strategy.mechanism),
    proofStyle: safeText(input.strategy.proofStyle) || rulePack.proofStyles[0] || "",
    visualLogic: [...input.strategy.visualLogic],
    overlayLogic: [...input.strategy.overlayStyle],
    forbiddenPatterns: [...rulePack.antiPatterns],
    preferredModel: "gpt-image-1.5",
    visualConcept: approvalFocused
      ? `${input.location} approval-first buyer ${input.angle} creative focused on ${input.keyOffer}`
      : buildVisualConcept(input),
    promptConfig: {
      prompt,
      negativePrompt: `${listToSentence(rulePack.antiPatterns)}; rendered headline text; misspelled words; unreadable typography; poster-like typography; cheap promo graphics; distorted architecture; low-detail rooms; stock-photo perfection; spotless showroom staging; brochure-style ad layout; glossy generic realtor marketing; copied brand name; copied project logo; copied reference avatar; exact reference clone; cartoon realtor mascot; uncanny faces; extra fingers; distorted hands; warped phones; fake screenshots; watermark; logo`,
      style: "realistic",
      aspectRatio: inferAspectRatio(category),
    },
  };
}
