import type { CreativeBrief } from "@/lib/ai/creative-brief";

export type AvatarProfile = {
  id: "young_agent" | "trusted_expert" | "ugc_casual";
  genderPresentation: string;
  ageRange: string;
  stylePersona: string;
  energy: string;
  nicheFit: string;
};

export type VoiceProfile = {
  id: "confident" | "friendly" | "authoritative";
  tone: string;
  accent: string;
  speed: string;
  authorityLevel: string;
};

export function selectAvatarProfile(brief: CreativeBrief): AvatarProfile {
  if (/first|new|starter/i.test(brief.audience)) {
    return {
      id: "young_agent",
      genderPresentation: "approachable professional",
      ageRange: "26-34",
      stylePersona: "young local agent",
      energy: "upbeat",
      nicheFit: `${brief.audience} in ${brief.location}`,
    };
  }

  if (/investor|investment|cashflow/i.test(brief.audience)) {
    return {
      id: "trusted_expert",
      genderPresentation: "polished professional",
      ageRange: "35-50",
      stylePersona: "trusted real estate expert",
      energy: "calm and decisive",
      nicheFit: `${brief.audience} in ${brief.location}`,
    };
  }

  return {
    id: "ugc_casual",
    genderPresentation: "friendly relatable",
    ageRange: "28-40",
    stylePersona: "casual UGC creator",
    energy: "warm and conversational",
    nicheFit: `${brief.audience} in ${brief.location}`,
  };
}

export function selectVoiceProfile(brief: CreativeBrief): VoiceProfile {
  if (/first|new|starter/i.test(brief.audience)) {
    return {
      id: "friendly",
      tone: "friendly and reassuring",
      accent: "local neutral",
      speed: "medium",
      authorityLevel: "medium",
    };
  }

  if (/investor|investment|cashflow/i.test(brief.audience)) {
    return {
      id: "authoritative",
      tone: "authoritative and sharp",
      accent: "local neutral",
      speed: "measured",
      authorityLevel: "high",
    };
  }

  return {
    id: "confident",
    tone: "confident and clear",
    accent: "local neutral",
    speed: "medium",
    authorityLevel: brief.scriptStyle === "authority" ? "high" : "medium",
  };
}
