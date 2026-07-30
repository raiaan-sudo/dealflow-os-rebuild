#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";

const INPUT_SCHEMA = "dealflow.release-evidence-broker-input.v1";
const OUTPUT_SCHEMA = "dealflow.release-evidence-broker-output.v1";
const EVIDENCE_SCHEMA = "dealflow.release-evidence.v3";
const DEPLOYABLE_MANIFEST_PATH =
  "config/release/deployable-source-manifest.json";
const DEPLOYABLE_MANIFEST_SCHEMA =
  "dealflow.deployable-source-manifest.v1";
const ADMISSION_STAGE = "post_deploy_pre_alias_provider";
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_ARTIFACTS_PER_PROOF = 100;

const PROOF_DEFINITIONS = Object.freeze([
  ["build", "build", "build"],
  ["test", "test", "test"],
  ["schemaValidation", "schema-validation", "schema-validation"],
  ["visual", "visual", "visual"],
  ["oldWorkerDrain", "old-worker-drain", "old-worker-drain"],
  [
    "deploymentEnvironment",
    "deployment-environment",
    "deployment-environment",
  ],
]);

const REQUIRED_WORKER_CLASSES = Object.freeze([
  "campaign_plan_v0_writers",
  "meta_launch_v0_workers",
  "sms_delivery_v0_workers",
  "stripe_webhook_v1_workers",
  "system_job_v1_workers",
]);

const REQUIRED_FAIL_SAFE_NAMES = Object.freeze([
  "SCHEMA_VALIDATION_MODE",
  "SUPABASE_SCHEMA_CHECK_MODE",
  "DEALFLOW_DEPLOYMENT_TARGET",
  "QA_AUTH_HARNESS_ENABLED",
  "ALLOW_AI_TEXT_GENERATION",
  "ALLOW_OPENAI_IMAGE_GENERATION",
  "ALLOW_HEYGEN_VIDEO_GENERATION",
  "ALLOW_HEYGEN_LEGACY_FALLBACK",
  "ALLOW_HIGGSFIELD_VIDEO_GENERATION",
  "ALLOW_ELEVENLABS_VOICE_GENERATION",
  "ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT",
  "NEXT_PUBLIC_ENABLE_GOOGLE_AUTH",
  "ENABLE_DEMO_WORKSPACE_SEEDING",
  "ENABLE_STRUCTURED_INFO_LOGS",
  "PUBLIC_CLIENT_ERROR_TELEMETRY_ENABLED",
  "UI_DIRECTION_PREVIEW",
  "GHL_IFRAME_EMBED_ENABLED",
  "GHL_IFRAME_ALLOW_SHARED_HIGHLEVEL_ORIGINS",
  "GHL_IFRAME_PARTNER_PARENT_ORIGINS_JSON",
  "GHL_APP_SHARED_SECRET",
  "META_EXECUTION_MODE",
  "ALLOW_META_LIVE_LAUNCH",
  "ALLOW_SCHEDULED_META_LAUNCH_EXECUTION",
  "ALLOW_META_CAPI_EVENTS",
  "ALLOW_META_PIXEL_EVENTS",
  "ALLOW_META_LAUNCH_INTERRUPTION_TESTS",
  "ENABLE_META_LAUNCH_TEST_MODE",
  "BILLING_CHECKOUT_SAFE_MODE",
  "ALLOW_BILLING_ADMIN_OVERRIDE",
  "ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE",
  "ENABLE_ACCESS_KEY_CHECKOUT",
  "ACCESS_KEY_PUBLIC_CHECKOUT_ENABLED",
  "STRIPE_FORCE_TEST_MODE",
  "STRIPE_TEST_HARNESS_ENABLED",
  "INTERNAL_LEAD_SMS_ENABLED",
  "SMS_MOCK_MODE",
  "TEST_SMS_MODE",
  "TWILIO_EXECUTION_MODE",
  "SMS_COMPLIANCE_ACK",
  "SUPPORT_NOTIFICATION_DELIVERY_MODE",
  "SUPPORT_STAGING_SINK_ENABLED",
  "LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED",
  "LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE",
  "ACCOUNT_DELETION_EXECUTION_ENABLED",
  "ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED",
  "GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED",
]);

const REQUIRED_SECRET_STRENGTH_POLICIES = Object.freeze([
  "accessKeyHashPepperStrongOrFeatureDisabled",
  "accessKeyRevealEncryptionKeyStrongOrFeatureDisabled",
  "cronSecretStrong",
  "internalSystemJobsSecretStrong",
  "metaAppSecretStrong",
  "metaTokenEncryptionKeyStrong",
  "partnerAttributionSigningSecretStrongOrWhiteLabelDisabled",
  "stripeWebhookSecretStrong",
  "vercelCronSecretStrong",
]);

const REQUIRED_CONFIGURATION_POLICIES = Object.freeze([
  "metaCapiConsentPolicyVersionConfigured",
  "metaPixelConsentPolicyVersionConfigured",
  "turnstileAllowedHostnamesConfigured",
  "turnstileProductionConfigValid",
  "turnstileSecretKeyNonTest",
  "turnstileEffectiveLeadSiteKeyNonTest",
  "turnstileSiteKeyNonTest",
]);

const SECRET_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}\b/,
  /\bwhsec_[A-Za-z0-9]{12,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/,
  /\bsb(?:p|_secret)_[A-Za-z0-9_-]{16,}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+\S+/i,
  /\bSet-Cookie\s*:\s*\S+/i,
  /\bCookie\s*:\s*\S+/i,
  /\b(?:postgres(?:ql)?|https?):\/\/[^/\s:@]+:[^/\s@]+@/i,
  /--(?:api[-_]?key|token|secret|password|credential)(?:=|\s+)\S+/i,
]);

const SENSITIVE_ASSIGNMENT =
  /\b([A-Za-z0-9_.-]*(?:password|passwd|api[_-]?(?:key|token)|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|credential|cookie|authorization)[A-Za-z0-9_.-]*)\s*[:=]\s*["']?([^"'\s,}\]]*)/gi;
const SAFE_REDACTIONS = new Set([
  "",
  "false",
  "true",
  "null",
  "none",
  "disabled",
  "configured",
  "passed",
  "not_proven",
  "redacted",
  "[redacted]",
  "<redacted>",
  "***",
]);
const SENSITIVE_JSON_KEY =
  /(?:password|passwd|api[_-]?(?:key|token)|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|credential|cookie|authorization)/i;
const SENSITIVE_FILE_NAME =
  /(?:^|[._-])(?:credentials?|cookies?|secrets?|tokens?)(?:[._-]|$)|(?:\.env(?:\.|$)|\.(?:pem|key|p12|pfx|jks|sqlite|db)$)/i;
const ALLOWED_PNG_CHUNKS = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "sRGB",
  "gAMA",
  "cHRM",
  "pHYs",
]);

class BrokerError extends Error {
  constructor(code) {
    super(code);
    this.name = "BrokerError";
    this.code = code;
  }
}

function fail(code) {
  throw new BrokerError(code);
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("broker_non_finite_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (!value || typeof value !== "object") fail("broker_invalid_json_value");
  return `{${Object.keys(value)
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function assertPlainObject(value, code = "broker_invalid_object") {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function assertExactKeys(value, keys, code) {
  assertPlainObject(value, code);
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(code);
  }
}

function assertIdentifier(value, code) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 240 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(value)
  ) {
    fail(code);
  }
  return value;
}

function assertTimestamp(value, code) {
  if (typeof value !== "string") fail(code);
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== value ||
    timestamp > Date.now() + 5 * 60 * 1_000
  ) {
    fail(code);
  }
  return timestamp;
}

function assertSha(value, code, lengths = [40, 64]) {
  if (
    typeof value !== "string" ||
    !lengths.includes(value.length) ||
    !/^[0-9a-f]+$/.test(value)
  ) {
    fail(code);
  }
  return value;
}

function scanSensitiveJson(value) {
  if (Array.isArray(value)) {
    for (const entry of value) scanSensitiveJson(entry);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (
      SENSITIVE_JSON_KEY.test(key) &&
      typeof entry === "string" &&
      !SAFE_REDACTIONS.has(entry.trim().toLowerCase())
    ) {
      fail("broker_secret_like_input");
    }
    scanSensitiveJson(entry);
  }
}

function scanText(text, code = "broker_secret_like_artifact") {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) fail(code);
  }
  SENSITIVE_ASSIGNMENT.lastIndex = 0;
  for (const match of text.matchAll(SENSITIVE_ASSIGNMENT)) {
    const value = String(match[2] ?? "").trim().toLowerCase();
    if (!SAFE_REDACTIONS.has(value)) fail(code);
  }
}

function parseArguments(argv) {
  const parsed = { input: null, output: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--dry-run") {
      if (parsed.dryRun) fail("broker_duplicate_option");
      parsed.dryRun = true;
      continue;
    }
    const key = argument === "--input"
      ? "input"
      : argument === "--output"
        ? "output"
        : null;
    if (!key) fail("broker_unknown_option");
    if (parsed[key]) fail("broker_duplicate_option");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail("broker_missing_option_value");
    parsed[key] = resolve(value);
    index += 1;
  }
  if (!parsed.input || (!parsed.output && !parsed.dryRun)) {
    fail("broker_missing_required_option");
  }
  return parsed;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/production/build-release-evidence-broker.mjs \\",
    "    --input <sanitized-input.json> --output <new-external-directory>",
    "  node scripts/production/build-release-evidence-broker.mjs \\",
    "    --input <sanitized-input.json> --dry-run",
    "",
    "The broker only creates unsigned release-evidence manifests. It never signs",
    "evidence, creates trust material, or authorizes a production release.",
  ].join("\n");
}

function git(root, args, { binary = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: binary ? null : "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) fail("broker_git_identity_failure");
  return result.stdout;
}

function loadTargetIdentity(root, targetCommit) {
  assertSha(targetCommit, "broker_target_commit_invalid");
  const resolved = String(
    git(root, ["rev-parse", "--verify", `${targetCommit}^{commit}`]),
  ).trim().toLowerCase();
  if (resolved !== targetCommit) fail("broker_target_commit_not_exact");
  const targetTree = String(
    git(root, ["rev-parse", `${targetCommit}^{tree}`]),
  ).trim().toLowerCase();
  assertSha(targetTree, "broker_target_tree_invalid");
  const manifestBytes = git(
    root,
    ["show", `${targetCommit}:${DEPLOYABLE_MANIFEST_PATH}`],
    { binary: true },
  );
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    fail("broker_deployable_manifest_invalid");
  }
  let previousPath = "";
  for (const entry of manifest.entries) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      typeof entry.path !== "string" ||
      entry.path.length < 1 ||
      entry.path.startsWith("/") ||
      entry.path.includes("\\") ||
      entry.path.split("/").includes("..") ||
      entry.path <= previousPath ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !Number.isSafeInteger(entry.mode) ||
      typeof entry.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(entry.sha256)
    ) {
      fail("broker_deployable_manifest_invalid");
    }
    previousPath = entry.path;
  }
  if (
    !manifest ||
    manifest.schemaVersion !== DEPLOYABLE_MANIFEST_SCHEMA ||
    manifest.generatedFrom !==
      "git_tracked_files_minus_vercelignore_and_manifest" ||
    !Number.isSafeInteger(manifest.entryCount) ||
    manifest.entryCount < 1 ||
    !Array.isArray(manifest.entries) ||
    manifest.entries.length !== manifest.entryCount ||
    typeof manifest.deployableSourceSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(manifest.deployableSourceSha256)
  ) {
    fail("broker_deployable_manifest_invalid");
  }
  const committedAt = Date.parse(
    String(git(root, ["show", "-s", "--format=%cI", targetCommit])).trim(),
  );
  if (!Number.isFinite(committedAt)) fail("broker_target_timestamp_invalid");
  return Object.freeze({
    targetCommit,
    targetTree,
    deployableSourceSha256: manifest.deployableSourceSha256,
    deployableManifestSha256: sha256(manifestBytes),
    committedAt,
  });
}

function loadInput(inputPath) {
  if (!existsSync(inputPath)) fail("broker_input_missing");
  const stat = lstatSync(inputPath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 2 ||
    stat.size > MAX_INPUT_BYTES
  ) {
    fail("broker_input_unsafe");
  }
  let input;
  try {
    input = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch {
    fail("broker_input_json_invalid");
  }
  scanSensitiveJson(input);
  assertExactKeys(
    input,
    [
      "authority",
      "deployment",
      "proofs",
      "schemaVersion",
      "sourceRun",
      "targetCommit",
    ],
    "broker_input_keys_invalid",
  );
  if (input.schemaVersion !== INPUT_SCHEMA) fail("broker_input_schema_invalid");
  return input;
}

function validateAuthority(authority) {
  assertExactKeys(
    authority,
    ["authorityId", "keyId", "source"],
    "broker_authority_invalid",
  );
  return Object.freeze({
    authorityId: assertIdentifier(
      authority.authorityId,
      "broker_authority_invalid",
    ),
    keyId: assertIdentifier(authority.keyId, "broker_authority_invalid"),
    source: assertIdentifier(authority.source, "broker_authority_invalid"),
  });
}

function validateSourceRun(sourceRun, authority) {
  assertExactKeys(
    sourceRun,
    ["repository", "runId", "system", "workflow"],
    "broker_source_run_invalid",
  );
  const normalized = Object.freeze({
    system: assertIdentifier(sourceRun.system, "broker_source_run_invalid"),
    repository: assertIdentifier(
      sourceRun.repository,
      "broker_source_run_invalid",
    ),
    workflow: assertIdentifier(
      sourceRun.workflow,
      "broker_source_run_invalid",
    ),
    runId: assertIdentifier(sourceRun.runId, "broker_source_run_invalid"),
  });
  if (normalized.system !== authority.source) {
    fail("broker_source_authority_mismatch");
  }
  return normalized;
}

function validateCommand(command, evidenceType) {
  if (
    typeof command !== "string" ||
    command.trim() === "" ||
    command.length > 2_000 ||
    /[\r\n\0]/.test(command)
  ) {
    fail("broker_command_invalid");
  }
  scanText(command, "broker_command_secret_like");
  if (
    evidenceType === "schema-validation" &&
    command !== "SUPABASE_SCHEMA_CHECK_MODE=remote npm run schema:check"
  ) {
    fail("broker_schema_command_invalid");
  }
  return command;
}

function validateCommonProof(proof, evidenceType, extraKeys, targetIdentity) {
  assertExactKeys(
    proof,
    [
      "command",
      "completedAt",
      "executed",
      "exitCode",
      "status",
      ...extraKeys,
    ],
    "broker_proof_keys_invalid",
  );
  if (
    proof.executed !== true ||
    proof.exitCode !== 0 ||
    proof.status !== "passed"
  ) {
    fail("broker_proof_not_passed");
  }
  const completedAtMs = assertTimestamp(
    proof.completedAt,
    "broker_proof_timestamp_invalid",
  );
  if (completedAtMs < targetIdentity.committedAt) {
    fail("broker_proof_predates_target");
  }
  return Object.freeze({
    command: validateCommand(proof.command, evidenceType),
    completedAt: proof.completedAt,
    completedAtMs,
  });
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectSanitizedPng(contents) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (
    contents.length < 45 ||
    !contents.subarray(0, signature.length).equals(signature)
  ) {
    fail("broker_visual_invalid");
  }
  let offset = 8;
  let dimensions = null;
  let sawIdat = false;
  let sawIend = false;
  let chunkIndex = 0;
  while (offset < contents.length) {
    if (offset + 12 > contents.length) fail("broker_visual_invalid");
    const length = contents.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    if (crcOffset + 4 > contents.length) fail("broker_visual_invalid");
    const typeBuffer = contents.subarray(typeStart, dataStart);
    const type = typeBuffer.toString("ascii");
    if (!ALLOWED_PNG_CHUNKS.has(type)) {
      fail("broker_visual_metadata_forbidden");
    }
    if (
      crc32(contents.subarray(typeStart, dataEnd)) !==
      contents.readUInt32BE(crcOffset)
    ) {
      fail("broker_visual_invalid");
    }
    if (chunkIndex === 0 && type !== "IHDR") fail("broker_visual_invalid");
    if (type === "IHDR") {
      if (dimensions || length !== 13) fail("broker_visual_invalid");
      const width = contents.readUInt32BE(dataStart);
      const height = contents.readUInt32BE(dataStart + 4);
      if (width < 1 || height < 1) fail("broker_visual_invalid");
      dimensions = { width, height };
    } else if (type === "IDAT") {
      sawIdat = true;
    } else if (type === "IEND") {
      if (
        length !== 0 ||
        !sawIdat ||
        crcOffset + 4 !== contents.length
      ) {
        fail("broker_visual_invalid");
      }
      sawIend = true;
    }
    offset = crcOffset + 4;
    chunkIndex += 1;
  }
  if (!dimensions || !sawIdat || !sawIend) fail("broker_visual_invalid");
  return dimensions;
}

function readArtifactSnapshot(rawArtifact, ordinal, { visual = false } = {}) {
  assertExactKeys(
    rawArtifact,
    visual
      ? ["height", "path", "sanitized", "width"]
      : ["path", "sanitized"],
    "broker_artifact_metadata_invalid",
  );
  if (rawArtifact.sanitized !== true) {
    fail("broker_artifact_not_sanitized");
  }
  if (
    typeof rawArtifact.path !== "string" ||
    !isAbsolute(rawArtifact.path) ||
    rawArtifact.path.includes("\0") ||
    SENSITIVE_FILE_NAME.test(basename(rawArtifact.path))
  ) {
    fail("broker_artifact_path_unsafe");
  }
  if (!existsSync(rawArtifact.path)) fail("broker_artifact_missing");
  const stat = lstatSync(rawArtifact.path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 1 ||
    stat.size > MAX_ARTIFACT_BYTES ||
    (stat.size > 0 && stat.blocks === 0)
  ) {
    fail("broker_artifact_unsafe");
  }
  const contents = readFileSync(rawArtifact.path);
  if (contents.length !== stat.size) fail("broker_artifact_changed");
  if (visual) {
    const dimensions = inspectSanitizedPng(contents);
    if (
      !Number.isSafeInteger(rawArtifact.width) ||
      !Number.isSafeInteger(rawArtifact.height) ||
      rawArtifact.width !== dimensions.width ||
      rawArtifact.height !== dimensions.height
    ) {
      fail("broker_visual_dimensions_mismatch");
    }
    return Object.freeze({
      contents,
      sourcePath: realpathSync(rawArtifact.path),
      outputName: `image-${String(ordinal + 1).padStart(3, "0")}.png`,
      sha256: sha256(contents),
      width: dimensions.width,
      height: dimensions.height,
    });
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    fail("broker_artifact_not_utf8");
  }
  scanText(text);
  if (/^\s*[{[]/.test(text)) {
    try {
      scanSensitiveJson(JSON.parse(text));
    } catch (error) {
      if (error instanceof BrokerError) throw error;
    }
  }
  return Object.freeze({
    contents,
    sourcePath: realpathSync(rawArtifact.path),
    outputName: `artifact-${String(ordinal + 1).padStart(3, "0")}`,
    sha256: sha256(contents),
  });
}

function validateArtifactList(rawArtifacts, options = {}) {
  if (
    !Array.isArray(rawArtifacts) ||
    rawArtifacts.length < 1 ||
    rawArtifacts.length > MAX_ARTIFACTS_PER_PROOF
  ) {
    fail("broker_artifact_inventory_invalid");
  }
  const snapshots = rawArtifacts.map((artifact, index) =>
    readArtifactSnapshot(artifact, index, options));
  const sourcePaths = new Set();
  for (const snapshot of snapshots) {
    if (sourcePaths.has(snapshot.sourcePath)) fail("broker_duplicate_artifact");
    sourcePaths.add(snapshot.sourcePath);
  }
  return snapshots;
}

function validateBooleanPolicyMap(value, names, code) {
  assertExactKeys(value, names, code);
  for (const name of names) {
    if (value[name] !== true) fail(code);
  }
  return Object.freeze(
    Object.fromEntries([...names].sort(compareText).map((name) => [name, true])),
  );
}

function validateDeployment(raw, targetIdentity) {
  assertExactKeys(
    raw,
    [
      "admissionStage",
      "aliasesAttached",
      "deployedAt",
      "deploymentId",
      "environment",
      "projectId",
      "provider",
      "providerEffectsEnabled",
    ],
    "broker_deployment_invalid",
  );
  const deployedAtMs = assertTimestamp(
    raw.deployedAt,
    "broker_deployment_timestamp_invalid",
  );
  if (
    raw.environment !== "production" ||
    raw.admissionStage !== ADMISSION_STAGE ||
    raw.aliasesAttached !== false ||
    raw.providerEffectsEnabled !== false
  ) {
    fail("broker_deployment_not_quiescent");
  }
  if (deployedAtMs < targetIdentity.committedAt) {
    fail("broker_deployment_predates_target");
  }
  return Object.freeze({
    value: Object.freeze({
      provider: assertIdentifier(raw.provider, "broker_deployment_invalid"),
      projectId: assertIdentifier(raw.projectId, "broker_deployment_invalid"),
      deploymentId: assertIdentifier(
        raw.deploymentId,
        "broker_deployment_invalid",
      ),
      environment: "production",
      targetCommit: targetIdentity.targetCommit,
      targetTree: targetIdentity.targetTree,
      deployableSourceSha256: targetIdentity.deployableSourceSha256,
      deployableManifestSha256: targetIdentity.deployableManifestSha256,
      deployedAt: raw.deployedAt,
      admissionStage: ADMISSION_STAGE,
      aliasesAttached: false,
      providerEffectsEnabled: false,
    }),
    deployedAtMs,
  });
}

function commonManifest({
  evidenceType,
  common,
  targetIdentity,
  sourceRun,
  authority,
}) {
  return {
    schemaVersion: EVIDENCE_SCHEMA,
    evidenceType,
    targetCommit: targetIdentity.targetCommit,
    targetTree: targetIdentity.targetTree,
    deployableSourceSha256: targetIdentity.deployableSourceSha256,
    deployableManifestSha256: targetIdentity.deployableManifestSha256,
    command: common.command,
    executed: true,
    exitCode: 0,
    status: "passed",
    completedAt: common.completedAt,
    sourceRun,
    authority,
  };
}

function validateProofs(input, context) {
  assertExactKeys(
    input.proofs,
    PROOF_DEFINITIONS.map(([inputKey]) => inputKey),
    "broker_proofs_invalid",
  );
  const planned = new Map();

  const buildCommon = validateCommonProof(
    input.proofs.build,
    "build",
    ["artifacts"],
    context.targetIdentity,
  );
  const buildArtifacts = validateArtifactList(input.proofs.build.artifacts);
  planned.set("build", {
    evidenceType: "build",
    common: buildCommon,
    snapshots: buildArtifacts,
    manifestExtra: {
      artifacts: buildArtifacts.map((artifact) => ({
        path: `artifacts/${artifact.outputName}`,
        sha256: artifact.sha256,
      })),
    },
  });

  const testCommon = validateCommonProof(
    input.proofs.test,
    "test",
    ["artifacts"],
    context.targetIdentity,
  );
  const testArtifacts = validateArtifactList(input.proofs.test.artifacts);
  planned.set("test", {
    evidenceType: "test",
    common: testCommon,
    snapshots: testArtifacts,
    manifestExtra: {
      artifacts: testArtifacts.map((artifact) => ({
        path: `artifacts/${artifact.outputName}`,
        sha256: artifact.sha256,
      })),
    },
  });

  const schemaCommon = validateCommonProof(
    input.proofs.schemaValidation,
    "schema-validation",
    ["artifacts", "checks"],
    context.targetIdentity,
  );
  assertExactKeys(
    input.proofs.schemaValidation.checks,
    ["remoteSchema", "requiredMigrationFiles"],
    "broker_schema_checks_invalid",
  );
  if (
    input.proofs.schemaValidation.checks.remoteSchema !== true ||
    input.proofs.schemaValidation.checks.requiredMigrationFiles !== true
  ) {
    fail("broker_schema_checks_invalid");
  }
  const schemaArtifacts = validateArtifactList(
    input.proofs.schemaValidation.artifacts,
  );
  planned.set("schema-validation", {
    evidenceType: "schema-validation",
    common: schemaCommon,
    snapshots: schemaArtifacts,
    manifestExtra: {
      checks: { requiredMigrationFiles: true, remoteSchema: true },
      artifacts: schemaArtifacts.map((artifact) => ({
        path: `artifacts/${artifact.outputName}`,
        sha256: artifact.sha256,
      })),
    },
  });

  const visualCommon = validateCommonProof(
    input.proofs.visual,
    "visual",
    ["images"],
    context.targetIdentity,
  );
  const visualArtifacts = validateArtifactList(input.proofs.visual.images, {
    visual: true,
  });
  planned.set("visual", {
    evidenceType: "visual",
    common: visualCommon,
    snapshots: visualArtifacts,
    manifestExtra: {
      images: visualArtifacts.map((artifact) => ({
        path: `artifacts/${artifact.outputName}`,
        sha256: artifact.sha256,
        width: artifact.width,
        height: artifact.height,
      })),
    },
  });

  const drainCommon = validateCommonProof(
    input.proofs.oldWorkerDrain,
    "old-worker-drain",
    ["checks"],
    context.targetIdentity,
  );
  if (
    !Array.isArray(input.proofs.oldWorkerDrain.checks) ||
    input.proofs.oldWorkerDrain.checks.length !==
      REQUIRED_WORKER_CLASSES.length
  ) {
    fail("broker_drain_checks_invalid");
  }
  const checkByClass = new Map();
  for (const check of input.proofs.oldWorkerDrain.checks) {
    assertExactKeys(
      check,
      ["activeCount", "workerClass"],
      "broker_drain_checks_invalid",
    );
    if (
      typeof check.workerClass !== "string" ||
      checkByClass.has(check.workerClass) ||
      check.activeCount !== 0
    ) {
      fail("broker_drain_checks_invalid");
    }
    checkByClass.set(check.workerClass, 0);
  }
  if (
    REQUIRED_WORKER_CLASSES.some((workerClass) => !checkByClass.has(workerClass))
  ) {
    fail("broker_drain_checks_invalid");
  }
  planned.set("old-worker-drain", {
    evidenceType: "old-worker-drain",
    common: drainCommon,
    snapshots: [],
    manifestExtra: {
      deployment: context.deployment,
      checks: REQUIRED_WORKER_CLASSES.map((workerClass) => ({
        workerClass,
        activeCount: 0,
      })),
    },
  });

  const environmentCommon = validateCommonProof(
    input.proofs.deploymentEnvironment,
    "deployment-environment",
    ["environment"],
    context.targetIdentity,
  );
  const environment = input.proofs.deploymentEnvironment.environment;
  assertExactKeys(
    environment,
    [
      "configurationPolicies",
      "containsSecretValues",
      "safeFlagStates",
      "secretStrengthPolicies",
      "stripeLiveMode",
    ],
    "broker_environment_invalid",
  );
  if (
    environment.containsSecretValues !== false ||
    typeof environment.stripeLiveMode !== "boolean"
  ) {
    fail("broker_environment_invalid");
  }
  const normalizedEnvironment = {
    containsSecretValues: false,
    stripeLiveMode: environment.stripeLiveMode,
    safeFlagStates: validateBooleanPolicyMap(
      environment.safeFlagStates,
      REQUIRED_FAIL_SAFE_NAMES,
      "broker_environment_flags_invalid",
    ),
    secretStrengthPolicies: validateBooleanPolicyMap(
      environment.secretStrengthPolicies,
      REQUIRED_SECRET_STRENGTH_POLICIES,
      "broker_environment_secret_policy_invalid",
    ),
    configurationPolicies: validateBooleanPolicyMap(
      environment.configurationPolicies,
      REQUIRED_CONFIGURATION_POLICIES,
      "broker_environment_configuration_policy_invalid",
    ),
  };
  planned.set("deployment-environment", {
    evidenceType: "deployment-environment",
    common: environmentCommon,
    snapshots: [],
    manifestExtra: {
      deployment: context.deployment,
      environment: normalizedEnvironment,
    },
  });

  if (
    context.deploymentDeployedAtMs > drainCommon.completedAtMs ||
    context.deploymentDeployedAtMs > environmentCommon.completedAtMs
  ) {
    fail("broker_post_deploy_evidence_timing_invalid");
  }
  return planned;
}

function outputBoundary(root, requestedOutput) {
  const rootReal = realpathSync(root);
  const output = resolve(requestedOutput);
  if (existsSync(output)) fail("broker_output_exists");
  const parent = realpathSync(dirname(output));
  const parentStat = lstatSync(parent);
  if (
    !parentStat.isDirectory() ||
    parentStat.isSymbolicLink() ||
    (parentStat.mode & 0o022) !== 0
  ) {
    fail("broker_output_parent_unsafe");
  }
  const normalized = join(parent, basename(output));
  const relationship = relative(rootReal, normalized);
  if (
    relationship === "" ||
    (relationship !== ".." && !relationship.startsWith(`..${sep}`)) ||
    isAbsolute(relationship)
  ) {
    fail("broker_output_inside_repository");
  }
  return normalized;
}

function writeProtectedFile(path, contents) {
  writeFileSync(path, contents, { flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
}

function buildManifests(planned, context) {
  const manifests = new Map();
  for (const [, evidenceType, directory] of PROOF_DEFINITIONS) {
    const proof = planned.get(evidenceType);
    const manifest = {
      ...commonManifest({
        evidenceType,
        common: proof.common,
        targetIdentity: context.targetIdentity,
        sourceRun: context.sourceRun,
        authority: context.authority,
      }),
      ...proof.manifestExtra,
    };
    if (Object.prototype.hasOwnProperty.call(manifest, "attestation")) {
      fail("broker_attestation_forbidden");
    }
    manifests.set(evidenceType, {
      directory,
      manifest,
      canonicalBytes: Buffer.from(`${canonicalJson(manifest)}\n`, "utf8"),
      snapshots: proof.snapshots,
    });
  }
  return manifests;
}

function writeBundle(output, manifests, context) {
  const parent = dirname(output);
  const staging = join(
    parent,
    `.${basename(output)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`,
  );
  mkdirSync(staging, { recursive: false, mode: 0o700 });
  chmodSync(staging, 0o700);
  try {
    const indexRecords = [];
    let artifactCount = 0;
    for (const [, evidenceType, directory] of PROOF_DEFINITIONS) {
      const record = manifests.get(evidenceType);
      const proofRoot = join(staging, directory);
      const artifactRoot = join(proofRoot, "artifacts");
      mkdirSync(proofRoot, { mode: 0o700 });
      chmodSync(proofRoot, 0o700);
      if (record.snapshots.length > 0) {
        mkdirSync(artifactRoot, { mode: 0o700 });
        chmodSync(artifactRoot, 0o700);
        for (const artifact of record.snapshots) {
          writeProtectedFile(
            join(artifactRoot, artifact.outputName),
            artifact.contents,
          );
          artifactCount += 1;
        }
      }
      const manifestRelativePath = `${directory}/release-evidence.json`;
      writeProtectedFile(
        join(staging, manifestRelativePath),
        record.canonicalBytes,
      );
      indexRecords.push({
        evidenceType,
        path: manifestRelativePath,
        fileSha256: sha256(record.canonicalBytes),
        canonicalPayloadSha256: sha256(
          Buffer.from(canonicalJson(record.manifest), "utf8"),
        ),
        attestationPresent: false,
      });
    }
    const index = {
      schemaVersion: OUTPUT_SCHEMA,
      status: "UNSIGNED_AWAITING_EXTERNAL_ATTESTATION",
      canAuthorizeProduction: false,
      targetCommit: context.targetIdentity.targetCommit,
      targetTree: context.targetIdentity.targetTree,
      deployableSourceSha256:
        context.targetIdentity.deployableSourceSha256,
      deployableManifestSha256:
        context.targetIdentity.deployableManifestSha256,
      manifestCount: indexRecords.length,
      artifactCount,
      manifests: indexRecords,
    };
    writeProtectedFile(
      join(staging, "broker-index.json"),
      Buffer.from(`${canonicalJson(index)}\n`, "utf8"),
    );
    renameSync(staging, output);
    chmodSync(output, 0o700);
    return { artifactCount, manifestCount: indexRecords.length };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const workingDirectory = realpathSync(process.cwd());
  const root = realpathSync(
    String(git(workingDirectory, ["rev-parse", "--show-toplevel"])).trim(),
  );
  const input = loadInput(options.input);
  const targetIdentity = loadTargetIdentity(root, input.targetCommit);
  const authority = validateAuthority(input.authority);
  const sourceRun = validateSourceRun(input.sourceRun, authority);
  const deployment = validateDeployment(input.deployment, targetIdentity);
  const context = {
    root,
    targetIdentity,
    authority,
    sourceRun,
    deployment: deployment.value,
    deploymentDeployedAtMs: deployment.deployedAtMs,
  };
  const planned = validateProofs(input, context);
  const manifests = buildManifests(planned, context);
  const artifactCount = [...manifests.values()].reduce(
    (sum, record) => sum + record.snapshots.length,
    0,
  );
  if (options.dryRun) {
    process.stdout.write(
      `${canonicalJson({
        schemaVersion: OUTPUT_SCHEMA,
        status: "DRY_RUN_PASS",
        canAuthorizeProduction: false,
        targetCommit: targetIdentity.targetCommit,
        targetTree: targetIdentity.targetTree,
        deployableSourceSha256: targetIdentity.deployableSourceSha256,
        deployableManifestSha256:
          targetIdentity.deployableManifestSha256,
        manifestCount: manifests.size,
        artifactCount,
      })}\n`,
    );
    return;
  }
  const output = outputBoundary(root, options.output);
  const result = writeBundle(output, manifests, context);
  process.stdout.write(
    `${canonicalJson({
      schemaVersion: OUTPUT_SCHEMA,
      status: "UNSIGNED_BUNDLE_CREATED",
      canAuthorizeProduction: false,
      targetCommit: targetIdentity.targetCommit,
      manifestCount: result.manifestCount,
      artifactCount: result.artifactCount,
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  const code =
    error instanceof BrokerError
      ? error.code
      : "broker_unexpected_failure";
  process.stderr.write(`NO_GO ${code}\n`);
  process.exitCode = 1;
}
