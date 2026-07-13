import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const route = read("src/app/api/internal/ghl-form-sweep/route.ts");
const worker = read("src/lib/services/ghl-provider-worker-service.ts");
const service = read("src/lib/services/ghl-periodic-form-sweep-service.ts");
const vercel = JSON.parse(read("vercel.json"));

assert.match(route, /export const maxDuration = 300/);
assert.match(route, /GHL_FORM_SWEEP_WORK_BUDGET_MS = 240_000/);
assert.match(route, /assertInternalSystemRequest\(request\)/);
assert.match(route, /deadlineAtMs = startedAtMs \+ GHL_FORM_SWEEP_WORK_BUDGET_MS/);
assert.match(route, /processGhlPeriodicFormSweepFromEnvironment\(\{[\s\S]*deadlineAtMs,[\s\S]*workerId:/);
assert.match(route, /lagAlertCodes: "lagAlertCodes" in result/);
assert.match(route, /backfillActiveCount: healthSummary\?\.backfillActiveCount \?\? 0/);
assert.match(route, /cursorOperatorRequiredCount: healthSummary\?\.cursorOperatorRequiredCount \?\? 0/);
assert.match(route, /export async function GET\(request: Request\)/);
assert.match(route, /export async function POST\(request: Request\)/);

const authorizationIndex = route.indexOf("assertInternalSystemRequest(request)");
const providerIndex = route.indexOf("processGhlPeriodicFormSweepFromEnvironment({");
assert.ok(authorizationIndex >= 0 && authorizationIndex < providerIndex,
  "internal authorization must run before any sweep/provider entrypoint");

assert.match(worker, /processGhlPeriodicFormSweepFromEnvironment/);
assert.match(worker, /ghlProductionGateFromEnvironment\("form_submissions_read", environment\)/);
assert.match(worker, /ghlProductionGateFromEnvironment\("lifecycle_webhook", environment\)/);
assert.match(worker, /credentialRef: authority\.credentialRef/);
assert.match(worker, /createProductionEnvironmentGhlCredentialResolver\(environment\)/);
assert.match(worker, /createEnvironmentGhlCredentialResolver\(environment\)/);
assert.match(worker, /createGhlInboundReadHttpClient\(gate\.baseUrl\)/);
assert.doesNotMatch(
  worker.slice(worker.indexOf("processGhlPeriodicFormSweepFromEnvironment")),
  /createGhlProductionAdapter\(\{[\s\S]*?credentialRef:\s*(?:process\.env|installation\.)/,
  "the periodic sweep must not fall back to an agency/install credential",
);

assert.match(service, /Date\.now\(\) \+ minimumClaimBudgetMs > deadlineAtMs/);
assert.match(service, /const leaseMs = Math\.min\(Math\.max\(input\.leaseMs \?\? 90_000, 10_000\), 120_000\)/);
assert.match(service, /readPeriodicFormSubmissionWindow/);
assert.doesNotMatch(service, /\.(?:create|update|delete|submit|send|publish)[A-Z][A-Za-z]*\(/,
  "the periodic sweep service must remain GET-only at its provider boundary");

const sweepCron = vercel.crons.find((entry) => entry.path === "/api/internal/ghl-form-sweep");
assert.deepEqual(sweepCron, {
  path: "/api/internal/ghl-form-sweep",
  schedule: "*/1 * * * *",
});

console.log("GHL periodic form sweep dedicated-route contract passed.");
