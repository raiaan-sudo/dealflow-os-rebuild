#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const helperSource = fs.readFileSync(
  "src/lib/dashboard/campaign-delivery-metrics.ts",
  "utf8",
);
const componentSource = fs.readFileSync(
  "src/components/dashboard/campaign-dashboard-view.tsx",
  "utf8",
);
const currencyHelperSource = fs.readFileSync(
  "src/lib/dashboard/meta-account-currency.ts",
  "utf8",
);
const productMessagesSource = fs.readFileSync(
  "src/lib/i18n/messages.ts",
  "utf8",
);
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { resolveCampaignDeliveryMetricTruth } = await import(moduleUrl);
const compiledCurrencyHelper = ts.transpileModule(currencyHelperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const currencyModuleUrl = `data:text/javascript;base64,${Buffer.from(compiledCurrencyHelper).toString("base64")}`;
const {
  resolveSelectedMetaAccountCurrency,
  formatMetaCurrency,
} = await import(currencyModuleUrl);

const earlyDelivery = resolveCampaignDeliveryMetricTruth({
  campaignDeliveryMetrics: {
    spend: 37.25,
    impressions: 2400,
    clicks: 31,
    leads: 0,
  },
  workspaceMetrics: { totalSpend: 999, totalLeads: 18 },
});
assert.deepEqual(earlyDelivery, {
  source: "campaign_meta_snapshot",
  leads: 0,
  spend: 37.25,
  impressions: 2400,
  clicks: 31,
  cpl: 0,
});

const zeroSnapshot = resolveCampaignDeliveryMetricTruth({
  campaignDeliveryMetrics: { spend: 0, impressions: 0, clicks: 0, leads: 0 },
  workspaceMetrics: { totalSpend: 999, totalLeads: 18 },
});
assert.equal(zeroSnapshot.source, "campaign_meta_snapshot");
assert.equal(zeroSnapshot.spend, 0);
assert.equal(zeroSnapshot.leads, 0);

const noCampaignSnapshot = resolveCampaignDeliveryMetricTruth({
  campaignDeliveryMetrics: null,
  workspaceMetrics: { totalSpend: 25, totalLeads: 5 },
});
assert.equal(noCampaignSnapshot.source, "workspace_fallback");
assert.equal(noCampaignSnapshot.spend, 25);
assert.equal(noCampaignSnapshot.leads, 5);
assert.equal(noCampaignSnapshot.cpl, 5);

assert.match(componentSource, /resolveCampaignDeliveryMetricTruth/);
assert.doesNotMatch(componentSource, /const displayedLeads = hasLivePerformance/);
assert.doesNotMatch(componentSource, /const displayedSpend = hasLivePerformance/);

const connection = (currency) => ({
  accountId: "act_123456",
  availableAccounts: [
    {
      id: "internal-account",
      externalAccountId: "123456",
      currency,
    },
  ],
});
assert.equal(resolveSelectedMetaAccountCurrency(connection("CAD")), "CAD");
assert.equal(resolveSelectedMetaAccountCurrency(connection("USD")), "USD");
assert.equal(resolveSelectedMetaAccountCurrency(connection("EUR")), null);
assert.equal(formatMetaCurrency(100, "CAD"), "$100");
assert.equal(formatMetaCurrency(100, "USD"), "US$100");
assert.equal(formatMetaCurrency(100, null), "Currency unavailable");
assert.match(componentSource, /t\("dashboard\.currencyUnavailable"\)/);
assert.match(productMessagesSource, /"dashboard\.currencyUnavailable": "Meta account currency unavailable"/);
assert.match(componentSource, /latestAttemptDeliveryMetricsConfirmed === false/);
assert.doesNotMatch(componentSource, /currency:\s*["']CAD["']/);

console.log("campaign dashboard scoped Meta metric and currency truth: PASS (zero-lead delivery remains scoped; CAD and USD render distinctly; unknown currency fails visibly)");
