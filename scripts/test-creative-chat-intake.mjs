import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.example.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "anon-test";

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
  getApprovedCreativeIntakeGenerationContext,
  hasSameCreativeIntakeGenerationContext,
  isCreativeIntakeApproved,
  mergeCreativeChatIntakeIntoPlan,
  softenRegulatedClaims,
} = require("../src/lib/services/creative-chat-intake-service.ts");
const {
  generateStaticCreativeAds,
} = require("../src/lib/services/creative-engine.ts");
const {
  persistStaticCreativeAssets,
} = require("../src/lib/services/static-creative-asset-service.ts");

const creativeChatIntakeUi = fs.readFileSync("src/app/(app)/build/creatives/creative-chat-intake.tsx", "utf8");
const creativeWizardUi = fs.readFileSync("src/app/(app)/build/creatives/creative-wizard.tsx", "utf8");
const staticAdsRoute = fs.readFileSync("src/app/api/campaigns/[id]/generate-static-ads/route.ts", "utf8");
const videoRoute = fs.readFileSync("src/app/api/campaigns/[id]/generate-video/route.ts", "utf8");
const prepaywallPreviewUi = fs.readFileSync("src/components/onboarding/prepaywall-campaign-preview.tsx", "utf8");
const staticCreativePreviewCardUi = fs.readFileSync("src/components/campaign/static-creative-preview-card.tsx", "utf8");
const previewPageUi = fs.readFileSync("src/app/(app)/preview/page.tsx", "utf8");
const selectAdRoute = fs.readFileSync("src/app/api/campaigns/[id]/select-ad/route.ts", "utf8");
assert.match(creativeChatIntakeUi, /Draft recovered from your last session/);
assert.match(creativeChatIntakeUi, /Paid rendering stays blocked until the updated brief is approved/);
assert.match(creativeChatIntakeUi, /aria-pressed/);
assert.match(creativeWizardUi, /Primary creative/);
assert.match(creativeWizardUi, /Review variant/);
assert.match(creativeWizardUi, /Add to review set/);
assert.match(creativeWizardUi, /Full-resolution creative files stay inside DealFlow/);
assert.match(staticCreativePreviewCardUi, /Full-resolution available through launch workflow, not direct download/);
assert.match(selectAdRoute, /assertCampaignCanLaunch/);
assert.match(creativeWizardUi, /controlsList="nodownload noplaybackrate"/);
assert.match(previewPageUi, /controlsList="nodownload noplaybackrate"/);
assert.doesNotMatch(creativeWizardUi, /Download|Save Image|Open original|Copy URL|Export/);
assert.doesNotMatch(creativeChatIntakeUi, /Download|Save Image|Open original|Copy URL|Export/);
assert.doesNotMatch(prepaywallPreviewUi, /Export locked/);
assert.match(staticAdsRoute, /getApprovedCreativeIntakeGenerationContext/);
assert.match(staticAdsRoute, /generationPhase !== "static"/);
assert.match(staticAdsRoute, /creativeIntake: creativeIntakeContext/);
assert.match(videoRoute, /getApprovedCreativeIntakeGenerationContext/);
assert.match(videoRoute, /generationPhase !== "ugc_video"/);
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
assert.match(softened.text, /may qualify|options may be available/i);
assert.ok(softened.softenedClaims.length > 0, "risky approval claims are softened");

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
assert.match(brief.offer, /may qualify|options may be available/i);
assert.ok(brief.complianceNotes.some((note) => /guarantee|qualif|lender|approval|credit/i.test(note)));

const prompt = buildCreativeIntakePromptVersion(brief, 2);
assert.match(prompt.generatedPrompt, /TEXT-FREE BACKGROUND ASSET ONLY/);
assert.match(prompt.generatedPrompt, /DealFlow will render the actual headline, CTA, proof chips/);
assert.doesNotMatch(prompt.generatedPrompt, /create a finished ad/i);
assert.match(prompt.negativePrompt, /gibberish typography/);
assert.match(prompt.sanitizedPreview, /Check Buying Power/);
assert.match(prompt.sanitizedPreview, /background_only/);

const finishedAdBrief = buildCreativeIntakeBrief({
  ...answers,
  outputMode: "finished_ad",
}, defaults);
const finishedAdPrompt = buildCreativeIntakePromptVersion(finishedAdBrief, 3);
assert.match(finishedAdPrompt.generatedPrompt, /MARKETING STUDIO FINISHED AD CREATIVE/);
assert.match(finishedAdPrompt.generatedPrompt, /Required CTA text that must be readable in the final raster: Check Buying Power/);
assert.match(finishedAdPrompt.generatedPrompt, /not a chart, not a dashboard, not a listing sheet/);
assert.doesNotMatch(finishedAdPrompt.negativePrompt, /finished ad/);

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
assert.equal(approvedContext.requiredOffer, "options may be available for buyers with 600+ credit");
assert.equal(approvedContext.promptVersion.generatedPrompt, prompt.generatedPrompt);
assert.equal(hasSameCreativeIntakeGenerationContext(approvedContext, approvedContext), true);
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

function buildAsset() {
  return {
    id: "static-1",
    angle: "opportunity",
    imageUrl: "https://supabase.example.test/storage/v1/object/public/creative-assets/user-test/campaign-test/generated-static/static-1/existing.png",
    imageGenerationState: "generated",
    imageGenerationMessage: null,
    imageGenerationModel: "marketing_studio_image",
    imageGenerationProvider: "higgsfield",
    visualConcept: "Toronto buyer background",
    imagePrompt: "TEXT-FREE BACKGROUND ASSET ONLY. Realistic photo.",
    imagePromptConfig: {
      prompt: "TEXT-FREE BACKGROUND ASSET ONLY. Realistic photo.",
      negativePrompt: "final ad layout; flyer; text",
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
    imageQa: { usable: true, decision: "accept", reasons: [] },
    creativeIntake: approvedContext,
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
  successfulDb.operations.map((item) => item.op),
  ["insert", "delete"],
  "static creative assets are inserted before old rows are cleaned up",
);
assert.equal(successfulDb.operations[0].rows[0].status, "ready");
assert.equal(successfulDb.operations[0].rows[0].metadata.generationBatchId.length > 0, true);
assert.equal(
  successfulDb.operations[0].rows[0].metadata.creativeIntakePromptVersionUsed.generatedPrompt,
  prompt.generatedPrompt,
);
assert.equal(successfulDb.operations[0].rows[0].metadata.creativeIntakeGenerationContext.outputMode, "background_only");
assert.equal(successfulDb.operations[0].rows[0].metadata.creativeIntakeGenerationContext.generationPhase, "static");

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
  failingDb.operations.map((item) => item.op),
  ["insert"],
  "failed replacement insert never deletes previous accepted assets",
);

console.log("Creative chat intake migration tests passed.");
