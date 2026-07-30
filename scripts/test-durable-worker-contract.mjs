#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const worker = fs.readFileSync("scripts/run-durable-system-worker.ts", "utf8");
const authority = fs.readFileSync("src/lib/services/durable-worker-authority.ts", "utf8");
const docker = fs.readFileSync("Dockerfile.worker", "utf8");
const compose = fs.readFileSync("compose.worker.yml", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

assert.deepEqual(vercel.crons, [
  { path: "/api/internal/ghl-form-sweep", schedule: "*/1 * * * *" },
]);
for (const marker of [
  "verifyImmutableWorkerGeneration",
  "verifyEncryptedOauthVolume",
  "assertDurableWorkerCanClaim",
  "installVerifiedDurableWorkerRuntime",
  "processScheduledAccountDeletionWork",
  "processGhlProviderWorkerFromEnvironment",
  "processMetaCampaignActivationFromEnvironment",
  "runSystemJobWorkerBatch",
  "higgsfieldDeferredJobReason",
  'process.on("SIGTERM"',
  "/health/ready",
  "system_jobs_safe_deadline_exhausted",
]) assert.ok(worker.includes(marker), `worker marker missing: ${marker}`);
assert.doesNotMatch(worker, /processGhlPeriodicFormSweep/);
assert.doesNotMatch(worker, /if \(!health\.ready.*throw/s);
assert.doesNotMatch(worker, /shutdown_deadline_exhausted/);
assert.match(compose, /stop_grace_period: 600s/);
for (const marker of [
  "DEALFLOW_WORKER_EXECUTION_STATE",
  "DEALFLOW_PROVIDER_EXECUTION_STATE",
  "DEALFLOW_WORKER_GENERATION_FILE",
  "DEALFLOW_HIGGSFIELD_VOLUME_ATTESTATION_SHA256",
  "encryptedAtRest",
]) assert.ok(authority.includes(marker), `authority marker missing: ${marker}`);
for (const marker of [
  "v24.14.1",
  "@higgsfield/cli",
  "HIGGSFIELD_CLI_SHA256",
  "DEALFLOW_SOURCE_COMMIT",
  "DEALFLOW_SOURCE_TREE",
  "git rev-parse 'HEAD^{tree}'",
  "@sha256:",
  "HEALTHCHECK",
  "STOPSIGNAL SIGTERM",
  "USER 10001:10001",
]) assert.ok(docker.includes(marker), `container marker missing: ${marker}`);
assert.match(compose, /restart: unless-stopped/);
assert.match(compose, /read_only: true/);
assert.match(compose, /external: true/);
console.log("durable worker contract: PASS");
