import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const monitor = readFileSync("src/lib/services/fulfillment-monitor-service.ts", "utf8");
const leadTracking = readFileSync("src/lib/services/lead-tracking-service.ts", "utf8");
const runbook = readFileSync("docs/runbooks/lead-capture-health.md", "utf8");

for (const token of [
  "workspace_ghl_mapping",
  "ghl_location_id",
  "ghl_pipeline_id",
  "ghl_stage_id",
  "sync_enabled",
  "lead_crm_sync_events",
]) {
  assert.match(monitor, new RegExp(token), `fulfillment monitor must expose CRM readiness field ${token}`);
}

assert.match(leadTracking, /crm_sync_status/, "lead tracking ledger must retain CRM sync status events");
assert.match(runbook, /crm_not_configured/i, "runbook must explain CRM not configured state");
assert.match(runbook, /not a lead-capture failure/i, "runbook must separate CRM skip from capture failure");

console.log("CRM readiness contract passed.");
