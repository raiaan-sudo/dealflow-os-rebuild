import type {
  FormFrictionLevel,
  LeadCaptureGoal,
} from "@/lib/services/lead-capture-strategy-service";

export type LeadFormQuestionType =
  | "full_name"
  | "email"
  | "phone"
  | "short_text"
  | "multiple_choice"
  | "privacy_disclaimer";

export type LeadFormQuestion = {
  id: string;
  label: string;
  type: LeadFormQuestionType;
  required: boolean;
  options?: string[];
  scoreWeight?: number;
};

export type LeadFormTemplate = {
  id: string;
  name: string;
  goal: LeadCaptureGoal;
  frictionLevel: FormFrictionLevel;
  consentRequired: boolean;
  questions: LeadFormQuestion[];
};

export const BUILT_IN_LEAD_FORM_TEMPLATES: LeadFormTemplate[] = [
  {
    id: "volume_instant_form",
    name: "Higher Volume Instant Form",
    goal: "volume",
    frictionLevel: "low",
    consentRequired: true,
    questions: [
      { id: "full_name", label: "Full name", type: "full_name", required: true },
      { id: "phone", label: "Phone number", type: "phone", required: true },
      { id: "email", label: "Email", type: "email", required: true },
    ],
  },
  {
    id: "balanced_instant_form",
    name: "Balanced Qualified Instant Form",
    goal: "balanced",
    frictionLevel: "medium",
    consentRequired: true,
    questions: [
      { id: "full_name", label: "Full name", type: "full_name", required: true },
      { id: "phone", label: "Phone number", type: "phone", required: true },
      { id: "email", label: "Email", type: "email", required: true },
      {
        id: "buying_timeline",
        label: "When are you hoping to move?",
        type: "multiple_choice",
        required: true,
        options: ["0-3 months", "3-6 months", "6+ months", "Just researching"],
        scoreWeight: 20,
      },
      {
        id: "target_area",
        label: "Which area are you most interested in?",
        type: "short_text",
        required: false,
        scoreWeight: 10,
      },
    ],
  },
  {
    id: "quality_website_funnel",
    name: "Higher Quality Website Funnel",
    goal: "quality",
    frictionLevel: "high",
    consentRequired: true,
    questions: [
      { id: "full_name", label: "Full name", type: "full_name", required: true },
      { id: "phone", label: "Phone number", type: "phone", required: true },
      { id: "email", label: "Email", type: "email", required: true },
      {
        id: "budget_or_value_range",
        label: "What price range are you considering?",
        type: "short_text",
        required: true,
        scoreWeight: 20,
      },
      {
        id: "appointment_interest",
        label: "Would you like a short consultation?",
        type: "multiple_choice",
        required: true,
        options: ["Yes", "Maybe later", "No"],
        scoreWeight: 30,
      },
    ],
  },
];

export function getLeadFormTemplate(templateId: string | null | undefined) {
  return (
    BUILT_IN_LEAD_FORM_TEMPLATES.find((template) => template.id === templateId) ??
    BUILT_IN_LEAD_FORM_TEMPLATES.find((template) => template.id === "balanced_instant_form") ??
    BUILT_IN_LEAD_FORM_TEMPLATES[0]
  );
}

export function getLeadFormTemplateForGoal(goal: LeadCaptureGoal) {
  return (
    BUILT_IN_LEAD_FORM_TEMPLATES.find((template) => template.goal === goal) ??
    getLeadFormTemplate("balanced_instant_form")
  );
}

export function validateLeadFormTemplate(
  template: LeadFormTemplate,
  params: { privacyPolicyUrl?: string | null; smsConsentEnabled?: boolean | null },
) {
  const blockers: string[] = [];

  if (!template.questions.some((question) => question.type === "phone" && question.required)) {
    blockers.push("required_phone_missing");
  }

  if (!template.questions.some((question) => question.type === "email" && question.required)) {
    blockers.push("required_email_missing");
  }

  if (template.consentRequired && params.smsConsentEnabled !== true) {
    blockers.push("sms_consent_disabled");
  }

  if (!params.privacyPolicyUrl?.trim()) {
    blockers.push("privacy_policy_url_missing");
  }

  return {
    valid: blockers.length === 0,
    blockers,
  };
}
