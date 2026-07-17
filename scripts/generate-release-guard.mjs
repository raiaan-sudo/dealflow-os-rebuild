#!/usr/bin/env node

import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const SCHEMA_VERSION = "dealflow.release-guard.v4";
const RELEASE_MODE = "release";
const AUDIT_PREVIEW_MODE = "audit-preview";
const REQUIRED_TARGET_PATHS = {
  environmentExample: ".env.example",
  packageLock: "package-lock.json",
  migrationsDirectory: "supabase/migrations",
  trustPolicy: "docs/dealflow-completion/release-trust-policy.json",
};

const RELEASE_EVIDENCE_SCHEMA_VERSION = "dealflow.release-evidence.v2";
const RELEASE_TRUST_POLICY_SCHEMA_VERSION = "dealflow.release-trust-policy.v1";
const EXTERNAL_TRUST_POLICY_SCHEMA_VERSION = "dealflow.external-release-trust-policy.v1";
const EXTERNAL_TRUST_POLICY_PATH_ENV = "DEALFLOW_RELEASE_TRUST_POLICY_PATH";
const EXTERNAL_TRUST_POLICY_SHA256_ENV = "DEALFLOW_RELEASE_TRUST_POLICY_SHA256";
const EXTERNAL_TRUST_PREVIOUS_SHA256_ENV =
  "DEALFLOW_RELEASE_TRUST_PREVIOUS_POLICY_SHA256";
const SIGNATURE_ALGORITHM = "ed25519";
const OWNER_DECISION_AUTHORITY_PURPOSE = "owner-decision-authority";
const OWNER_DECISION_TEMPLATE_PATH =
  "config/authority/dealflow-owner-decisions.v1.json";
const REQUIRED_SECRET_STRENGTH_POLICIES = [
  "accessKeyHashPepperStrongOrFeatureDisabled",
  "accessKeyRevealEncryptionKeyStrongOrFeatureDisabled",
  "cronSecretStrong",
  "internalSystemJobsSecretStrong",
  "metaAppSecretStrong",
  "metaTokenEncryptionKeyStrong",
  "partnerAttributionSigningSecretStrongOrWhiteLabelDisabled",
  "stripeWebhookSecretStrong",
  "vercelCronSecretStrong",
];
const REQUIRED_DEPLOYMENT_CONFIGURATION_POLICIES = [
  "metaCapiConsentPolicyVersionConfigured",
  "metaPixelConsentPolicyVersionConfigured",
  "turnstileAllowedHostnamesConfigured",
  "turnstileProductionConfigValid",
  "turnstileSecretKeyNonTest",
  "turnstileEffectiveLeadSiteKeyNonTest",
  "turnstileSiteKeyNonTest",
];
const REQUIRED_OLD_WORKER_CLASSES = [
  "campaign_plan_v0_writers",
  "meta_launch_v0_workers",
  "sms_delivery_v0_workers",
  "stripe_webhook_v1_workers",
  "system_job_v1_workers",
];
const REQUIRED_FAIL_SAFE_DEFAULTS = new Map([
  ["SCHEMA_VALIDATION_MODE", "block"],
  ["SUPABASE_SCHEMA_CHECK_MODE", "remote"],
  ["DEALFLOW_DEPLOYMENT_TARGET", "production"],
  ["QA_AUTH_HARNESS_ENABLED", "false"],
  ["ALLOW_AI_TEXT_GENERATION", "false"],
  ["ALLOW_OPENAI_IMAGE_GENERATION", "false"],
  ["ALLOW_HEYGEN_VIDEO_GENERATION", "false"],
  ["ALLOW_HEYGEN_LEGACY_FALLBACK", "false"],
  ["ALLOW_HIGGSFIELD_VIDEO_GENERATION", "false"],
  ["ALLOW_ELEVENLABS_VOICE_GENERATION", "false"],
  ["ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT", "false"],
  ["NEXT_PUBLIC_ENABLE_GOOGLE_AUTH", "false"],
  ["ENABLE_DEMO_WORKSPACE_SEEDING", "false"],
  ["ENABLE_STRUCTURED_INFO_LOGS", "false"],
  ["PUBLIC_CLIENT_ERROR_TELEMETRY_ENABLED", "false"],
  ["UI_DIRECTION_PREVIEW", "0"],
  ["GHL_IFRAME_EMBED_ENABLED", "false"],
  ["META_EXECUTION_MODE", "sandbox"],
  ["ALLOW_META_LIVE_LAUNCH", "false"],
  ["ALLOW_SCHEDULED_META_LAUNCH_EXECUTION", "false"],
  ["ALLOW_META_CAPI_EVENTS", "false"],
  ["ALLOW_META_PIXEL_EVENTS", "false"],
  ["ALLOW_META_LAUNCH_INTERRUPTION_TESTS", "false"],
  ["ENABLE_META_LAUNCH_TEST_MODE", "false"],
  ["BILLING_CHECKOUT_SAFE_MODE", "true"],
  ["ALLOW_BILLING_ADMIN_OVERRIDE", "false"],
  ["ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE", "false"],
  ["ENABLE_ACCESS_KEY_CHECKOUT", "false"],
  ["ACCESS_KEY_PUBLIC_CHECKOUT_ENABLED", "false"],
  ["STRIPE_FORCE_TEST_MODE", "false"],
  ["STRIPE_TEST_HARNESS_ENABLED", "false"],
  ["INTERNAL_LEAD_SMS_ENABLED", "false"],
  ["SMS_MOCK_MODE", "false"],
  ["TEST_SMS_MODE", ""],
  ["TWILIO_EXECUTION_MODE", "disabled"],
  ["SMS_COMPLIANCE_ACK", ""],
  ["SUPPORT_NOTIFICATION_DELIVERY_MODE", "internal_operator_inbox"],
  ["SUPPORT_STAGING_SINK_ENABLED", "false"],
  ["LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED", "false"],
  ["LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE", "false"],
  ["ACCOUNT_DELETION_EXECUTION_ENABLED", "false"],
  ["ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED", "false"],
  ["GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED", "false"],
]);

const EVIDENCE_OPTIONS = new Map([
  ["--build-evidence", { key: "buildEvidence", type: "build", label: "build" }],
  ["--test-evidence", { key: "testEvidence", type: "test", label: "test" }],
  [
    "--schema-evidence",
    { key: "schemaEvidence", type: "schema-validation", label: "schema validation" },
  ],
  ["--visual-evidence", { key: "visualEvidence", type: "visual", label: "visual" }],
  [
    "--drain-evidence",
    { key: "drainEvidence", type: "old-worker-drain", label: "old-worker drain" },
  ],
  [
    "--environment-evidence",
    {
      key: "environmentEvidence",
      type: "deployment-environment",
      label: "exact-deployment environment attestation",
    },
  ],
]);

const USAGE = `Usage:
  node scripts/generate-release-guard.mjs \\
    --baseline <git-commit-or-ref> \\
    --target <exact-head-sha> \\
    --build-evidence <manifest.json> \\
    --test-evidence <manifest.json> \\
    --schema-evidence <manifest.json> \\
    --visual-evidence <manifest.json> \\
    --drain-evidence <manifest.json> \\
    --environment-evidence <manifest.json> \\
    [--mode release|audit-preview] \\
    [--output <explicit-json-path>]

Release mode is the default and is fail-closed: all six evidence classes are
required, the worktree must be clean, and --target must be the full SHA of HEAD.
Each evidence option accepts one dealflow.release-evidence.v2 JSON manifest.
Release evidence must be Ed25519-signed by an authority pinned in a protected
policy outside the repository. Release mode reads its absolute path and expected
digest only from ${EXTERNAL_TRUST_POLICY_PATH_ENV} and
${EXTERNAL_TRUST_POLICY_SHA256_ENV}; neither has a CLI override. The target's
docs/dealflow-completion/release-trust-policy.json is informational and its exact
digest must be authorized by that external policy. For an authorized rotation,
generation >1 additionally requires ${EXTERNAL_TRUST_PREVIOUS_SHA256_ENV}.
Use --mode audit-preview only for explicitly
non-gating structural inspection; unsigned preview evidence can never PASS.
Repository lockfile, migration, trust-policy, and environment-name data are read
from the resolved target commit.`;

class ReleaseGuardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReleaseGuardError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReleaseGuardError(code, message);
}

function parseArguments(argv) {
  const parsed = {
    baseline: null,
    target: null,
    output: null,
    mode: RELEASE_MODE,
    buildEvidence: [],
    testEvidence: [],
    schemaEvidence: [],
    visualEvidence: [],
    drainEvidence: [],
    environmentEvidence: [],
  };
  const singletonOptionsSeen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help" || option === "-h") {
      return { help: true };
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail("release_guard_usage_error", `Missing value for ${option}.`);
    }

    if (
      option === "--baseline" ||
      option === "--target" ||
      option === "--output" ||
      option === "--mode"
    ) {
      const key = option.slice(2);
      if (singletonOptionsSeen.has(option)) {
        fail("release_guard_usage_error", `${option} may only be supplied once.`);
      }
      singletonOptionsSeen.add(option);
      parsed[key] = value;
      index += 1;
      continue;
    }

    const evidenceOption = EVIDENCE_OPTIONS.get(option);
    if (evidenceOption) {
      parsed[evidenceOption.key].push(value);
      index += 1;
      continue;
    }

    fail("release_guard_usage_error", `Unknown option: ${option}.`);
  }

  if (!parsed.baseline || !parsed.target) {
    fail(
      "release_guard_usage_error",
      "Both --baseline and --target are required; refusing to infer a release range.",
    );
  }

  if (![RELEASE_MODE, AUDIT_PREVIEW_MODE].includes(parsed.mode)) {
    fail(
      "release_guard_usage_error",
      `--mode must be ${RELEASE_MODE} or ${AUDIT_PREVIEW_MODE}.`,
    );
  }

  if (parsed.mode === RELEASE_MODE) {
    const missingEvidence = [...EVIDENCE_OPTIONS.values()].filter(
      (evidenceOption) => parsed[evidenceOption.key].length === 0,
    );
    if (missingEvidence.length > 0) {
      fail(
        "release_guard_missing_required_evidence",
        `Release mode requires build, test, schema validation, visual, old-worker drain, and exact-deployment environment evidence; missing: ${missingEvidence.map((entry) => entry.label).join(", ")}.`,
      );
    }
  }

  for (const evidenceOption of EVIDENCE_OPTIONS.values()) {
    if (parsed[evidenceOption.key].length > 1) {
      fail(
        "release_guard_ambiguous_evidence",
        `Only one ${evidenceOption.label} evidence manifest may be supplied.`,
      );
    }
  }

  return parsed;
}

function runGit(root, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: options.binary ? null : "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (options.allowStatus?.includes(result.status)) {
    return result;
  }

  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8").trim()
      : String(result.stderr ?? "").trim();
    fail(
      "release_guard_git_error",
      `Git command failed (${args[0]}): ${stderr || `exit ${result.status ?? "unknown"}`}`,
    );
  }

  return result;
}

function resolveCommit(root, ref, label) {
  const result = runGit(root, ["rev-parse", "--verify", `${ref}^{commit}`]);
  const sha = result.stdout.trim();
  if (!/^[a-f0-9]{40,64}$/i.test(sha)) {
    fail("release_guard_invalid_commit", `${label} did not resolve to a commit: ${ref}.`);
  }
  return sha.toLowerCase();
}

function assertAncestry(root, baselineSha, targetSha) {
  const result = runGit(root, ["merge-base", "--is-ancestor", baselineSha, targetSha], {
    allowStatus: [0, 1],
  });
  if (result.status === 1) {
    fail(
      "release_guard_ancestry_failed",
      `Target ${targetSha} does not descend from baseline ${baselineSha}.`,
    );
  }
}

function inspectRepositoryState(root, targetInput, targetSha) {
  const headSha = resolveCommit(root, "HEAD", "HEAD");
  const worktreeStatus = runGit(root, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]).stdout;
  const targetInputIsExactSha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(targetInput);
  return {
    head: headSha,
    targetInputIsExactSha,
    targetMatchesHead: targetSha === headSha,
    worktreeClean: worktreeStatus.length === 0,
  };
}

function assertReleaseRepositoryState(repositoryState) {
  if (!repositoryState.targetInputIsExactSha) {
    fail(
      "release_guard_target_not_exact_sha",
      "Release mode requires --target to be an exact full commit SHA, not a symbolic ref or abbreviated SHA.",
    );
  }
  if (!repositoryState.targetMatchesHead) {
    fail(
      "release_guard_target_head_mismatch",
      "Release mode requires --target to exactly match the current HEAD commit.",
    );
  }
  if (!repositoryState.worktreeClean) {
    fail(
      "release_guard_dirty_worktree",
      "Release mode requires a clean worktree with no tracked or untracked changes.",
    );
  }
}

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("release_guard_invalid_canonical_value", "Signed evidence contains a non-finite number.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort(compareText)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  fail(
    "release_guard_invalid_canonical_value",
    "Signed evidence may only contain JSON-compatible values.",
  );
}

function sanitizedIdentifier(value, label) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 240 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(value)
  ) {
    fail("release_guard_invalid_trust_policy", `${label} is missing or invalid.`);
  }
  return value;
}

function parseTargetJson(root, targetSha, targetPath, label) {
  const contents = readTargetBlob(root, targetSha, targetPath);
  let parsed;
  try {
    parsed = JSON.parse(contents.toString("utf8"));
  } catch {
    fail("release_guard_invalid_trust_policy", `${label} is not valid JSON.`);
  }
  return { contents, parsed: assertPlainObject(parsed, label) };
}

function parseTrustPolicy(root, targetSha) {
  const targetPolicy = parseTargetJson(
    root,
    targetSha,
    REQUIRED_TARGET_PATHS.trustPolicy,
    "Release trust policy",
  );
  const policy = targetPolicy.parsed;
  if (policy.schemaVersion !== RELEASE_TRUST_POLICY_SCHEMA_VERSION) {
    fail(
      "release_guard_invalid_trust_policy",
      `Release trust policy must use ${RELEASE_TRUST_POLICY_SCHEMA_VERSION}.`,
    );
  }
  const policyId = sanitizedIdentifier(policy.policyId, "Trust policy policyId");
  if (!["configured", "unconfigured"].includes(policy.status)) {
    fail(
      "release_guard_invalid_trust_policy",
      "Release trust policy status must be configured or unconfigured.",
    );
  }
  if (
    !Number.isSafeInteger(policy.maxEvidenceAgeSeconds) ||
    policy.maxEvidenceAgeSeconds < 60 ||
    policy.maxEvidenceAgeSeconds > 7 * 24 * 60 * 60
  ) {
    fail(
      "release_guard_invalid_trust_policy",
      "Release trust policy maxEvidenceAgeSeconds must be between 60 and 604800.",
    );
  }
  if (
    !Number.isSafeInteger(policy.allowedFutureSkewSeconds) ||
    policy.allowedFutureSkewSeconds < 0 ||
    policy.allowedFutureSkewSeconds > 600
  ) {
    fail(
      "release_guard_invalid_trust_policy",
      "Release trust policy allowedFutureSkewSeconds must be between 0 and 600.",
    );
  }

  let expectedProject = null;
  if (policy.expectedProject !== null) {
    const rawProject = assertPlainObject(policy.expectedProject, "Trust policy expectedProject");
    expectedProject = {
      provider: sanitizedIdentifier(rawProject.provider, "Expected deployment provider"),
      projectId: sanitizedIdentifier(rawProject.projectId, "Expected deployment projectId"),
    };
  }

  const requiredEnvironment = assertPlainObject(
    policy.requiredEnvironment,
    "Trust policy requiredEnvironment",
  );
  if (typeof requiredEnvironment.stripeLiveMode !== "boolean") {
    fail(
      "release_guard_invalid_trust_policy",
      "Release trust policy must explicitly require a Stripe live-mode boolean.",
    );
  }

  if (!Array.isArray(policy.authorities)) {
    fail("release_guard_invalid_trust_policy", "Release trust policy authorities must be an array.");
  }
  const evidenceTypes = new Set([...EVIDENCE_OPTIONS.values()].map((entry) => entry.type));
  const authorities = new Map();
  for (const rawAuthority of policy.authorities) {
    const authority = assertPlainObject(rawAuthority, "Release trust authority");
    const authorityId = sanitizedIdentifier(authority.authorityId, "Authority authorityId");
    const keyId = sanitizedIdentifier(authority.keyId, "Authority keyId");
    const source = sanitizedIdentifier(authority.source, "Authority source");
    const mapKey = `${authorityId}\u0000${keyId}`;
    if (authorities.has(mapKey)) {
      fail("release_guard_invalid_trust_policy", "Release trust policy has a duplicate authority key.");
    }
    if (
      !Array.isArray(authority.allowedEvidenceTypes) ||
      authority.allowedEvidenceTypes.length === 0 ||
      authority.allowedEvidenceTypes.some((entry) => !evidenceTypes.has(entry)) ||
      new Set(authority.allowedEvidenceTypes).size !== authority.allowedEvidenceTypes.length
    ) {
      fail(
        "release_guard_invalid_trust_policy",
        `Authority ${authorityId} has invalid allowedEvidenceTypes.`,
      );
    }
    if (
      typeof authority.publicKeyPem !== "string" ||
      authority.publicKeyPem.length > 10_000 ||
      !isSha256(authority.publicKeySha256)
    ) {
      fail(
        "release_guard_invalid_trust_policy",
        `Authority ${authorityId} must pin one Ed25519 public key and its SHA-256 fingerprint.`,
      );
    }
    let publicKey;
    try {
      publicKey = createPublicKey(authority.publicKeyPem);
    } catch {
      fail(
        "release_guard_invalid_trust_policy",
        `Authority ${authorityId} has an invalid public key.`,
      );
    }
    if (publicKey.asymmetricKeyType !== "ed25519") {
      fail(
        "release_guard_invalid_trust_policy",
        `Authority ${authorityId} must use an Ed25519 public key.`,
      );
    }
    const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
    if (hashBuffer(publicKeyDer) !== authority.publicKeySha256.toLowerCase()) {
      fail(
        "release_guard_invalid_trust_policy",
        `Authority ${authorityId} public-key fingerprint does not match the pinned key.`,
      );
    }
    authorities.set(mapKey, {
      authorityId,
      keyId,
      source,
      publicKey,
      publicKeySha256: authority.publicKeySha256.toLowerCase(),
      allowedEvidenceTypes: new Set(authority.allowedEvidenceTypes),
    });
  }

  return {
    schemaVersion: RELEASE_TRUST_POLICY_SCHEMA_VERSION,
    policyId,
    status: policy.status,
    maxEvidenceAgeSeconds: policy.maxEvidenceAgeSeconds,
    allowedFutureSkewSeconds: policy.allowedFutureSkewSeconds,
    expectedProject,
    requiredEnvironment: { stripeLiveMode: requiredEnvironment.stripeLiveMode },
    authorities,
    source: {
      path: REQUIRED_TARGET_PATHS.trustPolicy,
      sizeBytes: targetPolicy.contents.length,
      sha256: hashBuffer(targetPolicy.contents),
    },
  };
}

function parseExternalAuthorities(policy) {
  if (!Array.isArray(policy.authorities) || policy.authorities.length === 0) {
    fail(
      "release_guard_external_trust_policy_invalid",
      "External release trust policy must pin at least one authority.",
    );
  }
  const evidenceTypes = new Set([...EVIDENCE_OPTIONS.values()].map((entry) => entry.type));
  const authorities = new Map();
  for (const rawAuthority of policy.authorities) {
    const authority = assertPlainObject(rawAuthority, "External release trust authority");
    const authorityId = sanitizedIdentifier(authority.authorityId, "Authority authorityId");
    const keyId = sanitizedIdentifier(authority.keyId, "Authority keyId");
    const source = sanitizedIdentifier(authority.source, "Authority source");
    const mapKey = `${authorityId}\u0000${keyId}`;
    if (authorities.has(mapKey)) {
      fail(
        "release_guard_external_trust_policy_invalid",
        "External release trust policy has a duplicate authority key.",
      );
    }
    if (
      !Array.isArray(authority.allowedEvidenceTypes) ||
      authority.allowedEvidenceTypes.length === 0 ||
      authority.allowedEvidenceTypes.some((entry) => !evidenceTypes.has(entry)) ||
      new Set(authority.allowedEvidenceTypes).size !== authority.allowedEvidenceTypes.length
    ) {
      fail(
        "release_guard_external_trust_policy_invalid",
        `External authority ${authorityId} has invalid allowedEvidenceTypes.`,
      );
    }
    const allowedAuthorityPurposes = authority.allowedAuthorityPurposes ?? [];
    if (
      !Array.isArray(allowedAuthorityPurposes) ||
      allowedAuthorityPurposes.some(
        (entry) => entry !== OWNER_DECISION_AUTHORITY_PURPOSE,
      ) ||
      new Set(allowedAuthorityPurposes).size !== allowedAuthorityPurposes.length
    ) {
      fail(
        "release_guard_external_trust_policy_invalid",
        `External authority ${authorityId} has invalid allowedAuthorityPurposes.`,
      );
    }
    if (
      typeof authority.publicKeyPem !== "string" ||
      authority.publicKeyPem.length > 10_000 ||
      !isSha256(authority.publicKeySha256)
    ) {
      fail(
        "release_guard_external_trust_policy_invalid",
        `External authority ${authorityId} must pin one Ed25519 public key and its SHA-256 fingerprint.`,
      );
    }
    let publicKey;
    try {
      publicKey = createPublicKey(authority.publicKeyPem);
    } catch {
      fail(
        "release_guard_external_trust_policy_invalid",
        `External authority ${authorityId} has an invalid public key.`,
      );
    }
    if (publicKey.asymmetricKeyType !== "ed25519") {
      fail(
        "release_guard_external_trust_policy_invalid",
        `External authority ${authorityId} must use an Ed25519 public key.`,
      );
    }
    const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
    if (hashBuffer(publicKeyDer) !== authority.publicKeySha256.toLowerCase()) {
      fail(
        "release_guard_external_trust_policy_invalid",
        `External authority ${authorityId} public-key fingerprint does not match the pinned key.`,
      );
    }
    authorities.set(mapKey, {
      authorityId,
      keyId,
      source,
      publicKey,
      publicKeySha256: authority.publicKeySha256.toLowerCase(),
      allowedEvidenceTypes: new Set(authority.allowedEvidenceTypes),
      allowedAuthorityPurposes: new Set(allowedAuthorityPurposes),
    });
  }
  return authorities;
}

function parseExternalOwnerDecisionAuthority(policy, authorities) {
  if (policy.ownerDecisionAuthority === undefined) return null;
  const owner = assertPlainObject(
    policy.ownerDecisionAuthority,
    "External owner-decision authority policy",
  );
  const exactKeys = [
    "allowSyntheticIsolatedStaging",
    "authorizedEnvelopeSha256",
    "decisionInventorySha256",
    "minimumEnvelopeGeneration",
    "minimumRevocationGeneration",
    "previousEnvelopeSha256",
    "purpose",
    "requirementInventorySha256",
    "templatePath",
    "templateSha256",
  ].sort();
  if (Object.keys(owner).sort().join("\n") !== exactKeys.join("\n") ||
    owner.purpose !== OWNER_DECISION_AUTHORITY_PURPOSE ||
    owner.templatePath !== OWNER_DECISION_TEMPLATE_PATH ||
    !isSha256(owner.templateSha256) ||
    !isSha256(owner.decisionInventorySha256) ||
    !isSha256(owner.requirementInventorySha256) ||
    !isSha256(owner.authorizedEnvelopeSha256) ||
    !Number.isSafeInteger(owner.minimumEnvelopeGeneration) ||
    owner.minimumEnvelopeGeneration < 1 ||
    !Number.isSafeInteger(owner.minimumRevocationGeneration) ||
    owner.minimumRevocationGeneration < 0 ||
    !(owner.previousEnvelopeSha256 === null ||
      isSha256(owner.previousEnvelopeSha256)) ||
    typeof owner.allowSyntheticIsolatedStaging !== "boolean") {
    fail(
      "release_guard_external_trust_policy_invalid",
      "External owner-decision authority policy is invalid.",
    );
  }
  if (![...authorities.values()].some((authority) =>
    authority.allowedAuthorityPurposes.has(OWNER_DECISION_AUTHORITY_PURPOSE))) {
    fail(
      "release_guard_external_trust_policy_invalid",
      "Owner-decision authority requires an Ed25519 authority explicitly scoped by the protected external trust root.",
    );
  }
  return {
    purpose: OWNER_DECISION_AUTHORITY_PURPOSE,
    templatePath: OWNER_DECISION_TEMPLATE_PATH,
    templateSha256: owner.templateSha256.toLowerCase(),
    decisionInventorySha256: owner.decisionInventorySha256.toLowerCase(),
    requirementInventorySha256: owner.requirementInventorySha256.toLowerCase(),
    authorizedEnvelopeSha256: owner.authorizedEnvelopeSha256.toLowerCase(),
    minimumEnvelopeGeneration: owner.minimumEnvelopeGeneration,
    minimumRevocationGeneration: owner.minimumRevocationGeneration,
    previousEnvelopeSha256: owner.previousEnvelopeSha256 === null
      ? null
      : owner.previousEnvelopeSha256.toLowerCase(),
    allowSyntheticIsolatedStaging: owner.allowSyntheticIsolatedStaging,
  };
}

function externalTrustUnavailable(candidatePolicy) {
  return {
    provided: false,
    schemaVersion: EXTERNAL_TRUST_POLICY_SCHEMA_VERSION,
    policyId: null,
    status: "unavailable",
    maxEvidenceAgeSeconds: candidatePolicy.maxEvidenceAgeSeconds,
    allowedFutureSkewSeconds: candidatePolicy.allowedFutureSkewSeconds,
    expectedProject: candidatePolicy.expectedProject,
    requiredEnvironment: candidatePolicy.requiredEnvironment,
    authorities: new Map(),
    authorizedCandidatePolicy: null,
    ownerDecisionAuthority: null,
    rotation: null,
    source: null,
  };
}

function parseExternalTrustPolicy(root, mode, candidatePolicy) {
  const requestedPath = process.env[EXTERNAL_TRUST_POLICY_PATH_ENV]?.trim() ?? "";
  const expectedDigest =
    process.env[EXTERNAL_TRUST_POLICY_SHA256_ENV]?.trim().toLowerCase() ?? "";
  const previousDigest =
    process.env[EXTERNAL_TRUST_PREVIOUS_SHA256_ENV]?.trim().toLowerCase() ?? "";

  if (!requestedPath && !expectedDigest && !previousDigest) {
    if (mode === AUDIT_PREVIEW_MODE) {
      return externalTrustUnavailable(candidatePolicy);
    }
    fail(
      "release_guard_external_trust_root_missing",
      `Release mode requires ${EXTERNAL_TRUST_POLICY_PATH_ENV} and ${EXTERNAL_TRUST_POLICY_SHA256_ENV} from a protected out-of-band source.`,
    );
  }
  if (!requestedPath || !path.isAbsolute(requestedPath) || !isSha256(expectedDigest)) {
    fail(
      "release_guard_external_trust_root_invalid",
      "External trust policy requires an absolute environment-only path and exact SHA-256 digest.",
    );
  }

  const absolutePath = path.resolve(requestedPath);
  const relativeToRepository = path.relative(root, absolutePath);
  if (
    relativeToRepository === "" ||
    (relativeToRepository !== ".." &&
      !relativeToRepository.startsWith(`..${path.sep}`))
  ) {
    fail(
      "release_guard_external_trust_root_inside_repository",
      "External trust policy must be a protected file outside the repository.",
    );
  }
  if (!fs.existsSync(absolutePath)) {
    fail(
      "release_guard_external_trust_root_invalid",
      "External trust policy file does not exist.",
    );
  }
  const stats = fs.lstatSync(absolutePath);
  const parentStats = fs.lstatSync(path.dirname(absolutePath));
  if (
    stats.isSymbolicLink() ||
    !stats.isFile() ||
    (stats.mode & 0o022) !== 0 ||
    parentStats.isSymbolicLink() ||
    !parentStats.isDirectory() ||
    (parentStats.mode & 0o022) !== 0
  ) {
    fail(
      "release_guard_external_trust_root_unprotected",
      "External trust policy and its immediate directory must be non-symlink, private, and not group/world writable.",
    );
  }
  const contents = fs.readFileSync(absolutePath);
  const actualDigest = hashBuffer(contents);
  if (actualDigest !== expectedDigest) {
    fail(
      "release_guard_external_trust_policy_digest_mismatch",
      "External trust policy bytes do not match the independently supplied SHA-256 digest.",
    );
  }

  let policy;
  try {
    policy = assertPlainObject(
      JSON.parse(contents.toString("utf8")),
      "External release trust policy",
    );
  } catch (error) {
    if (error instanceof ReleaseGuardError) throw error;
    fail(
      "release_guard_external_trust_policy_invalid",
      "External release trust policy is not valid JSON.",
    );
  }
  if (policy.schemaVersion !== EXTERNAL_TRUST_POLICY_SCHEMA_VERSION) {
    fail(
      "release_guard_external_trust_policy_invalid",
      `External release trust policy must use ${EXTERNAL_TRUST_POLICY_SCHEMA_VERSION}.`,
    );
  }
  const policyId = sanitizedIdentifier(policy.policyId, "External trust policy policyId");
  if (policy.status !== "configured") {
    fail(
      "release_guard_external_trust_policy_unconfigured",
      "External release trust policy must explicitly be configured.",
    );
  }
  if (
    !Number.isSafeInteger(policy.maxEvidenceAgeSeconds) ||
    policy.maxEvidenceAgeSeconds < 60 ||
    policy.maxEvidenceAgeSeconds > 7 * 24 * 60 * 60 ||
    !Number.isSafeInteger(policy.allowedFutureSkewSeconds) ||
    policy.allowedFutureSkewSeconds < 0 ||
    policy.allowedFutureSkewSeconds > 600
  ) {
    fail(
      "release_guard_external_trust_policy_invalid",
      "External trust policy evidence age/skew settings are invalid.",
    );
  }

  const expectedProjectInput = assertPlainObject(
    policy.expectedProject,
    "External trust policy expectedProject",
  );
  const expectedProject = {
    provider: sanitizedIdentifier(
      expectedProjectInput.provider,
      "Expected deployment provider",
    ),
    projectId: sanitizedIdentifier(
      expectedProjectInput.projectId,
      "Expected deployment projectId",
    ),
  };
  const requiredEnvironmentInput = assertPlainObject(
    policy.requiredEnvironment,
    "External trust policy requiredEnvironment",
  );
  if (typeof requiredEnvironmentInput.stripeLiveMode !== "boolean") {
    fail(
      "release_guard_external_trust_policy_invalid",
      "External trust policy must explicitly require a Stripe live-mode boolean.",
    );
  }

  const candidatePolicyAuthorization = assertPlainObject(
    policy.authorizedCandidatePolicy,
    "External trust policy authorizedCandidatePolicy",
  );
  if (
    candidatePolicyAuthorization.path !== REQUIRED_TARGET_PATHS.trustPolicy ||
    !isSha256(candidatePolicyAuthorization.sha256)
  ) {
    fail(
      "release_guard_external_trust_policy_invalid",
      "External trust policy must authorize the exact repository policy path and digest.",
    );
  }

  const rotationInput = assertPlainObject(policy.rotation, "External trust policy rotation");
  if (!Number.isSafeInteger(rotationInput.generation) || rotationInput.generation < 1) {
    fail(
      "release_guard_external_trust_rotation_invalid",
      "External trust policy rotation generation must be a positive integer.",
    );
  }
  if (rotationInput.generation === 1) {
    if (rotationInput.previousPolicySha256 !== null || previousDigest) {
      fail(
        "release_guard_external_trust_rotation_invalid",
        "Trust bootstrap generation 1 must have no previous-policy digest.",
      );
    }
  } else if (
    !isSha256(rotationInput.previousPolicySha256) ||
    !isSha256(previousDigest) ||
    rotationInput.previousPolicySha256.toLowerCase() !== previousDigest
  ) {
    fail(
      "release_guard_external_trust_rotation_invalid",
      `Trust rotation generation >1 requires ${EXTERNAL_TRUST_PREVIOUS_SHA256_ENV} to match the external policy's previous digest.`,
    );
  }

  const authorities = parseExternalAuthorities(policy);
  const ownerDecisionAuthority = parseExternalOwnerDecisionAuthority(policy, authorities);
  return {
    provided: true,
    schemaVersion: EXTERNAL_TRUST_POLICY_SCHEMA_VERSION,
    policyId,
    status: "configured",
    maxEvidenceAgeSeconds: policy.maxEvidenceAgeSeconds,
    allowedFutureSkewSeconds: policy.allowedFutureSkewSeconds,
    expectedProject,
    requiredEnvironment: {
      stripeLiveMode: requiredEnvironmentInput.stripeLiveMode,
    },
    authorities,
    authorizedCandidatePolicy: {
      path: REQUIRED_TARGET_PATHS.trustPolicy,
      sha256: candidatePolicyAuthorization.sha256.toLowerCase(),
    },
    ownerDecisionAuthority,
    rotation: {
      generation: rotationInput.generation,
      previousPolicySha256:
        rotationInput.previousPolicySha256 === null
          ? null
          : rotationInput.previousPolicySha256.toLowerCase(),
    },
    source: {
      kind: "protected_out_of_band_file",
      sourceId: hashBuffer(Buffer.from(path.basename(absolutePath), "utf8")).slice(0, 16),
      sizeBytes: contents.length,
      sha256: actualDigest,
      expectedDigestMatched: true,
      outsideRepository: true,
      nonSymlinkRegularFile: true,
      groupWorldWritable: false,
    },
  };
}

function assertCandidatePolicyAuthorized(candidatePolicy, externalPolicy) {
  if (!externalPolicy.provided) {
    fail(
      "release_guard_external_trust_root_missing",
      "Release mode cannot use repository-controlled authority material.",
    );
  }
  if (
    externalPolicy.authorizedCandidatePolicy?.path !== candidatePolicy.source.path ||
    externalPolicy.authorizedCandidatePolicy?.sha256 !== candidatePolicy.source.sha256
  ) {
    fail(
      "release_guard_candidate_policy_digest_mismatch",
      "The repository policy at the target commit is not the exact candidate policy authorized by the external trust root.",
    );
  }
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function aggregateEntries(entries) {
  const canonical = entries
    .map((entry) => `${entry.path}\u0000${entry.sizeBytes}\u0000${entry.sha256}`)
    .join("\n");
  return hashBuffer(Buffer.from(canonical, "utf8"));
}

function readTargetBlob(root, targetSha, targetPath) {
  const result = runGit(root, ["show", `${targetSha}:${targetPath}`], { binary: true });
  return result.stdout;
}

function targetBlobEntry(root, targetSha, targetPath) {
  const contents = readTargetBlob(root, targetSha, targetPath);
  return {
    path: targetPath,
    sizeBytes: contents.length,
    sha256: hashBuffer(contents),
  };
}

function listTargetFiles(root, targetSha, targetDirectory) {
  const result = runGit(
    root,
    ["ls-tree", "-r", "--name-only", "-z", targetSha, "--", targetDirectory],
    { binary: true },
  );
  return result.stdout
    .toString("utf8")
    .split("\u0000")
    .filter(Boolean)
    .sort(compareText);
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function evidenceDisplayPath(root, absolutePath) {
  const relativePath = path.relative(root, absolutePath);
  if (relativePath && !relativePath.startsWith(`..${path.sep}`) && relativePath !== "..") {
    return toPosixPath(relativePath);
  }
  if (relativePath === "") {
    return ".";
  }
  return toPosixPath(absolutePath);
}

function assertSafeEvidencePath(displayPath) {
  const segments = displayPath.split("/");
  if (segments.includes(".git") || segments.includes("node_modules")) {
    fail(
      "release_guard_forbidden_evidence_path",
      `Evidence paths may not include .git or node_modules: ${displayPath}.`,
    );
  }
  const basename = segments.at(-1) ?? "";
  if (basename === ".env" || (basename.startsWith(".env.") && basename !== ".env.example")) {
    fail(
      "release_guard_forbidden_evidence_path",
      `Environment secret files may not be included as evidence: ${displayPath}.`,
    );
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("release_guard_invalid_evidence", `${label} must be a JSON object.`);
  }
  return value;
}

function readRegularEvidenceFile(root, requestedPath) {
  const absolutePath = path.resolve(root, requestedPath);
  if (!fs.existsSync(absolutePath)) {
    fail(
      "release_guard_missing_evidence",
      `Supplied evidence path does not exist: ${requestedPath}.`,
    );
  }
  const stats = fs.lstatSync(absolutePath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    fail(
      "release_guard_unsupported_evidence",
      `Evidence must be a regular, non-symbolic-link file: ${requestedPath}.`,
    );
  }
  const displayPath = evidenceDisplayPath(root, absolutePath);
  assertSafeEvidencePath(displayPath);
  const contents = fs.readFileSync(absolutePath);
  return {
    absolutePath,
    contents,
    entry: {
      path: displayPath,
      sizeBytes: contents.length,
      sha256: hashBuffer(contents),
    },
  };
}

function parseEvidenceJson(root, requestedPath) {
  const evidenceFile = readRegularEvidenceFile(root, requestedPath);
  let parsed;
  try {
    parsed = JSON.parse(evidenceFile.contents.toString("utf8"));
  } catch {
    fail(
      "release_guard_invalid_evidence_json",
      `Evidence manifest is not valid JSON: ${evidenceFile.entry.path}.`,
    );
  }
  return {
    ...evidenceFile,
    parsed: assertPlainObject(parsed, `Evidence manifest ${evidenceFile.entry.path}`),
  };
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function validateEvidenceAuthority(manifest, expectedType, trustPolicy, mode) {
  const authority = assertPlainObject(manifest.authority, `${expectedType} evidence authority`);
  const authorityId = sanitizedIdentifier(authority.authorityId, "Evidence authorityId");
  const keyId = sanitizedIdentifier(authority.keyId, "Evidence keyId");
  const source = sanitizedIdentifier(authority.source, "Evidence authority source");
  const pinnedAuthority = trustPolicy.authorities.get(`${authorityId}\u0000${keyId}`);
  if (mode === RELEASE_MODE) {
    if (!pinnedAuthority) {
      fail(
        "release_guard_untrusted_evidence_authority",
        `${expectedType} evidence authority is not pinned by the target-commit trust policy.`,
      );
    }
    if (pinnedAuthority.source !== source) {
      fail(
        "release_guard_evidence_source_mismatch",
        `${expectedType} evidence source does not match its pinned authority.`,
      );
    }
    if (!pinnedAuthority.allowedEvidenceTypes.has(expectedType)) {
      fail(
        "release_guard_evidence_authority_scope_mismatch",
        `${expectedType} evidence is outside the pinned authority scope.`,
      );
    }
  }
  return { authorityId, keyId, source, pinnedAuthority };
}

function validateEvidenceAttestation(manifest, expectedType, authority, mode) {
  if (manifest.attestation === undefined && mode === AUDIT_PREVIEW_MODE) {
    return {
      algorithm: null,
      payloadSha256: hashBuffer(Buffer.from(canonicalJson(manifest), "utf8")),
      signatureProvided: false,
      signatureVerified: false,
      verificationStatus: "UNSIGNED_NON_GATING_PREVIEW",
    };
  }
  if (manifest.attestation === undefined) {
    fail(
      "release_guard_missing_attestation",
      `${expectedType} evidence is unsigned; release mode requires a pinned-authority attestation.`,
    );
  }
  const attestation = assertPlainObject(
    manifest.attestation,
    `${expectedType} evidence attestation`,
  );
  if (attestation.algorithm !== SIGNATURE_ALGORITHM) {
    fail(
      "release_guard_invalid_attestation",
      `${expectedType} evidence must use ${SIGNATURE_ALGORITHM} signatures.`,
    );
  }
  if (!isSha256(attestation.payloadSha256)) {
    fail(
      "release_guard_invalid_attestation",
      `${expectedType} evidence must include a SHA-256 signed-payload digest.`,
    );
  }
  if (
    typeof attestation.signature !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(attestation.signature)
  ) {
    fail(
      "release_guard_invalid_attestation",
      `${expectedType} evidence must include one base64 Ed25519 signature.`,
    );
  }
  const signedPayload = { ...manifest };
  delete signedPayload.attestation;
  const payloadBytes = Buffer.from(canonicalJson(signedPayload), "utf8");
  const payloadSha256 = hashBuffer(payloadBytes);
  if (attestation.payloadSha256.toLowerCase() !== payloadSha256) {
    fail(
      "release_guard_attestation_digest_mismatch",
      `${expectedType} evidence content does not match its signed-payload digest.`,
    );
  }
  const signature = Buffer.from(attestation.signature, "base64");
  if (signature.length !== 64) {
    fail(
      "release_guard_invalid_attestation",
      `${expectedType} evidence signature has an invalid Ed25519 length.`,
    );
  }
  const signatureVerified = Boolean(
    authority.pinnedAuthority &&
      verifySignature(null, payloadBytes, authority.pinnedAuthority.publicKey, signature),
  );
  if (mode === RELEASE_MODE && !signatureVerified) {
    fail(
      "release_guard_attestation_verification_failed",
      `${expectedType} evidence signature was not produced by its target-commit pinned authority.`,
    );
  }
  return {
    algorithm: SIGNATURE_ALGORITHM,
    payloadSha256,
    signatureProvided: true,
    signatureVerified,
    verificationStatus: signatureVerified
      ? "PINNED_AUTHORITY_VERIFIED"
      : "UNVERIFIED_NON_GATING_PREVIEW",
  };
}

function validateCommonEvidence(
  manifest,
  expectedType,
  targetSha,
  targetTimestampMs,
  trustPolicy,
  mode,
) {
  if (manifest.schemaVersion !== RELEASE_EVIDENCE_SCHEMA_VERSION) {
    fail(
      "release_guard_invalid_evidence_schema",
      `Evidence type ${expectedType} must use ${RELEASE_EVIDENCE_SCHEMA_VERSION}.`,
    );
  }
  if (manifest.evidenceType !== expectedType) {
    fail(
      "release_guard_evidence_type_mismatch",
      `Expected ${expectedType} evidence but received a different evidence type.`,
    );
  }
  if (typeof manifest.targetCommit !== "string" || manifest.targetCommit.toLowerCase() !== targetSha) {
    fail(
      "release_guard_evidence_target_mismatch",
      `${expectedType} evidence is not bound to the exact resolved target commit.`,
    );
  }
  if (
    typeof manifest.command !== "string" ||
    manifest.command.trim() === "" ||
    manifest.command.length > 2_000 ||
    /[\r\n\0]/.test(manifest.command) ||
    /\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*=\S+/i.test(
      manifest.command,
    )
  ) {
    fail(
      "release_guard_invalid_evidence_command",
      `${expectedType} evidence must identify one sanitized executed command.`,
    );
  }
  if (manifest.executed !== true) {
    fail(
      "release_guard_evidence_not_executed",
      `${expectedType} evidence must explicitly record executed=true.`,
    );
  }
  if (manifest.exitCode !== 0) {
    fail(
      "release_guard_evidence_nonzero_exit",
      `${expectedType} evidence must record exitCode=0.`,
    );
  }
  if (manifest.status !== "passed") {
    fail(
      "release_guard_evidence_not_passed",
      `${expectedType} evidence must explicitly record status=passed.`,
    );
  }
  if (
    typeof manifest.completedAt !== "string" ||
    !Number.isFinite(Date.parse(manifest.completedAt))
  ) {
    fail(
      "release_guard_invalid_evidence_timestamp",
      `${expectedType} evidence must include a valid completedAt timestamp.`,
    );
  }

  const completedAtMs = Date.parse(manifest.completedAt);
  const nowMs = Date.now();
  if (completedAtMs < targetTimestampMs) {
    fail(
      "release_guard_evidence_predates_target",
      `${expectedType} evidence predates the exact target commit.`,
    );
  }
  if (completedAtMs < nowMs - trustPolicy.maxEvidenceAgeSeconds * 1_000) {
    fail(
      "release_guard_stale_evidence",
      `${expectedType} evidence exceeds the target trust policy recency window.`,
    );
  }
  if (completedAtMs > nowMs + trustPolicy.allowedFutureSkewSeconds * 1_000) {
    fail(
      "release_guard_future_evidence",
      `${expectedType} evidence timestamp exceeds the allowed future skew.`,
    );
  }

  const sourceRun = assertPlainObject(manifest.sourceRun, `${expectedType} evidence sourceRun`);
  const normalizedSourceRun = {
    system: sanitizedIdentifier(sourceRun.system, "Evidence source system"),
    repository: sanitizedIdentifier(sourceRun.repository, "Evidence source repository"),
    workflow: sanitizedIdentifier(sourceRun.workflow, "Evidence source workflow"),
    runId: sanitizedIdentifier(sourceRun.runId, "Evidence source runId"),
  };
  const authority = validateEvidenceAuthority(manifest, expectedType, trustPolicy, mode);
  if (normalizedSourceRun.system !== authority.source) {
    fail(
      "release_guard_evidence_source_mismatch",
      `${expectedType} evidence run system does not match its authority source.`,
    );
  }
  const attestation = validateEvidenceAttestation(manifest, expectedType, authority, mode);

  return {
    schemaVersion: RELEASE_EVIDENCE_SCHEMA_VERSION,
    evidenceType: expectedType,
    targetCommit: targetSha,
    command: manifest.command,
    executed: true,
    exitCode: 0,
    status: "passed",
    completedAt: manifest.completedAt,
    sourceRun: normalizedSourceRun,
    authority: {
      authorityId: authority.authorityId,
      keyId: authority.keyId,
      source: authority.source,
      publicKeySha256: authority.pinnedAuthority?.publicKeySha256 ?? null,
    },
    attestation,
    structurallyValidated: true,
    authoritativeValidated: attestation.signatureVerified,
  };
}

function readManifestArtifact(root, manifestPath, artifact) {
  assertPlainObject(artifact, "Evidence artifact");
  if (
    typeof artifact.path !== "string" ||
    artifact.path.trim() === "" ||
    path.isAbsolute(artifact.path)
  ) {
    fail(
      "release_guard_invalid_evidence_artifact",
      "Evidence artifact paths must be non-empty paths relative to their manifest.",
    );
  }
  if (!isSha256(artifact.sha256)) {
    fail(
      "release_guard_invalid_evidence_artifact",
      `Evidence artifact ${artifact.path} must include a SHA-256 digest.`,
    );
  }

  const manifestDirectory = path.dirname(manifestPath);
  const absolutePath = path.resolve(manifestDirectory, artifact.path);
  const relativeToManifest = path.relative(manifestDirectory, absolutePath);
  if (
    relativeToManifest === "" ||
    relativeToManifest === ".." ||
    relativeToManifest.startsWith(`..${path.sep}`)
  ) {
    fail(
      "release_guard_unsafe_evidence_artifact",
      `Evidence artifact must remain inside its manifest directory: ${artifact.path}.`,
    );
  }
  const file = readRegularEvidenceFile(root, absolutePath);
  if (file.contents.length === 0) {
    fail(
      "release_guard_empty_evidence",
      `Evidence artifact is empty: ${file.entry.path}.`,
    );
  }
  if (file.entry.sha256 !== artifact.sha256.toLowerCase()) {
    fail(
      "release_guard_evidence_hash_mismatch",
      `Evidence artifact digest does not match its manifest: ${file.entry.path}.`,
    );
  }
  return { file, declared: artifact };
}

function validateArtifactEvidence(root, evidenceFile, common) {
  if (!Array.isArray(evidenceFile.parsed.artifacts) || evidenceFile.parsed.artifacts.length === 0) {
    fail(
      "release_guard_empty_evidence",
      `${common.evidenceType} evidence must bind at least one non-empty artifact.`,
    );
  }
  const seenPaths = new Set();
  const files = evidenceFile.parsed.artifacts.map((artifact) => {
    const validated = readManifestArtifact(root, evidenceFile.absolutePath, artifact);
    if (seenPaths.has(validated.file.entry.path)) {
      fail(
        "release_guard_duplicate_evidence_artifact",
        `Duplicate evidence artifact: ${validated.file.entry.path}.`,
      );
    }
    seenPaths.add(validated.file.entry.path);
    return validated.file.entry;
  });
  files.sort((left, right) => compareText(left.path, right.path));
  return {
    ...common,
    manifest: evidenceFile.entry,
    artifactCount: files.length,
    aggregateSha256: aggregateEntries(files),
    files,
    validated: common.authoritativeValidated,
  };
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

function inspectPng(contents, displayPath) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contents.length < 45 || !contents.subarray(0, 8).equals(signature)) {
    fail("release_guard_invalid_png", `Visual evidence is not a PNG file: ${displayPath}.`);
  }

  let offset = 8;
  let chunkIndex = 0;
  let dimensions = null;
  let imageFormat = null;
  const idatChunks = [];
  let sawIdat = false;
  let sawIend = false;
  while (offset < contents.length) {
    if (offset + 12 > contents.length) {
      fail("release_guard_invalid_png", `PNG chunk is truncated: ${displayPath}.`);
    }
    const dataLength = contents.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + dataLength;
    const crcOffset = dataEnd;
    if (crcOffset + 4 > contents.length) {
      fail("release_guard_invalid_png", `PNG chunk length is invalid: ${displayPath}.`);
    }
    const typeBuffer = contents.subarray(typeStart, dataStart);
    const type = typeBuffer.toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type)) {
      fail("release_guard_invalid_png", `PNG chunk type is invalid: ${displayPath}.`);
    }
    const expectedCrc = contents.readUInt32BE(crcOffset);
    const actualCrc = crc32(contents.subarray(typeStart, dataEnd));
    if (actualCrc !== expectedCrc) {
      fail("release_guard_invalid_png", `PNG chunk checksum is invalid: ${displayPath}.`);
    }

    if (chunkIndex === 0 && type !== "IHDR") {
      fail("release_guard_invalid_png", `PNG IHDR must be the first chunk: ${displayPath}.`);
    }
    if (type === "IHDR") {
      if (dimensions || dataLength !== 13) {
        fail("release_guard_invalid_png", `PNG IHDR is invalid: ${displayPath}.`);
      }
      const width = contents.readUInt32BE(dataStart);
      const height = contents.readUInt32BE(dataStart + 4);
      const bitDepth = contents[dataStart + 8];
      const colorType = contents[dataStart + 9];
      const compressionMethod = contents[dataStart + 10];
      const filterMethod = contents[dataStart + 11];
      const interlaceMethod = contents[dataStart + 12];
      const validDepthsByColorType = new Map([
        [0, new Set([1, 2, 4, 8, 16])],
        [2, new Set([8, 16])],
        [3, new Set([1, 2, 4, 8])],
        [4, new Set([8, 16])],
        [6, new Set([8, 16])],
      ]);
      if (width === 0 || height === 0) {
        fail("release_guard_invalid_png", `PNG dimensions must be positive: ${displayPath}.`);
      }
      if (
        !validDepthsByColorType.get(colorType)?.has(bitDepth) ||
        compressionMethod !== 0 ||
        filterMethod !== 0 ||
        ![0, 1].includes(interlaceMethod)
      ) {
        fail("release_guard_invalid_png", `PNG image format is invalid: ${displayPath}.`);
      }
      dimensions = { width, height };
      imageFormat = { bitDepth, colorType, interlaceMethod };
    } else if (type === "IDAT") {
      sawIdat = true;
      idatChunks.push(contents.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      if (dataLength !== 0 || !sawIdat || crcOffset + 4 !== contents.length) {
        fail("release_guard_invalid_png", `PNG IEND structure is invalid: ${displayPath}.`);
      }
      sawIend = true;
    }

    offset = crcOffset + 4;
    chunkIndex += 1;
  }

  if (!dimensions || !sawIdat || !sawIend) {
    fail("release_guard_invalid_png", `PNG structure is incomplete: ${displayPath}.`);
  }
  try {
    const decoded = inflateSync(Buffer.concat(idatChunks));
    if (decoded.length === 0) {
      fail("release_guard_invalid_png", `PNG image data is empty: ${displayPath}.`);
    }
    if (imageFormat?.interlaceMethod === 0) {
      const channelsByColorType = new Map([
        [0, 1],
        [2, 3],
        [3, 1],
        [4, 2],
        [6, 4],
      ]);
      const channels = channelsByColorType.get(imageFormat.colorType);
      const rowBytes = Math.ceil(
        (dimensions.width * channels * imageFormat.bitDepth) / 8,
      );
      if (decoded.length !== dimensions.height * (rowBytes + 1)) {
        fail("release_guard_invalid_png", `PNG decoded image size is invalid: ${displayPath}.`);
      }
    }
  } catch (error) {
    if (error instanceof ReleaseGuardError) {
      throw error;
    }
    fail("release_guard_invalid_png", `PNG image data cannot be decoded: ${displayPath}.`);
  }
  return dimensions;
}

function validateVisualEvidence(root, evidenceFile, common) {
  if (!Array.isArray(evidenceFile.parsed.images) || evidenceFile.parsed.images.length === 0) {
    fail("release_guard_empty_evidence", "Visual evidence must bind at least one PNG image.");
  }
  const seenPaths = new Set();
  const images = evidenceFile.parsed.images.map((image) => {
    const validated = readManifestArtifact(root, evidenceFile.absolutePath, image);
    if (seenPaths.has(validated.file.entry.path)) {
      fail(
        "release_guard_duplicate_evidence_artifact",
        `Duplicate visual evidence image: ${validated.file.entry.path}.`,
      );
    }
    seenPaths.add(validated.file.entry.path);
    const dimensions = inspectPng(validated.file.contents, validated.file.entry.path);
    if (
      !Number.isSafeInteger(image.width) ||
      !Number.isSafeInteger(image.height) ||
      image.width !== dimensions.width ||
      image.height !== dimensions.height
    ) {
      fail(
        "release_guard_visual_dimensions_mismatch",
        `PNG dimensions do not match the visual evidence manifest: ${validated.file.entry.path}.`,
      );
    }
    return {
      ...validated.file.entry,
      width: dimensions.width,
      height: dimensions.height,
    };
  });
  images.sort((left, right) => compareText(left.path, right.path));
  return {
    ...common,
    manifest: evidenceFile.entry,
    imageCount: images.length,
    images,
    validated: common.authoritativeValidated,
  };
}

function validateSchemaEvidence(root, evidenceFile, common) {
  if (evidenceFile.parsed.command !== "SUPABASE_SCHEMA_CHECK_MODE=remote npm run schema:check") {
    fail(
      "release_guard_invalid_schema_command",
      "Schema evidence must be produced by the exact remote schema validation command.",
    );
  }
  const checks = assertPlainObject(evidenceFile.parsed.checks, "Schema evidence checks");
  if (checks.requiredMigrationFiles !== true || checks.remoteSchema !== true) {
    fail(
      "release_guard_incomplete_schema_evidence",
      "Schema evidence must confirm both required migration files and the remote schema check.",
    );
  }
  return {
    ...validateArtifactEvidence(root, evidenceFile, common),
    validationMode: "remote",
    checks: {
      requiredMigrationFiles: true,
      remoteSchema: true,
    },
  };
}

function validateExactKeys(value, expectedKeys, label) {
  const actualKeys = Object.keys(value).sort(compareText);
  const normalizedExpectedKeys = [...expectedKeys].sort(compareText);
  if (
    actualKeys.length !== normalizedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== normalizedExpectedKeys[index])
  ) {
    fail(
      "release_guard_invalid_environment_attestation",
      `${label} must contain only the documented non-secret fields.`,
    );
  }
}

function validateDeploymentIdentity(rawDeployment, trustPolicy, label) {
  const deployment = assertPlainObject(rawDeployment, label);
  validateExactKeys(deployment, ["deploymentId", "projectId", "provider"], label);
  const normalized = {
    provider: sanitizedIdentifier(deployment.provider, `${label} provider`),
    projectId: sanitizedIdentifier(deployment.projectId, `${label} projectId`),
    deploymentId: sanitizedIdentifier(deployment.deploymentId, `${label} deploymentId`),
  };
  if (
    trustPolicy.expectedProject &&
    (normalized.provider !== trustPolicy.expectedProject.provider ||
      normalized.projectId !== trustPolicy.expectedProject.projectId)
  ) {
    fail(
      "release_guard_deployment_project_mismatch",
      `${label} does not identify the exact project pinned by the target trust policy.`,
    );
  }
  return normalized;
}

function validateEnvironmentEvidence(evidenceFile, common, trustPolicy) {
  validateExactKeys(
    evidenceFile.parsed,
    [
      ...(common.attestation.signatureProvided ? ["attestation"] : []),
      "authority",
      "command",
      "completedAt",
      "deployment",
      "environment",
      "evidenceType",
      "executed",
      "exitCode",
      "schemaVersion",
      "sourceRun",
      "status",
      "targetCommit",
    ],
    "Deployment environment evidence",
  );
  const deployment = validateDeploymentIdentity(
    evidenceFile.parsed.deployment,
    trustPolicy,
    "Environment attestation deployment",
  );
  const environment = assertPlainObject(
    evidenceFile.parsed.environment,
    "Environment attestation environment",
  );
  validateExactKeys(
    environment,
    [
      "configurationPolicies",
      "containsSecretValues",
      "safeFlagStates",
      "secretStrengthPolicies",
      "stripeLiveMode",
    ],
    "Environment attestation environment",
  );
  if (environment.containsSecretValues !== false) {
    fail(
      "release_guard_environment_contains_secrets",
      "Environment attestation must explicitly contain no secret values.",
    );
  }
  if (environment.stripeLiveMode !== trustPolicy.requiredEnvironment.stripeLiveMode) {
    fail(
      "release_guard_stripe_mode_mismatch",
      "Environment attestation Stripe mode does not match the target trust policy.",
    );
  }
  const safeFlagStates = assertPlainObject(
    environment.safeFlagStates,
    "Environment attestation safeFlagStates",
  );
  validateExactKeys(
    safeFlagStates,
    [...REQUIRED_FAIL_SAFE_DEFAULTS.keys()],
    "Environment attestation safeFlagStates",
  );
  for (const [flagName, matchesRequiredState] of Object.entries(safeFlagStates)) {
    if (matchesRequiredState !== true) {
      fail(
        "release_guard_unsafe_deployed_flag_state",
        `Environment attestation did not prove the required safe deployed state for ${flagName}.`,
      );
    }
  }
  const secretStrengthPolicies = assertPlainObject(
    environment.secretStrengthPolicies,
    "Environment attestation secretStrengthPolicies",
  );
  validateExactKeys(
    secretStrengthPolicies,
    REQUIRED_SECRET_STRENGTH_POLICIES,
    "Environment attestation secretStrengthPolicies",
  );
  for (const [policyName, satisfied] of Object.entries(secretStrengthPolicies)) {
    if (satisfied !== true) {
      fail(
        "release_guard_secret_strength_policy_failed",
        `Environment attestation did not prove required secret-strength policy ${policyName}.`,
      );
    }
  }
  const configurationPolicies = assertPlainObject(
    environment.configurationPolicies,
    "Environment attestation configurationPolicies",
  );
  validateExactKeys(
    configurationPolicies,
    REQUIRED_DEPLOYMENT_CONFIGURATION_POLICIES,
    "Environment attestation configurationPolicies",
  );
  for (const [policyName, satisfied] of Object.entries(configurationPolicies)) {
    if (satisfied !== true) {
      fail(
        "release_guard_deployment_configuration_policy_failed",
        `Environment attestation did not prove required production configuration policy ${policyName}.`,
      );
    }
  }
  return {
    ...common,
    manifest: evidenceFile.entry,
    deployment,
    environment: {
      containsSecretValues: false,
      stripeLiveMode: environment.stripeLiveMode,
      safeFlagStates: Object.fromEntries(
        [...REQUIRED_FAIL_SAFE_DEFAULTS.keys()]
          .sort(compareText)
          .map((flagName) => [flagName, true]),
      ),
      secretStrengthPolicies: Object.fromEntries(
        REQUIRED_SECRET_STRENGTH_POLICIES.map((policyName) => [policyName, true]),
      ),
      configurationPolicies: Object.fromEntries(
        REQUIRED_DEPLOYMENT_CONFIGURATION_POLICIES.map((policyName) => [
          policyName,
          true,
        ]),
      ),
    },
    validated: common.authoritativeValidated,
  };
}

function validateDrainEvidence(evidenceFile, common, trustPolicy) {
  const deployment = validateDeploymentIdentity(
    evidenceFile.parsed.deployment,
    trustPolicy,
    "Old-worker drain deployment",
  );
  if (!Array.isArray(evidenceFile.parsed.checks)) {
    fail(
      "release_guard_incomplete_drain_evidence",
      "Old-worker drain evidence must include explicit worker-class checks.",
    );
  }
  const checkByClass = new Map();
  for (const rawCheck of evidenceFile.parsed.checks) {
    const check = assertPlainObject(rawCheck, "Old-worker drain check");
    if (
      typeof check.workerClass !== "string" ||
      !Number.isSafeInteger(check.activeCount) ||
      check.activeCount < 0 ||
      checkByClass.has(check.workerClass)
    ) {
      fail(
        "release_guard_incomplete_drain_evidence",
        "Old-worker drain checks must contain unique worker classes and non-negative integer counts.",
      );
    }
    checkByClass.set(check.workerClass, check.activeCount);
  }
  for (const workerClass of REQUIRED_OLD_WORKER_CLASSES) {
    if (!checkByClass.has(workerClass)) {
      fail(
        "release_guard_incomplete_drain_evidence",
        `Old-worker drain evidence is missing required class ${workerClass}.`,
      );
    }
    if (checkByClass.get(workerClass) !== 0) {
      fail(
        "release_guard_old_workers_active",
        `Old-worker drain has not reached zero for ${workerClass}.`,
      );
    }
  }
  if (checkByClass.size !== REQUIRED_OLD_WORKER_CLASSES.length) {
    fail(
      "release_guard_incomplete_drain_evidence",
      "Old-worker drain evidence contains an unexpected worker class.",
    );
  }
  return {
    ...common,
    manifest: evidenceFile.entry,
    deployment,
    checks: REQUIRED_OLD_WORKER_CLASSES.map((workerClass) => ({
      workerClass,
      activeCount: 0,
    })),
    validated: common.authoritativeValidated,
  };
}

function evidenceManifest(root, requestedPaths, expectedType, context) {
  if (requestedPaths.length === 0) {
    return { provided: false, structurallyValidated: false, validated: false };
  }
  const evidenceFile = parseEvidenceJson(root, requestedPaths[0]);
  const common = validateCommonEvidence(
    evidenceFile.parsed,
    expectedType,
    context.targetSha,
    context.targetTimestampMs,
    context.trustPolicy,
    context.mode,
  );
  if (expectedType === "visual") {
    return { provided: true, ...validateVisualEvidence(root, evidenceFile, common) };
  }
  if (expectedType === "schema-validation") {
    return { provided: true, ...validateSchemaEvidence(root, evidenceFile, common) };
  }
  if (expectedType === "old-worker-drain") {
    return {
      provided: true,
      ...validateDrainEvidence(evidenceFile, common, context.trustPolicy),
    };
  }
  if (expectedType === "deployment-environment") {
    return {
      provided: true,
      ...validateEnvironmentEvidence(evidenceFile, common, context.trustPolicy),
    };
  }
  return { provided: true, ...validateArtifactEvidence(root, evidenceFile, common) };
}

function isFeatureFlagName(name) {
  return (
    /^(ALLOW|ENABLE|DISABLE|REQUIRE)_/.test(name) ||
    /^NEXT_PUBLIC_(ALLOW|ENABLE|DISABLE|REQUIRE)_/.test(name) ||
    /(^|_)ALLOW_[A-Z0-9_]+$/.test(name) ||
    /(^|_)ENABLE_[A-Z0-9_]+$/.test(name) ||
    /_ENABLED$/.test(name) ||
    /_(SAFE|TEST|MOCK|EXECUTION)_MODE$/.test(name) ||
    /^TEST_[A-Z0-9_]+_MODE$/.test(name) ||
    /_(PREVIEW|ACK)$/.test(name)
  );
}

function parseFeatureFlagNames(environmentExample) {
  const flagNames = new Set();
  for (const rawLine of environmentExample.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const separator = line.indexOf("=");
    const name = line.slice(0, separator).trim();
    if (!isFeatureFlagName(name)) {
      continue;
    }
    if (flagNames.has(name)) {
      fail("release_guard_duplicate_flag", `Duplicate feature flag in .env.example: ${name}.`);
    }
    flagNames.add(name);
  }

  const names = [...flagNames].sort(compareText);
  if (names.length === 0) {
    fail(
      "release_guard_missing_flags",
      "No fail-safe feature flags were discoverable in target .env.example.",
    );
  }
  return names;
}

function validateFailSafeEnvironmentDefaults(environmentExample) {
  const assignments = new Map();
  for (const rawLine of environmentExample.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const separator = line.indexOf("=");
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (assignments.has(name)) {
      fail(
        "release_guard_duplicate_environment_assignment",
        `Duplicate environment assignment in target .env.example: ${name}.`,
      );
    }
    assignments.set(name, value);
  }

  for (const [name, expectedValue] of REQUIRED_FAIL_SAFE_DEFAULTS) {
    if (!assignments.has(name)) {
      fail(
        "release_guard_missing_fail_safe_default",
        `Target .env.example is missing required fail-safe default ${name}.`,
      );
    }
    if (assignments.get(name) !== expectedValue) {
      fail(
        "release_guard_unsafe_fail_safe_default",
        `Target .env.example does not use the required fail-safe default for ${name}.`,
      );
    }
  }

  return [...REQUIRED_FAIL_SAFE_DEFAULTS.keys()].sort(compareText);
}

function buildExclusions(evidence) {
  const exclusions = [
    {
      category: "credentials_and_secrets",
      reason: "Secret-bearing environment files, raw credentials, and all environment values are excluded; only release-gate names and the target .env.example digest are emitted.",
    },
    {
      category: "git_internals",
      reason: "Git object storage, refs, logs, and hooks are excluded.",
    },
    {
      category: "external_trust_root_location_and_private_keys",
      reason: "The protected external policy absolute path and all signing private keys are excluded; only a sanitized source ID, policy digest, and public-key fingerprints are emitted.",
    },
    {
      category: "installed_dependencies",
      reason: "node_modules contents are excluded; the exact target package-lock.json is hashed instead.",
    },
    {
      category: "live_external_state",
      reason: "Customer, provider, billing, CRM, deployment, and production data are outside this local release manifest.",
    },
    {
      category: "working_tree_changes",
      reason: "Repository-controlled hashes are read from the resolved target commit; release mode additionally rejects any uncommitted working-tree content.",
    },
  ];

  for (const evidenceOption of EVIDENCE_OPTIONS.values()) {
    if (!evidence[evidenceOption.key].provided) {
      exclusions.push({
        category: `${evidenceOption.key}_not_supplied`,
        reason: `No explicit ${evidenceOption.label} manifest was supplied; the guard does not infer or claim that evidence.`,
      });
    }
  }

  return exclusions.sort((left, right) => compareText(left.category, right.category));
}

function generateManifest(root, parsed) {
  const baselineSha = resolveCommit(root, parsed.baseline, "baseline");
  const targetSha = resolveCommit(root, parsed.target, "target");
  assertAncestry(root, baselineSha, targetSha);
  const repositoryState = inspectRepositoryState(root, parsed.target, targetSha);
  if (parsed.mode === RELEASE_MODE) {
    assertReleaseRepositoryState(repositoryState);
  }
  const targetTimestamp = runGit(root, ["show", "-s", "--format=%cI", targetSha]).stdout.trim();
  const targetTimestampMs = Date.parse(targetTimestamp);
  if (!Number.isFinite(targetTimestampMs)) {
    fail("release_guard_invalid_commit", "Target commit timestamp is invalid.");
  }
  const candidatePolicy = parseTrustPolicy(root, targetSha);
  const externalTrustPolicy = parseExternalTrustPolicy(
    root,
    parsed.mode,
    candidatePolicy,
  );
  if (parsed.mode === RELEASE_MODE) {
    assertCandidatePolicyAuthorized(candidatePolicy, externalTrustPolicy);
  }

  const packageLock = targetBlobEntry(root, targetSha, REQUIRED_TARGET_PATHS.packageLock);
  const migrationPaths = listTargetFiles(
    root,
    targetSha,
    REQUIRED_TARGET_PATHS.migrationsDirectory,
  );
  if (migrationPaths.length === 0) {
    fail(
      "release_guard_missing_migrations",
      `Target commit contains no files under ${REQUIRED_TARGET_PATHS.migrationsDirectory}.`,
    );
  }
  const migrationFiles = migrationPaths.map((migrationPath) =>
    targetBlobEntry(root, targetSha, migrationPath),
  );

  const environmentExample = readTargetBlob(
    root,
    targetSha,
    REQUIRED_TARGET_PATHS.environmentExample,
  );
  const environmentExampleText = environmentExample.toString("utf8");
  const featureFlagNames = parseFeatureFlagNames(environmentExampleText);
  const failSafeDefaultNames = validateFailSafeEnvironmentDefaults(environmentExampleText);
  const evidenceContext = {
    targetSha,
    targetTimestampMs,
    trustPolicy: externalTrustPolicy,
    mode: parsed.mode,
  };
  const evidence = {
    buildEvidence: evidenceManifest(root, parsed.buildEvidence, "build", evidenceContext),
    testEvidence: evidenceManifest(root, parsed.testEvidence, "test", evidenceContext),
    schemaEvidence: evidenceManifest(
      root,
      parsed.schemaEvidence,
      "schema-validation",
      evidenceContext,
    ),
    visualEvidence: evidenceManifest(
      root,
      parsed.visualEvidence,
      "visual",
      evidenceContext,
    ),
    drainEvidence: evidenceManifest(
      root,
      parsed.drainEvidence,
      "old-worker-drain",
      evidenceContext,
    ),
    environmentEvidence: evidenceManifest(
      root,
      parsed.environmentEvidence,
      "deployment-environment",
      evidenceContext,
    ),
  };
  if (
    evidence.drainEvidence.provided &&
    evidence.environmentEvidence.provided &&
    canonicalJson(evidence.drainEvidence.deployment) !==
      canonicalJson(evidence.environmentEvidence.deployment)
  ) {
    fail(
      "release_guard_exact_deployment_mismatch",
      "Old-worker drain and environment attestations do not identify the same exact deployment.",
    );
  }
  const allEvidenceValidated = [...EVIDENCE_OPTIONS.values()].every(
    (evidenceOption) => evidence[evidenceOption.key].validated === true,
  );
  const allEvidenceStructurallyValidated = [...EVIDENCE_OPTIONS.values()].every(
    (evidenceOption) => evidence[evidenceOption.key].structurallyValidated === true,
  );
  if (parsed.mode === RELEASE_MODE && !allEvidenceValidated) {
    fail(
      "release_guard_evidence_validation_failed",
      "Release mode requires every evidence class to be present and validated.",
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    gate: {
      mode: parsed.mode,
      enforced: parsed.mode === RELEASE_MODE,
      decision: parsed.mode === RELEASE_MODE ? "PASS" : "NON_GATING_PREVIEW",
      decisionAuthority:
        parsed.mode === RELEASE_MODE
          ? "PROTECTED_EXTERNAL_TRUST_RELEASE_GUARD"
          : "NONE",
      currentReleaseEvidenceSnapshotAuthoritative: false,
      repositoryState,
      requiredEvidence: {
        build: evidence.buildEvidence.provided,
        test: evidence.testEvidence.provided,
        schemaValidation: evidence.schemaEvidence.provided,
        visual: evidence.visualEvidence.provided,
        oldWorkerDrain: evidence.drainEvidence.provided,
        deploymentEnvironment: evidence.environmentEvidence.provided,
      },
      allEvidenceValidated,
      allEvidenceStructurallyValidated,
    },
    release: {
      baseline: baselineSha,
      target: targetSha,
      targetCommitterTimestamp: targetTimestamp,
      ancestryVerified: true,
      repositoryContentSource: "resolved_target_commit",
    },
    repositoryArtifacts: {
      releaseTrustPolicy: {
        repositoryCandidatePolicy: {
          source: candidatePolicy.source,
          schemaVersion: candidatePolicy.schemaVersion,
          policyId: candidatePolicy.policyId,
          status: candidatePolicy.status,
          declaredAuthorityCount: candidatePolicy.authorities.size,
          authorityMaterialUsedForVerification: false,
          externallyAuthorizedDigest:
            externalTrustPolicy.authorizedCandidatePolicy?.sha256 ?? null,
          digestAuthorized:
            externalTrustPolicy.authorizedCandidatePolicy?.sha256 ===
            candidatePolicy.source.sha256,
        },
        externalTrustRoot: {
          provided: externalTrustPolicy.provided,
          source: externalTrustPolicy.source,
          schemaVersion: externalTrustPolicy.schemaVersion,
          policyId: externalTrustPolicy.policyId,
          status: externalTrustPolicy.status,
          rotation: externalTrustPolicy.rotation,
          expectedProject: externalTrustPolicy.expectedProject,
          authorityCount: externalTrustPolicy.authorities.size,
          authorities: [...externalTrustPolicy.authorities.values()]
          .map((authority) => ({
            authorityId: authority.authorityId,
            keyId: authority.keyId,
            source: authority.source,
            publicKeySha256: authority.publicKeySha256,
            allowedEvidenceTypes: [...authority.allowedEvidenceTypes].sort(compareText),
            allowedAuthorityPurposes:
              [...authority.allowedAuthorityPurposes].sort(compareText),
          }))
          .sort((left, right) => compareText(left.authorityId, right.authorityId)),
          maxEvidenceAgeSeconds: externalTrustPolicy.maxEvidenceAgeSeconds,
          allowedFutureSkewSeconds: externalTrustPolicy.allowedFutureSkewSeconds,
          requiredEnvironment: externalTrustPolicy.requiredEnvironment,
          ownerDecisionAuthority: externalTrustPolicy.ownerDecisionAuthority,
        },
      },
      packageLock,
      migrations: {
        directory: REQUIRED_TARGET_PATHS.migrationsDirectory,
        fileCount: migrationFiles.length,
        aggregateSha256: aggregateEntries(migrationFiles),
        files: migrationFiles,
      },
      environmentInventory: {
        source: targetBlobEntry(root, targetSha, REQUIRED_TARGET_PATHS.environmentExample),
        releaseGateNameCount: featureFlagNames.length,
        releaseGateNames: featureFlagNames,
        failSafeDefaultsValidated: true,
        failSafeDefaultNameCount: failSafeDefaultNames.length,
        failSafeDefaultNames,
      },
    },
    suppliedEvidence: evidence,
    exclusions: buildExclusions(evidence),
  };
}

function writeManifest(root, parsed, manifest) {
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!parsed.output) {
    process.stdout.write(serialized);
    return;
  }

  const outputPath = path.resolve(root, parsed.output);
  assertSafeEvidencePath(evidenceDisplayPath(root, outputPath));
  const outputRelativeToRoot = path.relative(root, outputPath);
  if (
    parsed.mode === RELEASE_MODE &&
    (outputRelativeToRoot === "" ||
      (!outputRelativeToRoot.startsWith(`..${path.sep}`) && outputRelativeToRoot !== ".."))
  ) {
    fail(
      "release_guard_unsafe_output",
      "Release-mode output must be written outside the repository so the verified clean-worktree state remains true.",
    );
  }
  for (const evidenceInput of [
    ...parsed.buildEvidence,
    ...parsed.testEvidence,
    ...parsed.schemaEvidence,
    ...parsed.visualEvidence,
    ...parsed.drainEvidence,
    ...parsed.environmentEvidence,
  ]) {
    const absoluteEvidenceInput = path.resolve(root, evidenceInput);
    const relativeToEvidence = path.relative(absoluteEvidenceInput, outputPath);
    if (
      relativeToEvidence === "" ||
      (!relativeToEvidence.startsWith(`..${path.sep}`) && relativeToEvidence !== "..")
    ) {
      fail(
        "release_guard_unsafe_output",
        `Output path may not overwrite or be nested inside supplied evidence: ${parsed.output}.`,
      );
    }
  }
  if (fs.existsSync(outputPath) && fs.lstatSync(outputPath).isSymbolicLink()) {
    fail("release_guard_unsafe_output", `Refusing to overwrite symbolic link: ${parsed.output}.`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(outputPath, 0o600);
}

export {
  ReleaseGuardError,
  aggregateEntries,
  generateManifest,
  parseArguments,
  parseFeatureFlagNames,
  validateFailSafeEnvironmentDefaults,
};

function main() {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    if (parsed.help) {
      process.stdout.write(`${USAGE}\n`);
      return;
    }
    const root = process.cwd();
    const manifest = generateManifest(root, parsed);
    writeManifest(root, parsed, manifest);
  } catch (error) {
    const code = error instanceof ReleaseGuardError ? error.code : "release_guard_unexpected_error";
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`NO_GO ${code}: ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
