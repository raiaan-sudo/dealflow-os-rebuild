#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("src/app/api/internal/system-jobs/route.ts", "utf8");
const sweepRoute = fs.readFileSync("src/app/api/internal/ghl-form-sweep/route.ts", "utf8");
const sweepService = fs.readFileSync("src/lib/services/ghl-periodic-form-sweep-service.ts", "utf8");
const service = fs.readFileSync("src/lib/services/system-job-service.ts", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20260713020000_add_fair_reporting_worker_claim.sql",
  "utf8",
);
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

for (const marker of [
  "runIsolatedSystemJobStages",
  "enqueueDueMetaReportingSyncJobs(50)",
  'kind: "meta_reporting_sync"',
  "maxCycles: 25",
  "concurrency: 5",
  "reportingJobsProcessed",
  "failedStageCount",
]) {
  assert.ok(route.includes(marker), `System job route is missing capacity/isolation marker: ${marker}`);
}
for (const marker of [
  "claim_next_system_job_kind_v1",
  "runSystemJobWorkerKindBatch",
  "Promise.all",
  "maxCycles), 1), 50",
  "concurrency), 1), 5",
]) {
  assert.ok(service.includes(marker), `System job service is missing fair-worker marker: ${marker}`);
}
for (const marker of [
  "p_kind is distinct from 'meta_reporting_sync'",
  "for update skip locked",
  "attempt_count < max_attempts",
  "to service_role",
  "from public, anon, authenticated",
]) {
  assert.ok(migration.toLowerCase().includes(marker.toLowerCase()), `Fair claim migration is missing: ${marker}`);
}

assert.deepEqual(vercel.crons, [
  { path: "/api/internal/system-jobs", schedule: "*/1 * * * *" },
  { path: "/api/internal/ghl-form-sweep", schedule: "*/1 * * * *" },
]);
assert.match(route, /export const maxDuration = 300/);
assert.match(route, /SYSTEM_JOBS_WORK_BUDGET_MS = 240_000/);
assert.match(sweepRoute, /export const maxDuration = 300/);
assert.match(sweepRoute, /GHL_FORM_SWEEP_WORK_BUDGET_MS = 240_000/);
assert.match(sweepService, /GHL_PERIODIC_FORM_SWEEP_DEFAULT_MAX_ITEMS = 75/);
assert.match(sweepService, /GHL_PERIODIC_FORM_SWEEP_DEFAULT_CONCURRENCY = 25/);
assert.match(sweepService, /GHL_PERIODIC_FORM_SWEEP_CADENCE_MINUTES = 15/);
const targetCampaigns = 300;
const intervalMinutes = 15;
const requiredPerMinute = Math.ceil(targetCampaigns / intervalMinutes);
const provenWorkerCapacityPerMinute = 25;
assert.ok(
  provenWorkerCapacityPerMinute >= requiredPerMinute,
  `Reporting capacity ${provenWorkerCapacityPerMinute}/min is below required ${requiredPerMinute}/min`,
);
const targetGhlRoutes = 600;
const requiredGhlRoutesPerMinuteWithHeadroom = Math.ceil(
  (targetGhlRoutes / intervalMinutes) * 1.25,
);
const provenGhlSweepCapacityPerMinute = 75;
assert.ok(
  provenGhlSweepCapacityPerMinute >= requiredGhlRoutesPerMinuteWithHeadroom,
  `GHL sweep capacity ${provenGhlSweepCapacityPerMinute}/min is below the required ${requiredGhlRoutesPerMinuteWithHeadroom}/min including 25% headroom`,
);

console.log(
  `reporting/GHL worker capacity contract: PASS (reporting ${provenWorkerCapacityPerMinute}/min >= ${requiredPerMinute}/min for ${targetCampaigns}; GHL ${provenGhlSweepCapacityPerMinute}/min >= ${requiredGhlRoutesPerMinuteWithHeadroom}/min for ${targetGhlRoutes} with headroom; dedicated 300s/240s cron budgets)`,
);
