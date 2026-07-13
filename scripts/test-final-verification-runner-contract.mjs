#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/run-dealflow-final-verification.mjs", "utf8");

for (const marker of [
  "const EXACT_INTEGRATED_MIGRATION_COUNT = 102",
  "20260713027000_add_ghl_location_display_name_finalization.sql",
  '["npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]]',
  '["npm", ["ls", "--all"]]',
  '["git", ["diff", "--check"]]',
  '["npm", ["audit", "--omit=dev", "--audit-level=low"]]',
  '["npm", ["run", "security:scan-release"]]',
  '["npm", ["run", "test:release-evidence-current"]]',
  '["npm", ["run", "test:zero-external-effects"]]',
  '["npm", ["run", "test:e2e:safe:reporter"]]',
  '["npm", ["run", "test:load:safe-local:contract"]]',
  '["npm", ["run", "load:safe-local"]]',
  '["npm", ["run", "schema:check"]]',
  '["npm", ["run", "test:white-label-host-binding"]]',
  '["npm", ["run", "test:white-label-universal"]]',
  '["npm", ["run", "test:product-localization"]]',
  '["npm", ["run", "test:public-funnel-language"]]',
  '["npm", ["run", "test:single-plan-ui"]]',
  '["npm", ["run", "test:ghl-inbound-reconciliation"]]',
  '["npm", ["run", "test:ghl-inbound-authority"]]',
  '["npm", ["run", "test:ghl-inbound-reconciliation-db"]]',
  '["npm", ["run", "test:ghl-launch-readiness"]]',
  '["npm", ["run", "test:ghl-write-ambiguity"]]',
  '["npm", ["run", "test:ghl-periodic-form-sweep"]]',
  '["npm", ["run", "test:ghl-periodic-form-sweep-db"]]',
  '["npm", ["run", "test:atomic-public-lead-capture-db"]]',
  '["npm", ["run", "test:campaign-entitlement-disposable-db"]]',
  '["npm", ["run", "test:paid-creative-dispatch"]]',
  '["npm", ["run", "test:generated-video-storage"]]',
  '["npm", ["run", "test:account-deletion-offboarding"]]',
  '["npm", ["run", "test:campaign-dashboard-metric-truth"]]',
  'command: "npm run rls:cross-tenant"',
  'command: "npm run rls:fixture-smoke"',
  'command: "npm run operator:debt"',
  'status: "authenticated_deferred"',
  'authenticatedBrowserStatus: "authenticated_deferred_to_isolated_hosted_staging"',
  'localGateStatus =',
  '"NO_GO_AUTHENTICATED_PROOF_DEFERRED"',
  'stagingAdvancementAuthorized: localGateStatus === "GO"',
  'blockedCount: environmentOnlyDeferrals.length',
  'process.exitCode = 2',
  'SAFE_E2E_QA_AUTH: "false"',
  'SUPABASE_SCHEMA_CHECK_MODE: "local"',
]) {
  assert.ok(source.includes(marker), `Final verification runner is missing: ${marker}`);
}

const npmCi = source.indexOf('["npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]]');
const npmLs = source.indexOf('["npm", ["ls", "--all"]]');
const gitDiff = source.indexOf('["git", ["diff", "--check"]]');
assert.ok(npmCi >= 0 && npmCi < npmLs && npmLs < gitDiff, "Final runner must preserve the broker-bound first two commands");

assert.doesNotMatch(
  source.slice(source.indexOf("const names = ["), source.indexOf("];", source.indexOf("const names = [")) + 2),
  /SAFE_E2E_(?:BASE_URL|INTERNAL_SECRET)|INTERNAL_SYSTEM_JOBS_SECRET|CRON_SECRET|QA_EMAIL|SUPABASE_SERVICE_ROLE_KEY/,
  "Local exact-seal environment allowlist must not import hosted credentials or authenticated acceptance state",
);

console.log(
  "final verification runner contract: PASS (migration 102, release hygiene/evidence, zero effects, safe load, multilingual product contracts, and fail-closed authenticated-proof gate)",
);
