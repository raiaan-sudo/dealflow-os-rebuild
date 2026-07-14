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
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyPriorMigrationEvidence,
  isExactCommittedForwardRecoverySeal,
  PRIOR_MIGRATION_APPLICATION_ARTIFACTS,
  PRIOR_MIGRATION_COMMITTED_FORWARD_RECOVERY_ARTIFACTS,
  PRIOR_MIGRATION_READ_ONLY_EXACT_ARTIFACTS,
} from "./prior-migration-proof-contract.mjs";

const [repoArg, evidenceArg, roundOneArg, roundTwoArg, ...modeArgs] = process.argv.slice(2);
if (!repoArg || !evidenceArg || !roundOneArg || !roundTwoArg) {
  throw new Error(
    "Usage: apply-fresh-staging-migrations.mjs <repo> <external-evidence-dir> <round-1-summary.json> <round-2-summary.json> [--verify-existing-exact <prior-migration-proof-dir> | --apply-forward-exact <prior-102-migration-proof-dir>]",
  );
}
let priorMigrationProofDir = null;
let migrationMode = "FRESH_ATOMIC_APPLICATION";
if (modeArgs.length > 0) {
  if (
    modeArgs.length !== 2 ||
    !["--verify-existing-exact", "--apply-forward-exact"].includes(modeArgs[0]) ||
    !modeArgs[1] ||
    modeArgs[1].startsWith("--")
  ) {
    throw new Error(
      "The only supported non-fresh modes are --verify-existing-exact or --apply-forward-exact with one prior proof directory",
    );
  }
  priorMigrationProofDir = resolve(modeArgs[1]);
  migrationMode = modeArgs[0] === "--verify-existing-exact"
    ? "VERIFY_EXISTING_EXACT"
    : "APPLY_FORWARD_EXACT";
}

const repo = resolve(repoArg);
const evidenceDir = resolve(evidenceArg);
const roundSummaryPaths = [resolve(roundOneArg), resolve(roundTwoArg)];
const expectedRepo = "/private/tmp/dealflow-overnight-release-20260712";
const expectedPostgresBin =
  "/private/tmp/dealflow-pg17.6-20260712-overnight/mnt/Postgres.app/Contents/Versions/17/bin";
const expectedTrustBundleRelativePath =
  "config/security/supabase-prod-ca-2021.crt";
const expectedTrustBundlePath = resolve(repo, expectedTrustBundleRelativePath);
const expectedTrustBundleSha256 =
  "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7";
const projectRecordPath = "/private/tmp/dealflow-new-staging-project.json";
const keychainService = "io.supabase.dealflow-staging.db";
const keychainAccount = "dealflow-staging-20260712";
const expectedProjectFingerprint =
  "c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c";
const expectedProjectSafeSuffix = "qibh";
const expectedPriorApplicationCommit = "e776f38b5302dda525d51cf03e4668568e272a77";
const expectedPriorApplicationTree = "0fcf11214ed3ae097003f737077cd7c67cdedfb7";
const expectedPriorManifestSha256 =
  "877652c58c862dc9252c201e306890253f7189757c0d3cc3dbbd57d8afc26df4";
const expectedPriorProofSha256 =
  "49670dbf4d4be8ab59d7a3778cbbe5e751c486bd2d59faed02f4ae0d44b23590";
const expectedPriorSummarySha256 =
  "d7e8bc08ef1d0cd12a03ec97b99eb979a9c9a738b709c35c59a215c7255b85c9";
const expectedPriorMigrationPortfolioSha256 =
  "30f6d3f03198dc2742179cbf7546400ade2f6a660dc52b96b27aeaec46f46ab3";
const expectedPriorMigrationCount = 102;
const expectedPriorFinalMigration =
  "20260713027000_add_ghl_location_display_name_finalization.sql";
const exactMigrationCount = 103;
const transactionOwningMigration =
  "20260710160000_validate_and_normalize_pre_candidate_shape.sql";
const requiredFinalMigration =
  "20260713028000_harden_account_deletion_retention_authority.sql";
const expectedVerificationLocalGate = "NO_GO_AUTHENTICATED_PROOF_DEFERRED";
const expectedHostedVerificationDeferrals = Object.freeze([
  "npm run operator:debt",
  "npm run rls:cross-tenant",
  "npm run rls:fixture-smoke",
]);
const brokerRelativePath = "scripts/staging/apply-fresh-staging-migrations.mjs";
const migrationDir = join(repo, "supabase", "migrations");
const migrations = readdirSync(migrationDir)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

if (process.versions.node.split(".")[0] !== "20") {
  throw new Error(`The staging migration broker requires Node 20; received ${process.version}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
  return String(value ?? "")
    .replace(new RegExp(escaped, "gi"), "[REDACTED_PROJECT_REF]")
    .replace(/db\.[a-z0-9-]+\.supabase\.co/gi, "[REDACTED_DATABASE_HOST]")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(password\s*[=:]\s*)\S+/gi, "$1[REDACTED]");
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
  if (branch !== "codex/dealflow-overnight-release-20260712") {
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
  if (
    summary.schemaVersion !== "dealflow.final-verification.v3" ||
    String(summary.round) !== expectedRound ||
    !/^v20\./.test(summary.runtime ?? "") ||
    summary.repositoryInvariant !== "passed" ||
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
      (record) => record.status !== "passed" || record.postCommandRepositoryInvariant !== "passed",
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
const forwardMigrationSources = migrationSources.slice(expectedPriorMigrationCount);
if (
  forwardMigrationSources.length !== 1 ||
  forwardMigrationSources[0]?.file !== requiredFinalMigration
) {
  throw new Error("The exact forward-only migration tranche must contain only migration 103");
}
const forwardAtomicMigrationTransaction = buildAtomicMigrationTransaction(
  forwardMigrationSources,
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
  verificationRounds[0].migrationPortfolioSha256 !==
    verificationRounds[1].migrationPortfolioSha256 ||
  JSON.stringify(verificationRounds[0].migrationFiles) !==
    JSON.stringify(migrationIdentity.records) ||
  JSON.stringify(verificationRounds[1].migrationFiles) !==
    JSON.stringify(migrationIdentity.records)
) {
  throw new Error("The two exact-seal verification rounds do not bind the same migration portfolio");
}
prepareEvidenceDirectory();

const projectRecordStat = lstatSync(projectRecordPath);
if (
  projectRecordStat.isSymbolicLink() ||
  !projectRecordStat.isFile() ||
  (projectRecordStat.mode & 0o077) !== 0
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
  PGPASSFILE: "/private/tmp/dealflow-staging-intentionally-absent-pgpass",
  ...(migrationMode === "VERIFY_EXISTING_EXACT"
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

function captureRemoteStructuralState(labelPrefix) {
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
  return Object.freeze({
    ...captureRemoteCatalogIdentity(`${labelPrefix} structural-catalog identity`),
    historyTableExists,
    migrationHistoryCount,
    migrationHistoryVersions,
    publicTableCount: Number(sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p');",
      `${labelPrefix} public-table count`,
    )),
    authTableCount: Number(sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relkind in ('r','p');",
      `${labelPrefix} auth-platform-table count`,
    )),
    storageTableCount: Number(sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relkind in ('r','p');",
      `${labelPrefix} storage-platform-table count`,
    )),
    vaultTableCount: Number(sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='vault' and c.relkind in ('r','p');",
      `${labelPrefix} vault-platform-table count`,
    )),
    authUserCount: Number(sql(
      "select count(*) from auth.users;",
      `${labelPrefix} auth-user count`,
    )),
    storageObjectCount: Number(sql(
      "select count(*) from storage.objects;",
      `${labelPrefix} storage-object count`,
    )),
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

function loadAndValidatePriorMigrationProof({ requirePinnedPrior102 }) {
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
  if (requirePinnedPrior102 && (
    sha256(manifestArtifact.contents) !== expectedPriorManifestSha256 ||
    sha256(proofArtifact?.contents ?? Buffer.alloc(0)) !== expectedPriorProofSha256 ||
    sha256(summaryArtifact.contents) !== expectedPriorSummarySha256
  )) {
    throw new Error("Prior migration proof does not match the exact pinned application seal");
  }
  const expectedRecords = requirePinnedPrior102
    ? migrationIdentity.records.slice(0, expectedPriorMigrationCount)
    : migrationIdentity.records;
  const expectedApplied = expectedRecords.map((record) => ({
    version: record.name.slice(0, 14),
    file: record.name,
    sha256: record.sha256,
  }));
  const expectedCount = expectedRecords.length;
  const expectedPortfolioSha256 = requirePinnedPrior102
    ? expectedPriorMigrationPortfolioSha256
    : migrationIdentity.migrationPortfolioSha256;
  const expectedFinalVersion = (requirePinnedPrior102
    ? expectedPriorFinalMigration
    : requiredFinalMigration).slice(0, 14);
  const evidenceTruth = classifyPriorMigrationEvidence({
    actualNames,
    manifest,
    proof,
    summary,
    failure,
    mutationStatus,
    expectedMigrationCount: expectedCount,
    expectedFinalVersion,
    requireApplicationEvidence: requirePinnedPrior102,
  });
  if (evidenceTruth.evidenceKind === "committed_forward_recovery") {
    const manifestSha256 = sha256(manifestArtifact.contents);
    const mutationStatusSha256 = sha256(mutationStatusArtifact.contents);
    const failureSha256 = sha256(failureArtifact.contents);
    const summarySha256 = sha256(summaryArtifact.contents);
    const expectedPriorApplied = expectedApplied.slice(0, expectedPriorMigrationCount);
    const exactForwardMigration = expectedApplied.at(-1);
    if (
      !isExactCommittedForwardRecoverySeal({
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
      }) ||
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
      mutationStatus.releaseBranch !== releaseIdentity.branch ||
      summary.releaseBranch !== releaseIdentity.branch ||
      failure.releaseBranch !== releaseIdentity.branch ||
      mutationStatus.migrationPortfolioSha256 !== expectedPortfolioSha256 ||
      summary.migrationPortfolioSha256 !== expectedPortfolioSha256 ||
      failure.migrationPortfolioSha256 !== expectedPortfolioSha256 ||
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
        mutationStatus.priorApplication?.normalizedSchemaSha256 ||
      mutationStatus.broker?.path !== brokerRelativePath ||
      mutationStatus.brokerSourceSha256 !== mutationStatus.broker?.sha256 ||
      manifest.broker?.path !== brokerRelativePath ||
      manifest.brokerSourceSha256 !== mutationStatus.brokerSourceSha256
    ) {
      throw new Error(
        "Prior committed-forward recovery evidence does not match the one exact pinned seal",
      );
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
      normalizedSchemaSha256: mutationStatus.postNormalizedSchemaSha256,
      structuralCatalogSha256: mutationStatus.postStructuralCatalogSha256,
      singleOuterTransaction: true,
      migrationHistoryReceiptsInsideOuterTransaction: true,
      evidenceKind: evidenceTruth.evidenceKind,
      evidenceRemoteMutationStarted: true,
      evidenceRemoteMutationCompleted: true,
      portfolioApplicationRemoteMutationCompleted: true,
      sourceRemoteStateVerificationStatus:
        "SEALED_FORWARD_103_COMMIT_REQUIRES_READ_ONLY_REPROOF",
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
    proof.releaseBranch !== releaseIdentity.branch ||
    summary.releaseBranch !== releaseIdentity.branch ||
    proof.migrationCount !== expectedCount ||
    summary.migrationCount !== expectedCount ||
    proof.migrationHistoryCount !== expectedCount ||
    summary.migrationHistoryCount !== expectedCount ||
    proof.migrationPortfolioSha256 !== expectedPortfolioSha256 ||
    summary.migrationPortfolioSha256 !== expectedPortfolioSha256 ||
    proof.lastCommittedVersion !== expectedFinalVersion ||
    summary.lastCommittedVersion !== expectedFinalVersion ||
    proof.headCommit !== summary.headCommit ||
    proof.headTree !== summary.headTree ||
    (requirePinnedPrior102 && proof.headCommit !== expectedPriorApplicationCommit) ||
    (requirePinnedPrior102 && proof.headTree !== expectedPriorApplicationTree) ||
    proof.normalizedSchemaSha256 !== summary.normalizedSchemaSha256 ||
    !/^[a-f0-9]{40}$/.test(proof.headCommit ?? "") ||
    !/^[a-f0-9]{40}$/.test(proof.headTree ?? "") ||
    !/^[a-f0-9]{64}$/.test(proof.normalizedSchemaSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(
      proof.remoteStateVerification?.state?.structuralCatalogSha256 ?? "",
    ) ||
    JSON.stringify(proof.applied) !== JSON.stringify(expectedApplied)
  ) {
    throw new Error(
      requirePinnedPrior102
        ? "Prior migration proof is not bound to the exact successful 102-migration application"
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
    sourceRemoteStateVerificationStatus: proof.remoteStateVerification.status,
    remoteMutationCompleted: true,
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

if (migrationMode === "VERIFY_EXISTING_EXACT") {
  const priorApplication = loadAndValidatePriorMigrationProof({
    requirePinnedPrior102: false,
  });
  const common = {
    migrationMode: "VERIFY_EXISTING_EXACT",
    verificationReadOnly: true,
    remoteMutationStarted: false,
    remoteMutationCompleted: false,
    portfolioApplicationRemoteMutationCompleted: true,
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
    status: "PREPARED_READ_ONLY_EXISTING_EXACT_VERIFICATION",
    remoteReadStarted: false,
    ...common,
  });
  const preflightSummaryRecord = writeJsonEvidence(
    "staging-migration-summary.pre-mutation.json",
    {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: "PREPARED_READ_ONLY_EXISTING_EXACT_VERIFICATION",
      remoteReadStarted: false,
      ...common,
    },
  );
  const preflightManifestRecord = writeJsonEvidence(
    "evidence-manifest.pre-mutation.json",
    {
      schemaVersion: "dealflow.staging-evidence-manifest.v1",
      status: "PREPARED_READ_ONLY_EXISTING_EXACT_VERIFICATION",
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
    status: "REMOTE_READ_STARTED_EXISTING_EXACT_VERIFICATION",
    remoteReadStarted: true,
    ...common,
  });
  try {
    const existingServerVersion = sql(
      "show server_version;",
      "Existing staging PostgreSQL version check",
    );
    if (!existingServerVersion.startsWith("17.6")) {
      throw new Error("The existing staging PostgreSQL version does not match exact 17.6");
    }
    const existingState = captureRemoteStructuralState("Existing staging exact verification");
    if (!hasExactMigrationHistory(existingState)) {
      throw new Error("Existing staging migration history does not match the exact portfolio");
    }
    if (existingState.authUserCount !== 0 || existingState.storageObjectCount !== 0) {
      throw new Error("Existing isolated staging is no longer empty of auth users or storage objects");
    }
    if (existingState.structuralCatalogSha256 !== priorApplication.structuralCatalogSha256) {
      throw new Error("Existing staging structural catalog drifted from the sealed application proof");
    }
    const existingCatalogRepeat = captureRemoteCatalogIdentity(
      "Repeat existing staging structural-catalog identity",
    );
    if (
      existingCatalogRepeat.structuralCatalogSha256 !==
      existingState.structuralCatalogSha256
    ) {
      throw new Error("Existing staging structural catalog was not stable across repeated capture");
    }
    const existingDump = captureNormalizedSchemaDump();
    const existingDumpRepeat = captureNormalizedSchemaDump();
    const existingSchemaSha256 = sha256(existingDump);
    if (
      existingSchemaSha256 !== sha256(existingDumpRepeat) ||
      existingSchemaSha256 !== priorApplication.normalizedSchemaSha256
    ) {
      throw new Error("Existing staging normalized schema drifted from the sealed application proof");
    }
    const forcedRlsCount = Number(sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity and c.relforcerowsecurity;",
      "Count existing staging forced-RLS tables",
    ));
    const activationControls = sql(
      "select environment || ':' || activation_writes_enabled::text from public.meta_campaign_activation_runtime_controls order by environment;",
      "Verify existing closed Meta activation runtime controls",
    ).split("\n").filter(Boolean);
    const ghlControls = sql(
      "select environment || ':' || provisioning_writes_enabled::text || ':' || lead_writes_enabled::text || ':' || lifecycle_webhook_enabled::text from public.ghl_runtime_controls order by environment;",
      "Verify existing closed GHL runtime controls",
    ).split("\n").filter(Boolean);
    if (
      activationControls.some((row) => !row.endsWith(":false")) ||
      activationControls.length < 2
    ) {
      throw new Error("Meta activation runtime controls are not default closed in existing staging");
    }
    if (
      ghlControls.length !== 3 ||
      ghlControls.some((row) => !row.endsWith(":false:false:false"))
    ) {
      throw new Error("GHL provider runtime controls are not default closed in existing staging");
    }
    const retentionAuthorityAcl = captureAndAssertRetentionAuthorityAcl(
      "Verify existing retention authority table and column ACLs",
    );
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
      authUserCountAtVerification: existingState.authUserCount,
      storageObjectCountAtVerification: existingState.storageObjectCount,
      normalizedSchemaSha256: existingSchemaSha256,
      normalizedSchemaBytes: Buffer.byteLength(existingDump),
      singleOuterTransaction: priorApplication.singleOuterTransaction,
      migrationHistoryReceiptsInsideOuterTransaction:
        priorApplication.migrationHistoryReceiptsInsideOuterTransaction,
      lastAttemptedVersion: requiredFinalMigration.slice(0, 14),
      lastAppliedVersion: requiredFinalMigration.slice(0, 14),
      lastCommittedVersion: requiredFinalMigration.slice(0, 14),
      remoteStateVerification: {
        status: "EXACT_EXISTING_COMMITTED_PORTFOLIO",
        readOnly: true,
        exactMigrationHistory: true,
        exactStructuralCatalog: true,
        exactNormalizedSchema: true,
        state: existingState,
      },
      applied,
    };
    const proofRecord = writeJsonEvidence("staging-migration-proof.json", result);
    const summaryRecord = writeJsonEvidence("staging-migration-summary.json", {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: "PASS",
      failureCode: null,
      ...common,
      serverVersion: existingServerVersion,
      migrationHistoryCount: existingState.migrationHistoryCount,
      normalizedSchemaSha256: existingSchemaSha256,
      singleOuterTransaction: priorApplication.singleOuterTransaction,
      migrationHistoryReceiptsInsideOuterTransaction:
        priorApplication.migrationHistoryReceiptsInsideOuterTransaction,
      lastAttemptedVersion: requiredFinalMigration.slice(0, 14),
      lastAppliedVersion: requiredFinalMigration.slice(0, 14),
      lastCommittedVersion: requiredFinalMigration.slice(0, 14),
      remoteStateVerificationStatus: "EXACT_EXISTING_COMMITTED_PORTFOLIO",
      ...retentionAuthorityAcl,
    });
    const manifestRecord = writeJsonEvidence("evidence-manifest.json", {
      schemaVersion: "dealflow.staging-evidence-manifest.v1",
      status: "PASS",
      migrationMode: "VERIFY_EXISTING_EXACT",
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
      `Existing isolated staging migration portfolio PASS: ${migrations.length} migrations, PostgreSQL ${existingServerVersion}, schema ${existingSchemaSha256}, read-only verification, manifest ${manifestRecord.sha256}\n`,
    );
    process.exit(0);
  } catch {
    const failureRecord = writeJsonEvidence("staging-migration-failure.json", {
      schemaVersion: "dealflow.isolated-staging-migration-failure.v1",
      status: "FAILED_EXISTING_EXACT_VERIFICATION",
      failureCode: "existing_exact_portfolio_not_proven",
      ...common,
    });
    const failureSummaryRecord = writeJsonEvidence("staging-migration-summary.json", {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: "FAILED_EXISTING_EXACT_VERIFICATION",
      failureCode: "existing_exact_portfolio_not_proven",
      ...common,
    });
    const failureManifestRecord = writeJsonEvidence("evidence-manifest.json", {
      schemaVersion: "dealflow.staging-evidence-manifest.v1",
      status: "FAILED_EXISTING_EXACT_VERIFICATION",
      migrationMode: "VERIFY_EXISTING_EXACT",
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
  const priorApplication = loadAndValidatePriorMigrationProof({
    requirePinnedPrior102: true,
  });
  if (
    priorApplication.migrationCount !== expectedPriorMigrationCount ||
    priorApplication.migrationPortfolioSha256 !== expectedPriorMigrationPortfolioSha256 ||
    priorApplication.lastCommittedVersion !== expectedPriorFinalMigration.slice(0, 14) ||
    JSON.stringify(priorApplication.migrationFiles) !== JSON.stringify(
      migrationIdentity.records.slice(0, expectedPriorMigrationCount).map((record) => ({
        version: record.name.slice(0, 14),
        file: record.name,
        sha256: record.sha256,
      })),
    )
  ) {
    throw new Error("The first 102 migration filenames and SQL hashes are not the pinned prior portfolio");
  }
  const common = {
    migrationMode: "APPLY_FORWARD_EXACT",
    forwardOnly: true,
    priorMigrationCount: expectedPriorMigrationCount,
    forwardMigrationCount: 1,
    forwardMigration: {
      version: forwardMigrationSources[0].version,
      file: forwardMigrationSources[0].file,
      sha256: sha256(forwardMigrationSources[0].body),
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
    status: "PREPARED_EXACT_FORWARD_103",
    remoteReadStarted: false,
    remoteMutationStarted: false,
    remoteMutationCompleted: false,
    ...common,
  });
  const preflightSummaryRecord = writeJsonEvidence(
    "staging-migration-summary.pre-mutation.json",
    {
      schemaVersion: "dealflow.staging-migration-summary.v1",
      status: "PREPARED_EXACT_FORWARD_103",
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
      status: "PREPARED_EXACT_FORWARD_103",
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
    status: "REMOTE_READ_STARTED_EXACT_FORWARD_103",
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
  let failureCode = "prior_102_remote_state_not_proven";
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
    preForwardState = captureRemoteStructuralState("Forward staging prior-102 verification");
    const expectedPriorVersions = priorApplication.migrationFiles.map((item) => item.version);
    if (
      preForwardState.historyTableExists !== true ||
      preForwardState.migrationHistoryCount !== expectedPriorMigrationCount ||
      JSON.stringify(preForwardState.migrationHistoryVersions) !==
        JSON.stringify(expectedPriorVersions)
    ) {
      failureCode = "prior_102_history_not_proven";
      throw new Error("Remote staging history is not the exact pinned 102-migration state");
    }
    if (preForwardState.structuralCatalogSha256 !== priorApplication.structuralCatalogSha256) {
      failureCode = "prior_102_catalog_not_proven";
      throw new Error("Remote staging catalog drifted from the pinned 102-migration proof");
    }
    const preForwardDump = captureNormalizedSchemaDump();
    preForwardSchemaSha256 = sha256(preForwardDump);
    if (preForwardSchemaSha256 !== priorApplication.normalizedSchemaSha256) {
      failureCode = "prior_102_schema_not_proven";
      throw new Error("Remote staging schema drifted from the pinned 102-migration proof");
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
      failureCode = "provider_controls_not_closed_before_forward_103";
      throw new Error("Provider runtime controls are not fail-closed before migration 103");
    }

    assertBrokerSourceIdentityUnchanged(brokerSourceIdentity);
    mutationStartedRecord = writeJsonEvidence("staging-mutation-started.json", {
      schemaVersion: "dealflow.staging-mutation-status.v1",
      status: "FORWARD_103_MUTATION_STARTED",
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
    // body of migration 103 and its history receipt share one outer transaction.
    transactionExecution = executeForwardMigrationTransaction();
    if (
      !transactionExecution.succeeded ||
      !transactionExecution.transactionCommitMarkerSeen ||
      JSON.stringify(transactionExecution.attempted) !==
        JSON.stringify([requiredFinalMigration.slice(0, 14)]) ||
      JSON.stringify(transactionExecution.appliedInTransaction) !==
        JSON.stringify([requiredFinalMigration.slice(0, 14)])
    ) {
      failureCode = "forward_103_atomic_transaction_failed";
      throw new Error("The exact migration 103 transaction did not commit completely");
    }
    remoteMutationCompleted = true;

    postForwardState = captureRemoteStructuralState("Forward staging post-103 verification");
    if (!hasExactMigrationHistory(postForwardState)) {
      failureCode = "forward_103_history_mismatch";
      throw new Error("Remote staging does not contain the exact 103-migration history");
    }
    const postForwardCatalogRepeat = captureRemoteCatalogIdentity(
      "Forward staging repeated post-103 catalog identity",
    );
    postForwardCatalogRepeatSha256 = postForwardCatalogRepeat.structuralCatalogSha256;
    if (postForwardCatalogRepeatSha256 !== postForwardState.structuralCatalogSha256) {
      failureCode = "forward_103_catalog_nondeterministic";
      throw new Error("Post-migration structural catalog was not stable across repeated capture");
    }
    const postForwardDump = captureNormalizedSchemaDump();
    const postForwardDumpRepeat = captureNormalizedSchemaDump();
    postForwardSchemaSha256 = sha256(postForwardDump);
    postForwardSchemaBytes = Buffer.byteLength(postForwardDump);
    if (postForwardSchemaSha256 !== sha256(postForwardDumpRepeat)) {
      failureCode = "forward_103_schema_nondeterministic";
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
      failureCode = "provider_controls_not_closed_after_forward_103";
      throw new Error("Provider runtime controls are not fail-closed after migration 103");
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
          observedState.migrationHistoryCount === expectedPriorMigrationCount &&
          JSON.stringify(observedState.migrationHistoryVersions) ===
            JSON.stringify(expectedPriorVersions);
        const observedDumpSha256 = sha256(captureNormalizedSchemaDump());
        const exactPriorState =
          exactPriorHistory &&
          observedState.structuralCatalogSha256 === priorApplication.structuralCatalogSha256 &&
          observedDumpSha256 === priorApplication.normalizedSchemaSha256;
        if (exactPriorState) {
          remoteMutationCompleted = false;
          terminalStatus = "ROLLED_BACK_EXACT_PRIOR_102";
        } else if (hasExactMigrationHistory(observedState) && remoteMutationCompleted) {
          terminalStatus = "FAILED_AFTER_FORWARD_103_COMMIT";
        } else if (hasExactMigrationHistory(observedState)) {
          remoteMutationCompleted = null;
          terminalStatus = "FAILED_FORWARD_103_STATE_DETECTED_WITHOUT_COMMIT_PROOF";
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
      status: "FORWARD_103_MUTATION_NOT_STARTED",
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
      migrationMode: "APPLY_FORWARD_EXACT",
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
      `Exact forward migration 103 ${terminalStatus}; evidence manifest ${failureManifestRecord.sha256}`,
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
    normalizedSchemaSha256: postForwardSchemaSha256,
    normalizedSchemaBytes: postForwardSchemaBytes,
    repeatedStructuralCatalogSha256: postForwardCatalogRepeatSha256,
    singleOuterTransaction: true,
    migrationHistoryReceiptsInsideOuterTransaction: true,
    lastAttemptedVersion: requiredFinalMigration.slice(0, 14),
    lastAppliedVersion: requiredFinalMigration.slice(0, 14),
    lastCommittedVersion: requiredFinalMigration.slice(0, 14),
    remoteStateVerification: {
      status: "EXACT_FORWARD_COMMITTED_PORTFOLIO",
      readOnly: true,
      exactPrior102StateBeforeMutation: true,
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
    ...retentionAuthorityAcl,
    lastAttemptedVersion: requiredFinalMigration.slice(0, 14),
    lastAppliedVersion: requiredFinalMigration.slice(0, 14),
    lastCommittedVersion: requiredFinalMigration.slice(0, 14),
    remoteStateVerificationStatus: "EXACT_FORWARD_COMMITTED_PORTFOLIO",
    ...common,
  });
  const manifestRecord = writeJsonEvidence("evidence-manifest.json", {
    schemaVersion: "dealflow.staging-evidence-manifest.v1",
    status: "PASS",
    migrationMode: "APPLY_FORWARD_EXACT",
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
    `Exact forward migration 103 PASS: prior 102 proven, one migration committed, PostgreSQL ${serverVersion}, schema ${postForwardSchemaSha256}, manifest ${manifestRecord.sha256}\n`,
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
