#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildLegacyCreativeCopyRefresh,
  CONFIRMATION,
} from "./refresh-legacy-creative-copy.mjs";

const scriptSource = fs.readFileSync("scripts/refresh-legacy-creative-copy.mjs", "utf8");

const selectedIds = ["static-buyer-affordability-reality-check", "static-ugc-proof"];
const fixture = {
  id: "campaign-fixture",
  public_slug: "fixture-funnel",
  publish_state: "published",
  launch_status: "built",
  plan: {
    intent: "buyer",
    selected_ad_ids: selectedIds,
    funnel: {
      headline: "View homes that actually match your criteria",
      cta: "Get List",
      subheadline: "See a shortlist of homes shaped around your budget, lifestyle, and preferred areas. Get List.",
    },
    legacyCreativeRefresh: {
      refreshed_from_legacy_copy: true,
      proof_run_id: "prior_ad_refresh",
      previous_values: [
        {
          path: "plan.ads[0].headline",
          old_value: "View homes that actually match your criteria",
          new_value: "Get Your Free Custom Home List",
        },
      ],
    },
    campaign_payload: {
      selected_ad_ids: selectedIds,
      funnel: {
        headlines: ["View homes that actually match your criteria"],
        cta: "Get List",
      },
    },
    ads: [
      {
        headline: "View homes that actually match your criteria",
        body: "See a shortlist of homes shaped around your budget, lifestyle, and preferred areas. Less noise, clearer matches, and a faster next step. Get List.",
        cta: "Get List",
      },
    ],
    staticAds: [
      {
        id: selectedIds[0],
        headline: "Existing selected static ad",
        cta: "Keep Existing",
      },
    ],
  },
  staged_snapshot: {
    funnel: {
      headline: "View homes that actually match your criteria",
      cta: "Get List",
    },
    plan: {
      ads: [
        {
          headline: "View homes that actually match your criteria",
          cta: "Get List",
          body: "See a shortlist of homes shaped around your budget, lifestyle, and preferred areas. Get List.",
        },
      ],
    },
  },
  published_snapshot: {
    funnel: {
      headline: "View homes that actually match your criteria",
      cta: "Get List",
    },
    plan: {
      ads: [
        {
          headline: "View homes that actually match your criteria",
          cta: "Get List",
          body: "See a shortlist of homes shaped around your budget, lifestyle, and preferred areas. Get List.",
        },
      ],
    },
  },
};

const result = buildLegacyCreativeCopyRefresh(fixture, {
  proofRunId: "unit_test_legacy_refresh",
  refreshedAt: "2026-06-17T00:00:00.000Z",
});

assert.equal(CONFIRMATION, "REFRESH_LEGACY_CREATIVE_COPY", "apply confirmation phrase must stay exact");
assert.equal(result.changed, true, "legacy strings are detected in campaign plan ads");
assert.equal(result.intent, "buyer", "buyer intent is inferred");
assert.equal(result.nextRow.plan.ads[0].headline, "Get Your Free Custom Home List", "buyer headline is canonical");
assert.equal(result.nextRow.plan.ads[0].cta, "Get My List", "buyer CTA is canonical");
assert.equal(
  result.nextRow.plan.ads[0].body,
  "Get a personalized list of homes matched to your budget, location, and timeline.",
  "buyer body is canonical",
);
assert.equal(result.nextRow.plan.staticAds[0].headline, "Existing selected static ad", "static creative assets inside plan are preserved");
assert.deepEqual(result.selectedCreativeIdsBefore, selectedIds, "selected creative IDs are read before refresh");
assert.deepEqual(result.selectedCreativeIdsAfter, selectedIds, "selected creative IDs remain unchanged");
assert.equal(result.selectedCreativeIdsUnchanged, true, "selected creative state is not broken");
assert.equal(result.stagedSnapshotWouldChange, true, "staged snapshot legacy ads are detected");
assert.equal(result.publishedSnapshotWouldChange, true, "published snapshot legacy ads are detected");
assert.equal(result.nextRow.plan.legacyCreativeRefresh.refreshed_from_legacy_copy, true, "plan audit metadata is added");
assert.equal(result.nextRow.plan.legacyCreativeRefresh.proof_run_id, "unit_test_legacy_refresh", "proof run id is stored");
assert.ok(
  result.nextRow.plan.legacyCreativeRefresh.previous_values.some((entry) => entry.old_value === "View homes that actually match your criteria"),
  "old values are preserved in audit metadata",
);
assert.doesNotMatch(JSON.stringify(result.nextRow.plan.ads), /View homes that actually match your criteria|Get List/, "legacy visible ad copy is removed from refreshed ads");
assert.equal(
  result.nextRow.plan.funnel.headline,
  "View homes that actually match your criteria",
  "funnel fields are not refreshed unless explicitly requested",
);

const funnelOnlyFixture = structuredClone(fixture);
funnelOnlyFixture.plan.ads = [
  {
    headline: "Get Your Free Custom Home List",
    body: "Get a personalized list of homes matched to your budget, location, and timeline.",
    cta: "Get My List",
  },
];
funnelOnlyFixture.staged_snapshot.plan.ads = [
  {
    headline: "Get Your Free Custom Home List",
    body: "Get a personalized list of homes matched to your budget, location, and timeline.",
    cta: "Get My List",
  },
];
funnelOnlyFixture.published_snapshot.plan.ads = [
  {
    headline: "Get Your Free Custom Home List",
    body: "Get a personalized list of homes matched to your budget, location, and timeline.",
    cta: "Get My List",
  },
];

const funnelResult = buildLegacyCreativeCopyRefresh(funnelOnlyFixture, {
  proofRunId: "unit_test_funnel_refresh",
  refreshedAt: "2026-06-17T00:00:00.000Z",
  includeFunnelFields: true,
});

assert.equal(funnelResult.changed, true, "funnel legacy fields are detected when includeFunnelFields is enabled");
assert.ok(
  funnelResult.funnelFieldChanges.some((entry) => entry.path === "plan.funnel.headline"),
  "top-level plan funnel headline is detected",
);
assert.ok(
  funnelResult.funnelFieldChanges.some((entry) => entry.path === "plan.campaign_payload.funnel.headlines[0]"),
  "campaign payload funnel headline arrays are detected",
);
assert.equal(funnelResult.nextRow.plan.funnel.headline, "Get Your Free Custom Home List", "funnel headline is canonical");
assert.equal(funnelResult.nextRow.plan.funnel.cta, "Get My List", "funnel CTA is canonical");
assert.equal(
  funnelResult.nextRow.plan.funnel.subheadline,
  "Get a personalized list of homes matched to your budget, location, and timeline.",
  "funnel support copy is canonical",
);
assert.equal(
  funnelResult.nextRow.plan.campaign_payload.funnel.headlines[0],
  "Get Your Free Custom Home List",
  "nested campaign payload funnel headline is canonical",
);
assert.equal(funnelResult.nextRow.staged_snapshot.funnel.cta, "Get My List", "staged snapshot funnel CTA is canonical");
assert.equal(funnelResult.nextRow.published_snapshot.funnel.headline, "Get Your Free Custom Home List", "published snapshot funnel headline is canonical");
assert.equal(
  funnelResult.nextRow.plan.legacyCreativeRefresh.previous_values[0].old_value,
  "View homes that actually match your criteria",
  "legacyCreativeRefresh previous_values audit history is preserved",
);
assert.equal(
  funnelResult.nextRow.plan.legacyCreativeRefresh.proof_run_id,
  "prior_ad_refresh",
  "legacyCreativeRefresh metadata is not overwritten by funnel refresh",
);
assert.equal(
  funnelResult.nextRow.plan.legacyFunnelFieldRefresh.refreshed_from_legacy_funnel_fields,
  true,
  "funnel field audit metadata is added separately",
);
assert.equal(
  funnelResult.nextRow.plan.legacyFunnelFieldRefresh.proof_run_id,
  "unit_test_funnel_refresh",
  "funnel field proof run id is stored",
);
assert.ok(
  funnelResult.nextRow.plan.legacyFunnelFieldRefresh.previous_values.some(
    (entry) => entry.path === "plan.funnel.headline" && entry.old_value === "View homes that actually match your criteria",
  ),
  "funnel field old values are preserved in audit metadata",
);
assert.deepEqual(funnelResult.selectedCreativeIdsBefore, selectedIds, "selected creative IDs are read before funnel refresh");
assert.deepEqual(funnelResult.selectedCreativeIdsAfter, selectedIds, "selected creative IDs remain unchanged after funnel refresh");
assert.equal(funnelResult.selectedCreativeIdsUnchanged, true, "funnel refresh does not alter selected creative IDs");
assert.equal(funnelResult.nextRow.plan.staticAds[0].headline, "Existing selected static ad", "static creative preview data is preserved by funnel refresh");

const sellerResult = buildLegacyCreativeCopyRefresh(
  {
    ...fixture,
    id: "seller-fixture",
    plan: {
      intent: "seller",
      offer: "home value review",
      ads: fixture.plan.ads,
    },
    staged_snapshot: null,
    published_snapshot: null,
  },
  {
    proofRunId: "unit_test_legacy_refresh",
    refreshedAt: "2026-06-17T00:00:00.000Z",
  },
);

assert.equal(sellerResult.nextRow.plan.ads[0].headline, "Find Out What Your Home Could Sell For", "seller headline is canonical");
assert.equal(sellerResult.nextRow.plan.ads[0].cta, "Get My Home Value", "seller CTA is canonical");

assert.match(scriptSource, /--dry-run/, "script exposes dry-run mode");
assert.match(scriptSource, /--include-funnel-fields/, "script exposes opt-in funnel field refresh mode");
assert.ok(scriptSource.includes("Apply requires --confirm=${CONFIRMATION}."), "apply requires confirmation");
assert.ok(scriptSource.includes('.from("campaign_plans")'), "script targets campaign_plans");
assert.doesNotMatch(scriptSource, /\.from\(["']creative_assets["']\)/, "script must not touch creative_assets");
assert.doesNotMatch(scriptSource, /\.from\(["']system_jobs["']\)/, "script must not queue or touch system jobs");
assert.doesNotMatch(scriptSource, /generateStaticCreativeAds|provider_usage_events|@higgsfield|api\.openai|graph\.facebook|meta-campaign/i, "script must not call providers or Meta");

const publicFunnelSource = fs.readFileSync("src/app/f/[slug]/page.tsx", "utf8");
assert.doesNotMatch(publicFunnelSource, /refreshLegacyCreative|legacyCreativeRefresh/, "public funnel route remains independent of refresh tooling");

console.log("legacy creative copy refresh checks passed.");
