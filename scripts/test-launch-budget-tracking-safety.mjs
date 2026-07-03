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

function assertExcludes(source, needle, label) {
  assert.ok(
    !source.includes(needle),
    `${label}: expected not to find ${JSON.stringify(needle)}`,
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
const publicFunnelPage = read("src/app/f/[slug]/page.tsx");
const metaService = read("src/lib/integrations/meta/service.ts");
const metaPayloadGuardrails = read("src/lib/integrations/meta/launch-payload-guardrails.ts");
const metaExecution = read("src/lib/integrations/meta/execution.ts");
const campaignExecutionService = read("src/lib/services/campaign-execution-service.ts");
const metaLaunchService = read("src/lib/services/meta-launch-service.ts");
const packageJson = read("package.json");
const trackingReadinessSync = read("scripts/sync-meta-tracking-readiness.mjs");

const monthlyBudgetDollars = 3000;
const impliedDailyBudgetCents = Math.round(Math.round(monthlyBudgetDollars / 30) * 100);
const uncappedDailyBudgetCents = impliedDailyBudgetCents;

assert.equal(impliedDailyBudgetCents, 10000, "$3000 monthly budget should imply $100/day before cap");
assert.equal(uncappedDailyBudgetCents, 10000, "$3000 monthly budget should stay $100/day when no cap is configured");

assertIncludes(
  budgetCap,
  "isMetaDailyBudgetCapRequiredForProductionLaunch",
  "production budget-cap requirement helper",
);
assertIncludes(
  budgetCap,
  "return false",
  "production cap requirement is disabled by default",
);
assertIncludes(
  launchCreateRoute,
  "assertMetaDailyBudgetCapConfiguredForLiveLaunch();",
  "direct internal launch route still calls shared budget policy",
);
assertExcludes(
  launchCreateRoute,
  "meta_budget_cap_missing",
  "direct launch route does not block uncapped production budgets",
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
  "const preflight = instantFormCampaign",
  "public funnel snapshot consistency is checked before Meta preflight and object creation",
);
assertOrder(
  launchCreateRoute,
  "await validateMetaLaunchSelections({",
  "https://graph.facebook.com/v18.0/act_${externalAccountId}/campaigns",
  "preflight runs before Meta campaign creation",
);
assertIncludes(
  launchCreateRoute,
  "const campaignOrganizationId = record.campaign.organization_id?.trim() || null;",
  "direct launch route derives the campaign owner organization",
);
assertIncludes(
  launchCreateRoute,
  "organizationId: campaignOrganizationId",
  "direct launch route loads Meta credentials for the campaign organization",
);
assertIncludes(
  launchCreateRoute,
  "organizationId: credentials.workspaceId",
  "direct launch route validates Meta preflight against the same campaign organization",
);
assertIncludes(
  metaPayloadGuardrails,
  "buildMetaMarketGeoLocations",
  "shared Meta location guardrail exists",
);
assertIncludes(
  metaPayloadGuardrails,
  ".normalize(\"NFD\")",
  "Meta market normalization strips French accents before country inference",
);
assertIncludes(
  metaPayloadGuardrails,
  "lanaudiere",
  "Meta special-ad category country inference recognizes Martine's Lanaudiere market as Canada",
);
assertIncludes(
  launchCreateRoute,
  "const specialAdCategoryCountries = getMetaSpecialAdCategoryCountries(location);",
  "direct launch route derives special-ad category countries once from the campaign market",
);
assertIncludes(
  launchCreateRoute,
  "special_ad_category_country: JSON.stringify(specialAdCategoryCountries)",
  "direct Meta campaign creation uses the inferred special-ad category country",
);
assertIncludes(
  launchCreateRoute,
  "ensureMetaCampaignHousingSettings",
  "direct launch route reasserts housing category settings before retrying ad set creation",
);
assertIncludes(
  metaPayloadGuardrails,
  "meta_market_too_broad",
  "Meta launch blocks country-only markets",
);
assertIncludes(
  metaPayloadGuardrails,
  "contextual_multi_ads",
  "Meta multi-advertiser ads are explicitly opted out",
);
assertExcludes(
  metaPayloadGuardrails,
  "degrees_of_freedom_spec",
  "Meta creative opt-out helper avoids deprecated degrees_of_freedom_spec",
);
assertExcludes(
  metaPayloadGuardrails,
  "standard_enhancements",
  "Meta creative opt-out helper avoids deprecated standard_enhancements",
);
assertExcludes(
  launchCreateRoute,
  "degrees_of_freedom_spec",
  "direct launch route avoids deprecated Meta creative degrees_of_freedom_spec",
);
assertIncludes(
  metaPayloadGuardrails,
  "enroll_status: \"OPT_OUT\"",
  "Meta creative opt-out payload uses OPT_OUT",
);
assertIncludes(
  metaExecution,
  "geo_locations: buildMetaMarketGeoLocations(adSet.location)",
  "shared Meta execution mapper targets the campaign market, not an entire country",
);
assertIncludes(
  campaignExecutionService,
  "geo_locations: buildMetaMarketGeoLocations(campaignRecord.strategy.location)",
  "direct campaign execution targets the campaign market, not an entire country",
);
assertIncludes(
  launchCreateRoute,
  "geo_locations: buildGeoTargeting(location)",
  "direct launch route targets the campaign market, not an entire country",
);
assertIncludes(
  metaExecution,
  "applyMetaCreativeOptOut",
  "shared Meta execution mapper opts out of multi-advertiser creative behavior",
);
assertIncludes(
  campaignExecutionService,
  "applyMetaCreativeOptOut",
  "campaign execution payloads opt out of multi-advertiser creative behavior",
);
assertIncludes(
  metaLaunchService,
  "applyMetaCreativeOptOut",
  "Meta launch service enforces creative opt-out as a last-mile guard",
);
assertIncludes(
  launchCreateRoute,
  "contextual_multi_ads",
  "direct launch route opts out of multi-advertiser ads",
);

assertExcludes(
  launchPage,
  "budgetCapMissingForLaunch",
  "launch UI removes the missing-cap blocker",
);
assertIncludes(
  launchPage,
  "No platform budget cap is applied. Launch will use the requested daily budget",
  "launch UI treats missing cap as uncapped",
);
assertExcludes(
  launchPage,
  "Capped",
  "launch UI must not show capped budget state",
);
assertExcludes(
  launchPage,
  "platform cap of",
  "launch UI must not show stale platform-cap copy",
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
  "Paused setup ready",
  "launch UI exposes paused setup readiness separately from live activation state",
);
assertIncludes(
  publicFunnelPage,
  "export const dynamic = \"force-dynamic\";",
  "public funnel route renders the latest published snapshot instead of a stale cached copy",
);
assert.ok(
  !publicFunnelPage.includes("unstable_cache"),
  "public funnel route should not use unstable_cache without publish-time invalidation",
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
  "const liveActivationBlocked = !workspaceTrackingValid || !businessVerified;",
  "partial workspace tracking or missing business verification blocks live activation",
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
