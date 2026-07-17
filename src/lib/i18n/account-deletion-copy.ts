import type { ProductLocale } from "@/lib/i18n/config";

type AccountDeletionCopy = {
  accountDeletion: string;
  dangerZone: string;
  deleteTitle: string;
  deleteBody: string;
  email: string;
  recentAal2: string;
  typePhrase: string;
  acknowledgement: string;
  submit: string;
  submitting: string;
  confirmationCode: string;
  openStatus: string;
  unavailableTitle: string;
  unavailableBodyBefore: string;
  unavailableBodyAfter: string;
  scheduleError: string;
  requestError: string;
  statuses: Record<"completed" | "rejected" | "review" | "progress", { label: string; detail: string }>;
};

export const ACCOUNT_DELETION_COPY: Record<ProductLocale, AccountDeletionCopy> = {
  en: {
    accountDeletion: "Account deletion", dangerZone: "Danger zone", deleteTitle: "Delete workspace and account",
    deleteBody: "This verifies the workspace owner, suspends access, stops renewal, disconnects Meta and GoHighLevel, and schedules DealFlow data for deletion or anonymization. Financial, security, backup, and legal-hold records may be retained for the policy period shown in the deletion status.",
    email: "Account email", recentAal2: "For your protection, this action requires a two-factor session verified within the last 10 minutes. Password-only confirmation is not accepted.", typePhrase: "Type", acknowledgement: "I understand that access is suspended immediately and deletion becomes irreversible once retained-data processing begins.",
    submit: "Delete workspace and account", submitting: "Verifying and scheduling…", confirmationCode: "Confirmation code", openStatus: "Open deletion status",
    unavailableTitle: "Automated deletion is unavailable", unavailableBodyBefore: "No deletion request was accepted and your workspace remains active. Contact", unavailableBodyAfter: "for a verified privacy request.",
    scheduleError: "The deletion request could not be scheduled.", requestError: "The deletion request failed.",
    statuses: {
      completed: { label: "Completed", detail: "DealFlow records the offboarding and deletion workflow as complete." },
      rejected: { label: "Rejected", detail: "The request failed identity or authority checks and was not executed." },
      review: { label: "Needs specialist review", detail: "Access remains suspended while an authorized operator reconciles a step that could not be proven complete." },
      progress: { label: "Offboarding in progress", detail: "Workspace access is being suspended and connected providers are being disconnected." },
    },
  },
  fr: {
    accountDeletion: "Suppression du compte", dangerZone: "Zone dangereuse", deleteTitle: "Supprimer l'espace de travail et le compte",
    deleteBody: "Cette action vérifie le propriétaire, suspend l'accès, arrête le renouvellement, déconnecte Meta et GoHighLevel, puis planifie la suppression ou l'anonymisation des données DealFlow. Certains dossiers financiers, de sécurité, de sauvegarde ou sous conservation légale peuvent être conservés pendant la période indiquée.",
    email: "Courriel du compte", recentAal2: "Pour votre protection, cette action exige une session à deux facteurs vérifiée au cours des 10 dernières minutes. Le mot de passe seul n’est pas accepté.", typePhrase: "Saisissez", acknowledgement: "Je comprends que l'accès est suspendu immédiatement et que la suppression devient irréversible lorsque le traitement des données conservées commence.",
    submit: "Supprimer l'espace de travail et le compte", submitting: "Vérification et planification…", confirmationCode: "Code de confirmation", openStatus: "Ouvrir l'état de suppression",
    unavailableTitle: "La suppression automatisée est indisponible", unavailableBodyBefore: "Aucune demande n'a été acceptée et votre espace demeure actif. Écrivez à", unavailableBodyAfter: "pour une demande de confidentialité vérifiée.",
    scheduleError: "La demande de suppression n'a pas pu être planifiée.", requestError: "La demande de suppression a échoué.",
    statuses: {
      completed: { label: "Terminée", detail: "DealFlow indique que le retrait des fournisseurs et la suppression sont terminés." },
      rejected: { label: "Rejetée", detail: "La vérification d'identité ou d'autorité a échoué et la demande n'a pas été exécutée." },
      review: { label: "Examen spécialisé requis", detail: "L'accès demeure suspendu pendant qu'un opérateur autorisé rapproche une étape non prouvée." },
      progress: { label: "Retrait en cours", detail: "L'accès à l'espace est suspendu et les fournisseurs connectés sont déconnectés." },
    },
  },
  es: {
    accountDeletion: "Eliminación de la cuenta", dangerZone: "Zona de peligro", deleteTitle: "Eliminar espacio de trabajo y cuenta",
    deleteBody: "Esta acción verifica al propietario, suspende el acceso, detiene la renovación, desconecta Meta y GoHighLevel, y programa la eliminación o anonimización de datos de DealFlow. Algunos registros financieros, de seguridad, respaldo o retención legal pueden conservarse durante el período indicado.",
    email: "Correo de la cuenta", recentAal2: "Para tu protección, esta acción requiere una sesión de dos factores verificada en los últimos 10 minutos. No se acepta solo la contraseña.", typePhrase: "Escribe", acknowledgement: "Entiendo que el acceso se suspende de inmediato y que la eliminación se vuelve irreversible cuando comienza el tratamiento de los datos retenidos.",
    submit: "Eliminar espacio de trabajo y cuenta", submitting: "Verificando y programando…", confirmationCode: "Código de confirmación", openStatus: "Abrir estado de eliminación",
    unavailableTitle: "La eliminación automática no está disponible", unavailableBodyBefore: "No se aceptó ninguna solicitud y tu espacio sigue activo. Contacta con", unavailableBodyAfter: "para una solicitud de privacidad verificada.",
    scheduleError: "No se pudo programar la solicitud de eliminación.", requestError: "La solicitud de eliminación falló.",
    statuses: {
      completed: { label: "Completada", detail: "DealFlow registra como completados la desconexión y el flujo de eliminación." },
      rejected: { label: "Rechazada", detail: "La verificación de identidad o autoridad falló y la solicitud no se ejecutó." },
      review: { label: "Requiere revisión especializada", detail: "El acceso sigue suspendido mientras un operador autorizado concilia un paso no comprobado." },
      progress: { label: "Desconexión en curso", detail: "El acceso al espacio se está suspendiendo y los proveedores conectados se están desconectando." },
    },
  },
};

export function getLocalizedAccountDeletionStatus(
  locale: ProductLocale,
  state: string,
) {
  const statuses = ACCOUNT_DELETION_COPY[locale].statuses;
  if (state === "completed") return statuses.completed;
  if (state === "rejected") return statuses.rejected;
  if (state === "operator_required" || state === "legal_hold") return statuses.review;
  return statuses.progress;
}
