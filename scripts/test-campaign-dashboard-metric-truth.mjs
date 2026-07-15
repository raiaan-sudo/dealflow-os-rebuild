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
const stableUtcDateFormatSource = fs.readFileSync(
  "src/lib/dashboard/stable-utc-date-format.ts",
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
const compiledStableUtcDateFormat = ts.transpileModule(stableUtcDateFormatSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const stableUtcDateFormatModuleUrl =
  `data:text/javascript;base64,${Buffer.from(compiledStableUtcDateFormat).toString("base64")}`;
const { formatStableDashboardUtcTimestamp } = await import(
  stableUtcDateFormatModuleUrl
);
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
assert.deepEqual(
  ["en", "fr", "es"].flatMap((locale) => [
    formatStableDashboardUtcTimestamp({
      value: "2026-07-12T08:00:00.000Z",
      locale,
      includeTime: true,
    }),
    formatStableDashboardUtcTimestamp({
      value: "2026-07-12T08:00:00.000Z",
      locale,
      includeTime: false,
    }),
  ]),
  [
    "2026-07-12, 08:00 UTC",
    "2026-07-12",
    "2026-07-12 08:00 UTC",
    "2026-07-12",
    "12/07/2026, 08:00 UTC",
    "12/07/2026",
  ],
);
assert.equal(
  formatStableDashboardUtcTimestamp({
    value: "not-a-timestamp",
    locale: "en",
    includeTime: true,
  }),
  "—",
);
assert.doesNotMatch(compiledStableUtcDateFormat, /\bIntl\.|\.toLocale/);
assert.doesNotMatch(componentSource, /toLocaleString|toLocaleDateString/);

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

console.log("campaign dashboard metric, currency, and hydration-stable UTC date truth: PASS");
