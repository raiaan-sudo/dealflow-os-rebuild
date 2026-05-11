import type { ImagePromptConfig } from "@/lib/types/creative-assets";
import { STATIC_CREATIVE_BACKGROUND_CONTRACT } from "@/lib/services/static-creative-visual-qa";
import type {
  CampaignCategory,
  CampaignCreativeStrategy,
} from "@/lib/services/campaign-creative-strategy";
import { getCategoryRulePack } from "@/lib/services/campaign-category-rule-packs";

export type OpenAiImageModel = "gpt-image-1.5" | "gpt-image-1";

export type StaticVisualPromptBrief = {
  category: CampaignCategory;
  visualAssetContract: "text_free_background_v2";
  visualAssetRole: "text_free_background";
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

function providerSafeVisualPhrase(value: string) {
  return safeText(value)
    .replace(/\bdashboards?\b/gi, "decision context")
    .replace(/\bcharts?\b/gi, "market context")
    .replace(/\btables?\b/gi, "structured context")
    .replace(/\bspreadsheets?\b/gi, "analysis moment")
    .replace(/\bmaps?\b/gi, "neighborhood context")
    .replace(/\boverlays?\b/gi, "proof cues")
    .replace(/\bcards?\b/gi, "visual cues")
    .replace(/\bgrids?\b/gi, "simple composition")
    .replace(/\bui\b/gi, "real-world")
    .replace(/\bcta\b/gi, "next-step")
    .replace(/\bbuttons?\b/gi, "next-step cue")
    .replace(/\blisting sheet\b/gi, "property context")
    .replace(/\bflyer\b/gi, "photo")
    .replace(/\bbrochure\b/gi, "photo")
    .replace(/\s+/g, " ")
    .trim();
}

function providerSafeList(values: string[]) {
  return listToSentence(values.map(providerSafeVisualPhrase).filter(Boolean));
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
    return /area|micro|yield|rent|roi|cash/.test(haystack)
      ? "investor property-decision source photo"
      : "investor underwriting-moment source photo";
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
    "Use media-buyer source imagery logic only: a believable photographic scene with a clear subject, strong negative space, and clean areas where DealFlow will place exact text later. Do not create a flyer, ad layout, infographic, collage, chart, dashboard, UI screen, card, proof module, or CTA panel inside the image.";

  if (pattern === "native UGC proof frame") {
    return `${shared} Reference pattern: native social/UGC source photo with a believable creator or customer POV, handheld walkthrough energy, phone-camera realism, and a clear decision moment. Avoid influencer glamour, fake testimonial screenshots, cartoon avatars, and overproduced studio lighting.`;
  }

  if (pattern === "precon deposit, event, and construction-progress ad") {
    return `${shared} Reference pattern: pre-construction source photo with high-rise exterior, construction-progress imagery, development context, or future-upside setting. Do not copy any provided brand, project name, logo, cartoon avatar, or exact event details.`;
  }

  if (pattern === "precon new-build incentive ad") {
    return `${shared} Reference pattern: new-build source photo with home exterior, new-build interiors, buyer walkthrough, or area context. Keep it sharp, realistic, and not a brochure render.`;
  }

  if (pattern === "investor property-decision source photo" || pattern === "investor underwriting-moment source photo") {
    return `${shared} Reference pattern: investor source photo with city, building, neighborhood, laptop/tablet analysis moment, or property context. Avoid map pins, rent/price/yield cards, ROI panels, charts, dashboards, spreadsheets, and underwriting text inside the image.`;
  }

  if (pattern === "seller home-value comparison ad") {
    return `${shared} Reference pattern: seller source photo with aerial/neighborhood/home imagery or a homeowner reviewing pricing context. Do not include value banners, before/after price zones, map labels, or bottom CTA bars in the generated image.`;
  }

  if (pattern === "seller neighborhood demand and valuation ad") {
    return `${shared} Reference pattern: seller homeowner source photo with neighborhood imagery, exterior/homeowner context, or local demand cues without labels. Keep it local and decision-led, not generic curb appeal.`;
  }

  if (pattern === "buyer listing-alert and affordability collage") {
    return `${shared} Reference pattern: buyer/new-listing source photo with warm interior, backyard, family viewing a home, or tasteful property detail. Do not include photo grids, alert banners, price modules, bed/bath labels, proof blocks, or CTA zones.`;
  }

  if (pattern === "buyer lifestyle plus payment-proof ad") {
    return `${shared} Reference pattern: buyer lifestyle source photo with warm family/interior/backyard imagery or a buyer reviewing options on a phone/tablet. Avoid payment/rent/mortgage comparison cards, maps, checklist proof, and CTA zones inside the image.`;
  }

  if (category === "commercial") {
    return `${shared} Reference pattern: commercial operator source photo with exterior/property context, tenant walkthrough, or space-fit decision moment. Avoid map pins, cards, comparison modules, and requirement labels inside the image.`;
  }

  return `${shared} Reference pattern: restrained premium private-access source photo with cinematic property depth and clean negative space. Avoid proof chips and CTA zones inside the image.`;
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

function buildSourcePhotoDirection(category: CampaignCategory, approvalFocused: boolean) {
  if (category === "luxury") {
    return "single premium property or lifestyle photograph with cinematic depth, natural materials, and clean negative space";
  }

  if (category === "precon") {
    return "construction, development, new-build exterior, sales-center walkthrough, or buyer consultation source photography";
  }

  if (approvalFocused) {
    return "buyer consultation, warm family decision moment, or buyers reviewing homes on a device with unreadable screens";
  }

  if (category === "buyer") {
    return "warm lived-in interior, kitchen, backyard, walkthrough, or buyer home-review moment";
  }

  if (category === "seller") {
    return "homeowner, neighborhood, property exterior, pre-listing decision, or local curb context";
  }

  if (category === "commercial") {
    return "commercial building exterior, operator walkthrough, tenant tour, or space-fit decision moment";
  }

  return "investor decision moment, building context, neighborhood exterior, or laptop/tablet analysis moment with unreadable screens";
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
  const sourcePhotoDirection = buildSourcePhotoDirection(category, approvalFocused);
  const categoryPromptTail =
    category === "luxury"
      ? "Use a single cinematic property or lifestyle source photo with restraint, premium materials, skyline or view depth, and no infographic elements."
      : category === "precon"
        ? "Use construction, development, new-build, or infrastructure context as clean source photography. Do not create timeline panels, deposit panels, or brochure layouts."
        : approvalFocused
          ? "Favor approval-first buyer visuals: a buyer consultation, mortgage coaching moment, buyers reviewing homes on a device, or a warm family decision moment. Do not show readable documents, calculator labels, or payment comparison text."
        : category === "buyer"
          ? "Favor one strong lived-in interior, kitchen, backyard, walkthrough, or home-review moment. Avoid busy flyer collages and any affordability text inside the image."
          : category === "seller"
            ? "Favor homeowner, neighborhood, property exterior, or pre-listing decision context. Avoid visible price comparisons, map labels, and generic curb-appeal-only compositions."
            : category === "commercial"
              ? "Favor building exteriors, operator walkthroughs, space-fit moments, and commercial property context. Avoid readable maps, checklists, and comparison panels."
        : "Favor investor decision moments, building context, laptop/tablet analysis without readable screens, and market context. Avoid charts, maps, and yield text inside the image.";
  const ugcPromptTail = ugcStyle
    ? "This is a UGC-style source image: make it feel like a polished native social still with a relatable creator POV, phone-shot authenticity, and a real decision moment. Show a believable creator, customer, or agent in a real home/market setting without celebrity likeness. Keep faces natural, hands normal, and the frame premium enough for paid social. Avoid cheap selfie clutter, meme styling, influencer glamour, fake testimonial screenshots, and caption text."
    : "";
  const prompt = [
    `TEXT-FREE BACKGROUND ASSET ONLY. Create a premium real estate source image for DealFlow to compose into an ad later.`,
    `Do not design the final ad. Do not render a flyer, poster, collage, carousel, infographic, dashboard, UI, card stack, proof panel, pricing grid, CTA button, logo, watermark, border layout, headline area, or any typography.`,
    `The final headline, proof chips, CTA, and layout will be rendered by DealFlow after image generation; the image must be clean photography only.`,
    `Market: ${input.location}.`,
    `Audience context: ${input.audience}.`,
    `Category psychology: ${approvalFocused ? "buyer approval-first" : category}.`,
    `Winning angle direction: ${providerSafeList(rulePack.winningAngles)}.`,
    `Trigger condition: ${providerSafeVisualPhrase(safeText(input.strategy.triggerCondition) || rulePack.triggerConditions[0] || "market opportunity")}.`,
    `Internal tension: ${safeText(input.strategy.internalTension) || "uncertainty about the right move"}.`,
    `Mechanism to visualize: ${providerSafeVisualPhrase(safeText(input.strategy.mechanism))}.`,
    `Proof style to imply: ${providerSafeVisualPhrase(safeText(input.strategy.proofStyle) || rulePack.proofStyles[0] || "certainty")}.`,
    `Source-photo direction: ${sourcePhotoDirection}.`,
    `DealFlow will render the campaign proof, badges, chips, CTA, and offer labels after generation; do not place those elements in the provider image.`,
    `Property focus: ${input.propertyType}. Offer focus: ${input.keyOffer}.`,
    `Creative angle: ${input.angle}.`,
    `Media-buyer reference pattern: ${mediaBuyerReferencePattern}.`,
    mediaBuyerReferenceTail,
    `Make the result look like a high-quality photographic background for a high-converting paid social ad, not generic stock photography and not an empty template.`,
    `Use realistic composition, high instruction adherence, premium real-estate advertising quality, sharp lighting, and enough negative space for DealFlow's deterministic text layer.`,
    `Do not draw any readable or pseudo-readable words, letters, numbers, logo text, watermark text, fake UI labels, fake pricing, fake captions, fake form fields, glyphs, fake charts, fake screens, or gibberish typography.`,
    `Prefer real-world decision context: a buyer or family reviewing a home, an agent consultation without visible documents, a seller/homeowner moment, a commercial walkthrough, construction context, or a clean property scene depending on category.`,
    `Make the scene feel context-rich and believable rather than stock-perfect. Prefer lived-in realism, slight asymmetry, local cues, and decision-context details over showroom polish.`,
    ugcPromptTail,
    categoryPromptTail,
    `Do not render final ad copy into the image itself.`,
  ].filter(Boolean).join(" ");

  return {
    category,
    visualAssetContract: STATIC_CREATIVE_BACKGROUND_CONTRACT,
    visualAssetRole: "text_free_background",
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
      negativePrompt: `${listToSentence(rulePack.antiPatterns)}; final ad layout; flyer; poster; collage; infographic; dashboard; UI screen; card stack; proof module; pricing module; CTA button; banner; rendered headline text; readable text; letters; numbers; words; pseudo text; gibberish typography; misspelled words; unreadable typography; fake UI labels; fake price labels; fake captions; logo text; poster-like typography; cheap promo graphics; distorted architecture; low-detail rooms; stock-photo perfection; spotless showroom staging; brochure-style ad layout; glossy generic realtor marketing; copied brand name; copied project logo; copied reference avatar; exact reference clone; cartoon realtor mascot; uncanny faces; extra fingers; distorted hands; warped phones; fake screenshots; watermark; logo`,
      style: "realistic",
      aspectRatio: inferAspectRatio(category),
      avoid: [
        "text",
        "letters",
        "numbers",
        "fake UI",
        "pricing cards",
        "infographics",
        "collages",
        "CTA buttons",
      ],
    },
  };
}
