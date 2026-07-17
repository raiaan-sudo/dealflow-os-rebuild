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
  onboardingDraftDeleteSchema,
  onboardingDraftSchema,
  onboardingDraftWriteSchema,
  onboardingStepKeySchema,
  onboardingSubmitRequestSchema,
  type OnboardingSubmission,
} from "@/lib/onboarding-contract";
import {
  ONBOARDING_PROVENANCE_VERSION,
  buildOnboardingProvenance,
} from "@/lib/onboarding-provenance";
import { normalizePhone } from "@/lib/phone";
import { buildWinningFunnel } from "@/lib/funnels/winning-template/build-winning-funnel";
import {
  hasOnlyApprovedRealtorQualificationQuestions,
  resolveMetaInstantFormQualificationQuestions,
} from "@/lib/meta-instant-form-qualification";
import { getAppContext } from "@/lib/services/app-context";
import {
  mergeCampaignPlanDocument,
  readCampaignPlanDocument,
} from "@/lib/services/campaign-plan-document";
import {
  prepareCampaignPlanPayload,
  type OnboardingInput,
} from "@/lib/services/campaign-plan-service";
import { upsertAgentProfile } from "@/lib/services/internal-lead-notification-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

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

function mapOnboardingRpcError(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message ?? "";
  if (message.includes("stale_revision") || message.includes("draft_changed")) {
    throw new ApiError(409, "This onboarding draft changed in another session.", "onboarding_draft_stale_revision");
  }
  if (message.includes("expired")) {
    throw new ApiError(409, "This onboarding draft expired. Start a fresh draft.", "onboarding_draft_expired");
  }
  if (message.includes("already_consumed") || message.includes("consumed_collision")) {
    throw new ApiError(409, "This onboarding draft was already submitted.", "onboarding_draft_consumed");
  }
  if (message.includes("forbidden") || message.includes("not_member") || message.includes("service_role_required")) {
    throw new ApiError(403, "Onboarding draft access was denied.", "onboarding_draft_forbidden");
  }
  throw new ApiError(500, "Onboarding could not be saved.", fallback);
}

function buildCompleteOnboardingContract(params: {
  currentPlan: unknown;
  submission: OnboardingSubmission;
  idempotencyKey: string;
  provenance: ReturnType<typeof buildOnboardingProvenance>;
}) {
  const submission = params.submission;
  const agentName = `${submission.agentFirstName} ${submission.agentLastName}`.trim();
  const effectiveLeadFormQuestions = resolveMetaInstantFormQualificationQuestions({
    leadCaptureMode: submission.leadCaptureMode,
    language: submission.funnelLanguage,
    customQuestions: submission.leadFormQuestions,
  });
  const provenanceReference = {
    provenanceVersion: params.provenance.provenanceVersion,
    provenanceDigest: params.provenance.provenanceDigest,
  };
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
      capture_experience:
        submission.adDestination === "meta_instant_form"
          ? "meta_instant_form"
          : "dealflow_website",
      ad_destination: submission.adDestination,
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
    customLeadFormQuestions: effectiveLeadFormQuestions,
    onboardingProvenance: {
      ...provenanceReference,
      inputDigest: params.provenance.funnelInputDigest,
    },
  };
  const planRecord = params.currentPlan && typeof params.currentPlan === "object"
    ? (params.currentPlan as Record<string, unknown>)
    : {};
  const creativeBrief = planRecord.creative_brief && typeof planRecord.creative_brief === "object"
    ? (planRecord.creative_brief as Record<string, unknown>)
    : {};

  return mergeCampaignPlanDocument(readCampaignPlanDocument(params.currentPlan), {
      industry_mode: "real_estate",
      onboarding_contract_version: ONBOARDING_CONTRACT_VERSION,
      onboarding_contract: submission as unknown as Record<string, unknown>,
      onboarding_provenance: params.provenance,
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
      lead_form_questions: effectiveLeadFormQuestions,
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
      creative_brief: {
        ...creativeBrief,
        onboardingProvenance: {
          ...provenanceReference,
          inputDigest: params.provenance.creativeInputDigest,
        },
      },
      launch_input_provenance: {
        ...provenanceReference,
        inputDigest: params.provenance.launchInputDigest,
      },
      campaign_payload: {
        market: submission.market,
        audience: submission.audience,
        key_offer: submission.offer,
        property_type: submission.propertyType,
        price_range: submission.priceRange,
        daily_budget_cents: submission.dailyBudgetCents,
        language: submission.funnelLanguage,
        capture_experience:
          submission.adDestination === "meta_instant_form"
            ? "meta_instant_form"
            : "dealflow_website",
        ad_destination: submission.adDestination,
        lead_capture_mode: submission.leadCaptureMode,
        lead_form_questions: effectiveLeadFormQuestions,
        theme: funnel.theme,
        funnel,
        onboardingProvenance: {
          ...provenanceReference,
          inputDigest: params.provenance.campaignInputDigest,
        },
      },
    });
}

export async function GET() {
  try {
    const { supabase, context } = await getAuthenticatedRequestContext();
    const { data, error } = await (supabase as any)
      .from("onboarding_drafts")
      .select("contract_version,payload,current_step,furthest_step_index,revision,payload_digest,expires_at,updated_at")
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
      revision: Number(data.revision),
      draftPayloadDigest: data.payload_digest,
      expiresAt: data.expires_at,
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

    const envelope = await parseJsonBody(request, onboardingDraftWriteSchema, {
      maxBytes: 64 * 1024,
      code: "onboarding_draft_body_too_large",
    });

    const { data, error } = await (supabase as any).rpc("save_onboarding_draft_v2", {
      p_organization_id: context.organization.id,
      p_user_id: context.user.id,
      p_expected_revision: envelope.expectedRevision,
      p_contract_version: ONBOARDING_CONTRACT_VERSION,
      p_payload: envelope.draft,
      p_current_step: envelope.currentStep,
      p_furthest_step_index: envelope.furthestStepIndex,
    });
    if (error) mapOnboardingRpcError(error, "onboarding_draft_persist_failed");
    const saved = Array.isArray(data) ? data[0] : data;
    if (!saved || !Number.isInteger(Number(saved.accepted_revision))) {
      throw new ApiError(500, "Onboarding draft could not be saved.", "onboarding_draft_persist_failed");
    }

    return NextResponse.json({
      saved: true,
      contractVersion: ONBOARDING_CONTRACT_VERSION,
      revision: Number(saved.accepted_revision),
      draftPayloadDigest: saved.accepted_payload_digest,
      expiresAt: saved.accepted_expires_at,
      reusedConsumedReceipt: saved.reused_consumed_receipt === true,
    });
  } catch (error) {
    return handleApiError(error, "Onboarding draft write");
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOriginRequest(request);
    const { supabase, context } = await getAuthenticatedRequestContext();
    const text = await request.text();
    const payload = text.trim() ? onboardingDraftDeleteSchema.parse(JSON.parse(text)) : {};
    const { data, error } = await (supabase as any).rpc("delete_onboarding_draft_v2", {
      p_organization_id: context.organization.id,
      p_user_id: context.user.id,
      p_expected_revision: payload.expectedRevision ?? null,
    });
    if (error) mapOnboardingRpcError(error, "onboarding_draft_delete_failed");
    return NextResponse.json({ deleted: data === true });
  } catch (error) {
    return handleApiError(error, "Onboarding draft delete");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const { context } = await getAuthenticatedRequestContext();
    const rateLimit = await consumeRateLimit({
      key: getRateLimitKey(request, "onboarding-plan", context.user.id),
      limit: 4,
      windowMs: 60_000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return buildRateLimitResponse(rateLimit.resetAt);
    }

    const requestPayload = await parseJsonBody(request, onboardingSubmitRequestSchema, {
      maxBytes: 64 * 1024,
      code: "onboarding_body_too_large",
    });
    const submission = requestPayload.submission;
    if (
      !hasOnlyApprovedRealtorQualificationQuestions({
        language: submission.funnelLanguage,
        questions: submission.leadFormQuestions,
      })
    ) {
      throw new ApiError(
        400,
        "Choose qualification questions from the approved realtor catalog.",
        "qualification_question_unsupported",
      );
    }
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
    const draftPayload = getDraftFromOnboardingSubmission(submission);
    const provenance = buildOnboardingProvenance(submission, requestPayload.draftPayloadDigest);
    const preparedPlan = await prepareCampaignPlanPayload(buildCampaignInput(submission), {
      onboarding_contract_version: ONBOARDING_CONTRACT_VERSION,
      onboarding_idempotency_key: idempotencyKey,
    });
    const completePlan = buildCompleteOnboardingContract({
      currentPlan: preparedPlan,
      submission,
      idempotencyKey,
      provenance,
    });
    const admin = createAdminClient();
    if (!admin) {
      throw new ApiError(503, "Onboarding persistence is unavailable.", "onboarding_service_unavailable");
    }
    const { data: submittedData, error: submitError } = await (admin as any).rpc(
      "submit_onboarding_draft_v2",
      {
        p_organization_id: context.organization.id,
        p_user_id: context.user.id,
        p_expected_revision: requestPayload.expectedRevision,
        p_draft_payload: draftPayload,
        p_draft_payload_digest: requestPayload.draftPayloadDigest,
        p_submission: submission,
        p_submission_input_digest: provenance.submissionInputDigest,
        p_provenance_version: ONBOARDING_PROVENANCE_VERSION,
        p_provenance_digest: provenance.provenanceDigest,
        p_campaign_id: deterministicCampaignId,
        p_campaign_plan: completePlan,
      },
    );
    if (submitError) mapOnboardingRpcError(submitError, "onboarding_submit_failed");
    const submitted = Array.isArray(submittedData) ? submittedData[0] : submittedData;
    const campaignId = typeof submitted?.submitted_campaign_id === "string"
      ? submitted.submitted_campaign_id
      : null;
    if (!campaignId) {
      throw new ApiError(500, "Onboarding campaign could not be created.", "onboarding_submit_failed");
    }

    await upsertAgentProfile({
      tenantId: context.organization.id,
      userId: context.user.id,
      firstName: submission.agentFirstName,
      lastName: submission.agentLastName,
      email: context.user.email || "",
      phoneRaw: normalizedAgentPhone,
      companyName: submission.agentCompanyName,
    });

    return NextResponse.json({
      success: true,
      campaignId,
      data: { campaignId },
      contractVersion: ONBOARDING_CONTRACT_VERSION,
      reusedExisting: submitted.reused_existing === true,
    });
  } catch (error) {
    return handleApiError(error, "Onboarding plan");
  }
}
