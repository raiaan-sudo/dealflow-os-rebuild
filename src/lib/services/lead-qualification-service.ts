import type { LeadFormTemplate } from "@/lib/services/lead-form-template-service";

export type NormalizedLeadPayload = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  answers: Record<string, string>;
};

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function normalizeLeadPayload(input: Record<string, unknown>): NormalizedLeadPayload {
  const answers: Record<string, string> = {};

  for (const [key, value] of Object.entries(input)) {
    const normalized = normalizeText(value);
    if (normalized) {
      answers[key] = normalized;
    }
  }

  return {
    fullName: normalizeText(input.full_name ?? input.name ?? input.fullName),
    email: normalizeText(input.email),
    phone: normalizeText(input.phone ?? input.phone_number),
    answers,
  };
}

export function scoreLeadQualification(params: {
  payload: NormalizedLeadPayload;
  template: LeadFormTemplate;
}) {
  let score = 0;
  const blockers: string[] = [];
  const reasons: string[] = [];

  if (params.payload.phone) {
    score += 25;
    reasons.push("phone_present");
  } else {
    blockers.push("phone_missing");
  }

  if (params.payload.email) {
    score += 15;
    reasons.push("email_present");
  }

  for (const question of params.template.questions) {
    if (!question.scoreWeight) continue;
    const answer = params.payload.answers[question.id];
    if (!answer) {
      if (question.required) blockers.push(`${question.id}_missing`);
      continue;
    }
    score += question.scoreWeight;
    reasons.push(`${question.id}_answered`);
  }

  const normalizedScore = Math.min(100, score);

  return {
    score: normalizedScore,
    qualified: blockers.length === 0 && normalizedScore >= 40,
    blockers,
    reasons,
  };
}
