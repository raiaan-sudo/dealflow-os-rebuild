import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  ApiError,
  assertSameOriginRequest,
  handleApiError,
  parseJsonBody,
} from "@/lib/api/route";
import { buildRateLimitResponse, consumeRateLimit, getRateLimitKey } from "@/lib/api/rate-limit";
import {
  ONBOARDING_CONTRACT_VERSION,
  getDraftFromOnboardingSubmission,
  onboardingDraftEnvelopeSchema,
  onboardingDraftSchema,
  onboardingStepKeySchema,
  onboardingSubmissionSchema,
  type OnboardingDraftEnvelope,
  type OnboardingSubmission,
} from "@/lib/onboarding-contract";
import { normalizePhone } from "@/lib/phone";
import { buildWinningFunnel } from "@/lib/funnels/winning-template/build-winning-funnel";
import { getAppContext } from "@/lib/services/app-context";
import {
  mergeCampaignPlanDocument,
  readCampaignPlanDocument,
} from "@/lib/services/campaign-plan-document";
import { persistCampaignPlanDocumentUpdate } from "@/lib/services/campaign-plan-persistence-service";
import { saveCampaignPlan, type OnboardingInput } from "@/lib/services/campaign-plan-service";
import { upsertAgentProfile } from "@/lib/services/internal-lead-notification-service";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REAL_ESTATE_INTERESTS = [
  "real estate",
  "house hunting",
  "home ownership",
  "mortgage loans",
] as const;

function getCampaignIntent(mode: OnboardingSubmission["campaignMode"]): OnboardingInput["intent"] {
  if (mode === "seller") return "seller";
  if (mode === "investor") return "investor";
  if (mode === "commercial") return "other";
  return "buyer";
}

function buildCampaignInput(submission: OnboardingSubmission): OnboardingInput {
  const modeLabel =
    submission.campaignMode === "seller"
      ? "seller and listing"
      : submission.campaignMode === "investor"
        ? "real estate investor"
        : submission.campaignMode === "commercial"
          ? "commercial real estate"
          : "buyer";

  return {
    clientName: submission.agentCompanyName,
    businessName: submission.agentCompanyName,
    intent: getCampaignIntent(submission.campaignMode),
    market: submission.market,
    monthlyBudget: submission.monthlyBudget,
    primaryGoal: `Generate more ${modeLabel} leads`,
    timeline: "30 days",
    audience: submission.audience,
    propertyType: `${submission.priceRange} ${submission.propertyType}`,
    keyOffer: submission.offer,
    painPoints: [
      `${submission.audience} need a clearer next step in ${submission.market}`,
      `Generic campaigns do not explain the value of ${submission.offer}`,
      "Slow or fragmented follow-up causes qualified real-estate opportunities to go cold",
    ],
    mechanism: `${submission.offer} through a ${modeLabel} consultation and qualification path`,
  };
}

function buildOnboardingIdempotencyKey(
  organizationId: string,
  userId: string,
  submission: OnboardingSubmission,
) {
  return createHash("sha256")
    .update(`${organizationId}|${userId}|${submission.idempotencySeed.trim().toLowerCase()}`)
    .digest("hex");
}

function campaignIdFromOnboardingIdempotencyKey(idempotencyKey: string) {
  const hex = idempotencyKey.slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

async function getAuthenticatedRequestContext() {
  const [supabase, context] = await Promise.all([createRouteHandlerClient(), getAppContext()]);

  if (!supabase || !context) {
    throw new ApiError(401, "Authentication is required.", "unauthorized");
  }

  return { supabase, context };
}

async function persistOnboardingDraft(params: {
  supabase: NonNullable<Awaited<ReturnType<typeof createRouteHandlerClient>>>;
  organizationId: string;
  userId: string;
  envelope: OnboardingDraftEnvelope;
  campaignId?: string | null;
  submissionStatus?: "draft" | "submitted";
}) {
  const { error } = await (params.supabase as any).from("onboarding_drafts").upsert(
    {
      organization_id: params.organizationId,
      user_id: params.userId,
      contract_version: ONBOARDING_CONTRACT_VERSION,
      payload: params.envelope.draft as Json,
      current_step: params.envelope.currentStep,
      furthest_step_index: params.envelope.furthestStepIndex,
      ...(params.campaignId !== undefined ? { campaign_id: params.campaignId } : {}),
      ...(params.submissionStatus ? { submission_status: params.submissionStatus } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,user_id" },
  );

  if (error) {
    throw new ApiError(500, "Onboarding draft could not be saved.", "onboarding_draft_persist_failed");
  }
}

async function findExistingCampaign(params: {
  supabase: NonNullable<Awaited<ReturnType<typeof createRouteHandlerClient>>>;
  organizationId: string;
  userId: string;
  campaignId: string;
}) {
  const { data, error } = await (params.supabase as any)
    .from("campaign_plans")
    .select("id,plan,organization_id")
    .eq("id", params.campaignId)
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "Existing onboarding submission could not be checked.", "onboarding_idempotency_lookup_failed");
  }

  return data && typeof data.id === "string" ? (data as { id: string; plan: unknown }) : null;
}

async function persistCompleteOnboardingContract(params: {
  supabase: NonNullable<Awaited<ReturnType<typeof createRouteHandlerClient>>>;
  campaignId: string;
  organizationId: string;
  userId: string;
  currentPlan: unknown;
  submission: OnboardingSubmission;
  idempotencyKey: string;
}) {
  const submission = params.submission;
  const agentName = `${submission.agentFirstName} ${submission.agentLastName}`.trim();
  const funnel = {
    ...buildWinningFunnel({
      market: submission.market,
      location: submission.market,
      audience: submission.audience,
      offer: submission.offer,
      key_offer: submission.offer,
      market_type: submission.campaignMode,
      funnel_goal:
        submission.leadCaptureMode === "volume_lead_form" ? "lead_form" : "survey",
      language: submission.funnelLanguage,
      lead_capture_mode: submission.leadCaptureMode,
      agent_name: agentName,
      brokerage_name: submission.agentCompanyName,
      phone: submission.agentPhone,
      theme: {
        primaryColor: submission.themePrimaryColor,
        secondaryColor: submission.themeSecondaryColor,
        accentColor: submission.themeAccentColor,
        logoUrl: submission.logoUrl || null,
      },
    }),
    customLeadFormQuestions: submission.leadFormQuestions,
  };

  await persistCampaignPlanDocumentUpdate({
    supabase: params.supabase,
    campaignId: params.campaignId,
    organizationId: params.organizationId,
    userId: params.userId,
    plan: mergeCampaignPlanDocument(readCampaignPlanDocument(params.currentPlan), {
      industry_mode: "real_estate",
      onboarding_contract_version: ONBOARDING_CONTRACT_VERSION,
      onboarding_contract: submission as unknown as Record<string, unknown>,
      onboarding_idempotency_key: params.idempotencyKey,
      onboarding_focus: submission.campaignMode,
      onboarding_targeting: submission.audience,
      onboarding_price_range: submission.priceRange,
      onboarding_goal: submission.offer,
      campaign_modes: [submission.campaignMode],
      targeting_defaults: {
        interests: [...REAL_ESTATE_INTERESTS],
        geo_radius_miles: 15,
        location: submission.market,
        audience: submission.audience,
      },
      targeting_summary: submission.audience,
      offer_summary: submission.offer,
      key_offer: submission.offer,
      property_type: submission.propertyType,
      daily_budget: submission.dailyBudget,
      daily_budget_cents: submission.dailyBudgetCents,
      monthly_budget: submission.monthlyBudget,
      language: submission.funnelLanguage,
      lead_capture_mode: submission.leadCaptureMode,
      lead_form_questions: submission.leadFormQuestions,
      funnel,
      funnel_type: funnel.funnel_type,
      theme: {
        primaryColor: submission.themePrimaryColor,
        secondaryColor: submission.themeSecondaryColor,
        accentColor: submission.themeAccentColor,
        logoUrl: submission.logoUrl || null,
      },
      agent_name: agentName,
      brokerage_name: submission.agentCompanyName,
      phone: submission.agentPhone,
      plan_tier: submission.planTier,
      campaign_payload: {
        market: submission.market,
        audience: submission.audience,
        key_offer: submission.offer,
        property_type: submission.propertyType,
        price_range: submission.priceRange,
        daily_budget_cents: submission.dailyBudgetCents,
        language: submission.funnelLanguage,
        lead_capture_mode: submission.leadCaptureMode,
        lead_form_questions: submission.leadFormQuestions,
        theme: funnel.theme,
        funnel,
      },
    }),
    source: "onboarding_contract_v1",
  });
}

export async function GET() {
  try {
    const { supabase, context } = await getAuthenticatedRequestContext();
    const { data, error } = await (supabase as any)
      .from("onboarding_drafts")
      .select("contract_version,payload,current_step,furthest_step_index,campaign_id,submission_status,updated_at")
      .eq("organization_id", context.organization.id)
      .eq("user_id", context.user.id)
      .maybeSingle();

    if (error) {
      throw new ApiError(500, "Onboarding draft could not be loaded.", "onboarding_draft_fetch_failed");
    }

    if (!data) {
      return NextResponse.json({ found: false, contractVersion: ONBOARDING_CONTRACT_VERSION });
    }

    const draft = onboardingDraftSchema.parse(data.payload);
    const currentStep = onboardingStepKeySchema.parse(data.current_step);

    return NextResponse.json({
      found: true,
      contractVersion: ONBOARDING_CONTRACT_VERSION,
      draft,
      currentStep,
      furthestStepIndex: Number(data.furthest_step_index) || 0,
      campaignId: typeof data.campaign_id === "string" ? data.campaign_id : null,
      submissionStatus: data.submission_status === "submitted" ? "submitted" : "draft",
      updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
    });
  } catch (error) {
    return handleApiError(error, "Onboarding draft read");
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOriginRequest(request);
    const { supabase, context } = await getAuthenticatedRequestContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "onboarding-draft", context.user.id),
      limit: 60,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const envelope = await parseJsonBody(request, onboardingDraftEnvelopeSchema, {
      maxBytes: 64 * 1024,
      code: "onboarding_draft_body_too_large",
    });

    await persistOnboardingDraft({
      supabase,
      organizationId: context.organization.id,
      userId: context.user.id,
      envelope,
    });

    return NextResponse.json({ saved: true, contractVersion: ONBOARDING_CONTRACT_VERSION });
  } catch (error) {
    return handleApiError(error, "Onboarding draft write");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const { supabase, context } = await getAuthenticatedRequestContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "onboarding-plan", context.user.id),
      limit: 4,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const submission = await parseJsonBody(request, onboardingSubmissionSchema, {
      maxBytes: 64 * 1024,
      code: "onboarding_body_too_large",
    });
    const normalizedAgentPhone = normalizePhone(submission.agentPhone);

    if (!normalizedAgentPhone) {
      throw new ApiError(
        400,
        "Enter a valid US or Canada phone number for internal lead alerts.",
        "agent_phone_invalid",
      );
    }

    const idempotencyKey = buildOnboardingIdempotencyKey(
      context.organization.id,
      context.user.id,
      submission,
    );
    const deterministicCampaignId = campaignIdFromOnboardingIdempotencyKey(idempotencyKey);
    const existing = await findExistingCampaign({
      supabase,
      organizationId: context.organization.id,
      userId: context.user.id,
      campaignId: deterministicCampaignId,
    });

    let campaignId = existing?.id ?? null;
    let currentPlan = existing?.plan ?? null;

    if (!campaignId) {
      const savedPlan = await saveCampaignPlan(buildCampaignInput(submission), {
        campaignId: deterministicCampaignId,
        createOnly: true,
        initialPlanPatch: {
          onboarding_contract_version: ONBOARDING_CONTRACT_VERSION,
          onboarding_idempotency_key: idempotencyKey,
        },
      });
      campaignId = savedPlan.id;

      const { data: savedRow, error: savedRowError } = await (supabase as any)
        .from("campaign_plans")
        .select("plan,organization_id")
        .eq("id", campaignId)
        .eq("organization_id", context.organization.id)
        .eq("user_id", context.user.id)
        .maybeSingle();

      if (savedRowError || !savedRow) {
        throw new ApiError(
          500,
          "Saved campaign could not be reloaded.",
          "onboarding_campaign_reload_failed",
        );
      }
      currentPlan = savedRow.plan;
    }

    await persistCompleteOnboardingContract({
      supabase,
      campaignId,
      organizationId: context.organization.id,
      userId: context.user.id,
      currentPlan,
      submission,
      idempotencyKey,
    });

    await upsertAgentProfile({
      tenantId: context.organization.id,
      userId: context.user.id,
      firstName: submission.agentFirstName,
      lastName: submission.agentLastName,
      email: context.user.email || "",
      phoneRaw: normalizedAgentPhone,
      companyName: submission.agentCompanyName,
    });

    await persistOnboardingDraft({
      supabase,
      organizationId: context.organization.id,
      userId: context.user.id,
      envelope: {
        contractVersion: ONBOARDING_CONTRACT_VERSION,
        draft: getDraftFromOnboardingSubmission(submission),
        currentStep: "review",
        furthestStepIndex: 9,
      },
      campaignId,
      submissionStatus: "submitted",
    });

    return NextResponse.json({
      success: true,
      campaignId,
      data: { campaignId },
      contractVersion: ONBOARDING_CONTRACT_VERSION,
      reusedExisting: Boolean(existing),
    });
  } catch (error) {
    return handleApiError(error, "Onboarding plan");
  }
}
