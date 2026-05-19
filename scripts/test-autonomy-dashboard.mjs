#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const dashboard = read("src/components/dashboard/campaign-dashboard-view.tsx");
const feed = read("src/components/dashboard/autonomy-actions-feed.tsx");
const modeControl = read("src/components/dashboard/autonomy-mode-control.tsx");
const controlRoom = read("src/app/(app)/admin/control-room/page.tsx");
const packageJson = JSON.parse(read("package.json"));

assert.equal(
  packageJson.scripts["test:autonomy-dashboard"],
  "node ./scripts/test-autonomy-dashboard.mjs",
  "autonomy dashboard structural test must be registered",
);

for (const marker of [
  "DealFlow Pro Autopilot",
  "Monitored signals",
  "Today changes and recommendations",
  "Spend cap and credit estimate",
  "Funnel before / after preview",
  "Lead quality signal",
  "Optimization and rollback history",
  "Approval controls",
  "It does not claim that an action executed unless the action history says so.",
]) {
  assert.match(dashboard, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `dashboard must include ${marker}`);
}

assert.match(dashboard, /requestedDailyBudget/, "dashboard must compute requested spend against the cap");
assert.match(dashboard, /estimatedCreditUse/, "dashboard must show a credit estimate");
assert.match(dashboard, /getAutonomyRiskLabel/, "dashboard must classify confidence and risk");
assert.match(dashboard, /autonomyNeedsApproval/, "dashboard must expose approval-required state");
assert.doesNotMatch(
  dashboard,
  /Autopilot can execute without approval|executed successfully from this dashboard/i,
  "dashboard must not invent execution claims",
);

for (const marker of [
  "Approve",
  "Reject",
  "Monitor",
  "Approval required",
  "Optimization history",
  "Rollback history",
  "no execution claim",
  "Spend cap check",
]) {
  assert.match(feed, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `feed must include ${marker}`);
}

assert.match(modeControl, /Off \/ manual recommendations/, "settings must expose manual recommendations mode");
assert.match(modeControl, /Assisted approval/, "settings must expose assisted approval mode");
assert.match(modeControl, /Autopilot safe actions/, "settings must expose autopilot safe actions mode");
assert.match(modeControl, /planTier === "starter"/, "starter plans must be blocked from execution modes");
assert.match(modeControl, /autonomyEntitled/, "pro autonomy controls must require entitlement");
assert.doesNotMatch(modeControl, /value: "autonomous"/, "mode control must use the backend-compatible auto value");

for (const marker of [
  "Autonomy queue",
  "Pending actions",
  "Approved actions",
  "Executed actions",
  "Failed actions",
  "Rollback-needed",
  "Meta failures",
  "No-data warnings",
  "Replay / idempotency",
  "Kill-switch visibility",
  "UI affordances are present for operator review",
]) {
  assert.match(controlRoom, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `control room must include ${marker}`);
}

assert.match(controlRoom, /assertInternalOperatorAccess/, "control room must remain admin/operator gated");
assert.doesNotMatch(
  controlRoom,
  /executeMetaCampaignLaunch|stripe\.checkout|sendSms|createFreshdeskTicket/,
  "control room proof UI must not call forbidden side-effect helpers",
);

console.log("Autonomy dashboard structural tests passed.");
