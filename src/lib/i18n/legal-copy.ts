import type { ProductLocale } from "@/lib/i18n/config";

export type LegalSection = {
  title: string;
  paragraphs: string[];
};

export type LegalDocumentCopy = {
  title: string;
  description: string;
  skip: string;
  updated: string;
  sections: LegalSection[];
};

export type DeletionPageCopy = LegalDocumentCopy & {
  statusTitle: string;
  confirmationCode: string;
  scheduledDeletionDate: string;
  unavailable: string;
  noMatch: string;
  emailSubject: string;
  statuses: Record<"operator_required" | "in_progress" | "completed" | "rejected", {
    label: string;
    detail: string;
  }>;
};

type LegalCopy = {
  privacy: LegalDocumentCopy;
  terms: LegalDocumentCopy;
  deletion: DeletionPageCopy;
};

const en: LegalCopy = {
  privacy: {
    title: "Privacy Policy",
    description: "How DealFlow OS collects, uses, protects, and deletes personal information.",
    skip: "Skip to privacy policy",
    updated: "Last updated: July 13, 2026",
    sections: [
      { title: "1. Overview", paragraphs: ["DealFlow OS helps real estate professionals create campaign funnels, capture leads, connect advertising accounts, and review campaign performance. This policy explains what information we collect, how we use it, and the choices available to users and visitors."] },
      { title: "2. Information We Collect", paragraphs: ["We may collect account information such as name, email address, workspace details, onboarding answers, campaign settings, selected creative assets, public funnel submissions, billing status, and integration metadata needed to operate the product.", "When a visitor submits a lead form, we collect the information they choose to provide, such as name, email address, phone number, message, and related campaign context.", "If a visitor provides a phone number and accepts SMS consent, we store the consent text shown, consent source, phone number, and timestamp so opt-in proof can be audited. We also retain opt-out timestamps and the message records needed to honor STOP, START, and HELP requests."] },
      { title: "3. Connected Services", paragraphs: ["If you connect services such as Meta, Stripe, or GoHighLevel, we store only the access details and account metadata needed to provide the authorized functionality. Access tokens are protected and used only for actions you initiate or authorize."] },
      { title: "4. How We Use Information", paragraphs: ["We use information to create and manage campaigns, generate previews and creative drafts, process lead submissions, prevent duplicates, maintain subscription access, synchronize campaign state, troubleshoot errors, improve reliability, and provide support. Messaging information is used only to answer the submitted request, preserve consent evidence, and honor opt-out choices."] },
      { title: "5. Sharing and Disclosure", paragraphs: ["We do not sell personal information. We may share information with service providers that operate DealFlow OS, including hosting, database, authentication, payment, analytics, AI generation, messaging, CRM, and advertising providers. We may also disclose information when required by law, to protect users, or to prevent abuse.", "We do not sell or share SMS consent data, phone numbers, or opt-in records for another party's independent marketing."] },
      { title: "6. Data Retention", paragraphs: ["We retain account, campaign, billing, integration, and lead information only as long as needed to provide the service, meet legal obligations, resolve disputes, protect security, and maintain required operational records. Deletion requests remain subject to documented legal, security, backup, and financial retention requirements."] },
      { title: "7. Security", paragraphs: ["We use reasonable administrative, technical, and organizational safeguards. No online service can guarantee absolute security, but we restrict access, protect sensitive credentials, and monitor reliability and security events."] },
      { title: "8. Your Choices", paragraphs: ["You may request access, correction, export, or deletion of your account and workspace information. You may disconnect supported integrations and stop using public lead forms or campaign pages.", "SMS recipients can reply STOP to opt out, START to resume messages, or HELP for help. Message and data rates may apply. Opt-out records may be retained to prevent future unauthorized messaging."] },
      { title: "9. Contact", paragraphs: ["For privacy questions or data requests, contact support@agentdealflow.io. Do not send passwords, access tokens, or provider secrets."] },
    ],
  },
  terms: {
    title: "Terms of Service",
    description: "The rules for accessing and using DealFlow OS.",
    skip: "Skip to terms of service",
    updated: "Last updated: July 13, 2026",
    sections: [
      { title: "Use of the Service", paragraphs: ["These terms govern access to DealFlow OS, including campaign creation, lead capture, advertising workflow tools, billing, and third-party integrations.", "You are responsible for the accuracy of campaign content, offers, targeting inputs, advertising claims, consent language, and follow-up practices in your workspace. You may not use the service for unlawful, deceptive, discriminatory, or abusive activity."] },
      { title: "Advertising and Integrations", paragraphs: ["DealFlow OS can prepare and launch advertising workflows through connected providers such as Meta. You remain responsible for each provider's terms, advertising policies, special-ad-category rules, billing requirements, and account permissions."] },
      { title: "Billing", paragraphs: ["Paid access is processed through Stripe. Subscriptions renew automatically unless cancelled before the next billing period. Cancellation stops future renewals but does not automatically refund prior charges.", "Refunds are reviewed case by case unless required by law. Advertising spend, messaging fees, AI generation costs, taxes, payment-processor fees, and other third-party costs already incurred may be non-refundable. Failed payments may suspend paid features."] },
      { title: "Third-Party Providers", paragraphs: ["DealFlow OS may connect to Stripe, Meta, Supabase, Vercel, Twilio, OpenAI, GoHighLevel, and other providers. DealFlow OS does not control provider availability, approval decisions, policy enforcement, or third-party billing systems."] },
      { title: "Lead Capture and Messaging", paragraphs: ["If you collect leads or send messages through DealFlow OS, you are responsible for obtaining required consent, honoring opt-outs, and following applicable privacy, telemarketing, SMS, email, and advertising laws.", "SMS may be used only for people who gave valid consent through an approved form or equivalent compliant process. Recipients can reply STOP to opt out, START to resume, or HELP for help."] },
      { title: "No Guaranteed Results", paragraphs: ["DealFlow OS provides software, automation, analytics, and workflow support. We do not guarantee advertising approval, lead volume, appointment volume, revenue, or business outcomes. Provider-dependent features may be limited or unavailable while permissions, compliance, or infrastructure are being verified."] },
      { title: "Contact", paragraphs: ["For terms, privacy, or compliance questions, contact support@agentdealflow.io through your workspace support channel. Do not send passwords, access tokens, or provider secrets."] },
    ],
  },
  deletion: {
    title: "Data Deletion Instructions",
    description: "How to request deletion of DealFlow OS account, workspace, integration, and lead data.",
    skip: "Skip to data deletion instructions",
    updated: "Last updated: July 13, 2026",
    statusTitle: "Deletion request status",
    confirmationCode: "Confirmation code",
    scheduledDeletionDate: "Scheduled deletion date",
    unavailable: "Request status is temporarily unavailable. No completion is inferred.",
    noMatch: "No request matches this confirmation code. Check the exact code returned when the request was accepted.",
    emailSubject: "Data Deletion Request",
    statuses: {
      operator_required: { label: "Received — operator review required", detail: "The signed request is recorded. No deletion or anonymization is represented as complete." },
      in_progress: { label: "In progress", detail: "An authorized operator is reconciling the request. Completion is not yet represented." },
      completed: { label: "Completed", detail: "The request ledger records completion by the authorized privacy workflow." },
      rejected: { label: "Rejected", detail: "The request could not be completed. Contact support with the confirmation code for review." },
    },
    sections: [
      { title: "How to Request Deletion", paragraphs: ["Request deletion from the Danger Zone in DealFlow settings. If the automated workflow is unavailable, email support@agentdealflow.io with the subject Data Deletion Request and include the account email, workspace name if known, and a short description of the data concerned."] },
      { title: "What Happens Next", paragraphs: ["We verify that you are authorized, suspend access after an accepted account request, stop renewal, disconnect supported providers, and schedule DealFlow data for deletion or anonymization. Every destructive step must produce a durable receipt; a request is never represented as complete without that evidence.", "Some records may be retained for billing, fraud prevention, security, legal obligations, backups, dispute resolution, or operational recovery."] },
      { title: "Connected Providers", paragraphs: ["Connected providers may hold information independently. We may retain limited operational evidence or direct you to provider-specific controls for information controlled by Meta, Stripe, Twilio, Supabase, Vercel, OpenAI, GoHighLevel, or another provider."] },
      { title: "Questions", paragraphs: ["For privacy, export, correction, or deletion questions, contact support@agentdealflow.io. Do not send passwords, access tokens, or provider secrets."] },
    ],
  },
};

const fr: LegalCopy = {
  privacy: {
    title: "Politique de confidentialité", description: "Comment DealFlow OS recueille, utilise, protège et supprime les renseignements personnels.", skip: "Aller à la politique de confidentialité", updated: "Dernière mise à jour : 13 juillet 2026",
    sections: [
      { title: "1. Aperçu", paragraphs: ["DealFlow OS aide les professionnels de l'immobilier à créer des entonnoirs de campagne, capter des prospects, connecter des comptes publicitaires et examiner le rendement. Cette politique explique les renseignements recueillis, leur utilisation et les choix offerts."] },
      { title: "2. Renseignements recueillis", paragraphs: ["Nous pouvons recueillir le nom, l'adresse courriel, les détails de l'espace de travail, les réponses d'accueil, les réglages de campagne, les créations choisies, les soumissions publiques, l'état de facturation et les métadonnées d'intégration nécessaires.", "Lorsqu'une personne soumet un formulaire, nous recueillons les renseignements qu'elle fournit, comme son nom, son courriel, son téléphone, son message et le contexte de campagne.", "Lorsqu'une personne accepte les communications par SMS, nous conservons le texte de consentement affiché, sa source, le numéro et l'horodatage, ainsi que les éléments nécessaires pour respecter STOP, START et HELP."] },
      { title: "3. Services connectés", paragraphs: ["Si vous connectez Meta, Stripe, GoHighLevel ou un autre service, nous conservons seulement les accès et métadonnées nécessaires aux fonctions autorisées. Les jetons sont protégés et utilisés uniquement pour les actions que vous lancez ou autorisez."] },
      { title: "4. Utilisation des renseignements", paragraphs: ["Nous utilisons les renseignements pour gérer les campagnes, produire des aperçus et brouillons, traiter les prospects, éviter les doublons, maintenir l'abonnement, synchroniser l'état, corriger les erreurs, améliorer la fiabilité et offrir du soutien. Les données de messagerie servent uniquement à répondre, prouver le consentement et respecter les retraits."] },
      { title: "5. Partage et divulgation", paragraphs: ["Nous ne vendons pas les renseignements personnels. Nous pouvons les transmettre aux fournisseurs qui exploitent DealFlow OS, notamment pour l'hébergement, la base de données, l'authentification, le paiement, l'analytique, l'IA, la messagerie, le CRM et la publicité, ou lorsque la loi, la protection des utilisateurs ou la prévention des abus l'exige.", "Nous ne vendons ni ne partageons les consentements SMS, les numéros ou les preuves d'adhésion pour le marketing indépendant d'un tiers."] },
      { title: "6. Conservation", paragraphs: ["Nous conservons les données de compte, campagne, facturation, intégration et prospect seulement pendant la durée nécessaire au service, aux obligations légales, aux différends, à la sécurité et aux dossiers opérationnels requis. Les demandes de suppression demeurent assujetties aux obligations documentées de conservation juridique, financière, de sécurité et de sauvegarde."] },
      { title: "7. Sécurité", paragraphs: ["Nous appliquons des mesures administratives, techniques et organisationnelles raisonnables. Aucun service en ligne ne peut garantir une sécurité absolue, mais nous limitons les accès, protégeons les identifiants sensibles et surveillons les incidents."] },
      { title: "8. Vos choix", paragraphs: ["Vous pouvez demander l'accès, la correction, l'exportation ou la suppression des renseignements de votre compte et de votre espace de travail, déconnecter les intégrations prises en charge et cesser d'utiliser les formulaires publics.", "Les destinataires de SMS peuvent répondre STOP pour se retirer, START pour reprendre ou HELP pour obtenir de l'aide. Des frais de messagerie et de données peuvent s'appliquer."] },
      { title: "9. Nous joindre", paragraphs: ["Pour toute question de confidentialité ou demande de données, écrivez à support@agentdealflow.io. N'envoyez aucun mot de passe, jeton d'accès ou secret de fournisseur."] },
    ],
  },
  terms: {
    title: "Conditions d'utilisation", description: "Les règles d'accès et d'utilisation de DealFlow OS.", skip: "Aller aux conditions d'utilisation", updated: "Dernière mise à jour : 13 juillet 2026",
    sections: [
      { title: "Utilisation du service", paragraphs: ["Ces conditions régissent l'accès à DealFlow OS, notamment la création de campagnes, la capture de prospects, les outils publicitaires, la facturation et les intégrations.", "Vous êtes responsable de l'exactitude du contenu, des offres, du ciblage, des affirmations publicitaires, du consentement et des suivis. Toute activité illégale, trompeuse, discriminatoire ou abusive est interdite."] },
      { title: "Publicité et intégrations", paragraphs: ["DealFlow OS peut préparer et lancer des flux publicitaires auprès de fournisseurs comme Meta. Vous demeurez responsable de leurs conditions, politiques publicitaires, règles de catégories spéciales, exigences de facturation et autorisations."] },
      { title: "Facturation", paragraphs: ["L'accès payant est traité par Stripe. Les abonnements se renouvellent automatiquement sauf annulation avant la prochaine période. L'annulation met fin aux renouvellements futurs, sans rembourser automatiquement les frais antérieurs.", "Les remboursements sont évalués au cas par cas sauf exigence légale. Les dépenses publicitaires, frais de messagerie, coûts d'IA, taxes et frais de tiers déjà engagés peuvent être non remboursables. Un paiement échoué peut suspendre les fonctions payantes."] },
      { title: "Fournisseurs tiers", paragraphs: ["DealFlow OS peut se connecter à Stripe, Meta, Supabase, Vercel, Twilio, OpenAI, GoHighLevel et d'autres fournisseurs. DealFlow OS ne contrôle pas leur disponibilité, leurs approbations, leurs politiques ni leur facturation."] },
      { title: "Prospects et messagerie", paragraphs: ["Si vous recueillez des prospects ou envoyez des messages, vous devez obtenir les consentements requis, respecter les retraits et suivre les lois applicables en matière de confidentialité, télémarketing, SMS, courriel et publicité.", "Les SMS peuvent viser seulement les personnes ayant donné un consentement valide. Elles peuvent répondre STOP pour se retirer, START pour reprendre ou HELP pour obtenir de l'aide."] },
      { title: "Aucun résultat garanti", paragraphs: ["DealFlow OS fournit des logiciels, de l'automatisation, de l'analytique et du soutien aux processus. Nous ne garantissons pas l'approbation des publicités, le volume de prospects ou de rendez-vous, les revenus ni les résultats commerciaux."] },
      { title: "Nous joindre", paragraphs: ["Pour toute question sur les conditions, la confidentialité ou la conformité, écrivez à support@agentdealflow.io par le canal de soutien. N'envoyez aucun mot de passe, jeton d'accès ou secret."] },
    ],
  },
  deletion: {
    title: "Instructions de suppression des données", description: "Comment demander la suppression du compte, de l'espace de travail, des intégrations et des prospects DealFlow OS.", skip: "Aller aux instructions de suppression", updated: "Dernière mise à jour : 13 juillet 2026",
    statusTitle: "État de la demande de suppression", confirmationCode: "Code de confirmation", scheduledDeletionDate: "Date de suppression prévue", unavailable: "L'état de la demande est temporairement indisponible. Aucune exécution n'est présumée.", noMatch: "Aucune demande ne correspond à ce code. Vérifiez le code exact remis lors de l'acceptation.", emailSubject: "Demande de suppression des données",
    statuses: {
      operator_required: { label: "Reçue — examen requis", detail: "La demande signée est enregistrée. Aucune suppression ni anonymisation n'est déclarée comme terminée." },
      in_progress: { label: "En cours", detail: "Un opérateur autorisé rapproche la demande. Elle n'est pas encore déclarée comme terminée." },
      completed: { label: "Terminée", detail: "Le registre indique l'achèvement par le processus de confidentialité autorisé." },
      rejected: { label: "Rejetée", detail: "La demande n'a pas pu être exécutée. Communiquez le code au soutien pour examen." },
    },
    sections: [
      { title: "Demander la suppression", paragraphs: ["Faites la demande dans la Zone dangereuse des réglages DealFlow. Si le processus automatisé est indisponible, écrivez à support@agentdealflow.io avec l'objet Demande de suppression des données, puis indiquez le courriel du compte, le nom de l'espace de travail si connu et les données concernées."] },
      { title: "Étapes suivantes", paragraphs: ["Nous vérifions votre autorisation, suspendons l'accès après l'acceptation, arrêtons le renouvellement, déconnectons les fournisseurs pris en charge et planifions la suppression ou l'anonymisation. Chaque étape destructive doit produire une preuve durable; aucune demande n'est déclarée terminée sans cette preuve.", "Certains dossiers peuvent être conservés pour la facturation, la fraude, la sécurité, les obligations légales, les sauvegardes, les différends ou la reprise opérationnelle."] },
      { title: "Fournisseurs connectés", paragraphs: ["Les fournisseurs connectés peuvent détenir des renseignements indépendamment. Nous pouvons conserver des preuves opérationnelles limitées ou vous diriger vers les contrôles de Meta, Stripe, Twilio, Supabase, Vercel, OpenAI, GoHighLevel ou d'un autre fournisseur."] },
      { title: "Questions", paragraphs: ["Pour une demande de confidentialité, d'exportation, de correction ou de suppression, écrivez à support@agentdealflow.io. N'envoyez aucun mot de passe, jeton ou secret."] },
    ],
  },
};

const es: LegalCopy = {
  privacy: {
    title: "Política de privacidad", description: "Cómo DealFlow OS recopila, usa, protege y elimina la información personal.", skip: "Ir a la política de privacidad", updated: "Última actualización: 13 de julio de 2026",
    sections: [
      { title: "1. Descripción general", paragraphs: ["DealFlow OS ayuda a profesionales inmobiliarios a crear embudos, captar clientes potenciales, conectar cuentas publicitarias y revisar el rendimiento. Esta política explica qué recopilamos, cómo lo usamos y las opciones disponibles."] },
      { title: "2. Información recopilada", paragraphs: ["Podemos recopilar nombre, correo, detalles del espacio de trabajo, respuestas de incorporación, configuración de campañas, creativos elegidos, envíos públicos, estado de facturación y metadatos de integraciones necesarios.", "Cuando una persona envía un formulario, recopilamos la información que decide proporcionar, como nombre, correo, teléfono, mensaje y contexto de la campaña.", "Cuando una persona acepta comunicaciones por SMS, guardamos el texto de consentimiento mostrado, su origen, teléfono y fecha, además de los registros necesarios para respetar STOP, START y HELP."] },
      { title: "3. Servicios conectados", paragraphs: ["Si conectas Meta, Stripe, GoHighLevel u otro servicio, guardamos solo los datos de acceso y metadatos necesarios para las funciones autorizadas. Los tokens están protegidos y se usan únicamente para acciones que inicias o autorizas."] },
      { title: "4. Uso de la información", paragraphs: ["Usamos la información para gestionar campañas, crear vistas previas y borradores, procesar clientes potenciales, evitar duplicados, mantener suscripciones, sincronizar estados, resolver errores, mejorar la fiabilidad y prestar soporte. Los datos de mensajería se usan solo para responder, probar el consentimiento y respetar las bajas."] },
      { title: "5. Divulgación", paragraphs: ["No vendemos información personal. Podemos compartirla con proveedores que operan DealFlow OS para alojamiento, base de datos, autenticación, pagos, analítica, IA, mensajería, CRM y publicidad, o cuando la ley, la protección de usuarios o la prevención de abusos lo requiera.", "No vendemos ni compartimos consentimientos de SMS, teléfonos ni pruebas de alta para el marketing independiente de terceros."] },
      { title: "6. Retención", paragraphs: ["Conservamos datos de cuenta, campaña, facturación, integración y clientes potenciales solo durante el tiempo necesario para prestar el servicio, cumplir obligaciones, resolver disputas, proteger la seguridad y mantener registros requeridos. Las solicitudes de eliminación siguen sujetas a requisitos documentados legales, financieros, de seguridad y copias de respaldo."] },
      { title: "7. Seguridad", paragraphs: ["Aplicamos salvaguardas administrativas, técnicas y organizativas razonables. Ningún servicio en línea garantiza seguridad absoluta, pero restringimos el acceso, protegemos credenciales y vigilamos incidentes."] },
      { title: "8. Tus opciones", paragraphs: ["Puedes solicitar acceso, corrección, exportación o eliminación de los datos de tu cuenta y espacio de trabajo, desconectar integraciones compatibles y dejar de usar formularios públicos.", "Quienes reciben SMS pueden responder STOP para darse de baja, START para reanudar o HELP para ayuda. Pueden aplicarse tarifas de mensajes y datos."] },
      { title: "9. Contacto", paragraphs: ["Para consultas de privacidad o datos, escribe a support@agentdealflow.io. No envíes contraseñas, tokens de acceso ni secretos de proveedores."] },
    ],
  },
  terms: {
    title: "Términos del servicio", description: "Las reglas de acceso y uso de DealFlow OS.", skip: "Ir a los términos del servicio", updated: "Última actualización: 13 de julio de 2026",
    sections: [
      { title: "Uso del servicio", paragraphs: ["Estos términos rigen el acceso a DealFlow OS, incluida la creación de campañas, captación de clientes potenciales, herramientas publicitarias, facturación e integraciones.", "Eres responsable de la precisión del contenido, ofertas, segmentación, afirmaciones publicitarias, consentimiento y seguimientos. Se prohíben actividades ilegales, engañosas, discriminatorias o abusivas."] },
      { title: "Publicidad e integraciones", paragraphs: ["DealFlow OS puede preparar y lanzar flujos publicitarios mediante proveedores como Meta. Sigues siendo responsable de sus términos, políticas, categorías especiales, requisitos de facturación y permisos."] },
      { title: "Facturación", paragraphs: ["Stripe procesa el acceso de pago. Las suscripciones se renuevan automáticamente salvo cancelación antes del siguiente período. Cancelar detiene renovaciones futuras, pero no reembolsa automáticamente cargos anteriores.", "Los reembolsos se revisan caso por caso salvo obligación legal. El gasto publicitario, mensajería, IA, impuestos y costos de terceros ya incurridos pueden no ser reembolsables. Los pagos fallidos pueden suspender funciones de pago."] },
      { title: "Proveedores externos", paragraphs: ["DealFlow OS puede conectarse con Stripe, Meta, Supabase, Vercel, Twilio, OpenAI, GoHighLevel y otros proveedores. DealFlow OS no controla su disponibilidad, aprobaciones, aplicación de políticas ni sistemas de cobro."] },
      { title: "Clientes potenciales y mensajería", paragraphs: ["Si recopilas clientes potenciales o envías mensajes, debes obtener el consentimiento necesario, respetar las bajas y cumplir las leyes aplicables de privacidad, telemarketing, SMS, correo y publicidad.", "Los SMS solo pueden dirigirse a personas con consentimiento válido. Pueden responder STOP para darse de baja, START para reanudar o HELP para ayuda."] },
      { title: "Sin resultados garantizados", paragraphs: ["DealFlow OS ofrece software, automatización, analítica y soporte de flujo de trabajo. No garantizamos la aprobación de anuncios, el volumen de clientes potenciales o citas, los ingresos ni los resultados comerciales."] },
      { title: "Contacto", paragraphs: ["Para consultas sobre términos, privacidad o cumplimiento, escribe a support@agentdealflow.io mediante el canal de soporte. No envíes contraseñas, tokens ni secretos."] },
    ],
  },
  deletion: {
    title: "Instrucciones de eliminación de datos", description: "Cómo solicitar la eliminación de cuenta, espacio de trabajo, integraciones y clientes potenciales de DealFlow OS.", skip: "Ir a las instrucciones de eliminación", updated: "Última actualización: 13 de julio de 2026",
    statusTitle: "Estado de la solicitud de eliminación", confirmationCode: "Código de confirmación", scheduledDeletionDate: "Fecha programada de eliminación", unavailable: "El estado no está disponible temporalmente. No se presupone que la eliminación esté completa.", noMatch: "Ninguna solicitud coincide con este código. Comprueba el código exacto entregado cuando se aceptó.", emailSubject: "Solicitud de eliminación de datos",
    statuses: {
      operator_required: { label: "Recibida — requiere revisión", detail: "La solicitud firmada quedó registrada. No se declara completa ninguna eliminación o anonimización." },
      in_progress: { label: "En curso", detail: "Un operador autorizado está conciliando la solicitud. Todavía no se declara completa." },
      completed: { label: "Completada", detail: "El registro indica la finalización por el flujo de privacidad autorizado." },
      rejected: { label: "Rechazada", detail: "La solicitud no pudo completarse. Contacta al soporte con el código para revisarla." },
    },
    sections: [
      { title: "Cómo solicitar la eliminación", paragraphs: ["Solicítala desde la Zona de peligro en la configuración de DealFlow. Si el flujo automático no está disponible, escribe a support@agentdealflow.io con el asunto Solicitud de eliminación de datos e incluye el correo de la cuenta, el nombre del espacio si lo conoces y una descripción breve de los datos."] },
      { title: "Qué sucede después", paragraphs: ["Verificamos tu autorización, suspendemos el acceso tras aceptar la solicitud, detenemos la renovación, desconectamos proveedores compatibles y programamos la eliminación o anonimización. Cada paso destructivo debe generar un comprobante duradero; nunca declaramos una solicitud completa sin esa prueba.", "Algunos registros pueden conservarse por facturación, prevención del fraude, seguridad, obligaciones legales, copias de respaldo, disputas o recuperación operativa."] },
      { title: "Proveedores conectados", paragraphs: ["Los proveedores conectados pueden guardar información de forma independiente. Podemos conservar evidencia operativa limitada o dirigirte a los controles de Meta, Stripe, Twilio, Supabase, Vercel, OpenAI, GoHighLevel u otro proveedor."] },
      { title: "Preguntas", paragraphs: ["Para consultas de privacidad, exportación, corrección o eliminación, escribe a support@agentdealflow.io. No envíes contraseñas, tokens ni secretos."] },
    ],
  },
};

export const LEGAL_COPY: Record<ProductLocale, LegalCopy> = { en, fr, es };
