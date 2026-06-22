#!/usr/bin/env node

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
  assertProviderGenerationHardCapsConfigured,
  assertProviderGenerationSpendAllowed,
  getProviderGenerationSpendGateSnapshot,
  isProviderGenerationLiveEnvEnabled,
} = require("../src/lib/services/provider-generation-spend-guard.ts");

function resetEnv() {
  for (const key of [
    "PROVIDER_GENERATION_HARD_CAPS_ENABLED",
    "PROVIDER_GENERATION_KILL_SWITCH",
    "PROVIDER_GENERATION_DAILY_COST_CAP_CENTS",
    "PROVIDER_GENERATION_IMAGE_DAILY_CAP",
    "PROVIDER_GENERATION_IMAGE_MAX_PER_REQUEST",
    "PROVIDER_GENERATION_IMAGE_ESTIMATED_COST_CENTS",
    "PROVIDER_GENERATION_VIDEO_DAILY_CAP",
    "PROVIDER_GENERATION_VIDEO_MAX_PER_REQUEST",
    "PROVIDER_GENERATION_VIDEO_ESTIMATED_COST_CENTS",
    "MEDIA_GENERATION_PROVIDER",
    "ALLOW_HIGGSFIELD_IMAGE_GENERATION",
    "ALLOW_HIGGSFIELD_VIDEO_GENERATION",
    "ALLOW_OPENAI_IMAGE_GENERATION",
    "ALLOW_HEYGEN_VIDEO_GENERATION",
  ]) {
    delete process.env[key];
  }
}

async function rejectsWithCode(fn, code) {
  await assert.rejects(async () => fn(), (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

function fakeAdmin(rows) {
  return {
    from(table) {
      assert.equal(table, "provider_usage_events");
      return {
        select(columns) {
          assert.equal(columns, "estimated_cost,actual_cost");
          return this;
        },
        in(column, values) {
          assert.equal(column, "status");
          assert.deepEqual(values, ["reserved", "consumed", "failed"]);
          return this;
        },
        gte(column, value) {
          assert.equal(column, "created_at");
          assert.match(value, /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
          return Promise.resolve({ data: rows, error: null });
        },
      };
    },
  };
}

resetEnv();
assert.equal(isProviderGenerationLiveEnvEnabled("image_generation"), false);
assert.equal(isProviderGenerationLiveEnvEnabled("video_generation"), false);
let snapshot = getProviderGenerationSpendGateSnapshot();
assert.equal(snapshot.hardCapsEnabled, false);
assert.equal(snapshot.killSwitchEnabled, false);

await rejectsWithCode(
  () => assertProviderGenerationHardCapsConfigured({ operation: "image_generation", requestedCount: 1 }),
  "provider_generation_hard_caps_disabled",
);

process.env.PROVIDER_GENERATION_HARD_CAPS_ENABLED = "true";
process.env.PROVIDER_GENERATION_KILL_SWITCH = "true";
await rejectsWithCode(
  () => assertProviderGenerationHardCapsConfigured({ operation: "image_generation", requestedCount: 1 }),
  "provider_generation_kill_switch_enabled",
);

process.env.PROVIDER_GENERATION_KILL_SWITCH = "false";
await rejectsWithCode(
  () => assertProviderGenerationHardCapsConfigured({ operation: "image_generation", requestedCount: 1 }),
  "provider_generation_hard_caps_incomplete",
);

process.env.PROVIDER_GENERATION_DAILY_COST_CAP_CENTS = "500";
process.env.PROVIDER_GENERATION_IMAGE_DAILY_CAP = "3";
process.env.PROVIDER_GENERATION_IMAGE_MAX_PER_REQUEST = "2";
process.env.PROVIDER_GENERATION_IMAGE_ESTIMATED_COST_CENTS = "100";
await rejectsWithCode(
  () => assertProviderGenerationHardCapsConfigured({ operation: "image_generation", requestedCount: 3 }),
  "provider_generation_request_cap_exceeded",
);

const configured = assertProviderGenerationHardCapsConfigured({
  operation: "image_generation",
  requestedCount: 2,
});
assert.equal(configured.dailyCountCap, 3);
assert.equal(configured.estimatedCost, 1);
assert.equal(configured.dailyCostCapCents, 500);

process.env.MEDIA_GENERATION_PROVIDER = "higgsfield_marketing_studio";
process.env.ALLOW_HIGGSFIELD_IMAGE_GENERATION = "true";
snapshot = getProviderGenerationSpendGateSnapshot();
assert.equal(snapshot.image.liveEnvEnabled, true);
assert.equal(snapshot.video.liveEnvEnabled, false);

const allowed = await assertProviderGenerationSpendAllowed({
  admin: fakeAdmin([{ estimated_cost: 1.25, actual_cost: null }]),
  provider: "higgsfield",
  operation: "image_generation",
  userId: "user-test",
  organizationId: "org-test",
  campaignId: "campaign-test",
  requestedCount: 1,
});
assert.equal(allowed.currentCostCents, 125);
assert.equal(allowed.requestedCostCents, 100);
assert.equal(allowed.nextCostCents, 225);

await rejectsWithCode(
  () =>
    assertProviderGenerationSpendAllowed({
      admin: fakeAdmin([{ estimated_cost: 4.25, actual_cost: null }]),
      provider: "higgsfield",
      operation: "image_generation",
      userId: "user-test",
      organizationId: "org-test",
      campaignId: "campaign-test",
      requestedCount: 1,
    }),
  "provider_generation_daily_cost_cap_reached",
);

const guardSource = fs.readFileSync("src/lib/services/provider-generation-spend-guard.ts", "utf8");
const sessionCostGuard = fs.readFileSync("src/lib/services/session-cost-guard.ts", "utf8");
const staticRoute = fs.readFileSync("src/app/api/campaigns/[id]/generate-static-ads/route.ts", "utf8");
const videoRoute = fs.readFileSync("src/app/api/campaigns/[id]/generate-video/route.ts", "utf8");
const internalMonitor = fs.readFileSync("src/lib/services/internal-launch-monitor.ts", "utf8");

assert.match(guardSource, /PROVIDER_GENERATION_HARD_CAPS_ENABLED/);
assert.match(guardSource, /PROVIDER_GENERATION_KILL_SWITCH/);
assert.match(guardSource, /PROVIDER_GENERATION_DAILY_COST_CAP_CENTS/);
assert.match(sessionCostGuard, /assertProviderGenerationSpendAllowed/);
assert.match(sessionCostGuard, /p_limit_count: effectiveLimit/);
assert.match(sessionCostGuard, /p_estimated_cost: params\.estimatedCost \?\? spendGuard\.estimatedCost/);
assert.match(staticRoute, /assertProviderGenerationHardCapsConfigured/);
assert.match(staticRoute, /isProviderGenerationLiveEnvEnabled\("image_generation"\)/);
assert.match(videoRoute, /assertProviderGenerationHardCapsConfigured/);
assert.match(internalMonitor, /loadProviderSpendGateIssues/);
assert.doesNotMatch(guardSource, /process\.env\.(OPENAI_API_KEY|HF_CREDENTIALS|HF_API_KEY|HF_API_SECRET|HEYGEN_API_KEY)/);

console.log("PASS provider generation spend cap assertions");
