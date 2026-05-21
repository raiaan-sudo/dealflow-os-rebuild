import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

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
  MARKETING_STUDIO_WORKER_DEFERRED_UNTIL,
  classifyCreativeRenderJob,
} = require("../src/lib/services/creative-render-state.ts");
const {
  getVideoReadinessLabel,
  getVideoReadinessMessage,
} = require("../src/lib/services/creative-media-readiness.ts");
const {
  buildComposedStaticAdPreview,
} = require("../src/lib/services/static-ad-template-renderer.ts");
const {
  evaluateCreativeQuality,
} = require("../src/lib/services/media-buyer-framework.ts");
const {
  isMarketingStudioVideoGenerationJob,
  shouldDeferMarketingStudioStaticGenerationToWorker,
} = require("../src/lib/services/marketing-studio-worker-contract.ts");

function resetEnv() {
  for (const key of [
    "MARKETING_STUDIO_WORKER_ENABLED",
    "MEDIA_GENERATION_PROVIDER",
    "MEDIA_GENERATION_FALLBACK_PROVIDER",
    "ALLOW_HIGGSFIELD_VIDEO_GENERATION",
    "HF_CREDENTIALS",
    "HF_API_KEY",
    "HF_API_SECRET",
    "HIGGSFIELD_IMAGE_MODEL",
    "HIGGSFIELD_VIDEO_MODEL",
    "HIGGSFIELD_UGC_VIDEO_MODEL",
  ]) {
    delete process.env[key];
  }
}

const now = Date.parse("2026-05-19T12:00:00.000Z");
const deferredJob = {
  id: "job-deferred",
  kind: "video_generation",
  status: "pending",
  next_run_at: MARKETING_STUDIO_WORKER_DEFERRED_UNTIL,
  created_at: "2026-05-19T11:59:00.000Z",
  retry_count: 0,
  max_attempts: 1,
};
const deferred = classifyCreativeRenderJob(deferredJob, now);
assert.equal(deferred.state, "deferred_worker_required");
assert.equal(deferred.active, false);
assert.equal(deferred.customerLabel, "Final media queued");
assert.match(deferred.customerMessage, /Final media is queued/);
assert.doesNotMatch(deferred.customerLabel, /Rendering/i);
assert.doesNotMatch(deferred.customerMessage, /provider|worker|job|system job|higgsfield|openai|qa|storage|hash|env|api key|marketing_studio|cli/i, "customer deferred copy hides internals");

const staleDeferred = classifyCreativeRenderJob({
  ...deferredJob,
  created_at: "2026-05-19T11:00:00.000Z",
}, now);
assert.equal(staleDeferred.state, "operator_action_required");
assert.match(staleDeferred.operatorMessage, /marketing_studio_cli_worker/);
assert.match(staleDeferred.operatorMessage, /next_run_at=2099-01-01T00:00:00.000Z/);

const processing = classifyCreativeRenderJob({
  id: "job-processing",
  kind: "video_generation",
  status: "processing",
  locked_by: "system_job_worker:test",
  locked_until: "2026-05-19T12:05:00.000Z",
  created_at: "2026-05-19T11:59:00.000Z",
}, now);
assert.equal(processing.state, "processing");
assert.equal(processing.customerLabel, "Rendering video...");

const providerProcessing = classifyCreativeRenderJob({
  id: "job-poll",
  kind: "video_generation_status",
  status: "pending",
  next_run_at: "2026-05-19T12:01:00.000Z",
}, now);
assert.equal(providerProcessing.state, "provider_processing");
assert.equal(providerProcessing.customerLabel, "Final media rendering");
assert.match(providerProcessing.customerMessage, /Final media is rendering/);

const failedRetry = classifyCreativeRenderJob({
  id: "job-failed",
  kind: "static_creative_generation",
  status: "failed",
  retry_count: 0,
  max_attempts: 2,
  last_error_code: "provider_start_failed",
}, now);
assert.equal(failedRetry.state, "retry_available");
assert.equal(failedRetry.customerMessage, "Render needs retry.");

assert.equal(getVideoReadinessLabel({ id: "concept", scriptHash: "script" }), "Concept ready, render needed");
assert.match(getVideoReadinessMessage({ id: "concept", scriptHash: "script" }), /Script and concept are ready/);
assert.equal(
  getVideoReadinessLabel({ id: "deferred-video", videoGenerationState: "deferred_worker_required" }),
  "Final media queued",
);
assert.doesNotMatch(
  getVideoReadinessMessage({ id: "deferred-video", videoGenerationState: "deferred_worker_required" }),
  /provider|worker|job|system job|higgsfield|openai|qa|storage|hash|api key|env|marketing_studio|cli/i,
);
assert.equal(
  getVideoReadinessLabel({ id: "queued-video", videoGenerationState: "generating" }),
  "Final media queued",
);
assert.equal(
  getVideoReadinessLabel({ id: "active-video", videoGenerationState: "generating", providerAssetId: "provider-job" }),
  "Rendering",
);
assert.equal(
  getVideoReadinessLabel({ id: "failed-video", videoGenerationState: "failed" }),
  "Render needs retry",
);

const composedFallback = buildComposedStaticAdPreview({
  category: "buyer",
  location: "Toronto",
  headline: "Budget-matched homes before public search gets crowded",
  primaryText: "Review a shortlist before the same homes get crowded.",
  cta: "See Matching Homes",
});
assert.equal(composedFallback.status, "template_fallback");
assert.equal(composedFallback.backgroundImageUrl, null);
assert.match(composedFallback.backgroundMessage, /Draft concept is shown/);
assert.ok(composedFallback.headline.length > 0);
assert.ok(composedFallback.cta.length > 0);

const unsafeGuarantee = evaluateCreativeQuality({
  category: "buyer",
  offer: "Guaranteed Approval for 600+ Credit this week",
  mechanism: "approval path review",
  audience: "Toronto first-time buyers",
  hook: "Guaranteed Approval for 600+ Credit",
  headline: "Guaranteed Approval for 600+ Credit",
  primaryText: "Guaranteed mortgage approval for buyers with 600+ credit.",
  overlayText: "Guaranteed Approval",
  cta: "See If You Qualify",
  visualConcept: "buyer consultation",
  imagePrompt: "Text-free background asset only. Buyer consultation with no readable documents.",
});
assert.equal(unsafeGuarantee.accepted, false);
assert.ok(
  unsafeGuarantee.hardFailures.some((failure) => /unsafe|guaranteed|approval|financing/i.test(failure)),
  "unsafe guaranteed approval copy is blocked by creative QA",
);

const ugcPayload = {
  creativeIntake: {
    generationPhase: "ugc_video",
  },
};
resetEnv();
assert.equal(isMarketingStudioVideoGenerationJob({ kind: "video_generation", payload: ugcPayload }), false);
assert.equal(shouldDeferMarketingStudioStaticGenerationToWorker({ kind: "video_generation", payload: ugcPayload }), false);

process.env.MEDIA_GENERATION_PROVIDER = "higgsfield_marketing_studio";
process.env.HIGGSFIELD_UGC_VIDEO_MODEL = "marketing_studio_video";
assert.equal(isMarketingStudioVideoGenerationJob({ kind: "video_generation", payload: ugcPayload }), true);
assert.equal(shouldDeferMarketingStudioStaticGenerationToWorker({ kind: "video_generation", payload: ugcPayload }), true);

process.env.MEDIA_GENERATION_FALLBACK_PROVIDER = "higgsfield";
process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION = "true";
process.env.HF_CREDENTIALS = "test-key:test-secret";
process.env.HIGGSFIELD_IMAGE_MODEL = "marketing_studio_image";
process.env.HIGGSFIELD_VIDEO_MODEL = "dop-turbo";
assert.equal(
  isMarketingStudioVideoGenerationJob({ kind: "video_generation", payload: ugcPayload }),
  false,
  "explicit configured Higgsfield API fallback prevents UGC jobs from being trapped in the CLI lane",
);

const creativeWizardSource = fs.readFileSync("src/app/(app)/build/creatives/creative-wizard.tsx", "utf8");
assert.match(creativeWizardSource, /classifyCreativeRenderJob/);
assert.match(creativeWizardSource, /Final media queued/);
assert.doesNotMatch(creativeWizardSource, /Queued for render worker|worker is available|product QA accepts/);
assert.doesNotMatch(creativeWizardSource, /\{videoActionPending \? "Rendering"/, "active job ids no longer force a Rendering label");

const scaleReadinessSource = fs.readFileSync("src/lib/services/scale-readiness-service.ts", "utf8");
assert.match(scaleReadinessSource, /stale deferred creative render jobs/);
assert.match(scaleReadinessSource, /MARKETING_STUDIO_WORKER_ENABLED/);

console.log("Creative render state regression checks passed.");
