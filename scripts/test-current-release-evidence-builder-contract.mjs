#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { tmpdir } from "node:os";

import {
  FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
  FINAL_VERIFICATION_HOSTED_DEFERRALS,
  createFinalVerificationCommandPortfolio,
  finalVerificationEvidenceQualification,
} from "./lib/final-verification-command-contract.mjs";
import {
  FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS,
  FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
  assertFinalVerificationEvidenceIsSealable,
} from "./lib/final-verification-evidence-contract.mjs";

const builder = resolve("scripts/build-current-release-evidence.mjs");
const root = mkdtempSync(join(tmpdir(), "dealflow-current-evidence-contract-"));
const repo = join(root, "repo");
const external = join(root, "external");
const resolvedFinalVerificationCommandPortfolio =
  createFinalVerificationCommandPortfolio({
    pgbin: "/fixture/postgresql/17.6/bin",
    host: "/fixture/postgresql/socket",
    port: "55432",
    user: "supabase_admin",
  });

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function writeExactLocalBrowserProof(roundDirectory) {
  const browserRoot = join(roundDirectory, "browser-proof");
  const artifactRoot = join(browserRoot, "artifacts");
  const specs = [];
  const authenticatedResults = [];
  let ordinal = 0;
  for (const projectName of FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS) {
    for (let index = 0; index < 14; index += 1) {
      const skipped = index >= 10;
      const status = skipped ? "skipped" : "passed";
      const attachments = [];
      if (skipped) {
        authenticatedResults.push({
          titlePath: ` > ${projectName} > fixture > authenticated isolated-staging product proof > fixture ${index}`,
          projectName,
          status: "skipped",
          retry: 0,
        });
      } else {
        const screenshotDirectory = join(
          artifactRoot,
          `fixture-${String(ordinal).padStart(2, "0")}-${projectName}`,
        );
        const screenshotPath = join(screenshotDirectory, "test-finished-1.png");
        mkdirSync(screenshotDirectory, { recursive: true, mode: 0o700 });
        writeFileSync(screenshotPath, MINIMAL_PNG, { mode: 0o600 });
        attachments.push({
          name: "screenshot",
          contentType: "image/png",
          path: screenshotPath,
        });
      }
      specs.push({
        title: `fixture ${projectName} ${index}`,
        ok: true,
        tests: [{
          expectedStatus: status,
          projectId: projectName,
          projectName,
          status: skipped ? "skipped" : "expected",
          results: [{ status, retry: 0, errors: [], attachments }],
        }],
      });
      ordinal += 1;
    }
  }
  write(join(browserRoot, "playwright-results.json"), {
    suites: [{ title: "fixture", specs, suites: [] }],
    errors: [],
    stats: { expected: 40, skipped: 16, unexpected: 0, flaky: 0 },
  });
  write(join(browserRoot, "safe-browser-acceptance-summary.json"), {
    schemaVersion: "dealflow.safe-browser-acceptance.v1",
    executionMode: "local_public",
    playwrightStatus: "passed",
    authenticatedStatus: "authenticated_deferred",
    authenticatedResultCount: 16,
    authenticatedSkippedCount: 16,
    authenticatedProjectCounts: Object.fromEntries(
      FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS.map((project) => [project, 4]),
    ),
    authenticatedResults,
  });
  write(join(browserRoot, "safety-preflight.json"), {
    schemaVersion: "dealflow.safe-browser-preflight.v1",
    mode: "local_public",
    zeroExternalEffects: {
      ok: true,
      attestation: "DEALFLOW_ISOLATED_STAGING_QIBH_ZERO_EXTERNAL_EFFECTS_V1",
      checkedControlCount: 60,
      failedControls: [],
    },
    authenticatedStatus: "authenticated_deferred",
    publicTestsAuthorized: true,
    authenticatedTestsAuthorized: false,
  });
  write(join(browserRoot, "playwright-results.xml"), "<testsuites/>\n");
  write(join(browserRoot, "report", "index.html"), "<!doctype html><title>PASS</title>\n");
  write(join(artifactRoot, ".last-run.json"), {
    status: "passed",
    failedTests: [],
  });
}

function rewriteRoundAttachmentPaths(value, roundDirectory) {
  if (Array.isArray(value)) {
    for (const item of value) rewriteRoundAttachmentPaths(item, roundDirectory);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (typeof value.path === "string" && value.path.includes("/browser-proof/artifacts/")) {
    const suffix = value.path.split("/browser-proof/artifacts/")[1];
    value.path = join(roundDirectory, "browser-proof", "artifacts", suffix);
  }
  for (const item of Object.values(value)) {
    rewriteRoundAttachmentPaths(item, roundDirectory);
  }
}

function resealRoundFixture(roundDirectory) {
  const summaryPath = join(roundDirectory, "verification-summary.json");
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  rmSync(summaryPath);
  const resultsPath = join(roundDirectory, "browser-proof", "playwright-results.json");
  const results = JSON.parse(readFileSync(resultsPath, "utf8"));
  rewriteRoundAttachmentPaths(results, roundDirectory);
  write(resultsPath, results);
  const evidence = assertFinalVerificationEvidenceIsSealable(roundDirectory);
  write(summaryPath, {
    ...summary,
    evidenceTreeFileCountBeforeSummary: evidence.fileCountBeforeSummary,
    evidenceTreeSha256BeforeSummary: evidence.evidenceTreeSha256BeforeSummary,
    localBrowserEvidenceStatus: evidence.browser.status,
    localBrowserScreenshotCount: evidence.browser.screenshotCount,
    localBrowserProjectScreenshotCounts: evidence.browser.projectScreenshotCounts,
  });
}

function cloneExactRoundFixture(source, destination) {
  cpSync(source, destination, { recursive: true });
  resealRoundFixture(destination);
}

function playwrightTestRecords(results) {
  const records = [];
  const visit = (suite) => {
    for (const spec of suite?.specs ?? []) {
      for (const test of spec?.tests ?? []) records.push({ spec, test });
    }
    for (const child of suite?.suites ?? []) visit(child);
  };
  for (const suite of results?.suites ?? []) visit(suite);
  return records;
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? repo,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (options.expectFailure) {
    if (result.status === 0) throw new Error(`Expected failure: ${[executable, ...args].join(" ")}`);
    if (options.match && !options.match.test(`${result.stdout}\n${result.stderr}`)) {
      throw new Error(`Failure did not match ${options.match}: ${result.stderr}`);
    }
    return result;
  }
  if (result.status !== 0) throw new Error(`${[executable, ...args].join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}

function git(args) {
  return run("git", args).stdout.trim();
}

function trackedIdentity() {
  const entries = run("git", ["ls-files", "--stage", "-z"]).stdout.split("\0").filter(Boolean).map((entry) => {
    const match = /^(\d{6}) [0-9a-f]{40,64} 0\t([\s\S]+)$/.exec(entry);
    if (!match) throw new Error("bad tracked fixture entry");
    return { mode: match[1], path: match[2] };
  });
  const digest = createHash("sha256");
  for (const entry of entries) {
    const contents = readFileSync(join(repo, entry.path));
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

function migrationIdentity() {
  const names = readdirSync(join(repo, "supabase", "migrations"))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort();
  const digest = createHash("sha256");
  const files = names.map((name) => {
    const contents = readFileSync(join(repo, "supabase", "migrations", name));
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
  for (const file of files.slice(0, -1)) {
    const contents = readFileSync(join(repo, "supabase", "migrations", file.name));
    priorDigest.update(String(Buffer.byteLength(file.name)));
    priorDigest.update("\0");
    priorDigest.update(file.name);
    priorDigest.update("\0");
    priorDigest.update(String(contents.length));
    priorDigest.update("\0");
    priorDigest.update(contents);
    priorDigest.update("\0");
  }
  return {
    migrationCount: files.length,
    finalMigration: files.at(-1).name,
    migrationPortfolioSha256: digest.digest("hex"),
    priorMigrationPortfolioSha256: priorDigest.digest("hex"),
    files,
  };
}

function inventory(directory) {
  const records = [];
  const visit = (path) => {
    for (const name of readdirSync(path).sort()) {
      const absolute = join(path, name);
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else records.push({ path: relative(directory, absolute), absolute, bytes: stat.size, sha256: sha256(readFileSync(absolute)) });
    }
  };
  visit(directory);
  return records;
}

function sealStaging(directory) {
  const records = inventory(directory);
  write(join(directory, "evidence-manifest.json"), {
    schemaVersion: "fixture.v1",
    files: records,
  });
  const checksummed = inventory(directory);
  write(join(directory, "SHA256SUMS"), `${checksummed.map((record) => `${record.sha256}  ${record.path}`).join("\n")}\n`);
}

function cloneStagingBoundToRoundOne(source, destination, roundDirectory) {
  cpSync(source, destination, { recursive: true });
  rmSync(join(destination, "evidence-manifest.json"));
  rmSync(join(destination, "SHA256SUMS"));
  const preflightPath = join(destination, "preflight.json");
  const preflight = JSON.parse(readFileSync(preflightPath, "utf8"));
  preflight.roundOne.sha256 = sha256(
    readFileSync(join(roundDirectory, "verification-summary.json")),
  );
  write(preflightPath, preflight);
  sealStaging(destination);
}

function assertMode(path, expected) {
  const mode = lstatSync(path).mode & 0o777;
  if (mode !== expected) throw new Error(`${path}: expected ${expected.toString(8)}, got ${mode.toString(8)}`);
}

function assertChecksums(output) {
  const lines = readFileSync(join(output, "SHA256SUMS"), "utf8").trim().split("\n");
  const declared = new Set();
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match || sha256(readFileSync(join(output, match[2]))) !== match[1]) throw new Error(`bad output checksum: ${line}`);
    declared.add(match[2]);
  }
  const expected = inventory(output).map((record) => record.path).filter((path) => path !== "SHA256SUMS");
  if (expected.some((path) => !declared.has(path)) || expected.length !== declared.size) throw new Error("unhashed output artifact");
}

function assertSnapshotFirstSourceBindingContract() {
  const source = readFileSync(builder, "utf8");
  const helperStart = source.indexOf("function validateSnapshottedInput(");
  const helperEnd = source.indexOf("\nfunction copyProof(", helperStart);
  if (helperStart < 0 || helperEnd < 0) {
    throw new Error("Release builder lacks the atomic source-binding helper");
  }
  const helper = source.slice(helperStart, helperEnd);
  const snapshotIndex = helper.indexOf("snapshotInput(root)");
  const validationIndex = helper.indexOf("validate()");
  const unchangedIndex = helper.indexOf("assertInputUnchanged(root, snapshot, label)");
  if (
    snapshotIndex < 0 ||
    validationIndex <= snapshotIndex ||
    unchangedIndex <= validationIndex
  ) {
    throw new Error("Release builder must snapshot before validation and immediately prove the source unchanged");
  }
  const mainStart = source.indexOf("function main()");
  const main = source.slice(mainStart);
  if (
    (main.match(/validateSnapshottedInput\(/g) ?? []).length !== 3 ||
    /roundOne:\s*snapshotInput\(|roundTwo:\s*snapshotInput\(|staging:\s*snapshotInput\(/.test(main)
  ) {
    throw new Error("Every recursive evidence source must use the snapshot-first binding contract");
  }
}

try {
  assertSnapshotFirstSourceBindingContract();
  mkdirSync(repo, { recursive: true });
  mkdirSync(external, { recursive: true });
  write(join(repo, "package-lock.json"), { name: "fixture", lockfileVersion: 3, packages: {} });
  write(join(repo, "supabase", "migrations", "20260713027000_prior_fixture.sql"), "select 0;\n");
  write(join(repo, "supabase", "migrations", "20260713028000_harden_account_deletion_retention_authority.sql"), "select 1;\n");
  write(join(repo, "README.md"), "current release fixture\n");
  run("git", ["init", "-b", "codex/dealflow-overnight-release-20260712"]);
  run("git", ["add", "."]);
  run("git", ["-c", "user.name=DealFlow Contract", "-c", "user.email=contract@example.test", "commit", "-m", "fixture"]);

  const tracked = trackedIdentity();
  const identity = {
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    commit: git(["rev-parse", "HEAD"]),
    tree: git(["rev-parse", "HEAD^{tree}"]),
    ...tracked,
    dependencyLockSha256: sha256(readFileSync(join(repo, "package-lock.json"))),
  };
  const migrations = migrationIdentity();
  const records = resolvedFinalVerificationCommandPortfolio.map((command, index) => ({
    command,
    status: "passed",
    exitCode: 0,
    diskFreeBytesBefore: FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
    diskFreeBytesAfter: FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
    fatalResourceDiagnostic: null,
    postCommandDiskHeadroom: "passed",
    evidenceQualification: finalVerificationEvidenceQualification(command),
    postCommandRepositoryInvariant: "passed",
    safeEnvironmentProfile: "provider_credentials_and_application_secrets_omitted",
    workingDirectory: repo,
    headCommit: identity.commit,
    headTree: identity.tree,
    trackedWorktreeSha256: identity.trackedWorktreeSha256,
    trackedFileCount: identity.trackedFileCount,
    dependencyLockSha256: identity.dependencyLockSha256,
    migrationCount: migrations.migrationCount,
    migrationPortfolioSha256: migrations.migrationPortfolioSha256,
    log: `${String(index + 1).padStart(2, "0")}-fixture.log`,
  }));
  const roundSummarySha256 = {};
  for (const round of ["1", "2"]) {
    const roundDirectory = join(external, `round-${round}`);
    writeExactLocalBrowserProof(roundDirectory);
    for (const record of records) {
      write(
        join(roundDirectory, record.log),
        `command: ${record.command}\nrecord_exit_code: 0\nfixture_round: ${round}\n`,
      );
    }
    const evidence = assertFinalVerificationEvidenceIsSealable(roundDirectory);
    write(join(roundDirectory, "verification-summary.json"), {
      schemaVersion: "dealflow.final-verification.v3",
      round,
      runtime: "v24.15.0",
      headCommit: identity.commit,
      headTree: identity.tree,
      trackedWorktreeSha256: identity.trackedWorktreeSha256,
      trackedFileCount: identity.trackedFileCount,
      dependencyLockSha256: identity.dependencyLockSha256,
      ...migrations,
      repositoryInvariant: "passed",
      plannedCommandCount: records.length,
      commandCount: records.length,
      passedCount: records.length,
      commandPortfolioSha256: FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
      resolvedCommandPortfolioSha256: sha256(
        JSON.stringify(resolvedFinalVerificationCommandPortfolio),
      ),
      minimumFreeBytesRequired: FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
      minimumObservedFreeBytes: FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
      fatalResourceDiagnosticCount: 0,
      evidenceTreeStatus: evidence.status,
      evidenceTreeFileCountBeforeSummary: evidence.fileCountBeforeSummary,
      evidenceTreeSha256BeforeSummary: evidence.evidenceTreeSha256BeforeSummary,
      localBrowserEvidenceStatus: evidence.browser.status,
      localBrowserScreenshotCount: evidence.browser.screenshotCount,
      localBrowserProjectScreenshotCounts: evidence.browser.projectScreenshotCounts,
      failedCount: 0,
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
      records,
      uniqueRoundEvidence: round,
    });
    roundSummarySha256[round] = sha256(
      readFileSync(join(roundDirectory, "verification-summary.json")),
    );
  }

  const stagingGates = {
    exactCandidateAndSchema: "PASS",
    syntheticRetentionOwnerAuthority: "PASS",
    isolatedHostedDeployment: "PASS",
    tenSyntheticRoleFixtures: "PASS",
    authenticatedDirectEntitlementBoundaries: "PASS",
    twoWhiteLabelHostsBrandingAndChildTenantIsolation: "PASS",
    crossTenantBrowserBoundary: "PASS",
    authenticatedRlsFixtureAndCleanup: "PASS",
    zeroExternalEffects: "PASS",
    readOnlyHostedLoad: "PASS",
    workerExecutionRetryReplayDeadLetterAndCrashRecovery: "PASS",
    operatorDebtAndRecoveryJourneys: "PASS",
    realSyntheticLeadCapturePersistenceAndDuplicateReplay: "PASS",
    supportInternalNonDeliveringInboxLifecycle: "PASS",
    reportingFreshStaleAndFailedRefreshStateHandling: "PASS",
    billingCancellationStaleEventReactivationAndReplayProjection: "PASS",
    accountDeletionRequestSuspensionAndDisabledWorkerBoundary: "PASS",
    ghlSandboxProvisioningFunnelsAndLeadDelivery:
      "BLOCKED_EXTERNAL_PROVIDER_AUTHORITY",
    metaSandboxLaunchLeadgenReportingAndOptimization:
      "BLOCKED_EXTERNAL_PROVIDER_AUTHORITY",
    stripeTestCheckoutAndSignedWebhook:
      "BLOCKED_EXTERNAL_PROVIDER_AUTHORITY",
    creativeProviderGenerationAndPersistence:
      "BLOCKED_EXTERNAL_PROVIDER_AND_PAID_ACTION_AUTHORITY",
    twilioTestTransportAndConsentLifecycle:
      "BLOCKED_EXTERNAL_PROVIDER_AND_COMMUNICATION_AUTHORITY",
    accountDeletionProviderOffboardingCompletion:
      "BLOCKED_EXTERNAL_PROVIDER_AUTHORITY",
    liveMetaReportingReconciliation: "BLOCKED_EXTERNAL_PROVIDER_AUTHORITY",
  };
  const staging = join(external, "staging");
  write(join(staging, "FINAL_SUMMARY.json"), {
    schemaVersion: "dealflow.isolated-staging-acceptance-summary.v1",
    status: "NO_GO",
    safeAcceptanceHarnessStatus: "PASS",
    verdict: "NO_GO_PRODUCTION_ACCEPTANCE_NOT_PROVEN",
    identity,
    migrations,
    deployment: { deploymentId: "dpl_fixture_staging", status: "READY" },
    productionGateMatrix: stagingGates,
    productionMutationPerformed: false,
    providerMutationPerformed: false,
    advertisingSpendIncurred: false,
    realCommunicationSent: false,
  });
  write(join(staging, "preflight.json"), {
    status: "PASS",
    identity,
    migrations,
    hostedEnvironmentNameSetSha256: sha256("fixture environment names"),
    roundOne: { sha256: roundSummarySha256["1"] },
    roundTwo: { sha256: roundSummarySha256["2"] },
  });
  write(join(staging, "production-gate-matrix.json"), {
    status: "NO_GO",
    productionGateMatrix: stagingGates,
  });
  write(join(staging, "screenshots", "dashboard.png"), Buffer.from([137, 80, 78, 71, 1, 2, 3]));
  write(join(staging, "migration-proof", "staging-migration-summary.json"), {
    status: "PASS",
    remoteMutationStarted: true,
    remoteMutationCompleted: true,
    headCommit: identity.commit,
    headTree: identity.tree,
    trackedWorktreeSha256: identity.trackedWorktreeSha256,
    migrationCount: migrations.migrationCount,
    migrationPortfolioSha256: migrations.migrationPortfolioSha256,
    normalizedSchemaSha256: sha256("normalized staging schema"),
  });
  write(join(staging, "migration-proof", "staging-migration-proof.json"), {
    status: "PASS",
    headCommit: identity.commit,
    headTree: identity.tree,
    trackedWorktreeSha256: identity.trackedWorktreeSha256,
    trackedFileCount: identity.trackedFileCount,
    dependencyLockSha256: identity.dependencyLockSha256,
    migrationCount: migrations.migrationCount,
    migrationPortfolioSha256: migrations.migrationPortfolioSha256,
    normalizedSchemaSha256: sha256("normalized staging schema"),
  });
  write(join(staging, "browser-summary.json"), {
    status: "PASS",
    localizedPublicAndAuthenticatedJourneys: true,
    reducedMotionKeyboardZoomAndAxe: true,
  });
  sealStaging(staging);

  const checkpointPath = join(external, "checkpoint.json");
  write(checkpointPath, {
    schemaVersion: "dealflow.release-checkpoint.v1",
    status: "PASS",
    checkpoint: {
      status: "PASS",
      commit: identity.commit,
      tree: identity.tree,
      bundleSha256: sha256("fixture checkpoint bundle"),
    },
    finalSource: identity,
  });

  const output = join(external, "no-go-bundle");
  run(process.execPath, [
    builder,
    "--round-one", join(external, "round-1"),
    "--round-two", join(external, "round-2"),
    "--staging", staging,
    "--checkpoint-record", checkpointPath,
    "--output", output,
  ]);
  const snapshot = JSON.parse(readFileSync(join(output, "dealflow-release.snapshot.json"), "utf8"));
  if (snapshot.verdict !== "NO_GO" || snapshot.capabilities.length !== 9 || snapshot.staging.journeys.length !== 35) {
    throw new Error("NO_GO snapshot is incomplete or incorrectly classified");
  }
  if (snapshot.systemsOfRecordAndLeadPaths.leadPaths.length !== 3 || snapshot.staging.providerMatrix.length !== 6 || snapshot.production.gates.length !== 9) {
    throw new Error("systems/provider/production matrices are incomplete");
  }
  if (
    snapshot.staging.providerMatrix.find((row) => row.provider === "GHL")
      ?.stagingAcceptance !== "BLOCKED" ||
    snapshot.capabilities.find((row) => row.id === "CAP-01")?.stagingProof !==
      "BLOCKED" ||
    snapshot.capabilities.find((row) => row.id === "CAP-07")?.stagingProof !==
      "PASS"
  ) {
    throw new Error("Current runner BLOCKED_* statuses or derived gates were not normalized exactly");
  }
  assertChecksums(output);
  assertMode(output, 0o700);
  for (const record of inventory(output)) assertMode(record.absolute, 0o600);

  const resumedStaging = join(external, "resumed-staging");
  cpSync(staging, resumedStaging, { recursive: true });
  rmSync(join(resumedStaging, "evidence-manifest.json"));
  rmSync(join(resumedStaging, "SHA256SUMS"));
  const priorApplication = {
    manifestSha256: sha256("sealed prior atomic application manifest"),
    migrationPortfolioSha256: migrations.migrationPortfolioSha256,
    normalizedSchemaSha256: sha256("normalized staging schema"),
    remoteMutationCompleted: true,
  };
  const resumedMigrationSummaryPath = join(
    resumedStaging,
    "migration-proof",
    "staging-migration-summary.json",
  );
  const resumedMigrationSummary = JSON.parse(
    readFileSync(resumedMigrationSummaryPath, "utf8"),
  );
  write(resumedMigrationSummaryPath, {
    ...resumedMigrationSummary,
    migrationMode: "VERIFY_EXISTING_EXACT",
    verificationReadOnly: true,
    remoteMutationStarted: false,
    remoteMutationCompleted: false,
    portfolioApplicationRemoteMutationCompleted: true,
    remoteStateVerificationStatus: "EXACT_EXISTING_COMMITTED_PORTFOLIO",
    priorApplication,
  });
  const resumedMigrationProofPath = join(
    resumedStaging,
    "migration-proof",
    "staging-migration-proof.json",
  );
  const resumedMigrationProof = JSON.parse(readFileSync(resumedMigrationProofPath, "utf8"));
  write(resumedMigrationProofPath, {
    ...resumedMigrationProof,
    migrationMode: "VERIFY_EXISTING_EXACT",
    verificationReadOnly: true,
    remoteMutationStarted: false,
    remoteMutationCompleted: false,
    portfolioApplicationRemoteMutationCompleted: true,
    remoteStateVerification: { status: "EXACT_EXISTING_COMMITTED_PORTFOLIO" },
    priorApplication,
  });
  sealStaging(resumedStaging);
  const resumedOutput = join(external, "resumed-no-go-bundle");
  run(process.execPath, [
    builder,
    "--round-one", join(external, "round-1"),
    "--round-two", join(external, "round-2"),
    "--staging", resumedStaging,
    "--checkpoint-record", checkpointPath,
    "--output", resumedOutput,
  ]);
  const resumedSnapshot = JSON.parse(
    readFileSync(join(resumedOutput, "dealflow-release.snapshot.json"), "utf8"),
  );
  if (resumedSnapshot.verdict !== "NO_GO") {
    throw new Error("Read-only exact existing migration verification was not accepted");
  }
  assertChecksums(resumedOutput);

  const forwardStaging = join(external, "forward-staging");
  cpSync(staging, forwardStaging, { recursive: true });
  rmSync(join(forwardStaging, "evidence-manifest.json"));
  rmSync(join(forwardStaging, "SHA256SUMS"));
  const priorMigration = migrations.files.at(0);
  const forwardMigration = migrations.files.at(-1);
  const forwardPriorApplication = {
    manifestSha256: sha256("sealed exact prior migration application"),
    migrationPortfolioSha256: migrations.priorMigrationPortfolioSha256,
    normalizedSchemaSha256: sha256("normalized prior staging schema"),
    remoteMutationCompleted: true,
    migrationCount: migrations.migrationCount - 1,
    migrationFiles: [{
      version: priorMigration.name.slice(0, 14),
      file: priorMigration.name,
      sha256: priorMigration.sha256,
    }],
  };
  const exactForwardMigration = {
    version: forwardMigration.name.slice(0, 14),
    file: forwardMigration.name,
    sha256: forwardMigration.sha256,
  };
  const forwardSummaryPath = join(
    forwardStaging,
    "migration-proof",
    "staging-migration-summary.json",
  );
  const forwardSummary = JSON.parse(readFileSync(forwardSummaryPath, "utf8"));
  write(forwardSummaryPath, {
    ...forwardSummary,
    migrationMode: "APPLY_FORWARD_EXACT",
    forwardOnly: true,
    priorMigrationCount: migrations.migrationCount - 1,
    forwardMigrationCount: 1,
    forwardMigration: exactForwardMigration,
    remoteMutationStarted: true,
    remoteMutationCompleted: true,
    portfolioApplicationRemoteMutationCompleted: true,
    remoteStateVerificationStatus: "EXACT_FORWARD_COMMITTED_PORTFOLIO",
    priorApplication: forwardPriorApplication,
  });
  const forwardProofPath = join(
    forwardStaging,
    "migration-proof",
    "staging-migration-proof.json",
  );
  const forwardProof = JSON.parse(readFileSync(forwardProofPath, "utf8"));
  write(forwardProofPath, {
    ...forwardProof,
    migrationMode: "APPLY_FORWARD_EXACT",
    forwardOnly: true,
    priorMigrationCount: migrations.migrationCount - 1,
    forwardMigrationCount: 1,
    forwardMigration: exactForwardMigration,
    remoteMutationStarted: true,
    remoteMutationCompleted: true,
    portfolioApplicationRemoteMutationCompleted: true,
    remoteStateVerification: { status: "EXACT_FORWARD_COMMITTED_PORTFOLIO" },
    priorApplication: forwardPriorApplication,
    applied: [exactForwardMigration],
  });
  sealStaging(forwardStaging);
  const forwardOutput = join(external, "forward-no-go-bundle");
  run(process.execPath, [
    builder,
    "--round-one", join(external, "round-1"),
    "--round-two", join(external, "round-2"),
    "--staging", forwardStaging,
    "--checkpoint-record", checkpointPath,
    "--output", forwardOutput,
  ]);
  const forwardSnapshot = JSON.parse(
    readFileSync(join(forwardOutput, "dealflow-release.snapshot.json"), "utf8"),
  );
  if (forwardSnapshot.verdict !== "NO_GO") {
    throw new Error("Exact forward-only migration application was not accepted");
  }
  assertChecksums(forwardOutput);

  const productionPath = join(external, "production.json");
  write(productionPath, {
    schemaVersion: "dealflow.production-release-attestation.v1",
    status: "PASS",
    releaseAuthorized: true,
    cryptographicallyProtectedTrustVerified: true,
    builderVerifiedTrust: true,
    identity,
    migrations,
    schemaDigest: sha256("normalized staging schema"),
    environmentFingerprint: sha256("production environment names and value digests"),
    deployment: { deploymentId: "dpl_fixture_production", status: "READY", aliasStatus: "PASS" },
    featureFlags: { ghlAutomaticProvisioning: true, metaAutomaticActivation: true },
    productionGateMatrix: Object.fromEntries([
      "exactCandidateDeployment",
      "exactProductionSchema",
      "environmentAttestation",
      "backupAndRecovery",
      "workerDrain",
      "providerActivation",
      "productionCanary",
      "aliasesAndDns",
      "monitoringAndRollback",
    ].map((key) => [key, "PASS"])),
    providerMatrix: Object.fromEntries(["GHL", "Meta", "Stripe", "Higgsfield/creative", "Twilio", "Support delivery"].map((key) => [key, "PASS"])),
    capabilityMatrix: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`CAP-${String(index + 1).padStart(2, "0")}`, "PASS"])),
    effects: {
      advertisingSpendIncurred: false,
      advertisingSpendAmount: 0,
      realCommunicationsSent: false,
      realCommunicationsCount: 0,
      liveStripeMutationPerformed: false,
      realCustomerOrProviderRecordsChanged: false,
    },
  });
  const fabricatedPassOutput = join(external, "fabricated-pass-bundle");
  run(process.execPath, [
    builder,
    "--round-one", join(external, "round-1"),
    "--round-two", join(external, "round-2"),
    "--staging", staging,
    "--checkpoint-record", checkpointPath,
    "--production-attestation", productionPath,
    "--output", fabricatedPassOutput,
  ]);
  const fabricatedPassSnapshot = JSON.parse(
    readFileSync(join(fabricatedPassOutput, "dealflow-release.snapshot.json"), "utf8"),
  );
  if (
    fabricatedPassSnapshot.verdict !== "NO_GO" ||
    fabricatedPassSnapshot.production.releaseAuthorized !== false ||
    fabricatedPassSnapshot.production.reportedReleaseAuthorized !== true ||
    fabricatedPassSnapshot.production.trust.cryptographicallyProtectedTrustVerified !== false ||
    fabricatedPassSnapshot.capabilities.some((row) => row.productionProof !== "NOT_PROVEN") ||
    fabricatedPassSnapshot.capabilities.some((row) => row.reportedProductionProof !== "PASS") ||
    fabricatedPassSnapshot.staging.providerMatrix.some((row) => row.productionAcceptance !== "NOT_PROVEN") ||
    fabricatedPassSnapshot.staging.providerMatrix.some((row) => row.reportedProductionAcceptance !== "PASS") ||
    fabricatedPassSnapshot.production.gates.some((row) => row.status !== "NOT_PROVEN") ||
    fabricatedPassSnapshot.production.gates.some((row) => row.reportedStatus !== "PASS") ||
    fabricatedPassSnapshot.confirmation.advertisingSpendIncurred !== "NOT_PROVEN" ||
    fabricatedPassSnapshot.reportedConfirmation.advertisingSpendIncurred !== false
  ) {
    throw new Error("Caller-authored all-PASS production JSON was incorrectly trusted");
  }
  const fabricatedIssues = JSON.parse(
    readFileSync(
      join(fabricatedPassOutput, "02_FINAL_ISSUE_BLOCKER_LEDGER.json"),
      "utf8",
    ),
  );
  if (!fabricatedIssues.some((issue) => issue.scope === "PRODUCTION_TRUST" && issue.severity === "P0")) {
    throw new Error("Untrusted production attestation lacks its P0 trust blocker");
  }
  assertChecksums(fabricatedPassOutput);

  const secretCheckpointPath = join(external, "secret-checkpoint.json");
  write(secretCheckpointPath, {
    ...JSON.parse(readFileSync(checkpointPath, "utf8")),
    extra: "Authorization: Bearer synthetic-but-secret-shaped-token-123456",
  });
  run(process.execPath, [builder, "--round-one", join(external, "round-1"), "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", secretCheckpointPath, "--output", join(external, "must-not-exist-secret-checkpoint")], {
    expectFailure: true,
    match: /Probable secret rejected/,
  });

  const customerProductionPath = join(external, "customer-production.json");
  write(customerProductionPath, {
    ...JSON.parse(readFileSync(productionPath, "utf8")),
    customerEmail: "real.person@private-domain.com",
  });
  run(process.execPath, [builder, "--round-one", join(external, "round-1"), "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--production-attestation", customerProductionPath, "--output", join(external, "must-not-exist-customer-production")], {
    expectFailure: true,
    match: /Probable customer data rejected/,
  });

  const protectedProductionPath = join(external, "protected-production.json");
  write(protectedProductionPath, {
    ...JSON.parse(readFileSync(productionPath, "utf8")),
    projectRef: "abcdefghijklmnopqrst",
  });
  run(process.execPath, [builder, "--round-one", join(external, "round-1"), "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--production-attestation", protectedProductionPath, "--output", join(external, "must-not-exist-protected-production")], {
    expectFailure: true,
    match: /Full protected identifier rejected/,
  });

  const incompleteGateStaging = join(external, "incomplete-gate-staging");
  cpSync(staging, incompleteGateStaging, { recursive: true });
  rmSync(join(incompleteGateStaging, "evidence-manifest.json"));
  rmSync(join(incompleteGateStaging, "SHA256SUMS"));
  const incompleteGateSummaryPath = join(incompleteGateStaging, "FINAL_SUMMARY.json");
  const incompleteGateSummary = JSON.parse(readFileSync(incompleteGateSummaryPath, "utf8"));
  delete incompleteGateSummary.productionGateMatrix.liveMetaReportingReconciliation;
  write(incompleteGateSummaryPath, incompleteGateSummary);
  const incompleteGateMatrixPath = join(incompleteGateStaging, "production-gate-matrix.json");
  const incompleteGateMatrix = JSON.parse(readFileSync(incompleteGateMatrixPath, "utf8"));
  delete incompleteGateMatrix.productionGateMatrix.liveMetaReportingReconciliation;
  write(incompleteGateMatrixPath, incompleteGateMatrix);
  sealStaging(incompleteGateStaging);
  run(process.execPath, [builder, "--round-one", join(external, "round-1"), "--round-two", join(external, "round-2"), "--staging", incompleteGateStaging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-incomplete-gates")], {
    expectFailure: true,
    match: /lacks current runner gate liveMetaReportingReconciliation/,
  });

  const tamperedPortfolioRound = join(external, "tampered-portfolio-round");
  cloneExactRoundFixture(join(external, "round-1"), tamperedPortfolioRound);
  const tamperedPortfolio = JSON.parse(
    readFileSync(join(tamperedPortfolioRound, "verification-summary.json"), "utf8"),
  );
  [tamperedPortfolio.records[4], tamperedPortfolio.records[5]] = [
    tamperedPortfolio.records[5],
    tamperedPortfolio.records[4],
  ];
  writeFileSync(
    join(tamperedPortfolioRound, "verification-summary.json"),
    `${JSON.stringify(tamperedPortfolio, null, 2)}\n`,
  );
  run(process.execPath, [builder, "--round-one", tamperedPortfolioRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-command-portfolio")], {
    expectFailure: true,
    match: /does not match the exact final-verification command contract/,
  });

  const differentRuntimeRound = join(external, "different-runtime-round");
  cloneExactRoundFixture(join(external, "round-2"), differentRuntimeRound);
  const differentRuntimeSummaryPath = join(
    differentRuntimeRound,
    "verification-summary.json",
  );
  const differentRuntimeSummary = JSON.parse(
    readFileSync(differentRuntimeSummaryPath, "utf8"),
  );
  const differentRuntimeRecord = differentRuntimeSummary.records[45];
  const originalRuntimeCommand = differentRuntimeRecord.command;
  differentRuntimeRecord.command = originalRuntimeCommand.replace(
    "--port 55432",
    "--port 55433",
  );
  assert.notEqual(differentRuntimeRecord.command, originalRuntimeCommand);
  const differentRuntimeLogPath = join(
    differentRuntimeRound,
    differentRuntimeRecord.log,
  );
  writeFileSync(
    differentRuntimeLogPath,
    readFileSync(differentRuntimeLogPath, "utf8").replace(
      originalRuntimeCommand,
      differentRuntimeRecord.command,
    ),
  );
  differentRuntimeSummary.resolvedCommandPortfolioSha256 = sha256(
    JSON.stringify(
      differentRuntimeSummary.records.map((record) => record.command),
    ),
  );
  rmSync(differentRuntimeSummaryPath);
  const differentRuntimeEvidence =
    assertFinalVerificationEvidenceIsSealable(differentRuntimeRound);
  differentRuntimeSummary.evidenceTreeStatus = differentRuntimeEvidence.status;
  differentRuntimeSummary.evidenceTreeFileCountBeforeSummary =
    differentRuntimeEvidence.fileCountBeforeSummary;
  differentRuntimeSummary.evidenceTreeSha256BeforeSummary =
    differentRuntimeEvidence.evidenceTreeSha256BeforeSummary;
  write(differentRuntimeSummaryPath, differentRuntimeSummary);
  run(process.execPath, [builder, "--round-one", join(external, "round-1"), "--round-two", differentRuntimeRound, "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-different-runtime")], {
    expectFailure: true,
    match: /different resolved command portfolios/,
  });

  const mismatchRound = join(external, "mismatch-round");
  cloneExactRoundFixture(join(external, "round-1"), mismatchRound);
  const mismatch = JSON.parse(readFileSync(join(mismatchRound, "verification-summary.json"), "utf8"));
  mismatch.headTree = "0".repeat(40);
  mismatch.records = mismatch.records.map((record) => ({
    ...record,
    headTree: mismatch.headTree,
  }));
  writeFileSync(join(mismatchRound, "verification-summary.json"), `${JSON.stringify(mismatch, null, 2)}\n`);
  run(process.execPath, [builder, "--round-one", mismatchRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-identity")], {
    expectFailure: true,
    match: /does not match the exact current source/,
  });

  const missingScreenshotRound = join(external, "missing-screenshot-round");
  cloneExactRoundFixture(join(external, "round-1"), missingScreenshotRound);
  const missingScreenshotResults = JSON.parse(
    readFileSync(
      join(missingScreenshotRound, "browser-proof", "playwright-results.json"),
      "utf8",
    ),
  );
  const missingScreenshotPath = playwrightTestRecords(missingScreenshotResults)
    .find(({ test }) => test.expectedStatus === "passed")
    .test.results[0].attachments[0].path;
  rmSync(missingScreenshotPath);
  run(process.execPath, [builder, "--round-one", missingScreenshotRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-missing-screenshot")], {
    expectFailure: true,
    match: /ENOENT|screenshot|evidence/,
  });

  const emptyScreenshotRound = join(external, "empty-screenshot-round");
  cloneExactRoundFixture(join(external, "round-1"), emptyScreenshotRound);
  const emptyScreenshotResults = JSON.parse(
    readFileSync(
      join(emptyScreenshotRound, "browser-proof", "playwright-results.json"),
      "utf8",
    ),
  );
  const emptyScreenshotPath = playwrightTestRecords(emptyScreenshotResults)
    .find(({ test }) => test.expectedStatus === "passed")
    .test.results[0].attachments[0].path;
  writeFileSync(emptyScreenshotPath, "");
  run(process.execPath, [builder, "--round-one", emptyScreenshotRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-empty-screenshot")], {
    expectFailure: true,
    match: /empty file|nonempty/,
  });

  const duplicateScreenshotRound = join(external, "duplicate-screenshot-round");
  cloneExactRoundFixture(join(external, "round-1"), duplicateScreenshotRound);
  const duplicateResultsPath = join(
    duplicateScreenshotRound,
    "browser-proof",
    "playwright-results.json",
  );
  const duplicateResults = JSON.parse(readFileSync(duplicateResultsPath, "utf8"));
  const passingDuplicateRecords = playwrightTestRecords(duplicateResults).filter(
    ({ test }) => test.expectedStatus === "passed",
  );
  passingDuplicateRecords[1].test.results[0].attachments[0].path =
    passingDuplicateRecords[0].test.results[0].attachments[0].path;
  write(duplicateResultsPath, duplicateResults);
  run(process.execPath, [builder, "--round-one", duplicateScreenshotRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-duplicate-screenshot")], {
    expectFailure: true,
    match: /unique nonempty PNG|screenshot portfolio/,
  });

  const wrongProjectRound = join(external, "wrong-project-round");
  cloneExactRoundFixture(join(external, "round-1"), wrongProjectRound);
  const wrongProjectResultsPath = join(
    wrongProjectRound,
    "browser-proof",
    "playwright-results.json",
  );
  const wrongProjectResults = JSON.parse(readFileSync(wrongProjectResultsPath, "utf8"));
  playwrightTestRecords(wrongProjectResults)[0].test.projectName = "wrong-project";
  write(wrongProjectResultsPath, wrongProjectResults);
  run(process.execPath, [builder, "--round-one", wrongProjectRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-wrong-project")], {
    expectFailure: true,
    match: /test result is not exact/,
  });

  const unreferencedScreenshotRound = join(external, "unreferenced-screenshot-round");
  cloneExactRoundFixture(join(external, "round-1"), unreferencedScreenshotRound);
  writeFileSync(
    join(
      unreferencedScreenshotRound,
      "browser-proof",
      "artifacts",
      "unreferenced.png",
    ),
    MINIMAL_PNG,
    { mode: 0o600 },
  );
  run(process.execPath, [builder, "--round-one", unreferencedScreenshotRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-unreferenced-screenshot")], {
    expectFailure: true,
    match: /exact 40-file set/,
  });

  const postSummaryTamperRound = join(external, "post-summary-tamper-round");
  cloneExactRoundFixture(join(external, "round-1"), postSummaryTamperRound);
  writeFileSync(
    join(postSummaryTamperRound, records[0].log),
    "tampered after summary\n",
  );
  run(process.execPath, [builder, "--round-one", postSummaryTamperRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-post-summary-tamper")], {
    expectFailure: true,
    match: /not a complete exact-seal local pass/,
  });

  const concurrentTamperRound = join(external, "concurrent-tamper-round");
  cloneExactRoundFixture(join(external, "round-1"), concurrentTamperRound);
  const concurrentFillerPath = join(concurrentTamperRound, "concurrent-snapshot-filler.txt");
  writeFileSync(concurrentFillerPath, Buffer.alloc(64 * 1024 * 1024, 120));
  resealRoundFixture(concurrentTamperRound);
  const concurrentTamperStaging = join(external, "concurrent-tamper-staging");
  cloneStagingBoundToRoundOne(staging, concurrentTamperStaging, concurrentTamperRound);
  const concurrentTarget = join(concurrentTamperRound, records[0].log);
  const mutator = spawn(
    process.execPath,
    [
      "-e",
      "const { appendFileSync } = require('node:fs'); setTimeout(() => appendFileSync(process.argv[1], '\\nconcurrent-tamper\\n'), 25);",
      concurrentTarget,
    ],
    { stdio: "ignore" },
  );
  try {
    run(process.execPath, [builder, "--round-one", concurrentTamperRound, "--round-two", join(external, "round-2"), "--staging", concurrentTamperStaging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-concurrent-tamper")], {
      expectFailure: true,
      match: /changed while the release bundle was being assembled|not a complete exact-seal local pass|Copied evidence changed/,
    });
    if (!readFileSync(concurrentTarget, "utf8").includes("concurrent-tamper")) {
      throw new Error("Concurrent evidence mutator did not execute during the builder run");
    }
  } finally {
    mutator.kill("SIGTERM");
  }

  const unhashedStaging = join(external, "unhashed-staging");
  cpSync(staging, unhashedStaging, { recursive: true });
  write(join(unhashedStaging, "unhashed.json"), { status: "PASS" });
  run(process.execPath, [builder, "--round-one", join(external, "round-1"), "--round-two", join(external, "round-2"), "--staging", unhashedStaging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-unhashed")], {
    expectFailure: true,
    match: /unhashed or missing-checksum artifact/,
  });

  const secretRound = join(external, "secret-round");
  cloneExactRoundFixture(join(external, "round-1"), secretRound);
  write(
    join(secretRound, records[0].log),
    "Authorization: Bearer synthetic-but-secret-shaped-token-123456\n",
  );
  resealRoundFixture(secretRound);
  const secretRoundStaging = join(external, "secret-round-staging");
  cloneStagingBoundToRoundOne(staging, secretRoundStaging, secretRound);
  run(process.execPath, [builder, "--round-one", secretRound, "--round-two", join(external, "round-2"), "--staging", secretRoundStaging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-secret")], {
    expectFailure: true,
    match: /Probable secret rejected/,
  });

  const customerRound = join(external, "customer-round");
  cloneExactRoundFixture(join(external, "round-1"), customerRound);
  write(
    join(customerRound, records[0].log),
    "customerEmail=real.person@private-domain.com\n",
  );
  resealRoundFixture(customerRound);
  const customerRoundStaging = join(external, "customer-round-staging");
  cloneStagingBoundToRoundOne(staging, customerRoundStaging, customerRound);
  run(process.execPath, [builder, "--round-one", customerRound, "--round-two", join(external, "round-2"), "--staging", customerRoundStaging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-customer")], {
    expectFailure: true,
    match: /Probable customer data rejected/,
  });

  const protectedRefRound = join(external, "protected-ref-round");
  cloneExactRoundFixture(join(external, "round-1"), protectedRefRound);
  write(
    join(protectedRefRound, records[0].log),
    "projectRef=abcdefghijklmnopqrst\n",
  );
  resealRoundFixture(protectedRefRound);
  const protectedRefRoundStaging = join(external, "protected-ref-round-staging");
  cloneStagingBoundToRoundOne(
    staging,
    protectedRefRoundStaging,
    protectedRefRound,
  );
  run(process.execPath, [builder, "--round-one", protectedRefRound, "--round-two", join(external, "round-2"), "--staging", protectedRefRoundStaging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-protected-ref")], {
    expectFailure: true,
    match: /Full protected identifier rejected/,
  });

  const emptyRound = join(external, "empty-round");
  cloneExactRoundFixture(join(external, "round-1"), emptyRound);
  writeFileSync(join(emptyRound, "empty.txt"), "");
  run(process.execPath, [builder, "--round-one", emptyRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-empty")], {
    expectFailure: true,
    match: /empty file/,
  });

  const symlinkRound = join(external, "symlink-round");
  cloneExactRoundFixture(join(external, "round-1"), symlinkRound);
  symlinkSync("verification-summary.json", join(symlinkRound, "linked-summary.json"));
  run(process.execPath, [builder, "--round-one", symlinkRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-symlink")], {
    expectFailure: true,
    match: /symlink/,
  });

  process.stdout.write("current release evidence builder contract: PASS (fail-closed production trust, snapshot-first atomic source binding, current runner-shaped gates and blockers, fresh/resumed/forward migration modes, exact identity and schema binding, recursive sanitized proof copy, complete matrices, private modes, manifest/checksums, and adversarial concurrent-tamper/drift/unhashed/secret/customer/protected-ref/empty/symlink tests)\n");
} finally {
  rmSync(root, { recursive: true, force: true });
}
