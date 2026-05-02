import type { CampaignInput } from "@/lib/optimization-engine/index";
import { selectMediaBuyerCta } from "@/lib/optimization-engine/media-buying-rules";

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
        "Keep cold traffic on a simple opt-in: outcome-led offer, mechanism, proof, risk reversal, FAQ, and one short form.",
      bulletsMax: 5,
      formFields: ["name", "email", "phone"],
      cta: selectMediaBuyerCta(input.audience),
    },
    allowMultiStep: false,
    followUpAction: "Qualify the lead, deliver the promised asset, and move directly into booking or review.",
  };
}
