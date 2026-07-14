#!/usr/bin/env node

import { spawnSync } from "node:child_process";
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
  FINAL_VERIFICATION_COMMAND_PORTFOLIO,
  FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
  FINAL_VERIFICATION_HOSTED_DEFERRALS,
  finalVerificationEvidenceQualification,
} from "./lib/final-verification-command-contract.mjs";

const builder = resolve("scripts/build-current-release-evidence.mjs");
const root = mkdtempSync(join(tmpdir(), "dealflow-current-evidence-contract-"));
const repo = join(root, "repo");
const external = join(root, "external");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
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
  const name = "20260713028000_harden_account_deletion_retention_authority.sql";
  const contents = readFileSync(join(repo, "supabase", "migrations", name));
  const digest = createHash("sha256");
  digest.update(String(Buffer.byteLength(name)));
  digest.update("\0");
  digest.update(name);
  digest.update("\0");
  digest.update(String(contents.length));
  digest.update("\0");
  digest.update(contents);
  digest.update("\0");
  return { migrationCount: 1, finalMigration: name, migrationPortfolioSha256: digest.digest("hex") };
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

try {
  mkdirSync(repo, { recursive: true });
  mkdirSync(external, { recursive: true });
  write(join(repo, "package-lock.json"), { name: "fixture", lockfileVersion: 3, packages: {} });
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
  const records = FINAL_VERIFICATION_COMMAND_PORTFOLIO.map((command, index) => ({
    command,
    status: "passed",
    exitCode: 0,
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
    write(join(external, `round-${round}`, "verification-summary.json"), {
      schemaVersion: "dealflow.final-verification.v3",
      round,
      runtime: "v20.20.2",
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
      failedCount: 0,
      blockedCount: 3,
      environmentOnlyDeferredCount: 3,
      environmentOnlyDeferrals: FINAL_VERIFICATION_HOSTED_DEFERRALS.map((command) => ({
        command,
        status: "authenticated_deferred",
      })),
      localGateStatus: "NO_GO_AUTHENTICATED_PROOF_DEFERRED",
      exactSealCommandPortfolioStatus: "passed_with_mandatory_hosted_proof_blockers",
      records,
      uniqueRoundEvidence: round,
    });
    write(join(external, `round-${round}`, "browser-proof", `round-${round}.png`), Buffer.from([137, 80, 78, 71, Number(round)]));
    roundSummarySha256[round] = sha256(readFileSync(join(external, `round-${round}`, "verification-summary.json")));
  }

  const stagingGates = {
    exactCandidateAndSchema: "PASS",
    isolatedHostedDeployment: "PASS",
    sevenSyntheticRoleFixtures: "PASS",
    authenticatedDirectEntitlementBoundaries: "PASS",
    whiteLabelHostAndBranding: "PASS",
    crossTenantBrowserBoundary: "PASS",
    authenticatedRlsFixtureAndCleanup: "PASS",
    zeroExternalEffects: "PASS",
    readOnlyHostedLoad: "PASS",
    workerExecutionRetryAndDeadLetterRecovery: "PASS",
    operatorDebtAndRecoveryJourneys: "PASS",
    realSyntheticLeadCapturePersistenceAndDelivery: "PASS",
    ghlSandboxProvisioningFunnelsAndLeadDelivery: "PASS",
    metaSandboxLaunchLeadgenReportingAndOptimization: "PASS",
    stripeTestCheckoutWebhookAndLifecycle: "PASS",
    creativeProviderGenerationAndPersistence: "PASS",
    twilioTestTransportAndConsentLifecycle: "PASS",
    supportDeliverySinkAndOperatorLifecycle: "PASS",
    liveReportingReconciliation: "PASS",
    deletionAndProviderOffboarding: "PASS",
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

  const productionPath = join(external, "production.json");
  write(productionPath, {
    schemaVersion: "dealflow.production-release-attestation.v1",
    status: "PASS",
    releaseAuthorized: true,
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
  const goOutput = join(external, "go-bundle");
  run(process.execPath, [
    builder,
    "--round-one", join(external, "round-1"),
    "--round-two", join(external, "round-2"),
    "--staging", staging,
    "--checkpoint-record", checkpointPath,
    "--production-attestation", productionPath,
    "--output", goOutput,
  ]);
  const goSnapshot = JSON.parse(readFileSync(join(goOutput, "dealflow-release.snapshot.json"), "utf8"));
  if (goSnapshot.verdict !== "GO") throw new Error("Complete PASS production attestation did not produce GO");

  const tamperedPortfolioRound = join(external, "tampered-portfolio-round");
  cpSync(join(external, "round-1"), tamperedPortfolioRound, { recursive: true });
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

  const mismatchRound = join(external, "mismatch-round");
  cpSync(join(external, "round-1"), mismatchRound, { recursive: true });
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

  const unhashedStaging = join(external, "unhashed-staging");
  cpSync(staging, unhashedStaging, { recursive: true });
  write(join(unhashedStaging, "unhashed.json"), { status: "PASS" });
  run(process.execPath, [builder, "--round-one", join(external, "round-1"), "--round-two", join(external, "round-2"), "--staging", unhashedStaging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-unhashed")], {
    expectFailure: true,
    match: /unhashed or missing-checksum artifact/,
  });

  const secretRound = join(external, "secret-round");
  cpSync(join(external, "round-1"), secretRound, { recursive: true });
  write(join(secretRound, "leak.txt"), "Authorization: Bearer synthetic-but-secret-shaped-token-123456\n");
  run(process.execPath, [builder, "--round-one", secretRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-secret")], {
    expectFailure: true,
    match: /Probable secret rejected/,
  });

  const customerRound = join(external, "customer-round");
  cpSync(join(external, "round-1"), customerRound, { recursive: true });
  write(join(customerRound, "customer.txt"), "customerEmail=real.person@private-domain.com\n");
  run(process.execPath, [builder, "--round-one", customerRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-customer")], {
    expectFailure: true,
    match: /Probable customer data rejected/,
  });

  const protectedRefRound = join(external, "protected-ref-round");
  cpSync(join(external, "round-1"), protectedRefRound, { recursive: true });
  write(join(protectedRefRound, "protected.txt"), "projectRef=abcdefghijklmnopqrst\n");
  run(process.execPath, [builder, "--round-one", protectedRefRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-protected-ref")], {
    expectFailure: true,
    match: /Full protected identifier rejected/,
  });

  const emptyRound = join(external, "empty-round");
  cpSync(join(external, "round-1"), emptyRound, { recursive: true });
  writeFileSync(join(emptyRound, "empty.txt"), "");
  run(process.execPath, [builder, "--round-one", emptyRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-empty")], {
    expectFailure: true,
    match: /empty file/,
  });

  const symlinkRound = join(external, "symlink-round");
  cpSync(join(external, "round-1"), symlinkRound, { recursive: true });
  symlinkSync("verification-summary.json", join(symlinkRound, "linked-summary.json"));
  run(process.execPath, [builder, "--round-one", symlinkRound, "--round-two", join(external, "round-2"), "--staging", staging, "--checkpoint-record", checkpointPath, "--output", join(external, "must-not-exist-symlink")], {
    expectFailure: true,
    match: /symlink/,
  });

  process.stdout.write("current release evidence builder contract: PASS (NO_GO/GO classification, exact identity and schema binding, recursive sanitized proof copy, complete matrices, private modes, manifest/checksums, and fail-closed drift/unhashed/secret/customer/protected-ref/empty/symlink tests)\n");
} finally {
  rmSync(root, { recursive: true, force: true });
}
