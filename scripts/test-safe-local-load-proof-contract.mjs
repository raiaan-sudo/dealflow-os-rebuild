#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = readFileSync("scripts/load-test.mjs", "utf8");
const harness = readFileSync("scripts/run-safe-local-load-proof.mjs", "utf8");

assert.match(load, /LOAD_ZERO_EXTERNAL_EFFECTS_ATTESTATION/);
assert.match(load, /\/api\/internal\/zero-external-effects/);
assert.match(load, /LOAD_TEST_INTERNAL_SECRET must be configured with at least 32 characters/);
assert.match(load, /Refusing non-loopback load target/);
assert.match(load, /payload\.failedControls\.length !== 0/);

assert.match(harness, /Safe local load proof requires Node 20/);
assert.match(harness, /requires the current production build output/);
assert.match(harness, /DEALFLOW_DEPLOYMENT_TARGET: "test"/);
assert.match(harness, /QA_ISOLATED_SUPABASE_PROJECT_REF: "local"/);
assert.match(harness, /ALLOW_META_LIVE_LAUNCH: "false"/);
assert.match(harness, /GHL_PRODUCTION_WRITES_ENABLED: "false"/);
assert.match(harness, /GHL_SANDBOX_INBOUND_FORM_RECONCILIATION_ENABLED: "false"/);
assert.match(harness, /GHL_SANDBOX_INBOUND_FORM_SWEEP_ENABLED: "false"/);
assert.match(harness, /GHL_PRODUCTION_INBOUND_FORM_RECONCILIATION_ENABLED: "false"/);
assert.match(harness, /GHL_PRODUCTION_INBOUND_FORM_SWEEP_ENABLED: "false"/);
assert.match(harness, /SUPPORT_PRODUCTION_EXTERNAL_DELIVERY_ENABLED: "false"/);
assert.match(harness, /SUPPORT_NOTIFICATION_DELIVERY_MODE: "internal_operator_inbox"/);
assert.match(harness, /TWILIO_EXECUTION_MODE: "disabled"/);
assert.match(harness, /STRIPE_FORCE_TEST_MODE: "false"/);
assert.match(harness, /STRIPE_TEST_HARNESS_ENABLED: "false"/);
assert.match(harness, /LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED: "false"/);
assert.match(harness, /LOAD_REQUESTS: "100"/);
assert.doesNotMatch(harness, /console\.log\([^)]*internalSecret/);
assert.doesNotMatch(harness, /shell:\s*true/);

console.log("safe local load proof contract: PASS");
