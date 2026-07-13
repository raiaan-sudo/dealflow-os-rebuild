import type { FullCampaignRecord } from "@/lib/types/campaign-records";
import {
  getWinningFunnelLanguageCopy,
  normalizeWinningFunnelLanguage,
} from "@/lib/funnels/winning-template/language";
import type { WinningFunnelLanguage } from "@/lib/funnels/winning-template/schema";

export type PublicFunnelLanguage = WinningFunnelLanguage;

type PublicFunnelPageCopy = {
  metadataFallbackTitle: string;
  metadataFallbackDescription: string;
  defaultCta: string;
  receivedDetailsPrefix: string;
  nextStepLabel: string;
  watchForUsLabel: string;
  watchForUsBody: string;
  privacyLabel: string;
  privacyBody: string;
  bookCallLabel: string;
  returnToRequestLabel: string;
  returnToPageLabel: string;
  defaultBusinessName: string;
  defaultOfferContext: string;
  followUpExpectations: Record<string, string>;
};

const PUBLIC_FUNNEL_PAGE_COPY: Record<PublicFunnelLanguage, PublicFunnelPageCopy> = {
  en: {
    metadataFallbackTitle: "Real estate options",
    metadataFallbackDescription: "Request personalized real estate options and a clear next step.",
    defaultCta: "Submit",
    receivedDetailsPrefix: "We received your details for",
    nextStepLabel: "Next step",
    watchForUsLabel: "Watch for us",
    watchForUsBody:
      "Keep an eye on your phone and email. If you opted into texts, replies can include follow-up coordination about this request.",
    privacyLabel: "Privacy",
    privacyBody:
      "Your details are used for this inquiry and follow-up. Consent is not a condition of purchase.",
    bookCallLabel: "Book a quick call",
    returnToRequestLabel: "Back to listing request",
    returnToPageLabel: "Return to page",
    defaultBusinessName: "the team",
    defaultOfferContext: "your request",
    followUpExpectations: {
      redirect_to_calendar:
        "Book a quick call if you want faster help, or watch for our follow-up with the strongest next steps.",
      send_to_follow_up_sequence:
        "We will review your criteria and follow up with the strongest next steps.",
      show_thank_you_page:
        "We will review your request and follow up shortly with the clearest next step.",
      show_thank_you_page_call_5_15_minutes:
        "We will review your criteria and follow up shortly with the strongest next steps.",
    },
  },
  fr: {
    metadataFallbackTitle: "Options immobilières",
    metadataFallbackDescription:
      "Demandez des options immobilières personnalisées et une prochaine étape claire.",
    defaultCta: "Envoyer",
    receivedDetailsPrefix: "Nous avons reçu vos renseignements concernant",
    nextStepLabel: "Prochaine étape",
    watchForUsLabel: "Surveillez nos messages",
    watchForUsBody:
      "Surveillez votre téléphone et votre courriel. Si vous avez accepté les SMS, les réponses peuvent servir à coordonner le suivi de cette demande.",
    privacyLabel: "Confidentialité",
    privacyBody:
      "Vos renseignements servent à traiter cette demande et son suivi. Le consentement n'est pas une condition d'achat.",
    bookCallLabel: "Réserver un bref appel",
    returnToRequestLabel: "Retour à la demande immobilière",
    returnToPageLabel: "Retour à la page",
    defaultBusinessName: "l'équipe",
    defaultOfferContext: "votre demande",
    followUpExpectations: {
      redirect_to_calendar:
        "Réservez un bref appel pour obtenir de l'aide plus rapidement, ou surveillez notre suivi avec les meilleures prochaines étapes.",
      send_to_follow_up_sequence:
        "Nous examinerons vos critères et communiquerons avec vous pour vous présenter les meilleures prochaines étapes.",
      show_thank_you_page:
        "Nous examinerons votre demande et communiquerons bientôt avec vous pour vous présenter la prochaine étape la plus claire.",
      show_thank_you_page_call_5_15_minutes:
        "Nous examinerons vos critères et communiquerons bientôt avec vous pour vous présenter les meilleures prochaines étapes.",
    },
  },
  es: {
    metadataFallbackTitle: "Opciones inmobiliarias",
    metadataFallbackDescription:
      "Solicite opciones inmobiliarias personalizadas y un siguiente paso claro.",
    defaultCta: "Enviar",
    receivedDetailsPrefix: "Recibimos sus datos para",
    nextStepLabel: "Siguiente paso",
    watchForUsLabel: "Esté atento a nuestros mensajes",
    watchForUsBody:
      "Revise su teléfono y correo electrónico. Si aceptó recibir mensajes de texto, las respuestas pueden incluir la coordinación del seguimiento de esta solicitud.",
    privacyLabel: "Privacidad",
    privacyBody:
      "Sus datos se usan para esta consulta y su seguimiento. El consentimiento no es una condición de compra.",
    bookCallLabel: "Reservar una llamada breve",
    returnToRequestLabel: "Volver a la solicitud inmobiliaria",
    returnToPageLabel: "Volver a la página",
    defaultBusinessName: "el equipo",
    defaultOfferContext: "su solicitud",
    followUpExpectations: {
      redirect_to_calendar:
        "Reserve una llamada breve si desea ayuda más rápida, o esté atento a nuestro seguimiento con los mejores próximos pasos.",
      send_to_follow_up_sequence:
        "Revisaremos sus criterios y nos comunicaremos con usted para explicarle los mejores próximos pasos.",
      show_thank_you_page:
        "Revisaremos su solicitud y nos comunicaremos pronto con usted para explicarle el siguiente paso más claro.",
      show_thank_you_page_call_5_15_minutes:
        "Revisaremos sus criterios y nos comunicaremos pronto con usted para explicarle los mejores próximos pasos.",
    },
  },
};

export function normalizePublicFunnelLanguage(value: unknown): PublicFunnelLanguage {
  return normalizeWinningFunnelLanguage(value);
}

export function getPublicFunnelLanguage(record: FullCampaignRecord): PublicFunnelLanguage {
  // `plan.language` is the typed, persisted campaign authority. Generated
  // funnel sections inherit it, while older funnel payloads are not guaranteed
  // to carry a top-level language property.
  return normalizePublicFunnelLanguage(record.plan.language);
}

export function getPublicFunnelPageCopy(language: PublicFunnelLanguage) {
  return PUBLIC_FUNNEL_PAGE_COPY[language];
}

export function getPublicFunnelThankYouHeadline(language: PublicFunnelLanguage) {
  return getWinningFunnelLanguageCopy(language).thankYouHeadline;
}

export function getPublicFunnelThankYouExpectation(
  language: PublicFunnelLanguage,
  value: unknown,
) {
  const copy = getPublicFunnelPageCopy(language);
  const raw = typeof value === "string" && value.trim() ? value.trim() : null;

  if (!raw) {
    return copy.followUpExpectations.send_to_follow_up_sequence;
  }

  return copy.followUpExpectations[raw.toLowerCase()] ?? raw;
}

export function getPublicFunnelOpenGraphLocale(language: PublicFunnelLanguage) {
  return language === "fr" ? "fr_CA" : language === "es" ? "es_ES" : "en_CA";
}

export function normalizePublicMetadataText(
  value: unknown,
  fallback: string,
  maximumLength: number,
) {
  const normalized =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  const selected = normalized || fallback;

  if (selected.length <= maximumLength) {
    return selected;
  }

  return `${selected.slice(0, Math.max(1, maximumLength - 1)).trimEnd()}…`;
}
