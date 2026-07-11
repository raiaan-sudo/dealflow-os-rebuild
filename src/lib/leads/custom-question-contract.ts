export class CustomLeadAnswerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomLeadAnswerValidationError";
  }
}

export function normalizeCustomLeadQuestions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((question): question is string => typeof question === "string")
        .map((question) => question.trim())
        .filter(Boolean)
        .map((question) => question.slice(0, 240)),
    ),
  ).slice(0, 3);
}

export function validateCustomLeadAnswers(params: {
  configuredQuestions: unknown;
  submittedAnswers: unknown;
}) {
  const configuredQuestions = normalizeCustomLeadQuestions(params.configuredQuestions);
  const rawAnswers =
    params.submittedAnswers &&
    typeof params.submittedAnswers === "object" &&
    !Array.isArray(params.submittedAnswers)
      ? (params.submittedAnswers as Record<string, unknown>)
      : {};
  const submittedKeys = Object.keys(rawAnswers);

  if (submittedKeys.some((question) => !configuredQuestions.includes(question))) {
    throw new CustomLeadAnswerValidationError(
      "One or more qualification answers do not match this funnel.",
    );
  }

  const normalizedAnswers: Record<string, string> = {};

  for (const question of configuredQuestions) {
    const answer = typeof rawAnswers[question] === "string" ? rawAnswers[question].trim() : "";

    if (!answer) {
      throw new CustomLeadAnswerValidationError(
        "Answer every qualification question before submitting.",
      );
    }

    if (answer.length > 500) {
      throw new CustomLeadAnswerValidationError(
        "Qualification answers must be 500 characters or fewer.",
      );
    }

    normalizedAnswers[question] = answer;
  }

  if (configuredQuestions.length === 0 && submittedKeys.length > 0) {
    throw new CustomLeadAnswerValidationError(
      "This funnel does not accept custom qualification answers.",
    );
  }

  return normalizedAnswers;
}
