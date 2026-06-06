import type { LeadCaptureStrategy } from "@/lib/services/lead-capture-strategy-service";
import { getLeadFormTemplate, validateLeadFormTemplate } from "@/lib/services/lead-form-template-service";

export type LeadCaptureReadiness = {
  ready: boolean;
  method: LeadCaptureStrategy["capture_method"];
  goal: LeadCaptureStrategy["lead_capture_goal"];
  blockers: string[];
  warnings: string[];
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluateLeadCaptureReadiness(params: {
  strategy: LeadCaptureStrategy;
  funnelExists?: boolean;
  metaConnected?: boolean;
  pageSelected?: boolean;
  adAccountSelected?: boolean;
  pixelSelected?: boolean;
  privacyPolicyUrl?: string | null;
}) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const template = getLeadFormTemplate(params.strategy.lead_form_template_id);
  const privacyPolicyUrl = params.strategy.privacy_policy_url ?? params.privacyPolicyUrl ?? null;
  const templateValidation = validateLeadFormTemplate(template, {
    privacyPolicyUrl,
    smsConsentEnabled: params.strategy.sms_consent_enabled,
  });

  if (params.strategy.capture_method === "website_funnel") {
    if (!params.funnelExists && !hasText(params.strategy.funnel_id)) {
      blockers.push("website_funnel_missing");
    }
  } else {
    if (!params.metaConnected) blockers.push("meta_connection_missing");
    if (!params.adAccountSelected) blockers.push("meta_ad_account_missing");
    if (!params.pageSelected) blockers.push("meta_page_missing");
    if (!params.pixelSelected) warnings.push("pixel_missing_for_reporting");
    if (params.strategy.special_ad_category !== "HOUSING") {
      blockers.push("housing_special_ad_category_missing");
    }
  }

  blockers.push(...templateValidation.blockers);

  return {
    ready: blockers.length === 0,
    method: params.strategy.capture_method,
    goal: params.strategy.lead_capture_goal,
    blockers,
    warnings,
  } satisfies LeadCaptureReadiness;
}
