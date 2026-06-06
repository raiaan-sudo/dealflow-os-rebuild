import { createHash } from "node:crypto";
import {
  isLiveMetaLeadFormCreationAllowed,
  type LeadCaptureStrategy,
} from "@/lib/services/lead-capture-strategy-service";
import { buildMetaLeadFormQuestions } from "@/lib/services/lead-form-question-builder";
import { getLeadFormTemplate } from "@/lib/services/lead-form-template-service";

export type MetaLeadFormPreview = {
  idempotencyKey: string;
  formName: string;
  mockLeadFormId: string;
  specialAdCategory: LeadCaptureStrategy["special_ad_category"];
  questions: ReturnType<typeof buildMetaLeadFormQuestions>;
};

function hash(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function buildMetaLeadFormPreview(params: {
  campaignId: string;
  organizationId: string;
  strategy: LeadCaptureStrategy;
  formName?: string | null;
}): MetaLeadFormPreview {
  const template = getLeadFormTemplate(params.strategy.lead_form_template_id);
  const questions = buildMetaLeadFormQuestions(template);
  const idempotencyKey = hash(
    [
      params.organizationId,
      params.campaignId,
      params.strategy.lead_capture_goal,
      params.strategy.capture_method,
      template.id,
    ].join(":"),
  );

  return {
    idempotencyKey,
    formName: params.formName?.trim() || `${template.name} - ${params.campaignId}`,
    mockLeadFormId: `mock_meta_lead_form_${idempotencyKey}`,
    specialAdCategory: params.strategy.special_ad_category,
    questions,
  };
}

export function assertLiveMetaLeadFormCreationAllowed(env: NodeJS.ProcessEnv = process.env) {
  if (!isLiveMetaLeadFormCreationAllowed(env)) {
    throw new Error(
      "Live Meta lead form creation is disabled. Enable META_INSTANT_FORMS_ENABLED, LEAD_FORM_LAUNCH_ENABLED, and ALLOW_META_LIVE_LAUNCH before mutating Meta.",
    );
  }
}

export async function createMetaLeadForm(params: {
  campaignId: string;
  organizationId: string;
  strategy: LeadCaptureStrategy;
  env?: NodeJS.ProcessEnv;
  mockOnly?: boolean;
}) {
  const preview = buildMetaLeadFormPreview(params);

  if (params.mockOnly) {
    return { mode: "mock" as const, leadFormId: preview.mockLeadFormId, preview };
  }

  assertLiveMetaLeadFormCreationAllowed(params.env);

  throw new Error("Live Meta lead form creation requires the Meta Graph mutation adapter.");
}
