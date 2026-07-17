#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const tests = [
  "test-meta-contract-hardening.mjs",
  "test-accessibility-truth-contract.mjs",
  "test-reliability-wave.mjs",
  "test-creative-storage-and-lead-retry-scope.mjs",
  "test-onboarding-activation-billing-contract.mjs",
  "test-commercial-contracts.mjs",
  "test-ghl-tenant-provisioning.mjs",
  "test-ghl-production-contract.mjs",
  "test-ghl-destination-fail-closed.mjs",
  "test-launch-truth-and-schedule.mjs",
  "test-optimization-evidence-safety.mjs",
  "test-continuous-reporting-optimizer.mjs",
  "test-continuous-reporting-optimizer-disposable-db.mjs",
  "test-support-ticket-contract.mjs",
  "test-support-external-delivery.mjs",
  "test-untrusted-evidence-boundary.mjs",
  "test-funnel-customer-copy.mjs",
  "test-single-plan-ui-contract.mjs",
  "test-custom-lead-question-contract.mjs",
  "test-security-config-truth.mjs",
  "test-ghl-iframe-embed-security.mjs",
  "test-ghl-signed-user-context.mjs",
  "test-ghl-lifecycle-contract.mjs",
  "test-ghl-periodic-form-sweep-disposable-db.mjs",
  "test-verified-partner-attribution-disposable-db.mjs",
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
  "test-deployment-target-authority.mjs",
  "test-higgsfield-provider.mjs",
  "test-generated-video-storage-disposable-db.mjs",
  "test-account-deletion-offboarding-contract.mjs",
  "test-account-deletion-offboarding-disposable-db.mjs",
  "test-meta-instant-form-provisioning.mjs",
  "test-meta-instant-form-disposable-db.mjs",
  "test-meta-campaign-activation-contract.mjs",
  "test-meta-campaign-activation-disposable-db.mjs",
  "test-meta-budget-safety.mjs",
  "test-isolated-staging-seed-contract.mjs",
  "test-synthetic-qa-authority-reset.mjs",
  "staging/test-provider-session-bundle-contract.mjs",
  "staging/test-browser-session-bundle-contract.mjs",
  "staging/test-browser-context-network-boundary.mjs",
  "staging/test-safe-browser-host-contract.mjs",
  "staging/test-staging-evidence-root-contract.mjs",
  "staging/test-interruptible-command.mjs",
  "staging/test-unsealed-playwright-artifact-cleanup.mjs",
  "staging/test-playwright-failure-diagnostic-contract.mjs",
  "staging/test-deployable-source-path-set-contract.mjs",
  "staging/test-vercel-dry-run-source-contract.mjs",
  "staging/test-vercel-environment-sync-contract.mjs",
  "staging/test-vercel-alias-propagation-contract.mjs",
  "staging/test-vercel-cli-selection-contract.mjs",
  "staging/test-exact-supabase-project-url.mjs",
  "staging/test-next-static-chunk-path.mjs",
  "staging/test-vercel-deployed-image-config-contract.mjs",
  "staging/test-approved-direct-public-image-checkpoint-contract.mjs",
  "staging/test-staging-image-optimizer-response-contract.mjs",
  "staging/test-isolated-staging-access-gate.mjs",
  "staging/test-hosted-build-identity-generator.mjs",
  "staging/test-release-identity-route-contract.mjs",
  "staging/test-isolated-staging-acceptance-contract.mjs",
  "test-system-job-stage-isolation.mjs",
  "test-reporting-worker-capacity.mjs",
  "test-campaign-dashboard-metric-truth.mjs",
  "test-dashboard-campaign-lineage-disposable-db.mjs",
  "test-atomic-public-lead-capture-disposable-db.mjs",
  "test-campaign-entitlement-disposable-db.mjs",
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
