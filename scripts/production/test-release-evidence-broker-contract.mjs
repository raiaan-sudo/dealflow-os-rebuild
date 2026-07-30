#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const broker = join(scriptDirectory, "build-release-evidence-broker.mjs");
const root = mkdtempSync(join(tmpdir(), "dealflow-evidence-broker-contract-"));
const repository = join(root, "repo");
const fixtureRoot = join(root, "fixtures");
const outputRoot = join(root, "outputs");
const sentinel = "sentinel-do-not-disclose-7f2d4e6c";

const workerClasses = [
  "campaign_plan_v0_writers",
  "meta_launch_v0_workers",
  "sms_delivery_v0_workers",
  "stripe_webhook_v1_workers",
  "system_job_v1_workers",
];

const failSafeNames = [
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

const configurationPolicyNames = [
  "metaCapiConsentPolicyVersionConfigured",
  "metaPixelConsentPolicyVersionConfigured",
  "turnstileAllowedHostnamesConfigured",
  "turnstileProductionConfigValid",
  "turnstileSecretKeyNonTest",
  "turnstileEffectiveLeadSiteKeyNonTest",
  "turnstileSiteKeyNonTest",
];

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

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
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function write(path, contents, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(
    path,
    Buffer.isBuffer(contents)
      ? contents
      : typeof contents === "string"
        ? contents
        : `${JSON.stringify(contents, null, 2)}\n`,
    { mode },
  );
  chmodSync(path, mode);
  return path;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? repository,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Evidence Broker Contract",
      GIT_AUTHOR_EMAIL: "evidence-broker@example.invalid",
      GIT_COMMITTER_NAME: "Evidence Broker Contract",
      GIT_COMMITTER_EMAIL: "evidence-broker@example.invalid",
    },
  });
}

function successful(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    throw new Error(
      `Fixture command failed: ${command} ${args.join(" ")}\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function writeInput(name, value) {
  return write(join(fixtureRoot, `${name}.json`), value);
}

function execute(inputPath, outputPath, extra = []) {
  return run(process.execPath, [
    broker,
    "--input",
    inputPath,
    ...(outputPath ? ["--output", outputPath] : []),
    ...extra,
  ]);
}

function expectFailure(input, name, code, options = {}) {
  const inputPath = writeInput(name, input);
  const output = options.output ?? join(outputRoot, name);
  const result = execute(inputPath, output, options.extra ?? []);
  assert.equal(result.status, 1, `${name} unexpectedly passed`);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, `NO_GO ${code}\n`);
  assert.equal(
    `${result.stdout}${result.stderr}`.includes(sentinel),
    false,
    `${name} leaked the secret sentinel`,
  );
  if (!options.allowExistingOutput) assert.equal(existsSync(output), false);
}

function assertModes(path) {
  const stat = lstatSync(path);
  if (stat.isDirectory()) {
    assert.equal(stat.mode & 0o777, 0o700, `${path} directory mode`);
    for (const name of readdirSync(path)) assertModes(join(path, name));
  } else {
    assert.equal(stat.mode & 0o777, 0o600, `${path} file mode`);
  }
}

mkdirSync(repository, { recursive: true, mode: 0o700 });
mkdirSync(fixtureRoot, { recursive: true, mode: 0o700 });
mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
chmodSync(repository, 0o700);
chmodSync(fixtureRoot, 0o700);
chmodSync(outputRoot, 0o700);

try {
  successful("git", ["init", "--quiet"]);
  const readme = Buffer.from("release target fixture\n", "utf8");
  write(join(repository, "README.md"), readme);
  const deployableManifest = {
    schemaVersion: "dealflow.deployable-source-manifest.v1",
    generatedFrom: "git_tracked_files_minus_vercelignore_and_manifest",
    entryCount: 1,
    deployableSourceSha256: sha256(readme),
    entries: [
      {
        path: "README.md",
        size: readme.length,
        mode: 33188,
        sha256: sha256(readme),
      },
    ],
  };
  write(
    join(repository, "config/release/deployable-source-manifest.json"),
    deployableManifest,
  );
  successful("git", ["add", "."]);
  successful("git", ["commit", "--quiet", "-m", "fixture release target"]);
  const targetCommit = successful("git", ["rev-parse", "HEAD"]);
  const targetTree = successful("git", ["rev-parse", "HEAD^{tree}"]);
  const manifestBytes = Buffer.from(
    successful("git", [
      "show",
      `${targetCommit}:config/release/deployable-source-manifest.json`,
    ]) + "\n",
    "utf8",
  );

  const buildLog = write(
    join(fixtureRoot, "build-result.log"),
    "production build passed\n",
  );
  const testLog = write(
    join(fixtureRoot, "test-result.log"),
    '{"status":"passed","failed":0}\n',
  );
  const schemaLog = write(
    join(fixtureRoot, "schema-result.log"),
    "remote schema passed\n",
  );
  const screenshot = write(join(fixtureRoot, "viewport.png"), png);
  const completedAt = new Date().toISOString();
  const common = {
    executed: true,
    exitCode: 0,
    status: "passed",
    completedAt,
  };
  const baseInput = {
    schemaVersion: "dealflow.release-evidence-broker-input.v1",
    targetCommit,
    authority: {
      authorityId: "fixture-release-authority",
      keyId: "fixture-key-20260730",
      source: "fixture-ci",
    },
    sourceRun: {
      system: "fixture-ci",
      repository: "dealflow-fixture",
      workflow: "production-admission",
      runId: "fixture-run-20260730",
    },
    deployment: {
      provider: "fixture-provider",
      projectId: "fixture-project",
      deploymentId: "fixture-deployment",
      environment: "production",
      deployedAt: completedAt,
      admissionStage: "post_deploy_pre_alias_provider",
      aliasesAttached: false,
      providerEffectsEnabled: false,
    },
    proofs: {
      build: {
        ...common,
        command: "npm run build",
        artifacts: [{ path: buildLog, sanitized: true }],
      },
      test: {
        ...common,
        command: "npm run test:dealflow-completion",
        artifacts: [{ path: testLog, sanitized: true }],
      },
      schemaValidation: {
        ...common,
        command: "SUPABASE_SCHEMA_CHECK_MODE=remote npm run schema:check",
        checks: { requiredMigrationFiles: true, remoteSchema: true },
        artifacts: [{ path: schemaLog, sanitized: true }],
      },
      visual: {
        ...common,
        command: "npm run test:visual-regression",
        images: [
          {
            path: screenshot,
            sanitized: true,
            width: 1,
            height: 1,
          },
        ],
      },
      oldWorkerDrain: {
        ...common,
        command: "deployment-authority inspect-old-worker-drain",
        checks: workerClasses.map((workerClass) => ({
          workerClass,
          activeCount: 0,
        })),
      },
      deploymentEnvironment: {
        ...common,
        command: "deployment-authority inspect-safe-environment",
        environment: {
          containsSecretValues: false,
          stripeLiveMode: true,
          safeFlagStates: Object.fromEntries(
            failSafeNames.map((name) => [name, true]),
          ),
          secretStrengthPolicies: Object.fromEntries(
            secretStrengthPolicyNames.map((name) => [name, true]),
          ),
          configurationPolicies: Object.fromEntries(
            configurationPolicyNames.map((name) => [name, true]),
          ),
        },
      },
    },
  };

  const validInputPath = writeInput("valid", baseInput);
  const dryRun = execute(validInputPath, null, ["--dry-run"]);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  const dryRunSummary = JSON.parse(dryRun.stdout);
  assert.equal(dryRunSummary.status, "DRY_RUN_PASS");
  assert.equal(dryRunSummary.canAuthorizeProduction, false);
  assert.equal(dryRunSummary.manifestCount, 6);
  assert.equal(dryRunSummary.artifactCount, 4);

  const validOutput = join(outputRoot, "valid");
  const valid = execute(validInputPath, validOutput);
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stderr, "");
  const stdout = JSON.parse(valid.stdout);
  assert.equal(stdout.status, "UNSIGNED_BUNDLE_CREATED");
  assert.equal(stdout.canAuthorizeProduction, false);
  assertModes(validOutput);

  const indexPath = join(validOutput, "broker-index.json");
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  assert.equal(index.status, "UNSIGNED_AWAITING_EXTERNAL_ATTESTATION");
  assert.equal(index.canAuthorizeProduction, false);
  assert.equal(index.targetCommit, targetCommit);
  assert.equal(index.targetTree, targetTree);
  assert.equal(index.deployableSourceSha256, deployableManifest.deployableSourceSha256);
  assert.equal(index.deployableManifestSha256, sha256(manifestBytes));
  assert.equal(index.manifestCount, 6);
  assert.equal(index.artifactCount, 4);
  assert.equal(index.manifests.every((record) => record.attestationPresent === false), true);

  for (const record of index.manifests) {
    const path = join(validOutput, record.path);
    const bytes = readFileSync(path);
    const manifest = JSON.parse(bytes);
    assert.equal(
      bytes.toString("utf8"),
      `${canonicalJson(manifest)}\n`,
      `${record.evidenceType} manifest is not canonical`,
    );
    assert.equal(manifest.schemaVersion, "dealflow.release-evidence.v3");
    assert.equal(manifest.targetCommit, targetCommit);
    assert.equal(manifest.targetTree, targetTree);
    assert.equal(manifest.deployableSourceSha256, deployableManifest.deployableSourceSha256);
    assert.equal(manifest.deployableManifestSha256, sha256(manifestBytes));
    assert.equal(Object.hasOwn(manifest, "attestation"), false);
    assert.equal(
      record.canonicalPayloadSha256,
      sha256(Buffer.from(canonicalJson(manifest), "utf8")),
    );
  }
  const drain = JSON.parse(
    readFileSync(
      join(validOutput, "old-worker-drain/release-evidence.json"),
      "utf8",
    ),
  );
  const environment = JSON.parse(
    readFileSync(
      join(validOutput, "deployment-environment/release-evidence.json"),
      "utf8",
    ),
  );
  assert.deepEqual(drain.deployment, environment.deployment);
  assert.equal(drain.deployment.aliasesAttached, false);
  assert.equal(drain.deployment.providerEffectsEnabled, false);
  assert.equal(drain.checks.every((check) => check.activeCount === 0), true);
  assert.equal(environment.environment.containsSecretValues, false);

  const aliases = structuredClone(baseInput);
  aliases.deployment.aliasesAttached = true;
  expectFailure(
    aliases,
    "aliases-attached",
    "broker_deployment_not_quiescent",
  );

  const providerEffects = structuredClone(baseInput);
  providerEffects.deployment.providerEffectsEnabled = true;
  expectFailure(
    providerEffects,
    "provider-effects",
    "broker_deployment_not_quiescent",
  );

  const activeWorker = structuredClone(baseInput);
  activeWorker.proofs.oldWorkerDrain.checks[0].activeCount = 1;
  expectFailure(
    activeWorker,
    "active-worker",
    "broker_drain_checks_invalid",
  );

  const secretArtifactPath = write(
    join(fixtureRoot, "provider-result.log"),
    `Authorization: Bearer ${sentinel}\n`,
  );
  const secretArtifact = structuredClone(baseInput);
  secretArtifact.proofs.build.artifacts[0].path = secretArtifactPath;
  expectFailure(
    secretArtifact,
    "secret-artifact",
    "broker_secret_like_artifact",
  );

  const secretCommand = structuredClone(baseInput);
  secretCommand.proofs.build.command = `tool --token=${sentinel}`;
  expectFailure(
    secretCommand,
    "secret-command",
    "broker_command_secret_like",
  );

  const secretMetadata = structuredClone(baseInput);
  secretMetadata.apiToken = sentinel;
  expectFailure(
    secretMetadata,
    "secret-metadata",
    "broker_secret_like_input",
  );

  const symlinkPath = join(fixtureRoot, "symlink-result.log");
  symlinkSync(buildLog, symlinkPath);
  const symlinkArtifact = structuredClone(baseInput);
  symlinkArtifact.proofs.build.artifacts[0].path = symlinkPath;
  expectFailure(
    symlinkArtifact,
    "symlink-artifact",
    "broker_artifact_unsafe",
  );

  const unsanitized = structuredClone(baseInput);
  unsanitized.proofs.build.artifacts[0].sanitized = false;
  expectFailure(
    unsanitized,
    "unsanitized-artifact",
    "broker_artifact_not_sanitized",
  );

  const duplicate = structuredClone(baseInput);
  duplicate.proofs.build.artifacts.push(
    structuredClone(duplicate.proofs.build.artifacts[0]),
  );
  expectFailure(
    duplicate,
    "duplicate-artifact",
    "broker_duplicate_artifact",
  );

  const insideRepositoryOutput = join(repository, "forbidden-evidence-output");
  expectFailure(
    baseInput,
    "inside-repository",
    "broker_output_inside_repository",
    { output: insideRepositoryOutput },
  );

  const tamperedTarget = structuredClone(baseInput);
  tamperedTarget.targetCommit = `${targetCommit.slice(0, -1)}${
    targetCommit.endsWith("0") ? "1" : "0"
  }`;
  expectFailure(
    tamperedTarget,
    "tampered-target",
    "broker_git_identity_failure",
  );

  const unexpectedAttestation = structuredClone(baseInput);
  unexpectedAttestation.proofs.build.attestation = {
    algorithm: "ed25519",
    signature: sentinel,
  };
  expectFailure(
    unexpectedAttestation,
    "self-signing-attempt",
    "broker_proof_keys_invalid",
  );

  process.stdout.write(
    "release evidence broker contract passed: six canonical unsigned manifests, external-only protected output, zero-effect deployment boundary, and adversarial secret/signing rejection\n",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
