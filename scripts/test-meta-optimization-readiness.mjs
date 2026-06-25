#!/usr/bin/env node

import fs from "node:fs";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertMatch(source, pattern, message) {
  assert(pattern.test(source), message);
}

function assertNotMatch(source, pattern, message) {
  assert(!pattern.test(source), message);
}

const statusSync = read("src/lib/integrations/meta/status-sync.ts");
const metaSyncService = read("src/lib/services/meta-campaign-sync-service.ts");
const dashboard = read("src/components/dashboard/campaign-dashboard-view.tsx");
const operatorDebt = read("scripts/check-operator-debt.mjs");
const opsSummary = read("scripts/print-ops-monitoring-summary.mjs");
const diagnostic = read("scripts/diagnose-martine-optimization-state.mjs");
const packageJson = read("package.json");

assertMatch(statusSync, /fetchAdStatusReadResults/, "Meta status sync must expose partial ad readback results");
assertMatch(statusSync, /fetchAdSetStatusReadResults/, "Meta status sync must expose partial ad set readback results");
assertMatch(statusSync, /MetaObjectReadError/, "Meta status sync must preserve structured object read errors");
assertMatch(statusSync, /Promise\.all\(\s*params\.adIds\.map[\s\S]*fetchMetaObjectStatusResult/, "Ad readback results must read each ad independently");

assertMatch(metaSyncService, /fetchAdStatusReadResults/, "Meta campaign sync must use partial ad readback");
assertMatch(metaSyncService, /fetchAdSetStatusReadResults/, "Meta campaign sync must use partial ad set readback");
assertMatch(metaSyncService, /serializeSyncErrors/, "Meta campaign sync must store structured sync errors");
assertMatch(metaSyncService, /delivery_metrics_status/, "Meta campaign sync must record delivery metrics status");
assertMatch(metaSyncService, /unreadable_meta_objects/, "Meta campaign sync must record unreadable object details");
assertMatch(metaSyncService, /if \(deliveryMetricsRead\)/, "Performance tracking must only be written after readable delivery metrics");
assertMatch(metaSyncService, /zero_delivery/, "Meta campaign sync must distinguish valid zero delivery from unavailable insights");
assertNotMatch(metaSyncService, /fetchAdStatuses\(/, "Meta campaign sync must not use all-or-nothing ad status batch reads");

assertMatch(dashboard, /OptimizationReadinessState/, "Dashboard must model optimization readiness explicitly");
assertMatch(dashboard, /Ready to optimize/, "Dashboard must render ready-to-optimize state");
assertMatch(dashboard, /Waiting for delivery data/, "Dashboard must render waiting-for-delivery-data state");
assertMatch(dashboard, /Sync degraded/, "Dashboard must render sync-degraded state");
assertMatch(dashboard, /Needs Meta reconnect\/review/, "Dashboard must render reconnect-review state");
assertMatch(dashboard, /getSyncErrors\(syncSnapshot\)\.slice/, "Dashboard must show sync error details when present");

assertMatch(operatorDebt, /getLaunchedCampaignMetaDebt/, "Operator debt must scan launched campaigns for Meta optimization debt");
assertMatch(operatorDebt, /stale_or_missing_meta_sync/, "Operator debt must catch stale or missing Meta sync snapshots");
assertMatch(operatorDebt, /meta_sync_degraded/, "Operator debt must catch degraded Meta readback");
assertMatch(operatorDebt, /active_meta_without_performance_tracking/, "Operator debt must catch active Meta campaigns with no performance tracking rows");
assertMatch(operatorDebt, /external_meta_access_or_tracking_blocked/, "Operator debt must classify externally blocked Meta access separately");
assertMatch(operatorDebt, /non_production_meta_launch_excluded/, "Operator debt must exclude non-production Meta launch artifacts");
assertMatch(opsSummary, /countLaunchedMetaOptimizationDebt/, "Ops summary must scan launched campaigns for Meta optimization debt");
assertMatch(opsSummary, /launched campaign Meta optimization readiness issue/, "Ops summary must block OPS_READY on launched campaign optimization debt");
assertMatch(opsSummary, /externalOwnerBlocked/, "Ops summary must report externally blocked Meta access without counting it as app-owned debt");
assertMatch(opsSummary, /nonProductionLaunches/, "Ops summary must report excluded non-production launch artifacts");

assertMatch(diagnostic, /MARTINE_OPTIMIZATION_DIAGNOSTIC_20260624/, "Martine diagnostic must write a launch report artifact");
assertMatch(diagnostic, /No Meta mutation and no database mutation/, "Martine diagnostic report must state read-only behavior");
assertMatch(diagnostic, /graphGet/, "Martine diagnostic must perform read-only Graph readback");
assertMatch(diagnostic, /performance_tracking/, "Martine diagnostic must inspect performance tracking rows");
assertMatch(packageJson, /diagnose:martine-optimization/, "Package scripts must expose Martine optimization diagnostic");

console.log("PASS meta optimization readiness regression checks");
