export type CreativeIntakeTargetLanguage = "en" | "fr" | "es";

export const creativeLanguageLabels: Record<CreativeIntakeTargetLanguage, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
};

export const creativeLanguageInstructions: Record<CreativeIntakeTargetLanguage, string> = {
  en: "Write all visible ad copy, UGC dialogue, captions, and CTA language in natural English.",
  fr: "Write all visible ad copy, UGC dialogue, captions, and CTA language in natural French. Do not mix in English.",
  es: "Write all visible ad copy, UGC dialogue, captions, and CTA language in natural Spanish. Do not mix in English.",
};
