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

function progress(label) {
  if (process.env.MARKETING_STUDIO_TEST_PROGRESS === "true") {
    console.error(`[marketing-studio-test] ${label}`);
  }
}

function resetEnv() {
  for (const key of [
    "MARKETING_STUDIO_WORKER_ENABLED",
    "MEDIA_GENERATION_PROVIDER",
    "ALLOW_HIGGSFIELD_IMAGE_GENERATION",
    "ALLOW_HIGGSFIELD_VIDEO_GENERATION",
    "HIGGSFIELD_MARKETING_STUDIO_ENABLED",
    "HIGGSFIELD_MARKETING_STUDIO_MODE",
    "HIGGSFIELD_CLI_ENABLED",
    "HIGGSFIELD_CLI_PATH",
    "HF_CREDENTIALS",
    "HF_API_KEY",
    "HF_API_SECRET",
    "HIGGSFIELD_IMAGE_MODEL",
    "HIGGSFIELD_VIDEO_MODEL",
    "HIGGSFIELD_UGC_VIDEO_MODEL",
    "FINISHED_AD_VISION_QA_ENABLED",
    "AI_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "MEDIA_GENERATION_FALLBACK_PROVIDER",
  ]) {
    delete process.env[key];
  }
}

const finishedAdPayload = {
  force: false,
  missingOnly: true,
  outputMode: "finished_ad",
  provider: "higgsfield_marketing_studio",
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
    outputMode: "background_only",
    provider: "higgsfield_marketing_studio",
    creativeIntake: {
      outputMode: "background_only",
      generationPhase: "static",
    },
  }),
  false,
  "background-only fallback jobs stay on the existing safe path",
);
assert.equal(
  isMarketingStudioStaticGenerationPayload({
    creativeIntake: finishedAdPayload.creativeIntake,
  }),
  false,
  "finished-ad jobs need explicit top-level provider/outputMode to enter the CLI worker lane",
);

delete process.env.MARKETING_STUDIO_WORKER_ENABLED;
process.env.MEDIA_GENERATION_PROVIDER = "higgsfield_marketing_studio";
process.env.HIGGSFIELD_UGC_VIDEO_MODEL = "marketing_studio_video";
assert.equal(
  shouldDeferMarketingStudioStaticGenerationToWorker({
    kind: "video_generation",
    payload: {
      creativeIntake: {
        generationPhase: "ugc_video",
      },
    },
  }),
  true,
  "Marketing Studio UGC video jobs are deferred when the selected provider requires the CLI worker",
);

process.env.MEDIA_GENERATION_FALLBACK_PROVIDER = "higgsfield";
process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION = "true";
process.env.HF_CREDENTIALS = "test-key:test-secret";
process.env.HIGGSFIELD_IMAGE_MODEL = "marketing_studio_image";
process.env.HIGGSFIELD_VIDEO_MODEL = "dop-turbo";
assert.equal(
  shouldDeferMarketingStudioStaticGenerationToWorker({
    kind: "video_generation",
    payload: {
      creativeIntake: {
        generationPhase: "ugc_video",
      },
    },
  }),
  false,
  "explicit configured API/SDK fallback keeps UGC video out of the CLI worker lane",
);

resetEnv();
progress("before not-ready readiness");
const notReady = await getMarketingStudioWorkerReadiness();
progress("after not-ready readiness");
assert.equal(notReady.ready, false);
assert.ok(notReady.missing.includes("MARKETING_STUDIO_WORKER_ENABLED=true"));
assert.ok(notReady.missing.includes("FINISHED_AD_VISION_QA_ENABLED=true"));
assert.ok(notReady.missing.includes("ALLOW_HIGGSFIELD_VIDEO_GENERATION=true"));

process.env.MARKETING_STUDIO_WORKER_ENABLED = "true";
process.env.MEDIA_GENERATION_PROVIDER = "higgsfield_marketing_studio";
process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION = "true";
process.env.ALLOW_HIGGSFIELD_VIDEO_GENERATION = "true";
process.env.HIGGSFIELD_MARKETING_STUDIO_ENABLED = "true";
process.env.HIGGSFIELD_MARKETING_STUDIO_MODE = "cli";
process.env.HIGGSFIELD_CLI_ENABLED = "true";
process.env.HIGGSFIELD_CLI_PATH = process.execPath;
process.env.HF_CREDENTIALS = "test-key:test-secret";
process.env.HIGGSFIELD_IMAGE_MODEL = "marketing_studio_image";
process.env.HIGGSFIELD_VIDEO_MODEL = "marketing_studio_video";
process.env.HIGGSFIELD_UGC_VIDEO_MODEL = "marketing_studio_video";
process.env.FINISHED_AD_VISION_QA_ENABLED = "true";
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
progress("before ready readiness");
const ready = await getMarketingStudioWorkerReadiness();
progress("after ready readiness");
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
progress("after system job read");
assert.match(systemJobService, /MARKETING_STUDIO_WORKER_DEFERRED_UNTIL/);
assert.match(systemJobService, /SYSTEM_JOB_LEASE_MS = 5 \* 60_000/);
assert.match(systemJobService, /MIN_STALE_PROCESSING_RESET_MS = SYSTEM_JOB_LEASE_MS \+ SYSTEM_JOB_STALE_BUFFER_MS/);
assert.match(systemJobService, /hasActiveProcessingLease/);
assert.match(systemJobService, /system_job_not_claimed/);
assert.match(systemJobService, /locked_until\.is\.null,locked_until\.lt/);
assert.match(systemJobService, /claimSystemJobByIdForWorker/);
assert.match(
  systemJobService,
  /const deferToMarketingStudioWorker = isMarketingStudioWorkerOwnedJob/,
  "Marketing Studio static and worker-required video jobs are queued as deferred for the dedicated worker",
);
assert.match(systemJobService, /status: "pending"[\s\S]*next_run_at: MARKETING_STUDIO_WORKER_DEFERRED_UNTIL/);
assert.doesNotMatch(
  systemJobService,
  /Marketing Studio[\s\S]{0,300}dead_lettered_at:\s*new Date/,
  "serverless deferral does not create a dead-lettered worker debt record",
);
progress("after system job assertions");

const generateStaticAdsRoute = fs.readFileSync("src/app/api/campaigns/[id]/generate-static-ads/route.ts", "utf8");
assert.match(generateStaticAdsRoute, /isMarketingStudioStaticGenerationPayload/);
assert.doesNotMatch(generateStaticAdsRoute, /processSystemJob/);
assert.match(generateStaticAdsRoute, /queued for claimed worker processing/);
const generateVideoRoute = fs.readFileSync("src/app/api/campaigns/[id]/generate-video/route.ts", "utf8");
assert.doesNotMatch(generateVideoRoute, /processSystemJob/);
assert.match(generateVideoRoute, /queued for claimed worker processing/);
const creativeStudioPage = fs.readFileSync("src/app/(app)/build/creatives/page.tsx", "utf8");
assert.match(
  creativeStudioPage,
  /\.is\("reviewed_at", null\)/,
  "Creative Studio must not show reviewed stale worker evidence as active queued render work",
);
assert.match(
  creativeStudioPage,
  /\.is\("dead_lettered_at", null\)/,
  "Creative Studio must not show dead-lettered worker evidence as active queued render work",
);
const creativeStudioWizard = fs.readFileSync("src/app/(app)/build/creatives/creative-wizard.tsx", "utf8");
assert.match(
  creativeStudioWizard,
  /job\?\.reviewed_at \|\| job\?\.dead_lettered_at/,
  "Client render-state helper must ignore reviewed or dead-lettered jobs",
);
progress("after route/ui assertions");

const workerScript = fs.readFileSync("scripts/run-marketing-studio-worker.mjs", "utf8");
assert.match(workerScript, /marketing_studio_worker\.readiness/);
assert.match(workerScript, /marketing_studio_worker\.startup/);
assert.match(workerScript, /getCommitSha/);
assert.match(workerScript, /runMarketingStudioWorkerBatch/);
assert.match(workerScript, /intervalMs:\s*5_000/, "Marketing Studio polling default must be fast enough for post-unlock pickup");
assert.match(workerScript, /Math\.min\(value,\s*10\)/, "Marketing Studio worker still caps explicit max-jobs to avoid uncontrolled provider loops");
const safeE2eScript = fs.readFileSync("scripts/run-safe-e2e.mjs", "utf8");
assert.match(
  safeE2eScript,
  /isListOnly && removedCodexCi/,
  "CODEX_CI safe E2E test discovery must not invoke Playwright's server/test runtime",
);
assert.match(
  safeE2eScript,
  /env\.TRUSTED_APP_ORIGINS = \[env\.TRUSTED_APP_ORIGINS, baseUrl\]/,
  "local production safe E2E must trust only its current base URL without weakening production CSRF guards",
);
progress("after worker script assertions");

const workerService = fs.readFileSync("src/lib/services/marketing-studio-worker-service.ts", "utf8");
assert.match(workerService, /\.in\("kind", \["static_creative_generation", "video_generation"\]\)/);
assert.match(workerService, /isMarketingStudioWorkerOwnedJob/);
assert.match(
  workerService,
  /\.is\("reviewed_at", null\)/,
  "Marketing Studio worker must not select reviewed stale/dead-letter evidence for live provider processing",
);
assert.match(workerService, /FINISHED_AD_VISION_QA_ENABLED=true/);
assert.match(workerService, /claimSystemJobByIdForWorker/);
assert.match(workerService, /ignoreNextRunAt: true/);

assert.match(
  systemJobService,
  /regenerateHiggsfieldFinishedStaticAdsForUser/,
  "Marketing Studio finished-ad static jobs must bypass the generic app-composition regeneration path",
);
assert.match(
  systemJobService,
  /marketing_studio_worker_runtime_required/,
  "Finished-ad static jobs must refuse non-worker runtimes instead of falling back to app composition",
);
progress("after worker service assertions");

const autoQueueService = fs.readFileSync("src/lib/services/static-creative-render-queue-service.ts", "utf8");
progress("after auto queue read");
assert.match(generateStaticAdsRoute, /outputMode:\s*"finished_ad"/);
assert.match(generateStaticAdsRoute, /provider:\s*"higgsfield_marketing_studio"/);
assert.doesNotMatch(
  generateStaticAdsRoute,
  /regenerateStaticCreativeAssetsForUser/,
  "Generate static ads route must enqueue finished-ad work instead of inline app-composed previews",
);
assert.match(autoQueueService, /ensureStaticCreativeRenderQueuedForCampaign/);
assert.match(autoQueueService, /creativeIntake\.outputMode !== "finished_ad"/);
assert.match(autoQueueService, /STATIC_LAUNCH_MIN_CREATIVE_COUNT - launchReadyCount/);
assert.match(autoQueueService, /static_creative_generation:auto_finished_ad/);
assert.match(autoQueueService, /targetVariantCount:\s*6/);
assert.match(autoQueueService, /promoteThreshold:\s*STATIC_LAUNCH_MIN_CREATIVE_COUNT/);
assert.match(autoQueueService, /provider:\s*"higgsfield_marketing_studio"/);
assert.match(autoQueueService, /hasSameCreativeIntakeGenerationContext/);
progress("before auto queue side effect regex");
assert.doesNotMatch(autoQueueService, /processSystemJob|createImageAd|stripe\.checkout|executeMetaCampaignLaunch|createFreshdeskTicket|sendSms/i);
progress("after auto queue side effect regex");

const unlockPage = fs.readFileSync("src/app/(app)/unlock/page.tsx", "utf8");
assert.match(unlockPage, /ensureStaticCreativeRenderQueuedForCampaign/);
assert.match(unlockPage, /reason:\s*activatedByCheckout \? "checkout_success" : "subscription_active"/);

const creativeIntakeRoute = fs.readFileSync("src/app/api/campaigns/[id]/creative-intake/route.ts", "utf8");
assert.match(creativeIntakeRoute, /body\.action === "approve"/);
assert.match(creativeIntakeRoute, /manual_render_required/);

assert.doesNotMatch(creativeStudioPage, /reason:\s*"creative_studio_visit"/);
assert.doesNotMatch(creativeStudioPage, /ensureStaticCreativeRenderQueuedForCampaign/);
progress("after auto queue assertions");

const operatorDebtScript = fs.readFileSync("scripts/check-operator-debt.mjs", "utf8");
assert.match(operatorDebtScript, /getSelectedBlockedStaticAssetDebt/);
assert.match(operatorDebtScript, /dealflow_app_composer/);
assert.match(operatorDebtScript, /app_composed_static_v2/);
assert.match(operatorDebtScript, /Selected app-composed\/fallback static assets/);

assert.equal(MARKETING_STUDIO_WORKER_DEFERRED_UNTIL, "2099-01-01T00:00:00.000Z");
progress("after operator debt assertions");

console.log("Marketing Studio worker architecture checks passed.");
process.exit(0);
