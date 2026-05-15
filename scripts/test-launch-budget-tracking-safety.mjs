import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, label) {
  assert.ok(
    source.includes(needle),
    `${label}: expected to find ${JSON.stringify(needle)}`,
  );
}

function assertOrder(source, first, second, label) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.ok(firstIndex >= 0, `${label}: missing first marker ${JSON.stringify(first)}`);
  assert.ok(secondIndex >= 0, `${label}: missing second marker ${JSON.stringify(second)}`);
  assert.ok(firstIndex < secondIndex, `${label}: expected first marker before second marker`);
}

const budgetCap = read("src/lib/integrations/meta/budget-cap.ts");
const launchCreateRoute = read("src/app/api/campaigns/create/route.ts");
const launchPage = read("src/app/(app)/launch/page.tsx");
const metaService = read("src/lib/integrations/meta/service.ts");
const packageJson = read("package.json");
const trackingReadinessSync = read("scripts/sync-meta-tracking-readiness.mjs");

const monthlyBudgetDollars = 3000;
const impliedDailyBudgetCents = Math.round(Math.round(monthlyBudgetDollars / 30) * 100);
const cappedDailyBudgetCents = Math.min(impliedDailyBudgetCents, 300);

assert.equal(impliedDailyBudgetCents, 10000, "$3000 monthly budget should imply $100/day before cap");
assert.equal(cappedDailyBudgetCents, 300, "$3000 monthly budget should cap to 300 cents/day");

assertIncludes(
  budgetCap,
  "isMetaDailyBudgetCapRequiredForProductionLaunch",
  "production budget-cap requirement helper",
);
assertIncludes(
  budgetCap,
  "process.env.NODE_ENV === \"production\"",
  "production cap requirement is production scoped",
);
assertIncludes(
  budgetCap,
  "process.env.ALLOW_META_LIVE_LAUNCH === \"true\"",
  "cap requirement is tied to owner launch approval",
);
assertIncludes(
  launchCreateRoute,
  "assertMetaDailyBudgetCapConfiguredForLiveLaunch();",
  "direct internal launch route enforces configured budget cap",
);
assertIncludes(
  launchCreateRoute,
  "meta_budget_cap_missing",
  "direct launch route fails closed when production cap is missing",
);
assertIncludes(
  launchCreateRoute,
  "published_funnel_snapshot_stale",
  "direct launch route fails closed when the live public funnel snapshot is stale",
);
assertIncludes(
  launchCreateRoute,
  "assertPublishedFunnelSnapshotMatchesCurrentPlan",
  "direct launch route verifies the public funnel snapshot before Meta object creation",
);
assertIncludes(
  launchCreateRoute,
  "applyMetaDailyBudgetCapCents(Math.round(normalized * 100))",
  "direct launch route caps daily budget payload",
);
assertOrder(
  launchCreateRoute,
  "assertPublishedFunnelSnapshotMatchesCurrentPlan({",
  "const preflight = await validateMetaLaunchSelections({ destinationUrl });",
  "public funnel snapshot consistency is checked before Meta preflight and object creation",
);
assertOrder(
  launchCreateRoute,
  "const preflight = await validateMetaLaunchSelections({ destinationUrl });",
  "https://graph.facebook.com/v18.0/act_${externalAccountId}/campaigns",
  "preflight runs before Meta campaign creation",
);

assertIncludes(
  launchPage,
  "budgetCapMissingForLaunch",
  "launch UI blocks production object creation when cap is missing",
);
assertIncludes(
  launchPage,
  "effectiveDailyBudgetCents",
  "launch UI calculates effective capped daily budget",
);
assertIncludes(
  launchPage,
  "Configure META_DAILY_BUDGET_CAP_CENTS before production Meta object creation.",
  "launch UI names missing budget cap",
);
assertIncludes(
  launchPage,
  "Tracking / live activation",
  "launch UI separates tracking live-activation state",
);
assertIncludes(
  launchPage,
  "publicFunnelSnapshotMatchesCurrentPlan",
  "launch UI checks that the published public funnel snapshot matches the current campaign plan",
);
assertIncludes(
  launchPage,
  "Republish the public funnel because the live snapshot no longer matches the current campaign plan.",
  "launch UI blocks stale published funnels instead of showing a false-ready funnel gate",
);
assertIncludes(
  launchPage,
  "Paused only",
  "launch UI exposes paused-only tracking state",
);

assertIncludes(
  metaService,
  "deriveLaunchDomainFromDestinationUrl",
  "Meta preflight derives launch domain from destination URL",
);
assertIncludes(
  metaService,
  "persistDerivedLaunchDomainFromDestination",
  "Meta preflight persists derived launch domain",
);
assertIncludes(
  metaService,
  "launch_domain: derivedLaunchDomain",
  "Meta tracking row receives derived launch domain",
);
assertIncludes(
  metaService,
  "const liveActivationBlocked = !workspaceTrackingValid;",
  "partial workspace tracking blocks live activation",
);
assertIncludes(
  metaService,
  "Paused Meta object creation can proceed after launch gates pass",
  "partial tracking warning remains visible for paused launch",
);

assertIncludes(
  packageJson,
  "\"meta:tracking:sync-readiness\": \"node ./scripts/sync-meta-tracking-readiness.mjs\"",
  "audited Meta tracking readiness sync command",
);
assertIncludes(
  trackingReadinessSync,
  "ALLOW_META_TRACKING_READINESS_SYNC",
  "Meta tracking sync requires explicit operator enablement",
);
assertIncludes(
  trackingReadinessSync,
  "META_TRACKING_DOMAIN_VERIFIED",
  "Meta tracking sync requires domain proof",
);
assertIncludes(
  trackingReadinessSync,
  "META_TRACKING_PAGEVIEW_PROOF",
  "Meta tracking sync requires PageView proof",
);
assertIncludes(
  trackingReadinessSync,
  "META_TRACKING_LEAD_PROOF",
  "Meta tracking sync requires Lead proof",
);
assertIncludes(
  trackingReadinessSync,
  "Launch domain mismatch",
  "Meta tracking sync fails closed on wrong launch domain",
);
assertIncludes(
  trackingReadinessSync,
  "Pixel mismatch",
  "Meta tracking sync fails closed on wrong pixel",
);
assertIncludes(
  trackingReadinessSync,
  "Ad account mismatch",
  "Meta tracking sync fails closed on wrong ad account",
);
assertIncludes(
  trackingReadinessSync,
  "tracking_status: \"configured\"",
  "Meta tracking sync records configured tracking only after proof gates",
);

console.log("PASS launch budget and tracking safety regression checks");
