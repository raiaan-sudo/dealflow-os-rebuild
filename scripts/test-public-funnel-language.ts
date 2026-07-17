import assert from "node:assert/strict";
import {
  getPublicFunnelLanguage,
  getPublicFunnelOpenGraphLocale,
  getPublicFunnelPageCopy,
  normalizePublicFunnelLanguage,
  normalizePublicMetadataText,
} from "@/lib/public-funnel-language";
import { buildPublicFunnelThankYouViewModel } from "@/lib/public-funnel-thank-you";
import type { FullCampaignRecord } from "@/lib/types/campaign-records";
import {
  buildWinningHeadline,
  buildWinningQuizSteps,
  buildWinningSubheadline,
  buildWinningTrustBullets,
} from "@/lib/funnels/winning-template/variants";
import type { WinningFunnelInput } from "@/lib/funnels/winning-template/schema";

function buildRecord(params: {
  language: unknown;
  followUpAction?: string | null;
  bookingUrl?: string | null;
}) {
  return {
    campaign: { id: "campaign-language-test", name: "North Star Realty" },
    plan: {
      language: params.language,
      business_name: "North Star Realty",
      offer: "personalized homes",
      booking_url: params.bookingUrl,
    },
    funnel: {
      language: params.language,
      headline: "Personalized homes in Toronto",
      subheadline: "Tell us what you need and receive the strongest options.",
      follow_up_action: params.followUpAction ?? "show_thank_you_page",
    },
  } as unknown as FullCampaignRecord;
}

assert.equal(normalizePublicFunnelLanguage("en"), "en");
assert.equal(normalizePublicFunnelLanguage("fr"), "fr");
assert.equal(normalizePublicFunnelLanguage("es"), "es");
for (const unsupported of [undefined, null, "", "FR", "de", 7, {}, []]) {
  assert.equal(
    normalizePublicFunnelLanguage(unsupported),
    "en",
    `unsupported language ${String(unsupported)} must fall back to English`,
  );
}

assert.equal(getPublicFunnelOpenGraphLocale("en"), "en_CA");
assert.equal(getPublicFunnelOpenGraphLocale("fr"), "fr_CA");
assert.equal(getPublicFunnelOpenGraphLocale("es"), "es_ES");
assert.equal(getPublicFunnelPageCopy("en").defaultCta, "Submit");
assert.equal(getPublicFunnelPageCopy("fr").defaultCta, "Envoyer");
assert.equal(getPublicFunnelPageCopy("es").defaultCta, "Enviar");

const expected = {
  en: {
    headline: "Your request was received.",
    nextStep: "Next step",
    returnLabel: "Back to listing request",
    expectation: "We will review your request and follow up shortly with the clearest next step.",
  },
  fr: {
    headline: "Votre demande a été reçue.",
    nextStep: "Prochaine étape",
    returnLabel: "Retour à la demande immobilière",
    expectation: "Nous examinerons votre demande et communiquerons bientôt avec vous pour vous présenter la prochaine étape la plus claire.",
  },
  es: {
    headline: "Recibimos su solicitud.",
    nextStep: "Siguiente paso",
    returnLabel: "Volver a la solicitud inmobiliaria",
    expectation: "Revisaremos su solicitud y nos comunicaremos pronto con usted para explicarle el siguiente paso más claro.",
  },
} as const;

for (const language of ["en", "fr", "es"] as const) {
  const record = buildRecord({
    language,
    bookingUrl: "https://calendar.example.test/book",
  });
  const view = buildPublicFunnelThankYouViewModel({ record, slug: `language-${language}` });
  assert.equal(getPublicFunnelLanguage(record), language);
  assert.equal(view.language, language);
  assert.equal(view.headline, expected[language].headline);
  assert.equal(view.nextStepLabel, expected[language].nextStep);
  assert.equal(view.expectation, expected[language].expectation);
  assert.equal(view.primaryLink?.href, "https://calendar.example.test/book");
  assert.equal(view.secondaryLink.label, expected[language].returnLabel);
  assert.match(view.privacyBody, /Consent|consentement|consentimiento/i);
}

function buildWinningInput(language: "en" | "fr" | "es"): WinningFunnelInput {
  return {
    market: "Toronto",
    audience: "local families",
    offer: "Personalized home options",
    cta: "",
    leadType: "seller",
    campaignAngle: "seller_valuation",
    funnelGoal: "lead_form",
    marketType: "seller",
    language,
    leadCaptureMode: "quality_funnel",
    agentName: "Alex Agent",
    brokerageName: "North Star Realty",
    proofBadges: [],
    testimonials: [],
    theme: {
      primaryColor: "#17283c",
      secondaryColor: "#f8f2ea",
      accentColor: "#0f766e",
      fontPreset: "modern",
    },
  };
}

const frenchWinningInput = buildWinningInput("fr");
const frenchQuiz = buildWinningQuizSteps(frenchWinningInput);
assert.match(buildWinningHeadline(frenchWinningInput), /propriété/);
assert.match(buildWinningSubheadline(frenchWinningInput), /personnalisée/);
assert.doesNotMatch(buildWinningSubheadline(frenchWinningInput), /local families/i);
assert.ok(frenchQuiz[0]?.options?.includes("Vendre bientôt"));
assert.ok(frenchQuiz[2]?.options?.includes("Dans les 3 mois"));
assert.ok(buildWinningTrustBullets(frenchWinningInput).includes("Conseils locaux"));

const spanishWinningInput = buildWinningInput("es");
const spanishQuiz = buildWinningQuizSteps(spanishWinningInput);
assert.match(buildWinningHeadline(spanishWinningInput), /cuánto podría/);
assert.match(buildWinningSubheadline(spanishWinningInput), /según sus necesidades/);
assert.doesNotMatch(buildWinningSubheadline(spanishWinningInput), /local families/i);
assert.ok(spanishQuiz[0]?.options?.includes("Vender pronto"));
assert.ok(spanishQuiz[2]?.options?.includes("Dentro de 3 meses"));
assert.ok(buildWinningTrustBullets(spanishWinningInput).includes("Guía local"));

const invalidLanguageView = buildPublicFunnelThankYouViewModel({
  record: buildRecord({ language: "unsupported", bookingUrl: "javascript:alert(1)" }),
  slug: "invalid-language",
});
assert.equal(invalidLanguageView.language, "en");
assert.equal(invalidLanguageView.primaryLink, null, "unsafe booking protocols must be rejected");
assert.equal(invalidLanguageView.secondaryLink.label, "Return to page");

const customExpectation = buildPublicFunnelThankYouViewModel({
  record: buildRecord({ language: "fr", followUpAction: "Message personnalisé de l'équipe." }),
  slug: "custom-expectation",
});
assert.equal(customExpectation.expectation, "Message personnalisé de l'équipe.");

assert.equal(normalizePublicMetadataText("  A   clear   title  ", "Fallback", 70), "A clear title");
assert.equal(normalizePublicMetadataText("", "Fallback", 70), "Fallback");
const truncated = normalizePublicMetadataText("x".repeat(200), "Fallback", 20);
assert.equal(truncated.length, 20);
assert.ok(truncated.endsWith("…"));

console.log("public funnel EN/FR/ES language unit tests: PASS");
