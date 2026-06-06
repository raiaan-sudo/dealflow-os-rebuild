import type { LeadFormQuestion, LeadFormTemplate } from "@/lib/services/lead-form-template-service";

export type MetaLeadFormQuestion = {
  key: string;
  label: string;
  type: "FULL_NAME" | "EMAIL" | "PHONE" | "CUSTOM" | "CUSTOM_WITH_OPTIONS";
  required: boolean;
  options?: string[];
};

function mapQuestionType(question: LeadFormQuestion): MetaLeadFormQuestion["type"] {
  if (question.type === "full_name") return "FULL_NAME";
  if (question.type === "email") return "EMAIL";
  if (question.type === "phone") return "PHONE";
  if (question.type === "multiple_choice") return "CUSTOM_WITH_OPTIONS";
  return "CUSTOM";
}

export function buildMetaLeadFormQuestions(template: LeadFormTemplate): MetaLeadFormQuestion[] {
  return template.questions
    .filter((question) => question.type !== "privacy_disclaimer")
    .map((question) => ({
      key: question.id,
      label: question.label,
      type: mapQuestionType(question),
      required: question.required,
      ...(question.options?.length ? { options: [...question.options] } : {}),
    }));
}

export function buildWebsiteFunnelFormFields(template: LeadFormTemplate) {
  return template.questions
    .filter((question) => ["full_name", "email", "phone", "short_text"].includes(question.type))
    .map((question) => question.id);
}
