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
  getImageGenerationProvider,
} = require("../src/lib/integrations/creative/image-provider.ts");
const {
  extractHiggsfieldCliGenerationAssets,
  generateHiggsfieldImage,
  generateHiggsfieldMarketingStudioImage,
  getHiggsfieldConfigValidation,
  isHiggsfieldConfigured,
} = require("../src/lib/ai/higgsfield.ts");

function resetEnv() {
  delete process.env.MEDIA_GENERATION_PROVIDER;
  delete process.env.HF_CREDENTIALS;
  delete process.env.HF_API_KEY;
  delete process.env.HF_API_SECRET;
  delete process.env.HIGGSFIELD_IMAGE_MODEL;
  delete process.env.HIGGSFIELD_VIDEO_MODEL;
  delete process.env.HIGGSFIELD_MARKETING_STUDIO_ENABLED;
  delete process.env.HIGGSFIELD_CLI_ENABLED;
  delete process.env.HIGGSFIELD_CLI_PATH;
  delete process.env.HIGGSFIELD_MARKETING_STUDIO_MODE;
  delete process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION;
  delete process.env.ALLOW_OPENAI_IMAGE_GENERATION;
  delete process.env.OPENAI_API_KEY;
}

resetEnv();
const cliListResult = extractHiggsfieldCliGenerationAssets([
  {
    id: "generation-list-test",
    result_url: "https://d8j0ntlcm91z4.cloudfront.net/user/list-result.png",
  },
]);
assert.equal(cliListResult.requestId, "generation-list-test");
assert.equal(
  cliListResult.fileUrl,
  "https://d8j0ntlcm91z4.cloudfront.net/user/list-result.png",
  "CLI generate list/get result_url shape is supported",
);

resetEnv();
const nestedCliResult = extractHiggsfieldCliGenerationAssets({
  id: "generation-test",
  status: "completed",
  result: {
    webpage_url: "https://platform.higgsfield.ai/generations/generation-test",
    outputs: [
      {
        preview_url: "https://d8j0ntlcm91z4.cloudfront.net/user/result.png",
        thumbnail_url: "https://d8j0ntlcm91z4.cloudfront.net/user/result-thumb.png",
      },
    ],
  },
});
assert.equal(nestedCliResult.requestId, "generation-test");
assert.equal(
  nestedCliResult.fileUrl,
  "https://d8j0ntlcm91z4.cloudfront.net/user/result.png",
  "nested CLI image URL wins over a status/web page URL",
);
assert.equal(
  nestedCliResult.thumbnailUrl,
  "https://d8j0ntlcm91z4.cloudfront.net/user/result-thumb.png",
  "nested CLI thumbnail URL is preserved",
);

const localCliResult = extractHiggsfieldCliGenerationAssets({
  request_id: "generation-local",
  outputs: [
    {
      local_path: "/tmp/higgsfield-output/generated.png",
    },
  ],
});
assert.equal(localCliResult.requestId, "generation-local");
assert.equal(
  localCliResult.fileUrl,
  "/tmp/higgsfield-output/generated.png",
  "local CLI output paths are supported for worker-side normalization",
);

const higgsfieldSource = fs.readFileSync("src/lib/ai/higgsfield.ts", "utf8");
assert.match(
  higgsfieldSource,
  /"generate", "get", extracted\.requestId/,
  "CLI id-only results are resolved through generate get before failing storage normalization",
);

resetEnv();
process.env.MEDIA_GENERATION_PROVIDER = "higgsfield";
assert.equal(isHiggsfieldConfigured(), false, "Higgsfield is not configured without credentials");
assert.equal(getImageGenerationProvider().name, "unsupported", "missing credentials select the unsupported fallback");

process.env.HF_CREDENTIALS = "test-key:test-secret";
process.env.HIGGSFIELD_IMAGE_MODEL = "marketing_studio_image";
process.env.HIGGSFIELD_VIDEO_MODEL = "marketing_studio_video";
process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION = "false";

const validation = getHiggsfieldConfigValidation();
assert.equal(validation.configured, true, "Marketing Studio aliases validate when credentials are present");

const higgsfield = getImageGenerationProvider();
assert.equal(higgsfield.name, "higgsfield", "MEDIA_GENERATION_PROVIDER=higgsfield selects the Higgsfield adapter");

const status = await higgsfield.checkStatus();
assert.equal(status.status, "disconnected", "Higgsfield status stays disconnected while the usage guard is disabled");
assert.equal(status.state, "configured", "credentials can be configured without allowing paid provider calls");
assert.equal(status.metadata?.usageGuardEnabled, false);

const blocked = await higgsfield.execute({
  prompt: "TEXT-FREE BACKGROUND ASSET ONLY. Clean real estate source photo.",
  negativePrompt: "text; final ad layout",
  aspectRatio: "1:1",
});
assert.equal(blocked.ok, false, "Higgsfield calls stay blocked unless explicitly enabled");
assert.equal(blocked.status, "unsupported");
assert.match(blocked.error ?? "", /disabled|explicitly enabled/i);
await assert.rejects(
  () => generateHiggsfieldImage({
    prompt: "TEXT-FREE BACKGROUND ASSET ONLY. Clean real estate source photo.",
    model: "marketing_studio_image",
  }),
  /Marketing Studio image generation|supported alias|explicit endpoint path/,
  "unknown Higgsfield image model names fail closed before guessed endpoint calls",
);

resetEnv();
process.env.MEDIA_GENERATION_PROVIDER = "higgsfield_marketing_studio";
process.env.HF_CREDENTIALS = "test-key:test-secret";
process.env.HIGGSFIELD_IMAGE_MODEL = "marketing_studio_image";
process.env.HIGGSFIELD_VIDEO_MODEL = "marketing_studio_video";
process.env.HIGGSFIELD_MARKETING_STUDIO_ENABLED = "true";
process.env.HIGGSFIELD_CLI_ENABLED = "true";
process.env.HIGGSFIELD_CLI_PATH = process.execPath;
process.env.HIGGSFIELD_MARKETING_STUDIO_MODE = "cli";
process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION = "false";

const marketingStudio = getImageGenerationProvider();
assert.equal(marketingStudio.name, "higgsfield_marketing_studio", "Marketing Studio provider is selected when configured");
const marketingStudioStatus = await marketingStudio.checkStatus();
assert.equal(marketingStudioStatus.status, "disconnected", "Marketing Studio remains disconnected while paid usage guard is disabled");
assert.equal(marketingStudioStatus.metadata?.cliEnabled, true, "CLI support is surfaced in provider status metadata");
assert.equal(marketingStudioStatus.metadata?.cliReady, true, "CLI readiness is surfaced in provider status metadata");
assert.equal(marketingStudioStatus.metadata?.mcpStatus, "future_only", "MCP readiness is marked future-only");
assert.equal(marketingStudioStatus.metadata?.mode, "cli");
const marketingBlocked = await marketingStudio.execute({
  prompt: "Create a finished paid social creative for first-time buyers in Brampton.",
  aspectRatio: "1:1",
});
assert.equal(marketingBlocked.ok, false, "Marketing Studio calls stay blocked unless explicitly enabled");
assert.equal(marketingBlocked.status, "unsupported");

resetEnv();
process.env.MEDIA_GENERATION_PROVIDER = "higgsfield_marketing_studio";
process.env.HF_CREDENTIALS = "test-key:test-secret";
process.env.HIGGSFIELD_IMAGE_MODEL = "marketing_studio_image";
process.env.HIGGSFIELD_VIDEO_MODEL = "marketing_studio_video";
process.env.HIGGSFIELD_MARKETING_STUDIO_ENABLED = "true";
process.env.HIGGSFIELD_CLI_ENABLED = "false";
process.env.HIGGSFIELD_MARKETING_STUDIO_MODE = "api_adapter";
process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION = "true";

const apiModeStudio = getImageGenerationProvider();
assert.equal(apiModeStudio.name, "higgsfield_marketing_studio", "Marketing Studio selection stays in its fail-closed adapter");
const apiModeStatus = await apiModeStudio.checkStatus();
assert.equal(apiModeStatus.status, "disconnected", "API adapter mode is not reported as ready");
assert.equal(apiModeStatus.metadata?.mcpStatus, "future_only", "MCP readiness is not claimed in API mode");
const apiModeBlocked = await apiModeStudio.execute({
  prompt: "Create a finished paid social creative for first-time buyers in Brampton.",
  aspectRatio: "1:1",
});
assert.equal(apiModeBlocked.ok, false, "Marketing Studio API mode fails closed without a provider call");
assert.equal(apiModeBlocked.status, "unsupported");
assert.match(apiModeBlocked.error ?? "", /future-only|CLI|not ready/i);
await assert.rejects(
  () => generateHiggsfieldMarketingStudioImage({
    prompt: "Create a finished paid social creative for first-time buyers in Brampton.",
    model: "marketing_studio_image",
  }),
  /future-only|CLI|not ready/i,
  "Marketing Studio API mode direct helper fails closed before provider calls",
);

resetEnv();
process.env.MEDIA_GENERATION_PROVIDER = "openai";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.ALLOW_OPENAI_IMAGE_GENERATION = "false";
assert.equal(getImageGenerationProvider().name, "openai", "OpenAI fallback remains selectable when media provider is not Higgsfield");

console.log("Higgsfield provider selection tests passed.");
