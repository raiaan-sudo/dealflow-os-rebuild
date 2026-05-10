import type { ImagePromptConfig } from "@/lib/types/creative-assets";
import type {
  CampaignCategory,
  CampaignCreativeStrategy,
} from "@/lib/services/campaign-creative-strategy";
import { getCategoryRulePack } from "@/lib/services/campaign-category-rule-packs";

export type OpenAiImageModel = "gpt-image-1.5" | "gpt-image-1";

export type StaticVisualPromptBrief = {
  category: CampaignCategory;
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
    `Make the result look like a finished, high-converting paid social creative frame, not a generic stock photo and not an empty template.`,
    `Use realistic composition, high instruction adherence, premium real-estate advertising quality, sharp lighting, and an obvious conversion-focused visual hierarchy.`,
    `Leave clean negative space or panel areas where DealFlow can place copy later, but make the image itself visually complete and worth reviewing on its own.`,
    `Prefer proof cues, maps, dashboards, timelines, payment anchors, value comparisons, buyer shortlist moments, or market-decision context when the category calls for them.`,
    `Make the scene feel context-rich and believable rather than stock-perfect. Prefer lived-in realism, slight asymmetry, local cues, and decision-context details over showroom polish.`,
    ugcPromptTail,
    categoryPromptTail,
    `Do not render final ad copy into the image itself.`,
  ].filter(Boolean).join(" ");

  return {
    category,
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
      negativePrompt: `${listToSentence(rulePack.antiPatterns)}; rendered headline text; misspelled words; unreadable typography; poster-like typography; cheap promo graphics; distorted architecture; low-detail rooms; stock-photo perfection; spotless showroom staging; brochure-style ad layout; glossy generic realtor marketing; uncanny faces; extra fingers; distorted hands; warped phones; fake screenshots; watermark; logo`,
      style: "realistic",
      aspectRatio: inferAspectRatio(category),
    },
  };
}
