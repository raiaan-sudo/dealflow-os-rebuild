import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const canonicalFunnel = readFileSync("scripts/test-canonical-public-funnel.mjs", "utf8");
const executionService = readFileSync("src/lib/services/campaign-execution-service.ts", "utf8");
const leadTracking = readFileSync("src/lib/services/lead-tracking-service.ts", "utf8");

assert.match(canonicalFunnel, /CanonicalPublicFunnelPage/, "public funnels must remain canonical");
assert.ok(
  canonicalFunnel.includes("visibleSections") && canonicalFunnel.includes("record\\.funnel\\.sections"),
  "legacy public section rendering guard must stay present",
);
assert.match(executionService, /website_funnel/, "website funnel destination mode must be explicit");
assert.match(executionService, /meta_instant_form/, "Meta instant-form destination mode must be explicit/fail-closed");
assert.match(leadTracking, /expected_lead_destination/, "lead destination must be persisted in tracking contracts");
assert.match(leadTracking, /crm_sync_status/, "CRM status must be visible in lead tracking events");

console.log("Product correctness contract passed.");
