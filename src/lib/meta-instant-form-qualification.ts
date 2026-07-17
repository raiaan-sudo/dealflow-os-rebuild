export type MetaQualificationDepth =
  | "volume_lead_form"
  | "quality_funnel"
  | "deep_qualification";

export type MetaQualificationLanguage = "en" | "fr" | "es";

export const REALTOR_QUALIFICATION_CATALOG_VERSION = "2026-07-16.1" as const;

const DEFAULT_QUESTIONS: Record<MetaQualificationLanguage, string[]> = {
  en: [
    "When are you hoping to move?",
    "What is your ideal property type?",
    "What city or neighbourhood are you focused on?",
  ],
  fr: [
    "Quand souhaitez-vous déménager?",
    "Quel type de propriété recherchez-vous?",
    "Quelle ville ou quel quartier ciblez-vous?",
  ],
  es: [
    "¿Cuándo esperas mudarte?",
    "¿Cuál es tu tipo de propiedad ideal?",
    "¿En qué ciudad o vecindario te enfocas?",
  ],
};

const REQUIRED_QUESTION_COUNT: Record<MetaQualificationDepth, number> = {
  volume_lead_form: 0,
  quality_funnel: 1,
  deep_qualification: 3,
};

const FIXED_CATALOG: Record<MetaQualificationLanguage, string[]> = {
  en: [
    "What price range are you targeting?",
    "When are you hoping to move?",
    "Are you already pre-approved?",
    "What city or neighbourhood are you focused on?",
    "Do you have a property to sell first?",
    "What is your ideal property type?",
  ],
  fr: [
    "Quelle fourchette de prix visez-vous?",
    "Quand souhaitez-vous déménager?",
    "Avez-vous déjà une préapprobation?",
    "Quelle ville ou quel quartier ciblez-vous?",
    "Devez-vous d'abord vendre une propriété?",
    "Quel type de propriété recherchez-vous?",
  ],
  es: [
    "¿Qué rango de precio buscas?",
    "¿Cuándo esperas mudarte?",
    "¿Ya tienes una preaprobación?",
    "¿En qué ciudad o vecindario te enfocas?",
    "¿Primero debes vender una propiedad?",
    "¿Cuál es tu tipo de propiedad ideal?",
  ],
};

export function isApprovedRealtorQualificationQuestion(
  question: unknown,
  language: MetaQualificationLanguage,
) {
  return typeof question === "string" && FIXED_CATALOG[language].includes(question.trim());
}

export function hasOnlyApprovedRealtorQualificationQuestions(input: {
  language: MetaQualificationLanguage;
  questions: unknown;
}) {
  return (
    Array.isArray(input.questions) &&
    input.questions.length <= 3 &&
    input.questions.every((question) =>
      isApprovedRealtorQualificationQuestion(question, input.language),
    )
  );
}

export function resolveMetaInstantFormQualificationQuestions(input: {
  leadCaptureMode: MetaQualificationDepth;
  language?: MetaQualificationLanguage;
  customQuestions?: unknown;
}) {
  const language = input.language ?? "en";
  const requiredCount = REQUIRED_QUESTION_COUNT[input.leadCaptureMode];

  // Housing campaigns fail closed to DealFlow's reviewed localized templates.
  // Arbitrary onboarding/funnel questions are never forwarded into a Meta Instant Form
  // or a new GHL funnel where a lexical deny-list could be
  // bypassed by paraphrase, encoding, or a new language.
  const preferred = Array.isArray(input.customQuestions)
    ? input.customQuestions.filter((question): question is string =>
        isApprovedRealtorQualificationQuestion(question, language),
      )
    : [];
  const fixedDefaults = DEFAULT_QUESTIONS[language];
  return [...new Set([...preferred, ...fixedDefaults])].slice(0, requiredCount);
}
