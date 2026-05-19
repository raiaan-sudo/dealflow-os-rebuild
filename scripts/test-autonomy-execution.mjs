#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const service = read("src/lib/services/autonomy-execution-service.ts");
const shared = read("src/app/api/autonomy/_shared.ts");
const route = read("src/app/api/autonomy/route.ts");
const runRoute = read("src/app/api/autonomy/run/route.ts");
const migration = read("supabase/migrations/20260519033000_create_autonomy_execution_tables.sql");
const packageJson = JSON.parse(read("package.json"));

for (const [script, command] of [
  ["autonomy:evaluate", "node ./scripts/run-autonomy-evaluator.mjs"],
  ["autonomy:report", "node ./scripts/print-autonomy-report.mjs"],
  ["test:autonomy-execution", "node ./scripts/test-autonomy-execution.mjs"],
]) {
  assert.equal(packageJson.scripts[script], command, `${script} must be registered`);
}

for (const table of [
  "autonomy_runs",
  "autonomy_actions",
  "autonomy_action_audit_logs",
  "autonomy_rollbacks",
  "autonomy_experiments",
  "campaign_performance_snapshots",
  "autonomy_learning_memory",
  "autonomy_alerts",
  "customer_autonomy_settings",
  "campaign_autonomy_settings",
  "autonomy_execution_locks",
  "autonomy_idempotency_records",
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `${table} must exist`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`);
  assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`), `${table} must force RLS`);
}

for (const marker of [
  "organization_id uuid not null",
  "campaign_id uuid",
  "autonomy_actions_idempotency_unique",
  "autonomy_execution_locks_key_unique",
  "autonomy_idempotency_records_key_unique",
  "autonomy_actions_member_select",
  "autonomy_actions_service_role_all",
  "private.is_current_user_org_member(organization_id)",
  "rollback_notes text not null",
  "Rollback payloads must be written before any external mutation",
]) {
  assert.match(migration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `migration must include ${marker}`);
}

for (const marker of [
  "AUTONOMY_EXECUTION_ENABLED",
  "AUTONOMY_AUTOPILOT_ENABLED",
  "AUTONOMY_META_MUTATIONS_ENABLED",
  "AUTONOMY_DRY_RUN_ONLY",
  "classifyAutonomyAction",
  "buildAutonomyIdempotencyKey",
  "buildAutonomyExecutionPlan",
  "executeAutonomyPlanWithSyntheticAdapter",
  "SyntheticAutonomyMutationAdapter",
  "Rollback payload was not written before mutation",
  "Budget increases require lead quality of at least 0.65",
  "Proposed daily budget would exceed the configured cap",
  "An active autonomy lock already exists",
  "This autonomy action was already applied",
]) {
  assert.match(service, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `service must include ${marker}`);
}

assert.match(service, /budgetDelta > 0[\s\S]*high_impact/, "budget increases must be high-impact");
assert.match(service, /budgetDelta < 0[\s\S]*autopilot_safe/, "budget reductions must be safe-action candidates");
assert.match(service, /mode === "auto" \|\| params\.mode === "autonomous"/, "auto mode must be supported");
assert.match(service, /writtenBeforeMutation: status === "eligible"/, "rollback payload must be marked before eligible mutation");
assert.match(service, /env\[AUTONOMY_DRY_RUN_ONLY_ENV\] !== "false"[\s\S]*return false/, "dry-run default must block execution");

assert.match(shared, /assertCampaignCanRunAutonomy\(plan\.id\)/, "autonomy evaluation must be Pro-entitlement gated");
assert.match(shared, /leadQualityScore/, "evaluation must include lead quality signal");
assert.match(shared, /buildAutonomyExecutionPlan/, "evaluation must build execution plan");
assert.match(route, /z\.enum\(\["manual", "assisted", "auto", "autonomous"\]\)/, "PATCH must accept UI-compatible auto mode");
assert.match(runRoute, /executeAutonomyPlanWithSyntheticAdapter/, "run route must use synthetic adapter proof");
assert.doesNotMatch(route + runRoute, /recommendation_only/, "autonomy routes must not be hard-coded recommendation-only");

for (const forbidden of [
  "STRIPE_SECRET_KEY=",
  "SUPABASE_SERVICE_ROLE_KEY=",
  "sk_live",
  "sk_test",
  "Bearer ",
]) {
  assert.doesNotMatch(service + shared + route + runRoute + migration, new RegExp(forbidden), `no secret literal ${forbidden}`);
}

console.log("Autonomy execution structural tests passed.");
