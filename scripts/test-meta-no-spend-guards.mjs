import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const metaExecution = readFileSync("src/lib/integrations/meta/execution.ts", "utf8");
const launchService = readFileSync("src/lib/services/meta-launch-service.ts", "utf8");

assert.match(metaExecution, /status: "PAUSED"/, "Meta execution payloads must default to PAUSED");
assert.match(metaExecution, /special_ad_categories: \["HOUSING"\]/, "real estate launches must keep housing category");
assert.match(metaExecution, /ALLOW_META_LIVE_LAUNCH/, "live launch must remain environment-gated");
assert.match(launchService, /status: "PAUSED"/, "Meta launch service must keep objects paused by default");
assert.match(launchService, /META_DAILY_BUDGET_CAP_CENTS|budget/i, "Meta launch service must keep budget safety checks");

console.log("Meta no-spend guards passed.");
