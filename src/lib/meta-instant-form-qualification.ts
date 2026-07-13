export type MetaQualificationDepth =
  | "volume_lead_form"
  | "quality_funnel"
  | "deep_qualification";

export type MetaQualificationLanguage = "en" | "fr" | "es";

const DEFAULT_QUESTIONS: Record<MetaQualificationLanguage, string[]> = {
  en: [
    "When are you hoping to make a move?",
    "What type of property or opportunity are you considering?",
    "Which city or neighbourhood are you focused on?",
  ],
  fr: [
    "Quand prévoyez-vous de concrétiser votre projet immobilier ?",
    "Quel type de propriété ou d'occasion recherchez-vous ?",
    "Quelle ville ou quel quartier vous intéresse ?",
  ],
  es: [
    "¿Cuándo espera avanzar con su proyecto inmobiliario?",
    "¿Qué tipo de propiedad u oportunidad está considerando?",
    "¿En qué ciudad o vecindario está enfocado?",
  ],
};

const REQUIRED_QUESTION_COUNT: Record<MetaQualificationDepth, number> = {
  volume_lead_form: 0,
  quality_funnel: 1,
  deep_qualification: 3,
};

export function resolveMetaInstantFormQualificationQuestions(input: {
  leadCaptureMode: MetaQualificationDepth;
  language?: MetaQualificationLanguage;
  customQuestions?: unknown;
}) {
  const language = input.language ?? "en";
  const requiredCount = REQUIRED_QUESTION_COUNT[input.leadCaptureMode];

  // Meta housing ads fail closed to DealFlow's reviewed localized templates.
  // Arbitrary onboarding/funnel questions remain available on DealFlow-hosted
  // funnels, but are never forwarded into a Meta Instant Form where a lexical
  // deny-list could be bypassed by paraphrase, encoding, or a new language.
  void input.customQuestions;
  return DEFAULT_QUESTIONS[language].slice(0, requiredCount);
}
