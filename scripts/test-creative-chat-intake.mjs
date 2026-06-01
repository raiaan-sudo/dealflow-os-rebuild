import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";

Module._load = function load(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }

  return originalLoad.call(this, request, parent, isMain);
};

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolve.call(
      this,
      path.join(repoRoot, "src", request.slice(2)),
      parent,
      isMain,
      options,
    );
  }

  return originalResolve.call(this, request, parent, isMain, options);
};

Module._extensions[".ts"] = function loadTs(module, filename) {
  const source = ts.sys.readFile(filename);
  const output = ts.transpileModule(source ?? "", {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const require = createRequire(import.meta.url);
const {
  buildCreativeIntakeBrief,
  buildCreativeIntakePromptVersion,
  createCreativeIntakeState,
  creativeIntakeIncludesStatic,
  creativeIntakeIncludesUgcVideo,
  getApprovedCreativeIntakeGenerationContext,
  hasSameCreativeIntakeGenerationContext,
  isCreativeChatIntakeEnabled,
  isCreativeIntakeApproved,
  mergeCreativeChatIntakeIntoPlan,
  readCreativeChatIntakeFromPlan,
  softenRegulatedClaims,
} = require("../src/lib/services/creative-chat-intake-service.ts");
const {
  generateStaticCreativeAds,
} = require("../src/lib/services/creative-engine.ts");
const {
  persistStaticCreativeAssets,
} = require("../src/lib/services/static-creative-asset-service.ts");
const {
  buildCreativeUgcScriptDraft,
  inferCreativeUgcAudienceKind,
  normalizeCreativeOfferTitle,
  resolveUgcScriptContext,
  validateCreativeUgcScriptDraft,
} = require("../src/lib/services/creative-ugc-script-service.ts");
const {
  getSavedCampaignDocumentFromRow,
} = require("../src/lib/services/canonical-campaign.ts");
const {
  normalizeOfferForCampaign,
} = require("../src/lib/services/offer-normalization-service.ts");

const creativeChatIntakeUi = fs.readFileSync("src/app/(app)/build/creatives/creative-chat-intake.tsx", "utf8");
const creativeWizardUi = fs.readFileSync("src/app/(app)/build/creatives/creative-wizard.tsx", "utf8");
const staticAdsRoute = fs.readFileSync("src/app/api/campaigns/[id]/generate-static-ads/route.ts", "utf8");
const videoRoute = fs.readFileSync("src/app/api/campaigns/[id]/generate-video/route.ts", "utf8");
const prepaywallPreviewUi = fs.readFileSync("src/components/onboarding/prepaywall-campaign-preview.tsx", "utf8");
const staticCreativePreviewCardUi = fs.readFileSync("src/components/campaign/static-creative-preview-card.tsx", "utf8");
const previewPageUi = fs.readFileSync("src/app/(app)/preview/page.tsx", "utf8");
const selectAdRoute = fs.readFileSync("src/app/api/campaigns/[id]/select-ad/route.ts", "utf8");
delete process.env.CREATIVE_CHAT_INTAKE_ENABLED;
delete process.env.NEXT_PUBLIC_ENABLE_CREATIVE_CHAT_INTAKE;
assert.equal(isCreativeChatIntakeEnabled(), true);
process.env.CREATIVE_CHAT_INTAKE_ENABLED = "false";
assert.equal(isCreativeChatIntakeEnabled(), false);
delete process.env.CREATIVE_CHAT_INTAKE_ENABLED;
assert.match(creativeChatIntakeUi, /Draft recovered from your last session/);
assert.match(creativeChatIntakeUi, /Draft saved\. Your approved brief is ready for generation\./);
assert.match(creativeChatIntakeUi, /Draft saved\. Approve the UGC script before generating media\./);
assert.match(creativeChatIntakeUi, /aria-pressed/);
assert.match(creativeWizardUi, /Primary creative/);
assert.match(creativeWizardUi, /Review variant/);
assert.match(creativeWizardUi, /Add to review set/);
assert.match(creativeWizardUi, /Full-resolution creative files stay inside DealFlow/);
assert.match(creativeWizardUi, /Sent for generation\. Usually takes 90 seconds to 3 minutes/);
assert.match(creativeWizardUi, /Show preview renders/);
assert.doesNotMatch(creativeWizardUi, /Final Higgsfield ads are queued for rendering|finished Higgsfield ads pass review/);
assert.doesNotMatch(creativeWizardUi, /worker is available|Queued for render worker|product QA accepts|pass QA/);
assert.match(creativeWizardUi, /Render static creatives first/);
assert.doesNotMatch(staticAdsRoute, /regenerateStaticCreativeAssetsForUser/);
assert.match(staticAdsRoute, /outputMode:\s*"finished_ad"/);
assert.match(staticAdsRoute, /provider:\s*"higgsfield_marketing_studio"/);
assert.match(staticAdsRoute, /previewUpdated/);
assert.match(staticCreativePreviewCardUi, /Full-resolution creative files stay inside DealFlow and are used through the launch workflow/);
assert.match(selectAdRoute, /assertCampaignCanLaunch/);
assert.match(selectAdRoute, /!isLaunchReadyStaticCreative\(ad, staticBriefReadinessContext\)/);
assert.doesNotMatch(selectAdRoute, /Boolean\(ad\.imageUrl\) && !evaluateStaticVisualAssetDecision/);
assert.match(creativeChatIntakeUi, /Choose static ad direction/);
assert.match(creativeChatIntakeUi, /Brokerage brand/);
assert.match(creativeChatIntakeUi, /Century 21/);
assert.match(creativeChatIntakeUi, /Offer wording needs a compliant version before approval/);
assert.match(creativeChatIntakeUi, /UGC script/);
assert.match(creativeChatIntakeUi, /static_and_ugc/);
assert.match(creativeChatIntakeUi, /Final AI-rendered media updates after rendering completes and passes DealFlow review/);
assert.match(creativeChatIntakeUi, /Approved UGC script/);
assert.match(creativeChatIntakeUi, /Open Marketing Studio chat/);
assert.match(creativeChatIntakeUi, /Target length"[\s\S]*?updateAnswer\(\{ targetDurationSeconds: Number\(value\), ugcScriptApprovedAt: null \}\)/);
assert.match(creativeChatIntakeUi, /Creator persona"[\s\S]*?updateAnswer\(\{ creatorPersona: value, ugcScriptApprovedAt: null \}\)/);
assert.match(creativeChatIntakeUi, /Hook angle"[\s\S]*?activeHookOptions[\s\S]*?updateAnswer\(\{ hookAngle: value, ugcScriptApprovedAt: null \}\)/);
assert.match(creativeChatIntakeUi, /Early Access/);
assert.match(creativeChatIntakeUi, /Hidden Inventory/);
assert.match(creativeChatIntakeUi, /Budget Confidence/);
assert.match(creativeChatIntakeUi, /Buyer Demand/);
assert.match(creativeChatIntakeUi, /Avoid Underpricing/);
assert.match(creativeChatIntakeUi, /Classify the campaign before choosing this setting/);
assert.match(creativeChatIntakeUi, /Visual style"[\s\S]*?updateAnswer\(\{ visualStyle: value, ugcScriptApprovedAt: null \}\)/);
assert.match(creativeChatIntakeUi, /Refresh script draft/);
assert.match(creativeChatIntakeUi, /syncDerivedUgcAnswers/);
assert.match(creativeChatIntakeUi, /ensureCurrentCtaOnScreenText/);
assert.match(creativeChatIntakeUi, /Use Hook → Info\/proof → CTA/);
assert.match(creativeChatIntakeUi, /describeScriptReason/);
assert.doesNotMatch(creativeChatIntakeUi, /Pre-render UGC concepts/);
assert.doesNotMatch(creativeChatIntakeUi, /Select concept/);
assert.doesNotMatch(creativeChatIntakeUi, /Placement plan/);
assert.doesNotMatch(creativeChatIntakeUi, /Output mode/);
assert.match(creativeChatIntakeUi, /Saved brief history/);
const launchPageUi = fs.readFileSync("src/app/(app)/launch/page.tsx", "utf8");
assert.match(launchPageUi, /Return to Creatives and refresh unfinished previews/);
assert.match(creativeWizardUi, /controlsList="nodownload noplaybackrate"/);
assert.match(previewPageUi, /controlsList="nodownload noplaybackrate"/);
assert.doesNotMatch(creativeWizardUi, /Download|Save Image|Open original|Copy URL|Export/);
assert.doesNotMatch(staticCreativePreviewCardUi, /Download|Save Image|Open original|Copy URL|Export/);
assert.doesNotMatch(creativeChatIntakeUi, /Download|Save Image|Open original|Copy URL|Export/);
assert.doesNotMatch(prepaywallPreviewUi, /Export locked/);
assert.match(staticAdsRoute, /getApprovedCreativeIntakeGenerationContext/);
assert.match(staticAdsRoute, /creativeIntakeIncludesStatic/);
assert.match(staticAdsRoute, /creativeIntake: creativeIntakeContext/);
assert.match(videoRoute, /getApprovedCreativeIntakeGenerationContext/);
assert.match(videoRoute, /creativeIntakeIncludesUgcVideo/);
assert.match(videoRoute, /creativeIntake: creativeIntakeContext/);

const defaults = {
  campaignId: "campaign-test",
  market: "Toronto, ON",
  audience: "Move-ready buyers",
  offer: "Private buyer shortlist",
  propertyType: "Detached homes",
  campaignType: "buyer",
  cta: "See Homes That Match",
  brand: "Raiaan Reza Group",
};

const softened = softenRegulatedClaims("Guaranteed Approval for 600+ Credit");
assert.match(softened.text, /Home Options for 600\+ Credit/i);
assert.ok(softened.softenedClaims.length > 0, "risky approval claims are softened");
assert.equal(softened.explanations[0].blockedPhrase, "Guaranteed Approval for 600+ Credit");

const softenedSaleClaim = softenRegulatedClaims("We guarantee to sell your home in the next 90 days");
assert.match(softenedSaleClaim.text, /90-Day Home Sale Plan/i);
assert.ok(softenedSaleClaim.explanations.some((item) => /Guaranteed sale/i.test(item.reason)));

const buyoutBackedSellerOffer = normalizeOfferForCampaign(
  "Sell Your Home In 90 Days Or We'll Buy It",
  "seller",
);
assert.equal(
  buyoutBackedSellerOffer.normalizedOffer,
  "Sell Your Home in 90 Days or We'll Buy It",
  "buyout-backed seller offers must preserve the user's actual offer instead of collapsing to a generic 90-day plan",
);
assert.notEqual(
  buyoutBackedSellerOffer.normalizedOffer,
  "90-Day Home Sale Plan",
  "non-guarantee buyout wording must not be silently rewritten to a generic plan",
);

const explicitGuaranteedSellerOffer = normalizeOfferForCampaign(
  "Guaranteed Sale In 90 Days",
  "seller",
);
assert.equal(
  explicitGuaranteedSellerOffer.normalizedOffer,
  "90-Day Home Sale Plan",
  "explicit guaranteed-sale wording is still softened into a compliant sale plan",
);

const answers = {
  targetAudience: "first_time_buyers",
  offer: "custom",
  customOffer: "Guaranteed Approval for 600+ Credit",
  brokerageBrand: "remax",
  market: "Toronto, ON",
  creativeStyle: "ugc",
  constraints: "Avoid guarantees. Qualification is subject to lender review.",
  cta: "Check Buying Power",
  propertyType: "Detached homes",
  outputMode: "background_only",
  generationPhase: "static",
};
const brief = buildCreativeIntakeBrief(answers, defaults);
assert.equal(brief.completion.complete, true, "complete intake brief is accepted");
assert.match(brief.offer, /Home Options for 600\+ Credit/i);
assert.ok(brief.staticBriefHash, "static brief hash is persisted on the approved brief");
assert.ok(brief.offerHash, "offer hash is persisted on the approved brief");
assert.ok(brief.ctaHash, "CTA hash is persisted on the approved brief");
assert.ok(brief.brandHash, "brand hash is persisted on the approved brief");
assert.ok(brief.complianceExplanations.some((item) => item.blockedPhrase === "Guaranteed Approval for 600+ Credit"));
assert.ok(brief.complianceNotes.some((note) => /guarantee|qualif|lender|approval|credit/i.test(note)));

const prompt = buildCreativeIntakePromptVersion(brief, 2);
assert.match(prompt.generatedPrompt, /TEXT-FREE BACKGROUND ASSET ONLY/);
assert.match(prompt.generatedPrompt, /DealFlow will render the actual headline, CTA, proof chips/);
assert.doesNotMatch(prompt.generatedPrompt, /create a finished ad/i);
assert.match(prompt.negativePrompt, /gibberish typography/);
assert.match(prompt.sanitizedPreview, /Check Buying Power/);
assert.match(prompt.sanitizedPreview, /Brief hash:/);

const finishedAdBrief = buildCreativeIntakeBrief({
  ...answers,
  outputMode: "finished_ad",
}, defaults);
const finishedAdPrompt = buildCreativeIntakePromptVersion(finishedAdBrief, 3);
assert.match(finishedAdPrompt.generatedPrompt, /MARKETING STUDIO FINISHED AD CREATIVE/);
assert.doesNotMatch(finishedAdBrief.offer, /this week/i, "finished-ad brief keeps customer-facing offer concise");
assert.equal(finishedAdBrief.cta, "Check Buying Power", "finished-ad brief keeps customer-facing CTA exact");
assert.match(finishedAdPrompt.generatedPrompt, /Required CTA text that must be readable in the final raster: Check Buying Power/);
assert.match(finishedAdPrompt.generatedPrompt, /short headline, exact approved offer, one concise proof\/support line, and one clear CTA/);
assert.match(finishedAdPrompt.generatedPrompt, /one dominant hook area, one proof area, strong negative space, and a clear CTA-safe zone/);
assert.match(finishedAdPrompt.generatedPrompt, /generous safe margins/);
assert.match(finishedAdPrompt.generatedPrompt, /no tiny text, no cropped CTA, no overlapping panels/i);
assert.match(finishedAdPrompt.generatedPrompt, /not a chart, not a dashboard, not a listing sheet/);
assert.match(finishedAdPrompt.generatedPrompt, /Brand\/logo text is optional/);
assert.match(finishedAdPrompt.generatedPrompt, /omit it/);
assert.match(finishedAdPrompt.generatedPrompt, /Do not invent logos, guaranteed-approval claims, guaranteed financing/);
assert.doesNotMatch(finishedAdPrompt.negativePrompt, /finished ad/);
assert.doesNotMatch(finishedAdPrompt.negativePrompt, /CTA button/);

const buyerUgcDraft = buildCreativeUgcScriptDraft({
  campaignType: defaults.campaignType,
  audience: brief.targetAudience,
  market: defaults.market,
  offerTitle: brief.offer,
  cta: "Check Buying Power",
  propertyType: answers.propertyType,
  targetDurationSeconds: 20,
  creatorPersona: "Toronto buyer agent guide",
  hookAngle: "Speed to Sell",
  visualStyle: "native vertical creator POV",
});
assert.equal(inferCreativeUgcAudienceKind({ campaignType: "buyer", audience: "Buyers" }), "buyer");
assert.equal(inferCreativeUgcAudienceKind({ audience: "Buyers", offer: "Access To Off Market Properties", cta: "View Homes" }), "buyer");
assert.equal(inferCreativeUgcAudienceKind({ campaignType: "seller", audience: "Homeowners" }), "seller");
assert.equal(inferCreativeUgcAudienceKind({ campaignType: "investor", offer: "Off-market deal flow" }), "investor");
assert.equal(inferCreativeUgcAudienceKind({ campaignType: "commercial", offer: "Site shortlist" }), "commercial");
assert.equal(resolveUgcScriptContext({ campaignType: "other", audience: "Prospects" }).campaignType, "unknown");
assert.ok(resolveUgcScriptContext({ campaignType: "other", audience: "Prospects" }).rejectedReasons.includes("needs_campaign_classification"));
const offMarketBuyerUgcDraft = buildCreativeUgcScriptDraft({
  campaignType: "buyer",
  audience: "Buyers",
  market: "Toronto, ON",
  offerTitle: "Access To Off Market Properties",
  offerMechanism: "Access To Off Market Properties",
  cta: "View Homes",
  targetDurationSeconds: 20,
  creatorPersona: "Local Agent",
  hookAngle: "Early Access",
  visualStyle: "Talking-head with local captions",
});
const offMarketBuyerScriptText = offMarketBuyerUgcDraft.lines.join(" ");
assert.match(offMarketBuyerScriptText, /buyers|homes|properties|off market|View Homes/i);
assert.doesNotMatch(
  offMarketBuyerScriptText,
  /homeowners|selling options|before they list|listing strategy|speed to sell|sell your home/i,
  "buyer campaign UGC script must not inherit seller/homeowner language",
);
assert.equal(
  validateCreativeUgcScriptDraft({
    script: offMarketBuyerUgcDraft,
    campaignType: "buyer",
    audience: "Buyers",
    market: "Toronto, ON",
    offerTitle: "Access To Off Market Properties",
    cta: "View Homes",
  }).accepted,
  true,
  "off-market buyer UGC script passes buyer-safe validation",
);
assert.equal(
  validateCreativeUgcScriptDraft({
    script: {
      ...offMarketBuyerUgcDraft,
      lines: [
        "Most Toronto, ON homeowners wait too long before they know their real selling options.",
        "They need a clear plan for price, timing, demand, and the next move before they list.",
        "Access To Off Market Properties.",
        "It gives you a cleaner read before you commit to the wrong listing strategy.",
        "Access To Off Market Properties.",
        "View Homes.",
      ],
    },
    campaignType: "buyer",
    audience: "Buyers",
    market: "Toronto, ON",
    offerTitle: "Access To Off Market Properties",
    cta: "View Homes",
  }).reasons.includes("buyer_seller_language_mismatch"),
  true,
  "buyer UGC validation rejects seller/homeowner script leakage",
);
const sellerUgcDraft = buildCreativeUgcScriptDraft({
  campaignType: "seller",
  audience: "Homeowners",
  market: "Toronto, ON",
  offerTitle: "Free Home Value And Buyer Demand Report",
  cta: "Get Report",
  targetDurationSeconds: 20,
  creatorPersona: "Local Agent",
  hookAngle: "Buyer Demand",
  visualStyle: "Talking-head with local captions",
});
assert.match(sellerUgcDraft.fullScript, /own a home in Toronto|buyer demand|Get Report/i);
assert.doesNotMatch(sellerUgcDraft.fullScript, /View Homes|pre-approval|buying power|custom home list|home search/i);
assert.equal(
  validateCreativeUgcScriptDraft({
    script: sellerUgcDraft,
    campaignType: "seller",
    audience: "Homeowners",
    market: "Toronto, ON",
    offerTitle: "Free Home Value And Buyer Demand Report",
    cta: "Get Report",
  }).accepted,
  true,
  "seller UGC script passes seller-safe validation",
);
assert.equal(
  validateCreativeUgcScriptDraft({
    script: {
      ...sellerUgcDraft,
      cta: "Get Report",
      lines: [
        "If you are trying to buy a home in Toronto, ON, view homes before they disappear.",
        "Most buyers need pre-approval and a clear home search plan.",
        "Custom home list.",
        "It helps with buying power.",
        "Custom home list.",
        "View Homes.",
      ],
    },
    campaignType: "seller",
    audience: "Homeowners",
    market: "Toronto, ON",
    offerTitle: "Free Home Value And Buyer Demand Report",
    cta: "Get Report",
  }).reasons.includes("seller_buyer_language_mismatch"),
  true,
  "seller UGC validation rejects buyer/search script leakage",
);
assert.equal(
  validateCreativeUgcScriptDraft({
    script: {
      ...sellerUgcDraft,
      cta: "Get My Sale Comparison",
      lines: [
        "If you own a home in Toronto, ON, this sale comparison gives you a clearer read on demand.",
        "Toronto homeowners need pricing and timing context before they decide whether to list.",
        "Neighbourhood Sale Comparison Report.",
        "It compares local demand, recent sales, and the next seller conversation.",
        "Neighbourhood Sale Comparison Report.",
        "Tap Request Private Access.",
      ],
    },
    campaignType: "seller",
    audience: "Homeowners",
    market: "Toronto, ON",
    offerTitle: "Neighbourhood Sale Comparison Report",
    cta: "Get My Sale Comparison",
  }).reasons.includes("cta_mismatch"),
  true,
  "UGC validation rejects stale CTA drift after the campaign CTA changes",
);
const investorUgcDraft = buildCreativeUgcScriptDraft({
  campaignType: "investor",
  audience: "Investors",
  market: "Toronto, ON",
  offerTitle: "Off-Market Deal Review",
  cta: "Review Deals",
  targetDurationSeconds: 20,
  hookAngle: "Numbers First",
});
assert.match(investorUgcDraft.fullScript, /investors?|deals?|numbers|risk|Review Deals/i);
assert.equal(validateCreativeUgcScriptDraft({
  script: investorUgcDraft,
  campaignType: "investor",
  audience: "Investors",
  market: "Toronto, ON",
  offerTitle: "Off-Market Deal Review",
  cta: "Review Deals",
}).accepted, true, "investor UGC scripts avoid buyer/seller defaults");
const commercialUgcDraft = buildCreativeUgcScriptDraft({
  campaignType: "commercial",
  audience: "Commercial tenants",
  market: "Toronto, ON",
  offerTitle: "Commercial Site Shortlist",
  cta: "Book A Tour",
  targetDurationSeconds: 20,
  hookAngle: "Site Shortlist",
});
assert.match(commercialUgcDraft.fullScript, /commercial space|shortlist|requirements|Book A Tour/i);
assert.equal(validateCreativeUgcScriptDraft({
  script: commercialUgcDraft,
  campaignType: "commercial",
  audience: "Commercial tenants",
  market: "Toronto, ON",
  offerTitle: "Commercial Site Shortlist",
  cta: "Book A Tour",
}).accepted, true, "commercial UGC scripts avoid residential defaults");
const unknownUgcDraft = buildCreativeUgcScriptDraft({
  campaignType: "other",
  audience: "Prospects",
  market: "Toronto, ON",
  offerTitle: "Campaign Plan",
  cta: "Learn More",
  targetDurationSeconds: 20,
});
assert.ok(unknownUgcDraft.rejectedReasons.includes("needs_campaign_classification"));
assert.ok(validateCreativeUgcScriptDraft({
  script: unknownUgcDraft,
  campaignType: "other",
  audience: "Prospects",
  market: "Toronto, ON",
  offerTitle: "Campaign Plan",
  cta: "Learn More",
}).reasons.includes("needs_campaign_classification"));
assert.ok(validateCreativeUgcScriptDraft({
  script: {
    ...buyerUgcDraft,
    lines: [
      "If you are trying to buy a home in Toronto, ON, this is for families only.",
      "Buyers need options.",
      "Private buyer shortlist.",
      "It helps match timing and must-haves.",
      "Private buyer shortlist.",
      "Check Buying Power.",
    ],
  },
  campaignType: "buyer",
  audience: defaults.audience,
  market: defaults.market,
  offerTitle: defaults.offer,
  cta: "Check Buying Power",
}).reasons.includes("housing_protected_class_language"), "protected-class housing copy is rejected");
assert.ok(validateCreativeUgcScriptDraft({
  script: {
    ...buyerUgcDraft,
    lines: [
      "If you are trying to buy a home in Toronto, ON, I bought with this agent last month.",
      "Buyers need options.",
      "Private buyer shortlist.",
      "It helps match timing and must-haves.",
      "Private buyer shortlist.",
      "Check Buying Power.",
    ],
  },
  campaignType: "buyer",
  audience: defaults.audience,
  market: defaults.market,
  offerTitle: defaults.offer,
  cta: "Check Buying Power",
}).reasons.includes("testimonial_unsubstantiated"), "fake testimonial framing is rejected");
const sellerOfferTitle = normalizeCreativeOfferTitle({
  value: "14-Day Home Sale Plan. Delivered through a buyer consultation and qualification system for home buyers.",
  campaignType: "seller",
  audience: "Sellers",
});
assert.equal(sellerOfferTitle, "14-Day Home Sale Plan", "verbose seller offer is normalized to a concise customer-facing title");
const buyerUgcDraftWithVerboseMechanism = buildCreativeUgcScriptDraft({
  campaignType: "buyer",
  audience: defaults.audience,
  market: defaults.market,
  offerTitle: "Off-market Property Access",
  offerMechanism:
    "Off-market Property Access. Delivered through a buyer consultation and qualification system for home buyers searching for $600k-$900k homes in toronto, on who want better houses options in Toronto, ON without wasting time.",
  cta: "Click learn more for access",
  targetDurationSeconds: 20,
  creatorPersona: "Direct Response Narrator",
  hookAngle: "Speed to Sell",
  visualStyle: "Listing walkthrough style",
});
assert.doesNotMatch(
  buyerUgcDraftWithVerboseMechanism.lines.join(" "),
  /delivered through|buyer consultation|qualification system|better houses options/i,
  "UGC script draft strips verbose internal offer mechanisms from customer-facing script text",
);
const naturalOffMarketScript = {
  ...buyerUgcDraft,
  targetDurationSeconds: 20,
  cta: "Click learn more",
  lines: [
    "I'll get you into your next home for up to 50% less than the current market in the Toronto area.",
    "You heard that right. Our team has access to hundreds of distressed sale properties that are going for up to 50% less than the market, from condos all the way to detached homes.",
    "Now if you've held off on purchasing your next home, click learn more to speak with our team and get access to these off-market properties.",
  ],
};
const naturalOffMarketValidation = validateCreativeUgcScriptDraft({
  script: naturalOffMarketScript,
  campaignType: defaults.campaignType,
  audience: defaults.audience,
  market: defaults.market,
  offerTitle: "Off-market Property Access",
  cta: "Click learn more",
});
assert.equal(
  naturalOffMarketValidation.accepted,
  true,
  "UGC script validator accepts natural Hook / Info / CTA scripts without requiring literal section headings",
);
assert.equal(
  naturalOffMarketValidation.reasons.includes("script_sections_missing"),
  false,
  "Natural three-part UGC scripts do not show the confusing script_sections_missing blocker",
);
const repetitiveScript = {
  ...buyerUgcDraft,
  lines: [
    "Private buyer shortlist.",
    "Private buyer shortlist.",
    "Private buyer shortlist.",
    "Private buyer shortlist.",
    "Private buyer shortlist.",
    "Check Buying Power.",
  ],
};
assert.equal(
  validateCreativeUgcScriptDraft({
    script: repetitiveScript,
    campaignType: defaults.campaignType,
    audience: defaults.audience,
    market: defaults.market,
    offerTitle: defaults.offer,
    cta: "Check Buying Power",
  }).accepted,
  false,
  "UGC script validator rejects repeated offer phrase spam",
);

const ugcBriefNeedsApproval = buildCreativeIntakeBrief({
  ...answers,
  outputMode: "finished_ad",
  generationPhase: "ugc_video",
  targetDurationSeconds: 20,
  creatorPersona: "Toronto buyer agent guide",
  hookAngle: buyerUgcDraft.scriptAngle,
  visualStyle: "native vertical creator POV",
  pacing: "fast hook, clear explanation, direct CTA",
  cameraStyle: "phone-camera walkthrough",
  captionOverlayStyle: "large readable captions",
  ugcApprovedScript: buyerUgcDraft.lines.join("\n"),
  ugcShotList: buyerUgcDraft.shotList,
  ugcOnScreenText: buyerUgcDraft.onScreenText,
  ugcScriptVersion: buyerUgcDraft.version,
}, defaults);
assert.equal(ugcBriefNeedsApproval.completion.complete, false);
assert.ok(ugcBriefNeedsApproval.completion.missing.includes("ugc_script_approval"));

const ugcBriefWithUnsafeScript = buildCreativeIntakeBrief({
  ...answers,
  outputMode: "finished_ad",
  generationPhase: "ugc_video",
  targetDurationSeconds: 20,
  creatorPersona: "Toronto buyer agent guide",
  hookAngle: buyerUgcDraft.scriptAngle,
  visualStyle: "native vertical creator POV",
  pacing: "fast hook, clear explanation, direct CTA",
  cameraStyle: "phone-camera walkthrough",
  captionOverlayStyle: "large readable captions",
  ugcApprovedScript: repetitiveScript.lines.join("\n"),
  ugcShotList: buyerUgcDraft.shotList,
  ugcOnScreenText: buyerUgcDraft.onScreenText,
  ugcScriptVersion: buyerUgcDraft.version,
  ugcScriptApprovedAt: "2026-05-20T00:00:00.000Z",
}, defaults);
assert.equal(ugcBriefWithUnsafeScript.completion.complete, false);
assert.ok(ugcBriefWithUnsafeScript.completion.missing.includes("ugc_script_quality"));

const ugcBrief = buildCreativeIntakeBrief({
  ...answers,
  outputMode: "finished_ad",
  generationPhase: "ugc_video",
  targetDurationSeconds: 20,
  creatorPersona: "Toronto buyer agent guide",
  hookAngle: buyerUgcDraft.scriptAngle,
  visualStyle: "native vertical creator POV",
  pacing: "fast hook, clear explanation, direct CTA",
  cameraStyle: "phone-camera walkthrough",
  captionOverlayStyle: "large readable captions",
  referenceExamples: "Reference 1: agent explains buyer options in a car\nReference 2: creator walks through homes",
  goodBadExamples: "Good: natural creator energy\nBad: generic 5s stock clip",
  mustUseLanguage: "Book a 15-minute buyer strategy call this week",
  mustAvoid: "No fake dashboards. No guaranteed approval.",
  ugcApprovedScript: buyerUgcDraft.lines.join("\n"),
  ugcShotList: buyerUgcDraft.shotList,
  ugcOnScreenText: buyerUgcDraft.onScreenText,
  ugcScriptVersion: buyerUgcDraft.version,
  ugcScriptApprovedAt: "2026-05-20T00:00:00.000Z",
}, defaults);
assert.equal(ugcBrief.completion.complete, true);
assert.equal(ugcBrief.ugcStyleBrief.targetDurationSeconds, 20);
assert.equal(ugcBrief.ugcStyleBrief.referenceExamples.length, 2);
assert.equal(ugcBrief.ugcStyleBrief.approvedScript.lines.join("\n"), buyerUgcDraft.lines.join("\n"));
assert.equal(ugcBrief.ugcStyleBrief.scriptValidation.accepted, true);
assert.equal(ugcBrief.ugcStyleBrief.resolvedCampaignType, "buyer");
assert.equal(ugcBrief.ugcStyleBrief.scriptAngle, buyerUgcDraft.scriptAngle);
assert.equal(ugcBrief.ugcStyleBrief.sourceContextHash, buyerUgcDraft.contextHash);
assert.ok(ugcBrief.ugcStyleBrief.campaignTypeHash);
assert.ok(ugcBrief.ugcStyleBrief.audienceHash);
assert.ok(ugcBrief.ugcStyleBrief.marketHash);
assert.ok(ugcBrief.ugcStyleBrief.offerHash);
assert.ok(ugcBrief.ugcStyleBrief.ctaHash);
const ugcPrompt = buildCreativeIntakePromptVersion(ugcBrief, 4);
assert.match(ugcPrompt.generatedPrompt, /MARKETING STUDIO AI UGC VIDEO BRIEF/);
assert.match(ugcPrompt.generatedPrompt, /15-30 second launch-quality range/);
assert.match(ugcPrompt.generatedPrompt, /Do not create a 5-second sample/);
assert.match(ugcPrompt.generatedPrompt, /Creator\/agent persona: Toronto buyer agent guide/);
assert.match(ugcPrompt.generatedPrompt, /Approved script lines:/);
assert.match(ugcPrompt.sanitizedPreview, /Approved UGC script:/);
assert.match(ugcPrompt.generatedPrompt, /Reference examples:/);
assert.match(ugcPrompt.generatedPrompt, /Must-avoid constraints:/);
assert.match(ugcPrompt.sanitizedPreview, /UGC duration: 20s/);

const combinedBrief = buildCreativeIntakeBrief({
  ...answers,
  outputMode: "finished_ad",
  generationPhase: "static_and_ugc",
  targetDurationSeconds: 20,
  creatorPersona: "Toronto buyer agent guide",
  referenceExamples: "Reference 1: agent explains buyer options in a car",
  ugcApprovedScript: buyerUgcDraft.lines.join("\n"),
  ugcShotList: buyerUgcDraft.shotList,
  ugcOnScreenText: buyerUgcDraft.onScreenText,
  ugcScriptVersion: buyerUgcDraft.version,
  ugcScriptApprovedAt: "2026-05-20T00:00:00.000Z",
}, defaults);
assert.equal(combinedBrief.completion.complete, true);
assert.equal(combinedBrief.generationPhase, "static_and_ugc");
assert.ok(creativeIntakeIncludesStatic(combinedBrief.generationPhase), "combined brief allows static generation");
assert.ok(creativeIntakeIncludesUgcVideo(combinedBrief.generationPhase), "combined brief allows UGC video generation");
assert.equal(combinedBrief.ugcStyleBrief.scriptVersion, buyerUgcDraft.version);
const combinedPrompt = buildCreativeIntakePromptVersion(combinedBrief, 5);
assert.match(combinedPrompt.generatedPrompt, /MARKETING STUDIO COMBINED STATIC \+ AI UGC BRIEF/);
assert.match(combinedPrompt.generatedPrompt, /MARKETING STUDIO FINISHED AD CREATIVE/);
assert.match(combinedPrompt.generatedPrompt, /MARKETING STUDIO AI UGC VIDEO BRIEF/);
assert.match(combinedPrompt.sanitizedPreview, /Brief hash:/);

const combinedStaticAds = await generateStaticCreativeAds({
  campaign_id: defaults.campaignId,
  location: defaults.market,
  audience: defaults.audience,
  offer: defaults.offer,
  property_type: defaults.propertyType,
  market_type: defaults.campaignType,
  creative_intake: {
    version: 1,
    conversationId: "combined-static-prompt-test",
    campaignId: defaults.campaignId,
    revisionNumber: 5,
    approvedAt: "2026-05-20T00:00:00.000Z",
    outputMode: "finished_ad",
    generationPhase: "static_and_ugc",
    requiredOfferTitle: combinedBrief.offerTitle,
    requiredOffer: combinedBrief.offer,
    requiredCta: combinedBrief.cta,
    market: combinedBrief.market,
    targetAudience: combinedBrief.targetAudience,
    brokerageBrand: combinedBrief.brokerageBrand,
    promptVersion: combinedPrompt,
    briefHash: combinedBrief.briefHash,
    staticBriefHash: combinedBrief.staticBriefHash,
    offerHash: combinedBrief.offerHash,
    ctaHash: combinedBrief.ctaHash,
    brandHash: combinedBrief.brandHash,
    ugcScriptHash: combinedBrief.ugcScriptHash,
  },
  max_static_image_generations: 0,
});
assert.match(combinedStaticAds[0].imagePrompt, /MARKETING STUDIO FINISHED AD CREATIVE/);
assert.match(combinedStaticAds[0].imagePrompt, /FINAL OUTPUT REQUIREMENT/);
assert.doesNotMatch(combinedStaticAds[0].imagePrompt, /MARKETING STUDIO AI UGC VIDEO BRIEF/);
assert.doesNotMatch(combinedStaticAds[0].imagePrompt, /Approved script lines:/);
assert.match(combinedStaticAds[0].imagePrompt, /must be readable|CTA button|text hierarchy/i);

const state = createCreativeIntakeState({
  campaignId: defaults.campaignId,
  defaults,
  answers,
});
const approvedState = {
  ...state,
  approvalStatus: "approved",
  promptVersion: prompt,
};
const plan = mergeCreativeChatIntakeIntoPlan({ version: 3, lead_loop_verified: false }, approvedState);
assert.equal(isCreativeIntakeApproved(plan), true, "approved complete intake gates paid generation");
const approvedContext = getApprovedCreativeIntakeGenerationContext(plan);
assert.equal(approvedContext.outputMode, "background_only");
assert.equal(approvedContext.generationPhase, "static");
assert.equal(approvedContext.requiredCta, "Check Buying Power");
assert.equal(approvedContext.requiredOffer, "Home Options for 600+ Credit");
assert.equal(approvedContext.staticBriefHash, approvedState.brief.staticBriefHash);
assert.equal(approvedContext.brandHash, approvedState.brief.brandHash);
assert.equal(approvedContext.promptVersion.generatedPrompt, prompt.generatedPrompt);
assert.equal(hasSameCreativeIntakeGenerationContext(approvedContext, approvedContext), true);
const legacyBriefWithoutHashes = {
  ...approvedState.brief,
  briefHash: "",
  staticBriefHash: "",
  offerHash: "",
  ctaHash: "",
  brandHash: "",
  ugcScriptHash: null,
};
const legacyPlan = mergeCreativeChatIntakeIntoPlan(plan, {
  ...approvedState,
  brief: legacyBriefWithoutHashes,
});
const hydratedLegacyIntake = readCreativeChatIntakeFromPlan(legacyPlan);
const hydratedLegacyContext = getApprovedCreativeIntakeGenerationContext(legacyPlan);
assert.ok(hydratedLegacyIntake.brief.staticBriefHash, "legacy approved briefs are hydrated with a current static brief hash on read");
assert.ok(hydratedLegacyContext.staticBriefHash, "legacy approved contexts get deterministic hashes so stale assets fail closed");
assert.equal(hydratedLegacyContext.staticBriefHash, approvedContext.staticBriefHash);
assert.equal(hydratedLegacyContext.ctaHash, approvedContext.ctaHash);
assert.equal(hydratedLegacyContext.brandHash, approvedContext.brandHash);
const adaptedModernDocument = getSavedCampaignDocumentFromRow({
  id: defaults.campaignId,
  plan: {
    version: 3,
    market: defaults.market,
    audience: defaults.audience,
    offer_summary: defaults.offer,
    property_type: defaults.propertyType,
    creative_chat_intake: approvedState,
  },
});
assert.equal(
  getApprovedCreativeIntakeGenerationContext(adaptedModernDocument)?.promptVersion.generatedPrompt,
  prompt.generatedPrompt,
  "canonical campaign reads preserve approved creative intake for worker-owned generation jobs",
);
const revisionPlan = mergeCreativeChatIntakeIntoPlan(plan, {
  ...approvedState,
  approvalStatus: "revision_requested",
  promptVersion: null,
  previousRevisions: [
    {
      revisionNumber: approvedState.revisionNumber,
      approvalStatus: approvedState.approvalStatus,
      brief: approvedState.brief,
      promptVersion: approvedState.promptVersion,
      createdAt: approvedState.updatedAt,
      approvedAt: approvedState.approvedAt ?? null,
    },
  ],
});
assert.equal(isCreativeIntakeApproved(revisionPlan), false, "revision blocks paid generation until re-approved");
assert.equal(
  revisionPlan.creative_chat_intake.previousRevisions[0].brief.offer,
  approvedState.brief.offer,
  "revision history preserves the previous approved brief",
);
assert.equal(
  revisionPlan.creative_chat_intake.previousRevisions[0].promptVersion.generatedPrompt,
  approvedState.promptVersion.generatedPrompt,
  "revision history preserves the previous generated prompt",
);
assert.equal(
  getApprovedCreativeIntakeGenerationContext(revisionPlan),
  null,
  "revision removes the durable approved generation context",
);

const promptedStaticAds = await generateStaticCreativeAds({
  campaign_id: defaults.campaignId,
  location: defaults.market,
  audience: defaults.audience,
  offer: defaults.offer,
  property_type: defaults.propertyType,
  market_type: defaults.campaignType,
  creative_intake: approvedContext,
  max_static_image_generations: 1,
});
assert.equal(
  promptedStaticAds[0].imagePrompt,
  prompt.generatedPrompt,
  "approved intake prompt replaces the generated static image prompt",
);
assert.equal(promptedStaticAds[0].imagePromptConfig.prompt, prompt.generatedPrompt);
assert.equal(promptedStaticAds[0].imagePromptConfig.negativePrompt, prompt.negativePrompt);
assert.equal(promptedStaticAds[0].creativeIntake.outputMode, "background_only");

const finishedAdContext = {
  version: 1,
  conversationId: "finished-ad-contract-test",
  campaignId: defaults.campaignId,
  revisionNumber: 1,
  approvedAt: "2026-05-14T00:00:00.000Z",
  outputMode: "finished_ad",
  generationPhase: "static",
	  requiredOffer: "Private buyer access system with 25 off-market homes this month",
	  requiredCta: "Click Learn More",
  market: defaults.market,
  targetAudience: defaults.audience,
  brokerageBrand: defaults.brand,
  promptVersion: {
    revisionNumber: 1,
    generatedPrompt:
      "MARKETING STUDIO FINISHED AD CREATIVE. Create one finished paid-social real estate ad raster with a clear headline, offer, and CTA.",
    negativePrompt: "gibberish; fake dashboard; listing sheet",
    sanitizedPreview: "Finished-ad proof prompt",
    createdAt: "2026-05-14T00:00:00.000Z",
  },
};
const finishedAdStaticAds = await generateStaticCreativeAds({
  campaign_id: defaults.campaignId,
  location: defaults.market,
  audience: defaults.audience,
  offer: defaults.offer,
  property_type: defaults.propertyType,
  market_type: defaults.campaignType,
  creative_intake: finishedAdContext,
  max_static_image_generations: 0,
});
assert.equal(finishedAdStaticAds[0].offer, "Private buyer access system with 25 off-market homes this month", "finished-ad static copy uses the approved offer exactly");
assert.equal(finishedAdStaticAds[0].cta, "Click Learn More", "finished-ad CTA uses the approved CTA exactly");
assert.match(finishedAdStaticAds[0].imagePrompt, /MARKETING STUDIO FINISHED AD CREATIVE/);
assert.match(finishedAdStaticAds[0].imagePrompt, /complete square paid-social ad raster directly in Higgsfield Marketing Studio/);
assert.match(finishedAdStaticAds[0].imagePrompt, /Required offer text that must be readable in the final raster: Private buyer access system with 25 off-market homes this month/);
assert.match(finishedAdStaticAds[0].imagePrompt, /Required CTA text that must be readable in the final raster: Click Learn More/);
assert.doesNotMatch(finishedAdStaticAds[0].overlayText, /^Preview\b/i, "finished-ad static overlays do not block the creative with a preview prefix");
assert.match(finishedAdStaticAds[0].imagePrompt, /final image should look like a high-performing real estate Facebook\/Instagram ad/i);
assert.match(finishedAdStaticAds[0].imagePrompt, /Media-buyer reference layout: one dominant hook area, one proof\/support area, strong negative space, and one clear CTA-safe zone/);
assert.doesNotMatch(finishedAdStaticAds[0].imagePrompt, /DealFlow will place exact text later/);
assert.doesNotMatch(finishedAdStaticAds[0].imagePrompt, /guaranteed-approval claim|guaranteed-financing claim/);
assert.equal(finishedAdStaticAds[0].qualityGate.accepted, true, "finished-ad static prompt contract passes product-quality preflight");
assert.equal(finishedAdStaticAds[0].staticBriefHash, finishedAdContext.staticBriefHash ?? null);

function buildAsset() {
  return {
    id: "static-1",
    angle: "opportunity",
    imageUrl: "https://supabase.example.test/storage/v1/object/public/creative-assets/user-test/campaign-test/generated-static/static-1/existing.png",
    storageNormalized: true,
    imageGenerationState: "generated",
    imageGenerationMessage: null,
    imageGenerationModel: "marketing_studio_image",
    imageGenerationProvider: "higgsfield_marketing_studio",
    appComposedFinal: false,
    qualityTier: "higgsfield_finished_ad",
    visualConcept: "Toronto buyer finished ad",
    imagePrompt: "MARKETING STUDIO FINISHED AD CREATIVE. Real estate paid social ad.",
    imagePromptConfig: {
      prompt: "MARKETING STUDIO FINISHED AD CREATIVE. Real estate paid social ad.",
      negativePrompt: "gibberish; fake dashboard; listing sheet",
      aspectRatio: "1:1",
    },
    preferredImageModel: "gpt-image-1.5",
    visualPromptBrief: {
      category: "buyer",
      visualAssetContract: "text_free_background_v2",
      visualAssetRole: "text_free_background",
      mediaBuyerReferencePattern: "buyer source photo",
      triggerCondition: "market uncertainty",
      internalTension: "approval uncertainty",
      mechanism: "buyer shortlist",
      proofStyle: "budget fit",
      visualLogic: [],
      overlayLogic: [],
      forbiddenPatterns: [],
      preferredModel: "gpt-image-1.5",
      visualConcept: "Toronto buyer background",
      promptConfig: {
        prompt: "TEXT-FREE BACKGROUND ASSET ONLY. Realistic photo.",
        negativePrompt: "text",
        aspectRatio: "1:1",
      },
    },
    imageQa: { usable: true, decision: "accept", mode: "finished_ad", reasons: [] },
    visualQualityGate: { accepted: true, mode: "finished_ad_qa", reasons: [] },
    premiumQualityGate: { accepted: true, mode: "higgsfield_finished_ad_provenance", reasons: [] },
    creativeIntake: finishedAdContext,
    scoreBreakdown: null,
    hook: "See matched homes",
    overlayText: "See matched homes",
    primaryText: "Get a focused buyer shortlist.",
    headline: "See Homes That Match",
    cta: "See Homes That Match",
    score: 8,
    recommended: true,
    qualityGate: { accepted: true, score: 8, hardFailures: [] },
    offerQuality: null,
  };
}

function fakeSupabase({ insertFails = false } = {}) {
  const operations = [];
  return {
    operations,
    storage: {
      from(bucket) {
        operations.push({ op: "storage.from", bucket });
        return {
          async upload(storagePath, body, options) {
            operations.push({
              op: "upload",
              bucket,
              storagePath,
              byteSize: body.byteLength,
              contentType: options.contentType,
              upsert: options.upsert,
            });
            return { error: null };
          },
          getPublicUrl(storagePath) {
            operations.push({ op: "getPublicUrl", bucket, storagePath });
            return {
              data: {
                publicUrl: `https://example.test/storage/v1/object/public/${bucket}/${storagePath}`,
              },
            };
          },
        };
      },
    },
    from() {
      return {
        insert(rows) {
          operations.push({ op: "insert", rows });
          return {
            async select() {
              if (insertFails) {
                return { data: null, error: new Error("insert failed") };
              }
              return {
                data: rows.map((row, index) => ({ ...row, id: `new-${index}` })),
                error: null,
              };
            },
          };
        },
        delete() {
          operations.push({ op: "delete" });
          const chain = {
            eq() { return chain; },
            in() { return chain; },
            like() { return chain; },
            async not() { return { data: null, error: null }; },
          };
          return chain;
        },
      };
    },
  };
}

const successfulDb = fakeSupabase();
await persistStaticCreativeAssets({
  supabase: successfulDb,
  userId: "user-test",
  campaignId: "campaign-test",
  staticAds: [buildAsset()],
});
assert.deepEqual(
  successfulDb.operations.map((item) => item.op).includes("delete"),
  false,
  "static creative assets are inserted without deleting historical evidence rows",
);
const successfulInsert = successfulDb.operations.find((item) => item.op === "insert");
assert.equal(Boolean(successfulInsert), true, "finished Higgsfield static final row is inserted");
assert.equal(successfulInsert.rows[0].metadata.storageNormalized, true, "finished Higgsfield final is app-owned before insert");
assert.equal(successfulInsert.rows[0].status, "ready");
assert.equal(successfulInsert.rows[0].metadata.appComposedFinal, false);
assert.equal(successfulInsert.rows[0].metadata.qualityTier, "higgsfield_finished_ad");
assert.equal(successfulInsert.rows[0].metadata.role, "higgsfield_finished_static_ad");
assert.equal(successfulInsert.rows[0].metadata.generationBatchId.length > 0, true);
assert.equal(
  successfulInsert.rows[0].metadata.creativeIntakePromptVersionUsed.generatedPrompt,
  finishedAdContext.promptVersion.generatedPrompt,
);
assert.equal(successfulInsert.rows[0].metadata.creativeIntakeGenerationContext.outputMode, "finished_ad");
assert.equal(successfulInsert.rows[0].metadata.creativeIntakeGenerationContext.generationPhase, "static");
assert.equal(successfulInsert.rows[0].metadata.staticBriefHash, finishedAdContext.staticBriefHash ?? null);
assert.equal(successfulInsert.rows[0].metadata.ctaHash, finishedAdContext.ctaHash ?? null);

const failingDb = fakeSupabase({ insertFails: true });
await assert.rejects(
  () => persistStaticCreativeAssets({
    supabase: failingDb,
    userId: "user-test",
    campaignId: "campaign-test",
    staticAds: [buildAsset()],
  }),
  /insert failed/,
);
assert.deepEqual(
  failingDb.operations.map((item) => item.op).includes("delete"),
  false,
  "failed replacement insert never deletes previous accepted assets",
);

console.log("Creative chat intake migration tests passed.");
process.exit(0);
