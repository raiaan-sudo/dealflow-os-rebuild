import type { FunnelBlueprint, FunnelSection, FunnelSectionStyle, FunnelType } from "@/lib/services/funnel-engine";

export const DIRECT_RESPONSE_FUNNEL_VARIANTS = [
  "seller_cma",
  "seller_net_sheet",
  "buyer_homes_under_price",
  "first_time_buyer_plan",
  "relocation_starter_kit",
  "downsizing_guide",
  "new_construction_incentive_list",
  "investor_deal_access",
  "open_house_showing_request",
  "appointment_strategy_call",
] as const;

export type DirectResponseFunnelVariant = (typeof DIRECT_RESPONSE_FUNNEL_VARIANTS)[number];

export type DirectResponseAudienceType =
  | "seller"
  | "buyer"
  | "first_time_buyer"
  | "relocation_buyer"
  | "downsizer"
  | "new_construction_buyer"
  | "investor"
  | "showing_request"
  | "appointment_prospect";

export type DirectResponseOfferType =
  | "seller_cma"
  | "seller_net_sheet"
  | "buyer_inventory"
  | "first_time_buyer_plan"
  | "relocation_kit"
  | "downsizing_guide"
  | "new_construction_incentives"
  | "investor_deal_access"
  | "showing_request"
  | "strategy_call";

export type DirectResponseFormMode = "minimal" | "standard" | "highIntent";

export type DirectResponseLeadCaptureField = {
  name: string;
  label: string;
  required: boolean;
  fieldType: "text" | "email" | "tel" | "select" | "textarea";
};

export type DirectResponseAboveFoldFormConfig = {
  mode: DirectResponseFormMode;
  title: string;
  description: string;
  submitLabel: string;
  fields: DirectResponseLeadCaptureField[];
  privacyNote: string;
};

export type DirectResponseHero = {
  eyebrow: string;
  headline: string;
  subheadline: string;
};

export type DirectResponseMessageMatchNotes = {
  source: string;
  adHook: string;
  matchedTerms: string[];
  validationWarnings: string[];
};

export type DirectResponseFunnelMetadata = {
  funnelVariant: DirectResponseFunnelVariant;
  audienceType: DirectResponseAudienceType;
  offerType: DirectResponseOfferType;
  market: string;
  priceThreshold: string;
  leadMagnetTitle: string;
  primaryCTA: string;
  formFields: string[];
  proofClaims: string[];
  complianceDisclaimer: string;
  messageMatchSource: string;
  adHook: string;
  formMode: DirectResponseFormMode;
  heroEyebrow: string;
  hero: DirectResponseHero;
  aboveFoldFormConfig: DirectResponseAboveFoldFormConfig;
  leadCaptureFields: DirectResponseLeadCaptureField[];
  complianceFooter: string;
  messageMatchNotes: DirectResponseMessageMatchNotes;
};

export type DirectResponseFunnelBlueprint = FunnelBlueprint & DirectResponseFunnelMetadata;

export type DirectResponseFunnelInput = {
  funnelVariant?: DirectResponseFunnelVariant | string | null;
  funnel_variant?: DirectResponseFunnelVariant | string | null;
  audienceType?: DirectResponseAudienceType | string | null;
  audience_type?: DirectResponseAudienceType | string | null;
  offerType?: DirectResponseOfferType | string | null;
  offer_type?: DirectResponseOfferType | string | null;
  market?: string | null;
  location?: string | null;
  priceThreshold?: string | null;
  price_threshold?: string | null;
  leadMagnetTitle?: string | null;
  lead_magnet_title?: string | null;
  primaryCTA?: string | null;
  primary_cta?: string | null;
  formMode?: DirectResponseFormMode | string | null;
  form_mode?: DirectResponseFormMode | string | null;
  messageMatchSource?: string | null;
  message_match_source?: string | null;
  adHook?: string | null;
  ad_hook?: string | null;
};

type VariantConfig = {
  funnelVariant: DirectResponseFunnelVariant;
  audienceType: DirectResponseAudienceType;
  offerType: DirectResponseOfferType;
  defaultFormMode: DirectResponseFormMode;
  leadMagnetTitle: string;
  primaryCTA: string;
  heroEyebrow: string;
  headlineTemplate: string;
  subheadlineTemplate: string;
  adHookTemplate: string;
  proofClaims: string[];
  howItWorks: string[];
  faq: Array<{ question: string; answer: string }>;
  formFields: DirectResponseLeadCaptureField[];
};

const DEFAULT_MARKET = "your market";
const DEFAULT_PRICE_THRESHOLD = "$750,000";
const MESSAGE_MATCH_SOURCE = "FRIDAY real-estate direct-response funnel V1";
const COMPLIANCE_DISCLAIMER =
  "Information is for planning only and is not legal, tax, mortgage, investment, or financial advice. Availability, pricing, incentives, valuations, and projected proceeds must be verified locally. Equal housing opportunity. No specific outcome is promised.";

const BASE_STYLE: Record<FunnelSection["type"], FunnelSectionStyle> = {
  hero: { spacing: "spacious", width: "content", align: "left", theme: "dark" },
  trust_bar: { spacing: "compact", width: "full", align: "left", theme: "accent" },
  benefits: { spacing: "comfortable", width: "full", align: "left", theme: "light" },
  proof_metrics: { spacing: "compact", width: "full", align: "left", theme: "accent" },
  social_proof: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
  market_snapshot: { spacing: "comfortable", width: "full", align: "left", theme: "light" },
  objections: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
  process: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
  faq: { spacing: "comfortable", width: "content", align: "left", theme: "light" },
  vsl: { spacing: "comfortable", width: "content", align: "center", theme: "dark" },
  image: { spacing: "comfortable", width: "content", align: "center", theme: "light" },
  form: { spacing: "comfortable", width: "content", align: "left", theme: "dark" },
  closing_cta: { spacing: "spacious", width: "content", align: "left", theme: "accent" },
};

const CORE_FIELDS = {
  name: field("name", "Full name", "text"),
  phone: field("phone", "Phone number", "tel"),
  email: field("email", "Email address", "email"),
};

const VARIANT_CONFIGS: Record<DirectResponseFunnelVariant, VariantConfig> = {
  seller_cma: {
    funnelVariant: "seller_cma",
    audienceType: "seller",
    offerType: "seller_cma",
    defaultFormMode: "highIntent",
    leadMagnetTitle: "Local Home Value Snapshot",
    primaryCTA: "Get My Home Value Snapshot",
    heroEyebrow: "Seller CMA",
    headlineTemplate: "See what your home could sell for in {market}",
    subheadlineTemplate:
      "Get a local pricing snapshot, buyer-demand read, and recommended next step before you decide whether to list.",
    adHookTemplate: "Curious what your {market} home could sell for right now?",
    proofClaims: [
      "Uses current local pricing context instead of a generic instant estimate",
      "Frames pricing, buyer demand, and timing before a listing decision",
      "No listing commitment required to request the snapshot",
    ],
    howItWorks: [
      "Share the property and timing basics",
      "We review local sale signals and buyer-demand context",
      "You receive a practical value range and suggested next step",
    ],
    faq: [
      { question: "Is this a formal appraisal?", answer: "No. It is a planning snapshot, not a licensed appraisal." },
      { question: "Do I have to list?", answer: "No. The snapshot is designed to help you decide what makes sense." },
      { question: "How fast is follow-up?", answer: "A local follow-up is triggered after the request is submitted." },
    ],
    formFields: [
      CORE_FIELDS.name,
      CORE_FIELDS.phone,
      CORE_FIELDS.email,
      field("property_address", "Property address", "text"),
    ],
  },
  seller_net_sheet: {
    funnelVariant: "seller_net_sheet",
    audienceType: "seller",
    offerType: "seller_net_sheet",
    defaultFormMode: "highIntent",
    leadMagnetTitle: "Seller Net Sheet Estimate",
    primaryCTA: "Estimate My Net Proceeds",
    heroEyebrow: "Seller Net Sheet",
    headlineTemplate: "Estimate what you could net from a {market} sale",
    subheadlineTemplate:
      "Get a proceeds-first view that separates expected sale price, likely costs, and the next decision to verify with your local professionals.",
    adHookTemplate: "Before you list in {market}, estimate your net proceeds.",
    proofClaims: [
      "Separates sale price from possible net proceeds",
      "Calls out costs that need local verification",
      "Built for planning before a listing agreement",
    ],
    howItWorks: [
      "Enter sale timing and property basics",
      "Review estimated selling-cost categories",
      "Use the net sheet to decide whether a listing plan is worth exploring",
    ],
    faq: [
      { question: "Is the net sheet final?", answer: "No. It is an estimate that must be verified before financial decisions." },
      { question: "Does this include every cost?", answer: "No. Local taxes, legal fees, liens, payouts, and commissions require confirmation." },
      { question: "Can I use it before listing?", answer: "Yes. It is designed for early planning." },
    ],
    formFields: [
      CORE_FIELDS.name,
      CORE_FIELDS.phone,
      CORE_FIELDS.email,
      field("estimated_value", "Estimated home value", "text"),
      field("selling_timeline", "Selling timeline", "select"),
    ],
  },
  buyer_homes_under_price: {
    funnelVariant: "buyer_homes_under_price",
    audienceType: "buyer",
    offerType: "buyer_inventory",
    defaultFormMode: "standard",
    leadMagnetTitle: "Homes Under {priceThreshold} List",
    primaryCTA: "Send Me The List",
    heroEyebrow: "Buyer List",
    headlineTemplate: "Get the {market} homes under {priceThreshold} worth seeing",
    subheadlineTemplate:
      "Skip the broad search and request a tighter list of homes that match your budget, timing, and must-have filters.",
    adHookTemplate: "{market} buyers: want the current homes under {priceThreshold}?",
    proofClaims: [
      "Budget-first list request for buyers who want fewer weak-fit options",
      "Filters around timing, location, and must-haves",
      "No obligation to tour or write an offer",
    ],
    howItWorks: [
      "Confirm your budget and preferred areas",
      "We filter available options against your must-haves",
      "You receive a smaller list to review before booking a tour",
    ],
    faq: [
      { question: "Will these homes be available?", answer: "Availability changes and must be verified before showings." },
      { question: "Can I change my price range?", answer: "Yes. The form starts the match and follow-up can adjust the criteria." },
      { question: "Do I need pre-approval?", answer: "It helps, but you can start with the list request." },
    ],
    formFields: [
      CORE_FIELDS.name,
      CORE_FIELDS.phone,
      CORE_FIELDS.email,
      field("target_price", "Target price", "text"),
      field("preferred_area", "Preferred area", "text"),
    ],
  },
  first_time_buyer_plan: {
    funnelVariant: "first_time_buyer_plan",
    audienceType: "first_time_buyer",
    offerType: "first_time_buyer_plan",
    defaultFormMode: "standard",
    leadMagnetTitle: "First-Time Buyer Plan",
    primaryCTA: "Build My Buyer Plan",
    heroEyebrow: "First-Time Buyer",
    headlineTemplate: "Build your first-home plan for {market}",
    subheadlineTemplate:
      "See the practical steps, budget questions, and property filters that should be clear before your first serious tour.",
    adHookTemplate: "Buying your first place in {market}? Start with the plan.",
    proofClaims: [
      "Designed for buyers who need a path before property alerts",
      "Clarifies budget, timeline, must-haves, and financing questions",
      "Keeps the first step educational and low pressure",
    ],
    howItWorks: [
      "Answer the first-home planning questions",
      "Get the next-step checklist for budget and search readiness",
      "Move to listings or financing help only when the path is clear",
    ],
    faq: [
      { question: "Do I need to be ready to buy today?", answer: "No. The plan works for early-stage buyers too." },
      { question: "Will this affect my credit?", answer: "No. This request does not run credit." },
      { question: "Is this mortgage advice?", answer: "No. Financing details should be verified with a licensed mortgage professional." },
    ],
    formFields: [
      CORE_FIELDS.name,
      CORE_FIELDS.phone,
      CORE_FIELDS.email,
      field("current_timeline", "Buying timeline", "select"),
      field("monthly_budget", "Comfortable monthly budget", "text"),
    ],
  },
  relocation_starter_kit: {
    funnelVariant: "relocation_starter_kit",
    audienceType: "relocation_buyer",
    offerType: "relocation_kit",
    defaultFormMode: "highIntent",
    leadMagnetTitle: "{market} Relocation Starter Kit",
    primaryCTA: "Get The Relocation Kit",
    heroEyebrow: "Relocation",
    headlineTemplate: "Plan your move to {market} with a clearer starter kit",
    subheadlineTemplate:
      "Get area shortlists, timing questions, and a practical next-step path before you waste trips on the wrong neighborhoods.",
    adHookTemplate: "Moving to {market}? Get the {market} relocation starter kit.",
    proofClaims: [
      "Starts with neighborhood and lifestyle fit before showings",
      "Helps reduce wasted trips and unfocused search time",
      "Built for buyers comparing areas from outside the market",
    ],
    howItWorks: [
      "Share where you are moving from and what matters most",
      "Get a starter shortlist of areas and search considerations",
      "Book a local strategy step when your shortlist is clear",
    ],
    faq: [
      { question: "Is this only for out-of-town buyers?", answer: "It is built for relocation, but local movers can use it too." },
      { question: "Does it pick the perfect neighborhood?", answer: "No. It narrows options so you can verify fit faster." },
      { question: "Can I request school or commute context?", answer: "Yes. Add those notes in the form for follow-up." },
    ],
    formFields: [
      CORE_FIELDS.name,
      CORE_FIELDS.phone,
      CORE_FIELDS.email,
      field("moving_from", "Moving from", "text"),
      field("move_timeline", "Move timeline", "select"),
    ],
  },
  downsizing_guide: {
    funnelVariant: "downsizing_guide",
    audienceType: "downsizer",
    offerType: "downsizing_guide",
    defaultFormMode: "standard",
    leadMagnetTitle: "{market} Downsizing Guide",
    primaryCTA: "Get The Downsizing Guide",
    heroEyebrow: "Downsizing",
    headlineTemplate: "See the downsizing path before selling in {market}",
    subheadlineTemplate:
      "Compare timing, sale prep, next-home options, and common transition questions before you commit to a move.",
    adHookTemplate: "Thinking about downsizing in {market}? Start with the guide.",
    proofClaims: [
      "Connects selling, buying, and timing into one planning path",
      "Addresses transition questions before listing pressure",
      "No commitment to sell or buy is required",
    ],
    howItWorks: [
      "Share your current home and next-home goals",
      "Review the downsizing sequence and likely decision points",
      "Choose whether to explore sale timing, next-home search, or both",
    ],
    faq: [
      { question: "Do I need to sell first?", answer: "Not always. The guide helps frame options to verify locally." },
      { question: "Who can use this?", answer: "Anyone considering a smaller or simpler home can use it." },
      { question: "Can I use it if I am just curious?", answer: "Yes. Early planning is the intended use case." },
    ],
    formFields: [
      CORE_FIELDS.name,
      CORE_FIELDS.phone,
      CORE_FIELDS.email,
      field("current_home_type", "Current home type", "select"),
      field("ideal_next_home", "Ideal next home", "text"),
    ],
  },
  new_construction_incentive_list: {
    funnelVariant: "new_construction_incentive_list",
    audienceType: "new_construction_buyer",
    offerType: "new_construction_incentives",
    defaultFormMode: "standard",
    leadMagnetTitle: "New Construction Incentive List",
    primaryCTA: "Send Me Incentives",
    heroEyebrow: "New Construction",
    headlineTemplate: "See current {market} new construction incentives",
    subheadlineTemplate:
      "Request builder incentive context, available project types, and timing notes before you visit a sales office unprepared.",
    adHookTemplate: "Looking at new construction in {market}? Ask what incentives are available.",
    proofClaims: [
      "Highlights incentives and availability that can change quickly",
      "Frames deposit, timing, and project-fit questions",
      "Encourages verification before relying on any advertised incentive",
    ],
    howItWorks: [
      "Share budget, timing, and preferred property type",
      "We identify incentive categories to verify with builders",
      "You choose whether to review projects or book a project-fit call",
    ],
    faq: [
      { question: "Are incentives final?", answer: "No. Builder incentives change and must be verified directly." },
      { question: "Can I use my own representation?", answer: "Ask before visiting sales centers because rules vary by builder." },
      { question: "Does this include every project?", answer: "No. It is a filtered starting point for your criteria." },
    ],
    formFields: [
      CORE_FIELDS.name,
      CORE_FIELDS.phone,
      CORE_FIELDS.email,
      field("target_price", "Target price", "text"),
      field("preferred_project_type", "Preferred project type", "select"),
    ],
  },
  investor_deal_access: {
    funnelVariant: "investor_deal_access",
    audienceType: "investor",
    offerType: "investor_deal_access",
    defaultFormMode: "highIntent",
    leadMagnetTitle: "Investor Deal Access List",
    primaryCTA: "Request Deal Access",
    heroEyebrow: "Investor Deal Flow",
    headlineTemplate: "Request filtered investor opportunities in {market}",
    subheadlineTemplate:
      "Share your buy box and receive a tighter path to opportunities that can be underwritten, verified, and acted on faster.",
    adHookTemplate: "{market} investors: request deal flow filtered around your buy box.",
    proofClaims: [
      "Filters around buy box, timeline, and underwriting fit",
      "Avoids promised-return language and requires independent verification",
      "Built for investors who want fewer weak-fit opportunities",
    ],
    howItWorks: [
      "Submit your buy box and capital/timing basics",
      "We filter opportunities against fit and verification needs",
      "You review potential matches before deciding whether to underwrite",
    ],
    faq: [
      { question: "Are returns promised?", answer: "No. Return assumptions require independent verification." },
      { question: "Will every deal be off-market?", answer: "No. The value is fit and filtering, not an availability promise." },
      { question: "Can I send specific criteria?", answer: "Yes. The request is built around your buy box." },
    ],
    formFields: [
      CORE_FIELDS.name,
      CORE_FIELDS.phone,
      CORE_FIELDS.email,
      field("buy_box", "Buy box", "textarea"),
      field("target_return_or_goal", "Target return or goal", "text"),
    ],
  },
  open_house_showing_request: {
    funnelVariant: "open_house_showing_request",
    audienceType: "showing_request",
    offerType: "showing_request",
    defaultFormMode: "highIntent",
    leadMagnetTitle: "Open House And Showing Request",
    primaryCTA: "Request A Showing",
    heroEyebrow: "Showing Request",
    headlineTemplate: "Request a {market} showing without the back-and-forth",
    subheadlineTemplate:
      "Send your preferred property, timing, and contact details so the next step can be confirmed quickly when availability is verified.",
    adHookTemplate: "Want to see a {market} home? Request a showing time.",
    proofClaims: [
      "Captures preferred showing timing above the fold",
      "Makes availability verification explicit",
      "Built for fast follow-up without promising a confirmed appointment",
    ],
    howItWorks: [
      "Send the property and preferred showing windows",
      "Availability and access details are verified",
      "You receive the confirmed next step or alternate options",
    ],
    faq: [
      { question: "Is my showing confirmed after submitting?", answer: "No. The request must be confirmed after availability is verified." },
      { question: "Can I request multiple homes?", answer: "Yes. Add them in the property notes." },
      { question: "What if the home is unavailable?", answer: "Follow-up can suggest alternate times or comparable options." },
    ],
    formFields: [
      CORE_FIELDS.name,
      CORE_FIELDS.phone,
      CORE_FIELDS.email,
      field("property_or_area", "Property or area", "text"),
      field("preferred_showing_time", "Preferred showing time", "text"),
    ],
  },
  appointment_strategy_call: {
    funnelVariant: "appointment_strategy_call",
    audienceType: "appointment_prospect",
    offerType: "strategy_call",
    defaultFormMode: "minimal",
    leadMagnetTitle: "Real Estate Strategy Call",
    primaryCTA: "Request A Strategy Call",
    heroEyebrow: "Strategy Call",
    headlineTemplate: "Book a {market} real estate strategy call",
    subheadlineTemplate:
      "Clarify your goal, timeline, and next step with a focused call request before you make a bigger move.",
    adHookTemplate: "Need a clearer {market} real estate plan? Request a strategy call.",
    proofClaims: [
      "Goal-first call request for buyers, sellers, and investors",
      "Keeps timing, market, and fit questions explicit",
      "No promise of outcome or professional advice beyond the verified scope",
    ],
    howItWorks: [
      "Share your goal and preferred call windows",
      "We confirm fit, timing, and the right next step",
      "You receive a confirmed call path or a better resource",
    ],
    faq: [
      { question: "Is the call confirmed immediately?", answer: "No. The request is reviewed and then confirmed when a time is available." },
      { question: "What can we cover?", answer: "Buying, selling, investment, timing, or market questions at a planning level." },
      { question: "Is this legal or financial advice?", answer: "No. Professional advice should be verified with qualified local experts." },
    ],
    formFields: [
      CORE_FIELDS.name,
      CORE_FIELDS.phone,
      CORE_FIELDS.email,
      field("primary_goal", "Primary goal", "select"),
      field("preferred_call_time", "Preferred call time", "text"),
    ],
  },
};

export function isDirectResponseFunnelVariant(value: unknown): value is DirectResponseFunnelVariant {
  return DIRECT_RESPONSE_FUNNEL_VARIANTS.includes(normalizeKey(value) as DirectResponseFunnelVariant);
}

export function resolveDirectResponseFunnelVariant(input?: DirectResponseFunnelInput | null) {
  const value = normalizeKey(input?.funnelVariant ?? input?.funnel_variant);
  return isDirectResponseFunnelVariant(value) ? value : null;
}

export function getDirectResponseFunnelVariantConfig(variant: DirectResponseFunnelVariant) {
  return VARIANT_CONFIGS[variant];
}

export function buildDirectResponseFunnel(input: DirectResponseFunnelInput): DirectResponseFunnelBlueprint {
  const variant = resolveDirectResponseFunnelVariant(input);

  if (!variant) {
    throw new Error("direct_response_funnel_variant_required");
  }

  const config = VARIANT_CONFIGS[variant];
  const market = safeText(input.market) || safeText(input.location) || DEFAULT_MARKET;
  const priceThreshold = safeText(input.priceThreshold) || safeText(input.price_threshold) || DEFAULT_PRICE_THRESHOLD;
  const formMode = normalizeFormMode(input.formMode ?? input.form_mode) || config.defaultFormMode;
  const leadMagnetTitle = template(
    safeText(input.leadMagnetTitle) || safeText(input.lead_magnet_title) || config.leadMagnetTitle,
    { market, priceThreshold },
  );
  const primaryCTA = safeText(input.primaryCTA) || safeText(input.primary_cta) || config.primaryCTA;
  const hero = {
    eyebrow: config.heroEyebrow,
    headline: template(config.headlineTemplate, { market, priceThreshold }),
    subheadline: template(config.subheadlineTemplate, { market, priceThreshold }),
  };
  const messageMatchSource =
    safeText(input.messageMatchSource) || safeText(input.message_match_source) || MESSAGE_MATCH_SOURCE;
  const adHook = template(safeText(input.adHook) || safeText(input.ad_hook) || config.adHookTemplate, {
    market,
    priceThreshold,
  });
  const leadCaptureFields = ensureFieldsForFormMode(config.formFields, formMode);
  const formFields = leadCaptureFields.map((fieldConfig) => fieldConfig.name);
  const aboveFoldFormConfig = buildAboveFoldFormConfig({
    formMode,
    leadMagnetTitle,
    primaryCTA,
    fields: leadCaptureFields,
  });
  const messageMatchNotes = buildMessageMatchNotes({
    source: messageMatchSource,
    adHook,
    hero,
    leadMagnetTitle,
    primaryCTA,
  });
  const proofClaims = config.proofClaims;
  const complianceFooter = `Compliance footer: ${COMPLIANCE_DISCLAIMER}`;
  const sections = buildDirectResponseSections({
    variant,
    hero,
    leadMagnetTitle,
    primaryCTA,
    proofClaims,
    howItWorks: config.howItWorks,
    faq: config.faq,
    aboveFoldFormConfig,
    complianceFooter,
    messageMatchNotes,
  });

  return {
    funnel_type: funnelTypeForFormMode(formMode, variant),
    headline: hero.headline,
    subheadline: hero.subheadline,
    cta: primaryCTA,
    sections,
    form_fields: formFields,
    follow_up_action: followUpActionForFormMode(formMode, variant),
    optimization_notes: [
      "Keep hero eyebrow, headline, CTA, and form visible above the fold on mobile.",
      "Keep paid-ad hook, lead magnet, and CTA language matched across ad and landing page.",
      "Do not imply promised valuation, proceeds, financing, availability, incentives, investment returns, or appointment confirmation.",
    ],
    funnelVariant: variant,
    audienceType: normalizeAudienceType(input.audienceType ?? input.audience_type) || config.audienceType,
    offerType: normalizeOfferType(input.offerType ?? input.offer_type) || config.offerType,
    market,
    priceThreshold,
    leadMagnetTitle,
    primaryCTA,
    formFields,
    proofClaims,
    complianceDisclaimer: COMPLIANCE_DISCLAIMER,
    messageMatchSource,
    adHook,
    formMode,
    heroEyebrow: hero.eyebrow,
    hero,
    aboveFoldFormConfig,
    leadCaptureFields,
    complianceFooter,
    messageMatchNotes,
  };
}

export function validateDirectResponseCompliance(funnel: Pick<DirectResponseFunnelBlueprint, "complianceDisclaimer" | "proofClaims" | "sections">) {
  const issues: string[] = [];
  const combined = [
    funnel.complianceDisclaimer,
    ...funnel.proofClaims,
    ...funnel.sections.flatMap((section) => [section.title, ...section.content]),
  ]
    .join(" ")
    .toLowerCase();

  if (!/equal housing opportunity/.test(combined)) {
    issues.push("missing_equal_housing_opportunity");
  }

  if (!/not legal, tax, mortgage, investment, or financial advice/.test(combined)) {
    issues.push("missing_professional_advice_disclaimer");
  }

  if (/\bguaranteed?\s+(profit|return|roi|approval|sale|showing|appointment|incentive|availability)\b/.test(combined)) {
    issues.push("guaranteed_outcome_language");
  }

  if (/\bonly\s+(for|available to)\s+(families|singles|seniors|christians|men|women)\b/.test(combined)) {
    issues.push("protected_class_targeting_language");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function validateDirectResponseMessageMatch(
  funnel: Pick<
    DirectResponseFunnelBlueprint,
    "adHook" | "headline" | "leadMagnetTitle" | "primaryCTA" | "messageMatchSource" | "messageMatchNotes"
  >,
) {
  const issues: string[] = [];
  const matchedTerms = getMatchedMessageTerms(funnel.adHook, [
    funnel.headline,
    funnel.leadMagnetTitle,
    funnel.primaryCTA,
  ]);

  if (!safeText(funnel.messageMatchSource)) {
    issues.push("missing_message_match_source");
  }

  if (!safeText(funnel.adHook)) {
    issues.push("missing_ad_hook");
  }

  if (matchedTerms.length < 2) {
    issues.push("weak_ad_to_page_match");
  }

  if (funnel.messageMatchNotes.validationWarnings.length > 0) {
    issues.push(...funnel.messageMatchNotes.validationWarnings);
  }

  return {
    valid: issues.length === 0,
    issues,
    matchedTerms,
  };
}

function field(
  name: string,
  label: string,
  fieldType: DirectResponseLeadCaptureField["fieldType"],
  required = true,
): DirectResponseLeadCaptureField {
  return {
    name,
    label,
    fieldType,
    required,
  };
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: unknown) {
  return safeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeFormMode(value: unknown): DirectResponseFormMode | null {
  const normalized = normalizeKey(value);

  if (normalized === "minimal" || normalized === "short_form" || normalized === "lead_capture" || normalized === "form") {
    return "minimal";
  }

  if (normalized === "standard" || normalized === "survey") {
    return "standard";
  }

  if (
    normalized === "highintent" ||
    normalized === "high_intent" ||
    normalized === "qualifying_survey" ||
    normalized === "appointment_request" ||
    normalized === "book_call" ||
    normalized === "appointment"
  ) {
    return "highIntent";
  }

  return null;
}

function normalizeAudienceType(value: unknown): DirectResponseAudienceType | null {
  const normalized = normalizeKey(value);
  const options: DirectResponseAudienceType[] = [
    "seller",
    "buyer",
    "first_time_buyer",
    "relocation_buyer",
    "downsizer",
    "new_construction_buyer",
    "investor",
    "showing_request",
    "appointment_prospect",
  ];

  return options.includes(normalized as DirectResponseAudienceType)
    ? (normalized as DirectResponseAudienceType)
    : null;
}

function normalizeOfferType(value: unknown): DirectResponseOfferType | null {
  const normalized = normalizeKey(value);
  const options: DirectResponseOfferType[] = [
    "seller_cma",
    "seller_net_sheet",
    "buyer_inventory",
    "first_time_buyer_plan",
    "relocation_kit",
    "downsizing_guide",
    "new_construction_incentives",
    "investor_deal_access",
    "showing_request",
    "strategy_call",
  ];

  return options.includes(normalized as DirectResponseOfferType)
    ? (normalized as DirectResponseOfferType)
    : null;
}

function template(value: string, replacements: { market: string; priceThreshold: string }) {
  return value
    .replace(/\{market\}/g, replacements.market)
    .replace(/\{priceThreshold\}/g, replacements.priceThreshold)
    .replace(/\s+/g, " ")
    .trim();
}

function ensureFieldsForFormMode(fields: DirectResponseLeadCaptureField[], formMode: DirectResponseFormMode) {
  const contactFields = fields.filter((item) => item.name === "name" || item.name === "phone" || item.name === "email");
  const qualifyingFields = fields.filter((item) => !["name", "phone", "email"].includes(item.name));

  if (formMode === "minimal") {
    return [
      contactFields.find((item) => item.name === "name") ?? CORE_FIELDS.name,
      contactFields.find((item) => item.name === "phone") ?? CORE_FIELDS.phone,
    ];
  }

  if (formMode === "standard") {
    return [
      contactFields.find((item) => item.name === "name") ?? CORE_FIELDS.name,
      contactFields.find((item) => item.name === "phone") ?? CORE_FIELDS.phone,
      contactFields.find((item) => item.name === "email") ?? CORE_FIELDS.email,
      qualifyingFields[0] ?? field("main_goal", "Main goal", "text"),
    ];
  }

  return fields.length >= 5 ? fields : [...fields, field("notes", "What should we know?", "textarea", false)];
}

function buildAboveFoldFormConfig(input: {
  formMode: DirectResponseFormMode;
  leadMagnetTitle: string;
  primaryCTA: string;
  fields: DirectResponseLeadCaptureField[];
}): DirectResponseAboveFoldFormConfig {
  const description =
    input.formMode === "minimal"
      ? "Submit the short form and get the requested resource or next step."
      : input.formMode === "standard"
        ? "Answer the key fit question so follow-up can be specific."
        : "Request the high-intent review so follow-up can be specific.";

  return {
    mode: input.formMode,
    title: input.leadMagnetTitle,
    description,
    submitLabel: input.primaryCTA,
    fields: input.fields,
    privacyNote: "Your information is used only for this real estate request and related follow-up.",
  };
}

function buildMessageMatchNotes(input: {
  source: string;
  adHook: string;
  hero: DirectResponseHero;
  leadMagnetTitle: string;
  primaryCTA: string;
}): DirectResponseMessageMatchNotes {
  const matchedTerms = getMatchedMessageTerms(input.adHook, [
    input.hero.eyebrow,
    input.hero.headline,
    input.hero.subheadline,
    input.leadMagnetTitle,
    input.primaryCTA,
  ]);
  const validationWarnings = matchedTerms.length >= 2 ? [] : ["weak_ad_to_page_match"];

  return {
    source: input.source,
    adHook: input.adHook,
    matchedTerms,
    validationWarnings,
  };
}

function getMatchedMessageTerms(source: string, targets: string[]) {
  const targetText = targets.join(" ").toLowerCase();
  const stopWords = new Set([
    "about",
    "after",
    "before",
    "could",
    "current",
    "right",
    "start",
    "their",
    "there",
    "these",
    "under",
    "want",
    "what",
    "when",
    "with",
    "your",
  ]);
  const terms = safeText(source)
    .toLowerCase()
    .split(/[^a-z0-9$]+/)
    .filter((term) => term.length > 3 && !stopWords.has(term));

  return Array.from(new Set(terms.filter((term) => targetText.includes(term)))).slice(0, 8);
}

function funnelTypeForFormMode(formMode: DirectResponseFormMode, variant: DirectResponseFunnelVariant): FunnelType {
  if (variant === "appointment_strategy_call" || variant === "open_house_showing_request") {
    return "landing_page_book_call";
  }

  if (formMode === "highIntent") {
    return "landing_page_survey";
  }

  return "landing_page_form";
}

function followUpActionForFormMode(formMode: DirectResponseFormMode, variant: DirectResponseFunnelVariant) {
  if (variant === "appointment_strategy_call" || variant === "open_house_showing_request") {
    return "confirm_requested_appointment_then_route_to_calendar";
  }

  if (formMode === "highIntent") {
    return "show_thank_you_page_with_qualified_follow_up";
  }

  return "show_thank_you_page_call_5_15_minutes";
}

function buildDirectResponseSections(input: {
  variant: DirectResponseFunnelVariant;
  hero: DirectResponseHero;
  leadMagnetTitle: string;
  primaryCTA: string;
  proofClaims: string[];
  howItWorks: string[];
  faq: Array<{ question: string; answer: string }>;
  aboveFoldFormConfig: DirectResponseAboveFoldFormConfig;
  complianceFooter: string;
  messageMatchNotes: DirectResponseMessageMatchNotes;
}): FunnelSection[] {
  return [
    section(input.variant, "hero", input.hero.headline, [
      `Eyebrow: ${input.hero.eyebrow}`,
      input.hero.subheadline,
      `Primary CTA: ${input.primaryCTA}`,
      `Lead magnet: ${input.leadMagnetTitle}`,
    ], "direct-response-hero"),
    section(input.variant, "form", input.aboveFoldFormConfig.title, [
      `Above-fold form mode: ${input.aboveFoldFormConfig.mode}`,
      input.aboveFoldFormConfig.description,
      `Lead-capture fields: ${input.aboveFoldFormConfig.fields.map((fieldConfig) => fieldConfig.name).join(", ")}`,
      `Submit label: ${input.aboveFoldFormConfig.submitLabel}`,
      input.aboveFoldFormConfig.privacyNote,
    ], "above-fold-capture"),
    section(input.variant, "proof_metrics", "Proof before the form feels risky", input.proofClaims, "compliance-safe-proof"),
    section(input.variant, "process", "How it works", input.howItWorks, "three-step-direct-response"),
    section(input.variant, "faq", "Questions before you request this", input.faq.map((item) => `${item.question} ${item.answer}`), "objection-faq"),
    section(input.variant, "market_snapshot", "Message-match notes", [
      `Source: ${input.messageMatchNotes.source}`,
      `Ad hook: ${input.messageMatchNotes.adHook}`,
      `Matched terms: ${input.messageMatchNotes.matchedTerms.join(", ") || "Needs review"}`,
    ], "ad-to-page-match"),
    section(input.variant, "closing_cta", "Ready for the next step?", [
      `Primary CTA: ${input.primaryCTA}`,
      input.complianceFooter,
    ], "repeated-cta-with-compliance-footer"),
  ];
}

function section(
  variant: DirectResponseFunnelVariant,
  type: FunnelSection["type"],
  title: string,
  content: string[],
  sectionVariant: string,
): FunnelSection {
  return {
    id: `${variant}-${type}`,
    type,
    variant: sectionVariant,
    title,
    content,
    visible: true,
    style: BASE_STYLE[type],
    media: null,
  };
}
