export type CampaignLanguage = "en" | "fr" | "es";

export type CampaignLanguageProfile = {
  code: CampaignLanguage;
  label: string;
  nativeLabel: string;
  locale: string;
  promptName: string;
};

export type CampaignLanguageSafetyGate = {
  passed: boolean;
  blockers: string[];
  checkedAt: string;
};

export const SUPPORTED_CAMPAIGN_LANGUAGES: CampaignLanguageProfile[] = [
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    locale: "en-US",
    promptName: "English",
  },
  {
    code: "fr",
    label: "French",
    nativeLabel: "Francais",
    locale: "fr-CA",
    promptName: "French",
  },
  {
    code: "es",
    label: "Spanish",
    nativeLabel: "Espanol",
    locale: "es-ES",
    promptName: "Spanish",
  },
];

const LANGUAGE_PROFILE_BY_CODE = new Map(SUPPORTED_CAMPAIGN_LANGUAGES.map((profile) => [profile.code, profile]));

export function normalizeCampaignLanguage(value: unknown): CampaignLanguage {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (normalized === "fr" || normalized === "french" || normalized === "fr-ca" || normalized === "francais" || normalized === "français") {
    return "fr";
  }

  if (normalized === "es" || normalized === "spanish" || normalized === "es-es" || normalized === "espanol" || normalized === "español") {
    return "es";
  }

  return "en";
}

export function getCampaignLanguageProfile(value: unknown): CampaignLanguageProfile {
  return LANGUAGE_PROFILE_BY_CODE.get(normalizeCampaignLanguage(value)) ?? LANGUAGE_PROFILE_BY_CODE.get("en")!;
}

export function getCampaignLanguageLabel(value: unknown) {
  return getCampaignLanguageProfile(value).label;
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const EXACT_TRANSLATIONS: Record<Exclude<CampaignLanguage, "en">, Record<string, string>> = {
  fr: {
    name: "nom",
    phone: "telephone",
    email: "courriel",
    "Book My Strategy Call": "Reserver mon appel strategique",
    "Check Now": "Verifier maintenant",
    "View Homes": "Voir les maisons",
    "See Matching Homes": "Voir les maisons correspondantes",
    "See If You Qualify": "Voir si vous etes admissible",
    "Click Learn More To Get Access": "Cliquez pour en savoir plus et obtenir l'acces",
    "Learn More": "En savoir plus",
    "Get Access": "Obtenir l'acces",
    "Request Details": "Demander les details",
    "Get The List": "Obtenir la liste",
    "Check My Value": "Verifier ma valeur",
    "Get Sale Plan": "Obtenir mon plan de vente",
    "Send the next-step response and qualify interest.": "Envoyer la reponse suivante et qualifier l'interet.",
    "show_thank_you_page": "show_thank_you_page",
    "show_thank_you_page_call_5_15_minutes": "show_thank_you_page_call_5_15_minutes",
    "send_to_follow_up_sequence": "send_to_follow_up_sequence",
    "redirect_to_calendar": "redirect_to_calendar",
  },
  es: {
    name: "nombre",
    phone: "telefono",
    email: "correo",
    "Book My Strategy Call": "Reservar mi llamada estrategica",
    "Check Now": "Verificar ahora",
    "View Homes": "Ver casas",
    "See Matching Homes": "Ver casas compatibles",
    "See If You Qualify": "Ver si calificas",
    "Click Learn More To Get Access": "Haz clic para obtener acceso",
    "Learn More": "Mas informacion",
    "Get Access": "Obtener acceso",
    "Request Details": "Solicitar detalles",
    "Get The List": "Obtener la lista",
    "Check My Value": "Verificar mi valor",
    "Get Sale Plan": "Obtener plan de venta",
    "Send the next-step response and qualify interest.": "Enviar la siguiente respuesta y calificar el interes.",
    "show_thank_you_page": "show_thank_you_page",
    "show_thank_you_page_call_5_15_minutes": "show_thank_you_page_call_5_15_minutes",
    "send_to_follow_up_sequence": "send_to_follow_up_sequence",
    "redirect_to_calendar": "redirect_to_calendar",
  },
};

const PHRASE_TRANSLATIONS: Record<Exclude<CampaignLanguage, "en">, Array<[RegExp, string]>> = {
  fr: [
    [/\bHome buyers\b/gi, "Acheteurs"],
    [/\bbuyers\b/gi, "acheteurs"],
    [/\bbuyer\b/gi, "acheteur"],
    [/\bHomeowners\b/gi, "Proprietaires"],
    [/\bhomeowners\b/gi, "proprietaires"],
    [/\bhomes\b/gi, "maisons"],
    [/\bhome\b/gi, "maison"],
    [/\blistings\b/gi, "proprietes"],
    [/\bprivate listings\b/gi, "proprietes privees"],
    [/\boff-market\b/gi, "hors marche"],
    [/\bunder-market\b/gi, "sous le marche"],
    [/\bdeals\b/gi, "occasions"],
    [/\bopportunities\b/gi, "occasions"],
    [/\bstrategy call\b/gi, "appel strategique"],
    [/\bconsultation\b/gi, "consultation"],
    [/\bqualification\b/gi, "qualification"],
    [/\bbudget-fit\b/gi, "adapte au budget"],
    [/\bmarket\b/gi, "marche"],
    [/\bexclusive\b/gi, "exclusif"],
    [/\baccess\b/gi, "acces"],
    [/\bfirst-time\b/gi, "premier achat"],
    [/\bvalue\b/gi, "valeur"],
    [/\bseller\b/gi, "vendeur"],
    [/\bsell\b/gi, "vendre"],
  ],
  es: [
    [/\bHome buyers\b/gi, "Compradores"],
    [/\bbuyers\b/gi, "compradores"],
    [/\bbuyer\b/gi, "comprador"],
    [/\bHomeowners\b/gi, "Propietarios"],
    [/\bhomeowners\b/gi, "propietarios"],
    [/\bhomes\b/gi, "casas"],
    [/\bhome\b/gi, "casa"],
    [/\blistings\b/gi, "propiedades"],
    [/\bprivate listings\b/gi, "propiedades privadas"],
    [/\boff-market\b/gi, "fuera del mercado"],
    [/\bunder-market\b/gi, "por debajo del mercado"],
    [/\bdeals\b/gi, "oportunidades"],
    [/\bopportunities\b/gi, "oportunidades"],
    [/\bstrategy call\b/gi, "llamada estrategica"],
    [/\bconsultation\b/gi, "consulta"],
    [/\bqualification\b/gi, "calificacion"],
    [/\bbudget-fit\b/gi, "ajuste de presupuesto"],
    [/\bmarket\b/gi, "mercado"],
    [/\bexclusive\b/gi, "exclusivo"],
    [/\baccess\b/gi, "acceso"],
    [/\bfirst-time\b/gi, "primer compra"],
    [/\bvalue\b/gi, "valor"],
    [/\bseller\b/gi, "vendedor"],
    [/\bsell\b/gi, "vender"],
  ],
};

const PREFIX_BY_LANGUAGE: Record<Exclude<CampaignLanguage, "en">, string> = {
  fr: "FR",
  es: "ES",
};

export function localizeCampaignText(value: unknown, language: unknown): string {
  const text = safeText(value);
  const languageCode = normalizeCampaignLanguage(language);

  if (!text || languageCode === "en") {
    return text;
  }

  const exact = EXACT_TRANSLATIONS[languageCode][text];
  if (exact) {
    return exact;
  }

  let next = text;
  for (const [pattern, replacement] of PHRASE_TRANSLATIONS[languageCode]) {
    next = next.replace(pattern, replacement);
  }

  if (next === text && /^[A-Z0-9 ,.'’:$+-]+$/.test(text) && text.length <= 40) {
    return `${PREFIX_BY_LANGUAGE[languageCode]}: ${text}`;
  }

  return next;
}

export function localizeCampaignTextList(values: unknown, language: unknown): string[] {
  return Array.isArray(values)
    ? values.map((value) => localizeCampaignText(value, language)).filter(Boolean)
    : [];
}

function localizeObjectStrings<T extends Record<string, unknown>>(value: T, language: CampaignLanguage, keys: string[]): T {
  const next: Record<string, unknown> = { ...value };

  for (const key of keys) {
    if (typeof next[key] === "string") {
      next[key] = localizeCampaignText(next[key], language);
    }
  }

  return next as T;
}

export function withCampaignLanguageMetadata<T extends object>(value: T, language: unknown): T & {
  languageCode: CampaignLanguage;
  languageLabel: string;
  campaignLanguage: CampaignLanguageProfile;
} {
  const profile = getCampaignLanguageProfile(language);

  return {
    ...value,
    languageCode: profile.code,
    languageLabel: profile.label,
    campaignLanguage: profile,
  };
}

export function localizeStaticCreativeAsset<T extends object>(asset: T, language: unknown): T {
  const profile = getCampaignLanguageProfile(language);

  if (profile.code === "en") {
    return withCampaignLanguageMetadata(asset, profile.code) as T;
  }

  const localized = localizeObjectStrings(asset as Record<string, unknown>, profile.code, [
    "hook",
    "overlayText",
    "primaryText",
    "headline",
    "cta",
    "offer",
    "visualConcept",
    "imagePrompt",
    "approvedOfferTitle",
    "approvedCta",
  ]);

  return withCampaignLanguageMetadata(localized, profile.code) as T;
}

export function localizeVideoCreativeAsset<T extends object>(asset: T, language: unknown): T {
  const profile = getCampaignLanguageProfile(language);
  const next = localizeObjectStrings(asset as Record<string, unknown>, profile.code, ["title", "hook", "cta", "creatorStyle", "voiceStyle"]);

  if (Array.isArray(next.script)) {
    next.script = localizeCampaignTextList(next.script, profile.code);
  }
  if (Array.isArray(next.shotList)) {
    next.shotList = localizeCampaignTextList(next.shotList, profile.code);
  }
  if (Array.isArray(next.onScreenText)) {
    next.onScreenText = localizeCampaignTextList(next.onScreenText, profile.code);
  }

  return withCampaignLanguageMetadata(next, profile.code) as T;
}

export function localizeFunnelBlueprint<T extends Record<string, unknown>>(funnel: T, language: unknown): T {
  const profile = getCampaignLanguageProfile(language);
  const next = localizeObjectStrings(funnel, profile.code, ["headline", "subheadline", "cta", "follow_up_action"]);
  const nextRecord = next as Record<string, unknown>;

  if (Array.isArray(nextRecord.form_fields)) {
    nextRecord.form_fields = localizeCampaignTextList(nextRecord.form_fields, profile.code);
  }
  if (Array.isArray(nextRecord.optimization_notes)) {
    nextRecord.optimization_notes = localizeCampaignTextList(nextRecord.optimization_notes, profile.code);
  }
  if (Array.isArray(nextRecord.sections)) {
    nextRecord.sections = nextRecord.sections.map((section) => {
      if (!section || typeof section !== "object" || Array.isArray(section)) {
        return section;
      }

      const localizedSection = localizeObjectStrings(section as Record<string, unknown>, profile.code, ["title", "variant"]);
      if (Array.isArray(localizedSection.content)) {
        localizedSection.content = localizeCampaignTextList(localizedSection.content, profile.code);
      }
      return localizedSection;
    });
  }

  return {
    ...withCampaignLanguageMetadata(next, profile.code),
    language_code: profile.code,
    language_label: profile.label,
  } as T;
}

const OBVIOUS_ENGLISH_TOKENS = /\b(?:learn more|check now|view homes|see matching homes|book my strategy call|get access|request details|home buyers|private listings|under-market|off-market|first-time buyer)\b/i;
const OBVIOUS_FRENCH_OR_SPANISH_TOKENS = /\b(?:obtenir|voir|maisons|acheteurs|proprietaires|compradores|propietarios|casas|acceso|mercado|oportunidades)\b/i;

export function evaluateCampaignLanguageSafety(params: {
  expectedLanguage?: unknown;
  assetLanguage?: unknown;
  texts?: unknown[];
}): CampaignLanguageSafetyGate {
  const expected = normalizeCampaignLanguage(params.expectedLanguage);
  const assetLanguage = params.assetLanguage === undefined || params.assetLanguage === null
    ? null
    : normalizeCampaignLanguage(params.assetLanguage);
  const blockers: string[] = [];

  if (assetLanguage && assetLanguage !== expected) {
    blockers.push("language_code_mismatch");
  }

  const joined = (params.texts ?? [])
    .map((value) => safeText(value))
    .filter(Boolean)
    .join(" ");

  if (expected !== "en" && OBVIOUS_ENGLISH_TOKENS.test(joined)) {
    blockers.push("wrong_language_english_copy");
  }

  if (expected === "en" && assetLanguage && assetLanguage !== "en" && OBVIOUS_FRENCH_OR_SPANISH_TOKENS.test(joined)) {
    blockers.push("wrong_language_non_english_copy");
  }

  return {
    passed: blockers.length === 0,
    blockers,
    checkedAt: new Date().toISOString(),
  };
}
