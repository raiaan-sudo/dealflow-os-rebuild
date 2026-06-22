import { NextResponse } from "next/server";
import { assertSameOriginRequest, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { logWarn } from "@/lib/logging";
import { ACTIVE_CAMPAIGN_COOKIE } from "@/lib/paywall-access";
import { normalizePhone } from "@/lib/phone";
import { recordActivationEvent } from "@/lib/services/activation-telemetry-service";
import { upsertAgentProfile } from "@/lib/services/internal-lead-notification-service";
import { normalizeOfferForCampaign } from "@/lib/services/offer-normalization-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OnboardingPayload = {
  business_type?: string;
  business_name?: string;
  agent_first_name?: string;
  agent_last_name?: string;
  agent_phone?: string;
  agent_company_name?: string;
  location?: string;
  market?: string;
  service?: string;
  focus?: string;
  property_type?: string;
  price_range?: string;
  daily_budget?: number | string;
  daily_budget_cents?: number | string;
  budget?: number | string;
  goal?: string;
  language?: string;
  lead_capture_mode?: string;
  leadCaptureMode?: string;
  theme?: unknown;
  idempotencySeed?: string;
};

type SafeOnboardingPayloadLog = {
  businessType: string;
  businessNamePresent: boolean;
  agentFirstNamePresent: boolean;
  agentLastNamePresent: boolean;
  agentPhonePresent: boolean;
  market: string;
  location: string;
  focus: string;
  propertyType: string;
  priceRange: string;
  budget: number | string | null;
  dailyBudget: number | string | null;
  dailyBudgetCentsPresent: boolean;
  goalPresent: boolean;
  servicePresent: boolean;
  language: string;
  leadCaptureMode: string;
  themePresent: boolean;
  idempotencySeedPresent: boolean;
};

type OnboardingPlanSuccessResponse = {
  success: true;
  campaignId: string;
  data: {
    campaignId: string;
  };
};

type OnboardingPlanFailureResponse = {
  success: false;
  error: string;
  details?: Record<string, unknown> | null;
  stack?: string | null;
};

const REAL_ESTATE_INTERESTS = [
  "real estate",
  "house hunting",
  "home ownership",
  "mortgage loans",
] as const;

function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function normalizeFunnelLanguage(value: unknown) {
  const normalized = safeText(value).toLowerCase();
  return normalized === "fr" || normalized === "es" ? normalized : "en";
}

function normalizeLeadCaptureMode(value: unknown) {
  const normalized = safeText(value).toLowerCase();

  if (normalized === "volume_lead_form") return "volume_lead_form";
  if (normalized === "deep_qualification") return "deep_qualification";

  return "quality_funnel";
}

function normalizeHexColor(value: unknown, fallback: string) {
  const normalized = safeText(value);
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function normalizeTheme(value: unknown) {
  const record = isRecord(value) ? value : {};
  const logoUrl = safeText(record.logoUrl);
  const leadFormQuestions = Array.isArray(record.leadFormQuestions)
    ? record.leadFormQuestions
        .map((question) => safeText(question))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return {
    primaryColor: normalizeHexColor(record.primaryColor, "#17212c"),
    secondaryColor: normalizeHexColor(record.secondaryColor, "#f3eee5"),
    accentColor: normalizeHexColor(record.accentColor, "#f59e42"),
    logoUrl: /^https?:\/\//i.test(logoUrl) ? logoUrl : undefined,
    leadFormQuestions,
    fontPreset: "modern",
  };
}

function buildSafePayloadLog(payload: OnboardingPayload | null): SafeOnboardingPayloadLog {
  return {
    businessType: safeText(payload?.business_type),
    businessNamePresent: safeText(payload?.business_name).length > 0,
    agentFirstNamePresent: safeText(payload?.agent_first_name).length > 0,
    agentLastNamePresent: safeText(payload?.agent_last_name).length > 0,
    agentPhonePresent: safeText(payload?.agent_phone).length > 0,
    market: safeText(payload?.market),
    location: safeText(payload?.location),
    focus: safeText(payload?.focus),
    propertyType: safeText(payload?.property_type),
    priceRange: safeText(payload?.price_range),
    budget:
      typeof payload?.budget === "number" || typeof payload?.budget === "string"
        ? payload.budget
        : null,
    dailyBudget:
      typeof payload?.daily_budget === "number" || typeof payload?.daily_budget === "string"
        ? payload.daily_budget
        : null,
    dailyBudgetCentsPresent:
      typeof payload?.daily_budget_cents === "number" || typeof payload?.daily_budget_cents === "string",
    goalPresent: safeText(payload?.goal).length > 0,
    servicePresent: safeText(payload?.service).length > 0,
    language: safeText(payload?.language),
    leadCaptureMode: safeText(payload?.lead_capture_mode ?? payload?.leadCaptureMode),
    themePresent: isRecord(payload?.theme),
    idempotencySeedPresent: safeText(payload?.idempotencySeed).length > 0,
  };
}

function buildEnvPresenceLog() {
  return {
    hasSupabaseEnv: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
    ),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasAiEnv: Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.AI_API_KEY?.trim()),
    hasOpenAiApiKey: Boolean(process.env.OPENAI_API_KEY),
    hasAiApiKey: Boolean(process.env.AI_API_KEY),
    hasAppUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL),
    hasMetaAppId: Boolean(process.env.META_APP_ID),
    hasMetaAppSecret: Boolean(process.env.META_APP_SECRET),
    hasMetaRedirectUri: Boolean(process.env.META_REDIRECT_URI),
  };
}

function validateOnboardingRouteEnv() {
  const missing: string[] = [];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return missing;
}

function buildSuccessResponse(campaignId: string): OnboardingPlanSuccessResponse {
  return {
    success: true,
    campaignId,
    data: {
      campaignId,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractSerializableError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack ?? null,
      details: null as Record<string, unknown> | null,
    };
  }

  if (isRecord(error)) {
    const message =
      typeof error.message === "string" && error.message.trim().length > 0
        ? error.message
        : typeof error.error === "string" && error.error.trim().length > 0
          ? error.error
          : typeof error.details === "string" && error.details.trim().length > 0
            ? error.details
            : JSON.stringify(error);

    const details: Record<string, unknown> = {};

    for (const key of ["code", "details", "hint", "error", "status", "statusCode", "name"]) {
      if (key in error && error[key] !== undefined) {
        details[key] = error[key];
      }
    }

    return {
      message,
      stack: typeof error.stack === "string" ? error.stack : null,
      details: Object.keys(details).length > 0 ? details : error,
    };
  }

  return {
    message: String(error),
    stack: null,
    details: null as Record<string, unknown> | null,
  };
}

function buildFailureResponse(error: unknown): OnboardingPlanFailureResponse {
  const serialized = extractSerializableError(error);
  const isProduction = process.env.NODE_ENV === "production";

  return {
    success: false,
    error: isProduction
      ? "Campaign generation failed. Your answers are saved, so retry without starting over."
      : serialized.message,
    details: isProduction ? undefined : serialized.details,
    stack: isProduction ? undefined : serialized.stack,
  };
}

function normalizeIdempotencyPart(value: unknown) {
  return safeText(value).toLowerCase().replace(/\s+/g, " ");
}

const MIN_DAILY_BUDGET_CENTS = 500;
const MAX_DAILY_BUDGET_CENTS = 50_000;
const DEFAULT_DAILY_BUDGET_CENTS = 3_000;

function parseCurrencyCents(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    const cents = Math.round(value * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }

  const normalized = safeText(value).replace(/,/g, "");

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const [dollarsPart, centsPart = ""] = normalized.split(".");
  const dollars = Number.parseInt(dollarsPart, 10);
  const cents = Number.parseInt(centsPart.padEnd(2, "0"), 10) || 0;
  const total = dollars * 100 + cents;

  return Number.isSafeInteger(total) ? total : null;
}

function parseWholeCents(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseInt(safeText(value).replace(/[^0-9]/g, ""), 10);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  const cents = Math.round(numeric);

  return Number.isSafeInteger(cents) ? cents : null;
}

function toOnboardingBudget(payload: OnboardingPayload | null) {
  const explicitDailyBudgetCents = parseWholeCents(payload?.daily_budget_cents);
  const dailyBudgetCents = explicitDailyBudgetCents ?? parseCurrencyCents(payload?.daily_budget);

  if (dailyBudgetCents !== null) {
    if (dailyBudgetCents < MIN_DAILY_BUDGET_CENTS) {
      throw new Error("Daily ad spend must be at least $5/day.");
    }

    if (dailyBudgetCents > MAX_DAILY_BUDGET_CENTS) {
      throw new Error("Daily ad spend must be $500/day or less for self-serve setup.");
    }

    return {
      dailyBudget: dailyBudgetCents / 100,
      dailyBudgetCents,
      monthlyBudget: Math.round(dailyBudgetCents * 30) / 100,
      source: "daily" as const,
    };
  }

  return toLegacyMonthlyBudget(payload?.budget);
}

function toLegacyMonthlyBudget(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseFloat((value ?? "").toString().replace(/[^0-9.]/g, ""));

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return {
      dailyBudget: DEFAULT_DAILY_BUDGET_CENTS / 100,
      dailyBudgetCents: DEFAULT_DAILY_BUDGET_CENTS,
      monthlyBudget: Math.round(DEFAULT_DAILY_BUDGET_CENTS * 30) / 100,
      source: "default_daily" as const,
    };
  }

  const monthlyBudget = Math.round(numeric);
  const dailyBudgetCents = Math.max(1, Math.round(monthlyBudget / 30 * 100));

  return {
    dailyBudget: dailyBudgetCents / 100,
    dailyBudgetCents,
    monthlyBudget,
    source: "legacy_monthly" as const,
  };
}

function isRealEstateBusinessType(value: string) {
  return /real estate|realtor|broker|brokerage|realty|property/.test(value.toLowerCase());
}

function buildOnboardingIdempotencyKey(
  createHash: (algorithm: string) => { update(value: string): { digest(encoding: "hex"): string } },
  params: {
    userId: string;
    businessType: string;
    location: string;
    service: string;
    budget: number;
    idempotencySeed?: string;
  },
) {
  const normalizedSeed =
    normalizeIdempotencyPart(params.idempotencySeed) ||
    [
      normalizeIdempotencyPart(params.businessType),
      normalizeIdempotencyPart(params.location),
      normalizeIdempotencyPart(params.service),
      String(params.budget),
    ].join("|");

  return createHash("sha256")
    .update(`${params.userId}|${normalizedSeed}`)
    .digest("hex");
}

async function findExistingCampaignByIdempotencyKey(
  supabase: {
    from(table: "campaign_plans"): {
      select(value: string): {
        eq(column: string, value: string): {
          contains(column: string, value: object): {
            order(column: string, options: { ascending: boolean }): {
              limit(value: number): { maybeSingle(): Promise<{ data: unknown; error: Error | null }> };
            };
          };
        };
      };
    };
  },
  userId: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase
    .from("campaign_plans")
    .select("id, plan")
    .eq("user_id", userId)
    .contains("plan", { onboarding_idempotency_key: idempotencyKey } as never)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data as { id?: unknown; plan?: unknown } | null) ?? null;

  if (typeof row?.id !== "string") {
    return null;
  }

  const document = isRecord(row.plan) ? row.plan : null;
  const plan = isRecord(document?.plan) ? document.plan : null;
  const strategy = isRecord(document?.strategy) ? document.strategy : null;
  const market = safeText(plan?.market ?? strategy?.location);
  const audience = safeText(plan?.audience ?? strategy?.audience);
  const monthlyBudget = Number(plan?.monthly_budget ?? 0);

  if (!market || !audience || !Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
    logWarn("onboarding_idempotency_skipped_incomplete_campaign", {
      campaignId: row.id,
      hasMarket: Boolean(market),
      hasAudience: Boolean(audience),
      hasMonthlyBudget: Number.isFinite(monthlyBudget) && monthlyBudget > 0,
    });
    return null;
  }

  return row.id;
}

type RealEstateOnboardingFocus = "buyer" | "seller" | "investor" | "commercial";

function getRealEstateIntent(service: string): RealEstateOnboardingFocus {
  if (/commercial|office|retail|industrial|warehouse|mixed[- ]use|lease|tenant|owner[- ]user/.test(service.toLowerCase())) {
    return "commercial";
  }

  if (/invest|investor|cash ?flow|off-market|rental|income property|multifamily|roi|yield/.test(service.toLowerCase())) {
    return "investor";
  }

  if (/seller|sell|listing|valuation|home value/.test(service.toLowerCase())) {
    return "seller";
  }

  return "buyer";
}

function getRealEstateFocus(params: {
  focus?: string;
  service?: string;
  goal?: string;
}) {
  const normalizedFocus = safeText(params.focus).toLowerCase();

  if (
    normalizedFocus === "seller" ||
    normalizedFocus === "buyer" ||
    normalizedFocus === "investor" ||
    normalizedFocus === "commercial"
  ) {
    return normalizedFocus;
  }

  return getRealEstateIntent(`${safeText(params.service)} ${safeText(params.goal)}`);
}

function getRealEstateOnboardingDefaults(params: {
  businessType: string;
  businessName: string;
  location: string;
  service: string;
  propertyType?: string;
  priceRange: string;
  goal: string;
  budget: number;
}) {
  const intent = getRealEstateFocus({
    focus: params.service,
    goal: params.goal,
  });
  const normalizedOffer = normalizeOfferForCampaign(params.goal || params.service, intent).normalizedOffer;
  const normalizedService = normalizedOffer.toLowerCase();
  const businessName = params.businessName.trim().length > 0 ? params.businessName : params.businessType;
  const priceRange = params.priceRange.trim().length > 0 ? params.priceRange : "mid-market homes";
  const propertyType =
    safeText(params.propertyType) ||
    (intent === "commercial"
      ? "commercial spaces"
      : intent === "investor"
        ? "cash-flow properties"
        : `${priceRange} homes`);
  const serviceLabel =
    normalizedOffer.trim().length > 0
      ? normalizedOffer
      : params.goal.trim().length > 0
        ? params.goal
        : params.service.trim().length > 0
          ? params.service
        : intent === "commercial"
	          ? "Commercial space-fit consultation"
	          : intent === "investor"
	            ? "Cash Flow Deal List"
	            : intent === "seller"
	          ? "Home Equity Snapshot Report"
	          : "Curated Home List";

  if (intent === "commercial") {
    return {
      clientName: businessName,
      businessName,
      intent,
      market: params.location,
      monthlyBudget: params.budget,
      primaryGoal: "Generate qualified commercial real estate conversations",
      timeline: "30 days",
      audience: `Business owners, tenants, and owner-users evaluating ${propertyType} in ${params.location}`,
      propertyType,
      keyOffer: serviceLabel,
      painPoints: [
        "Operators waste time on spaces that do not fit their requirements",
        "Lease and purchase timing is difficult to compare",
        "Commercial availability changes before buyers or tenants can act",
      ],
      mechanism: "commercial space-fit analysis and shortlist system",
      serviceLabel,
      priceRange,
    };
  }

  if (intent === "investor") {
    return {
      clientName: businessName,
      businessName,
      intent,
      market: params.location,
      monthlyBudget: params.budget,
      primaryGoal: "Generate investor deal-flow conversations",
      timeline: "30 days",
      audience: `Real estate investors evaluating ${propertyType} in ${params.location}`,
      propertyType,
      keyOffer: serviceLabel,
      painPoints: [
        "Investors do not know which pockets still have strong upside",
        "They waste time underwriting weak opportunities",
        "Good deals move before most investors see the numbers",
      ],
      mechanism: "investor deal-screening and market brief system",
      serviceLabel,
      priceRange,
    };
  }

  if (intent === "seller") {
    return {
      clientName: businessName,
      businessName,
      intent,
      market: params.location,
      monthlyBudget: params.budget,
      primaryGoal: "Generate more seller and listing leads",
      timeline: "30 days",
      audience: `Homeowners likely to sell ${priceRange} homes in ${params.location}`,
      propertyType,
      keyOffer: serviceLabel,
      painPoints: [
        "Homeowners are unsure what their property is worth",
        "Listing timing feels risky",
        "Most sellers do not know how to maximize demand before going live",
      ],
      mechanism: "seller consultation and listing launch system",
      serviceLabel,
      priceRange,
    };
  }

  return {
    clientName: businessName,
    businessName,
    intent,
    market: params.location,
    monthlyBudget: params.budget,
    primaryGoal: "Generate more buyer leads",
    timeline: "30 days",
    audience: `Home buyers searching for ${priceRange} homes in ${params.location}`,
    propertyType,
    keyOffer: serviceLabel,
    painPoints: [
      "Buyers do not know which homes fit their budget",
      "They miss listings because they react too late",
      "Mortgage uncertainty slows down decision-making",
    ],
    mechanism: "buyer consultation and qualification system",
    serviceLabel,
    priceRange,
  };
}

async function enrichRealEstateCampaignPlan(params: {
  supabase: {
    from(table: "campaign_plans"): {
      select(value: string): {
        eq(column: string, value: string): { maybeSingle(): Promise<{ data: unknown; error: Error | null }> };
      };
    };
  };
  campaignId: string;
  location: string;
  focus: RealEstateOnboardingFocus;
  readCampaignPlanDocument: (plan: unknown) => Record<string, unknown>;
  mergeCampaignPlanDocument: (plan: Record<string, unknown>, patch: Record<string, unknown>) => Record<string, unknown>;
  persistCampaignPlanDocumentUpdate: any;
}) {
  const { data, error } = await params.supabase
    .from("campaign_plans")
    .select("plan")
    .eq("id", params.campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data as { plan?: unknown } | null) ?? null;

  const currentPlan = params.readCampaignPlanDocument(row?.plan);

  const campaignModes =
    Array.isArray(currentPlan.campaign_modes) && currentPlan.campaign_modes.length > 0
      ? currentPlan.campaign_modes
      : ["buyer campaign", "seller campaign", "investor campaign", "commercial campaign"];
  const nextCampaignModes = Array.from(new Set([...campaignModes, `${params.focus} campaign`]));

  await params.persistCampaignPlanDocumentUpdate({
    supabase: params.supabase,
    campaignId: params.campaignId,
    plan: params.mergeCampaignPlanDocument(currentPlan, {
      industry_mode: "real_estate",
      campaign_modes: nextCampaignModes,
      campaign_mode: params.focus,
      targeting_defaults: {
        interests: [...REAL_ESTATE_INTERESTS],
        geo_radius_miles: 15,
        location: params.location,
      },
    }),
    source: "onboarding_real_estate_defaults",
  });
}

export async function POST(req: Request) {
  let safePayload: SafeOnboardingPayloadLog | null = null;

  try {
    assertSameOriginRequest(req);
    const missingEnv = validateOnboardingRouteEnv();

    if (missingEnv.length > 0) {
      throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
    }

    const [{ createHash }, { createRouteHandlerClient }, campaignIntentModule, campaignPlanDocumentModule, persistenceModule, campaignPlanServiceModule] =
      await Promise.all([
        import("node:crypto"),
        import("@/lib/supabase/route-handler"),
        import("@/lib/campaign-intent"),
        import("@/lib/services/campaign-plan-document"),
        import("@/lib/services/campaign-plan-persistence-service"),
        import("@/lib/services/campaign-plan-service"),
      ]);

    const supabase = await createRouteHandlerClient();

    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const responseBody: OnboardingPlanFailureResponse = {
        success: false,
        error: "Authentication is required.",
      };
      return NextResponse.json(
        responseBody,
        { status: 401 },
      );
    }

    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(req, "onboarding-plan", user.id),
      limit: 4,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const payload = (await parseOptionalJsonBody(req, { parse: (input) => input }, null, {
      maxBytes: 64 * 1024,
      code: "onboarding_body_too_large",
    })) as OnboardingPayload | null;
    safePayload = buildSafePayloadLog(payload);
    const businessType = safeText(payload?.business_type) || "Real Estate";
    const businessName = safeText(payload?.business_name) || businessType;
    const agentFirstName = safeText(payload?.agent_first_name);
    const agentLastName = safeText(payload?.agent_last_name);
    const agentPhone = safeText(payload?.agent_phone);
    const agentCompanyName = safeText(payload?.agent_company_name) || businessName;
    const location = safeText(payload?.market) || safeText(payload?.location) || "United States";
    const focus = getRealEstateFocus({
      focus: payload?.focus,
      service: payload?.service,
      goal: payload?.goal,
    });
    const priceRange = safeText(payload?.price_range) || "mid-market homes";
    const propertyType = safeText(payload?.property_type);
    const rawService =
      safeText(payload?.goal) ||
      safeText(payload?.service) ||
      (focus === "commercial"
	        ? "Commercial space-fit shortlist"
	        : focus === "investor"
	          ? "Cash Flow Deal List"
	          : focus === "seller"
	            ? "Home Equity Snapshot Report"
	            : "Curated Home List");
    const service = normalizeOfferForCampaign(rawService, focus).normalizedOffer;
    const funnelLanguage = normalizeFunnelLanguage(payload?.language);
    const leadCaptureMode = normalizeLeadCaptureMode(payload?.lead_capture_mode ?? payload?.leadCaptureMode);
    const funnelTheme = normalizeTheme(payload?.theme);
    const budget = toOnboardingBudget(payload);
    const realEstateMode = isRealEstateBusinessType(businessType) || safeText(payload?.focus).length > 0;
    const normalizedAgentPhone = normalizePhone(agentPhone);

    if (!agentFirstName || !agentLastName || !agentPhone || !agentCompanyName) {
      throw new Error("Agent first name, last name, phone, and company are required.");
    }

    if (!normalizedAgentPhone) {
      throw new Error("Enter a valid US or Canada phone number for lead alerts.");
    }

    const idempotencyKey = buildOnboardingIdempotencyKey(createHash, {
      userId: user.id,
      businessType: businessName,
      location,
      service: [
        focus,
        priceRange,
        service,
        funnelLanguage,
        leadCaptureMode,
        funnelTheme.primaryColor,
        funnelTheme.secondaryColor,
        funnelTheme.accentColor,
        JSON.stringify(funnelTheme.leadFormQuestions),
      ].join("|"),
      budget: budget.monthlyBudget,
      idempotencySeed: payload?.idempotencySeed,
    });

    const existingCampaignId = await findExistingCampaignByIdempotencyKey(supabase as never, user.id, idempotencyKey);

    if (existingCampaignId) {
      const { data: existingRowData, error: existingRowError } = await supabase
        .from("campaign_plans")
        .select("organization_id")
        .eq("id", existingCampaignId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingRowError) {
        throw existingRowError;
      }

      const existingRow = existingRowData as { organization_id?: string | null } | null;
      await upsertAgentProfile({
        tenantId: existingRow?.organization_id || user.id,
        userId: user.id,
        firstName: agentFirstName,
        lastName: agentLastName,
        email: user.email || "",
        phoneRaw: agentPhone,
        companyName: agentCompanyName,
      });
      if (existingRow?.organization_id) {
        await Promise.all([
          recordActivationEvent({
            organizationId: existingRow.organization_id,
            userId: user.id,
            campaignId: existingCampaignId,
            eventName: "onboarding_completed",
            source: "onboarding_route",
            metadata: {
              mode: focus,
              sourceStage: "existing_campaign",
              language: funnelLanguage,
              leadCaptureMode,
            },
            idempotencyKey: `onboarding_completed:${idempotencyKey}`,
          }),
          recordActivationEvent({
            organizationId: existingRow.organization_id,
            userId: user.id,
            campaignId: existingCampaignId,
            eventName: "campaign_plan_persisted",
            source: "onboarding_route",
            metadata: {
              mode: focus,
              sourceStage: "existing_campaign",
              language: funnelLanguage,
              leadCaptureMode,
            },
            idempotencyKey: `campaign_plan_persisted:${idempotencyKey}`,
          }),
        ]);
      }

      const responseBody = buildSuccessResponse(existingCampaignId);
      return NextResponse.json(responseBody);
    }

    const agentName = [agentFirstName, agentLastName].filter(Boolean).join(" ");
    const sharedFunnelInput = {
      language: funnelLanguage,
      leadCaptureMode,
      theme: funnelTheme,
      agentName,
      brokerageName: agentCompanyName,
      phone: normalizedAgentPhone,
      email: user.email || undefined,
    };

    const savedPlan = await campaignPlanServiceModule.saveCampaignPlan(
      realEstateMode
        ? {
            ...getRealEstateOnboardingDefaults({
              businessType,
              businessName,
              location,
              service: focus,
              propertyType,
              priceRange,
              goal: service,
              budget: budget.monthlyBudget,
            }),
            ...sharedFunnelInput,
          }
        : {
            clientName: businessName,
            businessName,
            intent: campaignIntentModule.inferCampaignIntent({
              marketType: businessType,
              offer: service,
              audience: `${businessName} prospects in ${location}`,
              primaryGoal: `Generate more ${service} leads`,
              mechanism: service,
            }),
            market: location,
            monthlyBudget: budget.monthlyBudget,
            primaryGoal: `Generate more ${service} leads`,
            timeline: "30 days",
            audience: `${businessName} prospects in ${location}`,
            propertyType: service,
            keyOffer: `${service} system`,
            painPoints: [
              "Lead volume is inconsistent",
              "Follow-up is fragmented",
              "Acquisition costs are too high",
            ],
            mechanism: `${service} campaign system`,
            ...sharedFunnelInput,
          },
    );

    const { data: savedRowData, error: savedRowError } = await supabase
      .from("campaign_plans")
      .select("plan, organization_id, user_id")
      .eq("id", savedPlan.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (savedRowError) {
      throw savedRowError;
    }

    const savedRow = (savedRowData as { plan?: unknown; organization_id?: string | null; user_id?: string | null } | null) ?? null;
    await upsertAgentProfile({
      tenantId: savedRow?.organization_id || user.id,
      userId: user.id,
      firstName: agentFirstName,
      lastName: agentLastName,
      email: user.email || "",
      phoneRaw: agentPhone,
      companyName: agentCompanyName,
    });
    const currentPlan = campaignPlanDocumentModule.readCampaignPlanDocument(savedRow?.plan);

    await persistenceModule.persistCampaignPlanDocumentUpdate({
      supabase,
      campaignId: savedPlan.id,
      userId: user.id,
      plan: campaignPlanDocumentModule.mergeCampaignPlanDocument(currentPlan, {
        onboarding_idempotency_key: idempotencyKey,
        onboarding_focus: focus,
        onboarding_price_range: priceRange,
        onboarding_goal: service,
        onboarding_daily_budget_cents: budget.dailyBudgetCents,
        onboarding_daily_budget: budget.dailyBudget,
        onboarding_monthly_cap_cents: Math.round(budget.monthlyBudget * 100),
        onboarding_budget_source: budget.source,
        funnel_language: funnelLanguage,
        lead_capture_mode: leadCaptureMode,
        funnel_theme: funnelTheme,
      }),
      source: "onboarding_idempotency_metadata",
    });

    if (realEstateMode) {
      await enrichRealEstateCampaignPlan({
        supabase: supabase as never,
        campaignId: savedPlan.id,
        location,
        focus,
        readCampaignPlanDocument: campaignPlanDocumentModule.readCampaignPlanDocument,
        mergeCampaignPlanDocument: campaignPlanDocumentModule.mergeCampaignPlanDocument,
        persistCampaignPlanDocumentUpdate: persistenceModule.persistCampaignPlanDocumentUpdate,
      });
    }

    if (savedRow?.organization_id) {
      await Promise.all([
        recordActivationEvent({
          organizationId: savedRow.organization_id,
          userId: user.id,
          campaignId: savedPlan.id,
          eventName: "onboarding_completed",
          source: "onboarding_route",
          metadata: {
            mode: focus,
            sourceStage: "new_campaign",
            dailyBudgetCents: budget.dailyBudgetCents,
            budgetSource: budget.source,
            language: funnelLanguage,
            leadCaptureMode,
          },
          idempotencyKey: `onboarding_completed:${idempotencyKey}`,
        }),
        recordActivationEvent({
          organizationId: savedRow.organization_id,
          userId: user.id,
          campaignId: savedPlan.id,
          eventName: "campaign_plan_persisted",
          source: "onboarding_route",
          metadata: {
            mode: focus,
            sourceStage: "new_campaign",
            dailyBudgetCents: budget.dailyBudgetCents,
            budgetSource: budget.source,
            language: funnelLanguage,
            leadCaptureMode,
          },
          idempotencyKey: `campaign_plan_persisted:${idempotencyKey}`,
        }),
      ]);
    }

    const responseBody = buildSuccessResponse(savedPlan.id);
    const response = NextResponse.json(responseBody);
    response.cookies.set(ACTIVE_CAMPAIGN_COOKIE, savedPlan.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    const serializedError = extractSerializableError(error);

    const { logError } = await import("@/lib/logging");
    const isProduction = process.env.NODE_ENV === "production";

    logError("onboarding_plan_failed", {
      errorMessage: serializedError.message,
      stack: isProduction ? null : serializedError.stack,
      errorDetails: isProduction ? null : serializedError.details,
      safePayload,
      envPresence: buildEnvPresenceLog(),
      runtime: {
        nodeEnv: process.env.NODE_ENV ?? null,
        vercel: Boolean(process.env.VERCEL),
      },
    });

    const responseBody = buildFailureResponse(error);
    return NextResponse.json(responseBody, { status: 500 });
  }
}
