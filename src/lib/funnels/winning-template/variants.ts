import type {
  WinningFunnelAngle,
  WinningFunnelInput,
  WinningFunnelLeadCaptureMode,
  WinningFunnelLeadType,
  WinningFunnelQuizStep,
} from "@/lib/funnels/winning-template/schema";
import { getWinningFunnelLanguageCopy } from "@/lib/funnels/winning-template/language";
import type { FunnelEngineInput } from "@/lib/services/funnel-engine";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function haystack(input: FunnelEngineInput) {
  return [
    input.market_type,
    input.audience,
    input.offer,
    input.key_offer,
    input.headline,
    input.subheadline,
    input.market,
    input.location,
  ]
    .map(text)
    .join(" ")
    .toLowerCase();
}

export function resolveWinningLeadType(input: FunnelEngineInput): WinningFunnelLeadType {
  const raw = haystack(input);

  if (input.market_type === "seller" || /seller|home value|valuation|sell|listing|homeowner/.test(raw)) return "seller";
  if (input.market_type === "investor" || /invest|cash.?flow|roi|yield|deal/.test(raw)) return "investor";
  if (input.market_type === "commercial" || /commercial|lease|warehouse|retail|office|industrial/.test(raw)) return "commercial";

  return "buyer";
}

export function resolveWinningAngle(input: FunnelEngineInput, leadType: WinningFunnelLeadType): WinningFunnelAngle {
  const raw = haystack(input);

  if (/downsiz/.test(raw)) return "downsizer";
  if (/upsiz|larger|growing family|more space/.test(raw)) return "upsizer";
  if (/first.?time|600\+|approval|credit/.test(raw)) return "first_time_buyer";
  if (/luxury|estate|private|premium|high.?end/.test(raw)) return "luxury";
  if (/off.?market|under.?market|private listing|before.*public|exclusive/.test(raw)) return "off_market";
  if (/home value|valuation|worth|cma/.test(raw)) return "home_value";
  if (leadType === "seller") return "seller_valuation";
  if (leadType === "investor") return "investor_opportunity";
  if (leadType === "commercial") return "commercial";

  return "buyer_access";
}

export function resolveWinningLeadCaptureMode(input: FunnelEngineInput): WinningFunnelLeadCaptureMode {
  const explicit = (input as Record<string, unknown>).leadCaptureMode ?? (input as Record<string, unknown>).lead_capture_mode;
  if (
    explicit === "quality_funnel" ||
    explicit === "volume_lead_form" ||
    explicit === "deep_qualification"
  ) {
    return explicit;
  }

  const raw = haystack(input);

  if (/typeform|deep|application/.test(raw)) return "deep_qualification";
  if (/qualif|survey/.test(raw) || input.funnel_goal === "survey") return "quality_funnel";
  if (/volume|instant|lead form|fast leads/.test(raw) || input.funnel_goal === "lead_form") return "volume_lead_form";

  return "quality_funnel";
}

export function buildWinningHeadline(input: WinningFunnelInput) {
  const market = input.market;
  const offer = input.offer.replace(/[.!?]+$/g, "");

  if (input.language === "fr") {
    if (input.leadType === "seller") return `Voyez ce que votre propriété pourrait valoir à ${market}`;
    if (input.leadType === "investor") return `Accédez à des occasions immobilières à ${market}`;
    if (input.campaignAngle === "downsizer") return `Prêt à simplifier votre prochain déménagement à ${market}?`;
    return `${offer} à ${market}`;
  }

  if (input.language === "es") {
    if (input.leadType === "seller") return `Vea cuanto podria valer su propiedad en ${market}`;
    if (input.leadType === "investor") return `Acceda a oportunidades inmobiliarias en ${market}`;
    if (input.campaignAngle === "downsizer") return `Listo para simplificar su proxima mudanza en ${market}?`;
    return `${offer} en ${market}`;
  }

  if (input.campaignAngle === "downsizer") return `Thinking about downsizing in ${market}?`;
  if (input.campaignAngle === "upsizer") return `Ready to upsize in ${market}?`;
  if (input.campaignAngle === "home_value" || input.leadType === "seller") return `Find out what your home could sell for in ${market}.`;
  if (input.leadType === "investor") return `Get a clearer view of investor opportunities in ${market}.`;
  if (input.leadType === "commercial") return `Find commercial options that fit your next move in ${market}`;
  if (input.campaignAngle === "first_time_buyer") return `Get your first-home plan for ${market}.`;
  if (input.campaignAngle === "off_market") return `Get a custom home list for ${market}.`;
  if (/custom home list|home list|curated home/i.test(offer)) return `Get your free custom home list in ${market}.`;

  return `${offer} in ${market}`;
}

export function buildWinningSubheadline(input: WinningFunnelInput) {
  const audience = input.audience || "qualified local prospects";
  const offer = input.offer.replace(/[.!?]+$/g, "");

  if (input.language === "fr") {
    return `Nous préparons une prochaine étape personnalisée pour ${audience} afin que vous puissiez avancer avec clarté, confiance et sans pression.`;
  }

  if (input.language === "es") {
    return `Preparamos un siguiente paso personalizado para ${audience} para que pueda avanzar con claridad, confianza y sin presion.`;
  }

  if (input.campaignAngle === "downsizer") {
    return `Get a clear, personalized plan for selling your current home and finding the right next place in ${input.market} without pressure or guesswork.`;
  }

  if (input.campaignAngle === "upsizer") {
    return `Get a custom list of homes matched to your next chapter in ${input.market} so you can upsize with confidence, clarity, and zero pressure.`;
  }

  if (input.campaignAngle === "home_value" || input.leadType === "seller") {
    return `Get a personalized home value review and selling plan based on your property, timeline, and local market.`;
  }

  return `We'll put together a personalized list matched to your budget, location, and timeline for ${audience} so you can move forward with clarity and zero pressure.`;
}

export function buildWinningCta(input: WinningFunnelInput) {
  if (input.cta) return input.cta;
  if (input.language === "fr") return "Recevoir mes options";
  if (input.language === "es") return "Ver mis opciones";
  if (input.campaignAngle === "downsizer") return "Get My Downsizing Plan";
  if (input.campaignAngle === "upsizer") return "Get My Custom List";
  if (input.campaignAngle === "home_value" || input.leadType === "seller") return "Get My Home Value";
  if (input.leadType === "investor") return "See Matching Deals";
  return "Get My Custom List";
}

export function buildWinningMicroLabel(input: WinningFunnelInput) {
  const market = input.market && input.market !== "your market" ? input.market : "Local market";

  if (input.language === "fr") return `${market} · options personnalisées`;
  if (input.language === "es") return `${market} · opciones personalizadas`;
  if (input.leadType === "seller") return `${market} · free home value review`;
  if (input.campaignAngle === "downsizer") return `${market} · downsizing guidance`;
  if (input.campaignAngle === "upsizer") return `${market} · custom home options`;
  if (input.leadType === "investor") return `${market} · curated property options`;
  if (input.leadType === "commercial") return `${market} · commercial property guidance`;

  return `${market} · free · no obligation`;
}

export function buildWinningTrustBullets(input: WinningFunnelInput) {
  const defaults =
    input.language === "fr"
      ? ["100% gratuit", "Sans obligation", "Options personnalisées", "Conseils locaux"]
      : input.language === "es"
        ? ["100% gratis", "Sin obligacion", "Opciones personalizadas", "Guia local"]
        : ["100% Free", "No Obligation", "Personalized Options", "Local Guidance"];

  return [...input.proofBadges, ...defaults].slice(0, 4);
}

export function buildWinningQuizSteps(input: WinningFunnelInput): WinningFunnelQuizStep[] {
  const copy = getWinningFunnelLanguageCopy(input.language);
  const motivationQuestion =
    input.leadType === "seller"
      ? copy.motivationSeller
      : input.leadType === "investor"
        ? copy.motivationInvestor
        : input.leadType === "commercial"
          ? copy.motivationCommercial
          : copy.motivationBuyer;
  const motivationOptions =
    input.leadType === "seller"
      ? ["Selling soon", "Curious about value", "Relocating", "Need more space", "Downsizing", "Other"]
      : input.leadType === "investor"
        ? ["Cash flow", "Off-market deals", "Value-add", "Long-term rental", "Portfolio growth", "Other"]
        : input.leadType === "commercial"
          ? ["Lease", "Purchase", "Expansion", "Relocation", "Investment", "Other"]
          : ["Growing family", "Working from home", "Need more outdoor space", "Investment", "Looking for more storage", "Other"];

  return [
    {
      id: "motivation",
      question: motivationQuestion,
      options: motivationOptions,
    },
    {
      id: "budget",
      question: copy.budget,
      options: ["$600k-$800k", "$800k-$1M", "$1M-$1.5M", "$1.5M-$2M", "$2M+"],
    },
    {
      id: "timeline",
      question: copy.timeline,
      options: ["Immediately", "Within 3 months", "3-6 months", "6-12 months", "Not sure yet"],
    },
    {
      id: "contact",
      question: copy.contact,
      fields: ["name", "phone", "email"],
    },
  ];
}
