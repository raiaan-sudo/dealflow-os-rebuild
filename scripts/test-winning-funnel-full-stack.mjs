#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const repoRoot = process.cwd();
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolve.call(this, path.join(repoRoot, "src", request.slice(2)), parent, isMain, options);
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
const { buildWinningFunnel } = require("../src/lib/funnels/winning-template/build-winning-funnel.ts");
const { buildWinningFunnelMigration } = require("../src/lib/funnels/winning-template/migration.ts");
const {
  createWinningFunnelState,
  approveWinningFunnelDraft,
  publishApprovedWinningFunnel,
  winningFunnelSnapshotsMatch,
} = require("../src/lib/funnels/winning-template/snapshot.ts");
const { validateWinningFunnel } = require("../src/lib/funnels/winning-template/validation.ts");
const { WINNING_FUNNEL_TEMPLATE_ID } = require("../src/lib/funnels/winning-template/schema.ts");
const publicFunnelPage = fs.readFileSync("src/app/f/[slug]/page.tsx", "utf8");

function buildFixture(overrides = {}) {
  return buildWinningFunnel({
    location: "Quebec City, QC",
    audience: "downsizers wanting a simpler next move",
    offer: "A custom downsizing plan",
    primaryCTA: "Get My Plan",
    market_type: "seller",
    language: "fr",
    leadCaptureMode: "deep_qualification",
    agentName: "EGEN Advisor",
    brokerageName: "EGEN Media",
    proofBadges: ["Local market plan"],
    testimonials: [{ quote: "Clear and practical.", name: "Local seller", label: "Seller" }],
    theme: {
      primaryColor: "#188BF6",
      secondaryColor: "#0A0A0A",
      accentColor: "#10B981",
      fontPreset: "modern",
      logoUrl: "https://example.com/logo.png",
    },
    ...overrides,
  });
}

const funnel = buildFixture();
assert.equal(funnel.funnelTemplateId, WINNING_FUNNEL_TEMPLATE_ID, "new funnels must use the winning template");
assert.equal(validateWinningFunnel(funnel).ok, true, "winning funnel must validate");
assert.equal(funnel.language, "fr", "French language must persist");
assert.equal(funnel.theme.primaryColor, "#188BF6", "partner theme primary color must persist");
assert.equal(funnel.theme.logoUrl, "https://example.com/logo.png", "partner logo must persist");
assert.ok(funnel.sections.some((section) => section.variant === "native-multi-step-quiz"), "native quiz section must render");
assert.ok(funnel.quizSteps.some((step) => step.id === "contact"), "contact step must be present");
assert.doesNotMatch(JSON.stringify(funnel), /direct-response funnel V1|Legacy generated funnel/i, "winning output must not leak legacy copy");

const state = createWinningFunnelState({ location: "Austin, TX", offer: "Private buyer list" });
const approved = approveWinningFunnelDraft(state);
assert.ok(approved.approvedFunnelSnapshot, "draft can be approved");
const published = publishApprovedWinningFunnel(approved);
assert.ok(published.publishedFunnelSnapshot, "approved snapshot can be published");
assert.equal(
  winningFunnelSnapshotsMatch({
    approvedFunnelSnapshot: published.approvedFunnelSnapshot,
    publishedFunnelSnapshot: published.publishedFunnelSnapshot,
  }),
  true,
  "approved and published snapshots match after publish",
);

const migrated = buildWinningFunnelMigration({
  campaignId: "campaign-1",
  mode: "dry-run",
  campaignPlan: {
    market: "Toronto, ON",
    audience: "buyers",
    key_offer: "Under-market homes",
    intent: "buyer",
    funnel: { headline: "Old random funnel", cta: "Apply" },
  },
});
assert.equal(migrated.winningFunnel.funnelTemplateId, WINNING_FUNNEL_TEMPLATE_ID, "migration must produce winning funnel");
assert.equal(Boolean(migrated.archivedLegacyFunnel), true, "migration must archive legacy source");
assert.equal(migrated.changed, true, "migration should detect legacy replacement");

const volume = buildFixture({ language: "es", leadCaptureMode: "volume_lead_form", market_type: "buyer" });
assert.equal(volume.language, "es", "Spanish language must persist");
assert.equal(volume.leadCaptureMode, "volume_lead_form", "lead form volume mode must persist");
assert.ok(volume.sections.some((section) => /low-friction lead form/i.test(section.content.join(" "))), "volume mode copy must be reflected");

assert.match(
  publicFunnelPage,
  /getPublicFunnelTheme\(record\.funnel\)/,
  "public funnel renderer must load theme from the published funnel snapshot",
);
assert.match(
  publicFunnelPage,
  /getPublicFunnelAgent\(record\.funnel\)/,
  "public funnel renderer must load agent identity from the published funnel snapshot",
);
assert.match(
  publicFunnelPage,
  /--funnel-accent/,
  "public funnel renderer must expose saved theme colors as CSS variables",
);
assert.match(
  publicFunnelPage,
  /theme\.logoUrl/,
  "public funnel renderer must render the saved logo when present",
);

console.log("winning funnel full-stack regression checks passed.");
