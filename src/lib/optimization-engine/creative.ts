import type { CampaignInput } from "@/lib/optimization-engine/index";

export type CreativeValidationResult = {
  accepted: boolean;
  reasons: string[];
};

export type CreativePlan = {
  totalCreatives: number;
  videoCreatives: number;
  staticCreatives: number;
  minVideoRatio: number;
  primaryFormat: "talking_head_ugc";
  scriptStructure: ["Hook", "Problem", "Mechanism", "CTA"];
  hookRequirements: string[];
  rejectionPatterns: string[];
  refreshCadenceDays: number;
  fullRefreshTriggers: string[];
};

export function buildCreativePlan(input: CampaignInput): CreativePlan {
  const totalCreatives = input.budget >= 100 ? 8 : 6;
  const videoCreatives = Math.ceil(totalCreatives / 2);

  return {
    totalCreatives,
    videoCreatives,
    staticCreatives: totalCreatives - videoCreatives,
    minVideoRatio: 0.5,
    primaryFormat: "talking_head_ugc",
    scriptStructure: ["Hook", "Problem", "Mechanism", "CTA"],
    hookRequirements: [
      "Call out the ICP in the first three seconds, or lead with the core claim.",
      "Enter through pain, opportunity, or a direct market problem.",
      `Keep ${input.offer} visible before the CTA.`,
    ],
    rejectionPatterns: [
      "Self-focused script",
      "Long intro",
      "No hook",
      "No CTA",
      "Overly polished generic visuals",
    ],
    refreshCadenceDays: 30,
    fullRefreshTriggers: [
      "Performance declines",
      "Creative fatigue appears",
      "The market shifts enough to weaken the current hook",
    ],
  };
}

export function validateCreativeScript(script: string): CreativeValidationResult {
  const normalized = script.toLowerCase();
  const reasons: string[] = [];

  if (!normalized.includes("cta") && !normalized.includes("call to action")) {
    reasons.push("Script does not contain an explicit CTA.");
  }

  if (!normalized.includes("hook")) {
    reasons.push("Script structure is missing a clear hook.");
  }

  if (normalized.includes("my name is") || normalized.includes("i'm an agent")) {
    reasons.push("Script starts too self-focused.");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
  };
}
