import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;

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
  getStaticCreativeReadiness,
  getStaticPreviewStatusMessage,
  getVideoReadinessLabel,
  getVideoReadinessMessage,
  evaluateGeneratedVideoQualityGate,
  isLaunchReadyVideoCreative,
  isPlayableVideoCreative,
} = require("../src/lib/services/creative-media-readiness.ts");
const {
  buildComposedStaticAdPreview,
} = require("../src/lib/services/static-ad-template-renderer.ts");

function readyStatic(id) {
  return {
    id,
    imageUrl: `https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/${id}.png`,
    storageNormalized: true,
    imageGenerationState: "generated",
    imagePrompt: "Text-free background asset only for a real estate ad.",
    imagePromptConfig: null,
    visualPromptBrief: {
      visualAssetContract: "text_free_background_v2",
      visualAssetRole: "text_free_background",
    },
    qualityGate: { accepted: true },
    imageQa: { usable: true, decision: "accept", mode: "background_only", reasons: [] },
  };
}

const creatives = [
  readyStatic("primary"),
  readyStatic("review-1"),
  readyStatic("review-2"),
  {
    ...readyStatic("failed-1"),
    imageUrl: "",
    imageGenerationState: "failed",
    imageGenerationMessage: "Image preview rendering needs another attempt.",
  },
  {
    ...readyStatic("missing-1"),
    imageUrl: "",
    imageGenerationState: "unavailable",
  },
  {
    ...readyStatic("legacy-provider"),
    imageUrl: "https://provider.example.test/generated.png",
    storageNormalized: false,
  },
];

const oneSelected = getStaticCreativeReadiness(creatives, ["primary"]);
assert.equal(oneSelected.selectionLabel, "1 primary creative selected");
assert.equal(oneSelected.readyLabel, "1 selected launch-ready preview");
assert.equal(oneSelected.availableReadyLabel, "3 launch-ready previews available");
assert.equal(oneSelected.selectedReadyLabel, "1 selected launch-ready preview");
assert.equal(oneSelected.selectedBlockedCount, 0);
assert.equal(oneSelected.retryCount, 2);
assert.equal(oneSelected.missingCount, 1);
assert.match(getStaticPreviewStatusMessage(oneSelected), /1 selected launch-ready preview; 3 recommended/);
assert.match(getStaticPreviewStatusMessage(oneSelected), /optional variants need retry/);

const blockedSelection = getStaticCreativeReadiness(creatives, ["primary", "failed-1"]);
assert.equal(blockedSelection.selectedBlockedCount, 1);
assert.equal(blockedSelection.allSelectedReady, false);
assert.match(blockedSelection.issueLabel ?? "", /1 selected creative needs retry before launch/);

const fallbackPreview = buildComposedStaticAdPreview({
  headline: "Toronto seller plan",
  primaryText: "Review the strategy before launch.",
  cta: "Get My Plan",
  imageUrl: "",
  imageGenerationState: "unavailable",
});
assert.equal(fallbackPreview.status, "template_fallback");
assert.doesNotMatch(fallbackPreview.backgroundMessage, /is ready/i);

const rejectedPreview = buildComposedStaticAdPreview({
  headline: "Toronto seller plan",
  primaryText: "Review the strategy before launch.",
  cta: "Get My Plan",
  imageUrl: "https://provider.example.test/generated.png",
  storageNormalized: false,
  imageGenerationState: "generated",
});
assert.equal(rejectedPreview.status, "background_rejected");
assert.doesNotMatch(rejectedPreview.backgroundMessage, /provider\.example|https?:\/\//);

const readyVideo = {
  id: "campaign-video",
  videoUrl: "https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/video.mp4",
  videoGenerationState: "generated",
  providerName: "higgsfield",
  providerAssetId: "provider-job-1",
  storageNormalized: true,
  storageBucket: "creative-assets",
  storagePath: "user/campaign/video.mp4",
  storageContentType: "video/mp4",
  storageByteSize: 7_533_116,
  sourceStaticAssetId: "primary",
  sourceImageUrl: "https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/primary.png",
  sourceStaticAccepted: true,
  promptUsed: "Campaign a18d77f7 Toronto buyer UGC prompt with offer and CTA.",
  promptSource: "campaign_specific_fallback",
  promptHash: "prompt-hash",
  scriptHash: "script-hash",
  campaignSpecificContext: {
    campaignId: "a18d77f7-398b-4920-8d93-8332dfff2d44",
    audience: "Toronto buyers",
    location: "Toronto, ON",
    offer: "matching homes",
    cta: "See Matching Homes",
  },
  videoQualityGate: {
    accepted: true,
    usable: true,
    decision: "accept",
    reasons: [],
  },
};
assert.equal(isPlayableVideoCreative(readyVideo), true);
assert.equal(isLaunchReadyVideoCreative(readyVideo), true);
assert.equal(getVideoReadinessLabel(readyVideo), "Campaign-specific UGC ready");
assert.match(getVideoReadinessMessage(readyVideo), /Campaign-specific app-owned UGC video is ready/);
assert.deepEqual(
  evaluateGeneratedVideoQualityGate(readyVideo, new Date("2026-05-13T00:00:00.000Z")),
  {
    accepted: true,
    usable: true,
    decision: "accept",
    reasons: [],
    evaluatedAt: "2026-05-13T00:00:00.000Z",
    mode: "deterministic_provenance",
  },
);

const reviewOnlyVideo = {
  ...readyVideo,
  id: "review-only-video",
  promptUsed: null,
  promptSource: null,
  promptHash: null,
  videoQualityGate: { accepted: false, usable: false, decision: "review", reasons: ["video_qa_required"] },
};
assert.equal(isPlayableVideoCreative(reviewOnlyVideo), true);
assert.equal(isLaunchReadyVideoCreative(reviewOnlyVideo), false);
assert.equal(getVideoReadinessLabel(reviewOnlyVideo), "Playable review sample");
assert.match(getVideoReadinessMessage(reviewOnlyVideo), /missing campaign-specific prompt/);

const promptSourceOnlyVideo = {
  ...readyVideo,
  id: "prompt-source-only-video",
  promptUsed: null,
  promptHash: null,
  promptSource: "campaign_specific_fallback",
};
assert.equal(isLaunchReadyVideoCreative(promptSourceOnlyVideo), false);
assert.match(getVideoReadinessMessage(promptSourceOnlyVideo), /missing campaign-specific prompt/);
assert.deepEqual(
  evaluateGeneratedVideoQualityGate(promptSourceOnlyVideo, new Date("2026-05-13T00:00:00.000Z")).reasons,
  ["missing_prompt_provenance"],
);

const sampleVideo = {
  ...readyVideo,
  id: "demo-sample-video",
  sampleOnly: true,
};
assert.equal(isLaunchReadyVideoCreative(sampleVideo), false);
assert.match(getVideoReadinessMessage(sampleVideo), /sample\/template/);

const conceptOnlyVideo = {
  videoUrl: "",
  videoGenerationState: "unavailable",
  videoGenerationMessage: null,
};
assert.equal(isPlayableVideoCreative(conceptOnlyVideo), false);
assert.equal(getVideoReadinessLabel(conceptOnlyVideo), "Concept ready, render needed");
assert.doesNotMatch(getVideoReadinessMessage(conceptOnlyVideo), /preview is ready/i);

const creativeWizardSource = fs.readFileSync("src/app/(app)/build/creatives/creative-wizard.tsx", "utf8");
const previewSource = fs.readFileSync("src/app/(app)/preview/page.tsx", "utf8");
const launchSource = fs.readFileSync("src/app/(app)/launch/page.tsx", "utf8");

for (const [name, source] of [
  ["Creative Studio", creativeWizardSource],
  ["Preview", previewSource],
  ["Launch", launchSource],
]) {
  assert.doesNotMatch(source, />\s*(Download|Export|Copy URL|Open original)\s*</i, `${name} must not expose raw asset actions`);
  assert.match(source, /controlsList="nodownload noplaybackrate"/, `${name} video controls disable download`);
  assert.match(source, /disablePictureInPicture/, `${name} disables picture-in-picture`);
}

assert.doesNotMatch(creativeWizardSource, /Ready to render/);
assert.doesNotMatch(creativeWizardSource, /Video preview concept is ready/);
assert.doesNotMatch(creativeWizardSource, /Video concept is ready/);

console.log("creative media readiness regression checks passed");
