#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as createSignature,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(scriptDirectory, "generate-release-guard.mjs");
const repositoryTrustPolicyPath = path.join(
  scriptDirectory,
  "..",
  "docs",
  "dealflow-completion",
  "release-trust-policy.json",
);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-release-guard-"));
const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-release-evidence-"));
const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-release-output-"));
const trustRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dealflow-release-trust-"));
const evidenceSchemaVersion = "dealflow.release-evidence.v2";
const trustPolicySchemaVersion = "dealflow.release-trust-policy.v1";
const externalTrustPolicySchemaVersion = "dealflow.external-release-trust-policy.v1";
const externalTrustPathEnv = "DEALFLOW_RELEASE_TRUST_POLICY_PATH";
const externalTrustShaEnv = "DEALFLOW_RELEASE_TRUST_POLICY_SHA256";
const externalTrustPreviousShaEnv = "DEALFLOW_RELEASE_TRUST_PREVIOUS_POLICY_SHA256";
const secretSentinel = "sentinel-openai-secret-value";
const deployment = {
  provider: "fixture-provider",
  projectId: "fixture-project",
  deploymentId: "fixture-deployment-20260711",
};
const authorityIdentity = {
  authorityId: "fixture-release-authority",
  keyId: "fixture-ed25519-20260711",
  source: "fixture-ci",
};
const workerClasses = [
  "campaign_plan_v0_writers",
  "meta_launch_v0_workers",
  "sms_delivery_v0_workers",
  "stripe_webhook_v1_workers",
  "system_job_v1_workers",
];
const secretStrengthPolicyNames = [
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
const deploymentConfigurationPolicyNames = [
  "metaCapiConsentPolicyVersionConfigured",
  "metaPixelConsentPolicyVersionConfigured",
  "turnstileAllowedHostnamesConfigured",
  "turnstileProductionConfigValid",
  "turnstileSecretKeyNonTest",
  "turnstileSiteKeyNonTest",
];
const requiredFailSafeNames = [
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
];
const safeEnvironmentLines = [
  "SCHEMA_VALIDATION_MODE=block",
  "SUPABASE_SCHEMA_CHECK_MODE=remote",
  "DEALFLOW_DEPLOYMENT_TARGET=production",
  "QA_AUTH_HARNESS_ENABLED=false",
  "ALLOW_AI_TEXT_GENERATION=false",
  "ALLOW_OPENAI_IMAGE_GENERATION=false",
  "ALLOW_HEYGEN_VIDEO_GENERATION=false",
  "ALLOW_HEYGEN_LEGACY_FALLBACK=false",
  "ALLOW_HIGGSFIELD_VIDEO_GENERATION=false",
  "ALLOW_ELEVENLABS_VOICE_GENERATION=false",
  "ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT=false",
  "NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=false",
  "ENABLE_DEMO_WORKSPACE_SEEDING=false",
  "ENABLE_STRUCTURED_INFO_LOGS=false",
  "PUBLIC_CLIENT_ERROR_TELEMETRY_ENABLED=false",
  "UI_DIRECTION_PREVIEW=0",
  "GHL_IFRAME_EMBED_ENABLED=false",
  "META_EXECUTION_MODE=sandbox",
  "ALLOW_META_LIVE_LAUNCH=false",
  "ALLOW_SCHEDULED_META_LAUNCH_EXECUTION=false",
  "ALLOW_META_CAPI_EVENTS=false",
  "ALLOW_META_PIXEL_EVENTS=false",
  "ALLOW_META_LAUNCH_INTERRUPTION_TESTS=false",
  "ENABLE_META_LAUNCH_TEST_MODE=false",
  "BILLING_CHECKOUT_SAFE_MODE=true",
  "ALLOW_BILLING_ADMIN_OVERRIDE=false",
  "ALLOW_QA_BILLING_ACCEPTANCE_OVERRIDE=false",
  "ENABLE_ACCESS_KEY_CHECKOUT=false",
  "ACCESS_KEY_PUBLIC_CHECKOUT_ENABLED=false",
  "STRIPE_FORCE_TEST_MODE=false",
  "STRIPE_TEST_HARNESS_ENABLED=false",
  "INTERNAL_LEAD_SMS_ENABLED=false",
  "SMS_MOCK_MODE=false",
  "TEST_SMS_MODE=",
  "TWILIO_EXECUTION_MODE=disabled",
  "SMS_COMPLIANCE_ACK=",
  "SUPPORT_NOTIFICATION_DELIVERY_MODE=internal_operator_inbox",
  "SUPPORT_STAGING_SINK_ENABLED=false",
  "LEAD_CAPTURE_LOAD_TEST_BYPASS_ENABLED=false",
  "LOAD_TEST_ALLOW_SYNTHETIC_LEAD_CAPTURE=false",
  "ACCOUNT_DELETION_EXECUTION_ENABLED=false",
  "ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED=false",
  "GHL_ACCOUNT_DELETION_PROVIDER_WRITES_ENABLED=false",
  `OPENAI_API_KEY=${secretSentinel}`,
  "",
];
const environmentExampleContents = safeEnvironmentLines.join("\n");
const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const evidenceTypes = [
  "build",
  "test",
  "schema-validation",
  "visual",
  "old-worker-drain",
  "deployment-environment",
];
let guardTrustEnvironment = {
  [externalTrustPathEnv]: "",
  [externalTrustShaEnv]: "",
  [externalTrustPreviousShaEnv]: "",
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? tempRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...guardTrustEnvironment,
      ...(options.env ?? {}),
      GIT_AUTHOR_NAME: "Release Guard Test",
      GIT_AUTHOR_EMAIL: "release-guard@example.invalid",
      GIT_COMMITTER_NAME: "Release Guard Test",
      GIT_COMMITTER_EMAIL: "release-guard@example.invalid",
    },
  });
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return result;
}

function writeRepositoryFile(relativePath, contents) {
  const absolutePath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}

function writeEvidenceFile(relativePath, contents) {
  const absolutePath = path.join(evidenceRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function writeJson(relativePath, value) {
  return writeEvidenceFile(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeProtectedTrustPolicy(fileName, value) {
  const absolutePath = path.join(trustRoot, fileName);
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(absolutePath, contents, { mode: 0o600 });
  fs.chmodSync(absolutePath, 0o600);
  return { absolutePath, contents, sha256: sha256(contents) };
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function signManifest(manifest, privateKey) {
  const payload = Buffer.from(canonicalJson(manifest), "utf8");
  return {
    ...manifest,
    attestation: {
      algorithm: "ed25519",
      payloadSha256: sha256(payload),
      signature: createSignature(null, payload, privateKey).toString("base64"),
    },
  };
}

function commit(message) {
  run("git", ["add", "."]);
  run("git", ["commit", "-m", message]);
  return run("git", ["rev-parse", "HEAD"]).stdout.trim();
}

function assertNoGo(result, code) {
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, new RegExp(`^NO_GO ${code}:`));
}

function commonEvidence(
  targetCommit,
  evidenceType,
  command,
  completedAt,
  evidenceAuthority = authorityIdentity,
) {
  return {
    schemaVersion: evidenceSchemaVersion,
    evidenceType,
    targetCommit,
    command,
    executed: true,
    exitCode: 0,
    status: "passed",
    completedAt,
    sourceRun: {
      system: evidenceAuthority.source,
      repository: "dealflow-fixture",
      workflow: "release-proof",
      runId: "fixture-run-20260711",
    },
    authority: evidenceAuthority,
  };
}

function mergeManifest(base, patch) {
  return { ...base, ...(patch ?? {}) };
}

function createEvidence(targetCommit, options = {}) {
  const completedAt = options.completedAt ?? new Date().toISOString();
  const evidenceAuthority = options.authorityIdentity ?? authorityIdentity;
  const buildOutput = Buffer.from("build completed successfully\n", "utf8");
  const testOutput = Buffer.from("all deterministic tests passed\n", "utf8");
  const schemaOutput = Buffer.from("remote schema check passed\n", "utf8");
  writeEvidenceFile("build/build.log", buildOutput);
  writeEvidenceFile("test/test.log", testOutput);
  writeEvidenceFile("schema/schema.log", schemaOutput);
  writeEvidenceFile("visual/root.png", validPng);

  const manifests = {
    build: mergeManifest(
      {
        ...commonEvidence(
          targetCommit,
          "build",
          "npm run build",
          completedAt,
          evidenceAuthority,
        ),
        artifacts: [{ path: "build.log", sha256: sha256(buildOutput) }],
      },
      options.patches?.build,
    ),
    test: mergeManifest(
      {
        ...commonEvidence(
          targetCommit,
          "test",
          "npm run test:dealflow-completion",
          completedAt,
          evidenceAuthority,
        ),
        artifacts: [{ path: "test.log", sha256: sha256(testOutput) }],
      },
      options.patches?.test,
    ),
    schema: mergeManifest(
      {
        ...commonEvidence(
          targetCommit,
          "schema-validation",
          "SUPABASE_SCHEMA_CHECK_MODE=remote npm run schema:check",
          completedAt,
          evidenceAuthority,
        ),
        checks: { requiredMigrationFiles: true, remoteSchema: true },
        artifacts: [{ path: "schema.log", sha256: sha256(schemaOutput) }],
      },
      options.patches?.schema,
    ),
    visual: mergeManifest(
      {
        ...commonEvidence(
          targetCommit,
          "visual",
          "npm run test:visual-regression",
          completedAt,
          evidenceAuthority,
        ),
        images: [{ path: "root.png", sha256: sha256(validPng), width: 1, height: 1 }],
      },
      options.patches?.visual,
    ),
    drain: mergeManifest(
      {
        ...commonEvidence(
          targetCommit,
          "old-worker-drain",
          "node scripts/verify-old-worker-drain.mjs",
          completedAt,
          evidenceAuthority,
        ),
        deployment,
        checks: workerClasses.map((workerClass) => ({ workerClass, activeCount: 0 })),
      },
      options.patches?.drain,
    ),
    environment: mergeManifest(
      {
        ...commonEvidence(
          targetCommit,
          "deployment-environment",
          "deployment-authority inspect-safe-environment",
          completedAt,
          evidenceAuthority,
        ),
        deployment,
        environment: {
          containsSecretValues: false,
          stripeLiveMode: true,
          safeFlagStates: Object.fromEntries(requiredFailSafeNames.map((name) => [name, true])),
          secretStrengthPolicies: Object.fromEntries(
            secretStrengthPolicyNames.map((name) => [name, true]),
          ),
          configurationPolicies: Object.fromEntries(
            deploymentConfigurationPolicyNames.map((name) => [name, true]),
          ),
        },
      },
      options.patches?.environment,
    ),
  };

  if (options.privateKey) {
    for (const key of Object.keys(manifests)) {
      manifests[key] = signManifest(manifests[key], options.privateKey);
    }
  }

  return {
    build: writeJson("build/build-evidence.json", manifests.build),
    test: writeJson("test/test-evidence.json", manifests.test),
    schema: writeJson("schema/schema-evidence.json", manifests.schema),
    visual: writeJson("visual/visual-evidence.json", manifests.visual),
    drain: writeJson("drain/old-worker-drain-evidence.json", manifests.drain),
    environment: writeJson(
      "environment/deployment-environment-evidence.json",
      manifests.environment,
    ),
  };
}

function evidenceArguments(paths) {
  return [
    "--build-evidence",
    paths.build,
    "--test-evidence",
    paths.test,
    "--schema-evidence",
    paths.schema,
    "--visual-evidence",
    paths.visual,
    "--drain-evidence",
    paths.drain,
    "--environment-evidence",
    paths.environment,
  ];
}

try {
  const repositoryPolicy = JSON.parse(fs.readFileSync(repositoryTrustPolicyPath, "utf8"));
  assert.equal(repositoryPolicy.status, "unconfigured");
  assert.deepEqual(repositoryPolicy.authorities, []);

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });
  const publicKeySha256 = sha256(publicKey.export({ format: "der", type: "spki" }));
  const candidateTrustPolicy = {
    schemaVersion: trustPolicySchemaVersion,
    policyId: "fixture-production-release",
    status: "unconfigured",
    maxEvidenceAgeSeconds: 3600,
    allowedFutureSkewSeconds: 300,
    expectedProject: null,
    requiredEnvironment: { stripeLiveMode: true },
    authorities: [],
  };
  const candidateTrustPolicyContents = `${JSON.stringify(candidateTrustPolicy, null, 2)}\n`;
  const externalTrustPolicy = {
    schemaVersion: externalTrustPolicySchemaVersion,
    policyId: "fixture-out-of-band-production-release",
    status: "configured",
    maxEvidenceAgeSeconds: 3600,
    allowedFutureSkewSeconds: 300,
    expectedProject: {
      provider: deployment.provider,
      projectId: deployment.projectId,
    },
    requiredEnvironment: { stripeLiveMode: true },
    authorizedCandidatePolicy: {
      path: "docs/dealflow-completion/release-trust-policy.json",
      sha256: sha256(candidateTrustPolicyContents),
    },
    rotation: {
      generation: 1,
      previousPolicySha256: null,
    },
    authorities: [
      {
        ...authorityIdentity,
        publicKeyPem,
        publicKeySha256,
        allowedEvidenceTypes: evidenceTypes,
      },
    ],
  };
  const protectedTrustPolicy = writeProtectedTrustPolicy(
    "external-release-trust-v1.json",
    externalTrustPolicy,
  );
  guardTrustEnvironment = {
    [externalTrustPathEnv]: protectedTrustPolicy.absolutePath,
    [externalTrustShaEnv]: protectedTrustPolicy.sha256,
    [externalTrustPreviousShaEnv]: "",
  };

  run("git", ["init", "--quiet"]);
  writeRepositoryFile("package-lock.json", '{"lockfileVersion":3,"name":"guard-fixture"}\n');
  writeRepositoryFile(".env.example", environmentExampleContents);
  writeRepositoryFile("supabase/migrations/20260710000100_first.sql", "select 1;\n");
  writeRepositoryFile("supabase/migrations/20260710000200_second.sql", "select 2;\n");
  writeRepositoryFile(
    "docs/dealflow-completion/release-trust-policy.json",
    candidateTrustPolicyContents,
  );
  const baseline = commit("baseline");

  writeRepositoryFile("src/release-target.txt", "target\n");
  const target = commit("target authorized only by protected external test authority");
  const signedPaths = createEvidence(target, { privateKey });
  const releaseArguments = [
    scriptPath,
    "--baseline",
    baseline,
    "--target",
    target,
    ...evidenceArguments(signedPaths),
  ];

  const first = run(process.execPath, releaseArguments);
  const second = run(process.execPath, releaseArguments);
  assert.equal(first.stdout, second.stdout, "same signed inputs must produce identical JSON");
  assert.equal(first.stderr, "");

  const manifest = JSON.parse(first.stdout);
  assert.equal(manifest.schemaVersion, "dealflow.release-guard.v4");
  assert.equal(manifest.gate.mode, "release");
  assert.equal(manifest.gate.enforced, true);
  assert.equal(manifest.gate.decision, "PASS");
  assert.equal(manifest.gate.allEvidenceValidated, true);
  assert.equal(manifest.gate.allEvidenceStructurallyValidated, true);
  assert.deepEqual(manifest.gate.requiredEvidence, {
    build: true,
    test: true,
    schemaValidation: true,
    visual: true,
    oldWorkerDrain: true,
    deploymentEnvironment: true,
  });
  assert.equal(
    manifest.repositoryArtifacts.releaseTrustPolicy.repositoryCandidatePolicy
      .authorityMaterialUsedForVerification,
    false,
  );
  assert.equal(
    manifest.repositoryArtifacts.releaseTrustPolicy.repositoryCandidatePolicy
      .digestAuthorized,
    true,
  );
  assert.equal(
    manifest.repositoryArtifacts.releaseTrustPolicy.externalTrustRoot.policyId,
    externalTrustPolicy.policyId,
  );
  assert.equal(
    manifest.repositoryArtifacts.releaseTrustPolicy.externalTrustRoot.source.sha256,
    protectedTrustPolicy.sha256,
  );
  assert.equal(
    manifest.repositoryArtifacts.releaseTrustPolicy.externalTrustRoot.source.kind,
    "protected_out_of_band_file",
  );
  assert.match(
    manifest.repositoryArtifacts.releaseTrustPolicy.externalTrustRoot.source.sourceId,
    /^[0-9a-f]{16}$/,
  );
  assert.equal(
    JSON.stringify(manifest).includes(trustRoot),
    false,
    "guard output leaked the protected trust-root path",
  );
  assert.equal(
    manifest.repositoryArtifacts.releaseTrustPolicy.externalTrustRoot.authorityCount,
    1,
  );
  assert.equal(
    manifest.repositoryArtifacts.releaseTrustPolicy.externalTrustRoot.authorities[0]
      .publicKeySha256,
    publicKeySha256,
  );
  assert.equal(
    manifest.repositoryArtifacts.environmentInventory.failSafeDefaultNameCount,
    requiredFailSafeNames.length,
  );
  assert.equal(
    manifest.repositoryArtifacts.environmentInventory.failSafeDefaultNames.includes(
      "ALLOW_META_PIXEL_EVENTS",
    ),
    true,
  );
  assert.equal(manifest.suppliedEvidence.buildEvidence.attestation.signatureVerified, true);
  assert.equal(manifest.suppliedEvidence.drainEvidence.attestation.signatureVerified, true);
  assert.equal(manifest.suppliedEvidence.environmentEvidence.attestation.signatureVerified, true);
  assert.deepEqual(manifest.suppliedEvidence.drainEvidence.deployment, deployment);
  assert.deepEqual(manifest.suppliedEvidence.environmentEvidence.deployment, deployment);
  assert.equal(
    manifest.suppliedEvidence.environmentEvidence.environment.containsSecretValues,
    false,
  );
  assert.equal(
    manifest.suppliedEvidence.environmentEvidence.environment.stripeLiveMode,
    true,
  );
  assert.equal(
    Object.values(
      manifest.suppliedEvidence.environmentEvidence.environment.secretStrengthPolicies,
    ).every(Boolean),
    true,
  );
  assert.equal(
    Object.values(
      manifest.suppliedEvidence.environmentEvidence.environment.configurationPolicies,
    ).every(Boolean),
    true,
  );
  assert.equal(first.stdout.includes(secretSentinel), false, "guard output leaked an env value");
  assert.equal(first.stdout.includes("BEGIN PUBLIC KEY"), false, "guard output emitted key material");
  assert.equal(first.stdout.includes("signature\""), false, "guard output emitted raw signatures");

  const outputPath = path.join(outputRoot, "release-guard.json");
  const outputRun = run(process.execPath, [...releaseArguments, "--output", outputPath]);
  assert.equal(outputRun.stdout, "");
  assert.equal(fs.readFileSync(outputPath, "utf8"), first.stdout);

  assertNoGo(
    run(process.execPath, releaseArguments, {
      allowFailure: true,
      env: {
        [externalTrustPathEnv]: "",
        [externalTrustShaEnv]: "",
        [externalTrustPreviousShaEnv]: "",
      },
    }),
    "release_guard_external_trust_root_missing",
  );

  assertNoGo(
    run(process.execPath, releaseArguments, {
      allowFailure: true,
      env: {
        [externalTrustShaEnv]: "0".repeat(64),
      },
    }),
    "release_guard_external_trust_policy_digest_mismatch",
  );

  const rotatedKeyPair = generateKeyPairSync("ed25519");
  const rotatedPublicKeyPem = rotatedKeyPair.publicKey.export({
    format: "pem",
    type: "spki",
  });
  const rotatedPublicKeySha256 = sha256(
    rotatedKeyPair.publicKey.export({ format: "der", type: "spki" }),
  );
  const rotatedExternalPolicy = {
    ...externalTrustPolicy,
    rotation: {
      generation: 2,
      previousPolicySha256: protectedTrustPolicy.sha256,
    },
    authorities: [
      {
        ...authorityIdentity,
        publicKeyPem: rotatedPublicKeyPem,
        publicKeySha256: rotatedPublicKeySha256,
        allowedEvidenceTypes: evidenceTypes,
      },
    ],
  };
  const rotatedProtectedPolicy = writeProtectedTrustPolicy(
    "external-release-trust-v2.json",
    rotatedExternalPolicy,
  );
  const rotatedPaths = createEvidence(target, {
    privateKey: rotatedKeyPair.privateKey,
  });
  const rotatedRun = run(
    process.execPath,
    [
      scriptPath,
      "--baseline",
      baseline,
      "--target",
      target,
      ...evidenceArguments(rotatedPaths),
    ],
    {
      env: {
        [externalTrustPathEnv]: rotatedProtectedPolicy.absolutePath,
        [externalTrustShaEnv]: rotatedProtectedPolicy.sha256,
        [externalTrustPreviousShaEnv]: protectedTrustPolicy.sha256,
      },
    },
  );
  const rotatedManifest = JSON.parse(rotatedRun.stdout);
  assert.equal(
    rotatedManifest.repositoryArtifacts.releaseTrustPolicy.externalTrustRoot.rotation
      .generation,
    2,
  );
  assert.equal(
    rotatedManifest.repositoryArtifacts.releaseTrustPolicy.externalTrustRoot.authorities[0]
      .publicKeySha256,
    rotatedPublicKeySha256,
  );

  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(rotatedPaths),
      ],
      {
        allowFailure: true,
        env: {
          [externalTrustPathEnv]: rotatedProtectedPolicy.absolutePath,
          [externalTrustShaEnv]: rotatedProtectedPolicy.sha256,
          [externalTrustPreviousShaEnv]: "",
        },
      },
    ),
    "release_guard_external_trust_rotation_invalid",
  );

  const unsignedPaths = createEvidence(target);
  assertNoGo(
    run(
      process.execPath,
      [scriptPath, "--baseline", baseline, "--target", target, ...evidenceArguments(unsignedPaths)],
      { allowFailure: true },
    ),
    "release_guard_missing_attestation",
  );

  const previewUnsigned = run(process.execPath, [
    scriptPath,
    "--mode",
    "audit-preview",
    "--baseline",
    baseline,
    "--target",
    "HEAD",
    ...evidenceArguments(unsignedPaths),
  ]);
  const previewManifest = JSON.parse(previewUnsigned.stdout);
  assert.equal(previewManifest.gate.mode, "audit-preview");
  assert.equal(previewManifest.gate.enforced, false);
  assert.equal(previewManifest.gate.decision, "NON_GATING_PREVIEW");
  assert.equal(previewManifest.gate.allEvidenceStructurallyValidated, true);
  assert.equal(previewManifest.gate.allEvidenceValidated, false);
  assert.equal(
    previewManifest.suppliedEvidence.buildEvidence.attestation.verificationStatus,
    "UNSIGNED_NON_GATING_PREVIEW",
  );

  const { privateKey: selfSignedPrivateKey } = generateKeyPairSync("ed25519");
  const selfSignedPaths = createEvidence(target, { privateKey: selfSignedPrivateKey });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(selfSignedPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_attestation_verification_failed",
  );

  for (const evidenceKey of ["build", "test", "schema", "visual", "drain"]) {
    const oneFabricatedPath = createEvidence(target, { privateKey });
    const oneFabricatedManifest = JSON.parse(
      fs.readFileSync(oneFabricatedPath[evidenceKey], "utf8"),
    );
    delete oneFabricatedManifest.attestation;
    fs.writeFileSync(
      oneFabricatedPath[evidenceKey],
      `${JSON.stringify(signManifest(oneFabricatedManifest, selfSignedPrivateKey), null, 2)}\n`,
    );
    assertNoGo(
      run(
        process.execPath,
        [
          scriptPath,
          "--baseline",
          baseline,
          "--target",
          target,
          ...evidenceArguments(oneFabricatedPath),
        ],
        { allowFailure: true },
      ),
      "release_guard_attestation_verification_failed",
    );
  }

  const digestTamperPaths = createEvidence(target, { privateKey });
  const digestTamperManifest = JSON.parse(fs.readFileSync(digestTamperPaths.build, "utf8"));
  digestTamperManifest.command = "npm run build --tampered";
  writeJson("build/build-evidence.json", digestTamperManifest);
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(digestTamperPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_attestation_digest_mismatch",
  );

  const artifactTamperPaths = createEvidence(target, { privateKey });
  writeEvidenceFile("build/build.log", "tampered after attestation\n");
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(artifactTamperPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_evidence_hash_mismatch",
  );

  const futurePaths = createEvidence(target, {
    privateKey,
    completedAt: new Date(Date.now() + 20 * 60 * 1_000).toISOString(),
  });
  assertNoGo(
    run(
      process.execPath,
      [scriptPath, "--baseline", baseline, "--target", target, ...evidenceArguments(futurePaths)],
      { allowFailure: true },
    ),
    "release_guard_future_evidence",
  );

  const targetMismatchPaths = createEvidence(target, {
    privateKey,
    patches: { build: { targetCommit: baseline } },
  });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(targetMismatchPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_evidence_target_mismatch",
  );

  const sourceMismatchPaths = createEvidence(target, {
    privateKey,
    patches: {
      build: {
        sourceRun: {
          system: "caller-workstation",
          repository: "dealflow-fixture",
          workflow: "release-proof",
          runId: "fixture-run-20260711",
        },
      },
    },
  });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(sourceMismatchPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_evidence_source_mismatch",
  );

  const projectMismatchPaths = createEvidence(target, {
    privateKey,
    patches: {
      environment: {
        deployment: { ...deployment, projectId: "caller-selected-project" },
      },
    },
  });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(projectMismatchPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_deployment_project_mismatch",
  );

  const deploymentMismatchPaths = createEvidence(target, {
    privateKey,
    patches: {
      drain: {
        deployment: { ...deployment, deploymentId: "different-deployment" },
      },
    },
  });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(deploymentMismatchPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_exact_deployment_mismatch",
  );

  const unsafeFlagPaths = createEvidence(target, {
    privateKey,
    patches: {
      environment: {
        environment: {
          containsSecretValues: false,
          stripeLiveMode: true,
          safeFlagStates: {
            ...Object.fromEntries(requiredFailSafeNames.map((name) => [name, true])),
            ALLOW_META_PIXEL_EVENTS: false,
          },
          secretStrengthPolicies: Object.fromEntries(
            secretStrengthPolicyNames.map((name) => [name, true]),
          ),
          configurationPolicies: Object.fromEntries(
            deploymentConfigurationPolicyNames.map((name) => [name, true]),
          ),
        },
      },
    },
  });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(unsafeFlagPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_unsafe_deployed_flag_state",
  );

  const invalidTurnstileConfigurationPaths = createEvidence(target, {
    privateKey,
    patches: {
      environment: {
        environment: {
          containsSecretValues: false,
          stripeLiveMode: true,
          safeFlagStates: Object.fromEntries(requiredFailSafeNames.map((name) => [name, true])),
          secretStrengthPolicies: Object.fromEntries(
            secretStrengthPolicyNames.map((name) => [name, true]),
          ),
          configurationPolicies: {
            ...Object.fromEntries(
              deploymentConfigurationPolicyNames.map((name) => [name, true]),
            ),
            turnstileSecretKeyNonTest: false,
          },
        },
      },
    },
  });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(invalidTurnstileConfigurationPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_deployment_configuration_policy_failed",
  );

  const stripeModeMismatchPaths = createEvidence(target, {
    privateKey,
    patches: {
      environment: {
        environment: {
          containsSecretValues: false,
          stripeLiveMode: false,
          safeFlagStates: Object.fromEntries(requiredFailSafeNames.map((name) => [name, true])),
          secretStrengthPolicies: Object.fromEntries(
            secretStrengthPolicyNames.map((name) => [name, true]),
          ),
          configurationPolicies: Object.fromEntries(
            deploymentConfigurationPolicyNames.map((name) => [name, true]),
          ),
        },
      },
    },
  });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(stripeModeMismatchPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_stripe_mode_mismatch",
  );

  const weakSecretPolicyPaths = createEvidence(target, {
    privateKey,
    patches: {
      environment: {
        environment: {
          containsSecretValues: false,
          stripeLiveMode: true,
          safeFlagStates: Object.fromEntries(requiredFailSafeNames.map((name) => [name, true])),
          secretStrengthPolicies: {
            ...Object.fromEntries(secretStrengthPolicyNames.map((name) => [name, true])),
            metaTokenEncryptionKeyStrong: false,
          },
          configurationPolicies: Object.fromEntries(
            deploymentConfigurationPolicyNames.map((name) => [name, true]),
          ),
        },
      },
    },
  });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(weakSecretPolicyPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_secret_strength_policy_failed",
  );

  const secretBearingAttestationPaths = createEvidence(target, {
    privateKey,
    patches: {
      environment: {
        environment: {
          containsSecretValues: true,
          stripeLiveMode: true,
          safeFlagStates: Object.fromEntries(requiredFailSafeNames.map((name) => [name, true])),
          secretStrengthPolicies: Object.fromEntries(
            secretStrengthPolicyNames.map((name) => [name, true]),
          ),
          configurationPolicies: Object.fromEntries(
            deploymentConfigurationPolicyNames.map((name) => [name, true]),
          ),
        },
      },
    },
  });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(secretBearingAttestationPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_environment_contains_secrets",
  );

  const rawSecretFieldPaths = createEvidence(target, {
    privateKey,
    patches: {
      environment: {
        environment: {
          containsSecretValues: false,
          stripeLiveMode: true,
          safeFlagStates: Object.fromEntries(requiredFailSafeNames.map((name) => [name, true])),
          secretStrengthPolicies: Object.fromEntries(
            secretStrengthPolicyNames.map((name) => [name, true]),
          ),
          configurationPolicies: Object.fromEntries(
            deploymentConfigurationPolicyNames.map((name) => [name, true]),
          ),
          rawEnvironment: { STRIPE_SECRET_KEY: secretSentinel },
        },
      },
    },
  });
  const rawSecretField = run(
    process.execPath,
    [
      scriptPath,
      "--baseline",
      baseline,
      "--target",
      target,
      ...evidenceArguments(rawSecretFieldPaths),
    ],
    { allowFailure: true },
  );
  assertNoGo(rawSecretField, "release_guard_invalid_environment_attestation");
  assert.equal(rawSecretField.stderr.includes(secretSentinel), false);

  const activeDrainPaths = createEvidence(target, {
    privateKey,
    patches: {
      drain: {
        checks: workerClasses.map((workerClass, index) => ({
          workerClass,
          activeCount: index === 0 ? 1 : 0,
        })),
      },
    },
  });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        target,
        ...evidenceArguments(activeDrainPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_old_workers_active",
  );

  const missingEnvironmentArguments = releaseArguments.slice(0, -2);
  assertNoGo(
    run(process.execPath, missingEnvironmentArguments, { allowFailure: true }),
    "release_guard_missing_required_evidence",
  );

  const symbolicTarget = run(
    process.execPath,
    [
      scriptPath,
      "--baseline",
      baseline,
      "--target",
      "HEAD",
      ...evidenceArguments(createEvidence(target, { privateKey })),
    ],
    { allowFailure: true },
  );
  assertNoGo(symbolicTarget, "release_guard_target_not_exact_sha");

  writeRepositoryFile("dirty-untracked.txt", "dirty\n");
  assertNoGo(
    run(process.execPath, releaseArguments, { allowFailure: true }),
    "release_guard_dirty_worktree",
  );
  fs.rmSync(path.join(tempRoot, "dirty-untracked.txt"));

  const unsafeEnvironment = environmentExampleContents.replace(
    "ALLOW_META_LIVE_LAUNCH=false",
    "ALLOW_META_LIVE_LAUNCH=true",
  );
  writeRepositoryFile(".env.example", unsafeEnvironment);
  const unsafeTarget = commit("unsafe environment default");
  const unsafeTargetPaths = createEvidence(unsafeTarget, { privateKey });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        unsafeTarget,
        ...evidenceArguments(unsafeTargetPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_unsafe_fail_safe_default",
  );

  run("git", ["rm", "package-lock.json"]);
  run("git", ["commit", "-m", "remove required lockfile"]);
  const missingLockfileTarget = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  const missingLockfilePaths = createEvidence(missingLockfileTarget, { privateKey });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        missingLockfileTarget,
        ...evidenceArguments(missingLockfilePaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_git_error",
  );

  writeRepositoryFile("package-lock.json", '{"lockfileVersion":3,"name":"guard-fixture"}\n');
  writeRepositoryFile(".env.example", environmentExampleContents);
  const targetSelfKeyPair = generateKeyPairSync("ed25519");
  const targetSelfPublicKeyPem = targetSelfKeyPair.publicKey.export({
    format: "pem",
    type: "spki",
  });
  const targetSelfPublicKeySha256 = sha256(
    targetSelfKeyPair.publicKey.export({ format: "der", type: "spki" }),
  );
  const targetSelfAuthorizedPolicy = {
    ...candidateTrustPolicy,
    status: "configured",
    expectedProject: {
      provider: deployment.provider,
      projectId: deployment.projectId,
    },
    authorities: [
      {
        authorityId: "target-added-self-authority",
        keyId: "target-added-key",
        source: "target-controlled-source",
        publicKeyPem: targetSelfPublicKeyPem,
        publicKeySha256: targetSelfPublicKeySha256,
        allowedEvidenceTypes: evidenceTypes,
      },
    ],
  };
  writeRepositoryFile(
    "docs/dealflow-completion/release-trust-policy.json",
    `${JSON.stringify(targetSelfAuthorizedPolicy, null, 2)}\n`,
  );
  const targetSelfAuthorizationCommit = commit("target attempts to authorize its own key");
  const targetSelfAuthorizationPaths = createEvidence(targetSelfAuthorizationCommit, {
    privateKey: targetSelfKeyPair.privateKey,
    authorityIdentity: {
      authorityId: "target-added-self-authority",
      keyId: "target-added-key",
      source: "target-controlled-source",
    },
  });
  assertNoGo(
    run(
      process.execPath,
      [
        scriptPath,
        "--baseline",
        baseline,
        "--target",
        targetSelfAuthorizationCommit,
        ...evidenceArguments(targetSelfAuthorizationPaths),
      ],
      { allowFailure: true },
    ),
    "release_guard_candidate_policy_digest_mismatch",
  );

  console.log("Release guard authority and exact-deployment contract tests passed.");
} finally {
  fs.rmSync(tempRoot, { force: true, recursive: true });
  fs.rmSync(evidenceRoot, { force: true, recursive: true });
  fs.rmSync(outputRoot, { force: true, recursive: true });
  fs.rmSync(trustRoot, { force: true, recursive: true });
}
