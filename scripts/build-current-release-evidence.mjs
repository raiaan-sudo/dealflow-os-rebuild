#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";

import { assertExactFinalVerificationSummaryPortfolio } from "./lib/final-verification-command-contract.mjs";
import { assertFinalVerificationEvidenceIsSealable } from "./lib/final-verification-evidence-contract.mjs";

const ALLOWED_STATUSES = new Set([
  "PASS",
  "FAILED",
  "BLOCKED",
  "NOT_PROVEN",
  "SKIPPED",
]);
const REQUIRED_FINAL_VERIFICATION_SCHEMA = "dealflow.final-verification.v3";
const REQUIRED_STAGING_SCHEMA = "dealflow.isolated-staging-acceptance-summary.v1";
const REQUIRED_CHECKPOINT_SCHEMA = "dealflow.release-checkpoint.v1";
const REQUIRED_PRODUCTION_SCHEMA = "dealflow.production-release-attestation.v1";
const PRODUCTION_TRUST = Object.freeze({
  status: "NOT_PROVEN",
  plainAttestationInformationalOnly: true,
  cryptographicallyProtectedTrustVerified: false,
  releaseAuthorized: false,
  reason:
    "This builder has no protected external cryptographic trust input. A caller-authored production attestation cannot authorize release.",
});

const CAPABILITIES = Object.freeze([
  {
    id: "CAP-01",
    name: "Automatic GHL location, snapshot, funnel and form provisioning",
    stagingGate: "ghlSandboxProvisioningFunnelsAndLeadDelivery",
  },
  {
    id: "CAP-02",
    name: "GHL-hosted inbound attribution and DealFlow reporting reconciliation",
    stagingGate: "ghlInboundAttributionAndReconciliation",
  },
  {
    id: "CAP-03",
    name: "Customer-authorized automatic Meta ACTIVE transition",
    stagingGate: "metaSandboxLaunchLeadgenReportingAndOptimization",
  },
  {
    id: "CAP-04",
    name: "Automatic Meta Instant Form provisioning and lead routing",
    stagingGate: "metaSandboxLaunchLeadgenReportingAndOptimization",
  },
  {
    id: "CAP-05",
    name: "Production-capable optimizer mutations",
    stagingGate: "metaSandboxLaunchLeadgenReportingAndOptimization",
  },
  {
    id: "CAP-06",
    name: "Higgsfield video generation",
    stagingGate: "creativeProviderGenerationAndPersistence",
  },
  {
    id: "CAP-07",
    name: "Configurable universal white-label partner support",
    stagingGate: "whiteLabelHostAndBranding",
  },
  {
    id: "CAP-08",
    name: "Multilingual product support",
    stagingGate: "multilingualProductJourneys",
  },
  {
    id: "CAP-09",
    name: "Automated deletion and provider-offboarding lifecycle",
    stagingGate: "deletionAndProviderOffboarding",
  },
]);

const PROVIDER_GATES = Object.freeze([
  ["GHL", "ghlSandboxProvisioningFunnelsAndLeadDelivery"],
  ["Meta", "metaSandboxLaunchLeadgenReportingAndOptimization"],
  ["Stripe", "stripeTestCheckoutWebhookAndLifecycle"],
  ["Higgsfield/creative", "creativeProviderGenerationAndPersistence"],
  ["Twilio", "twilioTestTransportAndConsentLifecycle"],
  ["Support delivery", "supportDeliverySinkAndOperatorLifecycle"],
]);

const PRODUCTION_GATES = Object.freeze([
  "exactCandidateDeployment",
  "exactProductionSchema",
  "environmentAttestation",
  "backupAndRecovery",
  "workerDrain",
  "providerActivation",
  "productionCanary",
  "aliasesAndDns",
  "monitoringAndRollback",
]);

const REQUIRED_STAGING_RUNNER_GATES = Object.freeze([
  "exactCandidateAndSchema",
  "syntheticRetentionOwnerAuthority",
  "isolatedHostedDeployment",
  "tenSyntheticRoleFixtures",
  "authenticatedDirectEntitlementBoundaries",
  "twoWhiteLabelHostsBrandingAndChildTenantIsolation",
  "crossTenantBrowserBoundary",
  "authenticatedRlsFixtureAndCleanup",
  "zeroExternalEffects",
  "readOnlyHostedLoad",
  "workerExecutionRetryReplayDeadLetterAndCrashRecovery",
  "operatorDebtAndRecoveryJourneys",
  "realSyntheticLeadCapturePersistenceAndDuplicateReplay",
  "supportInternalNonDeliveringInboxLifecycle",
  "reportingFreshStaleAndFailedRefreshStateHandling",
  "billingCancellationStaleEventReactivationAndReplayProjection",
  "accountDeletionRequestSuspensionAndDisabledWorkerBoundary",
  "ghlSandboxProvisioningFunnelsAndLeadDelivery",
  "metaSandboxLaunchLeadgenReportingAndOptimization",
  "stripeTestCheckoutAndSignedWebhook",
  "creativeProviderGenerationAndPersistence",
  "twilioTestTransportAndConsentLifecycle",
  "accountDeletionProviderOffboardingCompletion",
  "liveMetaReportingReconciliation",
]);

const STAGING_JOURNEYS = Object.freeze([
  ["JOURNEY-01", "New direct realtor signup", "authenticatedDirectEntitlementBoundaries"],
  ["JOURNEY-02", "Successful Stripe test payment", "stripeTestCheckoutWebhookAndLifecycle"],
  ["JOURNEY-03", "Exactly-once activation", "stripeTestCheckoutWebhookAndLifecycle"],
  ["JOURNEY-04", "Exactly-once $10 credit grant", "stripeTestCheckoutWebhookAndLifecycle"],
  ["JOURNEY-05", "Automatic GHL location provisioning", "ghlSandboxProvisioningFunnelsAndLeadDelivery"],
  ["JOURNEY-06", "Snapshot/object/custom-value verification", "ghlSandboxProvisioningFunnelsAndLeadDelivery"],
  ["JOURNEY-07", "Verified GHL-hosted funnel and form", "ghlSandboxProvisioningFunnelsAndLeadDelivery"],
  ["JOURNEY-08", "Actual GHL-hosted form submission", "ghlInboundAttributionAndReconciliation"],
  ["JOURNEY-09", "Native GHL contact creation", "ghlSandboxProvisioningFunnelsAndLeadDelivery"],
  ["JOURNEY-10", "Native GHL opportunity creation", "ghlSandboxProvisioningFunnelsAndLeadDelivery"],
  ["JOURNEY-11", "Native GHL workflow trigger", "ghlSandboxProvisioningFunnelsAndLeadDelivery"],
  ["JOURNEY-12", "DealFlow webhook attribution and reporting", "ghlInboundAttributionAndReconciliation"],
  ["JOURNEY-13", "No duplicate outbound GHL job for GHL-native lead", "ghlSandboxProvisioningFunnelsAndLeadDelivery"],
  ["JOURNEY-14", "Automatic Meta Instant Form provisioning", "metaSandboxLaunchLeadgenReportingAndOptimization"],
  ["JOURNEY-15", "Meta webhook persistence and deduplication", "metaSandboxLaunchLeadgenReportingAndOptimization"],
  ["JOURNEY-16", "Meta lead delivery to correct GHL location", "metaSandboxLaunchLeadgenReportingAndOptimization"],
  ["JOURNEY-17", "Customer-authorized scheduled Meta activation", "metaSandboxLaunchLeadgenReportingAndOptimization"],
  ["JOURNEY-18", "Higgsfield generation", "creativeProviderGenerationAndPersistence"],
  ["JOURNEY-19", "Static generation", "creativeProviderGenerationAndPersistence"],
  ["JOURNEY-20", "Correct credit settlement", "stripeTestCheckoutWebhookAndLifecycle"],
  ["JOURNEY-21", "Optimizer bounded mutation", "metaSandboxLaunchLeadgenReportingAndOptimization"],
  ["JOURNEY-22", "White-label partner one", "whiteLabelHostAndBranding"],
  ["JOURNEY-23", "White-label partner two", "whiteLabelHostAndBranding"],
  ["JOURNEY-24", "Partner child-customer isolation", "crossTenantBrowserBoundary"],
  ["JOURNEY-25", "English journey", "crossTenantBrowserBoundary"],
  ["JOURNEY-26", "French and Spanish journeys", "crossTenantBrowserBoundary"],
  ["JOURNEY-27", "Support journey through non-delivering sink", "supportDeliverySinkAndOperatorLifecycle"],
  ["JOURNEY-28", "Cancellation/reactivation", "stripeTestCheckoutWebhookAndLifecycle"],
  ["JOURNEY-29", "Deletion/provider-offboarding", "deletionAndProviderOffboarding"],
  ["JOURNEY-30", "Cross-tenant attack denial", "authenticatedRlsFixtureAndCleanup"],
  ["JOURNEY-31", "Provider timeout and recovery", "workerExecutionRetryAndDeadLetterRecovery"],
  ["JOURNEY-32", "Duplicate webhook replay", "workerExecutionRetryAndDeadLetterRecovery"],
  ["JOURNEY-33", "Worker crash after provider success", "workerExecutionRetryAndDeadLetterRecovery"],
  ["JOURNEY-34", "Reporting freshness, stale and failed states", "liveReportingReconciliation"],
  ["JOURNEY-35", "Mobile, desktop and embedded GHL browser", "crossTenantBrowserBoundary"],
]);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function json(path, label = path) {
  return jsonBytes(readFileSync(path), label);
}

function jsonBytes(contents, label) {
  try {
    return JSON.parse(contents.toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function snapshotFile(path, label) {
  if (!path || !existsSync(path)) fail(`${label} must be an existing regular file`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular non-symlink file`);
  if (stat.size === 0) fail(`${label} is empty`);
  if (stat.size > 0 && stat.blocks === 0) fail(`${label} is a probable dataless file`);
  const contents = readFileSync(path);
  assertSafeArtifact(path, contents);
  return Object.freeze({
    path,
    bytes: contents.length,
    sha256: sha256(contents),
    contents,
    parsed: jsonBytes(contents, label),
  });
}

function assertFileSnapshotUnchanged(snapshot, label) {
  if (!existsSync(snapshot.path)) fail(`${label} disappeared during bundle assembly`);
  const stat = lstatSync(snapshot.path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} changed file type during bundle assembly`);
  const contents = readFileSync(snapshot.path);
  if (contents.length !== snapshot.bytes || sha256(contents) !== snapshot.sha256) {
    fail(`${label} changed during bundle assembly`);
  }
}

function writeFileSnapshot(path, snapshot) {
  writeFileSync(path, snapshot.contents, { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
  if (sha256File(path) !== snapshot.sha256) fail(`Snapshotted evidence changed while writing ${path}`);
}

function assertHex(value, label, lengths = [40, 64]) {
  if (typeof value !== "string" || !lengths.includes(value.length) || !/^[0-9a-f]+$/.test(value)) {
    fail(`${label} is not a valid lowercase hexadecimal identity`);
  }
  return value;
}

function normalizeStatus(value, label) {
  const normalized = value === "FAIL"
    ? "FAILED"
    : typeof value === "string" && value.startsWith("BLOCKED_")
      ? "BLOCKED"
      : value;
  if (!ALLOWED_STATUSES.has(normalized)) fail(`${label} has unsupported status ${String(value)}`);
  return normalized;
}

function assertSafeRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    isAbsolute(value) ||
    value.split(/[\\/]+/).includes("..") ||
    value.includes("\0")
  ) {
    fail(`${label} is not a safe relative path`);
  }
  return value;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") return { help: true };
    const key = {
      "--round-one": "roundOne",
      "--round-two": "roundTwo",
      "--staging": "staging",
      "--checkpoint-record": "checkpointRecord",
      "--production-attestation": "productionAttestation",
      "--output": "output",
    }[argument];
    if (!key) fail(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${argument} requires a value`);
    options[key] = resolve(value);
    index += 1;
  }
  for (const key of ["roundOne", "roundTwo", "staging", "checkpointRecord", "output"]) {
    if (!options[key]) fail(`Missing required option: ${key}`);
  }
  return options;
}

function usage() {
  return [
    "Usage: node scripts/build-current-release-evidence.mjs \\",
    "  --round-one <external-dir> --round-two <external-dir> \\",
    "  --staging <external-dir> --checkpoint-record <json-file> \\",
    "  --output <new-external-dir> [--production-attestation <json-file>]",
  ].join("\n");
}

function git(root, args, label) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  });
  if (result.error || result.status !== 0) {
    fail(`${label} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function trackedWorktreeIdentity(root) {
  const raw = git(root, ["ls-files", "--stage", "-z"], "tracked source inventory");
  const entries = raw.split("\0").filter(Boolean).map((entry) => {
    const match = /^(\d{6}) ([0-9a-f]{40,64}) ([0-3])\t([\s\S]+)$/.exec(entry);
    if (!match || match[3] !== "0") fail("Tracked source contains an unsupported or unmerged entry");
    return { mode: match[1], path: match[4] };
  });
  const digest = createHash("sha256");
  for (const entry of entries) {
    const absolute = join(root, entry.path);
    const stat = lstatSync(absolute);
    let contents;
    if (entry.mode === "120000") {
      if (!stat.isSymbolicLink()) fail(`Tracked link changed type: ${entry.path}`);
      contents = Buffer.from(readlinkSync(absolute));
    } else {
      if (!stat.isFile() || stat.isSymbolicLink()) fail(`Tracked file changed type: ${entry.path}`);
      contents = readFileSync(absolute);
    }
    digest.update(entry.mode);
    digest.update("\0");
    digest.update(String(Buffer.byteLength(entry.path)));
    digest.update("\0");
    digest.update(entry.path);
    digest.update("\0");
    digest.update(String(contents.length));
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
  }
  return { trackedFileCount: entries.length, trackedWorktreeSha256: digest.digest("hex") };
}

function captureRepository(root) {
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all", "-z"], "source cleanliness");
  if (status !== "") fail("Release evidence must run from the final completely clean sealed source");
  const identity = {
    branch: git(root, ["rev-parse", "--abbrev-ref", "HEAD"], "branch identity").trim(),
    commit: git(root, ["rev-parse", "--verify", "HEAD"], "commit identity").trim(),
    tree: git(root, ["rev-parse", "--verify", "HEAD^{tree}"], "tree identity").trim(),
    ...trackedWorktreeIdentity(root),
    dependencyLockSha256: sha256File(join(root, "package-lock.json")),
  };
  assertHex(identity.commit, "source commit");
  assertHex(identity.tree, "source tree");
  assertHex(identity.trackedWorktreeSha256, "tracked source digest", [64]);
  assertHex(identity.dependencyLockSha256, "dependency lock digest", [64]);
  return identity;
}

function captureMigrations(root) {
  const directory = join(root, "supabase", "migrations");
  const files = readdirSync(directory).filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort();
  if (files.length === 0 || new Set(files.map((name) => name.slice(0, 14))).size !== files.length) {
    fail("Migration portfolio is empty or contains duplicate versions");
  }
  const digest = createHash("sha256");
  const records = files.map((name) => {
    const contents = readFileSync(join(directory, name));
    digest.update(String(Buffer.byteLength(name)));
    digest.update("\0");
    digest.update(name);
    digest.update("\0");
    digest.update(String(contents.length));
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
    return { name, bytes: contents.length, sha256: sha256(contents) };
  });
  const priorDigest = createHash("sha256");
  for (const record of records.slice(0, -1)) {
    const contents = readFileSync(join(directory, record.name));
    priorDigest.update(String(Buffer.byteLength(record.name)));
    priorDigest.update("\0");
    priorDigest.update(record.name);
    priorDigest.update("\0");
    priorDigest.update(String(contents.length));
    priorDigest.update("\0");
    priorDigest.update(contents);
    priorDigest.update("\0");
  }
  return {
    migrationCount: records.length,
    finalMigration: records.at(-1).name,
    migrationPortfolioSha256: digest.digest("hex"),
    priorMigrationPortfolioSha256: priorDigest.digest("hex"),
    files: records,
  };
}

function assertIdentity(expected, actual, label) {
  const mappings = [
    ["commit", actual.commit ?? actual.headCommit],
    ["tree", actual.tree ?? actual.headTree],
    ["trackedWorktreeSha256", actual.trackedWorktreeSha256],
    ["trackedFileCount", actual.trackedFileCount],
    ["dependencyLockSha256", actual.dependencyLockSha256],
  ];
  for (const [key, value] of mappings) {
    if (value !== expected[key]) fail(`${label} ${key} does not match the exact current source`);
  }
  if (actual.branch !== undefined && actual.branch !== expected.branch) {
    fail(`${label} branch does not match the exact current source`);
  }
}

function assertMigrations(expected, actual, label) {
  if (
    actual.migrationCount !== expected.migrationCount ||
    actual.migrationPortfolioSha256 !== expected.migrationPortfolioSha256
  ) {
    fail(`${label} migration identity does not match the exact current portfolio`);
  }
  if (actual.finalMigration !== undefined && actual.finalMigration !== expected.finalMigration) {
    fail(`${label} final migration does not match the exact current portfolio`);
  }
}

function validateRound(directory, expectedRound, identity, migrations) {
  const summaryPath = join(directory, "verification-summary.json");
  const summary = json(summaryPath, `verification round ${expectedRound} summary`);
  const evidence = assertFinalVerificationEvidenceIsSealable(directory);
  assertExactFinalVerificationSummaryPortfolio(
    summary,
    `Verification round ${expectedRound} release-evidence portfolio`,
  );
  if (summary.schemaVersion !== REQUIRED_FINAL_VERIFICATION_SCHEMA || String(summary.round) !== expectedRound) {
    fail(`Verification round ${expectedRound} has the wrong schema or round identity`);
  }
  assertIdentity(identity, summary, `verification round ${expectedRound}`);
  assertMigrations(migrations, summary, `verification round ${expectedRound}`);
  if (
    !/^v24\./.test(summary.runtime ?? "") ||
    summary.repositoryInvariant !== "passed" ||
    summary.failedCount !== 0 ||
    summary.commandCount !== summary.plannedCommandCount ||
    summary.passedCount !== summary.plannedCommandCount ||
    summary.blockedCount !== summary.environmentOnlyDeferredCount ||
    !Array.isArray(summary.environmentOnlyDeferrals) ||
    summary.environmentOnlyDeferrals.length !== summary.blockedCount ||
    summary.exactSealCommandPortfolioStatus !== "passed_with_mandatory_hosted_proof_blockers" ||
    summary.localGateStatus !== "NO_GO_AUTHENTICATED_PROOF_DEFERRED" ||
    !Array.isArray(summary.records) ||
    summary.records.length !== summary.commandCount ||
    evidence.status !== "PASS" ||
    evidence.fileCountBeforeSummary !== summary.evidenceTreeFileCountBeforeSummary ||
    evidence.totalFileCount !== summary.evidenceTreeFileCountBeforeSummary + 1 ||
    evidence.evidenceTreeSha256BeforeSummary !==
      summary.evidenceTreeSha256BeforeSummary ||
    evidence.browser.status !== summary.localBrowserEvidenceStatus ||
    evidence.browser.screenshotCount !== summary.localBrowserScreenshotCount ||
    JSON.stringify(evidence.browser.projectScreenshotCounts) !==
      JSON.stringify(summary.localBrowserProjectScreenshotCounts) ||
    summary.records.some(
      (record) =>
        record.status !== "passed" ||
        record.exitCode !== 0 ||
        record.postCommandRepositoryInvariant !== "passed",
    )
  ) {
    fail(`Verification round ${expectedRound} is not a complete exact-seal local pass`);
  }
  return {
    path: directory,
    summaryPath,
    summarySha256: sha256File(summaryPath),
    summary,
  };
}

function verifyChecksums(directory) {
  const checksumPath = join(directory, "SHA256SUMS");
  const manifestPath = join(directory, "evidence-manifest.json");
  if (!existsSync(checksumPath) || !existsSync(manifestPath)) {
    fail("Staging evidence is not sealed by evidence-manifest.json and SHA256SUMS");
  }
  const lines = readFileSync(checksumPath, "utf8").split(/\r?\n/).filter(Boolean);
  const declared = new Set();
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match || match[2] === "SHA256SUMS" || declared.has(match[2])) {
      fail(`Invalid or duplicate staging checksum line: ${line}`);
    }
    assertSafeRelativePath(match[2], "staging checksum path");
    const file = join(directory, match[2]);
    if (!existsSync(file) || sha256File(file) !== match[1]) fail(`Staging checksum mismatch: ${match[2]}`);
    declared.add(match[2]);
  }
  const files = inventory(directory).map((record) => record.path).filter((path) => path !== "SHA256SUMS");
  if (files.length !== declared.size || files.some((path) => !declared.has(path))) {
    fail("Staging evidence contains an unhashed or missing-checksum artifact");
  }
  const manifest = json(manifestPath, "staging evidence manifest");
  if (!Array.isArray(manifest.files)) fail("Staging evidence manifest lacks files[]");
  for (const record of manifest.files) {
    assertSafeRelativePath(record.path, "staging manifest path");
    const file = join(directory, record.path);
    if (!existsSync(file) || sha256File(file) !== record.sha256) {
      fail(`Staging manifest mismatch: ${record.path}`);
    }
  }
  return { checksumCount: declared.size, sha256sumsSha256: sha256File(checksumPath) };
}

function combineStatuses(statuses, label) {
  const normalized = statuses.map((status, index) => normalizeStatus(status ?? "NOT_PROVEN", `${label} component ${index + 1}`));
  if (normalized.every((status) => status === "PASS")) return "PASS";
  if (normalized.includes("FAILED")) return "FAILED";
  if (normalized.includes("BLOCKED")) return "BLOCKED";
  if (normalized.every((status) => status === "SKIPPED")) return "SKIPPED";
  return "NOT_PROVEN";
}

function priorMigrationFilesMatch(priorApplication, migrations) {
  const expected = migrations.files.slice(0, -1);
  return (
    Array.isArray(priorApplication?.migrationFiles) &&
    priorApplication.migrationFiles.length === expected.length &&
    priorApplication.migrationFiles.every((record, index) =>
      record?.file === expected[index].name &&
      record?.version === expected[index].name.slice(0, 14) &&
      record?.sha256 === expected[index].sha256)
  );
}

function exactForwardMigrationMatches(record, migrations) {
  const expected = migrations.files.at(-1);
  return (
    record?.file === expected.name &&
    record?.version === expected.name.slice(0, 14) &&
    record?.sha256 === expected.sha256
  );
}

function validateStaging(directory, identity, migrations, roundOne, roundTwo) {
  const summary = json(join(directory, "FINAL_SUMMARY.json"), "staging final summary");
  if (summary.schemaVersion !== REQUIRED_STAGING_SCHEMA) fail("Staging final summary schema is unsupported");
  assertIdentity(identity, summary.identity, "staging summary");
  assertMigrations(migrations, summary.migrations, "staging summary");
  if (summary.productionMutationPerformed !== false || summary.advertisingSpendIncurred !== false || summary.realCommunicationSent !== false) {
    fail("Isolated staging evidence reports a forbidden production/spend/communication effect");
  }
  const preflight = json(join(directory, "preflight.json"), "staging preflight");
  assertIdentity(identity, preflight.identity, "staging preflight");
  assertMigrations(migrations, preflight.migrations, "staging preflight");
  const gate = json(join(directory, "production-gate-matrix.json"), "staging production gate matrix");
  if (!gate.productionGateMatrix || typeof gate.productionGateMatrix !== "object") {
    fail("Staging production gate matrix is missing");
  }
  const normalizedRunnerGates = Object.fromEntries(
    Object.entries(gate.productionGateMatrix).map(([name, status]) => [
      name,
      normalizeStatus(status, `staging gate ${name}`),
    ]),
  );
  for (const name of REQUIRED_STAGING_RUNNER_GATES) {
    if (!Object.hasOwn(gate.productionGateMatrix, name)) {
      fail(`Staging production gate matrix lacks current runner gate ${name}`);
    }
  }
  if (
    !preflight.roundOne ||
    !preflight.roundTwo ||
    preflight.roundOne.sha256 !== roundOne.summarySha256 ||
    preflight.roundTwo.sha256 !== roundTwo.summarySha256
  ) {
    fail("Staging evidence is not bound to the two supplied exact final-verification rounds");
  }
  if (
    !summary.productionGateMatrix ||
    JSON.stringify(summary.productionGateMatrix) !== JSON.stringify(gate.productionGateMatrix)
  ) {
    fail("Staging final summary and production gate matrix disagree");
  }
  const migrationSummary = json(
    join(directory, "migration-proof", "staging-migration-summary.json"),
    "staging migration summary",
  );
  const freshAtomicMigrationApplication =
    migrationSummary.migrationMode == null &&
    migrationSummary.remoteMutationStarted === true &&
    migrationSummary.remoteMutationCompleted === true;
  const verifiedExistingExactMigrationApplication =
    migrationSummary.migrationMode === "VERIFY_EXISTING_EXACT" &&
    migrationSummary.verificationReadOnly === true &&
    migrationSummary.remoteMutationStarted === false &&
    migrationSummary.remoteMutationCompleted === false &&
    migrationSummary.portfolioApplicationRemoteMutationCompleted === true &&
    migrationSummary.remoteStateVerificationStatus ===
      "EXACT_EXISTING_COMMITTED_PORTFOLIO" &&
    migrationSummary.priorApplication?.remoteMutationCompleted === true &&
    migrationSummary.priorApplication?.migrationPortfolioSha256 ===
      migrations.migrationPortfolioSha256 &&
    migrationSummary.priorApplication?.normalizedSchemaSha256 ===
      migrationSummary.normalizedSchemaSha256;
  const exactForwardMigrationApplication =
    migrationSummary.migrationMode === "APPLY_FORWARD_EXACT" &&
    migrationSummary.forwardOnly === true &&
    migrationSummary.priorMigrationCount === migrations.migrationCount - 1 &&
    migrationSummary.forwardMigrationCount === 1 &&
    exactForwardMigrationMatches(migrationSummary.forwardMigration, migrations) &&
    migrationSummary.remoteMutationStarted === true &&
    migrationSummary.remoteMutationCompleted === true &&
    migrationSummary.portfolioApplicationRemoteMutationCompleted === true &&
    migrationSummary.remoteStateVerificationStatus ===
      "EXACT_FORWARD_COMMITTED_PORTFOLIO" &&
    migrationSummary.priorApplication?.remoteMutationCompleted === true &&
    migrationSummary.priorApplication?.migrationCount === migrations.migrationCount - 1 &&
    priorMigrationFilesMatch(migrationSummary.priorApplication, migrations) &&
    migrationSummary.priorApplication?.migrationPortfolioSha256 ===
      migrations.priorMigrationPortfolioSha256 &&
    /^[a-f0-9]{64}$/.test(
      migrationSummary.priorApplication?.normalizedSchemaSha256 ?? "",
    );
  if (
    migrationSummary.status !== "PASS" ||
    (!freshAtomicMigrationApplication &&
      !verifiedExistingExactMigrationApplication &&
      !exactForwardMigrationApplication) ||
    migrationSummary.headCommit !== identity.commit ||
    migrationSummary.headTree !== identity.tree ||
    migrationSummary.migrationCount !== migrations.migrationCount ||
    migrationSummary.migrationPortfolioSha256 !== migrations.migrationPortfolioSha256
  ) {
    fail("Staging migration proof is not bound to the exact source and migration portfolio");
  }
  assertHex(migrationSummary.normalizedSchemaSha256, "staging normalized schema digest", [64]);
  const migrationProof = json(
    join(directory, "migration-proof", "staging-migration-proof.json"),
    "staging migration proof",
  );
  const detailedMigrationModeMatches = verifiedExistingExactMigrationApplication
    ? migrationProof.migrationMode === "VERIFY_EXISTING_EXACT" &&
      migrationProof.verificationReadOnly === true &&
      migrationProof.remoteMutationStarted === false &&
      migrationProof.remoteMutationCompleted === false &&
      migrationProof.portfolioApplicationRemoteMutationCompleted === true &&
      migrationProof.remoteStateVerification?.status ===
        "EXACT_EXISTING_COMMITTED_PORTFOLIO" &&
      migrationProof.priorApplication?.manifestSha256 ===
        migrationSummary.priorApplication?.manifestSha256
    : exactForwardMigrationApplication
      ? migrationProof.migrationMode === "APPLY_FORWARD_EXACT" &&
        migrationProof.forwardOnly === true &&
        migrationProof.priorMigrationCount === migrations.migrationCount - 1 &&
        migrationProof.forwardMigrationCount === 1 &&
        exactForwardMigrationMatches(migrationProof.forwardMigration, migrations) &&
        migrationProof.remoteMutationStarted === true &&
        migrationProof.remoteMutationCompleted === true &&
        migrationProof.portfolioApplicationRemoteMutationCompleted === true &&
        migrationProof.remoteStateVerification?.status ===
          "EXACT_FORWARD_COMMITTED_PORTFOLIO" &&
        migrationProof.priorApplication?.manifestSha256 ===
          migrationSummary.priorApplication?.manifestSha256 &&
        priorMigrationFilesMatch(migrationProof.priorApplication, migrations) &&
        Array.isArray(migrationProof.applied) &&
        migrationProof.applied.length === 1 &&
        exactForwardMigrationMatches(migrationProof.applied[0], migrations)
      : migrationProof.migrationMode == null;
  if (
    migrationProof.status !== "PASS" ||
    !detailedMigrationModeMatches ||
    migrationProof.headCommit !== identity.commit ||
    migrationProof.headTree !== identity.tree ||
    migrationProof.trackedWorktreeSha256 !== identity.trackedWorktreeSha256 ||
    migrationProof.trackedFileCount !== identity.trackedFileCount ||
    migrationProof.dependencyLockSha256 !== identity.dependencyLockSha256 ||
    migrationProof.migrationCount !== migrations.migrationCount ||
    migrationProof.migrationPortfolioSha256 !== migrations.migrationPortfolioSha256 ||
    migrationProof.normalizedSchemaSha256 !== migrationSummary.normalizedSchemaSha256
  ) {
    fail("Detailed staging migration proof is not bound to the exact source, dependencies and schema digest");
  }
  const browser = json(join(directory, "browser-summary.json"), "staging browser summary");
  if (browser.status !== "PASS") fail("Staging browser summary is not PASS");
  const derivedGates = {
    ...normalizedRunnerGates,
    whiteLabelHostAndBranding:
      normalizedRunnerGates.twoWhiteLabelHostsBrandingAndChildTenantIsolation,
    realSyntheticLeadCapturePersistenceAndDelivery:
      normalizedRunnerGates.realSyntheticLeadCapturePersistenceAndDuplicateReplay,
    stripeTestCheckoutWebhookAndLifecycle: combineStatuses([
      normalizedRunnerGates.stripeTestCheckoutAndSignedWebhook,
      normalizedRunnerGates.billingCancellationStaleEventReactivationAndReplayProjection,
    ], "Stripe test checkout, webhook and lifecycle"),
    supportDeliverySinkAndOperatorLifecycle:
      normalizedRunnerGates.supportInternalNonDeliveringInboxLifecycle,
    liveReportingReconciliation: combineStatuses([
      normalizedRunnerGates.reportingFreshStaleAndFailedRefreshStateHandling,
      normalizedRunnerGates.liveMetaReportingReconciliation,
    ], "live reporting reconciliation"),
    workerExecutionRetryAndDeadLetterRecovery:
      normalizedRunnerGates.workerExecutionRetryReplayDeadLetterAndCrashRecovery,
    ghlInboundAttributionAndReconciliation: combineStatuses([
      normalizedRunnerGates.ghlSandboxProvisioningFunnelsAndLeadDelivery,
      normalizedRunnerGates.realSyntheticLeadCapturePersistenceAndDuplicateReplay,
      normalizedRunnerGates.reportingFreshStaleAndFailedRefreshStateHandling,
    ], "GHL inbound attribution and reconciliation"),
    multilingualProductJourneys:
      browser.localizedPublicAndAuthenticatedJourneys === true &&
      browser.reducedMotionKeyboardZoomAndAxe === true
        ? "PASS"
        : "NOT_PROVEN",
    deletionAndProviderOffboarding:
      combineStatuses([
        normalizedRunnerGates.accountDeletionRequestSuspensionAndDisabledWorkerBoundary,
        normalizedRunnerGates.accountDeletionProviderOffboardingCompletion,
      ], "account deletion and provider offboarding"),
  };
  const seal = verifyChecksums(directory);
  return { summary, preflight, gate, migrationSummary, migrationProof, browser, derivedGates, seal };
}

function validateCheckpoint(snapshot, identity) {
  const checkpoint = snapshot.parsed;
  if (checkpoint.schemaVersion !== REQUIRED_CHECKPOINT_SCHEMA || checkpoint.status !== "PASS") {
    fail("Release checkpoint record must be a PASS dealflow.release-checkpoint.v1 record");
  }
  if (!checkpoint.checkpoint || checkpoint.checkpoint.status !== "PASS") {
    fail("Release checkpoint proof is absent or not PASS");
  }
  assertHex(checkpoint.checkpoint.commit, "checkpoint commit");
  assertHex(checkpoint.checkpoint.tree, "checkpoint tree");
  assertHex(checkpoint.checkpoint.bundleSha256, "checkpoint bundle digest", [64]);
  assertIdentity(identity, checkpoint.finalSource, "checkpoint final source binding");
  return checkpoint;
}

function validateProduction(snapshot, identity, migrations) {
  if (!snapshot) return null;
  const attestation = snapshot.parsed;
  if (attestation.schemaVersion !== REQUIRED_PRODUCTION_SCHEMA) fail("Production attestation schema is unsupported");
  normalizeStatus(attestation.status, "production attestation status");
  assertIdentity(identity, attestation.identity, "production attestation");
  assertMigrations(migrations, attestation.migrations, "production attestation");
  assertHex(attestation.schemaDigest, "production normalized schema digest", [64]);
  if (attestation.environmentFingerprint !== undefined) {
    assertHex(attestation.environmentFingerprint, "production environment fingerprint", [64]);
  }
  if (!attestation.productionGateMatrix || typeof attestation.productionGateMatrix !== "object") {
    fail("Production attestation lacks productionGateMatrix");
  }
  for (const gate of PRODUCTION_GATES) {
    normalizeStatus(attestation.productionGateMatrix[gate], `production gate ${gate}`);
  }
  if (attestation.providerMatrix !== undefined) {
    for (const [provider, status] of Object.entries(attestation.providerMatrix)) {
      normalizeStatus(status, `production provider ${provider}`);
    }
  }
  if (attestation.capabilityMatrix !== undefined) {
    for (const capability of CAPABILITIES) {
      normalizeStatus(attestation.capabilityMatrix[capability.id], `production capability ${capability.id}`);
    }
  }
  if (attestation.status === "PASS") {
    assertHex(attestation.environmentFingerprint, "PASS production environment fingerprint", [64]);
    if (
      typeof attestation.deployment?.deploymentId !== "string" ||
      attestation.deployment.deploymentId.length < 4 ||
      attestation.deployment.status !== "READY" ||
      attestation.deployment.aliasStatus !== "PASS" ||
      !attestation.featureFlags ||
      typeof attestation.featureFlags !== "object" ||
      !attestation.effects ||
      typeof attestation.effects !== "object"
    ) {
      fail("PASS production attestation lacks deployment, alias, feature-flag, or effects truth");
    }
  }
  return attestation;
}

function inventory(root) {
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) fail(`Evidence contains a symlink: ${absolute}`);
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) {
        if (stat.size === 0) fail(`Evidence contains an empty file: ${absolute}`);
        if (stat.size > 0 && stat.blocks === 0) fail(`Evidence contains a probable dataless file: ${absolute}`);
        files.push({ path: relative(root, absolute), absolute, bytes: stat.size, sha256: sha256File(absolute) });
      } else fail(`Evidence contains unsupported filesystem content: ${absolute}`);
    }
  };
  visit(root);
  return files;
}

function assertSafeArtifact(path, contents) {
  if (contents.includes(0)) {
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(extname(path).toLowerCase())) return;
    fail(`Unsupported binary artifact cannot be sanitized safely: ${path}`);
  }
  const text = contents.toString("utf8");
  const secretPatterns = [
    /authorization\s*:\s*bearer\s+[A-Za-z0-9._~+/-]{12,}/i,
    /\b(?:sk|rk)_(?:live|test|proj)_[A-Za-z0-9_-]{12,}\b/i,
    /\b(?:sb_secret_|sbp_)[A-Za-z0-9_-]{12,}\b/i,
    /\b(?:EAA|EAAB)[A-Za-z0-9_-]{16,}\b/,
    /postgres(?:ql)?:\/\/[^\s"']+/i,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\b(?:api[_-]?key|access[_-]?token|service[_-]?role[_-]?key|client[_-]?secret|password)\b["']?\s*[=:]\s*["']?(?!\[?REDACTED|false\b|null\b)[A-Za-z0-9._~+/-]{12,}/i,
  ];
  const protectedIdentifierPatterns = [
    /https?:\/\/[a-z0-9]{20}\.supabase\.co\b/i,
    /\b(?:projectRef|supabaseProjectRef|protectedProjectRef)\b["']?\s*[=:]\s*["']?[a-z0-9]{20}\b/i,
  ];
  const customerPatterns = [
    /\b(?:customerEmail|customer_email|leadEmail|lead_email)\b["']?\s*[=:]\s*["']?(?![^\s"']+@(?:example\.com|example\.test|agentdealflow\.test))[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /\b(?:customerPhone|customer_phone|leadPhone|lead_phone)\b["']?\s*[=:]\s*["']?\+?[1-9][0-9 ()-]{8,}\b/i,
  ];
  if (secretPatterns.some((pattern) => pattern.test(text))) fail(`Probable secret rejected in ${path}`);
  if (protectedIdentifierPatterns.some((pattern) => pattern.test(text))) fail(`Full protected identifier rejected in ${path}`);
  if (customerPatterns.some((pattern) => pattern.test(text))) fail(`Probable customer data rejected in ${path}`);
}

function snapshotInput(root) {
  const records = inventory(root);
  for (const record of records) assertSafeArtifact(record.path, readFileSync(record.absolute));
  return records;
}

function assertInputUnchanged(root, before, label) {
  const after = inventory(root);
  if (JSON.stringify(before.map(({ path, bytes, sha256: hash }) => ({ path, bytes, sha256: hash }))) !==
      JSON.stringify(after.map(({ path, bytes, sha256: hash }) => ({ path, bytes, sha256: hash })))) {
    fail(`${label} changed while the release bundle was being assembled`);
  }
}

function validateSnapshottedInput(root, label, validate) {
  // Bind the exact source bytes before semantic validation. Proving the source
  // is still identical immediately afterward closes the validate-then-snapshot
  // race: validation can qualify only the byte portfolio that copyProof seals.
  const snapshot = snapshotInput(root);
  const value = validate();
  assertInputUnchanged(root, snapshot, label);
  return Object.freeze({ snapshot, value });
}

function copyProof(sourceRoot, destinationRoot, records) {
  for (const record of records) {
    const destination = join(destinationRoot, record.path);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    copyFileSync(record.absolute, destination);
    chmodSync(destination, 0o600);
    if (sha256File(destination) !== record.sha256) fail(`Copied evidence changed: ${record.path}`);
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, value.endsWith("\n") ? value : `${value}\n`, { mode: 0o600, flag: "wx" });
}

function markdownTable(rows, fields) {
  const escape = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  return [
    `| ${fields.map(([heading]) => heading).join(" | ")} |`,
    `| ${fields.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${fields.map(([, key]) => escape(row[key])).join(" | ")} |`),
  ].join("\n");
}

function statusFromGate(gates, key) {
  return normalizeStatus(gates[key] ?? "NOT_PROVEN", `staging gate ${key}`);
}

function buildCapabilityMatrix(stagingGates, production) {
  return CAPABILITIES.map((capability) => {
    const stagingStatus = statusFromGate(stagingGates, capability.stagingGate);
    const reportedProductionStatus = production?.capabilityMatrix?.[capability.id]
      ? normalizeStatus(production.capabilityMatrix[capability.id], `production capability ${capability.id}`)
      : "NOT_PROVEN";
    const productionStatus = "NOT_PROVEN";
    return {
      id: capability.id,
      capability: capability.name,
      implementationProof: "PASS",
      stagingProof: stagingStatus,
      productionProof: productionStatus,
      reportedProductionProof: reportedProductionStatus,
      finalStatus:
        productionStatus === "PASS" && stagingStatus === "PASS"
          ? "PASS"
          : stagingStatus === "FAILED" || productionStatus === "FAILED"
            ? "FAILED"
            : stagingStatus === "BLOCKED" || productionStatus === "BLOCKED"
              ? "BLOCKED"
              : "NOT_PROVEN",
      evidence: `proof/staging/production-gate-matrix.json#${capability.stagingGate}`,
    };
  });
}

function buildProviderMatrix(stagingGates, production) {
  return PROVIDER_GATES.map(([provider, gate]) => {
    const reportedProductionAcceptance = production?.providerMatrix?.[provider]
      ? normalizeStatus(production.providerMatrix[provider], `production provider ${provider}`)
      : "NOT_PROVEN";
    return {
      provider,
      localContract: "PASS",
      stagingAcceptance: statusFromGate(stagingGates, gate),
      productionAcceptance: "NOT_PROVEN",
      reportedProductionAcceptance,
      evidence: `proof/staging/production-gate-matrix.json#${gate}`,
    };
  });
}

function buildProductionMatrix(production) {
  return PRODUCTION_GATES.map((gate) => ({
    gate,
    status: "NOT_PROVEN",
    reportedStatus: production
      ? normalizeStatus(production.productionGateMatrix[gate], `production gate ${gate}`)
      : "NOT_PROVEN",
    evidence: production
      ? "inputs/production-attestation.json (informational, untrusted)"
      : "No production attestation supplied",
  }));
}

function buildJourneys(stagingGates) {
  return STAGING_JOURNEYS.map(([id, journey, gate]) => ({
    id,
    journey,
    status: statusFromGate(stagingGates, gate),
    evidence: `proof/staging/production-gate-matrix.json#${gate}`,
  }));
}

function buildLeadArchitecture() {
  return {
    systemsOfRecord: [
      { system: "Stripe", owns: "payment truth" },
      { system: "Meta", owns: "advertising objects and delivery truth" },
      { system: "GHL", owns: "contacts, opportunities, pipelines, workflows, appointments and GHL-hosted submissions" },
      { system: "DealFlow", owns: "onboarding, orchestration, strategy, copy, creatives, provider jobs, launch authorization, reporting projections, optimization, safety and UX" },
      { system: "Supabase", owns: "DealFlow durable state, receipts, projections, jobs, credits and reconciliation" },
      { system: "Higgsfield", owns: "authoritative video generation" },
    ],
    leadPaths: [
      {
        id: "GHL_HOSTED",
        primary: true,
        flow: ["GHL form submission", "GHL contact/opportunity/workflow", "verified GHL webhook", "DealFlow attribution/projection/reconciliation"],
        duplicateOutboundGhlDeliveryForbidden: true,
      },
      {
        id: "META_INSTANT_FORM",
        primary: false,
        flow: ["Meta form", "verified Meta webhook", "DealFlow persistence/deduplication", "GHL contact/opportunity/workflow", "reporting/reconciliation"],
      },
      {
        id: "DEALFLOW_FALLBACK",
        primary: false,
        flow: ["DealFlow form", "DealFlow persistence/deduplication", "GHL contact/opportunity/workflow", "reporting/reconciliation"],
      },
    ],
    contractStatus: "PASS",
    proofQualification: "Locked architecture contract; runtime outcomes are reported separately and are not inferred from this contract.",
  };
}

function allPass(rows, key = "status") {
  return rows.length > 0 && rows.every((row) => row[key] === "PASS");
}

function assertSanitizedBundle(root) {
  for (const record of inventory(root)) {
    assertSafeArtifact(record.path, readFileSync(record.absolute));
    assertSafeArtifact(`${record.path} path`, Buffer.from(record.path));
  }
}

function seal(root, metadata) {
  assertSanitizedBundle(root);
  const records = inventory(root).filter((record) => !["evidence-manifest.json", "SHA256SUMS"].includes(record.path));
  writeJson(join(root, "evidence-manifest.json"), {
    schemaVersion: "dealflow.current-release-evidence-manifest.v1",
    ...metadata,
    containsSecrets: false,
    containsCustomerData: false,
    staleHistoricalEvidenceIncluded: false,
    files: records.map(({ path, bytes, sha256: hash }) => ({ path, bytes, sha256: hash })),
  });
  assertSanitizedBundle(root);
  const checksumRecords = inventory(root).filter((record) => record.path !== "SHA256SUMS");
  writeFileSync(
    join(root, "SHA256SUMS"),
    `${checksumRecords.map((record) => `${record.sha256}  ${record.path}`).join("\n")}\n`,
    { mode: 0o600, flag: "wx" },
  );
  const finalRecords = inventory(root);
  const declared = new Set(
    readFileSync(join(root, "SHA256SUMS"), "utf8").split(/\r?\n/).filter(Boolean).map((line) => line.slice(66)),
  );
  const expected = finalRecords.map((record) => record.path).filter((path) => path !== "SHA256SUMS");
  if (declared.size !== expected.length || expected.some((path) => !declared.has(path))) {
    fail("Final evidence contains an unhashed artifact");
  }
  enforceModes(root);
  return {
    fileCount: finalRecords.length,
    checksumCount: expected.length,
    sha256sumsSha256: sha256File(join(root, "SHA256SUMS")),
  };
}

function enforceModes(root) {
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) fail(`Final evidence contains a symlink: ${path}`);
    if (stat.isDirectory()) {
      chmodSync(path, 0o700);
      for (const name of readdirSync(path)) visit(join(path, name));
    } else if (stat.isFile()) chmodSync(path, 0o600);
    else fail(`Final evidence contains unsupported filesystem content: ${path}`);
  };
  visit(root);
}

function assertExternal(root, path, label) {
  if (!isAbsolute(path)) fail(`${label} must be absolute`);
  const rootReal = realpathSync(root);
  let existing;
  if (existsSync(path)) {
    existing = realpathSync(path);
  } else {
    let parent = dirname(path);
    while (!existsSync(parent)) {
      const next = dirname(parent);
      if (next === parent) break;
      parent = next;
    }
    existing = resolve(realpathSync(parent), relative(parent, path));
  }
  const relation = relative(rootReal, existing);
  if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")) {
    fail(`${label} must be outside the repository`);
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const root = realpathSync(process.cwd());
  for (const [key, path] of Object.entries(options)) assertExternal(root, path, key);
  if (options.roundOne === options.roundTwo) {
    fail("Every evidence source and the output must be distinct");
  }
  for (const source of [options.roundOne, options.roundTwo, options.staging]) {
    const relation = relative(realpathSync(source), resolve(options.output));
    if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")) {
      fail("Output must not be inside an evidence source");
    }
  }
  if (existsSync(options.output)) fail("Output directory must not already exist");

  const identity = captureRepository(root);
  const migrations = captureMigrations(root);
  const checkpointSnapshot = snapshotFile(
    options.checkpointRecord,
    "release checkpoint record",
  );
  const productionSnapshot = options.productionAttestation
    ? snapshotFile(options.productionAttestation, "production attestation")
    : null;
  const boundRoundOne = validateSnapshottedInput(
    options.roundOne,
    "Verification round one evidence",
    () => validateRound(options.roundOne, "1", identity, migrations),
  );
  const roundOne = boundRoundOne.value;
  const boundRoundTwo = validateSnapshottedInput(
    options.roundTwo,
    "Verification round two evidence",
    () => validateRound(options.roundTwo, "2", identity, migrations),
  );
  const roundTwo = boundRoundTwo.value;
  if (roundOne.summarySha256 === roundTwo.summarySha256) fail("Two distinct final-verification summaries are required");
  const boundStaging = validateSnapshottedInput(
    options.staging,
    "Staging evidence",
    () => validateStaging(options.staging, identity, migrations, roundOne, roundTwo),
  );
  const staging = boundStaging.value;
  const checkpoint = validateCheckpoint(checkpointSnapshot, identity);
  const production = validateProduction(productionSnapshot, identity, migrations);

  const sourceSnapshots = {
    roundOne: boundRoundOne.snapshot,
    roundTwo: boundRoundTwo.snapshot,
    staging: boundStaging.snapshot,
  };
  const stagingGates = staging.derivedGates;
  const capabilities = buildCapabilityMatrix(stagingGates, production);
  const providers = buildProviderMatrix(stagingGates, production);
  const productionMatrix = buildProductionMatrix(production);
  const journeys = buildJourneys(stagingGates);
  // A plain JSON attestation is retained only as operator-provided context. It
  // is not a protected external trust root and can never authorize production.
  const productionGo = false;
  const verdict = productionGo ? "GO" : "NO_GO";
  const temporary = `${options.output}.partial-${process.pid}`;
  if (existsSync(temporary)) fail("Temporary evidence path already exists");

  try {
    mkdirSync(temporary, { recursive: true, mode: 0o700 });
    copyProof(options.roundOne, join(temporary, "proof", "final-verification-round-1"), sourceSnapshots.roundOne);
    copyProof(options.roundTwo, join(temporary, "proof", "final-verification-round-2"), sourceSnapshots.roundTwo);
    copyProof(options.staging, join(temporary, "proof", "staging"), sourceSnapshots.staging);
    mkdirSync(join(temporary, "inputs"), { recursive: true, mode: 0o700 });
    assertFileSnapshotUnchanged(checkpointSnapshot, "Release checkpoint record");
    writeFileSnapshot(
      join(temporary, "inputs", "checkpoint-record.json"),
      checkpointSnapshot,
    );
    if (production) {
      assertFileSnapshotUnchanged(productionSnapshot, "Production attestation");
      writeFileSnapshot(
        join(temporary, "inputs", "production-attestation.json"),
        productionSnapshot,
      );
    }

    const localResults = [roundOne, roundTwo].map((round) => ({
      round: round.summary.round,
      status: "PASS",
      commandCount: round.summary.commandCount,
      passedCount: round.summary.passedCount,
      failedCount: round.summary.failedCount,
      blockedHostedProofCount: round.summary.blockedCount,
      summarySha256: round.summarySha256,
      evidence: `proof/final-verification-round-${round.summary.round}/verification-summary.json`,
    }));
    const issues = [{
      id: "ISSUE-001",
      scope: "PRODUCTION_TRUST",
      status: "NOT_PROVEN",
      severity: "P0",
      blocker:
        "No builder-verified protected cryptographic production trust root was supplied; plain JSON is informational only.",
      evidence: production
        ? "inputs/production-attestation.json (informational, untrusted)"
        : "No production attestation supplied",
    }];
    for (const row of capabilities.filter((item) => item.finalStatus !== "PASS")) {
      issues.push({ id: `ISSUE-${String(issues.length + 1).padStart(3, "0")}`, scope: row.id, status: row.finalStatus, severity: "P1", blocker: `${row.capability}: production proof is ${row.productionProof}`, evidence: row.evidence });
    }
    for (const row of providers.filter((item) => item.productionAcceptance !== "PASS")) {
      issues.push({ id: `ISSUE-${String(issues.length + 1).padStart(3, "0")}`, scope: `PROVIDER:${row.provider}`, status: row.productionAcceptance, severity: "P1", blocker: `${row.provider} production acceptance is ${row.productionAcceptance}`, evidence: row.evidence });
    }
    for (const row of productionMatrix.filter((item) => item.status !== "PASS")) {
      issues.push({ id: `ISSUE-${String(issues.length + 1).padStart(3, "0")}`, scope: "PRODUCTION", status: row.status, severity: "P1", blocker: `${row.gate}: ${row.status}`, evidence: row.evidence });
    }
    const leadArchitecture = buildLeadArchitecture();
    const identities = {
      schemaVersion: "dealflow.current-release-identities.v1",
      source: identity,
      migrations,
      localVerification: localResults,
      staging: {
        identity: staging.summary.identity,
        migrations: staging.summary.migrations,
        deployment: staging.summary.deployment,
        environmentFingerprint: staging.preflight.hostedEnvironmentNameSetSha256,
        schemaDigest: staging.migrationSummary.normalizedSchemaSha256,
      },
      production: production
        ? {
            trust: PRODUCTION_TRUST,
            reportedIdentity: production.identity,
            reportedSchemaDigest: production.schemaDigest,
            reportedEnvironmentFingerprint:
              production.environmentFingerprint ?? "NOT_PROVEN",
            reportedDeployment:
              production.deployment ?? { status: "NOT_PROVEN" },
            reportedFeatureFlags:
              production.featureFlags ?? { status: "NOT_PROVEN" },
          }
        : { trust: PRODUCTION_TRUST, status: "NOT_PROVEN" },
    };
    const snapshot = {
      schemaVersion: "dealflow.current-release.snapshot.v1",
      generatedAt: new Date().toISOString(),
      verdict,
      proofCut: "exact_current_final_source_only",
      statusLegend: {
        PASS: "Required proof passed at the stated proof plane.",
        FAILED: "Proof ran and failed.",
        BLOCKED: "Proof could not run because required external authority or boundary was unavailable.",
        NOT_PROVEN: "No qualifying current proof was supplied.",
        SKIPPED: "Proof was deliberately omitted and is not success.",
      },
      identity: identities,
      checkpoint,
      capabilities,
      systemsOfRecordAndLeadPaths: leadArchitecture,
      localVerification: localResults,
      staging: {
        safeAcceptanceHarnessStatus:
          staging.summary.safeAcceptanceHarnessStatus === "PASS" ? "PASS" : "FAILED",
        mandatoryJourneyStatus: allPass(journeys) ? "PASS" : "NOT_PROVEN",
        verdict: staging.summary.verdict,
        journeys,
        providerMatrix: providers,
      },
      production: {
        attestationSupplied: Boolean(production),
        trust: PRODUCTION_TRUST,
        releaseAuthorized: false,
        reportedReleaseAuthorized: production?.releaseAuthorized === true,
        gates: productionMatrix,
      },
      issueBlockerCount: issues.length,
      confirmation: {
        advertisingSpendIncurred: "NOT_PROVEN",
        advertisingSpendAmount: "NOT_PROVEN",
        realCommunicationsSent: "NOT_PROVEN",
        realCommunicationsCount: "NOT_PROVEN",
        liveStripeMutationPerformed: "NOT_PROVEN",
        realCustomerOrProviderRecordsChanged: "NOT_PROVEN",
      },
      reportedConfirmation: production?.effects ?? { status: "NOT_PROVEN" },
    };

    writeText(join(temporary, "00_EXECUTIVE_VERDICT.md"), `# DealFlow current release verdict\n\n**${verdict}**\n\nThe bundle contains only evidence bound to commit \`${identity.commit}\`, tree \`${identity.tree}\`, and the exact ${migrations.migrationCount}-migration portfolio. ${productionGo ? "Every required production, provider, backup, drain, canary and capability gate is explicitly PASS." : "Production release is not proven. Missing provider or production evidence remains NO_GO and is not relabeled as success."}\n`);
    writeJson(join(temporary, "01_NINE_CAPABILITY_MATRIX.json"), capabilities);
    writeText(join(temporary, "01_NINE_CAPABILITY_MATRIX.md"), `# Nine mandatory capabilities\n\n${markdownTable(capabilities, [["ID", "id"], ["Capability", "capability"], ["Local", "implementationProof"], ["Staging", "stagingProof"], ["Production", "productionProof"], ["Final", "finalStatus"]])}\n`);
    writeJson(join(temporary, "02_FINAL_ISSUE_BLOCKER_LEDGER.json"), issues);
    writeText(join(temporary, "02_FINAL_ISSUE_BLOCKER_LEDGER.md"), `# Final issue and blocker ledger\n\n${issues.length ? markdownTable(issues, [["ID", "id"], ["Scope", "scope"], ["Status", "status"], ["Severity", "severity"], ["Blocker", "blocker"], ["Evidence", "evidence"]]) : "No open issues or blockers."}\n`);
    writeJson(join(temporary, "03_SYSTEMS_OF_RECORD_AND_THREE_LEAD_PATHS.json"), leadArchitecture);
    writeJson(join(temporary, "04_WORKTREE_AND_CHECKPOINT_RECORD.json"), { finalSource: identity, checkpoint });
    writeJson(join(temporary, "05_RELEASE_IDENTITIES.json"), identities);
    writeJson(join(temporary, "06_LOCAL_AND_STAGING_JOURNEYS.json"), { local: localResults, staging: journeys });
    writeText(join(temporary, "06_LOCAL_AND_STAGING_JOURNEYS.md"), `# Local and staging journey results\n\n## Exact local rounds\n\n${markdownTable(localResults, [["Round", "round"], ["Status", "status"], ["Commands", "commandCount"], ["Passed", "passedCount"], ["Failed", "failedCount"], ["Hosted blockers", "blockedHostedProofCount"]])}\n\n## Staging journeys\n\n${markdownTable(journeys, [["ID", "id"], ["Journey", "journey"], ["Status", "status"], ["Evidence", "evidence"]])}\n`);
    writeJson(join(temporary, "07_PROVIDER_MATRIX.json"), providers);
    writeJson(join(temporary, "08_PRODUCTION_BACKUP_DRAIN_CANARY_MATRIX.json"), productionMatrix);
    writeJson(join(temporary, "dealflow-release.snapshot.json"), snapshot);

    assertInputUnchanged(options.roundOne, sourceSnapshots.roundOne, "Verification round one evidence");
    assertInputUnchanged(options.roundTwo, sourceSnapshots.roundTwo, "Verification round two evidence");
    assertInputUnchanged(options.staging, sourceSnapshots.staging, "Staging evidence");
    assertFileSnapshotUnchanged(checkpointSnapshot, "Release checkpoint record");
    if (productionSnapshot) {
      assertFileSnapshotUnchanged(productionSnapshot, "Production attestation");
    }
    const finalIdentity = captureRepository(root);
    if (JSON.stringify(finalIdentity) !== JSON.stringify(identity)) fail("Repository identity changed during bundle assembly");
    assertSanitizedBundle(temporary);
    const sealed = seal(temporary, {
      verdict,
      headCommit: identity.commit,
      headTree: identity.tree,
      migrationCount: migrations.migrationCount,
      migrationPortfolioSha256: migrations.migrationPortfolioSha256,
    });
    renameSync(temporary, options.output);
    process.stdout.write(`${JSON.stringify({ verdict, output: options.output, identity, migrations: { migrationCount: migrations.migrationCount, migrationPortfolioSha256: migrations.migrationPortfolioSha256 }, sealed })}\n`);
  } catch (error) {
    if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

main();
