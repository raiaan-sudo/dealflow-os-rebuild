import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const require = createRequire(import.meta.url);

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

require.extensions[".ts"] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const creativeChatIntakeUi = fs.readFileSync("src/app/(app)/build/creatives/creative-chat-intake.tsx", "utf8");
const generateCreativesRoute = fs.readFileSync("src/app/api/generate-creatives/route.ts", "utf8");
const generateStaticAdsRoute = fs.readFileSync("src/app/api/campaigns/[id]/generate-static-ads/route.ts", "utf8");

assert.match(
  creativeChatIntakeUi,
  /fetch\("\/api\/generate-creatives"/,
  "approving the creative brief must call the safe creative package generator",
);
assert.match(
  creativeChatIntakeUi,
  /router\.replace\(`\/build\/creatives\?campaignId=\$\{encodeURIComponent\(campaignId\)\}`\)/,
  "successful approve/regenerate must leave the creativeBrief=edit URL state",
);
assert.match(
  creativeChatIntakeUi,
  /Regenerate Creative Set/,
  "previously approved briefs must expose a regenerate CTA instead of trapping users",
);
assert.match(
  creativeChatIntakeUi,
  /Creative brief was saved, but the creative set could not be generated/,
  "generation failures must show a visible recovery error",
);
assert.doesNotMatch(
  creativeChatIntakeUi,
  /workspace refreshes/,
  "the Creative step must not tell customers to rely on a workspace refresh",
);
assert.doesNotMatch(
  generateCreativesRoute,
  /generateStaticCreativeAds|regenerateStaticCreativeAssetsForUser|providerUsage|Higgsfield|HeyGen|OpenAI/,
  "the safe creative package generator must not call paid provider rendering",
);
assert.match(
  generateStaticAdsRoute,
  /creative_brief_review_required/,
  "paid static rendering remains gated behind approved creative brief state",
);

const { buildCreativeSystem } = require("../src/lib/services/creative-engine.ts");
const generated = buildCreativeSystem({
  location: "Toronto, ON",
  audience: "move-ready sellers comparing agents",
  offer: "Home value review and selling plan",
  property_type: "detached homes",
  market_type: "seller",
  desired_result: "book seller conversations",
  mechanism: "local value review",
  pain_points: ["unclear home value", "timing the move", "choosing the right selling plan"],
});
const generatedCopy = JSON.stringify({
  staticAds: generated.staticAds.map((ad) => ({
    headline: ad.headline,
    primaryText: ad.primaryText,
    cta: ad.cta,
    visualConcept: ad.visualConcept,
  })),
  videoAds: generated.videoAds.map((ad) => ({
    title: ad.title,
    hook: ad.hook,
    script: ad.script,
    cta: ad.cta,
  })),
});
const bannedAiPhrases =
  /unlock your dream home|seamlessly|elevate|tailored solutions|your journey starts here|transform your real estate experience|leverage cutting-edge/i;

assert.doesNotMatch(generatedCopy, bannedAiPhrases, "generated copy must avoid obvious AI-marketing phrases");
assert.match(generatedCopy, /home|seller|value|call|plan|local/i, "generated copy should stay concrete and real-estate specific");

console.log("creative edit/regenerate flow checks passed.");
