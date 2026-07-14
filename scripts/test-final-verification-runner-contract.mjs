#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  FINAL_VERIFICATION_COMMAND_COUNT,
  FINAL_VERIFICATION_COMMAND_PORTFOLIO,
  FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
  FINAL_VERIFICATION_HOSTED_DEFERRALS,
  assertExactFinalVerificationCommandPortfolio,
  assertExactFinalVerificationRecordPortfolio,
  assertExactFinalVerificationSummaryPortfolio,
  finalVerificationEvidenceQualification,
  formatFinalVerificationCommandTuple,
} from "./lib/final-verification-command-contract.mjs";

const source = readFileSync("scripts/run-dealflow-final-verification.mjs", "utf8");

assert.match(source, /Final verification requires Node 24/);
assert.equal(FINAL_VERIFICATION_COMMAND_COUNT, 90);
assert.equal(FINAL_VERIFICATION_COMMAND_PORTFOLIO.length, 90);
assert.equal(new Set(FINAL_VERIFICATION_COMMAND_PORTFOLIO).size, 90);
assert.equal(
  createHash("sha256")
    .update(JSON.stringify(FINAL_VERIFICATION_COMMAND_PORTFOLIO))
    .digest("hex"),
  FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
);
assert.equal(
  FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
  "b91e86deb84a5db3d502af3fb712412474e9d3640d5179dca6dc1b55b4c5d972",
);
assert.doesNotThrow(() =>
  assertExactFinalVerificationCommandPortfolio(FINAL_VERIFICATION_COMMAND_PORTFOLIO),
);
assert.equal(formatFinalVerificationCommandTuple(["npm", ["run", "lint"]]), "npm run lint");
for (const invalidTuple of [
  null,
  ["npm"],
  ["npm", ["run"], "extra"],
  [7, ["run", "lint"]],
  ["npm", "run lint"],
  ["npm", ["run", 7]],
]) {
  assert.throws(
    () => formatFinalVerificationCommandTuple(invalidTuple),
    /does not match the exact final-verification command contract/,
  );
}

function expectCommandPortfolioRejection(mutate) {
  const commands = [...FINAL_VERIFICATION_COMMAND_PORTFOLIO];
  mutate(commands);
  assert.throws(
    () => assertExactFinalVerificationCommandPortfolio(commands),
    /does not match the exact final-verification command contract/,
  );
}

assert.throws(
  () => assertExactFinalVerificationCommandPortfolio(null),
  /does not match the exact final-verification command contract/,
);
expectCommandPortfolioRejection((commands) => commands.pop());
expectCommandPortfolioRejection((commands) => commands.push("npm run unrelated-extra"));
expectCommandPortfolioRejection((commands) => {
  commands[1] = commands[0];
});
expectCommandPortfolioRejection((commands) => {
  [commands[4], commands[5]] = [commands[5], commands[4]];
});
expectCommandPortfolioRejection((commands) => commands.reverse());
expectCommandPortfolioRejection((commands) => {
  commands[0] += " ";
});
expectCommandPortfolioRejection((commands) => {
  commands[8] = "npm run Lint";
});
expectCommandPortfolioRejection((commands) => {
  commands[45] = commands[45].replace("--port 55432", "--port 55433");
});
expectCommandPortfolioRejection((commands) => {
  commands[0] = 7;
});

const exactSummaryIdentity = Object.freeze({
  headCommit: "a".repeat(40),
  headTree: "b".repeat(40),
  trackedWorktreeSha256: "c".repeat(64),
  trackedFileCount: 900,
  dependencyLockSha256: "d".repeat(64),
  migrationCount: 103,
  migrationPortfolioSha256: "e".repeat(64),
});
const exactRecords = FINAL_VERIFICATION_COMMAND_PORTFOLIO.map((command, index) => ({
  command,
  evidenceQualification: finalVerificationEvidenceQualification(command),
  status: "passed",
  exitCode: 0,
  postCommandRepositoryInvariant: "passed",
  safeEnvironmentProfile: "provider_credentials_and_application_secrets_omitted",
  workingDirectory: "/private/tmp/dealflow-overnight-release-20260712",
  ...exactSummaryIdentity,
  log: `${String(index + 1).padStart(2, "0")}-exact-command.log`,
}));
const exactSummary = {
  ...exactSummaryIdentity,
  plannedCommandCount: 90,
  commandCount: 90,
  passedCount: 90,
  commandPortfolioSha256: FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
  blockedCount: 3,
  environmentOnlyDeferredCount: 3,
  environmentOnlyDeferrals: FINAL_VERIFICATION_HOSTED_DEFERRALS.map((command) => ({
    command,
    status: "authenticated_deferred",
  })),
  localGateStatus: "NO_GO_AUTHENTICATED_PROOF_DEFERRED",
  stagingAdvancementAuthorized: false,
  exactSealCommandPortfolioStatus: "passed_with_mandatory_hosted_proof_blockers",
  authenticatedBrowserStatus: "authenticated_deferred_to_isolated_hosted_staging",
  remoteSchemaStatus: "authenticated_deferred_to_isolated_hosted_staging",
  records: exactRecords,
};
const exactSummarySnapshot = JSON.stringify(exactSummary);
const commandProof = assertExactFinalVerificationCommandPortfolio(
  FINAL_VERIFICATION_COMMAND_PORTFOLIO,
);
const recordProof = assertExactFinalVerificationRecordPortfolio(exactRecords);
const summaryProof = assertExactFinalVerificationSummaryPortfolio(exactSummary);
for (const proof of [commandProof, recordProof, summaryProof]) {
  assert.deepEqual(proof, {
    commandCount: 90,
    commandPortfolioSha256: FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
  });
  assert.equal(Object.isFrozen(proof), true);
}
assert.equal(JSON.stringify(exactSummary), exactSummarySnapshot, "validators must not mutate evidence");
assert.equal(
  exactRecords.filter(
    (record) => record.evidenceQualification === "exact_local_command",
  ).length,
  88,
);
assert.equal(
  exactRecords[15].evidenceQualification,
  "local_public_pass_authenticated_deferred",
);
assert.equal(
  exactRecords[38].evidenceQualification,
  "local_migration_inventory_only_remote_schema_deferred",
);

function expectPortfolioRejection(mutate) {
  const candidate = structuredClone(exactSummary);
  mutate(candidate);
  assert.throws(
    () => assertExactFinalVerificationSummaryPortfolio(candidate),
    /does not match the exact final-verification command contract/,
  );
}

expectPortfolioRejection((candidate) => candidate.records.pop());
expectPortfolioRejection((candidate) => candidate.records.push({ ...candidate.records[0] }));
expectPortfolioRejection((candidate) => {
  candidate.records[1] = { ...candidate.records[0] };
});
expectPortfolioRejection((candidate) => {
  [candidate.records[4], candidate.records[5]] = [candidate.records[5], candidate.records[4]];
});
expectPortfolioRejection((candidate) => {
  candidate.records[15].command = "npm run test:e2e:safe:similar";
});
expectPortfolioRejection((candidate) => {
  candidate.records[15].evidenceQualification = "exact_local_command";
});
expectPortfolioRejection((candidate) => {
  candidate.records[0].evidenceQualification = "local_public_pass_authenticated_deferred";
});
expectPortfolioRejection((candidate) => {
  candidate.records[0].evidenceQualification = "unrelated_deferred_label";
});
expectPortfolioRejection((candidate) => {
  candidate.records[0].exitCode = 1;
});
expectPortfolioRejection((candidate) => {
  candidate.records[0].status = "failed";
});
expectPortfolioRejection((candidate) => {
  candidate.records[0].postCommandRepositoryInvariant = "failed";
});
expectPortfolioRejection((candidate) => {
  candidate.records[0].headTree = "f".repeat(40);
});
expectPortfolioRejection((candidate) => {
  candidate.records[0].safeEnvironmentProfile = "different_environment";
});
expectPortfolioRejection((candidate) => {
  candidate.records[1].workingDirectory = "/private/tmp/other-repository";
});
expectPortfolioRejection((candidate) => {
  candidate.records[1].log = candidate.records[0].log;
});
expectPortfolioRejection((candidate) => {
  candidate.plannedCommandCount = 89;
});
expectPortfolioRejection((candidate) => {
  candidate.commandCount = 89;
});
expectPortfolioRejection((candidate) => {
  candidate.passedCount = 89;
});
expectPortfolioRejection((candidate) => {
  candidate.commandPortfolioSha256 = "0".repeat(64);
});
expectPortfolioRejection((candidate) => {
  delete candidate.commandPortfolioSha256;
});
expectPortfolioRejection((candidate) => {
  candidate.environmentOnlyDeferrals.reverse();
});
expectPortfolioRejection((candidate) => {
  candidate.environmentOnlyDeferrals[0].status = "different_status";
});
expectPortfolioRejection((candidate) => {
  candidate.localGateStatus = "GO";
});
expectPortfolioRejection((candidate) => {
  candidate.stagingAdvancementAuthorized = true;
});
expectPortfolioRejection((candidate) => {
  candidate.exactSealCommandPortfolioStatus = "passed";
});
assert.throws(
  () => assertExactFinalVerificationSummaryPortfolio(null),
  /does not match the exact final-verification command contract/,
);

for (const marker of [
  "const EXACT_INTEGRATED_MIGRATION_COUNT = 103",
  "20260713028000_harden_account_deletion_retention_authority.sql",
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
  "assertExactFinalVerificationCommandPortfolio",
  "formatFinalVerificationCommandTuple",
  "finalVerificationEvidenceQualification(command)",
  "commandPortfolioSha256: commandPortfolio.commandPortfolioSha256",
]) {
  assert.ok(source.includes(marker), `Final verification runner is missing: ${marker}`);
}

const npmCi = source.indexOf('["npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]]');
const npmLs = source.indexOf('["npm", ["ls", "--all"]]');
const gitDiff = source.indexOf('["git", ["diff", "--check"]]');
assert.ok(npmCi >= 0 && npmCi < npmLs && npmLs < gitDiff, "Final runner must preserve the broker-bound first two commands");
const hostedDeferralSource = source.slice(
  source.indexOf("const environmentOnlyDeferrals = Object.freeze(["),
  source.indexOf("\nfunction sanitize", source.indexOf("const environmentOnlyDeferrals")),
);
assert.deepEqual(
  [...hostedDeferralSource.matchAll(/command: "([^"]+)"/g)].map((match) => match[1]),
  FINAL_VERIFICATION_HOSTED_DEFERRALS,
  "The runner and every staging consumer must share one exact hosted-deferral order",
);
const exactPortfolioGate = source.indexOf(
  "const commandPortfolio = assertExactFinalVerificationCommandPortfolio(",
);
const executionLoop = source.indexOf("for (let index = 0; index < commands.length; index += 1)");
assert.ok(
  exactPortfolioGate >= 0 && exactPortfolioGate < executionLoop,
  "The exact ordered command contract must fail closed before any verification command executes",
);
assert.doesNotMatch(
  source,
  /command === "npm run test:e2e:safe"[\s\S]{0,300}command === "npm run schema:check"/,
  "Evidence qualification must come only from the shared final-verification contract",
);

assert.doesNotMatch(
  source.slice(source.indexOf("const names = ["), source.indexOf("];", source.indexOf("const names = [")) + 2),
  /SAFE_E2E_(?:BASE_URL|INTERNAL_SECRET)|INTERNAL_SYSTEM_JOBS_SECRET|CRON_SECRET|QA_EMAIL|SUPABASE_SERVICE_ROLE_KEY/,
  "Local exact-seal environment allowlist must not import hosted credentials or authenticated acceptance state",
);

console.log(
  "final verification runner contract: PASS (migration 103, release hygiene/evidence, zero effects, safe load, multilingual product contracts, and fail-closed authenticated-proof gate)",
);
