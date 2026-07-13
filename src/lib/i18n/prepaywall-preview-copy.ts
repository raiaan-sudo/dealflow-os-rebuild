import type { ProductLocale } from "@/lib/i18n/config";

type PreviewMode = "buyer" | "seller" | "investor" | "commercial";

type PreviewModeCopy = {
  label: string;
  eyebrow: string;
  primary: string;
  subtitle: string;
  visual: string;
  proof: [string, string];
  readiness: [string, string, string];
};

export type PrepaywallPreviewCopy = {
  fallback: {
    market: string;
    audience: string;
    inventory: string;
    range: string;
    offer: string;
    advisor: string;
    team: string;
  };
  day: string;
  budgetNotSet: string;
  campaignHeadline: string;
  campaignCta: string;
  modes: Record<PreviewMode, PreviewModeCopy>;
  adPreview: string;
  dealflowPreview: string;
  previewWatermark: string;
  instantSetup: string;
  instantTitle: string;
  instantBody: string;
  leadFields: string;
  fullName: string;
  email: string;
  phone: string;
  required: string;
  instantReadiness: [string, string, string, string];
  instantSafety: string;
  campaign: string;
  cta: string;
  previewTitle: string;
  packageTitle: string;
  sampleCta: string;
  watermarked: string;
  locked: string;
  copyAngle: string;
  copyPreview: string;
  agent: string;
  market: string;
  audience: string;
  offer: string;
  notSet: string;
  lockedStatic: string;
  lockedAiImage: string;
  lockedAiVideo: string;
  lockedResolution: string;
  readinessTitle: string;
  safetyFunnel: string;
  safetyInstant: string;
};

const en: PrepaywallPreviewCopy = {
  fallback: { market: "your market", audience: "qualified prospects", inventory: "selected inventory", range: "target range", offer: "strategy call", advisor: "Agent not set", team: "Local real estate team" },
  day: "day",
  budgetNotSet: "Budget not set",
  campaignHeadline: "{{offer}} — {{market}}",
  campaignCta: "Get {{offer}}",
  modes: {
    buyer: { label: "Buyer campaign", eyebrow: "Buyer access preview • {{market}}", primary: "{{offer}} stays visible while DealFlow turns market, budget, and inventory fit into a focused buyer path for {{audience}}.", subtitle: "{{range}}, {{property}}, and {{offer}} become one simple lead-form promise.", visual: "Listing access concept", proof: ["Buyer intent", "Inventory fit"], readiness: ["Buyer offer mapped", "Audience path drafted", "Preview ready for checkout"] },
    seller: { label: "Seller campaign", eyebrow: "Seller demand preview • {{market}}", primary: "{{offer}} stays central while DealFlow frames local demand, timing, and the next seller conversation.", subtitle: "{{market}} demand, {{range}}, and {{offer}} become one clear seller lead path.", visual: "Home value concept", proof: ["Homeowner timing", "Demand angle"], readiness: ["Seller offer mapped", "Lead form framed", "Launch checklist started"] },
    investor: { label: "Investor campaign", eyebrow: "Investor deal-flow preview • {{market}}", primary: "{{offer}} becomes a filtered investor angle with asset type, risk, and next-step criteria built into the lead path.", subtitle: "{{property}}, {{range}}, and {{offer}} form a focused deal-flow request.", visual: "ROI brief concept", proof: ["ROI context", "Asset fit"], readiness: ["Investor angle mapped", "Qualification path drafted", "Credit-gated assets locked"] },
    commercial: { label: "Commercial campaign", eyebrow: "Commercial shortlist preview • {{market}}", primary: "{{offer}} stays visible while DealFlow shapes use case, location fit, and practical commercial intake.", subtitle: "{{audience}} see {{offer}} before requesting the shortlist.", visual: "Space-fit concept", proof: ["Use-case fit", "Location fit"], readiness: ["Commercial criteria mapped", "Funnel shell assembled", "Meta preflight waiting"] },
  },
  adPreview: "Ad preview", dealflowPreview: "DealFlow preview", previewWatermark: "Preview",
  instantSetup: "Meta Instant Form setup", instantTitle: "Leads stay inside Facebook and Instagram", instantBody: "{{headline}} uses a native Meta lead form instead of a public funnel preview.",
  leadFields: "Lead form fields", fullName: "Full name", email: "Email", phone: "Phone number", required: "Required",
  instantReadiness: ["Meta ad account and Page selected", "Exact Instant Form definition prepared", "Privacy policy URL ready", "Lead persistence and GHL routing prepared"],
  instantSafety: "Preview only: no Meta form, campaign, ad set, ad, GHL record, SMS, or email is created here. At an authorized launch, DealFlow creates or reuses the exact form only after provider and delivery preflight passes.",
  campaign: "Campaign", cta: "CTA", previewTitle: "Campaign preview", packageTitle: "Campaign package preview",
  sampleCta: "Sample CTA: {{cta}}. Full generation unlocks after checkout and credits.", watermarked: "Watermarked", locked: "Locked", copyAngle: "Copy angle", copyPreview: "Copy preview",
  agent: "Agent", market: "Market", audience: "Audience", offer: "Offer", notSet: "Not set",
  lockedStatic: "Static creative locked", lockedAiImage: "AI image generation locked", lockedAiVideo: "AI video generation locked", lockedResolution: "Full-resolution files locked",
  readinessTitle: "Launch readiness summary",
  safetyFunnel: "Nothing is sent, charged, or generated from this preview. No Meta campaign, SMS, lead, Stripe charge, AI image, or AI video is created here.",
  safetyInstant: "Nothing is sent, charged, or generated from this preview. No Meta instant form, Meta campaign, SMS, lead, Stripe charge, AI image, AI video, GHL record, or public landing page is created here.",
};

const fr: PrepaywallPreviewCopy = {
  fallback: { market: "votre marché", audience: "prospects qualifiés", inventory: "inventaire sélectionné", range: "fourchette cible", offer: "appel stratégique", advisor: "Courtier non défini", team: "Équipe immobilière locale" },
  day: "jour", budgetNotSet: "Budget non défini", campaignHeadline: "{{offer}} — {{market}}", campaignCta: "Obtenir : {{offer}}",
  modes: {
    buyer: { label: "Campagne acheteurs", eyebrow: "Aperçu de l'accès acheteurs • {{market}}", primary: "{{offer}} reste visible pendant que DealFlow transforme le marché, le budget et l'inventaire en parcours ciblé pour {{audience}}.", subtitle: "{{range}}, {{property}} et {{offer}} forment une promesse simple de formulaire.", visual: "Concept d'accès aux propriétés", proof: ["Intention d'achat", "Inventaire adapté"], readiness: ["Offre acheteurs configurée", "Parcours d'auditoire préparé", "Aperçu prêt pour l'activation"] },
    seller: { label: "Campagne vendeurs", eyebrow: "Aperçu de la demande vendeurs • {{market}}", primary: "{{offer}} reste au centre pendant que DealFlow présente la demande locale, le moment et la prochaine conversation.", subtitle: "La demande à {{market}}, {{range}} et {{offer}} forment un parcours vendeur clair.", visual: "Concept de valeur immobilière", proof: ["Moment du propriétaire", "Angle de demande"], readiness: ["Offre vendeurs configurée", "Formulaire préparé", "Liste de lancement commencée"] },
    investor: { label: "Campagne investisseurs", eyebrow: "Aperçu des occasions investisseurs • {{market}}", primary: "{{offer}} devient un angle filtré avec le type d'actif, le risque et la prochaine étape intégrés au parcours.", subtitle: "{{property}}, {{range}} et {{offer}} forment une demande ciblée.", visual: "Concept de sommaire du rendement", proof: ["Contexte de rendement", "Actif adapté"], readiness: ["Angle investisseur configuré", "Qualification préparée", "Actifs verrouillés"] },
    commercial: { label: "Campagne commerciale", eyebrow: "Aperçu de la sélection commerciale • {{market}}", primary: "{{offer}} reste visible pendant que DealFlow structure l'usage, l'emplacement et la demande commerciale.", subtitle: "{{audience}} voient {{offer}} avant de demander la sélection.", visual: "Concept d'espace adapté", proof: ["Usage adapté", "Emplacement adapté"], readiness: ["Critères commerciaux configurés", "Entonnoir assemblé", "Vérification Meta en attente"] },
  },
  adPreview: "Aperçu publicitaire", dealflowPreview: "Aperçu DealFlow", previewWatermark: "Aperçu",
  instantSetup: "Configuration du formulaire instantané Meta", instantTitle: "Les prospects restent dans Facebook et Instagram", instantBody: "{{headline}} utilise un formulaire Meta natif plutôt qu'un entonnoir public.",
  leadFields: "Champs du formulaire", fullName: "Nom complet", email: "Courriel", phone: "Téléphone", required: "Requis",
  instantReadiness: ["Compte publicitaire et Page Meta sélectionnés", "Définition exacte du formulaire préparée", "URL de confidentialité prête", "Enregistrement et routage GHL préparés"],
  instantSafety: "Aperçu seulement : aucun formulaire, campagne, ensemble, publicité, dossier GHL, SMS ou courriel n'est créé ici. Au lancement autorisé, DealFlow crée ou réutilise le formulaire seulement après les vérifications du fournisseur et de la diffusion.",
  campaign: "Campagne", cta: "Appel à l'action", previewTitle: "Aperçu de la campagne", packageTitle: "Aperçu du forfait de campagne",
  sampleCta: "Exemple d'appel à l'action : {{cta}}. La génération complète se débloque après le paiement et les crédits.", watermarked: "Filigrané", locked: "Verrouillé", copyAngle: "Angle du texte", copyPreview: "Aperçu du texte",
  agent: "Courtier", market: "Marché", audience: "Auditoire", offer: "Offre", notSet: "Non défini",
  lockedStatic: "Création statique verrouillée", lockedAiImage: "Génération d'image IA verrouillée", lockedAiVideo: "Génération vidéo IA verrouillée", lockedResolution: "Fichiers pleine résolution verrouillés",
  readinessTitle: "Résumé de la préparation au lancement",
  safetyFunnel: "Rien n'est envoyé, facturé ou généré à partir de cet aperçu. Aucune campagne Meta, aucun SMS, prospect, débit Stripe, image IA ou vidéo IA n'est créé ici.",
  safetyInstant: "Rien n'est envoyé, facturé ou généré à partir de cet aperçu. Aucun formulaire ou campagne Meta, SMS, prospect, débit Stripe, image IA, vidéo IA, dossier GHL ou page publique n'est créé ici.",
};

const es: PrepaywallPreviewCopy = {
  fallback: { market: "tu mercado", audience: "clientes potenciales calificados", inventory: "inventario seleccionado", range: "rango objetivo", offer: "llamada estratégica", advisor: "Agente no definido", team: "Equipo inmobiliario local" },
  day: "día", budgetNotSet: "Presupuesto no definido", campaignHeadline: "{{offer}} — {{market}}", campaignCta: "Obtener: {{offer}}",
  modes: {
    buyer: { label: "Campaña de compradores", eyebrow: "Vista previa de acceso para compradores • {{market}}", primary: "{{offer}} permanece visible mientras DealFlow convierte el mercado, presupuesto e inventario en un flujo enfocado para {{audience}}.", subtitle: "{{range}}, {{property}} y {{offer}} forman una promesa simple de formulario.", visual: "Concepto de acceso a propiedades", proof: ["Intención de compra", "Inventario adecuado"], readiness: ["Oferta para compradores configurada", "Flujo de audiencia preparado", "Vista previa lista para activar"] },
    seller: { label: "Campaña de vendedores", eyebrow: "Vista previa de demanda de vendedores • {{market}}", primary: "{{offer}} permanece central mientras DealFlow presenta la demanda local, el momento y la próxima conversación.", subtitle: "La demanda en {{market}}, {{range}} y {{offer}} forman un flujo claro para vendedores.", visual: "Concepto de valor de vivienda", proof: ["Momento del propietario", "Ángulo de demanda"], readiness: ["Oferta para vendedores configurada", "Formulario preparado", "Lista de lanzamiento iniciada"] },
    investor: { label: "Campaña de inversionistas", eyebrow: "Vista previa de oportunidades para inversionistas • {{market}}", primary: "{{offer}} se convierte en un ángulo filtrado con tipo de activo, riesgo y próximo paso integrados.", subtitle: "{{property}}, {{range}} y {{offer}} forman una solicitud enfocada.", visual: "Concepto de resumen de ROI", proof: ["Contexto de ROI", "Activo adecuado"], readiness: ["Ángulo de inversión configurado", "Calificación preparada", "Activos bloqueados"] },
    commercial: { label: "Campaña comercial", eyebrow: "Vista previa de selección comercial • {{market}}", primary: "{{offer}} permanece visible mientras DealFlow estructura el uso, la ubicación y la admisión comercial.", subtitle: "{{audience}} ven {{offer}} antes de solicitar la selección.", visual: "Concepto de espacio adecuado", proof: ["Uso adecuado", "Ubicación adecuada"], readiness: ["Criterios comerciales configurados", "Embudo ensamblado", "Verificación de Meta pendiente"] },
  },
  adPreview: "Vista previa del anuncio", dealflowPreview: "Vista previa de DealFlow", previewWatermark: "Vista previa",
  instantSetup: "Configuración del formulario instantáneo de Meta", instantTitle: "Los clientes potenciales permanecen en Facebook e Instagram", instantBody: "{{headline}} usa un formulario nativo de Meta en lugar de un embudo público.",
  leadFields: "Campos del formulario", fullName: "Nombre completo", email: "Correo", phone: "Teléfono", required: "Obligatorio",
  instantReadiness: ["Cuenta publicitaria y Página de Meta seleccionadas", "Definición exacta del formulario preparada", "URL de privacidad lista", "Persistencia y enrutamiento a GHL preparados"],
  instantSafety: "Solo vista previa: aquí no se crea ningún formulario, campaña, conjunto, anuncio, registro de GHL, SMS ni correo. En un lanzamiento autorizado, DealFlow crea o reutiliza el formulario solo después de aprobar las verificaciones del proveedor y la entrega.",
  campaign: "Campaña", cta: "Llamada a la acción", previewTitle: "Vista previa de la campaña", packageTitle: "Vista previa del paquete de campaña",
  sampleCta: "Ejemplo de llamada a la acción: {{cta}}. La generación completa se desbloquea después del pago y los créditos.", watermarked: "Con marca de agua", locked: "Bloqueado", copyAngle: "Ángulo del texto", copyPreview: "Vista previa del texto",
  agent: "Agente", market: "Mercado", audience: "Audiencia", offer: "Oferta", notSet: "No definido",
  lockedStatic: "Creativo estático bloqueado", lockedAiImage: "Generación de imagen con IA bloqueada", lockedAiVideo: "Generación de video con IA bloqueada", lockedResolution: "Archivos de resolución completa bloqueados",
  readinessTitle: "Resumen de preparación para el lanzamiento",
  safetyFunnel: "Nada se envía, cobra ni genera desde esta vista previa. Aquí no se crea ninguna campaña de Meta, SMS, cliente potencial, cargo de Stripe, imagen con IA ni video con IA.",
  safetyInstant: "Nada se envía, cobra ni genera desde esta vista previa. Aquí no se crea ningún formulario o campaña de Meta, SMS, cliente potencial, cargo de Stripe, imagen con IA, video con IA, registro de GHL ni página pública.",
};

export const PREPAYWALL_PREVIEW_COPY: Record<ProductLocale, PrepaywallPreviewCopy> = { en, fr, es };

export function formatPreviewCopy(template: string, values: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match);
}
