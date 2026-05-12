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
  isMarketingStudioStaticGenerationJob,
  isMarketingStudioStaticGenerationPayload,
  shouldDeferMarketingStudioStaticGenerationToWorker,
} = require("../src/lib/services/marketing-studio-worker-contract.ts");
const {
  getMarketingStudioWorkerReadiness,
} = require("../src/lib/services/marketing-studio-worker-service.ts");
const {
  buildHiggsfieldCliEnvironment,
} = require("../src/lib/ai/higgsfield.ts");

function resetEnv() {
  for (const key of [
    "MARKETING_STUDIO_WORKER_ENABLED",
    "MEDIA_GENERATION_PROVIDER",
    "ALLOW_HIGGSFIELD_IMAGE_GENERATION",
    "HIGGSFIELD_MARKETING_STUDIO_ENABLED",
    "HIGGSFIELD_MARKETING_STUDIO_MODE",
    "HIGGSFIELD_CLI_ENABLED",
    "HIGGSFIELD_CLI_PATH",
    "HF_CREDENTIALS",
    "HF_API_KEY",
    "HF_API_SECRET",
    "HIGGSFIELD_IMAGE_MODEL",
    "HIGGSFIELD_VIDEO_MODEL",
    "FINISHED_AD_VISION_QA_ENABLED",
    "AI_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
  ]) {
    delete process.env[key];
  }
}

const finishedAdPayload = {
  force: false,
  missingOnly: true,
  creativeIntake: {
    version: 1,
    conversationId: "conversation-test",
    campaignId: "campaign-test",
    revisionNumber: 1,
    approvedAt: "2026-05-12T00:00:00.000Z",
    outputMode: "finished_ad",
    generationPhase: "static",
    promptVersion: {
      revisionNumber: 1,
      generatedPrompt: "Finished ad prompt",
      negativePrompt: "gibberish",
      sanitizedPreview: "Finished ad prompt",
      createdAt: "2026-05-12T00:00:00.000Z",
    },
  },
};

resetEnv();
assert.equal(isMarketingStudioStaticGenerationPayload(finishedAdPayload), true);
assert.equal(
  isMarketingStudioStaticGenerationJob({
    kind: "static_creative_generation",
    payload: finishedAdPayload,
  }),
  true,
  "finished-ad Marketing Studio static jobs are identified independently from the active runtime",
);
assert.equal(
  shouldDeferMarketingStudioStaticGenerationToWorker({
    kind: "static_creative_generation",
    payload: finishedAdPayload,
  }),
  true,
  "finished-ad Marketing Studio static jobs are deferred outside worker runtime",
);
process.env.MARKETING_STUDIO_WORKER_ENABLED = "true";
assert.equal(
  shouldDeferMarketingStudioStaticGenerationToWorker({
    kind: "static_creative_generation",
    payload: finishedAdPayload,
  }),
  false,
  "dedicated worker runtime can process eligible finished-ad jobs",
);
assert.equal(
  isMarketingStudioStaticGenerationPayload({
    creativeIntake: {
      outputMode: "background_only",
      generationPhase: "static",
    },
  }),
  false,
  "background-only fallback jobs stay on the existing safe path",
);

resetEnv();
const notReady = await getMarketingStudioWorkerReadiness();
assert.equal(notReady.ready, false);
assert.ok(notReady.missing.includes("MARKETING_STUDIO_WORKER_ENABLED=true"));
assert.ok(notReady.missing.includes("FINISHED_AD_VISION_QA_ENABLED=true"));

process.env.MARKETING_STUDIO_WORKER_ENABLED = "true";
process.env.MEDIA_GENERATION_PROVIDER = "higgsfield_marketing_studio";
process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION = "true";
process.env.HIGGSFIELD_MARKETING_STUDIO_ENABLED = "true";
process.env.HIGGSFIELD_MARKETING_STUDIO_MODE = "cli";
process.env.HIGGSFIELD_CLI_ENABLED = "true";
process.env.HIGGSFIELD_CLI_PATH = process.execPath;
process.env.HF_CREDENTIALS = "test-key:test-secret";
process.env.HIGGSFIELD_IMAGE_MODEL = "marketing_studio_image";
process.env.HIGGSFIELD_VIDEO_MODEL = "marketing_studio_video";
process.env.FINISHED_AD_VISION_QA_ENABLED = "true";
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
const ready = await getMarketingStudioWorkerReadiness();
assert.equal(ready.ready, true, "mocked CLI runtime plus vision QA config is worker-ready");
assert.equal(ready.checks.cliReady, true);

const minimalEnv = buildHiggsfieldCliEnvironment({
  NODE_ENV: "test",
  PATH: "/usr/bin",
  HOME: "/tmp/operator",
  HF_CREDENTIALS: "higgsfield-test",
  HIGGSFIELD_OUTPUT_DIR: "/tmp/higgsfield-output",
  MARKETING_STUDIO_WORKER_OUTPUT_DIR: "/tmp/marketing-studio-output",
  STRIPE_SECRET_KEY: "must-not-leak",
  SUPABASE_SERVICE_ROLE_KEY: "must-not-leak",
  OPENAI_API_KEY: "must-not-leak",
});
assert.equal(minimalEnv.HF_CREDENTIALS, "higgsfield-test");
assert.equal(minimalEnv.HIGGSFIELD_OUTPUT_DIR, "/tmp/higgsfield-output");
assert.equal(minimalEnv.MARKETING_STUDIO_WORKER_OUTPUT_DIR, "/tmp/marketing-studio-output");
assert.equal(minimalEnv.STRIPE_SECRET_KEY, undefined, "worker CLI child env excludes Stripe secrets");
assert.equal(minimalEnv.SUPABASE_SERVICE_ROLE_KEY, undefined, "worker CLI child env excludes service-role key");
assert.equal(minimalEnv.OPENAI_API_KEY, undefined, "worker CLI child env excludes vision provider key");

const systemJobService = fs.readFileSync("src/lib/services/system-job-service.ts", "utf8");
assert.match(systemJobService, /MARKETING_STUDIO_WORKER_DEFERRED_UNTIL/);
assert.match(
  systemJobService,
  /const deferToMarketingStudioWorker = isMarketingStudioStaticGenerationJob/,
  "Marketing Studio jobs are queued as deferred even when the dedicated worker env is enabled",
);
assert.match(systemJobService, /status: "pending"[\s\S]*next_run_at: MARKETING_STUDIO_WORKER_DEFERRED_UNTIL/);
assert.doesNotMatch(
  systemJobService,
  /Marketing Studio[\s\S]{0,300}dead_lettered_at:\s*new Date/,
  "serverless deferral does not create a dead-lettered worker debt record",
);

const generateStaticAdsRoute = fs.readFileSync("src/app/api/campaigns/[id]/generate-static-ads/route.ts", "utf8");
assert.match(generateStaticAdsRoute, /isMarketingStudioStaticGenerationPayload/);
assert.match(generateStaticAdsRoute, /return;\s*\}\s*after/s);

const workerScript = fs.readFileSync("scripts/run-marketing-studio-worker.mjs", "utf8");
assert.match(workerScript, /marketing_studio_worker\.readiness/);
assert.match(workerScript, /runMarketingStudioWorkerBatch/);

const workerService = fs.readFileSync("src/lib/services/marketing-studio-worker-service.ts", "utf8");
assert.match(workerService, /\.eq\("kind", "static_creative_generation"\)/);
assert.match(workerService, /isMarketingStudioStaticGenerationPayload/);
assert.match(workerService, /FINISHED_AD_VISION_QA_ENABLED=true/);

assert.equal(MARKETING_STUDIO_WORKER_DEFERRED_UNTIL, "2099-01-01T00:00:00.000Z");

console.log("Marketing Studio worker architecture checks passed.");
