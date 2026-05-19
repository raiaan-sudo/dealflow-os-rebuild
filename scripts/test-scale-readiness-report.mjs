#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const service = read("src/lib/services/scale-readiness-service.ts");
const page = read("src/app/(app)/admin/control-room/page.tsx");
const report = read("scripts/print-scale-readiness-report.mjs");
const packageJson = JSON.parse(read("package.json"));
const navigation = read("src/lib/navigation.ts");
const freshdesk = read("src/lib/support/freshdesk.ts");

const requiredSections = [
  "queue",
  "provider",
  "billing",
  "leadSms",
  "meta",
  "clientErrors",
  "support",
];

for (const section of requiredSections) {
  assert.match(service, new RegExp(`${section}: \\{`), `scale snapshot must include ${section}`);
}

assert.match(service, /classifySystemJobLane/, "job lane classifier must exist");
assert.match(service, /CRITICAL_JOB_KINDS/, "critical job kinds must be explicit");
assert.match(service, /HEAVY_JOB_KINDS/, "heavy job kinds must be explicit");
assert.match(service, /JOB_LANE_CONCURRENCY_CAPS/, "lane concurrency caps must be explicit");
assert.match(service, /issueClassification/, "scale snapshot must expose explicit WATCH classification");
assert.match(service, /activeBlockers/, "classification must include active blockers");
assert.match(service, /currentWatch/, "classification must include current watch items");
assert.match(service, /historicalReviewed/, "classification must include historical reviewed items");
assert.match(service, /cleared/, "classification must include cleared items");
assert.match(service, /lead_capture_retry/, "lead capture retry must be classified");
assert.match(service, /lead_side_effects/, "lead side effects must be classified");
assert.match(service, /subscription_suspension/, "billing/subscription recovery must be classified");
assert.match(service, /static_creative_generation/, "static generation must be heavy");
assert.match(service, /video_generation/, "video generation must be heavy");
assert.match(service, /provider_polling/, "provider polling must be heavy");
assert.match(service, /latestMetaSnapshotsByKey/, "Meta freshness must be based on latest snapshot per campaign");
assert.match(service, /historicalStaleMetaSnapshots/, "old Meta snapshots must be classified separately");
assert.match(service, /reviewedFailedOrDeadLetterJobs/, "reviewed failed jobs must be separated from active failures");
assert.match(service, /activeCriticalFailedJobs/, "current critical dead letters must remain blockers");
assert.match(service, /recentFailedLeadNotifications/, "recent lead notification failures must remain visible");
assert.match(service, /historicalLeadNotificationFailures/, "historical lead notification failures must be separated from active failures");
assert.match(service, /delivered_at,failed_at/, "lead notification report must select delivery timestamps for drift classification");
assert.match(service, /reviewed_at,resolution_note/, "system job report must select review evidence");

assert.match(report, /issueClassification/, "CLI report must output explicit WATCH classification");
assert.match(report, /latestMetaSnapshotsByKey/, "CLI report must classify Meta staleness by latest snapshot");
assert.match(report, /historicalReviewed/, "CLI report must include historical reviewed bucket");
assert.match(report, /olderThan7d/, "CLI report must include age buckets");
assert.match(report, /No failed or undelivered lead notifications occurred in the last 24 hours/, "CLI must distinguish current notification failures");
assert.match(report, /Rows have reviewed_at set/, "CLI must explain reviewed historical job treatment");

assert.match(page, /assertInternalOperatorAccess/, "control-room page must be internal-operator only");
assert.match(page, /notFound\(\)/, "non-admin access must resolve to notFound");
assert.match(page, /WATCH classification/, "control room must render classification section");
assert.match(navigation, /\/admin\/control-room/, "admin navigation must expose the control room to approved operators");
assert.equal(
  packageJson.scripts["operator:scale-report"],
  "node ./scripts/print-scale-readiness-report.mjs",
  "daily report script must be registered",
);
assert.equal(
  packageJson.scripts["test:scale-readiness-report"],
  "node ./scripts/test-scale-readiness-report.mjs",
  "scale report test script must be registered",
);

for (const forbiddenSelect of [
  "email",
  "phone",
  "first_name",
  "last_name",
  "phone_raw",
  "phone_e164",
  "error_message",
  "campaign_name",
  "stack",
  "component_stack",
  "payload",
  "metadata",
  "access_token",
]) {
  assert.doesNotMatch(
    service,
    new RegExp(`\\.select\\([^)]*${forbiddenSelect}`, "i"),
    `service aggregate select must not include raw ${forbiddenSelect}`,
  );
  assert.doesNotMatch(
    report,
    new RegExp(`\\.select\\([^)]*${forbiddenSelect}`, "i"),
    `CLI aggregate select must not include raw ${forbiddenSelect}`,
  );
}

for (const forbiddenSideEffect of [
  "createBillingCheckoutSession",
  "createStripeCheckoutSession",
  "stripe.checkout.sessions.create",
  "sendSms(",
  "postTwilioMessage",
  "createFreshdeskTicket(",
  "fetchAdInsights",
  "executeMetaCampaignLaunch",
  ".insert(",
  ".update(",
  ".delete(",
  ".upsert(",
]) {
  assert.doesNotMatch(service, new RegExp(forbiddenSideEffect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `service must not perform side effect ${forbiddenSideEffect}`);
  assert.doesNotMatch(report, new RegExp(forbiddenSideEffect.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `report must not perform side effect ${forbiddenSideEffect}`);
}

assert.match(freshdesk, /getFreshdeskOperationalStatus/, "Freshdesk operational status must be available to the control room");
assert.match(freshdesk, /missingEnvNames/, "Freshdesk status must expose missing env names only");
assert.doesNotMatch(freshdesk, /apiKey.*return/, "Freshdesk status must not return API key values");

function latestMetaSnapshotsByKeyFixture(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = [row.organization_id ?? "org", row.user_id ?? "user", row.meta_campaign_id ?? row.id].join(":");
    const current = byKey.get(key);
    if (!current || Date.parse(row.synced_at) > Date.parse(current.synced_at)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

const now = Date.parse("2026-05-19T03:00:00.000Z");
const metaRows = [
  { id: "old", organization_id: "org", user_id: "user", meta_campaign_id: "meta", synced_at: "2026-05-18T01:00:00.000Z", sync_result: "success" },
  { id: "fresh", organization_id: "org", user_id: "user", meta_campaign_id: "meta", synced_at: "2026-05-19T02:30:00.000Z", sync_result: "success" },
];
assert.deepEqual(latestMetaSnapshotsByKeyFixture(metaRows).map((row) => row.id), ["fresh"], "old historical stale Meta snapshots must not count as active when latest is fresh");
assert.equal(
  latestMetaSnapshotsByKeyFixture([{ ...metaRows[0] }]).filter((row) => now - Date.parse(row.synced_at) > 2 * 60 * 60 * 1000).length,
  1,
  "latest stale Meta snapshot remains a WATCH item",
);

const reviewedHistoricalDeadLetter = { id: "job-old", kind: "video_generation", status: "failed", dead_lettered_at: "2026-05-12T00:00:00.000Z", reviewed_at: "2026-05-12T01:00:00.000Z" };
const currentCriticalDeadLetter = { id: "job-critical", kind: "lead_side_effects", status: "failed", dead_lettered_at: "2026-05-19T02:00:00.000Z", reviewed_at: null };
assert.equal(Boolean(reviewedHistoricalDeadLetter.reviewed_at), true, "historical reviewed dead letters are classified by reviewed_at");
assert.equal(currentCriticalDeadLetter.reviewed_at, null, "current critical dead letters remain active blockers");
assert.equal(["lead_capture_retry", "lead_side_effects", "subscription_suspension"].includes(currentCriticalDeadLetter.kind), true, "critical lane fixture must stay critical");

const oldLeadFailure = { updated_at: "2026-05-16T23:47:06.365Z" };
const recentLeadFailure = { updated_at: "2026-05-19T02:47:06.365Z" };
assert.equal(now - Date.parse(oldLeadFailure.updated_at) > 24 * 60 * 60 * 1000, true, "older lead failures can be historical reviewed when recurrence is clear");
assert.equal(now - Date.parse(recentLeadFailure.updated_at) <= 24 * 60 * 60 * 1000, true, "recent unresolved lead failures remain WATCH");

console.log("Scale readiness report tests passed.");
