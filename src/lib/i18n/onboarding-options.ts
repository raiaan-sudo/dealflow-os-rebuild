import type { CampaignMode } from "@/lib/onboarding-contract";
import type { ProductLocale } from "@/lib/i18n/config";

export type OnboardingModeCopy = {
  title: string;
  summary: string;
  path: string;
  marketFallback: string;
  audience: string;
  propertyType: string;
  priceRange: string;
  offer: string;
};

export type OnboardingPropertyOption = {
  id: string;
  label: string;
  description: string;
};

type OnboardingOptionCatalog = {
  modes: Record<CampaignMode, OnboardingModeCopy>;
  properties: Record<CampaignMode, OnboardingPropertyOption[]>;
  audienceReasons: Record<CampaignMode, string>;
  offers: Record<CampaignMode, string[]>;
  leadQuestions: string[];
};

const en: OnboardingOptionCatalog = {
  modes: {
    buyer: {
      title: "Buyer leads",
      summary: "Attract active buyers with sharper search intent, a focused funnel, and a fast path to a consultation.",
      path: "Buyer leads in {{market}} who are ready to compare listings and book a call.",
      marketFallback: "your selected market",
      audience: "Move-ready buyers actively comparing homes",
      propertyType: "Single Family Homes",
      priceRange: "$600k-$900k",
      offer: "Private listings and a fast buyer strategy call",
    },
    seller: {
      title: "Seller leads",
      summary: "Turn homeowner curiosity into listing conversations with stronger positioning and clearer proof.",
      path: "Seller leads in {{market}} who want pricing, timing, and demand clarity.",
      marketFallback: "your selected market",
      audience: "Homeowners considering a sale in the next 12 months",
      propertyType: "Detached homes",
      priceRange: "$600k-$900k",
      offer: "Free home value and demand strategy call",
    },
    investor: {
      title: "Investor leads",
      summary: "Help real estate agents attract investors who want clearer deal flow, yield context, and stronger filtering.",
      path: "Investor prospects in {{market}} who want deal flow and ROI context before reviewing properties.",
      marketFallback: "your selected market",
      audience: "Real estate investors looking for stronger deal flow",
      propertyType: "Cash-flow rentals",
      priceRange: "$500k-$1.5M",
      offer: "Investor deal flow and ROI brief",
    },
    commercial: {
      title: "Commercial leads",
      summary: "Capture business owners, tenants, and owner-users who need a practical commercial shortlist.",
      path: "Commercial clients evaluating lease, purchase, or expansion options in {{market}}.",
      marketFallback: "your selected market",
      audience: "Business owners, tenants, and owner-users evaluating space",
      propertyType: "Office",
      priceRange: "Lease-ready",
      offer: "Commercial space-fit shortlist",
    },
  },
  properties: {
    buyer: [
      { id: "single-family", label: "Single Family Homes", description: "Detached homes, townhomes, freestanding homes, and homes on larger lots." },
      { id: "first-time", label: "First Time Buyer Homes", description: "Entry-point options for buyers who need a clearer first step." },
      { id: "new-construction", label: "New Construction", description: "Builder inventory, pre-construction, and newly built homes." },
      { id: "luxury", label: "Luxury Homes", description: "Higher-intent buyers seeking premium private access." },
      { id: "condos", label: "Condos", description: "Condo buyers looking for sharper building and neighborhood fit." },
      { id: "multi-unit", label: "Multi Unit Homes", description: "Duplexes, triplexes, and other multi-unit homes for buyers comparing income or flexible living options." },
    ],
    seller: [
      { id: "detached", label: "Detached homes", description: "Listing conversations with detached homeowners." },
      { id: "townhomes", label: "Townhomes", description: "Townhome owners comparing value, timing, and demand." },
      { id: "condos", label: "Condos", description: "Condo sellers who need pricing and building-specific demand clarity." },
      { id: "luxury-listings", label: "Luxury listings", description: "Premium homeowners who need a stronger launch plan." },
      { id: "downsizer", label: "Downsizer homes", description: "Owners weighing whether now is the right move-down window." },
      { id: "probate", label: "Probate/estate sale", description: "Estate-related sellers who need a practical next step." },
      { id: "investment-owners", label: "Investment property owners", description: "Landlords and owners considering a sale or portfolio shift." },
    ],
    investor: [
      { id: "cash-flow", label: "Cash-flow rentals", description: "Rental properties where investors care about yield and monthly spread." },
      { id: "value-add", label: "Value-add properties", description: "Properties with upside through renovation, repositioning, or better operations." },
      { id: "multifamily", label: "Multifamily", description: "Apartment and small multifamily opportunities for investor buyers." },
      { id: "small-multi", label: "Duplex/triplex/fourplex", description: "Small multi-unit assets for house hackers and cash-flow buyers." },
      { id: "brrrr", label: "BRRRR opportunities", description: "Buy, rehab, rent, refinance, repeat opportunities." },
      { id: "off-market", label: "Off-market deals", description: "Private or early-access opportunities before broad market exposure." },
      { id: "precon", label: "Pre-construction investment", description: "Pre-construction opportunities with investor-oriented context." },
      { id: "fix-flip", label: "Fix-and-flip properties", description: "Short-horizon renovation deals and resale opportunities." },
    ],
    commercial: [
      { id: "office", label: "Office", description: "Office space for tenants, owner-users, and professional teams." },
      { id: "retail", label: "Retail", description: "Retail space for operators comparing visibility, access, and location fit." },
      { id: "industrial", label: "Industrial", description: "Industrial units for operators, investors, and users." },
      { id: "warehouse", label: "Warehouse", description: "Warehouse and logistics space with capacity and access requirements." },
      { id: "mixed-use", label: "Mixed-use", description: "Mixed-use commercial properties with flexible use cases." },
      { id: "owner-user", label: "Owner-user", description: "Businesses evaluating purchase options for their own operations." },
      { id: "lease", label: "Lease opportunities", description: "Tenant-focused campaigns around lease-ready space." },
      { id: "purchase", label: "Purchase opportunities", description: "Commercial purchase campaigns for buyers and owner-users." },
      { id: "medical", label: "Medical/professional space", description: "Clinics, medical offices, and professional-service spaces." },
      { id: "land", label: "Land/development sites", description: "Commercial land, redevelopment, or buildable site opportunities." },
    ],
  },
  audienceReasons: {
    buyer: "Buyers respond fastest when the campaign filters inventory by budget, lifestyle, and timing instead of sending generic listing noise.",
    seller: "Homeowners need a low-pressure way to understand equity, timing, and demand before deciding whether to list.",
    investor: "Investors care about filtered deal flow, rent-to-price logic, and underwritten opportunities more than generic property ads.",
    commercial: "Commercial prospects need space-fit criteria and use-case clarity before they are ready to talk.",
  },
  offers: {
    buyer: ["Curated Home List", "Affordability Breakdown", "Early Access Listings", "First-Time Buyer Plan", "Relocation Shortlist", "Move-Up Strategy Plan", "Under-Market Deals", "Neighborhood Match Report", "Private Inventory Preview", "Monthly Payment Estimator"],
    seller: ["Home Equity Snapshot Report", "Pre-Listing Buyer Demand Check", "Neighbourhood Sale Comparison Report", "Instant Home Value Range", "Sell vs Renovate Decision Report", "Downsizing Profit Calculator", "Timing the Market Report", "Private Buyer Match Preview", "14-Day Sale Analysis", "Listing Strategy Blueprint"],
    investor: ["Cash Flow Deal List", "ROI Report", "Off-Market List", "Rent-to-Price Analysis", "BRRRR Candidate List", "Investor Pocket Map", "Underwritten Deal Sheet", "Multifamily Shortlist", "Monthly Cash Flow Estimate Tool", "Pre-Market Alert List"],
    commercial: ["Available spaces shortlist", "Lease vs purchase strategy call", "Owner-user opportunity list", "Industrial/warehouse availability report", "Tenant relocation options", "Commercial market snapshot", "Development site shortlist"],
  },
  leadQuestions: ["What price range are you targeting?", "When are you hoping to move?", "Are you already pre-approved?", "What city or neighbourhood are you focused on?", "Do you have a property to sell first?", "What is your ideal property type?"],
};

const fr: OnboardingOptionCatalog = {
  modes: {
    buyer: { title: "Prospects acheteurs", summary: "Attirez des acheteurs actifs avec une recherche ciblée, un entonnoir précis et un accès rapide à une consultation.", path: "Acheteurs dans {{market}} prêts à comparer des propriétés et à réserver un appel.", marketFallback: "le marché sélectionné", audience: "Acheteurs prêts à déménager qui comparent activement des propriétés", propertyType: "Maisons unifamiliales", priceRange: "600 k$ à 900 k$", offer: "Propriétés privées et appel stratégique rapide pour acheteurs" },
    seller: { title: "Prospects vendeurs", summary: "Transformez la curiosité des propriétaires en conversations de mise en vente grâce à un meilleur positionnement et des preuves claires.", path: "Vendeurs dans {{market}} qui veulent comprendre le prix, le moment et la demande.", marketFallback: "le marché sélectionné", audience: "Propriétaires qui envisagent de vendre dans les 12 prochains mois", propertyType: "Maisons individuelles", priceRange: "600 k$ à 900 k$", offer: "Évaluation gratuite et appel stratégique sur la demande" },
    investor: { title: "Prospects investisseurs", summary: "Attirez des investisseurs qui recherchent des occasions filtrées, un contexte de rendement et une meilleure qualification.", path: "Investisseurs dans {{market}} qui veulent des occasions et un contexte de rendement avant de consulter les propriétés.", marketFallback: "le marché sélectionné", audience: "Investisseurs immobiliers à la recherche de meilleures occasions", propertyType: "Immeubles locatifs rentables", priceRange: "500 k$ à 1,5 M$", offer: "Sélection d'occasions et sommaire du rendement" },
    commercial: { title: "Prospects commerciaux", summary: "Captez les entreprises, locataires et propriétaires-occupants qui ont besoin d'une sélection commerciale pratique.", path: "Clients commerciaux qui évaluent la location, l'achat ou l'expansion dans {{market}}.", marketFallback: "le marché sélectionné", audience: "Entreprises, locataires et propriétaires-occupants qui évaluent un espace", propertyType: "Bureaux", priceRange: "Prêt à louer", offer: "Sélection d'espaces commerciaux adaptés" },
  },
  properties: {
    buyer: [
      { id: "single-family", label: "Maisons unifamiliales", description: "Maisons individuelles, maisons en rangée et propriétés sur de grands terrains." },
      { id: "first-time", label: "Maisons pour premiers acheteurs", description: "Options accessibles pour les acheteurs qui ont besoin d'une première étape claire." },
      { id: "new-construction", label: "Construction neuve", description: "Inventaire de constructeurs, préconstruction et maisons neuves." },
      { id: "luxury", label: "Maisons de luxe", description: "Acheteurs motivés qui recherchent un accès privé haut de gamme." },
      { id: "condos", label: "Condos", description: "Acheteurs qui recherchent un meilleur choix d'immeuble et de quartier." },
      { id: "multi-unit", label: "Maisons multilogements", description: "Duplex, triplex et autres propriétés pour revenu ou vie flexible." },
    ],
    seller: [
      { id: "detached", label: "Maisons individuelles", description: "Conversations de mise en vente avec des propriétaires de maisons individuelles." },
      { id: "townhomes", label: "Maisons en rangée", description: "Propriétaires qui comparent la valeur, le moment et la demande." },
      { id: "condos", label: "Condos", description: "Vendeurs qui ont besoin de prix et de demande propres à l'immeuble." },
      { id: "luxury-listings", label: "Propriétés de luxe", description: "Propriétaires haut de gamme qui ont besoin d'un meilleur plan de lancement." },
      { id: "downsizer", label: "Propriétés pour réduire la taille", description: "Propriétaires qui évaluent le bon moment pour déménager plus petit." },
      { id: "probate", label: "Succession", description: "Vendeurs liés à une succession qui ont besoin d'une prochaine étape claire." },
      { id: "investment-owners", label: "Propriétaires d'immeubles locatifs", description: "Propriétaires qui envisagent une vente ou un changement de portefeuille." },
    ],
    investor: [
      { id: "cash-flow", label: "Immeubles locatifs rentables", description: "Propriétés où le rendement et le flux mensuel sont prioritaires." },
      { id: "value-add", label: "Propriétés à valeur ajoutée", description: "Potentiel par rénovation, repositionnement ou meilleure exploitation." },
      { id: "multifamily", label: "Multifamilial", description: "Immeubles d'appartements et petits multilogements." },
      { id: "small-multi", label: "Duplex, triplex et quadruplex", description: "Petits immeubles pour propriétaires-occupants et investisseurs." },
      { id: "brrrr", label: "Occasions BRRRR", description: "Acheter, rénover, louer, refinancer et répéter." },
      { id: "off-market", label: "Occasions hors marché", description: "Accès privé ou anticipé avant la diffusion générale." },
      { id: "precon", label: "Investissement en préconstruction", description: "Préconstruction présentée avec un contexte d'investissement." },
      { id: "fix-flip", label: "Propriétés à rénover et revendre", description: "Occasions de rénovation et de revente à court terme." },
    ],
    commercial: [
      { id: "office", label: "Bureaux", description: "Espaces pour locataires, propriétaires-occupants et équipes professionnelles." },
      { id: "retail", label: "Commerce de détail", description: "Espaces comparés selon la visibilité, l'accès et l'emplacement." },
      { id: "industrial", label: "Industriel", description: "Unités industrielles pour exploitants, investisseurs et utilisateurs." },
      { id: "warehouse", label: "Entrepôt", description: "Espaces logistiques avec exigences de capacité et d'accès." },
      { id: "mixed-use", label: "Usage mixte", description: "Propriétés commerciales offrant des usages flexibles." },
      { id: "owner-user", label: "Propriétaire-occupant", description: "Entreprises qui évaluent un achat pour leurs activités." },
      { id: "lease", label: "Occasions de location", description: "Campagnes destinées aux locataires pour des espaces prêts à louer." },
      { id: "purchase", label: "Occasions d'achat", description: "Campagnes d'achat commercial pour acheteurs et propriétaires-occupants." },
      { id: "medical", label: "Espace médical ou professionnel", description: "Cliniques, bureaux médicaux et services professionnels." },
      { id: "land", label: "Terrains et sites de développement", description: "Terrains commerciaux, redéveloppement et sites constructibles." },
    ],
  },
  audienceReasons: {
    buyer: "Les acheteurs réagissent mieux lorsque l'inventaire est filtré par budget, style de vie et échéancier.",
    seller: "Les propriétaires ont besoin d'une façon simple de comprendre l'équité, le moment et la demande avant de décider.",
    investor: "Les investisseurs privilégient les occasions filtrées, le rapport loyer-prix et les analyses plutôt que les publicités génériques.",
    commercial: "Les prospects commerciaux ont besoin de critères d'espace et d'usage clairs avant de discuter.",
  },
  offers: {
    buyer: ["Liste de propriétés ciblées", "Analyse d'abordabilité", "Propriétés en accès anticipé", "Plan pour premier acheteur", "Sélection de relocalisation", "Plan pour changer de propriété", "Occasions sous le marché", "Rapport de correspondance de quartier", "Aperçu d'inventaire privé", "Estimateur de paiement mensuel"],
    seller: ["Portrait de l'équité de la propriété", "Vérification de la demande avant inscription", "Comparaison des ventes du quartier", "Fourchette de valeur instantanée", "Rapport vendre ou rénover", "Calculateur de profit pour réduction de taille", "Rapport sur le bon moment de vendre", "Aperçu d'acheteurs privés", "Analyse de vente sur 14 jours", "Plan de stratégie d'inscription"],
    investor: ["Liste d'occasions rentables", "Rapport de rendement", "Liste hors marché", "Analyse loyer-prix", "Liste de projets BRRRR", "Carte d'occasions pour investisseurs", "Fiche d'analyse de l'opération", "Sélection multifamiliale", "Estimateur de flux de trésorerie", "Alertes avant mise en marché"],
    commercial: ["Sélection d'espaces disponibles", "Appel stratégique location ou achat", "Occasions pour propriétaires-occupants", "Rapport de disponibilité industrielle", "Options de relocalisation de locataire", "Portrait du marché commercial", "Sélection de sites de développement"],
  },
  leadQuestions: ["Quelle fourchette de prix visez-vous?", "Quand souhaitez-vous déménager?", "Avez-vous déjà une préapprobation?", "Quelle ville ou quel quartier ciblez-vous?", "Devez-vous d'abord vendre une propriété?", "Quel type de propriété recherchez-vous?"],
};

const es: OnboardingOptionCatalog = {
  modes: {
    buyer: { title: "Clientes potenciales compradores", summary: "Atrae compradores activos con una búsqueda enfocada, un embudo claro y un camino rápido a una consulta.", path: "Compradores en {{market}} listos para comparar propiedades y reservar una llamada.", marketFallback: "el mercado seleccionado", audience: "Compradores listos para mudarse que comparan propiedades activamente", propertyType: "Casas unifamiliares", priceRange: "$600k-$900k", offer: "Propiedades privadas y llamada estratégica rápida para compradores" },
    seller: { title: "Clientes potenciales vendedores", summary: "Convierte la curiosidad de propietarios en conversaciones de venta con mejor posicionamiento y pruebas claras.", path: "Vendedores en {{market}} que buscan claridad sobre precio, momento y demanda.", marketFallback: "el mercado seleccionado", audience: "Propietarios que consideran vender en los próximos 12 meses", propertyType: "Casas independientes", priceRange: "$600k-$900k", offer: "Valoración gratuita y llamada estratégica sobre la demanda" },
    investor: { title: "Clientes potenciales inversionistas", summary: "Atrae inversionistas que buscan oportunidades filtradas, contexto de rendimiento y mejor calificación.", path: "Inversionistas en {{market}} que quieren oportunidades y contexto de ROI antes de revisar propiedades.", marketFallback: "el mercado seleccionado", audience: "Inversionistas inmobiliarios que buscan mejores oportunidades", propertyType: "Alquileres con flujo de caja", priceRange: "$500k-$1.5M", offer: "Selección de oportunidades y resumen de ROI" },
    commercial: { title: "Clientes potenciales comerciales", summary: "Capta empresas, inquilinos y propietarios-usuarios que necesitan una selección comercial práctica.", path: "Clientes comerciales que evalúan alquiler, compra o expansión en {{market}}.", marketFallback: "el mercado seleccionado", audience: "Empresas, inquilinos y propietarios-usuarios que evalúan un espacio", propertyType: "Oficinas", priceRange: "Listo para alquilar", offer: "Selección de espacios comerciales adecuados" },
  },
  properties: {
    buyer: [
      { id: "single-family", label: "Casas unifamiliares", description: "Casas independientes, adosadas y propiedades en lotes grandes." },
      { id: "first-time", label: "Casas para primeros compradores", description: "Opciones accesibles para quienes necesitan un primer paso claro." },
      { id: "new-construction", label: "Construcción nueva", description: "Inventario de constructoras, preconstrucción y casas nuevas." },
      { id: "luxury", label: "Casas de lujo", description: "Compradores motivados que buscan acceso privado premium." },
      { id: "condos", label: "Condominios", description: "Compradores que buscan un mejor ajuste de edificio y vecindario." },
      { id: "multi-unit", label: "Casas multifamiliares", description: "Dúplex, tríplex y otras propiedades para ingresos o vida flexible." },
    ],
    seller: [
      { id: "detached", label: "Casas independientes", description: "Conversaciones de venta con propietarios de casas independientes." },
      { id: "townhomes", label: "Casas adosadas", description: "Propietarios que comparan valor, momento y demanda." },
      { id: "condos", label: "Condominios", description: "Vendedores que necesitan claridad de precio y demanda del edificio." },
      { id: "luxury-listings", label: "Propiedades de lujo", description: "Propietarios premium que necesitan un mejor plan de lanzamiento." },
      { id: "downsizer", label: "Casas para reducir espacio", description: "Propietarios que evalúan el momento de mudarse a algo más pequeño." },
      { id: "probate", label: "Venta por sucesión", description: "Vendedores vinculados a una sucesión que necesitan un próximo paso claro." },
      { id: "investment-owners", label: "Propietarios de inversión", description: "Arrendadores que consideran vender o cambiar su cartera." },
    ],
    investor: [
      { id: "cash-flow", label: "Alquileres con flujo de caja", description: "Propiedades donde importan el rendimiento y el flujo mensual." },
      { id: "value-add", label: "Propiedades con valor añadido", description: "Potencial mediante renovación, reposicionamiento o mejor operación." },
      { id: "multifamily", label: "Multifamiliar", description: "Apartamentos y pequeñas propiedades multifamiliares." },
      { id: "small-multi", label: "Dúplex, tríplex y cuádruplex", description: "Activos pequeños para propietarios-ocupantes e inversionistas." },
      { id: "brrrr", label: "Oportunidades BRRRR", description: "Comprar, renovar, alquilar, refinanciar y repetir." },
      { id: "off-market", label: "Oportunidades fuera de mercado", description: "Acceso privado o anticipado antes de la exposición general." },
      { id: "precon", label: "Inversión en preconstrucción", description: "Preconstrucción presentada con contexto para inversionistas." },
      { id: "fix-flip", label: "Propiedades para renovar y vender", description: "Oportunidades de renovación y reventa a corto plazo." },
    ],
    commercial: [
      { id: "office", label: "Oficinas", description: "Espacios para inquilinos, propietarios-usuarios y equipos profesionales." },
      { id: "retail", label: "Comercio minorista", description: "Espacios comparados por visibilidad, acceso y ubicación." },
      { id: "industrial", label: "Industrial", description: "Unidades industriales para operadores, inversionistas y usuarios." },
      { id: "warehouse", label: "Almacén", description: "Espacios logísticos con requisitos de capacidad y acceso." },
      { id: "mixed-use", label: "Uso mixto", description: "Propiedades comerciales con usos flexibles." },
      { id: "owner-user", label: "Propietario-usuario", description: "Empresas que evalúan comprar para sus propias operaciones." },
      { id: "lease", label: "Oportunidades de alquiler", description: "Campañas para inquilinos sobre espacios listos para alquilar." },
      { id: "purchase", label: "Oportunidades de compra", description: "Campañas de compra comercial para compradores y propietarios-usuarios." },
      { id: "medical", label: "Espacio médico o profesional", description: "Clínicas, consultorios médicos y servicios profesionales." },
      { id: "land", label: "Terrenos y sitios de desarrollo", description: "Terrenos comerciales, redesarrollo y sitios edificables." },
    ],
  },
  audienceReasons: {
    buyer: "Los compradores responden mejor cuando el inventario se filtra por presupuesto, estilo de vida y plazo.",
    seller: "Los propietarios necesitan una forma simple de entender patrimonio, momento y demanda antes de decidir.",
    investor: "Los inversionistas priorizan oportunidades filtradas, relación alquiler-precio y análisis sobre anuncios genéricos.",
    commercial: "Los prospectos comerciales necesitan criterios claros de espacio y uso antes de conversar.",
  },
  offers: {
    buyer: ["Lista de casas seleccionadas", "Análisis de asequibilidad", "Propiedades con acceso anticipado", "Plan para primer comprador", "Selección de reubicación", "Plan para cambiar de vivienda", "Oportunidades bajo mercado", "Informe de afinidad de vecindario", "Vista previa de inventario privado", "Estimador de pago mensual"],
    seller: ["Resumen del patrimonio de la vivienda", "Verificación de demanda antes de publicar", "Comparación de ventas del vecindario", "Rango instantáneo de valor", "Informe vender o renovar", "Calculadora de ganancias por reducción de espacio", "Informe sobre el momento de vender", "Vista previa de compradores privados", "Análisis de venta de 14 días", "Plan de estrategia de venta"],
    investor: ["Lista de oportunidades con flujo de caja", "Informe de ROI", "Lista fuera de mercado", "Análisis alquiler-precio", "Lista de candidatos BRRRR", "Mapa de oportunidades para inversionistas", "Ficha de análisis de operación", "Selección multifamiliar", "Estimador de flujo de caja mensual", "Alertas previas al mercado"],
    commercial: ["Selección de espacios disponibles", "Llamada estratégica de alquiler o compra", "Oportunidades para propietarios-usuarios", "Informe de disponibilidad industrial", "Opciones de reubicación de inquilino", "Resumen del mercado comercial", "Selección de sitios de desarrollo"],
  },
  leadQuestions: ["¿Qué rango de precio buscas?", "¿Cuándo esperas mudarte?", "¿Ya tienes una preaprobación?", "¿En qué ciudad o vecindario te enfocas?", "¿Primero debes vender una propiedad?", "¿Cuál es tu tipo de propiedad ideal?"],
};

export const ONBOARDING_OPTION_CATALOG: Record<ProductLocale, OnboardingOptionCatalog> = {
  en,
  fr,
  es,
};

export function getOnboardingOptionCatalog(locale: ProductLocale) {
  return ONBOARDING_OPTION_CATALOG[locale];
}

export function localizeKnownOnboardingValue(
  value: string,
  mode: CampaignMode,
  locale: ProductLocale,
) {
  const target = ONBOARDING_OPTION_CATALOG[locale];
  const locales = Object.values(ONBOARDING_OPTION_CATALOG);

  for (const catalog of locales) {
    const sourceMode = catalog.modes[mode];
    const targetMode = target.modes[mode];
    const modeFields: Array<keyof Pick<OnboardingModeCopy, "audience" | "propertyType" | "priceRange" | "offer">> = [
      "audience",
      "propertyType",
      "priceRange",
      "offer",
    ];
    for (const field of modeFields) {
      if (sourceMode[field] === value) return targetMode[field];
    }

    const property = catalog.properties[mode].find((option) => option.label === value);
    if (property) {
      return target.properties[mode].find((option) => option.id === property.id)?.label ?? value;
    }

    const offerIndex = catalog.offers[mode].indexOf(value);
    if (offerIndex >= 0) return target.offers[mode][offerIndex] ?? value;

    const questionIndex = catalog.leadQuestions.indexOf(value);
    if (questionIndex >= 0) return target.leadQuestions[questionIndex] ?? value;
  }

  return value;
}
