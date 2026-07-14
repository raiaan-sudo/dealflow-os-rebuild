#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
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

import { isExactCurrentResumeIdentity } from "./prior-migration-proof-contract.mjs";

const EXPECTED_REPO = "/private/tmp/dealflow-overnight-release-20260712";
const EXPECTED_BRANCH = "codex/dealflow-overnight-release-20260712";
const EXPECTED_STAGING_HOST = "dealflow-os-rebuild-selfserve-clean.vercel.app";
const EXPECTED_STAGING_BASE_URL = `https://${EXPECTED_STAGING_HOST}`;
const EXPECTED_SECOND_PARTNER_HOST =
  "dealflow-os-rebuild-selfserve-clean-partner-two-qibh.vercel.app";
const EXPECTED_SECOND_PARTNER_BASE_URL = `https://${EXPECTED_SECOND_PARTNER_HOST}`;
const EXPECTED_SUPABASE_FINGERPRINT =
  "c4d7f6ba9f2c678101b45b453998c4fa5755d8ec038f6cfd3ca8de957a0d1f4c";
const EXPECTED_SUPABASE_SAFE_SUFFIX = "qibh";
const EXPECTED_PRIOR_MIGRATION_APPLICATION_COMMIT =
  "e776f38b5302dda525d51cf03e4668568e272a77";
const EXPECTED_PRIOR_MIGRATION_APPLICATION_TREE =
  "0fcf11214ed3ae097003f737077cd7c67cdedfb7";
const EXPECTED_PRIOR_MIGRATION_MANIFEST_SHA256 =
  "877652c58c862dc9252c201e306890253f7189757c0d3cc3dbbd57d8afc26df4";
const EXPECTED_PRIOR_MIGRATION_PORTFOLIO_SHA256 =
  "30f6d3f03198dc2742179cbf7546400ade2f6a660dc52b96b27aeaec46f46ab3";
const EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT =
  "d0fa02eaf7e533f2a17a0b87c039c6a1686e5467840d2b8c2f2dca2758d95fde";
const EXPECTED_VERCEL_ORG_ID_FINGERPRINT =
  "0f12b45f2ccfe002e7aaea8d857a6034b16684d6fa6ba5013f80dc8635fe9146";
const EXPECTED_VERCEL_PROJECT_NAME = "dealflow-os-rebuild-selfserve-clean";
const EXPECTED_QA_EMAIL = "dealflow-staging-20260712@example.com";
const EXPECTED_OPERATOR_EMAIL = "dealflow-staging-operator-20260712@example.com";
const EXPECTED_MIGRATION_COUNT = 103;
const EXPECTED_FINAL_MIGRATION =
  "20260713028000_harden_account_deletion_retention_authority.sql";
const EXECUTION_AUTHORIZATION = "AUTHORIZE_ISOLATED_STAGING_ACCEPTANCE_V1";
const EXPECTED_LOCAL_GATE_STATUS = "NO_GO_AUTHENTICATED_PROOF_DEFERRED";
const EXPECTED_HOSTED_DEFERRALS = Object.freeze([
  "npm run operator:debt",
  "npm run rls:cross-tenant",
  "npm run rls:fixture-smoke",
]);
const ZERO_EXTERNAL_EFFECTS_ATTESTATION =
  "DEALFLOW_ISOLATED_STAGING_QIBH_ZERO_EXTERNAL_EFFECTS_V1";
const SYNTHETIC_RETENTION_AUTHORITY_MARKER =
  "DEALFLOW_ISOLATED_STAGING_QIBH_SYNTHETIC_RETENTION_AUTHORITY_V1";
const SYNTHETIC_FIXTURE_TIMESTAMP = "2026-07-12T12:00:00.000Z";
const EXPECTED_SYNTHETIC_RETENTION_POLICY = Object.freeze({
  graceDays: 0,
  operationalRetentionDays: 1,
  supportRetentionDays: 1,
  analyticsRetentionDays: 1,
  financialRetentionDays: 365,
  receiptRetentionDays: 365,
  billingCancellationMode: "period_end",
  policyVersion: 2,
});
const EXPECTED_DATABASE_TRUST_BUNDLE_PATH = "/etc/ssl/cert.pem";
const EXPECTED_DATABASE_TRUST_BUNDLE_SHA256 =
  "9dae8d76e55cb08991f2b672d58999ea15560d910759c16b544f843bdffbb994";
const EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT = 60;
const PAID_CAMPAIGN_ID = "d2000000-0000-4000-8000-000000000001";
const PAID_ORGANIZATION_ID = "d1000000-0000-4000-8000-000000000001";
const ATTACKER_ORGANIZATION_ID = "d1000000-0000-4000-8000-000000000011";
const ATTACKER_EMAIL = "dealflow-staging-attacker-20260712@example.com";
const DELETION_ORGANIZATION_ID = "d1000000-0000-4000-8000-000000000019";
const DELETION_EMAIL = "dealflow-staging-deletion-20260712@example.com";
const PUBLIC_FUNNEL_SLUG = "df-staging-20260712-funnel";
const EXECUTABLE = process.execPath;
const failureContext = {
  evidenceDir: null,
  stage: "startup",
  identity: null,
  sealCompleted: false,
};
const PROVIDER_SENSITIVE_ENV_NAMES = [
  "META_ACCESS_TOKEN",
  "META_APP_SECRET",
  "META_SYSTEM_USER_ACCESS_TOKEN",
  "META_TOKEN_ENCRYPTION_KEY",
  "META_LEADGEN_VERIFY_TOKEN",
  "GHL_API_KEY",
  "GHL_PRIVATE_INTEGRATION_TOKEN",
  "GHL_SANDBOX_AGENCY_TOKEN",
  "GHL_PRODUCTION_AGENCY_TOKEN",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_TEST_AUTH_TOKEN",
  "TWILIO_TEST_ACCOUNT_SID",
  "OPENAI_API_KEY",
  "AI_API_KEY",
  "HIGGSFIELD_API_KEY",
  "HIGGSFIELD_API_SECRET",
  "HIGGSFIELD_CREDENTIALS",
  "HEYGEN_API_KEY",
  "ELEVENLABS_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_TEST_WEBHOOK_SECRET",
  "SUPPORT_EXTERNAL_DELIVERY_TOKEN",
  "TURNSTILE_SECRET_KEY",
];
const REQUIRED_FALSE_CONTROLS = [
  "ALLOW_AI_TEXT_GENERATION",
  "ALLOW_OPENAI_IMAGE_GENERATION",
  "ALLOW_HEYGEN_VIDEO_GENERATION",
  "ALLOW_HEYGEN_LEGACY_FALLBACK",
  "ALLOW_HIGGSFIELD_VIDEO_GENERATION",
  "ALLOW_ELEVENLABS_VOICE_GENERATION",
  "ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT",
  "ALLOW_META_LIVE_LAUNCH",
  "ALLOW_SCHEDULED_META_LAUNCH_EXECUTION",
  "ALLOW_PRODUCTION_SCHEDULED_META_LAUNCH_EXECUTION",
  "ALLOW_STAGING_SCHEDULED_META_LAUNCH_EXECUTION",
  "ALLOW_META_DUE_ACTIVATION",
  "ALLOW_META_PRODUCTION_DUE_ACTIVATION",
  "ALLOW_META_STAGING_DUE_ACTIVATION",
  "ALLOW_META_SANDBOX_OPTIMIZATION",
  "ALLOW_META_PRODUCTION_OPTIMIZATION",
  "ALLOW_META_CAPI_EVENTS",
  "ALLOW_META_PIXEL_EVENTS",
  "ALLOW_META_LAUNCH_INTERRUPTION_TESTS",
  "ENABLE_META_LAUNCH_TEST_MODE",
  "ALLOW_BILLING_ADMIN_OVERRIDE",
  "ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE",
  "GHL_SANDBOX_WRITES_ENABLED",
  "GHL_SANDBOX_INBOUND_FORM_RECONCILIATION_ENABLED",
  "GHL_SANDBOX_INBOUND_FORM_SWEEP_ENABLED",
  "GHL_PRODUCTION_WRITES_ENABLED",
  "GHL_PRODUCTION_INBOUND_FORM_RECONCILIATION_ENABLED",
  "GHL_PRODUCTION_INBOUND_FORM_SWEEP_ENABLED",
  "GHL_PRODUCTION_PROVISIONING_ENABLED",
  "GHL_PRODUCTION_LEAD_DELIVERY_ENABLED",
  "GHL_PRODUCTION_LIFECYCLE_WEBHOOK_ENABLED",
  "GHL_PRODUCTION_FORM_SUBMISSIONS_READ_ENABLED",
  "SUPPORT_EXTERNAL_DELIVERY_ENABLED",
  "SUPPORT_PRODUCTION_EXTERNAL_DELIVERY_ENABLED",
  "SUPPORT_MAIL_SINK_ENABLED",
  "SUPPORT_STAGING_SINK_ENABLED",
  "STRIPE_TEST_HARNESS_ENABLED",
  "ENABLE_ACCESS_KEY_CHECKOUT",
  "ACCESS_KEY_PUBLIC_CHECKOUT_ENABLED",
  "NEXT_PUBLIC_ENABLE_GOOGLE_AUTH",
  "PUBLIC_CLIENT_ERROR_TELEMETRY_ENABLED",
  "ENABLE_DEMO_WORKSPACE_SEEDING",
  "ENABLE_STRUCTURED_INFO_LOGS",
  "INTERNAL_LEAD_SMS_ENABLED",
  "STRIPE_FORCE_TEST_MODE",
  "LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED",
  "LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE",
  "ACCOUNT_DELETION_EXECUTION_ENABLED",
  "ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED",
  "GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED",
];
const REQUIRED_EQUAL_CONTROLS = Object.freeze({
  NEXT_TELEMETRY_DISABLED: "1",
  TWILIO_EXECUTION_MODE: "disabled",
  META_EXECUTION_MODE: "sandbox",
  META_OPTIMIZATION_EXECUTION_MODE: "shadow",
  SUPPORT_NOTIFICATION_DELIVERY_MODE: "internal_operator_inbox",
  BILLING_CHECKOUT_SAFE_MODE: "true",
  UI_DIRECTION_PREVIEW: "0",
});
const REQUIRED_DISABLED_OR_EMPTY_CONTROLS = [
  "SMS_MOCK_MODE",
  "TEST_SMS_MODE",
  "SMS_COMPLIANCE_ACK",
];
const HOSTED_SECRET_ENV_NAMES = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "QA_ISOLATED_SUPABASE_PROJECT_REF",
  "DEALFLOW_STAGING_VERCEL_PROJECT_ID",
  "STAGING_QA_PASSWORD",
  "PARTNER_ATTRIBUTION_SIGNING_SECRET",
  "INTERNAL_SYSTEM_JOBS_SECRET",
]);
const PRODUCTION_OR_SHARED_HOSTS = new Set([
  "agentdealflow.io",
  "www.agentdealflow.io",
  "app.agentdealflow.io",
  "internal.agentdealflow.io",
  "clicktoscale.agentdealflow.io",
  "onboarding.agentdealflow.io",
]);

function usage() {
  return `Usage:
  node scripts/staging/run-isolated-staging-acceptance.mjs \\
    --execute --apply-migrations --deploy \\
    --evidence-dir /private/tmp/dealflow-staging-acceptance-evidence-<seal> \\
    --round-one /absolute/path/final-verification-round-1.json \\
    --round-two /absolute/path/final-verification-round-2.json

Safe resume after a previously sealed atomic application:
  node scripts/staging/run-isolated-staging-acceptance.mjs \\
    --execute --verify-existing-migrations --deploy \\
    --prior-migration-proof-dir /absolute/path/prior/migration-proof \\
    --evidence-dir /private/tmp/dealflow-staging-acceptance-evidence-<new-seal> \\
    --round-one /absolute/path/final-verification-round-1.json \\
    --round-two /absolute/path/final-verification-round-2.json

Exact forward-only migration 103 on the pinned 102-migration staging seal:
  node scripts/staging/run-isolated-staging-acceptance.mjs \\
    --execute --apply-forward-migration --deploy \\
    --prior-migration-proof-dir /absolute/path/pinned-102/migration-proof \\
    --evidence-dir /private/tmp/dealflow-staging-acceptance-evidence-<new-seal> \\
    --round-one /absolute/path/final-verification-round-1.json \\
    --round-two /absolute/path/final-verification-round-2.json

Required execution environment:
  DEALFLOW_STAGING_ACCEPTANCE_AUTHORIZATION=${EXECUTION_AUTHORIZATION}
  Exact isolated qibh Supabase credentials, staging QA secrets, and fail-closed provider flags.

Exactly one migration mode is required. Resume mode is read-only. Forward mode
proves the pinned 102 state and applies only migration 103 plus its receipt.`;
}

function parseArguments(argv) {
  const options = {
    execute: false,
    applyMigrations: false,
    applyForwardMigration: false,
    verifyExistingMigrations: false,
    deploy: false,
    evidenceDir: null,
    roundOne: null,
    roundTwo: null,
    priorMigrationProofDir: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--execute") options.execute = true;
    else if (arg === "--apply-migrations") options.applyMigrations = true;
    else if (arg === "--apply-forward-migration") options.applyForwardMigration = true;
    else if (arg === "--verify-existing-migrations") options.verifyExistingMigrations = true;
    else if (arg === "--deploy") options.deploy = true;
    else if (
      [
        "--evidence-dir",
        "--round-one",
        "--round-two",
        "--prior-migration-proof-dir",
      ].includes(arg)
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires an absolute path`);
      index += 1;
      if (arg === "--evidence-dir") options.evidenceDir = resolve(value);
      if (arg === "--round-one") options.roundOne = resolve(value);
      if (arg === "--round-two") options.roundTwo = resolve(value);
      if (arg === "--prior-migration-proof-dir") {
        options.priorMigrationProofDir = resolve(value);
      }
    } else {
      throw new Error(`Unknown staging acceptance option: ${arg}`);
    }
  }
  return options;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredEnvironment(name, minimumLength = 1) {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimumLength) {
    throw new Error(`${name} is required and must contain at least ${minimumLength} characters`);
  }
  return value;
}

function requiredStrongStagingSecret(name, minimumLength) {
  const value = requiredEnvironment(name, minimumLength);
  if (
    /^(?:test|example|placeholder|changeme|replace|secret|password)/i.test(value) ||
    new Set(value).size < 8
  ) {
    throw new Error(`${name} must be a strong staging-only value`);
  }
  return value;
}

function sanitize(value, secrets = []) {
  let output = String(value ?? "");
  for (const secret of secrets.filter(Boolean).sort((left, right) => right.length - left.length)) {
    output = output.split(secret).join("[REDACTED_SECRET]");
  }
  return output
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/(?:postgres|postgresql):\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\b(?:eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/g, "[REDACTED_JWT]")
    .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_PROVIDER_KEY]")
    .slice(0, 8_000);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? EXPECTED_REPO,
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024,
    timeout: options.timeoutMs ?? 15 * 60_000,
    input: options.input,
  });
  if (result.error || result.status !== 0) {
    const diagnostic = sanitize(
      `${result.error?.message ?? ""}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`,
      options.secrets,
    );
    throw new Error(`${options.label ?? basename(command)} failed: ${diagnostic}`);
  }
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

function git(args, label) {
  return run("/usr/bin/git", args, {
    cwd: EXPECTED_REPO,
    timeoutMs: 60_000,
    label,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "/private/tmp",
      LANG: "C",
      LC_ALL: "C",
    },
  }).stdout;
}

function captureTrackedWorktreeIdentity() {
  const entries = git(["ls-files", "--stage", "-z"], "enumerate tracked release files")
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const match = /^(\d{6}) ([0-9a-f]{40,64}) ([0-3])\t([\s\S]+)$/.exec(entry);
      if (!match || match[3] !== "0") throw new Error("The release index is unmerged");
      return { mode: match[1], path: match[4] };
    });
  const digest = createHash("sha256");
  for (const entry of entries) {
    const path = join(EXPECTED_REPO, entry.path);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Tracked staging source must be a regular file: ${entry.path}`);
    }
    const contents = readFileSync(path);
    digest.update(`${entry.mode}\0${entry.path.length}\0${entry.path}\0${contents.length}\0`);
    digest.update(contents);
    digest.update("\0");
  }
  return { trackedFileCount: entries.length, trackedWorktreeSha256: digest.digest("hex") };
}

function captureExactReleaseIdentity() {
  if (realpathSync(process.cwd()) !== realpathSync(EXPECTED_REPO)) {
    throw new Error("Staging acceptance must run from the exact isolated release worktree");
  }
  if (process.versions.node.split(".")[0] !== "20") {
    throw new Error(`Staging acceptance requires Node 20; received ${process.version}`);
  }
  const status = git(
    ["status", "--porcelain=v1", "--untracked-files=all", "-z"],
    "inspect release cleanliness",
  );
  if (status !== "") throw new Error("Staging acceptance requires a completely clean release worktree");
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], "read release branch").trim();
  if (branch !== EXPECTED_BRANCH) throw new Error("Staging acceptance requires the exact release branch");
  const commit = git(["rev-parse", "--verify", "HEAD"], "read release commit").trim();
  const tree = git(["rev-parse", "--verify", "HEAD^{tree}"], "read release tree").trim();
  const tracked = captureTrackedWorktreeIdentity();
  const dependencyLockSha256 = sha256(readFileSync(join(EXPECTED_REPO, "package-lock.json")));
  return Object.freeze({ branch, commit, tree, ...tracked, dependencyLockSha256 });
}

function captureMigrationPortfolio() {
  const dir = join(EXPECTED_REPO, "supabase", "migrations");
  const migrations = readdirSync(dir)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort();
  if (
    migrations.length !== EXPECTED_MIGRATION_COUNT ||
    migrations.at(-1) !== EXPECTED_FINAL_MIGRATION ||
    new Set(migrations.map((name) => name.slice(0, 14))).size !== migrations.length
  ) {
    throw new Error(`The exact ${EXPECTED_MIGRATION_COUNT}-migration portfolio is required`);
  }
  const digest = createHash("sha256");
  const migrationFiles = [];
  for (const name of migrations) {
    const contents = readFileSync(join(dir, name));
    digest.update(`${name.length}\0${name}\0${contents.length}\0`);
    digest.update(contents);
    digest.update("\0");
    migrationFiles.push({
      version: name.slice(0, 14),
      file: name,
      sha256: sha256(contents),
    });
  }
  return Object.freeze({
    migrationCount: migrations.length,
    finalMigration: migrations.at(-1),
    migrationFiles: Object.freeze(migrationFiles),
    migrationPortfolioSha256: digest.digest("hex"),
  });
}

function captureVercelProjectIdentity() {
  const linkPath = join(EXPECTED_REPO, ".vercel", "project.json");
  const stat = lstatSync(linkPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Vercel project link is not a regular file");
  const project = JSON.parse(readFileSync(linkPath, "utf8"));
  if (
    project.projectName !== EXPECTED_VERCEL_PROJECT_NAME ||
    sha256(String(project.projectId)) !== EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT ||
    sha256(String(project.orgId)) !== EXPECTED_VERCEL_ORG_ID_FINGERPRINT
  ) {
    throw new Error("The Vercel project is not the exact isolated staging project");
  }
  return Object.freeze({
    evidence: Object.freeze({
      projectName: project.projectName,
      projectIdFingerprint: sha256(String(project.projectId)),
      organizationIdFingerprint: sha256(String(project.orgId)),
    }),
    projectId: String(project.projectId),
  });
}

function extractProjectRef(rawUrl) {
  const url = new URL(rawUrl);
  const match = /^([a-z0-9-]+)\.supabase\.co$/.exec(url.hostname.toLowerCase());
  if (!match) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a hosted Supabase project URL");
  return match[1];
}

function protectedRuntimeValues() {
  const values = [
    process.env.VERCEL_TOKEN,
    process.env.VERCEL_ORG_ID,
    process.env.VERCEL_PROJECT_ID,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.STAGING_QA_PASSWORD,
    process.env.PARTNER_ATTRIBUTION_SIGNING_SECRET,
    process.env.INTERNAL_SYSTEM_JOBS_SECRET,
  ];
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      values.push(extractProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL));
    } catch {
      // Fail-closed environment validation reports malformed URLs separately.
    }
  }
  return values.filter(Boolean);
}

function assertFailClosedExecutionEnvironment() {
  if (process.env.DEALFLOW_STAGING_ACCEPTANCE_AUTHORIZATION !== EXECUTION_AUTHORIZATION) {
    throw new Error("The exact isolated-staging execution authorization is required");
  }
  if (requiredEnvironment("DEALFLOW_DEPLOYMENT_TARGET") !== "staging") {
    throw new Error("DEALFLOW_DEPLOYMENT_TARGET must be exactly staging");
  }
  if (requiredEnvironment("NEXT_PUBLIC_APP_URL") !== EXPECTED_STAGING_BASE_URL) {
    throw new Error("NEXT_PUBLIC_APP_URL is not the exact isolated staging base URL");
  }
  const projectRef = extractProjectRef(requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"));
  if (
    projectRef.slice(-4) !== EXPECTED_SUPABASE_SAFE_SUFFIX ||
    sha256(projectRef) !== EXPECTED_SUPABASE_FINGERPRINT
  ) {
    throw new Error("Supabase is not the exact isolated qibh staging project");
  }
  if (requiredEnvironment("QA_ISOLATED_SUPABASE_PROJECT_REF") !== projectRef) {
    throw new Error("QA Supabase project authority does not match the isolated staging project");
  }
  if (requiredEnvironment("QA_EMAIL").toLowerCase() !== EXPECTED_QA_EMAIL) {
    throw new Error("QA_EMAIL is not the exact paid direct synthetic identity");
  }
  requiredEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY", 32);
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY", 32);
  requiredStrongStagingSecret("STAGING_QA_PASSWORD", 16);
  requiredStrongStagingSecret("PARTNER_ATTRIBUTION_SIGNING_SECRET", 32);
  requiredStrongStagingSecret("INTERNAL_SYSTEM_JOBS_SECRET", 32);
  const admins = requiredEnvironment("INTERNAL_ADMIN_EMAILS")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  if (JSON.stringify(admins) !== JSON.stringify([EXPECTED_OPERATOR_EMAIL])) {
    throw new Error("INTERNAL_ADMIN_EMAILS must contain only the exact synthetic staging operator");
  }
  for (const name of REQUIRED_FALSE_CONTROLS) {
    if (process.env[name] !== "false") throw new Error(`${name} must be exactly false`);
  }
  for (const [name, expected] of Object.entries(REQUIRED_EQUAL_CONTROLS)) {
    if (process.env[name] !== expected) throw new Error(`${name} must be exactly ${expected}`);
  }
  for (const name of REQUIRED_DISABLED_OR_EMPTY_CONTROLS) {
    const value = process.env[name]?.trim().toLowerCase() ?? "";
    if (!["", "false", "disabled"].includes(value)) {
      throw new Error(`${name} must be disabled or empty`);
    }
  }
  const presentProviderCredentials = PROVIDER_SENSITIVE_ENV_NAMES
    .filter((name) => Boolean(process.env[name]?.trim()));
  if (presentProviderCredentials.length > 0) {
    throw new Error(
      `Provider credentials must be absent from the acceptance process: ${presentProviderCredentials.join(", ")}`,
    );
  }
  return Object.freeze({ projectRef });
}

function hostedStagingEnvironment(projectRef, vercelProjectId) {
  return Object.freeze({
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    DEALFLOW_STAGING_VERCEL_PROJECT_ID: vercelProjectId,
    DEALFLOW_STAGING_HOST_ATTESTATION: "DEALFLOW_ISOLATED_STAGING_VERCEL_PROJECT_EXACT_V1",
    NEXT_PUBLIC_APP_URL: EXPECTED_STAGING_BASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    QA_ISOLATED_SUPABASE_PROJECT_REF: projectRef,
    QA_AUTH_HARNESS_ENABLED: "true",
    QA_EMAIL: EXPECTED_QA_EMAIL,
    STAGING_QA_PASSWORD: process.env.STAGING_QA_PASSWORD,
    PARTNER_ATTRIBUTION_SIGNING_SECRET: process.env.PARTNER_ATTRIBUTION_SIGNING_SECRET,
    INTERNAL_SYSTEM_JOBS_SECRET: process.env.INTERNAL_SYSTEM_JOBS_SECRET,
    INTERNAL_ADMIN_EMAILS: EXPECTED_OPERATOR_EMAIL,
    ...Object.fromEntries(REQUIRED_FALSE_CONTROLS.map((name) => [name, "false"])),
    ...REQUIRED_EQUAL_CONTROLS,
    ...Object.fromEntries(REQUIRED_DISABLED_OR_EMPTY_CONTROLS.map((name) => [name, "disabled"])),
  });
}

function prepareEvidenceDirectory(path) {
  if (!path || !path.startsWith("/private/tmp/dealflow-staging-acceptance-evidence-")) {
    throw new Error("Evidence must use a new /private/tmp/dealflow-staging-acceptance-evidence-* path");
  }
  const relativeToRepo = relative(EXPECTED_REPO, path);
  if (relativeToRepo === "" || (!relativeToRepo.startsWith(`..${sep}`) && relativeToRepo !== "..")) {
    throw new Error("Evidence must remain outside the release worktree");
  }
  if (existsSync(path)) throw new Error("Evidence directory must not already exist");
  mkdirSync(path, { recursive: false, mode: 0o700 });
  chmodSync(path, 0o700);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
}

function writeTerminalFailureArtifact(sanitizedMessage) {
  const evidenceDir = failureContext.evidenceDir;
  if (
    !evidenceDir ||
    !existsSync(evidenceDir) ||
    !lstatSync(evidenceDir).isDirectory() ||
    failureContext.sealCompleted ||
    existsSync(join(evidenceDir, "STAGING_FAILURE.json"))
  ) {
    return false;
  }
  const identity = failureContext.identity;
  writeJson(join(evidenceDir, "STAGING_FAILURE.json"), {
    schemaVersion: "dealflow.isolated-staging-acceptance-failure.v1",
    status: "FAILED",
    stage: failureContext.stage || null,
    errorCode: "STAGING_ACCEPTANCE_FAILED",
    sanitizedErrorSha256: sha256(sanitizedMessage),
    candidateIdentity: identity
      ? { branch: identity.branch, commit: identity.commit, tree: identity.tree }
      : null,
    partialSealArtifactsPresent: [
      "FINAL_SUMMARY.json",
      "evidence-manifest.json",
      "SHA256SUMS",
    ].filter((name) => existsSync(join(evidenceDir, name))),
    containsSecrets: false,
    containsRealCustomerData: false,
    productionMutationPerformed: false,
    providerMutationPerformed: false,
    advertisingSpendIncurred: false,
    realCommunicationSent: false,
    productionReleaseAuthorized: false,
  });
  return true;
}

function readValidatedRound(path, identity, migrationIdentity, expectedRound, label) {
  if (!path || !existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
    throw new Error(`${label} must be an existing regular file`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (
    parsed.schemaVersion !== "dealflow.final-verification.v3" ||
    String(parsed.round) !== expectedRound ||
    !/^v20\./.test(parsed.runtime ?? "") ||
    parsed.repositoryInvariant !== "passed" ||
    parsed.localGateStatus !== EXPECTED_LOCAL_GATE_STATUS ||
    parsed.headCommit !== identity.commit ||
    parsed.headTree !== identity.tree ||
    parsed.trackedWorktreeSha256 !== identity.trackedWorktreeSha256 ||
    parsed.trackedFileCount !== identity.trackedFileCount ||
    parsed.dependencyLockSha256 !== identity.dependencyLockSha256 ||
    parsed.migrationCount !== EXPECTED_MIGRATION_COUNT ||
    parsed.migrationPortfolioSha256 !== migrationIdentity.migrationPortfolioSha256 ||
    parsed.failedCount !== 0 ||
    parsed.blockedCount !== EXPECTED_HOSTED_DEFERRALS.length ||
    parsed.environmentOnlyDeferredCount !== EXPECTED_HOSTED_DEFERRALS.length ||
    !Array.isArray(parsed.environmentOnlyDeferrals) ||
    JSON.stringify(
      parsed.environmentOnlyDeferrals.map((item) => item.command).sort(),
    ) !== JSON.stringify(EXPECTED_HOSTED_DEFERRALS) ||
    parsed.environmentOnlyDeferrals.some((item) => item.status !== "authenticated_deferred") ||
    parsed.commandCount !== parsed.plannedCommandCount ||
    parsed.passedCount !== parsed.plannedCommandCount ||
    !Array.isArray(parsed.records) ||
    parsed.records.length !== parsed.plannedCommandCount ||
    parsed.records[0]?.command !== "npm ci --ignore-scripts --no-audit --no-fund" ||
    parsed.records[1]?.command !== "npm ls --all" ||
    parsed.records.some(
      (record) => record.status !== "passed" || record.postCommandRepositoryInvariant !== "passed",
    )
  ) {
    throw new Error(`${label} is not an exact passing release-seal summary`);
  }
  return {
    pathFingerprint: sha256(realpathSync(path)),
    sha256: sha256(readFileSync(path)),
    status: "LOCAL_PASS_WITH_HOSTED_DEFERRALS",
    localGateStatus: parsed.localGateStatus,
    round: String(parsed.round),
    runtime: parsed.runtime,
    commandCount: parsed.commandCount,
    failedCount: parsed.failedCount,
    blockedCount: parsed.blockedCount,
    commit: parsed.headCommit,
    tree: parsed.headTree,
    migrationCount: parsed.migrationCount,
  };
}

function childBaseEnvironment() {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: process.env.HOME ?? "/private/tmp",
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

function authenticatedDatabaseProofEnvironment(extraEnvironment = {}) {
  return {
    ...childBaseEnvironment(),
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ...extraEnvironment,
  };
}

function runCapturedProofCommand(command, args, label, extraEnvironment = {}) {
  const secrets = [
    ...protectedRuntimeValues(),
    ...Object.values(extraEnvironment),
  ];
  const result = spawnSync(command, args, {
    cwd: EXPECTED_REPO,
    env: authenticatedDatabaseProofEnvironment(extraEnvironment),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 20 * 60_000,
  });
  return {
    label,
    status: !result.error && result.status === 0 ? "PASS" : "FAIL",
    exitCode: result.status,
    signal: result.signal,
    diagnostic: sanitize(
      `${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      secrets,
    ),
  };
}

function seedEnvironment(partnerBaseUrl, secondPartnerBaseUrl) {
  return {
    ...childBaseEnvironment(),
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_APP_URL: EXPECTED_STAGING_BASE_URL,
    STAGING_PARTNER_APP_URL: partnerBaseUrl,
    STAGING_SECOND_PARTNER_APP_URL: secondPartnerBaseUrl,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    QA_EMAIL: EXPECTED_QA_EMAIL,
    STAGING_QA_PASSWORD: process.env.STAGING_QA_PASSWORD,
    PARTNER_ATTRIBUTION_SIGNING_SECRET: process.env.PARTNER_ATTRIBUTION_SIGNING_SECRET,
  };
}

function parseSingleJsonOutput(output, label) {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} did not return one JSON document`);
  }
}

function runSeed(partnerBaseUrl, secondPartnerBaseUrl) {
  const secrets = protectedRuntimeValues();
  const result = run(EXECUTABLE, [join(EXPECTED_REPO, "scripts", "seed-isolated-staging.mjs")], {
    label: "isolated synthetic staging seed",
    env: seedEnvironment(partnerBaseUrl, secondPartnerBaseUrl),
    timeoutMs: 5 * 60_000,
    secrets,
  });
  const parsed = parseSingleJsonOutput(result.stdout, "staging seed");
  if (
    parsed.status !== "SEEDED" ||
    parsed.projectFingerprint !== EXPECTED_SUPABASE_FINGERPRINT ||
    parsed.safeSuffix !== EXPECTED_SUPABASE_SAFE_SUFFIX ||
    parsed.providerCredentialPresent !== false ||
    parsed.providerMutationPerformed !== false ||
    parsed.exactSyntheticAuthUserCount !== 10 ||
    parsed.exactFixtureCountsVerified !== true ||
    parsed.partner?.domainHost !== new URL(partnerBaseUrl).hostname ||
    parsed.partner?.domainVerified !== true ||
    parsed.partner?.sslActive !== true ||
    parsed.partner?.attributionBoundAtomically !== true ||
    parsed.partnerTwo?.domainHost !== new URL(secondPartnerBaseUrl).hostname ||
    parsed.partnerTwo?.domainVerified !== true ||
    parsed.partnerTwo?.sslActive !== true ||
    parsed.partnerTwo?.attributionBoundAtomically !== true ||
    parsed.reportingFixtures?.freshConfirmed !== true ||
    parsed.reportingFixtures?.staleConfirmed !== true ||
    parsed.reportingFixtures?.failedRefreshPreservesConfirmed !== true ||
    parsed.deletionRetentionAuthority?.marker !== SYNTHETIC_RETENTION_AUTHORITY_MARKER ||
    parsed.deletionRetentionAuthority?.authorityHashFingerprint !==
      sha256(`sha256:${sha256(SYNTHETIC_RETENTION_AUTHORITY_MARKER)}`) ||
    parsed.deletionRetentionAuthority?.approvedAt !== SYNTHETIC_FIXTURE_TIMESTAMP ||
    parsed.deletionRetentionAuthority?.approvedAfter !== true ||
    parsed.deletionRetentionAuthority?.productionDefaultChanged !== false ||
    parsed.failureFixtures?.providerMutationPerformed !== false
  ) {
    throw new Error("The isolated staging seed did not return the exact sanitized fixture attestation");
  }
  return parsed;
}

function classifyExactSyntheticRetentionAuthorityReplay(first, second) {
  const hasExactCommonAuthority = (authority) =>
    authority?.marker === SYNTHETIC_RETENTION_AUTHORITY_MARKER &&
    authority.authorityHashFingerprint ===
      sha256(`sha256:${sha256(SYNTHETIC_RETENTION_AUTHORITY_MARKER)}`) &&
    authority.approvedAt === SYNTHETIC_FIXTURE_TIMESTAMP &&
    authority.approvedAfter === true &&
    authority.productionDefaultChanged === false;
  const isExactReuse = (authority) =>
    hasExactCommonAuthority(authority) &&
    authority.pendingBeforeApproval === false &&
    authority.rejectedWhilePending === false &&
    authority.reusedExistingSyntheticApproval === true;
  const freshPendingThenApproved =
    hasExactCommonAuthority(first.deletionRetentionAuthority) &&
    first.deletionRetentionAuthority.pendingBeforeApproval === true &&
    first.deletionRetentionAuthority.rejectedWhilePending === true &&
    first.deletionRetentionAuthority.reusedExistingSyntheticApproval === false &&
    isExactReuse(second.deletionRetentionAuthority);
  const resumedExactSyntheticApproval =
    isExactReuse(first.deletionRetentionAuthority) &&
    isExactReuse(second.deletionRetentionAuthority);
  if (!freshPendingThenApproved && !resumedExactSyntheticApproval) {
    throw new Error("Staging retention authority replay was not the exact synthetic approval");
  }
  return freshPendingThenApproved
    ? "fresh_pending_then_approved"
    : "resumed_exact_synthetic_approval";
}

function assertSeedReplayIsIdempotent(first, second) {
  for (const key of [
    "userId",
    "organizationId",
    "campaignId",
    "leadId",
    "launchRecordId",
    "metaActivationPreauthorizationId",
    "commercialActivationId",
    "ghlActivationRequestId",
  ]) {
    if (first[key] !== second[key]) throw new Error(`Staging seed replay changed ${key}`);
  }
  if (
    JSON.stringify(first.scenarios) !== JSON.stringify(second.scenarios) ||
    JSON.stringify(first.organizations) !== JSON.stringify(second.organizations) ||
    JSON.stringify(first.partner) !== JSON.stringify(second.partner) ||
    JSON.stringify(first.partnerTwo) !== JSON.stringify(second.partnerTwo) ||
    JSON.stringify(first.reportingFixtures) !== JSON.stringify(second.reportingFixtures) ||
    JSON.stringify(first.failureFixtures) !== JSON.stringify(second.failureFixtures) ||
    second.activationReplayIdempotent !== true ||
    second.metaActivationReplayIdempotent !== true
  ) {
    throw new Error("Staging fixture replay was not exactly idempotent");
  }
  return classifyExactSyntheticRetentionAuthorityReplay(first, second);
}

function runProviderIndependentStagingProof(baseUrl) {
  const environment = {
    ...childBaseEnvironment(),
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    STAGING_ACCEPTANCE_BASE_URL: baseUrl,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    STAGING_QA_PASSWORD: process.env.STAGING_QA_PASSWORD,
    INTERNAL_SYSTEM_JOBS_SECRET: process.env.INTERNAL_SYSTEM_JOBS_SECRET,
    ALLOW_META_LIVE_LAUNCH: "false",
    ALLOW_META_CAPI_EVENTS: "false",
    GHL_SANDBOX_WRITES_ENABLED: "false",
    INTERNAL_LEAD_SMS_ENABLED: "false",
    SUPPORT_EXTERNAL_DELIVERY_ENABLED: "false",
    SUPPORT_NOTIFICATION_DELIVERY_MODE: "internal_operator_inbox",
    ACCOUNT_DELETION_EXECUTION_ENABLED: "false",
    ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED: "false",
    GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED: "false",
  };
  const result = run(
    EXECUTABLE,
    [join(EXPECTED_REPO, "scripts", "staging", "run-provider-independent-staging-proof.mjs")],
    {
      label: "provider-independent isolated staging journey proof",
      env: environment,
      timeoutMs: 10 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  const parsed = parseSingleJsonOutput(
    result.stdout,
    "provider-independent isolated staging journey proof",
  );
  if (
    parsed.status !== "PASS" ||
    parsed.projectFingerprint !== EXPECTED_SUPABASE_FINGERPRINT ||
    parsed.safeSuffix !== EXPECTED_SUPABASE_SAFE_SUFFIX ||
    parsed.billingLifecycle?.cancellationApplied !== true ||
    parsed.billingLifecycle?.staleReactivationRejected !== true ||
    parsed.billingLifecycle?.reactivationApplied !== true ||
    parsed.billingLifecycle?.exactReplayIdempotent !== true ||
    parsed.leadCapture?.durableRowCount !== 1 ||
    parsed.leadCapture?.duplicateReplaySameIdentity !== true ||
    parsed.leadCapture?.providerEffectsEnabled !== 0 ||
    parsed.support?.deliveryMode !== "internal_operator_inbox" ||
    parsed.support?.externalCommunicationPerformed !== false ||
    parsed.worker?.crashedLeaseRecovered !== true ||
    parsed.worker?.futureRetryPreserved !== true ||
    parsed.worker?.deadLetterPreserved !== true ||
    parsed.worker?.deadLetterReviewed !== true ||
    parsed.worker?.completedReplayNoOp !== true ||
    parsed.worker?.providerTableStateUnchanged !== true ||
    parsed.reporting?.freshConfirmed !== true ||
    parsed.reporting?.staleDetected !== true ||
    parsed.reporting?.failedRefreshPreservedLastConfirmed !== true ||
    parsed.partnerIsolation?.configuredPartnerCount !== 2 ||
    parsed.partnerIsolation?.separateChildTenantCount !== 2 ||
    parsed.partnerIsolation?.crossPartnerCampaignDenied !== true ||
    parsed.accountDeletion?.taskCount !== 16 ||
    parsed.accountDeletion?.suspended !== true ||
    parsed.accountDeletion?.executionEnabled !== false ||
    parsed.accountDeletion?.providerWritesEnabled !== false ||
    parsed.accountDeletion?.providerReceiptCount !== 0 ||
    parsed.accountDeletion?.hostedWorkerFailClosed !== true ||
    parsed.accountDeletion?.fullProviderOffboardingPerformed !== false ||
    parsed.externalProviderAcceptance?.meta !== "BLOCKED_CREDENTIAL_AND_PROVIDER_AUTHORITY" ||
    parsed.externalProviderAcceptance?.ghl !== "BLOCKED_CREDENTIAL_AND_PROVIDER_AUTHORITY" ||
    parsed.externalProviderAcceptance?.higgsfield !==
      "BLOCKED_CREDENTIAL_AND_PAID_PROVIDER_AUTHORITY" ||
    parsed.externalProviderAcceptance?.twilio !==
      "BLOCKED_CREDENTIAL_AND_COMMUNICATION_AUTHORITY" ||
    parsed.productionMutationPerformed !== false ||
    parsed.providerMutationPerformed !== false ||
    parsed.realCustomerDataAccessed !== false
  ) {
    throw new Error("Provider-independent staging proof returned an incomplete attestation");
  }
  return parsed;
}

function locateInstalledVercelCli() {
  const explicit = process.env.VERCEL_CLI_JS?.trim();
  const candidates = [];
  if (explicit) candidates.push(resolve(explicit));
  const npxRoot = join(process.env.HOME ?? "", ".npm", "_npx");
  if (existsSync(npxRoot)) {
    for (const entry of readdirSync(npxRoot)) {
      candidates.push(join(npxRoot, entry, "node_modules", "vercel", "dist", "index.js"));
    }
  }
  const installed = candidates
    .filter((path) => existsSync(path) && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink())
    .map((path) => {
      const packagePath = join(dirname(dirname(path)), "package.json");
      try {
        return { path, version: JSON.parse(readFileSync(packagePath, "utf8")).version };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) =>
      left.version.localeCompare(right.version, undefined, { numeric: true }),
    );
  const selected = installed.at(-1);
  if (!selected || Number.parseInt(selected.version.split(".")[0], 10) < 50) {
    throw new Error("A preinstalled Vercel CLI version 50 or newer is required; downloads are forbidden");
  }
  return Object.freeze({ ...selected, sha256: sha256(readFileSync(selected.path)) });
}

function vercelEnvironment() {
  const env = { ...childBaseEnvironment() };
  for (const name of ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

function listHostedEnvironmentNames(vercel) {
  const listed = run(
    EXECUTABLE,
    [vercel.path, "env", "list", "production", "--format=json", "--no-color"],
    {
      label: "list isolated Vercel staging environment names",
      env: vercelEnvironment(),
      timeoutMs: 3 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  const parsed = parseSingleJsonOutput(listed.stdout, "Vercel environment list");
  const records = Array.isArray(parsed)
    ? parsed
    : parsed?.envs ?? parsed?.environmentVariables ?? parsed?.variables;
  if (!Array.isArray(records)) {
    throw new Error("Vercel did not return a structured production environment inventory");
  }
  return [...new Set(records.map((record) => record.key ?? record.name).filter(Boolean))].sort();
}

function configureHostedStagingEnvironment(vercel, environment) {
  const expectedNames = Object.keys(environment).sort();
  const existingNames = listHostedEnvironmentNames(vercel);
  const unexpectedNames = existingNames.filter((name) => !expectedNames.includes(name));
  if (unexpectedNames.length > 0) {
    throw new Error(
      `The isolated staging project contains unapproved environment names: ${unexpectedNames.join(", ")}`,
    );
  }
  const protectedEnvironmentNames = new Set([
    ...HOSTED_SECRET_ENV_NAMES,
    "NEXT_PUBLIC_SUPABASE_URL",
    "QA_ISOLATED_SUPABASE_PROJECT_REF",
    "DEALFLOW_STAGING_VERCEL_PROJECT_ID",
  ]);
  const secrets = [
    ...protectedRuntimeValues(),
    ...Object.entries(environment)
      .filter(([name]) => protectedEnvironmentNames.has(name))
      .map(([, value]) => value),
  ];
  for (const name of expectedNames) {
    const value = environment[name];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Hosted staging environment input ${name} is missing`);
    }
    const args = [
      vercel.path,
      "env",
      "add",
      name,
      "production",
      "--force",
      "--yes",
      "--no-color",
    ];
    if (HOSTED_SECRET_ENV_NAMES.has(name)) args.push("--sensitive");
    run(EXECUTABLE, args, {
      label: `configure isolated staging environment ${name}`,
      env: vercelEnvironment(),
      input: `${value}\n`,
      timeoutMs: 3 * 60_000,
      secrets,
    });
  }
  const configuredNames = listHostedEnvironmentNames(vercel);
  if (JSON.stringify(configuredNames) !== JSON.stringify(expectedNames)) {
    throw new Error("The isolated Vercel staging environment inventory is not exact after provisioning");
  }
  return {
    target: "production_slot_of_isolated_staging_project",
    environmentVariableCount: configuredNames.length,
    environmentNameSetSha256: sha256(configuredNames.join("\n")),
    secretValuesPersistedToEvidence: false,
    providerCredentialNamesPresent: configuredNames.some((name) =>
      PROVIDER_SENSITIVE_ENV_NAMES.includes(name)),
  };
}

function fetchAuthoritativeVercelDeployment(vercel, deploymentId, label) {
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) {
    throw new Error(`${label} returned an invalid Vercel deployment id`);
  }
  const response = run(
    EXECUTABLE,
    [
      vercel.path,
      "api",
      `/v13/deployments/${deploymentId}`,
      "--raw",
      "--no-color",
    ],
    {
      label: `${label} authoritative Vercel deployment API read`,
      env: vercelEnvironment(),
      timeoutMs: 3 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  const deployment = parseSingleJsonOutput(
    response.stdout,
    `${label} authoritative Vercel deployment API read`,
  );
  if (deployment.id !== deploymentId) {
    throw new Error(`${label} authoritative Vercel deployment id does not match`);
  }
  return deployment;
}

function deployExactCommit(identity, vercel) {
  const args = [
    vercel.path,
    "deploy",
    "--prod",
    "--yes",
    "--force",
    "--meta", `dealflowCommit=${identity.commit}`,
    "--meta", `dealflowTree=${identity.tree}`,
    "--meta", "dealflowEnvironment=isolated-staging-qibh",
  ];
  const deployment = run(EXECUTABLE, args, {
    label: "deploy exact candidate to isolated Vercel staging project",
    env: vercelEnvironment(),
    timeoutMs: 20 * 60_000,
    secrets: protectedRuntimeValues(),
  });
  const urls = `${deployment.stdout}\n${deployment.stderr}`.match(/https:\/\/[a-z0-9-]+\.vercel\.app/gi) ?? [];
  const uniqueDeploymentUrl = [...new Set(urls)]
    .map((value) => new URL(value))
    .find((url) =>
      url.hostname !== EXPECTED_STAGING_HOST &&
      url.hostname.startsWith(`${EXPECTED_VERCEL_PROJECT_NAME}-`) &&
      url.hostname.endsWith(".vercel.app"),
    );
  if (!uniqueDeploymentUrl || PRODUCTION_OR_SHARED_HOSTS.has(uniqueDeploymentUrl.hostname)) {
    throw new Error("Vercel did not return a distinct isolated staging deployment URL");
  }
  const inspect = run(
    EXECUTABLE,
    [vercel.path, "inspect", uniqueDeploymentUrl.origin, "--format=json", "--no-color"],
    {
      label: "inspect isolated Vercel staging deployment",
      env: vercelEnvironment(),
      timeoutMs: 3 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  const inspected = parseSingleJsonOutput(inspect.stdout, "Vercel deployment inspection");
  const deploymentId = inspected.id ?? inspected.uid ?? null;
  const authoritative = fetchAuthoritativeVercelDeployment(
    vercel,
    deploymentId,
    "isolated staging deployment",
  );
  const projectId = authoritative.projectId ?? authoritative.project?.id;
  const metadata = authoritative.meta ?? authoritative.metadata ?? {};
  if (
    typeof deploymentId !== "string" ||
    deploymentId.length === 0 ||
    authoritative.url !== uniqueDeploymentUrl.hostname ||
    sha256(String(projectId)) !== EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT ||
    metadata.dealflowCommit !== identity.commit ||
    metadata.dealflowTree !== identity.tree ||
    metadata.dealflowEnvironment !== "isolated-staging-qibh"
  ) {
    throw new Error("The deployed Vercel artifact is not bound to the exact candidate identity");
  }
  return {
    deploymentId,
    deploymentUrl: uniqueDeploymentUrl.origin,
    deploymentHost: uniqueDeploymentUrl.hostname,
    stableUrl: EXPECTED_STAGING_BASE_URL,
    target: "isolated_staging_project_production_slot",
    exactCommit: identity.commit,
    exactTree: identity.tree,
    projectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
    cliVersion: vercel.version,
    cliSha256: vercel.sha256,
  };
}

function proveStableAliasTargetsExactDeployment(identity, deployment, vercel) {
  const inspect = run(
    EXECUTABLE,
    [vercel.path, "inspect", EXPECTED_STAGING_BASE_URL, "--format=json", "--no-color"],
    {
      label: "inspect stable isolated-staging alias",
      env: vercelEnvironment(),
      timeoutMs: 3 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  const inspected = parseSingleJsonOutput(inspect.stdout, "stable Vercel alias inspection");
  const deploymentId = inspected.id ?? inspected.uid ?? null;
  const authoritative = fetchAuthoritativeVercelDeployment(
    vercel,
    deploymentId,
    "stable isolated-staging alias",
  );
  const metadata = authoritative.meta ?? authoritative.metadata ?? {};
  const projectId = authoritative.projectId ?? authoritative.project?.id;
  if (
    deploymentId !== deployment.deploymentId ||
    authoritative.url !== deployment.deploymentHost ||
    sha256(String(projectId)) !== EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT ||
    metadata.dealflowCommit !== identity.commit ||
    metadata.dealflowTree !== identity.tree ||
    metadata.dealflowEnvironment !== "isolated-staging-qibh"
  ) {
    throw new Error("The stable isolated-staging alias does not target the exact candidate deployment");
  }
  return {
    deploymentId,
    stableHost: EXPECTED_STAGING_HOST,
    exactCommit: identity.commit,
    exactTree: identity.tree,
    projectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
  };
}

function configureAndProveSecondPartnerAlias(identity, deployment, vercel) {
  if (
    PRODUCTION_OR_SHARED_HOSTS.has(EXPECTED_SECOND_PARTNER_HOST) ||
    EXPECTED_SECOND_PARTNER_HOST === EXPECTED_STAGING_HOST
  ) {
    throw new Error("The second white-label staging alias is not isolated");
  }
  run(
    EXECUTABLE,
    [
      vercel.path,
      "alias",
      "set",
      deployment.deploymentHost,
      EXPECTED_SECOND_PARTNER_HOST,
      "--no-color",
    ],
    {
      label: "configure second isolated white-label staging alias",
      env: vercelEnvironment(),
      timeoutMs: 3 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  const inspect = run(
    EXECUTABLE,
    [vercel.path, "inspect", EXPECTED_SECOND_PARTNER_BASE_URL, "--format=json", "--no-color"],
    {
      label: "inspect second isolated white-label staging alias",
      env: vercelEnvironment(),
      timeoutMs: 3 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  const inspected = parseSingleJsonOutput(
    inspect.stdout,
    "second isolated white-label Vercel alias inspection",
  );
  const deploymentId = inspected.id ?? inspected.uid ?? null;
  const authoritative = fetchAuthoritativeVercelDeployment(
    vercel,
    deploymentId,
    "second isolated white-label staging alias",
  );
  const metadata = authoritative.meta ?? authoritative.metadata ?? {};
  const projectId = authoritative.projectId ?? authoritative.project?.id;
  if (
    deploymentId !== deployment.deploymentId ||
    authoritative.url !== deployment.deploymentHost ||
    sha256(String(projectId)) !== EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT ||
    metadata.dealflowCommit !== identity.commit ||
    metadata.dealflowTree !== identity.tree ||
    metadata.dealflowEnvironment !== "isolated-staging-qibh"
  ) {
    throw new Error("The second white-label staging alias does not target the exact candidate deployment");
  }
  return {
    deploymentId,
    aliasUrl: EXPECTED_SECOND_PARTNER_BASE_URL,
    aliasHost: EXPECTED_SECOND_PARTNER_HOST,
    exactCommit: identity.commit,
    exactTree: identity.tree,
    projectIdFingerprint: EXPECTED_VERCEL_PROJECT_ID_FINGERPRINT,
  };
}

async function waitForDeployment(url, timeoutMs = 180_000) {
  const startedAt = Date.now();
  let lastStatus = 0;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${url}/privacy`, {
        headers: { Accept: "text/html", "User-Agent": "DealFlow-Staging-Acceptance/1.0" },
        redirect: "manual",
      });
      lastStatus = response.status;
      await response.arrayBuffer();
      if (response.status >= 200 && response.status < 400) {
        return { status: response.status, elapsedMs: Date.now() - startedAt };
      }
    } catch {
      lastStatus = 0;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  throw new Error(`Staging deployment did not become ready; last status ${lastStatus}`);
}

async function assertHostedZeroEffects(baseUrl) {
  const secret = requiredEnvironment("INTERNAL_SYSTEM_JOBS_SECRET", 32);
  const response = await fetch(`${baseUrl}/api/internal/zero-external-effects`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (
    response.status !== 200 ||
    payload?.ok !== true ||
    payload?.attestation !== ZERO_EXTERNAL_EFFECTS_ATTESTATION ||
    !Array.isArray(payload?.failedControls) ||
    payload.failedControls.length !== 0 ||
    Number(payload.checkedControlCount) !== EXPECTED_ZERO_EXTERNAL_EFFECT_CONTROL_COUNT
  ) {
    throw new Error("Hosted staging did not prove the centralized zero-external-effects contract");
  }
  return {
    status: response.status,
    ok: payload.ok,
    attestation: payload.attestation,
    checkedControlCount: payload.checkedControlCount,
    failedControlCount: payload.failedControls.length,
  };
}

function createStagingAdminClient() {
  return createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY", 32),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function createSyntheticRlsSessions(admin) {
  const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY", 32);
  const password = requiredEnvironment("STAGING_QA_PASSWORD", 16);
  const createSession = async (email) => {
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await anon.auth.signInWithPassword({ email, password });
    if (signedIn.data.session?.access_token) return signedIn.data.session.access_token;
    if (!/captcha/i.test(signedIn.error?.message ?? "")) {
      throw new Error(`Unable to create synthetic RLS session for ${email}`);
    }
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link.data.properties?.hashed_token;
    if (link.error || !tokenHash) {
      throw new Error(`Unable to create CAPTCHA-safe synthetic RLS session for ${email}`);
    }
    const verified = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    if (verified.error || !verified.data.session?.access_token) {
      throw new Error(`Unable to verify CAPTCHA-safe synthetic RLS session for ${email}`);
    }
    return verified.data.session.access_token;
  };
  return {
    userA: await createSession(EXPECTED_QA_EMAIL),
    userB: await createSession(ATTACKER_EMAIL),
  };
}

async function captureNoEffectCounts(admin) {
  const scopes = [
    ["leads", "campaign_id", PAID_CAMPAIGN_ID],
    ["lead_messages", null, null],
    ["ghl_provider_outbox", null, null],
    ["support_notification_outbox", null, null],
    ["provider_usage_events", "organization_id", "d1000000-0000-4000-8000-000000000001"],
    ["system_jobs", "organization_id", "d1000000-0000-4000-8000-000000000001"],
  ];
  const counts = {};
  for (const [table, column, value] of scopes) {
    let query = admin.from(table).select("id", { count: "exact", head: true });
    if (column) query = query.eq(column, value);
    const result = await query;
    if (result.error || typeof result.count !== "number") {
      throw new Error(`Unable to capture staging no-effect count for ${table}`);
    }
    counts[table] = result.count;
  }
  return counts;
}

async function captureRlsFixtureResidue(admin) {
  const queries = {
    users: admin.from("users").select("id", { count: "exact", head: true }).like("email", "rls-fixture-%"),
    organizations: admin.from("organizations").select("id", { count: "exact", head: true }).like("slug", "rls-fixture-%"),
    campaigns: admin.from("campaign_plans").select("id", { count: "exact", head: true }).like("public_slug", "rls-fixture-%"),
    leads: admin.from("leads").select("id", { count: "exact", head: true }).eq("source", "rls_fixture"),
    jobs: admin.from("system_jobs").select("id", { count: "exact", head: true }).eq("kind", "rls_fixture"),
    providerEvents: admin.from("provider_usage_events").select("id", { count: "exact", head: true }).eq("provider", "fixture").like("operation", "rls-%"),
  };
  const counts = {};
  for (const [name, query] of Object.entries(queries)) {
    const result = await query;
    if (result.error || typeof result.count !== "number") {
      throw new Error(`Unable to verify RLS fixture cleanup for ${name}`);
    }
    counts[name] = result.count;
  }
  const authData = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (authData.error) throw new Error("Unable to verify RLS auth fixture cleanup");
  counts.authUsers = authData.data.users.filter((user) =>
    user.email?.toLowerCase().startsWith("rls-fixture-"),
  ).length;
  return {
    counts,
    exactZeroResidue: Object.values(counts).every((count) => count === 0),
  };
}

function countPlaywrightOutcomes(value) {
  const counts = { tests: 0, passed: 0, failed: 0, skipped: 0, interrupted: 0 };
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (Array.isArray(node.tests)) {
      for (const testCase of node.tests) {
        counts.tests += 1;
        if (testCase.expectedStatus === "skipped") counts.skipped += 1;
        const results = Array.isArray(testCase.results) ? testCase.results : [];
        const last = results.at(-1);
        if (last?.status === "passed") counts.passed += 1;
        else if (last?.status === "skipped") counts.skipped += 1;
        else if (last?.status === "interrupted") counts.interrupted += 1;
        else counts.failed += 1;
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== "tests") visit(child);
    }
  };
  visit(value);
  return counts;
}

function runPlaywrightSuite({ name, config, environment, evidenceDir }) {
  const outputDir = join(evidenceDir, name);
  mkdirSync(outputDir, { mode: 0o700 });
  const binary = join(EXPECTED_REPO, "node_modules", ".bin", "playwright");
  const result = run(binary, ["test", `--config=${config}`, "--reporter=json"], {
    label: `${name} zero-skip Playwright suite`,
    env: { ...childBaseEnvironment(), ...environment },
    timeoutMs: 30 * 60_000,
    maxBuffer: 256 * 1024 * 1024,
    secrets: [
      process.env.STAGING_QA_PASSWORD,
      process.env.INTERNAL_SYSTEM_JOBS_SECRET,
      process.env.PARTNER_ATTRIBUTION_SIGNING_SECRET,
    ],
  });
  const parsed = parseSingleJsonOutput(result.stdout, `${name} Playwright JSON`);
  const counts = countPlaywrightOutcomes(parsed);
  if (
    counts.tests === 0 ||
    counts.failed !== 0 ||
    counts.skipped !== 0 ||
    counts.interrupted !== 0 ||
    counts.passed !== counts.tests
  ) {
    throw new Error(`${name} did not finish with every browser test passed and zero skipped`);
  }
  writeJson(join(outputDir, "results.json"), parsed);
  return counts;
}

function browserEnvironment(deploymentUrl, secondPartnerUrl, evidenceDir) {
  return {
    CI: "1",
    DEALFLOW_DEPLOYMENT_TARGET: "staging",
    SAFE_E2E_BASE_URL: EXPECTED_STAGING_BASE_URL,
    SAFE_E2E_QA_AUTH: "true",
    SAFE_E2E_ZERO_EXTERNAL_EFFECTS_ATTESTATION: ZERO_EXTERNAL_EFFECTS_ATTESTATION,
    SAFE_E2E_INTERNAL_SECRET: process.env.INTERNAL_SYSTEM_JOBS_SECRET,
    SAFE_E2E_OUTPUT_DIR: join(evidenceDir, "safe-product-browser-artifacts"),
    QA_AUTH_HARNESS_ENABLED: "true",
    QA_ISOLATED_SUPABASE_PROJECT_REF: process.env.QA_ISOLATED_SUPABASE_PROJECT_REF,
    QA_EMAIL: EXPECTED_QA_EMAIL,
    STAGING_QA_PASSWORD: process.env.STAGING_QA_PASSWORD,
    PARTNER_ATTRIBUTION_SIGNING_SECRET: process.env.PARTNER_ATTRIBUTION_SIGNING_SECRET,
    INTERNAL_ADMIN_EMAILS: process.env.INTERNAL_ADMIN_EMAILS,
    STAGING_ACCEPTANCE_EXECUTION: "true",
    STAGING_ACCEPTANCE_BASE_URL: EXPECTED_STAGING_BASE_URL,
    STAGING_ACCEPTANCE_PARTNER_BASE_URL: deploymentUrl,
    STAGING_ACCEPTANCE_SECOND_PARTNER_BASE_URL: secondPartnerUrl,
    STAGING_ACCEPTANCE_INTERNAL_SECRET: process.env.INTERNAL_SYSTEM_JOBS_SECRET,
    STAGING_ACCEPTANCE_ZERO_EXTERNAL_EFFECTS_ATTESTATION: ZERO_EXTERNAL_EFFECTS_ATTESTATION,
    STAGING_ACCEPTANCE_PLAYWRIGHT_OUTPUT_DIR: join(evidenceDir, "multi-role-browser-artifacts"),
  };
}

function percentile(values, percent) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1)] ?? 0;
}

async function runBoundedPool(items, concurrency, worker) {
  let index = 0;
  const results = [];
  async function runner() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await worker(current));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return results;
}

async function timedFetch(url, init, expectedHeaders = {}, acceptedStatuses = [200]) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, init);
    await response.arrayBuffer();
    const headersMatch = Object.entries(expectedHeaders)
      .every(([name, value]) => response.headers.get(name) === value);
    return {
      ok: acceptedStatuses.includes(response.status) && headersMatch,
      status: response.status,
      durationMs: performance.now() - startedAt,
      headersMatch,
    };
  } catch {
    return { ok: false, status: 0, durationMs: performance.now() - startedAt, headersMatch: false };
  }
}

function summarizeLoad(name, results, maxP95Ms) {
  const failures = results.filter((result) => !result.ok);
  const latencies = results.map((result) => result.durationMs);
  const p95Ms = Math.round(percentile(latencies, 95));
  if (failures.length > 0 || p95Ms > maxP95Ms) {
    throw new Error(`${name} hosted load proof failed its zero-error or p95 threshold`);
  }
  return {
    scenario: name,
    requests: results.length,
    failures: failures.length,
    errorRate: 0,
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms,
    p99Ms: Math.round(percentile(latencies, 99)),
    maxMs: Math.round(Math.max(...latencies)),
    maxP95Ms,
    statuses: Object.fromEntries(
      [...new Set(results.map((result) => result.status))]
        .sort((left, right) => left - right)
        .map((status) => [status, results.filter((result) => result.status === status).length]),
    ),
  };
}

async function runHostedLoadProof(baseUrl) {
  await assertHostedZeroEffects(baseUrl);
  const routePaths = ["/privacy", "/terms", `/f/${PUBLIC_FUNNEL_SLUG}`];
  const routeItems = Array.from({ length: 160 }, (_, index) => routePaths[index % routePaths.length]);
  const routeResults = await runBoundedPool(routeItems, 12, (path) =>
    timedFetch(`${baseUrl}${path}`, {
      headers: { Accept: "text/html", "User-Agent": "DealFlow-Staging-Load/1.0" },
    }),
  );
  const controlItems = Array.from({ length: 40 });
  const controlResults = await runBoundedPool(controlItems, 6, () =>
    timedFetch(
      `${baseUrl}/api/internal/zero-external-effects`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${requiredEnvironment("INTERNAL_SYSTEM_JOBS_SECRET", 32)}`,
          "User-Agent": "DealFlow-Staging-Load/1.0",
        },
      },
      {
        "x-robots-tag": "noindex",
      },
    ),
  );
  return {
    routes: summarizeLoad("hosted_public_routes", routeResults, 5_000),
    zeroExternalEffectsControl: summarizeLoad(
      "hosted_zero_external_effects_read_only_control",
      controlResults,
      5_000,
    ),
    methods: ["GET"],
    leadCapturePostAttempted: false,
  };
}

function enforcePrivateModes(root) {
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Evidence contains a symlink: ${path}`);
    if (stat.isDirectory()) {
      chmodSync(path, 0o700);
      for (const name of readdirSync(path)) visit(join(path, name));
    } else if (stat.isFile()) {
      chmodSync(path, 0o600);
    } else {
      throw new Error(`Evidence contains an unsupported file type: ${path}`);
    }
  };
  visit(root);
}

function listEvidenceFiles(root) {
  const files = [];
  const visit = (path) => {
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      const stat = lstatSync(child);
      if (stat.isSymbolicLink()) throw new Error("Evidence bundle may not contain symlinks");
      if (stat.isDirectory()) visit(child);
      else if (stat.isFile()) files.push(relative(root, child));
      else throw new Error("Evidence bundle contains an unsupported file type");
    }
  };
  visit(root);
  return files.sort();
}

function assertEvidenceSanitized(evidenceDir, secrets) {
  const exactForbiddenValues = [...new Set(secrets.filter((value) => value?.length >= 4))];
  const probableSecretPatterns = [
    /Bearer\s+[A-Za-z0-9._~+/-]{12,}/i,
    /(?:postgres|postgresql):\/\/[^\s"']+/i,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/i,
  ];
  let scannedFileCount = 0;
  for (const path of listEvidenceFiles(evidenceDir)) {
    const contents = readFileSync(join(evidenceDir, path));
    scannedFileCount += 1;
    for (const value of exactForbiddenValues) {
      if (contents.includes(Buffer.from(value))) {
        throw new Error(`Evidence sanitization rejected an exact protected value in ${path}`);
      }
    }
    if (!contents.includes(0)) {
      const text = contents.toString("utf8");
      if (probableSecretPatterns.some((pattern) => pattern.test(text))) {
        throw new Error(`Evidence sanitization rejected a probable credential in ${path}`);
      }
    }
  }
  return { scannedFileCount, exactProtectedValueCount: exactForbiddenValues.length };
}

function sealEvidenceBundle(evidenceDir, summary, secrets) {
  enforcePrivateModes(evidenceDir);
  const sanitization = assertEvidenceSanitized(evidenceDir, secrets);
  const preManifestFiles = listEvidenceFiles(evidenceDir)
    .filter((path) => !["evidence-manifest.json", "SHA256SUMS"].includes(path));
  const records = preManifestFiles.map((path) => {
    const contents = readFileSync(join(evidenceDir, path));
    return { path, bytes: contents.length, sha256: sha256(contents) };
  });
  writeJson(join(evidenceDir, "evidence-manifest.json"), {
    schemaVersion: "dealflow.isolated-staging-acceptance-manifest.v1",
    status: summary.status,
    containsSecrets: false,
    containsRealCustomerData: false,
    productionMutationPerformed: false,
    providerMutationPerformed: false,
    advertisingSpendIncurred: false,
    realCommunicationSent: false,
    sanitization,
    files: records,
  });
  const checksumFiles = listEvidenceFiles(evidenceDir).filter((path) => path !== "SHA256SUMS");
  const lines = checksumFiles.map((path) => `${sha256(readFileSync(join(evidenceDir, path)))}  ${path}`);
  writeFileSync(join(evidenceDir, "SHA256SUMS"), `${lines.join("\n")}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  enforcePrivateModes(evidenceDir);
  return {
    fileCount: listEvidenceFiles(evidenceDir).length,
    checksumCount: checksumFiles.length,
    sha256sumsSha256: sha256(readFileSync(join(evidenceDir, "SHA256SUMS"))),
  };
}

async function main() {
  failureContext.stage = "authorization_gate";
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const migrationModeCount =
    Number(options.applyMigrations) +
    Number(options.applyForwardMigration) +
    Number(options.verifyExistingMigrations);
  if (!options.execute || !options.deploy || migrationModeCount !== 1) {
    throw new Error(
      "No remote work was authorized: --execute, --deploy, and exactly one migration mode are required",
    );
  }
  if (!options.evidenceDir || !options.roundOne || !options.roundTwo) {
    throw new Error("Evidence directory and both exact final-verification summaries are required");
  }
  if (
    (options.verifyExistingMigrations || options.applyForwardMigration) !==
      Boolean(options.priorMigrationProofDir)
  ) {
    throw new Error(
      "Read-only resume and exact forward mode require --prior-migration-proof-dir; fresh apply forbids it",
    );
  }

  failureContext.stage = "candidate_preflight";
  const identity = captureExactReleaseIdentity();
  failureContext.identity = identity;
  const migrations = captureMigrationPortfolio();
  const vercelAuthority = captureVercelProjectIdentity();
  const vercelProject = vercelAuthority.evidence;
  const execution = assertFailClosedExecutionEnvironment();
  const hostedEnvironment = hostedStagingEnvironment(
    execution.projectRef,
    vercelAuthority.projectId,
  );
  const hostedEnvironmentNames = Object.keys(hostedEnvironment).sort();
  const vercel = locateInstalledVercelCli();
  const roundOne = readValidatedRound(
    options.roundOne,
    identity,
    migrations,
    "1",
    "round one summary",
  );
  const roundTwo = readValidatedRound(
    options.roundTwo,
    identity,
    migrations,
    "2",
    "round two summary",
  );
  if (roundOne.pathFingerprint === roundTwo.pathFingerprint || roundOne.sha256 === roundTwo.sha256) {
    throw new Error("Two distinct exact final-verification rounds are required");
  }
  prepareEvidenceDirectory(options.evidenceDir);
  failureContext.evidenceDir = options.evidenceDir;
  failureContext.stage = "preflight_evidence";

  const preflight = {
    schemaVersion: "dealflow.isolated-staging-acceptance-preflight.v1",
    status: "PASS",
    identity,
    migrations,
    vercelProject,
    supabaseProjectFingerprint: sha256(execution.projectRef),
    supabaseSafeSuffix: execution.projectRef.slice(-4),
    stableStagingHost: EXPECTED_STAGING_HOST,
    directAndPartnerHostsMustBeDistinct: true,
    hostedEnvironmentVariableCount: hostedEnvironmentNames.length,
    hostedEnvironmentNameSetSha256: sha256(hostedEnvironmentNames.join("\n")),
    hostedEnvironmentValuesPersistedToEvidence: false,
    roundOne,
    roundTwo,
    executionFlags: {
      execute: options.execute,
      applyMigrations: options.applyMigrations,
      applyForwardMigration: options.applyForwardMigration,
      verifyExistingMigrations: options.verifyExistingMigrations,
      deploy: options.deploy,
    },
    safety: {
      productionOrSharedTargetAccepted: false,
      realCustomerDataAccepted: false,
      providerCredentialsPresent: false,
      providerWritesEnabled: false,
      advertisingSpendAuthorized: false,
      realCommunicationsAuthorized: false,
    },
  };
  writeJson(join(options.evidenceDir, "preflight.json"), preflight);

  failureContext.stage = "hosted_environment_configuration";
  const hostedEnvironmentProof = configureHostedStagingEnvironment(vercel, hostedEnvironment);
  if (hostedEnvironmentProof.providerCredentialNamesPresent) {
    throw new Error("Provider credentials are forbidden from isolated staging acceptance");
  }
  writeJson(join(options.evidenceDir, "staging-environment.json"), {
    status: "PASS",
    ...hostedEnvironmentProof,
  });

  failureContext.stage = "migration_application_or_verification";
  const migrationEvidenceDir = join(options.evidenceDir, "migration-proof");
  const migrationBrokerArgs = [
    join(EXPECTED_REPO, "scripts", "staging", "apply-fresh-staging-migrations.mjs"),
    EXPECTED_REPO,
    migrationEvidenceDir,
    options.roundOne,
    options.roundTwo,
  ];
  if (options.verifyExistingMigrations) {
    migrationBrokerArgs.push(
      "--verify-existing-exact",
      options.priorMigrationProofDir,
    );
  } else if (options.applyForwardMigration) {
    migrationBrokerArgs.push(
      "--apply-forward-exact",
      options.priorMigrationProofDir,
    );
  }
  run(
    EXECUTABLE,
    migrationBrokerArgs,
    {
      label: options.verifyExistingMigrations
        ? "read-only exact existing isolated-staging migration verifier"
        : options.applyForwardMigration
          ? "exact forward-only isolated-staging migration broker"
          : "atomic fresh isolated-staging migration broker",
      env: {
        ...childBaseEnvironment(),
        PATH: process.env.PATH,
        DEALFLOW_NATIVE_PGBIN: process.env.DEALFLOW_NATIVE_PGBIN,
      },
      timeoutMs: 30 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  const migrationSummary = JSON.parse(
    readFileSync(join(migrationEvidenceDir, "staging-migration-summary.json"), "utf8"),
  );
  let priorApplicationRetainedHistory = false;
  if (options.verifyExistingMigrations || options.applyForwardMigration) {
    const priorCommit = migrationSummary.priorApplication?.applicationCommit;
    const priorTree = migrationSummary.priorApplication?.applicationTree;
    if (/^[a-f0-9]{40}$/.test(priorCommit ?? "") && /^[a-f0-9]{40}$/.test(priorTree ?? "")) {
      const retainedTree = git(
        ["rev-parse", "--verify", `${priorCommit}^{tree}`],
        "verify retained prior migration application tree",
      ).trim();
      if (retainedTree === priorTree) {
        git(
          ["merge-base", "--is-ancestor", priorCommit, identity.commit],
          "verify prior migration application ancestry",
        );
        priorApplicationRetainedHistory = true;
      }
    }
  }
  const freshAtomicApplication =
    options.applyMigrations &&
    migrationSummary.migrationMode == null &&
    migrationSummary.remoteMutationStarted === true &&
    migrationSummary.remoteMutationCompleted === true &&
    migrationSummary.remoteStateVerificationStatus === "EXACT_COMMITTED_PORTFOLIO";
  const exactCurrentResumePriorIdentity = isExactCurrentResumeIdentity({
    priorApplication: migrationSummary.priorApplication,
    expectedMigrationCount: EXPECTED_MIGRATION_COUNT,
    expectedFinalVersion: EXPECTED_FINAL_MIGRATION.slice(0, 14),
    expectedMigrationPortfolioSha256: migrations.migrationPortfolioSha256,
    expectedMigrationFiles: migrations.migrationFiles,
    expectedNormalizedSchemaSha256: migrationSummary.normalizedSchemaSha256,
  });
  const verifiedExistingExact =
    options.verifyExistingMigrations &&
    migrationSummary.migrationMode === "VERIFY_EXISTING_EXACT" &&
    migrationSummary.verificationReadOnly === true &&
    migrationSummary.remoteMutationStarted === false &&
    migrationSummary.remoteMutationCompleted === false &&
    migrationSummary.portfolioApplicationRemoteMutationCompleted === true &&
    migrationSummary.remoteStateVerificationStatus ===
      "EXACT_EXISTING_COMMITTED_PORTFOLIO" &&
    priorApplicationRetainedHistory &&
    exactCurrentResumePriorIdentity;
  const exactForwardApplication =
    options.applyForwardMigration &&
    migrationSummary.migrationMode === "APPLY_FORWARD_EXACT" &&
    migrationSummary.forwardOnly === true &&
    migrationSummary.priorMigrationCount === 102 &&
    migrationSummary.forwardMigrationCount === 1 &&
    migrationSummary.forwardMigration?.file === EXPECTED_FINAL_MIGRATION &&
    migrationSummary.forwardMigration?.version === EXPECTED_FINAL_MIGRATION.slice(0, 14) &&
    /^[a-f0-9]{64}$/.test(migrationSummary.forwardMigration?.sha256 ?? "") &&
    migrationSummary.remoteMutationStarted === true &&
    migrationSummary.remoteMutationCompleted === true &&
    migrationSummary.portfolioApplicationRemoteMutationCompleted === true &&
    migrationSummary.serviceRoleRetentionConfigurationSelectOnly === true &&
    migrationSummary.remoteStateVerificationStatus ===
      "EXACT_FORWARD_COMMITTED_PORTFOLIO" &&
    priorApplicationRetainedHistory &&
    migrationSummary.priorApplication?.remoteMutationCompleted === true &&
    migrationSummary.priorApplication?.applicationCommit ===
      EXPECTED_PRIOR_MIGRATION_APPLICATION_COMMIT &&
    migrationSummary.priorApplication?.applicationTree ===
      EXPECTED_PRIOR_MIGRATION_APPLICATION_TREE &&
    migrationSummary.priorApplication?.manifestSha256 ===
      EXPECTED_PRIOR_MIGRATION_MANIFEST_SHA256 &&
    migrationSummary.priorApplication?.migrationCount === 102 &&
    migrationSummary.priorApplication?.lastCommittedVersion === "20260713027000" &&
    migrationSummary.priorApplication?.migrationPortfolioSha256 ===
      EXPECTED_PRIOR_MIGRATION_PORTFOLIO_SHA256 &&
    Array.isArray(migrationSummary.priorApplication?.migrationFiles) &&
    migrationSummary.priorApplication.migrationFiles.length === 102;
  if (
    migrationSummary.status !== "PASS" ||
    (!freshAtomicApplication && !verifiedExistingExact && !exactForwardApplication) ||
    migrationSummary.singleOuterTransaction !== true ||
    migrationSummary.migrationHistoryReceiptsInsideOuterTransaction !== true ||
    ![
      "EXACT_COMMITTED_PORTFOLIO",
      "EXACT_EXISTING_COMMITTED_PORTFOLIO",
      "EXACT_FORWARD_COMMITTED_PORTFOLIO",
    ].includes(migrationSummary.remoteStateVerificationStatus) ||
    migrationSummary.migrationCount !== EXPECTED_MIGRATION_COUNT ||
    migrationSummary.migrationHistoryCount !== EXPECTED_MIGRATION_COUNT ||
    migrationSummary.lastCommittedVersion !== EXPECTED_FINAL_MIGRATION.slice(0, 14) ||
    migrationSummary.releaseBranch !== identity.branch ||
    migrationSummary.headCommit !== identity.commit ||
    migrationSummary.headTree !== identity.tree ||
    migrationSummary.projectFingerprint !== EXPECTED_SUPABASE_FINGERPRINT ||
    migrationSummary.safeSuffix !== EXPECTED_SUPABASE_SAFE_SUFFIX ||
    migrationSummary.serviceRoleRetentionConfigurationSelectOnly !== true ||
    migrationSummary.serviceRoleColumnWritePrivilegesPresent !== false ||
    migrationSummary.anonPrivilegesPresent !== false ||
    migrationSummary.anonColumnPrivilegesPresent !== false ||
    migrationSummary.authenticatedPrivilegesPresent !== false ||
    migrationSummary.authenticatedColumnPrivilegesPresent !== false ||
    migrationSummary.publicAclPresent !== false ||
    migrationSummary.publicColumnAclPresent !== false ||
    migrationSummary.migrationPortfolioSha256 !== migrations.migrationPortfolioSha256
  ) {
    throw new Error(
      `The remote migration broker did not bind the exact candidate and all ${EXPECTED_MIGRATION_COUNT} migrations`,
    );
  }

  failureContext.stage = "synthetic_retention_owner_authority";
  const retentionAuthorityEvidenceDir = join(
    options.evidenceDir,
    "retention-authority",
  );
  run(
    EXECUTABLE,
    [
      join(
        EXPECTED_REPO,
        "scripts",
        "staging",
        "install-synthetic-retention-authority.mjs",
      ),
      EXPECTED_REPO,
      retentionAuthorityEvidenceDir,
      options.roundOne,
      options.roundTwo,
    ],
    {
      label: "exact owner-authority synthetic retention installer",
      env: {
        ...childBaseEnvironment(),
        PATH: process.env.PATH,
        DEALFLOW_NATIVE_PGBIN: process.env.DEALFLOW_NATIVE_PGBIN,
      },
      timeoutMs: 10 * 60_000,
      secrets: protectedRuntimeValues(),
    },
  );
  const retentionAuthoritySummaryPath = join(
    retentionAuthorityEvidenceDir,
    "retention-authority-summary.json",
  );
  const retentionAuthorityDirectoryStat = lstatSync(retentionAuthorityEvidenceDir);
  const retentionAuthorityArtifactNames = readdirSync(retentionAuthorityEvidenceDir).sort();
  if (
    retentionAuthorityDirectoryStat.isSymbolicLink() ||
    !retentionAuthorityDirectoryStat.isDirectory() ||
    (retentionAuthorityDirectoryStat.mode & 0o077) !== 0 ||
    JSON.stringify(retentionAuthorityArtifactNames) !==
      JSON.stringify(["SHA256SUMS", "retention-authority-summary.json"])
  ) {
    throw new Error("Synthetic retention authority evidence directory is not the exact sealed set");
  }
  const retentionAuthoritySummaryStat = lstatSync(retentionAuthoritySummaryPath);
  const retentionAuthorityChecksumsPath = join(
    retentionAuthorityEvidenceDir,
    "SHA256SUMS",
  );
  const retentionAuthorityChecksumsStat = lstatSync(retentionAuthorityChecksumsPath);
  if (
    retentionAuthoritySummaryStat.isSymbolicLink() ||
    !retentionAuthoritySummaryStat.isFile() ||
    (retentionAuthoritySummaryStat.mode & 0o077) !== 0 ||
    retentionAuthorityChecksumsStat.isSymbolicLink() ||
    !retentionAuthorityChecksumsStat.isFile() ||
    (retentionAuthorityChecksumsStat.mode & 0o077) !== 0
  ) {
    throw new Error("Synthetic retention authority artifacts must be real owner-only files");
  }
  const retentionAuthoritySummaryBytes = readFileSync(retentionAuthoritySummaryPath);
  const expectedRetentionChecksum =
    `${sha256(retentionAuthoritySummaryBytes)}  retention-authority-summary.json\n`;
  if (readFileSync(retentionAuthorityChecksumsPath, "utf8") !== expectedRetentionChecksum) {
    throw new Error("Synthetic retention authority evidence checksum did not verify");
  }
  const retentionAuthoritySummary = JSON.parse(
    retentionAuthoritySummaryBytes.toString("utf8"),
  );
  const retentionAuthorityMode = retentionAuthoritySummary.installationMode;
  const truthfulRetentionMutationState =
    (retentionAuthorityMode === "pending_only_installed" &&
      retentionAuthoritySummary.remoteMutationStarted === true &&
      retentionAuthoritySummary.remoteMutationCompleted === true &&
      retentionAuthoritySummary.remoteMutationOutcome ===
        "exact_pending_only_install_committed") ||
    (retentionAuthorityMode === "exact_approved_policy_recovered" &&
      retentionAuthoritySummary.remoteMutationStarted === true &&
      retentionAuthoritySummary.remoteMutationCompleted === true &&
      retentionAuthoritySummary.remoteMutationOutcome ===
        "exact_approved_policy_recovery_committed") ||
    (retentionAuthorityMode === "exact_existing_reused" &&
      retentionAuthoritySummary.remoteMutationStarted === false &&
      retentionAuthoritySummary.remoteMutationCompleted === false &&
      retentionAuthoritySummary.remoteMutationOutcome ===
        "exact_existing_reused_without_mutation");
  const verificationRoundEvidence = retentionAuthoritySummary.verificationRoundEvidence;
  const exactVerificationRoundEvidence =
    Array.isArray(verificationRoundEvidence) &&
    verificationRoundEvidence.length === 2 &&
    verificationRoundEvidence.every(
      (record) =>
        Number.isSafeInteger(record?.fileCount) &&
        record.fileCount > 0 &&
        /^[a-f0-9]{64}$/.test(record.evidenceSha256 ?? "") &&
        /^[a-f0-9]{64}$/.test(record.summarySha256 ?? ""),
    ) &&
    new Set(verificationRoundEvidence.map((record) => record.evidenceSha256)).size === 2 &&
    new Set(verificationRoundEvidence.map((record) => record.summarySha256)).size === 2;
  if (
    retentionAuthoritySummary.schemaVersion !==
      "dealflow.synthetic-retention-authority.v1" ||
    retentionAuthoritySummary.status !== "PASS" ||
    retentionAuthoritySummary.authorityRole !== "postgres" ||
    retentionAuthoritySummary.ownerAuthorityVerified !== true ||
    JSON.stringify(retentionAuthoritySummary.approvedPolicy) !==
      JSON.stringify(EXPECTED_SYNTHETIC_RETENTION_POLICY) ||
    retentionAuthoritySummary.tlsServerAuthentication?.mode !== "verify-full" ||
    retentionAuthoritySummary.tlsServerAuthentication?.trustBundlePath !==
      EXPECTED_DATABASE_TRUST_BUNDLE_PATH ||
    retentionAuthoritySummary.tlsServerAuthentication?.trustBundleSha256 !==
      EXPECTED_DATABASE_TRUST_BUNDLE_SHA256 ||
    retentionAuthoritySummary.projectFingerprint !== EXPECTED_SUPABASE_FINGERPRINT ||
    retentionAuthoritySummary.safeSuffix !== EXPECTED_SUPABASE_SAFE_SUFFIX ||
    retentionAuthoritySummary.releaseBranch !== identity.branch ||
    retentionAuthoritySummary.headCommit !== identity.commit ||
    retentionAuthoritySummary.headTree !== identity.tree ||
    retentionAuthoritySummary.migrationCount !== EXPECTED_MIGRATION_COUNT ||
    retentionAuthoritySummary.migrationPortfolioSha256 !==
      migrations.migrationPortfolioSha256 ||
    retentionAuthoritySummary.serviceRoleSelectOnly !== true ||
    retentionAuthoritySummary.serviceRoleColumnWritePrivilegesPresent !== false ||
    retentionAuthoritySummary.anonPrivilegesPresent !== false ||
    retentionAuthoritySummary.authenticatedPrivilegesPresent !== false ||
    retentionAuthoritySummary.publicAclPresent !== false ||
    retentionAuthoritySummary.publicColumnAclPresent !== false ||
    retentionAuthoritySummary.relationOwner !== "postgres" ||
    retentionAuthoritySummary.ownerUpdatePrivilege !== true ||
    retentionAuthoritySummary.exactSyntheticMarker !== true ||
    !exactVerificationRoundEvidence ||
    !truthfulRetentionMutationState ||
    retentionAuthoritySummary.productionMutationPerformed !== false ||
    retentionAuthoritySummary.providerActionPerformed !== false ||
    retentionAuthoritySummary.customerDataAccessed !== false ||
    retentionAuthoritySummary.realCustomerDataAccessed !== false ||
    retentionAuthoritySummary.communicationSent !== false ||
    retentionAuthoritySummary.spendIncurred !== false
  ) {
    throw new Error(
      "The owner-authority retention installer did not prove the exact synthetic staging authority contract",
    );
  }

  failureContext.stage = "staging_deployment";
  const deployment = deployExactCommit(identity, vercel);
  const uniqueReady = await waitForDeployment(deployment.deploymentUrl);
  const stableReady = await waitForDeployment(EXPECTED_STAGING_BASE_URL);
  const stableAlias = proveStableAliasTargetsExactDeployment(identity, deployment, vercel);
  const secondPartnerAlias = configureAndProveSecondPartnerAlias(identity, deployment, vercel);
  const secondPartnerReady = await waitForDeployment(secondPartnerAlias.aliasUrl);
  writeJson(join(options.evidenceDir, "deployment.json"), {
    ...deployment,
    uniqueReady,
    stableReady,
    stableAlias,
    secondPartnerAlias,
    secondPartnerReady,
    productionCustomerHost: false,
    isolatedStagingProject: true,
  });

  failureContext.stage = "synthetic_staging_seed";
  const seedOne = runSeed(deployment.deploymentUrl, secondPartnerAlias.aliasUrl);
  const seedTwo = runSeed(deployment.deploymentUrl, secondPartnerAlias.aliasUrl);
  const retentionAuthorityReplayMode = assertSeedReplayIsIdempotent(seedOne, seedTwo);
  writeJson(join(options.evidenceDir, "synthetic-seed.json"), {
    status: "PASS",
    first: seedOne,
    replay: seedTwo,
    exactlyIdempotent: true,
    retentionAuthorityReplayMode,
    containsRealCustomerData: false,
    providerCredentialPresent: false,
    providerMutationPerformed: false,
  });

  failureContext.stage = "provider_independent_acceptance";
  const admin = createStagingAdminClient();
  const rlsSessions = await createSyntheticRlsSessions(admin);
  const rlsCrossTenantProof = runCapturedProofCommand(
    join(dirname(EXECUTABLE), "npm"),
    ["run", "rls:cross-tenant"],
    "authenticated isolated-staging exact cross-tenant proof",
    {
      RLS_USER_A_JWT: rlsSessions.userA,
      RLS_USER_B_JWT: rlsSessions.userB,
      RLS_ORG_A_ID: PAID_ORGANIZATION_ID,
      RLS_ORG_B_ID: ATTACKER_ORGANIZATION_ID,
    },
  );
  const rlsFixtureProof = runCapturedProofCommand(
    join(dirname(EXECUTABLE), "npm"),
    ["run", "rls:fixture-smoke"],
    "authenticated isolated-staging RLS fixture and cross-tenant proof",
  );
  const rlsFixtureResidue = await captureRlsFixtureResidue(admin);
  const rlsDeferralsClosed =
    rlsCrossTenantProof.status === "PASS" &&
    rlsFixtureProof.status === "PASS" &&
    rlsFixtureResidue.exactZeroResidue;
  writeJson(join(options.evidenceDir, "authenticated-rls-proof.json"), {
    status: rlsDeferralsClosed ? "PASS" : "FAIL",
    commands: ["npm run rls:cross-tenant", "npm run rls:fixture-smoke"],
    closesHostedDeferrals: ["npm run rls:cross-tenant", "npm run rls:fixture-smoke"],
    crossTenantProof: rlsCrossTenantProof,
    fixtureProof: rlsFixtureProof,
    cleanup: rlsFixtureResidue,
    productionDataAccessed: false,
    syntheticFixtureMutationsOnly: true,
  });

  const zeroEffectsStable = await assertHostedZeroEffects(EXPECTED_STAGING_BASE_URL);
  const zeroEffectsPartner = await assertHostedZeroEffects(deployment.deploymentUrl);
  const zeroEffectsPartnerTwo = await assertHostedZeroEffects(secondPartnerAlias.aliasUrl);
  writeJson(join(options.evidenceDir, "hosted-zero-external-effects.json"), {
    status: "PASS",
    stableDirectHost: zeroEffectsStable,
    uniquePartnerHost: zeroEffectsPartner,
    secondPartnerHost: zeroEffectsPartnerTwo,
  });

  const providerIndependentProof = runProviderIndependentStagingProof(
    EXPECTED_STAGING_BASE_URL,
  );
  writeJson(join(options.evidenceDir, "provider-independent-journeys.json"), {
    ...providerIndependentProof,
    containsRealCustomerData: false,
    productionMutationPerformed: false,
    providerMutationPerformed: false,
  });

  const countsBefore = await captureNoEffectCounts(admin);
  const browserEnv = browserEnvironment(
    deployment.deploymentUrl,
    secondPartnerAlias.aliasUrl,
    options.evidenceDir,
  );
  const safeProductBrowser = runPlaywrightSuite({
    name: "safe-product-browser",
    config: "playwright.safe.config.ts",
    environment: browserEnv,
    evidenceDir: options.evidenceDir,
  });
  const multiRoleBrowser = runPlaywrightSuite({
    name: "multi-role-browser",
    config: "playwright.staging.config.ts",
    environment: browserEnv,
    evidenceDir: options.evidenceDir,
  });
  writeJson(join(options.evidenceDir, "browser-summary.json"), {
    status: "PASS",
    safeProductBrowser,
    multiRoleBrowser,
    authenticatedTestsSkipped: 0,
    browserProjects: [
      "desktop-chromium",
      "mobile-chromium",
      "desktop-firefox",
      "desktop-webkit",
    ],
    localeMatrix: ["en", "fr", "es"],
    localizedPublicAndAuthenticatedJourneys: true,
    reducedMotionKeyboardZoomAndAxe: true,
    directHost: EXPECTED_STAGING_BASE_URL,
    partnerHost: deployment.deploymentUrl,
    partnerTwoHost: secondPartnerAlias.aliasUrl,
    hostIsolationProven:
      new Set([
        EXPECTED_STAGING_BASE_URL,
        deployment.deploymentUrl,
        secondPartnerAlias.aliasUrl,
      ]).size === 3,
  });

  const load = await runHostedLoadProof(EXPECTED_STAGING_BASE_URL);
  const countsAfter = await captureNoEffectCounts(admin);
  if (JSON.stringify(countsBefore) !== JSON.stringify(countsAfter)) {
    throw new Error("Browser/load acceptance changed a provider-effect or lead count");
  }
  writeJson(join(options.evidenceDir, "hosted-load-and-no-effect-counts.json"), {
    status: "PASS",
    load,
    countsBefore,
    countsAfter,
    exactCountsUnchanged: true,
    providerMutationPerformed: false,
    customerLeadWritePerformed: false,
  });

  const operatorDebtProof = runCapturedProofCommand(
    join(dirname(EXECUTABLE), "npm"),
    ["run", "operator:debt"],
    "authenticated isolated-staging operator debt proof",
  );
  writeJson(join(options.evidenceDir, "authenticated-operator-debt-proof.json"), {
    status: operatorDebtProof.status,
    command: "npm run operator:debt",
    closesHostedDeferral: operatorDebtProof.status === "PASS",
    proof: operatorDebtProof,
    providerActionPerformed: false,
  });

  const finalIdentity = captureExactReleaseIdentity();
  if (JSON.stringify(finalIdentity) !== JSON.stringify(identity)) {
    throw new Error("The exact candidate identity changed during staging acceptance");
  }
  const productionGateMatrix = {
    exactCandidateAndSchema: "PASS",
    syntheticRetentionOwnerAuthority: "PASS",
    isolatedHostedDeployment: "PASS",
    tenSyntheticRoleFixtures: "PASS",
    authenticatedDirectEntitlementBoundaries: "PASS",
    twoWhiteLabelHostsBrandingAndChildTenantIsolation: "PASS",
    crossTenantBrowserBoundary: "PASS",
    authenticatedRlsFixtureAndCleanup: rlsDeferralsClosed ? "PASS" : "FAIL",
    zeroExternalEffects: "PASS",
    readOnlyHostedLoad: "PASS",
    workerExecutionRetryReplayDeadLetterAndCrashRecovery: "PASS",
    operatorDebtAndRecoveryJourneys:
      operatorDebtProof.status === "PASS" ? "PASS" : "FAIL",
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
  const productionGateBlockers = Object.entries(productionGateMatrix)
    .filter(([, status]) => status !== "PASS")
    .map(([item, status]) => ({ item, status }));
  const hostedDeferralsClosed =
    rlsDeferralsClosed && operatorDebtProof.status === "PASS";
  failureContext.stage = "final_evidence_seal";
  writeJson(join(options.evidenceDir, "production-gate-matrix.json"), {
    status: "NO_GO",
    productionGate: "CLOSED",
    safeAcceptanceHarnessStatus: hostedDeferralsClosed ? "PASS" : "INCOMPLETE",
    productionGateMatrix,
    blockers: productionGateBlockers,
    seededEndStatesTreatedAsJourneyProof: false,
    providerAbsenceTreatedAsSuccess: false,
  });
  const summary = {
    schemaVersion: "dealflow.isolated-staging-acceptance-summary.v1",
    status: "NO_GO",
    safeAcceptanceHarnessStatus: hostedDeferralsClosed ? "PASS" : "INCOMPLETE",
    verdict: "NO_GO_PRODUCTION_ACCEPTANCE_NOT_PROVEN",
    identity,
    migrations,
    deployment,
    syntheticScenarioCount: 10,
    seedReplayIdempotent: true,
    syntheticRetentionOwnerAuthorityPassed: true,
    syntheticRetentionAuthorityInstallationMode: retentionAuthorityMode,
    hostedZeroExternalEffectsPassed: true,
    crossBrowserZeroSkipPassed: true,
    hostedLoadPassed: true,
    noEffectCountsUnchanged: true,
    providerIndependentJourneyProofPassed: true,
    productionGate: "CLOSED",
    productionGateBlockerCount: productionGateBlockers.length,
    hostedDeferralsClosed,
    productionGateMatrix,
    seededEndStatesTreatedAsJourneyProof: false,
    providerAbsenceTreatedAsSuccess: false,
    productionMutationPerformed: false,
    providerMutationPerformed: false,
    advertisingSpendIncurred: false,
    realCommunicationSent: false,
    productionReleaseAuthorized: false,
  };
  writeJson(join(options.evidenceDir, "FINAL_SUMMARY.json"), summary);
  const seal = sealEvidenceBundle(options.evidenceDir, summary, [
    execution.projectRef,
    vercelAuthority.projectId,
    process.env.VERCEL_TOKEN,
    process.env.VERCEL_ORG_ID,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.STAGING_QA_PASSWORD,
    process.env.PARTNER_ATTRIBUTION_SIGNING_SECRET,
    process.env.INTERNAL_SYSTEM_JOBS_SECRET,
  ]);
  failureContext.sealCompleted = true;
  process.stdout.write(`${JSON.stringify({
    status: summary.status,
    verdict: summary.verdict,
    evidenceDirectory: options.evidenceDir,
    commit: identity.commit,
    tree: identity.tree,
    migrationCount: migrations.migrationCount,
    deploymentId: deployment.deploymentId,
    stableStagingHost: EXPECTED_STAGING_HOST,
    partnerStagingHost: deployment.deploymentHost,
    seal,
  })}\n`);
}

main().catch((error) => {
  const sanitizedMessage = sanitize(error instanceof Error ? error.message : String(error), protectedRuntimeValues());
  try {
    writeTerminalFailureArtifact(sanitizedMessage);
  } catch {
    // A failure artifact must never mask or replace the controlling failure.
  }
  process.stderr.write(`${sanitizedMessage}\n`);
  process.exitCode = 1;
});
