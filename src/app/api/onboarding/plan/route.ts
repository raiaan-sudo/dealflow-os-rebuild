import { NextResponse } from "next/server";
import { assertSameOriginRequest, parseOptionalJsonBody } from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import { normalizePhone } from "@/lib/phone";
import { upsertAgentProfile } from "@/lib/services/internal-lead-notification-service";

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
  targeting?: unknown;
  price_range?: string;
  budget?: number | string;
  goal?: string;
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
  targetingCount: number;
  priceRange: string;
  budget: number | string | null;
  goalPresent: boolean;
  servicePresent: boolean;
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

const TARGETING_LABELS = {
  first_time_home_buyers: "first-time home buyers",
  investors: "investors",
  condos: "condos",
  single_family_homes: "single-family homes",
} as const;

type TargetingKey = keyof typeof TARGETING_LABELS;

function safeText(value: unknown) {
  return (value ?? "").toString().trim();
}

function normalizeTargetingSegments(value: unknown): TargetingKey[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const normalized = rawItems
    .map((item) => safeText(item).toLowerCase().replace(/[\s-]+/g, "_"))
    .map((item) => {
      if (item === "first_time_buyers" || item === "first_time_homebuyer" || item === "first_time_homebuyers") {
        return "first_time_home_buyers";
      }
      if (item === "single_family" || item === "single_family_home") {
        return "single_family_homes";
      }
      return item;
    })
    .filter((item): item is TargetingKey => item in TARGETING_LABELS);

  return Array.from(new Set(normalized));
}

function formatTargetingSegments(values: TargetingKey[]) {
  return values.map((value) => TARGETING_LABELS[value]);
}

function normalizeOfferForCampaign(value: string) {
  const offer = safeText(value);

  if (/guaranteed approval/i.test(offer) && /600\+?|six hundred/i.test(offer) && /credit/i.test(offer)) {
    return "See if you qualify for guaranteed approval options with 600+ credit";
  }

  return offer;
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
    targetingCount: normalizeTargetingSegments(payload?.targeting).length,
    priceRange: safeText(payload?.price_range),
    budget:
      typeof payload?.budget === "number" || typeof payload?.budget === "string"
        ? payload.budget
        : null,
    goalPresent: safeText(payload?.goal).length > 0,
    servicePresent: safeText(payload?.service).length > 0,
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

function toMonthlyBudget(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseFloat((value ?? "").toString().replace(/[^0-9.]/g, ""));

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 3000;
  }

  return Math.round(numeric);
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
    console.warn("ONBOARDING_IDEMPOTENCY_SKIPPED_INCOMPLETE_CAMPAIGN:", {
      campaignId: row.id,
      hasMarket: Boolean(market),
      hasAudience: Boolean(audience),
      hasMonthlyBudget: Number.isFinite(monthlyBudget) && monthlyBudget > 0,
    });
    return null;
  }

  return row.id;
}

function getRealEstateIntent(service: string) {
  if (/seller|sell|listing|valuation|home value/.test(service.toLowerCase())) {
    return "seller" as const;
  }

  return "buyer" as const;
}

function getRealEstateFocus(params: {
  focus?: string;
  service?: string;
  goal?: string;
}) {
  const normalizedFocus = safeText(params.focus).toLowerCase();

  if (normalizedFocus === "seller" || normalizedFocus === "buyer") {
    return normalizedFocus;
  }

  return getRealEstateIntent(`${safeText(params.service)} ${safeText(params.goal)}`);
}

function getRealEstateOnboardingDefaults(params: {
  businessType: string;
  businessName: string;
  location: string;
  service: string;
  priceRange: string;
  goal: string;
  budget: number;
  targetingSegments: TargetingKey[];
}) {
  const normalizedService = params.service.toLowerCase();
  const intent = getRealEstateFocus({
    focus: params.service,
    goal: params.goal,
  });
  const businessName = params.businessName.trim().length > 0 ? params.businessName : params.businessType;
  const priceRange = params.priceRange.trim().length > 0 ? params.priceRange : "mid-market homes";
  const targetingLabels = formatTargetingSegments(params.targetingSegments);
  const targetingSummary =
    targetingLabels.length > 0
      ? targetingLabels.join(", ")
      : intent === "seller"
        ? "single-family homes"
        : "first-time home buyers";
  const propertyFocus = targetingLabels.some((label) => /condo|single-family/.test(label))
    ? targetingLabels.filter((label) => /condo|single-family/.test(label)).join(" and ")
    : "homes";
  const serviceLabel =
    normalizeOfferForCampaign(params.goal).trim().length > 0
      ? normalizeOfferForCampaign(params.goal)
      : params.service.trim().length > 0
        ? params.service
        : intent === "seller"
          ? "Free home value strategy call"
          : "Private listings and buyer consult";

  if (/seller|sell|listing|valuation|home value/.test(normalizedService)) {
    return {
      clientName: businessName,
      businessName,
      intent,
      market: params.location,
      monthlyBudget: params.budget,
      primaryGoal: "Generate more seller and listing leads",
      timeline: "30 days",
      audience: `Homeowners in ${params.location} focused on ${targetingSummary}`,
      propertyType: `${priceRange} ${propertyFocus}`,
      keyOffer: serviceLabel,
      painPoints: [
        "Homeowners are unsure what their property is worth",
        "Listing timing feels risky",
        "Most sellers do not know how to maximize demand before going live",
      ],
      mechanism: `${serviceLabel} through a seller consultation and listing launch system`,
      serviceLabel,
      priceRange,
      targetingSummary,
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
    audience: `Home buyers in ${params.location} focused on ${targetingSummary}`,
    propertyType: `${priceRange} ${propertyFocus}`,
    keyOffer: serviceLabel,
    painPoints: [
      "Buyers do not know which homes fit their budget",
      "They miss listings because they react too late",
      "Mortgage uncertainty slows down decision-making",
    ],
    mechanism: `${serviceLabel} through a buyer consultation and qualification system`,
    serviceLabel,
    priceRange,
    targetingSummary,
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
      : ["buyer campaign", "seller campaign", "listing campaign"];

  await params.persistCampaignPlanDocumentUpdate({
    supabase: params.supabase,
    campaignId: params.campaignId,
    plan: params.mergeCampaignPlanDocument(currentPlan, {
      industry_mode: "real_estate",
      campaign_modes: campaignModes,
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
    const targetingSegments = normalizeTargetingSegments(payload?.targeting);
    const priceRange = safeText(payload?.price_range) || "mid-market homes";
    const service = normalizeOfferForCampaign(safeText(payload?.goal)) || safeText(payload?.service) || (focus === "seller" ? "Free home value strategy call" : "Private listings and buyer consult");
    const budget = toMonthlyBudget(payload?.budget);
    const realEstateMode = isRealEstateBusinessType(businessType) || safeText(payload?.focus).length > 0;
    const normalizedAgentPhone = normalizePhone(agentPhone);

    if (!agentFirstName || !agentLastName || !agentPhone || !agentCompanyName) {
      throw new Error("Agent first name, last name, phone, and company are required.");
    }

    if (!normalizedAgentPhone) {
      throw new Error("Enter a valid US or Canada phone number for internal lead alerts.");
    }

    const idempotencyKey = buildOnboardingIdempotencyKey(createHash, {
      userId: user.id,
      businessType: businessName,
      location,
      service: `${focus}|${priceRange}|${service}`,
      budget,
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

      const responseBody = buildSuccessResponse(existingCampaignId);
      return NextResponse.json(responseBody);
    }

    const savedPlan = await campaignPlanServiceModule.saveCampaignPlan(
      realEstateMode
        ? getRealEstateOnboardingDefaults({
            businessType,
            businessName,
            location,
            service: focus,
            priceRange,
            goal: service,
            budget,
            targetingSegments,
          })
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
            monthlyBudget: budget,
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
        onboarding_targeting: targetingSegments,
        onboarding_price_range: priceRange,
        onboarding_goal: service,
        targeting_summary: formatTargetingSegments(targetingSegments).join(", "),
        offer_summary: service,
        key_offer: service,
      }),
      source: "onboarding_idempotency_metadata",
    });

    if (realEstateMode) {
      await enrichRealEstateCampaignPlan({
        supabase: supabase as never,
        campaignId: savedPlan.id,
        location,
        readCampaignPlanDocument: campaignPlanDocumentModule.readCampaignPlanDocument,
        mergeCampaignPlanDocument: campaignPlanDocumentModule.mergeCampaignPlanDocument,
        persistCampaignPlanDocumentUpdate: persistenceModule.persistCampaignPlanDocumentUpdate,
      });
    }

    const responseBody = buildSuccessResponse(savedPlan.id);
    return NextResponse.json(responseBody);
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
