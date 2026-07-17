#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  assertExactFinalVerificationCommandPortfolio,
  finalVerificationEvidenceQualification,
  formatFinalVerificationCommandTuple,
} from "./lib/final-verification-command-contract.mjs";
import {
  FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
  assertFinalVerificationDiskHeadroom,
  assertFinalVerificationEvidenceIsSealable,
  detectFinalVerificationFatalResourceDiagnostic,
  readFinalVerificationFreeBytes,
} from "./lib/final-verification-evidence-contract.mjs";
import { requireFinalVerificationNativeEnvironment } from "./lib/final-verification-environment.mjs";
import { acquireFinalVerificationLock } from "./lib/final-verification-lock.mjs";

const root = process.cwd();
const outputArg = process.argv[2];
const round = process.argv[3] ?? "1";
const EXACT_INTEGRATED_MIGRATION_COUNT = 120;
const REQUIRED_FINAL_MIGRATION =
  "20260717090000_create_canonical_lead_outcome_ledger.sql";
const FORBIDDEN_LOCAL_ENV_FILES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
  ".env.test.local",
];

if (process.versions.node.split(".")[0] !== "24") {
  throw new Error(
    `Final verification requires Node 24; received ${process.version}.`,
  );
}

if (!outputArg) {
  throw new Error("Usage: node scripts/run-dealflow-final-verification.mjs <external-output-directory> [round]");
}

const finalVerificationLock = acquireFinalVerificationLock({ repositoryRoot: root });
const releaseFinalVerificationLock = () => {
  finalVerificationLock.release({ strict: false });
};
process.once("exit", releaseFinalVerificationLock);

const nativeEnvironment = requireFinalVerificationNativeEnvironment(process.env);

const presentLocalEnvFiles = FORBIDDEN_LOCAL_ENV_FILES.filter((name) =>
  fs.existsSync(path.join(root, name))
);
if (presentLocalEnvFiles.length > 0) {
  throw new Error(
    `Final verification refuses ignored local environment inputs: ${presentLocalEnvFiles.join(", ")}`,
  );
}

const outputDirectory = path.resolve(outputArg);
const relativeToRoot = path.relative(root, outputDirectory);
if (
  relativeToRoot === "" ||
  (!relativeToRoot.startsWith(`..${path.sep}`) && relativeToRoot !== "..")
) {
  throw new Error("Verification evidence must be written outside the repository.");
}

const commands = [
  ["npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]],
  ["npm", ["ls", "--all"]],
  ["npm", ["run", "format:check"]],
  ["npm", ["audit", "--omit=dev", "--audit-level=low"]],
  ["npm", ["run", "test:security:scan-release"]],
  ["npm", ["run", "security:scan-release"]],
  ["node", ["scripts/test-final-verification-runner-contract.mjs"]],
  ["npm", ["run", "test:release-evidence-current"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "test:zero-external-effects"]],
  ["npm", ["run", "test:e2e:safe:contract"]],
  ["npm", ["run", "test:e2e:safe:reporter"]],
  ["npm", ["run", "test:e2e:safe:list"]],
  ["npm", ["run", "test:e2e:safe"]],
  ["npm", ["run", "test:load:safe-local:contract"]],
  ["npm", ["run", "load:safe-local"]],
  ["npm", ["run", "test:dealflow-completion"]],
  ["npm", ["run", "test:media-buyer"]],
  ["npm", ["run", "test:media-buying-upgrades"]],
  ["npm", ["run", "test:media-buyer-regression"]],
  ["npm", ["run", "test:static-ad-templates"]],
  ["npm", ["run", "test:creative-content-integrity"]],
  ["npm", ["run", "test:homepage"]],
  ["npm", ["run", "test:access-key-checkout-signup"]],
  ["npm", ["run", "test:public-funnel-thank-you"]],
  ["npm", ["run", "test:public-funnel-language"]],
  ["npm", ["run", "test:single-plan-ui"]],
  ["npm", ["run", "test:white-label-host-binding"]],
  ["npm", ["run", "test:ghl-signed-user-context"]],
  ["npm", ["run", "test:white-label-attribution-db"]],
  ["npm", ["run", "test:white-label-universal"]],
  ["npm", ["run", "test:product-localization"]],
  ["npm", ["run", "test:production-route-contract"]],
  ["npm", ["run", "smoke:offline"]],
  ["npm", ["run", "plan:validate"]],
  ["npm", ["run", "plan:writes:check"]],
  ["npm", ["run", "schema:check"]],
  ["npm", ["run", "routes:security"]],
  ["node", ["scripts/check-tenant-isolation.mjs"]],
  ["node", ["scripts/test-migration-read-only-contract.mjs"]],
  ["npm", ["run", "test:release-guard"]],
  ["npm", ["run", "test:stripe-runtime-mode"]],
  ["npm", ["run", "test:disposable-postgres-harness"]],
  ["node", [
    "scripts/test-native-postgres-test-adapter.mjs",
    "--pgbin", nativeEnvironment.pgbin,
    "--host", nativeEnvironment.host,
    "--port", nativeEnvironment.port,
    "--user", nativeEnvironment.user,
  ]],
  ["node", ["scripts/test-campaign-execution-tenant-contract.mjs"]],
  ["node", ["scripts/test-ghl-booking-handoff-contract.mjs"]],
  ["npm", ["run", "test:ghl-sandbox"]],
  ["npm", ["run", "test:ghl-production"]],
  ["npm", ["run", "test:ghl-lifecycle"]],
  ["npm", ["run", "test:ghl-inbound-reconciliation"]],
  ["npm", ["run", "test:ghl-inbound-authority"]],
  ["npm", ["run", "test:ghl-inbound-reconciliation-db"]],
  ["npm", ["run", "test:ghl-launch-readiness"]],
  ["npm", ["run", "test:ghl-write-ambiguity"]],
  ["npm", ["run", "test:ghl-periodic-form-sweep"]],
  ["npm", ["run", "test:ghl-periodic-form-sweep-db"]],
  ["node", ["scripts/test-ghl-destination-fail-closed.mjs"]],
  ["node", ["scripts/test-isolated-staging-seed-contract.mjs"]],
  ["npm", ["run", "test:staging-migration-broker-contract"]],
  ["npm", ["run", "test:staging-acceptance-contract"]],
  ["npm", ["run", "test:system-job-stage-isolation"]],
  ["npm", ["run", "test:reporting-worker-capacity"]],
  ["npm", ["run", "test:campaign-dashboard-metric-truth"]],
  ["npm", ["run", "test:dashboard-lineage-db"]],
  ["npm", ["run", "test:atomic-public-lead-capture-db"]],
  ["npm", ["run", "test:paid-creative-dispatch"]],
  ["npm", ["run", "test:generated-video-storage"]],
  ["npm", ["run", "test:account-deletion-offboarding"]],
  ["node", ["scripts/test-meta-budget-safety.mjs"]],
  ["node", ["scripts/generate-forward-migration-portfolio.mjs", "--check"]],
  ["node", ["scripts/schema/check-forward-reconstruction.mjs"]],
  ["npm", ["run", "test:schema-oracle-contract"]],
  ["npm", ["run", "test:schema-reconciliation-db"]],
  ["npm", ["run", "test:integrated-migration-chain-db"]],
  ["npm", ["run", "test:meta-campaign-activation"]],
  ["npm", ["run", "test:meta-optimization-executor"]],
  ["npm", ["run", "test:access-key-security-disposable-db"]],
  ["npm", ["run", "test:meta-leadgen"]],
  ["npm", ["run", "test:financial-integrity-disposable-db"]],
  ["npm", ["run", "test:stripe-webhook-disposable-db"]],
  ["npm", ["run", "test:scheduler-disposable-db"]],
  ["npm", ["run", "test:creative-lead-disposable-db"]],
  ["npm", ["run", "test:ghl-disposable-db"]],
  ["npm", ["run", "test:lead-effect-fencing-db"]],
  ["npm", ["run", "test:campaign-entitlement-disposable-db"]],
  ["npm", ["run", "test:support-outbox-disposable-db"]],
  ["npm", ["run", "test:sms-receipts"]],
  ["npm", ["run", "test:final-master-delta"]],
  ["node", ["scripts/test-lead-tracking-health.mjs"]],
];

const commandPortfolio = assertExactFinalVerificationCommandPortfolio(
  commands.map(formatFinalVerificationCommandTuple),
  "Tracked final-verification runner portfolio",
  nativeEnvironment,
);

const environmentOnlyDeferrals = Object.freeze([
  {
    command: "npm run rls:cross-tenant",
    status: "authenticated_deferred",
    requiredEnvironment: "isolated hosted staging with two synthetic tenant JWTs and seeded row identities",
  },
  {
    command: "npm run rls:fixture-smoke",
    status: "authenticated_deferred",
    requiredEnvironment: "isolated hosted staging with service-role fixture authority and cleanup proof",
  },
  {
    command: "npm run operator:debt",
    status: "authenticated_deferred",
    requiredEnvironment: "isolated hosted staging after seed, worker, webhook, and provider acceptance cycles",
  },
]);

function sanitize(text) {
  return String(text ?? "")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|rk)_(?:live|test|proj)_[A-Za-z0-9_-]+\b/g, "[REDACTED_PROVIDER_KEY]")
    .replace(/\b(?:EAA|EAAB)[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_PROVIDER_TOKEN]")
    .replace(/\b(?:sb_secret_|sbp_)[A-Za-z0-9_-]+\b/g, "[REDACTED_SUPABASE_SECRET]")
    .replace(/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*=\S+/g, (value) => `${value.split("=")[0]}=[REDACTED]`)
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]");
}

function safeEnvironment() {
  const names = [
    "PATH",
    "HOME",
    "TMPDIR",
    "USER",
    "LOGNAME",
    "SHELL",
    "LANG",
    "LC_ALL",
    "TERM",
    "COLORTERM",
    "NVM_DIR",
    "npm_config_cache",
    "DEALFLOW_DISPOSABLE_DB_MODE",
    "DEALFLOW_NATIVE_PGBIN",
    "DEALFLOW_NATIVE_PGHOST",
    "DEALFLOW_NATIVE_PGPORT",
    "DEALFLOW_NATIVE_PGUSER",
  ];
  const env = {
    CI: "true",
    NO_COLOR: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    SUPABASE_SCHEMA_CHECK_MODE: "local",
    SAFE_E2E_QA_AUTH: "false",
    SAFE_E2E_OUTPUT_DIR: path.join(outputDirectory, "browser-proof"),
  };
  for (const name of names) {
    if (process.env[name]) env[name] = process.env[name];
  }
  env.PATH = `${path.dirname(process.execPath)}:${env.PATH ?? "/usr/bin:/bin"}`;
  return env;
}

function sha256File(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function migrationPortfolioIdentity() {
  const migrationDirectory = path.join(root, "supabase", "migrations");
  const files = fs.readdirSync(migrationDirectory)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort();
  if (
    files.length !== EXACT_INTEGRATED_MIGRATION_COUNT ||
    !files.includes(REQUIRED_FINAL_MIGRATION) ||
    new Set(files.map((name) => name.slice(0, 14))).size !== files.length
  ) {
    throw new Error(
      `Final verification requires the exact ${EXACT_INTEGRATED_MIGRATION_COUNT}-migration portfolio.`,
    );
  }
  const digest = createHash("sha256");
  const records = files.map((name) => {
    const contents = fs.readFileSync(path.join(migrationDirectory, name));
    const fileSha256 = createHash("sha256").update(contents).digest("hex");
    digest.update(String(Buffer.byteLength(name)));
    digest.update("\0");
    digest.update(name);
    digest.update("\0");
    digest.update(String(contents.byteLength));
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
    return { name, sha256: fileSha256, bytes: contents.byteLength };
  });
  return Object.freeze({
    migrationCount: records.length,
    migrationPortfolioSha256: digest.digest("hex"),
    migrationFiles: records,
  });
}

function git(args, label) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: safeEnvironment(),
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${label} failed: ${sanitize(result.error?.message || result.stderr || result.stdout)}`,
    );
  }
  return result.stdout;
}

function trackedWorktreeDigest() {
  const index = git(["ls-files", "--stage", "-z"], "Enumerate tracked files");
  const entries = index.split("\0").filter(Boolean).map((entry) => {
    const match = /^(\d{6}) ([0-9a-f]{40,64}) ([0-3])\t([\s\S]+)$/.exec(entry);
    if (!match || match[3] !== "0") {
      throw new Error("Tracked worktree index contains an unsupported or unmerged entry");
    }
    return { mode: match[1], path: match[4] };
  });
  const digest = createHash("sha256");
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.path);
    const stat = fs.lstatSync(absolutePath);
    let contents;
    if (entry.mode === "120000") {
      if (!stat.isSymbolicLink()) {
        throw new Error(`Tracked symbolic link changed type: ${entry.path}`);
      }
      contents = Buffer.from(fs.readlinkSync(absolutePath));
    } else {
      if (!stat.isFile()) {
        throw new Error(`Tracked file changed type: ${entry.path}`);
      }
      contents = fs.readFileSync(absolutePath);
    }
    digest.update(entry.mode);
    digest.update("\0");
    digest.update(String(Buffer.byteLength(entry.path)));
    digest.update("\0");
    digest.update(entry.path);
    digest.update("\0");
    digest.update(String(contents.byteLength));
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
  }
  return {
    trackedFileCount: entries.length,
    trackedWorktreeSha256: digest.digest("hex"),
  };
}

function captureCleanRepositoryIdentity(label) {
  const beforeCommit = git(["rev-parse", "--verify", "HEAD"], label).trim();
  const beforeTree = git(["rev-parse", "--verify", "HEAD^{tree}"], label).trim();
  const beforeStatus = git(
    ["status", "--porcelain=v1", "--untracked-files=all", "-z"],
    label,
  );
  if (beforeStatus !== "") {
    throw new Error(`${label}: repository worktree is not completely clean`);
  }
  const tracked = trackedWorktreeDigest();
  const afterCommit = git(["rev-parse", "--verify", "HEAD"], label).trim();
  const afterTree = git(["rev-parse", "--verify", "HEAD^{tree}"], label).trim();
  const afterStatus = git(
    ["status", "--porcelain=v1", "--untracked-files=all", "-z"],
    label,
  );
  if (
    afterStatus !== "" ||
    afterCommit !== beforeCommit ||
    afterTree !== beforeTree
  ) {
    throw new Error(`${label}: repository identity changed during capture`);
  }
  return Object.freeze({
    headCommit: beforeCommit,
    headTree: beforeTree,
    trackedWorktreeSha256: tracked.trackedWorktreeSha256,
    trackedFileCount: tracked.trackedFileCount,
  });
}

const repositoryIdentity = captureCleanRepositoryIdentity(
  "Final verification preflight",
);
const dependencyLockSha256 = sha256File(path.join(root, "package-lock.json"));
const migrationIdentity = migrationPortfolioIdentity();

function requireInvariantRepositoryIdentity(label) {
  const current = captureCleanRepositoryIdentity(label);
  for (const key of [
    "headCommit",
    "headTree",
    "trackedWorktreeSha256",
    "trackedFileCount",
  ]) {
    if (current[key] !== repositoryIdentity[key]) {
      throw new Error(
        `${label}: repository ${key} drifted from the verification seal`,
      );
    }
  }
  return current;
}

if (fs.existsSync(outputDirectory)) {
  const outputStat = fs.lstatSync(outputDirectory);
  if (outputStat.isSymbolicLink() || !outputStat.isDirectory()) {
    throw new Error("Verification evidence path must be a real directory, not a symlink or file.");
  }
  if (fs.readdirSync(outputDirectory).length > 0) {
    throw new Error("Verification evidence directory must be absent or empty.");
  }
} else {
  let existingParent = path.dirname(outputDirectory);
  while (!fs.existsSync(existingParent)) {
    const nextParent = path.dirname(existingParent);
    if (nextParent === existingParent) break;
    existingParent = nextParent;
  }
  const projectedRealOutput = path.resolve(
    fs.realpathSync(existingParent),
    path.relative(existingParent, outputDirectory),
  );
  const projectedRelativeToRoot = path.relative(fs.realpathSync(root), projectedRealOutput);
  if (
    projectedRelativeToRoot === "" ||
    (!projectedRelativeToRoot.startsWith(`..${path.sep}`) && projectedRelativeToRoot !== "..")
  ) {
    throw new Error("Verification evidence projected real path must remain outside the repository.");
  }
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
}
fs.chmodSync(outputDirectory, 0o700);
const realOutputDirectory = fs.realpathSync(outputDirectory);
const realRoot = fs.realpathSync(root);
const realRelativeToRoot = path.relative(realRoot, realOutputDirectory);
if (
  realRelativeToRoot === "" ||
  (!realRelativeToRoot.startsWith(`..${path.sep}`) && realRelativeToRoot !== "..")
) {
  throw new Error("Verification evidence real path must remain outside the repository.");
}
const preflightRepositoryFreeBytes = assertFinalVerificationDiskHeadroom(root);
const preflightEvidenceFreeBytes = assertFinalVerificationDiskHeadroom(outputDirectory);
const records = [];
let failed = false;
let invariantFailure = null;

for (let index = 0; index < commands.length; index += 1) {
  const [executable, args] = commands[index];
  const command = [executable, ...args].join(" ");
  try {
    requireInvariantRepositoryIdentity(`Before command ${index + 1}`);
  } catch (error) {
    invariantFailure = error;
    failed = true;
    break;
  }
  const startedAt = new Date();
  const startedMs = Date.now();
  const diskFreeBytesBefore = Math.min(
    assertFinalVerificationDiskHeadroom(root),
    assertFinalVerificationDiskHeadroom(outputDirectory),
  );
  process.stdout.write(`[verification round ${round}] ${command}\n`);
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: safeEnvironment(),
    maxBuffer: 64 * 1024 * 1024,
    timeout: 15 * 60_000,
  });
  const completedAt = new Date();
  const commandExitCode = result.status ?? (result.error ? 1 : 0);
  const fatalResourceDiagnostic = detectFinalVerificationFatalResourceDiagnostic(
    `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
  );
  const diskFreeBytesAfter = Math.min(
    readFinalVerificationFreeBytes(root),
    readFinalVerificationFreeBytes(outputDirectory),
  );
  const postCommandDiskHeadroomFailed =
    diskFreeBytesAfter < FINAL_VERIFICATION_MINIMUM_FREE_BYTES;
  let invariantError = null;
  try {
    requireInvariantRepositoryIdentity(`After command ${index + 1}`);
  } catch (error) {
    invariantError = error;
    invariantFailure = error;
  }
  const exitCode =
    commandExitCode === 0 &&
    !invariantError &&
    !fatalResourceDiagnostic &&
    !postCommandDiskHeadroomFailed
      ? 0
      : 1;
  const logSlug = [executable, ...args]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
  const logName = `${String(index + 1).padStart(2, "0")}-${logSlug}.log`;
  const log = sanitize(
    [
      `command: ${command}`,
      `working_directory: ${root}`,
      `head_commit: ${repositoryIdentity.headCommit}`,
      `head_tree: ${repositoryIdentity.headTree}`,
      `tracked_worktree_sha256: ${repositoryIdentity.trackedWorktreeSha256}`,
      `tracked_file_count: ${repositoryIdentity.trackedFileCount}`,
      `dependency_lock_sha256: ${dependencyLockSha256}`,
      `migration_count: ${migrationIdentity.migrationCount}`,
      `migration_portfolio_sha256: ${migrationIdentity.migrationPortfolioSha256}`,
      `safe_environment_profile: provider credentials and application secrets omitted`,
      `started_at: ${startedAt.toISOString()}`,
      `completed_at: ${completedAt.toISOString()}`,
      `duration_ms: ${Date.now() - startedMs}`,
      `command_exit_code: ${commandExitCode}`,
      `record_exit_code: ${exitCode}`,
      `disk_free_bytes_before: ${diskFreeBytesBefore}`,
      `disk_free_bytes_after: ${diskFreeBytesAfter}`,
      `fatal_resource_diagnostic: ${fatalResourceDiagnostic ?? "none"}`,
      `post_command_disk_headroom: ${postCommandDiskHeadroomFailed ? "failed" : "passed"}`,
      `post_command_repository_invariant: ${invariantError ? "failed" : "passed"}`,
      "",
      result.stdout ?? "",
      result.stderr ?? "",
      result.error ? `runner_error: ${result.error.message}` : "",
      invariantError ? `repository_invariant_error: ${invariantError.message}` : "",
    ].join("\n"),
  );
  const logPath = path.join(outputDirectory, logName);
  fs.writeFileSync(logPath, log, { encoding: "utf8", mode: 0o600 });
  records.push({
    command,
    workingDirectory: root,
    headCommit: repositoryIdentity.headCommit,
    headTree: repositoryIdentity.headTree,
    trackedWorktreeSha256: repositoryIdentity.trackedWorktreeSha256,
    trackedFileCount: repositoryIdentity.trackedFileCount,
    dependencyLockSha256,
    migrationCount: migrationIdentity.migrationCount,
    migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
    safeEnvironmentProfile: "provider_credentials_and_application_secrets_omitted",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Date.now() - startedMs,
    exitCode,
    status: exitCode === 0 ? "passed" : "failed",
    diskFreeBytesBefore,
    diskFreeBytesAfter,
    fatalResourceDiagnostic,
    postCommandDiskHeadroom: postCommandDiskHeadroomFailed ? "failed" : "passed",
    evidenceQualification: finalVerificationEvidenceQualification(command),
    postCommandRepositoryInvariant: invariantError ? "failed" : "passed",
    log: logName,
  });
  if (exitCode !== 0) failed = true;
  if (invariantError) break;
  if (fatalResourceDiagnostic || postCommandDiskHeadroomFailed) break;
}

if (!invariantFailure) {
  try {
    requireInvariantRepositoryIdentity("Final verification postflight");
  } catch (error) {
    invariantFailure = error;
    failed = true;
  }
}

// Downstream owner-authority and release-evidence brokers seal the entire
// verification directory, not only the command logs. Refuse a round here if a
// browser or test runner left behind an empty, symlinked, special, missing, or
// incomplete cross-browser artifact portfolio.
let sealableEvidence = null;
let sealableEvidenceFailure = null;
try {
  sealableEvidence = assertFinalVerificationEvidenceIsSealable(outputDirectory);
} catch (error) {
  sealableEvidenceFailure = error;
  failed = true;
}

const authenticatedProofBlocked = environmentOnlyDeferrals.length > 0;
const localGateStatus =
  failed || invariantFailure
    ? "NO_GO_COMMAND_OR_SEAL_FAILURE"
    : authenticatedProofBlocked
      ? "NO_GO_AUTHENTICATED_PROOF_DEFERRED"
      : "GO";

const summary = {
  schemaVersion: "dealflow.final-verification.v3",
  round,
  runtime: process.version,
  platform: `${process.platform}-${process.arch}`,
  headCommit: repositoryIdentity.headCommit,
  headTree: repositoryIdentity.headTree,
  trackedWorktreeSha256: repositoryIdentity.trackedWorktreeSha256,
  trackedFileCount: repositoryIdentity.trackedFileCount,
  dependencyLockSha256,
  migrationCount: migrationIdentity.migrationCount,
  migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
  migrationFiles: migrationIdentity.migrationFiles,
  repositoryInvariant: invariantFailure ? "failed" : "passed",
  repositoryInvariantFailure: invariantFailure
    ? sanitize(invariantFailure.message)
    : null,
  plannedCommandCount: commands.length,
  commandPortfolioSha256: commandPortfolio.commandPortfolioSha256,
  resolvedCommandPortfolioSha256:
    commandPortfolio.resolvedCommandPortfolioSha256,
  minimumFreeBytesRequired: FINAL_VERIFICATION_MINIMUM_FREE_BYTES,
  minimumObservedFreeBytes: Math.min(
    preflightRepositoryFreeBytes,
    preflightEvidenceFreeBytes,
    ...records.flatMap((record) => [
      record.diskFreeBytesBefore,
      record.diskFreeBytesAfter,
    ]),
  ),
  fatalResourceDiagnosticCount: records.filter(
    (record) => record.fatalResourceDiagnostic !== null,
  ).length,
  evidenceTreeStatus: sealableEvidence?.status ?? "FAILED",
  evidenceTreeFailure: sealableEvidenceFailure
    ? sanitize(sealableEvidenceFailure.message)
    : null,
  evidenceTreeFileCountBeforeSummary:
    sealableEvidence?.fileCountBeforeSummary ?? 0,
  evidenceTreeSha256BeforeSummary:
    sealableEvidence?.evidenceTreeSha256BeforeSummary ?? null,
  localBrowserEvidenceStatus:
    sealableEvidence?.browser.status ?? "INCOMPLETE",
  localBrowserScreenshotCount:
    sealableEvidence?.browser.screenshotCount ?? 0,
  localBrowserProjectScreenshotCounts:
    sealableEvidence?.browser.projectScreenshotCounts ?? {},
  startedAt: records[0]?.startedAt ?? new Date().toISOString(),
  completedAt: records.at(-1)?.completedAt ?? new Date().toISOString(),
  commandCount: records.length,
  passedCount: records.filter((record) => record.status === "passed").length,
  failedCount: records.filter((record) => record.status === "failed").length,
  blockedCount: environmentOnlyDeferrals.length,
  localProofScope: "exact_local_release_candidate",
  localGateStatus,
  stagingAdvancementAuthorized: localGateStatus === "GO",
  exactSealCommandPortfolioStatus:
    failed || invariantFailure ? "failed" : "passed_with_mandatory_hosted_proof_blockers",
  authenticatedBrowserStatus: "authenticated_deferred_to_isolated_hosted_staging",
  remoteSchemaStatus: "authenticated_deferred_to_isolated_hosted_staging",
  environmentOnlyDeferredCount: environmentOnlyDeferrals.length,
  environmentOnlyDeferrals,
  records,
};
fs.writeFileSync(
  path.join(outputDirectory, "verification-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  { encoding: "utf8", mode: 0o600 },
);

if (failed || invariantFailure) {
  process.exitCode = 1;
} else if (authenticatedProofBlocked) {
  // The command portfolio can be green while the master release contract is
  // still incomplete. A successful process exit would let downstream staging
  // automation mistake public-only browser proof for a completed Chunk 1.
  process.exitCode = 2;
}
