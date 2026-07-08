import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/route";

export type DealFlowInstantFormQuestion = {
  id?: string | null;
  key?: string | null;
  label: string;
  type: "short_text" | "paragraph" | "email" | "phone" | "multiple_choice" | "single_choice" | string;
  required?: boolean | null;
  options?: string[] | null;
};

export type MetaInstantFormQuestion = {
  key: string;
  label: string;
  type: "CUSTOM" | "EMAIL" | "PHONE" | "FULL_NAME";
  required: boolean;
  options?: string[];
};

export type MetaInstantFormPayload = {
  name: string;
  privacy_policy_url: string;
  follow_up_action_url: string;
  questions: MetaInstantFormQuestion[];
  payload_hash: string;
};

function cleanIdentifier(value: string | null | undefined, fallback: string) {
  const cleaned = value?.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function cleanLabel(value: string) {
  const label = value.trim();

  if (!label) {
    throw new ApiError(400, "Meta instant form questions require a label.", "meta_instant_form_question_label_missing");
  }

  return label.slice(0, 250);
}

function normalizeQuestionType(type: string): MetaInstantFormQuestion["type"] {
  const normalized = type.trim().toLowerCase();

  if (normalized === "email") {
    return "EMAIL";
  }

  if (normalized === "phone" || normalized === "phone_number") {
    return "PHONE";
  }

  if (normalized === "full_name" || normalized === "name") {
    return "FULL_NAME";
  }

  if (
    normalized === "short_text" ||
    normalized === "paragraph" ||
    normalized === "multiple_choice" ||
    normalized === "single_choice"
  ) {
    return "CUSTOM";
  }

  throw new ApiError(
    400,
    `Unsupported Meta instant form question type: ${type}.`,
    "meta_instant_form_question_type_unsupported",
  );
}

function cleanOptions(question: DealFlowInstantFormQuestion) {
  const type = question.type.trim().toLowerCase();

  if (type !== "multiple_choice" && type !== "single_choice") {
    return undefined;
  }

  const options = Array.from(new Set((question.options ?? []).map((option) => option.trim()).filter(Boolean)));

  if (options.length < 2) {
    throw new ApiError(
      400,
      "Meta instant form choice questions require at least two options.",
      "meta_instant_form_question_options_missing",
    );
  }

  return options.slice(0, 50);
}

export function buildMetaInstantFormPayload(params: {
  formName: string;
  privacyPolicyUrl: string;
  followUpActionUrl: string;
  questions: DealFlowInstantFormQuestion[];
}): MetaInstantFormPayload {
  const formName = params.formName.trim();
  const privacyPolicyUrl = params.privacyPolicyUrl.trim();
  const followUpActionUrl = params.followUpActionUrl.trim();

  if (!formName) {
    throw new ApiError(400, "Meta instant form name is required.", "meta_instant_form_name_missing");
  }

  for (const [field, value] of [
    ["privacy_policy_url", privacyPolicyUrl],
    ["follow_up_action_url", followUpActionUrl],
  ] as const) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:") {
        throw new Error("HTTPS is required.");
      }
    } catch {
      throw new ApiError(400, `${field} must be a valid HTTPS URL.`, `meta_instant_form_${field}_invalid`);
    }
  }

  const questions = params.questions.map((question, index) => ({
    key: cleanIdentifier(question.key ?? question.id, `question_${index + 1}`),
    label: cleanLabel(question.label),
    type: normalizeQuestionType(question.type),
    required: question.required !== false,
    ...(cleanOptions(question) ? { options: cleanOptions(question) } : {}),
  }));

  if (questions.length === 0) {
    throw new ApiError(400, "Meta instant forms require at least one question.", "meta_instant_form_questions_missing");
  }

  const canonical = JSON.stringify({
    name: formName,
    privacy_policy_url: privacyPolicyUrl,
    follow_up_action_url: followUpActionUrl,
    questions,
  });

  return {
    name: formName,
    privacy_policy_url: privacyPolicyUrl,
    follow_up_action_url: followUpActionUrl,
    questions,
    payload_hash: createHash("sha256").update(canonical).digest("hex"),
  };
}
