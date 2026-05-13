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
assert.equal(oneSelected.readyLabel, "3 launch-ready previews available");
assert.equal(oneSelected.selectedBlockedCount, 0);
assert.equal(oneSelected.retryCount, 2);
assert.equal(oneSelected.missingCount, 1);
assert.match(getStaticPreviewStatusMessage(oneSelected), /3 launch-ready previews available; 3 recommended/);
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
  videoUrl: "https://supabase.example.test/storage/v1/object/public/creative-assets/user/campaign/video.mp4",
  videoGenerationState: "generated",
};
assert.equal(isPlayableVideoCreative(readyVideo), true);
assert.equal(getVideoReadinessLabel(readyVideo), "Playable video ready");
assert.match(getVideoReadinessMessage(readyVideo), /app-owned video preview is ready/);

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

console.log("creative media readiness regression checks passed");
