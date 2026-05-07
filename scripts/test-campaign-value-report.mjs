#!/usr/bin/env node

import assert from "node:assert/strict";
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
const { buildCampaignProgressReport } = require("../src/lib/services/campaign-value-report-builder.ts");

function basePlan(intent) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000002",
    clientName: "QA Realty",
    businessName: "QA Realty",
    intent,
    market: "Toronto",
    monthlyBudget: 3000,
    primaryGoal: "Generate qualified real estate conversations",
    timeline: "30 days",
    audience: `${intent} audience`,
    propertyType: "Homes",
    keyOffer: "Campaign value offer",
    painPoints: ["slow lead flow"],
    mechanism: "deterministic report engine",
    creativeStrategy: {
      campaignCategory: intent === "commercial" ? "buyer" : intent,
      mechanism: "deterministic report engine",
      proofStyle: "clear weekly progress",
    },
    funnelType: "lead_capture",
    targetingSummary: "Local audience",
    offerSummary: "Campaign value offer",
    summary: "QA plan",
    funnelSteps: ["hero", "form"],
    creativeBrief: {},
    creatives: {
      staticAds: [{ id: "static-1" }, { id: "static-2" }],
      videoAds: [{ id: "video-1" }],
    },
    ads: [
      {
        id: "ad-1",
        variant: "proof",
        headline: "Weekly proof ad",
        overlayText: "See campaign progress",
        body: "Review assets, leads, and next steps.",
        cta: "Review Report",
        image: "/placeholder.png",
      },
    ],
    funnel: {
      headline: "Campaign report funnel",
      sections: [{ id: "hero", type: "hero", title: "Hero", content: [], visible: true }],
      formFields: ["name", "phone", "email"],
      followUpAction: "follow_up",
      optimizationNotes: [],
    },
    runtime: {
      status: "live",
      campaignId: "meta-campaign-1",
      metaAdSetIds: ["adset-1"],
      metaAdIds: ["ad-1"],
      metaPushStatus: "published",
    },
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

const baseMetaConnection = {
  connectionStatus: "connected",
  hasAccessToken: true,
  accountId: "act_123",
  accountName: "QA Ad Account",
  pageId: "page_123",
  pageName: "QA Page",
  tracking: { pixelId: "pixel_123" },
};

const baseSyncSnapshot = {
  syncedAt: "2026-05-04T12:00:00.000Z",
  campaignStatus: "PAUSED",
  deliveryMetrics: {
    spend: 120,
    impressions: 4000,
    clicks: 80,
    leads: 4,
    ctr: 0.02,
    cpl: 30,
  },
};

const baseMetrics = {
  totalSpend: 120,
  totalLeads: 4,
  appointmentsBooked: 1,
};

const optimizerResult = {
  status: "stable",
  reasons: [],
  actions: ["Keep monitoring the current winner before increasing budget."],
  testingRecommendations: ["Prepare one proof-led challenger."],
  regenerationSuggestions: [],
};

for (const intent of ["buyer", "seller", "investor", "commercial"]) {
  const report = buildCampaignProgressReport({
    plan: basePlan(intent),
    metaConnection: baseMetaConnection,
    syncSnapshot: baseSyncSnapshot,
    launchRecord: { resultStatus: "paused" },
    metrics: baseMetrics,
    recentLeads: [
      {
        status: "new",
        source: "funnel",
        created_at: "2026-05-04T11:00:00.000Z",
        email: "must-not-appear@example.com",
        phone: "+15555555555",
        first_name: "Private",
      },
    ],
    creativePerformanceSummary: {
      syncedAt: "2026-05-04T12:00:00.000Z",
      winners: [{ headline: "Winning proof ad" }],
      underperformers: [{ headline: "Weak broad ad" }],
      rankedCreatives: [],
      learned: ["Proof-led hooks are working."],
    },
    optimizerResult,
    nextActions: ["Review weekly report."],
    selectedAdSummary: {
      id: "ad-1",
      headline: "Selected weekly ad",
      primaryText: "Safe summary text.",
    },
    leadLoopVerified: true,
    now: new Date("2026-05-04T12:00:00.000Z"),
  });

  assert.equal(report.reportType, "weekly_value");
  assert.equal(report.campaign.mode, intent);
  assert.equal(report.status, "active");
  assert.equal(report.assets.staticAdsGenerated, 2);
  assert.equal(report.assets.videoAdsGenerated, 1);
  assert.equal(report.metrics.leads, 4);
  assert.equal(report.creativeInsights.winner, "Winning proof ad");
  assert.ok(report.recommendations.length > 0);
  assert.ok(report.monitoringNext.some((item) => /Lead capture/.test(item)));

  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes("must-not-appear@example.com"));
  assert.ok(!serialized.includes("+15555555555"));
  assert.ok(!serialized.includes("Private"));
}

const emptyReport = buildCampaignProgressReport({
  plan: { ...basePlan("buyer"), runtime: { status: "draft" } },
  metaConnection: { ...baseMetaConnection, connectionStatus: "disconnected", hasAccessToken: false },
  syncSnapshot: null,
  launchRecord: null,
  metrics: { totalSpend: 0, totalLeads: 0, appointmentsBooked: 0 },
  recentLeads: [],
  creativePerformanceSummary: null,
  optimizerResult,
  nextActions: [],
  selectedAdSummary: null,
  leadLoopVerified: false,
  now: new Date("2026-05-04T12:00:00.000Z"),
});

assert.equal(emptyReport.status, "setup");
assert.match(emptyReport.emptyState, /Connect Meta/);

console.log("Campaign value report tests passed.");
