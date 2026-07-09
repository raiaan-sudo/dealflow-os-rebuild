import type { WinningFunnelLanguage } from "@/lib/funnels/winning-template/schema";

type WinningFunnelLanguageCopy = {
  freeNoObligation: string;
  trustFree: string;
  trustNoObligation: string;
  trustAdvisor: string;
  quizIntro: string;
  motivationBuyer: string;
  motivationSeller: string;
  motivationInvestor: string;
  motivationCommercial: string;
  budget: string;
  timeline: string;
  contact: string;
  footerCompliance: string;
  thankYouHeadline: string;
  thankYouBody: string;
  agentSectionEyebrow: string;
  proofSectionEyebrow: string;
  defaultAdvisorName: string;
};

const COPY: Record<WinningFunnelLanguage, WinningFunnelLanguageCopy> = {
  en: {
    freeNoObligation: "Personalized plan - clear next step",
    trustFree: "Personalized plan",
    trustNoObligation: "Clear next steps",
    trustAdvisor: "Local market guidance",
    quizIntro: "Answer a few questions and get the next step matched to your situation.",
    motivationBuyer: "What is driving your home search?",
    motivationSeller: "What is driving your sale decision?",
    motivationInvestor: "What kind of opportunity are you looking for?",
    motivationCommercial: "What kind of commercial move are you planning?",
    budget: "What price range should we use?",
    timeline: "When are you hoping to move?",
    contact: "Where should we send the details?",
    footerCompliance: "Information is for planning only. Availability, pricing, and next steps must be verified locally. Equal housing opportunity.",
    thankYouHeadline: "Your request was received.",
    thankYouBody: "Watch your phone and email for the next step from the local team.",
    agentSectionEyebrow: "Meet your advisor",
    proofSectionEyebrow: "Real results from real clients",
    defaultAdvisorName: "Your local advisor",
  },
  fr: {
    freeNoObligation: "Plan personnalisé - prochaine étape claire",
    trustFree: "Plan personnalisé",
    trustNoObligation: "Prochaines étapes claires",
    trustAdvisor: "Conseils du marché local",
    quizIntro: "Répondez à quelques questions et recevez la prochaine étape adaptée à votre situation.",
    motivationBuyer: "Qu'est-ce qui motive votre recherche de propriété?",
    motivationSeller: "Qu'est-ce qui motive votre décision de vendre?",
    motivationInvestor: "Quel type d'occasion recherchez-vous?",
    motivationCommercial: "Quel type de projet commercial planifiez-vous?",
    budget: "Quelle fourchette de prix devrions-nous utiliser?",
    timeline: "Quand souhaitez-vous passer à l'action?",
    contact: "Où devrions-nous envoyer les détails?",
    footerCompliance: "Les renseignements sont fournis à titre de planification seulement. La disponibilité, les prix et les prochaines étapes doivent être vérifiés localement. Égalité d'accès au logement.",
    thankYouHeadline: "Votre demande a été reçue.",
    thankYouBody: "Surveillez votre téléphone et votre courriel pour la prochaine étape de l'équipe locale.",
    agentSectionEyebrow: "Rencontrez votre conseiller",
    proofSectionEyebrow: "Résultats réels de vrais clients",
    defaultAdvisorName: "Votre conseiller local",
  },
  es: {
    freeNoObligation: "Plan personalizado - siguiente paso claro",
    trustFree: "Plan personalizado",
    trustNoObligation: "Siguientes pasos claros",
    trustAdvisor: "Orientacion del mercado local",
    quizIntro: "Responda unas preguntas y reciba el siguiente paso segun su situacion.",
    motivationBuyer: "Que esta impulsando su busqueda de vivienda?",
    motivationSeller: "Que esta impulsando su decision de vender?",
    motivationInvestor: "Que tipo de oportunidad esta buscando?",
    motivationCommercial: "Que tipo de movimiento comercial esta planeando?",
    budget: "Que rango de precio debemos usar?",
    timeline: "Cuando espera avanzar?",
    contact: "Donde debemos enviar los detalles?",
    footerCompliance: "La informacion es solo para planificacion. Disponibilidad, precios y proximos pasos deben verificarse localmente. Igualdad de oportunidad de vivienda.",
    thankYouHeadline: "Recibimos su solicitud.",
    thankYouBody: "Este pendiente de su telefono y correo para el siguiente paso del equipo local.",
    agentSectionEyebrow: "Conozca a su asesor",
    proofSectionEyebrow: "Resultados reales de clientes reales",
    defaultAdvisorName: "Su asesor local",
  },
};

export function normalizeWinningFunnelLanguage(value: unknown): WinningFunnelLanguage {
  return value === "fr" || value === "es" || value === "en" ? value : "en";
}

export function getWinningFunnelLanguageCopy(language: WinningFunnelLanguage) {
  return COPY[language];
}
