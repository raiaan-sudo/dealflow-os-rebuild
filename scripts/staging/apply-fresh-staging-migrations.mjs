#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertExactFinalVerificationSummaryPortfolio,
  extractFinalVerificationNativePostgresRuntime,
} from "../lib/final-verification-command-contract.mjs";
import { assertFinalVerificationEvidenceIsSealable } from "../lib/final-verification-evidence-contract.mjs";
import {
  assertExactForward104To120Portfolio,
  classifyForward104RemoteHistory,
  FORWARD_104_TO_120_AUTHORITY,
  loadExactPrior104StagingSeal,
  loadExactPrior104SyntheticSurfaceSeal,
} from "./forward-104-to-120-contract.mjs";
import {
  assertExactForward120To121Portfolio,
  FORWARD_120_TO_121_AUTHORITY,
} from "./forward-120-to-121-contract.mjs";
import {
  assertExactForward122To123Portfolio,
  FORWARD_122_TO_123_AUTHORITY,
} from "./forward-122-to-123-contract.mjs";

import {
  classifyExactStagingAuthSurface,
  classifyExactCommittedForwardRecoverySeal,
  classifyPriorMigrationEvidence,
  HISTORICAL_129_APPLICATION_AUTHORITY,
  isAllowedStagingAuthSurfaceUserCount,
  isExactHistorical129ApplicationAuthority,
  PRIOR_MIGRATION_APPLICATION_ARTIFACTS,
  PRIOR_MIGRATION_COMMITTED_FORWARD_RECOVERY_ARTIFACTS,
  PRIOR_MIGRATION_READ_ONLY_EXACT_ARTIFACTS,
  STAGING_AUTH_SURFACE_MAX_USER_COUNT,
} from "./prior-migration-proof-contract.mjs";

const [repoArg, evidenceArg, roundOneArg, roundTwoArg, ...modeArgs] = process.argv.slice(2);
if (!repoArg || !evidenceArg || !roundOneArg || !roundTwoArg) {
  throw new Error(
    "Usage: apply-fresh-staging-migrations.mjs <repo> <external-evidence-dir> <round-1-summary.json> <round-2-summary.json> [--verify-existing-exact <prior-migration-proof-dir> | --adopt-current-exact <external-adoption-authority.json> | --apply-forward-exact <prior-104-migration-proof-dir> | --apply-successor-exact <prior-122-migration-proof-dir>]",
  );
}
let priorMigrationProofDir = null;
let currentExactAdoptionAuthorityPath = null;
let migrationMode = "FRESH_ATOMIC_APPLICATION";
if (modeArgs.length > 0) {
  if (
    modeArgs.length !== 2 ||
    !["--verify-existing-exact", "--adopt-current-exact", "--apply-forward-exact", "--apply-successor-exact"].includes(modeArgs[0]) ||
    !modeArgs[1] ||
    modeArgs[1].startsWith("--")
  ) {
    throw new Error(
      "The only supported non-fresh modes are --verify-existing-exact, --adopt-current-exact, --apply-forward-exact, or --apply-successor-exact with one external authority path",
    );
  }
  if (modeArgs[0] === "--adopt-current-exact") {
    currentExactAdoptionAuthorityPath = resolve(modeArgs[1]);
  } else {
    priorMigrationProofDir = resolve(modeArgs[1]);
  }
  migrationMode = modeArgs[0] === "--verify-existing-exact"
    ? "VERIFY_EXISTING_EXACT"
    : modeArgs[0] === "--adopt-current-exact"
      ? "ADOPT_CURRENT_EXACT"
    : modeArgs[0] === "--apply-forward-exact"
      ? "APPLY_FORWARD_EXACT"
      : "APPLY_SUCCESSOR_EXACT";
}

const repo = resolve(repoArg);
const evidenceDir = resolve(evidenceArg);
const roundSummaryPaths = [resolve(roundOneArg), resolve(roundTwoArg)];
const expectedRepo = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
);
const expectedTrustBundleRelativePath =
  "config/security/supabase-prod-ca-2021.crt";
const expectedTrustBundlePath = resolve(repo, expectedTrustBundleRelativePath);
const expectedTrustBundleSha256 =
  "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7";
const projectRecordInput =
  process.env.DEALFLOW_STAGING_PROJECT_RECORD?.trim() ?? "";
if (!projectRecordInput || !isAbsolute(projectRecordInput)) {
  throw new Error(
    "DEALFLOW_STAGING_PROJECT_RECORD must name the absolute external qibh project record",
  );
}
const projectRecordPath = resolve(projectRecordInput);
const keychainService = "io.supabase.dealflow-staging.db";
const keychainAccount = "dealflow-staging-20260712";
const expectedProjectFingerprint =
  "c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c";
const expectedProjectSafeSuffix = "qibh";
const expectedPriorApplicationBranch = "codex/dealflow-release-closure-plan";
const expectedPriorApplicationCommit = "5978cfc9a80f511cfed02d1d1f810a4720db7cc1";
const expectedPriorApplicationTree = "7ea61c55363d40d1e23fb35e45029e653e6682a7";
const expectedPriorManifestSha256 =
  "f4a7209d74fdc1dad3f82290c837d2a8c289546eca7f8b7373efe9e0e6aa3f63";
const expectedPriorProofSha256 =
  "828a5caf76abc36326ecfbedcea7074533de9e587c375812223d90033c7451ed";
const expectedPriorSummarySha256 =
  "49e58de331c8e699b2ba5ce1bbae2235bd45b79de343c519585e0cc5a64422d3";
const expectedPriorMigrationPortfolioSha256 =
  "066dacae58f0987a281bff1f8b21cfaaa2a1cebe49e797a0f764f88d21be74ca";
const expectedPriorMigrationCount = 103;
const expectedPriorFinalMigration =
  "20260713028000_harden_account_deletion_retention_authority.sql";
const exactMigrationCount = 131;
const transactionOwningMigration =
  "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const requiredFinalMigration =
  "20260817223000_add_fenced_ghl_operator_repair_replay.sql";
const currentManagedStructuralCatalogSha256 =
  "462032cc733424365f9b595dffe06eb097b1b8f1fd48205e22d3e4dee27e58f0";
const currentManagedStructuralCatalogRecordCount = 8481;
const expectedVerificationLocalGate = "NO_GO_AUTHENTICATED_PROOF_DEFERRED";
const expectedHostedVerificationDeferrals = Object.freeze([
  "npm run operator:debt",
  "npm run rls:cross-tenant",
  "npm run rls:fixture-smoke",
]);
const existingExactVerificationFailureCodes = Object.freeze({
  SERVER_VERSION: "existing_server_version_not_proven",
  REMOTE_STRUCTURAL_STATE: "existing_remote_structural_state_not_proven",
  MIGRATION_HISTORY: "existing_migration_history_not_proven",
  STORAGE_SURFACE: "existing_storage_surface_not_proven",
  GHL_EMBED_AUTH_EXCHANGE_SURFACE: "existing_ghl_embed_auth_exchange_surface_not_proven",
  AUTH_SURFACE: "existing_auth_surface_not_proven",
  AUTH_COUNT_CONSISTENCY: "existing_auth_count_consistency_not_proven",
  STRUCTURAL_CATALOG_BINDING: "existing_structural_catalog_binding_not_proven",
  STRUCTURAL_CATALOG_STABILITY: "existing_structural_catalog_stability_not_proven",
  MANAGED_STRUCTURAL_CATALOG_BINDING: "existing_managed_structural_catalog_binding_not_proven",
  MANAGED_STRUCTURAL_CATALOG_STABILITY: "existing_managed_structural_catalog_stability_not_proven",
  NORMALIZED_SCHEMA_FIRST_CAPTURE: "existing_normalized_schema_first_capture_not_proven",
  NORMALIZED_SCHEMA_REPEAT_CAPTURE: "existing_normalized_schema_repeat_capture_not_proven",
  NORMALIZED_SCHEMA_BINDING: "existing_normalized_schema_binding_not_proven",
  FORCED_RLS_COUNT: "existing_forced_rls_count_not_proven",
  META_RUNTIME_CONTROLS: "existing_meta_runtime_controls_not_proven",
  GHL_RUNTIME_CONTROLS: "existing_ghl_runtime_controls_not_proven",
  RETENTION_AUTHORITY_ACL: "existing_retention_authority_acl_not_proven",
  BROKER_SOURCE_REBIND: "existing_broker_source_rebind_not_proven",
  FINAL_EVIDENCE_WRITE: "existing_final_evidence_write_not_proven",
});
const brokerRelativePath = "scripts/staging/apply-fresh-staging-migrations.mjs";
const migrationDir = join(repo, "supabase", "migrations");
const migrations = readdirSync(migrationDir)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

if (process.versions.node.split(".")[0] !== "24") {
  throw new Error(`The staging migration broker requires Node 24; received ${process.version}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalizeManagedCatalogMaterial(material) {
  return String(material ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.stringify(JSON.parse(line)))
    .sort()
    .join("\n");
}

function captureBrokerSourceIdentity() {
  const invokedPath = fileURLToPath(import.meta.url);
  const stat = lstatSync(invokedPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("The tracked staging broker must be invoked from a real regular file");
  }
  const sourcePath = realpathSync(invokedPath);
  const expectedSourcePath = realpathSync(join(repo, brokerRelativePath));
  if (sourcePath !== expectedSourcePath) {
    throw new Error("The staging migration broker is not the tracked release broker");
  }
  const source = readFileSync(sourcePath);
  return Object.freeze({
    path: brokerRelativePath,
    sha256: sha256(source),
    bytes: source.byteLength,
    sourcePath,
  });
}

function assertBrokerSourceIdentityUnchanged(identity) {
  const stat = lstatSync(identity.sourcePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("The tracked staging broker changed type after self-binding");
  }
  const source = readFileSync(identity.sourcePath);
  if (source.byteLength !== identity.bytes || sha256(source) !== identity.sha256) {
    throw new Error("The tracked staging broker changed after its SHA-256 was bound");
  }
}

const brokerSourceIdentity = captureBrokerSourceIdentity();

function sanitized(value, projectRef) {
  const escaped = projectRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEvidenceDir = evidenceDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedRepo = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(value ?? "")
    .replace(new RegExp(escaped, "gi"), "[REDACTED_PROJECT_REF]")
    .replace(new RegExp(escapedEvidenceDir, "g"), "[EVIDENCE_DIR]")
    .replace(new RegExp(escapedRepo, "g"), "[RELEASE_REPO]")
    .replace(/db\.[a-z0-9-]+\.supabase\.co/gi, "[REDACTED_DATABASE_HOST]")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(password\s*[=:]\s*)\S+/gi, "$1[REDACTED]");
}

function existingExactFailureEvidence(stage, error, projectRef) {
  const failureCode = existingExactVerificationFailureCodes[stage];
  if (!failureCode) {
    throw new Error("Existing exact verification failure stage is not allowlisted");
  }
  const boundedSanitizedError = sanitized(
    error instanceof Error ? `${error.name}:${error.message}` : `NON_ERROR_THROW:${String(error)}`,
    projectRef,
  )
    .replace(
      /((?:access[_ -]?token|token|password|secret|api[_ -]?key|cookie)\s*[=:]\s*)\S+/gi,
      "$1[REDACTED]",
    )
    .replace(/\b[A-Za-z0-9+/_-]{48,}={0,2}\b/g, "[REDACTED_LONG_VALUE]")
    .slice(0, 4_000);
  return Object.freeze({
    failureStage: stage,
    failureCode,
    sanitizedErrorSha256: sha256(boundedSanitizedError),
    rawErrorPersisted: false,
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeoutMs ?? 180_000,
    input: options.input,
    env: options.env,
  });
  if (result.error || result.status !== 0) {
    throw new Error(options.errorLabel ?? `${basename(command)} failed`);
  }
  return (result.stdout ?? "").trim();
}

function git(args, label) {
  const result = spawnSync("/usr/bin/git", args, {
    cwd: repo,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "/private/tmp",
      LANG: "C",
      LC_ALL: "C",
    },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60_000,
  });
  if (result.error || result.status !== 0) throw new Error(label);
  return result.stdout ?? "";
}

function trackedWorktreeIdentity() {
  const index = git(["ls-files", "--stage", "-z"], "Unable to enumerate the release index");
  const entries = index.split("\0").filter(Boolean).map((entry) => {
    const match = /^(\d{6}) ([0-9a-f]{40,64}) ([0-3])\t([\s\S]+)$/.exec(entry);
    if (!match || match[3] !== "0") {
      throw new Error("The release index contains an unsupported or unmerged entry");
    }
    return { mode: match[1], path: match[4] };
  });
  const digest = createHash("sha256");
  for (const entry of entries) {
    const absolutePath = join(repo, entry.path);
    const stat = lstatSync(absolutePath);
    let contents;
    if (entry.mode === "120000") {
      if (!stat.isSymbolicLink()) throw new Error("A tracked symlink changed type");
      contents = Buffer.from(readlinkSync(absolutePath));
    } else {
      if (!stat.isFile()) throw new Error("A tracked release file changed type");
      contents = readFileSync(absolutePath);
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

function captureCleanReleaseIdentity() {
  if (realpathSync(repo) !== realpathSync(expectedRepo)) {
    throw new Error("The migration broker is not running from the exact isolated release worktree");
  }
  const beforeCommit = git(
    ["rev-parse", "--verify", "HEAD"],
    "Unable to identify the release commit",
  ).trim();
  const beforeTree = git(
    ["rev-parse", "--verify", "HEAD^{tree}"],
    "Unable to identify the release tree",
  ).trim();
  const beforeStatus = git(
    ["status", "--porcelain=v1", "--untracked-files=all", "-z"],
    "Unable to inspect the release worktree",
  );
  if (beforeStatus !== "") {
    throw new Error("The migration broker requires a completely clean release worktree");
  }
  const branch = git(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    "Unable to identify the release branch",
  ).trim();
  if (branch !== "codex/dealflow-part1-closure-20260811") {
    throw new Error("The migration broker requires the exact isolated release branch");
  }
  const tracked = trackedWorktreeIdentity();
  const afterCommit = git(
    ["rev-parse", "--verify", "HEAD"],
    "Unable to recheck the release commit",
  ).trim();
  const afterTree = git(
    ["rev-parse", "--verify", "HEAD^{tree}"],
    "Unable to recheck the release tree",
  ).trim();
  const afterStatus = git(
    ["status", "--porcelain=v1", "--untracked-files=all", "-z"],
    "Unable to recheck the release worktree",
  );
  if (
    afterStatus !== "" ||
    afterCommit !== beforeCommit ||
    afterTree !== beforeTree
  ) {
    throw new Error("The release identity changed during broker preflight");
  }
  return Object.freeze({
    headCommit: beforeCommit,
    headTree: beforeTree,
    branch,
    ...tracked,
  });
}

function migrationPortfolioIdentity() {
  if (
    migrations.length !== exactMigrationCount ||
    !migrations.includes(requiredFinalMigration) ||
    new Set(migrations.map((name) => name.slice(0, 14))).size !== migrations.length
  ) {
    throw new Error(`The exact ${exactMigrationCount}-migration portfolio is not present`);
  }
  const digest = createHash("sha256");
  const records = migrations.map((name) => {
    const contents = readFileSync(join(migrationDir, name));
    digest.update(String(Buffer.byteLength(name)));
    digest.update("\0");
    digest.update(name);
    digest.update("\0");
    digest.update(String(contents.byteLength));
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
    return { name, sha256: sha256(contents), bytes: contents.byteLength };
  });
  return Object.freeze({
    migrationCount: records.length,
    migrationPortfolioSha256: digest.digest("hex"),
    records,
  });
}

function readPassingVerificationSummary(path, expectedRound) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Verification round ${expectedRound} summary must be a real file`);
  }
  const summary = JSON.parse(readFileSync(path, "utf8"));
  const evidence = assertFinalVerificationEvidenceIsSealable(dirname(path));
  assertExactFinalVerificationSummaryPortfolio(
    summary,
    `Verification round ${expectedRound} portfolio`,
  );
  if (
    summary.schemaVersion !== "dealflow.final-verification.v3" ||
    String(summary.round) !== expectedRound ||
    !/^v24\./.test(summary.runtime ?? "") ||
    summary.repositoryInvariant !== "passed" ||
    evidence.status !== "PASS" ||
    evidence.fileCountBeforeSummary !== summary.evidenceTreeFileCountBeforeSummary ||
    evidence.totalFileCount !== summary.evidenceTreeFileCountBeforeSummary + 1 ||
    evidence.evidenceTreeSha256BeforeSummary !==
      summary.evidenceTreeSha256BeforeSummary ||
    evidence.browser.status !== summary.localBrowserEvidenceStatus ||
    evidence.browser.screenshotCount !== summary.localBrowserScreenshotCount ||
    JSON.stringify(evidence.browser.projectScreenshotCounts) !==
      JSON.stringify(summary.localBrowserProjectScreenshotCounts) ||
    summary.localGateStatus !== expectedVerificationLocalGate ||
    summary.failedCount !== 0 ||
    summary.blockedCount !== expectedHostedVerificationDeferrals.length ||
    summary.environmentOnlyDeferredCount !== expectedHostedVerificationDeferrals.length ||
    !Array.isArray(summary.environmentOnlyDeferrals) ||
    JSON.stringify(
      summary.environmentOnlyDeferrals.map((item) => item.command).sort(),
    ) !== JSON.stringify(expectedHostedVerificationDeferrals) ||
    summary.environmentOnlyDeferrals.some(
      (item) => item.status !== "authenticated_deferred",
    ) ||
    summary.commandCount !== summary.plannedCommandCount ||
    summary.passedCount !== summary.plannedCommandCount ||
    !Array.isArray(summary.records) ||
    summary.records.length !== summary.plannedCommandCount ||
    summary.records[0]?.command !== "npm ci --ignore-scripts --no-audit --no-fund" ||
    summary.records[1]?.command !== "npm ls --all" ||
    summary.records.some(
      (record) =>
        record.status !== "passed" ||
        record.exitCode !== 0 ||
        record.postCommandRepositoryInvariant !== "passed" ||
        record.workingDirectory !== expectedRepo,
    )
  ) {
    throw new Error(`Verification round ${expectedRound} is not a complete passing exact-seal proof`);
  }
  return summary;
}

function assertOutsideRelease(path, label) {
  const pathRelativeToRepo = relative(realpathSync(repo), realpathSync(path));
  if (
    pathRelativeToRepo === "" ||
    (!pathRelativeToRepo.startsWith(`..${sep}`) &&
      pathRelativeToRepo !== "..")
  ) {
    throw new Error(`${label} must remain outside the release repository`);
  }
}

function prepareEvidenceDirectory() {
  if (existsSync(evidenceDir)) {
    const stat = lstatSync(evidenceDir);
    if (stat.isSymbolicLink() || !stat.isDirectory() || readdirSync(evidenceDir).length > 0) {
      throw new Error("Evidence directory must be a real absent-or-empty directory");
    }
  } else {
    let existingParent = dirname(evidenceDir);
    while (!existsSync(existingParent)) existingParent = dirname(existingParent);
    const projected = resolve(realpathSync(existingParent), relative(existingParent, evidenceDir));
    const projectedRelative = relative(realpathSync(repo), projected);
    if (projectedRelative === "" || (!projectedRelative.startsWith(`..${sep}`) && projectedRelative !== "..")) {
      throw new Error("Evidence directory projected path must remain outside the release repository");
    }
    mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  }
  chmodSync(evidenceDir, 0o700);
  assertOutsideRelease(evidenceDir, "Evidence directory");
}

function writeJsonEvidence(name, payload) {
  if (!/^[a-z0-9][a-z0-9._-]+\.json$/.test(name)) {
    throw new Error("Evidence artifact name is invalid");
  }
  const contents = `${JSON.stringify(payload, null, 2)}\n`;
  const path = join(evidenceDir, name);
  writeFileSync(path, contents, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
  return Object.freeze({
    path: name,
    sha256: sha256(contents),
    bytes: Buffer.byteLength(contents),
  });
}

function transactionSafeMigrationSource(file, source) {
  const begins = [...source.matchAll(/^BEGIN;\s*$/gim)];
  const commits = [...source.matchAll(/^COMMIT;\s*$/gim)];
  const nontransactionalStatement = [
    /^\s*vacuum\b/im,
    /^\s*create\s+(?:unique\s+)?index\s+concurrently\b/im,
    /^\s*drop\s+index\s+concurrently\b/im,
    /^\s*reindex\b[^;]*\bconcurrently\b/im,
    /^\s*reindex\s+(?:database|system)\b/im,
    /^\s*refresh\s+materialized\s+view\s+concurrently\b/im,
    /^\s*alter\s+system\b/im,
    /^\s*(?:create|drop)\s+database\b/im,
    /^\s*(?:create|drop)\s+tablespace\b/im,
    /^\s*cluster\b/im,
    /^\s*checkpoint\b/im,
    /^\s*discard\s+all\b/im,
    /^\s*(?:create|drop)\s+subscription\b/im,
    /^\\/m,
  ].find((pattern) => pattern.test(source));
  if (nontransactionalStatement) {
    throw new Error(`Migration ${file} is not compatible with the required outer transaction`);
  }
  let normalizedSource = source;
  if (file === transactionOwningMigration) {
    if (begins.length !== 1 || commits.length !== 1) {
      throw new Error("The catalog gate transaction boundary drifted");
    }
    normalizedSource = source.replace(/^BEGIN;\s*$/im, "").replace(/^COMMIT;\s*$/im, "");
  } else if (begins.length !== 0 || commits.length !== 0) {
    throw new Error(`Unexpected top-level transaction boundary in ${file}`);
  }
  if (/^\s*(?:(?:start\s+transaction|begin\s+(?:work|transaction)|commit(?:\s+and\s+chain)?|rollback(?:\s+(?:work|transaction))?(?:\s+and\s+chain)?|end\s+transaction|savepoint\s+\S+|release\s+(?:savepoint\s+)?\S+|rollback\s+to\s+(?:savepoint\s+)?\S+))\s*;/im.test(normalizedSource)) {
    throw new Error(`Unexpected transaction-control statement in ${file}`);
  }
  return normalizedSource;
}

function buildAtomicMigrationTransaction(sources) {
  const statements = [
    "\\set ON_ERROR_STOP on",
    "begin;",
    "set role postgres;",
    "create schema if not exists supabase_migrations;",
    `create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[] not null default array[]::text[]
    );`,
  ];
  for (const { version, transactionSafeBody } of sources) {
    statements.push(
      `\\echo DEALFLOW_MIGRATION_ATTEMPTED:${version}`,
      transactionSafeBody,
      `insert into supabase_migrations.schema_migrations(version, statements)
       values ('${version}', array[]::text[]);`,
      `\\echo DEALFLOW_MIGRATION_APPLIED:${version}`,
    );
  }
  statements.push(
    "reset role;",
    "commit;",
    "\\echo DEALFLOW_MIGRATION_TRANSACTION_COMMITTED",
  );
  return `${statements.join("\n")}\n`;
}

if (roundSummaryPaths[0] === roundSummaryPaths[1]) {
  throw new Error("Two distinct final-verification summaries are required");
}
const releaseIdentity = captureCleanReleaseIdentity();
const migrationIdentity = migrationPortfolioIdentity();
const successorForwardPortfolio = assertExactForward104To120Portfolio(
  migrationIdentity.records.slice(0, FORWARD_104_TO_120_AUTHORITY.current.migrationCount),
  migrationDir,
);
assertExactForward120To121Portfolio(
  migrationIdentity.records.slice(0, FORWARD_120_TO_121_AUTHORITY.current.migrationCount),
  migrationDir,
);
const locationTokenScopeSuccessorPortfolio = assertExactForward122To123Portfolio(
  migrationIdentity.records.slice(0, FORWARD_122_TO_123_AUTHORITY.current.migrationCount),
  migrationDir,
);
const migrationSources = migrations.map((file) => {
  const body = readFileSync(join(migrationDir, file), "utf8");
  return {
    file,
    version: file.slice(0, 14),
    body,
    transactionSafeBody: transactionSafeMigrationSource(file, body),
  };
});
const atomicMigrationTransaction = buildAtomicMigrationTransaction(migrationSources);
const forwardMigrationSources = migrationSources.slice(
  FORWARD_104_TO_120_AUTHORITY.prior.migrationCount,
);
const forwardAtomicMigrationTransaction = buildAtomicMigrationTransaction(
  forwardMigrationSources,
);
const locationTokenScopeSuccessorMigrationSources = migrationSources.slice(
  FORWARD_122_TO_123_AUTHORITY.prior.migrationCount,
  FORWARD_122_TO_123_AUTHORITY.current.migrationCount,
);
const locationTokenScopeSuccessorAtomicMigrationTransaction = buildAtomicMigrationTransaction(
  locationTokenScopeSuccessorMigrationSources,
);
const postPortfolioReleaseIdentity = captureCleanReleaseIdentity();
for (const key of ["headCommit", "headTree", "trackedWorktreeSha256", "trackedFileCount"]) {
  if (postPortfolioReleaseIdentity[key] !== releaseIdentity[key]) {
    throw new Error(`The release ${key} changed while binding the migration portfolio`);
  }
}
const dependencyLockSha256 = sha256(readFileSync(join(repo, "package-lock.json")));
for (const path of roundSummaryPaths) assertOutsideRelease(dirname(path), "Verification evidence");
const verificationRounds = roundSummaryPaths.map((path, index) =>
  readPassingVerificationSummary(path, String(index + 1))
);
const verificationNativePostgresRuntimes = verificationRounds.map(
  (round, index) =>
    extractFinalVerificationNativePostgresRuntime(
      round.records.map((record) => record.command),
      `Verification round ${index + 1} native PostgreSQL runtime`,
    ),
);
if (
  JSON.stringify(verificationNativePostgresRuntimes[0]) !==
  JSON.stringify(verificationNativePostgresRuntimes[1])
) {
  throw new Error(
    "The two exact-seal verification rounds do not bind the same native PostgreSQL runtime",
  );
}
const expectedPostgresBin = verificationNativePostgresRuntimes[0].pgbin;
const verificationRoundSummarySha256 = roundSummaryPaths.map((path) =>
  sha256(readFileSync(path)),
);
for (const [label, actual] of Object.entries({
  headCommit: releaseIdentity.headCommit,
  headTree: releaseIdentity.headTree,
  trackedWorktreeSha256: releaseIdentity.trackedWorktreeSha256,
  trackedFileCount: releaseIdentity.trackedFileCount,
  dependencyLockSha256,
  migrationCount: migrationIdentity.migrationCount,
  migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
})) {
  if (verificationRounds.some((round) => round[label] !== actual)) {
    throw new Error(`Final-verification seal mismatch for ${label}`);
  }
}
if (
  verificationRounds[0].headCommit !== verificationRounds[1].headCommit ||
  verificationRounds[0].headTree !== verificationRounds[1].headTree ||
  verificationRounds[0].trackedWorktreeSha256 !== verificationRounds[1].trackedWorktreeSha256 ||
  verificationRounds[0].resolvedCommandPortfolioSha256 !==
    verificationRounds[1].resolvedCommandPortfolioSha256 ||
  verificationRounds[0].migrationPortfolioSha256 !==
    verificationRounds[1].migrationPortfolioSha256 ||
  JSON.stringify(verificationRounds[0].migrationFiles) !==
    JSON.stringify(migrationIdentity.records) ||
  JSON.stringify(verificationRounds[1].migrationFiles) !==
    JSON.stringify(migrationIdentity.records)
) {
  throw new Error(
    "The two exact-seal verification rounds do not bind the same runtime command and migration portfolios",
  );
}
prepareEvidenceDirectory();

const intentionallyAbsentPgpassPath = join(
  evidenceDir,
  ".intentionally-absent-pgpass",
);
if (existsSync(intentionallyAbsentPgpassPath)) {
  throw new Error("The intentionally absent staging pgpass path already exists");
}

const projectRecordStat = lstatSync(projectRecordPath);
const projectRecordRelationToRepo = relative(expectedRepo, projectRecordPath);
if (
  projectRecordStat.isSymbolicLink() ||
  !projectRecordStat.isFile() ||
  projectRecordStat.nlink !== 1 ||
  projectRecordStat.uid !== process.getuid() ||
  (projectRecordStat.mode & 0o077) !== 0 ||
  realpathSync(projectRecordPath) !== projectRecordPath ||
  projectRecordRelationToRepo === "" ||
  (!projectRecordRelationToRepo.startsWith(`..${sep}`) &&
    projectRecordRelationToRepo !== "..")
) {
  throw new Error("The staging project attestation must be a real owner-only file");
}
const projectRecord = JSON.parse(readFileSync(projectRecordPath, "utf8"));
const projectRef = String(projectRecord.ref ?? "").trim().toLowerCase();
if (
  !/^[a-z0-9]{20}$/.test(projectRef) ||
  projectRecord.name !== "dealflow-staging-20260712" ||
  (projectRecord.status !== "ACTIVE_HEALTHY" && projectRecord.status !== "ACTIVE") ||
  projectRef.slice(-4) !== expectedProjectSafeSuffix ||
  sha256(projectRef) !== expectedProjectFingerprint
) {
  throw new Error("The exact isolated staging project attestation is invalid");
}
const postgresBin = process.env.DEALFLOW_NATIVE_PGBIN;
if (
  !postgresBin ||
  !existsSync(postgresBin) ||
  realpathSync(postgresBin) !== realpathSync(expectedPostgresBin)
) {
  throw new Error("DEALFLOW_NATIVE_PGBIN must be the exact pinned PostgreSQL 17.6 runtime");
}
const psql = join(postgresBin, "psql");
const pgDump = join(postgresBin, "pg_dump");
for (const binary of [psql, pgDump]) {
  const stat = lstatSync(binary);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("The pinned PostgreSQL runtime contains an unsupported binary identity");
  }
}
const postgresBinarySha256 = {
  psql: sha256(readFileSync(psql)),
  pgDump: sha256(readFileSync(pgDump)),
};
const trustBundleStat = lstatSync(expectedTrustBundlePath);
const trustBundleBytes = readFileSync(expectedTrustBundlePath);
const committedTrustBundleBytes = git(
  ["show", `${releaseIdentity.headCommit}:${expectedTrustBundleRelativePath}`],
  "Unable to recover the committed Supabase trust bundle",
);
if (
  trustBundleStat.isSymbolicLink() ||
  !trustBundleStat.isFile() ||
  (trustBundleStat.mode & 0o022) !== 0 ||
  realpathSync(expectedTrustBundlePath) !== expectedTrustBundlePath ||
  sha256(trustBundleBytes) !== expectedTrustBundleSha256 ||
  sha256(committedTrustBundleBytes) !== expectedTrustBundleSha256
) {
  throw new Error("The pinned tracked Supabase TLS trust bundle identity is invalid");
}
const tlsServerAuthentication = Object.freeze({
  mode: "verify-full",
  trustBundlePath: expectedTrustBundlePath,
  trustBundleRelativePath: expectedTrustBundleRelativePath,
  trustBundleSha256: expectedTrustBundleSha256,
  trustBundleOwnerUid: trustBundleStat.uid,
  trustBundleTrackedAtCommit: true,
  trustBundleGroupOrWorldWritable: false,
});
const databaseEnv = {
  PATH: `${postgresBin}:/usr/bin:/bin`,
  PGHOST: `db.${projectRef}.supabase.co`,
  PGPORT: "5432",
  PGUSER: "postgres",
  PGDATABASE: "postgres",
  PGSSLMODE: "verify-full",
  PGSSLROOTCERT: expectedTrustBundlePath,
  PGPASSFILE: intentionallyAbsentPgpassPath,
  ...(["VERIFY_EXISTING_EXACT", "ADOPT_CURRENT_EXACT"].includes(migrationMode)
    ? { PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=300000" }
    : {}),
};

function readKeychainPasswordBuffer() {
  const result = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", "-s", keychainService, "-a", keychainAccount, "-w"],
    {
      encoding: null,
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
      env: { PATH: "/usr/bin:/bin" },
    },
  );
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new Error("The staging database Keychain authority is unavailable");
  }
  const raw = result.stdout;
  let end = raw.length;
  while (end > 0 && (raw[end - 1] === 0x0a || raw[end - 1] === 0x0d)) end -= 1;
  if (
    end === 0 ||
    raw.subarray(0, end).includes(0x00) ||
    raw.subarray(0, end).includes(0x0a) ||
    raw.subarray(0, end).includes(0x0d)
  ) {
    raw.fill(0);
    throw new Error("The staging database Keychain authority is malformed");
  }
  const password = Buffer.from(raw.subarray(0, end));
  raw.fill(0);
  return password;
}

function spawnPostgresCommand(command, args, options = {}) {
  const password = readKeychainPasswordBuffer();
  const sqlInput = Buffer.from(String(options.input ?? ""), "utf8");
  const inputBuffer = Buffer.concat([password, Buffer.from("\n"), sqlInput]);
  password.fill(0);
  sqlInput.fill(0);
  try {
    return spawnSync(command, ["--password", ...args], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: options.timeoutMs ?? 180_000,
      input: inputBuffer,
      env: databaseEnv,
    });
  } finally {
    inputBuffer.fill(0);
  }
}

function runPostgresCommand(command, args, options = {}) {
  const result = spawnPostgresCommand(command, args, options);
  if (result.error || result.status !== 0) {
    throw new Error(options.errorLabel ?? `${basename(command)} failed`);
  }
  return (result.stdout ?? "").trim();
}

function sql(query, label, timeoutMs = 180_000) {
  try {
    return runPostgresCommand(
      psql,
      ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--quiet"],
      { input: query, timeoutMs, errorLabel: label },
    );
  } catch (error) {
    throw new Error(sanitized(`${label}: ${error.message}`, projectRef));
  }
}

function executeBoundMigrationTransaction(transactionSql) {
  const result = spawnPostgresCommand(
    psql,
    [
      "-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose",
      "--tuples-only", "--no-align", "--quiet",
    ],
    {
      timeout: 1_800_000,
      input: transactionSql,
      timeoutMs: 1_800_000,
    },
  );
  const stdout = result.stdout ?? "";
  const attempted = [...stdout.matchAll(/^DEALFLOW_MIGRATION_ATTEMPTED:(\d{14})$/gm)]
    .map((match) => match[1]);
  const appliedInTransaction = [
    ...stdout.matchAll(/^DEALFLOW_MIGRATION_APPLIED:(\d{14})$/gm),
  ].map((match) => match[1]);
  const diagnostic = sanitized(String(result.stderr ?? ""), projectRef)
    .replace(/((?:access[_ -]?token|token|password|secret|api[_ -]?key|cookie)\s*[=:]\s*)\S+/gi, "$1[REDACTED]")
    .replace(/\b[A-Za-z0-9+/_-]{48,}={0,2}\b/g, "[REDACTED_LONG_VALUE]")
    .split(/\r?\n/)
    .map((line) => line.replace(/[\u0000-\u001f\u007f]/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((line) => line.slice(0, 500))
    .join("\n")
    .slice(0, 4_000);
  const sqlstate = diagnostic.match(/(?:ERROR|FATAL|PANIC):\s+([0-9A-Z]{5}):/i)?.[1]
    ?.toUpperCase() ?? null;
  return Object.freeze({
    succeeded: !result.error && result.status === 0,
    transactionCommitMarkerSeen: /^DEALFLOW_MIGRATION_TRANSACTION_COMMITTED$/m.test(stdout),
    attempted,
    appliedInTransaction,
    lastAttemptedVersion: attempted.at(-1) ?? null,
    lastAppliedVersion: appliedInTransaction.at(-1) ?? null,
    processExitStatus: Number.isInteger(result.status) ? result.status : null,
    processSignal: result.signal ?? null,
    processError: Boolean(result.error),
    processErrorCode: /^[A-Z0-9_]{2,40}$/.test(result.error?.code ?? "")
      ? result.error.code
      : null,
    databaseSqlstate: sqlstate,
    sanitizedDatabaseDiagnostic: diagnostic || null,
    sanitizedDatabaseDiagnosticSha256: diagnostic ? sha256(diagnostic) : null,
  });
}

function executeAtomicMigrationTransaction() {
  return executeBoundMigrationTransaction(atomicMigrationTransaction);
}

function executeForwardMigrationTransaction() {
  return executeBoundMigrationTransaction(forwardAtomicMigrationTransaction);
}

function executeLocationTokenScopeSuccessorMigrationTransaction() {
  return executeBoundMigrationTransaction(locationTokenScopeSuccessorAtomicMigrationTransaction);
}

function captureRemoteCatalogIdentity(label) {
  const material = sql(
    `with catalog(item) as (
       select jsonb_build_array('namespace', n.nspname, n.nspacl)::text
       from pg_namespace n
       where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
       union all
       select jsonb_build_array('extension', e.extname, e.extversion, n.nspname)::text
       from pg_extension e join pg_namespace n on n.oid=e.extnamespace
       union all
       select jsonb_build_array('role', r.rolname, r.rolsuper, r.rolinherit, r.rolcreaterole,
         r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit)::text
       from pg_roles r where r.rolname !~ '^pg_'
       union all
       select jsonb_build_array('relation', n.nspname, c.relname, c.relkind,
         c.relpersistence, c.relrowsecurity, c.relforcerowsecurity, c.relacl)::text
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
       union all
       select jsonb_build_array('column', n.nspname, c.relname, a.attnum, a.attname,
         format_type(a.atttypid,a.atttypmod), a.attnotnull,
         pg_get_expr(d.adbin,d.adrelid))::text
       from pg_attribute a
       join pg_class c on c.oid=a.attrelid
       join pg_namespace n on n.oid=c.relnamespace
       left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
       where a.attnum > 0 and not a.attisdropped
         and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
       union all
       select jsonb_build_array('constraint', n.nspname, c.relname, x.conname,
         x.contype, pg_get_constraintdef(x.oid,true))::text
       from pg_constraint x
       join pg_class c on c.oid=x.conrelid
       join pg_namespace n on n.oid=c.relnamespace
       where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
       union all
       select jsonb_build_array('function', n.nspname, p.proname,
         pg_get_function_identity_arguments(p.oid), p.prokind, p.prosecdef,
         p.provolatile, p.proparallel, p.proacl, p.proconfig)::text
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
       union all
       select jsonb_build_array('type', n.nspname, t.typname, t.typtype,
         t.typcategory, t.typnotnull, t.typacl)::text
       from pg_type t join pg_namespace n on n.oid=t.typnamespace
       where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
       union all
       select jsonb_build_array('enum', n.nspname, t.typname, e.enumsortorder, e.enumlabel)::text
       from pg_enum e
       join pg_type t on t.oid=e.enumtypid
       join pg_namespace n on n.oid=t.typnamespace
       where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
       union all
       select jsonb_build_array('policy', schemaname, tablename, policyname,
         permissive, roles, cmd, qual, with_check)::text
       from pg_policies
       union all
       select jsonb_build_array('trigger', n.nspname, c.relname, t.tgname,
         pg_get_triggerdef(t.oid,true))::text
       from pg_trigger t
       join pg_class c on c.oid=t.tgrelid
       join pg_namespace n on n.oid=c.relnamespace
       where not t.tgisinternal and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
       union all
       select jsonb_build_array('publication', p.pubname, p.puballtables,
         p.pubinsert, p.pubupdate, p.pubdelete, p.pubtruncate)::text
       from pg_publication p
       union all
       select jsonb_build_array('publication_relation', p.pubname, n.nspname, c.relname)::text
       from pg_publication_rel pr
       join pg_publication p on p.oid=pr.prpubid
       join pg_class c on c.oid=pr.prrelid
       join pg_namespace n on n.oid=c.relnamespace
     ) select item from catalog order by item;`,
    label,
    300_000,
  );
  return Object.freeze({
    structuralCatalogSha256: sha256(material),
    structuralCatalogRecordCount: material ? material.split("\n").length : 0,
  });
}

function captureManagedCatalogIdentity(label) {
  const material = sql(
    `set search_path=pg_catalog;
     with catalog(item) as (
       select jsonb_build_array('namespace', namespace.nspname,
         case when namespace.nspacl is null then null else (
           select jsonb_agg(acl_item::text order by acl_item::text)
           from unnest(namespace.nspacl) acl_item
         ) end)::text
       from pg_namespace namespace
       where namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('relation', namespace.nspname, relation.relname,
         relation.relkind, relation.relpersistence, relation.relrowsecurity,
         relation.relforcerowsecurity,
         case when relation.relacl is null then null else (
           select jsonb_agg(acl_item::text order by acl_item::text)
           from unnest(relation.relacl) acl_item
         ) end)::text
       from pg_class relation
       join pg_namespace namespace on namespace.oid=relation.relnamespace
       where namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('column', namespace.nspname, relation.relname,
         attribute.attnum, attribute.attname,
         format_type(attribute.atttypid,attribute.atttypmod), attribute.attnotnull,
         pg_get_expr(default_value.adbin,default_value.adrelid))::text
       from pg_attribute attribute
       join pg_class relation on relation.oid=attribute.attrelid
       join pg_namespace namespace on namespace.oid=relation.relnamespace
       left join pg_attrdef default_value
         on default_value.adrelid=attribute.attrelid
        and default_value.adnum=attribute.attnum
       where attribute.attnum > 0 and not attribute.attisdropped
         and namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('constraint', namespace.nspname, relation.relname,
         constraint_record.conname, constraint_record.contype,
         pg_get_constraintdef(constraint_record.oid,true))::text
       from pg_constraint constraint_record
       join pg_class relation on relation.oid=constraint_record.conrelid
       join pg_namespace namespace on namespace.oid=relation.relnamespace
       where namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('function', namespace.nspname, procedure.proname,
         pg_get_function_identity_arguments(procedure.oid), procedure.prokind,
         procedure.prosecdef, procedure.provolatile, procedure.proparallel,
         case when procedure.proacl is null then null else (
           select jsonb_agg(acl_item::text order by acl_item::text)
           from unnest(procedure.proacl) acl_item
         ) end, procedure.proconfig)::text
       from pg_proc procedure
       join pg_namespace namespace on namespace.oid=procedure.pronamespace
       where namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('type', namespace.nspname, type_record.typname,
         type_record.typtype, type_record.typcategory, type_record.typnotnull,
         case when type_record.typacl is null then null else (
           select jsonb_agg(acl_item::text order by acl_item::text)
           from unnest(type_record.typacl) acl_item
         ) end)::text
       from pg_type type_record
       join pg_namespace namespace on namespace.oid=type_record.typnamespace
       where namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('enum', namespace.nspname, type_record.typname,
         enum_record.enumsortorder, enum_record.enumlabel)::text
       from pg_enum enum_record
       join pg_type type_record on type_record.oid=enum_record.enumtypid
       join pg_namespace namespace on namespace.oid=type_record.typnamespace
       where namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('policy', schemaname, tablename, policyname,
         permissive, roles, cmd, qual, with_check)::text
       from pg_policies
       where schemaname in ('public','private')
       union all
       select jsonb_build_array('trigger', namespace.nspname, relation.relname,
         trigger_record.tgname, pg_get_triggerdef(trigger_record.oid,true))::text
       from pg_trigger trigger_record
       join pg_class relation on relation.oid=trigger_record.tgrelid
       join pg_namespace namespace on namespace.oid=relation.relnamespace
       where not trigger_record.tgisinternal
         and namespace.nspname in ('public','private')
       union all
       select jsonb_build_array('publication_relation', publication.pubname,
         namespace.nspname, relation.relname)::text
       from pg_publication_rel publication_relation
       join pg_publication publication on publication.oid=publication_relation.prpubid
       join pg_class relation on relation.oid=publication_relation.prrelid
       join pg_namespace namespace on namespace.oid=relation.relnamespace
       where namespace.nspname in ('public','private')
     ) select item from catalog order by item;`,
    label,
    300_000,
  );
  const canonicalMaterial = canonicalizeManagedCatalogMaterial(material);
  return Object.freeze({
    managedStructuralCatalogSha256: sha256(canonicalMaterial),
    managedStructuralCatalogRecordCount: canonicalMaterial
      ? canonicalMaterial.split("\n").length
      : 0,
  });
}

// This is intentionally the same independently reviewed security projection
// used by the disposable PostgreSQL 17.6 integrated-chain oracle. It excludes
// Supabase-owned platform schemas while binding every DealFlow-managed ACL,
// policy, routine definition, and default privilege in public/private.
function captureManagedSecurityOracle(labelPrefix) {
  const sections = [
    ["schema_acl", `
      select jsonb_build_object(
        'schema', namespace.nspname,
        'grantor', grantor.rolname,
        'grantee', coalesce(grantee.rolname, 'PUBLIC'),
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      )::text
      from pg_namespace namespace
      cross join lateral aclexplode(coalesce(
        namespace.nspacl,
        acldefault('n'::"char", namespace.nspowner)
      )) privilege
      join pg_roles grantor on grantor.oid = privilege.grantor
      left join pg_roles grantee on grantee.oid = privilege.grantee
      where namespace.nspname in ('public', 'private')
      order by namespace.nspname, grantor.rolname,
        coalesce(grantee.rolname, 'PUBLIC'), privilege.privilege_type,
        privilege.is_grantable;
    `],
    ["relation_acl", `
      select jsonb_build_object(
        'schema', namespace.nspname,
        'relation', relation.relname,
        'kind', relation.relkind,
        'grantor', grantor.rolname,
        'grantee', coalesce(grantee.rolname, 'PUBLIC'),
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      )::text
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      cross join lateral aclexplode(coalesce(
        relation.relacl,
        acldefault(
          case when relation.relkind = 'S' then 'S'::"char" else 'r'::"char" end,
          relation.relowner
        )
      )) privilege
      join pg_roles grantor on grantor.oid = privilege.grantor
      left join pg_roles grantee on grantee.oid = privilege.grantee
      where namespace.nspname in ('public', 'private')
        and relation.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
      order by namespace.nspname, relation.relname, relation.relkind,
        grantor.rolname, coalesce(grantee.rolname, 'PUBLIC'),
        privilege.privilege_type, privilege.is_grantable;
    `],
    ["routine_acl", `
      select jsonb_build_object(
        'schema', namespace.nspname,
        'routine', routine.proname,
        'arguments', pg_get_function_identity_arguments(routine.oid),
        'grantor', grantor.rolname,
        'grantee', coalesce(grantee.rolname, 'PUBLIC'),
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      )::text
      from pg_proc routine
      join pg_namespace namespace on namespace.oid = routine.pronamespace
      cross join lateral aclexplode(coalesce(
        routine.proacl,
        acldefault('f'::"char", routine.proowner)
      )) privilege
      join pg_roles grantor on grantor.oid = privilege.grantor
      left join pg_roles grantee on grantee.oid = privilege.grantee
      where namespace.nspname in ('public', 'private')
      order by namespace.nspname, routine.proname,
        pg_get_function_identity_arguments(routine.oid), grantor.rolname,
        coalesce(grantee.rolname, 'PUBLIC'), privilege.privilege_type,
        privilege.is_grantable;
    `],
    ["default_acl", `
      select jsonb_build_object(
        'owner', owner.rolname,
        'schema', coalesce(namespace.nspname, '*'),
        'objectType', defaults.defaclobjtype,
        'grantor', grantor.rolname,
        'grantee', coalesce(grantee.rolname, 'PUBLIC'),
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      )::text
      from pg_default_acl defaults
      join pg_roles owner on owner.oid = defaults.defaclrole
      left join pg_namespace namespace on namespace.oid = defaults.defaclnamespace
      cross join lateral aclexplode(defaults.defaclacl) privilege
      join pg_roles grantor on grantor.oid = privilege.grantor
      left join pg_roles grantee on grantee.oid = privilege.grantee
      where namespace.nspname in ('public', 'private')
         or defaults.defaclnamespace = 0
      order by owner.rolname, coalesce(namespace.nspname, '*'),
        defaults.defaclobjtype, grantor.rolname,
        coalesce(grantee.rolname, 'PUBLIC'), privilege.privilege_type,
        privilege.is_grantable;
    `],
    ["policies", `
      select jsonb_build_object(
        'schema', namespace.nspname,
        'table', relation.relname,
        'name', policy.polname,
        'permissive', policy.polpermissive,
        'command', policy.polcmd,
        'roles', coalesce((
          select string_agg(
            coalesce(role_name.rolname, 'PUBLIC'),
            ',' order by coalesce(role_name.rolname, 'PUBLIC')
          )
          from unnest(policy.polroles) as policy_role(oid)
          left join pg_roles role_name on role_name.oid = policy_role.oid
        ), ''),
        'using', coalesce(pg_get_expr(policy.polqual, policy.polrelid), ''),
        'withCheck', coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '')
      )::text
      from pg_policy policy
      join pg_class relation on relation.oid = policy.polrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname in ('public', 'private')
      order by namespace.nspname, relation.relname, policy.polname;
    `],
    ["functions", `
      select jsonb_build_object(
        'schema', namespace.nspname,
        'name', routine.proname,
        'arguments', pg_get_function_identity_arguments(routine.oid),
        'result', pg_get_function_result(routine.oid),
        'language', language.lanname,
        'securityDefiner', routine.prosecdef,
        'volatility', routine.provolatile,
        'parallel', routine.proparallel,
        'strict', routine.proisstrict,
        'leakproof', routine.proleakproof,
        'configuration', coalesce(array_to_string(routine.proconfig, ','), ''),
        'definition', pg_get_functiondef(routine.oid)
      )::text
      from pg_proc routine
      join pg_namespace namespace on namespace.oid = routine.pronamespace
      join pg_language language on language.oid = routine.prolang
      where namespace.nspname in ('public', 'private')
      order by namespace.nspname, routine.proname,
        pg_get_function_identity_arguments(routine.oid);
    `],
  ];
  const rendered = sections.map(([name, query]) =>
    `${name}\n${sql(query, `${labelPrefix} ${name}`, 300_000)}`
  );
  const normalized = rendered.join("\n-- next security oracle section --\n");
  return Object.freeze({
    managedSecurityOracleSha256: sha256(normalized),
    managedSecurityOracleBytes: Buffer.byteLength(normalized),
    managedSecuritySectionSha256: Object.freeze(Object.fromEntries(
      rendered.map((value, index) => [sections[index][0], sha256(value)]),
    )),
  });
}

function captureRemoteStructuralState(labelPrefix, attributeStage = null) {
  const setStage = (stage) => {
    if (attributeStage) attributeStage(stage);
  };
  setStage("MIGRATION_HISTORY");
  const historyTableExists = sql(
    "select to_regclass('supabase_migrations.schema_migrations') is not null;",
    `${labelPrefix} migration-history existence`,
  ) === "t";
  const migrationHistoryCount = historyTableExists
    ? Number(sql(
      "select count(*) from supabase_migrations.schema_migrations;",
      `${labelPrefix} migration-history count`,
    ))
    : 0;
  const migrationHistoryVersions = historyTableExists
    ? sql(
      "select version from supabase_migrations.schema_migrations order by version;",
      `${labelPrefix} migration-history versions`,
    ).split("\n").filter(Boolean)
    : [];
  setStage("STRUCTURAL_CATALOG_BINDING");
  const structuralCatalog = captureRemoteCatalogIdentity(
    `${labelPrefix} structural-catalog identity`,
  );
  setStage("REMOTE_STRUCTURAL_STATE");
  const publicTableCount = Number(sql(
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p');",
    `${labelPrefix} public-table count`,
  ));
  const authTableCount = Number(sql(
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relkind in ('r','p');",
    `${labelPrefix} auth-platform-table count`,
  ));
  const storageTableCount = Number(sql(
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relkind in ('r','p');",
    `${labelPrefix} storage-platform-table count`,
  ));
  const vaultTableCount = Number(sql(
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='vault' and c.relkind in ('r','p');",
    `${labelPrefix} vault-platform-table count`,
  ));
  setStage("AUTH_SURFACE");
  const authUserCount = Number(sql(
    "select count(*) from auth.users;",
    `${labelPrefix} auth-user count`,
  ));
  setStage("STORAGE_SURFACE");
  const storageObjectCount = Number(sql(
    "select count(*) from storage.objects;",
    `${labelPrefix} storage-object count`,
  ));
  const ghlEmbedAuthExchangeTableExists = sql(
    "select to_regclass('public.ghl_embed_auth_exchanges') is not null;",
    `${labelPrefix} GHL embed auth-exchange table existence`,
  ) === "t";
  const ghlEmbedAuthExchangeCount = ghlEmbedAuthExchangeTableExists
    ? Number(sql(
      "select count(*) from public.ghl_embed_auth_exchanges;",
      `${labelPrefix} GHL embed auth-exchange count`,
    ))
    : null;
  return Object.freeze({
    ...structuralCatalog,
    historyTableExists,
    migrationHistoryCount,
    migrationHistoryVersions,
    publicTableCount,
    authTableCount,
    storageTableCount,
    vaultTableCount,
    authUserCount,
    storageObjectCount,
    ghlEmbedAuthExchangeCount,
  });
}

function captureAndAssertStagingAuthSurface(label) {
  const payload = JSON.parse(sql(
    `with bounded_auth_users as (
      select email, raw_user_meta_data
      from auth.users
      order by email
      limit ${STAGING_AUTH_SURFACE_MAX_USER_COUNT}
    ), auth_count as (
      select count(*)::integer as total_count
      from auth.users
    )
    select jsonb_build_object(
      'totalCount', (select total_count from auth_count),
      'rows', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'email', email,
              'fixture', raw_user_meta_data->>'fixture',
              'synthetic', raw_user_meta_data->'synthetic',
              'scenario', raw_user_meta_data->>'scenario'
            )
            order by email
          )
          from bounded_auth_users
        ),
        '[]'::jsonb
      )
    )::text;`,
    label,
  ));
  if (
    !isAllowedStagingAuthSurfaceUserCount(payload?.totalCount) ||
    !Array.isArray(payload.rows) ||
    payload.rows.length !== payload.totalCount
  ) {
    throw new Error("Staging auth surface is neither empty nor the exact bounded synthetic fixture set");
  }
  const proof = classifyExactStagingAuthSurface(payload.rows);
  if (proof.userCount !== payload.totalCount) {
    throw new Error("Staging auth surface count and identity proof diverged");
  }
  return proof;
}

function captureAndAssertSyntheticRelationalSurface(
  syntheticAuthority,
  labelPrefix,
  { requireSuccessorCredentialTables = false } = {},
) {
  const quoteUuidArray = (values) =>
    `array[${values.map((value) => `'${value}'::uuid`).join(",")}]`;
  const allowedUsers = quoteUuidArray(syntheticAuthority.userIds);
  const allowedOrganizations = quoteUuidArray(syntheticAuthority.organizationIds);
  const organizationRows = sql(
    "select id::text || '|' || owner_user_id::text from public.organizations order by id;",
    `${labelPrefix} exact organization roots`,
  ).split("\n").filter(Boolean);
  const organizationIds = organizationRows.map((row) => row.split("|")[0]).sort();
  const organizationOwnerIds = organizationRows.map((row) => row.split("|")[1]);
  if (
    JSON.stringify(organizationIds) !== JSON.stringify(syntheticAuthority.organizationIds) ||
    organizationOwnerIds.some((value) => !syntheticAuthority.userIds.includes(value))
  ) {
    throw new Error("The staging relational surface contains an unsealed organization root");
  }
  const applicationUserIds = sql(
    "select id::text from public.users order by id;",
    `${labelPrefix} exact application-user roots`,
  ).split("\n").filter(Boolean).sort();
  if (JSON.stringify(applicationUserIds) !== JSON.stringify(syntheticAuthority.userIds)) {
    throw new Error("The staging relational surface contains an unsealed application-user root");
  }

  const rootColumns = sql(
    `select table_schema || '|' || table_name || '|' || column_name
       from information_schema.columns
      where table_schema in ('public','private')
        and data_type = 'uuid'
        and (
          column_name ~ '(^|_)(organization|workspace)_id$'
          or column_name ~ '(^|_)(user_id|owner_user_id|actor_user_id|author_user_id|requested_by_user_id|assigned_user_id|claimed_by_user_id)$'
          or column_name in ('owner_id','created_by','updated_by','assigned_by','recorded_by')
        )
      order by table_schema, table_name, column_name;`,
    `${labelPrefix} classified tenant-root columns`,
  ).split("\n").filter(Boolean);
  if (rootColumns.length === 0) {
    throw new Error("The staging relational surface has no classified tenant-root columns");
  }
  const rootRecords = [];
  for (const item of rootColumns) {
    const [schema, table, column] = item.split("|");
    if (
      !/^(?:public|private)$/.test(schema ?? "") ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(table ?? "") ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(column ?? "")
    ) {
      throw new Error("The staging tenant-root inventory contains an unsupported identifier");
    }
    const organizationScoped = /(?:^|_)(?:organization|workspace)_id$/.test(column);
    const allowed = organizationScoped ? allowedOrganizations : allowedUsers;
    const [totalCount, unexpectedRootCount] = sql(
      `select count(*)::text || '|' ||
              count(*) filter (where "${column}" is not null and not ("${column}" = any(${allowed})))::text
         from "${schema}"."${table}";`,
      `${labelPrefix} bounded root scan ${schema}.${table}.${column}`,
    ).split("|").map(Number);
    if (
      !Number.isSafeInteger(totalCount) ||
      !Number.isSafeInteger(unexpectedRootCount) ||
      totalCount < 0 ||
      unexpectedRootCount !== 0
    ) {
      throw new Error("The staging relational surface contains a row outside the sealed synthetic roots");
    }
    rootRecords.push({ schema, table, column, totalCount, unexpectedRootCount });
  }

  const tableNames = sql(
    `select namespace.nspname || '|' || relation.relname
       from pg_catalog.pg_class relation
       join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname in ('public','private')
        and relation.relkind in ('r','p')
      order by namespace.nspname, relation.relname;`,
    `${labelPrefix} complete managed table inventory`,
  ).split("\n").filter(Boolean);
  const tableRowCounts = {};
  for (const item of tableNames) {
    const [schema, table] = item.split("|");
    if (
      !/^(?:public|private)$/.test(schema ?? "") ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(table ?? "")
    ) {
      throw new Error("The staging managed table inventory contains an unsupported identifier");
    }
    const count = Number(sql(
      `select count(*) from "${schema}"."${table}";`,
      `${labelPrefix} managed row count ${schema}.${table}`,
    ));
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("The staging managed table inventory contains an invalid row count");
    }
    tableRowCounts[`${schema}.${table}`] = count;
  }

  const exactHighRiskCounts = {};
  for (const [table, expected] of Object.entries(
    syntheticAuthority.evidence.exactHighRiskCounts,
  )) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(table)) {
      throw new Error("The sealed high-risk row-count authority contains an invalid table");
    }
    const scope = syntheticAuthority.highRiskCountScopes?.[table] ?? null;
    if (
      scope !== null &&
      (
        !["campaign_id", "organization_id"].includes(scope.column) ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          scope.value ?? "",
        )
      )
    ) {
      throw new Error("The sealed high-risk row-count scope is invalid");
    }
    const whereClause = scope
      ? ` where "${scope.column}" = '${scope.value}'::uuid`
      : "";
    const count = Number(sql(
      `select count(*) from public."${table}"${whereClause};`,
      `${labelPrefix} exact high-risk row count ${table}`,
    ));
    if (!Number.isSafeInteger(count) || count !== expected) {
      throw new Error(`The staging ${table} row count drifted from the sealed synthetic authority`);
    }
    exactHighRiskCounts[table] = count;
  }

  const providerCredentialCounts = {
    marketingAccountSecrets: Number(sql(
      `select count(*) from public.marketing_accounts
        where access_token_encrypted is not null
           or refresh_token_encrypted is not null
           or verification_token is not null;`,
      `${labelPrefix} Meta credential emptiness`,
    )),
    ghlInstallationCredentialRefs: Number(sql(
      "select count(*) from public.ghl_installations where encrypted_credential_ref is not null;",
      `${labelPrefix} GHL installation credential emptiness`,
    )),
    ghlLocationCredentialRefs: Number(sql(
      "select count(*) from public.ghl_location_mappings where forms_readonly_credential_ref is not null;",
      `${labelPrefix} GHL location credential emptiness`,
    )),
    partnerGhlCredentialRows: Number(sql(
      "select count(*) from public.partner_ghl_config;",
      `${labelPrefix} partner GHL credential emptiness`,
    )),
  };
  if (requireSuccessorCredentialTables) {
    Object.assign(providerCredentialCounts, {
      marketplaceAuthorities: Number(sql(
        "select count(*) from public.ghl_marketplace_authorities;",
        `${labelPrefix} Marketplace authority emptiness`,
      )),
      marketplaceCredentials: Number(sql(
        "select count(*) from public.ghl_marketplace_encrypted_credentials;",
        `${labelPrefix} Marketplace credential emptiness`,
      )),
      marketplaceOauthStates: Number(sql(
        "select count(*) from public.ghl_marketplace_oauth_states;",
        `${labelPrefix} Marketplace OAuth-state emptiness`,
      )),
      marketplaceTokenSets: Number(sql(
        "select count(*) from public.ghl_marketplace_token_sets;",
        `${labelPrefix} Marketplace token-set emptiness`,
      )),
    });
  }
  if (
    Object.values(providerCredentialCounts).some(
      (value) => !Number.isSafeInteger(value) || value !== 0,
    )
  ) {
    throw new Error("The staging relational surface contains provider credential authority");
  }
  const normalized = JSON.stringify({
    rootRecords,
    tableRowCounts,
    exactHighRiskCounts,
    providerCredentialCounts,
  });
  return Object.freeze({
    schemaVersion: "dealflow.synthetic-relational-surface-proof.v1",
    status: "EXACT_SEALED_SYNTHETIC_ROOTS_ONLY",
    classifiedRootColumnCount: rootRecords.length,
    unexpectedRootCount: 0,
    managedTableCount: Object.keys(tableRowCounts).length,
    tableRowCounts: Object.freeze(tableRowCounts),
    exactHighRiskCounts: Object.freeze(exactHighRiskCounts),
    providerCredentialCounts: Object.freeze(providerCredentialCounts),
    syntheticRelationalSurfaceSha256: sha256(normalized),
    sourceAuthority: syntheticAuthority.evidence,
    rawIdentityValuesPersisted: false,
    rawRelationalValuesPersisted: false,
    containsRealCustomerData: false,
    providerCredentialPresent: false,
  });
}

function assertPrior104RowCountContinuity(
  preForward,
  postForward,
  { allowExpectedControlPlaneCountChanges = false } = {},
) {
  const expectedControlPlaneCountChanges = new Set([
    "public.account_deletion_data_inventory",
    "public.app_schema_metadata",
  ]);
  const unchangedManagedTables = [];
  for (const [table, preCount] of Object.entries(preForward.tableRowCounts)) {
    if (!Object.hasOwn(postForward.tableRowCounts, table)) {
      throw new Error(`The 104-to-120 transition removed the pre-existing managed table ${table}`);
    }
    if (
      allowExpectedControlPlaneCountChanges &&
      expectedControlPlaneCountChanges.has(table)
    ) continue;
    if (postForward.tableRowCounts[table] !== preCount) {
      throw new Error(`The 104-to-120 transition changed the row count of ${table}`);
    }
    unchangedManagedTables.push(table);
  }
  for (const table of expectedControlPlaneCountChanges) {
    if (!Object.hasOwn(preForward.tableRowCounts, table)) {
      throw new Error(`The prior-104 row-count authority is missing ${table}`);
    }
  }
  return Object.freeze({
    schemaVersion: "dealflow.prior-104-row-count-continuity.v1",
    status: "EXACT_PREEXISTING_CUSTOMER_ROW_COUNTS_PRESERVED",
    unchangedManagedTableCount: unchangedManagedTables.length,
    expectedControlPlaneCountChanges: Object.freeze(
      allowExpectedControlPlaneCountChanges
        ? [...expectedControlPlaneCountChanges].sort()
        : [],
    ),
    unchangedManagedTableSetSha256: sha256(
      JSON.stringify(unchangedManagedTables.sort()),
    ),
    rawRelationalValuesPersisted: false,
  });
}

function isExactEmptyPlatformState(state, expectedStructuralCatalogSha256 = null) {
  return state.historyTableExists === false &&
    state.migrationHistoryCount === 0 &&
    state.migrationHistoryVersions.length === 0 &&
    state.publicTableCount === 0 &&
    state.authTableCount === 23 &&
    state.storageTableCount === 8 &&
    state.vaultTableCount === 1 &&
    state.authUserCount === 0 &&
    state.storageObjectCount === 0 &&
    (expectedStructuralCatalogSha256 === null ||
      state.structuralCatalogSha256 === expectedStructuralCatalogSha256);
}

function isExactCommittedPortfolioState(state) {
  return state.historyTableExists === true &&
    state.migrationHistoryCount === migrations.length &&
    JSON.stringify(state.migrationHistoryVersions) ===
      JSON.stringify(migrations.map((name) => name.slice(0, 14))) &&
    state.authUserCount === 0 &&
    state.storageObjectCount === 0;
}

function hasExactMigrationHistory(state) {
  return state.historyTableExists === true &&
    state.migrationHistoryCount === migrations.length &&
    JSON.stringify(state.migrationHistoryVersions) ===
      JSON.stringify(migrations.map((name) => name.slice(0, 14)));
}

function captureNormalizedSchemaDump() {
  return runPostgresCommand(
    pgDump,
    [
      "--schema-only",
      "--no-owner",
      "--no-comments",
      "--no-security-labels",
      "--no-publications",
      "--no-subscriptions",
      "--schema=public",
      "--schema=private",
    ],
    { timeoutMs: 300_000, errorLabel: "Remote schema dump failed" },
  )
    .split(/\r?\n/)
    .filter(
      (line) =>
        !line.startsWith("\\restrict ") &&
        !line.startsWith("\\unrestrict ") &&
        !line.startsWith("-- Dumped from") &&
        !line.startsWith("-- Dumped by"),
    )
    .join("\n")
    .trim();
}

function captureManagedNormalizedSchemaDump() {
  return runPostgresCommand(
    pgDump,
    [
      "--schema-only",
      "--no-owner",
      "--no-privileges",
      "--no-comments",
      "--no-security-labels",
      "--no-publications",
      "--no-subscriptions",
      "--schema=public",
      "--schema=private",
    ],
    { timeoutMs: 300_000, errorLabel: "Remote managed schema dump failed" },
  )
    .split(/\r?\n/)
    .filter(
      (line) =>
        !line.startsWith("\\restrict ") &&
        !line.startsWith("\\unrestrict ") &&
        !line.startsWith("-- Dumped from") &&
        !line.startsWith("-- Dumped by"),
    )
    .join("\n")
    .trim();
}

function captureAndAssertRetentionAuthorityAcl(label) {
  const acl = JSON.parse(sql(
    `select jsonb_build_object(
      'relationOwner', (
        select pg_get_userbyid(class.relowner)
        from pg_class class
        join pg_namespace namespace on namespace.oid=class.relnamespace
        where namespace.nspname='public'
          and class.relname='account_deletion_retention_configuration'
      ),
      'rowSecurityEnabled', (
        select class.relrowsecurity
        from pg_class class
        join pg_namespace namespace on namespace.oid=class.relnamespace
        where namespace.nspname='public'
          and class.relname='account_deletion_retention_configuration'
      ),
      'rowSecurityForced', (
        select class.relforcerowsecurity
        from pg_class class
        join pg_namespace namespace on namespace.oid=class.relnamespace
        where namespace.nspname='public'
          and class.relname='account_deletion_retention_configuration'
      ),
      'serviceRoleSelect', has_table_privilege('service_role','public.account_deletion_retention_configuration','SELECT'),
      'serviceRoleInsert', has_table_privilege('service_role','public.account_deletion_retention_configuration','INSERT'),
      'serviceRoleUpdate', has_table_privilege('service_role','public.account_deletion_retention_configuration','UPDATE'),
      'serviceRoleDelete', has_table_privilege('service_role','public.account_deletion_retention_configuration','DELETE'),
      'serviceRoleTruncate', has_table_privilege('service_role','public.account_deletion_retention_configuration','TRUNCATE'),
      'serviceRoleReferences', has_table_privilege('service_role','public.account_deletion_retention_configuration','REFERENCES'),
      'serviceRoleTrigger', has_table_privilege('service_role','public.account_deletion_retention_configuration','TRIGGER'),
      'serviceRoleMaintain', has_table_privilege('service_role','public.account_deletion_retention_configuration','MAINTAIN'),
      'serviceRoleTableWrite', has_table_privilege('service_role','public.account_deletion_retention_configuration','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
      'serviceRoleColumnInsert', has_any_column_privilege('service_role','public.account_deletion_retention_configuration','INSERT'),
      'serviceRoleColumnUpdate', has_any_column_privilege('service_role','public.account_deletion_retention_configuration','UPDATE'),
      'serviceRoleColumnReferences', has_any_column_privilege('service_role','public.account_deletion_retention_configuration','REFERENCES'),
      'serviceRoleColumnWrite', has_any_column_privilege('service_role','public.account_deletion_retention_configuration','INSERT,UPDATE,REFERENCES'),
      'anonTablePrivilege', has_table_privilege('anon','public.account_deletion_retention_configuration','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
      'anonColumnPrivilege', has_any_column_privilege('anon','public.account_deletion_retention_configuration','SELECT,INSERT,UPDATE,REFERENCES'),
      'authenticatedTablePrivilege', has_table_privilege('authenticated','public.account_deletion_retention_configuration','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
      'authenticatedColumnPrivilege', has_any_column_privilege('authenticated','public.account_deletion_retention_configuration','SELECT,INSERT,UPDATE,REFERENCES'),
      'publicTableAclPresent', exists (
        select 1 from pg_class class
        join pg_namespace namespace on namespace.oid=class.relnamespace
        cross join lateral aclexplode(coalesce(class.relacl, acldefault('r',class.relowner))) acl_entry
        where namespace.nspname='public'
          and class.relname='account_deletion_retention_configuration'
          and acl_entry.grantee=0
      ),
      'publicColumnAclPresent', exists (
        select 1 from pg_attribute attribute
        join pg_class class on class.oid=attribute.attrelid
        join pg_namespace namespace on namespace.oid=class.relnamespace
        cross join lateral aclexplode(attribute.attacl) acl_entry
        where namespace.nspname='public'
          and class.relname='account_deletion_retention_configuration'
          and attribute.attnum > 0
          and not attribute.attisdropped
          and acl_entry.grantee=0
      )
    )::text;`,
    label,
  ));
  if (
    acl.relationOwner !== "postgres" ||
    acl.rowSecurityEnabled !== true ||
    acl.rowSecurityForced !== true ||
    acl.serviceRoleSelect !== true ||
    acl.serviceRoleInsert !== false ||
    acl.serviceRoleUpdate !== false ||
    acl.serviceRoleDelete !== false ||
    acl.serviceRoleTruncate !== false ||
    acl.serviceRoleReferences !== false ||
    acl.serviceRoleTrigger !== false ||
    acl.serviceRoleMaintain !== false ||
    acl.serviceRoleTableWrite !== false ||
    acl.serviceRoleColumnInsert !== false ||
    acl.serviceRoleColumnUpdate !== false ||
    acl.serviceRoleColumnReferences !== false ||
    acl.serviceRoleColumnWrite !== false ||
    acl.anonTablePrivilege !== false ||
    acl.anonColumnPrivilege !== false ||
    acl.authenticatedTablePrivilege !== false ||
    acl.authenticatedColumnPrivilege !== false ||
    acl.publicTableAclPresent !== false ||
    acl.publicColumnAclPresent !== false
  ) {
    throw new Error("Retention authority table or column privileges are not fully hardened");
  }
  return Object.freeze({
    retentionConfigurationRelationOwner: "postgres",
    retentionConfigurationRowSecurityEnabled: true,
    retentionConfigurationRowSecurityForced: true,
    serviceRoleRetentionConfigurationSelectOnly: true,
    serviceRoleTableWritePrivileges: Object.freeze({
      insert: false,
      update: false,
      delete: false,
      truncate: false,
      references: false,
      trigger: false,
      maintain: false,
    }),
    serviceRoleColumnWritePrivileges: Object.freeze({
      insert: false,
      update: false,
      references: false,
    }),
    serviceRoleColumnWritePrivilegesPresent: false,
    anonPrivilegesPresent: false,
    anonColumnPrivilegesPresent: false,
    authenticatedPrivilegesPresent: false,
    authenticatedColumnPrivilegesPresent: false,
    publicAclPresent: false,
    publicColumnAclPresent: false,
  });
}

function loadAndValidatePriorMigrationProof({
  requirePinnedPrior103,
  requireExactPrior120 = false,
  requireExactPrior122 = false,
}) {
  if (!priorMigrationProofDir) return null;
  const directoryStat = lstatSync(priorMigrationProofDir);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error("Prior migration proof must be a real directory");
  }
  assertOutsideRelease(priorMigrationProofDir, "Prior migration proof directory");
  if (realpathSync(priorMigrationProofDir) === realpathSync(evidenceDir)) {
    throw new Error("Prior and current migration evidence directories must be distinct");
  }
  const actualNames = readdirSync(priorMigrationProofDir);
  const matchesArtifactSet = (names) =>
    actualNames.length === names.length && actualNames.every((name) => names.includes(name));
  const requiredNames = new Set(
    matchesArtifactSet(PRIOR_MIGRATION_APPLICATION_ARTIFACTS)
      ? PRIOR_MIGRATION_APPLICATION_ARTIFACTS
      : matchesArtifactSet(PRIOR_MIGRATION_READ_ONLY_EXACT_ARTIFACTS)
        ? PRIOR_MIGRATION_READ_ONLY_EXACT_ARTIFACTS
        : matchesArtifactSet(PRIOR_MIGRATION_COMMITTED_FORWARD_RECOVERY_ARTIFACTS)
          ? PRIOR_MIGRATION_COMMITTED_FORWARD_RECOVERY_ARTIFACTS
          : [],
  );
  if (requiredNames.size === 0) {
    throw new Error("Prior migration proof directory does not contain an exact supported sealed artifact set");
  }
  const readPriorArtifact = (name) => {
    if (!requiredNames.has(name) || !/^[a-z0-9][a-z0-9._-]+\.json$/.test(name)) {
      throw new Error("Prior migration proof contains an unsupported artifact name");
    }
    const path = join(priorMigrationProofDir, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o077) !== 0) {
      throw new Error("Prior migration proof artifacts must be real owner-only files");
    }
    const contents = readFileSync(path);
    return { contents, parsed: JSON.parse(contents.toString("utf8")) };
  };
  const manifestArtifact = readPriorArtifact("evidence-manifest.json");
  const manifest = manifestArtifact.parsed;
  if (
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length !== requiredNames.size - 1
  ) {
    throw new Error("Prior migration proof manifest does not seal the exact artifact set");
  }
  const declared = new Set();
  for (const record of manifest.artifacts) {
    if (
      !record ||
      typeof record.path !== "string" ||
      record.path === "evidence-manifest.json" ||
      !requiredNames.has(record.path) ||
      declared.has(record.path) ||
      !/^[a-f0-9]{64}$/.test(record.sha256 ?? "") ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes <= 0
    ) {
      throw new Error("Prior migration proof manifest contains an invalid artifact record");
    }
    const artifact = readPriorArtifact(record.path);
    if (artifact.contents.byteLength !== record.bytes || sha256(artifact.contents) !== record.sha256) {
      throw new Error("Prior migration proof artifact does not match its sealed digest");
    }
    declared.add(record.path);
  }
  if (
    [...requiredNames]
      .filter((name) => name !== "evidence-manifest.json")
      .some((name) => !declared.has(name))
  ) {
    throw new Error("Prior migration proof manifest does not seal every required artifact");
  }
  const committedForwardRecoveryEvidence = requiredNames.has(
    "staging-migration-failure.json",
  );
  const proofArtifact = committedForwardRecoveryEvidence
    ? null
    : readPriorArtifact("staging-migration-proof.json");
  const mutationStatusArtifact = committedForwardRecoveryEvidence
    ? readPriorArtifact("staging-mutation-status.json")
    : null;
  const failureArtifact = committedForwardRecoveryEvidence
    ? readPriorArtifact("staging-migration-failure.json")
    : null;
  const summaryArtifact = readPriorArtifact("staging-migration-summary.json");
  const proof = proofArtifact?.parsed ?? null;
  const mutationStatus = mutationStatusArtifact?.parsed ?? null;
  const failure = failureArtifact?.parsed ?? null;
  const summary = summaryArtifact.parsed;
  if (requirePinnedPrior103 && (
    sha256(manifestArtifact.contents) !== expectedPriorManifestSha256 ||
    sha256(proofArtifact?.contents ?? Buffer.alloc(0)) !== expectedPriorProofSha256 ||
    sha256(summaryArtifact.contents) !== expectedPriorSummarySha256
  )) {
    throw new Error("Prior migration proof does not match the exact pinned prior-state seal");
  }
  const expectedRecords = requirePinnedPrior103
    ? migrationIdentity.records.slice(0, expectedPriorMigrationCount)
    : requireExactPrior120
      ? migrationIdentity.records.slice(0, FORWARD_120_TO_121_AUTHORITY.prior.migrationCount)
      : requireExactPrior122
        ? migrationIdentity.records.slice(0, FORWARD_122_TO_123_AUTHORITY.prior.migrationCount)
      : migrationIdentity.records;
  const expectedApplied = expectedRecords.map((record) => ({
    version: record.name.slice(0, 14),
    file: record.name,
    sha256: record.sha256,
  }));
  const expectedCount = expectedRecords.length;
  const expectedPortfolioSha256 = requirePinnedPrior103
    ? expectedPriorMigrationPortfolioSha256
    : requireExactPrior120
      ? FORWARD_120_TO_121_AUTHORITY.prior.migrationPortfolioSha256
      : requireExactPrior122
        ? FORWARD_122_TO_123_AUTHORITY.prior.migrationPortfolioSha256
      : migrationIdentity.migrationPortfolioSha256;
  const expectedFinalVersion = (requirePinnedPrior103
    ? expectedPriorFinalMigration
    : requireExactPrior120
      ? FORWARD_120_TO_121_AUTHORITY.prior.finalMigration
      : requireExactPrior122
        ? FORWARD_122_TO_123_AUTHORITY.prior.finalMigration
      : requiredFinalMigration).slice(0, 14);
  const historicalChangedRecord = proof?.applied?.find(
    (record) =>
      record?.file === HISTORICAL_129_APPLICATION_AUTHORITY.changedMigrationFile,
  );
  const currentChangedRecord = expectedApplied.find(
    (record) =>
      record.file === HISTORICAL_129_APPLICATION_AUTHORITY.changedMigrationFile,
  );
  const exactHistorical129Application =
    !requirePinnedPrior103 &&
    !requireExactPrior120 &&
    !requireExactPrior122 &&
    isExactHistorical129ApplicationAuthority({
      applicationCommit: proof?.headCommit,
      applicationTree: proof?.headTree,
      releaseBranch: proof?.releaseBranch,
      manifestSha256: sha256(manifestArtifact.contents),
      proofSha256: sha256(proofArtifact?.contents ?? Buffer.alloc(0)),
      summarySha256: sha256(summaryArtifact.contents),
      brokerSourceSha256: proof?.brokerSourceSha256,
      migrationCount: proof?.migrationCount,
      lastCommittedVersion: proof?.lastCommittedVersion,
      historicalMigrationPortfolioSha256: proof?.migrationPortfolioSha256,
      currentSourceReplayMigrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
      changedMigrationFile: historicalChangedRecord?.file,
      historicalChangedMigrationSha256: historicalChangedRecord?.sha256,
      currentChangedMigrationSha256: currentChangedRecord?.sha256,
      normalizedSchemaSha256: proof?.normalizedSchemaSha256,
      structuralCatalogSha256:
        proof?.remoteStateVerification?.state?.structuralCatalogSha256,
    });
  const expectedPriorPortfolioSha256 = exactHistorical129Application
    ? HISTORICAL_129_APPLICATION_AUTHORITY.historicalMigrationPortfolioSha256
    : expectedPortfolioSha256;
  const expectedPriorApplied = exactHistorical129Application
    ? expectedApplied.map((record) =>
      record.file === HISTORICAL_129_APPLICATION_AUTHORITY.changedMigrationFile
        ? {
            ...record,
            sha256:
              HISTORICAL_129_APPLICATION_AUTHORITY.historicalChangedMigrationSha256,
          }
        : record)
    : expectedApplied;
  const evidenceTruth = classifyPriorMigrationEvidence({
    actualNames,
    manifest,
    proof,
    summary,
    failure,
    mutationStatus,
    expectedMigrationCount: expectedCount,
    expectedFinalVersion,
    requireApplicationEvidence: false,
  });
  if (evidenceTruth.evidenceKind === "committed_forward_recovery") {
    const manifestSha256 = sha256(manifestArtifact.contents);
    const mutationStatusSha256 = sha256(mutationStatusArtifact.contents);
    const failureSha256 = sha256(failureArtifact.contents);
    const summarySha256 = sha256(summaryArtifact.contents);
    const recoverySealKind = classifyExactCommittedForwardRecoverySeal({
      applicationCommit: mutationStatus.headCommit,
      applicationTree: mutationStatus.headTree,
      manifestSha256,
      summarySha256,
      mutationStatusSha256,
      failureSha256,
      brokerSourceSha256: mutationStatus.brokerSourceSha256,
      migrationPortfolioSha256: mutationStatus.migrationPortfolioSha256,
      postStructuralCatalogSha256: mutationStatus.postStructuralCatalogSha256,
      postNormalizedSchemaSha256: mutationStatus.postNormalizedSchemaSha256,
    });
    if (
      recoverySealKind !== evidenceTruth.recoveryKind ||
      summary.headCommit !== mutationStatus.headCommit ||
      summary.headTree !== mutationStatus.headTree ||
      failure.headCommit !== mutationStatus.headCommit ||
      failure.headTree !== mutationStatus.headTree ||
      mutationStatus.projectFingerprint !== expectedProjectFingerprint ||
      summary.projectFingerprint !== expectedProjectFingerprint ||
      failure.projectFingerprint !== expectedProjectFingerprint ||
      mutationStatus.safeSuffix !== expectedProjectSafeSuffix ||
      summary.safeSuffix !== expectedProjectSafeSuffix ||
      failure.safeSuffix !== expectedProjectSafeSuffix ||
      mutationStatus.releaseBranch !== expectedPriorApplicationBranch ||
      summary.releaseBranch !== expectedPriorApplicationBranch ||
      failure.releaseBranch !== expectedPriorApplicationBranch ||
      mutationStatus.migrationPortfolioSha256 !== expectedPortfolioSha256 ||
      summary.migrationPortfolioSha256 !== expectedPortfolioSha256 ||
      failure.migrationPortfolioSha256 !== expectedPortfolioSha256 ||
      mutationStatus.broker?.path !== brokerRelativePath ||
      mutationStatus.brokerSourceSha256 !== mutationStatus.broker?.sha256 ||
      manifest.broker?.path !== brokerRelativePath ||
      manifest.brokerSourceSha256 !== mutationStatus.brokerSourceSha256
    ) {
      throw new Error(
        "Prior committed-forward recovery evidence does not match the one exact pinned seal",
      );
    }
    let recoveredNormalizedSchemaSha256 = mutationStatus.postNormalizedSchemaSha256;
    let recoveryReadOnlyAuthority = null;
    if (recoverySealKind === "legacy_forward_103_acl") {
      const expectedPriorApplied = expectedApplied.slice(0, expectedPriorMigrationCount);
      const exactForwardMigration = expectedApplied.at(-1);
      if (
        JSON.stringify(mutationStatus.forwardMigration) !==
          JSON.stringify(exactForwardMigration) ||
        JSON.stringify(summary.forwardMigration) !== JSON.stringify(exactForwardMigration) ||
        JSON.stringify(failure.forwardMigration) !== JSON.stringify(exactForwardMigration) ||
        mutationStatus.priorApplication?.applicationCommit !==
          expectedPriorApplicationCommit ||
        mutationStatus.priorApplication?.applicationTree !== expectedPriorApplicationTree ||
        mutationStatus.priorApplication?.manifestSha256 !== expectedPriorManifestSha256 ||
        mutationStatus.priorApplication?.migrationPortfolioSha256 !==
          expectedPriorMigrationPortfolioSha256 ||
        mutationStatus.priorApplication?.lastCommittedVersion !==
          expectedPriorFinalMigration.slice(0, 14) ||
        JSON.stringify(mutationStatus.priorApplication?.migrationFiles) !==
          JSON.stringify(expectedPriorApplied) ||
        mutationStatus.preflightStructuralCatalogSha256 !==
          mutationStatus.priorApplication?.structuralCatalogSha256 ||
        mutationStatus.preflightNormalizedSchemaSha256 !==
          mutationStatus.priorApplication?.normalizedSchemaSha256
      ) {
        throw new Error("Legacy committed-forward recovery evidence is not exact");
      }
    } else if (recoverySealKind === "forward_104_to_120_catalog_rendering") {
      if (
        JSON.stringify(mutationStatus.forwardMigrations) !==
          JSON.stringify(FORWARD_104_TO_120_AUTHORITY.forwardMigrations) ||
        JSON.stringify(summary.forwardMigrations) !==
          JSON.stringify(FORWARD_104_TO_120_AUTHORITY.forwardMigrations) ||
        JSON.stringify(failure.forwardMigrations) !==
          JSON.stringify(FORWARD_104_TO_120_AUTHORITY.forwardMigrations) ||
        mutationStatus.priorApplication?.applicationCommit !==
          FORWARD_104_TO_120_AUTHORITY.prior.proofCommit ||
        mutationStatus.priorApplication?.applicationTree !==
          FORWARD_104_TO_120_AUTHORITY.prior.proofTree ||
        mutationStatus.priorApplication?.manifestSha256 !==
          FORWARD_104_TO_120_AUTHORITY.priorEvidence.artifactSha256[
            "evidence-manifest.json"
          ] ||
        mutationStatus.priorApplication?.proofSha256 !==
          FORWARD_104_TO_120_AUTHORITY.priorEvidence.artifactSha256[
            "staging-migration-proof.json"
          ] ||
        mutationStatus.priorApplication?.summarySha256 !==
          FORWARD_104_TO_120_AUTHORITY.priorEvidence.artifactSha256[
            "staging-migration-summary.json"
          ] ||
        mutationStatus.priorApplication?.migrationCount !==
          FORWARD_104_TO_120_AUTHORITY.prior.migrationCount ||
        mutationStatus.priorApplication?.migrationPortfolioSha256 !==
          FORWARD_104_TO_120_AUTHORITY.prior.migrationPortfolioSha256 ||
        mutationStatus.priorApplication?.lastCommittedVersion !==
          FORWARD_104_TO_120_AUTHORITY.prior.finalMigration.slice(0, 14) ||
        mutationStatus.preflightStructuralCatalogSha256 !==
          mutationStatus.priorApplication?.structuralCatalogSha256 ||
        mutationStatus.preflightNormalizedSchemaSha256 !==
          mutationStatus.priorApplication?.normalizedSchemaSha256
      ) {
        throw new Error("104-to-120 committed-forward recovery evidence is not exact");
      }
      const recoveredManagedSchemaSha256 = sha256(
        captureManagedNormalizedSchemaDump(),
      );
      const recoveredManagedCatalog = captureManagedCatalogIdentity(
        "Recover committed 104-to-120 managed catalog authority",
      );
      const recoveredManagedSecurity = captureManagedSecurityOracle(
        "Recover committed 104-to-120 managed security authority",
      );
      recoveredNormalizedSchemaSha256 = sha256(captureNormalizedSchemaDump());
      if (
        recoveredManagedSchemaSha256 !==
          FORWARD_104_TO_120_AUTHORITY.current.managedNormalizedSchemaSha256 ||
        recoveredManagedCatalog.managedStructuralCatalogSha256 !==
          FORWARD_104_TO_120_AUTHORITY.current.managedStructuralCatalogSha256 ||
        recoveredManagedSecurity.managedSecurityOracleSha256 !==
          FORWARD_104_TO_120_AUTHORITY.current.managedSecurityOracleSha256
      ) {
        throw new Error(
          "Committed 104-to-120 recovery readback does not match the independent managed authorities",
        );
      }
      recoveryReadOnlyAuthority = Object.freeze({
        status: "EXACT_MANAGED_120_AUTHORITIES",
        managedNormalizedSchemaSha256: recoveredManagedSchemaSha256,
        managedStructuralCatalogSha256:
          recoveredManagedCatalog.managedStructuralCatalogSha256,
        managedStructuralCatalogRecordCount:
          recoveredManagedCatalog.managedStructuralCatalogRecordCount,
        managedSecurityOracleSha256:
          recoveredManagedSecurity.managedSecurityOracleSha256,
        rawDatabaseValuesPersisted: false,
      });
    } else {
      throw new Error("Unsupported committed-forward recovery kind");
    }
    const priorTree = git(
      ["rev-parse", "--verify", `${mutationStatus.headCommit}^{tree}`],
      "Unable to verify the committed-forward recovery commit",
    ).trim();
    if (priorTree !== mutationStatus.headTree) {
      throw new Error("Committed-forward recovery commit and tree do not match retained Git history");
    }
    const priorBrokerSource = git(
      ["show", `${mutationStatus.headCommit}:${brokerRelativePath}`],
      "Unable to recover the committed-forward broker source",
    );
    if (sha256(priorBrokerSource) !== mutationStatus.brokerSourceSha256) {
      throw new Error("Committed-forward recovery broker is not bound to retained Git history");
    }
    git(
      ["merge-base", "--is-ancestor", mutationStatus.headCommit, releaseIdentity.headCommit],
      "Committed-forward recovery seal is not an ancestor of the current exact seal",
    );
    return Object.freeze({
      manifestSha256,
      proofSha256: mutationStatusSha256,
      mutationStatusSha256,
      failureSha256,
      summarySha256,
      priorEvidenceDirectoryName: basename(priorMigrationProofDir),
      priorEvidencePathSha256: sha256(realpathSync(priorMigrationProofDir)),
      applicationCommit: mutationStatus.headCommit,
      applicationTree: mutationStatus.headTree,
      migrationCount: expectedCount,
      lastCommittedVersion: expectedFinalVersion,
      migrationFiles: expectedApplied,
      migrationPortfolioSha256: mutationStatus.migrationPortfolioSha256,
      normalizedSchemaSha256: recoveredNormalizedSchemaSha256,
      structuralCatalogSha256: mutationStatus.postStructuralCatalogSha256,
      singleOuterTransaction: true,
      migrationHistoryReceiptsInsideOuterTransaction: true,
      evidenceKind: evidenceTruth.evidenceKind,
      evidenceRemoteMutationStarted: true,
      evidenceRemoteMutationCompleted: true,
      portfolioApplicationRemoteMutationCompleted: true,
      sourceRemoteStateVerificationStatus:
        recoverySealKind === "legacy_forward_103_acl"
          ? "SEALED_FORWARD_103_COMMIT_REQUIRES_READ_ONLY_REPROOF"
          : "SEALED_FORWARD_104_TO_120_COMMIT_REQUIRES_READ_ONLY_REPROOF",
      recoveryReadOnlyAuthority,
      remoteMutationCompleted: true,
    });
  }
  if (
    summary.singleOuterTransaction !== true ||
    summary.migrationHistoryReceiptsInsideOuterTransaction !== true ||
    proof.singleOuterTransaction !== true ||
    proof.migrationHistoryReceiptsInsideOuterTransaction !== true ||
    proof.projectFingerprint !== expectedProjectFingerprint ||
    summary.projectFingerprint !== expectedProjectFingerprint ||
    proof.safeSuffix !== expectedProjectSafeSuffix ||
    summary.safeSuffix !== expectedProjectSafeSuffix ||
    proof.releaseBranch !== expectedPriorApplicationBranch ||
    summary.releaseBranch !== expectedPriorApplicationBranch ||
    proof.migrationCount !== expectedCount ||
    summary.migrationCount !== expectedCount ||
    proof.migrationHistoryCount !== expectedCount ||
    summary.migrationHistoryCount !== expectedCount ||
    proof.migrationPortfolioSha256 !== expectedPriorPortfolioSha256 ||
    summary.migrationPortfolioSha256 !== expectedPriorPortfolioSha256 ||
    proof.lastCommittedVersion !== expectedFinalVersion ||
    summary.lastCommittedVersion !== expectedFinalVersion ||
    proof.headCommit !== summary.headCommit ||
    proof.headTree !== summary.headTree ||
    (requirePinnedPrior103 && proof.headCommit !== expectedPriorApplicationCommit) ||
    (requirePinnedPrior103 && proof.headTree !== expectedPriorApplicationTree) ||
    proof.normalizedSchemaSha256 !== summary.normalizedSchemaSha256 ||
    !/^[a-f0-9]{40}$/.test(proof.headCommit ?? "") ||
    !/^[a-f0-9]{40}$/.test(proof.headTree ?? "") ||
    !/^[a-f0-9]{64}$/.test(proof.normalizedSchemaSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(
      proof.remoteStateVerification?.state?.structuralCatalogSha256 ?? "",
    ) ||
    JSON.stringify(proof.applied) !== JSON.stringify(expectedPriorApplied)
  ) {
    throw new Error(
      requirePinnedPrior103
        ? "Prior migration proof is not bound to the exact read-only-proven 103-migration state"
        : requireExactPrior120
          ? "Prior migration proof is not bound to the exact sealed 120-migration predecessor"
          : requireExactPrior122
            ? "Prior migration proof is not bound to the exact sealed 122-migration predecessor"
          : "Prior migration proof is not bound to the exact successful current portfolio application",
    );
  }
  const priorTree = git(
    ["rev-parse", "--verify", `${proof.headCommit}^{tree}`],
    "Unable to verify the prior application commit",
  ).trim();
  if (priorTree !== proof.headTree) {
    throw new Error("Prior migration proof commit and tree do not match retained Git history");
  }
  const priorBrokerSource = git(
    ["show", `${proof.headCommit}:${brokerRelativePath}`],
    "Unable to recover the prior tracked staging broker source",
  );
  if (
    proof.broker?.path !== brokerRelativePath ||
    proof.brokerSourceSha256 !== proof.broker?.sha256 ||
    manifest.broker?.path !== brokerRelativePath ||
    manifest.brokerSourceSha256 !== proof.brokerSourceSha256 ||
    sha256(priorBrokerSource) !== proof.brokerSourceSha256
  ) {
    throw new Error("Prior migration proof broker source is not bound to retained Git history");
  }
  git(
    ["merge-base", "--is-ancestor", proof.headCommit, releaseIdentity.headCommit],
    "Prior migration application is not an ancestor of the current exact seal",
  );
  return Object.freeze({
    manifestSha256: sha256(manifestArtifact.contents),
    proofSha256: sha256(proofArtifact.contents),
    summarySha256: sha256(summaryArtifact.contents),
    priorEvidenceDirectoryName: basename(priorMigrationProofDir),
    priorEvidencePathSha256: sha256(realpathSync(priorMigrationProofDir)),
    applicationCommit: proof.headCommit,
    applicationTree: proof.headTree,
    migrationCount: expectedCount,
    lastCommittedVersion: expectedFinalVersion,
    migrationFiles: expectedApplied,
    migrationPortfolioSha256: proof.migrationPortfolioSha256,
    sourceReplayMigrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
    normalizedSchemaSha256: proof.normalizedSchemaSha256,
    structuralCatalogSha256:
      proof.remoteStateVerification.state.structuralCatalogSha256,
    singleOuterTransaction: true,
    migrationHistoryReceiptsInsideOuterTransaction: true,
    evidenceKind: evidenceTruth.evidenceKind,
    evidenceRemoteMutationStarted: evidenceTruth.evidenceRemoteMutationStarted,
    evidenceRemoteMutationCompleted: evidenceTruth.evidenceRemoteMutationCompleted,
    portfolioApplicationRemoteMutationCompleted:
      evidenceTruth.portfolioApplicationRemoteMutationCompleted,
    sourceRemoteStateVerificationStatus: exactHistorical129Application
      ? "SEALED_HISTORICAL_129_APPLICATION_REQUIRES_CURRENT_READ_ONLY_REPROOF"
      : proof.remoteStateVerification.status,
    remoteMutationCompleted: true,
  });
}

function loadCurrentExactAdoptionAuthority() {
  if (!currentExactAdoptionAuthorityPath) return null;
  const authorityStat = lstatSync(currentExactAdoptionAuthorityPath);
  if (
    authorityStat.isSymbolicLink() ||
    !authorityStat.isFile() ||
    authorityStat.nlink !== 1 ||
    authorityStat.uid !== process.getuid() ||
    (authorityStat.mode & 0o077) !== 0 ||
    realpathSync(currentExactAdoptionAuthorityPath) !== currentExactAdoptionAuthorityPath
  ) {
    throw new Error("Current exact adoption authority must be an owner-only real file");
  }
  assertOutsideRelease(currentExactAdoptionAuthorityPath, "Current exact adoption authority");
  const authorityBytes = readFileSync(currentExactAdoptionAuthorityPath);
  const authority = JSON.parse(authorityBytes.toString("utf8"));
  const rehearsalPath = resolve(String(authority.productionShapedRehearsalPath ?? ""));
  const rehearsalStat = lstatSync(rehearsalPath);
  if (
    !isAbsolute(rehearsalPath) ||
    rehearsalStat.isSymbolicLink() ||
    !rehearsalStat.isFile() ||
    rehearsalStat.nlink !== 1 ||
    rehearsalStat.uid !== process.getuid() ||
    (rehearsalStat.mode & 0o077) !== 0 ||
    realpathSync(rehearsalPath) !== rehearsalPath
  ) {
    throw new Error("Production-shaped rehearsal authority must be an owner-only real file");
  }
  assertOutsideRelease(rehearsalPath, "Production-shaped rehearsal authority");
  const rehearsalBytes = readFileSync(rehearsalPath);
  const rehearsal = JSON.parse(rehearsalBytes.toString("utf8"));
  if (
    authority.schemaVersion !== "dealflow.staging-current-exact-adoption-authority.v1" ||
    authority.status !== "AUTHORIZED_READ_ONLY_CURRENT_EXACT_ADOPTION" ||
    authority.projectFingerprint !== expectedProjectFingerprint ||
    authority.safeSuffix !== expectedProjectSafeSuffix ||
    authority.headCommit !== releaseIdentity.headCommit ||
    authority.headTree !== releaseIdentity.headTree ||
    authority.migrationCount !== exactMigrationCount ||
    authority.migrationPortfolioSha256 !== migrationIdentity.migrationPortfolioSha256 ||
    authority.productionShapedRehearsalSha256 !== sha256(rehearsalBytes) ||
    JSON.stringify(authority.verificationRoundSummarySha256) !==
      JSON.stringify(verificationRoundSummarySha256) ||
    authority.remoteMutationAuthorized !== false ||
    authority.providerEffectsAuthorized !== false ||
    authority.realCustomerDataAuthorized !== false ||
    rehearsal.schema !== "dealflow.production-shaped-migration-rehearsal.v1" ||
    rehearsal.status !== "PASS" ||
    rehearsal.productionHistoryBefore !== 59 ||
    rehearsal.candidateHistoryAfter !== exactMigrationCount ||
    rehearsal.forwardDelta !== exactMigrationCount - 59 ||
    rehearsal.portfolioSha256 !== migrationIdentity.migrationPortfolioSha256 ||
    rehearsal.deterministicRuns !== 2 ||
    rehearsal.first?.history !== exactMigrationCount ||
    rehearsal.second?.history !== exactMigrationCount ||
    rehearsal.first?.schema?.sha256 !== rehearsal.second?.schema?.sha256 ||
    rehearsal.first?.fixtureSha256 !== rehearsal.second?.fixtureSha256 ||
    rehearsal.recovery?.finalHistory !== exactMigrationCount ||
    rehearsal.drift?.status !== "PASS" ||
    rehearsal.drift?.historyAfterRejection !== 59
  ) {
    throw new Error("Current exact adoption authority is not bound to the exact candidate and rehearsal");
  }
  return Object.freeze({
    status: "PASS",
    authoritySha256: sha256(authorityBytes),
    authorityPathSha256: sha256(currentExactAdoptionAuthorityPath),
    productionShapedRehearsalSha256: sha256(rehearsalBytes),
    productionShapedRehearsalPathSha256: sha256(rehearsalPath),
    deterministicRuns: rehearsal.deterministicRuns,
    rehearsalSchemaSha256: rehearsal.first.schema.sha256,
    rehearsalFixtureSha256: rehearsal.first.fixtureSha256,
    interruptionRecoveryProven: rehearsal.recovery.finalHistory === exactMigrationCount,
    driftRejectionProven: rehearsal.drift.status === "PASS",
    rawDatabaseValuesPersisted: false,
  });
}

// This portfolio is written and sealed before even the first remote read. The
// immutable pre-mutation artifacts prove exactly which tracked broker could
// later cross the database mutation boundary.
assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);
const brokerEvidenceIdentity = {
  path: brokerSourceIdentity.path,
  sha256: brokerSourceIdentity.sha256,
  bytes: brokerSourceIdentity.bytes,
};

if (["VERIFY_EXISTING_EXACT", "ADOPT_CURRENT_EXACT"].includes(migrationMode)) {
  const adoptingCurrentExact = migrationMode === "ADOPT_CURRENT_EXACT";
  const adoptionAuthority = adoptingCurrentExact
    ? loadCurrentExactAdoptionAuthority()
    : null;
  const priorApplication = adoptingCurrentExact
    ? null
    : loadAndValidatePriorMigrationProof({ requirePinnedPrior103: false });
  const common = {
    migrationMode,
    verificationReadOnly: true,
    remoteMutationStarted: false,
    remoteMutationCompleted: false,
    portfolioApplicationRemoteMutationCompleted: true,
    historicalApplicationAtomicityProven: !adoptingCurrentExact,
    atomicApplicationCapabilityProvenByAuthority: adoptingCurrentExact,
    broker: brokerEvidenceIdentity,
    brokerSourceSha256: brokerSourceIdentity.sha256,
    runtime: process.version,
    expectedPostgresVersion: "17.6",
    projectFingerprint: sha256(projectRef),
    safeSuffix: projectRef.slice(-4),
    releaseBranch: releaseIdentity.branch,
    headCommit: releaseIdentity.headCommit,
    headTree: releaseIdentity.headTree,
    trackedWorktreeSha256: releaseIdentity.trackedWorktreeSha256,
    trackedFileCount: releaseIdentity.trackedFileCount,
    dependencyLockSha256,
    postgresBinarySha256,
    tlsServerAuthentication,
    migrationCount: migrationIdentity.migrationCount,
    migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
    verificationRoundSummarySha256,
    priorApplication,
    adoptionAuthority,
  };
  const preflightRecord = writeJsonEvidence("staging-broker-preflight.json", {
    schemaVersion: "dealflow.staging-broker-preflight.v1",
    status: adoptingCurrentExact
      ? "PREPARED_READ_ONLY_CURRENT_EXACT_ADOPTION"
      : "PREPARED_READ_ONLY_EXISTING_EXACT_VERIFICATION",
    remoteReadStarted: false,
    ...common,
  });
  const preflightSummaryRecord = writeJsonEvidence(
    "staging-migration-summary.pre-mutation.json",
    {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: adoptingCurrentExact
        ? "PREPARED_READ_ONLY_CURRENT_EXACT_ADOPTION"
        : "PREPARED_READ_ONLY_EXISTING_EXACT_VERIFICATION",
      remoteReadStarted: false,
      ...common,
    },
  );
  const preflightManifestRecord = writeJsonEvidence(
    "evidence-manifest.pre-mutation.json",
    {
      schemaVersion: "dealflow.staging-evidence-manifest.v1",
      status: adoptingCurrentExact
        ? "PREPARED_READ_ONLY_CURRENT_EXACT_ADOPTION"
        : "PREPARED_READ_ONLY_EXISTING_EXACT_VERIFICATION",
      remoteMutationStarted: false,
      remoteMutationCompleted: false,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      artifacts: [preflightRecord, preflightSummaryRecord],
    },
  );
  assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);
  const readStartedRecord = writeJsonEvidence("staging-remote-read-started.json", {
    schemaVersion: "dealflow.staging-remote-read-status.v1",
    status: adoptingCurrentExact
      ? "REMOTE_READ_STARTED_CURRENT_EXACT_ADOPTION"
      : "REMOTE_READ_STARTED_EXISTING_EXACT_VERIFICATION",
    remoteReadStarted: true,
    ...common,
  });
  let verificationStage = "SERVER_VERSION";
  try {
    verificationStage = "SERVER_VERSION";
    const existingServerVersion = sql(
      "show server_version;",
      "Existing staging PostgreSQL version check",
    );
    if (!existingServerVersion.startsWith("17.6")) {
      throw new Error("The existing staging PostgreSQL version does not match exact 17.6");
    }
    verificationStage = "REMOTE_STRUCTURAL_STATE";
    const existingState = captureRemoteStructuralState(
      "Existing staging exact verification",
      (stage) => {
        verificationStage = stage;
      },
    );
    verificationStage = "MIGRATION_HISTORY";
    if (!hasExactMigrationHistory(existingState)) {
      throw new Error("Existing staging migration history does not match the exact portfolio");
    }
    verificationStage = "STORAGE_SURFACE";
    if (existingState.storageObjectCount !== 0) {
      throw new Error("Existing isolated staging contains storage objects");
    }
    verificationStage = "GHL_EMBED_AUTH_EXCHANGE_SURFACE";
    if (existingState.ghlEmbedAuthExchangeCount !== 0) {
      throw new Error("Existing isolated staging contains GHL embed auth exchanges before seed");
    }
    verificationStage = "AUTH_SURFACE";
    const authSurface = captureAndAssertStagingAuthSurface(
      "Verify existing staging auth surface is empty or the exact synthetic fixture set",
    );
    verificationStage = "AUTH_COUNT_CONSISTENCY";
    if (authSurface.userCount !== existingState.authUserCount) {
      throw new Error("Existing staging auth-surface count did not match structural-state capture");
    }
    verificationStage = "STRUCTURAL_CATALOG_BINDING";
    const platformCatalogDriftObserved =
      existingState.structuralCatalogSha256 !== priorApplication.structuralCatalogSha256;
    verificationStage = "STRUCTURAL_CATALOG_STABILITY";
    const existingCatalogRepeat = captureRemoteCatalogIdentity(
      "Repeat existing staging structural-catalog identity",
    );
    if (
      existingCatalogRepeat.structuralCatalogSha256 !==
      existingState.structuralCatalogSha256
    ) {
      throw new Error("Existing staging structural catalog was not stable across repeated capture");
    }
    verificationStage = "MANAGED_STRUCTURAL_CATALOG_BINDING";
    const existingManagedCatalog = captureManagedCatalogIdentity(
      "Existing staging managed structural-catalog identity",
    );
    if (
      existingManagedCatalog.managedStructuralCatalogSha256 !==
        currentManagedStructuralCatalogSha256 ||
      existingManagedCatalog.managedStructuralCatalogRecordCount !==
        currentManagedStructuralCatalogRecordCount
    ) {
      throw new Error("Existing staging DealFlow-managed structural catalog drifted from the exact 131 authority");
    }
    verificationStage = "MANAGED_STRUCTURAL_CATALOG_STABILITY";
    const existingManagedCatalogRepeat = captureManagedCatalogIdentity(
      "Repeat existing staging managed structural-catalog identity",
    );
    if (
      existingManagedCatalogRepeat.managedStructuralCatalogSha256 !==
        existingManagedCatalog.managedStructuralCatalogSha256 ||
      existingManagedCatalogRepeat.managedStructuralCatalogRecordCount !==
        existingManagedCatalog.managedStructuralCatalogRecordCount
    ) {
      throw new Error("Existing staging DealFlow-managed structural catalog was not stable across repeated capture");
    }
    verificationStage = "NORMALIZED_SCHEMA_FIRST_CAPTURE";
    const existingDump = captureNormalizedSchemaDump();
    verificationStage = "NORMALIZED_SCHEMA_REPEAT_CAPTURE";
    const existingDumpRepeat = captureNormalizedSchemaDump();
    const existingSchemaSha256 = sha256(existingDump);
    verificationStage = "NORMALIZED_SCHEMA_BINDING";
    if (
      existingSchemaSha256 !== sha256(existingDumpRepeat) ||
      (!adoptingCurrentExact &&
        existingSchemaSha256 !== priorApplication.normalizedSchemaSha256)
    ) {
      throw new Error("Existing staging normalized schema drifted from the sealed application proof");
    }
    verificationStage = "FORCED_RLS_COUNT";
    const forcedRlsCount = Number(sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity and c.relforcerowsecurity;",
      "Count existing staging forced-RLS tables",
    ));
    verificationStage = "META_RUNTIME_CONTROLS";
    const activationControls = sql(
      "select environment || ':' || activation_writes_enabled::text from public.meta_campaign_activation_runtime_controls order by environment;",
      "Verify existing closed Meta activation runtime controls",
    ).split("\n").filter(Boolean);
    if (
      activationControls.some((row) => !row.endsWith(":false")) ||
      activationControls.length < 2
    ) {
      throw new Error("Meta activation runtime controls are not default closed in existing staging");
    }
    verificationStage = "GHL_RUNTIME_CONTROLS";
    const ghlControls = sql(
      "select environment || ':' || provisioning_writes_enabled::text || ':' || lead_writes_enabled::text || ':' || lifecycle_webhook_enabled::text from public.ghl_runtime_controls order by environment;",
      "Verify existing closed GHL runtime controls",
    ).split("\n").filter(Boolean);
    if (
      ghlControls.length !== 3 ||
      ghlControls.some((row) => !row.endsWith(":false:false:false"))
    ) {
      throw new Error("GHL provider runtime controls are not default closed in existing staging");
    }
    verificationStage = "RETENTION_AUTHORITY_ACL";
    const retentionAuthorityAcl = captureAndAssertRetentionAuthorityAcl(
      "Verify existing retention authority table and column ACLs",
    );
    verificationStage = "BROKER_SOURCE_REBIND";
    assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);
    const applied = migrationSources.map(({ file, version, body }) => ({
      version,
      file,
      sha256: sha256(body),
    }));
    const result = {
      schemaVersion: "dealflow.isolated-staging-migration-proof.v1",
      status: "PASS",
      ...common,
      serverVersion: existingServerVersion,
      migrationHistoryCount: existingState.migrationHistoryCount,
      publicTableCount: existingState.publicTableCount,
      forcedRlsCount,
      activationRuntimeControlsDefaultClosed: true,
      ghlRuntimeControlsDefaultClosed: true,
      ...retentionAuthorityAcl,
      authUserCountAtVerification: authSurface.userCount,
      authUserSurfaceAtVerification: authSurface,
      storageObjectCountAtVerification: existingState.storageObjectCount,
      ghlEmbedAuthExchangeCountAtVerification:
        existingState.ghlEmbedAuthExchangeCount,
      normalizedSchemaSha256: existingSchemaSha256,
      normalizedSchemaBytes: Buffer.byteLength(existingDump),
      singleOuterTransaction: adoptingCurrentExact
        ? false
        : priorApplication.singleOuterTransaction,
      migrationHistoryReceiptsInsideOuterTransaction: adoptingCurrentExact
        ? false
        : priorApplication.migrationHistoryReceiptsInsideOuterTransaction,
      lastAttemptedVersion: requiredFinalMigration.slice(0, 14),
      lastAppliedVersion: requiredFinalMigration.slice(0, 14),
      lastCommittedVersion: requiredFinalMigration.slice(0, 14),
      remoteStateVerification: {
        status: adoptingCurrentExact
          ? "EXACT_CURRENT_STATE_ADOPTED_READ_ONLY"
          : "EXACT_EXISTING_COMMITTED_PORTFOLIO",
        readOnly: true,
        exactMigrationHistory: true,
        exactStructuralCatalog: !platformCatalogDriftObserved,
        exactManagedStructuralCatalog: true,
        platformStructuralCatalogStable: true,
        platformCatalogDriftObserved,
        exactNormalizedSchema: true,
        state: {
          ...existingState,
          ...existingManagedCatalog,
        },
      },
      applied,
    };
    verificationStage = "FINAL_EVIDENCE_WRITE";
    const proofRecord = writeJsonEvidence("staging-migration-proof.json", result);
    const summaryRecord = writeJsonEvidence("staging-migration-summary.json", {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: "PASS",
      failureCode: null,
      ...common,
      serverVersion: existingServerVersion,
      migrationHistoryCount: existingState.migrationHistoryCount,
      normalizedSchemaSha256: existingSchemaSha256,
      singleOuterTransaction: adoptingCurrentExact
        ? false
        : priorApplication.singleOuterTransaction,
      migrationHistoryReceiptsInsideOuterTransaction: adoptingCurrentExact
        ? false
        : priorApplication.migrationHistoryReceiptsInsideOuterTransaction,
      lastAttemptedVersion: requiredFinalMigration.slice(0, 14),
      lastAppliedVersion: requiredFinalMigration.slice(0, 14),
      lastCommittedVersion: requiredFinalMigration.slice(0, 14),
      remoteStateVerificationStatus: adoptingCurrentExact
        ? "EXACT_CURRENT_STATE_ADOPTED_READ_ONLY"
        : "EXACT_EXISTING_COMMITTED_PORTFOLIO",
      exactManagedStructuralCatalog: true,
      platformStructuralCatalogStable: true,
      platformCatalogDriftObserved,
      authUserCountAtVerification: authSurface.userCount,
      authUserSurfaceAtVerification: authSurface,
      ghlEmbedAuthExchangeCountAtVerification:
        existingState.ghlEmbedAuthExchangeCount,
      ...retentionAuthorityAcl,
    });
    const manifestRecord = writeJsonEvidence("evidence-manifest.json", {
      schemaVersion: "dealflow.staging-evidence-manifest.v1",
      status: "PASS",
      migrationMode,
      verificationReadOnly: true,
      remoteMutationStarted: false,
      remoteMutationCompleted: false,
      portfolioApplicationRemoteMutationCompleted: true,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      priorApplication,
      artifacts: [
        preflightRecord,
        preflightSummaryRecord,
        preflightManifestRecord,
        readStartedRecord,
        proofRecord,
        summaryRecord,
      ],
    });
    process.stdout.write(
      `Existing isolated staging migration portfolio PASS: ${migrations.length} migrations, PostgreSQL ${existingServerVersion}, schema ${existingSchemaSha256}, ${adoptingCurrentExact ? "read-only current-state adoption" : "read-only verification"}, manifest ${manifestRecord.sha256}\n`,
    );
    process.exit(0);
  } catch (error) {
    const failureEvidence = existingExactFailureEvidence(
      verificationStage,
      error,
      projectRef,
    );
    const failureRecord = writeJsonEvidence("staging-migration-failure.json", {
      schemaVersion: "dealflow.isolated-staging-migration-failure.v1",
      status: adoptingCurrentExact
        ? "FAILED_CURRENT_EXACT_ADOPTION"
        : "FAILED_EXISTING_EXACT_VERIFICATION",
      ...failureEvidence,
      ...common,
    });
    const failureSummaryRecord = writeJsonEvidence("staging-migration-summary.json", {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: adoptingCurrentExact
        ? "FAILED_CURRENT_EXACT_ADOPTION"
        : "FAILED_EXISTING_EXACT_VERIFICATION",
      ...failureEvidence,
      ...common,
    });
    const failureManifestRecord = writeJsonEvidence("evidence-manifest.json", {
      schemaVersion: "dealflow.staging-evidence-manifest.v1",
      status: adoptingCurrentExact
        ? "FAILED_CURRENT_EXACT_ADOPTION"
        : "FAILED_EXISTING_EXACT_VERIFICATION",
      migrationMode,
      verificationReadOnly: true,
      remoteMutationStarted: false,
      remoteMutationCompleted: false,
      portfolioApplicationRemoteMutationCompleted: true,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      priorApplication,
      ...failureEvidence,
      artifacts: [
        preflightRecord,
        preflightSummaryRecord,
        preflightManifestRecord,
        readStartedRecord,
        failureRecord,
        failureSummaryRecord,
      ],
    });
    throw new Error(
      `Existing isolated staging migration verification failed without mutation; evidence manifest ${failureManifestRecord.sha256}`,
    );
  }
}

if (migrationMode === "APPLY_FORWARD_EXACT") {
  throw new Error(
    "The sealed 104-to-120 transition remains historical and cannot qualify the current 121 portfolio; use the exact sealed 120 predecessor with --apply-successor-exact",
  );
  /* c8 ignore start -- retained byte-explicit historical transition implementation */
  if (!priorMigrationProofDir) {
    throw new Error("Exact 104-to-120 forward mode requires the pinned prior-104 proof directory");
  }
  assertOutsideRelease(priorMigrationProofDir, "Prior 104 migration proof directory");
  if (realpathSync(priorMigrationProofDir) === realpathSync(evidenceDir)) {
    throw new Error("Prior and current migration evidence directories must be distinct");
  }
  const priorApplication = loadExactPrior104StagingSeal(priorMigrationProofDir);
  const priorSyntheticSurface = loadExactPrior104SyntheticSurfaceSeal(
    priorMigrationProofDir,
  );
  const priorTree = git(
    ["rev-parse", "--verify", `${priorApplication.applicationCommit}^{tree}`],
    "Unable to verify the exact prior-104 proof commit",
  ).trim();
  if (priorTree !== priorApplication.applicationTree) {
    throw new Error("Exact prior-104 proof commit and tree do not match retained Git history");
  }
  const priorBrokerSource = git(
    ["show", `${priorApplication.applicationCommit}:${brokerRelativePath}`],
    "Unable to recover the exact prior-104 broker source",
  );
  if (sha256(priorBrokerSource) !== FORWARD_104_TO_120_AUTHORITY.prior.brokerSourceSha256) {
    throw new Error("Exact prior-104 broker is not bound to retained Git history");
  }
  git(
    ["merge-base", "--is-ancestor", priorApplication.applicationCommit, releaseIdentity.headCommit],
    "Exact prior-104 staging seal is not an ancestor of the current release",
  );

  const expectedPriorVersions = successorForwardPortfolio.priorVersions;
  const expectedForwardVersions = successorForwardPortfolio.forwardVersions;
  const expectedCurrentVersions = successorForwardPortfolio.currentVersions;
  const forwardMigrations = FORWARD_104_TO_120_AUTHORITY.forwardMigrations.map((item) => ({
    version: item.version,
    file: item.file,
    sha256: item.sha256,
    bytes: item.bytes,
  }));
  const common = {
    migrationMode: "APPLY_FORWARD_EXACT",
    transition: "EXACT_104_TO_120",
    forwardOnly: true,
    priorMigrationCount: FORWARD_104_TO_120_AUTHORITY.prior.migrationCount,
    forwardMigrationCount: forwardMigrations.length,
    forwardMigrations,
    terminalVersion: FORWARD_104_TO_120_AUTHORITY.current.finalMigration.slice(0, 14),
    idempotencyPolicy: "FAIL_CLOSED_READ_ONLY_REPROOF_AFTER_ANY_COMMIT_OR_AMBIGUITY",
    broker: brokerEvidenceIdentity,
    brokerSourceSha256: brokerSourceIdentity.sha256,
    runtime: process.version,
    expectedPostgresVersion: "17.6",
    projectFingerprint: sha256(projectRef),
    safeSuffix: projectRef.slice(-4),
    releaseBranch: releaseIdentity.branch,
    headCommit: releaseIdentity.headCommit,
    headTree: releaseIdentity.headTree,
    trackedWorktreeSha256: releaseIdentity.trackedWorktreeSha256,
    trackedFileCount: releaseIdentity.trackedFileCount,
    dependencyLockSha256,
    postgresBinarySha256,
    tlsServerAuthentication,
    migrationCount: migrationIdentity.migrationCount,
    migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
    verificationRoundSummarySha256,
    priorApplication,
    priorSyntheticRelationalAuthority: priorSyntheticSurface.evidence,
    rawDatabaseValuesPersisted: false,
  };
  const preflightRecord = writeJsonEvidence("staging-broker-preflight.json", {
    schemaVersion: "dealflow.staging-broker-preflight.v1",
    status: "PREPARED_EXACT_FORWARD_104_TO_120",
    remoteReadStarted: false,
    remoteMutationStarted: false,
    remoteMutationCompleted: false,
    ...common,
  });
  const preflightSummaryRecord = writeJsonEvidence(
    "staging-migration-summary.pre-mutation.json",
    {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: "PREPARED_EXACT_FORWARD_104_TO_120",
      remoteReadStarted: false,
      remoteMutationStarted: false,
      remoteMutationCompleted: false,
      ...common,
    },
  );
  const preflightManifestRecord = writeJsonEvidence(
    "evidence-manifest.pre-mutation.json",
    {
      schemaVersion: "dealflow.staging-evidence-manifest.v1",
      status: "PREPARED_EXACT_FORWARD_104_TO_120",
      remoteMutationStarted: false,
      remoteMutationCompleted: false,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      artifacts: [preflightRecord, preflightSummaryRecord],
    },
  );
  assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);
  const readStartedRecord = writeJsonEvidence("staging-remote-read-started.json", {
    schemaVersion: "dealflow.staging-remote-read-status.v1",
    status: "REMOTE_READ_STARTED_EXACT_FORWARD_104_TO_120",
    remoteReadStarted: true,
    remoteMutationStarted: false,
    remoteMutationCompleted: false,
    ...common,
  });

  let serverVersion = null;
  let preForwardState = null;
  let preForwardSchemaSha256 = null;
  let preForwardAuthSurface = null;
  let mutationStartedRecord = null;
  let transactionExecution = Object.freeze({
    succeeded: false,
    transactionCommitMarkerSeen: false,
    attempted: [],
    appliedInTransaction: [],
    lastAttemptedVersion: null,
    lastAppliedVersion: null,
    processExitStatus: null,
    processSignal: null,
    processError: false,
    processErrorCode: null,
    databaseSqlstate: null,
    sanitizedDatabaseDiagnostic: null,
    sanitizedDatabaseDiagnosticSha256: null,
  });
  let remoteMutationStarted = false;
  let remoteMutationCompleted = false;
  let terminalStatus = "FAILED_PRE_MUTATION_READ";
  let failureCode = "prior_104_remote_state_not_proven";
  let terminalError = null;
  let postForwardState = null;
  let postForwardSchemaSha256 = null;
  let postForwardSchemaBytes = null;
  let postForwardCatalogRepeatSha256 = null;
  let postForwardAuthSurface = null;
  let preForwardRelationalSurface = null;
  let postForwardRelationalSurface = null;
  let prior104RowCountContinuity = null;
  let postForwardManagedSchemaSha256 = null;
  let postForwardManagedSchemaBytes = null;
  let postForwardManagedCatalog = null;
  let postForwardManagedSecurity = null;
  let retentionAuthorityAcl = null;
  let forcedRlsCount = null;

  const assertExactSafeAuthSurface = (proof, label) => {
    const exactHistoricalSynthetic =
      proof.status === FORWARD_104_TO_120_AUTHORITY.prior.authSurface.status &&
      proof.userCount === FORWARD_104_TO_120_AUTHORITY.prior.authSurface.userCount &&
      proof.emailSetSha256 === FORWARD_104_TO_120_AUTHORITY.prior.authSurface.emailSetSha256 &&
      proof.identitySetSha256 === FORWARD_104_TO_120_AUTHORITY.prior.authSurface.identitySetSha256;
    if (
      proof.unexpectedIdentityCount !== 0 ||
      proof.rawIdentityValuesPersisted !== false ||
      !(proof.status === "EMPTY" || exactHistoricalSynthetic)
    ) {
      throw new Error(`${label} is not empty or the exact historical synthetic qibh fixture set`);
    }
  };

  try {
    failureCode = "forward_postgres_version_read_failed";
    serverVersion = sql("show server_version;", "Forward staging PostgreSQL version check");
    if (!serverVersion.startsWith("17.6")) {
      failureCode = "forward_postgres_version_mismatch";
      throw new Error("The forward staging PostgreSQL version does not match exact 17.6");
    }
    failureCode = "prior_104_structural_state_read_failed";
    preForwardState = captureRemoteStructuralState("Forward staging prior-104 verification");
    if (
      classifyForward104RemoteHistory(preForwardState.migrationHistoryVersions, {
        priorVersions: expectedPriorVersions,
        currentVersions: expectedCurrentVersions,
      }) !==
        "EXACT_PRIOR_104_CANDIDATE" ||
      preForwardState.historyTableExists !== true ||
      preForwardState.migrationHistoryCount !== expectedPriorVersions.length ||
      JSON.stringify(preForwardState.migrationHistoryVersions) !==
        JSON.stringify(expectedPriorVersions)
    ) {
      failureCode = "prior_104_history_not_exact";
      throw new Error("Remote staging history is not the exact ordered prior-104 portfolio");
    }
    if (
      preForwardState.structuralCatalogSha256 !==
      FORWARD_104_TO_120_AUTHORITY.prior.structuralCatalogSha256
    ) {
      failureCode = "prior_104_catalog_not_exact";
      throw new Error("Remote staging catalog drifted from the pinned prior-104 qibh seal");
    }
    failureCode = "prior_104_schema_first_capture_failed";
    const preForwardDump = captureNormalizedSchemaDump();
    failureCode = "prior_104_schema_repeat_capture_failed";
    const preForwardDumpRepeat = captureNormalizedSchemaDump();
    preForwardSchemaSha256 = sha256(preForwardDump);
    if (
      preForwardSchemaSha256 !== FORWARD_104_TO_120_AUTHORITY.prior.normalizedSchemaSha256 ||
      preForwardSchemaSha256 !== sha256(preForwardDumpRepeat)
    ) {
      failureCode = "prior_104_schema_not_exact_or_stable";
      throw new Error("Remote staging schema is not the exact stable prior-104 qibh seal");
    }
    if (preForwardState.storageObjectCount !== 0) {
      failureCode = "prior_104_storage_surface_not_empty";
      throw new Error("Remote staging storage surface is not empty");
    }
    failureCode = "prior_104_auth_surface_not_exact";
    preForwardAuthSurface = captureAndAssertStagingAuthSurface(
      "Verify pre-forward auth surface is empty or exact synthetic qibh fixtures",
    );
    assertExactSafeAuthSurface(preForwardAuthSurface, "Pre-forward auth surface");
    if (preForwardAuthSurface.userCount !== preForwardState.authUserCount) {
      failureCode = "prior_104_auth_surface_count_mismatch";
      throw new Error("Pre-forward synthetic auth identity and structural counts diverged");
    }
    failureCode = "prior_104_relational_or_credential_surface_not_exact";
    preForwardRelationalSurface = captureAndAssertSyntheticRelationalSurface(
      priorSyntheticSurface,
      "Verify pre-forward synthetic relational surface",
    );
    failureCode = "provider_controls_read_failed_before_forward_120";
    const activationControls = sql(
      "select environment || ':' || activation_writes_enabled::text from public.meta_campaign_activation_runtime_controls order by environment;",
      "Verify pre-forward closed Meta activation controls",
    ).split("\n").filter(Boolean);
    const ghlControls = sql(
      "select environment || ':' || provisioning_writes_enabled::text || ':' || lead_writes_enabled::text || ':' || lifecycle_webhook_enabled::text from public.ghl_runtime_controls order by environment;",
      "Verify pre-forward closed GHL controls",
    ).split("\n").filter(Boolean);
    if (
      activationControls.length < 2 ||
      activationControls.some((row) => !row.endsWith(":false")) ||
      ghlControls.length !== 3 ||
      ghlControls.some((row) => !row.endsWith(":false:false:false"))
    ) {
      failureCode = "provider_controls_not_closed_before_forward_120";
      throw new Error("Provider runtime controls are not fail-closed before forward migration");
    }

    assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);
    mutationStartedRecord = writeJsonEvidence("staging-mutation-started.json", {
      schemaVersion: "dealflow.staging-mutation-status.v1",
      status: "FORWARD_104_TO_120_MUTATION_STARTED",
      remoteMutationStarted: true,
      remoteMutationCompleted: false,
      singleOuterTransaction: true,
      migrationHistoryReceiptsInsideOuterTransaction: true,
      expectedForwardMigrationCount: expectedForwardVersions.length,
      preflightStructuralCatalogSha256: preForwardState.structuralCatalogSha256,
      preflightNormalizedSchemaSha256: preForwardSchemaSha256,
      preflightAuthSurface: preForwardAuthSurface,
      ...common,
    });
    remoteMutationStarted = true;
    // This immutable marker is the final operation before the only remote
    // write. Migrations 105-120 and all 16 history receipts share one outer
    // PostgreSQL transaction. There is no retry after this boundary.
    failureCode = "forward_104_to_120_atomic_transaction_failed";
    transactionExecution = executeForwardMigrationTransaction();
    if (
      !transactionExecution.succeeded ||
      !transactionExecution.transactionCommitMarkerSeen ||
      JSON.stringify(transactionExecution.attempted) !== JSON.stringify(expectedForwardVersions) ||
      JSON.stringify(transactionExecution.appliedInTransaction) !==
        JSON.stringify(expectedForwardVersions)
    ) {
      throw new Error("The exact migrations 105-120 transaction did not commit completely");
    }
    remoteMutationCompleted = true;

    failureCode = "forward_120_structural_state_read_failed";
    postForwardState = captureRemoteStructuralState("Forward staging post-120 verification");
    if (
      !hasExactMigrationHistory(postForwardState) ||
      JSON.stringify(postForwardState.migrationHistoryVersions) !==
        JSON.stringify(expectedCurrentVersions)
    ) {
      failureCode = "forward_120_history_mismatch";
      throw new Error("Remote staging does not contain the exact ordered 120-migration history");
    }
    if (postForwardState.storageObjectCount !== 0) {
      failureCode = "post_forward_storage_surface_not_empty";
      throw new Error("Remote staging storage surface is not empty after forward migration");
    }
    failureCode = "post_forward_auth_surface_not_exact";
    postForwardAuthSurface = captureAndAssertStagingAuthSurface(
      "Verify post-forward auth surface remains exact synthetic qibh fixtures",
    );
    assertExactSafeAuthSurface(postForwardAuthSurface, "Post-forward auth surface");
    if (JSON.stringify(postForwardAuthSurface) !== JSON.stringify(preForwardAuthSurface)) {
      failureCode = "post_forward_auth_surface_changed";
      throw new Error("Forward migration changed the bounded synthetic auth identity surface");
    }
    failureCode = "post_forward_relational_or_credential_surface_not_exact";
    postForwardRelationalSurface = captureAndAssertSyntheticRelationalSurface(
      priorSyntheticSurface,
      "Verify post-forward synthetic relational surface",
      { requireSuccessorCredentialTables: true },
    );
    failureCode = "forward_120_prior_customer_row_counts_changed";
    prior104RowCountContinuity = assertPrior104RowCountContinuity(
      preForwardRelationalSurface,
      postForwardRelationalSurface,
      { allowExpectedControlPlaneCountChanges: true },
    );
    failureCode = "forward_120_catalog_repeat_read_failed";
    const postForwardCatalogRepeat = captureRemoteCatalogIdentity(
      "Forward staging repeated post-120 catalog identity",
    );
    postForwardCatalogRepeatSha256 = postForwardCatalogRepeat.structuralCatalogSha256;
    if (postForwardCatalogRepeatSha256 !== postForwardState.structuralCatalogSha256) {
      failureCode = "forward_120_catalog_nondeterministic";
      throw new Error("Post-migration structural catalog was not stable across repeated capture");
    }
    failureCode = "forward_120_managed_catalog_first_capture_failed";
    postForwardManagedCatalog = captureManagedCatalogIdentity(
      "Forward staging post-120 managed catalog oracle",
    );
    failureCode = "forward_120_managed_catalog_repeat_capture_failed";
    const postForwardManagedCatalogRepeat = captureManagedCatalogIdentity(
      "Forward staging repeated post-120 managed catalog oracle",
    );
    if (
      postForwardManagedCatalog.managedStructuralCatalogSha256 !==
        FORWARD_104_TO_120_AUTHORITY.current.managedStructuralCatalogSha256 ||
      postForwardManagedCatalog.managedStructuralCatalogSha256 !==
        postForwardManagedCatalogRepeat.managedStructuralCatalogSha256 ||
      postForwardManagedCatalog.managedStructuralCatalogRecordCount !==
        postForwardManagedCatalogRepeat.managedStructuralCatalogRecordCount
    ) {
      failureCode = "forward_120_managed_catalog_not_exact_or_stable";
      throw new Error("Post-migration managed catalog does not match the independent 120 oracle");
    }
    failureCode = "forward_120_schema_first_capture_failed";
    const postForwardDump = captureNormalizedSchemaDump();
    failureCode = "forward_120_schema_repeat_capture_failed";
    const postForwardDumpRepeat = captureNormalizedSchemaDump();
    postForwardSchemaSha256 = sha256(postForwardDump);
    postForwardSchemaBytes = Buffer.byteLength(postForwardDump);
    if (postForwardSchemaSha256 !== sha256(postForwardDumpRepeat)) {
      failureCode = "forward_120_schema_nondeterministic";
      throw new Error("Post-migration normalized schema was not stable across repeated capture");
    }
    failureCode = "forward_120_managed_schema_first_capture_failed";
    const postForwardManagedDump = captureManagedNormalizedSchemaDump();
    failureCode = "forward_120_managed_schema_repeat_capture_failed";
    const postForwardManagedDumpRepeat = captureManagedNormalizedSchemaDump();
    postForwardManagedSchemaSha256 = sha256(postForwardManagedDump);
    postForwardManagedSchemaBytes = Buffer.byteLength(postForwardManagedDump);
    if (
      postForwardManagedSchemaSha256 !==
        FORWARD_104_TO_120_AUTHORITY.current.managedNormalizedSchemaSha256 ||
      postForwardManagedSchemaSha256 !== sha256(postForwardManagedDumpRepeat)
    ) {
      failureCode = "forward_120_managed_schema_not_exact_or_stable";
      throw new Error("Post-migration managed schema does not match the independent 120 oracle");
    }
    failureCode = "forward_120_managed_security_capture_failed";
    postForwardManagedSecurity = captureManagedSecurityOracle(
      "Forward staging post-120 managed security oracle",
    );
    if (
      postForwardManagedSecurity.managedSecurityOracleSha256 !==
      FORWARD_104_TO_120_AUTHORITY.current.managedSecurityOracleSha256
    ) {
      failureCode = "forward_120_managed_security_not_exact";
      throw new Error("Post-migration ACL, policy, or routine state drifted from the independent 120 oracle");
    }
    failureCode = "retention_table_or_column_acl_not_hardened";
    retentionAuthorityAcl = captureAndAssertRetentionAuthorityAcl(
      "Verify post-forward retention authority table and column ACLs",
    );
    failureCode = "provider_controls_read_failed_after_forward_120";
    const postActivationControls = sql(
      "select environment || ':' || activation_writes_enabled::text from public.meta_campaign_activation_runtime_controls order by environment;",
      "Verify post-forward closed Meta activation controls",
    ).split("\n").filter(Boolean);
    const postGhlControls = sql(
      "select environment || ':' || provisioning_writes_enabled::text || ':' || lead_writes_enabled::text || ':' || lifecycle_webhook_enabled::text from public.ghl_runtime_controls order by environment;",
      "Verify post-forward closed GHL controls",
    ).split("\n").filter(Boolean);
    if (
      postActivationControls.length < 2 ||
      postActivationControls.some((row) => !row.endsWith(":false")) ||
      postGhlControls.length !== 3 ||
      postGhlControls.some((row) => !row.endsWith(":false:false:false"))
    ) {
      failureCode = "provider_controls_not_closed_after_forward_120";
      throw new Error("Provider runtime controls are not fail-closed after forward migration");
    }
    failureCode = "forward_120_forced_rls_count_read_failed";
    forcedRlsCount = Number(sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity and c.relforcerowsecurity;",
      "Count post-forward forced-RLS tables",
    ));
    failureCode = "forward_120_broker_source_rebind_failed";
    assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);
    terminalStatus = "PASS";
    failureCode = null;
  } catch (error) {
    terminalError = error;
    if (remoteMutationStarted) {
      try {
        const observedState = captureRemoteStructuralState(
          "Forward staging ambiguity recovery readback",
        );
        const observedHistoryClass = classifyForward104RemoteHistory(
          observedState.migrationHistoryVersions,
          {
            priorVersions: expectedPriorVersions,
            currentVersions: expectedCurrentVersions,
          },
        );
        const observedDump = captureNormalizedSchemaDump();
        const observedDumpRepeat = captureNormalizedSchemaDump();
        const observedSchemaSha256 = sha256(observedDump);
        const observedCatalogRepeat = captureRemoteCatalogIdentity(
          "Forward staging ambiguity repeated catalog readback",
        );
        const observedAuthSurface = captureAndAssertStagingAuthSurface(
          "Forward staging ambiguity auth-surface readback",
        );
        assertExactSafeAuthSurface(observedAuthSurface, "Ambiguity readback auth surface");
        const observedRelationalSurface = captureAndAssertSyntheticRelationalSurface(
          priorSyntheticSurface,
          "Forward staging ambiguity relational readback",
          {
            requireSuccessorCredentialTables:
              observedHistoryClass ===
              "POSSIBLE_CURRENT_120_REQUIRES_FULL_READ_ONLY_PROOF",
          },
        );
        let observedRowCountContinuity = null;
        if (preForwardRelationalSurface) {
          observedRowCountContinuity = assertPrior104RowCountContinuity(
            preForwardRelationalSurface,
            observedRelationalSurface,
            {
              allowExpectedControlPlaneCountChanges:
                observedHistoryClass ===
                "POSSIBLE_CURRENT_120_REQUIRES_FULL_READ_ONLY_PROOF",
            },
          );
        }
        let observedManagedSchemaSha256 = null;
        let observedManagedCatalogSha256 = null;
        let observedManagedSecuritySha256 = null;
        if (
          observedHistoryClass ===
          "POSSIBLE_CURRENT_120_REQUIRES_FULL_READ_ONLY_PROOF"
        ) {
          const observedManagedDump = captureManagedNormalizedSchemaDump();
          const observedManagedDumpRepeat = captureManagedNormalizedSchemaDump();
          observedManagedSchemaSha256 = sha256(observedManagedDump);
          if (observedManagedSchemaSha256 !== sha256(observedManagedDumpRepeat)) {
            throw new Error("Ambiguity readback managed schema is nondeterministic");
          }
          observedManagedSecuritySha256 = captureManagedSecurityOracle(
            "Forward staging ambiguity managed security readback",
          ).managedSecurityOracleSha256;
          observedManagedCatalogSha256 = captureManagedCatalogIdentity(
            "Forward staging ambiguity managed catalog readback",
          ).managedStructuralCatalogSha256;
        }
        if (
          observedHistoryClass === "EXACT_PRIOR_104_CANDIDATE" &&
          JSON.stringify(observedState.migrationHistoryVersions) ===
            JSON.stringify(expectedPriorVersions) &&
          observedState.structuralCatalogSha256 ===
            FORWARD_104_TO_120_AUTHORITY.prior.structuralCatalogSha256 &&
          observedSchemaSha256 === FORWARD_104_TO_120_AUTHORITY.prior.normalizedSchemaSha256 &&
          observedSchemaSha256 === sha256(observedDumpRepeat) &&
          observedCatalogRepeat.structuralCatalogSha256 ===
            observedState.structuralCatalogSha256 &&
          observedState.storageObjectCount === 0 &&
          observedRowCountContinuity?.status ===
            "EXACT_PREEXISTING_CUSTOMER_ROW_COUNTS_PRESERVED" &&
          observedRelationalSurface.status === "EXACT_SEALED_SYNTHETIC_ROOTS_ONLY"
        ) {
          remoteMutationCompleted = false;
          terminalStatus = "ROLLED_BACK_EXACT_PRIOR_104";
        } else if (
          observedHistoryClass === "POSSIBLE_CURRENT_120_REQUIRES_FULL_READ_ONLY_PROOF" &&
          JSON.stringify(observedState.migrationHistoryVersions) ===
            JSON.stringify(expectedCurrentVersions) &&
          observedSchemaSha256 === sha256(observedDumpRepeat) &&
          observedCatalogRepeat.structuralCatalogSha256 ===
            observedState.structuralCatalogSha256 &&
          observedState.storageObjectCount === 0 &&
          observedRowCountContinuity?.status ===
            "EXACT_PREEXISTING_CUSTOMER_ROW_COUNTS_PRESERVED" &&
          observedRelationalSurface.status === "EXACT_SEALED_SYNTHETIC_ROOTS_ONLY" &&
          observedManagedSchemaSha256 ===
            FORWARD_104_TO_120_AUTHORITY.current.managedNormalizedSchemaSha256 &&
          observedManagedCatalogSha256 ===
            FORWARD_104_TO_120_AUTHORITY.current.managedStructuralCatalogSha256 &&
          observedManagedSecuritySha256 ===
            FORWARD_104_TO_120_AUTHORITY.current.managedSecurityOracleSha256
        ) {
          terminalStatus = remoteMutationCompleted
            ? "FAILED_AFTER_FORWARD_120_COMMIT"
            : "FAILED_FORWARD_120_STATE_DETECTED_REQUIRES_READ_ONLY_REPROOF";
          remoteMutationCompleted = remoteMutationCompleted ? true : null;
        } else {
          remoteMutationCompleted = null;
          terminalStatus = "FAILED_FORWARD_REMOTE_STATE_NOT_PROVEN";
        }
      } catch {
        remoteMutationCompleted = null;
        terminalStatus = "FAILED_FORWARD_REMOTE_STATE_NOT_PROVEN";
      }
    }
  }

  if (!mutationStartedRecord) {
    mutationStartedRecord = writeJsonEvidence("staging-mutation-started.json", {
      schemaVersion: "dealflow.staging-mutation-status.v1",
      status: "FORWARD_104_TO_120_MUTATION_NOT_STARTED",
      remoteMutationStarted: false,
      remoteMutationCompleted: false,
      ...common,
    });
  }
  const mutationStatusRecord = writeJsonEvidence("staging-mutation-status.json", {
    schemaVersion: "dealflow.staging-mutation-status.v1",
    status: terminalStatus,
    failureCode,
    remoteMutationStarted,
    remoteMutationCompleted,
    singleOuterTransaction: true,
    migrationHistoryReceiptsInsideOuterTransaction: true,
    lastAttemptedVersion: transactionExecution.lastAttemptedVersion,
    lastAppliedVersion: transactionExecution.lastAppliedVersion,
    lastCommittedVersion: remoteMutationCompleted === true
      ? transactionExecution.lastAppliedVersion
      : null,
    attemptedCount: transactionExecution.attempted.length,
    appliedInTransactionCount: transactionExecution.appliedInTransaction.length,
    processExitStatus: transactionExecution.processExitStatus,
    processSignal: transactionExecution.processSignal,
    processError: transactionExecution.processError,
    processErrorCode: transactionExecution.processErrorCode,
    transactionCommitMarkerSeen: transactionExecution.transactionCommitMarkerSeen,
    databaseSqlstate: transactionExecution.databaseSqlstate,
    sanitizedDatabaseDiagnostic: transactionExecution.sanitizedDatabaseDiagnostic,
    sanitizedDatabaseDiagnosticSha256:
      transactionExecution.sanitizedDatabaseDiagnosticSha256,
    preflightStructuralCatalogSha256: preForwardState?.structuralCatalogSha256 ?? null,
    preflightNormalizedSchemaSha256: preForwardSchemaSha256,
    preflightSyntheticRelationalSurfaceSha256:
      preForwardRelationalSurface?.syntheticRelationalSurfaceSha256 ?? null,
    postStructuralCatalogSha256: postForwardState?.structuralCatalogSha256 ?? null,
    postNormalizedSchemaSha256: postForwardSchemaSha256,
    postManagedNormalizedSchemaSha256: postForwardManagedSchemaSha256,
    postManagedSecurityOracleSha256:
      postForwardManagedSecurity?.managedSecurityOracleSha256 ?? null,
    postSyntheticRelationalSurfaceSha256:
      postForwardRelationalSurface?.syntheticRelationalSurfaceSha256 ?? null,
    ...common,
  });

  if (terminalError) {
    const failureRecord = writeJsonEvidence("staging-migration-failure.json", {
      schemaVersion: "dealflow.isolated-staging-migration-failure.v1",
      status: terminalStatus,
      failureCode,
      remoteMutationStarted,
      remoteMutationCompleted,
      databaseSqlstate: transactionExecution.databaseSqlstate,
      sanitizedDatabaseDiagnostic: transactionExecution.sanitizedDatabaseDiagnostic,
      sanitizedDatabaseDiagnosticSha256:
        transactionExecution.sanitizedDatabaseDiagnosticSha256,
      rawErrorPersisted: false,
      ...common,
    });
    const failureSummaryRecord = writeJsonEvidence("staging-migration-summary.json", {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: terminalStatus,
      failureCode,
      remoteMutationStarted,
      remoteMutationCompleted,
      singleOuterTransaction: true,
      migrationHistoryReceiptsInsideOuterTransaction: true,
      lastAttemptedVersion: transactionExecution.lastAttemptedVersion,
      lastAppliedVersion: transactionExecution.lastAppliedVersion,
      lastCommittedVersion: remoteMutationCompleted === true
        ? transactionExecution.lastAppliedVersion
        : null,
      rawErrorPersisted: false,
      ...common,
    });
    const failureManifestRecord = writeJsonEvidence("evidence-manifest.json", {
      schemaVersion: "dealflow.staging-evidence-manifest.v1",
      status: terminalStatus,
      migrationMode: "APPLY_FORWARD_EXACT",
      transition: "EXACT_104_TO_120",
      remoteMutationStarted,
      remoteMutationCompleted,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      priorApplication,
      artifacts: [
        preflightRecord,
        preflightSummaryRecord,
        preflightManifestRecord,
        readStartedRecord,
        mutationStartedRecord,
        mutationStatusRecord,
        failureRecord,
        failureSummaryRecord,
      ],
    });
    throw new Error(
      `Exact forward migrations 105-120 ${terminalStatus}; evidence manifest ${failureManifestRecord.sha256}`,
    );
  }

  const applied = migrationSources.map(({ file, version, body }) => ({
    version,
    file,
    sha256: sha256(body),
  }));
  const result = {
    schemaVersion: "dealflow.isolated-staging-migration-proof.v1",
    status: "PASS",
    remoteMutationStarted: true,
    remoteMutationCompleted: true,
    portfolioApplicationRemoteMutationCompleted: true,
    serverVersion,
    migrationHistoryCount: postForwardState.migrationHistoryCount,
    publicTableCount: postForwardState.publicTableCount,
    forcedRlsCount,
    activationRuntimeControlsDefaultClosed: true,
    ghlRuntimeControlsDefaultClosed: true,
    ...retentionAuthorityAcl,
    preForwardAuthSurface,
    postForwardAuthSurface,
    preForwardRelationalSurface,
    postForwardRelationalSurface,
    prior104RowCountContinuity,
    storageObjectCountAtVerification: postForwardState.storageObjectCount,
    ghlEmbedAuthExchangeCountAtVerification:
      postForwardState.ghlEmbedAuthExchangeCount,
    normalizedSchemaSha256: postForwardSchemaSha256,
    normalizedSchemaBytes: postForwardSchemaBytes,
    managedNormalizedSchemaSha256: postForwardManagedSchemaSha256,
    managedNormalizedSchemaBytes: postForwardManagedSchemaBytes,
    ...postForwardManagedCatalog,
    ...postForwardManagedSecurity,
    repeatedStructuralCatalogSha256: postForwardCatalogRepeatSha256,
    singleOuterTransaction: true,
    migrationHistoryReceiptsInsideOuterTransaction: true,
    lastAttemptedVersion: FORWARD_104_TO_120_AUTHORITY.current.finalMigration.slice(0, 14),
    lastAppliedVersion: FORWARD_104_TO_120_AUTHORITY.current.finalMigration.slice(0, 14),
    lastCommittedVersion: FORWARD_104_TO_120_AUTHORITY.current.finalMigration.slice(0, 14),
    remoteStateVerification: {
      status: "EXACT_FORWARD_104_TO_120_COMMITTED_PORTFOLIO",
      readOnly: true,
      exactPrior104StateBeforeMutation: true,
      exactCommittedPortfolioState: true,
      repeatedCatalogAndSchemaStable: true,
      state: postForwardState,
    },
    applied,
    ...common,
  };
  const proofRecord = writeJsonEvidence("staging-migration-proof.json", result);
  const summaryRecord = writeJsonEvidence("staging-migration-summary.json", {
    schemaVersion: "dealflow.staging-migration-summary.v1",
    status: "PASS",
    failureCode: null,
    remoteMutationStarted: true,
    remoteMutationCompleted: true,
    portfolioApplicationRemoteMutationCompleted: true,
    singleOuterTransaction: true,
    migrationHistoryReceiptsInsideOuterTransaction: true,
    serverVersion,
    migrationHistoryCount: postForwardState.migrationHistoryCount,
    normalizedSchemaSha256: postForwardSchemaSha256,
    managedNormalizedSchemaSha256: postForwardManagedSchemaSha256,
    managedStructuralCatalogSha256:
      postForwardManagedCatalog.managedStructuralCatalogSha256,
    managedSecurityOracleSha256:
      postForwardManagedSecurity.managedSecurityOracleSha256,
    preForwardRelationalSurface,
    postForwardRelationalSurface,
    prior104RowCountContinuity,
    ghlEmbedAuthExchangeCountAtVerification:
      postForwardState.ghlEmbedAuthExchangeCount,
    ...retentionAuthorityAcl,
    lastAttemptedVersion: FORWARD_104_TO_120_AUTHORITY.current.finalMigration.slice(0, 14),
    lastAppliedVersion: FORWARD_104_TO_120_AUTHORITY.current.finalMigration.slice(0, 14),
    lastCommittedVersion: FORWARD_104_TO_120_AUTHORITY.current.finalMigration.slice(0, 14),
    remoteStateVerificationStatus: "EXACT_FORWARD_104_TO_120_COMMITTED_PORTFOLIO",
    ...common,
  });
  const manifestRecord = writeJsonEvidence("evidence-manifest.json", {
    schemaVersion: "dealflow.staging-evidence-manifest.v1",
    status: "PASS",
    migrationMode: "APPLY_FORWARD_EXACT",
    transition: "EXACT_104_TO_120",
    remoteMutationStarted: true,
    remoteMutationCompleted: true,
    broker: brokerEvidenceIdentity,
    brokerSourceSha256: brokerSourceIdentity.sha256,
    priorApplication,
    artifacts: [
      preflightRecord,
      preflightSummaryRecord,
      preflightManifestRecord,
      readStartedRecord,
      mutationStartedRecord,
      mutationStatusRecord,
      proofRecord,
      summaryRecord,
    ],
  });
  process.stdout.write(
    `Exact forward migrations 105-120 PASS: prior 104 qibh seal proven, 16 migrations committed, PostgreSQL ${serverVersion}, schema ${postForwardSchemaSha256}, manifest ${manifestRecord.sha256}\n`,
  );
  process.exit(0);
  /* c8 ignore stop */
}

if (migrationMode === "APPLY_SUCCESSOR_EXACT") {
  const priorApplication = loadAndValidatePriorMigrationProof({
    requirePinnedPrior103: false,
    requireExactPrior122: true,
  });
  if (
    priorApplication.migrationCount !== FORWARD_122_TO_123_AUTHORITY.prior.migrationCount ||
    priorApplication.migrationPortfolioSha256 !==
      FORWARD_122_TO_123_AUTHORITY.prior.migrationPortfolioSha256 ||
    priorApplication.lastCommittedVersion !==
      FORWARD_122_TO_123_AUTHORITY.prior.finalMigration.slice(0, 14) ||
    JSON.stringify(priorApplication.migrationFiles) !== JSON.stringify(
      locationTokenScopeSuccessorPortfolio.priorRecords.map((record) => ({
        version: record.name.slice(0, 14),
        file: record.name,
        sha256: record.sha256,
      })),
    )
  ) {
    throw new Error("The first 122 migration filenames and SQL hashes are not the sealed prior portfolio");
  }
  const common = {
    migrationMode: "APPLY_SUCCESSOR_EXACT",
    transition: "EXACT_122_TO_123",
    forwardOnly: true,
    priorMigrationCount: FORWARD_122_TO_123_AUTHORITY.prior.migrationCount,
    forwardMigrationCount: 1,
    forwardMigration: {
      version: locationTokenScopeSuccessorMigrationSources[0].version,
      file: locationTokenScopeSuccessorMigrationSources[0].file,
      sha256: sha256(locationTokenScopeSuccessorMigrationSources[0].body),
    },
    broker: brokerEvidenceIdentity,
    brokerSourceSha256: brokerSourceIdentity.sha256,
    runtime: process.version,
    expectedPostgresVersion: "17.6",
    projectFingerprint: sha256(projectRef),
    safeSuffix: projectRef.slice(-4),
    releaseBranch: releaseIdentity.branch,
    headCommit: releaseIdentity.headCommit,
    headTree: releaseIdentity.headTree,
    trackedWorktreeSha256: releaseIdentity.trackedWorktreeSha256,
    trackedFileCount: releaseIdentity.trackedFileCount,
    dependencyLockSha256,
    postgresBinarySha256,
    tlsServerAuthentication,
    migrationCount: migrationIdentity.migrationCount,
    migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
    verificationRoundSummarySha256,
    priorApplication,
  };
  const preflightRecord = writeJsonEvidence("staging-broker-preflight.json", {
    schemaVersion: "dealflow.staging-broker-preflight.v1",
    status: "PREPARED_EXACT_FORWARD_122_TO_123",
    remoteReadStarted: false,
    remoteMutationStarted: false,
    remoteMutationCompleted: false,
    ...common,
  });
  const preflightSummaryRecord = writeJsonEvidence(
    "staging-migration-summary.pre-mutation.json",
    {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: "PREPARED_EXACT_FORWARD_122_TO_123",
      remoteReadStarted: false,
      remoteMutationStarted: false,
      remoteMutationCompleted: false,
      ...common,
    },
  );
  const preflightManifestRecord = writeJsonEvidence(
    "evidence-manifest.pre-mutation.json",
    {
      schemaVersion: "dealflow.staging-evidence-manifest.v1",
      status: "PREPARED_EXACT_FORWARD_122_TO_123",
      remoteMutationStarted: false,
      remoteMutationCompleted: false,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      artifacts: [preflightRecord, preflightSummaryRecord],
    },
  );
  assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);
  const readStartedRecord = writeJsonEvidence("staging-remote-read-started.json", {
    schemaVersion: "dealflow.staging-remote-read-status.v1",
    status: "REMOTE_READ_STARTED_EXACT_FORWARD_122_TO_123",
    remoteReadStarted: true,
    remoteMutationStarted: false,
    remoteMutationCompleted: false,
    ...common,
  });

  let serverVersion = null;
  let preForwardState = null;
  let preForwardSchemaSha256 = null;
  let mutationStartedRecord = null;
  let transactionExecution = Object.freeze({
    succeeded: false,
    transactionCommitMarkerSeen: false,
    attempted: [],
    appliedInTransaction: [],
    lastAttemptedVersion: null,
    lastAppliedVersion: null,
    processExitStatus: null,
    processSignal: null,
    processError: false,
    processErrorCode: null,
    databaseSqlstate: null,
    sanitizedDatabaseDiagnostic: null,
    sanitizedDatabaseDiagnosticSha256: null,
  });
  let remoteMutationStarted = false;
  let remoteMutationCompleted = false;
  let terminalStatus = "FAILED_PRE_MUTATION_READ";
  let failureCode = "prior_122_remote_state_not_proven";
  let terminalError = null;
  let postForwardState = null;
  let postForwardSchemaSha256 = null;
  let postForwardSchemaBytes = null;
  let postForwardCatalogRepeatSha256 = null;
  let retentionAuthorityAcl = null;
  let forcedRlsCount = null;

  try {
    serverVersion = sql("show server_version;", "Forward staging PostgreSQL version check");
    if (!serverVersion.startsWith("17.6")) {
      failureCode = "forward_postgres_version_mismatch";
      throw new Error("The forward staging PostgreSQL version does not match exact 17.6");
    }
    preForwardState = captureRemoteStructuralState("Forward staging prior-122 verification");
    const expectedPriorVersions = priorApplication.migrationFiles.map((item) => item.version);
    if (
      preForwardState.historyTableExists !== true ||
      preForwardState.migrationHistoryCount !== FORWARD_122_TO_123_AUTHORITY.prior.migrationCount ||
      JSON.stringify(preForwardState.migrationHistoryVersions) !==
        JSON.stringify(expectedPriorVersions)
    ) {
      failureCode = "prior_122_history_not_proven";
      throw new Error("Remote staging history is not the exact sealed 122-migration state");
    }
    if (preForwardState.structuralCatalogSha256 !== priorApplication.structuralCatalogSha256) {
      failureCode = "prior_122_catalog_not_proven";
      throw new Error("Remote staging catalog drifted from the sealed 122-migration proof");
    }
    const preForwardDump = captureNormalizedSchemaDump();
    preForwardSchemaSha256 = sha256(preForwardDump);
    if (preForwardSchemaSha256 !== priorApplication.normalizedSchemaSha256) {
      failureCode = "prior_122_schema_not_proven";
      throw new Error("Remote staging schema drifted from the sealed 122-migration proof");
    }
    const activationControls = sql(
      "select environment || ':' || activation_writes_enabled::text from public.meta_campaign_activation_runtime_controls order by environment;",
      "Verify pre-forward closed Meta activation controls",
    ).split("\n").filter(Boolean);
    const ghlControls = sql(
      "select environment || ':' || provisioning_writes_enabled::text || ':' || lead_writes_enabled::text || ':' || lifecycle_webhook_enabled::text from public.ghl_runtime_controls order by environment;",
      "Verify pre-forward closed GHL controls",
    ).split("\n").filter(Boolean);
    if (
      activationControls.length < 2 ||
      activationControls.some((row) => !row.endsWith(":false")) ||
      ghlControls.length !== 3 ||
      ghlControls.some((row) => !row.endsWith(":false:false:false"))
    ) {
      failureCode = "provider_controls_not_closed_before_forward_123";
      throw new Error("Provider runtime controls are not fail-closed before migration 123");
    }

    assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);
    mutationStartedRecord = writeJsonEvidence("staging-mutation-started.json", {
      schemaVersion: "dealflow.staging-mutation-status.v1",
      status: "FORWARD_123_MUTATION_STARTED",
      remoteMutationStarted: true,
      remoteMutationCompleted: false,
      singleOuterTransaction: true,
      migrationHistoryReceiptsInsideOuterTransaction: true,
      expectedForwardMigrationCount: 1,
      preflightStructuralCatalogSha256: preForwardState.structuralCatalogSha256,
      preflightNormalizedSchemaSha256: preForwardSchemaSha256,
      ...common,
    });
    remoteMutationStarted = true;
    // This marker is the final operation before the only remote write. The SQL
    // body of migration 123 and its history receipt share one outer transaction.
    transactionExecution = executeLocationTokenScopeSuccessorMigrationTransaction();
    if (
      !transactionExecution.succeeded ||
      !transactionExecution.transactionCommitMarkerSeen ||
      JSON.stringify(transactionExecution.attempted) !==
        JSON.stringify([requiredFinalMigration.slice(0, 14)]) ||
      JSON.stringify(transactionExecution.appliedInTransaction) !==
        JSON.stringify([requiredFinalMigration.slice(0, 14)])
    ) {
      failureCode = "forward_123_atomic_transaction_failed";
      throw new Error("The exact migration 123 transaction did not commit completely");
    }
    remoteMutationCompleted = true;

    postForwardState = captureRemoteStructuralState("Forward staging post-123 verification");
    if (!hasExactMigrationHistory(postForwardState)) {
      failureCode = "forward_123_history_mismatch";
      throw new Error("Remote staging does not contain the exact 123-migration history");
    }
    const postForwardCatalogRepeat = captureRemoteCatalogIdentity(
      "Forward staging repeated post-123 catalog identity",
    );
    postForwardCatalogRepeatSha256 = postForwardCatalogRepeat.structuralCatalogSha256;
    if (postForwardCatalogRepeatSha256 !== postForwardState.structuralCatalogSha256) {
      failureCode = "forward_123_catalog_nondeterministic";
      throw new Error("Post-migration structural catalog was not stable across repeated capture");
    }
    const postForwardDump = captureNormalizedSchemaDump();
    const postForwardDumpRepeat = captureNormalizedSchemaDump();
    postForwardSchemaSha256 = sha256(postForwardDump);
    postForwardSchemaBytes = Buffer.byteLength(postForwardDump);
    if (postForwardSchemaSha256 !== sha256(postForwardDumpRepeat)) {
      failureCode = "forward_123_schema_nondeterministic";
      throw new Error("Post-migration normalized schema was not stable across repeated capture");
    }
    failureCode = "retention_table_or_column_acl_not_hardened";
    retentionAuthorityAcl = captureAndAssertRetentionAuthorityAcl(
      "Verify post-forward retention authority table and column ACLs",
    );
    const postActivationControls = sql(
      "select environment || ':' || activation_writes_enabled::text from public.meta_campaign_activation_runtime_controls order by environment;",
      "Verify post-forward closed Meta activation controls",
    ).split("\n").filter(Boolean);
    const postGhlControls = sql(
      "select environment || ':' || provisioning_writes_enabled::text || ':' || lead_writes_enabled::text || ':' || lifecycle_webhook_enabled::text from public.ghl_runtime_controls order by environment;",
      "Verify post-forward closed GHL controls",
    ).split("\n").filter(Boolean);
    if (
      postActivationControls.length < 2 ||
      postActivationControls.some((row) => !row.endsWith(":false")) ||
      postGhlControls.length !== 3 ||
      postGhlControls.some((row) => !row.endsWith(":false:false:false"))
    ) {
      failureCode = "provider_controls_not_closed_after_forward_123";
      throw new Error("Provider runtime controls are not fail-closed after migration 123");
    }
    forcedRlsCount = Number(sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity and c.relforcerowsecurity;",
      "Count post-forward forced-RLS tables",
    ));
    assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);
    terminalStatus = "PASS";
    failureCode = null;
  } catch (error) {
    terminalError = error;
    if (remoteMutationStarted) {
      try {
        const observedState = captureRemoteStructuralState("Forward staging failure-state verification");
        const expectedPriorVersions = priorApplication.migrationFiles.map((item) => item.version);
        const exactPriorHistory =
          observedState.migrationHistoryCount ===
            FORWARD_122_TO_123_AUTHORITY.prior.migrationCount &&
          JSON.stringify(observedState.migrationHistoryVersions) ===
            JSON.stringify(expectedPriorVersions);
        const observedDumpSha256 = sha256(captureNormalizedSchemaDump());
        const exactPriorState =
          exactPriorHistory &&
          observedState.structuralCatalogSha256 === priorApplication.structuralCatalogSha256 &&
          observedDumpSha256 === priorApplication.normalizedSchemaSha256;
        if (exactPriorState) {
          remoteMutationCompleted = false;
          terminalStatus = "ROLLED_BACK_EXACT_PRIOR_122";
        } else if (hasExactMigrationHistory(observedState) && remoteMutationCompleted) {
          terminalStatus = "FAILED_AFTER_FORWARD_123_COMMIT";
        } else if (hasExactMigrationHistory(observedState)) {
          remoteMutationCompleted = null;
          terminalStatus = "FAILED_FORWARD_123_STATE_DETECTED_WITHOUT_COMMIT_PROOF";
        } else {
          remoteMutationCompleted = null;
          terminalStatus = "FAILED_FORWARD_REMOTE_STATE_NOT_PROVEN";
        }
      } catch {
        remoteMutationCompleted = null;
        terminalStatus = "FAILED_FORWARD_REMOTE_STATE_NOT_PROVEN";
      }
    }
  }

  if (!mutationStartedRecord) {
    mutationStartedRecord = writeJsonEvidence("staging-mutation-started.json", {
      schemaVersion: "dealflow.staging-mutation-status.v1",
      status: "FORWARD_123_MUTATION_NOT_STARTED",
      remoteMutationStarted: false,
      remoteMutationCompleted: false,
      ...common,
    });
  }
  const mutationStatusRecord = writeJsonEvidence("staging-mutation-status.json", {
    schemaVersion: "dealflow.staging-mutation-status.v1",
    status: terminalStatus,
    failureCode,
    remoteMutationStarted,
    remoteMutationCompleted,
    singleOuterTransaction: true,
    migrationHistoryReceiptsInsideOuterTransaction: true,
    lastAttemptedVersion: transactionExecution.lastAttemptedVersion,
    lastAppliedVersion: transactionExecution.lastAppliedVersion,
    lastCommittedVersion: remoteMutationCompleted === true
      ? transactionExecution.lastAppliedVersion
      : null,
    attemptedCount: transactionExecution.attempted.length,
    appliedInTransactionCount: transactionExecution.appliedInTransaction.length,
    processExitStatus: transactionExecution.processExitStatus,
    processSignal: transactionExecution.processSignal,
    processError: transactionExecution.processError,
    processErrorCode: transactionExecution.processErrorCode,
    transactionCommitMarkerSeen: transactionExecution.transactionCommitMarkerSeen,
    databaseSqlstate: transactionExecution.databaseSqlstate,
    sanitizedDatabaseDiagnostic: transactionExecution.sanitizedDatabaseDiagnostic,
    sanitizedDatabaseDiagnosticSha256:
      transactionExecution.sanitizedDatabaseDiagnosticSha256,
    preflightStructuralCatalogSha256: preForwardState?.structuralCatalogSha256 ?? null,
    preflightNormalizedSchemaSha256: preForwardSchemaSha256,
    postStructuralCatalogSha256: postForwardState?.structuralCatalogSha256 ?? null,
    postNormalizedSchemaSha256: postForwardSchemaSha256,
    ...common,
  });

  if (terminalError) {
    const failureRecord = writeJsonEvidence("staging-migration-failure.json", {
      schemaVersion: "dealflow.isolated-staging-migration-failure.v1",
      status: terminalStatus,
      failureCode,
      remoteMutationStarted,
      remoteMutationCompleted,
      databaseSqlstate: transactionExecution.databaseSqlstate,
      sanitizedDatabaseDiagnostic: transactionExecution.sanitizedDatabaseDiagnostic,
      sanitizedDatabaseDiagnosticSha256:
        transactionExecution.sanitizedDatabaseDiagnosticSha256,
      ...common,
    });
    const failureSummaryRecord = writeJsonEvidence("staging-migration-summary.json", {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: terminalStatus,
      failureCode,
      remoteMutationStarted,
      remoteMutationCompleted,
      singleOuterTransaction: true,
      migrationHistoryReceiptsInsideOuterTransaction: true,
      lastAttemptedVersion: transactionExecution.lastAttemptedVersion,
      lastAppliedVersion: transactionExecution.lastAppliedVersion,
      lastCommittedVersion: remoteMutationCompleted === true
        ? transactionExecution.lastAppliedVersion
        : null,
      ...common,
    });
    const failureManifestRecord = writeJsonEvidence("evidence-manifest.json", {
      schemaVersion: "dealflow.staging-evidence-manifest.v1",
      status: terminalStatus,
      migrationMode: "APPLY_SUCCESSOR_EXACT",
      transition: "EXACT_122_TO_123",
      remoteMutationStarted,
      remoteMutationCompleted,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      priorApplication,
      artifacts: [
        preflightRecord,
        preflightSummaryRecord,
        preflightManifestRecord,
        readStartedRecord,
        mutationStartedRecord,
        mutationStatusRecord,
        failureRecord,
        failureSummaryRecord,
      ],
    });
    throw new Error(
      `Exact forward migration 123 ${terminalStatus}; evidence manifest ${failureManifestRecord.sha256}`,
    );
  }

  const applied = migrationSources.map(({ file, version, body }) => ({
    version,
    file,
    sha256: sha256(body),
  }));
  const result = {
    schemaVersion: "dealflow.isolated-staging-migration-proof.v1",
    status: "PASS",
    remoteMutationStarted: true,
    remoteMutationCompleted: true,
    portfolioApplicationRemoteMutationCompleted: true,
    serverVersion,
    migrationHistoryCount: postForwardState.migrationHistoryCount,
    publicTableCount: postForwardState.publicTableCount,
    forcedRlsCount,
    activationRuntimeControlsDefaultClosed: true,
    ghlRuntimeControlsDefaultClosed: true,
    ...retentionAuthorityAcl,
    ghlEmbedAuthExchangeCountAtVerification:
      postForwardState.ghlEmbedAuthExchangeCount,
    normalizedSchemaSha256: postForwardSchemaSha256,
    normalizedSchemaBytes: postForwardSchemaBytes,
    repeatedStructuralCatalogSha256: postForwardCatalogRepeatSha256,
    singleOuterTransaction: true,
    migrationHistoryReceiptsInsideOuterTransaction: true,
    lastAttemptedVersion: requiredFinalMigration.slice(0, 14),
    lastAppliedVersion: requiredFinalMigration.slice(0, 14),
    lastCommittedVersion: requiredFinalMigration.slice(0, 14),
    remoteStateVerification: {
      status: "EXACT_FORWARD_122_TO_123_COMMITTED_PORTFOLIO",
      readOnly: true,
      exactPrior122StateBeforeMutation: true,
      exactCommittedPortfolioState: true,
      repeatedCatalogAndSchemaStable: true,
      state: postForwardState,
    },
    applied,
    ...common,
  };
  const proofRecord = writeJsonEvidence("staging-migration-proof.json", result);
  const summaryRecord = writeJsonEvidence("staging-migration-summary.json", {
    schemaVersion: "dealflow.staging-migration-summary.v1",
    status: "PASS",
    failureCode: null,
    remoteMutationStarted: true,
    remoteMutationCompleted: true,
    portfolioApplicationRemoteMutationCompleted: true,
    singleOuterTransaction: true,
    migrationHistoryReceiptsInsideOuterTransaction: true,
    serverVersion,
    migrationHistoryCount: postForwardState.migrationHistoryCount,
    normalizedSchemaSha256: postForwardSchemaSha256,
    ghlEmbedAuthExchangeCountAtVerification:
      postForwardState.ghlEmbedAuthExchangeCount,
    ...retentionAuthorityAcl,
    lastAttemptedVersion: requiredFinalMigration.slice(0, 14),
    lastAppliedVersion: requiredFinalMigration.slice(0, 14),
    lastCommittedVersion: requiredFinalMigration.slice(0, 14),
    remoteStateVerificationStatus: "EXACT_FORWARD_122_TO_123_COMMITTED_PORTFOLIO",
    ...common,
  });
  const manifestRecord = writeJsonEvidence("evidence-manifest.json", {
    schemaVersion: "dealflow.staging-evidence-manifest.v1",
    status: "PASS",
    migrationMode: "APPLY_SUCCESSOR_EXACT",
    transition: "EXACT_122_TO_123",
    remoteMutationStarted: true,
    remoteMutationCompleted: true,
    broker: brokerEvidenceIdentity,
    brokerSourceSha256: brokerSourceIdentity.sha256,
    priorApplication,
    artifacts: [
      preflightRecord,
      preflightSummaryRecord,
      preflightManifestRecord,
      readStartedRecord,
      mutationStartedRecord,
      mutationStatusRecord,
      proofRecord,
      summaryRecord,
    ],
  });
  process.stdout.write(
    `Exact forward migration 123 PASS: prior 122 proven, one migration committed, PostgreSQL ${serverVersion}, schema ${postForwardSchemaSha256}, manifest ${manifestRecord.sha256}\n`,
  );
  process.exit(0);
}

const preMutationEvidence = {
  schemaVersion: "dealflow.staging-broker-preflight.v1",
  status: "PREPARED",
  remoteReadStarted: false,
  remoteMutationStarted: false,
  broker: brokerEvidenceIdentity,
  brokerSourceSha256: brokerSourceIdentity.sha256,
  runtime: process.version,
  expectedPostgresVersion: "17.6",
  projectFingerprint: sha256(projectRef),
  safeSuffix: projectRef.slice(-4),
  releaseBranch: releaseIdentity.branch,
  headCommit: releaseIdentity.headCommit,
  headTree: releaseIdentity.headTree,
  trackedWorktreeSha256: releaseIdentity.trackedWorktreeSha256,
  trackedFileCount: releaseIdentity.trackedFileCount,
  dependencyLockSha256,
  postgresBinarySha256,
  tlsServerAuthentication,
  migrationCount: migrationIdentity.migrationCount,
  migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
  verificationRoundSummarySha256,
};
const preMutationEvidenceRecord = writeJsonEvidence(
  "staging-broker-preflight.json",
  preMutationEvidence,
);
const preMutationSummaryRecord = writeJsonEvidence(
  "staging-migration-summary.pre-mutation.json",
  {
    schemaVersion: "dealflow.staging-migration-summary.v1",
    status: "PREPARED",
    remoteMutationStarted: false,
    broker: brokerEvidenceIdentity,
    brokerSourceSha256: brokerSourceIdentity.sha256,
    projectFingerprint: preMutationEvidence.projectFingerprint,
    safeSuffix: preMutationEvidence.safeSuffix,
    releaseBranch: preMutationEvidence.releaseBranch,
    headCommit: preMutationEvidence.headCommit,
    headTree: preMutationEvidence.headTree,
    migrationCount: preMutationEvidence.migrationCount,
    migrationPortfolioSha256: preMutationEvidence.migrationPortfolioSha256,
    verificationRoundSummarySha256,
  },
);
const preMutationManifestRecord = writeJsonEvidence(
  "evidence-manifest.pre-mutation.json",
  {
    schemaVersion: "dealflow.staging-evidence-manifest.v1",
    status: "PREPARED",
    remoteMutationStarted: false,
    broker: brokerEvidenceIdentity,
    brokerSourceSha256: brokerSourceIdentity.sha256,
    artifacts: [preMutationEvidenceRecord, preMutationSummaryRecord],
  },
);
assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);

let serverVersion;
let preflightState;
let remoteReadStage = "server_version";
const remoteReadStartedRecord = writeJsonEvidence(
  "staging-remote-read-started.json",
  {
    schemaVersion: "dealflow.staging-remote-read-status.v1",
    status: "REMOTE_READ_STARTED",
    remoteReadStarted: true,
    remoteMutationStarted: false,
    broker: brokerEvidenceIdentity,
    brokerSourceSha256: brokerSourceIdentity.sha256,
    projectFingerprint: preMutationEvidence.projectFingerprint,
    safeSuffix: preMutationEvidence.safeSuffix,
    migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
  },
);
try {
  serverVersion = sql("show server_version;", "Remote PostgreSQL version check");
  if (!serverVersion.startsWith("17.6")) {
    throw new Error("The remote PostgreSQL version does not match the exact 17.6 gate");
  }
  remoteReadStage = "empty_platform_baseline";
  preflightState = captureRemoteStructuralState("Remote preflight");
  if (!isExactEmptyPlatformState(preflightState)) {
    throw new Error("Fresh isolated staging does not match the attested empty platform baseline");
  }
} catch {
  const remoteReadFailureCode = remoteReadStage === "server_version"
    ? "remote_server_version_read_failed"
    : "remote_empty_baseline_read_failed";
  const remoteReadFailureRecord = writeJsonEvidence(
    "staging-remote-read-failure.json",
    {
      schemaVersion: "dealflow.staging-remote-read-failure.v1",
      status: "FAILED_PRE_MUTATION_READ",
      failureCode: remoteReadFailureCode,
      remoteReadStarted: true,
      remoteMutationStarted: false,
      remoteMutationCompleted: false,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      projectFingerprint: preMutationEvidence.projectFingerprint,
      safeSuffix: preMutationEvidence.safeSuffix,
      migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
    },
  );
  const remoteReadFailureSummaryRecord = writeJsonEvidence(
    "staging-migration-summary.json",
    {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: "FAILED_PRE_MUTATION_READ",
      failureCode: remoteReadFailureCode,
      remoteReadStarted: true,
      remoteMutationStarted: false,
      remoteMutationCompleted: false,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      projectFingerprint: preMutationEvidence.projectFingerprint,
      safeSuffix: preMutationEvidence.safeSuffix,
      migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
    },
  );
  const remoteReadFailureManifestRecord = writeJsonEvidence(
    "evidence-manifest.json",
    {
      schemaVersion: "dealflow.staging-evidence-manifest.v1",
      status: "FAILED_PRE_MUTATION_READ",
      remoteMutationCompleted: false,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      artifacts: [
        preMutationEvidenceRecord,
        preMutationSummaryRecord,
        preMutationManifestRecord,
        remoteReadStartedRecord,
        remoteReadFailureRecord,
        remoteReadFailureSummaryRecord,
      ],
    },
  );
  throw new Error(
    `Isolated staging migration FAILED_PRE_MUTATION_READ; evidence manifest ${remoteReadFailureManifestRecord.sha256}`,
  );
}
const publicTableCountBefore = preflightState.publicTableCount;
const authTableCountBefore = preflightState.authTableCount;
const storageTableCountBefore = preflightState.storageTableCount;
const vaultTableCountBefore = preflightState.vaultTableCount;
const authUserCountBefore = preflightState.authUserCount;
const storageObjectCountBefore = preflightState.storageObjectCount;

const applied = migrationSources.map(({ file, version, body }) => ({
  version,
  file,
  sha256: sha256(body),
}));
let transactionExecution = Object.freeze({
  succeeded: false,
  transactionCommitMarkerSeen: false,
  attempted: [],
  appliedInTransaction: [],
  lastAttemptedVersion: null,
  lastAppliedVersion: null,
  processExitStatus: null,
  processSignal: null,
  processError: false,
  processErrorCode: null,
  databaseSqlstate: null,
  sanitizedDatabaseDiagnostic: null,
  sanitizedDatabaseDiagnosticSha256: null,
});
let transactionCommitted = false;
let terminalStatus = "FAILED";
let terminalFailureCode = null;
let terminalError = null;
let remoteStateVerification = {
  status: "NOT_RUN",
  readOnly: true,
  exactEmptyPreflightState: false,
  exactCommittedPortfolioState: false,
  state: null,
};
let successfulVerification = null;
let mutationStatusRecord;
let mutationStartedRecord;

assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);
mutationStartedRecord = writeJsonEvidence(
  "staging-mutation-started.json",
  {
    schemaVersion: "dealflow.staging-mutation-status.v1",
    status: "MUTATION_STARTED",
    remoteMutationStarted: true,
    remoteMutationCompleted: false,
    singleOuterTransaction: true,
    migrationHistoryReceiptsInsideOuterTransaction: true,
    expectedMigrationCount: migrations.length,
    preflightStructuralCatalogSha256: preflightState.structuralCatalogSha256,
    preflightStructuralCatalogRecordCount:
      preflightState.structuralCatalogRecordCount,
    lastAttemptedVersion: null,
    lastAppliedVersion: null,
    broker: brokerEvidenceIdentity,
    brokerSourceSha256: brokerSourceIdentity.sha256,
    projectFingerprint: preMutationEvidence.projectFingerprint,
    safeSuffix: preMutationEvidence.safeSuffix,
    migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
  },
);
try {
  // The MUTATION_STARTED receipt above is deliberately the last operation before
  // the first remote transactional write. Every migration and every history
  // receipt below shares this one PostgreSQL transaction.
  transactionExecution = executeAtomicMigrationTransaction();
  if (!transactionExecution.succeeded) {
    terminalFailureCode = "atomic_migration_transaction_failed";
    throw new Error("The atomic staging migration transaction failed");
  }
  if (!transactionExecution.transactionCommitMarkerSeen) {
    terminalFailureCode = "transaction_commit_marker_missing";
    throw new Error("The atomic staging migration commit marker is missing");
  }
  const expectedVersions = migrations.map((name) => name.slice(0, 14));
  if (
    JSON.stringify(transactionExecution.attempted) !== JSON.stringify(expectedVersions) ||
    JSON.stringify(transactionExecution.appliedInTransaction) !== JSON.stringify(expectedVersions)
  ) {
    terminalFailureCode = "transaction_progress_receipts_incomplete";
    throw new Error("The atomic staging migration progress receipts are incomplete");
  }
  transactionCommitted = true;

  const postCommitState = captureRemoteStructuralState("Remote post-commit verification");
  if (!isExactCommittedPortfolioState(postCommitState)) {
    terminalFailureCode = "committed_portfolio_state_mismatch";
    throw new Error("The committed staging migration portfolio does not match the exact seal");
  }
  remoteStateVerification = {
    status: "EXACT_COMMITTED_PORTFOLIO",
    readOnly: true,
    exactEmptyPreflightState: false,
    exactCommittedPortfolioState: true,
    state: postCommitState,
  };

  const forcedRlsCount = Number(sql(
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity and c.relforcerowsecurity;",
    "Count staging forced-RLS tables",
  ));
  const activationControls = sql(
    "select environment || ':' || activation_writes_enabled::text from public.meta_campaign_activation_runtime_controls order by environment;",
    "Verify closed Meta activation runtime controls",
  ).split("\n").filter(Boolean);
  const ghlControls = sql(
    "select environment || ':' || provisioning_writes_enabled::text || ':' || lead_writes_enabled::text || ':' || lifecycle_webhook_enabled::text from public.ghl_runtime_controls order by environment;",
    "Verify closed GHL runtime controls",
  ).split("\n").filter(Boolean);
  if (activationControls.some((row) => !row.endsWith(":false")) || activationControls.length < 2) {
    terminalFailureCode = "meta_runtime_controls_not_closed";
    throw new Error("Meta activation runtime controls are not default closed in staging");
  }
  if (ghlControls.length !== 3 || ghlControls.some((row) => !row.endsWith(":false:false:false"))) {
    terminalFailureCode = "ghl_runtime_controls_not_closed";
    throw new Error("GHL provider runtime controls are not default closed in staging");
  }
  terminalFailureCode = "retention_table_or_column_acl_not_hardened";
  const retentionAuthorityAcl = captureAndAssertRetentionAuthorityAcl(
    "Verify fresh post-commit retention authority table and column ACLs",
  );

  const dump = captureNormalizedSchemaDump();
  successfulVerification = {
    postCommitState,
    forcedRlsCount,
    retentionAuthorityAcl,
    dump,
  };
  assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);
  terminalFailureCode = null;
  terminalStatus = "PASS";
} catch (error) {
  terminalError = error;
  terminalFailureCode ??= "post_mutation_verification_failed";
  try {
    const observedState = captureRemoteStructuralState("Remote failure-state verification");
    const exactEmptyPreflightState = isExactEmptyPlatformState(
      observedState,
      preflightState.structuralCatalogSha256,
    );
    const exactCommittedPortfolioState = isExactCommittedPortfolioState(observedState);
    remoteStateVerification = {
      status: exactEmptyPreflightState
        ? "EXACT_EMPTY_PREFLIGHT_STATE"
        : exactCommittedPortfolioState
          ? "EXACT_COMMITTED_PORTFOLIO"
          : "UNEXPECTED_REMOTE_STATE",
      readOnly: true,
      exactEmptyPreflightState,
      exactCommittedPortfolioState,
      state: observedState,
    };
    if (exactEmptyPreflightState) {
      terminalStatus = "ROLLED_BACK";
      transactionCommitted = false;
    } else if (exactCommittedPortfolioState) {
      const commitWasAlreadyConfirmed = transactionCommitted;
      terminalStatus = commitWasAlreadyConfirmed
        ? "FAILED_AFTER_COMMIT"
        : "FAILED_COMMIT_STATE_DETECTED";
      transactionCommitted = true;
    } else {
      terminalStatus = "FAILED_UNEXPECTED_REMOTE_STATE";
    }
  } catch {
    remoteStateVerification = {
      status: "REMOTE_STATE_NOT_PROVEN",
      readOnly: true,
      exactEmptyPreflightState: false,
      exactCommittedPortfolioState: false,
      state: null,
    };
    terminalStatus = "FAILED_REMOTE_STATE_NOT_PROVEN";
  }
} finally {
  mutationStatusRecord = writeJsonEvidence(
    "staging-mutation-status.json",
    {
      schemaVersion: "dealflow.staging-mutation-status.v1",
      status: terminalStatus,
      failureCode: terminalFailureCode,
      remoteMutationStarted: true,
      remoteMutationCompleted: transactionCommitted
        ? true
        : terminalStatus === "ROLLED_BACK"
          ? false
          : null,
      singleOuterTransaction: true,
      migrationHistoryReceiptsInsideOuterTransaction: true,
      lastAttemptedVersion: transactionExecution.lastAttemptedVersion,
      lastAppliedVersion: transactionExecution.lastAppliedVersion,
      lastCommittedVersion: transactionCommitted
        ? transactionExecution.lastAppliedVersion
        : null,
      attemptedCount: transactionExecution.attempted.length,
      appliedInTransactionCount: transactionExecution.appliedInTransaction.length,
      processExitStatus: transactionExecution.processExitStatus,
      processSignal: transactionExecution.processSignal,
      processError: transactionExecution.processError,
      processErrorCode: transactionExecution.processErrorCode,
      databaseSqlstate: transactionExecution.databaseSqlstate,
      sanitizedDatabaseDiagnostic: transactionExecution.sanitizedDatabaseDiagnostic,
      sanitizedDatabaseDiagnosticSha256:
        transactionExecution.sanitizedDatabaseDiagnosticSha256,
      transactionCommitMarkerSeen: transactionExecution.transactionCommitMarkerSeen,
      remoteStateVerification,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      projectFingerprint: preMutationEvidence.projectFingerprint,
      safeSuffix: preMutationEvidence.safeSuffix,
      migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
      preflightStructuralCatalogSha256: preflightState.structuralCatalogSha256,
    },
  );
}

if (terminalError) {
  const failureRecord = writeJsonEvidence(
    "staging-migration-failure.json",
    {
      schemaVersion: "dealflow.isolated-staging-migration-failure.v1",
      status: terminalStatus,
      failureCode: terminalFailureCode,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      projectFingerprint: preMutationEvidence.projectFingerprint,
      safeSuffix: preMutationEvidence.safeSuffix,
      releaseBranch: releaseIdentity.branch,
      headCommit: releaseIdentity.headCommit,
      headTree: releaseIdentity.headTree,
      migrationCount: migrations.length,
      migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
      preflightStructuralCatalogSha256: preflightState.structuralCatalogSha256,
      lastAttemptedVersion: transactionExecution.lastAttemptedVersion,
      lastAppliedVersion: transactionExecution.lastAppliedVersion,
      lastCommittedVersion: transactionCommitted
        ? transactionExecution.lastAppliedVersion
        : null,
      databaseSqlstate: transactionExecution.databaseSqlstate,
      sanitizedDatabaseDiagnostic: transactionExecution.sanitizedDatabaseDiagnostic,
      sanitizedDatabaseDiagnosticSha256:
        transactionExecution.sanitizedDatabaseDiagnosticSha256,
      remoteStateVerification,
    },
  );
  const failureSummaryRecord = writeJsonEvidence(
    "staging-migration-summary.json",
    {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: terminalStatus,
      failureCode: terminalFailureCode,
      remoteMutationStarted: true,
      remoteMutationCompleted: transactionCommitted
        ? true
        : terminalStatus === "ROLLED_BACK"
          ? false
          : null,
      lastAttemptedVersion: transactionExecution.lastAttemptedVersion,
      lastAppliedVersion: transactionExecution.lastAppliedVersion,
      lastCommittedVersion: transactionCommitted
        ? transactionExecution.lastAppliedVersion
        : null,
      rollbackVerified: remoteStateVerification.exactEmptyPreflightState,
      remoteStateVerificationStatus: remoteStateVerification.status,
      databaseSqlstate: transactionExecution.databaseSqlstate,
      sanitizedDatabaseDiagnostic: transactionExecution.sanitizedDatabaseDiagnostic,
      sanitizedDatabaseDiagnosticSha256:
        transactionExecution.sanitizedDatabaseDiagnosticSha256,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      projectFingerprint: preMutationEvidence.projectFingerprint,
      safeSuffix: preMutationEvidence.safeSuffix,
      migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
      preflightStructuralCatalogSha256: preflightState.structuralCatalogSha256,
    },
  );
  const failureManifestRecord = writeJsonEvidence(
    "evidence-manifest.json",
    {
      schemaVersion: "dealflow.staging-evidence-manifest.v1",
      status: terminalStatus,
      remoteMutationCompleted: transactionCommitted
        ? true
        : terminalStatus === "ROLLED_BACK"
          ? false
          : null,
      broker: brokerEvidenceIdentity,
      brokerSourceSha256: brokerSourceIdentity.sha256,
      artifacts: [
        preMutationEvidenceRecord,
        preMutationSummaryRecord,
        preMutationManifestRecord,
        remoteReadStartedRecord,
        mutationStartedRecord,
        mutationStatusRecord,
        failureRecord,
        failureSummaryRecord,
      ],
    },
  );
  throw new Error(
    `Isolated staging migration ${terminalStatus}: ${terminalFailureCode}; evidence manifest ${failureManifestRecord.sha256}`,
  );
}

const { postCommitState, forcedRlsCount, retentionAuthorityAcl, dump } = successfulVerification;
const historyCount = postCommitState.migrationHistoryCount;
const publicTableCount = postCommitState.publicTableCount;
const authUserCountAfter = postCommitState.authUserCount;
const storageObjectCountAfter = postCommitState.storageObjectCount;

const result = {
  schemaVersion: "dealflow.isolated-staging-migration-proof.v1",
  status: "PASS",
  broker: brokerEvidenceIdentity,
  brokerSourceSha256: brokerSourceIdentity.sha256,
  projectFingerprint: sha256(projectRef),
  safeSuffix: projectRef.slice(-4),
  releaseBranch: releaseIdentity.branch,
  headCommit: releaseIdentity.headCommit,
  headTree: releaseIdentity.headTree,
  trackedWorktreeSha256: releaseIdentity.trackedWorktreeSha256,
  trackedFileCount: releaseIdentity.trackedFileCount,
  dependencyLockSha256,
  postgresBinarySha256,
  tlsServerAuthentication,
  migrationPortfolioSha256: migrationIdentity.migrationPortfolioSha256,
  preflightStructuralCatalogSha256: preflightState.structuralCatalogSha256,
  verificationRoundSummarySha256,
  serverVersion,
  migrationCount: migrations.length,
  migrationHistoryCount: historyCount,
  publicTableCountBefore,
  authTableCountBefore,
  storageTableCountBefore,
  vaultTableCountBefore,
  authUserCountBefore,
  storageObjectCountBefore,
  publicTableCount,
  forcedRlsCount,
  activationRuntimeControlsDefaultClosed: true,
  ghlRuntimeControlsDefaultClosed: true,
  ...retentionAuthorityAcl,
  authUserCountAfter,
  storageObjectCountAfter,
  ghlEmbedAuthExchangeCountAtVerification:
    postCommitState.ghlEmbedAuthExchangeCount,
  normalizedSchemaSha256: sha256(dump),
  normalizedSchemaBytes: Buffer.byteLength(dump),
  singleOuterTransaction: true,
  migrationHistoryReceiptsInsideOuterTransaction: true,
  lastAttemptedVersion: transactionExecution.lastAttemptedVersion,
  lastAppliedVersion: transactionExecution.lastAppliedVersion,
  lastCommittedVersion: transactionExecution.lastAppliedVersion,
  remoteStateVerification,
  applied,
};
const proofRecord = writeJsonEvidence("staging-migration-proof.json", result);
const summaryRecord = writeJsonEvidence(
  "staging-migration-summary.json",
  {
    schemaVersion: "dealflow.staging-migration-summary.v1",
    status: "PASS",
    failureCode: null,
    remoteMutationStarted: true,
    remoteMutationCompleted: true,
    singleOuterTransaction: true,
    migrationHistoryReceiptsInsideOuterTransaction: true,
    lastAttemptedVersion: transactionExecution.lastAttemptedVersion,
    lastAppliedVersion: transactionExecution.lastAppliedVersion,
    lastCommittedVersion: transactionExecution.lastAppliedVersion,
    remoteStateVerificationStatus: remoteStateVerification.status,
    broker: brokerEvidenceIdentity,
    brokerSourceSha256: brokerSourceIdentity.sha256,
    projectFingerprint: result.projectFingerprint,
    safeSuffix: result.safeSuffix,
    releaseBranch: result.releaseBranch,
    headCommit: result.headCommit,
    headTree: result.headTree,
    runtime: process.version,
    serverVersion: result.serverVersion,
    migrationCount: result.migrationCount,
    migrationHistoryCount: result.migrationHistoryCount,
    migrationPortfolioSha256: result.migrationPortfolioSha256,
    normalizedSchemaSha256: result.normalizedSchemaSha256,
    ghlEmbedAuthExchangeCountAtVerification:
      postCommitState.ghlEmbedAuthExchangeCount,
    ...retentionAuthorityAcl,
    tlsServerAuthentication: result.tlsServerAuthentication,
    verificationRoundSummarySha256,
  },
);
const manifestRecord = writeJsonEvidence(
  "evidence-manifest.json",
  {
    schemaVersion: "dealflow.staging-evidence-manifest.v1",
    status: "PASS",
    remoteMutationCompleted: true,
    broker: brokerEvidenceIdentity,
    brokerSourceSha256: brokerSourceIdentity.sha256,
    artifacts: [
      preMutationEvidenceRecord,
      preMutationSummaryRecord,
      preMutationManifestRecord,
      remoteReadStartedRecord,
      mutationStartedRecord,
      mutationStatusRecord,
      proofRecord,
      summaryRecord,
    ],
  },
);
process.stdout.write(
  `Isolated staging migration PASS: ${migrations.length} migrations, PostgreSQL ${serverVersion}, schema ${result.normalizedSchemaSha256}, broker ${brokerSourceIdentity.sha256}, manifest ${manifestRecord.sha256}\n`,
);
