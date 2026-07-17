#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ADVERTISING_CLAIM_POLICY_DIGEST,
  ADVERTISING_CLAIM_POLICY_MANIFEST,
  assertNoUnsupportedAdClaims,
  detectUnsupportedAdClaims,
} from "../src/lib/copy/claim-safety";
import {
  enhanceOffer,
  generateOfferVariations,
} from "../src/lib/copy/offer-enhancement";
import {
  generateAdCopy,
  generateCreativeCopyAssistant,
  generateUGCScript,
} from "../src/lib/services/copy-engine";
import { generateFunnel } from "../src/lib/services/funnel-engine";
import { buildCreativeBrief } from "../src/lib/ai/creative-brief";
import { normalizeOfferForCampaign } from "../src/lib/services/offer-normalization-service";
import { buildMarketingContext, buildMediaBuyingCopy } from "../src/lib/copy/marketing-transform";
import { buildCreativeSystem } from "../src/lib/services/creative-engine";
import { buildWinningFunnel } from "../src/lib/funnels/winning-template/build-winning-funnel";

function assertClaimSafe(value: unknown, label: string) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  assert.deepEqual(
    detectUnsupportedAdClaims(serialized),
    [],
    `${label} must not contain an unsupported outcome claim: ${serialized}`,
  );
  assert.doesNotThrow(() => assertNoUnsupportedAdClaims(serialized, label));
}

assert.equal(
  ADVERTISING_CLAIM_POLICY_DIGEST,
  `sha256:${createHash("sha256").update(ADVERTISING_CLAIM_POLICY_MANIFEST).digest("hex")}`,
  "claim-policy digest must match the exact versioned manifest",
);

const unsafeExamples = [
  "We guarantee your home sells in 90 days or we'll buy it",
  "If it doesn't sell, you don't pay",
  "Get approved with 600+ credit",
  "We guarantee a cash-flow positive property",
  "This is a risk-free offer",
  "Vente garantie et 100% gratuite sans obligation",
  "Aprobación garantizada, gratis y sin obligación",
  "Oportunidades fuera del mercado antes del público",
];

for (const example of unsafeExamples) {
  assert.ok(detectUnsupportedAdClaims(example).length > 0, `detector must reject: ${example}`);
}

assertClaimSafe(generateOfferVariations("", "seller"), "empty seller offer variations");
assertClaimSafe(
  generateOfferVariations("We guarantee your home sells in 90 days or we'll buy it", "seller"),
  "seller guarantee variations",
);
assertClaimSafe(enhanceOffer("Guaranteed approval with 600 credit", "buyer"), "buyer approval offer");

const assistant = generateCreativeCopyAssistant({
  location: "Toronto",
  audience: "homeowners",
  market_type: "seller",
  offer: "We guarantee your home sells in 90 days or we'll buy it",
  risk_reversal: "If it doesn't sell, you don't pay",
});
assertClaimSafe(assistant, "copy assistant");
assert.match(JSON.stringify(assistant), /Toronto|sale plan/i, "safe copy must retain useful context");

const adCopy = generateAdCopy({
  location: "Toronto",
  audience: "homeowners",
  market_type: "seller",
  offer: "Sell your home in 90 days guaranteed",
  risk_reversal: "If it doesn't sell, you don't pay",
  creatives: [
    {
      hook: "Sell your home in 90 days guaranteed",
      angle: "pain",
      format: "ugc",
      concept: "seller plan",
    },
  ],
});
assertClaimSafe(adCopy, "generated ad copy");

assertClaimSafe(
  generateUGCScript("Get approved today. Guaranteed approval. No downside if you do not qualify."),
  "UGC script",
);

const funnel = generateFunnel({
  location: "Toronto",
  audience: "homeowners",
  market_type: "seller",
  offer: "90-day home sale guarantee or we'll buy it",
  headline: "Sell your home in 90 days guaranteed",
  subheadline: "If it doesn't sell, you don't pay",
  mechanism: "Guaranteed buyer demand",
});
assertClaimSafe(funnel, "funnel blueprint");

const brief = buildCreativeBrief({
  location: "Toronto",
  audience: "homeowners",
  market_type: "seller",
  key_offer: "Sell your home in 90 days guaranteed",
  mechanism: "If it doesn't sell, you don't pay",
  pain_points: ["Risk-free sale outcome"],
});
assertClaimSafe(brief, "creative brief");

const normalized = normalizeOfferForCampaign("Guaranteed 90-day home sale", "seller");
assertClaimSafe(normalized.normalizedOffer, "normalized offer");
assertClaimSafe(normalized.cta, "normalized offer CTA");
assertClaimSafe(normalized.alternates, "normalized offer alternates");

const marketingContext = buildMarketingContext({
  intent: "seller",
  market: "Toronto",
  primaryGoal: "12 leads per month",
  audience: "homeowners",
  propertyType: "homes",
  keyOffer: "Free 90-day guaranteed sale or we'll buy it",
  painPoints: ["No-obligation offer", "Need serious buyers"],
  mechanism: "Qualified buyer network",
});
assertClaimSafe(marketingContext, "live marketing context");
assertClaimSafe(buildMediaBuyingCopy(marketingContext, "Sell in 90 days guaranteed"), "live media-buying copy");

const creativeSystem = buildCreativeSystem({
  location: "Toronto",
  audience: "homeowners",
  property_type: "homes",
  market_type: "seller",
  offer: "Free 90-day guaranteed sale or we'll buy it",
  mechanism: "Qualified buyer network",
  desired_result: "12 leads per month at $10 CPL",
  pain_points: ["No-obligation offer", "Need serious buyers"],
});
assertClaimSafe({
  brief: {
    keyOffer: creativeSystem.brief.keyOffer,
    mechanism: creativeSystem.brief.mechanism,
    painPoints: creativeSystem.brief.painPoints,
    angles: creativeSystem.brief.angles,
    hooks: creativeSystem.brief.hooks,
  },
  items: creativeSystem.items.map((item) => ({
    title: item.title,
    hook: item.hook,
    overlayText: item.overlayText,
    primaryText: item.primaryText,
    headline: item.headline,
    cta: item.cta,
    concept: item.concept,
    imagePrompt: item.imagePrompt,
    scriptLines: item.scriptLines,
    onScreenText: item.onScreenText,
  })),
  staticAds: creativeSystem.staticAds.map((asset) => ({
    visualConcept: asset.visualConcept,
    imagePrompt: asset.imagePrompt,
    providerPrompt: asset.imagePromptConfig?.prompt,
    hook: asset.hook,
    overlayText: asset.overlayText,
    primaryText: asset.primaryText,
    headline: asset.headline,
    cta: asset.cta,
  })),
  videoAds: creativeSystem.videoAds.map((asset) => ({
    title: asset.title,
    hook: asset.hook,
    script: asset.script,
    onScreenText: asset.onScreenText,
    cta: asset.cta,
  })),
}, "live creative system external fields");

for (const fixture of [
  {
    language: "en",
    offer: "Free guaranteed 90-day sale or we'll buy it",
    headline: "Sell your home in 90 days guaranteed",
    subheadline: "No obligation and no cost",
    proofBadges: ["100% Free", "Qualified buyers"],
  },
  {
    language: "fr",
    offer: "Vente garantie et 100% gratuite",
    headline: "Vente garantie sans obligation",
    subheadline: "Occasions hors marché avant le public",
    proofBadges: ["100% gratuit", "Sans obligation"],
  },
  {
    language: "es",
    offer: "Venta garantizada y gratis",
    headline: "Aprobación garantizada",
    subheadline: "Fuera del mercado antes del público",
    proofBadges: ["100% gratis", "Sin obligación"],
  },
] as const) {
  const winning = buildWinningFunnel({
    market: "Toronto",
    audience: "homeowners",
    market_type: "seller",
    funnel_goal: "lead_form",
    ...fixture,
  });
  assertClaimSafe({
    headline: winning.headline,
    subheadline: winning.subheadline,
    cta: winning.cta,
    proofBadges: winning.proofBadges,
    sections: winning.sections
      .filter((section) => section.type !== "objections")
      .map((section) => ({ title: section.title, content: section.content })),
  }, `winning funnel ${fixture.language}`);
}

console.log("Unsupported advertising claim safety tests passed.");
