#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const tests = [
  "test-meta-contract-hardening.mjs",
  "test-accessibility-truth-contract.mjs",
  "test-reliability-wave.mjs",
  "test-creative-storage-and-lead-retry-scope.mjs",
  "test-onboarding-activation-billing-contract.mjs",
  "test-ghl-tenant-provisioning.mjs",
  "test-launch-truth-and-schedule.mjs",
  "test-optimization-evidence-safety.mjs",
  "test-continuous-reporting-optimizer.mjs",
  "test-continuous-reporting-optimizer-disposable-db.mjs",
  "test-support-ticket-contract.mjs",
  "test-untrusted-evidence-boundary.mjs",
  "test-funnel-customer-copy.mjs",
  "test-custom-lead-question-contract.mjs",
  "test-security-config-truth.mjs",
  "test-ghl-iframe-embed-security.mjs",
  "test-access-key-commercial-activation.mjs",
  "test-access-key-binding-contract.mjs",
  "test-internal-sms-notifications.mjs",
  "test-sms-receipt-hardening.mjs",
  "test-manual-launch-fencing.mjs",
  "test-manual-launch-reachability.mjs",
  "test-meta-tenant-fencing.mjs",
  "test-meta-leadgen-contract.mjs",
  "test-provider-readiness-truth.mjs",
  "test-provider-safety-boundaries.mjs",
  "test-client-ip-contract.mjs",
  "test-stripe-runtime-mode-contract.mjs",
];

const failures = [];

for (const test of tests) {
  process.stdout.write(`\n[completion] ${test}\n`);
  const result = spawnSync(process.execPath, [`scripts/${test}`], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    failures.push({ test, status: result.status, signal: result.signal });
  }
}

if (failures.length > 0) {
  console.error(`\nDealFlow completion suite failed (${failures.length}/${tests.length}).`);
  for (const failure of failures) {
    console.error(`- ${failure.test}: ${failure.signal ?? failure.status}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nDealFlow completion suite passed (${tests.length}/${tests.length}).`);
}
