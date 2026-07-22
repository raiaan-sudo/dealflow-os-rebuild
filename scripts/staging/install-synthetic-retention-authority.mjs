#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FINAL_VERIFICATION_HOSTED_DEFERRALS,
  assertExactFinalVerificationSummaryPortfolio,
  extractFinalVerificationNativePostgresRuntime,
} from "../lib/final-verification-command-contract.mjs";
import { assertFinalVerificationEvidenceIsSealable } from "../lib/final-verification-evidence-contract.mjs";

const [repoArg, evidenceArg, roundOneArg, roundTwoArg] = process.argv.slice(2);
if (!repoArg || !evidenceArg || !roundOneArg || !roundTwoArg || process.argv.length !== 6) {
  throw new Error(
    "Usage: install-synthetic-retention-authority.mjs <repo> <external-evidence-dir> <round-1-summary.json> <round-2-summary.json>",
  );
}

const repo = resolve(repoArg);
const evidenceDir = resolve(evidenceArg);
const roundPaths = [resolve(roundOneArg), resolve(roundTwoArg)];
const expectedRepo = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
);
const expectedBranch = "codex/dealflow-release-closure-plan";
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
const expectedVercelProjectIdFingerprint =
  "d0fa02eaf7e533f2a17a0b87c039c6a1686e5467840d2b8c2f2dca2758d95fde";
const expectedMigrationCount = 123;
const expectedFinalMigration =
  "20260722020000_persist_ghl_location_token_scope.sql";
const expectedLocalGate = "NO_GO_AUTHENTICATED_PROOF_DEFERRED";
const expectedDeferrals = FINAL_VERIFICATION_HOSTED_DEFERRALS;
const authorityMarker =
  "DEALFLOW_ISOLATED_STAGING_QIBH_SYNTHETIC_RETENTION_AUTHORITY_V1";
const authorityTimestamp = "2026-07-12T12:00:00.000Z";
const productionPendingPolicy = Object.freeze({
  graceDays: 7,
  operationalRetentionDays: 30,
  supportRetentionDays: 30,
  analyticsRetentionDays: 30,
  financialRetentionDays: 2555,
  receiptRetentionDays: 2555,
  billingCancellationMode: "period_end",
  policyVersion: 1,
});
const syntheticStagingPolicy = Object.freeze({
  graceDays: 0,
  operationalRetentionDays: 1,
  supportRetentionDays: 1,
  analyticsRetentionDays: 1,
  financialRetentionDays: 365,
  receiptRetentionDays: 365,
  billingCancellationMode: "period_end",
  policyVersion: 2,
});
const decisionInventorySha256 =
  "12d0d5780a28dd93696f17ed1e7177ed85460428c4c3b02e180cf68db9073b8d";
const requirementInventorySha256 =
  "8c6bf382bb5f7d0233ecb7edbf591167dad3c18f5f14206735d38f830f3c9bc4";
const privacyDecisionIds = Object.freeze([
  "OWNER-PRIVACY-001", "OWNER-PRIVACY-002", "OWNER-PRIVACY-003",
  "OWNER-PRIVACY-004", "OWNER-PRIVACY-005", "OWNER-PRIVACY-006",
  "OWNER-PRIVACY-007", "OWNER-PRIVACY-008", "OWNER-PRIVACY-009",
]);
const brokerRelativePath =
  "scripts/staging/install-synthetic-retention-authority.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") throw new Error("Unsupported canonical JSON value");
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTextArray(values) {
  return `array[${values.map(sqlLiteral).join(",")}]::text[]`;
}

function sanitize(value, projectRef = "") {
  let output = String(value ?? "");
  if (projectRef) output = output.split(projectRef).join("[REDACTED_PROJECT_REF]");
  return output
    .replace(/db\.[a-z0-9-]+\.supabase\.co/gi, "[REDACTED_DATABASE_HOST]")
    .replace(/(?:postgres|postgresql):\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/((?:password|secret|token|api[_ -]?key)\s*[=:]\s*)\S+/gi, "$1[REDACTED]")
    .replace(/\b[A-Za-z0-9+/_-]{48,}={0,2}\b/g, "[REDACTED_LONG_VALUE]")
    .slice(0, 4_000);
}

function git(args, label) {
  const result = spawnSync("/usr/bin/git", args, {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60_000,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "/private/tmp",
      LANG: "C",
      LC_ALL: "C",
    },
  });
  if (result.error || result.status !== 0) throw new Error(label);
  return result.stdout ?? "";
}

function trackedWorktreeIdentity() {
  const entries = git(["ls-files", "--stage", "-z"], "Unable to enumerate tracked source")
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const match = /^(\d{6}) ([0-9a-f]{40,64}) ([0-3])\t([\s\S]+)$/.exec(entry);
      if (!match || match[3] !== "0") throw new Error("The release index is unmerged");
      return { mode: match[1], path: match[4] };
    });
  const digest = createHash("sha256");
  for (const entry of entries) {
    const path = join(repo, entry.path);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Tracked staging source must be a regular file: ${entry.path}`);
    }
    const contents = readFileSync(path);
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
  return { trackedFileCount: entries.length, trackedWorktreeSha256: digest.digest("hex") };
}

function captureReleaseIdentity() {
  if (realpathSync(repo) !== realpathSync(expectedRepo)) {
    throw new Error("The authority broker requires the exact isolated release worktree");
  }
  if (process.versions.node.split(".")[0] !== "24") {
    throw new Error(`The authority broker requires Node 24; received ${process.version}`);
  }
  const status = git(
    ["status", "--porcelain=v1", "--untracked-files=all", "-z"],
    "Unable to inspect the release worktree",
  );
  if (status !== "") throw new Error("The authority broker requires a clean release worktree");
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], "Unable to read branch").trim();
  if (branch !== expectedBranch) throw new Error("The authority broker requires the exact branch");
  return Object.freeze({
    branch,
    headCommit: git(["rev-parse", "--verify", "HEAD"], "Unable to read commit").trim(),
    headTree: git(["rev-parse", "--verify", "HEAD^{tree}"], "Unable to read tree").trim(),
    ...trackedWorktreeIdentity(),
    dependencyLockSha256: sha256(readFileSync(join(repo, "package-lock.json"))),
  });
}

function captureMigrationIdentity() {
  const directory = join(repo, "supabase", "migrations");
  const files = readdirSync(directory)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort();
  if (
    files.length !== expectedMigrationCount ||
    files.at(-1) !== expectedFinalMigration ||
    new Set(files.map((name) => name.slice(0, 14))).size !== files.length
  ) {
    throw new Error("The exact 123-migration authority-hardened portfolio is required");
  }
  const digest = createHash("sha256");
  const records = files.map((name) => {
    const contents = readFileSync(join(directory, name));
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
    finalMigration: records.at(-1).name,
    migrationPortfolioSha256: digest.digest("hex"),
    records,
  });
}

function assertExternalFile(path, label) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label} must be a real file`);
  const relation = relative(realpathSync(repo), realpathSync(path));
  if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")) {
    throw new Error(`${label} must remain outside the release repository`);
  }
}

function readRound(path, expectedRound, identity, migrations) {
  assertExternalFile(path, `Verification round ${expectedRound}`);
  const value = JSON.parse(readFileSync(path, "utf8"));
  const evidence = assertFinalVerificationEvidenceIsSealable(dirname(path));
  assertExactFinalVerificationSummaryPortfolio(
    value,
    `Verification round ${expectedRound} portfolio`,
  );
  if (
    value.schemaVersion !== "dealflow.final-verification.v3" ||
    String(value.round) !== expectedRound ||
    !/^v24\./.test(value.runtime ?? "") ||
    value.localGateStatus !== expectedLocalGate ||
    value.repositoryInvariant !== "passed" ||
    evidence.status !== "PASS" ||
    evidence.fileCountBeforeSummary !== value.evidenceTreeFileCountBeforeSummary ||
    evidence.totalFileCount !== value.evidenceTreeFileCountBeforeSummary + 1 ||
    evidence.evidenceTreeSha256BeforeSummary !==
      value.evidenceTreeSha256BeforeSummary ||
    evidence.browser.status !== value.localBrowserEvidenceStatus ||
    evidence.browser.screenshotCount !== value.localBrowserScreenshotCount ||
    JSON.stringify(evidence.browser.projectScreenshotCounts) !==
      JSON.stringify(value.localBrowserProjectScreenshotCounts) ||
    value.failedCount !== 0 ||
    value.blockedCount !== expectedDeferrals.length ||
    value.passedCount !== value.plannedCommandCount ||
    value.headCommit !== identity.headCommit ||
    value.headTree !== identity.headTree ||
    value.trackedFileCount !== identity.trackedFileCount ||
    value.trackedWorktreeSha256 !== identity.trackedWorktreeSha256 ||
    value.dependencyLockSha256 !== identity.dependencyLockSha256 ||
    value.migrationCount !== migrations.migrationCount ||
    value.migrationPortfolioSha256 !== migrations.migrationPortfolioSha256 ||
    JSON.stringify(value.migrationFiles) !== JSON.stringify(migrations.records) ||
    !Array.isArray(value.environmentOnlyDeferrals) ||
    value.environmentOnlyDeferrals.length !== expectedDeferrals.length ||
    JSON.stringify(value.environmentOnlyDeferrals.map(({ command, status }) => ({ command, status }))) !==
      JSON.stringify(expectedDeferrals.map((command) => ({ command, status: "authenticated_deferred" }))) ||
    !Array.isArray(value.records) ||
    value.records.length !== value.plannedCommandCount ||
    new Set(value.records.map((record) => record.log)).size !== value.records.length ||
    value.records.some(
      (record) =>
        record.status !== "passed" ||
        record.exitCode !== 0 ||
        record.postCommandRepositoryInvariant !== "passed" ||
        record.safeEnvironmentProfile !== "provider_credentials_and_application_secrets_omitted" ||
        record.workingDirectory !== expectedRepo ||
        record.headCommit !== identity.headCommit ||
        record.headTree !== identity.headTree ||
        record.trackedFileCount !== identity.trackedFileCount ||
        record.trackedWorktreeSha256 !== identity.trackedWorktreeSha256 ||
        record.dependencyLockSha256 !== identity.dependencyLockSha256 ||
        record.migrationCount !== migrations.migrationCount ||
        record.migrationPortfolioSha256 !== migrations.migrationPortfolioSha256 ||
        !/^[0-9]{2,3}-[a-z0-9-]+\.log$/.test(record.log ?? ""),
    )
  ) {
    throw new Error(`Verification round ${expectedRound} is not an exact passing seal`);
  }
  return value;
}

function captureRoundEvidenceIdentity(summaryPath, summary) {
  const directory = dirname(summaryPath);
  const relation = relative(realpathSync(repo), realpathSync(directory));
  if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")) {
    throw new Error("Verification evidence must remain outside the release repository");
  }
  const paths = [];
  const visit = (current, prefix = "") => {
    for (const entry of readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = join(current, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error("Verification evidence contains a symlink");
      if (stat.isDirectory()) visit(absolute, relativePath);
      else if (stat.isFile()) paths.push({ absolute, relativePath });
      else throw new Error("Verification evidence contains an unsupported filesystem entry");
    }
  };
  visit(directory);
  if (!paths.some(({ absolute }) => realpathSync(absolute) === realpathSync(summaryPath))) {
    throw new Error("Verification summary is outside its evidence inventory");
  }
  for (const record of summary.records) {
    const logPath = join(directory, record.log);
    assertExternalFile(logPath, `Verification command log ${record.log}`);
    const log = readFileSync(logPath, "utf8");
    for (const marker of [
      `command: ${record.command}`,
      `working_directory: ${expectedRepo}`,
      `head_commit: ${record.headCommit}`,
      `head_tree: ${record.headTree}`,
      `tracked_worktree_sha256: ${record.trackedWorktreeSha256}`,
      `migration_count: ${record.migrationCount}`,
      `migration_portfolio_sha256: ${record.migrationPortfolioSha256}`,
      "command_exit_code: 0",
      "record_exit_code: 0",
      "post_command_repository_invariant: passed",
    ]) {
      if (!log.includes(marker)) throw new Error(`Verification log ${record.log} is not exact`);
    }
  }
  const digest = createHash("sha256");
  for (const { absolute, relativePath } of paths) {
    const contents = readFileSync(absolute);
    if (contents.byteLength === 0) throw new Error("Verification evidence contains an empty file");
    digest.update(String(Buffer.byteLength(relativePath)));
    digest.update("\0");
    digest.update(relativePath);
    digest.update("\0");
    digest.update(String(contents.byteLength));
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
  }
  return Object.freeze({
    fileCount: paths.length,
    evidenceSha256: digest.digest("hex"),
    summarySha256: sha256(readFileSync(summaryPath)),
  });
}

function prepareEvidenceDirectory() {
  if (existsSync(evidenceDir)) {
    const stat = lstatSync(evidenceDir);
    if (stat.isSymbolicLink() || !stat.isDirectory() || readdirSync(evidenceDir).length !== 0) {
      throw new Error("Authority evidence directory must be absent or empty");
    }
  } else {
    let parent = dirname(evidenceDir);
    while (!existsSync(parent)) parent = dirname(parent);
    const projected = resolve(realpathSync(parent), relative(parent, evidenceDir));
    const relation = relative(realpathSync(repo), projected);
    if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")) {
      throw new Error("Authority evidence must remain outside the release repository");
    }
    mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  }
  const relation = relative(realpathSync(repo), realpathSync(evidenceDir));
  if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")) {
    throw new Error("Authority evidence must remain outside the release repository");
  }
  chmodSync(evidenceDir, 0o700);
}

function readProjectAuthority() {
  const stat = lstatSync(projectRecordPath);
  const relationToRepo = relative(expectedRepo, projectRecordPath);
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.nlink !== 1 ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o077) !== 0 ||
    realpathSync(projectRecordPath) !== projectRecordPath ||
    relationToRepo === "" ||
    (!relationToRepo.startsWith(`..${sep}`) && relationToRepo !== "..")
  ) {
    throw new Error("The staging project attestation must be an owner-only regular file");
  }
  const record = JSON.parse(readFileSync(projectRecordPath, "utf8"));
  const ref = String(record.ref ?? "").trim().toLowerCase();
  if (
    !/^[a-z0-9]{20}$/.test(ref) ||
    record.name !== "dealflow-staging-20260712" ||
    !["ACTIVE", "ACTIVE_HEALTHY"].includes(record.status) ||
    ref.slice(-4) !== expectedProjectSafeSuffix ||
    sha256(ref) !== expectedProjectFingerprint
  ) {
    throw new Error("The exact isolated staging project attestation is invalid");
  }
  return ref;
}

function readKeychainPassword() {
  const result = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", "-s", keychainService, "-a", keychainAccount, "-w"],
    { encoding: null, maxBuffer: 1024 * 1024, timeout: 30_000, env: { PATH: "/usr/bin:/bin" } },
  );
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new Error("The staging database Keychain authority is unavailable");
  }
  let end = result.stdout.length;
  while (end > 0 && [0x0a, 0x0d].includes(result.stdout[end - 1])) end -= 1;
  if (
    end === 0 ||
    result.stdout.subarray(0, end).includes(0x00) ||
    result.stdout.subarray(0, end).includes(0x0a) ||
    result.stdout.subarray(0, end).includes(0x0d)
  ) {
    result.stdout.fill(0);
    throw new Error("The staging database Keychain authority is malformed");
  }
  const password = Buffer.from(result.stdout.subarray(0, end));
  result.stdout.fill(0);
  return password;
}

function runOwnerTransaction(psql, projectRef, input) {
  const password = readKeychainPassword();
  const sql = Buffer.from(input, "utf8");
  const stdin = Buffer.concat([password, Buffer.from("\n"), sql]);
  password.fill(0);
  sql.fill(0);
  try {
    const result = spawnSync(
      psql,
      [
        "--password", "-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1",
        "--tuples-only", "--no-align", "--quiet",
      ],
      {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 300_000,
        input: stdin,
        env: {
          PATH: `${dirname(psql)}:/usr/bin:/bin`,
          PGHOST: `db.${projectRef}.supabase.co`,
          PGPORT: "5432",
          PGUSER: "postgres",
          PGDATABASE: "postgres",
          PGSSLMODE: "verify-full",
          PGSSLROOTCERT: expectedTrustBundlePath,
          PGPASSFILE: intentionallyAbsentPgpassPath,
        },
      },
    );
    return Object.freeze({
      succeeded: !result.error && result.status === 0,
      stdout: result.stdout ?? "",
      sanitizedDiagnostic: sanitize(
        `${result.error?.message ?? ""}\n${result.stderr ?? ""}`,
        projectRef,
      ),
      exitStatus: Number.isInteger(result.status) ? result.status : null,
      signal: result.signal ?? null,
    });
  } finally {
    stdin.fill(0);
  }
}

const brokerPath = realpathSync(fileURLToPath(import.meta.url));
if (brokerPath !== realpathSync(join(repo, brokerRelativePath))) {
  throw new Error("The authority broker must run from the tracked release source");
}
const brokerSourceBefore = readFileSync(brokerPath);
const brokerSourceSha256 = sha256(brokerSourceBefore);
const identity = captureReleaseIdentity();
const migrations = captureMigrationIdentity();
const rounds = roundPaths.map((path, index) =>
  readRound(path, String(index + 1), identity, migrations),
);
const verificationNativePostgresRuntimes = rounds.map((round, index) =>
  extractFinalVerificationNativePostgresRuntime(
    round.records.map((record) => record.command),
    `Verification round ${index + 1} native PostgreSQL runtime`,
  ),
);
if (
  rounds[0].headCommit !== rounds[1].headCommit ||
  rounds[0].resolvedCommandPortfolioSha256 !==
    rounds[1].resolvedCommandPortfolioSha256 ||
  sha256(readFileSync(roundPaths[0])) === sha256(readFileSync(roundPaths[1]))
) {
  throw new Error("Two distinct exact verification rounds are required");
}
if (
  JSON.stringify(verificationNativePostgresRuntimes[0]) !==
  JSON.stringify(verificationNativePostgresRuntimes[1])
) {
  throw new Error(
    "The two exact verification rounds do not bind the same native PostgreSQL runtime",
  );
}
const expectedPostgresBin = verificationNativePostgresRuntimes[0].pgbin;
const roundEvidence = roundPaths.map((path, index) =>
  captureRoundEvidenceIdentity(path, rounds[index]),
);
prepareEvidenceDirectory();
const intentionallyAbsentPgpassPath = join(
  evidenceDir,
  ".intentionally-absent-pgpass",
);
if (existsSync(intentionallyAbsentPgpassPath)) {
  throw new Error("The intentionally absent staging pgpass path already exists");
}
const projectRef = readProjectAuthority();
const postgresBin = process.env.DEALFLOW_NATIVE_PGBIN;
if (
  !postgresBin ||
  !existsSync(postgresBin) ||
  realpathSync(postgresBin) !== realpathSync(expectedPostgresBin)
) {
  throw new Error("DEALFLOW_NATIVE_PGBIN must be the pinned PostgreSQL 17.6 runtime");
}
const psql = join(postgresBin, "psql");
const psqlStat = lstatSync(psql);
if (!psqlStat.isFile() || psqlStat.isSymbolicLink()) {
  throw new Error("The pinned psql binary identity is invalid");
}
const trustBundleStat = lstatSync(expectedTrustBundlePath);
const trustBundleBytes = readFileSync(expectedTrustBundlePath);
const committedTrustBundleBytes = git(
  ["show", `${identity.headCommit}:${expectedTrustBundleRelativePath}`],
  "Unable to recover the committed Supabase trust bundle",
);
if (
  !trustBundleStat.isFile() ||
  trustBundleStat.isSymbolicLink() ||
  (trustBundleStat.mode & 0o022) !== 0 ||
  realpathSync(expectedTrustBundlePath) !== expectedTrustBundlePath ||
  sha256(trustBundleBytes) !== expectedTrustBundleSha256 ||
  sha256(committedTrustBundleBytes) !== expectedTrustBundleSha256
) {
  throw new Error("The pinned TLS trust bundle identity is invalid");
}

const authorityHash = `sha256:${sha256(authorityMarker)}`;
const ownerDecisionTemplate = JSON.parse(readFileSync(
  join(repo, "config", "authority", "dealflow-owner-decisions.v1.json"),
  "utf8",
));
const ownerDecisionTemplateSha256 = sha256(canonicalJson(ownerDecisionTemplate));
const metaOptimizationPolicy = Object.freeze({
  contractVersion: "dealflow-realtor-optimization-v2",
  currencies: ["CAD", "USD"],
  maximumObservationAgeMinutes: 60,
  minimumImpressions: 1000,
  minimumClicks: 20,
  minimumSpendMinor: 5000,
  minimumLeadsForCplDecision: 1,
  attributionWindowDays: 7,
  cooldownMinutes: 1440,
  maximumBudgetIncreasePercent: 20,
  maximumBudgetDecreasePercent: 100,
  maximumDailyScalePercent: 20,
  thresholds: {
    ctrGoodPercent: 2,
    ctrKillPercent: 0.5,
    cpcTargetMajor: 1,
    cplMaximumMajor: 50,
    landingPageConversionTargetPercent: 5,
    frequencyMaximum: 4,
    noLeadsTimeoutHours: 24,
    spendMultiplierKill: 2,
  },
});
const platformAdminPolicy = Object.freeze({
  contractVersion: "dealflow-platform-operator-v1",
  roles: ["viewer", "operator", "security_admin", "break_glass"],
  requiredAssuranceLevel: "aal2",
  maximumSessionAgeMinutes: 10,
  breakGlassMaximumMinutes: 60,
  receiptPolicy: "IMMUTABLE_NO_PII_NO_SECRETS",
});
const privacyPolicyCore = Object.freeze({
  contractVersion: "dealflow-privacy-authority-v1",
  policyVersion: "dealflow-synthetic-staging-privacy-v1",
  allowedPurposes: ["marketing", "analytics"],
  requestTypes: ["access", "correction", "export", "delete"],
  consentMaximumAgeDays: 365,
  dsarRequestExpiryHours: 72,
  exportArtifactExpiryHours: 24,
  requiredAssuranceLevel: "aal2",
  maximumSessionAgeMinutes: 10,
  legalHoldAndRetentionExecution: "EXPLICIT_SIGNED_AUTHORITY_REQUIRED",
  receiptPolicy: "IMMUTABLE_SANITIZED_NO_RAW_LOGS_OR_SECRETS",
});
const privacyPolicy = Object.freeze({
  ...privacyPolicyCore,
  policyDigest: sha256(canonicalJson(privacyPolicyCore)),
});
const syntheticCapabilitySpecs = Object.freeze([
  { capability: "vercel_analytics", decisionIds: privacyDecisionIds, policy: null },
  { capability: "meta_optimization_provider_writes", decisionIds: ["OWNER-007"], policy: metaOptimizationPolicy },
  { capability: "platform_admin_security_surface", decisionIds: ["OWNER-ADMIN-SECURITY-SURFACE"], policy: platformAdminPolicy },
  { capability: "privacy_consent_dsar_authority", decisionIds: privacyDecisionIds, policy: privacyPolicy },
]);
const syntheticCapabilityRecords = syntheticCapabilitySpecs.map((spec) => {
  const selectedValues = spec.decisionIds.map((id) => ({
    id,
    selectedValue: {
      capabilityGrants: { [spec.capability]: "APPROVED_ENABLED" },
    },
  }));
  const payloadSha256 = sha256(canonicalJson({
    authorityMode: "synthetic_staging",
    capability: spec.capability,
    decisionIds: spec.decisionIds,
    selectedValues,
    policy: spec.policy,
    hostProjectIdSha256: expectedVercelProjectIdFingerprint,
    candidateCommit: identity.headCommit,
    candidateTree: identity.headTree,
    candidateDigest: identity.trackedWorktreeSha256,
    trackedFileCount: identity.trackedFileCount,
    dependencyLockSha256: identity.dependencyLockSha256,
    migrationPortfolioSha256: migrations.migrationPortfolioSha256,
    migrationCount: migrations.migrationCount,
  }));
  const authorityId = "dealflow-synthetic-staging";
  const keyId = "database-owner-broker-v1";
  const signatureReference = `ed25519:${authorityId}:${keyId}:${payloadSha256}`;
  return Object.freeze({
    ...spec,
    selectedValues,
    selectedValuesSha256: sha256(canonicalJson(selectedValues)),
    policySha256: spec.policy === null ? null : sha256(canonicalJson(spec.policy)),
    envelopeId: `synthetic-staging-${spec.capability}`,
    envelopeSha256: sha256(`synthetic-staging-envelope:${spec.capability}:${payloadSha256}`),
    payloadSha256,
    signatureReference,
    authorityId,
    keyId,
    publicKeySha256: sha256("synthetic-staging-database-owner-no-external-public-key"),
  });
});
const privacyCapabilityRecord = syntheticCapabilityRecords.find(
  ({ capability }) => capability === "privacy_consent_dsar_authority",
);
if (!privacyCapabilityRecord) throw new Error("Synthetic privacy capability is missing");
const privacySignatureBundleSha256 = sha256(JSON.stringify(
  privacyDecisionIds.map((decisionId) => ({
    decisionId,
    signatureReference: privacyCapabilityRecord.signatureReference,
  })).sort((left, right) => left.decisionId.localeCompare(right.decisionId)),
));
const syntheticCapabilityValuesSql = syntheticCapabilityRecords.map((record) => `(
  ${sqlLiteral(record.capability)}, ${sqlTextArray(record.decisionIds)},
  ${sqlLiteral(JSON.stringify(record.selectedValues))}::jsonb,
  ${sqlLiteral(record.selectedValuesSha256)},
  ${record.policy === null ? "null" : `${sqlLiteral(JSON.stringify(record.policy))}::jsonb`},
  ${record.policySha256 === null ? "null" : sqlLiteral(record.policySha256)},
  ${sqlLiteral(record.envelopeId)}, ${sqlLiteral(record.envelopeSha256)},
  ${sqlLiteral(record.payloadSha256)}, ${sqlLiteral(record.signatureReference)},
  ${sqlLiteral(record.authorityId)}, ${sqlLiteral(record.keyId)},
  ${sqlLiteral(record.publicKeySha256)}
)`).join(",\n");
const versions = migrations.records.map(({ name }) => `'${name.slice(0, 14)}'`).join(",");
const transaction = `
\\echo DEALFLOW_RETENTION_TRANSACTION_STARTED
begin;
set local lock_timeout = '10s';
set local statement_timeout = '5min';
select pg_advisory_xact_lock(hashtextextended('dealflow-qibh-retention-authority-v1', 0));
create temp table dealflow_expected_owner_grants (
  capability text primary key,
  decision_ids text[] not null,
  selected_values jsonb not null,
  selected_values_sha256 text not null,
  policy jsonb,
  policy_sha256 text,
  envelope_id text not null,
  envelope_sha256 text not null,
  payload_sha256 text not null,
  signature_reference text not null,
  authority_id text not null,
  key_id text not null,
  public_key_sha256 text not null
) on commit drop;
insert into dealflow_expected_owner_grants values
${syntheticCapabilityValuesSql};
do $dealflow$
declare
  actual_versions text[];
  authority public.account_deletion_retention_configuration%rowtype;
  mode text;
  relation_owner name;
  api_role text;
  forbidden_privilege text;
  owner_grant_mode text;
  privacy_grant_mode text;
  privacy_grant_id uuid;
  v_inventory_relation_count integer;
  v_inventory_generation_digest text;
  v_inventory_classification_digest text;
  v_classifications jsonb;
  v_classified_relation_count integer;
  v_installed_generation_digest text;
  v_installed_classification_digest text;
  v_existing_owner_grant_count integer;
  v_existing_privacy_grant_count integer;
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception using errcode='42501', message='dealflow_staging_database_owner_required';
  end if;
  select pg_get_userbyid(class.relowner) into relation_owner
  from pg_class class
  join pg_namespace namespace on namespace.oid=class.relnamespace
  where namespace.nspname='public'
    and class.relname='account_deletion_retention_configuration'
    and class.relkind in ('r','p');
  if relation_owner is distinct from current_user then
    raise exception using errcode='42501', message='dealflow_retention_relation_owner_mismatch';
  end if;
  select array_agg(version order by version) into actual_versions
  from supabase_migrations.schema_migrations;
  if actual_versions is distinct from array[${versions}]::text[] then
    raise exception using errcode='55000', message='dealflow_exact_migration_history_required';
  end if;
  if not has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'SELECT')
    or has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'INSERT')
    or has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'UPDATE')
    or has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'DELETE')
    or has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'TRUNCATE')
    or has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'REFERENCES')
    or has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'TRIGGER')
    or has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'MAINTAIN')
    or has_any_column_privilege('service_role', 'public.account_deletion_retention_configuration', 'INSERT,UPDATE,REFERENCES') then
    raise exception using errcode='42501', message='dealflow_retention_acl_not_hardened';
  end if;
  foreach api_role in array array['anon','authenticated'] loop
    foreach forbidden_privilege in array array[
      'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'
    ] loop
      if has_table_privilege(
        api_role,
        'public.account_deletion_retention_configuration',
        forbidden_privilege
      ) then
        raise exception using errcode='42501', message='dealflow_retention_api_role_acl_present';
      end if;
    end loop;
    if has_any_column_privilege(
      api_role,
      'public.account_deletion_retention_configuration',
      'SELECT,INSERT,UPDATE,REFERENCES'
    ) then
      raise exception using errcode='42501', message='dealflow_retention_api_role_column_acl_present';
    end if;
  end loop;
  if exists (
    select 1
    from pg_class class
    join pg_namespace namespace on namespace.oid=class.relnamespace
    cross join lateral aclexplode(coalesce(class.relacl, acldefault('r', class.relowner))) acl
    where namespace.nspname='public'
      and class.relname='account_deletion_retention_configuration'
      and acl.grantee=0
  ) then
    raise exception using errcode='42501', message='dealflow_retention_public_acl_present';
  end if;
  if exists (
    select 1
    from pg_attribute attribute
    cross join lateral aclexplode(attribute.attacl) acl
    where attribute.attrelid='public.account_deletion_retention_configuration'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
      and acl.grantee=0
  ) then
    raise exception using errcode='42501', message='dealflow_retention_public_column_acl_present';
  end if;
  if not has_table_privilege(
    relation_owner,
    'public.account_deletion_retention_configuration',
    'UPDATE'
  ) then
    raise exception using errcode='42501', message='dealflow_retention_owner_update_missing';
  end if;
  select * into strict authority
  from public.account_deletion_retention_configuration
  where singleton for update;
  if authority.approved_authority_hash is null and authority.approved_at is null then
    if authority.grace_days is distinct from ${productionPendingPolicy.graceDays}
      or authority.operational_retention_days is distinct from ${productionPendingPolicy.operationalRetentionDays}
      or authority.support_retention_days is distinct from ${productionPendingPolicy.supportRetentionDays}
      or authority.analytics_retention_days is distinct from ${productionPendingPolicy.analyticsRetentionDays}
      or authority.financial_retention_days is distinct from ${productionPendingPolicy.financialRetentionDays}
      or authority.receipt_retention_days is distinct from ${productionPendingPolicy.receiptRetentionDays}
      or authority.billing_cancellation_mode is distinct from '${productionPendingPolicy.billingCancellationMode}'
      or authority.policy_version is distinct from ${productionPendingPolicy.policyVersion} then
      raise exception using errcode='55000', message='dealflow_unexpected_pending_retention_policy';
    end if;
    update public.account_deletion_retention_configuration
    set grace_days=${syntheticStagingPolicy.graceDays},
      operational_retention_days=${syntheticStagingPolicy.operationalRetentionDays},
      support_retention_days=${syntheticStagingPolicy.supportRetentionDays},
      analytics_retention_days=${syntheticStagingPolicy.analyticsRetentionDays},
      financial_retention_days=${syntheticStagingPolicy.financialRetentionDays},
      receipt_retention_days=${syntheticStagingPolicy.receiptRetentionDays},
      billing_cancellation_mode='${syntheticStagingPolicy.billingCancellationMode}',
      policy_version=${syntheticStagingPolicy.policyVersion},
      approved_authority_hash='${authorityHash}',
      approved_at='${authorityTimestamp}'::timestamptz
    where singleton
      and approved_authority_hash is null
      and approved_at is null
      and grace_days=${productionPendingPolicy.graceDays}
      and operational_retention_days=${productionPendingPolicy.operationalRetentionDays}
      and support_retention_days=${productionPendingPolicy.supportRetentionDays}
      and analytics_retention_days=${productionPendingPolicy.analyticsRetentionDays}
      and financial_retention_days=${productionPendingPolicy.financialRetentionDays}
      and receipt_retention_days=${productionPendingPolicy.receiptRetentionDays}
      and billing_cancellation_mode='${productionPendingPolicy.billingCancellationMode}'
      and policy_version=${productionPendingPolicy.policyVersion};
    if not found then
      raise exception using errcode='40001', message='dealflow_retention_authority_race';
    end if;
    mode := 'pending_only_installed';
  elsif authority.approved_authority_hash='${authorityHash}'
    and authority.approved_at='${authorityTimestamp}'::timestamptz
    and authority.grace_days=${productionPendingPolicy.graceDays}
    and authority.operational_retention_days=${productionPendingPolicy.operationalRetentionDays}
    and authority.support_retention_days=${productionPendingPolicy.supportRetentionDays}
    and authority.analytics_retention_days=${productionPendingPolicy.analyticsRetentionDays}
    and authority.financial_retention_days=${productionPendingPolicy.financialRetentionDays}
    and authority.receipt_retention_days=${productionPendingPolicy.receiptRetentionDays}
    and authority.billing_cancellation_mode='${productionPendingPolicy.billingCancellationMode}'
    and authority.policy_version=${productionPendingPolicy.policyVersion} then
    update public.account_deletion_retention_configuration
    set grace_days=${syntheticStagingPolicy.graceDays},
      operational_retention_days=${syntheticStagingPolicy.operationalRetentionDays},
      support_retention_days=${syntheticStagingPolicy.supportRetentionDays},
      analytics_retention_days=${syntheticStagingPolicy.analyticsRetentionDays},
      financial_retention_days=${syntheticStagingPolicy.financialRetentionDays},
      receipt_retention_days=${syntheticStagingPolicy.receiptRetentionDays},
      billing_cancellation_mode='${syntheticStagingPolicy.billingCancellationMode}',
      policy_version=${syntheticStagingPolicy.policyVersion}
    where singleton
      and approved_authority_hash='${authorityHash}'
      and approved_at='${authorityTimestamp}'::timestamptz
      and grace_days=${productionPendingPolicy.graceDays}
      and operational_retention_days=${productionPendingPolicy.operationalRetentionDays}
      and support_retention_days=${productionPendingPolicy.supportRetentionDays}
      and analytics_retention_days=${productionPendingPolicy.analyticsRetentionDays}
      and financial_retention_days=${productionPendingPolicy.financialRetentionDays}
      and receipt_retention_days=${productionPendingPolicy.receiptRetentionDays}
      and billing_cancellation_mode='${productionPendingPolicy.billingCancellationMode}'
      and policy_version=${productionPendingPolicy.policyVersion};
    if not found then
      raise exception using errcode='40001', message='dealflow_retention_approved_policy_recovery_race';
    end if;
    mode := 'exact_approved_policy_recovered';
  elsif authority.approved_authority_hash='${authorityHash}'
    and authority.approved_at='${authorityTimestamp}'::timestamptz
    and authority.grace_days=${syntheticStagingPolicy.graceDays}
    and authority.operational_retention_days=${syntheticStagingPolicy.operationalRetentionDays}
    and authority.support_retention_days=${syntheticStagingPolicy.supportRetentionDays}
    and authority.analytics_retention_days=${syntheticStagingPolicy.analyticsRetentionDays}
    and authority.financial_retention_days=${syntheticStagingPolicy.financialRetentionDays}
    and authority.receipt_retention_days=${syntheticStagingPolicy.receiptRetentionDays}
    and authority.billing_cancellation_mode='${syntheticStagingPolicy.billingCancellationMode}'
    and authority.policy_version=${syntheticStagingPolicy.policyVersion} then
    mode := 'exact_existing_reused';
  else
    raise exception using errcode='55000', message='dealflow_unexpected_retention_authority';
  end if;

  select count(*) into v_existing_owner_grant_count
  from public.owner_decision_authority_grants where environment='staging';
  if not exists (
    select 1 from dealflow_expected_owner_grants expected
    left join public.owner_decision_authority_grants grant_row
      on grant_row.environment='staging'
      and grant_row.authority_mode='synthetic_staging'
      and grant_row.capability=expected.capability
      and grant_row.decision_ids=expected.decision_ids
      and grant_row.selected_values=expected.selected_values
      and grant_row.selected_values_sha256=expected.selected_values_sha256
      and grant_row.policy is not distinct from expected.policy
      and grant_row.policy_sha256 is not distinct from expected.policy_sha256
      and grant_row.envelope_id=expected.envelope_id
      and grant_row.envelope_sha256=expected.envelope_sha256
      and grant_row.payload_sha256=expected.payload_sha256
      and grant_row.signature_reference=expected.signature_reference
      and grant_row.authority_id=expected.authority_id
      and grant_row.key_id=expected.key_id
      and grant_row.public_key_sha256=expected.public_key_sha256
      and grant_row.generation=(
        select max(latest.generation)
        from public.owner_decision_authority_grants latest
        where latest.environment='staging'
          and latest.capability=expected.capability
      )
      and grant_row.revocation_generation=0
      and grant_row.host_project_id_sha256='${expectedVercelProjectIdFingerprint}'
      and grant_row.candidate_commit='${identity.headCommit}'
      and grant_row.candidate_tree='${identity.headTree}'
      and grant_row.candidate_digest='${identity.trackedWorktreeSha256}'
      and grant_row.tracked_file_count=${identity.trackedFileCount}
      and grant_row.dependency_lock_sha256='${identity.dependencyLockSha256}'
      and grant_row.migration_portfolio_sha256='${migrations.migrationPortfolioSha256}'
      and grant_row.migration_count=${migrations.migrationCount}
      and grant_row.template_sha256='${ownerDecisionTemplateSha256}'
      and grant_row.decision_inventory_sha256='${decisionInventorySha256}'
      and grant_row.requirement_inventory_sha256='${requirementInventorySha256}'
      and grant_row.effective_at <= clock_timestamp()
      and grant_row.expires_at > clock_timestamp()
      and not exists (
        select 1 from public.owner_decision_authority_revocations revocation
        where revocation.grant_id=grant_row.id
          and revocation.revocation_generation > grant_row.revocation_generation
      )
    where grant_row.id is null
  ) then
    owner_grant_mode := 'exact_synthetic_owner_grants_reused';
  else
    if exists (
      select 1 from public.owner_decision_authority_grants grant_row
      where grant_row.environment='staging'
        and (grant_row.authority_mode <> 'synthetic_staging'
          or grant_row.capability not in (
            select expected.capability from dealflow_expected_owner_grants expected
          )
          or (grant_row.candidate_commit='${identity.headCommit}'
            and grant_row.expires_at > clock_timestamp()))
    ) then
      raise exception using errcode='55000', message='dealflow_unexpected_staging_owner_authority';
    end if;
    insert into public.owner_decision_authority_grants (
      environment, authority_mode, capability, decision_ids, selected_values,
      selected_values_sha256, policy, policy_sha256, envelope_id, envelope_sha256,
      payload_sha256, signature_reference, authority_id, key_id, public_key_sha256,
      generation, revocation_generation, host_project_id_sha256, candidate_commit,
      candidate_tree, candidate_digest, tracked_file_count, dependency_lock_sha256,
      migration_portfolio_sha256, migration_count, template_sha256,
      decision_inventory_sha256, requirement_inventory_sha256, effective_at,
      expires_at, grant_digest
    )
    select 'staging', 'synthetic_staging', expected.capability,
      expected.decision_ids, expected.selected_values,
      expected.selected_values_sha256, expected.policy, expected.policy_sha256,
      expected.envelope_id, expected.envelope_sha256, expected.payload_sha256,
      expected.signature_reference, expected.authority_id, expected.key_id,
      expected.public_key_sha256, coalesce((
        select max(existing.generation) + 1
        from public.owner_decision_authority_grants existing
        where existing.environment='staging'
          and existing.capability=expected.capability
      ), 1), 0,
      '${expectedVercelProjectIdFingerprint}', '${identity.headCommit}',
      '${identity.headTree}', '${identity.trackedWorktreeSha256}',
      ${identity.trackedFileCount}, '${identity.dependencyLockSha256}',
      '${migrations.migrationPortfolioSha256}', ${migrations.migrationCount},
      '${ownerDecisionTemplateSha256}', '${decisionInventorySha256}',
      '${requirementInventorySha256}', clock_timestamp() - interval '1 minute',
      clock_timestamp() + interval '12 hours', repeat('0',64)
    from dealflow_expected_owner_grants expected;
    owner_grant_mode := case when v_existing_owner_grant_count=0
      then 'exact_synthetic_owner_grants_installed'
      else 'exact_synthetic_owner_grants_rotated' end;
  end if;

  select refreshed.relation_count, refreshed.inventory_generation_digest
  into strict v_inventory_relation_count, v_inventory_generation_digest
  from public.refresh_privacy_data_inventory_v1() refreshed;
  select encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
    inventory.relation_schema, inventory.relation_name,
    'synthetic_staging_test_only', '', 'synthetic_test_only',
    'synthetic_test_only', 'synthetic_test_only'
  ), E'\n' order by inventory.relation_schema, inventory.relation_name), ''),
    'UTF8'), 'sha256'), 'hex')
  into v_inventory_classification_digest
  from public.privacy_data_inventory inventory;
  select jsonb_agg(jsonb_build_object(
    'relation_schema', inventory.relation_schema,
    'relation_name', inventory.relation_name,
    'authority_class', 'synthetic_staging_test_only',
    'scope_column', null,
    'disposition', 'synthetic_test_only',
    'retention_class', 'synthetic_test_only',
    'executor_task', 'synthetic_test_only'
  ) order by inventory.relation_schema, inventory.relation_name)
  into strict v_classifications
  from public.privacy_data_inventory inventory;
  if jsonb_array_length(v_classifications) <> v_inventory_relation_count then
    raise exception using errcode='55000', message='dealflow_synthetic_privacy_classification_snapshot_incomplete';
  end if;

  select count(*) into v_existing_privacy_grant_count
  from public.privacy_authority_grants where environment='staging';
  select grant_row.id into privacy_grant_id
  from public.privacy_authority_grants grant_row
  where grant_row.environment='staging' and grant_row.status='active'
    and grant_row.authority_mode='synthetic_staging'
    and grant_row.generation=(
      select max(latest.generation)
      from public.privacy_authority_grants latest
      where latest.environment='staging'
    )
    and grant_row.candidate_commit='${identity.headCommit}'
    and grant_row.candidate_tree='${identity.headTree}'
    and grant_row.candidate_digest='${identity.trackedWorktreeSha256}'
    and grant_row.authority_packet_digest='${privacyCapabilityRecord.payloadSha256}'
    and grant_row.signature_bundle_digest='${privacySignatureBundleSha256}'
    and grant_row.policy_version=${sqlLiteral(privacyPolicy.policyVersion)}
    and grant_row.policy_digest=${sqlLiteral(privacyPolicy.policyDigest)}
    and grant_row.inventory_generation_digest=v_inventory_generation_digest
    and grant_row.inventory_relation_count=v_inventory_relation_count
    and grant_row.inventory_classification_digest=v_inventory_classification_digest
    and grant_row.allowed_purposes=${sqlTextArray(privacyPolicy.allowedPurposes)}
    and grant_row.consent_maximum_age_days=${privacyPolicy.consentMaximumAgeDays}
    and grant_row.dsar_request_expiry_hours=${privacyPolicy.dsarRequestExpiryHours}
    and grant_row.export_artifact_expiry_hours=${privacyPolicy.exportArtifactExpiryHours}
    and not grant_row.legal_retention_authorized
    and grant_row.legal_authority_ref_digest is null
    and grant_row.expires_at > clock_timestamp();
  if privacy_grant_id is not null then
    privacy_grant_mode := 'exact_synthetic_privacy_grant_reused';
  else
    if exists (
      select 1 from public.privacy_authority_grants grant_row
      where grant_row.environment='staging' and grant_row.status='active'
        and (grant_row.authority_mode <> 'synthetic_staging'
          or (grant_row.candidate_commit='${identity.headCommit}'
            and grant_row.expires_at > clock_timestamp()))
    ) then
      raise exception using errcode='55000', message='dealflow_unexpected_staging_privacy_authority';
    end if;
    update public.privacy_authority_grants
    set status='expired'
    where environment='staging' and status='active'
      and authority_mode='synthetic_staging'
      and expires_at <= clock_timestamp();
    update public.privacy_authority_grants
    set status='revoked', revoked_at=clock_timestamp(),
      revocation_reason_code='synthetic_staging_candidate_rotated'
    where environment='staging' and status='active'
      and authority_mode='synthetic_staging';
    if exists (
      select 1 from public.privacy_authority_grants
      where environment='staging' and status='active'
    ) then
      raise exception using errcode='55000', message='dealflow_staging_privacy_rotation_incomplete';
    end if;
    insert into public.privacy_authority_grants (
      environment, authority_mode, status, generation, candidate_commit,
      candidate_tree, candidate_digest, authority_packet_digest,
      signature_bundle_digest, policy_version, policy_digest,
      inventory_generation_digest, inventory_relation_count,
      inventory_classification_digest, allowed_purposes,
      consent_maximum_age_days, dsar_request_expiry_hours,
      export_artifact_expiry_hours, legal_retention_authorized,
      legal_authority_ref_digest, grant_digest, granted_at, expires_at
    ) values (
      'staging', 'synthetic_staging', 'active', coalesce((
        select max(existing.generation) + 1
        from public.privacy_authority_grants existing
        where existing.environment='staging'
      ), 1), '${identity.headCommit}', '${identity.headTree}',
      '${identity.trackedWorktreeSha256}',
      '${privacyCapabilityRecord.payloadSha256}', '${privacySignatureBundleSha256}',
      ${sqlLiteral(privacyPolicy.policyVersion)}, ${sqlLiteral(privacyPolicy.policyDigest)},
      v_inventory_generation_digest, v_inventory_relation_count,
      v_inventory_classification_digest, ${sqlTextArray(privacyPolicy.allowedPurposes)},
      ${privacyPolicy.consentMaximumAgeDays}, ${privacyPolicy.dsarRequestExpiryHours},
      ${privacyPolicy.exportArtifactExpiryHours}, false, null, repeat('0',64),
      clock_timestamp(), clock_timestamp() + interval '12 hours'
    ) returning id into privacy_grant_id;
    privacy_grant_mode := case when v_existing_privacy_grant_count=0
      then 'exact_synthetic_privacy_grant_installed'
      else 'exact_synthetic_privacy_grant_rotated' end;
  end if;

  select installed.classified_relation_count,
    installed.inventory_generation_digest,
    installed.inventory_classification_digest
  into strict v_classified_relation_count, v_installed_generation_digest,
    v_installed_classification_digest
  from public.install_privacy_inventory_classifications_v1(
    privacy_grant_id,
    v_classifications
  ) installed;
  if v_classified_relation_count <> v_inventory_relation_count
    or v_installed_generation_digest is distinct from v_inventory_generation_digest
    or v_installed_classification_digest is distinct from v_inventory_classification_digest
    or (select count(*) from public.privacy_data_inventory) <> v_inventory_relation_count
    or exists (
      select 1 from public.privacy_data_inventory inventory
      where inventory.authority_class is distinct from 'synthetic_staging_test_only'
        or inventory.scope_column is not null
        or inventory.disposition is distinct from 'synthetic_test_only'
        or inventory.retention_class is distinct from 'synthetic_test_only'
        or inventory.executor_task is distinct from 'synthetic_test_only'
        or inventory.authority_grant_id is distinct from privacy_grant_id
        or inventory.classification_snapshot_digest is distinct from v_inventory_classification_digest
        or inventory.inventory_generation_digest is distinct from v_inventory_generation_digest
    )
    or (select count(*) from public.privacy_data_inventory inventory
      where inventory.relation_schema='public'
        and inventory.relation_name in (
          'owner_decision_authority_grants',
          'owner_decision_authority_revocations'
        )) <> 2 then
    raise exception using errcode='55000', message='dealflow_synthetic_privacy_inventory_incomplete';
  end if;

  create temp table dealflow_retention_authority_result(
    mode text not null, owner_grant_mode text not null,
    privacy_grant_mode text not null, inventory_relation_count integer not null,
    inventory_generation_digest text not null,
    inventory_classification_digest text not null
  ) on commit drop;
  insert into dealflow_retention_authority_result values (
    mode, owner_grant_mode, privacy_grant_mode, v_inventory_relation_count,
    v_inventory_generation_digest, v_inventory_classification_digest
  );
end
$dealflow$;
select json_build_object(
  'mode', result.mode,
  'ownerGrantMode', result.owner_grant_mode,
  'privacyGrantMode', result.privacy_grant_mode,
  'ownerGrantCount', (select count(*) from public.owner_decision_authority_grants grant_row
    where grant_row.environment='staging'
      and grant_row.generation=(select max(latest.generation)
        from public.owner_decision_authority_grants latest
        where latest.environment='staging' and latest.capability=grant_row.capability)
      and grant_row.candidate_commit='${identity.headCommit}'
      and grant_row.candidate_tree='${identity.headTree}'
      and grant_row.candidate_digest='${identity.trackedWorktreeSha256}'
      and grant_row.expires_at > clock_timestamp()
      and not exists (select 1 from public.owner_decision_authority_revocations revocation
        where revocation.grant_id=grant_row.id
          and revocation.revocation_generation > grant_row.revocation_generation)),
  'ownerGrantCapabilityCount', (select count(distinct grant_row.capability)
    from public.owner_decision_authority_grants grant_row
    where grant_row.environment='staging'
      and grant_row.generation=(select max(latest.generation)
        from public.owner_decision_authority_grants latest
        where latest.environment='staging' and latest.capability=grant_row.capability)
      and grant_row.candidate_commit='${identity.headCommit}'
      and grant_row.candidate_tree='${identity.headTree}'
      and grant_row.candidate_digest='${identity.trackedWorktreeSha256}'
      and grant_row.expires_at > clock_timestamp()
      and not exists (select 1 from public.owner_decision_authority_revocations revocation
        where revocation.grant_id=grant_row.id
          and revocation.revocation_generation > grant_row.revocation_generation)),
  'ownerGrantHistoricalCount', (select count(*) from public.owner_decision_authority_grants where environment='staging'),
  'ownerGrantHostProjectMatches', not exists (
    select 1 from public.owner_decision_authority_grants grant_row
    where grant_row.environment='staging'
      and grant_row.generation=(select max(latest.generation)
        from public.owner_decision_authority_grants latest
        where latest.environment='staging' and latest.capability=grant_row.capability)
      and grant_row.host_project_id_sha256 <> '${expectedVercelProjectIdFingerprint}'
  ),
  'productionOwnerGrantCount', (select count(*) from public.owner_decision_authority_grants where environment='production'),
  'privacyActiveGrantCount', (select count(*) from public.privacy_authority_grants where environment='staging' and status='active'),
  'privacyHistoricalGrantCount', (select count(*) from public.privacy_authority_grants where environment='staging'),
  'privacyLegalRetentionAuthorizedCount', (select count(*) from public.privacy_authority_grants
    where environment='staging' and status='active' and legal_retention_authorized),
  'productionPrivacyGrantCount', (select count(*) from public.privacy_authority_grants where environment='production'),
  'inventoryRelationCount', result.inventory_relation_count,
  'inventoryGenerationDigest', result.inventory_generation_digest,
  'inventoryClassificationDigest', result.inventory_classification_digest,
  'inventoryUnresolvedCount', (select count(*) from public.privacy_data_inventory where authority_class='unresolved_owner_privacy_authority'),
  'inventorySyntheticCount', (select count(*) from public.privacy_data_inventory where authority_class='synthetic_staging_test_only'),
  'inventoryNullExecutorCount', (select count(*) from public.privacy_data_inventory where executor_task is null),
  'inventoryWrongGrantCount', (select count(*) from public.privacy_data_inventory inventory
    where not exists (
      select 1 from public.privacy_authority_grants grant_row
      where grant_row.environment='staging' and grant_row.status='active'
        and grant_row.id=inventory.authority_grant_id
    )),
  'inventoryWrongSnapshotCount', (select count(*) from public.privacy_data_inventory
    where classification_snapshot_digest is distinct from result.inventory_classification_digest
      or inventory_generation_digest is distinct from result.inventory_generation_digest),
  'inventoryAuthorityTableCount', (select count(*) from public.privacy_data_inventory inventory
    where inventory.relation_schema='public'
      and inventory.relation_name in (
        'owner_decision_authority_grants',
        'owner_decision_authority_revocations'
      )),
  'approvedAt', to_char(configuration.approved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'authorityHashMatches', configuration.approved_authority_hash='${authorityHash}',
  'serviceRoleSelect', has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'SELECT'),
  'serviceRoleInsert', has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'INSERT'),
  'serviceRoleUpdate', has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'UPDATE'),
  'serviceRoleDelete', has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'DELETE'),
  'serviceRoleTruncate', has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'TRUNCATE'),
  'serviceRoleReferences', has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'REFERENCES'),
  'serviceRoleTrigger', has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'TRIGGER'),
  'serviceRoleMaintain', has_table_privilege('service_role', 'public.account_deletion_retention_configuration', 'MAINTAIN'),
  'serviceRoleColumnWritePrivilege', has_any_column_privilege('service_role', 'public.account_deletion_retention_configuration', 'INSERT,UPDATE,REFERENCES'),
  'anonAnyPrivilege', has_any_column_privilege('anon', 'public.account_deletion_retention_configuration', 'SELECT,INSERT,UPDATE,REFERENCES')
    or has_table_privilege('anon', 'public.account_deletion_retention_configuration', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
  'authenticatedAnyPrivilege', has_any_column_privilege('authenticated', 'public.account_deletion_retention_configuration', 'SELECT,INSERT,UPDATE,REFERENCES')
    or has_table_privilege('authenticated', 'public.account_deletion_retention_configuration', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
  'publicAclPresent', exists (
    select 1 from pg_class class
    join pg_namespace namespace on namespace.oid=class.relnamespace
    cross join lateral aclexplode(coalesce(class.relacl, acldefault('r', class.relowner))) acl
    where namespace.nspname='public'
      and class.relname='account_deletion_retention_configuration'
      and acl.grantee=0
  ),
  'publicColumnAclPresent', exists (
    select 1 from pg_attribute attribute
    cross join lateral aclexplode(attribute.attacl) acl
    where attribute.attrelid='public.account_deletion_retention_configuration'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
      and acl.grantee=0
  ),
  'relationOwner', pg_get_userbyid(class.relowner),
  'ownerUpdate', has_table_privilege(pg_get_userbyid(class.relowner), 'public.account_deletion_retention_configuration', 'UPDATE'),
  'graceDays', configuration.grace_days,
  'operationalRetentionDays', configuration.operational_retention_days,
  'supportRetentionDays', configuration.support_retention_days,
  'analyticsRetentionDays', configuration.analytics_retention_days,
  'financialRetentionDays', configuration.financial_retention_days,
  'receiptRetentionDays', configuration.receipt_retention_days,
  'billingCancellationMode', configuration.billing_cancellation_mode,
  'policyVersion', configuration.policy_version
)
from dealflow_retention_authority_result result
cross join public.account_deletion_retention_configuration configuration
join pg_class class on class.relname='account_deletion_retention_configuration'
join pg_namespace namespace on namespace.oid=class.relnamespace and namespace.nspname='public'
where configuration.singleton;
commit;
\\echo DEALFLOW_RETENTION_TRANSACTION_COMMITTED
`;

let failureWritten = false;
function writeFailure(reason, remote = {}) {
  if (failureWritten) return;
  const failure = {
    schemaVersion: "dealflow.staging-retention-authority-failure.v1",
    status: "FAIL",
    reason: sanitize(reason, projectRef),
    projectFingerprint: expectedProjectFingerprint,
    safeSuffix: expectedProjectSafeSuffix,
    releaseBranch: identity.branch,
    headCommit: identity.headCommit,
    headTree: identity.headTree,
    migrationCount: migrations.migrationCount,
    migrationPortfolioSha256: migrations.migrationPortfolioSha256,
    remoteMutationStarted: remote.remoteMutationStarted ?? null,
    remoteMutationCompleted: remote.remoteMutationCompleted ?? null,
    remoteMutationOutcome: remote.remoteMutationOutcome ?? "unknown_requires_readback",
    productionMutationPerformed: false,
    providerActionPerformed: false,
    customerDataAccessed: false,
    communicationSent: false,
    spendIncurred: false,
  };
  const failureText = `${JSON.stringify(failure, null, 2)}\n`;
  writeFileSync(join(evidenceDir, "RETENTION_AUTHORITY_FAILURE.json"), failureText, {
    mode: 0o600,
  });
  writeFileSync(
    join(evidenceDir, "SHA256SUMS"),
    `${sha256(failureText)}  RETENTION_AUTHORITY_FAILURE.json\n`,
    { mode: 0o600 },
  );
  failureWritten = true;
}

const databaseExecution = runOwnerTransaction(psql, projectRef, transaction);
const transactionStarted = databaseExecution.stdout.includes(
  "DEALFLOW_RETENTION_TRANSACTION_STARTED",
);
const transactionCommitted = databaseExecution.stdout.includes(
  "DEALFLOW_RETENTION_TRANSACTION_COMMITTED",
);
const jsonLine = databaseExecution.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith("{") && line.endsWith("}"));
let databaseResult = null;
if (jsonLine) {
  try {
    databaseResult = JSON.parse(jsonLine);
  } catch {
    databaseResult = null;
  }
}
const validRetentionMode = [
  "pending_only_installed",
  "exact_approved_policy_recovered",
  "exact_existing_reused",
].includes(databaseResult?.mode);
const validOwnerGrantMode = [
  "exact_synthetic_owner_grants_installed",
  "exact_synthetic_owner_grants_rotated",
  "exact_synthetic_owner_grants_reused",
].includes(databaseResult?.ownerGrantMode);
const validPrivacyGrantMode = [
  "exact_synthetic_privacy_grant_installed",
  "exact_synthetic_privacy_grant_rotated",
  "exact_synthetic_privacy_grant_reused",
].includes(databaseResult?.privacyGrantMode);
// The exact inventory installer refreshes and rebinds the catalog snapshot even
// on an otherwise exact replay. A successful authority transaction therefore
// always performs an isolated-staging database mutation and must never be
// reported as a read-only reuse.
const attemptedInstall = validRetentionMode && validOwnerGrantMode && validPrivacyGrantMode
  ? true
  : null;
const remoteState = {
  remoteMutationStarted: attemptedInstall,
  remoteMutationCompleted: transactionCommitted && attemptedInstall !== null
    ? attemptedInstall
    : transactionCommitted
      ? null
      : null,
  remoteMutationOutcome: transactionCommitted
    ? attemptedInstall === true
      ? databaseResult?.mode === "exact_approved_policy_recovered"
        ? "exact_approved_policy_recovery_committed"
        : databaseResult?.mode === "pending_only_installed"
          ? "exact_pending_only_install_committed"
          : databaseResult?.mode === "exact_existing_reused"
            ? "exact_authority_projection_refresh_committed"
            : "commit_observed_but_result_unproven"
      : "commit_observed_but_result_unproven"
    : transactionStarted
      ? "unknown_requires_readback"
      : "connection_not_established_or_transaction_not_started",
};
if (!databaseExecution.succeeded || !transactionCommitted || !databaseResult) {
  writeFailure(
    databaseExecution.sanitizedDiagnostic ||
      "The owner transaction did not produce an exact committed result",
    remoteState,
  );
  throw new Error("The owner transaction failed or became ambiguous; inspect the sealed failure evidence");
}

try {
  if (
    !validRetentionMode ||
    !validOwnerGrantMode ||
    !validPrivacyGrantMode ||
    databaseResult.ownerGrantCount !== 4 ||
    databaseResult.ownerGrantCapabilityCount !== 4 ||
    !Number.isSafeInteger(databaseResult.ownerGrantHistoricalCount) ||
    databaseResult.ownerGrantHistoricalCount < 4 ||
    databaseResult.ownerGrantHostProjectMatches !== true ||
    databaseResult.productionOwnerGrantCount !== 0 ||
    databaseResult.privacyActiveGrantCount !== 1 ||
    !Number.isSafeInteger(databaseResult.privacyHistoricalGrantCount) ||
    databaseResult.privacyHistoricalGrantCount < 1 ||
    databaseResult.privacyLegalRetentionAuthorizedCount !== 0 ||
    databaseResult.productionPrivacyGrantCount !== 0 ||
    !Number.isSafeInteger(databaseResult.inventoryRelationCount) ||
    databaseResult.inventoryRelationCount <= 0 ||
    !/^[a-f0-9]{64}$/.test(databaseResult.inventoryGenerationDigest ?? "") ||
    !/^[a-f0-9]{64}$/.test(databaseResult.inventoryClassificationDigest ?? "") ||
    databaseResult.inventoryUnresolvedCount !== 0 ||
    databaseResult.inventorySyntheticCount !== databaseResult.inventoryRelationCount ||
    databaseResult.inventoryNullExecutorCount !== 0 ||
    databaseResult.inventoryWrongGrantCount !== 0 ||
    databaseResult.inventoryWrongSnapshotCount !== 0 ||
    databaseResult.inventoryAuthorityTableCount !== 2 ||
    databaseResult.approvedAt !== authorityTimestamp ||
    databaseResult.authorityHashMatches !== true ||
    databaseResult.serviceRoleSelect !== true ||
    databaseResult.serviceRoleInsert !== false ||
    databaseResult.serviceRoleUpdate !== false ||
    databaseResult.serviceRoleDelete !== false ||
    databaseResult.serviceRoleTruncate !== false ||
    databaseResult.serviceRoleReferences !== false ||
    databaseResult.serviceRoleTrigger !== false ||
    databaseResult.serviceRoleMaintain !== false ||
    databaseResult.serviceRoleColumnWritePrivilege !== false ||
    databaseResult.anonAnyPrivilege !== false ||
    databaseResult.authenticatedAnyPrivilege !== false ||
    databaseResult.publicAclPresent !== false ||
    databaseResult.publicColumnAclPresent !== false ||
    databaseResult.relationOwner !== "postgres" ||
    databaseResult.ownerUpdate !== true ||
    databaseResult.graceDays !== syntheticStagingPolicy.graceDays ||
    databaseResult.operationalRetentionDays !== syntheticStagingPolicy.operationalRetentionDays ||
    databaseResult.supportRetentionDays !== syntheticStagingPolicy.supportRetentionDays ||
    databaseResult.analyticsRetentionDays !== syntheticStagingPolicy.analyticsRetentionDays ||
    databaseResult.financialRetentionDays !== syntheticStagingPolicy.financialRetentionDays ||
    databaseResult.receiptRetentionDays !== syntheticStagingPolicy.receiptRetentionDays ||
    databaseResult.billingCancellationMode !== syntheticStagingPolicy.billingCancellationMode ||
    databaseResult.policyVersion !== syntheticStagingPolicy.policyVersion
  ) {
    throw new Error("The staging retention authority postcondition failed");
  }
  if (sha256(readFileSync(brokerPath)) !== brokerSourceSha256) {
    throw new Error("The tracked authority broker changed during execution");
  }
  const finalIdentity = captureReleaseIdentity();
  if (JSON.stringify(finalIdentity) !== JSON.stringify(identity)) {
    throw new Error("The exact release identity changed during authority installation");
  }
} catch (error) {
  writeFailure(error instanceof Error ? error.message : String(error), remoteState);
  throw error;
}

const proof = {
  schemaVersion: "dealflow.synthetic-retention-authority.v1",
  status: "PASS",
  installationMode: databaseResult.mode,
  exactPendingOnlyOrReplaySafe: true,
  authorityMarker,
  exactSyntheticMarker: true,
  authorityHashFingerprint: sha256(authorityHash),
  approvedAt: authorityTimestamp,
  approvedPolicy: syntheticStagingPolicy,
  releaseBranch: identity.branch,
  headCommit: identity.headCommit,
  headTree: identity.headTree,
  trackedFileCount: identity.trackedFileCount,
  trackedWorktreeSha256: identity.trackedWorktreeSha256,
  dependencyLockSha256: identity.dependencyLockSha256,
  migrationCount: migrations.migrationCount,
  finalMigration: migrations.finalMigration,
  migrationPortfolioSha256: migrations.migrationPortfolioSha256,
  projectFingerprint: expectedProjectFingerprint,
  safeSuffix: expectedProjectSafeSuffix,
  authorityRole: "postgres",
  ownerAuthorityVerified: true,
  databaseAuthority: "postgres_owner",
  keychainCredentialTransfer: "stdin_memory_only_zeroed",
  tlsServerAuthentication: {
    mode: "verify-full",
    trustBundlePath: expectedTrustBundlePath,
    trustBundleRelativePath: expectedTrustBundleRelativePath,
    trustBundleSha256: expectedTrustBundleSha256,
    trustBundleTrackedAtCommit: true,
  },
  serviceRolePrivileges: {
    select: true,
    insert: false,
    update: false,
    delete: false,
    truncate: false,
    references: false,
    trigger: false,
    maintain: false,
  },
  serviceRoleSelectOnly: true,
  serviceRoleColumnWritePrivilegesPresent: false,
  anonPrivilegesPresent: false,
  authenticatedPrivilegesPresent: false,
  publicAclPresent: false,
  publicColumnAclPresent: false,
  relationOwner: "postgres",
  ownerUpdatePrivilege: true,
  syntheticStagingOnly: true,
  ownerDecisionAuthority: {
    installationMode: databaseResult.ownerGrantMode,
    currentGrantCount: databaseResult.ownerGrantCount,
    currentCapabilityCount: databaseResult.ownerGrantCapabilityCount,
    historicalGrantCount: databaseResult.ownerGrantHistoricalCount,
    hostProjectMatches: databaseResult.ownerGrantHostProjectMatches,
    productionGrantCount: databaseResult.productionOwnerGrantCount,
  },
  privacyAuthority: {
    installationMode: databaseResult.privacyGrantMode,
    activeGrantCount: databaseResult.privacyActiveGrantCount,
    historicalGrantCount: databaseResult.privacyHistoricalGrantCount,
    productionGrantCount: databaseResult.productionPrivacyGrantCount,
    inventoryRelationCount: databaseResult.inventoryRelationCount,
    inventoryGenerationDigest: databaseResult.inventoryGenerationDigest,
    inventoryClassificationDigest: databaseResult.inventoryClassificationDigest,
    unresolvedCount: databaseResult.inventoryUnresolvedCount,
    syntheticClassificationCount: databaseResult.inventorySyntheticCount,
    nullExecutorCount: databaseResult.inventoryNullExecutorCount,
    wrongGrantCount: databaseResult.inventoryWrongGrantCount,
    wrongSnapshotCount: databaseResult.inventoryWrongSnapshotCount,
    terminalAuthorityTableCount: databaseResult.inventoryAuthorityTableCount,
    legalRetentionAuthorized: databaseResult.privacyLegalRetentionAuthorizedCount !== 0,
    workerAndLegalHoldExecutionAuthorized: false,
  },
  replaySemantics:
    "bounded_generation_rotation_or_unexpired_exact_replay_with_catalog_rebind",
  remoteMutationStarted: remoteState.remoteMutationStarted,
  remoteMutationCompleted: remoteState.remoteMutationCompleted,
  remoteMutationOutcome: remoteState.remoteMutationOutcome,
  customerDataAccessed: false,
  realCustomerDataAccessed: false,
  productionMutationPerformed: false,
  providerActionPerformed: false,
  communicationSent: false,
  spendIncurred: false,
  broker: { path: brokerRelativePath, sha256: brokerSourceSha256 },
  verificationRoundSha256: roundPaths.map((path) => sha256(readFileSync(path))),
  verificationRoundEvidence: roundEvidence,
};
const proofText = `${JSON.stringify(proof, null, 2)}\n`;
writeFileSync(join(evidenceDir, "retention-authority-summary.json"), proofText, {
  mode: 0o600,
});
const checksums = `${sha256(proofText)}  retention-authority-summary.json\n`;
writeFileSync(join(evidenceDir, "SHA256SUMS"), checksums, { mode: 0o600 });
for (const name of readdirSync(evidenceDir)) chmodSync(join(evidenceDir, name), 0o600);

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  installationMode: proof.installationMode,
  evidenceDir,
  projectFingerprint: proof.projectFingerprint,
  safeSuffix: proof.safeSuffix,
  productionMutationPerformed: false,
})}\n`);
