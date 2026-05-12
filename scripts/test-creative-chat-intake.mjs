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
  isCreativeIntakeApproved,
  mergeCreativeChatIntakeIntoPlan,
  softenRegulatedClaims,
} = require("../src/lib/services/creative-chat-intake-service.ts");
const {
  persistStaticCreativeAssets,
} = require("../src/lib/services/static-creative-asset-service.ts");

const creativeChatIntakeUi = fs.readFileSync("src/app/(app)/build/creatives/creative-chat-intake.tsx", "utf8");
assert.match(creativeChatIntakeUi, /Draft recovered from your last session/);
assert.match(creativeChatIntakeUi, /Paid rendering stays blocked until the updated brief is approved/);
assert.match(creativeChatIntakeUi, /aria-pressed/);

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
