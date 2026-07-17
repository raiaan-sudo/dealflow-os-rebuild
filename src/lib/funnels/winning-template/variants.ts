import type {
  WinningFunnelAngle,
  WinningFunnelInput,
  WinningFunnelLeadCaptureMode,
  WinningFunnelLeadType,
  WinningFunnelQuizStep,
} from "@/lib/funnels/winning-template/schema";
import { getWinningFunnelLanguageCopy } from "@/lib/funnels/winning-template/language";
import type { FunnelEngineInput } from "@/lib/services/funnel-engine";

export type WinningFunnelSourceInput = Omit<FunnelEngineInput, "market_type"> & {
  [key: string]: unknown;
  market?: unknown;
  market_type?: FunnelEngineInput["market_type"] | "commercial";
  primaryCTA?: unknown;
  primary_cta?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function haystack(input: WinningFunnelSourceInput) {
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

export function resolveWinningLeadType(input: WinningFunnelSourceInput): WinningFunnelLeadType {
  const raw = haystack(input);

  if (input.market_type === "seller" || /seller|home value|valuation|sell|listing|homeowner/.test(raw)) return "seller";
  if (input.market_type === "investor" || /invest|cash.?flow|roi|yield|deal/.test(raw)) return "investor";
  if (input.market_type === "commercial" || /commercial|lease|warehouse|retail|office|industrial/.test(raw)) return "commercial";

  return "buyer";
}

export function resolveWinningAngle(input: WinningFunnelSourceInput, leadType: WinningFunnelLeadType): WinningFunnelAngle {
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

export function resolveWinningLeadCaptureMode(input: WinningFunnelSourceInput): WinningFunnelLeadCaptureMode {
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
    if (input.leadType === "seller") return `Vea cuánto podría valer su propiedad en ${market}`;
    if (input.leadType === "investor") return `Acceda a oportunidades inmobiliarias en ${market}`;
    if (input.campaignAngle === "downsizer") return `¿Listo para simplificar su próxima mudanza en ${market}?`;
    return `${offer} en ${market}`;
  }

  if (input.campaignAngle === "downsizer") return `Thinking about downsizing in ${market}?`;
  if (input.campaignAngle === "upsizer") return `Ready to upsize in ${market}?`;
  if (input.campaignAngle === "home_value" || input.leadType === "seller") return `Find out what your home could sell for in ${market}.`;
  if (input.leadType === "investor") return `Get a clearer view of investor opportunities in ${market}.`;
  if (input.leadType === "commercial") return `Find commercial options that fit your next move in ${market}`;
  if (input.campaignAngle === "first_time_buyer") return `Get your first-home plan for ${market}.`;
  if (input.campaignAngle === "off_market") return `Get a custom home list for ${market}.`;
  if (/custom home list|home list|curated home/i.test(offer)) return `Get your custom home list in ${market}.`;

  return `${offer} in ${market}`;
}

export function buildWinningSubheadline(input: WinningFunnelInput) {
  const audience = input.audience || "qualified local prospects";

  if (input.language === "fr") {
    return "Nous préparons une prochaine étape personnalisée selon vos besoins afin que vous puissiez avancer avec clarté et confiance.";
  }

  if (input.language === "es") {
    return "Preparamos un siguiente paso personalizado según sus necesidades para que pueda avanzar con claridad y confianza.";
  }

  if (input.campaignAngle === "downsizer") {
    return `Get a clear, personalized plan for selling your current home and reviewing the right next-place options in ${input.market}.`;
  }

  if (input.campaignAngle === "upsizer") {
    return `Get a custom list of homes matched to your next chapter in ${input.market} so you can upsize with confidence and clarity.`;
  }

  if (input.campaignAngle === "home_value" || input.leadType === "seller") {
    return `Get a personalized home value review and selling plan based on your property, timeline, and local market.`;
  }

  return `We'll put together a personalized list matched to your budget, location, and timeline for ${audience} so you can review the next step with clarity.`;
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
  if (input.leadType === "seller") return `${market} · personalized home value review`;
  if (input.campaignAngle === "downsizer") return `${market} · downsizing guidance`;
  if (input.campaignAngle === "upsizer") return `${market} · custom home options`;
  if (input.leadType === "investor") return `${market} · curated property options`;
  if (input.leadType === "commercial") return `${market} · commercial property guidance`;

  return `${market} · personalized options · local guidance`;
}

export function buildWinningTrustBullets(input: WinningFunnelInput) {
  const defaults =
    input.language === "fr"
      ? ["Options personnalisées", "Conseils locaux", "Étapes claires", "Adapté à votre marché"]
      : input.language === "es"
        ? ["Opciones personalizadas", "Guía local", "Próximos pasos claros", "Adaptado a su mercado"]
        : ["Personalized Options", "Local Guidance", "Clear Next Steps", "Market-Based Review"];

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
  const localizedOptions = {
    en: {
      seller: ["Selling soon", "Curious about value", "Relocating", "Need more space", "Downsizing", "Other"],
      investor: ["Cash flow", "Off-market deals", "Value-add", "Long-term rental", "Portfolio growth", "Other"],
      commercial: ["Lease", "Purchase", "Expansion", "Relocation", "Investment", "Other"],
      buyer: ["Growing family", "Working from home", "Need more outdoor space", "Investment", "Looking for more storage", "Other"],
      timeline: ["Immediately", "Within 3 months", "3-6 months", "6-12 months", "Not sure yet"],
    },
    fr: {
      seller: ["Vendre bientôt", "Connaître la valeur", "Relocalisation", "Besoin de plus d'espace", "Réduire la taille", "Autre"],
      investor: ["Flux de trésorerie", "Occasions hors marché", "Valeur ajoutée", "Location à long terme", "Croissance du portefeuille", "Autre"],
      commercial: ["Location", "Achat", "Expansion", "Relocalisation", "Investissement", "Autre"],
      buyer: ["Famille grandissante", "Télétravail", "Besoin de plus d'espace extérieur", "Investissement", "Besoin de rangement", "Autre"],
      timeline: ["Immédiatement", "Dans les 3 mois", "3 à 6 mois", "6 à 12 mois", "Pas encore certain"],
    },
    es: {
      seller: ["Vender pronto", "Conocer el valor", "Reubicación", "Necesita más espacio", "Reducir el espacio", "Otro"],
      investor: ["Flujo de caja", "Oportunidades fuera del mercado", "Valor agregado", "Alquiler a largo plazo", "Crecimiento de la cartera", "Otro"],
      commercial: ["Arrendamiento", "Compra", "Expansión", "Reubicación", "Inversión", "Otro"],
      buyer: ["Familia en crecimiento", "Trabajo desde casa", "Necesita más espacio exterior", "Inversión", "Necesita más almacenamiento", "Otro"],
      timeline: ["De inmediato", "Dentro de 3 meses", "3 a 6 meses", "6 a 12 meses", "Aún no lo sé"],
    },
  }[input.language];
  const motivationOptions = localizedOptions[input.leadType];

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
      options: localizedOptions.timeline,
    },
    {
      id: "contact",
      question: copy.contact,
      fields: ["name", "phone", "email"],
    },
  ];
}
