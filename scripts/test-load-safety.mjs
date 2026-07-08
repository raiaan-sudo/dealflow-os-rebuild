import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/load-test.mjs", "utf8");

for (const guard of [
  "ALLOW_PRODUCTION_WRITE_LOAD_TEST",
  "PRODUCTION_WRITE_LOAD_TEST_CONFIRMATION",
  "I_UNDERSTAND_THIS_WRITES_QA_LEADS_TO_PRODUCTION",
  "SMS_MOCK_MODE",
  "LOAD_TEST_EXTERNAL_SIDE_EFFECTS",
]) {
  assert.match(source, new RegExp(guard), `load safety guard ${guard} must exist`);
}

const blocked = spawnSync(process.execPath, ["scripts/load-test.mjs", "lead-capture"], {
  env: {
    ...process.env,
    LOAD_BASE_URL: "https://clicktoscale.io",
    LOAD_TEST_ALLOW_WRITES: "true",
    LOAD_TEST_CAMPAIGN_ID: "qa-campaign",
    LOAD_REQUESTS: "1",
  },
  encoding: "utf8",
});

assert.notEqual(blocked.status, 0, "production lead-write load test must fail without explicit production confirmation");
assert.match(blocked.stderr, /Refusing production lead-write load test/, "failure must explain production write guard");

const sideEffectBlocked = spawnSync(process.execPath, ["scripts/load-test.mjs", "lead-capture"], {
  env: {
    ...process.env,
    LOAD_BASE_URL: "https://staging.example.com",
    LOAD_TEST_ALLOW_WRITES: "true",
    LOAD_TEST_CAMPAIGN_ID: "qa-campaign",
    LOAD_REQUESTS: "1",
  },
  encoding: "utf8",
});

assert.notEqual(sideEffectBlocked.status, 0, "lead-write load test must fail without mocked/disabled external side effects");
assert.match(sideEffectBlocked.stderr, /Lead-write load tests require/, "failure must explain side-effect guard");

console.log("Load-test safety guards passed.");
