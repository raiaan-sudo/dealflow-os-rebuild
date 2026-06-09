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
};

const COPY: Record<WinningFunnelLanguage, WinningFunnelLanguageCopy> = {
  en: {
    freeNoObligation: "Free - no obligation",
    trustFree: "100% free",
    trustNoObligation: "No obligation",
    trustAdvisor: "Local real estate advisor",
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
  },
  fr: {
    freeNoObligation: "Gratuit - sans obligation",
    trustFree: "100 % gratuit",
    trustNoObligation: "Sans obligation",
    trustAdvisor: "Conseiller immobilier local",
    quizIntro: "Repondez a quelques questions et recevez la prochaine etape adaptee a votre situation.",
    motivationBuyer: "Qu'est-ce qui motive votre recherche de propriete?",
    motivationSeller: "Qu'est-ce qui motive votre decision de vendre?",
    motivationInvestor: "Quel type d'occasion recherchez-vous?",
    motivationCommercial: "Quel type de projet commercial planifiez-vous?",
    budget: "Quelle fourchette de prix devrions-nous utiliser?",
    timeline: "Quand souhaitez-vous passer a l'action?",
    contact: "Ou devrions-nous envoyer les details?",
    footerCompliance: "Les renseignements sont fournis a titre de planification seulement. La disponibilite, les prix et les prochaines etapes doivent etre verifies localement. Egalite d'acces au logement.",
    thankYouHeadline: "Votre demande a ete recue.",
    thankYouBody: "Surveillez votre telephone et votre courriel pour la prochaine etape de l'equipe locale.",
    agentSectionEyebrow: "Rencontrez votre conseiller",
    proofSectionEyebrow: "Resultats reels de vrais clients",
  },
  es: {
    freeNoObligation: "Gratis - sin obligacion",
    trustFree: "100% gratis",
    trustNoObligation: "Sin obligacion",
    trustAdvisor: "Asesor inmobiliario local",
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
  },
};

export function normalizeWinningFunnelLanguage(value: unknown): WinningFunnelLanguage {
  return value === "fr" || value === "es" || value === "en" ? value : "en";
}

export function getWinningFunnelLanguageCopy(language: WinningFunnelLanguage) {
  return COPY[language];
}
