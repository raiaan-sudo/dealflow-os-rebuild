import { z } from "zod";

// These schemas are loaded by the client onboarding route. Zod's default JIT
// capability probe uses Function(), which a strict production CSP must block.
// Construct every schema in CSP-safe interpreter mode instead.
z.config({ jitless: true });

export const ONBOARDING_CONTRACT_VERSION = 1 as const;
export const ONBOARDING_DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000;

export const campaignModeSchema = z.enum(["buyer", "seller", "investor", "commercial"]);
export const funnelLanguageSchema = z.enum(["en", "fr", "es"]);
export const campaignAdDestinationSchema = z.enum(["website", "meta_instant_form"]);
export const leadCaptureModeSchema = z.enum([
  "quality_funnel",
  "volume_lead_form",
  "deep_qualification",
]);
export const onboardingStepKeySchema = z.enum([
  "intent",
  "market",
  "property",
  "audience",
  "budget",
  "setup",
  "offer",
  "agent",
  "plan",
  "review",
]);

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color.");

export const onboardingDraftSchema = z
  .object({
    agentFirstName: z.string().trim().max(80),
    agentLastName: z.string().trim().max(80),
    agentCompanyName: z.string().trim().max(160),
    agentPhone: z.string().trim().max(40),
    campaignMode: campaignModeSchema,
    market: z.string().trim().max(160),
    audience: z.string().trim().max(500),
    propertyType: z.string().trim().max(240),
    priceRange: z.string().trim().max(120),
    dailyBudget: z.string().trim().max(20),
    offer: z.string().trim().max(500),
    funnelLanguage: funnelLanguageSchema,
    adDestination: campaignAdDestinationSchema.default("website"),
    leadCaptureMode: leadCaptureModeSchema,
    leadFormQuestions: z.array(requiredText("Lead-form question", 240)).max(3),
    leadFormQuestionDraft: z.string().max(240),
    themePrimaryColor: z.string().trim().max(20),
    themeSecondaryColor: z.string().trim().max(20),
    themeAccentColor: z.string().trim().max(20),
    logoUrl: z.string().trim().max(2_048),
    planTier: z.literal("pro"),
    idempotencySeed: z.string().trim().max(160),
  })
  .strict();

export const onboardingSubmissionSchema = onboardingDraftSchema
  .extend({
    contractVersion: z.literal(ONBOARDING_CONTRACT_VERSION),
    businessType: z.literal("real_estate_realtor"),
    dailyBudgetCents: z.number().int().min(500),
    monthlyBudget: z.number().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    const requiredFields = [
      ["agentFirstName", value.agentFirstName, "Agent first name"],
      ["agentLastName", value.agentLastName, "Agent last name"],
      ["agentCompanyName", value.agentCompanyName, "Company or brokerage"],
      ["agentPhone", value.agentPhone, "Agent phone"],
      ["market", value.market, "Market"],
      ["audience", value.audience, "Audience"],
      ["propertyType", value.propertyType, "Property type"],
      ["priceRange", value.priceRange, "Price range"],
      ["offer", value.offer, "Offer"],
      ["idempotencySeed", value.idempotencySeed, "Onboarding idempotency seed"],
    ] as const;

    for (const [field, fieldValue, label] of requiredFields) {
      if (!fieldValue.trim()) {
        context.addIssue({ code: "custom", path: [field], message: `${label} is required.` });
      }
    }

    if (!/^\d+(\.\d{1,2})?$/.test(value.dailyBudget)) {
      context.addIssue({ code: "custom", path: ["dailyBudget"], message: "Use a valid daily budget." });
    }

    for (const field of ["themePrimaryColor", "themeSecondaryColor", "themeAccentColor"] as const) {
      if (!hexColorSchema.safeParse(value[field]).success) {
        context.addIssue({ code: "custom", path: [field], message: "Use a six-digit hex color." });
      }
    }

    if (value.logoUrl && !/^https:\/\//i.test(value.logoUrl)) {
      context.addIssue({ code: "custom", path: ["logoUrl"], message: "Logo URL must use HTTPS." });
    }

    const expectedDailyBudgetCents = Math.round(Number.parseFloat(value.dailyBudget) * 100);
    const expectedMonthlyBudget = Math.round(expectedDailyBudgetCents * 30) / 100;

    if (value.dailyBudgetCents !== expectedDailyBudgetCents) {
      context.addIssue({
        code: "custom",
        path: ["dailyBudgetCents"],
        message: "Daily budget cents do not match the displayed daily budget.",
      });
    }

    if (Math.abs(value.monthlyBudget - expectedMonthlyBudget) > 0.001) {
      context.addIssue({
        code: "custom",
        path: ["monthlyBudget"],
        message: "Monthly budget does not match thirty days of the daily budget.",
      });
    }
  });

export const onboardingDraftEnvelopeSchema = z
  .object({
    contractVersion: z.literal(ONBOARDING_CONTRACT_VERSION),
    draft: onboardingDraftSchema,
    currentStep: onboardingStepKeySchema,
    furthestStepIndex: z.number().int().min(0).max(9),
  })
  .strict();

export const onboardingDraftWriteSchema = onboardingDraftEnvelopeSchema
  .extend({
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();

export const onboardingDraftDeleteSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();

export const onboardingSubmitRequestSchema = z
  .object({
    submission: onboardingSubmissionSchema,
    expectedRevision: z.number().int().min(1),
    draftPayloadDigest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const activationJourneyEventSchema = z.discriminatedUnion("eventName", [
  z
    .object({
      eventName: z.literal("onboarding_started"),
      idempotencyKey: requiredText("Idempotency key", 240),
      metadata: z
        .object({
          route: z.literal("onboarding"),
          mode: campaignModeSchema,
          planTier: z.literal("pro"),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      eventName: z.literal("onboarding_step_completed"),
      idempotencyKey: requiredText("Idempotency key", 240),
      metadata: z
        .object({
          stepKey: onboardingStepKeySchema,
          mode: campaignModeSchema,
          planTier: z.literal("pro"),
        })
        .strict(),
    })
    .strict(),
]);

export type CampaignMode = z.infer<typeof campaignModeSchema>;
export type FunnelLanguage = z.infer<typeof funnelLanguageSchema>;
export type CampaignAdDestination = z.infer<typeof campaignAdDestinationSchema>;
export type LeadCaptureMode = z.infer<typeof leadCaptureModeSchema>;
export type OnboardingStepKey = z.infer<typeof onboardingStepKeySchema>;
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;
export type OnboardingSubmission = z.infer<typeof onboardingSubmissionSchema>;
export type OnboardingDraftEnvelope = z.infer<typeof onboardingDraftEnvelopeSchema>;
export type OnboardingDraftWrite = z.infer<typeof onboardingDraftWriteSchema>;
export type OnboardingSubmitRequest = z.infer<typeof onboardingSubmitRequestSchema>;
export type ActivationJourneyEvent = z.infer<typeof activationJourneyEventSchema>;

export function buildOnboardingSubmission(draft: OnboardingDraft): OnboardingSubmission {
  const parsedDraft = onboardingDraftSchema.parse(draft);
  const dailyBudgetCents = Math.round(Number.parseFloat(parsedDraft.dailyBudget) * 100);

  return onboardingSubmissionSchema.parse({
    ...parsedDraft,
    contractVersion: ONBOARDING_CONTRACT_VERSION,
    businessType: "real_estate_realtor",
    dailyBudgetCents,
    monthlyBudget: Math.round(dailyBudgetCents * 30) / 100,
  });
}

export function getDraftFromOnboardingSubmission(
  submission: OnboardingSubmission,
): OnboardingDraft {
  const {
    contractVersion: _contractVersion,
    businessType: _businessType,
    dailyBudgetCents: _dailyBudgetCents,
    monthlyBudget: _monthlyBudget,
    ...draft
  } = submission;

  return onboardingDraftSchema.parse(draft);
}

export function buildOnboardingDraftEnvelope(params: {
  draft: OnboardingDraft;
  currentStep: OnboardingStepKey;
  furthestStepIndex: number;
}): OnboardingDraftEnvelope {
  return onboardingDraftEnvelopeSchema.parse({
    contractVersion: ONBOARDING_CONTRACT_VERSION,
    ...params,
  });
}

export function isUnexpiredNavigationState(
  value: unknown,
  now = Date.now(),
): value is {
  idempotencySeed: string;
  currentStep: OnboardingStepKey;
  furthestStepIndex: number;
  expiresAt: number;
} {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.idempotencySeed === "string" &&
    record.idempotencySeed.length > 0 &&
    onboardingStepKeySchema.safeParse(record.currentStep).success &&
    Number.isInteger(record.furthestStepIndex) &&
    typeof record.expiresAt === "number" &&
    record.expiresAt > now
  );
}
