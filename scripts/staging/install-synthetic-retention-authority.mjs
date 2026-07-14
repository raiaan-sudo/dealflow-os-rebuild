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
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { assertExactFinalVerificationSummaryPortfolio } from "../lib/final-verification-command-contract.mjs";

const [repoArg, evidenceArg, roundOneArg, roundTwoArg] = process.argv.slice(2);
if (!repoArg || !evidenceArg || !roundOneArg || !roundTwoArg || process.argv.length !== 6) {
  throw new Error(
    "Usage: install-synthetic-retention-authority.mjs <repo> <external-evidence-dir> <round-1-summary.json> <round-2-summary.json>",
  );
}

const repo = resolve(repoArg);
const evidenceDir = resolve(evidenceArg);
const roundPaths = [resolve(roundOneArg), resolve(roundTwoArg)];
const expectedRepo = "/private/tmp/dealflow-overnight-release-20260712";
const expectedBranch = "codex/dealflow-overnight-release-20260712";
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
const expectedMigrationCount = 103;
const expectedFinalMigration =
  "20260713028000_harden_account_deletion_retention_authority.sql";
const expectedLocalGate = "NO_GO_AUTHENTICATED_PROOF_DEFERRED";
const expectedDeferrals = Object.freeze([
  "npm run operator:debt",
  "npm run rls:cross-tenant",
  "npm run rls:fixture-smoke",
]);
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
const brokerRelativePath =
  "scripts/staging/install-synthetic-retention-authority.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
  if (process.versions.node.split(".")[0] !== "20") {
    throw new Error(`The authority broker requires Node 20; received ${process.version}`);
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
    throw new Error("The exact 103-migration authority-hardened portfolio is required");
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
  assertExactFinalVerificationSummaryPortfolio(
    value,
    `Verification round ${expectedRound} portfolio`,
  );
  if (
    value.schemaVersion !== "dealflow.final-verification.v3" ||
    String(value.round) !== expectedRound ||
    !/^v20\./.test(value.runtime ?? "") ||
    value.localGateStatus !== expectedLocalGate ||
    value.repositoryInvariant !== "passed" ||
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
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o077) !== 0) {
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
          PGPASSFILE: "/private/tmp/dealflow-staging-intentionally-absent-pgpass",
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
if (
  rounds[0].headCommit !== rounds[1].headCommit ||
  sha256(readFileSync(roundPaths[0])) === sha256(readFileSync(roundPaths[1]))
) {
  throw new Error("Two distinct exact verification rounds are required");
}
const roundEvidence = roundPaths.map((path, index) =>
  captureRoundEvidenceIdentity(path, rounds[index]),
);
prepareEvidenceDirectory();
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
const versions = migrations.records.map(({ name }) => `'${name.slice(0, 14)}'`).join(",");
const transaction = `
\\echo DEALFLOW_RETENTION_TRANSACTION_STARTED
begin;
set local lock_timeout = '10s';
set local statement_timeout = '5min';
select pg_advisory_xact_lock(hashtextextended('dealflow-qibh-retention-authority-v1', 0));
do $dealflow$
declare
  actual_versions text[];
  authority public.account_deletion_retention_configuration%rowtype;
  mode text;
  relation_owner name;
  api_role text;
  forbidden_privilege text;
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
  create temp table dealflow_retention_authority_result(mode text not null) on commit drop;
  insert into dealflow_retention_authority_result values (mode);
end
$dealflow$;
select json_build_object(
  'mode', result.mode,
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
const attemptedInstall = ["pending_only_installed", "exact_approved_policy_recovered"].includes(
  databaseResult?.mode,
)
  ? true
  : databaseResult?.mode === "exact_existing_reused"
    ? false
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
        : "exact_pending_only_install_committed"
      : attemptedInstall === false
        ? "exact_existing_reused_without_mutation"
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
    ![
      "pending_only_installed",
      "exact_approved_policy_recovered",
      "exact_existing_reused",
    ].includes(databaseResult.mode) ||
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
