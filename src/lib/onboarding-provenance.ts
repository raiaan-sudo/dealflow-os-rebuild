import { createHash } from "node:crypto";
import type { OnboardingSubmission } from "@/lib/onboarding-contract";

export const ONBOARDING_PROVENANCE_VERSION = 1 as const;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function digestOnboardingInput(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function buildOnboardingProvenance(
  submission: OnboardingSubmission,
  draftPayloadDigest: string,
) {
  const submissionInputDigest = digestOnboardingInput(submission);
  const campaignInputDigest = digestOnboardingInput({
    campaignMode: submission.campaignMode,
    market: submission.market,
    audience: submission.audience,
    propertyType: submission.propertyType,
    priceRange: submission.priceRange,
    offer: submission.offer,
  });
  const funnelInputDigest = digestOnboardingInput({
    market: submission.market,
    audience: submission.audience,
    offer: submission.offer,
    language: submission.funnelLanguage,
    destination: submission.adDestination,
    leadCaptureMode: submission.leadCaptureMode,
    questions: submission.leadFormQuestions,
    theme: {
      primary: submission.themePrimaryColor,
      secondary: submission.themeSecondaryColor,
      accent: submission.themeAccentColor,
      logoUrl: submission.logoUrl || null,
    },
  });
  const creativeInputDigest = digestOnboardingInput({
    campaignMode: submission.campaignMode,
    market: submission.market,
    audience: submission.audience,
    propertyType: submission.propertyType,
    priceRange: submission.priceRange,
    offer: submission.offer,
    language: submission.funnelLanguage,
  });
  const launchInputDigest = digestOnboardingInput({
    dailyBudgetCents: submission.dailyBudgetCents,
    monthlyBudget: submission.monthlyBudget,
    destination: submission.adDestination,
    leadCaptureMode: submission.leadCaptureMode,
  });
  const provenanceDigest = digestOnboardingInput({
    provenanceVersion: ONBOARDING_PROVENANCE_VERSION,
    draftPayloadDigest,
    submissionInputDigest,
    campaignInputDigest,
    funnelInputDigest,
    creativeInputDigest,
    launchInputDigest,
  });

  return {
    provenanceVersion: ONBOARDING_PROVENANCE_VERSION,
    draftPayloadDigest,
    submissionInputDigest,
    campaignInputDigest,
    funnelInputDigest,
    creativeInputDigest,
    launchInputDigest,
    provenanceDigest,
  };
}
