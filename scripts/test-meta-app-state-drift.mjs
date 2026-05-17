#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  appRuntimeReflectsActiveMeta,
  buildActiveRuntimePatch,
  getMetaProofFailures,
  latestSnapshotIsFreshActive,
} from "./meta-app-state-drift-utils.mjs";

const proof = {
  campaign: { id: "120248208607670616", status: "ACTIVE", effective_status: "ACTIVE" },
  adset: {
    id: "120248208608400616",
    campaign_id: "120248208607670616",
    daily_budget: "300",
    status: "ACTIVE",
    effective_status: "ACTIVE",
  },
  ad: {
    id: "120248208609740616",
    campaign_id: "120248208607670616",
    adset_id: "120248208608400616",
    creative_id: "1387185106767238",
    status: "ACTIVE",
    effective_status: "ACTIVE",
  },
  creative: {
    id: "1387185106767238",
    destinationLink: "https://app.agentdealflow.io/f/raiaan-realty",
  },
};

assert.deepEqual(getMetaProofFailures(proof), [], "exact active Meta proof should pass");
assert.deepEqual(
  getMetaProofFailures({ ...proof, adset: { ...proof.adset, daily_budget: "301" } }),
  ["adset_daily_budget_mismatch"],
  "budget drift must be surfaced",
);
assert.deepEqual(
  getMetaProofFailures({ ...proof, creative: { ...proof.creative, destinationLink: "https://example.com" } }),
  ["creative_destination_mismatch"],
  "destination drift must be surfaced",
);

const pausedRow = {
  launch_status: "paused",
  plan: {
    runtime: {
      status: "paused",
      safetyState: "paused",
      metaPushStatus: "paused",
      campaignId: "120248208607670616",
      adSetId: "120248208608400616",
      adId: "120248208609740616",
    },
    launch_runtime: {
      status: "paused",
      step_status: "paused",
    },
  },
};

assert.equal(appRuntimeReflectsActiveMeta(pausedRow), false, "paused app runtime is drift when Meta is active");

const now = "2026-05-17T04:00:00.000Z";
const patchedPlan = buildActiveRuntimePatch(pausedRow.plan, proof, now);
const activeRow = { launch_status: "live", plan: patchedPlan };

assert.equal(appRuntimeReflectsActiveMeta(activeRow), true, "active app runtime should satisfy drift guard");
assert.equal(patchedPlan.runtime.metaPushStatus, "published");
assert.equal(patchedPlan.runtime.pausedAdIds.length, 0);
assert.equal(patchedPlan.launch_runtime.step_status, "active");

const freshSnapshot = {
  meta_campaign_id: "120248208607670616",
  campaign_status: "ACTIVE",
  ad_set_statuses: [{ id: "120248208608400616", status: "ACTIVE" }],
  ad_statuses: [{ id: "120248208609740616", status: "ACTIVE" }],
  synced_at: "2026-05-17T03:30:00.000Z",
};

assert.equal(
  latestSnapshotIsFreshActive(freshSnapshot, proof, Date.parse(now)),
  true,
  "fresh active sync snapshot should pass",
);
assert.equal(
  latestSnapshotIsFreshActive({ ...freshSnapshot, campaign_status: "PAUSED" }, proof, Date.parse(now)),
  false,
  "stale paused sync snapshot should fail",
);
assert.equal(
  latestSnapshotIsFreshActive({ ...freshSnapshot, synced_at: "2026-05-17T01:00:00.000Z" }, proof, Date.parse(now)),
  false,
  "old sync snapshot should fail freshness guard",
);

console.log("Meta/app state drift tests passed.");
