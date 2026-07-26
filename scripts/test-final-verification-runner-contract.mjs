#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FINAL_VERIFICATION_COMMAND_COUNT,
  FINAL_VERIFICATION_COMMAND_PORTFOLIO,
  FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
  FINAL_VERIFICATION_HOSTED_DEFERRALS,
  assertExactFinalVerificationCommandPortfolio,
  assertExactFinalVerificationRecordPortfolio,
  assertExactFinalVerificationSummaryPortfolio,
  createFinalVerificationCommandPortfolio,
  extractFinalVerificationNativePostgresRuntime,
  finalVerificationEvidenceQualification,
  formatFinalVerificationCommandTuple,
} from "./lib/final-verification-command-contract.mjs";
import {
  FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS,
  FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
  assertFinalVerificationDiskHeadroom,
  assertFinalVerificationEvidenceIsSealable,
  detectFinalVerificationFatalResourceDiagnostic,
  readFinalVerificationFreeBytes,
  settleFinalVerificationDiskHeadroom,
} from "./lib/final-verification-evidence-contract.mjs";
import { acquireFinalVerificationLock } from "./lib/final-verification-lock.mjs";

const source = readFileSync("scripts/run-dealflow-final-verification.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(source, /Final verification requires Node 24/);
assert.match(source, /acquireFinalVerificationLock/);
assert.match(source, /process\.once\("exit", releaseFinalVerificationLock\)/);
assert.doesNotMatch(source, /removeAllListeners/);

const lockRepository = mkdtempSync(join(tmpdir(), "dealflow-final-lock-repo-"));
const lockRoot = mkdtempSync(join(tmpdir(), "dealflow-final-lock-root-"));
try {
  const first = acquireFinalVerificationLock({
    repositoryRoot: lockRepository,
    lockRoot,
  });
  assert.throws(
    () => acquireFinalVerificationLock({ repositoryRoot: lockRepository, lockRoot }),
    /Another exact final verification is already active/,
  );
  assert.equal(first.release(), true);

  const stale = acquireFinalVerificationLock({
    repositoryRoot: lockRepository,
    lockRoot,
    pid: 2_147_483_647,
    processAlive: () => false,
  });
  assert.throws(
    () =>
      acquireFinalVerificationLock({
        repositoryRoot: lockRepository,
        lockRoot,
        processAlive: () => false,
      }),
    /stale final verification lock requires explicit operator cleanup/,
  );
  const lockPath = stale.lockPath;
  assert.equal(stale.release(), true);

  mkdirSync(lockPath, { mode: 0o700 });
  writeFileSync(join(lockPath, "owner.json"), "{}\n", { mode: 0o600 });
  assert.throws(
    () => acquireFinalVerificationLock({ repositoryRoot: lockRepository, lockRoot }),
    /lock owner is malformed/,
  );
  rmSync(lockPath, { recursive: true, force: true });

  const changedOwnership = acquireFinalVerificationLock({
    repositoryRoot: lockRepository,
    lockRoot,
  });
  const changedOwnerPath = join(changedOwnership.lockPath, "owner.json");
  const changedOwner = JSON.parse(readFileSync(changedOwnerPath, "utf8"));
  changedOwner.nonce = "f".repeat(48);
  writeFileSync(changedOwnerPath, `${JSON.stringify(changedOwner)}\n`, { mode: 0o600 });
  assert.throws(
    () => changedOwnership.release(),
    /lock ownership changed unexpectedly/,
  );
  assert.equal(changedOwnership.release({ strict: false }), false);
  rmSync(changedOwnership.lockPath, { recursive: true, force: true });

  const symlinkTarget = join(lockRoot, "symlink-target");
  mkdirSync(symlinkTarget, { mode: 0o700 });
  symlinkSync(symlinkTarget, lockPath);
  assert.throws(
    () => acquireFinalVerificationLock({ repositoryRoot: lockRepository, lockRoot }),
    /lock path is not a safe directory/,
  );
} finally {
  rmSync(lockRoot, { recursive: true, force: true });
  rmSync(lockRepository, { recursive: true, force: true });
}

const evidenceFixtureRoot = mkdtempSync(
  join(tmpdir(), "dealflow-final-evidence-contract-"),
);
try {
  const browserRoot = join(evidenceFixtureRoot, "browser-proof");
  const artifactRoot = join(browserRoot, "artifacts");
  const reportRoot = join(browserRoot, "report");
  mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  mkdirSync(reportRoot, { recursive: true, mode: 0o700 });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const specs = [];
  const authenticatedResults = [];
  const screenshotPaths = [];
  let ordinal = 0;
  for (const projectName of FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS) {
    for (let index = 0; index < 14; index += 1) {
      const skipped = index >= 10;
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
        writeFileSync(screenshotPath, png, { mode: 0o600 });
        screenshotPaths.push(screenshotPath);
        attachments.push({
          name: "screenshot",
          contentType: "image/png",
          path: screenshotPath,
        });
      }
      const status = skipped ? "skipped" : "passed";
      specs.push({
        title: `fixture ${projectName} ${index}`,
        ok: true,
        tests: [
          {
            expectedStatus: status,
            projectId: projectName,
            projectName,
            status: skipped ? "skipped" : "expected",
            results: [
              {
                status,
                retry: 0,
                errors: [],
                attachments,
              },
            ],
          },
        ],
      });
      ordinal += 1;
    }
  }
  writeFileSync(
    join(browserRoot, "playwright-results.json"),
    `${JSON.stringify({
      suites: [{ title: "fixture", specs, suites: [] }],
      errors: [],
      stats: { expected: 40, skipped: 16, unexpected: 0, flaky: 0 },
    })}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    join(browserRoot, "safe-browser-acceptance-summary.json"),
    `${JSON.stringify({
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
    })}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    join(browserRoot, "safety-preflight.json"),
    `${JSON.stringify({
      schemaVersion: "dealflow.safe-browser-preflight.v1",
      mode: "local_public",
      zeroExternalEffects: {
        ok: true,
        attestation: "DEALFLOW_ISOLATED_STAGING_QIBH_ZERO_EXTERNAL_EFFECTS_V1",
        checkedControlCount: 61,
        failedControls: [],
      },
      authenticatedStatus: "authenticated_deferred",
      publicTestsAuthorized: true,
      authenticatedTestsAuthorized: false,
    })}\n`,
    { mode: 0o600 },
  );
  writeFileSync(join(browserRoot, "playwright-results.xml"), "<testsuites/>\n", {
    mode: 0o600,
  });
  writeFileSync(join(reportRoot, "index.html"), "<!doctype html><title>PASS</title>\n", {
    mode: 0o600,
  });
  writeFileSync(
    join(artifactRoot, ".last-run.json"),
    `${JSON.stringify({ status: "passed", failedTests: [] })}\n`,
    { mode: 0o600 },
  );
  writeFileSync(join(evidenceFixtureRoot, "01-fixture.log"), "PASS\n", {
    mode: 0o600,
  });

  const validEvidence = assertFinalVerificationEvidenceIsSealable(
    evidenceFixtureRoot,
  );
  assert.equal(validEvidence.status, "PASS");
  assert.equal(validEvidence.browser.screenshotCount, 40);

  const firstScreenshot = screenshotPaths[0];
  rmSync(firstScreenshot);
  assert.throws(
    () => assertFinalVerificationEvidenceIsSealable(evidenceFixtureRoot),
    /ENOENT|screenshot portfolio|regular file/,
  );
  writeFileSync(firstScreenshot, png, { mode: 0o600 });

  writeFileSync(firstScreenshot, Buffer.alloc(0), { mode: 0o600 });
  assert.throws(
    () => assertFinalVerificationEvidenceIsSealable(evidenceFixtureRoot),
    /empty file|nonempty/,
  );
  writeFileSync(firstScreenshot, png, { mode: 0o600 });

  const emptyPath = join(evidenceFixtureRoot, "empty.log");
  writeFileSync(emptyPath, "", { mode: 0o600 });
  assert.throws(
    () => assertFinalVerificationEvidenceIsSealable(evidenceFixtureRoot),
    /empty file/,
  );
  rmSync(emptyPath);

  const symlinkPath = join(evidenceFixtureRoot, "unsafe-symlink");
  symlinkSync(join(evidenceFixtureRoot, "01-fixture.log"), symlinkPath);
  assert.throws(
    () => assertFinalVerificationEvidenceIsSealable(evidenceFixtureRoot),
    /symlink/,
  );
  rmSync(symlinkPath);

  const fifoPath = join(evidenceFixtureRoot, "unsupported-fifo");
  const fifo = spawnSync("/usr/bin/mkfifo", [fifoPath], {
    env: { PATH: "/usr/bin:/bin" },
  });
  assert.equal(fifo.status, 0, "Behavioral fixture requires mkfifo");
  assert.throws(
    () => assertFinalVerificationEvidenceIsSealable(evidenceFixtureRoot),
    /unsupported filesystem entry/,
  );
  rmSync(fifoPath);
} finally {
  rmSync(evidenceFixtureRoot, { recursive: true, force: true });
}

assert.equal(
  detectFinalVerificationFatalResourceDiagnostic(
    "Error: ENOSPC: no space left on device, write",
  ),
  "ENOSPC",
);
assert.equal(
  detectFinalVerificationFatalResourceDiagnostic("Disk quota exceeded"),
  "EDQUOT",
);
assert.equal(
  detectFinalVerificationFatalResourceDiagnostic("ordinary passing output"),
  null,
);
assert.equal(
  readFinalVerificationFreeBytes("/fixture", {
    readStatfs: () => ({ bsize: 1n, bavail: BigInt(FINAL_VERIFICATION_MINIMUM_FREE_BYTES) }),
  }),
  FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
);
assert.equal(
  assertFinalVerificationDiskHeadroom("/fixture", {
    readStatfs: () => ({ bsize: 1n, bavail: BigInt(FINAL_VERIFICATION_MINIMUM_FREE_BYTES) }),
  }),
  FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
);
assert.throws(
  () =>
    assertFinalVerificationDiskHeadroom("/fixture", {
      readStatfs: () => ({
        bsize: 1n,
        bavail: BigInt(FINAL_VERIFICATION_MINIMUM_FREE_BYTES - 1),
      }),
    }),
  /requires at least/,
);
{
  const observations = [
    FINAL_VERIFICATION_MINIMUM_FREE_BYTES - 2,
    FINAL_VERIFICATION_MINIMUM_FREE_BYTES - 1,
    FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
  ];
  const waits = [];
  const settlement = settleFinalVerificationDiskHeadroom(["/fixture"], {
    readFreeBytes: () => observations.shift(),
    wait: (milliseconds) => waits.push(milliseconds),
    intervalMs: 1_000,
    maxWaitMs: 2_000,
  });
  assert.equal(settlement.initialAvailableBytes, FINAL_VERIFICATION_MINIMUM_FREE_BYTES - 2);
  assert.equal(settlement.availableBytes, FINAL_VERIFICATION_MINIMUM_FREE_BYTES);
  assert.equal(settlement.waitedMs, 2_000);
  assert.equal(settlement.settled, true);
  assert.deepEqual(waits, [1_000, 1_000]);
}
{
  const settlement = settleFinalVerificationDiskHeadroom(["/fixture"], {
    readFreeBytes: () => FINAL_VERIFICATION_MINIMUM_FREE_BYTES - 1,
    wait: () => {},
    intervalMs: 1_000,
    maxWaitMs: 2_000,
  });
  assert.equal(settlement.availableBytes, FINAL_VERIFICATION_MINIMUM_FREE_BYTES - 1);
  assert.equal(settlement.waitedMs, 2_000);
  assert.equal(settlement.settled, false);
}

assert.equal(FINAL_VERIFICATION_COMMAND_COUNT, 91);
assert.equal(FINAL_VERIFICATION_COMMAND_PORTFOLIO.length, 91);
assert.equal(new Set(FINAL_VERIFICATION_COMMAND_PORTFOLIO).size, 91);
assert.equal(packageJson.scripts["format:check"], "git diff --check");
assert.equal(
  packageJson.scripts["release:qualify"],
  "node ./scripts/run-dealflow-final-verification.mjs",
);
assert.equal(
  packageJson.scripts["release:staging:qualify"],
  "node ./scripts/staging/run-isolated-staging-acceptance.mjs",
);
assert.match(
  packageJson.scripts["test:dealflow-completion"],
  /npm run test:final-critical/,
  "The single completion command must include the grouped final-critical portfolio",
);
for (const requiredCriticalCommand of [
  "test:auth-pkce",
  "test:onboarding-draft-integrity-db",
  "test:campaign-lifecycle",
  "test:ghl-marketplace-oauth",
  "test:admin-page-authorization",
  "test:platform-operator-authority-db",
  "test:privacy-authority-db",
  "authority:validate",
  "test:authority:runtime",
  "test:authority:grants-db",
  "test:meta-optimization-authority",
  "test:privileged-tenancy-db",
  "test:supply-chain",
  "supply-chain:check",
  "test:analytics:authority",
]) {
  assert.match(
    packageJson.scripts["test:final-critical"],
    new RegExp(`npm run ${requiredCriticalCommand.replaceAll(":", "\\:")}(?:\\s|$)`),
    `The grouped final-critical portfolio is missing ${requiredCriticalCommand}`,
  );
}
assert.equal(
  FINAL_VERIFICATION_COMMAND_PORTFOLIO.at(-2),
  "npm run test:final-master-delta",
);
for (const requiredSuccessorScript of [
  "test:twilio-transport",
  "test:workspace-selection",
  "test:fixed-realtor-qualification",
  "test:unsupported-ad-claims",
  "test:advertising-claim-boundaries",
  "test:kpi-semantic-truth",
  "test:support-external-delivery",
  "test:credit-top-up",
  "test:ghl-marketplace-oauth",
  "test:stripe-lifecycle",
]) {
  assert.match(
    packageJson.scripts["test:final-master-delta"] ?? "",
    new RegExp(`npm run ${requiredSuccessorScript.replaceAll(":", "\\:")}`),
    `final-master delta must include ${requiredSuccessorScript}`,
  );
}
assert.equal(
  createHash("sha256")
    .update(JSON.stringify(FINAL_VERIFICATION_COMMAND_PORTFOLIO))
    .digest("hex"),
  FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
);
assert.equal(
  FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
  "e911e09b18f312ef95440fa1fddb4a1459373ac169209f44e399a0a727134d85",
);
const exactNativePostgresRuntime = Object.freeze({
  pgbin: "/fixture/postgresql/17.6/bin",
  host: "/fixture/postgresql/socket",
  port: "55432",
  user: "supabase_admin",
});
const exactCommandPortfolio = createFinalVerificationCommandPortfolio(
  exactNativePostgresRuntime,
);
assert.deepEqual(
  extractFinalVerificationNativePostgresRuntime(exactCommandPortfolio),
  exactNativePostgresRuntime,
);
assert.doesNotThrow(() =>
  assertExactFinalVerificationCommandPortfolio(exactCommandPortfolio),
);
assert.doesNotThrow(() =>
  assertExactFinalVerificationCommandPortfolio(
    exactCommandPortfolio,
    "Expected native runtime binding",
    exactNativePostgresRuntime,
  ),
);
assert.throws(
  () => assertExactFinalVerificationCommandPortfolio(FINAL_VERIFICATION_COMMAND_PORTFOLIO),
  /does not match the exact final-verification command contract/,
  "The unresolved canonical template must never qualify as executed evidence",
);
assert.doesNotThrow(() =>
  assertExactFinalVerificationCommandPortfolio(
    createFinalVerificationCommandPortfolio({
      pgbin: "/durable/runtime/postgresql/17.6/bin",
      host: "/durable/runtime/postgresql/socket",
      port: "64321",
      user: "dealflow_verifier",
    }),
  ),
  "The exact contract must be portable across strictly validated native runtimes",
);
assert.throws(
  () =>
    assertExactFinalVerificationCommandPortfolio(
      createFinalVerificationCommandPortfolio({
        ...exactNativePostgresRuntime,
        port: "55433",
      }),
      "Expected native runtime binding",
      exactNativePostgresRuntime,
    ),
  /does not match the exact final-verification command contract/,
  "Runner preflight must reject a valid-but-different runtime tuple",
);
for (const invalidRuntime of [
  { ...exactNativePostgresRuntime, pgbin: "relative/bin" },
  { ...exactNativePostgresRuntime, pgbin: "/fixture/postgresql 17/bin" },
  { ...exactNativePostgresRuntime, pgbin: "/fixture/postgresql\u00a017/bin" },
  { ...exactNativePostgresRuntime, host: "/fixture/postgresql\nsocket" },
  { ...exactNativePostgresRuntime, port: "055432" },
  { ...exactNativePostgresRuntime, port: "65536" },
  { ...exactNativePostgresRuntime, user: "Invalid-User" },
]) {
  assert.throws(
    () => createFinalVerificationCommandPortfolio(invalidRuntime),
    /does not match the exact final-verification command contract/,
  );
}
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
  const commands = [...exactCommandPortfolio];
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
  commands[45] = commands[45].replace("--pgbin /fixture", "--pgbin fixture");
});
expectCommandPortfolioRejection((commands) => {
  commands[45] = commands[45].replace("--host /fixture", "--socket /fixture");
});
expectCommandPortfolioRejection((commands) => {
  commands[45] = commands[45].replace("--port 55432", "--port 1023");
});
expectCommandPortfolioRejection((commands) => {
  commands[45] = commands[45].replace("--user supabase_admin", "--user Invalid-User");
});
expectCommandPortfolioRejection((commands) => {
  commands[45] += " --extra forbidden";
});
expectCommandPortfolioRejection((commands) => {
  commands[45] = commands[45]
    .replace("--pgbin /fixture/postgresql/17.6/bin --host /fixture/postgresql/socket", "--host /fixture/postgresql/socket --pgbin /fixture/postgresql/17.6/bin");
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
  migrationCount: 123,
  migrationPortfolioSha256: "e".repeat(64),
});
const exactRecords = exactCommandPortfolio.map((command, index) => ({
  command,
  evidenceQualification: finalVerificationEvidenceQualification(command),
  status: "passed",
  exitCode: 0,
  diskFreeBytesBefore: FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
  diskFreeBytesAfter: FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
  fatalResourceDiagnostic: null,
  postCommandDiskHeadroom: "passed",
  postCommandRepositoryInvariant: "passed",
  safeEnvironmentProfile: "provider_credentials_and_application_secrets_omitted",
  workingDirectory: "/private/tmp/dealflow-final-master-20260716",
  ...exactSummaryIdentity,
  log: `${String(index + 1).padStart(2, "0")}-exact-command.log`,
}));
const exactSummary = {
  ...exactSummaryIdentity,
  plannedCommandCount: 91,
  commandCount: 91,
  passedCount: 91,
  commandPortfolioSha256: FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
  resolvedCommandPortfolioSha256: createHash("sha256")
    .update(JSON.stringify(exactCommandPortfolio))
    .digest("hex"),
  minimumFreeBytesRequired: FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
  minimumObservedFreeBytes: FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
  fatalResourceDiagnosticCount: 0,
  evidenceTreeStatus: "PASS",
  evidenceTreeFileCountBeforeSummary: 50,
  evidenceTreeSha256BeforeSummary: "f".repeat(64),
  localBrowserEvidenceStatus: "EXACT_40_NONEMPTY_SCREENSHOTS",
  localBrowserScreenshotCount: 40,
  localBrowserProjectScreenshotCounts: Object.fromEntries(
    FINAL_VERIFICATION_LOCAL_BROWSER_PROJECTS.map((project) => [project, 10]),
  ),
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
  exactCommandPortfolio,
);
const recordProof = assertExactFinalVerificationRecordPortfolio(exactRecords);
const summaryProof = assertExactFinalVerificationSummaryPortfolio(exactSummary);
for (const proof of [commandProof, recordProof, summaryProof]) {
  assert.deepEqual(proof, {
    commandCount: 91,
    commandPortfolioSha256: FINAL_VERIFICATION_COMMAND_PORTFOLIO_SHA256,
    resolvedCommandPortfolioSha256:
      exactSummary.resolvedCommandPortfolioSha256,
  });
  assert.equal(Object.isFrozen(proof), true);
}
assert.equal(JSON.stringify(exactSummary), exactSummarySnapshot, "validators must not mutate evidence");
assert.equal(
  exactRecords.filter(
    (record) => record.evidenceQualification === "exact_local_command",
  ).length,
  89,
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
  candidate.records[0].diskFreeBytesBefore =
    FINAL_VERIFICATION_MINIMUM_FREE_BYTES - 1;
});
expectPortfolioRejection((candidate) => {
  candidate.records[0].diskFreeBytesAfter =
    FINAL_VERIFICATION_MINIMUM_FREE_BYTES - 1;
});
expectPortfolioRejection((candidate) => {
  candidate.records[0].fatalResourceDiagnostic = "ENOSPC";
});
expectPortfolioRejection((candidate) => {
  candidate.records[0].postCommandDiskHeadroom = "failed";
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
  candidate.resolvedCommandPortfolioSha256 = "0".repeat(64);
});
expectPortfolioRejection((candidate) => {
  candidate.minimumFreeBytesRequired = 1;
});
expectPortfolioRejection((candidate) => {
  candidate.minimumObservedFreeBytes =
    FINAL_VERIFICATION_MINIMUM_FREE_BYTES - 1;
});
expectPortfolioRejection((candidate) => {
  candidate.fatalResourceDiagnosticCount = 1;
});
expectPortfolioRejection((candidate) => {
  candidate.evidenceTreeStatus = "FAILED";
});
expectPortfolioRejection((candidate) => {
  candidate.evidenceTreeFileCountBeforeSummary = 0;
});
expectPortfolioRejection((candidate) => {
  candidate.evidenceTreeSha256BeforeSummary = "0".repeat(63);
});
expectPortfolioRejection((candidate) => {
  candidate.localBrowserEvidenceStatus = "INCOMPLETE";
});
expectPortfolioRejection((candidate) => {
  candidate.localBrowserScreenshotCount = 39;
});
expectPortfolioRejection((candidate) => {
  candidate.localBrowserProjectScreenshotCounts["desktop-firefox"] = 9;
});
expectPortfolioRejection((candidate) => {
  delete candidate.commandPortfolioSha256;
});
expectPortfolioRejection((candidate) => {
  delete candidate.resolvedCommandPortfolioSha256;
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
  "const EXACT_INTEGRATED_MIGRATION_COUNT = 127",
  "20260725010000_enable_ghl_marketplace_first_install_bootstrap.sql",
  '["npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]]',
  '["npm", ["ls", "--all"]]',
  '["npm", ["run", "format:check"]]',
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
  "resolvedCommandPortfolioSha256:",
  "assertFinalVerificationEvidenceIsSealable(outputDirectory)",
  "sealableEvidenceFailure = error",
  'evidenceTreeStatus: sealableEvidence?.status ?? "FAILED"',
  'localBrowserEvidenceStatus:',
  'sealableEvidence?.browser.status ?? "INCOMPLETE"',
  "detectFinalVerificationFatalResourceDiagnostic(",
  "assertFinalVerificationDiskHeadroom(root)",
  "settleFinalVerificationDiskHeadroom([",
  "disk_free_bytes_after_initial:",
  "disk_headroom_settlement_wait_ms:",
  "fatal_resource_diagnostic:",
  "post_command_disk_headroom:",
]) {
  assert.ok(source.includes(marker), `Final verification runner is missing: ${marker}`);
}

const npmCi = source.indexOf('["npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]]');
const npmLs = source.indexOf('["npm", ["ls", "--all"]]');
const formatCheck = source.indexOf('["npm", ["run", "format:check"]]');
assert.ok(npmCi >= 0 && npmCi < npmLs && npmLs < formatCheck, "Final runner must preserve the broker-bound first two commands");
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
assert.match(
  source.slice(exactPortfolioGate, executionLoop),
  /"Tracked final-verification runner portfolio",\s*nativeEnvironment,\s*\)/,
  "Runner preflight must bind the exact command tuple to the validated native runtime",
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
  "final verification runner contract: PASS (exclusive worktree lock, migration 127, release hygiene/evidence, zero effects, safe load, multilingual product contracts, and fail-closed authenticated-proof gate)",
);
