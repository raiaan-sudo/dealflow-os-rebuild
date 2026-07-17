import type { ProductLocale } from "@/lib/i18n/config";

export const PRIVACY_REQUEST_COPY: Record<ProductLocale, Readonly<{
  eyebrow: string; title: string; body: string; unavailable: string;
  recentAal2: string; requestType: string; access: string; correction: string;
  export: string; correctionDetails: string; correctionPlaceholder: string;
  submit: string; submitting: string; requestFailed: string; requestAccepted: string;
  history: string; states: Record<string, string>;
}>> = {
  en: {
    eyebrow: "Privacy requests", title: "Access, correct, or export your DealFlow data",
    body: "Requests are tenant-scoped, recorded without raw request content, and tracked with immutable evidence receipts.",
    unavailable: "Automated privacy requests are unavailable until verified owner authority includes a signed per-relation privacy classification and executor for the exact current data catalog. No request will be implied or accepted.",
    recentAal2: "A workspace owner with a two-factor session verified within the last 10 minutes is required.",
    requestType: "Request type", access: "Access summary", correction: "Correction", export: "Private export",
    correctionDetails: "What should be corrected?", correctionPlaceholder: "Describe the record and correction. The text is hashed before the request ledger is written.",
    submit: "Submit privacy request", submitting: "Recording…", requestFailed: "The privacy request could not be recorded.",
    requestAccepted: "Request recorded", history: "Recent requests",
    states: { accepted: "Accepted", in_progress: "In progress", completed: "Completed", rejected: "Rejected", expired: "Expired" },
  },
  fr: {
    eyebrow: "Demandes de confidentialité", title: "Accéder, corriger ou exporter vos données DealFlow",
    body: "Les demandes sont limitées au locataire, enregistrées sans contenu brut et suivies par des reçus de preuve immuables.",
    unavailable: "Les demandes automatisées sont indisponibles tant que l’autorité vérifiée ne couvre pas, par une classification signée et un exécuteur, chaque relation du catalogue de données actuel. Aucune demande ne sera supposée ou acceptée.",
    recentAal2: "Le propriétaire doit utiliser une session à deux facteurs vérifiée au cours des 10 dernières minutes.",
    requestType: "Type de demande", access: "Résumé d’accès", correction: "Correction", export: "Exportation privée",
    correctionDetails: "Que faut-il corriger?", correctionPlaceholder: "Décrivez le dossier et la correction. Le texte est haché avant l’écriture du registre.",
    submit: "Envoyer la demande", submitting: "Enregistrement…", requestFailed: "La demande n’a pas pu être enregistrée.",
    requestAccepted: "Demande enregistrée", history: "Demandes récentes",
    states: { accepted: "Acceptée", in_progress: "En cours", completed: "Terminée", rejected: "Rejetée", expired: "Expirée" },
  },
  es: {
    eyebrow: "Solicitudes de privacidad", title: "Accede, corrige o exporta tus datos de DealFlow",
    body: "Las solicitudes están limitadas al inquilino, se registran sin contenido sin procesar y usan recibos de evidencia inmutables.",
    unavailable: "Las solicitudes automatizadas no están disponibles hasta que la autoridad verificada incluya una clasificación firmada y un ejecutor para cada relación del catálogo de datos actual. No se inferirá ni aceptará ninguna solicitud.",
    recentAal2: "Se requiere el propietario y una sesión de dos factores verificada en los últimos 10 minutos.",
    requestType: "Tipo de solicitud", access: "Resumen de acceso", correction: "Corrección", export: "Exportación privada",
    correctionDetails: "¿Qué se debe corregir?", correctionPlaceholder: "Describe el registro y la corrección. El texto se cifra en hash antes de escribir el registro.",
    submit: "Enviar solicitud", submitting: "Registrando…", requestFailed: "No se pudo registrar la solicitud.",
    requestAccepted: "Solicitud registrada", history: "Solicitudes recientes",
    states: { accepted: "Aceptada", in_progress: "En curso", completed: "Completada", rejected: "Rechazada", expired: "Expirada" },
  },
};
