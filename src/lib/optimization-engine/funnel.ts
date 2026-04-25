import type { CampaignInput } from "@/lib/optimization-engine/index";

export type FunnelConfig = {
  type: "landing_page";
  variant: "short_opt_in" | "survey_opt_in";
  coldTrafficPolicy: "landing_page_only";
  structure: {
    headline: string;
    supportingCopy: string;
    bulletsMax: number;
    formFields: string[];
    cta: string;
  };
  allowMultiStep: false;
  followUpAction: string;
};

export function buildFunnelConfig(
  input: CampaignInput,
  options?: { surveyEnabled?: boolean },
): FunnelConfig {
  return {
    type: "landing_page",
    variant: options?.surveyEnabled ? "survey_opt_in" : "short_opt_in",
    coldTrafficPolicy: "landing_page_only",
    structure: {
      headline: `${input.offer} for ${input.location}.`,
      supportingCopy:
        "Keep the first step simple: outcome-led promise, short support copy, tight proof, and one form submission path.",
      bulletsMax: 5,
      formFields: ["name", "email", "phone"],
      cta: "Get the next step",
    },
    allowMultiStep: false,
    followUpAction: "Qualify the lead, deliver the promised asset, and move directly into booking or review.",
  };
}
