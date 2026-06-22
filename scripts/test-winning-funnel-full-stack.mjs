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
const { isInstantFormCampaign } = require("../src/lib/campaign-destination.ts");
const {
  buildCanonicalFunnelFromRecord,
  containsLegacyDefaultFunnelCopy,
} = require("../src/lib/funnels/canonical-funnel.ts");
const publicFunnelPage = fs.readFileSync("src/app/f/[slug]/page.tsx", "utf8");
const funnelPreview = fs.readFileSync("src/components/funnel/funnel-preview.tsx", "utf8");
const canonicalRenderer = fs.readFileSync("src/components/funnels/canonical-funnel-renderer.tsx", "utf8");

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
assert.equal(funnel.sections.length, 4, "reference opt-in funnel must not add long-form sections");
assert.deepEqual(funnel.form_fields, ["name", "phone", "email"], "reference opt-in funnel must keep the simple opt-in fields");
assert.ok(funnel.sections.some((section) => section.variant === "reference-centered-hero"), "centered hero section must render");
assert.ok(funnel.sections.some((section) => section.variant === "reference-trust-row"), "trust bullet section must render");
assert.ok(funnel.sections.some((section) => section.variant === "reference-opt-in-card"), "opt-in card section must render");
assert.doesNotMatch(
  JSON.stringify(funnel),
  /direct-response funnel V1|Legacy generated funnel|View homes that actually match your criteria|Quick capture|Local real estate advisor|Get List|native-multi-step-quiz|Meet your advisor|Real results from real clients|Start with the short quiz/i,
  "winning output must not leak legacy copy",
);

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
assert.equal(
  isInstantFormCampaign({ leadCaptureMode: volume.leadCaptureMode }),
  true,
  "lead form volume mode must classify into the instant-form UI/readiness path",
);

assert.match(
  publicFunnelPage,
  /buildCanonicalFunnelFromRecord\(record\)/,
  "public funnel route must resolve the canonical funnel from the campaign record",
);
assert.match(
  publicFunnelPage,
  /CanonicalFunnelRenderer/,
  "public funnel route must use the shared canonical renderer",
);
assert.match(
  funnelPreview,
  /CanonicalFunnelRenderer/,
  "internal funnel preview must use the shared canonical renderer",
);
assert.match(
  canonicalRenderer,
  /--funnel-accent/,
  "public funnel renderer must expose saved theme colors as CSS variables",
);
assert.match(
  canonicalRenderer,
  /theme\.logoUrl/,
  "public funnel renderer must render the saved logo when present",
);
assert.match(
  canonicalRenderer,
  /reference opt-in/i,
  "public funnel renderer must expose the reference opt-in preview marker",
);
assert.doesNotMatch(
  canonicalRenderer,
  /RenderSection|CanonicalLeadPreviewCard|Start with a few quick questions|Meet your advisor|Real results from real clients/i,
  "public funnel renderer must not render the old long-form quiz/proof sections",
);

const staleRecord = {
  campaign: {
    id: "campaign-stale",
    user_id: "user-1",
    organization_id: "org-1",
    name: "Toronto buyer campaign",
    location: "Toronto, ON",
    audience: "buyers",
    offer: "Custom home list",
    price_point: "$800k",
    market_type: "buyer",
    funnel_goal: "survey",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  strategy: {
    location: "Toronto, ON",
    audience: "home buyers",
    offer: "Custom home list",
    market_type: "buyer",
    funnel_goal: "survey",
  },
  plan: {
    intent: "buyer",
    market: "Toronto, ON",
    audience: "home buyers",
    offer: "Custom home list",
    property_type: "homes",
    business_name: "Local Realty",
    client_name: "Local Realty",
    primary_goal: "Buyer campaign",
    timeline: "30 days",
    mechanism: "custom list",
    creative_strategy: {},
    pain_points: [],
    monthly_budget: 900,
    summary: "summary",
    targeting_summary: "targeting",
    offer_summary: "Custom home list",
    funnel_type: "landing_page_survey",
    funnel_steps: [],
  },
  funnel: {
    funnel_type: "landing_page_survey",
    headline: "View homes that actually match your criteria",
    subheadline: "Get a focused home shortlist.",
    cta: "Get List",
    sections: [],
    form_fields: ["name", "phone", "email"],
    follow_up_action: "show_thank_you_page",
    optimization_notes: [],
  },
  creatives: { items: [], ideas: [], copy: [], ads: [], staticAds: [], videoAds: [] },
  launch: { runtime: {} },
  results: { optimizations: [] },
  publish: {
    state: "published",
    slug: "toronto-buyer",
    stagedAt: null,
    publishedAt: null,
    hasStagedSnapshot: false,
    hasPublishedSnapshot: true,
  },
};
const canonicalFromStale = buildCanonicalFunnelFromRecord(staleRecord);
assert.equal(canonicalFromStale.funnelTemplateId, WINNING_FUNNEL_TEMPLATE_ID, "stale saved funnel must resolve to canonical template");
assert.equal(containsLegacyDefaultFunnelCopy(staleRecord.funnel), true, "legacy detector must detect stale saved funnel copy");
assert.equal(containsLegacyDefaultFunnelCopy(canonicalFromStale), false, "canonical fallback must remove stale default copy");

console.log("winning funnel full-stack regression checks passed.");
